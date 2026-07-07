import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { degreesFromRadians, makePlaceableClone, setGhostMaterial, setSelectedTint, snapToGrid } from './assetUtils.js';
import { PedestrianController } from './PedestrianController.js';
import { TrafficController } from './TrafficController.js';

const TOWN_CELL_SIZE = 2;
const FIRE_CHECK_MIN_SECONDS = 28;
const FIRE_CHECK_MAX_SECONDS = 70;
const FIRE_START_CHANCE = 0.9;
const MAX_ACTIVE_FIRES = 1;
const SMOKE_PUFF_COUNT = 12;
const STREETLIGHT_ROAD_EDGE_OFFSET = 1.06;
const STREETLIGHT_SNAP_RADIUS = 2.35;
const GENERATED_STREETLIGHT_ROAD_COVERAGE = 0.24;
const DIRECTIONS = [
  { id: 'n', dx: 0, dz: -1 },
  { id: 'e', dx: 1, dz: 0 },
  { id: 's', dx: 0, dz: 1 },
  { id: 'w', dx: -1, dz: 0 },
];
const ROTATE_DRAG_SENSITIVITY = 0.015;

export class PlacementController {
  constructor(sceneManager, elements) {
    this.sceneManager = sceneManager;
    this.elements = elements;
    this.loader = new GLTFLoader();
    this.thumbnailRenderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.thumbnailRenderer.setPixelRatio(1);
    this.thumbnailRenderer.setSize(96, 96, false);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.gridSize = 2;
    this.assets = [];
    this.placed = [];
    this.activeAsset = null;
    this.fireAsset = null;
    this.ghost = null;
    this.selected = null;
    this.selectedResident = null;
    this.selectedFire = null;
    this.fireIncidents = [];
    this.fireSimulationEnabled = false;
    this.nextFireCheck = randomFloat(FIRE_CHECK_MIN_SECONDS, FIRE_CHECK_MAX_SECONDS);
    this.residentCamera = elements.residentViewport
      ? this.sceneManager.createFollowCameraFeed(elements.residentViewport)
      : null;
    this.rotationDrag = null;
    this.mode = 'build';
    this.lastSnap = new THREE.Vector3();
    this.traffic = new TrafficController(this.sceneManager);
    this.pedestrians = new PedestrianController(this.sceneManager);
    this.generationOptions = {
      townSize: 1,
      buildingDensity: 0.7,
      foliageDensity: 0.55,
      trafficDensity: 0.5,
    };

    this.canvas = this.sceneManager.renderer.domElement;
    this.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event), true);
    this.canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.canvas.addEventListener('pointercancel', (event) => this.onPointerUp(event));
    this.canvas.addEventListener('pointerleave', () => this.updateCanvasCursor(null));
    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    this.elements.callPolice?.addEventListener('click', () => this.callPoliceOnSelectedResident());
    this.elements.dispatchFireTruck?.addEventListener('click', () => this.callFireTruckOnSelectedFire());
    this.sceneManager.addUpdater(() => this.updateSelectedResident());
    this.sceneManager.addUpdater((delta, now) => this.updateFireIncidents(delta, now));
  }

  async loadAssets(packs) {
    this.clearGhost();
    this.assets = [];
    this.elements.assetGrid.innerHTML = '<p class="loading-note">Loading town pieces...</p>';

    const loadedPacks = await Promise.all(packs.map((pack) => this.loadPack(pack)));
    this.assets = loadedPacks.flat();
    this.fireAsset = this.assets.find((asset) => asset.kind === 'effect' && asset.id === 'fire') ?? null;
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
    this.stopRotationDrag();
    this.updateCanvasCursor(null);

    if (mode === 'view') {
      this.clearGhost();
      this.select(null);
      this.elements.modeLabel.textContent = 'View mode is open. Click an inhabitant or a smoking building.';
      return;
    }

    if (mode === 'generate') {
      this.clearGhost();
      this.select(null);
      this.selectFire(null);
      this.elements.modeLabel.textContent = 'Town generator is ready.';
      return;
    }

    this.selectFire(null);

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
        generationRole: pack.generationRole ?? null,
        generationWeight: pack.generationWeight ?? 1,
        trafficForwardAxis: pack.trafficForwardAxis ?? 'z',
        personForwardAxis: pack.personForwardAxis ?? 'z',
        animations: gltf.animations,
      };
    });
  }

  renderAssetButtons() {
    this.elements.assetGrid.innerHTML = '';

    [
      { kind: 'road', title: 'Roads' },
      { kind: 'building', title: 'Buildings' },
      { kind: 'foliage', title: 'Foliage' },
      { kind: 'streetlight', title: 'Lighting' },
    ].forEach((group) => {
      const assets = this.assets.filter((asset) => asset.showInPalette !== false && asset.kind === group.kind);

      if (assets.length === 0) {
        return;
      }

      const section = document.createElement('section');
      section.className = 'asset-group';
      section.innerHTML = `<h3>${group.title}</h3><div class="asset-grid"></div>`;
      const grid = section.querySelector('.asset-grid');

      assets.forEach((asset) => {
        const thumbnail = this.renderAssetThumbnail(asset);
        const button = document.createElement('button');
        button.className = 'asset-button';
        button.type = 'button';
        button.dataset.assetId = asset.id;
        button.innerHTML = `
          ${thumbnail ? `<span class="asset-preview"><img src="${thumbnail}" alt="" draggable="false" /></span>` : `<span class="asset-thumb asset-thumb--${asset.kind}"></span>`}
          <span>${asset.name}</span>
        `;
        button.addEventListener('click', () => this.chooseAsset(asset.id));
        grid.append(button);
      });

      this.elements.assetGrid.append(section);
    });
  }

  renderAssetThumbnail(asset) {
    if (asset.thumbnailUrl) {
      return asset.thumbnailUrl;
    }

    try {
      const previewScene = new THREE.Scene();
      const model = makePlaceableClone(asset.source, asset);
      model.rotation.y = asset.kind === 'road' ? -Math.PI / 4 : Math.PI / 5;
      model.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const longestSide = Math.max(size.x, size.y, size.z, 0.01);
      const viewSize = Math.max(longestSide * 1.35, 1.4);
      const camera = new THREE.OrthographicCamera(
        -viewSize / 2,
        viewSize / 2,
        viewSize / 2,
        -viewSize / 2,
        0.01,
        100,
      );
      const cameraDirection = asset.kind === 'road'
        ? new THREE.Vector3(1, 1.65, 1)
        : new THREE.Vector3(1.15, 0.95, 1.25);

      camera.position.copy(center).add(cameraDirection.normalize().multiplyScalar(longestSide * 3.2));
      camera.lookAt(center);
      previewScene.add(model);
      previewScene.add(new THREE.HemisphereLight('#f7f4e8', '#536566', 2.4));

      const keyLight = new THREE.DirectionalLight('#fff1cf', 3.8);
      keyLight.position.set(4, 7, 5);
      previewScene.add(keyLight);

      this.thumbnailRenderer.setClearColor(0x000000, 0);
      this.thumbnailRenderer.render(previewScene, camera);
      asset.thumbnailUrl = this.thumbnailRenderer.domElement.toDataURL('image/png');
      return asset.thumbnailUrl;
    } catch (error) {
      console.warn(`Could not render thumbnail for ${asset.name}.`, error);
      return '';
    }
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

    this.elements.modeLabel.textContent = `${this.activeAsset.name} selected.`;
  }

  setGridSize(size) {
    this.gridSize = size;
    this.sceneManager.setGridSize(size);
  }

  setTrafficDensity(density) {
    const nextDensity = THREE.MathUtils.clamp(density, 0, 1);
    this.generationOptions.trafficDensity = nextDensity;
    this.traffic.setDensity(nextDensity);
  }

  setGenerationOptions(options) {
    this.generationOptions = {
      ...this.generationOptions,
      ...options,
    };
    this.generationOptions.townSize = THREE.MathUtils.clamp(Math.round(this.generationOptions.townSize), 0, 2);
    this.generationOptions.buildingDensity = THREE.MathUtils.clamp(this.generationOptions.buildingDensity, 0, 1);
    this.generationOptions.foliageDensity = THREE.MathUtils.clamp(this.generationOptions.foliageDensity, 0, 1);
    this.generationOptions.trafficDensity = THREE.MathUtils.clamp(this.generationOptions.trafficDensity, 0, 1);
  }

  setFireSimulationEnabled(enabled) {
    this.fireSimulationEnabled = enabled;
  }

  onPointerMove(event) {
    if (this.mode !== 'build') {
      return;
    }

    this.updatePointer(event);

    if (this.rotationDrag) {
      this.updateRotationDrag(event);
      return;
    }

    const placed = this.getPlacedUnderPointer();
    this.updateCanvasCursor(placed);

    const groundPoint = this.getGroundPoint();

    if (!groundPoint || !this.ghost) {
      return;
    }

    const placement = this.getPlacementSnap(groundPoint);

    this.lastSnap.copy(placement.position);
    this.ghost.position.copy(this.lastSnap);

    if (placement.rotation !== null) {
      this.ghost.rotation.y = placement.rotation;
    }

    this.ghost.visible = true;
  }

  onPointerDown(event) {
    if (this.mode === 'view' && event.button === 0) {
      this.updatePointer(event);
      const burningBuilding = this.getBurningBuildingUnderPointer();

      if (burningBuilding) {
        this.selectFire(burningBuilding);
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const resident = this.getResidentUnderPointer();

      if (resident) {
        this.selectResident(resident);
        event.preventDefault();
        event.stopPropagation();
      }

      return;
    }

    if (this.mode !== 'build' || event.button !== 0) {
      return;
    }

    this.updatePointer(event);
    const placed = this.getPlacedUnderPointer();

    if (placed) {
      if (placed === this.selected) {
        this.startRotationDrag(event, placed);
        return;
      }

      this.select(placed);
      this.updateCanvasCursor(placed);
      return;
    }

    if (this.activeAsset && this.ghost?.visible) {
      this.placeActive();
    }
  }

  onPointerUp(event) {
    if (!this.rotationDrag || event.pointerId !== this.rotationDrag.pointerId) {
      return;
    }

    this.stopRotationDrag();
    this.updatePointer(event);
    this.updateCanvasCursor(this.getPlacedUnderPointer());
    event.preventDefault();
  }

  onKeyDown(event) {
    if (this.mode === 'view' && event.key === 'Escape') {
      this.selectResident(null);
      this.selectFire(null);
      event.preventDefault();
      return;
    }

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

  startRotationDrag(event, target) {
    this.rotationDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startRotation: target.rotation.y,
      target,
    };
    this.sceneManager.controls.enabled = false;
    this.canvas.dataset.cursor = 'rotate';
    this.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  updateRotationDrag(event) {
    const drag = this.rotationDrag;

    if (!drag?.target) {
      return;
    }

    const deltaX = event.clientX - drag.startX;
    drag.target.rotation.y = drag.startRotation + deltaX * ROTATE_DRAG_SENSITIVITY;
    this.syncTrafficRoads();
    this.updateSelectionReadout();
    event.preventDefault();
    event.stopPropagation();
  }

  stopRotationDrag() {
    if (!this.rotationDrag) {
      return;
    }

    if (this.canvas.hasPointerCapture?.(this.rotationDrag.pointerId)) {
      this.canvas.releasePointerCapture(this.rotationDrag.pointerId);
    }

    this.rotationDrag = null;
    this.sceneManager.controls.enabled = true;
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
    this.selectResident(null);
    this.selectFire(null);
    this.clearAllFireIncidents();
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
    const foliageAssets = this.assets.filter((asset) => asset.kind === 'foliage');
    const streetlightAssets = this.assets.filter((asset) => asset.kind === 'streetlight');

    if (!roadParts.any || buildingAssets.length === 0) {
      if (this.elements.generateStatus) {
        this.elements.generateStatus.textContent = 'Missing assets';
      }
      return;
    }

    this.clearTown();
    this.traffic.setDensity(this.generationOptions.trafficDensity);

    const town = createRoadNetwork(this.generationOptions.townSize);
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
    const maxBuildings = Math.round(lots.length * THREE.MathUtils.lerp(0, 0.82, this.generationOptions.buildingDensity));
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

    const streetlightPlacements = createStreetlightPlacements(town, roadSet);
    const maxStreetlights = streetlightAssets.length === 0
      ? 0
      : Math.round(town.cells.length * GENERATED_STREETLIGHT_ROAD_COVERAGE);
    const lightedRoads = new Set();
    let streetlightCount = 0;

    shuffle(streetlightPlacements).some((placement) => {
      if (streetlightCount >= maxStreetlights) {
        return true;
      }

      if (lightedRoads.has(placement.roadKey)) {
        return false;
      }

      const asset = randomItem(streetlightAssets);
      this.placeGeneratedAssetAt(asset, placement.position, placement.rotation);
      lightedRoads.add(placement.roadKey);
      usedCells.add(cellKey(placement.sideCell));
      streetlightCount += 1;
      return false;
    });

    const foliageLots = createFoliageLots(town, usedCells);
    const maxFoliage = foliageAssets.length === 0 ? 0 : Math.round(foliageLots.length * THREE.MathUtils.lerp(0, 0.46, this.generationOptions.foliageDensity));
    let foliageCount = 0;

    shuffle(foliageLots).some((lot) => {
      if (foliageCount >= maxFoliage) {
        return true;
      }

      const asset = randomItem(foliageAssets);
      this.placeGeneratedAsset(asset, lot.x, lot.z, randomFoliageRotation());
      usedCells.add(cellKey(lot));
      foliageCount += 1;
      return false;
    });

    if (this.elements.generateStatus) {
      this.elements.generateStatus.textContent = `${roadCount} roads, ${buildingCount} buildings, ${streetlightCount} lights, ${foliageCount} trees`;
    }

    this.elements.modeLabel.textContent = 'Fresh town generated.';
    this.syncTrafficRoads();
  }

  placeGeneratedAsset(asset, cellX, cellZ, rotation) {
    return this.placeGeneratedAssetAt(
      asset,
      new THREE.Vector3(cellX * TOWN_CELL_SIZE, 0, cellZ * TOWN_CELL_SIZE),
      rotation,
    );
  }

  placeGeneratedAssetAt(asset, position, rotation) {
    const object = makePlaceableClone(asset.source, asset);
    object.position.copy(position);
    object.rotation.y = rotation;
    object.userData.editorObject = true;
    object.userData.assetId = asset.id;
    object.userData.assetName = asset.name;
    object.userData.generatedTownObject = true;
    this.placed.push(object);
    this.sceneManager.add(object);
    return object;
  }

  getPlacementSnap(groundPoint) {
    if (this.activeAsset?.kind === 'streetlight') {
      const streetlightSnap = this.getStreetlightRoadSnap(groundPoint);

      if (streetlightSnap) {
        return streetlightSnap;
      }
    }

    return {
      position: snapToGrid(groundPoint, this.gridSize),
      rotation: null,
    };
  }

  getStreetlightRoadSnap(point) {
    const roads = this.placed.filter((object) => object.userData.assetKind === 'road');
    let nearest = null;
    let nearestDistance = Infinity;

    roads.forEach((road) => {
      const distance = Math.hypot(point.x - road.position.x, point.z - road.position.z);

      if (distance < nearestDistance) {
        nearest = road;
        nearestDistance = distance;
      }
    });

    if (!nearest || nearestDistance > STREETLIGHT_SNAP_RADIUS) {
      return null;
    }

    const dx = point.x - nearest.position.x;
    const dz = point.z - nearest.position.z;
    const sideDirection = Math.abs(dx) > Math.abs(dz)
      ? { dx: dx >= 0 ? 1 : -1, dz: 0 }
      : { dx: 0, dz: dz >= 0 ? 1 : -1 };

    return createStreetlightPlacementForSide(nearest.position.x, nearest.position.z, sideDirection);
  }

  deleteSelected() {
    if (this.mode !== 'build' || !this.selected) {
      return;
    }

    if (this.selected.userData.fireIncident) {
      this.extinguishBuildingFire(this.selected);
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
    this.updateCanvasCursor(null);
  }

  selectResident(person) {
    if (this.selectedResident?.object) {
      setSelectedTint(this.selectedResident.object, false);
    }

    this.selectedResident = person;
    this.residentCamera?.setTarget(person?.object ?? null);

    if (!person) {
      if (this.elements.residentWindow) {
        this.elements.residentWindow.hidden = true;
      }

      return;
    }

    this.selectFire(null);
    setSelectedTint(person.object, true);

    if (this.elements.residentWindow) {
      this.elements.residentWindow.hidden = false;
    }

    if (this.elements.residentName) {
      this.elements.residentName.textContent = person.identity.name;
    }

    if (this.elements.residentOccupation) {
      this.elements.residentOccupation.textContent = person.identity.occupation;
    }

    if (this.elements.residentAge) {
      this.elements.residentAge.textContent = person.identity.age.toString();
    }

    if (this.elements.residentMood) {
      this.elements.residentMood.textContent = person.identity.moodMeter;
    }

    this.updateResidentWantedReadout(person);
    this.elements.modeLabel.textContent = `Following ${person.identity.name}.`;
  }

  updateResidentWantedReadout(person = this.selectedResident) {
    if (!person) {
      return;
    }

    const { identity } = person;
    const isWanted = Boolean(identity.wanted);
    const policeCalled = Boolean(identity.policeCalled);

    if (this.elements.residentWantedStatusRow) {
      this.elements.residentWantedStatusRow.hidden = !isWanted;
    }

    if (this.elements.residentWantedStatus) {
      this.elements.residentWantedStatus.textContent = policeCalled ? 'Wanted - police en route' : 'Wanted';
      this.elements.residentWantedStatus.classList.toggle('is-wanted', isWanted);
    }

    if (this.elements.residentWantedReasonRow) {
      this.elements.residentWantedReasonRow.hidden = !isWanted;
    }

    if (this.elements.residentWantedReason) {
      this.elements.residentWantedReason.textContent = identity.wantedReason || '-';
    }

    if (this.elements.callPolice) {
      const buttonLabel = this.elements.callPolice.querySelector('span');
      this.elements.callPolice.hidden = !isWanted || identity.detained;
      this.elements.callPolice.disabled = policeCalled;

      if (buttonLabel) {
        buttonLabel.textContent = policeCalled ? 'Police En Route' : 'Call Police';
      }
    }
  }

  callPoliceOnSelectedResident() {
    const person = this.selectedResident;

    if (!person?.identity?.wanted || person.identity.policeCalled) {
      return;
    }

    person.identity.policeCalled = true;
    this.updateResidentWantedReadout(person);

    const dispatched = this.traffic.dispatchPoliceToPerson(person, {
      onStatusChange: (message) => {
        this.elements.modeLabel.textContent = `${message} Target: ${person.identity.name}.`;
      },
      onUnavailable: (message) => {
        person.identity.policeCalled = false;
        this.updateResidentWantedReadout(person);
        this.elements.modeLabel.textContent = message;
      },
      onDetained: (target) => {
        const name = target.identity.name;
        this.pedestrians.detainPerson(target);

        if (this.selectedResident === target) {
          this.selectResident(null);
        }

        this.elements.modeLabel.textContent = `${name} was detained by police.`;
      },
    });

    if (!dispatched) {
      person.identity.policeCalled = false;
      this.updateResidentWantedReadout(person);
    }
  }

  callFireTruckOnSelectedFire() {
    const building = this.selectedFire;
    const incident = building?.userData.fireIncident;

    if (!building || !incident || incident.truckDispatched) {
      return;
    }

    incident.truckDispatched = true;
    this.updateFireReadout(building);

    const dispatched = this.traffic.dispatchFireTruckToBuilding(building, {
      onStatusChange: (message) => {
        if (building.userData.fireIncident && this.selectedFire === building) {
          this.updateFireReadout(building, message);
        }

        this.elements.modeLabel.textContent = `${message} Target: ${building.userData.assetName}.`;
      },
      onUnavailable: (message) => {
        if (building.userData.fireIncident) {
          incident.truckDispatched = false;
        }

        this.updateFireReadout(building, message);
        this.elements.modeLabel.textContent = message;
      },
      onExtinguished: (target) => {
        const name = target.userData.assetName;
        this.extinguishBuildingFire(target);
        this.elements.modeLabel.textContent = `${name} fire was put out.`;
      },
    });

    if (!dispatched) {
      incident.truckDispatched = false;
      this.updateFireReadout(building);
    }
  }

  hasSelectedFire() {
    return Boolean(this.selectedFire?.userData.fireIncident);
  }

  selectFire(building) {
    if (this.selectedFire) {
      setSelectedTint(this.selectedFire, false);
    }

    this.selectedFire = building?.userData.fireIncident ? building : null;

    if (!this.selectedFire) {
      if (this.elements.fireWindow) {
        this.elements.fireWindow.hidden = true;
      }

      return;
    }

    setSelectedTint(this.selectedFire, true);
    this.selectResident(null);

    if (this.elements.fireWindow) {
      this.elements.fireWindow.hidden = false;
    }

    this.updateFireReadout(this.selectedFire);
    this.elements.modeLabel.textContent = `${this.selectedFire.userData.assetName} is on fire.`;
  }

  updateFireReadout(building = this.selectedFire, statusText = null) {
    const incident = building?.userData.fireIncident;

    if (!incident) {
      return;
    }

    if (this.elements.fireBuildingName) {
      this.elements.fireBuildingName.textContent = building.userData.assetName;
    }

    if (this.elements.fireStatus) {
      this.elements.fireStatus.textContent = statusText ?? (incident.truckDispatched ? 'Fire truck en route' : 'Smoke reported');
    }

    if (this.elements.fireLocation) {
      this.elements.fireLocation.textContent = `${formatNumber(building.position.x)}, ${formatNumber(building.position.z)}`;
    }

    if (this.elements.dispatchFireTruck) {
      const buttonLabel = this.elements.dispatchFireTruck.querySelector('span');
      this.elements.dispatchFireTruck.disabled = incident.truckDispatched;

      if (buttonLabel) {
        buttonLabel.textContent = incident.truckDispatched ? 'Truck Dispatched' : 'Dispatch Fire Truck';
      }
    }
  }

  hasSelectedResident() {
    return Boolean(this.selectedResident);
  }

  updateSelectedResident() {
    if (!this.selectedResident || this.pedestrians.hasPerson(this.selectedResident)) {
      return;
    }

    this.selectResident(null);
    this.elements.modeLabel.textContent = 'That inhabitant left the visible streets.';
  }

  updateFireIncidents(delta, now) {
    [...this.fireIncidents].forEach((incident) => {
      if (!incident.building.parent) {
        this.extinguishBuildingFire(incident.building);
      }
    });

    this.fireIncidents.forEach((incident) => animateBuildingFire(incident, delta, now));

    if (!this.fireSimulationEnabled || this.fireIncidents.length >= MAX_ACTIVE_FIRES) {
      return;
    }

    this.nextFireCheck -= delta;

    if (this.nextFireCheck > 0) {
      return;
    }

    this.nextFireCheck = randomFloat(FIRE_CHECK_MIN_SECONDS, FIRE_CHECK_MAX_SECONDS);

    if (Math.random() <= FIRE_START_CHANCE) {
      this.startRandomBuildingFire();
    }
  }

  startRandomBuildingFire() {
    const candidates = this.placed.filter((object) => (
      object.userData.assetKind === 'building' &&
      !object.userData.fireIncident
    ));

    if (candidates.length === 0) {
      return;
    }

    const building = randomItem(candidates);
    this.startBuildingFire(building);
    this.elements.modeLabel.textContent = `Smoke is rising from ${building.userData.assetName}.`;
  }

  startBuildingFire(building) {
    if (!building || building.userData.fireIncident) {
      return null;
    }

    const incident = createBuildingFireIncident(building, this.fireAsset);
    building.userData.fireIncident = incident;
    this.fireIncidents.push(incident);
    return incident;
  }

  extinguishBuildingFire(building) {
    const incident = building?.userData.fireIncident;

    if (!incident) {
      return;
    }

    if (this.selectedFire === building) {
      this.selectFire(null);
    }

    building.remove(incident.group);
    disposeObject3D(incident.group);
    delete building.userData.fireIncident;
    this.fireIncidents = this.fireIncidents.filter((item) => item !== incident);
  }

  clearAllFireIncidents() {
    [...this.fireIncidents].forEach((incident) => {
      this.extinguishBuildingFire(incident.building);
    });
    this.fireIncidents = [];
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

  getResidentUnderPointer() {
    this.raycaster.setFromCamera(this.pointer, this.sceneManager.camera);
    const hits = this.raycaster.intersectObjects(this.pedestrians.getPickableObjects(), true);
    const hit = hits.find((item) => item.object.parent);

    if (hit) {
      return this.pedestrians.getPersonFromObject(hit.object);
    }

    return getNearestScreenResident(
      this.pointer,
      this.sceneManager.camera,
      this.sceneManager.renderer.domElement,
      this.pedestrians.people,
    );
  }

  getBurningBuildingUnderPointer() {
    if (this.fireIncidents.length === 0) {
      return null;
    }

    this.raycaster.setFromCamera(this.pointer, this.sceneManager.camera);
    const buildings = this.fireIncidents.map((incident) => incident.building);
    const hits = this.raycaster.intersectObjects(buildings, true);
    const hit = hits.find((item) => item.object.parent);
    const building = hit ? findEditorRoot(hit.object) : null;

    return building?.userData.fireIncident ? building : null;
  }

  updateCanvasCursor(placed) {
    if (this.rotationDrag || placed && placed === this.selected) {
      this.canvas.dataset.cursor = 'rotate';
      return;
    }

    delete this.canvas.dataset.cursor;
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

function getNearestScreenResident(pointer, camera, canvas, people) {
  const rect = canvas.getBoundingClientRect();
  const pointerX = (pointer.x + 1) * rect.width * 0.5;
  const pointerY = (-pointer.y + 1) * rect.height * 0.5;
  let nearest = null;
  let nearestDistance = Infinity;

  people.forEach((person) => {
    const screenPoint = person.object.position.clone();
    screenPoint.y += getResidentPickHeight(person.object);
    screenPoint.project(camera);

    if (screenPoint.z < -1 || screenPoint.z > 1) {
      return;
    }

    const x = (screenPoint.x + 1) * rect.width * 0.5;
    const y = (-screenPoint.y + 1) * rect.height * 0.5;
    const distance = Math.hypot(x - pointerX, y - pointerY);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = person;
    }
  });

  return nearestDistance <= 56 ? nearest : null;
}

function getResidentPickHeight(object) {
  const box = new THREE.Box3().setFromObject(object);
  const height = box.max.y - box.min.y;
  return THREE.MathUtils.clamp(height * 0.55, 0.25, 0.9);
}

function createBuildingFireIncident(building, fireAsset) {
  building.updateMatrixWorld(true);
  const roof = getBuildingRoofInfo(building);
  const group = new THREE.Group();
  const fireModels = [];
  const smokePuffs = [];
  const fireCount = randomInt(2, 4);

  group.name = 'Building Fire Incident';
  building.add(group);

  for (let index = 0; index < fireCount; index += 1) {
    const fire = fireAsset
      ? makePlaceableClone(fireAsset.source, {
        ...fireAsset,
        scale: (fireAsset.scale ?? 1) * randomFloat(0.72, 1.18),
      })
      : createFallbackFireModel();

    fire.position.set(
      randomFloat(-roof.halfX, roof.halfX),
      roof.y,
      randomFloat(-roof.halfZ, roof.halfZ),
    );
    fire.rotation.y = randomFloat(0, Math.PI * 2);
    fire.userData.baseScale = fire.scale.clone();
    fire.userData.flickerPhase = randomFloat(0, Math.PI * 2);
    fireModels.push(fire);
    group.add(fire);
  }

  const smokeGeometry = new THREE.SphereGeometry(0.22, 8, 8);

  for (let index = 0; index < SMOKE_PUFF_COUNT; index += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: '#6f7270',
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const puff = new THREE.Mesh(smokeGeometry.clone(), material);
    const base = new THREE.Vector3(
      randomFloat(-roof.halfX * 0.8, roof.halfX * 0.8),
      roof.y + randomFloat(0.05, 0.45),
      randomFloat(-roof.halfZ * 0.8, roof.halfZ * 0.8),
    );

    puff.userData.base = base;
    puff.userData.life = Math.random();
    puff.userData.duration = randomFloat(3.4, 5.8);
    puff.userData.rise = randomFloat(1.35, 2.45);
    puff.userData.drift = new THREE.Vector3(randomFloat(-0.35, 0.35), 0, randomFloat(-0.35, 0.35));
    puff.userData.baseSize = randomFloat(0.65, 1.2);
    puff.position.copy(base);
    smokePuffs.push(puff);
    group.add(puff);
  }

  return {
    building,
    group,
    fireModels,
    smokePuffs,
    truckDispatched: false,
  };
}

function getBuildingRoofInfo(building) {
  const box = new THREE.Box3().setFromObject(building);
  const size = box.getSize(new THREE.Vector3());

  return {
    y: box.max.y - building.position.y + 0.08,
    halfX: THREE.MathUtils.clamp(size.x * 0.24, 0.28, 1.25),
    halfZ: THREE.MathUtils.clamp(size.z * 0.24, 0.28, 1.25),
  };
}

function createFallbackFireModel() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: '#ff7a2f',
    emissive: '#ff5a24',
    emissiveIntensity: 1.5,
    roughness: 0.55,
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.58, 8), material);
  const light = new THREE.PointLight('#ff7a2f', 1.1, 3);

  flame.position.y = 0.29;
  light.position.y = 0.45;
  group.add(flame, light);
  return group;
}

function animateBuildingFire(incident, delta, now) {
  const time = now / 1000;

  incident.fireModels.forEach((fire) => {
    const flicker = 1 + Math.sin(time * 9 + fire.userData.flickerPhase) * 0.055;
    fire.scale.copy(fire.userData.baseScale).multiplyScalar(flicker);
  });

  incident.smokePuffs.forEach((puff) => {
    const data = puff.userData;
    data.life += delta / data.duration;

    if (data.life > 1) {
      data.life -= 1;
      data.base.x += randomFloat(-0.04, 0.04);
      data.base.z += randomFloat(-0.04, 0.04);
      data.drift.set(randomFloat(-0.35, 0.35), 0, randomFloat(-0.35, 0.35));
    }

    const t = data.life;
    puff.position.copy(data.base)
      .add(data.drift.clone().multiplyScalar(t))
      .add(new THREE.Vector3(0, data.rise * t, 0));
    puff.scale.setScalar(data.baseSize * THREE.MathUtils.lerp(0.65, 1.75, t));
    puff.material.opacity = Math.sin(t * Math.PI) * 0.24;
  });
}

function disposeObject3D(object) {
  object.traverse((child) => {
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose?.());
    } else if (child.material) {
      child.material.dispose?.();
    }
  });
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

