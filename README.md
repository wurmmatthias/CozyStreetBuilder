# Cozy Street Builder

A small Three.js street-building editor for snapping modular roads and buildings onto a grid.

## Run It

```bash
npm install
npm run dev
```

Open the local URL Vite prints, usually `http://127.0.0.1:5173/`.

## Controls

- Use `Build` mode to show the grid and edit tools.
- Use `Generate` mode to create a complete randomized town with connected roads and street-facing buildings.
- Use `View` mode to hide the grid and build tools.
- Pick a road or building asset from the left panel in Build mode.
- Move over the grid to preview placement, then click to place.
- Use `Q` / `E` or the rotate buttons to rotate placed assets in 90 degree steps.
- Use `WASD` to move the camera and arrow keys to rotate it.
- Select placed assets by clicking them.
- Duplicate or delete the selected asset from the left panel.
- Change grid snapping with the grid slider.

## Add More Assets

Put GLB files in `public/assets`, then add entries to `src/editor/assetCatalog.js`.

```js
export const assetPacks = [
  {
    id: 'road-bits',
    name: 'Road Bits',
    url: '/assets/road-bits.glb',
    splitChildren: true,
    kind: 'road',
    scale: 1,
    rotationStep: 90,
  },
  {
    id: 'small-building',
    name: 'Small Building',
    url: '/assets/Small%20Building.glb',
    kind: 'building',
    scale: 1,
    rotationStep: 90,
  },
];
```

Use `splitChildren: true` when one GLB contains several named meshes or child nodes. The editor will expose each child as a separate palette item.
