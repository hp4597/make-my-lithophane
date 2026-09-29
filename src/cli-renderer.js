import { printParts, mergeMeshes } from "./supports.js";
import { loadImage, sampleImage } from "./image.js";
import {
  validate,
  gridSize,
  buildMesh,
  binarySTL,
  meshStats,
} from "./geometry.js";
import { threeMF } from "./three-mf.js";
window.renderCLI = async ({ source, settings, format }) => {
  validate(settings);
  if (settings.colorMode !== "mono")
    throw new Error("CLI requires monochrome mode.");
  const image = await loadImage(source);
  if (image.width * image.height > 100000000)
    throw new Error("Image exceeds 100 megapixels.");
  const { nx, ny } = gridSize(settings),
    pixels = sampleImage(image, settings, nx, ny),
    mesh = buildMesh(settings, pixels, nx, ny);
  const parts = printParts(mesh, settings);
  const bytes =
    format === "3mf"
      ? threeMF(parts)
      : binarySTL(mergeMeshes(parts.map((p) => p.mesh)));
  return { bytes, stats: meshStats(mesh) };
};
