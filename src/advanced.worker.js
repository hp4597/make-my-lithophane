import { calibrationTile, whiteCoupons } from "./solid-color.js";
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
    if (d.calibration) {
      const tile = calibrationTile(s),
        archive = exportArchive(),
        options = {
          bambu: true,
          layer: s.layer,
          firstLayer: Math.min(s.solidRear, 2 * s.layer),
        };
      archive.add(
        "calibration-tile.3mf",
        threeMF(tile.parts, "36 mm solid color calibration", options),
      );
      for (const p of tile.parts)
        archive.stl(p.name.toLowerCase() + ".stl", p.mesh);
      const coupons = whiteCoupons(s);
      archive.stl("white-thickness-coupons.stl", coupons.mesh);
      archive.add(
        "patches.json",
        strToU8(JSON.stringify(tile.patches, null, 2)),
      );
      archive.add(
        "patches.csv",
        strToU8(
          "row_from_bottom,column_from_left,label,C_layers,M_layers,Y_layers,W_internal_layers,R_linear,G_linear,B_linear\n" +
            tile.patches
              .map((p) =>
                [
                  p.rowFromBottom,
                  p.columnFromLeft,
                  p.label,
                  ...p.internalLayers,
                  ...p.relativeLinearRGB,
                ].join(","),
              )
              .join("\n"),
        ),
      );
      archive.add("profile.json", strToU8(s.solidProfile));
      archive.add(
        "PRINT-SETTINGS.json",
        strToU8(
          JSON.stringify(
            {
              layer_height: s.layer,
              initial_layer_print_height: options.firstLayer,
              sparse_infill_density: "100%",
              filaments: ["Cyan", "Magenta", "Yellow", "White"],
              note: "Verify these in the slicer: third-party 3MF imports may retain only part names and slot assignments.",
            },
            null,
            2,
          ),
        ),
      );
      let svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="680" viewBox="0 0 600 680"><rect width="600" height="680" fill="white"/><text x="20" y="30" font-family="sans-serif" font-size="20">36 mm calibration tile · viewed from +Z</text>';
      for (const patch of tile.patches) {
        const x = 20 + (patch.columnFromLeft - 1) * 92,
          y = 60 + (6 - patch.rowFromBottom) * 92,
          rgb = patch.relativeLinearRGB.map((v) =>
            Math.round(255 * v ** (1 / 2.2)),
          );
        svg += `<rect x="${x}" y="${y}" width="90" height="90" fill="rgb(${rgb.join(",")})" stroke="black"/><rect x="${x + 3}" y="${y + 3}" width="80" height="20" fill="white"/><text x="${x + 5}" y="${y + 17}" font-family="sans-serif" font-size="12">R${patch.rowFromBottom} C${patch.columnFromLeft}</text>`;
      }
      svg +=
        '<text x="20" y="640" font-family="sans-serif" font-size="14">Row 1 = bottom edge. Estimated colors; use patches.csv for layer counts.</text></svg>';
      archive.add("patch-map.svg", strToU8(svg));
      archive.add(
        "settings.json",
        strToU8(JSON.stringify(tile.settings, null, 2)),
      );
      archive.add(
        "CALIBRATION.txt",
        strToU8(
          `36 x 36 mm tile, six columns and six rows of 6 mm patches. View from +Z (white front skin). Row 1 is the bottom edge (-Y); column 1 is the left edge (-X). Rows 1-3: cyan/magenta/yellow thickness ramps; row 4: pairs; row 5: neutral mixtures; row 6: matched gray. Use patches.csv as the positional key. Print as ONE multipart object: C=1 M=2 Y=3 W=4, 100% infill, layer ${s.layer} mm, first layer ${options.firstLayer} mm. Match physical spool slots before printing. Rear skin ${s.solidRear} mm, front skin ${s.solidFront} mm. Separate all-white coupons run left to right at ${coupons.steps.join(", ")} mm thickness, with 2 mm gaps. Print coupons separately in WHITE. Illuminate tile/coupons with the final light at a fixed distance, lock camera exposure and white balance, and compare relative to the white-only reference. No automatic camera calibration is performed. Absorption coefficients in profile.json are RGB per-mm optical-density estimates for C,M,Y,W. Adjust a copied profile only with measured evidence. Actual fit, color and printing remain unvalidated.`,
        ),
      );
      const bytes = archive.finish();
      reply({ bytes, nx, ny }, [bytes.buffer]);
      return;
    }
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
      const options = {
        bambu: true,
        layer: s.layer,
        firstLayer:
          s.colorStructure === "solid"
            ? Math.min(s.solidRear, 2 * s.layer)
            : s.layer,
      };
      if (d.format === "3mf") {
        const bytes = threeMF(combined, "CMYW with supports", options);
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
          threeMF(combined, "CMYW with supports", options),
        );
      for (const part of parts)
        archive.stl(part.name.toLowerCase() + ".stl", part.mesh);
      archive.add(
        "color-assembly.3mf",
        threeMF(parts, "CMYW lithophane", options),
      );
      archive.add(
        "PRINTING.txt",
        strToU8(
          s.colorStructure === "solid"
            ? `SMOOTH SOLID CMYW PANEL\nPrint the aligned multipart object flat. Use ${s.layer} mm layers, ${options.firstLayer} mm first layer and 100% infill. Assign Cyan/Magenta/Yellow/White to slots 1/2/3/4 and verify actual spool mapping. Bambu third-party imports can ignore global print-setting hints: explicitly check these values. A zero-use color can be absent. White skins cover the front and back; interior prisms tile without intended gaps. Read SOLID-PANEL.txt and print the calibration tile before a full photo. Optical coefficients and physical printing are unvalidated.\n`
            : `CMYW COLOR LITHOPHANE\nFour touching, non-overlapping volumes in millimeters. Open the 3MF as one multipart object, preserve part alignment and assign Cyan/Magenta/Yellow/White to corresponding extruders. Colors in the 3MF are descriptive; extruder assignment depends on your slicer.\nLayer height: ${s.layer} mm. Color thickness cap: ${s.colorDepth} mm plus one minimum layer. Orient the assembled material volumes together for your shape; curved and round models may need supports.\nThis uses an experimental optical-density separation, not a calibrated commercial palette. Every channel has a one-layer floor for closed geometry; this may tint whites. Print a small test and adjust material/color depth. The image belongs on the light-source side; view through the white layer.\n`,
        ),
      );
      if (parts.solidReport) {
        archive.add(
          "SOLID-PANEL.json",
          strToU8(JSON.stringify(parts.solidReport, null, 2)),
        );
        archive.add("transmission-profile.json", strToU8(s.solidProfile));
        archive.add(
          "SOLID-PANEL.txt",
          strToU8(
            `EXPERIMENTAL SMOOTH SOLID PANEL\nFlat front and back, total thickness ${s.solidThickness} mm. White rear/front skins ${s.solidRear}/${s.solidFront} mm. Internal color boundaries use ${s.layer} mm layer increments. First layer ${options.firstLayer} mm. 100% infill. Print flat as one multipart object; keep all volumes aligned. Touching same-material prisms should be unioned by the slicer. CMYW slots 1/2/3/4 are hints; verify actual spools. Grid ${parts.solidReport.grid.join(" x ")} with pitch ${parts.solidReport.pitch.join(" x ")} mm, deliberately constrained by the minimum printable feature size; source image is retained. Profile: ${parts.solidReport.profile}. Prediction is relative to an all-white panel under the same light. It does not predict absolute brightness, scattering, or lateral light bleed. Print the calibration tile before a full panel. Skin thicknesses and optical coefficients have not been physically calibrated.`,
          ),
        );
      }
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
    reply({
      error:
        error instanceof RangeError
          ? "This color job exceeded available memory or a platform buffer capacity. No detail was reduced. " +
            error.message
          : error.message,
    });
  }
};
