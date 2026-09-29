const { _electron: electron } = require("@playwright/test");
const assert = require("node:assert/strict"),
  path = require("node:path"),
  fs = require("node:fs/promises"),
  { unzipSync, strFromU8 } = require("fflate");
(async () => {
  const profile = await fs.mkdtemp(
    require("node:path").join(require("node:os").tmpdir(), "litho-test-"),
  );
  const app = await electron.launch({
    args: [".", "--user-data-dir=" + profile],
  });
  try {
    assert.equal(
      await app.evaluate(({ app }) => app.getPath("userData")),
      profile,
    );
    const page = await app.firstWindow(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(() =>
      document.querySelector("#status")?.textContent.includes("Preview ready"),
    );
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
    const canvas = page.locator("#viewport canvas");
    const hash = () => canvas.evaluate((c) => c.toDataURL());
    await update(() =>
      page.locator('[data-setting="resolutionMode"]').selectOption("spacing"),
    );
    await update(() => page.locator('[data-setting="resolution"]').fill("1"));
    await page.locator('[data-tab="print"]').click();
    await update(() =>
      page.locator('[data-setting="colorMode"]').selectOption("cmyw"),
    );
    const colorA = await hash();
    await update(() =>
      page.locator('[data-setting="colorDepth"]').fill("0.16"),
    );
    assert.notEqual(await hash(), colorA);
    await update(async () => {
      await page.locator('[data-setting="colorDepth"]').fill("0.32");
      await page.locator('[data-setting="colorDepth"]').fill("0.64");
      await page.locator('[data-setting="colorMode"]').selectOption("mono");
    });
    assert.equal(
      await page.locator("#viewport").getAttribute("data-color-mode"),
      "mono",
    );
    await page.locator('[data-tab="supports"]').click();
    await update(() =>
      page.locator('[data-setting="support"]').selectOption("case"),
    );
    const beforeStand = await hash();
    await update(() =>
      page.locator('[data-setting="support"]').selectOption("stand"),
    );
    assert.notEqual(await hash(), beforeStand);
    await update(() => page.locator("#mount-type").selectOption("clip"));
    await update(() => page.locator('[data-mount="width"]').fill("55"));
    assert.ok(await page.locator("#hardware-enabled").isChecked());
    await page.locator("#reset-view").click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: "test-results/live-supports.png" });
    await page.locator('[data-tab="print"]').click();
    await update(() =>
      page.locator('[data-setting="colorMode"]').selectOption("cmyw"),
    );
    await page.screenshot({ path: "test-results/live-color.png" });
    const output = path.resolve("test-results/live-cmyw.zip");
    await app.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: output,
      });
    }, output);
    await page.locator("#export-color").click();
    await page.waitForFunction(
      () => document.querySelector("#status").textContent === "Export complete",
      null,
      { timeout: 60000 },
    );
    const files = unzipSync(await fs.readFile(output));
    assert.ok(files["hardware.stl"]);
    const xml = strFromU8(
      unzipSync(files["print-layout.3mf"])["3D/3dmodel.model"],
    );
    assert.match(xml, /Optional hardware/);
    assert.match(xml, /Matching stand/);
    const project = JSON.parse(strFromU8(files["project.litho"]));
    assert.equal(project.settings.colorMode, "cmyw");
    assert.equal(project.mountStudio.p.width, 55);
    assert.equal(project.mountStudio.enabled, true);
    await page.locator('[data-tab="photos"]').click();
    await page.locator('#photo-library [data-action="current"]').click();
    await update(() => page.locator("#layout").selectOption("grid"));
    await page.screenshot({ path: "test-results/live-photos.png" });
    const panelBounds = await page.locator("#photo-library").boundingBox(),
      sideBounds = await page.locator(".right").boundingBox();
    assert.ok(panelBounds.width <= sideBounds.width);
    assert.equal(await page.locator("#viewport canvas").count(), 1);
    assert.deepEqual(errors, []);
    console.log(
      "Live panel passed: no settings dialogs, live CMYW and support changes, stale preview protection, persistent hardware and matching multipart export, live photo layout.",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
