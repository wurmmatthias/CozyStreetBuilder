import * as THREE from 'three';
import { makePlaceableClone } from './assetUtils.js';

const ROAD_CELL_SIZE = 2;
const MIN_ROAD_TILES = 6;
const MIN_TRAFFIC_CARS = 4;
const MAX_TRAFFIC_CARS = 24;
const DEFAULT_TRAFFIC_DENSITY = 0.5;
const LANE_OFFSET = 0.34;
const CAR_Y_OFFSET = 0.04;
const MIN_SPAWN_INTERVAL = 0.6;
const MAX_SPAWN_INTERVAL = 1.8;
const DESPAWN_AFTER_IDLE = 0.2;
const TRAFFIC_LOOKAHEAD_DISTANCE = 1.65;
const TRAFFIC_STOP_DISTANCE = 0.78;
const TRAFFIC_BRAKE_BUFFER = 0.08;
const TRAFFIC_LANE_CLEARANCE = 0.48;
const TRAFFIC_SPAWN_CLEARANCE = 1.15;
const TRAFFIC_DANGER_DISTANCE = 0.52;
const TRAFFIC_STUCK_DESPAWN_TIME = 8;
const POLICE_DETAIN_DISTANCE = 1.35;
const POLICE_DESPAWN_AFTER_IDLE = 2.5;
const POLICE_EXIT_DISTANCE = ROAD_CELL_SIZE * 1.8;
const POLICE_LIGHT_BLINKS_PER_SECOND = 5.5;
const FIRE_EXTINGUISH_DISTANCE = 2.6;
const FIRE_SERVICE_DURATION = 3.2;
const FIRE_TRUCK_DESPAWN_AFTER_IDLE = 3.5;
const FIRE_TRUCK_LIGHT_BLINKS_PER_SECOND = 4.8;
const WATER_PARTICLE_COUNT = 140;

const DIRECTIONS = {
  n: { id: 'n', dx: 0, dz: -1 },
  e: { id: 'e', dx: 1, dz: 0 },
  s: { id: 's', dx: 0, dz: 1 },
  w: { id: 'w', dx: -1, dz: 0 },
};

const DIRECTION_IDS = Object.keys(DIRECTIONS);
const OPPOSITE = { n: 's', e: 'w', s: 'n', w: 'e' };

export class TrafficController {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.carAssets = [];
    this.policeAsset = null;
    this.fireTruckAsset = null;
    this.roadMap = new Map();
    this.cars = [];
    this.policeDispatches = [];
    this.fireDispatches = [];
    this.spawnTimer = 0;
    this.density = DEFAULT_TRAFFIC_DENSITY;
    this.needsRoadSync = true;
    this.placed = [];
    this.nextTrafficId = 1;

