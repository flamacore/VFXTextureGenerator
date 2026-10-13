# Shader and control audit

The October 2026 audit renders the production WebGL shaders and Canvas2D compositing pipeline in headless Edge. It does not substitute mocked shader output.

## Findings before cleanup

- 90 generator labels shared 14 shader implementations, with name-derived variations that often contradicted their labels.
- 48 of 540 exposed generator controls produced no pixel change at their minimum, intermediate, or maximum values.
- The old contact sheet shows Cross as noise, Rectangle as a triangular floral mask, Lightning as a starburst, and multiple fluid and spiral labels with essentially the same structure.
- Gradient stop positions did not affect rendered output.

The baseline report and contact sheet are in `artifacts/shader-audit-baseline/`.

## Verification after cleanup

- All 28 generators render nonblank defaults with no browser errors.
- All 149 exposed generator parameters change rendered pixels when independently probed at three values.
- All 14 shared post/color settings change at least one generator; middle gradient-stop position and fourth-stop color both affect output.
- Every pair of default renders is compared. None is identical or within the audit's near-identical threshold (mean premultiplied RGBA difference below 1/255).
- All 28 generated thumbnails use the actual renderer. The complete contact sheet was visually inspected, including the distinct Star, Crystal, Fire, Smoke, Caustics, Lightning, Cross, and Aurora outputs.
- All 10 generators advertised as tileable are checked with transformed, animated, bloomed rendering and translations by a complete tile in both directions.

## Reproduce

```sh
node scripts/shader-audit.mjs
npm run test:seams
npm run generate:thumbnails
```

`shader-audit.mjs` writes `report.json` and `contact-sheet.png` to `artifacts/shader-audit/`. Override the output directory with `--output=...`. `seam-check.mjs` writes `seams.json` to the same default audit directory. These scripts require Microsoft Edge, matching the existing project's browser tooling.

The shader audit records each common transform and toggle separately. A zero delta is not automatically a defect: rotating a circular mask, vertically shifting a horizontal gradient, or rounding a frame around a small centered shape can legitimately preserve the image. Seed and animation controls are exposed only for generators that use them; frame rate zero intentionally freezes Grain. Frame feather and roundness affect the boundary, so compact shapes can remain unchanged.

The seam audit retains its edge-gradient heuristic for continuous patterns. Intentional block discontinuities in Glitch and Grain are reported as edge warnings rather than rejected as smooth-field failures; these also undergo exact-period checks. Period checks alone do not establish smoothness across a hard wrap, so the shader formulas were inspected as well.

The audit uses 96-pixel images and a fixed nonzero time for parameter checks. It establishes that individual controls are connected and default outputs differ; it does not claim that every combination of settings is aesthetically useful or visually distinct.
