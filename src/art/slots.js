import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ART_PATHS } from '../config/look.js';

const FLAP = ['wing_l1', 'wing_l2', 'wing_r1', 'wing_r2'];

export const ART_SLOT_GLBS = [
  'sparrow',
  'sandpiper',
  'duck',
  'heron',
  'dragonfly',
  'reed',
  'reed-dense',
  'reed-sparse',
  'dish',
];

export const FAUNA_FILES = Object.fromEntries(
  ['sparrow', 'sandpiper', 'duck', 'heron', 'dragonfly'].map((n) => [n, `${n}.glb`])
);

const gltf = Object.fromEntries(ART_SLOT_GLBS.map((n) => [n, null]));
const loader = new GLTFLoader();

async function loadGltf(url) {
  try {
    const asset = await loader.loadAsync(url);
    return asset.scene;
  } catch (err) {
    console.error(`[art] failed to load required ${url}`, err);
    throw err;
  }
}

function isWingNode(obj) {
  const n = (obj.name || '').toLowerCase();
  return n.startsWith('wing_') || n.includes('wing');
}

function eachMaterial(obj, fn) {
  if (!obj.material) return;
  const list = Array.isArray(obj.material) ? obj.material : [obj.material];
  for (const mat of list) {
    if (mat) fn(mat);
  }
}

/** Keep glTF Standard (metal 0 / rough 0.88). Never convert to Basic. Never extra-scale. */
function prepareArtRoot(root, role) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    eachMaterial(obj, (mat) => {
      mat.toneMapped = true;
      if ('metalness' in mat && (mat.metalness == null || mat.metalness > 0.2)) mat.metalness = 0;
    });
    if (role === 'dish') {
      const n = (obj.name || '').toLowerCase();
      obj.receiveShadow = true;
      obj.castShadow = n === 'lip' || n.includes('lip');
      return;
    }
    if (role === 'dragonfly') {
      // Translucent wings must receive light, stay small, and must not shadow as a black cross.
      obj.castShadow = false;
      obj.receiveShadow = !isWingNode(obj);
      if (isWingNode(obj)) {
        eachMaterial(obj, (mat) => {
          mat.transparent = true;
          mat.depthWrite = false;
          mat.side = THREE.DoubleSide;
          if (mat.opacity >= 0.95) mat.opacity = 0.55;
          if ('roughness' in mat) mat.roughness = Math.min(mat.roughness ?? 0.88, 0.72);
        });
      }
      return;
    }
    if (role === 'reed') {
      obj.castShadow = true;
      obj.receiveShadow = true;
      return;
    }
    obj.castShadow = true;
    obj.receiveShadow = true;
  });
}

function cloneArt(src, extras, role) {
  const g = src.clone(true);
  g.scale.set(1, 1, 1);
  g.position.set(0, 0, 0);
  g.rotation.set(0, 0, 0);
  Object.assign(g.userData, extras);
  if (role) prepareArtRoot(g, role);
  return g;
}

function requireArt(name) {
  const src = gltf[name];
  if (!src) {
    const err = new Error(`[art] required glTF not loaded: /art/${name}.glb`);
    console.error(err.message);
    throw err;
  }
  return src;
}

function tagDragonfly(root) {
  const wings = [];
  for (const name of FLAP) {
    const node = root.getObjectByName(name);
    if (node) wings.push(node);
  }
  root.userData.flapWings = wings;
  return root;
}

export async function loadSlots() {
  await Promise.all(
    ART_SLOT_GLBS.map(async (key) => {
      const url = key === 'dish' ? ART_PATHS.dish : `/art/${key}.glb`;
      gltf[key] = await loadGltf(url);
      const role = key === 'dish' ? 'dish' : key === 'dragonfly' ? 'dragonfly' : key.startsWith('reed') ? 'reed' : 'bird';
      prepareArtRoot(gltf[key], role);
    })
  );
  return gltf;
}

export function setMats(_palette) {}

export function hasGltf(name) {
  return !!gltf[name];
}

export function reedTemplate(density) {
  if (density === 'lush') return requireArt('reed-dense');
  if (density === 'sparse') return requireArt('reed-sparse');
  return requireArt('reed');
}

function fauna(species, kind, name_zh) {
  const role = species === 'dragonfly' ? 'dragonfly' : 'bird';
  const g = cloneArt(requireArt(species), { kind, species, name_zh }, role);
  if (species === 'dragonfly') tagDragonfly(g);
  return g;
}

export function makeSparrow() {
  return fauna('sparrow', 'bird', '雀');
}

export function makeSandpiper() {
  return fauna('sandpiper', 'bird', '鹬');
}

export function makeDuck() {
  return fauna('duck', 'bird', '鸭');
}

export function makeHeron() {
  return fauna('heron', 'bird', '鹭');
}

export function makeDragonfly() {
  return fauna('dragonfly', 'dragonfly', '蜻蜓');
}

export function makeReedCluster(density = 'lush') {
  const src = reedTemplate(density);
  return cloneArt(src, { kind: 'reed', species: 'reed', name_zh: '芦苇', density }, 'reed');
}

export function makeDish() {
  return cloneArt(requireArt('dish'), { kind: 'dish', name_zh: '托盘' }, 'dish');
}

export function makeBird(species) {
  if (species === 'duck') return makeDuck();
  if (species === 'sandpiper') return makeSandpiper();
  if (species === 'heron') return makeHeron();
  if (species === 'dragonfly') return makeDragonfly();
  return makeSparrow();
}

export { gltf };
