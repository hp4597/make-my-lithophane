import { gridSize } from "./geometry.js";
import { starterFilaments, paletteForStack } from "./color.js";
import { sampleImage } from "./image.js";
import { unzipSync, zipSync, strToU8 } from "fflate";
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
  async function process(settings, source, preview) {
    const { nx, ny } = gridSize(
      preview ? { ...settings, resolutionMode: "image" } : settings,
      false,
      source,
      preview ? 16000000 : 1000000,
    );
    const canvas = sampleImage(source, settings, nx, ny, true),
      rgba = canvas.getContext("2d").getImageData(0, 0, nx + 1, ny + 1).data,
      id = ++serial;
    const result = await new Promise((resolve, reject) => {
      jobs.set(id, { resolve, reject });
      worker.postMessage(
        {
          id,
          settings,
          nx,
          ny,
          rgba,
          mode: "cmyw",
          preview,
          hardware: preview ? null : api.getHardware?.(),
        },
        [rgba.buffer],
      );
    });
    return { ...result, texture: predictionCanvas(result), source: canvas };
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
    export: async (format = "kit") => {
      const s = { ...api.getSettings() };
      if (!["flat", "box"].includes(s.shape))
        throw new Error(
          "CMYW export supports flat panels and light boxes. Select one of those shapes to export.",
        );
      const result = await process(s, api.getImage(), false),
        files = unzipSync(result.bytes);
      if (format === "3mf") {
        if (
          await api.saveFile(
            api.getName() + ".3mf",
            files["print-layout.3mf"] || files["color-assembly.3mf"],
          )
        )
          api.toast("3MF model saved in millimeters.");
        return;
      }
      files["project.litho"] = strToU8(api.getProject());
      for (const [name, canvas] of [
        ["target.png", result.source],
        ["predicted.png", result.texture],
      ]) {
        const blob = await new Promise((r) => canvas.toBlob(r));
        files[name] = new Uint8Array(await blob.arrayBuffer());
      }
      if (
        await api.saveFile(
          api.getName() + "-cmyw.zip",
          zipSync(files, { level: 3 }),
        )
      )
        api.toast(
          "Color kit generated. Check filament assignments and swap heights in your slicer.",
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
