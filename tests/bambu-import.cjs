const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { spawnSync } = require("node:child_process"),
  { unzipSync, strFromU8 } = require("fflate");
(async () => {
  const exe = "C:/Program Files/Bambu Studio/bambu-studio.exe";
  await fs.access(exe);
  const { defaults } = await import("../src/geometry.js"),
    { calibrationTile } = await import("../src/solid-color.js"),
    { threeMF } = await import("../src/three-mf.js");
  const dir = await fs.mkdtemp(path.resolve("test-results/bambu-import-")),
    input = path.join(dir, "input.3mf"),
    output = path.join(dir, "roundtrip.3mf");
  const tile = calibrationTile({
    ...defaults,
    colorMode: "cmyw",
    colorStructure: "solid",
  });
  await fs.writeFile(
    input,
    threeMF(tile.parts, "Solid calibration", {
      bambu: true,
      layer: 0.08,
      firstLayer: 0.16,
    }),
  );
  const result = spawnSync(exe, ["--export-3mf", output, input], {
    cwd: dir,
    windowsHide: true,
    timeout: 60000,
  });
  assert.equal(result.status, 0, result.error?.message);
  const files = unzipSync(await fs.readFile(output)),
    xml = strFromU8(files["Metadata/model_settings.config"]);
  const parts = [...xml.matchAll(/<part\b[^>]*>([\s\S]*?)<\/part>/g)].map(
    (m) => m[1],
  );
  for (const [name, slot] of [
    ["Cyan", 1],
    ["Magenta", 2],
    ["Yellow", 3],
    ["White", 4],
  ]) {
    const p = parts.find((p) => p.includes(`key="name" value="${name}"`));
    assert.ok(p, name);
    assert.ok(p.includes(`key="extruder" value="${slot}"`));
    assert.match(p, /degenerate_facets="0"/);
    assert.match(p, /facets_removed="0"/);
  }
  console.log(
    "Bambu Studio import/re-export passed: CMYW names, four slot hints and geometry retained. Global printer/process settings still require manual verification.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
