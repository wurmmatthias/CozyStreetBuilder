import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

export function makePlaceableClone(source, asset) {
  source.updateMatrixWorld(true);
  new THREE.Box3().setFromObject(source);
  const model = cloneSkeleton(source);
  model.traverse((child) => {
    child.castShadow = true;
    child.receiveShadow = true;

    if (child.material) {
      child.material = child.material.clone();
    }
  });

  model.scale.multiplyScalar(asset.scale ?? 1);
  normalizeToGround(model);

  const placeable = new THREE.Group();
  placeable.name = asset.name;
  placeable.add(model);
  placeable.userData.assetId = asset.id;
  placeable.userData.assetName = asset.name;
  placeable.userData.assetKind = asset.kind ?? 'asset';
  placeable.userData.buildingRole = asset.buildingRole ?? null;
  placeable.userData.housingCapacity = asset.housingCapacity ?? 0;
  placeable.userData.employmentCapacity = asset.employmentCapacity ?? 0;
  placeable.userData.shoppingCapacity = asset.shoppingCapacity ?? 0;
  placeable.userData.recreationCapacity = asset.recreationCapacity ?? 0;
  placeable.userData.serviceCapacity = asset.serviceCapacity ?? 0;
  placeable.userData.assetScale = asset.scale ?? 1;
  placeable.userData.rotationStep = asset.rotationStep ?? 90;
  return placeable;
}

export function setGhostMaterial(object) {
  object.traverse((child) => {
    if (!child.isMesh || !child.material) {
      return;
    }

    child.material = child.material.clone();
    child.material.transparent = true;
    child.material.opacity = 0.46;
    child.material.depthWrite = false;
    child.material.color = new THREE.Color('#f7d878');
  });
}

export function setSelectedTint(object, selected) {
  object.traverse((child) => {
    if (!child.isMesh || !child.material) {
      return;
    }

    if (!child.userData.baseEmissive && child.material.emissive) {
      child.userData.baseEmissive = child.material.emissive.clone();
    }

    if (child.material.emissive) {
      child.material.emissive.copy(selected ? new THREE.Color('#4c9f70') : child.userData.baseEmissive ?? new THREE.Color('#000000'));
      child.material.emissiveIntensity = selected ? 0.18 : 0;
    }
  });
}

export function snapToGrid(point, gridSize) {
  return new THREE.Vector3(
    Math.round(point.x / gridSize) * gridSize,
    0,
    Math.round(point.z / gridSize) * gridSize,
  );
}

export function degreesFromRadians(radians) {
  const degrees = THREE.MathUtils.radToDeg(radians) % 360;
  return Math.round((degrees + 360) % 360);
}

function normalizeToGround(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const minY = box.min.y;
  object.position.x -= center.x;
  object.position.y -= minY;
  object.position.z -= center.z;
}