    this.update = this.update.bind(this);
    this.sceneManager.addUpdater(this.update);
  }

  setAssets(assets) {
    this.policeAsset = assets.find((asset) => asset.kind === 'car' && asset.id === 'police-car') ?? null;
    this.fireTruckAsset = assets.find((asset) => asset.kind === 'car' && asset.id === 'fire-truck') ?? null;
    this.carAssets = assets.filter((asset) => (
      asset.kind === 'car' &&
      asset !== this.policeAsset &&
      asset !== this.fireTruckAsset
    ));
    this.reset();
  }

  syncRoads(placed) {
    this.placed = placed;
    this.needsRoadSync = true;
  }

  setDensity(density) {
    this.density = THREE.MathUtils.clamp(density, 0, 1);
    this.trimTrafficToDensity();
  }

  reset() {
    this.cars.forEach((car) => this.sceneManager.remove(car.object));
    this.policeDispatches.forEach((dispatch) => this.sceneManager.remove(dispatch.object));
    this.fireDispatches.forEach((dispatch) => this.sceneManager.remove(dispatch.object));
    this.cars = [];
    this.policeDispatches = [];
    this.fireDispatches = [];
    this.spawnTimer = 0;
  }

  update(delta, now = performance.now()) {
    if (this.needsRoadSync) {
      this.rebuildRoadMap();
      this.needsRoadSync = false;
    }

    if (this.roadMap.size < MIN_ROAD_TILES) {
      this.reset();
      return;
    }

    if (this.density === 0 || this.carAssets.length === 0) {
      this.trimTrafficToDensity();
      this.spawnTimer = 0;
    } else {
      this.spawnTimer -= delta;

      if (this.spawnTimer <= 0 && this.cars.length < this.getMaxCars()) {
        this.spawnCar();
        this.spawnTimer = this.getSpawnInterval() + Math.random() * 0.75;
      }
    }

    for (let index = this.cars.length - 1; index >= 0; index -= 1) {
      const car = this.cars[index];

      if (!this.advanceCar(car, delta)) {
        this.removeCar(index);
      }
    }

    for (let index = this.policeDispatches.length - 1; index >= 0; index -= 1) {
      const dispatch = this.policeDispatches[index];
      updatePoliceLights(dispatch, now);

      if (!this.advancePoliceDispatch(dispatch, delta)) {
        this.removePoliceDispatch(index);
      }
    }

    for (let index = this.fireDispatches.length - 1; index >= 0; index -= 1) {
      const dispatch = this.fireDispatches[index];
      updateFireTruckLights(dispatch, now);

      if (!this.advanceFireDispatch(dispatch, delta)) {
        this.removeFireDispatch(index);
      }
    }
  }

  rebuildRoadMap() {
    this.roadMap.clear();

    this.placed
      .filter((object) => object.userData.assetKind === 'road')
      .forEach((object) => {
        const cell = positionToCell(object.position);
        this.roadMap.set(cellKey(cell), {
          ...cell,
          connections: getRoadPieceConnections(object),
        });
      });
  }

  spawnCar() {
    const spawnOptions = this.getSpawnOptions();

    if (spawnOptions.length === 0) {
      return;
    }

    const spawn = randomItem(spawnOptions);
    const asset = randomItem(this.carAssets);
    const object = makePlaceableClone(asset.source, asset);
    const nextCell = getNeighborCell(spawn.cell, spawn.direction);
    const from = lanePoint(spawn.cell, spawn.direction);
    const to = lanePoint(nextCell, spawn.direction);
    const spawnProgress = Math.random() * 0.28;
    const spawnPosition = new THREE.Vector3().lerpVectors(from, to, spawnProgress);

    if (this.isTrafficSpawnBlocked(spawnPosition)) {
      return;
    }

    object.userData.trafficCar = true;
    object.position.copy(spawnPosition);
    object.rotation.y = getTravelRotation(from, to, asset);
    this.sceneManager.add(object);

    this.cars.push({
      object,
      asset,
      cell: spawn.cell,
      nextCell,
      direction: spawn.direction,
      from,
      to,
      progress: spawnProgress,
      speed: 1.25 + Math.random() * 0.7,
      idleTime: 0,
      stuckTime: 0,
      trafficId: this.nextTrafficId,
    });
    this.nextTrafficId += 1;
  }

  dispatchPoliceToPerson(person, callbacks = {}) {
    if (!person || !this.policeAsset) {
      callbacks.onUnavailable?.('No police car available.');
      return false;
    }

    if (this.policeDispatches.some((dispatch) => dispatch.person === person)) {
      return false;
    }

    const spawnOptions = this.getPoliceSpawnOptions(person);

    if (spawnOptions.length === 0) {
      callbacks.onUnavailable?.('No reachable road for police.');
      return false;
    }

    const spawn = randomItem(spawnOptions.slice(0, Math.min(spawnOptions.length, 5)));
    const asset = this.policeAsset;
    const object = makePlaceableClone(asset.source, asset);
    const nextCell = getNeighborCell(spawn.cell, spawn.direction);
    const from = lanePoint(spawn.cell, spawn.direction);
    const to = lanePoint(nextCell, spawn.direction);

    object.userData.policeDispatch = true;
    object.userData.policeLights = createPoliceLights(object);
    object.position.copy(from);
    object.rotation.y = getTravelRotation(from, to, asset);
    this.sceneManager.add(object);

    this.policeDispatches.push({
      object,
      asset,
      person,
      callbacks,
      phase: 'enroute',
      cell: spawn.cell,
      nextCell,
      direction: spawn.direction,
      from,
      to,
      progress: 0,
      speed: 2.55,
      idleTime: 0,
      trafficId: this.nextTrafficId,
    });
    this.nextTrafficId += 1;
    callbacks.onStatusChange?.('Police en route.');
    return true;
  }

  dispatchFireTruckToBuilding(building, callbacks = {}) {
    if (!building || !this.fireTruckAsset) {
      callbacks.onUnavailable?.('No fire truck available.');
      return false;
    }

    if (this.fireDispatches.some((dispatch) => dispatch.building === building)) {
      return false;
    }

    const spawnOptions = this.getFireSpawnOptions(building);

    if (spawnOptions.length === 0) {
      callbacks.onUnavailable?.('No reachable road for the fire truck.');
      return false;
    }

    const spawn = randomItem(spawnOptions.slice(0, Math.min(spawnOptions.length, 5)));
    const asset = this.fireTruckAsset;
    const object = makePlaceableClone(asset.source, asset);
    const nextCell = getNeighborCell(spawn.cell, spawn.direction);
    const from = lanePoint(spawn.cell, spawn.direction);
    const to = lanePoint(nextCell, spawn.direction);

    object.userData.fireDispatch = true;
    object.userData.fireTruckLights = createFireTruckLights(object);
    object.position.copy(from);
    object.rotation.y = getTravelRotation(from, to, asset);
    this.sceneManager.add(object);

    this.fireDispatches.push({
      object,
      asset,
      building,
      callbacks,
      phase: 'enroute',
      destinationKey: spawn.destinationKey,
      routeMap: spawn.routeMap,
      cell: spawn.cell,
      nextCell,
      direction: spawn.direction,
      from,
      to,
      progress: 0,
      speed: 2.25,
      idleTime: 0,
      serviceTime: 0,
      extinguished: false,
      trafficId: this.nextTrafficId,
    });
    this.nextTrafficId += 1;
    callbacks.onStatusChange?.('Fire truck en route.');
    return true;
  }

  getPoliceSpawnOptions(person) {
    const destination = getPersonCell(person);

    if (!destination) {
      return [];
    }

    const routeMap = this.buildRouteMap(destination);

    return this.getSpawnOptions()
      .map((spawn) => {
        const route = routeMap.get(cellKey(spawn.cell));
        return {
          ...spawn,
          routeDirection: route?.direction ?? null,
          distance: route?.distance ?? Infinity,
        };
      })
      .filter((spawn) => spawn.routeDirection || cellKey(spawn.cell) === cellKey(destination))
      .sort((a, b) => {
        const aAligned = a.routeDirection === a.direction ? 1 : 0;
        const bAligned = b.routeDirection === b.direction ? 1 : 0;
        return bAligned - aAligned || b.distance - a.distance;
      });
  }

  getFireSpawnOptions(building) {
    const destination = this.getNearestRoadCell(building.position);

    if (!destination) {
      return [];
    }

    const destinationKey = cellKey(destination);
    const routeMap = this.buildRouteMap(destination);

    return this.getSpawnOptions()
      .map((spawn) => {
        const route = routeMap.get(cellKey(spawn.cell));
        return {
          ...spawn,
          routeDirection: route?.direction ?? null,
          distance: route?.distance ?? Infinity,
          destinationKey,
          routeMap,
        };
      })
      .filter((spawn) => spawn.routeDirection || cellKey(spawn.cell) === destinationKey)
      .sort((a, b) => {
        const aAligned = a.routeDirection === a.direction ? 1 : 0;
        const bAligned = b.routeDirection === b.direction ? 1 : 0;
        return bAligned - aAligned || b.distance - a.distance;
      });
  }

  getNearestRoadCell(position) {
    let nearest = null;
    let nearestDistance = Infinity;

    this.roadMap.forEach((road) => {
      const distance = cellToPosition(road).distanceToSquared(position);

      if (distance < nearestDistance) {
        nearest = road;
        nearestDistance = distance;
      }
    });

    return nearest;
  }

  getSpawnOptions() {
    const options = [];

    this.roadMap.forEach((road) => {
      const connections = this.getConnections(road);

      connections.forEach((direction) => {
        const previousCell = getNeighborCell(road, OPPOSITE[direction]);

        if (!this.roadMap.has(cellKey(previousCell)) || Math.random() < 0.2) {
          options.push({ cell: road, direction });
        }
      });
    });

    return options;
  }

  advanceCar(car, delta) {
    let remainingTravel = car.speed * delta;
    let blockedByTraffic = false;

    while (remainingTravel > 0) {
      remainingTravel = this.getTrafficAdjustedTravel(car, remainingTravel);

      if (remainingTravel <= 0) {
        blockedByTraffic = true;
        break;
      }

      const currentRoad = this.roadMap.get(cellKey(car.cell));
      const nextRoad = this.roadMap.get(cellKey(car.nextCell));

      if (!currentRoad || !nextRoad || !canTravel(currentRoad, nextRoad, car.direction)) {
        car.idleTime += delta;
        return car.idleTime < DESPAWN_AFTER_IDLE;
      }

      const segmentLength = Math.max(car.from.distanceTo(car.to), 0.001);
      const segmentRemaining = (1 - car.progress) * segmentLength;

      if (remainingTravel < segmentRemaining) {
        car.progress += remainingTravel / segmentLength;
        remainingTravel = 0;
        break;
      }

      remainingTravel -= segmentRemaining;
      car.cell = nextRoad;

      const nextDirection = this.chooseNextDirection(nextRoad, car.direction);

      if (!nextDirection) {
        return false;
      }

      car.direction = nextDirection;
      car.nextCell = getNeighborCell(nextRoad, car.direction);
      car.from = car.to.clone();
      car.to = lanePoint(car.nextCell, car.direction);
      car.progress = 0;
    }

    car.object.position.lerpVectors(car.from, car.to, THREE.MathUtils.clamp(car.progress, 0, 1));
    car.object.rotation.y = getTravelRotation(car.from, car.to, car.asset);
    car.idleTime = 0;

    if (blockedByTraffic) {
      car.stuckTime += delta;
      return car.stuckTime < TRAFFIC_STUCK_DESPAWN_TIME;
    }

    car.stuckTime = 0;
    return true;
  }

  advancePoliceDispatch(dispatch, delta) {
    if (dispatch.phase === 'leaving') {
      return this.advancePoliceLeaving(dispatch, delta);
    }

    if (dispatch.phase === 'enroute' && !dispatch.person?.object?.parent) {
      dispatch.callbacks.onUnavailable?.('Suspect left the street.');
      return false;
    }

    if (
      dispatch.phase === 'enroute' &&
      dispatch.object.position.distanceTo(dispatch.person.object.position) <= POLICE_DETAIN_DISTANCE
    ) {
      dispatch.callbacks.onDetained?.(dispatch.person);
      this.beginPoliceExit(dispatch);
    }

    let remainingTravel = dispatch.speed * delta;

    while (remainingTravel > 0) {
      remainingTravel = this.getTrafficAdjustedTravel(dispatch, remainingTravel);

      if (remainingTravel <= 0) {
        break;
      }

      let currentRoad = this.roadMap.get(cellKey(dispatch.cell));
      let nextRoad = this.roadMap.get(cellKey(dispatch.nextCell));

      if (!currentRoad) {
        return this.keepPoliceIdling(dispatch, delta);
      }

      if (dispatch.phase === 'exit' && cellKey(currentRoad) === dispatch.exitDestinationKey) {
        this.beginPoliceLeaving(dispatch, currentRoad);
        return true;
      }

      if (!nextRoad || !canTravel(currentRoad, nextRoad, dispatch.direction)) {
        const rerouteDirection = dispatch.phase === 'exit'
          ? this.choosePoliceExitDirection(currentRoad, dispatch.direction, dispatch)
          : this.choosePoliceDirection(currentRoad, dispatch.direction, dispatch.person);

        if (!rerouteDirection) {
          return this.keepPoliceIdling(dispatch, delta);
        }

        dispatch.direction = rerouteDirection;
        dispatch.nextCell = getNeighborCell(currentRoad, dispatch.direction);
        dispatch.from = dispatch.object.position.clone();
        dispatch.to = lanePoint(dispatch.nextCell, dispatch.direction);
        dispatch.progress = 0;
        nextRoad = this.roadMap.get(cellKey(dispatch.nextCell));
      }

      const segmentLength = Math.max(dispatch.from.distanceTo(dispatch.to), 0.001);
      const segmentRemaining = (1 - dispatch.progress) * segmentLength;

      if (remainingTravel < segmentRemaining) {
        dispatch.progress += remainingTravel / segmentLength;
        remainingTravel = 0;
        break;
      }

      remainingTravel -= segmentRemaining;

      if (!nextRoad) {
        return this.keepPoliceIdling(dispatch, delta);
      }

      dispatch.cell = nextRoad;
      currentRoad = nextRoad;

      const nextDirection = dispatch.phase === 'exit'
        ? this.choosePoliceExitDirection(currentRoad, dispatch.direction, dispatch)
        : this.choosePoliceDirection(currentRoad, dispatch.direction, dispatch.person);

      if (!nextDirection) {
        return false;
      }

      dispatch.direction = nextDirection;
      dispatch.nextCell = getNeighborCell(currentRoad, dispatch.direction);
      dispatch.from = dispatch.to.clone();
      dispatch.to = lanePoint(dispatch.nextCell, dispatch.direction);
      dispatch.progress = 0;
    }

    dispatch.object.position.lerpVectors(dispatch.from, dispatch.to, THREE.MathUtils.clamp(dispatch.progress, 0, 1));
    dispatch.object.rotation.y = getTravelRotation(dispatch.from, dispatch.to, dispatch.asset);
    dispatch.idleTime = 0;
    return true;
  }

  advanceFireDispatch(dispatch, delta) {
    if (dispatch.phase === 'leaving') {
      return this.advancePoliceLeaving(dispatch, delta);
    }

    if (dispatch.phase === 'servicing') {
      if (!dispatch.building?.parent) {
        this.disposeFireHoseSpray(dispatch);
        dispatch.callbacks.onUnavailable?.('The burning building is gone.');
        return false;
      }

      updateFireHoseSpray(dispatch.waterSpray, dispatch, delta);
      dispatch.serviceTime -= delta;

      if (dispatch.serviceTime <= 0 && !dispatch.extinguished) {
        dispatch.extinguished = true;
        dispatch.callbacks.onExtinguished?.(dispatch.building);
        this.beginFireExit(dispatch);
      }

      return true;
    }

    if (dispatch.phase === 'enroute' && !dispatch.building?.parent) {
      dispatch.callbacks.onUnavailable?.('The burning building is gone.');
      return false;
    }

    if (
      dispatch.phase === 'enroute' &&
      dispatch.object.position.distanceTo(dispatch.building.position) <= FIRE_EXTINGUISH_DISTANCE
    ) {
      this.beginFireService(dispatch);
      return true;
    }

    let remainingTravel = dispatch.speed * delta;

    while (remainingTravel > 0) {
      remainingTravel = this.getTrafficAdjustedTravel(dispatch, remainingTravel);

      if (remainingTravel <= 0) {
        break;
      }

      let currentRoad = this.roadMap.get(cellKey(dispatch.cell));
      let nextRoad = this.roadMap.get(cellKey(dispatch.nextCell));

      if (!currentRoad) {
        return this.keepFireTruckIdling(dispatch, delta);
      }

      if (dispatch.phase === 'enroute' && cellKey(currentRoad) === dispatch.destinationKey) {
        this.beginFireService(dispatch);
        return true;
      }

      if (dispatch.phase === 'exit' && cellKey(currentRoad) === dispatch.exitDestinationKey) {
        this.beginPoliceLeaving(dispatch, currentRoad);
        return true;
      }

      if (!nextRoad || !canTravel(currentRoad, nextRoad, dispatch.direction)) {
        const rerouteDirection = dispatch.phase === 'exit'
          ? this.choosePoliceExitDirection(currentRoad, dispatch.direction, dispatch)
          : this.chooseFireDirection(currentRoad, dispatch.direction, dispatch);

        if (!rerouteDirection) {
          return this.keepFireTruckIdling(dispatch, delta);
        }

        dispatch.direction = rerouteDirection;
        dispatch.nextCell = getNeighborCell(currentRoad, dispatch.direction);
        dispatch.from = dispatch.object.position.clone();
        dispatch.to = lanePoint(dispatch.nextCell, dispatch.direction);
        dispatch.progress = 0;
        nextRoad = this.roadMap.get(cellKey(dispatch.nextCell));
      }

      const segmentLength = Math.max(dispatch.from.distanceTo(dispatch.to), 0.001);
      const segmentRemaining = (1 - dispatch.progress) * segmentLength;

      if (remainingTravel < segmentRemaining) {
        dispatch.progress += remainingTravel / segmentLength;
        remainingTravel = 0;
        break;
      }

      remainingTravel -= segmentRemaining;

      if (!nextRoad) {
        return this.keepFireTruckIdling(dispatch, delta);
      }

      dispatch.cell = nextRoad;
      currentRoad = nextRoad;

      if (dispatch.phase === 'enroute' && cellKey(currentRoad) === dispatch.destinationKey) {
        dispatch.object.position.copy(dispatch.to);
        this.beginFireService(dispatch);
        return true;
      }

      const nextDirection = dispatch.phase === 'exit'
        ? this.choosePoliceExitDirection(currentRoad, dispatch.direction, dispatch)
        : this.chooseFireDirection(currentRoad, dispatch.direction, dispatch);

      if (!nextDirection) {
        return false;
      }

      dispatch.direction = nextDirection;
      dispatch.nextCell = getNeighborCell(currentRoad, dispatch.direction);
      dispatch.from = dispatch.to.clone();
      dispatch.to = lanePoint(dispatch.nextCell, dispatch.direction);
      dispatch.progress = 0;
    }

    dispatch.object.position.lerpVectors(dispatch.from, dispatch.to, THREE.MathUtils.clamp(dispatch.progress, 0, 1));
    dispatch.object.rotation.y = getTravelRotation(dispatch.from, dispatch.to, dispatch.asset);
    dispatch.idleTime = 0;
    return true;
  }

  beginFireService(dispatch) {
    dispatch.phase = 'servicing';
    dispatch.serviceTime = FIRE_SERVICE_DURATION;
    dispatch.progress = 0;
    dispatch.idleTime = 0;
    dispatch.waterSpray = createFireHoseSpray();
    this.sceneManager.add(dispatch.waterSpray.object);
    dispatch.callbacks.onStatusChange?.('Fire truck on scene.');
  }

  beginFireExit(dispatch) {
    const currentRoad = this.roadMap.get(cellKey(dispatch.cell));
    const exitPlan = currentRoad ? this.getPoliceExitPlan(currentRoad) : null;

    this.disposeFireHoseSpray(dispatch);
    dispatch.phase = 'exit';
    dispatch.building = null;
    dispatch.speed = 2.7;
    dispatch.idleTime = 0;
    dispatch.exitDestinationKey = exitPlan ? cellKey(exitPlan.road) : null;
    dispatch.exitRouteMap = exitPlan?.routeMap ?? new Map();
    dispatch.callbacks.onStatusChange?.('Fire out. Fire truck returning.');

    if (currentRoad && dispatch.exitDestinationKey === cellKey(currentRoad)) {
      this.beginPoliceLeaving(dispatch, currentRoad);
      return;
    }

    const exitDirection = currentRoad ? this.choosePoliceExitDirection(currentRoad, dispatch.direction, dispatch) : null;

    if (currentRoad && exitDirection) {
      dispatch.direction = exitDirection;
      dispatch.nextCell = getNeighborCell(currentRoad, dispatch.direction);
      dispatch.from = dispatch.object.position.clone();
      dispatch.to = lanePoint(dispatch.nextCell, dispatch.direction);
      dispatch.progress = 0;
    }
  }

  keepFireTruckIdling(dispatch, delta) {
    dispatch.idleTime += delta;

    if (dispatch.idleTime >= FIRE_TRUCK_DESPAWN_AFTER_IDLE) {
      dispatch.callbacks.onUnavailable?.('Fire truck could not reach the building.');
      return false;
    }

    return true;
  }

  beginPoliceExit(dispatch) {
    const currentRoad = this.roadMap.get(cellKey(dispatch.cell));
    const exitPlan = currentRoad ? this.getPoliceExitPlan(currentRoad) : null;

    dispatch.phase = 'exit';
    dispatch.person = null;
    dispatch.speed = 2.85;
    dispatch.idleTime = 0;
    dispatch.exitDestinationKey = exitPlan ? cellKey(exitPlan.road) : null;
    dispatch.exitRouteMap = exitPlan?.routeMap ?? new Map();

    if (currentRoad && dispatch.exitDestinationKey === cellKey(currentRoad)) {
      this.beginPoliceLeaving(dispatch, currentRoad);
      return;
    }

    const exitDirection = currentRoad ? this.choosePoliceExitDirection(currentRoad, dispatch.direction, dispatch) : null;

    if (currentRoad && exitDirection) {
      dispatch.direction = exitDirection;
      dispatch.nextCell = getNeighborCell(currentRoad, dispatch.direction);
      dispatch.from = dispatch.object.position.clone();
      dispatch.to = lanePoint(dispatch.nextCell, dispatch.direction);
      dispatch.progress = 0;
    }
  }

  keepPoliceIdling(dispatch, delta) {
    dispatch.idleTime += delta;
    return dispatch.idleTime < POLICE_DESPAWN_AFTER_IDLE;
  }

  advancePoliceLeaving(dispatch, delta) {
    const segmentLength = Math.max(dispatch.from.distanceTo(dispatch.to), 0.001);
    dispatch.progress += (dispatch.speed * delta) / segmentLength;

    if (dispatch.progress >= 1) {
      return false;
    }

    dispatch.object.position.lerpVectors(dispatch.from, dispatch.to, THREE.MathUtils.clamp(dispatch.progress, 0, 1));
    dispatch.object.rotation.y = getTravelRotation(dispatch.from, dispatch.to, dispatch.asset);
    return true;
  }

  chooseNextDirection(road, currentDirection) {
    const connections = this.getConnections(road);
    const forward = connections.includes(currentDirection) ? currentDirection : null;
    const choices = connections.filter((direction) => direction !== OPPOSITE[currentDirection]);

    if (choices.length === 0) {
      return null;
    }

    if (forward && Math.random() < 0.72) {
      return forward;
    }

    return randomItem(choices);
  }

  getConnections(road) {
    return road.connections.filter((direction) => {
      const neighbor = this.roadMap.get(cellKey(getNeighborCell(road, direction)));
      return neighbor && canTravel(road, neighbor, direction);
    });
  }

  getTrafficAdjustedTravel(vehicle, desiredTravel) {
    if (desiredTravel <= 0) {
      return 0;
    }

    const blocker = this.findTrafficBlocker(vehicle);

    if (!blocker) {
      return desiredTravel;
    }

    const availableDistance = blocker.distance - TRAFFIC_STOP_DISTANCE;

    if (availableDistance <= 0) {
      return 0;
    }

    const brakingRange = TRAFFIC_LOOKAHEAD_DISTANCE - TRAFFIC_STOP_DISTANCE;
    const speedFactor = THREE.MathUtils.clamp(availableDistance / brakingRange, 0, 1);
    const cappedTravel = Math.max(availableDistance - TRAFFIC_BRAKE_BUFFER, 0);

    return Math.min(desiredTravel * speedFactor, cappedTravel);
  }

  findTrafficBlocker(vehicle) {
    const position = getVehiclePosition(vehicle);
    const forward = getDirectionVector(vehicle.direction);
    let closest = null;

    this.getActiveVehicles().forEach((otherVehicle) => {
      if (otherVehicle === vehicle) {
        return;
      }

      const offset = new THREE.Vector3().subVectors(getVehiclePosition(otherVehicle), position);
      const forwardDistance = offset.dot(forward);

      if (forwardDistance <= 0 || forwardDistance > TRAFFIC_LOOKAHEAD_DISTANCE) {
        return;
      }

      const lateralDistanceSq = offset.lengthSq() - forwardDistance * forwardDistance;

      if (lateralDistanceSq > TRAFFIC_LANE_CLEARANCE * TRAFFIC_LANE_CLEARANCE) {
        return;
      }

      const sameLane = otherVehicle.direction === vehicle.direction;

      if (!sameLane && !this.shouldYieldToCrossTraffic(vehicle, otherVehicle, forwardDistance)) {
        return;
      }

      if (!closest || forwardDistance < closest.distance) {
        closest = { vehicle: otherVehicle, distance: forwardDistance };
      }
    });

    return closest;
  }

  shouldYieldToCrossTraffic(vehicle, otherVehicle, forwardDistance) {
    if (forwardDistance <= TRAFFIC_DANGER_DISTANCE) {
      return true;
    }

    const vehicleInIntersection = this.isVehicleInIntersection(vehicle);
    const otherInIntersection = this.isVehicleInIntersection(otherVehicle);

    if (otherInIntersection && !vehicleInIntersection) {
      return true;
    }

    if (vehicleInIntersection && !otherInIntersection) {
      return false;
    }

    return !hasTrafficPriority(vehicle, otherVehicle);
  }

  isVehicleInIntersection(vehicle) {
    const currentRoad = this.roadMap.get(cellKey(vehicle.cell));
    const nextRoad = this.roadMap.get(cellKey(vehicle.nextCell));

    return (
      (currentRoad?.connections.length >= 3 && vehicle.progress < 0.58) ||
      (nextRoad?.connections.length >= 3 && vehicle.progress > 0.42)
    );
  }

  isTrafficSpawnBlocked(position) {
    const clearanceSq = TRAFFIC_SPAWN_CLEARANCE * TRAFFIC_SPAWN_CLEARANCE;

    return this.getActiveVehicles().some((vehicle) => (
      vehicle.object.position.distanceToSquared(position) < clearanceSq
    ));
  }

  getActiveVehicles() {
    return [
      ...this.cars,
      ...this.policeDispatches.filter((dispatch) => dispatch.phase !== 'leaving'),
      ...this.fireDispatches.filter((dispatch) => dispatch.phase !== 'servicing' && dispatch.phase !== 'leaving'),
    ];
  }

  choosePoliceDirection(road, currentDirection, person) {
    const destination = getPersonCell(person);
    const routeDirection = destination ? this.findRouteDirection(road, destination) : null;

    if (routeDirection) {
      return routeDirection;
    }

    const connections = this.getConnections(road);
    const choices = connections.filter((direction) => direction !== OPPOSITE[currentDirection]);

    if (choices.length > 0) {
      return randomItem(choices);
    }

    return connections[0] ?? null;
  }

  chooseFireDirection(road, currentDirection, dispatch) {
    const plannedDirection = dispatch.routeMap?.get(cellKey(road))?.direction;

    if (plannedDirection) {
      return plannedDirection;
    }

    const connections = this.getConnections(road);
    const choices = connections.filter((direction) => direction !== OPPOSITE[currentDirection]);

    if (choices.length > 0) {
      return randomItem(choices);
    }

    return connections[0] ?? null;
  }

  choosePoliceExitDirection(road, currentDirection, dispatch = null) {
    const plannedDirection = dispatch?.exitRouteMap?.get(cellKey(road))?.direction;

    if (plannedDirection) {
      return plannedDirection;
    }

    const connections = this.getConnections(road);
    const forward = connections.includes(currentDirection) ? currentDirection : null;

    if (forward && isLeavingTown(road, currentDirection)) {
      return forward;
    }

    const ranked = connections
      .filter((direction) => direction !== OPPOSITE[currentDirection])
      .sort((first, second) => {
        const firstCell = getNeighborCell(road, first);
        const secondCell = getNeighborCell(road, second);
        return cellDistanceFromCenter(secondCell) - cellDistanceFromCenter(firstCell);
      });

    if (ranked.length > 0) {
      return ranked[0];
    }

    return forward ?? connections[0] ?? currentDirection;
  }

  beginPoliceLeaving(dispatch, road) {
    const offroadDirection = this.chooseOffroadExitDirection(road, dispatch.direction);

    dispatch.phase = 'leaving';
    dispatch.direction = offroadDirection;
    dispatch.from = dispatch.object.position.clone();
    dispatch.to = lanePoint(getNeighborCell(road, offroadDirection), offroadDirection);
    dispatch.progress = 0;
    dispatch.speed = 3.2;
  }

  chooseOffroadExitDirection(road, currentDirection) {
    const offroadDirections = DIRECTION_IDS.filter((direction) => {
      const neighbor = getNeighborCell(road, direction);
      return !this.roadMap.has(cellKey(neighbor)) && isLeavingTown(road, direction);
    });

    if (offroadDirections.includes(currentDirection)) {
      return currentDirection;
    }

    return offroadDirections
      .sort((first, second) => {
        const firstCell = getNeighborCell(road, first);
        const secondCell = getNeighborCell(road, second);
        return cellDistanceFromCenter(secondCell) - cellDistanceFromCenter(firstCell);
      })[0] ?? currentDirection;
  }

  getPoliceExitPlan(startRoad) {
    const reachable = this.getReachableRoads(startRoad);

    if (reachable.length === 0) {
      return null;
    }

    const road = reachable.sort((first, second) => {
      const centerDelta = cellDistanceFromCenter(second.road) - cellDistanceFromCenter(first.road);
      return centerDelta || second.distance - first.distance;
    })[0].road;

    return {
      road,
      routeMap: this.buildRouteMap(road),
    };
  }

  getReachableRoads(startRoad) {
    const startKey = cellKey(startRoad);
    const queue = [{ road: startRoad, distance: 0 }];
    const visited = new Set([startKey]);
    const reachable = [];

    while (queue.length > 0) {
      const entry = queue.shift();
      reachable.push(entry);

      for (const direction of this.getConnections(entry.road)) {
        const neighbor = this.roadMap.get(cellKey(getNeighborCell(entry.road, direction)));

        if (!neighbor || visited.has(cellKey(neighbor))) {
          continue;
        }

        visited.add(cellKey(neighbor));
        queue.push({ road: neighbor, distance: entry.distance + 1 });
      }
    }

    return reachable;
  }

  buildRouteMap(destinationCell) {
    const destination = this.roadMap.get(cellKey(destinationCell));

    if (!destination) {
      return new Map();
    }

    const routeMap = new Map([[cellKey(destination), { direction: null, distance: 0 }]]);
    const queue = [destination];

    while (queue.length > 0) {
      const road = queue.shift();
      const roadRoute = routeMap.get(cellKey(road));

      for (const direction of this.getConnections(road)) {
        const neighbor = this.roadMap.get(cellKey(getNeighborCell(road, direction)));
        const neighborKey = neighbor ? cellKey(neighbor) : null;

        if (!neighbor || routeMap.has(neighborKey)) {
          continue;
        }

        routeMap.set(neighborKey, {
          direction: OPPOSITE[direction],
          distance: roadRoute.distance + 1,
        });
        queue.push(neighbor);
      }
    }

    return routeMap;
  }

  findRouteDirection(startRoad, destinationCell) {
    const startKey = cellKey(startRoad);
    const destinationKey = cellKey(destinationCell);

    if (startKey === destinationKey) {
      return null;
    }

    const queue = [{ road: startRoad, firstDirection: null }];
    const visited = new Set([startKey]);

    while (queue.length > 0) {
      const { road, firstDirection } = queue.shift();

      for (const direction of this.getConnections(road)) {
        const neighborCell = getNeighborCell(road, direction);
        const neighborKey = cellKey(neighborCell);

        if (visited.has(neighborKey)) {
          continue;
        }

        const neighbor = this.roadMap.get(neighborKey);

        if (!neighbor) {
          continue;
        }

        const nextFirstDirection = firstDirection ?? direction;

        if (neighborKey === destinationKey) {
          return nextFirstDirection;
        }

        visited.add(neighborKey);
        queue.push({ road: neighbor, firstDirection: nextFirstDirection });
      }
    }

    return null;
  }

  removeCar(index) {
    const [car] = this.cars.splice(index, 1);
    this.sceneManager.remove(car.object);
  }

  removePoliceDispatch(index) {
    const [dispatch] = this.policeDispatches.splice(index, 1);
    this.sceneManager.remove(dispatch.object);
  }

  removeFireDispatch(index) {
    const [dispatch] = this.fireDispatches.splice(index, 1);
    this.disposeFireHoseSpray(dispatch);
    this.sceneManager.remove(dispatch.object);
  }

  disposeFireHoseSpray(dispatch) {
    if (!dispatch?.waterSpray) {
      return;
    }

    this.sceneManager.remove(dispatch.waterSpray.object);
    dispatch.waterSpray.geometry.dispose();
    dispatch.waterSpray.material.dispose();
    dispatch.waterSpray = null;
  }

  trimTrafficToDensity() {
    const maxCars = this.getMaxCars();

    while (this.cars.length > maxCars) {
      this.removeCar(this.cars.length - 1);
    }
  }

  getMaxCars() {
    if (this.density === 0) {
      return 0;
    }

    return Math.round(THREE.MathUtils.lerp(MIN_TRAFFIC_CARS, MAX_TRAFFIC_CARS, this.density));
  }

  getSpawnInterval() {
    return THREE.MathUtils.lerp(MAX_SPAWN_INTERVAL, MIN_SPAWN_INTERVAL, this.density);
  }
}

