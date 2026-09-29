import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs, resolveSettings } from "../cli/args.js";
import { planBatch, executeBatch } from "../cli/batch.js";
async function fixture() {
  await fs.mkdir("test-results", { recursive: true });
  const root = await fs.mkdtemp(path.resolve("test-results/cli-unit-"));
  await fs.mkdir(path.join(root, "in", "nested"), { recursive: true });
  await fs.writeFile(path.join(root, "in", "a.png"), "fixture");
  await fs.writeFile(path.join(root, "in", "nested", "b.JPG"), "fixture");
  return root;
}
test("CLI parses settings and rejects typos, bad types, missing output and painting", () => {
  const opts = parseArgs([
    "photos",
    "--output",
    "models",
    "--width",
    "80",
    "--brightness",
    "-15",
    "--flip",
    "--set",
    "holes=false",
  ]);
  assert.equal(opts.overrides.width, 80);
  assert.equal(opts.overrides.brightness, -15);
  assert.equal(opts.overrides.flip, true);
  assert.equal(opts.overrides.holes, false);
  for (const args of [
    ["photos"],
    ["photos", "--output", "x", "--typo"],
    ["photos", "--output", "x", "--width", "NaN"],
    ["photos", "--output", "x", "--set", "__proto__=bad"],
  ])
    assert.throws(() => parseArgs(args));
  assert.throws(() => resolveSettings({ colorMode: "painting" }, {}));
  assert.throws(() => resolveSettings({ width: "100" }, {}));
  assert.equal(
    resolveSettings(
      { format: "make-my-lithophane", settings: { width: 90 } },
      { width: 80 },
    ).width,
    80,
  );
});
test("Batch discovers recursive photos, deduplicates inputs and preserves subfolders", async () => {
  const root = await fixture(),
    input = path.join(root, "in"),
    output = path.join(root, "out");
  const opts = parseArgs([
    input,
    path.join(input, "a.png"),
    "--output",
    output,
    "--recursive",
  ]);
  const plan = await planBatch(opts);
  assert.equal(plan.jobs.length, 2);
  assert.equal(plan.jobs[1].output, path.join(output, "nested", "b.stl"));
  const result = await executeBatch(plan, opts, async () => ({
    bytes: new Uint8Array([1, 2, 3]),
    stats: { triangles: 1 },
  }));
  assert.equal(result.written, 2);
  const skipped = await executeBatch(plan, opts, () =>
    assert.fail("Existing outputs should not render"),
  );
  assert.equal(skipped.skipped, 2);
  const overwritten = await executeBatch(
    plan,
    { ...opts, overwrite: true },
    async () => ({ bytes: new Uint8Array([9]), stats: {} }),
  );
  assert.equal(overwritten.written, 2);
  assert.deepEqual([...(await fs.readFile(plan.jobs[0].output))], [9]);
});
test("Dry runs do not create output directories; duplicate stems fail preflight", async () => {
  const root = await fixture(),
    input = path.join(root, "in"),
    output = path.join(root, "dry");
  const opts = parseArgs([input, "--output", output, "--dry-run"]);
  const plan = await planBatch(opts);
  const result = await executeBatch(plan, opts, () => assert.fail());
  assert.equal(result.results[0].status, "planned");
  await assert.rejects(fs.stat(output));
  await fs.writeFile(path.join(input, "a.jpg"), "fixture");
  await assert.rejects(planBatch(opts), /Multiple photos/);
});
test("Batch continues after an image failure and fail-fast stops promptly", async () => {
  const root = await fixture(),
    opts = parseArgs([
      path.join(root, "in"),
      "--output",
      path.join(root, "out"),
      "--recursive",
    ]);
  const plan = await planBatch(opts);
  let calls = 0;
  const result = await executeBatch(plan, opts, async () => {
    if (calls++ === 0) throw new Error("Invalid image");
    return { bytes: new Uint8Array([5]), stats: {} };
  });
  assert.equal(result.failed, 1);
  assert.equal(result.written, 1);
  const fast = await executeBatch(
    plan,
    { ...opts, failFast: true },
    async () => {
      throw new Error("Invalid image");
    },
  );
  assert.equal(fast.processed, 1);
  assert.equal(fast.failed, 1);
});
