# Lithophane Maker Desktop baseline

The product goal is broad functional parity with Lithophane Maker Desktop, with further custom features added later. **Parity is not yet verified.** The application is independently implemented; the commercial desktop program and its full version-specific settings were not supplied.

## Primary references

- [Official product feature families](https://americanfilament.us/products/lithophane-maker-desktop)
- [Chromaphane workflow, filament properties, color matching and pause instructions](https://americanfilament.us/blogs/faq/what-are-chromaphanes)
- [Lamp parameter definitions](https://www.lithophanemaker.com/Lamp%20Lithophane.html)
- [Sphere and mounting parameters](https://lithophanemaker.com/Lithophanes.html)
- [Flat/frame tool](https://lithophanemaker.com/Framed%20Lithophane.html)
- [Night-light tool](https://lithophanemaker.com/Night%20Light%20Lithophane.html)

Reviewed September 29, 2026. Website tools are supporting references, not proof that all desktop controls are identical.

## Priority lighting scope (0.6)

Flat panel, curved panel, cylinder, lamp shade, night light and lightbox now share live lighting controls and mono/CMYW export. The supplied reference families are represented by no enclosure, modular 2/3/4-board frames, fixed-board frame, LED-strip enclosure and custom measured attachments. Housing, retainers and diffusers are separate printable solids. Curved shapes require strips; round shapes provide strip cores, puck recesses and socket collars. Rigid-board frames apply to flat/box shapes. See README for dimensions and primary Bambu sources.

Not claimed: exact proprietary frame replicas, verified commercial snap fits, every setting of the online maker, certified lamp/socket hardware, physical or thermal testing. Modular frame margins and fixed-board thickness/projection remain editable design assumptions. Full desktop parity is still unverified.

## Implemented and covered by automated checks

- Version 0.6.1: native CMYW export budget raised to four million cells, chunked STL compression, shared material buffers for layout, worker-built complete kits and direct 3MF export.

- Phase 1 UI shell: product-oriented workspace with type chooser, Size/Image/Frame/Light inspector, top Mono/CMYW switch and export review. Geometry/CMYW engines unchanged. CMYW Materials viewport deferred (Review Debt). Filament painting remains disabled.

- Version 0.2.0 CLI: recursive photo batches, settings profiles, monochrome STL/3MF, dry run, no-clobber output, JSON reporting and exit codes. Desktop and CLI share image sampling and geometry.

- Version 0.5: sidebar color/support/photo settings, live CMYW geometry and image, optional hardware preview alongside the model, shared export layouts and persisted settings.

- Version 0.4: native image-resolution sampling, source-resolution backlit textures, higher-detail interactive geometry, native CMYW predictions, typed mesh buffers, and streamed 3MF XML. Explicit export memory limits remain.

- Version 0.3: auto-sized stands/cases, separated print layouts, CMYW fitted supports, color-paper backlighting on all shapes, and quantized CMYW backlit prediction. Mechanical and optical results are not physically validated.

- Ten shape families; image-to-thickness geometry, full-wrap seams and sphere pole closure.
- Photo import, tonal controls, composition, captions, sizing, resolution, borders.
- STL encoding, 3MF packaging and assembly/material resources.
- CMYW non-overlapping touching volumes (experimental color model).
- Filament painting is **Work in progress and disabled**; explicitly paused by the user for version one. Do not resume until specifically requested.
- Generic ring/spoke/stand/clip geometry.
- Desktop import/edit/export, project round trips, color studios and mount-kit workflows.

## Implemented, requiring physical validation

- Optical-density CMYW separation.
- Printer-specific thickness presets and dimensional tolerances.
- Lamp rings, spoke adapters and night-light U-channel fit/retention.
- Four-sided adhesive-assembled light boxes and panel/enclosure fit.
- Slicer handling of generic 3MF material names and required extruder mappings.

## Known remaining parity gaps

- Measured commercial filament palettes and proprietary color matching algorithms.
- Exact branded hardware interfaces, integrated mounts, snap fits and cable channels.
- Real lunar texture mapping; the included relief is procedural.
- Per-photo editing within multi-image layouts and interactive crop handles.
- Smooth silhouette contour extraction; grid-based bridging and largest-component filtering are implemented.
- Other desktop-version-specific tools or controls absent from the public documentation.

Do not mark these complete based solely on similar-looking UI or successful mesh generation. Validate against the target desktop version, representative images, slicer behavior and physical prints.
