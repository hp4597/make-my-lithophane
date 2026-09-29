import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import {
  starterFilaments,
  paletteForStack,
  matchPainting,
  colorLithophane,
} from "../src/color.js";
import { threeMF } from "../src/three-mf.js";
import { makeMount } from "../src/mounts.js";
import { defaults, meshStats } from "../src/geometry.js";
function closed(mesh) {
  const edges = new Map(),
    p = mesh.positions;
  for (let k = 0; k < mesh.indices.length; k += 3) {
    const ids = Array.from(mesh.indices.slice(k, k + 3));
    for (let j = 0; j < 3; j++) {
      const a = ids[j],
        b = ids[(j + 1) % 3],
        key = [Math.min(a, b), Math.max(a, b)].join(",");
      const e = edges.get(key) || { n: 0, d: 0 };
      e.n++;
      e.d += a < b ? 1 : -1;
      edges.set(key, e);
    }
  }
  for (const e of edges.values()) {
    assert.equal(e.n, 2);
    assert.equal(e.d, 0);
  }
  assert.ok(meshStats(mesh).volume > 0);
  assert.ok(p.every(Number.isFinite));
}
test("Filament stack heights and pauses fall on integer layers", () => {
  const p = paletteForStack(starterFilaments, 0.08);
  assert.equal(p.swaps.length, 4);
  for (const c of p.candidates)
    assert.ok(Math.abs(c.height / 0.08 - Math.round(c.height / 0.08)) < 1e-8);
  for (const s of p.swaps)
    assert.equal(s.layer, Math.round(s.height / 0.08) + 1);
  assert.throws(() =>
    paletteForStack(
      [{ ...starterFilaments[0], thickness: 0 }, starterFilaments[1]],
      0.08,
    ),
  );
});
test("Color matching returns bounded heights and expected RGB for each pixel", () => {
  const rgba = new Uint8ClampedArray(4 * 5 * 5).fill(255),
    result = matchPainting(rgba, 4, 4, starterFilaments, 0.08);
  assert.equal(result.pixels.length, 25);
  assert.ok(result.pixels.every((x) => x >= 0 && x <= 1));
  assert.equal(result.expected.length, 75);
});
test("CMYW material meshes are closed and have matching adjacent surfaces", () => {
  const nx = 5,
    ny = 4,
    rgba = new Uint8ClampedArray((nx + 1) * (ny + 1) * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 71) % 256;
  const parts = colorLithophane(rgba, nx, ny, {
    ...defaults,
    colorDepth: 0.64,
  });
  assert.equal(parts.length, 4);
  parts.forEach((p) => closed(p.mesh));
  const count = (nx + 1) * (ny + 1);
  for (let j = 0; j < 3; j++)
    for (let k = 0; k < count; k++)
      assert.equal(
        parts[j].mesh.positions[(count + k) * 3 + 2],
        parts[j + 1].mesh.positions[k * 3 + 2],
      );
  const archive = unzipSync(threeMF(parts, "A & B"));
  const model = strFromU8(archive["3D/3dmodel.model"]);
  assert.match(model, /unit="millimeter"/);
  assert.match(model, /A &amp; B/);
  assert.equal((model.match(/<component objectid=/g) || []).length, 4);
  assert.ok(archive["_rels/.rels"]);
});
for (const type of ["spider", "ring", "stand", "clip"])
  test(`${type}: closed mounting-part geometry`, () =>
    closed(
      makeMount(type, {
        diameter: 100,
        socket: 28,
        thickness: 3,
        spoke: 5,
        slot: 3.6,
        depth: 15,
        width: 40,
      }),
    ));
