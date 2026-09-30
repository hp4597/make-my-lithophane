# Batch CLI — version 0.2.0

The CLI converts PNG, JPEG and WebP photos to individual monochrome lithophane STL or 3MF files. It uses the desktop editor's Canvas sampling, tone controls and geometry code. Processing is sequential to bound peak memory, with no visible editor window or network dependency.

## Windows distribution

After installing the app, run `lithophane-cli.cmd` beside `Make My Lithophane.exe`. It is also available in `release/win-unpacked/`. Keep that entire folder together: the command wrapper uses the bundled Electron runtime, so no separate Node.js installation is needed.

```powershell
& "E:\MyApps\make-my-lithophane\release\win-unpacked\lithophane-cli.cmd" `
  "C:\Photos" --output "C:\Lithophanes" --recursive
```

The portable GUI EXE remains available, but the installed/unpacked distribution is the supported CLI distribution because it includes the console launcher and runtime files in predictable locations.

## From source

```powershell
npm ci
npx install-electron --no
npm run build
npm run cli -- "C:\Photos" --output "C:\Lithophanes" --recursive
```

Install the Electron runtime once using the step above before running source-based automation. Otherwise Electron may print a first-run download message. The packaged CLI already includes its runtime. For machine-readable output, invoke the launcher directly so npm's banner does not appear in stdout:

```powershell
node cli/launch.cjs "C:\Photos" --output "C:\Lithophanes" --recursive --json > batch-report.json
```

## Options and profiles

```powershell
lithophane-cli.cmd image.jpg --output models --shape curved --width 140 --height 100 --angle 90
lithophane-cli.cmd photos --output models --format 3mf --settings profile.json
lithophane-cli.cmd photos --output models --settings saved-project.litho --set colorMode=mono
lithophane-cli.cmd photos --output models --recursive --dry-run --json
lithophane-cli.cmd photos --output models --recursive --overwrite --fail-fast
```

Use `--help` for the complete command summary. Every numeric/string desktop setting can be passed as its kebab-case flag, such as `--hole-diameter 3`, `--text "Our trip"`, or `--resolution-mode spacing --resolution 0.3`. Boolean flags turn a setting on; use `--set flip=false` to turn it off. `--set key=value` uses the original camelCase setting name. Arguments after `--` are literal input paths. Shell glob expansion is not required or implemented; pass folders or explicit paths.

A JSON profile is a partial settings object:

```json
{
  "shape": "flat",
  "width": 120,
  "height": 90,
  "min": 0.8,
  "max": 3.2,
  "resolutionMode": "spacing",
  "resolution": 0.35,
  "border": 3,
  "fit": "cover"
}
```

Precedence: built-in defaults, then the settings file, then command-line overrides. A `.litho` project contributes its model settings only; its embedded images and gallery layout are not used. Each supplied photo becomes a separate model. CLI color mode must be `mono`; non-monochrome profiles are rejected unless explicitly overridden. Filament painting remains paused and unavailable.

## File handling and automation

- Existing outputs are skipped unless `--overwrite` is supplied. Output is written to a temporary sibling file before publication. Default no-clobber publication uses filesystem hard links (supported by normal Windows NTFS volumes); unsupported filesystems report a per-file error.
- Recursive input subfolders are preserved beneath the output folder. When multiple inputs would produce the same target (including `a.jpg` and `a.png`), planning fails before any exports. Repeated inputs are deduplicated.
- Directory scans skip symbolic links and the designated output subfolder. Explicit symbolic-link inputs are rejected. Unrelated file types in folders are ignored; unsupported explicit files are rejected.
- `--dry-run` validates settings and lists planned/skipped targets without decoding images or creating output directories.
- Invalid images are reported and the batch continues. `--fail-fast` stops after the first processing error. Ctrl+C interrupts; previously completed models remain available.
- Inputs have no fixed file-size or megapixel ceiling. Available memory, image-decoder/canvas capabilities and mesh-format constraints still apply. Individual image processing times out after 120 seconds. A timeout disables the renderer for the remaining jobs, which are reported as failed promptly.
- `--json` emits one JSON object containing effective settings, input/output paths, statuses, counts, file sizes and model statistics. Diagnostics from the runtime may appear on stderr. JSON has no progress chatter on stdout.

Exit codes: **0** success/planned/skipped, **1** one or more image-processing failures, **2** invalid arguments/settings or setup failure, **130** interruption through the launcher.

Exports contain the selected single-photo mesh plus its matching support. `--support auto` (default) adds a stand to flat, curved and night-light panels, a case to light-box panels, and no support to other shapes. Use `--support none` for panel-only output. `--fit-clearance` sets clearance per side; `--support-wall` and `--print-gap` control wall thickness and spacing. Parts are separated side by side at Z=0; check the combined footprint and print orientation in your slicer. Color paper, CMYW kits, standalone hardware adapters, and gallery compositions remain desktop workflows.

## Verification

`npm test` covers CLI planning and file safety alongside geometry checks. `npm run test:cli` exercises actual headless image decoding and exports. After packaging, `node tests/cli-desktop.cjs --packaged` tests the CLI with the bundled Windows runtime.

Native image resolution is the default in v0.4. Use `--resolution-mode image` to sample each photo at its own rotated pixel dimensions. Use `--resolution-mode spacing --resolution 0.1` for explicit millimeter spacing. Native resolution cannot be fully checked during dry-run until photos are decoded. Exports above 4 million cells fail explicitly without downsampling.

### Lighting enclosures (0.6)

Lighting settings are also accepted as kebab-case flags or saved profile keys. For example, `--shape curved --lighting-setup strip --light-kind strip --light-gap 18 --diffuser` exports the panel and lighting parts together. `--enclosure-stand` adds matching feet for panel shapes. Board presets are applied by the desktop sidebar; for CLI-only board profiles specify measured `--light-kind board --board-width 156 --board-height 120 --board-thickness 1.6 --light-projection 7.15` explicitly with `--lighting-setup custom`. That thickness/projection is an estimate for the fixed board, not a validated fit. Lighting replaces legacy auto support while enabled. CMYW remains a desktop export workflow.
