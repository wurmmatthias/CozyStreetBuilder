import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#dbe9f2');
    this.lastFrameTime = performance.now();
    this.gridVisible = true;
    this.pressedKeys = new Set();
    this.updaters = new Set();

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
      color: '#62a84d',
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
    const grid = new THREE.GridHelper(160, 80, '#4a5f54', '#8aa092');
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
    this.grid = new THREE.GridHelper(160, divisions, '#4a5f54', '#8aa092');
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
    const hemi = new THREE.HemisphereLight('#f7f6ec', '#6f806f', 2.2);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight('#fff4d8', 3.4);
    sun.position.set(14, 24, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -35;
    sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -35;
    this.scene.add(sun);
  }

  add(object) {
    this.scene.add(object);
  }

  remove(object) {
    this.scene.remove(object);
  }

  addUpdater(updater) {
    this.updaters.add(updater);
  }

  removeUpdater(updater) {
    this.updaters.delete(updater);
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
