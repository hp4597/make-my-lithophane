import { Shape, Path, ExtrudeGeometry } from "three";
import { validateLighting } from "./lighting-settings.js";
function polygon(points) {
  const p = new Shape();
  p.moveTo(...points[0]);
  for (const v of points.slice(1)) p.lineTo(...v);
  p.closePath();
  return p;
}
function rect(w, h, notch = null) {
  return polygon(
    notch
      ? [
          [-w / 2, -h / 2],
          [-notch[0] / 2, -h / 2],
          [-notch[0] / 2, -h / 2 + notch[1]],
          [notch[0] / 2, -h / 2 + notch[1]],
          [notch[0] / 2, -h / 2],
          [w / 2, -h / 2],
          [w / 2, h / 2],
          [-w / 2, h / 2],
        ]
      : [
          [-w / 2, -h / 2],
          [w / 2, -h / 2],
          [w / 2, h / 2],
          [-w / 2, h / 2],
        ],
  );
}
function rectangleHole(shape, x, y, w, h) {
  const p = new Path();
  p.moveTo(x - w / 2, y - h / 2);
  p.lineTo(x - w / 2, y + h / 2);
  p.lineTo(x + w / 2, y + h / 2);
  p.lineTo(x + w / 2, y - h / 2);
  p.closePath();
  shape.holes.push(p);
}
function circle(r, inner = 0) {
  const p = new Shape();
  p.absarc(0, 0, r, 0, Math.PI * 2, false);
  if (inner) {
    const h = new Path();
    h.absarc(0, 0, inner, 0, Math.PI * 2, true);
    p.holes.push(h);
  }
  return p;
}
function hole(p, x, y, r) {
  const h = new Path();
  h.absarc(x, y, r, 0, Math.PI * 2, true);
  p.holes.push(h);
}
function ring(w, h, iw, ih) {
  const p = rect(w, h);
  rectangleHole(p, 0, 0, iw, ih);
  return p;
}
function mesh(shape, depth) {
  const g = new ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 64,
    }),
    a = g.attributes.position.array,
    positions = [],
    indices = [],
    map = new Map();
  for (let i = 0; i < a.length; i += 3) {
    const key = [a[i], a[i + 1], a[i + 2]]
      .map((v) => Math.round(v * 1e5))
      .join(",");
    let id = map.get(key);
    if (id === undefined) {
      id = positions.length / 3;
      map.set(key, id);
      positions.push(a[i], a[i + 1], a[i + 2]);
    }
    indices.push(id);
  }
  g.dispose();
  // Earcut can bridge aligned hole vertices across a longer cap edge.
  // Split those T junctions so exported solids have matching edge topology.
  let pending = indices.splice(0);
  while (pending.length) {
    const counts = new Map();
    for (let k = 0; k < pending.length; k += 3)
      for (let j = 0; j < 3; j++) {
        const a = pending[k + j],
          b = pending[k + ((j + 1) % 3)],
          key = [Math.min(a, b), Math.max(a, b)].join(",");
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    let changed = false;
    const next = [];
    for (let k = 0; k < pending.length; k += 3) {
      const tri = pending.slice(k, k + 3);
      let split = false;
      for (let j = 0; j < 3 && !split; j++) {
        const a = tri[j],
          b = tri[(j + 1) % 3],
          c = tri[(j + 2) % 3],
          key = [Math.min(a, b), Math.max(a, b)].join(",");
        if (counts.get(key) !== 1) continue;
        const d = [0, 1, 2].map(
            (q) => positions[b * 3 + q] - positions[a * 3 + q],
          ),
          len = d.reduce((a, b) => a + b * b, 0);
        for (let v = 0; v < positions.length / 3; v++) {
          if (v === a || v === b || v === c) continue;
          const u = [0, 1, 2].map(
              (q) => positions[v * 3 + q] - positions[a * 3 + q],
            ),
            f = u.reduce((sum, x, q) => sum + x * d[q], 0) / len;
          if (
            f <= 1e-6 ||
            f >= 1 - 1e-6 ||
            u.some((x, q) => Math.abs(x - f * d[q]) > 1e-5)
          )
            continue;
          next.push(a, v, c, v, b, c);
          split = true;
          changed = true;
          break;
        }
      }
      if (!split) next.push(...tri);
    }
    if (!changed) {
      indices.push(...next);
      break;
    }
    pending = next;
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    colors: new Float32Array(positions.length).fill(0.45),
  };
}
function moved(m, fn) {
  const positions = m.positions.slice();
  for (let i = 0; i < positions.length; i += 3)
    positions.set(fn(...positions.subarray(i, i + 3)), i);
  let volume = 0;
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i] * 3,
      b = m.indices[i + 1] * 3,
      c = m.indices[i + 2] * 3,
      p = positions;
    volume +=
      p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) +
      p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2]) +
      p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  const indices = m.indices.slice();
  if (volume < 0)
    for (let i = 0; i < indices.length; i += 3)
      [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  return { ...m, positions, indices };
}
function sector(inner, outer, angle) {
  const pts = [],
    n = Math.max(12, Math.ceil((angle * 180) / Math.PI));
  for (let i = 0; i <= n; i++) {
    const a = -angle / 2 + (angle * i) / n;
    pts.push([outer * Math.sin(a), outer * Math.cos(a)]);
  }
  for (let i = n; i >= 0; i--) {
    const a = -angle / 2 + (angle * i) / n;
    pts.push([inner * Math.sin(a), inner * Math.cos(a)]);
  }
  return polygon(pts);
}
function subdivide(m, rounds = 4) {
  let p = Array.from(m.positions),
    idx = Array.from(m.indices);
  for (let step = 0; step < rounds; step++) {
    const map = new Map(),
      out = [];
    const mid = (a, b) => {
      const key = a < b ? a + "," + b : b + "," + a;
      let n = map.get(key);
      if (n === undefined) {
        n = p.length / 3;
        p.push(
          (p[a * 3] + p[b * 3]) / 2,
          (p[a * 3 + 1] + p[b * 3 + 1]) / 2,
          (p[a * 3 + 2] + p[b * 3 + 2]) / 2,
        );
        map.set(key, n);
      }
      return n;
    };
    for (let i = 0; i < idx.length; i += 3) {
      const [a, b, c] = idx.slice(i, i + 3),
        ab = mid(a, b),
        bc = mid(b, c),
        ca = mid(c, a);
      out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    idx = out;
  }
  return {
    positions: new Float32Array(p),
    indices: new Uint32Array(idx),
    colors: new Float32Array(p.length).fill(0.45),
  };
}
function rearShape(w, h, s) {
  if (s.wireWidth > w / 3 || s.wireHeight > h / 3)
    throw new Error("Cable opening is too large for this enclosure.");
  const p = rect(w, h, [s.wireWidth, s.wireHeight]);
  if (s.ventCount) {
    const span = w - 12;
    if (s.ventCount * s.ventWidth >= span)
      throw new Error("Reduce ventilation slot count or width.");
    for (let i = 0; i < s.ventCount; i++)
      rectangleHole(
        p,
        ((i - (s.ventCount - 1) / 2) * span) / s.ventCount,
        h / 2 - 7,
        s.ventWidth,
        6,
      );
  }
  if (s.lightMount === "screws") {
    if (
      s.mountSpacingX + s.mountHole + 8 > w ||
      s.mountSpacingY + s.mountHole + 20 > h
    )
      throw new Error("The mounting-hole pattern does not fit the back plate.");
    for (const x of [-s.mountSpacingX / 2, s.mountSpacingX / 2])
      for (const y of [-s.mountSpacingY / 2, s.mountSpacingY / 2])
        hole(p, x, y, s.mountHole / 2);
  }
  return p;
}
export function lightingParts(s) {
  validateLighting(s);
  if (s.lightingSetup === "none") return [];
  const parts = [],
    t = s.supportWall,
    c = s.fitClearance,
    lip = s.retainerLip,
    curved = ["curved", "nightlight"].includes(s.shape),
    round = ["cylinder", "lamp"].includes(s.shape);
  if (lip >= Math.min(s.width, s.height) / 4)
    throw new Error("Panel retaining lip is too wide.");
  const add = (name, m, fn = (x, y, z) => [x, y, z], color = "#929D93") =>
    parts.push({ name, mesh: m, assembled: moved(m, fn), color });
  if (round) {
    const R = s.width / 2,
      wave = s.shape === "lamp" ? s.waveDepth : 0,
      expansion = Math.max(
        0,
        s.shape === "lamp"
          ? (R * (s.taper - 1) * Math.min(6, s.height / 10)) / s.height
          : 0,
      ),
      outer = R + expansion + s.max + c + wave + t,
      inside = R - c - wave,
      available =
        Math.min(R, R * (s.shape === "lamp" ? s.taper : 1)) - c - wave;
    if (inside < 8)
      throw new Error("Increase lamp diameter to fit the lighting base.");
    const base = circle(
      outer,
      s.lightKind === "socket" ? s.socketDiameter / 2 : s.wireWidth / 2,
    );
    if (s.ventCount)
      for (let i = 0; i < s.ventCount; i++) {
        const a = (2 * Math.PI * i) / s.ventCount;
        hole(
          base,
          (inside - t) * Math.sin(a),
          (inside - t) * Math.cos(a),
          s.ventWidth / 2,
        );
      }
    add("lamp-base", mesh(base, t), (x, y, z) => [x, z - s.height / 2 - t, -y]);
    add(
      "lower-outer-retainer",
      mesh(
        circle(outer, R + expansion + s.max + c + wave),
        Math.min(6, s.height / 10),
      ),
      (x, y, z) => [x, z - s.height / 2, -y],
    );
    const insertion = Math.min(6, s.height / 10),
      innerSeat =
        inside +
        Math.min(
          0,
          s.shape === "lamp" ? (R * (s.taper - 1) * insertion) / s.height : 0,
        );
    add(
      "lower-inner-retainer",
      mesh(circle(innerSeat, innerSeat - t), insertion),
      (x, y, z) => [x, z - s.height / 2, -y],
    );
    const holder =
      s.lightKind === "socket"
        ? s.socketDiameter / 2 + c
        : s.lightDiameter / 2 + c;
    if (holder + t + s.diffuserGap >= available)
      throw new Error(
        "Light holder does not fit inside this lamp. Increase diameter or reduce light diameter.",
      );
    if (s.lightKind === "strip") {
      if (holder <= t)
        throw new Error("Increase core diameter or reduce support wall.");
      if (s.stripWidth > 2 * Math.PI * holder)
        throw new Error("LED strip is too wide for its core.");
      add(
        "LED-strip-core",
        mesh(circle(holder, holder - t), s.height * 0.75),
        (x, y, z) => [x, z - s.height / 2, -y],
      );
    } else
      add(
        s.lightKind === "socket" ? "socket-collar" : "LED-puck-recess",
        mesh(circle(holder + t, holder), s.lightHeight),
        (x, y, z) => [x, z - s.height / 2, -y],
      );
    if (s.topCap) {
      const rt = R * (s.shape === "lamp" ? s.taper : 1),
        ro = rt + s.max + c + wave + t,
        ri = rt - c - wave - lip;
      if (ri <= 0) throw new Error("Top opening is too small.");
      add("top-retainer", mesh(circle(ro, ri), t), (x, y, z) => [
        x,
        z + s.height / 2 + c,
        -y,
      ]);
    }
    if (s.diffuser) {
      const r = available - s.diffuserGap;
      if (r - s.diffuserThickness <= holder + t)
        throw new Error("Diffuser collides with the LED holder.");
      add(
        "diffuser-sleeve",
        mesh(circle(r, r - s.diffuserThickness), s.height - 2 * t),
        (x, y, z) => [x, z - s.height / 2 + t, -y],
        "#EEEEEE",
      );
    }
  } else if (curved) {
    if (s.lightKind !== "strip")
      throw new Error(
        "Curved enclosures use flexible LED strips. Choose LED-strip attachment.",
      );
    const a = (s.angle * Math.PI) / 180,
      R = s.width / a,
      back = R - s.lightGap - s.lightProjection;
    if (back <= t + 5)
      throw new Error(
        "Light gap is too deep for this curve. Increase width, reduce angle or reduce the light gap.",
      );
    const w = back * a,
      h = s.height + 2 * t,
      raw = subdivide(mesh(rearShape(w, h, s), t), 4),
      rear = moved(raw, (x, y, z) => [
        (back - t + z) * Math.sin(x / back),
        y,
        (back - t + z) * Math.cos(x / back) - R,
      ]);
    // Print the rear shell upright; all parts remain separate closed solids.
    add(
      "curved-rear-shell",
      moved(rear, (x, y, z) => [x, -z, y]),
      (x, y, z) => [x, z, -y],
    );
    const cap = mesh(sector(back - t, R + s.max + c + t, a), t);
    add("curved-bottom", cap, (x, y, z) => [x, z - s.height / 2 - t, y - R]);
    if (s.topCap)
      add("curved-top", cap, (x, y, z) => [x, -z + s.height / 2 + t, y - R]);
    for (const sign of [-1, 1]) {
      const cheek = mesh(
          rect(s.lightGap + s.lightProjection + s.max + c + t, s.height),
          t,
        ),
        mid = (back - t + R + s.max + c + t) / 2;
      add(sign < 0 ? "left-end-wall" : "right-end-wall", cheek, (x, y, z) => {
        const r = mid + x,
          angle = sign * (a / 2) + (sign * z) / R;
        return [r * Math.sin(angle), y, r * Math.cos(angle) - R];
      });
    }
    for (const sign of [-1, 1])
      add(
        sign < 0 ? "lower-strip-guide" : "upper-strip-guide",
        mesh(sector(back, back + t, a), t),
        (x, y, z) => [x, z + sign * (s.height / 2 - s.stripWidth - t), y - R],
      );
    if (s.diffuser) {
      const rb = R - s.diffuserGap,
        plate = mesh(sector(rb - s.diffuserThickness, rb, a), s.height);
      add(
        "curved-diffuser",
        plate,
        (x, y, z) => [x, z - s.height / 2, y - R],
        "#EEEEEE",
      );
    }
  } else {
    const board = s.lightKind === "board",
      w =
        Math.max(
          s.width,
          board
            ? s.boardWidth + 2 * t
            : s.lightKind === "puck"
              ? s.lightDiameter + 2 * t
              : 0,
        ) +
        2 * c,
      h = Math.max(s.height, board ? s.boardHeight + 2 * t : 0) + 2 * c,
      depth = s.lightGap + s.lightProjection + s.max + c,
      back = -s.lightGap - s.lightProjection;
    add(
      "enclosure-frame",
      mesh(ring(w + 2 * t, h + 2 * t, w, h), depth),
      (x, y, z) => [x, y, z + back],
    );
    const rear = rearShape(w + 2 * t, h + 2 * t, s);
    if (s.lightKind === "socket") hole(rear, 0, 0, s.socketDiameter / 2);
    add("rear-cover", mesh(rear, t), (x, y, z) => [x, y, z + back - t]);
    add(
      "panel-seat",
      mesh(ring(w, h, s.width - 2 * lip, s.height - 2 * lip), t),
      (x, y, z) => [x, y, z - t],
    );
    add(
      "front-retainer",
      mesh(
        ring(w + 2 * t, h + 2 * t, s.width - 2 * lip, s.height - 2 * lip),
        t,
      ),
      (x, y, z) => [x, y, z + s.max + c],
    );
    if (board) {
      // Edge trays retain the PCB perimeter without touching the LED array.
      for (const sign of [-1, 1])
        add(
          sign < 0 ? "left-board-tray" : "right-board-tray",
          mesh(rect(t, s.boardHeight), s.boardThickness + c),
          (x, y, z) => [x + sign * (s.boardWidth / 2 + t / 2), y, z + back],
        );
      add(
        "board-bottom-stop",
        mesh(rect(s.boardWidth + 2 * t, t), s.boardThickness + c),
        (x, y, z) => [x, y - s.boardHeight / 2 - t / 2, z + back],
      );
    } else if (s.lightKind === "strip") {
      if (s.stripWidth + 2 * t >= Math.min(w, h) / 2)
        throw new Error("Strip width is too large for the enclosure.");
      for (const sign of [-1, 1])
        add(
          sign < 0 ? "lower-strip-tray" : "upper-strip-tray",
          mesh(rect(w - 2 * t, s.stripWidth), t),
          (x, y, z) => [x, y + sign * (h / 2 - t - s.stripWidth / 2), z + back],
        );
    } else {
      const r =
        (s.lightKind === "socket" ? s.socketDiameter : s.lightDiameter) / 2 + c;
      if (2 * (r + t) > Math.min(w, h))
        throw new Error("Light recess does not fit the frame.");
      add(
        s.lightKind === "socket" ? "socket-collar" : "puck-recess",
        mesh(circle(r + t, r), s.lightHeight),
        (x, y, z) => [x, y, z + back],
      );
    }
    if (s.diffuser)
      add(
        "diffuser-sheet",
        mesh(rect(s.width - 2 * c, s.height - 2 * c), s.diffuserThickness),
        (x, y, z) => [x, y, z - s.diffuserGap - s.diffuserThickness],
        "#EEEEEE",
      );
  }
  if (!round && s.enclosureStand) {
    let bottom = Infinity,
      back = Infinity,
      front = -Infinity;
    for (const part of parts)
      for (let i = 0; i < part.assembled.positions.length; i += 3) {
        const p = part.assembled.positions;
        bottom = Math.min(bottom, p[i + 1]);
        back = Math.min(back, p[i + 2]);
        front = Math.max(front, p[i + 2]);
      }
    const spacing = curved
      ? (s.width / ((s.angle * Math.PI) / 180)) *
        Math.sin((s.angle * Math.PI) / 720)
      : s.width * 0.3;
    for (const sign of [-1, 1])
      add(
        sign < 0 ? "left-enclosure-foot" : "right-enclosure-foot",
        mesh(
          rect(Math.min(18, s.width / 5), front - back + 2 * s.footExtension),
          t,
        ),
        (x, y, z) => [
          x + sign * spacing,
          z + bottom - t,
          -y + (front + back) / 2,
        ],
      );
  }
  return parts;
}
export function lightingNotes(s) {
  return `LIGHTING SETUP: ${s.lightingSetup}; attachment: ${s.lightKind}. Parts are dimensioned in millimeters and supplied separately for assembly. Bond matching enclosure feet beneath the housing, with their long axes front to rear. Align the panel seat/retainers with the photo; bond enclosure seams and removable covers with suitable removable adhesive or add measured hardware. No snap fit is claimed. Board trays contact PCB edges; adhesive or the custom rear-hole pattern secures your light. Strip trays/core accept adhesive-backed low-voltage LED strips. Route the lead through the cable notch/base pass-through. The socket collar is a dimensional adapter, not an electrical fitting. Diffusers are separate parts; print in translucent material and test transmission. Check thermal clearance, light specifications and ventilation; electrical parts, wiring and power supply are not included. Physical fit, heat and retention have not been validated. Preset PCB dimensions do not establish compatibility with every product revision.
`;
}
