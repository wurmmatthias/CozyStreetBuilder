import * as THREE from 'three';
import { makePlaceableClone } from './assetUtils.js';

const ROAD_CELL_SIZE = 2;
const MIN_ROAD_TILES = 6;
const MIN_PEDESTRIANS = 18;
const MAX_PEDESTRIANS = 84;
const DEFAULT_PEDESTRIAN_DENSITY = 1;
const SIDEWALK_OFFSET = 0.82;
const PEDESTRIAN_Y_OFFSET = 0.03;
const DESPAWN_AFTER_IDLE = 0.35;
const MAX_SPAWNS_PER_FRAME = 8;

const DIRECTIONS = {
  n: { id: 'n', dx: 0, dz: -1 },
  e: { id: 'e', dx: 1, dz: 0 },
  s: { id: 's', dx: 0, dz: 1 },
  w: { id: 'w', dx: -1, dz: 0 },
};

const DIRECTION_IDS = Object.keys(DIRECTIONS);
const OPPOSITE = { n: 's', e: 'w', s: 'n', w: 'e' };

export class PedestrianController {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.personAssets = [];
    this.roadMap = new Map();
    this.people = [];
    this.density = DEFAULT_PEDESTRIAN_DENSITY;
    this.needsRoadSync = true;
    this.placed = [];

