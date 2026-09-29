const { _electron: electron } = require("@playwright/test");
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path");
(async () => {
  const app = await electron.launch({ args: ["."] });
  try {
    const page = await app.firstWindow(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.waitForFunction(() =>
      document.querySelector("#status")?.textContent.includes("Preview ready"),
    );
    assert.equal(
      await page.locator('[data-setting="resolutionMode"]').inputValue(),
      "image",
    );
    assert.match(
      await page.locator("#export-spacing").textContent(),
      /1000 x 750/,
    );
    await page.locator('[data-setting="support"]').selectOption("none");
    await page.locator('[data-setting="width"]').fill("160");
    await page.waitForTimeout(1000);
    assert.match(
      await page.locator("#export-spacing").textContent(),
      /1000 x 750/,
    );
    await page.locator('[data-view="light"]').click();
    await page.waitForTimeout(500);
    await fs.mkdir("test-results", { recursive: true });
    await page.screenshot({ path: "test-results/native-backlit.png" });
    const output = path.resolve("test-results/native-export.stl");
    await app.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: output,
      });
    }, output);
    await page.locator("#export").click();
    await page.waitForFunction(
      () => document.querySelector("#status").textContent === "Export complete",
      null,
      { timeout: 120000 },
    );
    const bytes = await fs.readFile(output);
    assert.equal(bytes.readUInt32LE(80), 4 * 999 * 749 + 4 * (999 + 749));
    assert.equal(bytes.length, 84 + bytes.readUInt32LE(80) * 50);
    await page.locator("#color-studio-open").click();
    await page.waitForFunction(
      () => document.querySelector("#expected-color")?.width === 1000,
      null,
      { timeout: 60000 },
    );
    assert.equal(
      await page.locator("#expected-color").evaluate((c) => c.height),
      750,
    );
    assert.deepEqual(errors, []);
    console.log(
      "Native desktop passed: source-sized 1000x750 grid, size-independent sampling, backlit shader, native CMYW preview, and full 150MB STL through save IPC.",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
