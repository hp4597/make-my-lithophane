const { _electron: electron } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
(async () => {
  const app = await electron.launch({ args: ["."] });
  try {
    const page = await app.firstWindow(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(
      () =>
        document
          .querySelector("#status")
          ?.textContent.includes("Preview ready"),
      { timeout: 30000 },
    );
    await page
      .locator('[data-setting="resolutionMode"]')
      .selectOption("spacing");
    await page.locator('[data-setting="resolution"]').fill("0.35");
    await fs.mkdir("test-results", { recursive: true });
    await page.screenshot({ path: "test-results/studio.png" });
    for (const shape of [
      "curved",
      "cylinder",
      "lamp",
      "sphere",
      "moon",
      "heart",
      "silhouette",
      "nightlight",
      "box",
      "flat",
    ]) {
      await page.locator(`[data-shape="${shape}"]`).click();
      await page.waitForTimeout(450);
      await page.waitForFunction(() =>
        document.querySelector("#status").textContent.includes("Preview ready"),
      );
      assert.ok((await page.locator("#model-triangles").textContent()) !== "—");
    }
    await page.locator('[data-tab="print"]').click();
    await page.locator('[data-setting="colorMode"]').selectOption("paper");
    await page.locator('[data-view="light"]').click();
    for (const shape of [
      "flat",
      "curved",
      "cylinder",
      "lamp",
      "sphere",
      "moon",
      "heart",
      "silhouette",
      "nightlight",
      "box",
    ]) {
      await page.locator(`[data-shape="${shape}"]`).click();
      await page.waitForTimeout(400);
      await page.waitForFunction(() =>
        document.querySelector("#status").textContent.includes("Preview ready"),
      );
      assert.ok(
        await page
          .locator('[data-view="light"]')
          .evaluate((e) => e.classList.contains("active")),
      );
    }
    await page.screenshot({ path: "test-results/color-backlit.png" });
    await page.locator('[data-shape="flat"]').click();
    await page.locator('[data-tab="model"]').click();
    await page.locator('[data-setting="width"]').fill("160");
    await page.waitForTimeout(600);
    assert.match(await page.locator("#support-size").textContent(), /128.0 mm/);
    await page.locator('[data-setting="width"]').fill("120");
    await page.locator('[data-tab="print"]').click();
    await page.locator('[data-setting="colorMode"]').selectOption("mono");
    await page.locator('[data-tab="image"]').click();
    await page.locator('[data-setting="text"]').fill("Our favorite place");
    await page.locator("#rotate-photo").click();
    await page.locator('[data-view="light"]').click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: "test-results/backlit.png" });
    await page.locator('[data-tab="model"]').click();
    await page.locator('[data-setting="min"]').fill("5");
    await page.waitForTimeout(400);
    assert.match(await page.locator("#toast").textContent(), /thickness/);
    await page.locator('[data-setting="min"]').fill("0.8");
    await page.waitForTimeout(400);
    // Exercise the actual sandbox bridge and native save IPC; redirect only the dialog.
    const path = require("node:path");
    const output = path.resolve("test-results/desktop-export.stl");
    await app.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: output,
      });
    }, output);
    await page.locator("#export").click();
    await page.waitForFunction(
      () => document.querySelector("#status").textContent === "Export complete",
      { timeout: 60000 },
    );
    const bytes = await fs.readFile(output),
      triangles = bytes.readUInt32LE(80);
    assert.ok(triangles > 10000);
    assert.equal(bytes.length, 84 + triangles * 50);
    const projectPath = path.resolve("test-results/roundtrip.litho");
    await app.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: output,
      });
    }, projectPath);
    await page.locator("#save-project").click();
    await page.waitForTimeout(300);
    const project = JSON.parse(await fs.readFile(projectPath, "utf8"));
    assert.equal(project.settings.text, "Our favorite place");
    await page.locator("#project-file").setInputFiles(projectPath);
    await page.waitForFunction(
      () =>
        document.querySelector("#toast").textContent === "Project restored.",
    );
    await page.locator('[data-shape="box"]').click();
    await page.locator('[data-tab="print"]').click();
    await page.locator('[data-setting="colorMode"]').selectOption("paper");
    const kitPath = path.resolve("test-results/box-kit.zip");
    await app.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: output,
      });
    }, kitPath);
    await page.locator("#export-kit").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#toast").textContent === "Project kit saved.",
      { timeout: 60000 },
    );
    const { unzipSync } = require("fflate");
    const kit = unzipSync(await fs.readFile(kitPath));
    for (const name of [
      "lithophane.stl",
      "enclosure.stl",
      "color-backing.svg",
      "project.litho",
      "PRINTING.txt",
    ])
      assert.ok(kit[name]?.length > 50, `${name} present in kit`);
    assert.match(
      Buffer.from(kit["color-backing.svg"]).toString(),
      /width="120mm" height="90mm"/,
    );
    const enclosure = Buffer.from(kit["enclosure.stl"]);
    assert.equal(enclosure.length, 84 + enclosure.readUInt32LE(80) * 50);
    const calibrationPath = path.resolve("test-results/calibration.stl");
    await app.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: output,
      });
    }, calibrationPath);
    await page.locator("#calibration-panel").click();
    await page.waitForFunction(() =>
      document.querySelector("#toast").textContent.startsWith("10 steps"),
    );
    assert.ok((await fs.stat(calibrationPath)).size > 10000);
    await page.locator("#image-file").setInputFiles("test-results/studio.png");
    await page.waitForFunction(
      () => document.querySelector("#filename").textContent === "studio.png",
    );
    await page.locator("#guide").click();
    assert.ok(await page.locator("#guide-modal").isVisible());
    await page.locator("#close-guide").click();
    await page.locator('[data-tab="model"]').click();
    await page.locator('[data-setting="width"]').fill("40");
    await page.locator('[data-setting="height"]').fill("30");
    await page.locator('[data-setting="resolution"]').fill("1");
    await page.locator("#library-open").click();
    await page.locator('#photo-library [data-action="current"]').click();
    await page.locator('#photo-library [data-action="current"]').click();
    await page.locator("#layout").selectOption("grid");
    await page.locator('#photo-library [data-action="apply"]').click();
    await page.waitForTimeout(500);
    await page.locator("#color-studio-open").click();
    assert.ok(
      await page
        .locator('#color-studio [data-mode="chromaphane"]')
        .isDisabled(),
    );
    await page.waitForFunction(
      () => document.querySelector("#expected-color")?.width !== 400,
    );
    const colorPixels = await page
      .locator("#expected-color")
      .evaluate((c) =>
        Array.from(
          c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ),
      );
    assert.ok(
      colorPixels.some((v, i) => i % 4 === 0 && v !== colorPixels[i + 1]),
    );
    await page.screenshot({ path: "test-results/color-studio.png" });
    const cmywPath = path.resolve("test-results/cmyw-kit.zip");
    await app.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: output,
      });
    }, cmywPath);
    await page.locator('#color-studio [data-action="export"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector("#color-progress").textContent === "Ready" &&
        !document.querySelector('#color-studio [data-action="export"]')
          .disabled,
      { timeout: 60000 },
    );
    const cmyw = unzipSync(await fs.readFile(cmywPath));
    assert.ok(cmyw["predicted.png"]);
    assert.ok(cmyw["matching-support.stl"]);
    assert.ok(cmyw["print-layout.3mf"]);
    for (const name of [
      "cyan.stl",
      "magenta.stl",
      "yellow.stl",
      "white.stl",
      "color-assembly.3mf",
    ])
      assert.ok(cmyw[name]);
    await page.locator('#color-studio [data-action="close"]').click();
    await page.locator("#mount-open").click();
    const mountPath = path.resolve("test-results/mount-kit.zip");
    await app.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: output,
      });
    }, mountPath);
    await page.locator('#mount-studio [data-mount="diameter"]').fill("100");
    await page.locator('#mount-studio [data-action="export"]').click();
    await page.waitForFunction(
      () => document.querySelector("#toast").textContent === "Mount kit saved.",
    );
    const mount = unzipSync(await fs.readFile(mountPath));
    assert.ok(mount["mount.stl"]);
    assert.ok(mount["mount.3mf"]);
    await page.locator('#mount-studio [data-action="close"]').click();
    await page.locator("#library-open").click();
    await page.locator('#photo-library [data-action="current"]').click();
    await page.locator('#photo-library [data-action="current"]').click();
    const boxPath = path.resolve("test-results/four-photo-box.zip");
    await app.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: output,
      });
    }, boxPath);
    await page.locator('#photo-library [data-action="box"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector("#toast").textContent ===
        "Four-sided light box kit saved.",
    );
    const boxKit = unzipSync(await fs.readFile(boxPath));
    for (const name of [
      "front.stl",
      "right.stl",
      "back.stl",
      "left.stl",
      "base.stl",
      "assembled-light-box.3mf",
    ])
      assert.ok(boxKit[name]);
    const modelPath = path.resolve("test-results/model.3mf");
    await app.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: output,
      });
    }, modelPath);
    await page.locator("#export-3mf").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#toast").textContent ===
        "3MF model saved in millimeters.",
    );
    assert.ok(unzipSync(await fs.readFile(modelPath))["3D/3dmodel.model"]);
    await app.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: output,
      });
    }, projectPath);
    await page.locator("#save-project").click();
    await page.waitForTimeout(400);
    const complete = JSON.parse(await fs.readFile(projectPath, "utf8"));
    assert.equal(complete.library.photos.length, 4);
    assert.equal(complete.colorStudio.filaments.length, 4);
    await page.locator("#project-file").setInputFiles(projectPath);
    await page.waitForFunction(
      () =>
        document.querySelector("#toast").textContent === "Project restored.",
    );
    await page.locator("#project-name").fill("Recovery test");
    await page.waitForTimeout(3100);
    await page.evaluate(
      () => (document.querySelector("#project-name").value = "Temporary name"),
    );
    await page.locator("#recover-project").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#toast")
        .textContent.startsWith("Recovered project from"),
    );
    assert.equal(
      await page.locator("#project-name").inputValue(),
      "Recovery test",
    );
    assert.deepEqual(errors, []);
    console.log(
      `Desktop smoke test passed: 10 shapes, photo edits/import, validation, STL (${triangles} triangles), project save/open, ZIP enclosure kit, 1:1 SVG, calibration, gallery layout, painting WIP gate, CMYW assembly, mount kit. No renderer errors.`,
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
