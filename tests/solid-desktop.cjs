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
    await update(() =>
      page.locator('[data-setting="solidFront"]').fill("0.16"),
    );
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
