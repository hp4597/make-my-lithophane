export function lightingPanel(s, field) {
  const select = (key, label, options) =>
    `<label class="field"><span>${label}</span><select data-setting="${key}">${options.map(([v, n]) => `<option value="${v}" ${String(s[key]) === String(v) ? "selected" : ""}>${n}</option>`).join("")}</select></label>`;
  const check = (key, label) =>
    `<label class="field"><span><input type="checkbox" data-setting="${key}" ${s[key] ? "checked" : ""}> ${label}</span></label>`;
  let html = `<div class="panel-title">Lighting & enclosure</div>${select(
    "lightingSetup",
    "Setup",
    [
      ["none", "No lighting enclosure"],
      ["modular", "Modular board / 3-size frame"],
      ["fixed", "Fixed backlight board frame"],
      ["strip", "LED-strip lightbox"],
      ["custom", "Custom light attachment"],
    ],
  )}<p class="hint">Works with mono and CMYW. Flat, curved, cylinder, lamp shade, night light and lightbox are the priority shapes.</p>`;
  if (s.lightingSetup === "none") return html;
  html += `<p class="hint">Lighting replaces the matching stand/case below. All housing parts update live and are included in exports.</p>`;
  if (s.lightingSetup === "modular")
    html += select("boardCount", "48 × 144 mm modules", [
      [2, "2 modules · 96 × 144"],
      [3, "3 modules · 144 × 144"],
      [4, "4 modules · 192 × 144"],
    ]);
  html += select("lightKind", "Light attachment", [
    ["board", "Rigid LED board (flat shapes)"],
    ["strip", "Flexible LED strip"],
    ["puck", "Round LED puck"],
    ["socket", "Measured socket collar"],
  ]);
  if (s.lightKind === "board")
    html +=
      field("boardWidth", "PCB width", 10, 500) +
      field("boardHeight", "PCB height", 10, 500) +
      field("boardThickness", "PCB thickness", 0.5, 10, 0.1) +
      `<button id="fit-light" class="wide">Fit panel to board preset</button><p class="hint">Modular PCB dimensions: Bambu kit drawing. Fixed PCB: 156 × 120 mm, lit area 144 × 108 mm. Fixed thickness and projection are editable estimates. Frames are our adjustable designs; test fit before printing a full set.</p>`;
  if (s.lightKind === "strip")
    html += field("stripWidth", "LED strip width", 3, 20, 0.5);
  if (
    ["puck", "strip"].includes(s.lightKind) &&
    (["cylinder", "lamp"].includes(s.shape) || s.lightKind === "puck")
  )
    html += field(
      "lightDiameter",
      s.lightKind === "strip" ? "Strip core diameter" : "LED puck diameter",
      10,
      180,
      0.5,
    );
  if (s.lightKind === "socket")
    html += field("socketDiameter", "Socket opening diameter", 5, 100, 0.5);
  if (["puck", "socket"].includes(s.lightKind))
    html += field("lightHeight", "Recess / collar height", 2, 40, 0.5);
  html +=
    (!["cylinder", "lamp"].includes(s.shape)
      ? field("lightProjection", "Light projection from rear", 1, 30, 0.1) +
        field("lightGap", "Light-to-panel spacing", 8, 100, 0.5)
      : "") +
    field("retainerLip", "Panel retaining lip", 1, 10, 0.5) +
    field("wireWidth", "Cable opening width", 2, 20, 0.5) +
    (!["cylinder", "lamp"].includes(s.shape)
      ? field("wireHeight", "Cable notch height", 2, 15, 0.5)
      : "") +
    field("ventCount", "Vent count", 0, 10, 1) +
    field("ventWidth", "Vent width", 1, 8, 0.5) +
    (!["flat", "box"].includes(s.shape)
      ? check("topCap", "Include top retainer / cap")
      : "");
  if (!["cylinder", "lamp"].includes(s.shape))
    html +=
      select("lightMount", "Rear attachment", [
        ["adhesive", "Adhesive / PCB edge trays"],
        ["screws", "Custom four-hole screw pattern"],
      ]) +
      (s.lightMount === "screws"
        ? field("mountHole", "Screw hole diameter", 2, 6, 0.1) +
          field("mountSpacingX", "Hole spacing horizontal", 10, 450) +
          field("mountSpacingY", "Hole spacing vertical", 10, 450)
        : "");
  html +=
    check("diffuser", "Include separate diffuser") +
    (s.diffuser
      ? field("diffuserThickness", "Diffuser thickness", 0.4, 3, 0.1) +
        field("diffuserGap", "Diffuser distance from panel", 2, 30, 0.5)
      : "");
  if (!["cylinder", "lamp"].includes(s.shape))
    html +=
      check("enclosureStand", "Include matching enclosure feet") +
      field("footExtension", "Foot extension front / rear", 3, 40, 1);
  return (
    html +
    `<p class="hint">Curved panels use flexible strips. Round shapes use a strip core, puck recess or socket collar. Assemble separate parts with suitable adhesive or measured hardware. Physical fit and thermal performance require testing.</p>`
  );
}
