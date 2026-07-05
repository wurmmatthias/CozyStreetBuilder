import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

const CLOUD_ASSET_URL = `${import.meta.env.BASE_URL}assets/misc/Clouds.glb`;
const CLOUD_COUNT = 16;
const CLOUD_FIELD_HALF_WIDTH = 76;
const CLOUD_MIN_HEIGHT = 14;
const CLOUD_MAX_HEIGHT = 28;
const CLOUD_WRAP_PADDING = 24;
const DAY_LENGTH_SECONDS = 240;
const CLOCK_STEP_MINUTES = 15;

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#8fd0ee');
    this.scene.fog = new THREE.Fog('#8fd0ee', 76, 178);
    this.lastFrameTime = performance.now();
    this.gridVisible = true;
    this.pressedKeys = new Set();
    this.updaters = new Set();
    this.clouds = [];
    this.followCameraFeeds = new Set();
    this.windowGlowMaterials = new Set();
    this.dayNightSubscribers = new Set();
    this.fictionalMinutes = 8 * 60;
    this.isTimePaused = false;
    this.lastClockStep = -1;
    this.dayNightState = null;
    this.skyDayColor = new THREE.Color('#8fd0ee');
    this.skyNightColor = new THREE.Color('#15213c');
    this.fogDayColor = new THREE.Color('#8fd0ee');
    this.fogNightColor = new THREE.Color('#192847');
    this.groundDayColor = new THREE.Color('#74b85b');
    this.groundNightColor = new THREE.Color('#2f5645');
    this.windowGlowColor = new THREE.Color('#ffd978');

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    this.camera.position.set(18, 18, 18);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.container.append(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 70;

    this.ground = this.createGround();
    this.grid = this.createGrid();
    this.scene.add(this.ground, this.grid);
    this.addLighting();
    this.addClouds();
    this.updateDayNightCycle(0);
    this.addUpdater((delta) => this.updateDayNightCycle(delta));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    window.addEventListener('keyup', (event) => this.onKeyUp(event));
    this.resize();
  }

  createGround() {
    const geometry = new THREE.PlaneGeometry(160, 160);
    const material = new THREE.MeshStandardMaterial({
      color: '#74b85b',
      roughness: 0.92,
      metalness: 0,
    });
    const ground = new THREE.Mesh(geometry, material);
    ground.name = 'Placement Ground';
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    return ground;
  }

  createGrid() {
    const grid = new THREE.GridHelper(160, 80, '#4f754f', '#8fb684');
    grid.name = 'Snap Grid';
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    return grid;
  }

  setGridSize(size) {
    const divisions = Math.round(160 / size);
    this.scene.remove(this.grid);
    this.grid.geometry.dispose();
    this.grid.material.dispose();
    this.grid = new THREE.GridHelper(160, divisions, '#4f754f', '#8fb684');
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.5;
    this.grid.visible = this.gridVisible;
    this.scene.add(this.grid);
  }

  setBuildMode(enabled) {
    this.gridVisible = enabled;
    this.grid.visible = enabled;
  }

  addLighting() {
    this.hemiLight = new THREE.HemisphereLight('#f8f4df', '#6f8f68', 2.25);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight('#fff2d5', 3.35);
    this.sunLight.position.set(14, 24, 10);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -35;
    this.sunLight.shadow.camera.right = 35;
    this.sunLight.shadow.camera.top = 35;
    this.sunLight.shadow.camera.bottom = -35;
    this.scene.add(this.sunLight);
  }

  updateDayNightCycle(delta) {
    if (!this.isTimePaused) {
      const minutesPerSecond = (24 * 60) / DAY_LENGTH_SECONDS;
      this.fictionalMinutes = (this.fictionalMinutes + delta * minutesPerSecond) % (24 * 60);
    }

    const dayProgress = this.fictionalMinutes / (24 * 60);
    const sunHeight = Math.sin((dayProgress - 0.25) * Math.PI * 2);
    const daylight = smoothstep(-0.08, 0.3, sunHeight);
    const nightFactor = 1 - smoothstep(-0.22, 0.14, sunHeight);
    const sunAngle = dayProgress * Math.PI * 2;
    const clockStep = Math.floor(this.fictionalMinutes / CLOCK_STEP_MINUTES);

    this.scene.background.copy(this.skyDayColor).lerp(this.skyNightColor, nightFactor);
    this.scene.fog.color.copy(this.fogDayColor).lerp(this.fogNightColor, nightFactor);
    this.ground.material.color.copy(this.groundDayColor).lerp(this.groundNightColor, nightFactor);
    this.grid.material.opacity = THREE.MathUtils.lerp(0.24, 0.5, daylight);

    this.hemiLight.intensity = THREE.MathUtils.lerp(0.28, 2.25, daylight);
    this.sunLight.intensity = THREE.MathUtils.lerp(0.04, 3.35, daylight);
    this.sunLight.position.set(
      Math.cos(sunAngle) * 22,
      THREE.MathUtils.lerp(2, 26, Math.max(sunHeight, 0)),
      Math.sin(sunAngle) * 22,
    );

    this.updateWindowGlow(nightFactor);

    if (clockStep !== this.lastClockStep || !this.dayNightState || this.dayNightState.isPaused !== this.isTimePaused) {
      this.lastClockStep = clockStep;
      this.dayNightState = this.createDayNightState(daylight, nightFactor);
      this.dayNightSubscribers.forEach((subscriber) => subscriber(this.dayNightState));
    }
  }

  createDayNightState(daylight, nightFactor) {
    const displayMinutes = Math.floor(this.fictionalMinutes / CLOCK_STEP_MINUTES) * CLOCK_STEP_MINUTES;
    const hours = Math.floor(displayMinutes / 60) % 24;
    const minutes = displayMinutes % 60;
    const isNight = nightFactor > 0.62;
    const period = isNight ? 'Moonrise' : daylight < 0.72 ? 'Golden Hour' : 'Sunlit';

    return {
      clockLabel: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
      daylight,
      nightFactor,
      period,
      isNight,
      isPaused: this.isTimePaused,
    };
  }

  setFictionalTime(minutes) {
    this.fictionalMinutes = ((minutes % (24 * 60)) + (24 * 60)) % (24 * 60);
    this.lastClockStep = -1;
    this.updateDayNightCycle(0);
  }

  setDayTime() {
    this.setFictionalTime(10 * 60);
  }

  setNightTime() {
    this.setFictionalTime(22 * 60);
  }

  setTimePaused(paused) {
    this.isTimePaused = paused;
    this.updateDayNightCycle(0);
  }

  toggleTimePaused() {
    this.setTimePaused(!this.isTimePaused);
  }

  onDayNightChange(callback) {
    this.dayNightSubscribers.add(callback);

    if (this.dayNightState) {
      callback(this.dayNightState);
    }

    return () => this.dayNightSubscribers.delete(callback);
  }

  updateWindowGlow(nightFactor) {
    const glowStrength = nightFactor * nightFactor;

    this.windowGlowMaterials.forEach((material) => {
      if (!material.emissive) {
        return;
      }

      const baseEmissive = material.userData.dayNightBaseEmissive ?? new THREE.Color('#000000');
      const baseIntensity = material.userData.dayNightBaseEmissiveIntensity ?? 0;

      material.emissive.copy(baseEmissive).lerp(this.windowGlowColor, glowStrength);
      material.emissiveIntensity = baseIntensity + glowStrength * 0.95;
    });
  }

  registerBuildingWindows(object) {
    if (object.userData.assetKind !== 'building' || !object.userData.editorObject || object.userData.windowGlowMaterials) {
      return;
    }

    const materials = [];

    object.traverse((child) => {
      if (!child.isMesh || !child.material) {
        return;
      }

      const childMaterials = Array.isArray(child.material) ? child.material : [child.material];

      childMaterials.forEach((material) => {
        if (!material?.emissive || !isWindowMaterial(child, material) || materials.includes(material)) {
          return;
        }

        material.userData.dayNightBaseEmissive = material.emissive.clone();
        material.userData.dayNightBaseEmissiveIntensity = material.emissiveIntensity ?? 0;
        materials.push(material);
        this.windowGlowMaterials.add(material);
      });
    });

    object.userData.windowGlowMaterials = materials;
    this.updateWindowGlow(this.dayNightState?.nightFactor ?? 0);
  }

  unregisterBuildingWindows(object) {
    object.userData.windowGlowMaterials?.forEach((material) => {
      this.windowGlowMaterials.delete(material);
    });

    delete object.userData.windowGlowMaterials;
  }

  async addClouds() {
    const loader = new GLTFLoader();

    try {
      const gltf = await loader.loadAsync(CLOUD_ASSET_URL);
      const sources = getCloudSources(gltf.scene);

      if (sources.length === 0) {
        return;
      }

      for (let index = 0; index < CLOUD_COUNT; index += 1) {
        this.createCloud(sources);
      }

      this.addUpdater((delta, now) => this.updateClouds(delta, now));
    } catch (error) {
      console.warn('Could not load atmosphere clouds.', error);
    }
  }

  createCloud(sources) {
    const cloud = new THREE.Group();
    const model = cloneSkeleton(randomItem(sources));
    const targetWidth = randomFloat(7, 26);

    model.traverse((child) => {
      child.castShadow = false;
      child.receiveShadow = false;

      if (child.material) {
        child.material = child.material.clone();
      }
    });

    normalizeCloudModel(model, targetWidth);
    cloud.add(model);
    cloud.position.set(
      randomFloat(-CLOUD_FIELD_HALF_WIDTH, CLOUD_FIELD_HALF_WIDTH),
      randomFloat(CLOUD_MIN_HEIGHT, CLOUD_MAX_HEIGHT),
      randomFloat(-CLOUD_FIELD_HALF_WIDTH * 0.85, CLOUD_FIELD_HALF_WIDTH * 0.85),
    );
    cloud.rotation.y = randomFloat(0, Math.PI * 2);
    cloud.userData.baseY = cloud.position.y;
    cloud.userData.targetWidth = targetWidth;
    cloud.userData.driftSpeed = randomFloat(0.45, 1.35);
    cloud.userData.driftDirection = randomItem([-1, 1]);
    cloud.userData.bobAmount = randomFloat(0.08, 0.34);
    cloud.userData.bobSpeed = randomFloat(0.35, 0.8);
    cloud.userData.phase = randomFloat(0, Math.PI * 2);
    cloud.userData.turnSpeed = randomFloat(-0.018, 0.018);

    this.clouds.push(cloud);
    this.scene.add(cloud);
  }

  updateClouds(delta, now) {
    const time = now / 1000;
    const wrapLimit = CLOUD_FIELD_HALF_WIDTH + CLOUD_WRAP_PADDING;

    this.clouds.forEach((cloud) => {
      const data = cloud.userData;
      cloud.position.x += data.driftSpeed * data.driftDirection * delta;
      cloud.position.y = data.baseY + Math.sin(time * data.bobSpeed + data.phase) * data.bobAmount;
      cloud.rotation.y += data.turnSpeed * delta;

      if (cloud.position.x > wrapLimit) {
        cloud.position.x = -wrapLimit;
        cloud.position.z = randomFloat(-CLOUD_FIELD_HALF_WIDTH * 0.85, CLOUD_FIELD_HALF_WIDTH * 0.85);
      } else if (cloud.position.x < -wrapLimit) {
        cloud.position.x = wrapLimit;
        cloud.position.z = randomFloat(-CLOUD_FIELD_HALF_WIDTH * 0.85, CLOUD_FIELD_HALF_WIDTH * 0.85);
      }
    });
  }

  add(object) {
    this.scene.add(object);
    this.registerBuildingWindows(object);
  }

  remove(object) {
    this.unregisterBuildingWindows(object);
    this.scene.remove(object);
  }

  addUpdater(updater) {
    this.updaters.add(updater);
  }

  removeUpdater(updater) {
    this.updaters.delete(updater);
  }

  createFollowCameraFeed(container) {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor('#bfe8ff', 1);
    renderer.shadowMap.enabled = false;
    container.append(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 80);
    const feed = {
      container,
      renderer,
      camera,
      target: null,
      smoothPosition: new THREE.Vector3(),
      smoothLookAt: new THREE.Vector3(),
      initialized: false,
      resizeObserver: new ResizeObserver(() => this.resizeFollowCameraFeed(feed)),
      setTarget: (target) => {
        feed.target = target;
        feed.initialized = false;
      },
      dispose: () => {
        feed.resizeObserver.disconnect();
        this.followCameraFeeds.delete(feed);
        renderer.dispose();
        renderer.domElement.remove();
      },
    };

    feed.resizeObserver.observe(container);
    this.followCameraFeeds.add(feed);
    this.resizeFollowCameraFeed(feed);
    return feed;
  }

  resizeFollowCameraFeed(feed) {
    const { clientWidth, clientHeight } = feed.container;
    const width = Math.max(clientWidth, 1);
    const height = Math.max(clientHeight, 1);
    feed.camera.aspect = width / height;
    feed.camera.updateProjectionMatrix();
    feed.renderer.setSize(width, height, false);
  }

  renderFollowCameraFeeds(delta) {
    this.followCameraFeeds.forEach((feed) => {
      if (!feed.target || feed.container.offsetParent === null) {
        return;
      }

      this.resizeFollowCameraFeed(feed);
      updateFollowCamera(feed, delta);
      feed.renderer.render(this.scene, feed.camera);
    });
  }

  resize() {
    const { clientWidth, clientHeight } = this.container;
    this.camera.aspect = clientWidth / Math.max(clientHeight, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
  }

  onKeyDown(event) {
    const key = getCameraKey(event);

    if (!key || isTypingTarget(event.target)) {
      return;
    }

    this.pressedKeys.add(key);
    this.updateKeyboardCamera(1 / 30);
    event.preventDefault();
  }

  onKeyUp(event) {
    const key = getCameraKey(event);

    if (key) {
      this.pressedKeys.delete(key);
    }
  }

  updateKeyboardCamera(delta) {
    if (this.pressedKeys.size === 0) {
      return;
    }

    const move = new THREE.Vector3();
    const forward = new THREE.Vector3()
      .subVectors(this.controls.target, this.camera.position)
      .setY(0)
      .normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    if (this.pressedKeys.has('w')) move.add(forward);
    if (this.pressedKeys.has('s')) move.sub(forward);
    if (this.pressedKeys.has('d')) move.add(right);
    if (this.pressedKeys.has('a')) move.sub(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(14 * delta);
      this.camera.position.add(move);
      this.controls.target.add(move);
    }

    const yaw =
      (this.pressedKeys.has('arrowleft') ? 1 : 0) -
      (this.pressedKeys.has('arrowright') ? 1 : 0);
    const pitch =
      (this.pressedKeys.has('arrowup') ? -1 : 0) +
      (this.pressedKeys.has('arrowdown') ? 1 : 0);

    if (yaw !== 0 || pitch !== 0) {
      const offset = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta += yaw * 1.8 * delta;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi + pitch * 1.3 * delta, 0.22, this.controls.maxPolarAngle);
      offset.setFromSpherical(spherical);
      this.camera.position.copy(this.controls.target).add(offset);
    }
  }

  start() {
    const render = () => {
      const now = performance.now();
      const delta = Math.min((now - this.lastFrameTime) / 1000, 0.05);
      this.lastFrameTime = now;
      this.updateKeyboardCamera(delta);
      this.updaters.forEach((updater) => updater(delta, now));
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.renderFollowCameraFeeds(delta);
      requestAnimationFrame(render);
    };

    render();
  }
}

