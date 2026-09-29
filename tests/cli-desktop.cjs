const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const { zlibSync, unzipSync } = require("fflate");
function png() {
  const chunk = (name, data) => {
    const type = Buffer.from(name),
      payload = Buffer.concat([type, data]);
    let crc = 0xffffffff;
    for (const b of payload) {
      crc ^= b;
      for (let i = 0; i < 8; i++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const size = Buffer.alloc(4),
      sum = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    sum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, payload, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(8, 0);
  header.writeUInt32BE(8, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.alloc(8 * (8 * 4 + 1));
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const i = y * 33 + 1 + x * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = x * 32;
      pixels[i + 3] = 255;
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", Buffer.from(zlibSync(pixels))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const packaged = process.argv.includes("--packaged");
function run(args) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    const exe = packaged
      ? path.resolve("release/win-unpacked/Make My Lithophane.exe")
      : process.execPath;
    const launcher = packaged
      ? path.resolve("release/win-unpacked/resources/app.asar/cli/launch.cjs")
      : path.resolve("cli/launch.cjs");
    if (packaged) env.ELECTRON_RUN_AS_NODE = "1";
    else delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(exe, [launcher, ...args], { env, windowsHide: true });
    let stdout = "",
      stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("CLI test timeout: " + stderr));
    }, 60000);
    child.stdout.on("data", (x) => (stdout += x));
    child.stderr.on("data", (x) => (stderr += x));
    child.on("error", reject);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}
(async () => {
  await fs.mkdir("test-results", { recursive: true });
  const root = await fs.mkdtemp(path.resolve("test-results/cli-e2e-")),
    input = path.join(root, "photos with spaces"),
    output = path.join(root, "models");
  await fs.mkdir(path.join(input, "nested"), { recursive: true });
  await fs.writeFile(path.join(input, "first.png"), png());
  await fs.writeFile(path.join(input, "nested", "second.png"), png());
  await fs.writeFile(path.join(input, "broken.jpg"), "not an image");
  const args = [
    input,
    "--output",
    output,
    "--recursive",
    "--width",
    "20",
    "--height",
    "20",
    "--resolution",
    "2",
    "--json",
  ];
  let result = await run(args);
  assert.equal(result.code, 1, result.stdout + result.stderr);
  let report = JSON.parse(result.stdout);
  assert.equal(report.written, 2);
  assert.equal(report.failed, 1);
  const stl = await fs.readFile(path.join(output, "first.stl"));
  assert.equal(stl.length, 84 + stl.readUInt32LE(80) * 50);
  result = await run(args);
  report = JSON.parse(result.stdout);
  assert.equal(report.skipped, 2);
  assert.equal(report.failed, 1);
  result = await run([
    path.join(input, "first.png"),
    "--output",
    output,
    "--format",
    "3mf",
    "--width",
    "20",
    "--height",
    "20",
    "--resolution",
    "2",
    "--json",
  ]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.ok(
    unzipSync(await fs.readFile(path.join(output, "first.3mf")))[
      "3D/3dmodel.model"
    ],
  );
  result = await run([
    input,
    "--output",
    path.join(root, "dry"),
    "--dry-run",
    "--json",
  ]);
  assert.equal(result.code, 0);
  await assert.rejects(fs.stat(path.join(root, "dry")));
  result = await run([input, "--output", output, "--width", "bad", "--json"]);
  assert.equal(result.code, 2);
  assert.ok(JSON.parse(result.stdout).error);
  result = await run([
    path.join(input, "first.png"),
    "--output",
    path.join(root, "lighting"),
    "--format",
    "3mf",
    "--lighting-setup",
    "strip",
    "--diffuser",
    "--json",
  ]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  const lightXML = Buffer.from(
    unzipSync(await fs.readFile(path.join(root, "lighting", "first.3mf")))[
      "3D/3dmodel.model"
    ],
  ).toString();
  assert.match(lightXML, /rear-cover/);
  assert.match(lightXML, /enclosure-foot/);
  result = await run(["--version"]);
  assert.equal(result.stdout.trim(), "0.7.0");
  console.log(
    `${packaged ? "Packaged" : "Source"} CLI passed: recursive batches, spaces, STL/3MF, invalid image continuation, skip protection, dry-run, JSON and exit codes.`,
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
