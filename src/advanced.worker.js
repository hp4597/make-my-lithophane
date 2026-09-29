import { COLOR_EXPORT_CELL_LIMIT } from "./geometry.js";
import { exportArchive } from "./export-archive.js";
import { colorLayout } from "./color-layout.js";
import { supportNotes } from "./supports.js";
import { matchPainting, colorLithophane, cmywPreviewMesh } from "./color.js";
import { buildMesh, binarySTL, meshStats, validate } from "./geometry.js";
import { threeMF } from "./three-mf.js";
import { zipSync, strToU8 } from "fflate";
self.onmessage = async ({ data: d }) => {
  const reply = (body, transfers = []) =>
    self.postMessage({ ...body, id: d.id }, transfers);
  try {
    const { nx, ny, rgba, settings: s } = d;
    validate(s);
    if (nx * ny > (d.preview ? 16000000 : COLOR_EXPORT_CELL_LIMIT))
      throw new Error(
        "Color export exceeds 4,000,000 cells. Increase sample spacing or reduce dimensions.",
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
      const parts = colorLithophane(rgba, nx, ny, s, d.preview);
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
      if (
        !["flat", "box", "curved", "nightlight", "cylinder", "lamp"].includes(
          s.shape,
        )
      )
        throw new Error(
          "CMYW material export supports the six priority shapes.",
        );
      const fitted = {
        ...s,
        shape: s.shape,
        max: parts.heights.reduce((a, b) => Math.max(a, b), 0),
      };
      const { supports, combined } = colorLayout(parts, fitted, d.hardware);
      if (d.format === "3mf") {
        const bytes = threeMF(combined, "CMYW with supports");
        reply({ bytes, nx, ny }, [bytes.buffer]);
        return;
      }
      const archive = exportArchive();
      for (const p of supports)
        archive.stl(p.name.toLowerCase().replaceAll(" ", "-") + ".stl", p.mesh);
      if (supports.length) {
        if (s.lightingSetup === "none")
          archive.stl("matching-support.stl", supports[0].mesh);
        archive.add("SUPPORT.txt", strToU8(supportNotes(fitted)));
      }
      if (d.hardware) archive.stl("hardware.stl", d.hardware);
      if (supports.length || d.hardware)
        archive.add(
          "print-layout.3mf",
          threeMF(combined, "CMYW with supports"),
        );
      for (const part of parts)
        archive.stl(part.name.toLowerCase() + ".stl", part.mesh);
      archive.add("color-assembly.3mf", threeMF(parts, "CMYW lithophane"));
      archive.add(
        "PRINTING.txt",
        strToU8(
          `CMYW COLOR LITHOPHANE\nFour touching, non-overlapping volumes in millimeters. Open the 3MF as one multipart object, preserve part alignment and assign Cyan/Magenta/Yellow/White to corresponding extruders. Colors in the 3MF are descriptive; extruder assignment depends on your slicer.\nLayer height: ${s.layer} mm. Color thickness cap: ${s.colorDepth} mm plus one minimum layer. Orient the assembled material volumes together for your shape; curved and round models may need supports.\nThis uses an experimental optical-density separation, not a calibrated commercial palette. Every channel has a one-layer floor for closed geometry; this may tint whites. Print a small test and adjust material/color depth. The image belongs on the light-source side; view through the white layer.\n`,
        ),
      );
      archive.add("settings.json", strToU8(JSON.stringify(s, null, 2)));
      if (d.project) archive.add("project.litho", strToU8(d.project));
      if (d.targetPNG) archive.add("target.png", d.targetPNG);
      const canvas = new OffscreenCanvas(nx + 1, ny + 1),
        ctx = canvas.getContext("2d"),
        pixels = ctx.createImageData(nx + 1, ny + 1);
      for (let y = 0; y <= ny; y++)
        for (let x = 0; x <= nx; x++) {
          const a = (y * (nx + 1) + x) * 3,
            b = ((ny - y) * (nx + 1) + x) * 4;
          for (let c = 0; c < 3; c++)
            pixels.data[b + c] = 255 * Math.pow(parts.expected[a + c], 1 / 2.2);
          pixels.data[b + 3] = 255;
        }
      ctx.putImageData(pixels, 0, 0);
      archive.add(
        "predicted.png",
        new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer()),
      );
      const bytes = archive.finish();
      reply({ bytes, nx, ny }, [bytes.buffer]);
    }
  } catch (error) {
    reply({ error: error.message });
  }
};
