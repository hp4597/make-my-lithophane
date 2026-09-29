import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, meshStats } from "../src/geometry.js";
import { solidConfig } from "../src/solid-settings.js";
import {
  solidPlan,
  solidMeshes,
  solidLithophane,
  calibrationTile,
  whiteCoupons,
} from "../src/solid-color.js";
import { threeMF } from "../src/three-mf.js";
import { cmywPreviewMesh } from "../src/color.js";
import { unzipSync, strFromU8 } from "fflate";
const s = {
  ...defaults,
  colorMode: "cmyw",
  colorStructure: "solid",
  width: 8,
  height: 6,
  solidFeature: 1,
};
test("Six mm panels and thick skins work beyond the former thickness and layer caps", () => {
  for (const options of [
    { solidThickness: 6, solidFront: 0.24, solidRear: 0.24 },
    { solidThickness: 36, solidFront: 18, solidRear: 17.4 },
  ]) {
    const settings = { ...s, width: 40, height: 30, layer: 0.12, ...options };
    const plan = solidPlan(photo(), 8, 6, settings);
    assert.ok(plan.counts instanceof Uint32Array);
    assert.equal(plan.config.layers, Math.round(options.solidThickness / 0.12));
    const parts = solidLithophane(photo(), 8, 6, settings);
    const volume =
      parts.reduce((sum, p) => sum + meshStats(p.mesh).volume, 0) * 1000;
    assert.ok(Math.abs(volume - 40 * 30 * options.solidThickness) < 0.1);
    const preview = cmywPreviewMesh(parts, 8, 6, settings);
    assert.ok(
      Math.abs(meshStats(preview.mesh).dimensions[2] - options.solidThickness) <
        0.01,
    );
  }
  assert.throws(
    () =>
      solidConfig({
        ...s,
        layer: 0.12,
        solidThickness: 6,
        solidFront: 3,
        solidRear: 3,
      }),
    /internal layers/,
  );
});
function photo() {
  const p = new Uint8Array(9 * 7 * 4);
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 9; x++) {
      const i = (y * 9 + x) * 4;
      p.set([x * 31, y * 40, (x + y) * 16, 255], i);
    }
  return p;
}
test("Large smooth grids preserve requested feature pitch without the old cell cap", () => {
  const s = {
    ...defaults,
    colorMode: "cmyw",
    colorStructure: "solid",
    width: 480,
    height: 360,
  };
  const c = solidConfig(s);
  assert.equal(c.cols * c.rows, 1080000);
  const plan = solidPlan(new Uint8Array(4 * 4 * 4).fill(255), 3, 3, s);
  assert.equal(plan.counts.length, 1080000 * 4);
  const parts = solidMeshes(plan, s);
  assert.equal(parts.length, 1);
  assert.ok(
    Math.abs(meshStats(parts[0].mesh).volume * 1000 - 480 * 360 * 2.4) < 0.1,
  );
  const larger = solidConfig({ ...s, width: 1200, height: 1200 });
  assert.equal(larger.cols * larger.rows, 9000000);
});
test("Every smooth-panel column is fully occupied, layer aligned, flat and non-overlapping", () => {
  const plan = solidPlan(photo(), 8, 6, s),
    parts = solidMeshes(plan, s),
    config = solidConfig(s);
  for (let i = 0; i < plan.counts.length; i += 4)
    assert.equal(
      plan.counts.slice(i, i + 4).reduce((a, b) => a + b),
      config.inside,
    );
  // Inspect the actual exported prisms at every cell center and every print layer.
  const boxes = parts.flatMap((p) => {
    const out = [];
    for (let i = 0; i < p.mesh.positions.length; i += 24) {
      const v = p.mesh.positions.slice(i, i + 24),
        lo = [0, 1, 2].map((k) =>
          Math.min(...Array.from({ length: 8 }, (_, j) => v[j * 3 + k])),
        ),
        hi = [0, 1, 2].map((k) =>
          Math.max(...Array.from({ length: 8 }, (_, j) => v[j * 3 + k])),
        );
      assert.ok(hi[2] > lo[2]);
      for (const z of [lo[2], hi[2]])
        assert.ok(Math.abs(z / s.layer - Math.round(z / s.layer)) < 1e-5);
      out.push({ lo, hi, name: p.name });
    }
    return out;
  });
  for (let y = 0; y < plan.rows; y++)
    for (let x = 0; x < plan.cols; x++)
      for (let z = 0; z < config.layers; z++) {
        const q = [
            ((x + 0.5) * s.width) / plan.cols - s.width / 2,
            ((y + 0.5) * s.height) / plan.rows - s.height / 2,
            (z + 0.5) * s.layer,
          ],
          hits = boxes.filter((b) =>
            q.every((v, k) => v > b.lo[k] && v < b.hi[k]),
          );
        assert.equal(hits.length, 1);
        if (z < config.rear || z >= config.layers - config.front)
          assert.equal(hits[0].name, "White");
      }
  const volume = parts.reduce((sum, p) => sum + meshStats(p.mesh).volume, 0);
  // meshStats reports cubic centimeters.
  assert.ok(
    Math.abs(volume * 1000 - s.width * s.height * s.solidThickness) < 1e-4,
  );
  assert.ok(
    Math.abs(
      boxes.reduce(
        (sum, b) =>
          sum + b.hi.map((v, k) => v - b.lo[k]).reduce((a, b) => a * b),
        0,
      ) -
        s.width * s.height * s.solidThickness,
    ) < 1e-4,
  );
  for (const p of parts) {
    const edges = new Map();
    for (let i = 0; i < p.mesh.indices.length; i += 3) {
      const ids = p.mesh.indices.slice(i, i + 3);
      for (let j = 0; j < 3; j++) {
        const a = ids[j],
          b = ids[(j + 1) % 3],
          key = [Math.min(a, b), Math.max(a, b)].join(",");
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    }
    assert.ok([...edges.values()].every((n) => n === 2));
  }
});
test("White-only and profile changes preserve thickness and omit zero-volume channels", () => {
  const rgba = new Uint8Array(9 * 7 * 4).fill(255),
    parts = solidLithophane(rgba, 8, 6, s);
  assert.deepEqual(
    parts.map((p) => p.name),
    ["White"],
  );
  assert.ok(parts.heights.every((v) => Math.abs(v - s.solidThickness) < 1e-6));
  const a = solidPlan(photo(), 8, 6, s),
    b = solidPlan(photo(), 8, 6, {
      ...s,
      solidProfile: JSON.stringify({
        name: "Measured example",
        absorption: [
          [2, 0.1, 0.1],
          [0.1, 2, 0.1],
          [0.1, 0.1, 2],
          [0.1, 0.1, 0.1],
        ],
      }),
    });
  assert.notDeepEqual(a.expected, b.expected);
  assert.throws(() => solidConfig({ ...s, solidFront: 0.17 }), /multiples/);
  assert.throws(() => solidConfig({ ...s, shape: "cylinder" }), /flat/);
  assert.throws(() => solidConfig({ ...s, solidProfile: "{}" }), /Profile/);
});
test("Calibration kit has mapped ramps, white steps and explicit slicer material names/slots", () => {
  const tile = calibrationTile(s),
    coupons = whiteCoupons(s);
  assert.equal(tile.patches.length, 36);
  assert.equal(coupons.steps.length, 6);
  assert.deepEqual(tile.patches[0].internalLayers, [
    0,
    0,
    0,
    solidConfig(s).inside,
  ]);
  assert.deepEqual(tile.patches[5].internalLayers, [
    solidConfig(s).inside,
    0,
    0,
    0,
  ]);
  const files = unzipSync(
    threeMF(tile.parts, "Calibration", {
      bambu: true,
      layer: 0.08,
      firstLayer: 0.16,
    }),
  );
  const config = strFromU8(files["Metadata/model_settings.config"]);
  for (const [name, slot] of [
    ["Cyan", 1],
    ["Magenta", 2],
    ["Yellow", 3],
    ["White", 4],
  ])
    assert.ok(
      config.includes(
        `value="${name}"/><metadata key="extruder" value="${slot}"`,
      ),
    );
  assert.equal(
    JSON.parse(strFromU8(files["Metadata/project_settings.config"]))
      .sparse_infill_density,
    "100%",
  );
});