function getCameraKey(event) {
  const key = event.key.toLowerCase();
  return ['w', 'a', 's', 'd', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)
    ? key
    : null;
}

function isTypingTarget(target) {
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable;
}

function getCloudSources(scene) {
  const directChildren = scene.children.filter((child) => hasRenderableMesh(child));

  if (directChildren.length === 1 && !directChildren[0].isMesh) {
    const nestedChildren = directChildren[0].children.filter((child) => hasRenderableMesh(child));

    if (nestedChildren.length > 1) {
      return nestedChildren;
    }
  }

  return directChildren.length > 0 ? directChildren : [scene].filter((child) => hasRenderableMesh(child));
}

function hasRenderableMesh(object) {
  let hasMesh = false;
  object.traverse((child) => {
    hasMesh = hasMesh || child.isMesh;
  });
  return hasMesh;
}

function normalizeCloudModel(model, targetWidth) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const longestSide = Math.max(size.x, size.y, size.z, 0.001);
  model.scale.multiplyScalar(targetWidth / longestSide);
  model.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(model);
  const center = scaledBox.getCenter(new THREE.Vector3());
  model.position.sub(center);
}

function updateFollowCamera(feed, delta) {
  const box = new THREE.Box3().setFromObject(feed.target);
  const size = box.getSize(new THREE.Vector3());
  const face = box.getCenter(new THREE.Vector3());
  face.y = box.min.y + size.y * 0.76;

  const forward = new THREE.Vector3(Math.sin(feed.target.rotation.y), 0, Math.cos(feed.target.rotation.y));
  const distance = THREE.MathUtils.clamp(size.y * 0.95 + 0.35, 0.85, 2.1);
  const cameraPosition = face
    .clone()
    .add(forward.multiplyScalar(distance))
    .add(new THREE.Vector3(0, size.y * 0.08, 0));
  const lookAt = face.clone().add(new THREE.Vector3(0, size.y * 0.02, 0));

  if (!feed.initialized) {
    feed.smoothPosition.copy(cameraPosition);
    feed.smoothLookAt.copy(lookAt);
    feed.initialized = true;
  } else {
    const followAmount = 1 - Math.pow(0.001, delta);
    feed.smoothPosition.lerp(cameraPosition, followAmount);
    feed.smoothLookAt.lerp(lookAt, followAmount);
  }

  feed.camera.position.copy(feed.smoothPosition);
  feed.camera.lookAt(feed.smoothLookAt);
}

function smoothstep(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function isWindowMaterial(mesh, material) {
  const materialName = material.name.toLowerCase();
  const meshName = mesh.name.toLowerCase();
  const searchable = `${meshName} ${materialName}`;

  if (!/(window|glass|pane)/.test(searchable)) {
    return false;
  }

  return !/(frame|border|trim|door|roof|wall)/.test(materialName)
    && !/(frame|border|trim)/.test(meshName);
}

function randomFloat(min, max) {
  return min + Math.random() * (max - min);
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}