function positionToCell(position) {
  return {
    x: Math.round(position.x / ROAD_CELL_SIZE),
    z: Math.round(position.z / ROAD_CELL_SIZE),
  };
}

function createPoliceLights(object) {
  return createEmergencyLights(object, {
    name: 'Police Light Bar',
    primaryColor: '#ff3148',
    secondaryColor: '#2b72ff',
  });
}

function createFireTruckLights(object) {
  return createEmergencyLights(object, {
    name: 'Fire Truck Light Bar',
    primaryColor: '#ff3148',
    secondaryColor: '#ffd15c',
  });
}

function createEmergencyLights(object, options) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const bar = new THREE.Group();
  const lightWidth = THREE.MathUtils.clamp(size.x * 0.2, 0.12, 0.24);
  const lightHeight = THREE.MathUtils.clamp(size.y * 0.08, 0.04, 0.08);
  const lightDepth = THREE.MathUtils.clamp(size.z * 0.16, 0.08, 0.18);
  const redMaterial = new THREE.MeshStandardMaterial({
    color: options.primaryColor,
    emissive: options.primaryColor,
    emissiveIntensity: 2.4,
    roughness: 0.34,
  });
  const blueMaterial = new THREE.MeshStandardMaterial({
    color: options.secondaryColor,
    emissive: options.secondaryColor,
    emissiveIntensity: 0.2,
    roughness: 0.34,
  });
  const geometry = new THREE.BoxGeometry(lightWidth, lightHeight, lightDepth);
  const redMesh = new THREE.Mesh(geometry, redMaterial);
  const blueMesh = new THREE.Mesh(geometry.clone(), blueMaterial);
  const redLight = new THREE.PointLight(options.primaryColor, 1.6, 3.8);
  const blueLight = new THREE.PointLight(options.secondaryColor, 0.1, 3.8);

  bar.name = options.name;
  bar.position.set(center.x, box.max.y + lightHeight * 0.65, center.z);
  redMesh.position.x = -lightWidth * 0.62;
  blueMesh.position.x = lightWidth * 0.62;
  redLight.position.copy(redMesh.position).add(new THREE.Vector3(0, lightHeight * 1.8, 0));
  blueLight.position.copy(blueMesh.position).add(new THREE.Vector3(0, lightHeight * 1.8, 0));

  bar.add(redMesh, blueMesh, redLight, blueLight);
  object.add(bar);

  return {
    redMaterial,
    blueMaterial,
    redLight,
    blueLight,
    phaseOffset: Math.random() * Math.PI * 2,
  };
}

