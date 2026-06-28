import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { degreesFromRadians, makePlaceableClone, setGhostMaterial, setSelectedTint, snapToGrid } from './assetUtils.js';
import { PedestrianController } from './PedestrianController.js';
import { TrafficController } from './TrafficController.js';

const TOWN_CELL_SIZE = 2;
const DIRECTIONS = [
  { id: 'n', dx: 0, dz: -1 },
  { id: 'e', dx: 1, dz: 0 },
  { id: 's', dx: 0, dz: 1 },
  { id: 'w', dx: -1, dz: 0 },
];

export class PlacementController {
  constructor(sceneManager, elements) {
    this.sceneManager = sceneManager;
    this.elements = elements;
    this.loader = new GLTFLoader();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.gridSize = 2;
    this.assets = [];
    this.placed = [];
    this.activeAsset = null;
    this.ghost = null;
    this.selected = null;
    this.mode = 'build';
    this.lastSnap = new THREE.Vector3();
    this.traffic = new TrafficController(this.sceneManager);
    this.pedestrians = new PedestrianController(this.sceneManager);

    const canvas = this.sceneManager.renderer.domElement;
    canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    window.addEventListener('keydown', (event) => this.onKeyDown(event));
  }

  async loadAssets(packs) {
    this.clearGhost();
    this.assets = [];
    this.elements.assetGrid.innerHTML = '<p class="loading-note">Loading assets...</p>';

    const loadedPacks = await Promise.all(packs.map((pack) => this.loadPack(pack)));
    this.assets = loadedPacks.flat();
    this.traffic.setAssets(this.assets);
    this.pedestrians.setAssets(this.assets);
    this.syncTrafficRoads();
    this.renderAssetButtons();

    const firstPaletteAsset = this.assets.find((asset) => asset.showInPalette !== false);

    if (firstPaletteAsset) {
      this.chooseAsset(firstPaletteAsset.id);
    }
  }

  setMode(mode) {
    this.mode = mode;
    this.sceneManager.setBuildMode(mode !== 'view');

    if (mode === 'view') {
      this.clearGhost();
      this.select(null);
      this.elements.modeLabel.textContent = 'View mode: WASD moves, arrow keys rotate, mouse orbits.';
      return;
    }

    if (mode === 'generate') {
      this.clearGhost();
      this.select(null);
      this.elements.modeLabel.textContent = 'Generate mode: create a random complete town.';
      return;
    }

    if (this.activeAsset) {
      this.chooseAsset(this.activeAsset.id);
    } else if (this.assets[0]) {
      this.chooseAsset(this.assets[0].id);
    }
  }

  async loadPack(pack) {
    const gltf = await this.loader.loadAsync(pack.url);
    const splitChildren = pack.splitChildren === true;
    const roots = splitChildren ? getSplitRoots(gltf.scene) : [gltf.scene];

    return roots.map((source, index) => {
      const isSingleAsset = !splitChildren && roots.length === 1;
      const id = isSingleAsset ? pack.id : `${pack.id}-${slugify(source.name || `piece-${index + 1}`)}`;
      const name = isSingleAsset ? pack.name : prettifyName(source.name || `${pack.name} ${index + 1}`);

      return {
        id,
        name,
        kind: pack.kind ?? 'asset',
        packName: pack.name,
        source,
        scale: pack.scale ?? 1,
        rotationStep: pack.rotationStep ?? 90,
        showInPalette: pack.showInPalette ?? true,
        trafficForwardAxis: pack.trafficForwardAxis ?? 'z',
        personForwardAxis: pack.personForwardAxis ?? 'z',
        animations: gltf.animations,
      };
    });
  }

  renderAssetButtons() {
    this.elements.assetGrid.innerHTML = '';

    this.assets.filter((asset) => asset.showInPalette !== false).forEach((asset) => {
      const button = document.createElement('button');
      button.className = 'asset-button';
      button.type = 'button';
      button.dataset.assetId = asset.id;
      button.innerHTML = `
        <span class="asset-thumb asset-thumb--${asset.kind}"></span>
        <span>${asset.name}</span>
      `;
      button.addEventListener('click', () => this.chooseAsset(asset.id));
      this.elements.assetGrid.append(button);
    });
  }

  chooseAsset(assetId) {
    if (this.mode !== 'build') {
      return;
    }

    this.activeAsset = this.assets.find((asset) => asset.id === assetId);
    this.clearGhost();
    this.ghost = makePlaceableClone(this.activeAsset.source, this.activeAsset);
    setGhostMaterial(this.ghost);
    this.ghost.visible = false;
    this.sceneManager.add(this.ghost);

    this.elements.assetGrid.querySelectorAll('.asset-button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.assetId === assetId);
    });

