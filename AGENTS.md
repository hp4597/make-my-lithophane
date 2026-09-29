# Project instructions

Build Make My Lithophane as a local Windows desktop app. Lithophane Maker Desktop is the functional baseline; track verified support and remaining differences in FEATURE_PARITY.md.

## Explicit user scope decision

Filament painting is **Work in progress** and paused for the first version. Keep its UI disabled and preserve the existing experimental code. Do not continue implementing or refining filament painting until the user specifically asks to resume it. CMYW color lithophanes are a separate active feature.

## Validation

Run `npm test` for geometry/export logic and `npm run test:desktop` for Electron workflows. Run `npm run package` to build the Windows installer. Do not claim full feature parity or physical print/color/fit validation without evidence.
