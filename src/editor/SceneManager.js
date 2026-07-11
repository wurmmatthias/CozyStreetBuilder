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
const AIRPLANE_ASSET_URL = `${import.meta.env.BASE_URL}assets/aerial/Airplane.glb`;
const AIRPLANE_ROUTE_RADIUS = 112;
const AIRPLANE_MIN_HEIGHT = 19;
const AIRPLANE_MAX_HEIGHT = 27;
const AIRPLANE_MIN_INTERVAL = 20;
const AIRPLANE_MAX_INTERVAL = 42;
const AIRPLANE_TRAIL_POINTS = 150;
const AIRPLANE_TRAIL_LINGER_SECONDS = 4.5;
const DAY_LENGTH_SECONDS = 240;
const CLOCK_STEP_MINUTES = 15;
const STREETLIGHT_TURN_ON_SPREAD_SECONDS = 5.2;
const STREETLIGHT_TURN_ON_SECONDS = 1.4;
const STREETLIGHT_UPDATE_INTERVAL = 1 / 12;
const SUN_LIGHT_DISTANCE = 42;
const SUN_SHADOW_HALF_SIZE = 32;
const SUN_SHADOW_MAP_SIZE = 4096;
const SUN_SHADOW_CAMERA_NEAR = 1;
const SUN_SHADOW_CAMERA_FAR = 96;
const WEATHER_RANDOM_STEP_MINUTES = 180;
const RAIN_DROP_COUNT = 720;
const SNOW_FLAKE_COUNT = 480;
const SNOW_GROUND_ACCUMULATION_SECONDS = 22;
const SNOW_GROUND_MELT_SECONDS = 14;
const WEATHER_FIELD_HALF_WIDTH = 58;
const WEATHER_MIN_HEIGHT = 3.5;
const WEATHER_MAX_HEIGHT = 32;
const WEATHER_LABELS = {
  sunny: 'Sunny',
  rain: 'Rain',
  snow: 'Snow',
};
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_FORWARD = new THREE.Vector3(0, 0, 1);

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
    this.airplanes = [];
    this.airplaneSource = null;
    this.airplaneSpawnTimer = randomFloat(4, 9);
    this.followCameraFeeds = new Set();
    this.windowGlowMaterials = new Set();
    this.streetlightFixtures = new Set();
    this.streetlightActivationClock = 0;
    this.streetlightUpdateAccumulator = 0;
    this.dayNightSubscribers = new Set();
    this.weatherSubscribers = new Set();
    this.simulationPaused = false;
    this.fictionalMinutes = 8 * 60;
    this.isTimePaused = false;
    this.lastClockStep = -1;
    this.weather = 'sunny';
    this.isWeatherAuto = false;
    this.lastWeatherSlot = -1;
    this.snowGroundAmount = 0;
    this.dayNightState = null;
    this.skyDayColor = new THREE.Color('#8fd0ee');
    this.skyNightColor = new THREE.Color('#15213c');
    this.fogDayColor = new THREE.Color('#8fd0ee');
    this.fogNightColor = new THREE.Color('#192847');
    this.groundDayColor = new THREE.Color('#74b85b');
    this.groundNightColor = new THREE.Color('#2f5645');
    this.skyRainColor = new THREE.Color('#7fa9bd');
    this.skySnowColor = new THREE.Color('#cfe8f0');
    this.fogRainColor = new THREE.Color('#94aeba');
    this.fogSnowColor = new THREE.Color('#dbeff2');
    this.groundRainColor = new THREE.Color('#4f8063');
    this.groundSnowColor = new THREE.Color('#dceee9');
    this.windowGlowColor = new THREE.Color('#ffd978');
    this.streetlightGlowColor = new THREE.Color('#ffd18a');
    this.sunDirection = new THREE.Vector3(14, 24, 10).normalize();
    this.sunShadowCenter = new THREE.Vector3();
    this.sunShadowRight = new THREE.Vector3();
    this.sunShadowUp = new THREE.Vector3();
    this.sunShadowView = new THREE.Vector3();
    this.weatherSkyColor = new THREE.Color();
    this.weatherFogColor = new THREE.Color();
    this.weatherGroundColor = new THREE.Color();

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
    this.addAirplaneSystem();
    this.addWeatherSystem();
    this.updateDayNightCycle(0);
    this.addUpdater((delta) => this.updateDayNightCycle(delta));
    this.addUpdater((delta, now) => this.updateWeather(delta, now));

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
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(SUN_SHADOW_MAP_SIZE, SUN_SHADOW_MAP_SIZE);
    this.sunLight.shadow.bias = -0.00012;
    this.sunLight.shadow.normalBias = 0.028;
    this.sunLight.shadow.radius = 2.25;

    const shadowCamera = this.sunLight.shadow.camera;
    shadowCamera.left = -SUN_SHADOW_HALF_SIZE;
    shadowCamera.right = SUN_SHADOW_HALF_SIZE;
    shadowCamera.top = SUN_SHADOW_HALF_SIZE;
    shadowCamera.bottom = -SUN_SHADOW_HALF_SIZE;
    shadowCamera.near = SUN_SHADOW_CAMERA_NEAR;
    shadowCamera.far = SUN_SHADOW_CAMERA_FAR;
    shadowCamera.updateProjectionMatrix();

    this.scene.add(this.sunLight, this.sunLight.target);
    this.updateSunLightShadowCenter();
  }

  updateDayNightCycle(delta) {
    if (!this.isTimePaused) {
      const minutesPerSecond = (24 * 60) / DAY_LENGTH_SECONDS;
      this.fictionalMinutes = (this.fictionalMinutes + delta * minutesPerSecond) % (24 * 60);
    }

    this.updateAutomaticWeather();

    const dayProgress = this.fictionalMinutes / (24 * 60);
    const sunHeight = Math.sin((dayProgress - 0.25) * Math.PI * 2);
    const daylight = smoothstep(-0.08, 0.3, sunHeight);
    const nightFactor = 1 - smoothstep(-0.22, 0.14, sunHeight);
    const sunAngle = dayProgress * Math.PI * 2;
    const clockStep = Math.floor(this.fictionalMinutes / CLOCK_STEP_MINUTES);
    const weatherDimming = this.weather === 'rain' ? 0.74 : this.weather === 'snow' ? 0.86 : 1;
    const snowGroundTarget = this.weather === 'snow' ? 1 : 0;
    const snowGroundDuration = snowGroundTarget > this.snowGroundAmount
      ? SNOW_GROUND_ACCUMULATION_SECONDS
      : SNOW_GROUND_MELT_SECONDS;

    if (delta > 0 || snowGroundTarget === 0) {
      this.snowGroundAmount = THREE.MathUtils.damp(
        this.snowGroundAmount,
        snowGroundTarget,
        4 / snowGroundDuration,
        delta,
      );
    }

    this.weatherSkyColor.copy(this.skyDayColor).lerp(this.skyNightColor, nightFactor);
    this.weatherFogColor.copy(this.fogDayColor).lerp(this.fogNightColor, nightFactor);
    this.weatherGroundColor.copy(this.groundDayColor).lerp(this.groundNightColor, nightFactor);

    if (this.weather === 'rain') {
      this.weatherSkyColor.lerp(this.skyRainColor, 0.44);
      this.weatherFogColor.lerp(this.fogRainColor, 0.5);
      this.weatherGroundColor.lerp(this.groundRainColor, 0.34);
    } else if (this.weather === 'snow') {
      this.weatherSkyColor.lerp(this.skySnowColor, 0.36);
      this.weatherFogColor.lerp(this.fogSnowColor, 0.52);
    }

    this.weatherGroundColor.lerp(this.groundSnowColor, this.snowGroundAmount * 0.82);

    this.scene.background.copy(this.weatherSkyColor);
    this.scene.fog.color.copy(this.weatherFogColor);
    this.ground.material.color.copy(this.weatherGroundColor);
    this.grid.material.opacity = THREE.MathUtils.lerp(0.24, 0.5, daylight);

    this.hemiLight.intensity = THREE.MathUtils.lerp(0.28, 2.25, daylight) * weatherDimming;
    this.sunLight.intensity = THREE.MathUtils.lerp(0.04, 3.35, daylight) * weatherDimming;
    this.sunDirection.set(
      Math.cos(sunAngle) * 22,
      THREE.MathUtils.lerp(2, 26, Math.max(sunHeight, 0)),
      Math.sin(sunAngle) * 22,
    ).normalize();
    this.updateSunLightShadowCenter();

    this.updateWindowGlow(nightFactor);
    this.updateStreetlightGlow(nightFactor, delta);

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

  setSimulationPaused(paused) {
    this.simulationPaused = Boolean(paused);
    this.pressedKeys.clear();
  }

  getEnvironmentState() {
    return {
      fictionalMinutes: this.fictionalMinutes,
      timePaused: this.isTimePaused,
      weather: this.weather,
      weatherAuto: this.isWeatherAuto,
    };
  }

  setEnvironmentState(state = {}) {
    if (Number.isFinite(state.fictionalMinutes)) {
      this.setFictionalTime(state.fictionalMinutes);
    }

    this.setTimePaused(state.timePaused === true);
    this.isWeatherAuto = state.weatherAuto === true;
    this.lastWeatherSlot = Math.floor(this.fictionalMinutes / WEATHER_RANDOM_STEP_MINUTES);
    this.applyWeather(state.weather);
  }

  onDayNightChange(callback) {
    this.dayNightSubscribers.add(callback);

    if (this.dayNightState) {
      callback(this.dayNightState);
    }

    return () => this.dayNightSubscribers.delete(callback);
  }

  addWeatherSystem() {
    this.weatherGroup = new THREE.Group();
    this.weatherGroup.name = 'Weather';
    this.rainSystem = createPrecipitationSystem({
      count: RAIN_DROP_COUNT,
      color: '#b7ddff',
      size: 0.08,
      opacity: 0.66,
      speedRange: [18, 28],
      slantRange: [2.1, 3.4],
    });
    this.snowSystem = createPrecipitationSystem({
      count: SNOW_FLAKE_COUNT,
      color: '#ffffff',
      size: 0.18,
      opacity: 0.84,
      speedRange: [1.4, 3.1],
      slantRange: [-0.25, 0.25],
      phaseRange: [0, Math.PI * 2],
    });

    this.rainSystem.points.name = 'Rain';
    this.snowSystem.points.name = 'Snow';
    this.rainSystem.points.visible = false;
    this.snowSystem.points.visible = false;
    this.weatherGroup.add(this.rainSystem.points, this.snowSystem.points);
    this.scene.add(this.weatherGroup);
  }

  updateWeather(delta, now) {
    if (!this.weatherGroup || this.weather === 'sunny') {
      return;
    }

    this.weatherGroup.position.x = this.controls.target.x;
    this.weatherGroup.position.z = this.controls.target.z;

    if (this.weather === 'rain') {
      updateRainSystem(this.rainSystem, delta);
    } else if (this.weather === 'snow') {
      updateSnowSystem(this.snowSystem, delta, now / 1000);
    }
  }

  setWeather(weather) {
    this.isWeatherAuto = false;
    this.applyWeather(weather);
  }

  setRandomWeather() {
    this.isWeatherAuto = true;
    this.lastWeatherSlot = Math.floor(this.fictionalMinutes / WEATHER_RANDOM_STEP_MINUTES);
    this.applyWeather(this.pickRandomWeather());
  }

  updateAutomaticWeather() {
    if (!this.isWeatherAuto) {
      return;
    }

    const weatherSlot = Math.floor(this.fictionalMinutes / WEATHER_RANDOM_STEP_MINUTES);

    if (weatherSlot === this.lastWeatherSlot) {
      return;
    }

    this.lastWeatherSlot = weatherSlot;
    this.applyWeather(this.pickRandomWeather(), false);
  }

  applyWeather(weather, updateEnvironment = true) {
    const nextWeather = normalizeWeather(weather);

    if (nextWeather === this.weather) {
      this.notifyWeatherChange();
      return;
    }

    this.weather = nextWeather;

    if (this.rainSystem && this.snowSystem) {
      this.rainSystem.points.visible = nextWeather === 'rain';
      this.snowSystem.points.visible = nextWeather === 'snow';
    }

    if (updateEnvironment) {
      this.updateDayNightCycle(0);
    }

    this.notifyWeatherChange();
  }

  pickRandomWeather() {
    const roll = Math.random();

    if (roll < 0.56) {
      return 'sunny';
    }

    if (roll < 0.8) {
      return 'rain';
    }

    return 'snow';
  }

  createWeatherState() {
    return {
      weather: this.weather,
      label: WEATHER_LABELS[this.weather],
      isAuto: this.isWeatherAuto,
    };
  }

  notifyWeatherChange() {
    const state = this.createWeatherState();
    this.weatherSubscribers.forEach((subscriber) => subscriber(state));
  }

  onWeatherChange(callback) {
    this.weatherSubscribers.add(callback);
    callback(this.createWeatherState());
    return () => this.weatherSubscribers.delete(callback);
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

  registerStreetlight(object) {
    if (object.userData.assetKind !== 'streetlight' || !object.userData.editorObject || object.userData.streetlightFixture) {
      return;
    }

    const fixture = createStreetlightFixture(object);

    object.add(fixture.group);
    object.userData.streetlightFixture = fixture;
    this.streetlightFixtures.add(fixture);
    this.updateStreetlightGlow(this.dayNightState?.nightFactor ?? 0, 0);
  }

  unregisterStreetlight(object) {
    const fixture = object.userData.streetlightFixture;

    if (!fixture) {
      return;
    }

    this.streetlightFixtures.delete(fixture);
    object.remove(fixture.group);
    disposeStreetlightFixture(fixture);
    delete object.userData.streetlightFixture;
  }

  updateStreetlightGlow(nightFactor, delta = 0) {
    const baseGlowStrength = nightFactor * nightFactor;
    const lightIsRising = baseGlowStrength > 0.04;

    this.streetlightUpdateAccumulator += delta;

    if (lightIsRising) {
      this.streetlightActivationClock += delta;
    } else {
      this.streetlightActivationClock = 0;
    }

    if (this.streetlightUpdateAccumulator < STREETLIGHT_UPDATE_INTERVAL && delta > 0) {
      return;
    }

    this.streetlightUpdateAccumulator = 0;

    this.streetlightFixtures.forEach((fixture) => {
      const delayedProgress = lightIsRising
        ? smoothstep(
          fixture.turnOnDelay,
          fixture.turnOnDelay + STREETLIGHT_TURN_ON_SECONDS,
          this.streetlightActivationClock,
        )
        : 0;
      const glowStrength = baseGlowStrength * delayedProgress;

      fixture.glowStrength = glowStrength;
      fixture.beamMaterial.opacity = glowStrength * 0.12;
      fixture.poolMaterial.opacity = glowStrength * 0.2;
      fixture.beam.visible = glowStrength > 0.01;
      fixture.pool.visible = glowStrength > 0.01;

      fixture.materials.forEach((material) => {
        const baseEmissive = material.userData.streetlightBaseEmissive ?? new THREE.Color('#000000');
        const baseIntensity = material.userData.streetlightBaseEmissiveIntensity ?? 0;

        material.emissive.copy(baseEmissive).lerp(this.streetlightGlowColor, glowStrength);
        material.emissiveIntensity = baseIntensity + glowStrength * 2.8;
      });
    });
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

  async addAirplaneSystem() {
    const loader = new GLTFLoader();

    try {
      const gltf = await loader.loadAsync(AIRPLANE_ASSET_URL);
      this.airplaneSource = gltf.scene;
      this.addUpdater((delta) => this.updateAirplanes(delta));
    } catch (error) {
      console.warn('Could not load ambient airplane.', error);
    }
  }

  spawnAirplane() {
    if (!this.airplaneSource || this.airplanes.length > 0) {
      return;
    }

    const root = new THREE.Group();
    const model = cloneSkeleton(this.airplaneSource);
    normalizeAirplaneModel(model, 4.35);
    // The source model's nose points along +X; the flight rig moves along +Z.
    model.rotation.y = -Math.PI / 2;
    model.traverse((child) => {
      child.castShadow = false;
      child.receiveShadow = false;
    });
    root.add(model);

    const route = createAirplaneRoute();
    const trails = [-1, 1].map((side) => createAirplaneTrail(side));
    trails.forEach((trail) => this.scene.add(trail.line));
    this.scene.add(root);

    const airplane = {
      root,
      route,
      trails,
      progress: 0,
      duration: randomFloat(25, 38),
      lingerTime: AIRPLANE_TRAIL_LINGER_SECONDS,
      departed: false,
    };
    this.airplanes.push(airplane);
    this.placeAirplane(airplane, 0);
  }

  updateAirplanes(delta) {
    if (this.airplanes.length === 0) {
      this.airplaneSpawnTimer -= delta;
      if (this.airplaneSpawnTimer <= 0) {
        this.spawnAirplane();
        this.airplaneSpawnTimer = randomFloat(AIRPLANE_MIN_INTERVAL, AIRPLANE_MAX_INTERVAL);
      }
      return;
    }

    this.airplanes = this.airplanes.filter((airplane) => {
      if (airplane.departed) {
        airplane.lingerTime -= delta;
        const fade = THREE.MathUtils.clamp(
          airplane.lingerTime / AIRPLANE_TRAIL_LINGER_SECONDS,
          0,
          1,
        );
        airplane.trails.forEach((trail) => {
          trail.line.material.opacity = 0.42 * fade;
        });

        if (airplane.lingerTime > 0) {
          return true;
        }

        airplane.trails.forEach((trail) => {
          this.scene.remove(trail.line);
          trail.line.geometry.dispose();
          trail.line.material.dispose();
        });
        return false;
      }

      airplane.progress += delta / airplane.duration;
      if (airplane.progress >= 1) {
        this.scene.remove(airplane.root);
        airplane.departed = true;
        return true;
      }

      this.placeAirplane(airplane, airplane.progress);
      return true;
    });
  }

  placeAirplane(airplane, progress) {
    const position = airplane.route.getPointAt(progress);
    const tangent = airplane.route.getTangentAt(progress).normalize();
    airplane.root.position.copy(position);
    airplane.root.quaternion.setFromUnitVectors(WORLD_FORWARD, tangent);

    airplane.trails.forEach((trail) => {
      const emitter = new THREE.Vector3(trail.side * 1.35, 0, -1.45)
        .applyQuaternion(airplane.root.quaternion)
        .add(position);
      emitter.add(new THREE.Vector3(
        randomFloat(-0.055, 0.055),
        randomFloat(-0.055, 0.055),
        randomFloat(-0.055, 0.055),
      ));
      trail.points.unshift(emitter);
      if (trail.points.length > AIRPLANE_TRAIL_POINTS) {
        trail.points.pop();
      }
      trail.line.geometry.setFromPoints(trail.points);
      trail.line.material.opacity = Math.min(trail.points.length / 10, 0.42);
    });
  }

  add(object) {
    this.scene.add(object);
    this.registerBuildingWindows(object);
    this.registerStreetlight(object);
  }

  remove(object) {
    this.unregisterStreetlight(object);
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
      if (!this.simulationPaused) {
        this.updateKeyboardCamera(delta);
        this.updaters.forEach((updater) => updater(delta, now));
      }
      this.controls.update();
      this.updateSunLightShadowCenter();
      this.renderer.render(this.scene, this.camera);
      this.renderFollowCameraFeeds(delta);
      requestAnimationFrame(render);
    };

    render();
  }

  updateSunLightShadowCenter() {
    if (!this.sunLight) {
      return;
    }

    const center = this.getSnappedSunShadowCenter(this.controls.target);
    this.sunLight.target.position.copy(center);
    this.sunLight.position.copy(center).addScaledVector(this.sunDirection, SUN_LIGHT_DISTANCE);
    this.sunLight.target.updateMatrixWorld();
  }

  getSnappedSunShadowCenter(center) {
    const texelSize = (SUN_SHADOW_HALF_SIZE * 2) / SUN_SHADOW_MAP_SIZE;
    const viewDirection = this.sunShadowView.copy(this.sunDirection).negate().normalize();
    const referenceUp = Math.abs(viewDirection.dot(WORLD_UP)) > 0.96 ? WORLD_FORWARD : WORLD_UP;

    this.sunShadowRight.crossVectors(referenceUp, viewDirection).normalize();
    this.sunShadowUp.crossVectors(viewDirection, this.sunShadowRight).normalize();
    this.sunShadowCenter.copy(center);

    const offsetX = this.sunShadowCenter.dot(this.sunShadowRight);
    const offsetY = this.sunShadowCenter.dot(this.sunShadowUp);
    const snappedX = Math.round(offsetX / texelSize) * texelSize;
    const snappedY = Math.round(offsetY / texelSize) * texelSize;

    this.sunShadowCenter
      .addScaledVector(this.sunShadowRight, snappedX - offsetX)
      .addScaledVector(this.sunShadowUp, snappedY - offsetY);

    return this.sunShadowCenter;
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

function createStreetlightFixture(object) {
  const group = new THREE.Group();
  const scale = object.userData.assetScale ?? 1;
  const materials = [];
  const lampPosition = new THREE.Vector3(0, 2.48 * scale, 0.28 * scale);
  const roadPosition = new THREE.Vector3(0, 0.025, 1.54 * scale);
  const lampToRoad = roadPosition.clone().sub(lampPosition);
  const beamHeight = lampToRoad.length();
  const beamDirection = lampToRoad.clone().normalize();
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: '#ffd18a',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const poolMaterial = new THREE.MeshBasicMaterial({
    color: '#ffd18a',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(0.5 * scale, beamHeight, 14, 1, true),
    beamMaterial,
  );
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 18), poolMaterial);

  group.name = 'Streetlight Night Lighting';
  beam.name = 'Streetlight Beam';
  pool.name = 'Streetlight Road Glow';
  beam.visible = false;
  pool.visible = false;
  beam.renderOrder = 2;
  pool.renderOrder = 1;
  beam.position.copy(lampPosition).add(beamDirection.clone().multiplyScalar(beamHeight * 0.5));
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), beamDirection);
  pool.position.copy(roadPosition);
  pool.rotation.x = -Math.PI / 2;
  pool.scale.set(0.62 * scale, 1.36 * scale, 1);
  group.add(beam, pool);

  object.traverse((child) => {
    if (!child.isMesh || !child.material) {
      return;
    }

    const childMaterials = Array.isArray(child.material) ? child.material : [child.material];

    childMaterials.forEach((material) => {
      if (!material?.emissive || material.name.toLowerCase() !== 'light' || materials.includes(material)) {
        return;
      }

      material.userData.streetlightBaseEmissive = material.emissive.clone();
      material.userData.streetlightBaseEmissiveIntensity = material.emissiveIntensity ?? 0;
      materials.push(material);
    });
  });

  return {
    group,
    beam,
    pool,
    beamMaterial,
    poolMaterial,
    materials,
    glowStrength: 0,
    turnOnDelay: randomFloat(0, STREETLIGHT_TURN_ON_SPREAD_SECONDS),
  };
}

