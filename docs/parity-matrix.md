# VFX Texture Generator parity matrix

## Clean-room statement

This project is a clean-room implementation. The generator names and externally observable behavior are compatibility requirements only; no source code, shader code, assets, or other implementation details from another product are to be copied. Every parity result must be established from independently written code and black-box observation.

## Status key

- **Required**: part of the current generator inventory in `src/catalog.ts`.
- **Pending**: acceptance has not yet been demonstrated and recorded.
- A generator is complete only when visual output, controls, deterministic behavior, and export behavior have all passed.

## Generator inventory

90 recipes. Suffix variants (extra wave rings, checker styles, flare aliases, `*V2` copies) were folded into shared controls. Live names are defined in `src/catalog.ts`.

### Radial (12)

Circle, Vignette, LensFlare, Sun, Ring, Crescent, Flash, Halo, Ripple, Concentric, MetaBalls, WaveRing

### Shapes & Bursts (20)

Star, Polygon, HexGridRadial, Rectangle, Quad, Checker, Spark, Flare, Cross, Burst, RadialLines, Swirl, GodRay, Flower, Spiral, Energy, Crack, Bokeh, Shimmer, Speckle

### Patterns (19)

CrossGrid, SquareGrid, PyramidPattern, RandomTiles, Dots, DotMatrix, Zigzag, Crosshatch, TriGrid, Bricks, Scanline, FlowLines, Fabric, PolarDots, Weave, Halftone, SweepGradient, GradationLinear, BevelSquare

### Noise & Organic (27)

Grain, PerlinNoise, FbmNoise, DistortionWave, StripeNoise, ToxicCloud, GeoRelief, Smoke, WaterTurbulence, Electric, Lava, Wrinkle, Crystal, AbsNoise, FractalCamo, Squiggles, Grunge, CellularEdge, Twirl, CosmicPortal, Wormhole, Plasma, MarbleNoise, Fire, Cloud, Caustics, Aurora

### Digital & Utility (12)

PixelNoise, AnalogGlitch, CyberBlock, Mosaic, LaserBeam, GlitchBlock, VoronoiCell, Matrix, Wood, Cell, Lightning, Kaleido

## Per-generator acceptance

For each name above:

- [ ] Generator is discoverable by the exact listed name.
- [ ] Default output matches the clean-room visual reference within the agreed tolerance.
- [ ] Every exposed parameter has the expected label, range, default, and visible effect.
- [ ] Same seed and settings reproduce the same output.
- [ ] Edge values remain finite and render without WebGL or JavaScript errors.
- [ ] Static export preserves dimensions, alpha, color, and the current parameter state.
- [ ] Animated export, when supported by the reference, preserves timing, looping, dimensions, and alpha.

## Global feature acceptance

### Desktop shell

- [ ] Development mode launches through `npm run tauri:dev`.
- [ ] Production frontend and Rust desktop shell build through `npm run tauri:build`.
- [ ] Main window opens at 1440×900 and cannot resize below 1180×720.
- [ ] Windows NSIS and MSI installers build and launch on a clean supported Windows machine.
- [ ] The installed app uses identifier `com.vfxtexturegenerator.app`.
- [ ] Content Security Policy blocks unapproved remote scripts and resources without breaking local rendering.

### Project and file workflow

- [ ] Native open dialog can select a user project or supported input file.
- [ ] Native save dialog can choose an export or project destination.
- [ ] File-system access is limited to paths explicitly selected by the user.
- [ ] New, open, save, save-as, and recent-project behavior preserve all generator settings.
- [ ] Unsaved-change prompts prevent accidental data loss.
- [ ] Invalid, missing, or incompatible files produce actionable errors without losing current work.

### Authoring experience

- [ ] Generator search, category navigation, and selection cover all generators in the catalog.
- [ ] Parameter editing supports keyboard entry, pointer input, reset, and undo/redo.
- [ ] Preview updates interactively and remains responsive at the supported maximum resolution.
- [ ] Zoom, pan, checkerboard/alpha preview, and fit-to-view behave consistently.
- [ ] UV offset U/V slides every generator inside its layer.
- [ ] Repeat UV can be turned off so offset does not wrap at the edges.
- [ ] Four-corner warp, edge feather, and corner roundness apply to every layer.
- [ ] Randomize and seed controls are deterministic and reversible.
- [ ] Presets can be created, applied, renamed, and deleted without cross-generator corruption.

### Export and reliability

- [ ] PNG export supports expected dimensions and transparency.
- [ ] GIF export supports expected frame count, frame rate, loop mode, dimensions, and transparency policy.
- [ ] Export cancellation and write failures leave no misleading successful result.
- [ ] Repeated generation and export do not cause unbounded CPU, GPU, or memory growth.
- [ ] Keyboard navigation, focus indicators, labels, contrast, and reduced-motion behavior are usable.
- [ ] Automated tests pass with `npm test`; frontend compilation passes with `npm run build`.
- [ ] Rust formatting and static verification pass with `cargo fmt --check` and `cargo check`.
