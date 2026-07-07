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
const INTERACTION_CHECK_INTERVAL = 0.8;
const INTERACTION_START_CHANCE = 0.42;
const INTERACTION_TRIGGER_DISTANCE = 1.28;
const INTERACTION_GAP_MIN = 0.42;
const INTERACTION_GAP_MAX = 0.58;
const INTERACTION_MIN_SECONDS = 2.4;
const INTERACTION_MAX_SECONDS = 4.4;
const INTERACTION_COOLDOWN_MIN = 9;
const INTERACTION_COOLDOWN_MAX = 18;

const FIRST_NAMES_BY_GENDER = {
  female: ['Ada', 'Nina', 'June', 'Lena', 'Iris', 'Mara', 'Sofia', 'Clara', 'Tara', 'Mina', 'Elise', 'Rosa'],
  male: ['Milo', 'Theo', 'Otto', 'Felix', 'Noah', 'Ravi', 'Emil', 'Jonas', 'Arlo', 'Leo', 'Oskar', 'Finn'],
  neutral: ['Alex', 'Riley', 'Sam', 'Robin', 'Casey', 'Morgan', 'Taylor', 'Jamie', 'Quinn', 'Ari', 'Skyler', 'Rowan'],
};
const LAST_NAMES = [
  'Baker',
  'Stone',
  'Rivera',
  'Moss',
  'Chen',
  'Keller',
  'Reed',
  'Park',
  'Hayes',
  'Winter',
  'Singh',
  'Bloom',
  'Fischer',
  'Lane',
  'Voss',
  'Hart',
];
const OCCUPATIONS = [
  'Florist',
  'Baker',
  'Bike Courier',
  'Teacher',
  'Architect',
  'Cafe Owner',
  'Paramedic',
  'Librarian',
  'Street Musician',
  'Gardener',
  'Software Tester',
  'Bus Driver',
  'Tailor',
  'Bookbinder',
  'Market Vendor',
  'Urban Planner',
];
const WANTED_REASONS = [
  'Tax fraud',
  'Goose theft',
  'Soup crimes',
  'Duck dodging',
  'Pie theft',
  'Bad vibes',
  'Bell theft',
  'Cow tipping',
  'Sock fraud',
  'Muffin bribe',
  'Bread crimes',
  'Loud sneezing',
  'Fake coupons',
  'Hat theft',
  'Illegal naps',
  'Fish yelling',
  'Horse parking',
  'Cursed tea',
  'Pigeon deals',
  'Snack loitering',
  'Barrel crimes',
  'Kazoo noise',
  'Wagon racing',
  'Soup smuggling',
  'Jam fraud',
  'Apple theft',
  'Duck bribery',
  'Cheese hoarding',
  'Fence hopping',
  'Suspicious shoes',
];
const MOOD_METERS = [
  '😟',
  '😐 😐',
  '🙂 🙂 🙂',
  '😄 😄 😄 😄',
  '🤩 🤩 🤩 🤩 🤩',
];

const DIRECTIONS = {
  n: { id: 'n', dx: 0, dz: -1 },
  e: { id: 'e', dx: 1, dz: 0 },
  s: { id: 's', dx: 0, dz: 1 },
  w: { id: 'w', dx: -1, dz: 0 },
};

const DIRECTION_IDS = Object.keys(DIRECTIONS);
const OPPOSITE = { n: 's', e: 'w', s: 'n', w: 'e' };
const WANTED_CHANCE = 0.18;

export class PedestrianController {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.personAssets = [];
    this.roadMap = new Map();
    this.people = [];
    this.density = DEFAULT_PEDESTRIAN_DENSITY;
    this.needsRoadSync = true;
    this.placed = [];
    this.nextPersonId = 1;
    this.interactionCheckElapsed = 0;

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
    this.nextPersonId = 1;
    this.interactionCheckElapsed = 0;
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

    this.interactionCheckElapsed += delta;

    if (this.interactionCheckElapsed >= INTERACTION_CHECK_INTERVAL) {
      this.interactionCheckElapsed = 0;
      this.maybeStartInteraction();
    }

