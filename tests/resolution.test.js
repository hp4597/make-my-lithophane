import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, gridSize, buildMesh, binarySTL } from "../src/geometry.js";
import { threeMF } from "../src/three-mf.js";
import { unwrapPreviewUVs } from "../src/preview-uv.js";
import { unzipSync, strFromU8 } from "fflate";
import { colorLithophane, cmywPreviewMesh } from "../src/color.js";
test("Native grids match every source pixel and rotate axes without changing physical size", () => {
  const image = { width: 1600, height: 1200 };
  assert.deepEqual(gridSize(defaults, false, image), { nx: 1599, ny: 1199 });
  assert.deepEqual(
    gridSize({ ...defaults, rotation: 90, width: 240 }, false, image),
    { nx: 1199, ny: 1599 },
  );
  const p = gridSize(defaults, true, image);
  assert.ok(p.nx * p.ny <= 600000);
  assert.ok(p.nx > 800);
  assert.throws(
    () => gridSize(defaults, false, { width: 6000, height: 4000 }),
    /No downsampling/,
  );
});
test("Native one-megapixel mesh preserves alternating pixel heights", () => {
  const nx = 1023,
    ny = 1023,
    s = { ...defaults, border: 0 };
  const pixels = new Float32Array((nx + 1) * (ny + 1));
  for (let i = 0; i < pixels.length; i++) pixels[i] = i % 2;
  const m = buildMesh(s, pixels, nx, ny);
  assert.equal(m.positions.length, (nx + 1) * (ny + 1) * 6);
  assert.equal(m.indices.length, nx * ny * 12 + (nx + ny) * 12);
  let thick = 0,
    thin = 0;
  for (let i = 2; i < m.positions.length; i += 3) {
    if (Math.abs(m.positions[i] - s.max) < 0.0001) thick++;
    if (Math.abs(m.positions[i] - s.min) < 0.0001) thin++;
  }
  assert.equal(thick, 524288);
  assert.equal(thin, 524288);
});
test("Streaming 3MF retains every mesh vertex and face", () => {
  const nx = 140,
    ny = 110,
    m = buildMesh(
      defaults,
      new Float32Array((nx + 1) * (ny + 1)).fill(0.5),
      nx,
      ny,
    );
  const xml = strFromU8(
    unzipSync(threeMF([{ name: "Native", mesh: m }]))["3D/3dmodel.model"],
  );
  assert.equal((xml.match(/<vertex /g) || []).length, m.positions.length / 3);
  assert.equal((xml.match(/<triangle /g) || []).length, m.indices.length / 3);
  assert.ok(xml.endsWith("</model>"));
});
test("Preview texture seams unwrap without modifying printable mesh", () => {
  const m = buildMesh(
      { ...defaults, shape: "cylinder" },
      new Float32Array(121).fill(0.5),
      10,
      10,
    ),
    before = m.indices.slice(),
    p = unwrapPreviewUVs(m);
  assert.deepEqual(m.indices, before);
  assert.ok(p.positions.length > m.positions.length);
  for (let k = 0; k < p.indices.length; k += 3) {
    const u = [0, 1, 2].map((j) => p.uvs[p.indices[k + j] * 2]);
    assert.ok(Math.max(...u) - Math.min(...u) <= 0.50001);
  }
});
test("Native CMYW image prediction matches exported geometry prediction", () => {
  const rgba = new Uint8ClampedArray(64).fill(160),
    s = { ...defaults, colorDepth: 0.64 };
  assert.deepEqual(
    colorLithophane(rgba, 3, 3, s, true).expected,
    colorLithophane(rgba, 3, 3, s).expected,
  );
  assert.equal(colorLithophane(rgba, 3, 3, s, true).length, 0);
});

test("Live CMYW mesh follows generated material thickness and current shape", () => {
  const s = { ...defaults, colorMode: "cmyw", colorDepth: 0.64 },
    rgba = new Uint8ClampedArray(100);
  for (let i = 0; i < 100; i += 4) rgba.set([180, 80, 20, 255], i);
  const parts = colorLithophane(rgba, 4, 4, s, true),
    a = cmywPreviewMesh(parts, 4, 4, s);
  assert.ok(Math.abs(a.fitted.min - parts.heights[0]) < 0.0001);
  assert.ok(
    a.mesh.positions.some(
      (v, i) => i % 3 === 2 && Math.abs(v - parts.heights[0]) < 0.0001,
    ),
  );
  const b = cmywPreviewMesh(parts, 4, 4, { ...s, shape: "curved" });
  assert.equal(b.fitted.shape, "curved");
  assert.notDeepEqual(a.mesh.positions, b.mesh.positions);
});
