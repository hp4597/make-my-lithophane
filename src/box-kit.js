import { defaults, buildMesh, binarySTL, gridSize } from "./geometry.js";
import { threeMF } from "./three-mf.js";
import { zipSync, strToU8 } from "fflate";
export async function makeBoxKit(photos, settings, generate, progress) {
  if (photos.length < 4)
    throw new Error("Add at least four photos to make a four-sided light box.");
  const s = { ...settings, shape: "flat", holes: false },
    parts = [],
    files = {},
    names = ["front", "right", "back", "left"];
  // Keep assembly size manageable without silently lowering requested resolution.
  for (const photo of photos.slice(0, 4))
    gridSize(s, false, photo.image, 150000);
  for (let side = 0; side < 4; side++) {
    progress(`Building light-box wall ${side + 1} of 4…`);
    const result = await generate(s, false, photos[side].image, true),
      mesh = result.mesh;
    files[names[side] + ".stl"] = binarySTL(mesh);
    const p = mesh.positions;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i],
        y = p[i + 1],
        z = p[i + 2],
        a = (side * Math.PI) / 2;
      const px = x,
        py = -s.width / 2 - z;
      p[i] = px * Math.cos(a) - py * Math.sin(a);
      p[i + 1] = px * Math.sin(a) + py * Math.cos(a);
      p[i + 2] = y + s.height / 2 + 2;
    }
    parts.push({ name: names[side], color: "#F4EBD4", mesh });
  }
  const size = s.width + 2 * s.max + 4,
    base = buildMesh(
      { ...defaults, width: size, height: size, border: 0, min: 2, max: 2.1 },
      new Float32Array(25).fill(1),
      4,
      4,
    );
  parts.push({ name: "base", color: "#D3D3D3", mesh: base });
  files["base.stl"] = binarySTL(base);
  files["assembled-light-box.3mf"] = threeMF(
    parts,
    "Four-sided photo light box",
  );
  files["ASSEMBLY.txt"] = strToU8(
    `FOUR-SIDED PHOTO LIGHT BOX\nDimensions: mm. Panel width ${s.width}, height ${s.height}; base ${size} square, 2 mm thick.\nPrint the four wall STLs separately, then bond their bottom edges to the base with appropriate adhesive. The 3MF shows assembled positions; it is not intended as a support-free single print. Corners meet along an edge and require adhesive reinforcement. The top is open for a low-heat LED puck. No snap fit or electrical parts are included.\nPhoto order: front, right, back, left. First four library photos are used.\n`,
  );
  return zipSync(files, { level: 3 });
}
