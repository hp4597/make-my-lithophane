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
      page.locator('[data-setting="colorStructure"]').selectOption("dedicated"),
    );
    await update(() => page.locator("#small-solid").click());
    assert.match(
      await page.locator("#dedicated-summary").textContent(),
      /4.160 mm/,
    );
    assert.match(
      await page.locator("#dedicated-summary").textContent(),
      /4913/,
    );
    await update(() => page.locator('[data-setting="cyanLayers"]').fill("8"));
    assert.match(
      await page.locator("#dedicated-summary").textContent(),
      /3.520 mm/,
    );
    assert.match(await page.locator("#model-size").textContent(), /3.5 mm/);
    await update(() => page.locator("#dedicated-defaults").click());
    const output = path.resolve("test-results/dedicated-panel.zip");
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
    const report = JSON.parse(strFromU8(files["SOLID-PANEL.json"]));
    assert.equal(report.thickness, 4.16);
    assert.equal(report.combinations, 4913);
    const schedule = JSON.parse(strFromU8(files["layer-schedule.json"]));
    assert.equal(schedule.length, 51);
    assert.equal(schedule[0].zTop, 0.16);
    assert.equal(schedule.at(-1).zTop, 4.16);
    assert.ok(files["matching-support.stl"]);
    assert.ok(files["DEDICATED-LAYERS.txt"]);
    assert.equal(
      JSON.parse(strFromU8(files["settings.json"])).solidThickness,
      4.16,
    );
    const mf = unzipSync(files["color-assembly.3mf"]);
    assert.ok(strFromU8(mf["3D/3dmodel.model"]).includes('z="4.16000"'));
    assert.equal(
      JSON.parse(strFromU8(mf["Metadata/project_settings.config"]))
        .initial_layer_print_height,
      "0.16",
    );
    await page.screenshot({ path: "test-results/dedicated-panel.png" });
    // Reopen the exported project to ensure derived settings survive persistence.
    const project = path.resolve("test-results/dedicated-project.litho");
    await fs.writeFile(project, files["project.litho"]);
    await update(() =>
      page.locator('[data-setting="colorStructure"]').selectOption("solid"),
    );
    await update(() => page.locator("#project-file").setInputFiles(project));
    await page.locator('[data-tab="print"]').click();
    assert.equal(
      await page.locator('[data-setting="colorStructure"]').inputValue(),
      "dedicated",
    );
    assert.match(
      await page.locator("#dedicated-summary").textContent(),
      /4.160/,
    );
    const calibration = path.resolve("test-results/dedicated-calibration.zip");
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
    assert.equal(
      JSON.parse(strFromU8(kit["settings.json"])).colorStructure,
      "dedicated",
    );
    assert.equal(JSON.parse(strFromU8(kit["layer-schedule.json"])).length, 51);
    for (const p of JSON.parse(strFromU8(kit["patches.json"])))
      assert.ok(p.internalLayers.slice(0, 3).every((n) => n <= 16));
    assert.deepEqual(errors, []);
    console.log(
      "Dedicated desktop passed: live budgets, calculated thickness, model/support kit, 51-layer schedule, save/reopen and dedicated calibration.",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
