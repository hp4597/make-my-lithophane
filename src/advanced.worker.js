import { printParts, mergeMeshes, bounds, supportNotes } from "./supports.js";
import { matchPainting, colorLithophane } from "./color.js";
import { buildMesh, binarySTL, meshStats, validate } from "./geometry.js";
import { threeMF } from "./three-mf.js";
import { zipSync, strToU8 } from "fflate";
self.onmessage = ({ data: d }) => {
  try {
    const { nx, ny, rgba, settings: s } = d;
    validate(s);
    if (nx * ny > 250000)
      throw new Error(
        "Color export exceeds 250,000 cells. Increase sample spacing or reduce dimensions.",
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
        self.postMessage({
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
      self.postMessage(
        { bytes, stats: meshStats(mesh), expected: result.expected, nx, ny },
        [bytes.buffer],
      );
    } else {
      const parts = colorLithophane(rgba, nx, ny, s),
        files = {};
      if (d.preview) {
        self.postMessage({ expected: parts.expected, nx, ny });
        return;
      }
      const fitted = {
        ...s,
        shape: s.shape === "box" ? "box" : "flat",
        max: bounds(mergeMeshes(parts.map((p) => p.mesh))).max[2],
      };
      const layout = printParts(mergeMeshes(parts.map((p) => p.mesh)), fitted);
      if (layout.length > 1) {
        files["matching-support.stl"] = binarySTL(layout[1].mesh);
        files["SUPPORT.txt"] = strToU8(supportNotes(fitted));
        // Preserve material alignment and place the support alongside it.
        const pb = bounds(parts[0].mesh),
          shift = [-pb.min[0], -pb.min[1], 0];
        const shifted = parts.map((p) => ({
          ...p,
          mesh: {
            ...p.mesh,
            positions: p.mesh.positions.map((v, i) => v + shift[i % 3]),
          },
        }));
        files["print-layout.3mf"] = threeMF(
          [...shifted, layout[1]],
          "CMYW with matching support",
        );
      }
      for (const part of parts)
        files[part.name.toLowerCase() + ".stl"] = binarySTL(part.mesh);
      files["color-assembly.3mf"] = threeMF(parts, "CMYW lithophane");
      files["PRINTING.txt"] = strToU8(
        `CMYW COLOR LITHOPHANE\nFour touching, non-overlapping volumes in millimeters. Open the 3MF as one multipart object, preserve part alignment and assign Cyan/Magenta/Yellow/White to corresponding extruders. Colors in the 3MF are descriptive; extruder assignment depends on your slicer.\nLayer height: ${s.layer} mm. Color thickness cap: ${s.colorDepth} mm plus one minimum layer. Print flat.\nThis uses an experimental optical-density separation, not a calibrated commercial palette. Every channel has a one-layer floor for closed geometry; this may tint whites. Print a small test and adjust material/color depth. The image belongs on the light-source side; view through the white layer.\n`,
      );
      files["settings.json"] = strToU8(JSON.stringify(s, null, 2));
      const bytes = zipSync(files, { level: 3 });
      self.postMessage({ bytes, expected: parts.expected, nx, ny }, [
        bytes.buffer,
      ]);
    }
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
