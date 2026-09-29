import { bounds, transform, mergeMeshes } from "./supports.js";
import { Shape, Path, ExtrudeGeometry } from "three";
import { binarySTL } from "./geometry.js";
import { threeMF } from "./three-mf.js";
import { zipSync, strToU8 } from "fflate";
function polygon(points) {
  const s = new Shape();
  s.moveTo(...points[0]);
  for (const p of points.slice(1)) s.lineTo(...p);
  s.closePath();
  return s;
}
function circle(radius) {
  const s = new Shape();
  s.absarc(0, 0, radius, 0, Math.PI * 2, false);
  return s;
}
function hole(radius) {
  const h = new Path();
  h.absarc(0, 0, radius, 0, Math.PI * 2, true);
  return h;
}
export function extrude(shape, depth) {
  const g = new ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 64,
      steps: 1,
    }),
    p = g.attributes.position.array,
    positions = [],
    indices = [],
    map = new Map();
  for (let i = 0; i < p.length; i += 3) {
    const key = [p[i], p[i + 1], p[i + 2]]
      .map((x) => Math.round(x * 100000))
      .join(",");
    let id = map.get(key);
    if (id === undefined) {
      id = positions.length / 3;
      map.set(key, id);
      positions.push(p[i], p[i + 1], p[i + 2]);
    }
    indices.push(id);
  }
  g.dispose();
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    colors: new Float32Array(positions.length).fill(1),
  };
}
export function makeMount(type, p) {
  for (const key of [
    "diameter",
    "socket",
    "thickness",
    "spoke",
    "slot",
    "depth",
    "width",
  ])
    if (!Number.isFinite(p[key]) || p[key] <= 0)
      throw new Error("Mount dimensions must be positive numbers.");
  if (
    p.diameter > 500 ||
    p.width > 500 ||
    p.depth > 100 ||
    p.thickness > 10 ||
    p.slot > 30
  )
    throw new Error("Mount dimensions are too large.");
  if (type === "ring" || type === "spider") {
    const r = p.diameter / 2,
      inner = p.socket / 2;
    if (inner >= r - 5)
      throw new Error(
        "The socket opening needs at least 5 mm clearance inside the outer diameter.",
      );
    const s = circle(r);
    s.holes.push(hole(inner));
    if (type === "spider") {
      const ri = inner + 3,
        ro = r - 3,
        angle = Math.asin(Math.min(0.7, p.spoke / (2 * ri)));
      if (ri >= ro - 2)
        throw new Error("Increase adapter diameter to fit the spokes.");
      for (let j = 0; j < 4; j++) {
        const a = (j * Math.PI) / 2 + angle,
          b = ((j + 1) * Math.PI) / 2 - angle,
          h = new Path();
        h.moveTo(ro * Math.cos(a), ro * Math.sin(a));
        h.absarc(0, 0, ro, a, b, false);
        h.lineTo(ri * Math.cos(b), ri * Math.sin(b));
        h.absarc(0, 0, ri, b, a, true);
        h.closePath();
        s.holes.push(h);
      }
    }
    return extrude(s, p.thickness);
  }
  if (type === "stand") {
    const w = p.width / 2,
      h = p.depth,
      t = p.thickness,
      slot = p.slot / 2;
    if (slot + t >= w || h <= t + 3)
      throw new Error("The slot must fit inside the stand with a solid base.");
    return extrude(
      polygon([
        [-w, 0],
        [w, 0],
        [w, h],
        [slot, h],
        [slot, t],
        [-slot, t],
        [-slot, h],
        [-w, h],
      ]),
      20,
    );
  }
  if (type === "clip") {
    const w = p.slot / 2,
      t = p.thickness,
      h = p.depth;
    if (h < t + 3)
      throw new Error("Clip depth must exceed its base thickness.");
    return extrude(
      polygon([
        [-w - t, 0],
        [w + t, 0],
        [w + t, h],
        [w, h],
        [w, t],
        [-w, t],
        [-w, h],
        [-w - t, h],
      ]),
      p.width,
    );
  }
  throw new Error("Unknown mounting part.");
}
export function initMounts(api) {
  const panel = document.createElement("section");
  panel.id = "mount-studio";
  panel.className = "inline-tool";
  panel.hidden = true;
  document.querySelector("#tool-panels").append(panel);
  const button = document.createElement("button");
  button.id = "mount-open";
  button.className = "guide-button";
  button.textContent = "Supports & hardware →";
  button.onclick = () => api.open();
  document.querySelector(".local-note").before(button);
  let type = "spider",
    enabled = false,
    p = {
      diameter: api.getSettings().width,
      socket: 28,
      thickness: 3,
      spoke: 5,
      slot: api.getSettings().max + 0.4,
      depth: 15,
      width: 40,
    };
  function draw() {
    const fields = ["ring", "spider"].includes(type)
      ? [
          ["diameter", "Outer diameter"],
          ["socket", "Socket opening"],
          ["thickness", "Part thickness"],
          ["spoke", "Spoke width"],
        ]
      : [
          ["width", "Part width"],
          ["slot", "Slot opening"],
          ["depth", "Slot depth"],
          ["thickness", "Wall thickness"],
        ];
    panel.innerHTML = `<div class="panel-title">Optional hardware</div><label class="check"><input id="hardware-enabled" type="checkbox" ${enabled ? "checked" : ""}/>Include hardware beside the model</label><label class="field"><span>Part</span><select id="mount-type">${[
      ["spider", "Four-spoke lamp adapter"],
      ["ring", "Mounting ring"],
      ["stand", "Slotted stand"],
      ["clip", "U-channel clip"],
    ]
      .map(
        ([v, t]) =>
          `<option value="${v}" ${v === type ? "selected" : ""}>${t}</option>`,
      )
      .join(
        "",
      )}</select></label><div class="field-row">${fields.map(([key, label]) => `<label class="field"><span>${label} (mm)</span><input data-mount="${key}" type="number" step="0.1" min="0.4" max="500" value="${p[key]}"/></label>`).join("")}</div><p class="hint">Edits update alongside your lithophane. Matching supports above resize automatically; these optional hardware dimensions are manual. Generic fittings need physical fit testing.</p><button data-action="export" class="wide">Export hardware kit</button>`;
  }
  const getMesh = () => (enabled ? makeMount(type, p) : null);
  panel.addEventListener("input", (e) => {
    if (e.target.dataset.mount) {
      p[e.target.dataset.mount] = Number(e.target.value);
      enabled = true;
      panel.querySelector("#hardware-enabled").checked = true;
      api.changed();
    }
    if (e.target.id === "hardware-enabled") {
      enabled = e.target.checked;
      api.changed();
    }
  });
  panel.addEventListener("change", (e) => {
    if (e.target.id === "mount-type") {
      type = e.target.value;
      enabled = true;
      draw();
      api.changed();
    }
  });
  panel.addEventListener("click", async (e) => {
    if (e.target.closest("button")?.dataset.action !== "export") return;
    try {
      const mesh = makeMount(type, p),
        files = {
          "mount.stl": binarySTL(mesh),
          "mount.3mf": threeMF([{ name: type, color: "#EEEEEE", mesh }]),
          "dimensions.json": strToU8(JSON.stringify({ type, ...p }, null, 2)),
        };
      if (
        await api.saveFile(
          type + "-mount-kit.zip",
          zipSync(files, { level: 3 }),
        )
      )
        api.toast("Mount kit saved.");
    } catch (e) {
      api.toast(e.message, true);
    }
  });
  return {
    show: (visible) => {
      panel.hidden = !visible;
      if (visible) draw();
    },
    getMesh,
    compose: (mesh) => {
      const extra = getMesh();
      if (!extra) return mesh;
      const b = bounds(mesh),
        e = bounds(extra);
      return mergeMeshes([
        mesh,
        transform(extra, (x, y, z) => [
          x - e.min[0] + b.max[0] + api.getSettings().printGap,
          z - e.min[2] + b.min[1],
          -(y - e.min[1]),
        ]),
      ]);
    },
    printParts: (parts) => {
      const extra = getMesh();
      if (!extra) return parts;
      const right = Math.max(...parts.map((p) => bounds(p.mesh).max[0])),
        b = bounds(extra);
      return [
        ...parts,
        {
          name: "Hardware " + type,
          color: "#9BA99A",
          mesh: transform(extra, (x, y, z) => [
            x - b.min[0] + right + api.getSettings().printGap,
            y - b.min[1],
            z - b.min[2],
          ]),
        },
      ];
    },
    getState: () => ({ type, p, enabled }),
    setState: (s) => {
      if (s) {
        makeMount(s.type, s.p);
        type = s.type;
        p = { ...s.p };
        enabled = !!s.enabled;
      } else enabled = false;
    },
  };
}
