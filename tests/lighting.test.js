import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, buildMesh } from "../src/geometry.js";
import { lightingParts } from "../src/lighting.js";
import { applyLightPreset, priorityShapes } from "../src/lighting-settings.js";
import { printParts, bounds } from "../src/supports.js";
import { colorLithophane } from "../src/color.js";
function topology(m) {
  const edges = new Map();
  let volume = 0;
  const p = m.positions;
  for (let k = 0; k < m.indices.length; k += 3) {
    const ids = Array.from(m.indices.slice(k, k + 3));
    assert.equal(new Set(ids).size, 3);
    const [a, b, c] = ids.map((i) => Array.from(p.slice(i * 3, i * 3 + 3))),
      u = b.map((x, i) => x - a[i]),
      v = c.map((x, i) => x - a[i]);
    const cross = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    assert.ok(Math.hypot(...cross) > 1e-7, "Triangle must have nonzero area");
    volume +=
      a[0] * (b[1] * c[2] - b[2] * c[1]) +
      a[1] * (b[2] * c[0] - b[0] * c[2]) +
      a[2] * (b[0] * c[1] - b[1] * c[0]);
    for (let j = 0; j < 3; j++) {
      const a = ids[j],
        b = ids[(j + 1) % 3],
        key = [Math.min(a, b), Math.max(a, b)].join(",");
      const e = edges.get(key) || { count: 0, direction: 0 };
      e.count++;
      e.direction += a < b ? 1 : -1;
      edges.set(key, e);
    }
  }
  for (const e of edges.values()) {
    assert.equal(e.count, 2, "Each edge has exactly two incident faces");
    assert.equal(e.direction, 0, "Faces must have consistent winding");
  }
  assert.ok(volume > 0, "Normals point out of solid");
}

for (const shape of priorityShapes)
  test(
    shape + ": lighting solids, separate print layout and CMYW volumes",
    () => {
      const s = { ...defaults, shape, lightingSetup: "strip", diffuser: true };
      const parts = lightingParts(s);
      assert.ok(parts.length >= 4);
      for (const p of parts) {
        topology(p.mesh);
        topology(p.assembled);
      }
      const panel = buildMesh(s, new Float32Array(33 * 25).fill(0.5), 32, 24),
        layout = printParts(panel, s);
      assert.equal(layout.length, parts.length + 1);
      let right = -Infinity;
      for (const p of layout) {
        const b = bounds(p.mesh);
        assert.ok(b.min[0] > right);
        assert.ok(Math.abs(b.min[2]) < 1e-4);
        right = b.max[0];
      }
      const rgba = new Uint8Array(33 * 25 * 4).fill(155),
        color = colorLithophane(rgba, 32, 24, { ...s, colorMode: "cmyw" });
      for (const p of color) topology(p.mesh);
    },
  );
test("Board presets and resized frames retain closed geometry", () => {
  for (const mode of ["fixed", "modular"])
    for (const count of [2, 3, 4]) {
      const s = { ...defaults, boardCount: count };
      applyLightPreset(s, mode);
      assert.equal(s.boardWidth, mode === "fixed" ? 156 : 48 * count);
      for (const width of [120, 220])
        for (const p of lightingParts({ ...s, width, lightMount: "screws" }))
          topology(p.mesh);
    }
});
test("Puck and socket attachments and incompatible setups", () => {
  for (const shape of ["flat", "cylinder", "lamp"])
    for (const lightKind of ["puck", "socket"])
      for (const p of lightingParts({
        ...defaults,
        shape,
        lightingSetup: "custom",
        lightKind,
      }))
        topology(p.mesh);
  assert.throws(
    () =>
      lightingParts({
        ...defaults,
        shape: "curved",
        lightingSetup: "fixed",
        lightKind: "board",
      }),
    /Rigid/,
  );
  assert.throws(
    () =>
      lightingParts({
        ...defaults,
        shape: "lamp",
        lightingSetup: "strip",
        taper: 0.3,
      }),
    /fit/,
  );
});
