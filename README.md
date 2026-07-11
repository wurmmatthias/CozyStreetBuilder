# Cozy Street Builder

Cozy Street Builder is a small Three.js city builder for creating cute low-poly streets, roads, buildings, traffic, and little town scenes directly in the browser.

The main menu displays the version from `package.json`. GitHub Pages deployments automatically add the Actions build number and short commit SHA; local builds are labeled as development builds. Bump the release portion with `npm version patch`, `npm version minor`, or `npm version major` when appropriate.

## Features

- Grid-based placement for modular roads and buildings
- Build, Generate, and View modes
- Random town generation with roads, buildings, foliage, pedestrians, and traffic
- Simple camera controls for exploring the scene
- Pause menu with local saves and portable `.cozytown` import/export for normal and sandbox towns
- GLB asset support through the local asset catalog

## Run Locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://127.0.0.1:5173/`.

## Credits

Copyright (c) 2026 Matthias.

Assets are from [Poly Pizza](https://poly.pizza/).
