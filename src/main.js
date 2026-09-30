import { isSolid, solidSettings } from "./solid-settings.js";
import { solidControls, dedicatedSummary } from "./solid-ui.js";
import { lightingParts } from "./lighting.js";
import { lightingPanel } from "./lighting-ui.js";
import { applyLightPreset } from "./lighting-settings.js";
import {
  supportDimensions,
  printParts,
  mergeMeshes,
  assembledPreview,
  makeCase,
  makeStand,
  supportNotes,
} from "./supports.js";
import { createIcons, icons } from "lucide";
import { zipSync, strToU8 } from "fflate";
import {
  defaults,
  shapes,
  validate,
  gridSize,
  buildMesh,
  binarySTL,
} from "./geometry.js";
import { threeMF } from "./three-mf.js";
import { loadImage, sampleImage, demoImage, backlitImage } from "./image.js";
import { Preview } from "./preview.js";
import { initAdvanced } from "./advanced.js";
import { initLibrary } from "./library.js";
import { initMounts } from "./mounts.js";
import { initPersistence } from "./persistence.js";
import { makeBoxKit } from "./box-kit.js";
import "./style.css";
import "./advanced.css";

const $ = (s) => document.querySelector(s),
  icon = (name) => `<i data-lucide="${name}"></i>`;
let settings = { ...defaults },
  image,
  imageSource,
  filename = "Alpine light · sample",
  revision = 0,
  timer,
  activeTab = "model",
  busy = false;
let photoLibrary, colorStudio, mountStudio;
const composedImage = () => photoLibrary?.getImage() || image;
const worker = new Worker(new URL("./mesh.worker.js", import.meta.url), {
    type: "module",
  }),
  jobs = new Map();
let nextJob = 0;
worker.onmessage = ({ data }) => {
  const job = jobs.get(data.id);
  if (job) {
    jobs.delete(data.id);
    data.error ? job.reject(new Error(data.error)) : job.resolve(data);
  }
};
worker.onerror = () => {
  for (const job of jobs.values())
    job.reject(new Error("Model worker failed. Restart the app."));
  jobs.clear();
};
function generate(
  s,
  preview = true,
  source = composedImage(),
  returnMesh = false,
) {
  validate(s);
  const { nx, ny } = gridSize(s, preview, source),
    pixels = sampleImage(source, s, nx, ny),
    id = ++nextJob;
  return new Promise((resolve, reject) => {
    jobs.set(id, { resolve, reject });
    worker.postMessage(
      {
        id,
        settings: s,
        pixels,
        rgba:
          s.colorMode === "paper"
            ? sampleImage(source, s, nx, ny, true)
                .getContext("2d")
                .getImageData(0, 0, nx + 1, ny + 1).data
            : null,
        nx,
        ny,
        export: returnMesh ? "mesh" : !preview,
      },
      [pixels.buffer],
    );
  });
}

