import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as primitives from './primitives.js';

const FLAP = ['wing_l1', 'wing_l2', 'wing_r1', 'wing_r2'];
const FAUNA_FILES = {
  sparrow: 'sparrow.glb',
  sandpiper: 'sandpiper.glb',
  duck: 'duck.glb',
  heron: 'heron.glb',
  dragonfly: 'dragonfly.glb',
};

let mats = null;
const gltf = {
  sparrow: null,
  sandpiper: null,
  duck: null,
  heron: null,
  dragonfly: null,
  'reed-dense': null,
  'reed-sparse': null,
  reed: null,
};

const loader = new GLTFLoader();

async function tryGltf(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('text/html')) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 12) return null;
    const magic = new TextDecoder().decode(new Uint8Array(buf.slice(0, 4)));
    if (magic !== 'glTF') return null;
    return await new Promise((resolve, reject) => {
      loader.parse(
        buf,
        '/art/',
        (g) => resolve(g.scene),
        reject
      );
    });
  } catch (_) {
    return null;
  }
}

function cloneArt(src, extras) {
  const g = src.clone(true);
  g.scale.set(1, 1, 1);
  g.position.set(0, 0, 0);
  g.rotation.set(0, 0, 0);
  Object.assign(g.userData, extras);
  return g;
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

export async function loadSlots(palette) {
  mats = palette;
  const files = {
    sparrow: '/art/sparrow.glb',
    sandpiper: '/art/sandpiper.glb',
    duck: '/art/duck.glb',
    heron: '/art/heron.glb',
    dragonfly: '/art/dragonfly.glb',
    'reed-dense': '/art/reed-dense.glb',
    'reed-sparse': '/art/reed-sparse.glb',
    reed: '/art/reed.glb',
  };
  await Promise.all(
    Object.entries(files).map(async ([key, url]) => {
      gltf[key] = await tryGltf(url);
    })
  );
  return gltf;
}

export function setMats(palette) {
  mats = palette;
}

export function hasGltf(name) {
  return !!gltf[name];
}

export function reedTemplate(density) {
  if (density === 'lush' && gltf['reed-dense']) return gltf['reed-dense'];
  if (density === 'sparse' && gltf['reed-sparse']) return gltf['reed-sparse'];
  if (gltf.reed) return gltf.reed;
  return null;
}

export function hasReedGltf(density) {
  return !!reedTemplate(density);
}

function fauna(species, kind, name_zh, fallback) {
  const src = gltf[species];
  const extras = { kind, species, name_zh };
  if (src) {
    const g = cloneArt(src, extras);
    if (species === 'dragonfly') tagDragonfly(g);
    return g;
  }
  return fallback();
}

export function makeSparrow() {
  return fauna('sparrow', 'bird', '雀', () => primitives.makeSparrow(mats));
}

export function makeSandpiper() {
  return fauna('sandpiper', 'bird', '鹬', () => primitives.makeSandpiper(mats));
}

export function makeDuck() {
  return fauna('duck', 'bird', '鸭', () => primitives.makeDuck(mats));
}

export function makeHeron() {
  return fauna('heron', 'bird', '鹭', () => primitives.makeHeron(mats));
}

export function makeDragonfly() {
  return fauna('dragonfly', 'dragonfly', '蜻蜓', () => primitives.makeDragonfly(mats));
}

export function makeReedCluster(density = 'lush') {
  const src = reedTemplate(density);
  const extras = { kind: 'reed', species: 'reed', name_zh: '芦苇', density };
  if (src) return cloneArt(src, extras);
  return primitives.makeReedCluster(mats, density);
}

export function makeBird(species) {
  if (species === 'duck') return makeDuck();
  if (species === 'sandpiper') return makeSandpiper();
  if (species === 'heron') return makeHeron();
  if (species === 'dragonfly') return makeDragonfly();
  return makeSparrow();
}

export { FAUNA_FILES, gltf };
