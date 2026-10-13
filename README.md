# VFX Texture Generator

A Windows desktop editor for creating procedural VFX textures. It includes 28 distinct generators with purpose-built controls, four-corner warps and UV offset on every layer, periodic tiling for compatible effects, layer compositing, animation, positioned color gradients, shared effects, and PNG/GIF/normal-map/channel-pack export.

The catalog replaces the former 90 recipe variations. Star, Crystal, Fire, Smoke, Aurora, Caustics, and Lightning now have separate algorithms. Related variations live in one generator's controls. See [the shader and workflow audit](docs/parity-matrix.md) for the inventory, migration behavior, and validation limits.
<img width="2160" height="1350" alt="image" src="https://github.com/user-attachments/assets/74b7ed55-c5c1-4168-909e-f836008009e1" />


## AI assistance disclosure

This project was designed and implemented with substantial AI assistance. AI-generated code has been reviewed, compiled, tested, and iterated on by the project owner, but users and contributors should still review the implementation for their own security, correctness, licensing, and production requirements.

## Clean-room disclaimer

This is an independent clean-room implementation inspired by the publicly observable workflow of an existing web-based texture tool. It does not include or reuse that site's source code, shaders, assets, or branding. Generator output is semantically similar, not pixel-identical.

## For users

Download and run either Windows installer from a release or trusted build:

- `VFX Texture Generator_*_x64-setup.exe` — NSIS installer
- `VFX Texture Generator_*_x64_en-US.msi` — MSI installer

Windows 10/11 and the Microsoft Edge WebView2 runtime are required. Current Windows versions normally include WebView2. Projects can be saved as JSON presets; exported textures are ordinary image files and can be used without this application.

## Development

Requirements:

- Node.js 20 or newer
- Rust stable with Cargo
- Windows 10/11 with WebView2
- Visual Studio C++ Build Tools and packaging tools required by Tauri

```powershell
npm install
npm run tauri:dev
```

Useful commands:

```powershell
npm run build
npm test
npm run lint
npm run test:shaders
npm run test:seams
npm run test:ui
npm run tauri:build
```

Installers are written to `src-tauri/target/release/bundle/`.

Browser validation scripts use the locally installed Microsoft Edge through Playwright. Shader audits save a contact sheet and per-control pixel comparisons under `artifacts/shader-audit/`; UI checks save all five inspector screens at 1440×900 and 1180×720 under `artifacts/ui-audit/`. Run `npm run generate:thumbnails` after changing default shader output.

New projects save preset version 2. Version 1 presets retain layers, transforms, colors, and effects, but generator-specific values reset to the new defaults because the old parameter slots described different operations. The app reports this migration when loading. Old generator names resolve to the closest current family; their old appearance is not guaranteed.

## Releases

Pushing a version tag such as `v0.2.0` runs the GitHub Actions release workflow, verifies the project, builds Windows MSI and NSIS installers, and attaches both to a GitHub release. The workflow can also be started manually with a release tag.

Current installers are not code-signed, so Windows SmartScreen may show an unknown-publisher warning.

## Technology

Tauri 2, React, TypeScript, Vite, Rust, WebGL2, and `gifenc`.
