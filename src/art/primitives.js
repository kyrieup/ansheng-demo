import * as THREE from 'three';

export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const CYL = new THREE.CylinderGeometry(0.014, 0.02, 1, 5);
export const HEAD = new THREE.SphereGeometry(0.028, 6, 5);

function mesh(geo, mat, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (sz == null) m.scale.setScalar(sx);
  else m.scale.set(sx, sy, sz);
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

function tag(g, extras) {
  Object.assign(g.userData, extras);
  return g;
}

export function makeSparrow(mats) {
  const g = new THREE.Group();
  g.add(mesh(BOX, mats.sparrow, 0, 0.02, 0, 0.05, 0.028, 0.028));
  g.add(mesh(BOX, mats.sparrow, 0.018, 0.034, 0, 0.022, 0.018, 0.018));
  const wing = mesh(BOX, mats.sparrow, 0, 0.024, 0, 0.07, 0.008, 0.012);
  wing.rotation.y = 0.5;
  g.add(wing);
  return tag(g, { kind: 'bird', species: 'sparrow', name_zh: '雀' });
}

export function makeDuck(mats) {
  const g = new THREE.Group();
  g.add(mesh(BOX, mats.duck, 0, 0.03, 0, 0.09, 0.04, 0.05));
  g.add(mesh(BOX, mats.duck, 0.04, 0.05, 0, 0.035, 0.03, 0.03));
  g.add(mesh(BOX, mats.bill, 0.058, 0.048, 0, 0.02, 0.012, 0.012));
  return tag(g, { kind: 'bird', species: 'duck', name_zh: '鸭' });
}

export function makeSandpiper(mats) {
  const g = new THREE.Group();
  g.add(mesh(CYL, mats.sandpiper, -0.01, 0.03, 0.008, 0.006, 0.06, 0.006));
  g.add(mesh(CYL, mats.sandpiper, 0.01, 0.03, -0.006, 0.006, 0.06, 0.006));
  g.add(mesh(BOX, mats.sandpiper, 0, 0.075, 0, 0.055, 0.028, 0.024));
  g.add(mesh(BOX, mats.sandpiper, 0.028, 0.082, 0, 0.03, 0.016, 0.016));
  g.add(mesh(BOX, mats.bill, 0.048, 0.08, 0, 0.022, 0.008, 0.008));
  return tag(g, { kind: 'bird', species: 'sandpiper', name_zh: '鹬' });
}

export function makeHeron(mats) {
  const g = new THREE.Group();
  g.add(mesh(CYL, mats.heron, -0.012, 0.08, 0.006, 0.007, 0.16, 0.007));
  g.add(mesh(CYL, mats.heron, 0.012, 0.08, -0.004, 0.007, 0.16, 0.007));
  g.add(mesh(BOX, mats.heron, 0, 0.18, 0, 0.045, 0.07, 0.03));
  const neck = mesh(BOX, mats.heron, 0.02, 0.26, 0, 0.014, 0.12, 0.014);
  neck.rotation.z = -0.35;
  g.add(neck);
  g.add(mesh(BOX, mats.heron, 0.055, 0.31, 0, 0.028, 0.02, 0.02));
  g.add(mesh(BOX, mats.bill, 0.078, 0.308, 0, 0.028, 0.01, 0.01));
  return tag(g, { kind: 'bird', species: 'heron', name_zh: '鹭' });
}

export function makeDragonfly(mats) {
  const g = new THREE.Group();
  const a = mesh(BOX, mats.dragonfly, 0, 0, 0, 0.11, 0.006, 0.016);
  const b = mesh(BOX, mats.dragonfly, 0, 0, 0, 0.11, 0.006, 0.016);
  a.rotation.y = 0.7;
  b.rotation.y = -0.7;
  g.add(a, b);
  g.userData.flapWings = [];
  return tag(g, { kind: 'dragonfly', species: 'dragonfly', name_zh: '蜻蜓' });
}

export function makeReedCluster(mats, density = 'lush') {
  const g = new THREE.Group();
  const n = density === 'lush' ? 3 : density === 'sparse' ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const h = 0.32 + i * 0.1;
    const ox = (i - (n - 1) * 0.5) * 0.045;
    const oz = (i % 2) * 0.03;
    const stem = mesh(CYL, mats.reedStem, ox, h * 0.5, oz, 1, h, 1);
    const head = mesh(HEAD, mats.reedHead, ox, h + 0.01, oz, 1);
    g.add(stem, head);
  }
  return tag(g, { kind: 'reed', species: 'reed', name_zh: '芦苇', density });
}

export function createReedInstances(mats, max) {
  const stems = new THREE.InstancedMesh(CYL, mats.reedStem, max);
  const heads = new THREE.InstancedMesh(HEAD, mats.reedHead, max);
  stems.frustumCulled = false;
  heads.frustumCulled = false;
  stems.count = 0;
  heads.count = 0;
  stems.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return { stems, heads };
}
