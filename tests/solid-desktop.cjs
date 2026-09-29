const { _electron: electron } = require("@playwright/test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  { unzipSync, strFromU8 } = require("fflate");
(async () => {
  const profile = await fs.mkdtemp(
      path.join(require("node:os").tmpdir(), "litho-solid-"),
    ),
    app = await electron.launch({ args: [".", "--user-data-dir=" + profile] });
  try {
    const page = await app.firstWindow(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(() =>
      document.querySelector("#status")?.textContent.includes("Preview ready"),
    );
    const update = async (action) => {
      const n = await page.locator("#viewport").getAttribute("data-revision");
      await action();
      await page.waitForFunction(
        (n) =>
          +document.querySelector("#viewport").dataset.revision > +n &&
          document
            .querySelector("#status")
            .textContent.includes("Preview ready"),
        n,
        { timeout: 60000 },
      );
    };
    await page.locator('[data-tab="print"]').click();
    await update(() =>
      page.locator('[data-setting="colorMode"]').selectOption("cmyw"),
    );
    await update(() =>
      page.locator('[data-setting="colorStructure"]').selectOption("solid"),
    );
    await update(() => page.locator("#small-solid").click());
    assert.match(
      await page.locator("#export-spacing").textContent(),
      /100 x 75 cells/,
    );
    const output = path.resolve("test-results/solid-panel.zip");
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, output);
    await page.locator("#export-color").click();
    await page.waitForFunction(
      () => document.querySelector("#status").textContent === "Export complete",
      null,
      { timeout: 60000 },
    );
    const files = unzipSync(await fs.readFile(output));
    assert.ok(files["SOLID-PANEL.json"]);
    assert.ok(files["transmission-profile.json"]);
    assert.ok(files["predicted.png"]);
    const report = JSON.parse(strFromU8(files["SOLID-PANEL.json"]));
    assert.deepEqual(report.grid, [100, 75]);
    const model = unzipSync(files["color-assembly.3mf"]);
    assert.match(
      strFromU8(model["Metadata/model_settings.config"]),
      /key="extruder" value="4"/,
    );
    await page.screenshot({ path: "test-results/solid-panel.png" });
    const calibration = path.resolve("test-results/solid-calibration.zip");
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, calibration);
    await page.locator("#solid-calibration").click();
    await page.waitForFunction(
      () => document.querySelector("#status").textContent === "Export complete",
      null,
      { timeout: 60000 },
    );
    const kit = unzipSync(await fs.readFile(calibration));
    assert.ok(kit["calibration-tile.3mf"]);
    assert.ok(kit["white-thickness-coupons.stl"]);
    assert.equal(JSON.parse(strFromU8(kit["patches.json"])).length, 36);
    await fs.writeFile(
      "test-results/solid-calibration.3mf",
      kit["calibration-tile.3mf"],
    );
    await page.locator('[data-setting="solidFront"]').fill("0.17");
    await page.waitForFunction(
      () =>
        document.querySelector("#status").textContent ===
        "Settings need attention",
    );
    assert.match(await page.locator("#toast").textContent(), /multiples/);
    assert.equal(
      await page.locator("#viewport").getAttribute("data-preview-state"),
      "error",
    );
    assert.equal(await page.locator("#viewport canvas").isVisible(), false);
    assert.equal(await page.locator("#model-size").textContent(), "—");
    await update(() =>
      page.locator('[data-setting="solidFront"]').fill("0.16"),
    );
    assert.equal(await page.locator("#viewport canvas").isVisible(), true);
    await page.locator('[data-tab="model"]').click();
    await update(() => page.locator('[data-setting="width"]').fill("480"));
    await update(() => page.locator('[data-setting="height"]').fill("360"));
    assert.match(
      await page.locator("#export-spacing").textContent(),
      /1200 x 900 cells/,
    );
    assert.match(
      await page.locator("#model-size").textContent(),
      /480.0 × 360.0 × 2.4/,
    );
    await page.screenshot({ path: "test-results/large-solid-panel.png" });
    const largeOutput = path.resolve("test-results/large-solid-panel.3mf");
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, largeOutput);
    await page.locator("#export-3mf").click();
    await page.waitForFunction(
      () => document.querySelector("#status").textContent === "Export complete",
      null,
      { timeout: 180000 },
    );
    const largeFiles = unzipSync(await fs.readFile(largeOutput));
    const largeXml = strFromU8(largeFiles["3D/3dmodel.model"]);
    assert.ok(
      largeXml.includes('x="240.00000"') && largeXml.includes('y="180.00000"'),
    );
    assert.ok(largeXml.includes('name="White"'));
    await update(() => page.locator('[data-setting="height"]').fill("180"));
    await update(() => page.locator('[data-setting="width"]').fill("900"));
    assert.match(
      await page.locator("#model-size").textContent(),
      /900.0 × 180.0 × 2.4/,
    );
    await page.locator('[data-tab="print"]').click();
    await update(() => page.locator("#small-solid").click());
    await update(() =>
      page.locator('[data-setting="colorStructure"]').selectOption("relief"),
    );
    assert.equal(await page.locator("dialog[open]").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      "Solid desktop passed: live smooth panel, 40x30 test size, native source / printable grid labels, kit, calibration, Bambu metadata and invalid-thickness guard.",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
