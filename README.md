# QuickPix

**Free & open-source Lightroom-style photo editor for Windows.**
Quick, subtle, non-destructive touch-ups — open a folder, drag some sliders, apply a filter, export. Your original files are never modified.

![status](https://img.shields.io/badge/status-alpha-orange) ![license](https://img.shields.io/badge/license-GPL--3.0-blue) ![platform](https://img.shields.io/badge/platform-Windows-informational)

## Features

- **Real-time GPU editing** — every slider runs as a WebGL2 shader pass, so adjustments are instant even on large photos
- **Lightroom-style adjustments** — Exposure, Contrast, Highlights, Shadows, Whites, Blacks, Temp, Tint, Vibrance, Saturation, Clarity, Sharpen, Vignette, Grain
- **Tone curve** — master + per-channel RGB curves with monotone spline interpolation (no banding overshoot)
- **Color Mix** — 8-band HSL mixer (hue / saturation / luminance per color), neutral-protected
- **Split toning** — independent shadow and highlight tints with balance
- **Histogram clipping indicators** and an EXIF strip (camera, focal length, ƒ-stop, shutter, ISO)
- **Crop & straighten** — aspect presets, rule-of-thirds grid, ±45° straighten with auto-fill (no blank corners)
- **Filters (presets)** — 10 built-in subtle looks; hover to preview live, click to apply; save your own
- **Non-destructive** — edits live in `photo.jpg.qpx` JSON sidecars next to your photos; originals are untouched; delete the sidecar to fully revert
- **Undo/redo, copy/paste settings** between photos
- **Export** — JPEG / PNG / WebP with quality and long-edge resize, processed at full resolution with the exact same math as the preview; multi-select (Ctrl/Shift-click) for batch export with progress
- **Library** — open or drag-drop a folder (TIFF included), fast cached thumbnails, filmstrip navigation, histogram, 1:1 zoom & pan, before/after compare
- **Picks up where you left off** — reopens your last folder and photo, remembers window size and recent folders

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Ctrl+O` | Open folder |
| `←` / `→` | Previous / next photo |
| `\` (hold) | Before / after compare |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | Copy / paste edit settings |
| `Ctrl+E` | Export |
| Double-click image | Toggle 1:1 zoom |
| Mouse wheel | Zoom, drag to pan |
| Double-click slider | Reset slider |

## Getting started (development)

```bash
npm install
npm run dev        # launches the Electron app with hot reload
```

No Windows machine or Electron needed for UI/shader work:

```bash
npm run dev:web    # browser-only mode with generated sample photos
```

Other scripts:

```bash
npm run typecheck  # strict TS across main/preload/renderer
npm test           # vitest: shared edit math + full export path (sharp)
npm run dist       # build the Windows installer (release/)
node scripts/make-samples.mjs  # generate a sample photo folder (incl. TIFF)
```

## Architecture (for contributors)

```
src/
├── main/       Electron main process: window, qpx:// protocol, folder
│               access, sidecars, presets, sharp-based export
├── preload/    contextBridge — the only place Node and browser meet
├── renderer/   React UI + WebGL2 pipeline
│   └── gl/     shaders (adjust.frag = geometry + pointwise color,
│               detail.frag = sharpen/clarity) and the pass runner
└── shared/     the contract between all three:
    ├── editParams.ts  EditParams — THE source of truth for an edit
    ├── curve.ts       monotone spline → 256-entry LUT
    └── editMath.ts    CPU mirror of the shaders (export + tests)
```

Key design decisions:

- **`EditParams` is a plain JSON object.** Sliders write it, the GPU renders it, presets are named copies of it, sidecars serialize it, undo history is an array of it.
- **Preview renders on the GPU, export on the CPU** (`editMath.ts` mirrors the shaders 1:1 — same constants, same order). If you change a shader, change `editMath.ts` and its tests in the same PR.
- **Non-destructive by construction**: crop/rotate happen in the texture sampler; nothing ever writes pixels back to the source file.

## Roadmap

- RAW support (LibRaw → WASM decoder feeding the same RGBA pipeline)
- Local adjustments (masks, linear/radial gradients)
- Ratings/flags and a catalog view
- Code-signed installer + auto-updates
- macOS/Linux builds (nothing in the codebase is Windows-specific)

## License

[GPL-3.0](LICENSE) — free as in freedom. QuickPix stands on the shoulders of
Electron, React, Vite, sharp, and zustand.