function updatePoliceLights(dispatch, now) {
  const lights = dispatch.object.userData.policeLights;

  if (!lights) {
    return;
  }

  const pulse = Math.sin((now / 1000) * POLICE_LIGHT_BLINKS_PER_SECOND * Math.PI * 2 + lights.phaseOffset) > 0;
  lights.redMaterial.emissiveIntensity = pulse ? 3.4 : 0.18;
  lights.blueMaterial.emissiveIntensity = pulse ? 0.18 : 3.4;
  lights.redLight.intensity = pulse ? 2.2 : 0.12;
  lights.blueLight.intensity = pulse ? 0.12 : 2.2;
}

function updateFireTruckLights(dispatch, now) {
  const lights = dispatch.object.userData.fireTruckLights;

  if (!lights) {
    return;
  }

  const pulse = Math.sin((now / 1000) * FIRE_TRUCK_LIGHT_BLINKS_PER_SECOND * Math.PI * 2 + lights.phaseOffset) > 0;
  lights.redMaterial.emissiveIntensity = pulse ? 3.8 : 0.2;
  lights.blueMaterial.emissiveIntensity = pulse ? 0.2 : 2.9;
  lights.redLight.intensity = pulse ? 2.4 : 0.1;
  lights.blueLight.intensity = pulse ? 0.1 : 1.8;
}

