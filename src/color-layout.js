import { bounds, printParts, transform } from "./supports.js";

export function colorLayout(parts, settings, hardware = null) {
  const boxes = parts.map((p) => bounds(p.mesh)),
    min = [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b.min[k]))),
    max = [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b.max[k])));
  // Support placement needs only the panel bounds, not a merged copy of four meshes.
  const proxy = {
    positions: new Float32Array([...min, ...max]),
    indices: new Uint32Array(),
    colors: new Float32Array(6),
  };
  const supports = printParts(proxy, settings).slice(1),
    translation = supports.length ? min.map((v) => -v) : [0, 0, 0];
  const combined = parts.map((p) => ({ ...p, translation }));
  combined.push(...supports);
  if (hardware) {
    const b = bounds(hardware),
      right = Math.max(
        max[0] + translation[0],
        ...supports.map((p) => bounds(p.mesh).max[0]),
      );
    combined.push({
      name: "Optional hardware",
      color: "#9BA99A",
      mesh: transform(hardware, (x, y, z) => [
        x - b.min[0] + right + settings.printGap,
        y - b.min[1],
        z - b.min[2],
      ]),
    });
  }
  return { supports, combined };
}