    this.elements.modeLabel.textContent = `${this.activeAsset.name}: click a grid square to place.`;
  }

  setGridSize(size) {
    this.gridSize = size;
    this.sceneManager.setGridSize(size);
  }

  setTrafficDensity(density) {
    this.traffic.setDensity(density);
  }

  onPointerMove(event) {
    if (this.mode !== 'build') {
      return;
    }

    this.updatePointer(event);
    const groundPoint = this.getGroundPoint();

    if (!groundPoint || !this.ghost) {
      return;
    }

    this.lastSnap.copy(snapToGrid(groundPoint, this.gridSize));
    this.ghost.position.copy(this.lastSnap);
    this.ghost.visible = true;
  }

  onPointerDown(event) {
    if (this.mode !== 'build' || event.button !== 0) {
      return;
    }

    this.updatePointer(event);
    const placed = this.getPlacedUnderPointer();

    if (placed) {
      this.select(placed);
      return;
    }

    if (this.activeAsset && this.ghost?.visible) {
      this.placeActive();
    }
  }

  onKeyDown(event) {
    if (this.mode !== 'build' || isTypingTarget(event.target)) {
      return;
    }

    if (event.key === 'q' || event.key === 'Q') {
      this.rotateSelected(-1);
      event.preventDefault();
    }

    if (event.key === 'e' || event.key === 'E') {
      this.rotateSelected(1);
      event.preventDefault();
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      this.deleteSelected();
      event.preventDefault();
    }

    if (event.key === 'Escape') {
      this.select(null);
      event.preventDefault();
    }
  }

  placeActive() {
    if (this.mode !== 'build') {
      return;
    }

    const object = makePlaceableClone(this.activeAsset.source, this.activeAsset);
    object.position.copy(this.lastSnap);
    object.rotation.y = this.ghost.rotation.y;
    object.userData.editorObject = true;
    object.userData.assetId = this.activeAsset.id;
    object.userData.assetName = this.activeAsset.name;
    this.placed.push(object);
    this.sceneManager.add(object);
    this.syncTrafficRoads();
    this.select(object);
  }

  rotateSelected(direction) {
    if (this.mode !== 'build') {
      return;
    }

    const target = this.selected ?? this.ghost;

    if (!target) {
      return;
    }

    const step = THREE.MathUtils.degToRad(target.userData.rotationStep ?? 90);
    target.rotation.y += step * direction;
    this.syncTrafficRoads();
    this.updateSelectionReadout();
  }

  duplicateSelected() {
    if (this.mode !== 'build' || !this.selected) {
      return;
    }

    const asset = this.assets.find((item) => item.id === this.selected.userData.assetId);

    if (!asset) {
      return;
    }

    const clone = makePlaceableClone(asset.source, asset);
    clone.position.copy(this.selected.position).add(new THREE.Vector3(this.gridSize, 0, 0));
    clone.rotation.copy(this.selected.rotation);
    clone.userData.editorObject = true;
    this.placed.push(clone);
    this.sceneManager.add(clone);
    this.syncTrafficRoads();
    this.select(clone);
  }

  clearTown() {
    this.select(null);
    this.clearGhost();
    this.placed.forEach((object) => this.sceneManager.remove(object));
    this.placed = [];
    this.traffic.reset();
    this.pedestrians.reset();
    this.syncTrafficRoads();

    if (this.elements.generateStatus) {
      this.elements.generateStatus.textContent = 'Ready';
    }
  }

  generateTown() {
    const roadParts = getRoadParts(this.assets);
    const buildingAssets = this.assets.filter((asset) => asset.kind === 'building');

    if (!roadParts.any || buildingAssets.length === 0) {
      if (this.elements.generateStatus) {
        this.elements.generateStatus.textContent = 'Missing assets';
      }
      return;
    }

    this.clearTown();

    const town = createRoadNetwork();
    const roadSet = new Set(town.cells.map(cellKey));
    let roadCount = 0;

    town.cells.forEach((cell) => {
      const connections = getRoadConnections(cell, roadSet);
      const roadPlacement = getRoadPlacement(connections, roadParts);

      if (!roadPlacement.asset) {
        return;
      }

      this.placeGeneratedAsset(roadPlacement.asset, cell.x, cell.z, roadPlacement.rotation);
      roadCount += 1;
    });

    const lots = createBuildingLots(town, roadSet);
    const usedCells = new Set(roadSet);
    const maxBuildings = randomInt(36, 54);
    let buildingCount = 0;

    shuffle(lots).some((lot) => {
      if (buildingCount >= maxBuildings) {
        return true;
      }

      if (usedCells.has(cellKey(lot))) {
        return false;
      }

      const asset = pickBuildingAsset(buildingAssets);
      this.placeGeneratedAsset(asset, lot.x, lot.z, rotationFacingRoad(lot.roadDirections));
      usedCells.add(cellKey(lot));
      buildingCount += 1;
      return false;
    });

    if (this.elements.generateStatus) {
      this.elements.generateStatus.textContent = `${roadCount} roads, ${buildingCount} buildings`;
    }

    this.elements.modeLabel.textContent = 'Generated town: press Generate Town again to reshuffle.';
    this.syncTrafficRoads();
  }

  placeGeneratedAsset(asset, cellX, cellZ, rotation) {
    const object = makePlaceableClone(asset.source, asset);
    object.position.set(cellX * TOWN_CELL_SIZE, 0, cellZ * TOWN_CELL_SIZE);
    object.rotation.y = rotation;
    object.userData.editorObject = true;
    object.userData.assetId = asset.id;
    object.userData.assetName = asset.name;
    object.userData.generatedTownObject = true;
    this.placed.push(object);
    this.sceneManager.add(object);
    return object;
  }

  deleteSelected() {
    if (this.mode !== 'build' || !this.selected) {
      return;
    }

    this.sceneManager.remove(this.selected);
    this.placed = this.placed.filter((object) => object !== this.selected);
    this.syncTrafficRoads();
    this.select(null);
  }

  select(object) {
    if (this.selected) {
      setSelectedTint(this.selected, false);
    }

    this.selected = object;

    if (this.selected) {
      setSelectedTint(this.selected, true);
    }

    this.updateSelectionReadout();
  }

  updateSelectionReadout() {
    if (!this.selected) {
      this.elements.selectedName.textContent = 'None';
      this.elements.selectedPosition.textContent = '-';
      this.elements.selectedRotation.textContent = `${degreesFromRadians(this.ghost?.rotation.y ?? 0)} deg`;
      return;
    }

    this.elements.selectedName.textContent = this.selected.userData.assetName;
    this.elements.selectedPosition.textContent = `${formatNumber(this.selected.position.x)}, ${formatNumber(this.selected.position.z)}`;
    this.elements.selectedRotation.textContent = `${degreesFromRadians(this.selected.rotation.y)} deg`;
  }

  updatePointer(event) {
    const rect = this.sceneManager.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  getGroundPoint() {
    this.raycaster.setFromCamera(this.pointer, this.sceneManager.camera);
    const [hit] = this.raycaster.intersectObject(this.sceneManager.ground);
    return hit?.point ?? null;
  }

  getPlacedUnderPointer() {
    this.raycaster.setFromCamera(this.pointer, this.sceneManager.camera);
    const hits = this.raycaster.intersectObjects(this.placed, true);
    const hit = hits.find((item) => item.object.parent);
    return hit ? findEditorRoot(hit.object) : null;
  }

  clearGhost() {
    if (this.ghost) {
      this.sceneManager.remove(this.ghost);
      this.ghost = null;
    }
  }

  syncTrafficRoads() {
    this.traffic.syncRoads(this.placed);
    this.pedestrians.syncRoads(this.placed);
  }
}