function createRoadNetwork(townSize) {
  const preset = getTownPreset(townSize);
  const span = preset.span;
  const lineCandidates = preset.lineCandidates.filter((value) => Math.abs(value) < span);
  const verticals = [0, ...sample(lineCandidates.filter((value) => value !== 0), randomInt(preset.lineCount[0], preset.lineCount[1]))].sort((a, b) => a - b);
  const horizontals = [0, ...sample(lineCandidates.filter((value) => value !== 0), randomInt(preset.lineCount[0], preset.lineCount[1]))].sort((a, b) => a - b);
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
  const spurCount = randomInt(preset.spurCount[0], preset.spurCount[1]);

  for (let index = 0; index < spurCount; index += 1) {
    const start = randomItem(intersections);
    const direction = randomItem(DIRECTIONS);
    const length = randomInt(preset.spurLength[0], preset.spurLength[1]);

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

function getTownPreset(townSize) {
  const presets = [
    {
      span: 5,
      lineCandidates: [-4, -2, 0, 2, 4],
      lineCount: [1, 2],
      spurCount: [2, 4],
      spurLength: [1, 3],
    },
    {
      span: 8,
      lineCandidates: [-6, -4, -2, 0, 2, 4, 6],
      lineCount: [2, 3],
      spurCount: [5, 8],
      spurLength: [2, 5],
    },
    {
      span: 11,
      lineCandidates: [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10],
      lineCount: [3, 5],
      spurCount: [9, 14],
      spurLength: [3, 7],
    },
  ];

  return presets[townSize] ?? presets[1];
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

function createFoliageLots(town, usedCells) {
  const lots = [];

  for (let z = -town.span; z <= town.span; z += 1) {
    for (let x = -town.span; x <= town.span; x += 1) {
      const cell = { x, z };

      if (usedCells.has(cellKey(cell))) {
        continue;
      }

      lots.push(cell);
    }
  }

  return lots;
}

function createStreetlightPlacements(town, roadSet) {
  const placements = [];

  town.cells.forEach((cell) => {
    const connections = getRoadConnections(cell, roadSet);
    const sideDirections = getStreetlightSideDirections(connections);

    sideDirections.forEach((direction) => {
      const sideCell = { x: cell.x + direction.dx, z: cell.z + direction.dz };

      if (
        roadSet.has(cellKey(sideCell)) ||
        Math.abs(sideCell.x) > town.span ||
        Math.abs(sideCell.z) > town.span
      ) {
        return;
      }

      placements.push({
        ...createStreetlightPlacementForSide(
          cell.x * TOWN_CELL_SIZE,
          cell.z * TOWN_CELL_SIZE,
          direction,
        ),
        roadKey: cellKey(cell),
        sideCell,
      });
    });
  });

  return placements;
}

function getStreetlightSideDirections(connections) {
  const has = (id) => connections.includes(id);
  const northSouth = has('n') || has('s');
  const eastWest = has('e') || has('w');

  if (northSouth && !eastWest) {
    return DIRECTIONS.filter((direction) => direction.id === 'e' || direction.id === 'w');
  }

  if (eastWest && !northSouth) {
    return DIRECTIONS.filter((direction) => direction.id === 'n' || direction.id === 's');
  }

  return DIRECTIONS;
}

function createStreetlightPlacementForSide(roadX, roadZ, sideDirection) {
  const sideNormal = new THREE.Vector3(sideDirection.dx, 0, sideDirection.dz);
  const position = new THREE.Vector3(
    roadX + sideNormal.x * STREETLIGHT_ROAD_EDGE_OFFSET,
    0,
    roadZ + sideNormal.z * STREETLIGHT_ROAD_EDGE_OFFSET,
  );

  return {
    position,
    rotation: rotationFacingDirection(-sideNormal.x, -sideNormal.z),
  };
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

function rotationFacingDirection(dx, dz) {
  return Math.atan2(dx, dz);
}

function randomFoliageRotation() {
  return randomInt(0, 7) * (Math.PI / 4);
}

function pickBuildingAsset(buildings) {
  const sorted = [...buildings].sort((a, b) => searchableName(a).localeCompare(searchableName(b)));
  const roll = Math.random();
  const highrises = sorted.filter((asset) => {
    const name = searchableName(asset);
    return asset.generationRole === 'highrise' || name.includes('skyscraper');
  });
  const storefronts = sorted.filter((asset) => {
    const name = searchableName(asset);
    return asset.generationRole === 'storefront' || name.includes('store') || name.includes('pizza');
  });

  if (highrises.length > 0 && roll > 0.9) {
    return weightedRandomItem(highrises);
  }

  if (storefronts.length > 0 && roll < 0.24) {
    return weightedRandomItem(storefronts);
  }

  return weightedRandomItem(sorted.filter((asset) => !highrises.includes(asset))) ?? weightedRandomItem(sorted);
}

function weightedRandomItem(items) {
  if (items.length === 0) {
    return null;
  }

  const totalWeight = items.reduce((total, item) => total + Math.max(item.generationWeight ?? 1, 0), 0);

  if (totalWeight <= 0) {
    return randomItem(items);
  }

  let roll = Math.random() * totalWeight;

  for (const item of items) {
    roll -= Math.max(item.generationWeight ?? 1, 0);

    if (roll <= 0) {
      return item;
    }
  }

  return items.at(-1);
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

function randomFloat(min, max) {
  return min + Math.random() * (max - min);
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