    for (let index = this.people.length - 1; index >= 0; index -= 1) {
      const person = this.people[index];
      person.animator?.update(delta);

      if (this.updatePersonInteraction(person, delta)) {
        continue;
      }

      person.interactionCooldown = Math.max((person.interactionCooldown ?? 0) - delta, 0);

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
    const animator = createPersonAnimator(object, asset);
    const identity = createResidentIdentity(this.nextPersonId, asset.personGender);

    object.userData.pedestrian = true;
    object.userData.pedestrianId = this.nextPersonId;
    object.userData.residentName = identity.name;
    object.userData.residentGender = identity.gender;
    object.userData.residentOccupation = identity.occupation;
    object.userData.residentAge = identity.age;
    object.userData.residentMood = identity.moodMeter;
    object.userData.residentWanted = identity.wanted;
    object.userData.residentWantedReason = identity.wantedReason;
    object.position.lerpVectors(from, to, progress);
    object.rotation.y = getTravelRotation(from, to, asset);
    this.sceneManager.add(object);

    this.people.push({
      id: this.nextPersonId,
      object,
      asset,
      identity,
      animator,
      cell: spawn.cell,
      nextCell,
      direction: spawn.direction,
      side: spawn.side,
      from,
      to,
      progress,
      speed: 0.38 + Math.random() * 0.24,
      idleTime: 0,
      interaction: null,
      interactionCooldown: randomFloat(3, INTERACTION_COOLDOWN_MAX),
    });
    this.nextPersonId += 1;

    return true;
  }

  maybeStartInteraction() {
    if (Math.random() > INTERACTION_START_CHANCE * this.density) {
      return;
    }

    const candidates = shuffle(this.people.filter((person) => this.canStartInteraction(person)));

    for (const person of candidates) {
      const partner = this.findInteractionPartner(person);

      if (partner) {
        this.startInteraction(person, partner);
        return;
      }
    }
  }

  canStartInteraction(person) {
    return !person.interaction
      && (person.interactionCooldown ?? 0) <= 0
      && Boolean(person.animator?.actions.wave);
  }

  findInteractionPartner(person) {
    let nearest = null;
    let nearestDistance = Infinity;

    this.people.forEach((candidate) => {
      if (candidate === person || !this.canStartInteraction(candidate)) {
        return;
      }

      const distance = person.object.position.distanceTo(candidate.object.position);

      if (distance < nearestDistance && distance <= INTERACTION_TRIGGER_DISTANCE) {
        nearest = candidate;
        nearestDistance = distance;
      }
    });

    return nearest;
  }

  startInteraction(first, second) {
    const firstPosition = first.object.position.clone();
    const secondPosition = second.object.position.clone();
    const center = firstPosition.clone().add(secondPosition).multiplyScalar(0.5);
    const facing = secondPosition.clone().sub(firstPosition).setY(0);

    if (facing.lengthSq() < 0.001) {
      facing.subVectors(first.to, first.from).setY(0);
    }

    if (facing.lengthSq() < 0.001) {
      const angle = Math.random() * Math.PI * 2;
      facing.set(Math.sin(angle), 0, Math.cos(angle));
    }

    facing.normalize();

    const halfGap = randomFloat(INTERACTION_GAP_MIN, INTERACTION_GAP_MAX);
    first.object.position.copy(center).addScaledVector(facing, -halfGap);
    second.object.position.copy(center).addScaledVector(facing, halfGap);
    first.object.rotation.y = getFacingRotation(first.object.position, second.object.position, first.asset);
    second.object.rotation.y = getFacingRotation(second.object.position, first.object.position, second.asset);

    const duration = randomFloat(INTERACTION_MIN_SECONDS, INTERACTION_MAX_SECONDS);
    first.interaction = { partnerId: second.id, remaining: duration };
    second.interaction = { partnerId: first.id, remaining: duration };
    playPersonAnimation(first, 'wave');
    playPersonAnimation(second, 'wave');
  }

  updatePersonInteraction(person, delta) {
    if (!person.interaction) {
      return false;
    }

    person.interaction.remaining -= delta;

    const partner = this.people.find((candidate) => candidate.id === person.interaction.partnerId);

    if (!partner?.interaction || person.interaction.remaining <= 0) {
      this.endInteraction(person, partner);
    }

    return true;
  }

