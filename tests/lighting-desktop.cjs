const { _electron: electron } = require("@playwright/test");
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  { unzipSync, strFromU8 } = require("fflate");
async function dismissChooser(page) {
  if (await page.locator("#type-chooser").evaluate((d) => d.open))
    await page.locator("#close-type-chooser").click();
}
async function chooseShape(page, shape) {
  await page.locator("#change-type").click();
  await page.locator(`#type-chooser [data-shape="${shape}"]`).click();
}
(async () => {
  const profile = await fs.mkdtemp(
    path.join(require("node:os").tmpdir(), "litho-lighting-"),
  );
  const app = await electron.launch({
    args: [".", "--user-data-dir=" + profile],
  });
  try {
    const page = await app.firstWindow(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(() =>
      document.querySelector("#status")?.textContent.includes("Preview ready"),
    );
    await dismissChooser(page);
    async function update(action) {
      const before = await page
        .locator("#viewport")
        .getAttribute("data-revision");
      await action();
      await page.waitForFunction(
        (n) =>
          +document.querySelector("#viewport").dataset.revision > +n &&
          document
            .querySelector("#status")
            .textContent.includes("Preview ready"),
        before,
        { timeout: 60000 },
      );
      assert.equal(await page.locator("dialog[open]").count(), 0);
    }
    await update(() =>
      page.locator('[data-setting="resolutionMode"]').selectOption("spacing"),
    );
    await update(() => page.locator('[data-setting="resolution"]').fill("1"));
    await page.locator('[data-tab="light"]').click();
    await update(() =>
      page.locator('[data-setting="lightingSetup"]').selectOption("modular"),
    );
    await update(() =>
      page.locator('[data-setting="boardCount"]').selectOption("3"),
    );
    assert.equal(
      await page.locator('[data-setting="boardWidth"]').inputValue(),
      "144",
    );
    await update(() => page.locator("#fit-light").click());
    await update(() =>
      page.locator('[data-setting="lightingSetup"]').selectOption("fixed"),
    );
    await update(() => page.locator("#fit-light").click());
    assert.equal(
      await page.locator('[data-setting="boardWidth"]').inputValue(),
      "156",
    );
    const output = path.resolve("test-results/lighting-kit.zip");
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, output);
    await page.locator("#export-kit").click();
    await page.waitForFunction(
      () => document.querySelector("#status").textContent === "Export complete",
    );
    let files = unzipSync(await fs.readFile(output));
    assert.ok(files["rear-cover.stl"]);
    assert.ok(files["front-retainer.stl"]);
    assert.ok(files["left-board-tray.stl"]);
    await update(() =>
      page.locator('[data-setting="lightingSetup"]').selectOption("strip"),
    );
    await update(() => page.locator('[data-setting="diffuser"]').check());
    for (const shape of [
      "flat",
      "curved",
      "cylinder",
      "lamp",
      "nightlight",
      "box",
    ]) {
      await update(async () => {
        await chooseShape(page, shape);
      });
      await page.locator('[data-setting="colorMode"]').selectOption("cmyw");
      await page.waitForFunction(
        () => document.querySelector("#viewport").dataset.colorMode === "cmyw",
      );
      await page.locator("#export-color").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#status").textContent === "Export complete",
        null,
        { timeout: 60000 },
      );
      files = unzipSync(await fs.readFile(output));
      assert.ok(files["cyan.stl"]);
      assert.ok(files["print-layout.3mf"]);
      const xml = strFromU8(
        unzipSync(files["print-layout.3mf"])["3D/3dmodel.model"],
      );
      assert.match(xml, /diffuser/);
      await page.locator("#reset-view").click();
      await page.screenshot({ path: `test-results/lighting-${shape}.png` });
    }
    await page.locator('[data-tab="light"]').click();
    await page.screenshot({ path: "test-results/lighting-sidebar.png" });
    assert.deepEqual(errors, []);
    console.log(
      "Lighting desktop passed: presets, live settings, separate mono kit, six CMYW geometry/lighting exports, backlit previews, no dialogs or renderer errors.",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
