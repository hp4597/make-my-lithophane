import { solidConfig } from "./solid-settings.js";
const names = ["Cyan", "Magenta", "Yellow", "White"],
  colors = ["#00BCD4", "#DC267F", "#F2D53C", "#FFFFFF"];
export function transmission(counts, s, config) {
  return [0, 1, 2].map((k) => {
    const a = config.profile.absorption,
      total =
        counts.reduce((v, n, c) => v + n * a[c][k], 0) +
        (config.front + config.rear) * a[3][k];
    // Display relative to this panel's all-white reference under the same light.
    return Math.min(1, Math.exp(-s.layer * (total - config.layers * a[3][k])));
  });
}
function tree(points, depth = 0) {
  if (!points.length) return null;
  const axis = depth % 3;
  points.sort((a, b) => a.rgb[axis] - b.rgb[axis]);
  const mid = points.length >> 1;
  return {
    p: points[mid],
    axis,
    left: tree(points.slice(0, mid), depth + 1),
    right: tree(points.slice(mid + 1), depth + 1),
  };
}
function closest(node, rgb, best = { distance: Infinity, p: null }) {
  if (!node) return best;
  const d = node.p.rgb.reduce((sum, x, k) => sum + (x - rgb[k]) ** 2, 0);
  if (d < best.distance) best = { distance: d, p: node.p };
  const delta = rgb[node.axis] - node.p.rgb[node.axis];
  best = closest(delta < 0 ? node.left : node.right, rgb, best);
  if (delta * delta < best.distance)
    best = closest(delta < 0 ? node.right : node.left, rgb, best);
  return best;
}
function palette(s, c) {
  const points = [];
  for (let a = 0; a <= c.inside; a++)
    for (let b = 0; b <= c.inside - a; b++)
      for (let d = 0; d <= c.inside - a - b; d++) {
        const counts = [a, b, d, c.inside - a - b - d],
          expected = transmission(counts, s, c);
        points.push({ counts, expected, rgb: expected.map(Math.sqrt) });
      }
  return tree(points);
}
function box(builder, x0, x1, y0, y1, z0, z1) {
  if (z1 - z0 < 1e-7) return;
  if (builder.countOnly) {
    builder.boxes++;
    return;
  }
  const b = builder.p.length / 3;
  builder.p.push(
    x0,
    y0,
    z0,
    x1,
    y0,
    z0,
    x1,
    y1,
    z0,
    x0,
    y1,
    z0,
    x0,
    y0,
    z1,
    x1,
    y0,
    z1,
    x1,
    y1,
    z1,
    x0,
    y1,
    z1,
  );
  for (const i of [
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2,
    3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
  ])
    builder.i.push(b + i);
}
export function solidMeshes(plan, s) {
  let builders = names.map(() => ({ countOnly: true, boxes: 0 }));
  const { cols, rows, counts, config: c } = plan,
    w = s.width,
    h = s.height;
  function emitBoxes() {
    box(builders[3], -w / 2, w / 2, -h / 2, h / 2, 0, c.rear * s.layer);
    box(
      builders[3],
      -w / 2,
      w / 2,
      -h / 2,
      h / 2,
      (c.layers - c.front) * s.layer,
      c.layers * s.layer,
    );
    // Merge identical adjacent columns into closed row prisms. They tile exactly;
    // the slicer unions touching same-material prisms, without positive-volume overlaps.
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols;) {
        let end = x + 1;
        while (
          end < cols &&
          [0, 1, 2, 3].every(
            (k) =>
              counts[(y * cols + x) * 4 + k] ===
              counts[(y * cols + end) * 4 + k],
          )
        )
          end++;
        let z = c.rear;
        for (let k = 0; k < 4; k++) {
          const n = counts[(y * cols + x) * 4 + k];
          box(
            builders[k],
            (x / cols - 0.5) * w,
            (end / cols - 0.5) * w,
            (y / rows - 0.5) * h,
            ((y + 1) / rows - 0.5) * h,
            z * s.layer,
            (z + n) * s.layer,
          );
          z += n;
        }
        x = end;
      }
  }
  // Count the merged prisms first, then write directly into exact-sized buffers.
  // Avoid multi-gigabyte growable JS arrays and their temporary typed-array copies.
  emitBoxes();
  if (builders.some((b) => b.boxes * 8 > 0xffffffff))
    throw new Error(
      "Smooth color geometry exceeds 32-bit mesh indices. No detail was reduced.",
    );
  const buffer = (Type, length) => ({
    data: new Type(length),
    length: 0,
    push(...values) {
      this.data.set(values, this.length);
      this.length += values.length;
    },
  });
  builders = builders.map((b) => ({
    p: buffer(Float32Array, b.boxes * 24),
    i: buffer(Uint32Array, b.boxes * 36),
  }));
  emitBoxes();
  return builders
    .map((b, k) => ({
      name: names[k],
      color: colors[k],
      extruder: k + 1,
      mesh: {
        positions: b.p.data,
        indices: b.i.data,
      },
    }))
    .filter((p) => p.mesh.indices.length);
}
export function solidPlan(rgba, nx, ny, s) {
  const c = solidConfig(s),
    { cols, rows } = c,
    sums = new Float64Array(cols * rows * 3),
    samples = new Uint32Array(cols * rows);
  for (let y = 0; y <= ny; y++)
    for (let x = 0; x <= nx; x++) {
      const cell =
          Math.min(rows - 1, Math.floor(((ny - y) * rows) / (ny + 1))) * cols +
          Math.min(cols - 1, Math.floor((x * cols) / (nx + 1))),
        src = (y * (nx + 1) + x) * 4;
      samples[cell]++;
      for (let k = 0; k < 3; k++)
        sums[cell * 3 + k] += (rgba[src + k] / 255) ** 2.2;
    }
  const lookup = palette(s, c),
    counts = new Uint8Array(cols * rows * 4),
    expected = new Float32Array(cols * rows * 3),
    cache = new Map();
  let error = 0;
  for (let i = 0; i < samples.length; i++) {
    let target;
    if (samples[i]) target = [0, 1, 2].map((k) => sums[i * 3 + k] / samples[i]);
    else {
      const x = Math.min(
          nx,
          Math.floor((((i % cols) + 0.5) * (nx + 1)) / cols),
        ),
        y = Math.min(
          ny,
          Math.floor(
            ((rows - 1 - Math.floor(i / cols) + 0.5) * (ny + 1)) / rows,
          ),
        ),
        src = (y * (nx + 1) + x) * 4;
      target = [0, 1, 2].map((k) => (rgba[src + k] / 255) ** 2.2);
    }
    const key = target.map((v) => Math.round(Math.sqrt(v) * 63)).join(",");
    let hit = cache.get(key);
    if (!hit) {
      hit = closest(lookup, target.map(Math.sqrt)).p;
      cache.set(key, hit);
    }
    counts.set(hit.counts, i * 4);
    expected.set(hit.expected, i * 3);
    error += target.reduce(
      (sum, v, k) => sum + (Math.sqrt(v) - Math.sqrt(hit.expected[k])) ** 2,
      0,
    );
  }
  return {
    config: c,
    cols,
    rows,
    counts,
    expected,
    rms: Math.sqrt(error / (3 * cols * rows)),
  };
}
export function solidLithophane(rgba, nx, ny, s, predictionOnly = false) {
  const plan = solidPlan(rgba, nx, ny, s),
    parts = predictionOnly ? [] : solidMeshes(plan, s),
    n = (nx + 1) * (ny + 1);
  parts.heights = new Float32Array(n).fill(s.solidThickness);
  parts.expected = new Float32Array(n * 3);
  for (let y = 0; y <= ny; y++)
    for (let x = 0; x <= nx; x++) {
      const cell =
        Math.min(plan.rows - 1, Math.floor((y * plan.rows) / (ny + 1))) *
          plan.cols +
        Math.min(plan.cols - 1, Math.floor((x * plan.cols) / (nx + 1)));
      parts.expected.set(
        plan.expected.subarray(cell * 3, cell * 3 + 3),
        (y * (nx + 1) + x) * 3,
      );
    }
  parts.solidReport = {
    grid: [plan.cols, plan.rows],
    pitch: [s.width / plan.cols, s.height / plan.rows],
    layers: plan.config.layers,
    rms: plan.rms,
    profile: plan.config.profile.name,
  };
  return parts;
}
export function calibrationTile(s) {
  const settings = {
      ...s,
      shape: "flat",
      width: 36,
      height: 36,
      support: "none",
      lightingSetup: "none",
    },
    c = solidConfig(settings),
    lookup = palette(settings, c),
    counts = new Uint8Array(36 * 4),
    patches = [];
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 6; x++) {
      let n = [0, 0, 0, c.inside],
        label;
      if (y < 3) {
        n[y] = Math.round((c.inside * x) / 5);
        n[3] -= n[y];
        label = names[y] + " ramp";
      } else if (y === 3) {
        const pair = [
            [0, 1],
            [0, 2],
            [1, 2],
          ][Math.floor(x / 2)],
          amount = Math.round(c.inside * (x % 2 ? 0.8 : 0.4));
        n[pair[0]] = Math.floor(amount / 2);
        n[pair[1]] = amount - n[pair[0]];
        n[3] = c.inside - amount;
        label = "Mixed pair";
      } else if (y === 4) {
        const amount = Math.round((c.inside * x) / 5);
        n[0] = Math.floor(amount / 3);
        n[1] = Math.floor(amount / 3);
        n[2] = amount - n[0] - n[1];
        n[3] = c.inside - amount;
        label = "Neutral mixture";
      } else {
        n = closest(lookup, [x / 5, x / 5, x / 5]).p.counts;
        label = "Matched gray";
      }
      counts.set(n, (y * 6 + x) * 4);
      patches.push({
        rowFromBottom: y + 1,
        columnFromLeft: x + 1,
        label,
        internalLayers: n,
        relativeLinearRGB: transmission(n, settings, c),
      });
    }
  const plan = { cols: 6, rows: 6, counts, config: c };
  return { settings, parts: solidMeshes(plan, settings), patches };
}
export function whiteCoupons(s) {
  const b = { p: [], i: [] },
    steps = [4, 8, 12, 16, 20, Math.round(s.solidThickness / s.layer)].map(
      (n) => n * s.layer,
    );
  steps.forEach((h, i) => box(b, i * 7, i * 7 + 5, 0, 12, 0, h));
  return {
    steps,
    mesh: {
      positions: new Float32Array(b.p),
      indices: new Uint32Array(b.i),
      colors: new Float32Array(b.p.length).fill(1),
    },
  };
}
