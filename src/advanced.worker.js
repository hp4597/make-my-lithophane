import {
  printParts,
  mergeMeshes,
  bounds,
  supportNotes,
  transform,
} from "./supports.js";
import { matchPainting, colorLithophane, cmywPreviewMesh } from "./color.js";
import { buildMesh, binarySTL, meshStats, validate } from "./geometry.js";
import { threeMF } from "./three-mf.js";
import { zipSync, strToU8 } from "fflate";
self.onmessage = ({ data: d }) => {
  const reply = (body, transfers = []) =>
    self.postMessage({ ...body, id: d.id }, transfers);
  try {
    const { nx, ny, rgba, settings: s } = d;
    validate(s);
    if (nx * ny > (d.preview ? 16000000 : 1000000))
      throw new Error(
        "Color export exceeds 1,000,000 cells. Increase sample spacing or reduce dimensions.",
      );
    if (d.mode === "chromaphane")
      throw new Error(
        "Filament painting is Work in progress and paused for this version.",
      );
    if (d.mode === "chromaphane") {
      const result = matchPainting(
        rgba,
        nx,
        ny,
        d.filaments,
        s.layer,
        d.algorithm,
      );
      if (d.preview) {
        reply({
          expected: result.expected,
          nx,
          ny,
          palette: result.palette,
        });
        return;
      }
      const { min, max } = result.palette,
        mesh = buildMesh(
          { ...s, shape: "flat", colorMode: "mono", min, max, border: 0 },
          result.pixels,
          nx,
          ny,
        );
      const instructions = `FILAMENT PAINTING\nPrint flat with image face up. Units: mm. Use ${s.layer} mm layers, including first layer.\n${result.palette.swaps.map((swap, k) => `${k + 1}. ${swap.name}: load BEFORE layer ${swap.layer}; previous material ends at Z=${swap.height.toFixed(3)} mm.`).join("\n")}\nAll heights are integer layer multiples. Preview uses an approximate transmission model; calibrate your filaments before relying on color. Inspect suggested swaps in your slicer.\n`;
      const files = {
        "painting.stl": binarySTL(mesh),
        "painting.3mf": threeMF([
          { name: "Filament painting", color: "#EEEEEE", mesh },
        ]),
        "SWAPS.txt": strToU8(instructions),
        "filaments.json": strToU8(JSON.stringify(d.filaments, null, 2)),
        "settings.json": strToU8(JSON.stringify(s, null, 2)),
      };
      const bytes = zipSync(files, { level: 3 });
      reply(
        { bytes, stats: meshStats(mesh), expected: result.expected, nx, ny },
        [bytes.buffer],
      );
    } else {
      const parts = colorLithophane(rgba, nx, ny, s, d.preview),
        files = {};
      if (d.preview) {
        const live = cmywPreviewMesh(parts, nx, ny, s);
        reply(
          {
            expected: parts.expected,
            nx,
            ny,
            ...live,
            stats: meshStats(live.mesh),
          },
          [
            parts.expected.buffer,
            live.mesh.positions.buffer,
            live.mesh.indices.buffer,
            live.mesh.colors.buffer,
            live.mesh.uvs.buffer,
          ],
        );
        return;
      }
      if (!["flat", "box"].includes(s.shape))
        throw new Error(
          "CMYW material export currently supports flat panels and light boxes. The current shape is preview-only in CMYW mode.",
        );
      const fitted = {
        ...s,
        shape: s.shape === "box" ? "box" : "flat",
        max: bounds(mergeMeshes(parts.map((p) => p.mesh))).max[2],
      };
      const layout = printParts(mergeMeshes(parts.map((p) => p.mesh)), fitted);
      if (layout.length > 1) {
        files["matching-support.stl"] = binarySTL(layout[1].mesh);
        files["SUPPORT.txt"] = strToU8(supportNotes(fitted));
      }
      // Material layers stay aligned; matching supports and optional hardware sit beside them.
      const pb = bounds(parts[0].mesh),
        shift = [-pb.min[0], -pb.min[1], 0];
      const combined = parts.map((p) => ({
        ...p,
        mesh: transform(p.mesh, (x, y, z) => [x + shift[0], y + shift[1], z]),
      }));
      if (layout.length > 1) combined.push(layout[1]);
      if (d.hardware) {
        const b = bounds(d.hardware),
          right = Math.max(...combined.map((p) => bounds(p.mesh).max[0]));
        combined.push({
          name: "Optional hardware",
          color: "#9BA99A",
          mesh: transform(d.hardware, (x, y, z) => [
            x - b.min[0] + right + s.printGap,
            y - b.min[1],
            z - b.min[2],
          ]),
        });
        files["hardware.stl"] = binarySTL(d.hardware);
      }
      if (layout.length > 1 || d.hardware)
        files["print-layout.3mf"] = threeMF(combined, "CMYW with supports");
      for (const part of parts)
        files[part.name.toLowerCase() + ".stl"] = binarySTL(part.mesh);
      files["color-assembly.3mf"] = threeMF(parts, "CMYW lithophane");
      files["PRINTING.txt"] = strToU8(
        `CMYW COLOR LITHOPHANE\nFour touching, non-overlapping volumes in millimeters. Open the 3MF as one multipart object, preserve part alignment and assign Cyan/Magenta/Yellow/White to corresponding extruders. Colors in the 3MF are descriptive; extruder assignment depends on your slicer.\nLayer height: ${s.layer} mm. Color thickness cap: ${s.colorDepth} mm plus one minimum layer. Print flat.\nThis uses an experimental optical-density separation, not a calibrated commercial palette. Every channel has a one-layer floor for closed geometry; this may tint whites. Print a small test and adjust material/color depth. The image belongs on the light-source side; view through the white layer.\n`,
      );
      files["settings.json"] = strToU8(JSON.stringify(s, null, 2));
      const bytes = zipSync(files, { level: 3 });
      reply({ bytes, expected: parts.expected, nx, ny }, [bytes.buffer]);
    }
  } catch (error) {
    reply({ error: error.message });
  }
};
