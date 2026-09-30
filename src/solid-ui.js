import { isSolid, solidSettings } from "./solid-settings.js";
export function solidControls(s, field) {
  let html = `<label class="field"><span>Panel structure</span><select data-setting="colorStructure"><option value="relief" ${s.colorStructure === "relief" ? "selected" : ""}>Variable-thickness relief</option><option value="solid" ${s.colorStructure === "solid" ? "selected" : ""}>Smooth solid panel · experimental</option><option value="dedicated" ${s.colorStructure === "dedicated" ? "selected" : ""}>Dedicated color layers · experimental</option></select></label>`;
  if (!isSolid(s)) return html;
  return (
    html +
    `<p class="hint">Flat panels and lightboxes only. Flat outer faces, no intended air gaps. Internal colors are matched to an estimated transmission profile. Print the calibration tile first.</p>${s.colorStructure === "dedicated" ? `${field("cyanLayers", "Cyan layer slots", 1, undefined, 1, "layers")}${field("magentaLayers", "Magenta layer slots", 1, undefined, 1, "layers")}${field("yellowLayers", "Yellow layer slots", 1, undefined, 1, "layers")}<p class="hint" id="dedicated-summary"></p><button id="dedicated-defaults" class="wide">Use 16 per color · 0.08 mm · 4.16 mm total</button>` : field("solidThickness", "Total panel thickness", s.layer * 5, undefined, s.layer)}${field("solidFront", "White viewing skin", s.layer, undefined, s.layer)}${field("solidRear", "White rear skin", s.layer, undefined, s.layer)}${field("solidFeature", "Minimum color feature", 0.0001, undefined, "any")}<p class="hint">Thicknesses must be exact layer multiples. More internal layers increase color-solving time and memory use. Feature size limits the internal color grid; the full photo is kept. For a 0.4 mm nozzle start at 0.4 mm features. Colors outside the profile’s range are approximated.</p><button id="small-solid" class="wide">Set small test panel · 40 × 30 mm</button><button id="solid-calibration" class="wide">Export 36 mm color calibration tile</button><details><summary>Transmission profile · advanced</summary><p class="hint">Uncalibrated estimates. JSON absorption rows are Cyan, Magenta, Yellow, White; each row is R,G,B absorption per mm (0–30). Prediction is relative to an all-white panel. Copy measured profiles here; no automatic camera calibration is performed.</p><textarea id="solid-profile" data-setting="solidProfile" aria-label="Transmission profile" rows="7" style="width:100%;box-sizing:border-box"></textarea></details>`
  );
}

export function dedicatedSummary(s) {
  try {
    const t = solidSettings(s).solidThickness;
    return `Automatic thickness: ${t.toFixed(3)} mm. ${s.cyanLayers}/${s.magentaLayers}/${s.yellowLayers} C/M/Y slots; ${(s.cyanLayers + 1) * (s.magentaLayers + 1) * (s.yellowLayers + 1)} material combinations. Each slot uses its assigned color plus white. First layer ${Math.min(s.solidRear, 2 * s.layer).toFixed(3)} mm, then ${s.layer} mm. Color and printing time require calibration.`;
  } catch (e) {
    return e.message;
  }
}
