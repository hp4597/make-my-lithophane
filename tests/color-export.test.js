import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import {
  defaults,
  buildMesh,
  binarySTL,
  gridSize,
  COLOR_EXPORT_CELL_LIMIT,
} from "../src/geometry.js";
import { exportArchive } from "../src/export-archive.js";
import { colorLayout } from "../src/color-layout.js";
import { colorLithophane } from "../src/color.js";
import { threeMF } from "../src/three-mf.js";
test("Chunked STL ZIP preserves the complete binary across chunk boundaries", () => {
  const m = buildMesh(defaults, new Float32Array(101 * 81).fill(0.4), 100, 80),
    zip = exportArchive();
  zip.stl("panel.stl", m);
  zip.add("note.txt", new TextEncoder().encode("native"));
  const files = unzipSync(zip.finish());
  assert.deepEqual(files["panel.stl"], binarySTL(m));
  assert.equal(strFromU8(files["note.txt"]), "native");
});
test("Native screenshot dimensions pass the shared color export budget", () => {
  const g = gridSize(
    defaults,
    false,
    { width: 1672, height: 941 },
    COLOR_EXPORT_CELL_LIMIT,
  );
  assert.equal(g.nx, 1671);
  assert.equal(g.ny, 940);
  assert.throws(
    () =>
      gridSize(
        defaults,
        false,
        { width: 3000, height: 2000 },
        COLOR_EXPORT_CELL_LIMIT,
      ),
    /No downsampling/,
  );
});
test("Color print layout shares original material buffers and 3MF applies translation", () => {
  const s = { ...defaults, shape: "curved", lightingSetup: "strip" },
    parts = colorLithophane(new Uint8Array(9 * 9 * 4).fill(127), 8, 8, s);
  const { supports, combined } = colorLayout(parts, s);
  assert.ok(supports.length > 1);
  parts.forEach((p, i) => assert.equal(combined[i].mesh, p.mesh));
  const xml = strFromU8(unzipSync(threeMF(combined))["3D/3dmodel.model"]);
  const p = parts[0].mesh.positions,
    t = combined[0].translation;
  assert.ok(
    xml.includes(
      `<vertex x="${(p[0] + t[0]).toFixed(5)}" y="${(p[1] + t[1]).toFixed(5)}" z="${(p[2] + t[2]).toFixed(5)}"/>`,
    ),
  );
});
