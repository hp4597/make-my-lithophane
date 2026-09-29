const { _electron: electron } = require("@playwright/test");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const profile = await require("node:fs/promises").mkdtemp(
    path.join(require("node:os").tmpdir(), "litho-packaged-"),
  );
  const app = await electron.launch({
    executablePath: path.resolve("release/win-unpacked/Make My Lithophane.exe"),
    args: ["--user-data-dir=" + profile],
    timeout: 45000,
  });
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(
      () =>
        document
          .querySelector("#status")
          ?.textContent.includes("Preview ready"),
      null,
      { timeout: 30000 },
    );
    if (await page.locator("#type-chooser").evaluate((d) => d.open))
      await page.locator("#close-type-chooser").click();
    assert.ok((await page.locator("#model-triangles").textContent()) !== "—");
    await page.screenshot({ path: "test-results/packaged-studio.png" });
    await page.locator("#color-studio-open").click();
    assert.ok(
      await page
        .locator('[data-setting="colorMode"] option[value="painting"]')
        .evaluate((el) => el.disabled),
    );
    assert.match(
      await page
        .locator('[data-setting="colorMode"] option[value="painting"]')
        .textContent(),
      /Work in progress/,
    );
    await page.locator('[data-setting="colorMode"]').selectOption("cmyw");
    await page.waitForFunction(
      () => document.querySelector("#viewport").dataset.colorMode === "cmyw",
      null,
      { timeout: 60000 },
    );
    assert.equal(await page.locator("dialog[open]").count(), 0);
    console.log(
      "Packaged Windows EXE starts successfully, renders a model, and keeps filament painting disabled.",
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
