import { loadImage } from "./image.js";
export function initLibrary(api) {
  let photos = [],
    layout = "single",
    gap = 3,
    background = 0,
    cache;
  const dialog = document.createElement("section");
  dialog.id = "photo-library";
  dialog.className = "inline-tool";
  dialog.hidden = true;
  document.querySelector("#tool-panels").append(dialog);
  const button = document.createElement("button");
  button.className = "guide-button";
  button.id = "library-open";
  button.textContent = "Photo library & layouts →";
  document.querySelector(".spaced").before(button);
  function draw() {
    dialog.innerHTML = `<span class="eyebrow">PHOTO LIBRARY</span><div class="panel-title">Photo library & layouts</div><p>Keep up to eight photos in your project. Select one, arrange a collage, wrap a panorama around a lamp, or export individual panels.</p><div class="button-row"><button data-action="import">Add photos</button><button data-action="current">Add current photo</button></div><div id="gallery"></div><div class="field-row"><label class="field"><span>Layout</span><select id="layout"><option value="single">Current photo</option><option value="strip">Horizontal panorama</option><option value="grid">Photo grid</option></select></label><label class="field"><span>Gap (mm)</span><input id="photo-gap" type="number" min="0" max="20" value="${gap}"/></label></div><label class="range-field"><span>Gap brightness <output>${background}</output></span><input id="gap-brightness" type="range" min="0" max="1" step="0.05" value="${background}"/></label><p class="hint">Each image fills its cell. Image adjustments in the main editor apply to the whole composition. Drag ordering is replaced by the arrow buttons for precise placement.</p><div class="dialog-actions"><button data-action="batch">Export individual panels</button><button data-action="box">Four-sided light box</button></div><input id="library-files" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden/>`;
    dialog.querySelector("#layout").value = layout;
    const gallery = dialog.querySelector("#gallery");
    photos.forEach((p, i) => {
      const card = document.createElement("div");
      card.className = "gallery-card";
      const image = document.createElement("img");
      image.src = p.src;
      image.alt = p.name;
      card.append(image);
      const name = document.createElement("span");
      name.textContent = p.name;
      card.append(name);
      const actions = document.createElement("div");
      for (const [label, action] of [
        ["Use", "use"],
        ["←", "left"],
        ["×", "remove"],
      ]) {
        const b = document.createElement("button");
        b.textContent = label;
        b.dataset.photo = i;
        b.dataset.action = action;
        actions.append(b);
      }
      card.append(actions);
      gallery.append(card);
    });
  }
  function invalidate() {
    cache = null;
    api.changed();
  }
  function getImage() {
    if (layout === "single" || !photos.length) return api.currentImage();
    const s = api.getSettings(),
      w = ["cylinder", "lamp", "sphere", "moon"].includes(s.shape)
        ? s.width * Math.PI
        : s.width,
      h = ["sphere", "moon"].includes(s.shape)
        ? (s.width * Math.PI) / 2
        : s.height,
      key = [
        layout,
        gap,
        background,
        w,
        h,
        photos.map((p) => p.name + ":" + p.src.length).join("|"),
      ].join(":");
    if (cache?.key === key) return cache.canvas;
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(3000, Math.max(500, Math.round(w * 8)));
    canvas.height = Math.max(
      100,
      Math.min(3000, Math.round((canvas.width * h) / w)),
    );
    const ctx = canvas.getContext("2d"),
      gray = Math.round(background * 255);
    ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cols =
        layout === "strip"
          ? photos.length
          : Math.ceil(Math.sqrt(photos.length)),
      rows = Math.ceil(photos.length / cols),
      g = (gap / w) * canvas.width,
      cw = (canvas.width - (cols - 1) * g) / cols,
      ch = (canvas.height - (rows - 1) * g) / rows;
    if (cw <= 0 || ch <= 0) return api.currentImage();
    photos.forEach((p, i) => {
      const x = (i % cols) * (cw + g),
        y = Math.floor(i / cols) * (ch + g),
        scale = Math.max(cw / p.image.width, ch / p.image.height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, cw, ch);
      ctx.clip();
      ctx.drawImage(
        p.image,
        x + (cw - p.image.width * scale) / 2,
        y + (ch - p.image.height * scale) / 2,
        p.image.width * scale,
        p.image.height * scale,
      );
      ctx.restore();
    });
    cache = { key, canvas };
    return canvas;
  }
  async function add(src, name) {
    if (photos.length >= 8)
      throw new Error("A project can contain up to eight photos.");
    if (
      photos.reduce((sum, p) => sum + p.src.length, 0) + src.length >
      55 * 1024 * 1024
    )
      throw new Error(
        "Photo library is limited to 55 MB. Resize large photos first.",
      );
    photos.push({ src, name, image: await loadImage(src) });
    cache = null;
    api.changed();
  }
  button.onclick = () => {
    draw();
    api.open();
  };
  dialog.addEventListener("input", (e) => {
    if (["layout", "photo-gap", "gap-brightness"].includes(e.target.id)) {
      const nextGap = Number(dialog.querySelector("#photo-gap").value);
      if (!Number.isFinite(nextGap) || nextGap < 0 || nextGap > 20) return;
      gap = nextGap;
      background = Number(dialog.querySelector("#gap-brightness").value);
      layout = dialog.querySelector("#layout").value;
      invalidate();
    }
  });
  dialog.addEventListener("change", async (e) => {
    try {
      if (e.target.id === "library-files") {
        for (const file of e.target.files) {
          if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
            throw new Error("Only PNG, JPG and WebP photos are supported.");
          const src = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(new Error("Could not read photo."));
            r.readAsDataURL(file);
          });
          await add(src, file.name);
        }
        draw();
      }
    } catch (err) {
      api.toast(err.message, true);
      draw();
    }
  });
  dialog.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    try {
      const i = Number(b.dataset.photo);
      switch (b.dataset.action) {
        case "close":
          break;
        case "import":
          dialog.querySelector("#library-files").click();
          break;
        case "current":
          await add(api.currentSource(), api.currentName());
          draw();
          break;
        case "use":
          layout = "single";
          await api.setPhoto(photos[i].src, photos[i].name);
          draw();

          invalidate();
          break;
        case "left":
          if (i > 0) {
            [photos[i], photos[i - 1]] = [photos[i - 1], photos[i]];
            invalidate();
            draw();
          }
          break;
        case "remove":
          photos.splice(i, 1);
          invalidate();
          draw();
          break;
        case "apply": {
          const nextGap = Number(dialog.querySelector("#photo-gap").value);
          if (!Number.isFinite(nextGap) || nextGap < 0 || nextGap > 20)
            throw new Error("Photo gap must be 0–20 mm.");
          gap = nextGap;
          background = Number(dialog.querySelector("#gap-brightness").value);
          layout = dialog.querySelector("#layout").value;

          invalidate();
          break;
        }
        case "box":
          if (photos.length < 4)
            throw new Error("Add at least four photos first.");

          await api.box(photos);
          break;
        case "batch":
          if (!photos.length) throw new Error("Add photos first.");

          await api.batch(photos);
          break;
      }
    } catch (err) {
      api.toast(err.message, true);
    }
  });
  return {
    show: (visible) => {
      dialog.hidden = !visible;
      if (visible) draw();
    },
    getImage,
    getState: () => ({
      layout,
      gap,
      background,
      photos: photos.map(({ src, name }) => ({ src, name })),
    }),
    resetLayout: () => {
      layout = "single";
      cache = null;
    },
    setState: async (s) => {
      if (!s) {
        photos = [];
        layout = "single";
        cache = null;
        return;
      }
      if (
        !["single", "strip", "grid"].includes(s.layout) ||
        !Array.isArray(s.photos) ||
        s.photos.length > 8 ||
        !Number.isFinite(s.gap) ||
        s.gap < 0 ||
        s.gap > 20 ||
        !Number.isFinite(s.background) ||
        s.background < 0 ||
        s.background > 1
      )
        throw new Error("Invalid photo library.");
      const next = [];
      for (const p of s.photos) {
        if (
          typeof p.src !== "string" ||
          !/^data:image\/(png|jpeg|webp);base64,/.test(p.src)
        )
          throw new Error("Invalid library image.");
        next.push({ ...p, image: await loadImage(p.src) });
      }
      photos = next;
      layout = s.layout;
      gap = s.gap;
      background = s.background;
      cache = null;
    },
  };
}