function disposeStreetlightFixture(fixture) {
  fixture.beam.geometry.dispose();
  fixture.pool.geometry.dispose();
  fixture.beamMaterial.dispose();
  fixture.poolMaterial.dispose();
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

function normalizeAirplaneModel(model, targetSize) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const longestSide = Math.max(size.x, size.y, size.z);

  if (!Number.isFinite(longestSide) || longestSide <= 0) {
    return;
  }

  model.scale.multiplyScalar(targetSize / longestSide);
  model.updateMatrixWorld(true);
  const scaledBox = new THREE.Box3().setFromObject(model);
  const center = scaledBox.getCenter(new THREE.Vector3());
  model.position.sub(center);
}

function createAirplaneRoute() {
  const angle = randomFloat(0, Math.PI * 2);
  const direction = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
  const side = new THREE.Vector3(direction.z, 0, -direction.x);
  const height = randomFloat(AIRPLANE_MIN_HEIGHT, AIRPLANE_MAX_HEIGHT);
  const startOffset = randomFloat(-28, 28);
  const endOffset = randomFloat(-28, 28);
  const start = direction.clone().multiplyScalar(-AIRPLANE_ROUTE_RADIUS)
    .addScaledVector(side, startOffset)
    .setY(height + randomFloat(-1.5, 1.5));
  const end = direction.clone().multiplyScalar(AIRPLANE_ROUTE_RADIUS)
    .addScaledVector(side, endOffset)
    .setY(height + randomFloat(-1.5, 1.5));

  if (Math.random() < 0.45) {
    return new THREE.LineCurve3(start, end);
  }

  const bend = randomFloat(24, 54) * randomItem([-1, 1]);
  const controlA = start.clone().lerp(end, 0.34).addScaledVector(side, bend);
  const controlB = start.clone().lerp(end, 0.67).addScaledVector(side, bend * randomFloat(0.72, 1.12));
  controlA.y += randomFloat(-2, 2);
  controlB.y += randomFloat(-2, 2);
  return new THREE.CubicBezierCurve3(start, controlA, controlB, end);
}

