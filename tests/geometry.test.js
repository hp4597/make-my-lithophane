import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  shapes,
  buildMesh,
  binarySTL,
  meshStats,
  gridSize,
  validate,
  tone,
} from "../src/geometry.js";
function image(nx, ny, value = 0.5) {
  return new Float32Array((nx + 1) * (ny + 1)).fill(value);
}
test("Large panels retain physical dimensions and native detail", () => {
  const s = { ...defaults, width: 900, height: 360, support: "none" };
  validate(s);
  assert.deepEqual(gridSize(s, false, { width: 1672, height: 941 }), {
    nx: 1671,
    ny: 940,
  });
  const mesh = buildMesh(s, image(8, 6), 8, 6);
  assert.ok(Math.abs(meshStats(mesh).dimensions[0] - 900) < 0.001);
  assert.throws(() => validate({ ...s, width: Infinity }), /number/);
});
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
for (const [shape] of shapes)
  test(`${shape}: closed oriented mesh without zero-area faces`, () => {
    const nx = 44,
      ny = 36;
    topology(buildMesh({ ...defaults, shape }, image(nx, ny), nx, ny));
  });
test("Black and white map to maximum and minimum thickness in millimeters", () => {
  for (const [brightness, thickness] of [
    [0, 3.2],
    [1, 0.8],
  ]) {
    const m = buildMesh(
        { ...defaults, border: 0 },
        image(10, 10, brightness),
        10,
        10,
      ),
      stats = meshStats(m);
    assert.ok(Math.abs(stats.dimensions[2] - thickness) < 1e-5);
    assert.ok(Math.abs(stats.volume - (120 * 90 * thickness) / 1000) < 1e-3);
  }
});
test("STL binary header, length, count and finite coordinates", () => {
  const mesh = buildMesh(defaults, image(10, 10), 10, 10),
    bytes = binarySTL(mesh),
    view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(80, true), mesh.indices.length / 3);
  assert.equal(bytes.length, 84 + (mesh.indices.length / 3) * 50);
  for (let t = 0; t < mesh.indices.length / 3; t++)
    for (let c = 0; c < 12; c++)
      assert.ok(Number.isFinite(view.getFloat32(84 + t * 50 + c * 4, true)));
});
test("Reject impossible dimensions, thicknesses and memory-heavy requests", () => {
  assert.throws(() => validate({ ...defaults, min: 4 }));
  assert.throws(() => validate({ ...defaults, width: NaN }));
  assert.throws(() =>
    gridSize({ ...defaults, shape: "sphere", width: 500, resolution: 0.15 }),
  );
  assert.doesNotThrow(() => validate({ ...defaults, width: 20, height: 20 }));
});
test("Image tone transformations clamp and invert", () => {
  assert.equal(tone(0, defaults), 0);
  assert.equal(tone(1, defaults), 1);
  assert.equal(tone(0, { ...defaults, invert: true }), 1);
  assert.equal(tone(1, { ...defaults, brightness: 100 }), 1);
});
test("Preview resolution is limited but export follows spacing", () => {
  const s = { ...defaults, resolutionMode: "spacing", resolution: 0.06 };
  const p = gridSize(s, true),
    f = gridSize(s, false);
  assert.ok(p.nx * p.ny <= 600000);
  assert.ok(f.nx > p.nx);
});
test("Filament painting places white on higher bands for dark-to-light swaps", () => {
  const s = { ...defaults, border: 0, colorMode: "painting" };
  const black = meshStats(buildMesh(s, image(10, 10, 0), 10, 10));
  const white = meshStats(buildMesh(s, image(10, 10, 1), 10, 10));
  assert.ok(black.dimensions[2] < white.dimensions[2]);
});
test("Flat panels with two hanging holes remain closed", () => {
  const nx = 240,
    ny = 180;
  topology(
    buildMesh(
      { ...defaults, holes: true, border: 6, holeDiameter: 3 },
      image(nx, ny),
      nx,
      ny,
    ),
  );
});
test("Wavy lamps preserve closed seams", () => {
  const nx = 80,
    ny = 40;
  topology(
    buildMesh(
      { ...defaults, shape: "lamp", waves: 8, waveDepth: 2 },
      image(nx, ny),
      nx,
      ny,
    ),
  );
});
test("Noisy silhouettes resolve diagonal contacts into closed manifolds", () => {
  const nx = 40,
    ny = 30,
    pixels = image(nx, ny);
  let seed = 123;
  for (let i = 0; i < pixels.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    pixels[i] = seed / 4294967296;
  }
  for (const largestIsland of [false, true])
    topology(
      buildMesh(
        { ...defaults, shape: "silhouette", threshold: 0.48, largestIsland },
        pixels,
        nx,
        ny,
      ),
    );
});
