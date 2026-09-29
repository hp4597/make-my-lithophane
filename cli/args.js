import { defaults, validate, gridSize } from "../src/geometry.js";
export const help = `Make My Lithophane CLI

Usage: lithophane-cli <photo-or-folder> [...] --output <folder> [options]

  --recursive             Include subfolders (symbolic links are skipped)
  --format stl|3mf        Model format (default: stl)
  --settings <file>       JSON settings or a saved .litho project's settings
  --shape <name>          flat, curved, cylinder, lamp, sphere, moon, heart,
                          silhouette, nightlight, box
  --width <mm> --height <mm> --min <mm> --max <mm> --resolution <mm>
  --resolution-mode image|spacing  Native image pixels (default) or custom spacing
  --support auto|none|stand|case  Include matching support (default: auto)
  --fit-clearance <mm> --support-wall <mm> --print-gap <mm>
  --brightness <value> --contrast <value> --gamma <value>
  --invert --flip --holes --largest-island
  --set key=value         Any desktop model setting; repeat as needed
  --overwrite             Replace existing output files (default: skip)
  --fail-fast             Stop after the first image fails
  --dry-run               List jobs without decoding images or writing files
  --json                  Write a single JSON result to stdout
  --help                  Show this help
  --version               Print version

Examples:
  lithophane-cli "C:\\Photos" --output "C:\\Models" --recursive
  lithophane-cli portrait.jpg --output models --shape curved --width 140
  lithophane-cli photos --output models --settings profile.json --format 3mf

Folders retain their relative subpaths. PNG, JPEG and WebP are supported.
Project files supply settings only; their embedded photos/layouts are not used.
Exports include a matching stand/case for supported panels; color paper, CMYW kits and
filament painting are not CLI outputs in this revision.
Exit codes: 0 success/skipped, 1 processing failure, 2 invalid arguments/setup,
130 interrupted. No network, account or visible editor is required.
`;
export function parseArgs(args) {
  const result = {
    inputs: [],
    output: null,
    format: "stl",
    settingsFile: null,
    overrides: {},
    recursive: false,
    overwrite: false,
    failFast: false,
    dryRun: false,
    json: false,
  };
  const names = new Map(
    Object.keys(defaults).map((k) => [
      k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()),
      k,
    ]),
  );
  const value = (i, name) => {
    if (i + 1 >= args.length || args[i + 1].startsWith("--"))
      throw new Error(`${name} requires a value.`);
    return args[i + 1];
  };
  function override(key, raw) {
    if (!Object.hasOwn(defaults, key))
      throw new Error(`Unknown setting: ${key}`);
    let v = raw;
    if (typeof defaults[key] === "number") {
      if (raw.trim() === "") throw new Error(`Missing value for ${key}`);
      v = Number(raw);
      if (!Number.isFinite(v))
        throw new Error(`${key} must be a finite number.`);
    }
    if (typeof defaults[key] === "boolean") {
      if (!["true", "false"].includes(raw))
        throw new Error(`${key} must be true or false.`);
      v = raw === "true";
    }
    result.overrides[key] = v;
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      result.inputs.push(...args.slice(i + 1));
      break;
    }
    if (a === "--help" || a === "-h") {
      result.help = true;
      continue;
    }
    if (a === "--version") {
      result.version = true;
      continue;
    }
    const flags = {
      "--recursive": "recursive",
      "--overwrite": "overwrite",
      "--fail-fast": "failFast",
      "--dry-run": "dryRun",
      "--json": "json",
    };
    if (flags[a]) {
      result[flags[a]] = true;
      continue;
    }
    const options = {
      "--output": "output",
      "--format": "format",
      "--settings": "settingsFile",
    };
    if (options[a]) {
      result[options[a]] = value(i, a);
      i++;
      continue;
    }
    if (a === "--set") {
      const pair = value(i, a),
        eq = pair.indexOf("=");
      if (eq < 1) throw new Error("--set requires key=value.");
      override(pair.slice(0, eq), pair.slice(eq + 1));
      i++;
      continue;
    }
    if (a.startsWith("--")) {
      const key = names.get(a.slice(2));
      if (!key) throw new Error(`Unknown option: ${a}`);
      if (typeof defaults[key] === "boolean") override(key, "true");
      else {
        override(key, value(i, a));
        i++;
      }
      continue;
    }
    if (a.startsWith("-")) throw new Error(`Unknown option: ${a}`);
    result.inputs.push(a);
  }
  if (result.help || result.version) return result;
  if (!result.inputs.length)
    throw new Error("Provide at least one photo or input folder.");
  if (!result.output) throw new Error("--output is required.");
  if (!["stl", "3mf"].includes(result.format))
    throw new Error("--format must be stl or 3mf.");
  return result;
}
export function resolveSettings(config, overrides) {
  const s = { ...defaults },
    source = config?.format === "make-my-lithophane" ? config.settings : config;
  if (source !== undefined) {
    if (!source || typeof source !== "object" || Array.isArray(source))
      throw new Error("Settings must be a JSON object.");
    for (const [k, v] of Object.entries(source)) {
      if (!Object.hasOwn(defaults, k))
        throw new Error(`Unknown setting in file: ${k}`);
      if (typeof v !== typeof defaults[k])
        throw new Error(`Wrong type for setting: ${k}`);
      s[k] = v;
    }
  }
  Object.assign(s, overrides);
  if (s.colorMode !== "mono")
    throw new Error(
      "The CLI supports monochrome models only. Filament painting is paused; use the desktop color studio for CMYW. Use --set colorMode=mono to override a saved color mode.",
    );
  validate(s);
  if (s.resolutionMode === "spacing") gridSize(s);
  return s;
}
