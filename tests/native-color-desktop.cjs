const { _electron: electron } = require("@playwright/test"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { Unzip, UnzipInflate } = require("fflate");
(async () => {
  const profile = await fs.mkdtemp(
    path.join(require("node:os").tmpdir(), "litho-native-color-"),
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
    if (await page.locator("#type-chooser").evaluate((d) => d.open))
      await page.locator("#close-type-chooser").click();
    const png = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 1672;
      c.height = 941;
      const ctx = c.getContext("2d"),
        p = ctx.createImageData(c.width, c.height);
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          p.data[i] = 128 + 100 * Math.sin(x / 37);
          p.data[i + 1] = 128 + 100 * Math.cos(y / 23);
          p.data[i + 2] = (x + y) % 256;
          p.data[i + 3] = 255;
        }
      ctx.putImageData(p, 0, 0);
      return c.toDataURL().split(",")[1];
    });
    await page
      .locator("#image-file")
      .setInputFiles({
        name: "native-1672x941.png",
        mimeType: "image/png",
        buffer: Buffer.from(png, "base64"),
      });
    await page.waitForFunction(() =>
      document
        .querySelector("#export-spacing")
        .textContent.includes("1672 x 941"),
    );
    await page.locator('[data-tab="light"]').click();
    await page.locator('[data-setting="lightingSetup"]').selectOption("strip");
    await page.locator('[data-setting="colorMode"]').selectOption("cmyw");
    await page.waitForFunction(
      () => document.querySelector("#viewport").dataset.colorMode === "cmyw",
      null,
      { timeout: 60000 },
    );
    const output = path.resolve("test-results/native-color-1672x941.zip");
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
      { timeout: 600000 },
    );
    const result = {},
      unzip = new Unzip((file) => {
        let size = 0,
          header = Buffer.alloc(0);
        file.ondata = (e, data, final) => {
          if (e) throw e;
          size += data.length;
          if (header.length < 84)
            header = Buffer.concat([
              header,
              Buffer.from(data.subarray(0, 84 - header.length)),
            ]);
          if (final) result[file.name] = { size, header };
        };
        file.start();
      });
    unzip.register(UnzipInflate);
    const handle = await fs.open(output, "r"),
      chunk = Buffer.alloc(1048576);
    try {
      while (true) {
        const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
        if (!bytesRead) break;
        unzip.push(chunk.subarray(0, bytesRead), false);
      }
      unzip.push(new Uint8Array(), true);
    } finally {
      await handle.close();
    }
    const triangles = 4 * 1671 * 940 + 4 * (1671 + 940);
    for (const name of ["cyan", "magenta", "yellow", "white"]) {
      assert.equal(result[name + ".stl"].header.readUInt32LE(80), triangles);
      assert.equal(result[name + ".stl"].size, 84 + triangles * 50);
    }
    for (const name of [
      "predicted.png",
      "target.png",
      "project.litho",
      "print-layout.3mf",
      "rear-cover.stl",
      "left-enclosure-foot.stl",
    ])
      assert.ok(result[name], name);
    assert.deepEqual(errors, []);
    console.log(
      "Native CMYW 1672 x 941 passed: four full-resolution STLs, complete kit, lighting, PNGs and project. ZIP bytes: " +
        (await fs.stat(output)).size,
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
