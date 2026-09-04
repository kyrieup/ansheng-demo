import * as THREE from 'three';
import { tideToWaterY } from '../world.js';

const MIRROR_OPACITY = 0.32;

function ghostMaterials(root, bag) {
  root.traverse((obj) => {
    if (!obj.material) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = list.map((mat) => {
      const cm = mat.clone();
      cm.transparent = true;
      cm.opacity = MIRROR_OPACITY;
      cm.depthWrite = false;
      bag.push(cm);
      return cm;
    });
    obj.material = Array.isArray(obj.material) ? next : next[0];
    obj.castShadow = false;
  });
}

export function createMirrors(scene) {
  const group = new THREE.Group();
  group.name = 'mirrors';
  scene.add(group);
  return {
    group,
    mats: [],
    ducks: [],
    stems: null,
    heads: null,
    reedClones: [],
  };
}

function clearMirrors(m) {
  while (m.group.children.length) {
    m.group.remove(m.group.children[0]);
  }
  m.mats = [];
  m.ducks = [];
  m.stems = null;
  m.heads = null;
  m.reedClones = [];
}

/** Rebuild duck + reed reflections only. Not a full wetland tree clone. */
export function rebuildMirrors(m, wetland, tide) {
  clearMirrors(m);
  if (!wetland) {
    applyTideMirrors(m, tide);
    return;
  }

  if (wetland.reedMode === 'gltf') {
    for (const r of wetland.reeds) {
      if (!r.obj) continue;
      const c = r.obj.clone(true);
      ghostMaterials(c, m.mats);
      m.group.add(c);
      m.reedClones.push({ src: r.obj, clone: c });
    }
  } else if (wetland.stems && wetland.heads) {
    const stems = wetland.stems.clone();
    const heads = wetland.heads.clone();
    stems.frustumCulled = false;
    heads.frustumCulled = false;
    ghostMaterials(stems, m.mats);
    ghostMaterials(heads, m.mats);
    m.group.add(stems, heads);
    m.stems = stems;
    m.heads = heads;
  }

  for (const b of wetland.liveBirds.values()) {
    if (b.species !== 'duck') continue;
    const c = b.mesh.clone(true);
    ghostMaterials(c, m.mats);
    m.group.add(c);
    m.ducks.push({ src: b.mesh, clone: c });
  }

  applyTideMirrors(m, tide);
}

/** Tide only moves water plane / opacity. No recloning. */
export function applyTideMirrors(m, tide) {
  const wy = tideToWaterY(tide);
  m.group.visible = tide >= 0.46;
  m.group.scale.y = -1;
  m.group.position.y = 2 * wy;
  const fade = THREE.MathUtils.smoothstep(tide, 0.46, 0.72);
  const op = MIRROR_OPACITY * fade;
  for (const mat of m.mats) mat.opacity = op;
}

/** Follow grow / bob without cloning the tree. */
export function syncMirrors(m, wetland) {
  if (!m || !wetland) return;
  if (m.stems && wetland.stems) {
    m.stems.count = wetland.stems.count;
    m.stems.instanceMatrix.copy(wetland.stems.instanceMatrix);
    m.stems.instanceMatrix.needsUpdate = true;
  }
  if (m.heads && wetland.heads) {
    m.heads.count = wetland.heads.count;
    m.heads.instanceMatrix.copy(wetland.heads.instanceMatrix);
    m.heads.instanceMatrix.needsUpdate = true;
  }
  for (const r of m.reedClones) {
    r.clone.position.copy(r.src.position);
    r.clone.rotation.copy(r.src.rotation);
    r.clone.scale.copy(r.src.scale);
    r.clone.visible = r.src.visible;
  }
  for (const d of m.ducks) {
    d.clone.position.copy(d.src.position);
    d.clone.rotation.copy(d.src.rotation);
    d.clone.visible = d.src.visible;
  }
}