  endInteraction(first, second) {
    [first, second].forEach((person) => {
      if (!person?.interaction) {
        return;
      }

      person.interaction = null;
      person.interactionCooldown = randomFloat(INTERACTION_COOLDOWN_MIN, INTERACTION_COOLDOWN_MAX);
      playPersonAnimation(person, 'walk');
    });
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

  detainPerson(person) {
    const index = this.people.indexOf(person);

    if (index === -1) {
      return false;
    }

    person.identity.detained = true;
    this.removePerson(index);
    return true;
  }

  getPickableObjects() {
    return this.people.map((person) => person.object);
  }

  getPersonFromObject(object) {
    const root = findPedestrianRoot(object);
    return root ? this.people.find((person) => person.object === root) ?? null : null;
  }

  hasPerson(person) {
    return this.people.includes(person);
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

function createPersonAnimator(object, asset) {
  const walkClip = findAnimationClip(asset.animations, 'walk');
  const waveClip = findAnimationClip(asset.animations, 'wave');
  const idleClip = findIdleClip(asset.animations);

  if (!walkClip && !waveClip && !idleClip) {
    return null;
  }

  const mixer = new THREE.AnimationMixer(object);
  const actions = {};

  if (walkClip) {
    actions.walk = mixer.clipAction(walkClip);
    actions.walk.timeScale = 0.68 + Math.random() * 0.22;
    actions.walk.setLoop(THREE.LoopRepeat, Infinity);
  }

  if (waveClip) {
    actions.wave = mixer.clipAction(waveClip);
    actions.wave.timeScale = 0.86 + Math.random() * 0.18;
    actions.wave.setLoop(THREE.LoopRepeat, Infinity);
  }

  if (idleClip) {
    actions.idle = mixer.clipAction(idleClip);
    actions.idle.setLoop(THREE.LoopRepeat, Infinity);
  }

  const animator = {
    mixer,
    actions,
    currentAction: null,
    update(delta) {
      mixer.update(delta);
    },
    play(name) {
      const action = actions[name] ?? actions.walk ?? actions.idle ?? actions.wave;

      if (!action || action === this.currentAction) {
        return;
      }

      action.reset();
      action.enabled = true;
      action.fadeIn(0.18);
      action.play();

      if (this.currentAction) {
        this.currentAction.fadeOut(0.18);
      }

      this.currentAction = action;
    },
  };

  animator.play('walk');

  if (actions.walk) {
    actions.walk.time = Math.random() * walkClip.duration;
  }

  return animator;
}

function findAnimationClip(animations = [], keyword) {
  return animations.find((clip) => clip.name.toLowerCase().includes(keyword)) ?? null;
}

function findIdleClip(animations = []) {
  return animations.find((clip) => /(^|[|_])idle($|[|_])/i.test(clip.name)) ?? findAnimationClip(animations, 'idle');
}

function playPersonAnimation(person, name) {
  person.animator?.play(name);
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

function getFacingRotation(from, to, asset) {
  return getTravelRotation(from, to, asset);
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

function createResidentIdentity(id, gender = 'neutral') {
  const wanted = Math.random() < WANTED_CHANCE;
  const normalizedGender = Object.hasOwn(FIRST_NAMES_BY_GENDER, gender) ? gender : 'neutral';

  return {
    id,
    gender: normalizedGender,
    name: `${randomItem(FIRST_NAMES_BY_GENDER[normalizedGender])} ${randomItem(LAST_NAMES)}`,
    occupation: randomItem(OCCUPATIONS),
    age: randomInt(18, 65),
    moodMeter: randomItem(MOOD_METERS),
    wanted,
    wantedReason: wanted ? randomItem(WANTED_REASONS) : '',
    policeCalled: false,
    detained: false,
  };
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return min + Math.random() * (max - min);
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }

  return items;
}

function findPedestrianRoot(object) {
  let current = object;

  while (current.parent && !current.userData.pedestrian) {
    current = current.parent;
  }

  return current.userData.pedestrian ? current : null;
}
