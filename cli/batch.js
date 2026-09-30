import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveSettings } from "./args.js";
const extensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const key = (p) => (process.platform === "win32" ? p.toLowerCase() : p);
export async function planBatch(options) {
  const output = path.resolve(options.output),
    jobs = [],
    seen = new Set(),
    targets = new Set();
  let config;
  if (options.settingsFile) {
    const file = await fs.readFile(options.settingsFile, "utf8");
    config = JSON.parse(file);
  }
  const settings = resolveSettings(config, options.overrides);
  async function add(input, relative) {
    if (!extensions.has(path.extname(input).toLowerCase()))
      throw new Error(`Unsupported image: ${input}`);
    const canonical = key(await fs.realpath(input));
    if (seen.has(canonical)) return;
    seen.add(canonical);
    const target = path.join(
      output,
      relative.slice(0, -path.extname(relative).length) + "." + options.format,
    );
    if (targets.has(key(target)))
      throw new Error(
        `Multiple photos map to ${target}. Use separate output folders or rename the conflicting images.`,
      );
    targets.add(key(target));
    jobs.push({ input, output: target });
  }
  async function walk(dir, root) {
    const entries = (await fs.readdir(dir, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (options.recursive && key(full) !== key(output))
          await walk(full, root);
      } else if (
        entry.isFile() &&
        extensions.has(path.extname(full).toLowerCase())
      )
        await add(full, path.relative(root, full));
    }
  }
  for (const arg of options.inputs) {
    const full = path.resolve(arg),
      stat = await fs.lstat(full);
    if (stat.isSymbolicLink())
      throw new Error(`Symbolic-link input is not supported: ${full}`);
    if (stat.isDirectory()) await walk(full, full);
    else if (stat.isFile()) await add(full, path.basename(full));
    else throw new Error(`Not a file or directory: ${full}`);
  }
  if (!jobs.length)
    throw new Error(
      "No supported photos found. Use --recursive to include subfolders.",
    );
  return { settings, jobs };
}
export async function executeBatch(
  plan,
  options,
  render,
  onProgress = () => {},
) {
  const results = [];
  for (const job of plan.jobs) {
    let temporary;
    try {
      if (!options.overwrite) {
        try {
          await fs.lstat(job.output);
          results.push({
            ...job,
            status: "skipped",
            reason: "Output already exists",
          });
          onProgress(results.at(-1));
          continue;
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
      }
      if (options.dryRun) {
        results.push({ ...job, status: "planned" });
        onProgress(results.at(-1));
        continue;
      }
      const bytes = await fs.readFile(job.input),
        ext = path.extname(job.input).toLowerCase(),
        mime =
          ext === ".png"
            ? "image/png"
            : ext === ".webp"
              ? "image/webp"
              : "image/jpeg";
      const rendered = await render({
        source: `data:${mime};base64,${bytes.toString("base64")}`,
        settings: plan.settings,
        format: options.format,
      });
      await fs.mkdir(path.dirname(job.output), { recursive: true });
      temporary = path.join(
        path.dirname(job.output),
        `.litho-${randomUUID()}.tmp`,
      );
      await fs.writeFile(temporary, rendered.bytes, { flag: "wx" });
      if (options.overwrite) await fs.rename(temporary, job.output);
      else await fs.link(temporary, job.output);
      results.push({
        ...job,
        status: "written",
        bytes: rendered.bytes.length,
        stats: rendered.stats,
      });
    } catch (error) {
      results.push({ ...job, status: "failed", error: error.message });
    } finally {
      if (temporary)
        await fs.unlink(temporary).catch((e) => {
          if (e.code !== "ENOENT") throw e;
        });
    }
    onProgress(results.at(-1));
    if (options.failFast && results.at(-1).status === "failed") break;
  }
  return {
    settings: plan.settings,
    total: plan.jobs.length,
    processed: results.length,
    written: results.filter((x) => x.status === "written").length,
    skipped: results.filter((x) => x.status === "skipped").length,
    failed: results.filter((x) => x.status === "failed").length,
    results,
  };
}
