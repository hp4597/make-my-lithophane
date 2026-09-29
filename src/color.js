import { buildMesh, defaults } from "./geometry.js";

export const starterFilaments = [
  { name: "Black PLA", color: "#18191b", transmission: 0.5, thickness: 0.8 },
  {
    name: "Deep blue PLA",
    color: "#164984",
    transmission: 1.8,
    thickness: 0.64,
  },
  {
    name: "Warm yellow PLA",
    color: "#f4bd38",
    transmission: 2.2,
    thickness: 0.64,
  },
  { name: "White PLA", color: "#f7f4ea", transmission: 3.2, thickness: 0.8 },
];
export function parseHex(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}
export function validateFilaments(filaments, layer) {
  if (!Array.isArray(filaments) || filaments.length < 2 || filaments.length > 8)
    throw new Error("Choose between 2 and 8 filaments.");
  if (!Number.isFinite(layer) || layer < 0.04 || layer > 0.3)
    throw new Error("Layer height must be 0.04–0.3 mm.");
  for (const f of filaments)
    if (
      typeof f.name !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(f.color) ||
      !Number.isFinite(f.transmission) ||
      f.transmission < 0.1 ||
      f.transmission > 30 ||
      !Number.isFinite(f.thickness) ||
      f.thickness < layer ||
      f.thickness > 3
    )
      throw new Error(
        "Each filament needs a color, 0.1–30 mm transmission distance and a thickness between one layer and 3 mm.",
      );
  if (filaments[0].thickness < 0.4)
    throw new Error("The bottom filament sheet must be at least 0.4 mm thick.");
  if (filaments.reduce((a, f) => a + f.thickness, 0) > 10)
    throw new Error("Total filament stack must not exceed 10 mm.");
}
export function paletteForStack(filaments, layer) {
  validateFilaments(filaments, layer);
  let height = Math.round(filaments[0].thickness / layer) * layer,
    color = parseHex(filaments[0].color);
  const candidates = [{ height, color: [...color], filament: 0 }],
    swaps = [
      {
        height: 0,
        layer: 1,
        name: filaments[0].name,
        color: filaments[0].color,
      },
    ];
  for (let k = 1; k < filaments.length; k++) {
    const f = filaments[k],
      target = parseHex(f.color),
      start = [...color],
      count = Math.max(1, Math.round(f.thickness / layer));
    swaps.push({
      height,
      layer: Math.round(height / layer) + 1,
      name: f.name,
      color: f.color,
    });
    for (let n = 1; n <= count; n++) {
      // Approximation: transmission distance is the 99% opacity depth.
      const opacity = 1 - Math.exp((-4.60517 * n * layer) / f.transmission);
      color = start.map((x, i) => x * (1 - opacity) + target[i] * opacity);
      height += layer;
      candidates.push({ height, color: [...color], filament: k });
    }
  }
  return { candidates, swaps, min: candidates[0].height, max: height };
}
function lab([r, g, b]) {
  const linear = (v) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  [r, g, b] = [r, g, b].map(linear);
  const f = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  const x = f((r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047),
    y = f(r * 0.2126729 + g * 0.7151522 + b * 0.072175),
    z = f((r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function matchPainting(
  rgba,
  nx,
  ny,
  filaments,
  layer,
  algorithm = "lab",
) {
  const palette = paletteForStack(filaments, layer),
    useLab = algorithm === "lab",
    colors = palette.candidates.map((c) => (useLab ? lab(c.color) : c.color));
  const pixels = new Float32Array((nx + 1) * (ny + 1)),
    expected = new Float32Array(pixels.length * 3),
    cache = new Map();
  for (let y = 0; y <= ny; y++)
    for (let x = 0; x <= nx; x++) {
      const src = ((ny - y) * (nx + 1) + x) * 4,
        key =
          (rgba[src] >> 2) * 4096 +
          (rgba[src + 1] >> 2) * 64 +
          (rgba[src + 2] >> 2);
      let best = cache.get(key);
      if (best === undefined) {
        const rgb = [rgba[src], rgba[src + 1], rgba[src + 2]].map(
            (v) => v / 255,
          ),
          target = useLab ? lab(rgb) : rgb;
        let distance = Infinity;
        best = 0;
        for (let i = 0; i < colors.length; i++) {
          const d = colors[i].reduce(
            (sum, c, j) => sum + (c - target[j]) ** 2,
            0,
          );
          if (d < distance) {
            distance = d;
            best = i;
          }
        }
        cache.set(key, best);
      }
      const k = y * (nx + 1) + x,
        c = palette.candidates[best];
      pixels[k] = 1 - (c.height - palette.min) / (palette.max - palette.min);
      expected.set(
        c.color.map((v) => v ** 2.2),
        k * 3,
      );
    }
  return { pixels, expected, palette };
}

// Build closed, adjacent material volumes between two sampled surfaces.
export function volumeBetween(width, height, nx, ny, bottom, top) {
  const n = (nx + 1) * (ny + 1),
    positions = new Float32Array(n * 6),
    indices = [];
  for (let y = 0; y <= ny; y++)
    for (let x = 0; x <= nx; x++) {
      const k = y * (nx + 1) + x;
      for (let side = 0; side < 2; side++)
        positions.set(
          [
            (x / nx - 0.5) * width,
            (y / ny - 0.5) * height,
            side ? top[k] : bottom[k],
          ],
          (k + side * n) * 3,
        );
    }
  const quad = (a, b, c, d) => indices.push(a, b, c, a, c, d);
  for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++) {
      const a = y * (nx + 1) + x,
        b = a + 1,
        d = a + nx + 1,
        c = d + 1;
      quad(a + n, b + n, c + n, d + n);
      quad(a, d, c, b);
      if (y === 0) quad(a, b, b + n, a + n);
      if (x === nx - 1) quad(b, c, c + n, b + n);
      if (y === ny - 1) quad(c, d, d + n, c + n);
      if (x === 0) quad(d, a, a + n, d + n);
    }
  return {
    positions,
    indices: new Uint32Array(indices),
    colors: new Float32Array(positions.length).fill(1),
  };
}
export function colorLithophane(rgba, nx, ny, s) {
  const n = (nx + 1) * (ny + 1),
    channels = [new Float32Array(n), new Float32Array(n), new Float32Array(n)],
    white = new Float32Array(n);
  const layer = s.layer,
    maxColor = s.colorDepth;
  if (!Number.isFinite(maxColor) || maxColor < layer || maxColor > 1.6)
    throw new Error("Color depth must be between one layer and 1.6 mm.");
  for (let y = 0; y <= ny; y++)
    for (let x = 0; x <= nx; x++) {
      const src = ((ny - y) * (nx + 1) + x) * 4,
        k = y * (nx + 1) + x,
        rgb = [rgba[src], rgba[src + 1], rgba[src + 2]].map((v) => v / 255),
        peak = Math.max(...rgb, 0.01);
      for (let c = 0; c < 3; c++) {
        const density = Math.min(
          1,
          -Math.log(Math.max(0.01, rgb[c] / peak)) / 4.60517,
        );
        channels[c][k] =
          layer + Math.round((density * maxColor) / layer) * layer;
      }
      white[k] = Math.max(
        layer,
        Math.round((s.min + (1 - peak) * (s.max - s.min)) / layer) * layer,
      );
    }
  let bottom = new Float32Array(n);
  const parts = [];
  const names = ["Cyan", "Magenta", "Yellow", "White"],
    colors = ["#00bcd4", "#dc267f", "#f2d53c", "#ffffff"];
  for (let c = 0; c < 4; c++) {
    const depth = c < 3 ? channels[c] : white,
      top = bottom.map((z, k) => z + depth[k]);
    parts.push({
      name: names[c],
      color: colors[c],
      mesh: volumeBetween(s.width, s.height, nx, ny, bottom, top),
    });
    bottom = top;
  }
  return parts;
}
