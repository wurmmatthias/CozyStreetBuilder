import * as THREE from 'three';
import { makePlaceableClone } from './assetUtils.js';

const ROAD_CELL_SIZE = 2;
const MIN_ROAD_TILES = 6;
const MAX_CARS = 14;
const LANE_OFFSET = 0.34;
const SPAWN_INTERVAL = 1.15;
const DESPAWN_AFTER_IDLE = 0.2;

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
    this.roadMap = new Map();
    this.cars = [];
    this.spawnTimer = 0;
    this.needsRoadSync = true;
    this.placed = [];

    this.update = this.update.bind(this);
    this.sceneManager.addUpdater(this.update);
  }

  setAssets(assets) {
    this.carAssets = assets.filter((asset) => asset.kind === 'car');
    this.reset();
  }

  syncRoads(placed) {
    this.placed = placed;
    this.needsRoadSync = true;
  }

  reset() {
    this.cars.forEach((car) => this.sceneManager.remove(car.object));
    this.cars = [];
    this.spawnTimer = 0;
  }

  update(delta) {
    if (this.needsRoadSync) {
      this.rebuildRoadMap();
      this.needsRoadSync = false;
    }

    if (this.roadMap.size < MIN_ROAD_TILES || this.carAssets.length === 0) {
      this.reset();
      return;
    }

    this.spawnTimer -= delta;

    if (this.spawnTimer <= 0 && this.cars.length < MAX_CARS) {
      this.spawnCar();
      this.spawnTimer = SPAWN_INTERVAL + Math.random() * 0.75;
    }

    for (let index = this.cars.length - 1; index >= 0; index -= 1) {
      const car = this.cars[index];

      if (!this.advanceCar(car, delta)) {
        this.removeCar(index);
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

    object.userData.trafficCar = true;
    object.position.lerpVectors(from, to, spawnProgress);
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
    });
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

    while (remainingTravel > 0) {
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

  removeCar(index) {
    const [car] = this.cars.splice(index, 1);
    this.sceneManager.remove(car.object);
  }
}

function positionToCell(position) {
  return {
    x: Math.round(position.x / ROAD_CELL_SIZE),
    z: Math.round(position.z / ROAD_CELL_SIZE),
  };
}

function cellToPosition(cell) {
  return new THREE.Vector3(cell.x * ROAD_CELL_SIZE, 0, cell.z * ROAD_CELL_SIZE);
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

function getTravelRotation(from, to, asset) {
  const delta = new THREE.Vector3().subVectors(to, from);
  const forwardCorrection = asset.trafficForwardAxis === '-z' ? Math.PI : 0;
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