function createAirplaneTrail(side) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  const material = new THREE.PointsMaterial({
    color: '#f7fbff',
    map: createSoftParticleTexture(),
    size: 0.72,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    alphaTest: 0.025,
  });
  const line = new THREE.Points(geometry, material);
  line.frustumCulled = false;
  line.renderOrder = 1;
  return { side, line, points: [] };
}

let softParticleTexture;

function createSoftParticleTexture() {
  if (softParticleTexture) {
    return softParticleTexture;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 3, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.35, 'rgba(248, 252, 255, 0.92)');
  gradient.addColorStop(0.72, 'rgba(235, 247, 255, 0.4)');
  gradient.addColorStop(1, 'rgba(235, 247, 255, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);

  softParticleTexture = new THREE.CanvasTexture(canvas);
  softParticleTexture.colorSpace = THREE.SRGBColorSpace;
  return softParticleTexture;
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

function createPrecipitationSystem({
  count,
  color,
  size,
  opacity,
  speedRange,
  slantRange,
  phaseRange = [0, 0],
}) {
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const slants = new Float32Array(count);
  const phases = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    resetWeatherParticle(positions, index);
    speeds[index] = randomFloat(speedRange[0], speedRange[1]);
    slants[index] = randomFloat(slantRange[0], slantRange[1]);
    phases[index] = randomFloat(phaseRange[0], phaseRange[1]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);

  const material = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    positions,
    speeds,
    slants,
    phases,
    count,
  };
}

function updateRainSystem(system, delta) {
  const { positions, speeds, slants, count } = system;

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    positions[offset] += slants[index] * delta;
    positions[offset + 1] -= speeds[index] * delta;

    if (positions[offset + 1] < WEATHER_MIN_HEIGHT) {
      resetWeatherParticle(positions, index, WEATHER_MAX_HEIGHT);
    }

    wrapWeatherParticle(positions, offset);
  }

  system.points.geometry.attributes.position.needsUpdate = true;
}

