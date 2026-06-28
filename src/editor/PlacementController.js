import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { degreesFromRadians, makePlaceableClone, setGhostMaterial, setSelectedTint, snapToGrid } from './assetUtils.js';

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
    this.renderAssetButtons();

    if (this.assets[0]) {
      this.chooseAsset(this.assets[0].id);
    }
  }

  setMode(mode) {
    this.mode = mode;
    this.sceneManager.setBuildMode(mode === 'build');

    if (mode === 'view') {
      this.clearGhost();
      this.select(null);
      this.elements.modeLabel.textContent = 'View mode: WASD moves, arrow keys rotate, mouse orbits.';
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
      };
    });
  }

  renderAssetButtons() {
    this.elements.assetGrid.innerHTML = '';

    this.assets.forEach((asset) => {
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
    this.select(clone);
  }

  deleteSelected() {
    if (this.mode !== 'build' || !this.selected) {
      return;
    }

    this.sceneManager.remove(this.selected);
    this.placed = this.placed.filter((object) => object !== this.selected);
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
