import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, buildMesh, shapes } from "../src/geometry.js";
import {
  makeStand,
  makeCase,
  supportDimensions,
  printParts,
  bounds,
} from "../src/supports.js";
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

for (const shape of ["flat", "curved", "nightlight", "box"])
  test(`${shape}: fitted support topology and separated print placement`, () => {
    for (const width of [40, 120, 240]) {
      const s = { ...defaults, shape, width, height: width * 0.75 };
      const mesh = shape === "box" ? makeCase(s) : makeStand(s);
      topology(mesh);
      const panel = buildMesh(s, new Float32Array(121).fill(0.5), 10, 10);
      const parts = printParts(panel, s);
      assert.equal(parts.length, 2);
      const a = bounds(parts[0].mesh),
        b = bounds(parts[1].mesh);
      assert.ok(Math.abs(b.min[0] - a.max[0] - s.printGap) < 0.001);
      assert.equal(a.min[2], 0);
      assert.equal(b.min[2], 0);
    }
  });
test("Support dimensions follow width, height, thickness and clearance", () => {
  const a = supportDimensions(defaults),
    b = supportDimensions({ ...defaults, width: 240, height: 180, max: 5 });
  assert.equal(b.length, 2 * a.length);
  assert.ok(b.depth > a.depth);
  assert.equal(b.slot, 5.4);
  const s = { ...defaults, shape: "box", width: 200, height: 150, max: 5 };
  const c = supportDimensions(s);
  assert.equal(c.cavityWidth, 200.4);
  assert.equal(c.cavityHeight, 150.4);
  assert.equal(c.seat, 29.8);
  assert.throws(() => makeCase({ ...s, shape: "sphere" }), /flat/);
});
for (const [shape] of shapes)
  test(`${shape}: colored backlit vertices preserve geometry`, () => {
    const s = { ...defaults, shape, border: 0 },
      pixels = new Float32Array(121).fill(0.6),
      rgba = new Uint8ClampedArray(121 * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba.set([255, 30, 10, 255], i);
    const a = buildMesh(s, pixels, 10, 10),
      b = buildMesh(s, pixels, 10, 10, rgba);
    assert.deepEqual(a.positions, b.positions);
    assert.deepEqual(a.indices, b.indices);
    assert.ok(b.colors[0] > b.colors[1] * 5);
    assert.ok([...b.colors].every(Number.isFinite));
  });
test("CMYW backlit prediction follows quantized channel transmission", () => {
  const rgba = new Uint8ClampedArray(16);
  for (let i = 0; i < 16; i += 4) rgba.set([255, 30, 10, 255], i);
  const a = colorLithophane(rgba, 1, 1, { ...defaults, colorDepth: 0.64 });
  assert.equal(a.expected.length, 12);
  assert.ok(a.expected[0] > a.expected[1]);
  assert.ok(a.expected[1] > a.expected[2]);
  assert.ok([...a.expected].every((v) => v >= 0 && v <= 1));
  const b = colorLithophane(rgba, 1, 1, { ...defaults, colorDepth: 0.16 });
  assert.notDeepEqual(a.expected, b.expected);
});