$("#app").innerHTML = `
<header><div class="brand"><span class="brand-mark">${icon("layers-3")}</span><div>make my <b>lithophane</b><small>DESKTOP STUDIO</small></div></div><div class="project-title"><span class="dot"></span><input id="project-name" aria-label="Project name" value="Untitled project"/><span class="badge">LOCAL</span></div><div class="header-actions"><button id="open-project">${icon("folder-open")} Open</button><button id="save-project">${icon("save")} Save project</button><button class="primary" id="export-top">${icon("download")} Export model</button></div></header>
<div class="workspace"><aside class="left"><div class="section-heading"><span>YOUR PHOTO</span><span class="step">01</span></div><button class="photo-card" id="upload"><img id="photo-thumb" alt="Current source image"/><span>${icon("image-plus")} Change photo</span></button><div class="photo-caption"><span id="filename"></span><button id="reset-image" title="Reset photo adjustments">${icon("rotate-ccw")}</button></div><button class="upload-secondary" id="add-photo">${icon("upload")} Import photo</button><p class="hint">PNG, JPG or WebP · processed on your device</p><div class="section-heading spaced"><span>CHOOSE A SHAPE</span><span class="step">02</span></div><div class="shape-grid">${shapes.map(([id, label, glyph]) => `<button class="shape ${id === "flat" ? "selected" : ""}" data-shape="${id}">${icon(glyph)}<span>${label}</span></button>`).join("")}</div><div class="local-note">${icon("shield-check")}<div><b>Your memories stay yours.</b><br/>No uploads. No account. Works offline.</div></div><button id="guide" class="guide-button">${icon("book-open")} Printing & feature guide ${icon("arrow-up-right")}</button></aside>
<main><div class="canvas-bar"><div><span class="eyebrow">WORKSPACE</span><h1 id="shape-title">Flat panel</h1></div><div class="view-modes"><button data-view="solid" class="active">${icon("box")} Solid</button><button data-view="light">${icon("sun")} Backlit</button><button data-view="wire">${icon("grid-3x3")} Mesh</button></div></div><div id="viewport"><div class="preview-label"><span class="dot"></span> LIVE 3D PREVIEW <span id="preview-quality">Draft mesh</span></div><div class="viewport-tools"><button id="reset-view" title="Fit model">${icon("maximize")}</button><button id="front-view" title="Front view">${icon("scan-face")}</button><button id="grid-toggle" title="Toggle build grid">${icon("grid-2x2")}</button><button id="screenshot" title="Save preview image">${icon("camera")}</button></div><div class="canvas-hint">${icon("mouse")} Drag to orbit <span>·</span> Scroll to zoom <span>·</span> Right-drag to pan</div><div id="preview-error" role="alert" hidden></div><div id="busy-indicator" hidden>Generating model…</div></div><div class="model-info"><div><span>MODEL SIZE</span><strong id="model-size">—</strong></div><div><span>EST. SOLID PLA</span><strong id="model-weight">—</strong></div><div><span>PREVIEW TRIANGLES</span><strong id="model-triangles">—</strong></div><div class="quality-note">${icon("sparkles")} Full detail on export</div></div><div class="bottom-tip">${icon("lightbulb")} <span>A little light makes all the difference. Switch to <b>Backlit</b> to inspect the image.</span></div></main>
<aside class="right"><div class="settings-tabs"><button data-tab="model" class="active">Model</button><button data-tab="image">Image</button><button data-tab="print">Color & print</button><button data-tab="supports">Supports</button><button data-tab="photos">Photos</button></div><div id="settings-panel"></div><div id="tool-panels"></div><div class="export-section"><div class="export-summary"><span id="export-spacing">0.35 mm detail</span><span>STL · millimeters</span></div><button class="primary export-button" id="export">${icon("download")} Export STL ${icon("arrow-right")}</button><button id="export-3mf">Export 3MF model</button><button id="export-kit">Export project kit (.zip)</button><p>Includes model, settings and printing notes.</p></div></aside></div><footer><span><span class="dot"></span> <span id="status">Ready to create</span></span><span>MAKE MY LITHOPHANE <b>v0.8.0</b> <span class="separator">/</span> OFFLINE STUDIO</span></footer>
<input id="image-file" type="file" accept="image/png,image/jpeg,image/webp" hidden/><input id="project-file" type="file" accept=".litho,.json" hidden/><dialog id="guide-modal"><button id="close-guide" class="dialog-close">${icon("x")}</button><span class="eyebrow">FROM PHOTO TO PRINT</span><h2>A memory you can hold.</h2><p>Import a photo, choose a shape, adjust thickness, then export an STL in millimeters for your slicer. The preview uses a lighter mesh; exported detail follows your resolution setting.</p><h3>Starting points</h3><ul><li>White PLA, 0.12 mm layers, 100% infill, and slow outer walls are useful starting settings. Tune them for your printer.</li><li>Print flat panels upright with a brim for stability. Check supports for curved parts, hearts, and spheres in your slicer.</li><li>Test a small thickness calibration strip with your filament and light source before a full print.</li><li>Use a low-heat LED light source and leave space for ventilation.</li></ul><h3>What this version supports</h3><p>Flat and curved panels, open cylinders and tapered lamps, spheres with a bottom opening, procedural moon relief, hearts, threshold silhouettes, curved night-light panels, and light-box panels with a separate enclosure. Rotate, mirror, crop, adjust tone, add text, save projects, export STL and 1:1 color sheets.</p><h3>Limits & experimental features</h3><p>Backlit view is an illustration, not a calibrated light simulation. Moon relief is procedural, not a lunar map. Silhouettes can contain disconnected islands. Night-light panels have no hardware-specific clips. The color studio supports experimental CMYW material volumes. Filament painting is Work in progress and is paused until explicitly requested. Photo libraries support collages, panoramas, and batch panels. The hardware workshop produces separate generic rings, spoke adapters, stands and U-channel clips. Color accuracy and hardware fit require physical calibration. This is an independent app, not verified feature-for-feature parity with Lithophane Maker Desktop.</p><button id="calibration" class="primary">Export thickness calibration strip</button></dialog><div id="toast" role="status"></div>`;
const preview = new Preview($("#viewport"));
function refreshIcons() {
  createIcons({ icons, attrs: { "stroke-width": 1.7 } });
}
function field(key, label, min, max, step = 1, unit = "mm") {
  return `<label class="field"><span>${label}<em>${unit}</em></span><input data-setting="${key}" aria-label="${label}" type="number" min="${min}" ${max === undefined ? "" : `max="${max}"`} step="${step}" value="${settings[key]}"/></label>`;
}
function range(key, label, min, max, step = 1, unit = "") {
  return `<label class="range-field"><span>${label}<output id="value-${key}">${settings[key]}${unit}</output></span><input type="range" data-setting="${key}" aria-label="${label}" min="${min}" ${max === undefined ? "" : `max="${max}"`} step="${step}" value="${settings[key]}"/></label>`;
}
function check(key, label) {
  return `<label class="check"><input type="checkbox" data-setting="${key}" ${settings[key] ? "checked" : ""}/><span>${label}</span></label>`;
}
function renderSettings() {
  const round = ["cylinder", "lamp", "sphere", "moon"].includes(settings.shape),
    sphere = ["sphere", "moon"].includes(settings.shape);
  let html = "";
  if (activeTab === "model")
    html = `<div class="panel-title">Dimensions <span>01</span></div><div class="field-row">${field("width", round ? "Inner diameter" : "Width", 20, undefined)}${sphere ? "" : field("height", "Height", 20, undefined)}</div><p class="hint">${round ? "Diameter is measured at the inner base." : "Width follows the surface, including the border."}</p><div class="panel-title">Thickness <span>02</span></div><div class="field-row">${field("min", "Minimum", 0.4, 9.9, 0.1)}${field("max", "Maximum", 0.5, 10, 0.1)}</div><div class="thickness-scale"><span>Light areas</span><span>Dark areas</span></div><div class="gradient-scale"></div><div class="panel-title">Detail & finish <span>03</span></div>${`<label class="field"><span>Resolution</span><select data-setting="resolutionMode"><option value="image" ${settings.resolutionMode === "image" ? "selected" : ""}>Match image pixels (native)</option><option value="spacing" ${settings.resolutionMode === "spacing" ? "selected" : ""}>Custom spacing</option></select></label>`}${settings.resolutionMode === "spacing" ? field("resolution", "Sample spacing", 0.0001, undefined, "any", "mm / sample") : ""}<p class="hint">Native mode uses the photo pixel dimensions. Custom spacing controls mesh detail in millimeters.</p>${!round ? range("border", "Solid border", 0, 15, 0.5, " mm") : ""}${["curved", "nightlight"].includes(settings.shape) ? range("angle", "Curve angle", 10, 300, 1, "°") : ""}${settings.shape === "lamp" ? range("taper", "Top / base diameter", 0.3, 1.5, 0.05) : ""}${sphere ? field("opening", "Bottom opening diameter", 5, settings.width - 8, 1) : ""}${settings.shape === "moon" ? range("moon", "Procedural lunar texture", 0, 1, 0.05) : ""}${settings.shape === "silhouette" ? range("threshold", "Keep tones darker than", 0.05, 1, 0.01) : ""}${settings.shape === "box" ? field("boxDepth", "Enclosure depth", 15, 100, 1) : ""}<div class="note">${icon("info")}<span>${sphere ? "Sphere has a closed top and an open bottom for an LED." : settings.shape === "nightlight" ? "Curved panel only. Hardware-specific clips are not included." : settings.shape === "box" ? "Auto support includes a fitted open-front case with an adjustable clearance." : settings.shape === "silhouette" ? "White regions are removed. Check disconnected islands in your slicer." : "Dark pixels create thicker material; light pixels let more light through."}</span></div>`;
  if (activeTab === "model" && settings.shape === "silhouette")
    html += check("largestIsland", "Keep only the largest connected shape");
  if (activeTab === "image")
    html = `<div class="panel-title">Compose your photo</div><div class="button-row"><button id="rotate-photo">${icon("rotate-cw")} Rotate 90°</button><button id="auto-tone">${icon("wand-sparkles")} Auto tone</button></div>${check("flip", "Mirror horizontally")}<label class="field"><span>Photo fit</span><select data-setting="fit"><option value="cover" ${settings.fit === "cover" ? "selected" : ""}>Fill & crop</option><option value="contain" ${settings.fit === "contain" ? "selected" : ""}>Fit whole image</option></select></label>${range("zoom", "Zoom", 1, 4, 0.05, "×")}${range("panX", "Horizontal position", -100, 100)}${range("panY", "Vertical position", -100, 100)}<div class="panel-title">Light & tone</div>${range("brightness", "Brightness", -100, 100)}${range("contrast", "Contrast", -90, 100)}${range("gamma", "Gamma", 0.2, 3, 0.05)}${check("invert", "Invert light and dark")}<div class="panel-title">Personalize</div><label class="field"><span>Caption</span><input data-setting="text" maxlength="80" value="" placeholder="Add a name, date or memory"/></label>${range("textSize", "Text size", 3, 30, 1, " mm")}`;
  if (activeTab === "print")
    html = `<div class="panel-title">Color & printing</div><label class="field"><span>Color mode</span><select data-setting="colorMode"><option value="mono" ${settings.colorMode === "mono" ? "selected" : ""}>White filament</option><option value="paper" ${settings.colorMode === "paper" ? "selected" : ""}>Color paper backing</option><option value="cmyw" ${settings.colorMode === "cmyw" ? "selected" : ""}>CMYW color lithophane</option><option value="painting" disabled>Filament painting · Work in progress</option></select></label><p class="hint">Changes update the displayed model automatically. Backlit shows the predicted image.</p>${settings.colorMode === "cmyw" ? `${field("layer", "Layer height", 0.04, 0.3, 0.01)}${solidControls(settings, field)}${isSolid(settings) ? "" : field("colorDepth", "Maximum color depth", 0.04, 1.6, 0.04)}<p class="hint">${isSolid(settings) ? "Experimental smooth color: flat panels and lightboxes only. Check slicer layer and first-layer settings manually." : "Experimental CMYW transmission. Material export supports the six priority shapes. Color geometry has no border or hanging holes."}</p><button id="export-color" class="primary wide">Export CMYW kit</button>` : settings.colorMode === "paper" ? `<button id="color-sheet" class="wide">Export 1:1 color sheet (SVG)</button><p class="hint">Printable backing sheets support flat panels.</p>` : ""}<div class="panel-title">Filament thickness</div><div class="preset-list"><button data-preset="standard">White PLA</button><button data-preset="thin">Bright LED / thin panel</button><button data-preset="thick">High contrast</button></div><button id="calibration-panel" class="wide">Export calibration strip</button><p class="hint">Filament painting remains Work in progress.</p>`;
  if (activeTab === "image")
    html += `<div class="panel-title">Color adjustments</div>${range("hue", "Hue shift", -180, 180, 1, "°")}${range("saturation", "Saturation", -100, 100, 1)}`;
  if (activeTab === "model" && settings.shape === "lamp")
    html += `<div class="panel-title">Wavy shade</div>${field("waves", "Waves around perimeter", 0, 24, 1, "waves")}${field("waveDepth", "Wave depth", 0, 5, 0.1)}`;
  if (
    activeTab === "model" &&
    ["flat", "curved", "box", "nightlight"].includes(settings.shape)
  )
    html += `<div class="panel-title">Hanging holes</div>${check("holes", "Two holes in the top border")}${field("holeDiameter", "Hole diameter", 1, 10, 0.1)}<p class="hint">Set the border at least 2 mm wider than the holes. Preview resolution may simplify small openings.</p>`;
  if (activeTab === "supports")
    html +=
      lightingPanel(settings, field) +
      `<div class="panel-title">Matching support</div><label class="field"><span>Include with exports</span><select data-setting="support">${["auto", "none", "stand", "case"].map((v) => `<option value="${v}" ${settings.support === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>${field("fitClearance", "Fit clearance / side", 0.05, 2, 0.05)}${field("supportWall", "Support wall", 1, 6, 0.1)}${field("printGap", "Print spacing", 2, 50, 1)}${settings.shape !== "box" ? field("boxDepth", "Case depth", 15, 100, 1) : ""}<p class="hint" id="support-size">Support follows panel dimensions automatically.</p>`;
  $("#settings-panel").innerHTML = html;
  if (
    activeTab === "model" &&
    settings.colorMode === "cmyw" &&
    isSolid(settings)
  ) {
    for (const key of [
      "min",
      "max",
      "resolution",
      "resolutionMode",
      "border",
      "holes",
      "holeDiameter",
    ]) {
      const el = document.querySelector(`[data-setting="${key}"]`);
      if (el) el.disabled = true;
    }
    $("#settings-panel").insertAdjacentHTML(
      "afterbegin",
      '<p class="hint">Smooth solid mode uses total thickness, white skins and minimum color feature in Color & print. Relief thickness, border and sampling controls do not apply.</p>',
    );
  }
  if ($("#dedicated-summary"))
    $("#dedicated-summary").textContent = dedicatedSummary(settings);
  if ($("#solid-profile")) $("#solid-profile").value = settings.solidProfile;
  if (activeTab === "image") $('[data-setting="text"]').value = settings.text;
  mountStudio?.show(activeTab === "supports");
  if (activeTab === "supports") schedule();
  photoLibrary?.show(activeTab === "photos");
  $("#export").innerHTML =
    settings.colorMode === "cmyw"
      ? "Export CMYW kit"
      : `${icon("download")} Export STL`;
  refreshIcons();
}
function openPanel(tab) {
  activeTab = tab;
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  renderSettings();
}
function toast(message, error = false) {
  const t = $("#toast");
  t.textContent = message;
  t.classList.toggle("error", error);
  t.classList.add("visible");
  clearTimeout(t.hide);
  t.hide = setTimeout(() => t.classList.remove("visible"), 5500);
}
function status(message) {
  $("#status").textContent = message;
}
function schedule(reset = false) {
  const current = ++revision;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      status("Updating preview…");
      const snapshot = { ...settings },
        sourceImage = composedImage();
      const result =
        snapshot.colorMode === "cmyw"
          ? await colorStudio.preview(snapshot, sourceImage)
          : await generate(snapshot, true, sourceImage);

      if (current !== revision) return;
      preview.update(
        mountStudio.compose(
          assembledPreview(result.mesh, result.fitted || snapshot),
        ),
        reset,
        result.texture || backlitImage(sourceImage, snapshot),
      );
      $("#viewport").dataset.revision = String(current);
      $("#viewport").dataset.colorMode = snapshot.colorMode;
      const d = supportDimensions(result.fitted || snapshot),
        summary = $("#support-size");
      if (summary)
        summary.textContent =
          d.type === "lighting"
            ? "Lighting housing and fittings follow the panel dimensions. Export kit for separate parts."
            : d.type === "none"
              ? "Panel only for this shape."
              : d.type === "case"
                ? `Case: ${d.width.toFixed(1)}  /  ${d.height.toFixed(1)}  /  ${d.depth.toFixed(1)} mm`
                : `Stand: ${d.length.toFixed(1)} mm along panel  /  ${d.slot.toFixed(2)} mm slot  /  ${d.insertion.toFixed(1)} mm insertion`;

      const st = result.stats;
      $("#model-size").textContent =
        st.dimensions.map((x) => x.toFixed(1)).join(" × ") + " mm";
      $("#model-weight").textContent = "≈ " + st.grams.toFixed(1) + " g";
      $("#model-triangles").textContent = st.triangles.toLocaleString();
      const source = composedImage(),
        q = result.previewGrid || gridSize(settings, true, source);
      $("#preview-quality").textContent =
        `Image ${source.width} x ${source.height} px / mesh ${q.nx + 1} x ${q.ny + 1}`;
      try {
        const full = gridSize(settings, false, source);
        $("#export-spacing").textContent =
          `Export: ${full.nx + 1} x ${full.ny + 1} samples`;
      } catch (e) {
        $("#export-spacing").textContent = e.message;
      }

      if (snapshot.colorMode === "cmyw" && isSolid(snapshot)) {
        const grid = `${Math.max(1, Math.floor(snapshot.width / snapshot.solidFeature))} x ${Math.max(1, Math.floor(snapshot.height / snapshot.solidFeature))}`;
        $("#export-spacing").textContent =
          `Solid color: ${grid} cells · ${solidSettings(snapshot).solidThickness} mm`;
        $("#preview-quality").textContent =
          `Image ${source.width} x ${source.height} px / internal color ${grid} cells`;
      }
      $("#preview-error").hidden = true;
      if ($("#viewport").dataset.previewState === "error")
        $("#toast").classList.remove("visible");
      $("#viewport").dataset.previewState = "ready";
      $("#viewport").dataset.structure = snapshot.colorStructure;
      status("Preview ready · all processing local");
    } catch (e) {
      if (current === revision) {
        $("#viewport").dataset.previewState = "error";
        $("#preview-error").textContent =
          "Preview unavailable for these settings: " + e.message;
        $("#preview-error").hidden = false;
        for (const id of ["model-size", "model-weight", "model-triangles"])
          $("#" + id).textContent = "—";
        $("#preview-quality").textContent = "Preview needs valid settings";
        $("#export-spacing").textContent = "Settings need attention";
        status("Settings need attention");
        toast(e.message, true);
      }
    }
  }, 180);
}
async function saveFile(name, bytes) {
  if (window.desktop) return window.desktop.saveFile(name, bytes);
  const blob = new Blob([bytes]),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}
function projectName() {
  return ($("#project-name").value.trim() || "Untitled project").replace(
    /[<>:"/\\|?*\x00-\x1f]/g,
    "_",
  );
}
function projectData() {
  return JSON.stringify(
    {
      format: "make-my-lithophane",
      version: 1,
      name: $("#project-name").value,
      filename,
      settings,
      image: imageSource,
      library: photoLibrary?.getState(),
      colorStudio: colorStudio?.getState(),
      mountStudio: mountStudio?.getState(),
    },
    null,
    2,
  );
}
async function withBusy(action) {
  if (busy) return;
  busy = true;
  $("header").inert = true;
  $(".workspace").inert = true;
  $("#busy-indicator").hidden = false;
  document
    .querySelectorAll(".export-button,#export-top,#export-kit")
    .forEach((b) => (b.disabled = true));
  try {
    await action();
  } catch (e) {
    toast(e.message, true);
    status("Action failed");
  } finally {
    busy = false;
    $("header").inert = false;
    $(".workspace").inert = false;
    $("#busy-indicator").hidden = true;
    document
      .querySelectorAll(".export-button,#export-top,#export-kit")
      .forEach((b) => (b.disabled = false));
  }
}
function notes(s, stats) {
  return `MAKE MY LITHOPHANE\nDimensions: millimeters. STL has no embedded units.\nShape: ${s.shape}\nResolution: ${s.resolutionMode === "image" ? "Native photo pixels" : s.resolution + " mm"}\nWall thickness: ${s.min}–${s.max} mm\nMesh triangles: ${stats.triangles}\nApproximate solid PLA mass: ${stats.grams.toFixed(1)} g (1.24 g/cm³)\n\nInspect orientation, dimensions, supports and disconnected pieces in your slicer. White PLA, 0.12 mm layers and 100% infill are starting points, not printer-specific validated settings. Upright panels usually need a brim. Spheres and curved shapes may need supports. Use low-heat LEDs.\n\n${s.colorMode === "painting" ? `Experimental grayscale painting: print flat with image facing up. Layer height ${s.layer} mm. Suggested band heights (round to your slicer layers): ${Array.from({ length: s.levels }, (_, i) => (Math.round((s.min + (i * (s.max - s.min)) / (s.levels - 1)) / s.layer) * s.layer).toFixed(2)).join(", ")} mm. Assign dark-to-light grayscale filaments from lowest to highest band. This is not calibrated color matching.\n` : ""}\nBacklit preview is illustrative. Moon relief is procedural. No hardware-specific mounts.\n`;
}
async function exportModel(kit = false) {
  await withBusy(async () => {
    if (settings.colorMode === "cmyw") {
      await colorStudio.export();
      status("Export complete");
      return;
    }
    status("Generating full-resolution STL…");
    const s = { ...settings },
      result = await generate(s, false, composedImage(), true);
    const parts = mountStudio.printParts(printParts(result.mesh, s));
    if (!kit) {
      if (
        await saveFile(
          projectName() + ".stl",
          binarySTL(mergeMeshes(parts.map((p) => p.mesh))),
        )
      )
        toast("STL saved. Open it in your slicer to prepare the print.");
    } else {
      const files = {
        "lithophane.stl": binarySTL(result.mesh),
        "print-layout.3mf": threeMF(parts),
        "project.litho": strToU8(projectData()),
        "PRINTING.txt": strToU8(
          notes(s, result.stats) + "\n" + supportNotes(s),
        ),
      };
      for (const p of lightingParts(s))
        files[p.name + ".stl"] = binarySTL(p.mesh);
      if (mountStudio.getMesh())
        files["hardware.stl"] = binarySTL(mountStudio.getMesh());
      if (s.colorMode === "paper" && ["flat", "box"].includes(s.shape))
        files["color-backing.svg"] = strToU8(colorSheet());
      if (supportDimensions(s).type === "case")
        files["enclosure.stl"] = binarySTL(makeCase(s));
      if (supportDimensions(s).type === "stand")
        files["stand.stl"] = binarySTL(makeStand(s));
      if (
        await saveFile(projectName() + "-kit.zip", zipSync(files, { level: 3 }))
      )
        toast("Project kit saved.");
    }
    status("Export complete");
  });
}
function colorSheet() {
  if (!["flat", "box"].includes(settings.shape))
    throw new Error(
      "Color paper sheets currently support flat panels and light boxes.",
    );
  const canvas = sampleImage(
    composedImage(),
    settings,
    Math.round((settings.width / 25.4) * 300),
    Math.round((settings.height / 25.4) * 300),
    true,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${settings.width}mm" height="${settings.height}mm" viewBox="0 0 ${settings.width} ${settings.height}"><image width="${settings.width}" height="${settings.height}" href="${canvas.toDataURL("image/png")}" preserveAspectRatio="none"/></svg>`;
}
async function calibration() {
  await withBusy(async () => {
    const { buildMesh, binarySTL } = await import("./geometry.js");
    const s = { ...defaults, width: 100, height: 25, border: 0 },
      nx = 100,
      ny = 25,
      pixels = new Float32Array((nx + 1) * (ny + 1));
    for (let y = 0; y <= ny; y++)
      for (let x = 0; x <= nx; x++)
        pixels[y * (nx + 1) + x] = 1 - Math.min(9, Math.floor(x / 10)) / 9;
    const bytes = binarySTL(buildMesh(s, pixels, nx, ny));
    if (await saveFile("calibration-0.8-to-3.2mm.stl", bytes))
      toast("10 steps from 0.8 mm to 3.2 mm, left to right.");
  });
}
async function setPhoto(src, name) {
  const loaded = await loadImage(src);
  image = loaded;
  imageSource = src;
  filename = name;
  $("#photo-thumb").src = src;
  $("#filename").textContent = name;
  $("#filename").title = name;
  schedule(true);
}
async function importPhoto(file) {
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  const src = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Could not read photo."));
    r.readAsDataURL(file);
  });
  photoLibrary?.resetLayout();
  await setPhoto(src, file.name);
  toast("Photo loaded locally.");
}
document.addEventListener("input", (event) => {
  const el = event.target,
    k = el.dataset.setting;
  if (!k) return;
  settings[k] =
    el.type === "checkbox"
      ? el.checked
      : typeof defaults[k] === "number"
        ? Number(el.value)
        : el.value;
  if ($("#dedicated-summary"))
    $("#dedicated-summary").textContent = dedicatedSummary(settings);
  const out = $("#value-" + k);
  if (out) out.textContent = el.value;
  if (k === "colorMode" && settings.colorMode !== "mono") {
    preview.setMode("light");
    document
      .querySelectorAll("[data-view]")
      .forEach((b) => b.classList.toggle("active", b.dataset.view === "light"));
  }
  if (
    k === "lightingSetup" ||
    (k === "boardCount" && settings.lightingSetup === "modular")
  )
    applyLightPreset(settings, settings.lightingSetup);
  schedule(k === "width" || k === "height");
});
document.addEventListener("change", (event) => {
  if (
    [
      "colorMode",
      "colorStructure",
      "support",
      "resolutionMode",
      "lightingSetup",
      "boardCount",
      "lightKind",
      "diffuser",
      "lightMount",
    ].includes(event.target.dataset.setting)
  )
    renderSettings();
});
document.addEventListener("click", async (event) => {
  const b = event.target.closest("button");
  if (!b) return;
  try {
    if (b.id === "dedicated-defaults") {
      Object.assign(settings, {
        layer: 0.08,
        solidFront: 0.16,
        solidRear: 0.16,
        cyanLayers: 16,
        magentaLayers: 16,
        yellowLayers: 16,
      });
      renderSettings();
      schedule();
      return;
    }
    if (b.id === "fit-light") {
      settings.width =
        settings.lightingSetup === "fixed" ? 144 : settings.boardWidth + 10;
      settings.height =
        settings.lightingSetup === "fixed" ? 108 : settings.boardHeight + 12;
      renderSettings();
      schedule();
      return;
    }
    if (b.dataset.shape) {
      settings.shape = b.dataset.shape;
      document
        .querySelectorAll(".shape")
        .forEach((x) => x.classList.toggle("selected", x === b));
      $("#shape-title").textContent = shapes.find(
        (x) => x[0] === settings.shape,
      )[1];
      renderSettings();
      schedule(true);
    }
    if (b.dataset.tab) {
      activeTab = b.dataset.tab;
      document
        .querySelectorAll("[data-tab]")
        .forEach((x) => x.classList.toggle("active", x === b));
      renderSettings();
    }
    if (b.dataset.view) {
      preview.setMode(b.dataset.view);
      document
        .querySelectorAll("[data-view]")
        .forEach((x) => x.classList.toggle("active", x === b));
    }
    if (b.dataset.preset) {
      const values = {
        standard: [0.8, 3.2],
        thin: [0.6, 2.4],
        thick: [0.8, 4],
      }[b.dataset.preset];
      [settings.min, settings.max] = values;
      renderSettings();
      schedule();
      toast("Filament thickness preset applied.");
    }
    switch (b.id) {
      case "export-3mf":
        await withBusy(async () => {
          status("Generating 3MF export…");
          if (settings.colorMode === "cmyw") {
            await colorStudio.export("3mf");
            status("Export complete");
            return;
          }
          const result = await generate(
            { ...settings },
            false,
            composedImage(),
            true,
          );
          if (
            await saveFile(
              projectName() + ".3mf",
              threeMF(
                mountStudio.printParts(printParts(result.mesh, settings)),
                projectName(),
              ),
            )
          )
            toast("3MF model saved in millimeters.");
        });
        break;
      case "small-solid":
        settings.width = 40;
        settings.height = 30;
        settings.shape = "flat";
        document
          .querySelectorAll(".shape")
          .forEach((x) =>
            x.classList.toggle("selected", x.dataset.shape === "flat"),
          );
        $("#shape-title").textContent = "Flat panel";
        renderSettings();
        schedule(true);
        break;
      case "solid-calibration":
        await withBusy(async () => {
          status("Generating color calibration tile…");
          await colorStudio.calibration();
          status("Export complete");
        });
        break;
      case "export-color":
        await withBusy(async () => {
          await colorStudio.export();
          status("Export complete");
        });
        break;
      case "upload":
      case "add-photo":
        $("#image-file").click();
        break;
      case "export":
      case "export-top":
        await exportModel();
        break;
      case "export-kit":
        await exportModel(true);
        break;
      case "save-project":
        if (await saveFile(projectName() + ".litho", strToU8(projectData())))
          toast("Project saved with its photo and settings.");
        break;
      case "open-project":
        $("#project-file").click();
        break;
      case "rotate-photo":
        settings.rotation = (settings.rotation + 90) % 360;
        schedule();
        break;
      case "reset-image":
        for (const k of [
          "brightness",
          "contrast",
          "gamma",
          "invert",
          "flip",
          "rotation",
          "zoom",
          "panX",
          "panY",
          "fit",
          "text",
          "hue",
          "saturation",
        ])
          settings[k] = defaults[k];
        renderSettings();
        schedule();
        break;
      case "auto-tone": {
        const p = sampleImage(
          image,
          { ...settings, brightness: 0, contrast: 0, gamma: 1, invert: false },
          100,
          100,
        );
        const avg = p.reduce((a, x) => a + x, 0) / p.length;
        settings.brightness = Math.round((0.5 - avg) * 100);
        settings.contrast = 15;
        renderSettings();
        schedule();
        break;
      }
      case "reset-view":
        preview.reset();
        break;
      case "front-view":
        preview.front();
        break;
      case "grid-toggle":
        preview.grid.visible = !preview.grid.visible;
        break;
      case "screenshot": {
        const blob = await new Promise((r) =>
          preview.renderer.domElement.toBlob(r),
        );
        if (blob)
          await saveFile(
            projectName() + "-preview.png",
            new Uint8Array(await blob.arrayBuffer()),
          );
        break;
      }
      case "color-sheet":
        if (await saveFile(projectName() + "-color.svg", strToU8(colorSheet())))
          toast("Color sheet saved at 1:1 scale.");
        break;
      case "guide":
        $("#guide-modal").showModal();
        break;
      case "close-guide":
        $("#guide-modal").close();
        break;
      case "calibration":
      case "calibration-panel":
        await calibration();
        break;
    }
  } catch (e) {
    toast(e.message, true);
  }
});
$("#image-file").onchange = async (e) => {
  try {
    await importPhoto(e.target.files[0]);
  } catch (err) {
    toast(err.message, true);
  }
  e.target.value = "";
};
async function restoreProject(p) {
  if (
    p.format !== "make-my-lithophane" ||
    p.version !== 1 ||
    typeof p.image !== "string" ||
    !/^data:image\/(png|jpeg|webp);base64,/.test(p.image)
  )
    throw new Error("This is not a supported .litho project.");
  const next = { ...defaults };
  for (const k in defaults)
    if (k in p.settings) {
      if (typeof p.settings[k] !== typeof defaults[k])
        throw new Error("Invalid project settings.");
      next[k] = p.settings[k];
    }
  if (next.colorMode === "painting") next.colorMode = "mono";
  if (!("colorDepth" in p.settings) && p.colorStudio) {
    next.layer = p.colorStudio.layer;
    next.colorDepth = p.colorStudio.colorDepth;
  }
  validate(next);
  await photoLibrary.setState(p.library);
  colorStudio.setState(p.colorStudio);
  mountStudio.setState(p.mountStudio);
  const decoded = await loadImage(p.image);
  settings = next;
  image = decoded;
  await setPhoto(p.image, String(p.filename || "Project photo"));
  $("#project-name").value = String(p.name || "Untitled project");
  document
    .querySelectorAll(".shape")
    .forEach((b) =>
      b.classList.toggle("selected", b.dataset.shape === settings.shape),
    );
  $("#shape-title").textContent = shapes.find(
    (x) => x[0] === settings.shape,
  )[1];
  renderSettings();
  toast("Project restored.");
}
$("#project-file").onchange = async (e) => {
  try {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 120 * 1024 * 1024) throw new Error("Project exceeds 120 MB.");
    await restoreProject(JSON.parse(await f.text()));
  } catch (err) {
    toast(err.message, true);
  }
  e.target.value = "";
};
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", async (e) => {
  e.preventDefault();
  try {
    await importPhoto(e.dataTransfer.files[0]);
  } catch (err) {
    toast(err.message, true);
  }
});
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    $("#save-project").click();
  }
});
photoLibrary = initLibrary({
  open: () => openPanel("photos"),
  getSettings: () => settings,
  currentImage: () => image,
  currentSource: () => imageSource,
  currentName: () => filename,
  setPhoto,
  changed: () => schedule(),
  toast,
  box: async (photos) =>
    withBusy(async () => {
      if (settings.colorMode === "cmyw")
        throw new Error(
          "Four-sided boxes support White filament and Color paper modes. Use the CMYW kit for the current composition.",
        );
      const bytes = await makeBoxKit(photos, { ...settings }, generate, status);
      if (await saveFile(projectName() + "-four-sided-box.zip", bytes))
        toast("Four-sided light box kit saved.");
      status("Box kit complete");
    }),
  batch: async (photos) =>
    withBusy(async () => {
      if (settings.colorMode === "cmyw")
        throw new Error(
          "Individual photo batch export supports White filament and Color paper modes. Use the CMYW kit for the current composition.",
        );
      const s = { ...settings, shape: "flat" },
        files = {};
      let total = 0;
      for (let i = 0; i < photos.length; i++) {
        status(`Generating panel ${i + 1} of ${photos.length}…`);
        const result = await generate(s, false, photos[i].image, true);
        const bytes = binarySTL(
          mergeMeshes(printParts(result.mesh, s).map((p) => p.mesh)),
        );
        total += bytes.length;
        if (total > 300 * 1024 * 1024)
          throw new Error(
            "Batch exceeds 300 MB. Use fewer photos or increase spacing.",
          );
        files[`panel-${i + 1}.stl`] = bytes;
      }
      files["project.litho"] = strToU8(projectData());
      if (
        await saveFile(
          projectName() + "-panels.zip",
          zipSync(files, { level: 3 }),
        )
      )
        toast("Individual photo panels exported.");
      status("Batch export complete");
    }),
});
colorStudio = initAdvanced({
  getHardware: () => {
    const mesh = mountStudio.getMesh();
    return mesh;
  },
  getSettings: () => settings,
  getImage: composedImage,
  getName: projectName,
  getProject: projectData,
  saveFile,
  toast,
});
const colorShortcut = document.createElement("button");
colorShortcut.id = "color-studio-open";
colorShortcut.className = "guide-button";
colorShortcut.onclick = () => openPanel("print");
colorShortcut.textContent = "Color & print →";
document.querySelector(".local-note").before(colorShortcut);
mountStudio = initMounts({
  getSettings: () => settings,
  open: () => openPanel("supports"),
  changed: () => schedule(),
  saveFile,
  toast,
});
renderSettings();
refreshIcons();
await setPhoto(demoImage(), filename);
initPersistence({ serialize: projectData, restore: restoreProject, toast });
