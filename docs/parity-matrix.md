# Shader and workflow audit

The October 2026 rebuild replaces 90 named recipes with 28 explicitly defined algorithms. This is an independently implemented texture tool; matching another product's appearance is not an acceptance target.

## Baseline findings

The old catalog dispatched through 14 shared shader bodies. Rendering every entry and probing all 540 generator controls found 48 controls with no visible pixel change. Labels frequently misrepresented output: Cross rendered noise, Crescent was a lobed disc, and Fire, Smoke, Caustics and Aurora shared warped-noise formulas. Gradient positions were ignored, Blur changed contrast, and color editing was disabled by the default gradient mix.

Baseline evidence: `artifacts/shader-audit-baseline/report.json` and `contact-sheet.png`.

## Current inventory

| Family | Generators | Distinction |
| --- | --- | --- |
| Radial | Circle, Ring, Rays, Spiral, Beam, Lightning | Soft radial mask, wavy band, tapered rays, spiral arms, pulsed beam, branched bolt |
| Shapes | Polygon, Quad, Star, Crystal, Crescent, Cross | Rounded polygon, rectangular card, pointed star, shaded gemstone, subtracted discs, rounded bars |
| Patterns | Grid, Dots, Lines, Checker | Grid lines, staggered dots, wavy stripes, alternating tiles |
| Noise & Organic | FractalNoise, FlowNoise, Cells, Fire, Caustics, Metaballs, Wood, Smoke, Aurora | Fractal field, domain warp, cellular boundaries, rising flame, interference network, merging droplets, growth rings, expanding plume, light curtain |
| Digital & Utility | Glitch, Gradient, Grain | Displaced blocks, directional ramp, independent grains |

Every generator owns its labels, ranges, defaults and algorithm. Seed controls appear only on randomized generators. Related former names resolve to current families and are searchable; the complete mapping is `legacyAliases` in `src/catalog.ts`.

## Controls and workflow

- UV offsets, repeat/clipping and corner transforms share one renderer path. Corner inversion handles signed edges. Imported transforms are clamped to supported ranges.
- Frame feather and rounding affect the card boundary; a small centered shape may not reach that boundary. Corners must remain a sensible, non-crossing quad.
- Seamless mode uses integer periods, snapped quarter-turn rotations and compatible scale. Polar, mirror, kaleidoscope and swirl bypass seamless layers; the UI explains this. Corner deformation or masking can break the final tile boundary.
- Gradients honor up to eight colors and their positions. The default mix enables color editing immediately. Solid layer color deliberately overrides the shared gradient.
- Blur uses spatial samples; sharpen uses an unsharp mask; chromatic separation samples neighboring positions. Shared effects run per layer before blending, as the UI states.
- Undo/redo includes layers, gradient and effects. Editing text no longer triggers layer deletion. Fit, empty selection, advanced corners, export progress and capability controls are clarified.
- Normal maps use alpha as height. Channel maps pack R=height, G=inverse height, B=alpha. GIF renders offscreen at 384px, 24 frames at 12fps, with binary transparency. Its animation is not guaranteed to join seamlessly at the loop boundary.

## Preset migration

New saves use version 2. Version 1 files retain layer names, blending, transforms, colors and shared effects, but generator parameters reset to current defaults with an explicit migration notice. Even unchanged names had incompatible old parameter meanings; exact old appearance is not promised. Old aliases remain recognized. Unknown generators and malformed files produce errors without replacing the project.

## Reproducible validation

| Command | Coverage |
| --- | --- |
| `npm test` | Catalog integrity/aliases, specialized shader structure, color parsing, history/input regressions, transform normalization |
| `npm run build` | TypeScript and production frontend compilation |
| `npm run lint` | Static lint |
| `npm run test:shaders` | Real WebGL rendering of every generator, parameter probes, common transforms, determinism, post controls, gradient positions/colors, blank/duplicate detection and contact sheet |
| `npm run test:seams` | Every tileable generator, boundary diagnostics and full-period translations |
| `npm run test:ui` | All five inspector screens at normal/minimum desktop sizes, UV and color/history changes, editing shortcuts, PNG/normal/channel/GIF downloads, preset round trip and legacy-name search |
| `npm run generate:thumbnails` | Rebuild library previews from the production renderer |

Generated reports and images live under `artifacts/`. Pixel probes establish that controls influence output at sampled settings; they are not proof for every possible setting combination. Spatial symmetry and controls gated by another value can legitimately produce no change in particular states.

Browser validation uses installed Microsoft Edge and WebGL2. The native Tauri installer, Windows file dialogs, installer signing and clean-machine installation are outside this browser validation and have not been revalidated by this rebuild.