function updateSnowSystem(system, delta, time) {
  const { positions, speeds, slants, phases, count } = system;

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const sway = Math.sin(time * 0.9 + phases[index]) * 0.72;
    positions[offset] += (slants[index] + sway) * delta;
    positions[offset + 1] -= speeds[index] * delta;
    positions[offset + 2] += Math.cos(time * 0.62 + phases[index]) * 0.2 * delta;

    if (positions[offset + 1] < WEATHER_MIN_HEIGHT) {
      resetWeatherParticle(positions, index, WEATHER_MAX_HEIGHT);
    }

    wrapWeatherParticle(positions, offset);
  }

  system.points.geometry.attributes.position.needsUpdate = true;
}

function resetWeatherParticle(positions, index, height = randomFloat(WEATHER_MIN_HEIGHT, WEATHER_MAX_HEIGHT)) {
  const offset = index * 3;
  positions[offset] = randomFloat(-WEATHER_FIELD_HALF_WIDTH, WEATHER_FIELD_HALF_WIDTH);
  positions[offset + 1] = height;
  positions[offset + 2] = randomFloat(-WEATHER_FIELD_HALF_WIDTH, WEATHER_FIELD_HALF_WIDTH);
}

function wrapWeatherParticle(positions, offset) {
  if (positions[offset] > WEATHER_FIELD_HALF_WIDTH) {
    positions[offset] = -WEATHER_FIELD_HALF_WIDTH;
  } else if (positions[offset] < -WEATHER_FIELD_HALF_WIDTH) {
    positions[offset] = WEATHER_FIELD_HALF_WIDTH;
  }

  if (positions[offset + 2] > WEATHER_FIELD_HALF_WIDTH) {
    positions[offset + 2] = -WEATHER_FIELD_HALF_WIDTH;
  } else if (positions[offset + 2] < -WEATHER_FIELD_HALF_WIDTH) {
    positions[offset + 2] = WEATHER_FIELD_HALF_WIDTH;
  }
}

function normalizeWeather(weather) {
  return Object.hasOwn(WEATHER_LABELS, weather) ? weather : 'sunny';
}

function randomFloat(min, max) {
  return min + Math.random() * (max - min);
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}
