import { solidDefaults, solidConfig } from "./solid-settings.js";
import { lightingDefaults, validateLighting } from "./lighting-settings.js";
export const defaults = {
  ...lightingDefaults,
  ...solidDefaults,
  shape: "flat",
  support: "auto",
  fitClearance: 0.2,
  supportWall: 2.4,
  printGap: 8,
  width: 120,
  height: 90,
  min: 0.8,
  max: 3.2,
  resolution: 0.1,
  resolutionMode: "image",
  border: 3,
  angle: 100,
  taper: 0.8,
  opening: 28,
  boxDepth: 35,
  brightness: 0,
  contrast: 0,
  gamma: 1,
  invert: false,
  flip: false,
  rotation: 0,
  zoom: 1,
  panX: 0,
  panY: 0,
  fit: "cover",
  text: "",
  textSize: 12,
  threshold: 0.9,
  moon: 0.25,
  layer: 0.08,
  levels: 5,
  colorMode: "mono",
  colorDepth: 0.64,
  hue: 0,
  saturation: 0,
  waves: 0,
  waveDepth: 0,
  holes: false,
  holeDiameter: 3,
  largestIsland: false,
};
export const shapes = [
  ["flat", "Flat panel", "rectangle-horizontal"],
  ["curved", "Curved panel", "shell"],
  ["cylinder", "Cylinder", "cylinder"],
  ["lamp", "Lamp shade", "lamp"],
  ["nightlight", "Night light", "lightbulb"],
  ["box", "Light box", "box"],
  ["sphere", "Sphere", "globe"],
  ["moon", "Moon lamp", "moon"],
  ["heart", "Heart", "heart"],
  ["silhouette", "Silhouette", "scan"],
];
export function validate(s) {
  validateLighting(s);
  if (!["relief", "solid"].includes(s.colorStructure))
    throw new Error("Unknown color structure.");
  if (s.colorMode === "cmyw" && s.colorStructure === "solid") solidConfig(s);
  for (const k of Object.keys(defaults))
    if (typeof defaults[k] === "number" && !Number.isFinite(s[k]))
      throw new Error(`${k} must be a number.`);
  if (!["auto", "none", "stand", "case"].includes(s.support))
    throw new Error("Unknown support type.");
  if (
    s.fitClearance < 0.05 ||
    s.fitClearance > 2 ||
    s.supportWall < 1 ||
    s.supportWall > 6 ||
    s.printGap < 2 ||
    s.printGap > 50
  )
    throw new Error("Invalid support clearance, wall or print spacing.");
  if (
    s.lightingSetup === "none" &&
    s.support === "case" &&
    !["flat", "box"].includes(s.shape)
  )
    throw new Error("A fitted case requires a flat panel.");
  if (
    s.lightingSetup === "none" &&
    s.support === "stand" &&
    !["flat", "box", "curved", "nightlight"].includes(s.shape)
  )
    throw new Error("A fitted stand requires a rectangular panel.");
  if (!shapes.some(([id]) => id === s.shape)) throw new Error("Unknown shape.");
  if (s.width < 20 || s.height < 20)
    throw new Error("Dimensions must be at least 20 mm.");
  if (
    s.min < (s.colorMode === "cmyw" ? 0.04 : 0.4) ||
    s.max <= s.min ||
    s.max > (s.colorMode === "cmyw" ? 20 : 10)
  )
    throw new Error(
      "Maximum thickness must exceed minimum thickness (0.4–10 mm).",
    );
  if (!["image", "spacing"].includes(s.resolutionMode))
    throw new Error("Unknown resolution mode.");
  if (s.resolution <= 0) throw new Error("Sample spacing must be positive.");
  if (s.border < 0 || s.border >= Math.min(s.width, s.height) / 3)
    throw new Error("Border is too large for this panel.");
  if (s.angle < 10 || s.angle > 300 || s.taper < 0.3 || s.taper > 1.5)
    throw new Error("Invalid curvature or taper.");
  if (
    ["sphere", "moon"].includes(s.shape) &&
    (s.opening < 5 || s.opening >= s.width - 2 * s.max)
  )
    throw new Error("Sphere opening must be smaller than its inner diameter.");
  if (
    s.boxDepth < 15 ||
    s.boxDepth > 100 ||
    s.threshold < 0.05 ||
    s.threshold > 1 ||
    s.moon < 0 ||
    s.moon > 1 ||
    !Number.isInteger(s.levels)
  )
    throw new Error("Invalid shape settings.");
  if (
    s.zoom < 1 ||
    s.zoom > 4 ||
    s.gamma < 0.2 ||
    s.gamma > 3 ||
    s.levels < 2 ||
    s.levels > 12 ||
    s.layer < 0.04 ||
    s.layer > 0.3
  )
    throw new Error("Invalid image or layer settings.");
  if (
    !["mono", "paper", "cmyw", "painting"].includes(s.colorMode) ||
    !["cover", "contain"].includes(s.fit) ||
    ![0, 90, 180, 270].includes(s.rotation)
  )
    throw new Error("Invalid image mode.");
  if (
    typeof s.text !== "string" ||
    s.text.length > 80 ||
    s.textSize < 3 ||
    s.textSize > 30 ||
    Math.abs(s.panX) > 100 ||
    Math.abs(s.panY) > 100 ||
    Math.abs(s.brightness) > 100 ||
    s.contrast < -90 ||
    s.contrast > 100
  )
    throw new Error("Image adjustment is out of range.");
  if (
    Math.abs(s.hue) > 180 ||
    s.saturation < -100 ||
    s.saturation > 100 ||
    s.waves < 0 ||
    s.waves > 24 ||
    !Number.isInteger(s.waves) ||
    s.waveDepth < 0 ||
    s.waveDepth > 5 ||
    s.holeDiameter < 1 ||
    s.holeDiameter > 10
  )
    throw new Error("Invalid color, wave or mounting-hole settings.");
  if (s.colorMode === "cmyw" && (s.colorDepth < s.layer || s.colorDepth > 1.6))
    throw new Error("Color depth must be between one layer and 1.6 mm.");
  if (s.holes && s.border < s.holeDiameter + 2)
    throw new Error(
      "Hanging holes need a border at least 2 mm wider than the hole diameter.",
    );
}
export function gridSize(s, preview = false, source = null) {
  let nx, ny;
  if (s.resolutionMode === "image") {
    if (!source || source.width < 2 || source.height < 2)
      throw new Error(
        "Image pixel dimensions are required for Match image pixels.",
      );
    const rotated = s.rotation % 180 !== 0;
    nx = Math.max(4, (rotated ? source.height : source.width) - 1);
    ny = Math.max(4, (rotated ? source.width : source.height) - 1);
  } else {
    const spherical = ["sphere", "moon"].includes(s.shape),
      round = ["cylinder", "lamp", "sphere", "moon"].includes(s.shape);
    const w = round ? s.width * Math.PI : s.width,
      h = spherical
        ? (s.width / 2) * (Math.PI / 2 + Math.acos(s.opening / s.width))
        : s.height;
    nx = Math.max(4, Math.ceil(w / s.resolution));
    ny = Math.max(4, Math.ceil(h / s.resolution));
  }
  if (
    ![nx, ny, (nx + 1) * (ny + 1)].every(Number.isSafeInteger) ||
    nx < 1 ||
    ny < 1
  )
    throw new Error(
      "Requested grid exceeds numeric precision. No downsampling was applied.",
    );
  if (preview) {
    const scale = Math.max(1, Math.sqrt((nx * ny) / 600000));
    nx = Math.max(4, Math.floor(nx / scale));
    ny = Math.max(4, Math.floor(ny / scale));
  } else if (2 * (nx + 1) * (ny + 1) > 0xffffffff)
    throw new Error(
      `Requested ${nx + 1} x ${ny + 1} samples cannot be represented by 32-bit mesh indices. No downsampling was applied.`,
    );
  return { nx, ny };
}
export function tone(value, s) {
  let v = Math.max(
    0,
    Math.min(
      1,
      (value - 0.5) * (1 + s.contrast / 100) + 0.5 + s.brightness / 100,
    ),
  );
  v = Math.pow(v, 1 / s.gamma);
  return s.invert ? 1 - v : v;
}
export function buildMesh(s, pixels, nx, ny, rgba = null) {
  validate(s);
  if (pixels.length !== (nx + 1) * (ny + 1))
    throw new Error("Image grid does not match model grid.");
  const positions = new Float32Array((nx + 1) * (ny + 1) * 6),
    colors = new Float32Array(positions.length),
    uvs = new Float32Array((nx + 1) * (ny + 1) * 4),
    map = new Int32Array((nx + 1) * (ny + 1) * 2).fill(-1);
  let indices,
    vertexCount = 0,
    indexCount = 0;
  const periodic = ["cylinder", "lamp", "sphere", "moon"].includes(s.shape);
  const sphere = ["sphere", "moon"].includes(s.shape);
  const radius = s.width / 2;
  const bottomLatitude = sphere ? -Math.acos(s.opening / s.width) : 0;
  function vertex(x, y, back) {
    // Weld full-wrap seams and the sphere's north pole by index, not tolerance.
    if (periodic && x === nx) x = 0;
    if (sphere && y === ny) x = 0;
    const key = (y * (nx + 1) + x) * 2 + (back ? 1 : 0);
    if (map[key] !== -1) return map[key];
    const u = x / nx,
      v = y / ny;
    let light = pixels[y * (nx + 1) + x];
    if (s.shape === "moon")
      light = Math.max(
        0,
        Math.min(
          1,
          light * (1 - s.moon) +
            s.moon *
              (0.5 +
                0.2 * Math.sin(u * 127 + Math.sin(v * 61)) * Math.cos(v * 89)),
        ),
      );
    const frame =
      !periodic &&
      (u * s.width < s.border ||
        (1 - u) * s.width < s.border ||
        v * s.height < s.border ||
        (1 - v) * s.height < s.border);
    let thick = frame ? s.max : s.min + (1 - light) * (s.max - s.min);
    if (s.colorMode === "painting" && !frame)
      thick =
        s.min +
        (Math.round(light * (s.levels - 1)) / (s.levels - 1)) * (s.max - s.min);
    const d = back ? 0 : thick;
    let p;
    if (sphere) {
      const lat = bottomLatitude + v * (Math.PI / 2 - bottomLatitude),
        a = (u - 0.5) * Math.PI * 2;
      const r = radius + d;
      p = [
        r * Math.cos(lat) * Math.sin(a),
        r * Math.sin(lat),
        r * Math.cos(lat) * Math.cos(a),
      ];
    } else if (periodic) {
      const a = (u - 0.5) * Math.PI * 2,
        r =
          radius * (s.shape === "lamp" ? 1 + (s.taper - 1) * v : 1) +
          d +
          (s.shape === "lamp" ? s.waveDepth * Math.sin(s.waves * a) : 0);
      p = [r * Math.sin(a), (v - 0.5) * s.height, r * Math.cos(a)];
    } else if (["curved", "nightlight"].includes(s.shape)) {
      const angle = (s.angle * Math.PI) / 180,
        r = s.width / angle,
        a = (u - 0.5) * angle;
      p = [
        (r + d) * Math.sin(a),
        (v - 0.5) * s.height,
        (r + d) * Math.cos(a) - r,
      ];
    } else p = [(u - 0.5) * s.width, (v - 0.5) * s.height, d];
    const id = vertexCount++;
    map[key] = id;
    positions.set(p, id * 3);
    uvs.set(frame ? [-1, -1] : [u, v], id * 2);
    const c = (frame ? 0.07 : 0.07 + light * 0.93) ** 2.2;
    if (rgba && !frame) {
      const i = ((ny - y) * (nx + 1) + x) * 4;
      for (let channel = 0; channel < 3; channel++)
        colors[id * 3 + channel] =
          (rgba[i + channel] / 255) ** 2.2 * (0.25 + light * 0.75);
    } else colors.set([c, c * 0.95, c * 0.82], id * 3);
    return id;
  }
  const active = new Uint8Array(nx * ny);
  for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++) {
      const u = (x + 0.5) / nx,
        v = (y + 0.5) / ny;
      let on = true;
      if (s.shape === "heart") {
        const a = (u - 0.5) * 2.4,
          b = (v - 0.45) * 2.6;
        on = (a * a + b * b - 1) ** 3 - a * a * b ** 3 <= 0;
      }
      if (s.shape === "silhouette")
        on =
          (pixels[y * (nx + 1) + x] +
            pixels[y * (nx + 1) + x + 1] +
            pixels[(y + 1) * (nx + 1) + x] +
            pixels[(y + 1) * (nx + 1) + x + 1]) /
            4 <
          s.threshold;
      if (
        s.holes &&
        ["flat", "curved", "box", "nightlight"].includes(s.shape)
      ) {
        const px = u * s.width,
          py = v * s.height;
        for (const hx of [s.border / 2, s.width - s.border / 2])
          if (
            Math.hypot(px - hx, py - (s.height - s.border / 2)) <
            s.holeDiameter / 2
          )
            on = false;
      }
      active[y * nx + x] = on ? 1 : 0;
    }
  if (s.shape === "silhouette") {
    // Bridge point-only diagonal contacts so extrusion does not produce an
    // edge shared by four faces. Each cell can be added at most once.
    const queue = [];
    for (let y = 1; y < ny; y++)
      for (let x = 1; x < nx; x++) queue.push(y * (nx + 1) + x);
    for (let head = 0; head < queue.length; head++) {
      const y = Math.floor(queue[head] / (nx + 1)),
        x = queue[head] % (nx + 1);
      if (x <= 0 || x >= nx || y <= 0 || y >= ny) continue;
      const a = (y - 1) * nx + x - 1,
        b = a + 1,
        c = y * nx + x - 1,
        d = c + 1;
      let changed = -1;
      if (active[a] && active[d] && !active[b] && !active[c]) changed = b;
      else if (active[b] && active[c] && !active[a] && !active[d]) changed = a;
      if (changed >= 0) {
        active[changed] = 1;
        const cy = Math.floor(changed / nx),
          cx = changed % nx;
        for (const yy of [cy, cy + 1])
          for (const xx of [cx, cx + 1]) queue.push(yy * (nx + 1) + xx);
      }
    }
    if (s.largestIsland) {
      const visited = new Uint8Array(active.length);
      let largest = [];
      for (let start = 0; start < active.length; start++)
        if (active[start] && !visited[start]) {
          const component = [start];
          visited[start] = 1;
          for (let head = 0; head < component.length; head++) {
            const k = component[head],
              x = k % nx,
              y = Math.floor(k / nx);
            for (const [xx, yy] of [
              [x - 1, y],
              [x + 1, y],
              [x, y - 1],
              [x, y + 1],
            ])
              if (xx >= 0 && xx < nx && yy >= 0 && yy < ny) {
                const n = yy * nx + xx;
                if (active[n] && !visited[n]) {
                  visited[n] = 1;
                  component.push(n);
                }
              }
          }
          if (component.length > largest.length) largest = component;
        }
      active.fill(0);
      for (const k of largest) active[k] = 1;
    }
  }
  function isOn(x, y) {
    if (y < 0 || y >= ny) return false;
    if (periodic) x = (x + nx) % nx;
    return x >= 0 && x < nx && active[y * nx + x];
  }
  let capacity = 0;
  for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++)
      if (isOn(x, y)) {
        capacity += 12;
        if (!isOn(x, y - 1)) capacity += 6;
        if (!isOn(x + 1, y)) capacity += 6;
        if (!isOn(x, y + 1)) capacity += 6;
        if (!isOn(x - 1, y)) capacity += 6;
      }
  indices = new Uint32Array(capacity);
  function tri(a, b, c) {
    if (a !== b && b !== c && a !== c) {
      indices[indexCount++] = a;
      indices[indexCount++] = b;
      indices[indexCount++] = c;
    }
  }

  for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++)
      if (isOn(x, y)) {
        const corners = [
            [x, y],
            [x + 1, y],
            [x + 1, y + 1],
            [x, y + 1],
          ],
          f = corners.map(([a, b]) => vertex(a, b, false)),
          b = corners.map(([a, b]) => vertex(a, b, true));
        tri(f[0], f[1], f[2]);
        tri(f[0], f[2], f[3]);
        tri(b[0], b[2], b[1]);
        tri(b[0], b[3], b[2]);
        [
          [x, y - 1],
          [x + 1, y],
          [x, y + 1],
          [x - 1, y],
        ].forEach(([xx, yy], k) => {
          if (!isOn(xx, yy)) {
            const j = (k + 1) % 4;
            tri(f[k], b[k], b[j]);
            tri(f[k], b[j], f[j]);
          }
        });
      }
  if (!indexCount)
    throw new Error(
      "No silhouette remains. Increase the silhouette threshold.",
    );
  return {
    positions: positions.subarray(0, vertexCount * 3),
    indices: indices.subarray(0, indexCount),
    colors: colors.subarray(0, vertexCount * 3),
    uvs: uvs.subarray(0, vertexCount * 2),
  };
}
export function binarySTL(mesh) {
  const { positions: p, indices: i } = mesh,
    n = i.length / 3;
  if (!Number.isSafeInteger(n) || n > 0xffffffff)
    throw new Error(
      "Triangle count cannot be represented by the binary STL format.",
    );
  const out = new ArrayBuffer(84 + n * 50),
    v = new DataView(out);
  v.setUint32(80, n, true);
  for (let t = 0; t < n; t++) {
    const a = i[t * 3] * 3,
      b = i[t * 3 + 1] * 3,
      c = i[t * 3 + 2] * 3;
    const ux = p[b] - p[a],
      uy = p[b + 1] - p[a + 1],
      uz = p[b + 2] - p[a + 2],
      vx = p[c] - p[a],
      vy = p[c + 1] - p[a + 1],
      vz = p[c + 2] - p[a + 2];
    let normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx],
      len = Math.hypot(...normal) || 1;
    const values = [
      ...normal.map((x) => x / len),
      p[a],
      p[a + 1],
      p[a + 2],
      p[b],
      p[b + 1],
      p[b + 2],
      p[c],
      p[c + 1],
      p[c + 2],
    ];
    values.forEach((x, k) => v.setFloat32(84 + t * 50 + k * 4, x, true));
  }
  return new Uint8Array(out);
}
export function meshStats(m) {
  const lo = [Infinity, Infinity, Infinity],
    hi = [-Infinity, -Infinity, -Infinity];
  let volume = 0;
  for (let j = 0; j < m.positions.length; j++) {
    const k = j % 3;
    lo[k] = Math.min(lo[k], m.positions[j]);
    hi[k] = Math.max(hi[k], m.positions[j]);
  }
  const p = m.positions,
    i = m.indices;
  for (let j = 0; j < i.length; j += 3) {
    const a = i[j] * 3,
      b = i[j + 1] * 3,
      c = i[j + 2] * 3;
    volume +=
      (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) +
        p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2]) +
        p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) /
      6;
  }
  return {
    triangles: i.length / 3,
    dimensions: hi.map((x, k) => x - lo[k]),
    volume: Math.abs(volume) / 1000,
    grams: (Math.abs(volume) / 1000) * 1.24,
  };
}