function hasRenderableMesh(object) {
  let hasMesh = false;
  object.traverse((child) => {
    hasMesh = hasMesh || child.isMesh;
  });
  return hasMesh;
}

function getSplitRoots(scene) {
  const directChildren = scene.children.filter((child) => hasRenderableMesh(child));

  if (directChildren.length === 1 && !directChildren[0].isMesh) {
    const nestedChildren = directChildren[0].children.filter((child) => hasRenderableMesh(child));

    if (nestedChildren.length > 1) {
      return nestedChildren;
    }
  }

  return directChildren.length > 0 ? directChildren : [scene];
}

function findEditorRoot(object) {
  let current = object;

  while (current.parent && !current.userData.editorObject) {
    current = current.parent;
  }

  return current.userData.editorObject ? current : null;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function prettifyName(value) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatNumber(value) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function isTypingTarget(target) {
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable;
}

function createRoadNetwork() {
  const span = randomInt(7, 9);
  const lineCandidates = [-6, -4, -2, 0, 2, 4, 6].filter((value) => Math.abs(value) < span);
  const verticals = [0, ...sample(lineCandidates.filter((value) => value !== 0), randomInt(2, 3))].sort((a, b) => a - b);
  const horizontals = [0, ...sample(lineCandidates.filter((value) => value !== 0), randomInt(2, 3))].sort((a, b) => a - b);
  const roads = new Map();

  verticals.forEach((x) => {
    for (let z = -span; z <= span; z += 1) {
      addRoad(roads, x, z);
    }
  });

  horizontals.forEach((z) => {
    for (let x = -span; x <= span; x += 1) {
      addRoad(roads, x, z);
    }
  });

  const intersections = verticals.flatMap((x) => horizontals.map((z) => ({ x, z })));
  const spurCount = randomInt(5, 8);

  for (let index = 0; index < spurCount; index += 1) {
    const start = randomItem(intersections);
    const direction = randomItem(DIRECTIONS);
    const length = randomInt(2, 5);

    for (let step = 1; step <= length; step += 1) {
      const x = start.x + direction.dx * step;
      const z = start.z + direction.dz * step;

      if (Math.abs(x) > span || Math.abs(z) > span) {
        break;
      }

      addRoad(roads, x, z);
    }
  }

  return {
    span,
    cells: [...roads.values()].sort((a, b) => a.z - b.z || a.x - b.x),
  };
}

function createBuildingLots(town, roadSet) {
  const lots = [];

  for (let z = -town.span; z <= town.span; z += 1) {
    for (let x = -town.span; x <= town.span; x += 1) {
      const cell = { x, z };

      if (roadSet.has(cellKey(cell))) {
        continue;
      }

      const roadDirections = getRoadConnections(cell, roadSet);

      if (roadDirections.length === 0 || Math.random() < 0.18) {
        continue;
      }

      lots.push({ x, z, roadDirections });
    }
  }

  return lots;
}

function getRoadParts(assets) {
  const roads = assets.filter((asset) => asset.kind === 'road');
  const find = (...needles) => roads.find((asset) => needles.every((needle) => searchableName(asset).includes(needle)));
  const corners = roads.filter((asset) => searchableName(asset).includes('corner'));

  return {
    any: roads[0] ?? null,
    straight: find('road', 'straight') ?? roads[0] ?? null,
    corner: corners,
    t: find('tsplit') ?? find('t split') ?? find('t-split') ?? roads[0] ?? null,
    cross: find('junction') ?? find('crossing') ?? roads[0] ?? null,
  };
}

function getRoadPlacement(connections, roadParts) {
  const has = (id) => connections.includes(id);

  if (connections.length >= 4) {
    return { asset: roadParts.cross, rotation: 0 };
  }

  if (connections.length === 3) {
    if (!has('s')) return { asset: roadParts.t, rotation: 0 };
    if (!has('w')) return { asset: roadParts.t, rotation: Math.PI / 2 };
    if (!has('n')) return { asset: roadParts.t, rotation: Math.PI };
    return { asset: roadParts.t, rotation: -Math.PI / 2 };
  }

  if (connections.length === 2 && !areOpposite(connections[0], connections[1])) {
    if (has('n') && has('e')) return { asset: randomItem(roadParts.corner) ?? roadParts.straight, rotation: 0 };
    if (has('e') && has('s')) return { asset: randomItem(roadParts.corner) ?? roadParts.straight, rotation: Math.PI / 2 };
    if (has('s') && has('w')) return { asset: randomItem(roadParts.corner) ?? roadParts.straight, rotation: Math.PI };
    return { asset: randomItem(roadParts.corner) ?? roadParts.straight, rotation: -Math.PI / 2 };
  }

  const eastWest = has('e') || has('w');
  return {
    asset: roadParts.straight,
    rotation: eastWest ? Math.PI / 2 : 0,
  };
}

function getRoadConnections(cell, roadSet) {
  return DIRECTIONS
    .filter((direction) => roadSet.has(cellKey({ x: cell.x + direction.dx, z: cell.z + direction.dz })))
    .map((direction) => direction.id);
}

function rotationFacingRoad(roadDirections) {
  const direction = randomItem(roadDirections) ?? 's';

  if (direction === 'n') return Math.PI;
  if (direction === 'e') return Math.PI / 2;
  if (direction === 'w') return -Math.PI / 2;
  return 0;
}

function pickBuildingAsset(buildings) {
  const sorted = [...buildings].sort((a, b) => searchableName(a).localeCompare(searchableName(b)));
  const roll = Math.random();
  const skyscrapers = sorted.filter((asset) => searchableName(asset).includes('skyscraper'));
  const storefronts = sorted.filter((asset) => {
    const name = searchableName(asset);
    return name.includes('store') || name.includes('pizza');
  });

  if (skyscrapers.length > 0 && roll > 0.9) {
    return randomItem(skyscrapers);
  }

  if (storefronts.length > 0 && roll < 0.24) {
    return randomItem(storefronts);
  }

  return randomItem(sorted.filter((asset) => !skyscrapers.includes(asset))) ?? randomItem(sorted);
}

function addRoad(roads, x, z) {
  roads.set(cellKey({ x, z }), { x, z });
}

function cellKey(cell) {
  return `${cell.x},${cell.z}`;
}

function searchableName(asset) {
  return `${asset.id} ${asset.name}`.toLowerCase();
}

function areOpposite(first, second) {
  return (first === 'n' && second === 's') || (first === 's' && second === 'n') || (first === 'e' && second === 'w') || (first === 'w' && second === 'e');
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sample(items, count) {
  return shuffle([...items]).slice(0, count);
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }

  return items;
}
