import { Shape, ExtrudeGeometry } from "three";

export function supportType(s) {
  if (s.support !== "auto") return s.support;
  if (s.shape === "box") return "case";
  return ["flat", "curved", "nightlight"].includes(s.shape) ? "stand" : "none";
}
export function supportDimensions(s) {
  const type = supportType(s),
    c = s.fitClearance,
    wall = s.supportWall;
  if (type === "none") return { type };
  if (type === "case") {
    if (!["flat", "box"].includes(s.shape))
      throw new Error(
        "A fitted case requires a flat panel or light-box panel.",
      );
    const seat = s.boxDepth - s.max - c;
    if (seat <= wall)
      throw new Error("Increase case depth to leave room behind the panel.");
    return {
      type,
      width: s.width + 2 * (c + wall),
      height: s.height + 2 * (c + wall),
      depth: s.boxDepth,
      cavityWidth: s.width + 2 * c,
      cavityHeight: s.height + 2 * c,
      seat,
      wall,
      ledge: Math.min(3, s.width / 8, s.height / 8),
      clearance: c,
    };
  }
  if (!["flat", "box", "curved", "nightlight"].includes(s.shape))
    throw new Error(
      "The fitted stand supports flat and curved rectangular panels. Choose Auto or None for this shape.",
    );
  const curved = ["curved", "nightlight"].includes(s.shape),
    radius = curved ? s.width / ((s.angle * Math.PI) / 180) : 0;
  const footDepth = Math.max(20, s.height * 0.3, s.max + 2 * c + 2 * wall);
  const rear = curved
    ? Math.min((footDepth - s.max) / 2, radius * 0.7)
    : (footDepth - s.max) / 2;
  if (curved && rear < c + wall)
    throw new Error(
      "This curve is too tight for the stand. Increase panel width or reduce the curve angle.",
    );
  return {
    type,
    length: s.width * 0.8,
    depth: footDepth,
    slot: s.max + 2 * c,
    slotBack: -c,
    slotFront: s.max + c,
    rear: -rear,
    front: footDepth - rear,
    wall,
    insertion: Math.max(3, Math.min(8, s.height * 0.06)),
    radius,
    clearance: c,
  };
}
function weld(p, rawIndices = null) {
  const positions = [],
    indices = [],
    map = new Map();
  for (let i = 0; i < (rawIndices?.length || p.length / 3); i++) {
    const k = (rawIndices ? rawIndices[i] : i) * 3,
      key = [p[k], p[k + 1], p[k + 2]]
        .map((v) => Math.round(v * 1e5))
        .join(",");
    let id = map.get(key);
    if (id === undefined) {
      id = positions.length / 3;
      map.set(key, id);
      positions.push(p[k], p[k + 1], p[k + 2]);
    }
    indices.push(id);
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    colors: new Float32Array(positions.length).fill(0.65),
  };
}
export function makeStand(s) {
  const d = supportDimensions({ ...s, support: "stand" }),
    top = d.wall + d.insertion;
  const points = [
    [d.rear, 0],
    [d.front, 0],
    [d.front, top],
    [d.slotFront, top],
    [d.slotFront, d.wall],
    [d.slotBack, d.wall],
    [d.slotBack, top],
    [d.rear, top],
  ];
  const shape = new Shape();
  shape.moveTo(...points[0]);
  for (const p of points.slice(1)) shape.lineTo(...p);
  shape.closePath();
  const g = new ExtrudeGeometry(shape, {
      depth: d.length,
      steps: d.radius ? Math.max(16, Math.ceil(s.angle / 2)) : 1,
      bevelEnabled: false,
    }),
    p = g.attributes.position.array;
  for (let i = 0; i < p.length; i += 3) {
    const depth = p[i],
      height = p[i + 1],
      along = p[i + 2] - d.length / 2;
    if (d.radius) {
      const a = along / d.radius;
      p[i] = (d.radius + depth) * Math.sin(a);
      p[i + 1] = -((d.radius + depth) * Math.cos(a) - d.radius);
    } else {
      p[i] = along;
      p[i + 1] = -depth;
    }
    p[i + 2] = height;
  }
  const mesh = weld(p);
  g.dispose();
  // The sweep mapping reverses handedness.
  for (let i = 0; i < mesh.indices.length; i += 3)
    [mesh.indices[i + 1], mesh.indices[i + 2]] = [
      mesh.indices[i + 2],
      mesh.indices[i + 1],
    ];
  return mesh;
}
export function makeCase(s) {
  const d = supportDimensions({ ...s, support: "case" }),
    positions = [],
    indices = [];
  function rectangle(w, h, z) {
    const ids = [];
    for (const [x, y] of [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ]) {
      ids.push(positions.length / 3);
      positions.push(x, y, z);
    }
    return ids;
  }
  const quad = (a, b, c, d) => indices.push(a, b, c, a, c, d);
  const bottom = rectangle(d.width, d.height, 0),
    outer = rectangle(d.width, d.height, d.depth),
    innerTop = rectangle(d.cavityWidth, d.cavityHeight, d.depth),
    seatOuter = rectangle(d.cavityWidth, d.cavityHeight, d.seat),
    seatInner = rectangle(
      s.width - 2 * d.ledge,
      s.height - 2 * d.ledge,
      d.seat,
    ),
    floor = rectangle(s.width - 2 * d.ledge, s.height - 2 * d.ledge, d.wall);
  quad(bottom[0], bottom[3], bottom[2], bottom[1]);
  quad(floor[0], floor[1], floor[2], floor[3]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(bottom[i], bottom[j], outer[j], outer[i]);
    quad(outer[i], outer[j], innerTop[j], innerTop[i]);
    quad(seatOuter[j], seatOuter[i], innerTop[i], innerTop[j]);
    quad(seatOuter[i], seatOuter[j], seatInner[j], seatInner[i]);
    quad(floor[j], floor[i], seatInner[i], seatInner[j]);
  }
  return weld(positions, indices);
}
export function bounds(mesh) {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i++) {
    const k = i % 3;
    min[k] = Math.min(min[k], mesh.positions[i]);
    max[k] = Math.max(max[k], mesh.positions[i]);
  }
  return { min, max, size: max.map((v, k) => v - min[k]) };
}
export function transform(mesh, fn) {
  const positions = mesh.positions.slice();
  for (let i = 0; i < positions.length; i += 3)
    positions.set(fn(positions[i], positions[i + 1], positions[i + 2]), i);
  return { ...mesh, positions };
}
export function mergeMeshes(meshes) {
  const positions = new Float32Array(
      meshes.reduce((n, m) => n + m.positions.length, 0),
    ),
    colors = new Float32Array(positions.length),
    uvs = new Float32Array((positions.length / 3) * 2).fill(-1),
    indices = new Uint32Array(meshes.reduce((n, m) => n + m.indices.length, 0));
  let p = 0,
    j = 0;
  for (const m of meshes) {
    positions.set(m.positions, p);
    if (m.uvs) uvs.set(m.uvs, (p / 3) * 2);
    colors.set(m.colors, p);
    for (const i of m.indices) indices[j++] = i + p / 3;
    p += m.positions.length;
  }
  return { positions, indices, colors, uvs };
}
export function printParts(mesh, s) {
  const d = supportDimensions(s),
    panelBounds = bounds(mesh),
    panel = transform(mesh, (x, y, z) => [
      x - panelBounds.min[0],
      y - panelBounds.min[1],
      z - panelBounds.min[2],
    ]);
  if (d.type === "none")
    return [{ name: "Lithophane", color: "#F1E8D5", mesh }];
  const support = d.type === "stand" ? makeStand(s) : makeCase(s),
    b = bounds(support);
  const placed = transform(support, (x, y, z) => [
    x - b.min[0] + panelBounds.size[0] + s.printGap,
    y - b.min[1],
    z - b.min[2],
  ]);
  return [
    { name: "Lithophane", color: "#F1E8D5", mesh: panel },
    {
      name: d.type === "stand" ? "Matching stand" : "Matching case",
      color: "#9BA99A",
      mesh: placed,
    },
  ];
}
export function assembledPreview(mesh, s) {
  const d = supportDimensions(s);
  if (d.type === "none") return mesh;
  const support =
    d.type === "stand"
      ? transform(makeStand(s), (x, y, z) => [x, z - d.wall - s.height / 2, -y])
      : transform(makeCase(s), (x, y, z) => [x, y, z - d.seat]);
  return mergeMeshes([mesh, support]);
}
export function supportNotes(s) {
  const d = supportDimensions(s);
  return d.type === "none"
    ? "Panel only."
    : `Lithophane and ${d.type} are separate parts, laid out side by side at Z=0 with ${s.printGap} mm spacing. Check the combined footprint against your printer bed. Fit clearance is ${s.fitClearance} mm PER SIDE. ${d.type === "stand" ? `Stand slot: ${d.slot.toFixed(2)} mm; insertion depth: ${d.insertion.toFixed(2)} mm. Lowering the panel into the stand covers this much of its bottom edge.` : `Case cavity: ${d.cavityWidth.toFixed(2)} x ${d.cavityHeight.toFixed(2)} mm; seat depth: ${d.seat.toFixed(2)} mm from the back. The case has an open front and a ledge; use removable adhesive or a retainer to secure the panel.`} Dimensions follow the current panel settings automatically. Physical fit and stability require a test print; slicer orientation/supports remain your choice.`;
}
