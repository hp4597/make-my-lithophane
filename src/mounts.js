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
  const dialog = document.createElement("dialog");
  dialog.id = "mount-studio";
  document.body.append(dialog);
  const button = document.createElement("button");
  button.className = "guide-button";
  button.id = "mount-open";
  button.textContent = "Mounts, stands & lamp adapters →";
  document.querySelector(".local-note").before(button);
  let type = "spider",
    p = {
      diameter: 100,
      socket: 28,
      thickness: 3,
      spoke: 5,
      slot: 3.6,
      depth: 15,
      width: 40,
    };
  function draw() {
    dialog.innerHTML = `<button class="dialog-close" data-action="close">×</button><span class="eyebrow">HARDWARE WORKSHOP</span><h2>Give your lithophane a home.</h2><label class="field"><span>Part</span><select id="mount-type"><option value="spider">Four-spoke lamp adapter</option><option value="ring">Lamp / sphere mounting ring</option><option value="stand">Slotted display stand</option><option value="clip">U-channel night-light adapter</option></select></label><div class="field-row">${(type ===
      "ring" || type === "spider"
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
        ]
    )
      .map(
        ([key, label]) =>
          `<label class="field"><span>${label} (mm)</span><input type="number" data-mount="${key}" step="0.1" min="0.4" max="500" value="${p[key]}"/></label>`,
      )
      .join(
        "",
      )}</div><p>These are separate parametric parts. Measure your light fitting and account for printer tolerances. Rings and spoke adapters need a retaining collar or adhesive; they are not automatically attached to the lithophane. U-channel adapters must be matched to your hardware.</p><div class="note">Use low-heat LEDs. Validate fit with a small test before printing the full model. Generic parts have not been physically fit-tested against branded hardware.</div><div class="dialog-actions"><button data-action="preview">Preview part</button><button data-action="export" class="primary">Export STL + 3MF kit</button></div>`;
    dialog.querySelector("#mount-type").value = type;
  }
  button.onclick = () => {
    p.slot = api.getSettings().max + 0.4;
    p.diameter = api.getSettings().width;
    draw();
    dialog.showModal();
  };
  dialog.onchange = (e) => {
    if (e.target.id === "mount-type") {
      type = e.target.value;
      draw();
    }
    if (e.target.dataset.mount)
      p[e.target.dataset.mount] = Number(e.target.value);
  };
  dialog.onclick = async (e) => {
    const action = e.target.closest("button")?.dataset.action;
    if (!action) return;
    try {
      if (action === "close") {
        dialog.close();
        api.restore();
        return;
      }
      const mesh = makeMount(type, p);
      if (action === "preview") {
        api.preview(mesh);
        dialog.close();
        api.toast(
          "Mount preview. Change a model setting or shape to return to your photo.",
        );
      }
      if (action === "export") {
        const files = {
          "mount.stl": binarySTL(mesh),
          "mount.3mf": threeMF([{ name: type, color: "#EEEEEE", mesh }]),
          "dimensions.json": strToU8(JSON.stringify({ type, ...p }, null, 2)),
          "ASSEMBLY.txt": strToU8(
            "Separate mounting part. Dimensions are mm. Check fit and tolerances before use. Lamp rings/spiders require a retaining collar or adhesive; this kit does not attach them automatically. For low-heat LED lighting only.",
          ),
        };
        if (
          await api.saveFile(
            type + "-mount-kit.zip",
            zipSync(files, { level: 3 }),
          )
        )
          api.toast("Mount kit saved.");
      }
    } catch (err) {
      api.toast(err.message, true);
    }
  };
  return {
    getState: () => ({ type, p }),
    setState: (s) => {
      if (s) {
        makeMount(s.type, s.p);
        type = s.type;
        p = s.p;
      }
    },
  };
}
