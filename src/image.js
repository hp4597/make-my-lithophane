import { tone, gridSize } from "./geometry.js";
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error("This image could not be opened. Use PNG, JPEG, or WebP."),
      );
    image.src = src;
  });
}
export function sampleImage(image, s, nx, ny, color = false) {
  const canvas = document.createElement("canvas");
  canvas.width = nx + 1;
  canvas.height = ny + 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx)
    throw new Error(
      `Unable to allocate a ${nx + 1} x ${ny + 1} image canvas on this device. No detail was reduced.`,
    );
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const rotated = s.rotation % 180 !== 0,
    iw = rotated ? image.height : image.width,
    ih = rotated ? image.width : image.height;
  const factor =
    (s.fit === "contain"
      ? Math.min(canvas.width / iw, canvas.height / ih)
      : Math.max(canvas.width / iw, canvas.height / ih)) * s.zoom;
  ctx.save();
  ctx.filter = `saturate(${1 + s.saturation / 100}) hue-rotate(${s.hue}deg)`;
  ctx.translate(
    canvas.width / 2 + (s.panX / 100) * canvas.width,
    canvas.height / 2 + (s.panY / 100) * canvas.height,
  );
  ctx.scale(s.flip ? -1 : 1, 1);
  ctx.rotate((s.rotation * Math.PI) / 180);
  ctx.drawImage(
    image,
    (-image.width * factor) / 2,
    (-image.height * factor) / 2,
    image.width * factor,
    image.height * factor,
  );
  ctx.restore();
  if (s.text) {
    ctx.font = `600 ${(s.textSize / s.height) * canvas.height}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#151515";
    ctx.fillText(
      s.text,
      canvas.width / 2,
      canvas.height * 0.88,
      canvas.width * 0.9,
    );
  }
  if (color) {
    const adjusted = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < adjusted.data.length; i += 4)
      for (let c = 0; c < 3; c++)
        adjusted.data[i + c] = Math.round(
          tone(adjusted.data[i + c] / 255, s) * 255,
        );
    ctx.putImageData(adjusted, 0, 0);
    return canvas;
  }
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data,
    pixels = new Float32Array(canvas.width * canvas.height);
  for (let y = 0; y <= ny; y++)
    for (let x = 0; x <= nx; x++) {
      const i = ((ny - y) * (nx + 1) + x) * 4;
      pixels[y * (nx + 1) + x] = tone(
        (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255,
        s,
      );
    }
  return pixels;
}
export function demoImage() {
  const c = document.createElement("canvas");
  c.width = 1000;
  c.height = 750;
  const ctx = c.getContext("2d");
  const sky = ctx.createLinearGradient(0, 0, 0, 750);
  sky.addColorStop(0, "#294a60");
  sky.addColorStop(0.6, "#e7cfaa");
  sky.addColorStop(1, "#819e9e");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1000, 750);
  ctx.fillStyle = "#fff3cb";
  ctx.beginPath();
  ctx.arc(720, 210, 65, 0, Math.PI * 2);
  ctx.fill();
  const mountains = [
    [
      "#6e858b",
      [
        [0, 430],
        [190, 170],
        [370, 390],
        [560, 210],
        [830, 430],
        [1000, 290],
      ],
    ],
    [
      "#3e626c",
      [
        [0, 540],
        [230, 320],
        [470, 530],
        [750, 315],
        [1000, 520],
      ],
    ],
    [
      "#213f4a",
      [
        [0, 630],
        [220, 480],
        [460, 620],
        [670, 480],
        [1000, 590],
      ],
    ],
  ];
  for (const [color, points] of mountains) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 750);
    for (const [x, y] of points) ctx.lineTo(x, y);
    ctx.lineTo(1000, 750);
    ctx.fill();
  }
  ctx.fillStyle = "#ece9d7";
  ctx.beginPath();
  ctx.moveTo(190, 170);
  ctx.lineTo(126, 258);
  ctx.lineTo(183, 235);
  ctx.lineTo(208, 259);
  ctx.lineTo(243, 242);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#112e35";
  for (let j = 0; j < 14; j++) {
    const x = j * 83 - 20,
      h = 60 + (Math.sin(j * 7) + 1) * 70;
    ctx.fillRect(x - 4, 730 - h, 8, h);
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(x, 700 - h + k * 24);
      ctx.lineTo(x - 30 - k * 8, 760 - h + k * 24);
      ctx.lineTo(x + 30 + k * 8, 760 - h + k * 24);
      ctx.fill();
    }
  }
  return c.toDataURL("image/png");
}

// Native-resolution optical image, independent of the interactive mesh budget.
export function backlitImage(image, s) {
  const rotated = s.rotation % 180 !== 0;
  let w = rotated ? image.height : image.width,
    h = rotated ? image.width : image.height;
  if (s.resolutionMode === "spacing") {
    const { nx, ny } = gridSize(s, true, image),
      ratio = (nx + 1) / (ny + 1);
    w = Math.max(
      2,
      Math.round((s.fit === "contain" ? Math.max : Math.min)(w, h * ratio)),
    );
    h = Math.max(2, Math.round(w / ratio));
  }
  const canvas = sampleImage(image, s, w - 1, h - 1, true);
  if (s.colorMode !== "paper") {
    const values = sampleImage(image, s, w - 1, h - 1),
      ctx = canvas.getContext("2d"),
      data = ctx.getImageData(0, 0, w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let light = values[(h - 1 - y) * w + x];
        if (s.shape === "moon") {
          const u = x / (w - 1),
            v = 1 - y / (h - 1);
          light = Math.max(
            0,
            Math.min(
              1,
              light * (1 - s.moon) +
                s.moon *
                  (0.5 +
                    0.2 *
                      Math.sin(u * 127 + Math.sin(v * 61)) *
                      Math.cos(v * 89)),
            ),
          );
        }
        const i = (y * w + x) * 4,
          c = (0.07 + 0.93 * light) * 255;
        data.data[i] = c;
        data.data[i + 1] = c * 0.977;
        data.data[i + 2] = c * 0.914;
      }
    ctx.putImageData(data, 0, 0);
  }
  return canvas;
}
