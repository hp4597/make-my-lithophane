import { starterFilaments, paletteForStack } from "./color.js";
import { sampleImage } from "./image.js";
import { unzipSync, zipSync, strToU8 } from "fflate";
const escape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
export function initAdvanced(api) {
  const worker = new Worker(new URL("./advanced.worker.js", import.meta.url), {
    type: "module",
  });
  let filaments = structuredClone(starterFilaments),
    layer = 0.08,
    colorDepth = 0.64,
    algorithm = "lab",
    mode = "cmyw",
    working = false;
  try {
    const saved = JSON.parse(localStorage.getItem("filament-library"));
    if (saved) {
      paletteForStack(saved, layer);
      filaments = saved;
    }
  } catch {}
  const dialog = document.createElement("dialog");
  dialog.id = "color-studio";
  dialog.className = "color-studio";
  document.body.append(dialog);
  const button = document.createElement("button");
  button.id = "color-studio-open";
  button.className = "guide-button";
  button.textContent = "Color lithophane studio →";
  document.querySelector(".local-note").before(button);
  const run = (d) =>
    new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) =>
        data.error ? reject(new Error(data.error)) : resolve(data);
      worker.onerror = () =>
        reject(new Error("Color generation failed. Restart the app."));
      worker.postMessage(d, [d.rgba.buffer]);
    });
  function draw() {
    dialog.innerHTML = `<button class="dialog-close" data-action="close">×</button><span class="eyebrow">COLOR STUDIO</span><h2>More than shades of white.</h2><div class="button-row"><button data-mode="chromaphane" disabled title="Paused until you ask to resume">Filament painting · Work in progress</button><button data-mode="cmyw" class="${mode === "cmyw" ? "primary" : ""}">CMYW lithophane</button></div><p>${mode === "chromaphane" ? "Arrange filaments from bottom to top. The predicted image matches your photo to colors attainable at each layer of this stack." : "Create four aligned material volumes for a multicolor printer. The kit contains separate STLs and a multipart 3MF assembly."}</p><div class="field-row"><label class="field"><span>Layer height (mm)</span><input id="color-layer" type="number" min="0.04" max="0.3" step="0.01" value="${layer}"/></label>${mode === "chromaphane" ? `<label class="field"><span>Color distance</span><select id="color-algorithm"><option value="lab" ${algorithm === "lab" ? "selected" : ""}>CIELAB distance</option><option value="rgb" ${algorithm === "rgb" ? "selected" : ""}>RGB distance</option></select></label>` : `<label class="field"><span>Max color depth (mm)</span><input id="color-depth" type="number" min="0.08" max="1.6" step="0.08" value="${colorDepth}"/></label>`}</div>${mode === "chromaphane" ? `<div class="filament-header"><span>FILAMENT · BOTTOM TO TOP</span><span>TD (mm)</span><span>DEPTH (mm)</span></div><div class="filament-rows">${filaments.map((f, i) => `<div class="filament-row" data-index="${i}"><input aria-label="Filament ${i + 1} color" type="color" data-key="color" value="${f.color}"/><input aria-label="Filament ${i + 1} name" data-key="name" value="${escape(f.name)}"/><input aria-label="Filament ${i + 1} transmission distance" data-key="transmission" type="number" min="0.1" max="30" step="0.1" value="${f.transmission}"/><input aria-label="Filament ${i + 1} thickness" data-key="thickness" type="number" min="0.04" max="3" step="0.08" value="${f.thickness}"/><button data-up="${i}" title="Move down in stack">↑</button><button data-remove="${i}" title="Remove filament">×</button></div>`).join("")}</div><div class="button-row"><button data-action="add">+ Add filament</button><button data-action="save-library">Save library</button><button data-action="import-library">Import library</button></div><p class="hint">TD is the approximate depth at 99% opacity. Starter values are illustrative; enter measurements for your own filament. Arrow buttons change printing order.</p><div class="expected-image"><canvas id="expected-color" width="400" height="260"></canvas><div><b>Predicted color match</b><p id="stack-summary">Preview the selected photo with your filament stack.</p><button data-action="preview">Update color preview</button></div></div>` : `<div class="note">Experimental optical-density separation. Cyan controls red transmission, magenta controls green, yellow controls blue; white controls brightness. Calibration and physical testing are still required. Each channel has a one-layer minimum.</div>`}<div class="note">Exports use the current photo composition, width, height and resolution from the main editor. Color models are flat. 3MF colors identify parts; assign printer filaments in your slicer.</div><div class="dialog-actions"><span id="color-progress">Ready</span><button data-action="export" class="primary">Export ${mode === "chromaphane" ? "painting" : "CMYW"} kit (.zip)</button></div><input id="filament-file" type="file" accept=".json" hidden/>`;
    if (mode === "cmyw")
      dialog
        .querySelector(".dialog-actions")
        .insertAdjacentHTML(
          "beforebegin",
          `<div class="expected-image"><canvas id="expected-color" width="400" height="260"></canvas><div><b>Backlit color preview</b><p>Illustrative transmission from the quantized CMYW layers. Actual filament and lighting will change the result.</p><button data-action="preview">Update backlit preview</button></div></div>`,
        );
  }
  function renderPrediction(result) {
    const canvas = dialog.querySelector("#expected-color");
    if (!canvas) return;
    canvas.width = result.nx + 1;
    canvas.height = result.ny + 1;
    const ctx = canvas.getContext("2d"),
      pixels = ctx.createImageData(canvas.width, canvas.height);
    for (let y = 0; y <= result.ny; y++)
      for (let x = 0; x <= result.nx; x++) {
        const src = (y * canvas.width + x) * 3,
          dst = ((result.ny - y) * canvas.width + x) * 4;
        for (let c = 0; c < 3; c++)
          pixels.data[dst + c] =
            255 * Math.pow(result.expected[src + c], 1 / 2.2);
        pixels.data[dst + 3] = 255;
      }
    ctx.putImageData(pixels, 0, 0);
    if (result.palette)
      dialog.querySelector("#stack-summary").textContent =
        `${result.palette.candidates.length} attainable colors · ${result.palette.max.toFixed(2)} mm total · ${result.palette.swaps.length - 1} filament swaps`;
  }
  async function process(preview) {
    if (working) return;
    working = true;
    dialog
      .querySelectorAll("button,input,select")
      .forEach((e) => (e.disabled = true));
    try {
      const settings = { ...api.getSettings(), layer, colorDepth },
        spacing = preview
          ? Math.max(settings.width / 160, settings.height / 120)
          : settings.resolution,
        nx = Math.ceil(settings.width / spacing),
        ny = Math.ceil(settings.height / spacing);
      if (nx * ny > 250000)
        throw new Error(
          "Color export is limited to 250,000 cells. Increase the resolution spacing.",
        );
      const canvas = sampleImage(api.getImage(), settings, nx, ny, true),
        rgba = canvas.getContext("2d").getImageData(0, 0, nx + 1, ny + 1).data;
      dialog.querySelector("#color-progress").textContent = preview
        ? "Matching colors…"
        : "Generating full-resolution material meshes…";
      const result = await run({
        settings,
        nx,
        ny,
        rgba,
        filaments,
        algorithm,
        mode,
        preview,
      });
      if (result.expected) renderPrediction(result);
      if (!preview) {
        const files = unzipSync(result.bytes),
          target = await new Promise((resolve) => canvas.toBlob(resolve));
        files["target.png"] = new Uint8Array(await target.arrayBuffer());
        files["project.litho"] = strToU8(api.getProject());
        if (result.expected) {
          const expected = await new Promise((resolve) =>
            dialog.querySelector("#expected-color").toBlob(resolve),
          );
          files["predicted.png"] = new Uint8Array(await expected.arrayBuffer());
        }
        if (
          await api.saveFile(
            api.getName() + "-" + mode + ".zip",
            zipSync(files, { level: 3 }),
          )
        )
          api.toast(
            "Color kit generated. Check filament assignments and swap heights in your slicer.",
          );
      }
      dialog.querySelector("#color-progress").textContent = "Ready";
    } catch (error) {
      api.toast(error.message, true);
      dialog.querySelector("#color-progress").textContent = error.message;
    } finally {
      working = false;
      dialog
        .querySelectorAll("button,input,select")
        .forEach((e) => (e.disabled = e.dataset.mode === "chromaphane"));
    }
  }
  button.onclick = () => {
    draw();
    dialog.showModal();
    if (mode === "cmyw") process(true);
  };
  dialog.addEventListener("cancel", (e) => {
    if (working) e.preventDefault();
  });
  dialog.addEventListener("change", async (e) => {
    const el = e.target,
      row = el.closest("[data-index]");
    try {
      if (row && el.dataset.key) {
        filaments[Number(row.dataset.index)][el.dataset.key] = [
          "transmission",
          "thickness",
        ].includes(el.dataset.key)
          ? Number(el.value)
          : el.value;
      }
      if (el.id === "color-layer") layer = Number(el.value);
      if (el.id === "color-depth") colorDepth = Number(el.value);
      if (el.id === "color-algorithm") algorithm = el.value;
      if (mode === "cmyw" && ["color-layer", "color-depth"].includes(el.id))
        await process(true);
      if (el.id === "filament-file" && el.files[0]) {
        const parsed = JSON.parse(await el.files[0].text());
        paletteForStack(parsed, layer);
        filaments = parsed;
        draw();
      }
    } catch (error) {
      api.toast(error.message, true);
    }
  });
  dialog.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b || working) return;
    try {
      if (b.dataset.mode === "chromaphane") return;
      if (b.dataset.mode) {
        mode = b.dataset.mode;
        draw();
        if (mode === "cmyw") await process(true);
      }
      if (b.dataset.up !== undefined) {
        const i = Number(b.dataset.up);
        if (i > 0) {
          [filaments[i - 1], filaments[i]] = [filaments[i], filaments[i - 1]];
          draw();
        }
      }
      if (b.dataset.remove !== undefined && filaments.length > 2) {
        filaments.splice(Number(b.dataset.remove), 1);
        draw();
      }
      switch (b.dataset.action) {
        case "close":
          dialog.close();
          break;
        case "preview":
          await process(true);
          break;
        case "export":
          await process(false);
          break;
        case "add":
          if (filaments.length < 8) {
            filaments.push({
              name: "New filament",
              color: "#ffffff",
              transmission: 2,
              thickness: 0.64,
            });
            draw();
          }
          break;
        case "save-library":
          paletteForStack(filaments, layer);
          localStorage.setItem("filament-library", JSON.stringify(filaments));
          await api.saveFile(
            "filament-library.json",
            new TextEncoder().encode(JSON.stringify(filaments, null, 2)),
          );
          break;
        case "import-library":
          dialog.querySelector("#filament-file").click();
          break;
      }
    } catch (error) {
      api.toast(error.message, true);
    }
  });
  return {
    getState: () => ({ filaments, layer, colorDepth, algorithm }),
    setState: (s) => {
      if (!s) return;
      paletteForStack(s.filaments, s.layer);
      filaments = s.filaments;
      layer = s.layer;
      colorDepth = s.colorDepth;
      algorithm = s.algorithm;
    },
  };
}