    this.update = this.update.bind(this);
    this.sceneManager.addUpdater(this.update);
  }

  setAssets(assets) {
    this.personAssets = assets.filter((asset) => asset.kind === 'person');
    this.reset();
  }

  syncRoads(placed) {
    this.placed = placed;
    this.needsRoadSync = true;
  }

  setDensity(density) {
    this.density = THREE.MathUtils.clamp(density, 0, 1);
    this.trimPeopleToDensity();
  }

  reset() {
    this.people.forEach((person) => this.sceneManager.remove(person.object));
    this.people = [];
  }

  update(delta) {
    if (this.needsRoadSync) {
      this.rebuildRoadMap();
      this.needsRoadSync = false;
      this.trimPeopleToDensity();
    }

    if (this.roadMap.size < MIN_ROAD_TILES || this.personAssets.length === 0 || this.density === 0) {
      this.reset();
      return;
    }

    const targetCount = this.getTargetCount();
    let spawnedThisFrame = 0;

    while (this.people.length < targetCount && spawnedThisFrame < MAX_SPAWNS_PER_FRAME) {
      if (!this.spawnPerson()) {
        break;
      }

      spawnedThisFrame += 1;
    }

    for (let index = this.people.length - 1; index >= 0; index -= 1) {
      const person = this.people[index];
      person.mixer?.update(delta);

      if (!this.advancePerson(person, delta)) {
        this.removePerson(index);
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

  spawnPerson() {
    const spawnOptions = this.getSpawnOptions();

    if (spawnOptions.length === 0) {
      return false;
    }

    const spawn = randomItem(spawnOptions);
    const asset = randomItem(this.personAssets);
    const object = makePlaceableClone(asset.source, asset);
    const nextCell = getNeighborCell(spawn.cell, spawn.direction);
    const from = sidewalkPoint(spawn.cell, spawn.direction, spawn.side);
    const to = sidewalkPoint(nextCell, spawn.direction, spawn.side);
    const progress = Math.random();
    const mixer = createWalkMixer(object, asset);

    object.userData.pedestrian = true;
    object.position.lerpVectors(from, to, progress);
    object.rotation.y = getTravelRotation(from, to, asset);
    this.sceneManager.add(object);

    this.people.push({
      object,
      asset,
      mixer,
      cell: spawn.cell,
      nextCell,
      direction: spawn.direction,
      side: spawn.side,
      from,
      to,
      progress,
      speed: 0.38 + Math.random() * 0.24,
      idleTime: 0,
    });

    return true;
  }

  getSpawnOptions() {
    const options = [];

    this.roadMap.forEach((road) => {
      this.getConnections(road).forEach((direction) => {
        options.push({ cell: road, direction, side: -1 });
        options.push({ cell: road, direction, side: 1 });
      });
    });

    return options;
  }

  advancePerson(person, delta) {
    let remainingTravel = person.speed * delta;

    while (remainingTravel > 0) {
      const currentRoad = this.roadMap.get(cellKey(person.cell));
      const nextRoad = this.roadMap.get(cellKey(person.nextCell));

      if (!currentRoad || !nextRoad || !canTravel(currentRoad, nextRoad, person.direction)) {
        person.idleTime += delta;
        return person.idleTime < DESPAWN_AFTER_IDLE;
      }

      const segmentLength = Math.max(person.from.distanceTo(person.to), 0.001);
      const segmentRemaining = (1 - person.progress) * segmentLength;

      if (remainingTravel < segmentRemaining) {
        person.progress += remainingTravel / segmentLength;
        remainingTravel = 0;
        break;
      }

      remainingTravel -= segmentRemaining;
      person.cell = nextRoad;

      const nextDirection = this.chooseNextDirection(nextRoad, person.direction);

      if (!nextDirection) {
        return false;
      }

      person.direction = nextDirection;
      person.nextCell = getNeighborCell(nextRoad, person.direction);
      person.from = person.to.clone();
      person.to = sidewalkPoint(person.nextCell, person.direction, person.side);
      person.progress = 0;
    }

    person.object.position.lerpVectors(person.from, person.to, THREE.MathUtils.clamp(person.progress, 0, 1));
    person.object.rotation.y = getTravelRotation(person.from, person.to, person.asset);
    person.idleTime = 0;
    return true;
  }

  chooseNextDirection(road, currentDirection) {
    const connections = this.getConnections(road);
    const forward = connections.includes(currentDirection) ? currentDirection : null;
    const choices = connections.filter((direction) => direction !== OPPOSITE[currentDirection]);

    if (forward && Math.random() < 0.64) {
      return forward;
    }

    if (choices.length > 0) {
      return randomItem(choices);
    }

    return connections.includes(OPPOSITE[currentDirection]) ? OPPOSITE[currentDirection] : null;
  }

  getConnections(road) {
    return road.connections.filter((direction) => {
      const neighbor = this.roadMap.get(cellKey(getNeighborCell(road, direction)));
      return neighbor && canTravel(road, neighbor, direction);
    });
  }

  removePerson(index) {
    const [person] = this.people.splice(index, 1);
    this.sceneManager.remove(person.object);
  }

  trimPeopleToDensity() {
    const targetCount = this.getTargetCount();

    while (this.people.length > targetCount) {
      this.removePerson(this.people.length - 1);
    }
  }

  getTargetCount() {
    if (this.density === 0 || this.roadMap.size < MIN_ROAD_TILES) {
      return 0;
    }

    const roadScaledCount = Math.round(this.roadMap.size * THREE.MathUtils.lerp(0.45, 1.15, this.density));
    return THREE.MathUtils.clamp(roadScaledCount, MIN_PEDESTRIANS, MAX_PEDESTRIANS);
  }
}

function createWalkMixer(object, asset) {
  const walkClip = asset.animations?.find((clip) => clip.name.toLowerCase().includes('walk'));

  if (!walkClip) {
    return null;
  }

  const mixer = new THREE.AnimationMixer(object);
  const action = mixer.clipAction(walkClip);
  action.timeScale = 0.68 + Math.random() * 0.22;
  action.play();
  action.time = Math.random() * walkClip.duration;
  return mixer;
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

function sidewalkPoint(cell, direction, side) {
  const base = cellToPosition(cell);
  base.y = PEDESTRIAN_Y_OFFSET;
  const directionVector = DIRECTIONS[direction];
  const right = new THREE.Vector3(-directionVector.dz, 0, directionVector.dx).multiplyScalar(SIDEWALK_OFFSET * side);
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
  const forwardCorrection = asset.personForwardAxis === '-z' ? Math.PI : 0;
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
