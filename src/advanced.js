import { gridSize } from "./geometry.js";
import { starterFilaments, paletteForStack } from "./color.js";
import { sampleImage } from "./image.js";
export function predictionCanvas(result) {
  const canvas = document.createElement("canvas");
  canvas.width = result.nx + 1;
  canvas.height = result.ny + 1;
  const ctx = canvas.getContext("2d"),
    pixels = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y <= result.ny; y++)
    for (let x = 0; x <= result.nx; x++) {
      const a = (y * canvas.width + x) * 3,
        b = ((result.ny - y) * canvas.width + x) * 4;
      for (let c = 0; c < 3; c++)
        pixels.data[b + c] = 255 * Math.pow(result.expected[a + c], 1 / 2.2);
      pixels.data[b + 3] = 255;
    }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}
export function initAdvanced(api) {
  const worker = new Worker(new URL("./advanced.worker.js", import.meta.url), {
      type: "module",
    }),
    jobs = new Map();
  let serial = 0,
    legacy = { filaments: structuredClone(starterFilaments), algorithm: "lab" };
  worker.onmessage = ({ data }) => {
    const job = jobs.get(data.id);
    if (job) {
      jobs.delete(data.id);
      data.error ? job.reject(new Error(data.error)) : job.resolve(data);
    }
  };
  worker.onerror = () => {
    for (const j of jobs.values())
      j.reject(new Error("Color generation failed."));
    jobs.clear();
  };
  async function process(
    settings,
    source,
    preview,
    format = "kit",
    calibration = false,
  ) {
    const { nx, ny } = gridSize(
      preview ? { ...settings, resolutionMode: "image" } : settings,
      false,
      source,
    );
    const canvas = sampleImage(source, settings, nx, ny, true),
      rgba = canvas.getContext("2d").getImageData(0, 0, nx + 1, ny + 1).data,
      id = ++serial;
    const targetPNG =
      !preview && format !== "3mf"
        ? new Uint8Array(
            await (await new Promise((r) => canvas.toBlob(r))).arrayBuffer(),
          )
        : null;
    const result = await new Promise((resolve, reject) => {
      jobs.set(id, { resolve, reject });
      worker.postMessage(
        {
          id,
          format,
          calibration,
          targetPNG,
          project: preview ? null : api.getProject(),
          settings,
          nx,
          ny,
          rgba,
          mode: "cmyw",
          preview,
          hardware: preview ? null : api.getHardware?.(),
        },
        targetPNG ? [rgba.buffer, targetPNG.buffer] : [rgba.buffer],
      );
    });
    return preview
      ? { ...result, texture: predictionCanvas(result), source: canvas }
      : result;
  }
  let activePreview = false,
    pendingPreview = null;
  function pumpPreview() {
    if (activePreview || !pendingPreview) return;
    const task = pendingPreview;
    pendingPreview = null;
    activePreview = true;
    process(task.s, task.source, true)
      .then(task.resolve, task.reject)
      .finally(() => {
        activePreview = false;
        pumpPreview();
      });
  }
  return {
    preview: (s, source) =>
      new Promise((resolve, reject) => {
        pendingPreview?.reject(
          new Error("Preview superseded by a newer edit."),
        );
        pendingPreview = { s, source, resolve, reject };
        pumpPreview();
      }),
    calibration: async () => {
      const s = {
        ...api.getSettings(),
        shape: "flat",
        width: 36,
        height: 36,
        colorMode: "cmyw",
        colorStructure:
          api.getSettings().colorStructure === "dedicated"
            ? "dedicated"
            : "solid",
        support: "none",
        lightingSetup: "none",
        resolutionMode: "spacing",
        resolution: 2,
      };
      const result = await process(s, api.getImage(), false, "kit", true);
      await api.saveFile("solid-color-calibration.zip", result.bytes);
    },
    export: async (format = "kit") => {
      const s = { ...api.getSettings() };
      if (
        !["flat", "box", "curved", "nightlight", "cylinder", "lamp"].includes(
          s.shape,
        )
      )
        throw new Error(
          "CMYW export supports flat, curved, cylinder, lamp shade, night light and lightbox.",
        );
      const result = await process(s, api.getImage(), false, format);
      if (
        await api.saveFile(
          api.getName() + (format === "3mf" ? ".3mf" : "-cmyw.zip"),
          result.bytes,
        )
      )
        api.toast(
          format === "3mf"
            ? "3MF model saved in millimeters."
            : "Color kit generated. Check filament assignments in your slicer.",
        );
    },
    getState: () => ({
      ...legacy,
      layer: api.getSettings().layer,
      colorDepth: api.getSettings().colorDepth,
    }),
    setState: (s) => {
      if (s) {
        paletteForStack(s.filaments, s.layer);
        legacy = { filaments: s.filaments, algorithm: s.algorithm };
      }
    },
  };
}
