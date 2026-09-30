import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, meshStats, validate } from "../src/geometry.js";
import {
  solidSettings,
  solidConfig,
  dedicatedSchedule,
} from "../src/solid-settings.js";
import {
  solidMeshes,
  solidPlan,
  solidLithophane,
  transmission,
  calibrationTile,
} from "../src/solid-color.js";
import { cmywPreviewMesh } from "../src/color.js";
import { supportDimensions } from "../src/supports.js";

const s = {
  ...defaults,
  colorMode: "cmyw",
  colorStructure: "dedicated",
  width: 40,
  height: 30,
  solidFeature: 10,
};
const rgba = new Uint8Array([
  30, 180, 220, 255, 220, 20, 80, 255, 230, 200, 20, 255, 255, 255, 255, 255,
]);

test("Dedicated defaults derive thickness, combinations and physical first-layer schedule", () => {
  assert.equal(solidSettings(s).solidThickness, 4.16);
  const plan = solidPlan(rgba, 1, 1, s);
  assert.equal(plan.config.layers, 52);
  for (let i = 0; i < plan.counts.length; i += 4) {
    assert.equal(
      plan.counts.slice(i, i + 4).reduce((a, b) => a + b),
      48,
    );
    assert.ok(plan.counts.slice(i, i + 3).every((n) => n <= 16));
  }
  const parts = solidLithophane(rgba, 1, 1, s);
  assert.equal(parts.solidReport.combinations, 4913);
  const schedule = dedicatedSchedule(s);
  assert.equal(schedule.length, 51);
  assert.equal(schedule[0].zTop, 0.16);
  assert.equal(schedule.at(-1).zTop, 4.16);
  assert.equal(
    schedule.filter((r) => r.allowedMaterials.includes("Cyan")).length,
    16,
  );
  assert.equal(
    schedule.filter((r) => r.allowedMaterials.includes("Magenta")).length,
    16,
  );
  assert.equal(
    schedule.filter((r) => r.allowedMaterials.includes("Yellow")).length,
    16,
  );
  const live = cmywPreviewMesh(parts, 1, 1, s);
  assert.ok(
    Math.abs(
      supportDimensions(live.fitted).slot - (4.16 + 0.001 + 2 * s.fitClearance),
    ) < 0.001,
  );
  assert.throws(() => validate({ ...s, cyanLayers: 1.5 }), /whole/);
  assert.throws(() => validate({ ...s, solidFront: 0.17 }), /multiples/);
});

test("Every exported cell is filled once; every physical layer contains only its assigned color and white", () => {
  const settings = { ...s, cyanLayers: 2, magentaLayers: 3, yellowLayers: 4 };
  const config = solidConfig(settings);
  // Include full use, zero use, and mixed counts in neighboring cells.
  const plan = {
    config,
    cols: 2,
    rows: 2,
    counts: new Uint32Array([2, 3, 4, 0, 0, 0, 0, 9, 1, 2, 3, 3, 2, 0, 1, 6]),
  };
  const parts = solidMeshes(plan, settings);
  const prisms = parts.flatMap((p) => {
    const boxes = [];
    for (let i = 0; i < p.mesh.positions.length; i += 24) {
      const v = p.mesh.positions.subarray(i, i + 24);
      boxes.push({
        name: p.name,
        lo: [0, 1, 2].map((k) =>
          Math.min(...Array.from({ length: 8 }, (_, j) => v[j * 3 + k])),
        ),
        hi: [0, 1, 2].map((k) =>
          Math.max(...Array.from({ length: 8 }, (_, j) => v[j * 3 + k])),
        ),
      });
    }
    return boxes;
  });
  for (const row of dedicatedSchedule(settings))
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        const q = [
          (x + 0.5) * 20 - 20,
          (y + 0.5) * 15 - 15,
          (row.zBottom + row.zTop) / 2,
        ];
        const hits = prisms.filter((b) =>
          q.every((v, k) => v > b.lo[k] && v < b.hi[k]),
        );
        assert.equal(hits.length, 1);
        assert.ok(row.allowedMaterials.includes(hits[0].name));
      }
  const volume = parts.reduce((v, p) => v + meshStats(p.mesh).volume, 0) * 1000;
  assert.ok(Math.abs(volume - 40 * 30 * config.thickness) < 0.01);
});

test("Dedicated matching searches the restricted palette and calibration stays within each budget", () => {
  const settings = { ...s, cyanLayers: 2, magentaLayers: 3, yellowLayers: 4 };
  const config = solidConfig(settings),
    pixel = new Uint8Array([130, 80, 210, 255]);
  const plan = solidPlan(pixel, 0, 0, settings);
  const target = [130, 80, 210].map((v) => (v / 255) ** 1.1);
  const error = (rgb) =>
    rgb.reduce((v, n, k) => v + (Math.sqrt(n) - target[k]) ** 2, 0);
  let best = Infinity;
  for (let c = 0; c <= 2; c++)
    for (let m = 0; m <= 3; m++)
      for (let y = 0; y <= 4; y++)
        best = Math.min(
          best,
          error(transmission([c, m, y, 9 - c - m - y], settings, config)),
        );
  assert.ok(
    Math.abs(error(Array.from(plan.expected.slice(0, 3))) - best) < 1e-6,
  );
  for (const p of calibrationTile(settings).patches) {
    assert.ok(
      p.internalLayers.slice(0, 3).every((n, k) => n <= config.budgets[k]),
    );
    assert.equal(
      p.internalLayers.reduce((a, b) => a + b),
      9,
    );
  }
  const a = solidLithophane(rgba, 1, 1, settings, true),
    b = solidLithophane(rgba, 1, 1, settings);
  assert.deepEqual(a.expected, b.expected);
});