function createFireHoseSpray() {
  const positions = new Float32Array(WATER_PARTICLE_COUNT * 3);
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.PointsMaterial({
    color: '#33bfff',
    size: 0.095,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const object = new THREE.Points(geometry, material);
  const particles = [];

  for (let index = 0; index < WATER_PARTICLE_COUNT; index += 1) {
    particles.push(createWaterParticle(Math.random()));
    positions[index * 3] = 0;
    positions[index * 3 + 1] = -100;
    positions[index * 3 + 2] = 0;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  object.name = 'Fire Hose Water Spray';
  object.frustumCulled = false;

  return {
    object,
    geometry,
    material,
    positions,
    particles,
  };
}

function createWaterParticle(progress = 0) {
  return {
    progress,
    speed: randomFloat(1.85, 3.75),
    spread: randomFloat(0.08, 0.42),
    sideA: randomFloat(-1, 1),
    sideB: randomFloat(-1, 1),
    phase: randomFloat(0, Math.PI * 2),
    wobble: randomFloat(0.03, 0.16),
  };
}

function resetWaterParticle(particle) {
  Object.assign(particle, createWaterParticle(0));
}

function updateFireHoseSpray(spray, dispatch, delta) {
  if (!spray || !dispatch.building?.parent) {
    return;
  }

  const { emitter, target } = getFireHoseEndpoints(dispatch);
  const path = new THREE.Vector3().subVectors(target, emitter);
  const distance = path.length();

  if (distance < 0.001) {
    return;
  }

  const forward = path.normalize();
  let right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));

  if (right.lengthSq() < 0.001) {
    right = new THREE.Vector3(1, 0, 0);
  } else {
    right.normalize();
  }

  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  const position = new THREE.Vector3();

  spray.particles.forEach((particle, index) => {
    particle.progress += delta * particle.speed;

    if (particle.progress >= 1) {
      resetWaterParticle(particle);
    }

    const t = THREE.MathUtils.clamp(particle.progress, 0, 1);
    const turbulence = Math.sin(particle.phase + t * Math.PI * 16) * particle.wobble;
    const violentSpread = Math.sin(t * Math.PI) * particle.spread + turbulence;
    const downwardPull = distance * 0.08 * t * t;

    position.lerpVectors(emitter, target, t)
      .addScaledVector(right, particle.sideA * violentSpread)
      .addScaledVector(up, particle.sideB * violentSpread)
      .add(new THREE.Vector3(0, -downwardPull, 0));

    const offset = index * 3;
    spray.positions[offset] = position.x;
    spray.positions[offset + 1] = position.y;
    spray.positions[offset + 2] = position.z;
  });

  spray.geometry.attributes.position.needsUpdate = true;
}

function getFireHoseEndpoints(dispatch) {
  dispatch.object.updateMatrixWorld(true);
  dispatch.building.updateMatrixWorld(true);

  const truckBox = new THREE.Box3().setFromObject(dispatch.object);
  const buildingBox = new THREE.Box3().setFromObject(dispatch.building);
  const truckSize = truckBox.getSize(new THREE.Vector3());
  const buildingSize = buildingBox.getSize(new THREE.Vector3());
  const emitter = truckBox.getCenter(new THREE.Vector3());
  const target = buildingBox.getCenter(new THREE.Vector3());
  const travelDirection = getDirectionVector(dispatch.direction);

  emitter
    .addScaledVector(travelDirection, Math.max(truckSize.x, truckSize.z) * 0.38)
    .setY(truckBox.min.y + truckSize.y * 0.74);
  target.y = buildingBox.min.y + buildingSize.y * 0.72;

  return { emitter, target };
}

function cellToPosition(cell) {
  return new THREE.Vector3(cell.x * ROAD_CELL_SIZE, 0, cell.z * ROAD_CELL_SIZE);
}

function getVehiclePosition(vehicle) {
  if (vehicle?.from && vehicle?.to) {
    return new THREE.Vector3().lerpVectors(
      vehicle.from,
      vehicle.to,
      THREE.MathUtils.clamp(vehicle.progress ?? 0, 0, 1),
    );
  }

  return vehicle.object.position.clone();
}

function hasTrafficPriority(vehicle, otherVehicle) {
  const vehicleEmergencyPriority = getEmergencyPriority(vehicle);
  const otherEmergencyPriority = getEmergencyPriority(otherVehicle);

  if (vehicleEmergencyPriority !== otherEmergencyPriority) {
    return vehicleEmergencyPriority > otherEmergencyPriority;
  }

  return (vehicle.trafficId ?? Infinity) < (otherVehicle.trafficId ?? Infinity);
}

function getEmergencyPriority(vehicle) {
  if (vehicle.object?.userData?.fireDispatch) {
    return 2;
  }

  if (vehicle.object?.userData?.policeDispatch) {
    return 1;
  }

  return 0;
}

function getRoadPieceConnections(object) {
  const name = `${object.userData.assetId ?? ''} ${object.userData.assetName ?? ''}`.toLowerCase();

  if (name.includes('junction')) {
    return rotateConnections(['n', 'e', 's', 'w'], object.rotation.y);
  }

  if (name.includes('tsplit') || name.includes('t split') || name.includes('t-split')) {
    return rotateConnections(['n', 'e', 'w'], object.rotation.y);
  }

  if (name.includes('corner')) {
    return rotateConnections(['n', 'e'], object.rotation.y);
  }

  return rotateConnections(['n', 's'], object.rotation.y);
}

function rotateConnections(connections, radians) {
  const turns = mod(Math.round(radians / (Math.PI / 2)), 4);

  return connections.map((connection) => {
    const index = DIRECTION_IDS.indexOf(connection);
    return DIRECTION_IDS[mod(index + turns, DIRECTION_IDS.length)];
  });
}

function canTravel(fromRoad, toRoad, direction) {
  return fromRoad.connections.includes(direction) && toRoad.connections.includes(OPPOSITE[direction]);
}

function lanePoint(cell, direction) {
  const base = cellToPosition(cell);
  base.y = CAR_Y_OFFSET;
  const directionVector = DIRECTIONS[direction];
  const right = new THREE.Vector3(-directionVector.dz, 0, directionVector.dx).multiplyScalar(LANE_OFFSET);
  return base.add(right);
}

function getNeighborCell(cell, direction) {
  const vector = DIRECTIONS[direction];
  return {
    x: cell.x + vector.dx,
    z: cell.z + vector.dz,
  };
}

function getDirectionVector(direction) {
  const vector = DIRECTIONS[direction] ?? DIRECTIONS.n;
  return new THREE.Vector3(vector.dx, 0, vector.dz).normalize();
}

function getPersonCell(person) {
  if (person?.cell) {
    return person.cell;
  }

  if (person?.object) {
    return positionToCell(person.object.position);
  }

  return null;
}

function isLeavingTown(cell, direction) {
  const nextCell = getNeighborCell(cell, direction);
  return cellDistanceFromCenter(nextCell) > cellDistanceFromCenter(cell);
}

function cellDistanceFromCenter(cell) {
  return Math.abs(cell.x) + Math.abs(cell.z);
}

function getTravelRotation(from, to, asset) {
  const delta = new THREE.Vector3().subVectors(to, from);
  const forwardCorrections = {
    z: 0,
    '-z': Math.PI,
    x: -Math.PI / 2,
    '-x': Math.PI / 2,
  };
  const forwardCorrection = forwardCorrections[asset.trafficForwardAxis] ?? 0;
  return Math.atan2(delta.x, delta.z) + forwardCorrection;
}

function cellKey(cell) {
  return `${cell.x},${cell.z}`;
}

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomFloat(min, max) {
  return min + Math.random() * (max - min);
}
