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

## Implemented and covered by automated checks

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
