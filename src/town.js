import * as THREE from 'three';
import {
  N,
  TYPE,
  hash2,
  insideIsland,
  terrainHeight,
  polylineLength,
  gridToWorld,
  tideToWaterY,
} from './world.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.014, 0.02, 1, 5);
const HEAD = new THREE.SphereGeometry(0.028, 6, 5);
const MAX_REEDS = 1600;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function mesh(geo, mat, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (sz == null) m.scale.setScalar(sx);
  else m.scale.set(sx, sy, sz);
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

function makeSparrow(mats) {
  const g = new THREE.Group();
  g.add(mesh(BOX, mats.sparrow, 0, 0.02, 0, 0.05, 0.028, 0.028));
  g.add(mesh(BOX, mats.sparrow, 0.018, 0.034, 0, 0.022, 0.018, 0.018));
  const wing = mesh(BOX, mats.sparrow, 0, 0.024, 0, 0.07, 0.008, 0.012);
  wing.rotation.y = 0.5;
  g.add(wing);
  g.userData.kind = 'sparrow';
  return g;
}

function makeDuck(mats) {
  const g = new THREE.Group();
  g.add(mesh(BOX, mats.duck, 0, 0.03, 0, 0.09, 0.04, 0.05));
  g.add(mesh(BOX, mats.duck, 0.04, 0.05, 0, 0.035, 0.03, 0.03));
  g.add(mesh(BOX, mats.reedHead, 0.058, 0.048, 0, 0.02, 0.012, 0.012));
  g.userData.kind = 'duck';
  return g;
}

function makeSandpiper(mats) {
  const g = new THREE.Group();
  g.add(mesh(CYL, mats.sandpiper, -0.01, 0.03, 0.008, 0.006, 0.06, 0.006));
  g.add(mesh(CYL, mats.sandpiper, 0.01, 0.03, -0.006, 0.006, 0.06, 0.006));
  g.add(mesh(BOX, mats.sandpiper, 0, 0.075, 0, 0.055, 0.028, 0.024));
  g.add(mesh(BOX, mats.sandpiper, 0.028, 0.082, 0, 0.03, 0.016, 0.016));
  g.userData.kind = 'sandpiper';
  return g;
}

function makeHeron(mats) {
  const g = new THREE.Group();
  g.add(mesh(CYL, mats.heron, -0.012, 0.08, 0.006, 0.007, 0.16, 0.007));
  g.add(mesh(CYL, mats.heron, 0.012, 0.08, -0.004, 0.007, 0.16, 0.007));
  g.add(mesh(BOX, mats.heron, 0, 0.18, 0, 0.045, 0.07, 0.03));
  const neck = mesh(BOX, mats.heron, 0.02, 0.26, 0, 0.014, 0.12, 0.014);
  neck.rotation.z = -0.35;
  g.add(neck);
  g.add(mesh(BOX, mats.heron, 0.055, 0.31, 0, 0.028, 0.02, 0.02));
  g.userData.kind = 'heron';
  return g;
}

function makeDragonfly(mats) {
  const g = new THREE.Group();
  const a = mesh(BOX, mats.dragonfly, 0, 0, 0, 0.11, 0.006, 0.016);
  const b = mesh(BOX, mats.dragonfly, 0, 0, 0, 0.11, 0.006, 0.016);
  a.rotation.y = 0.7;
  b.rotation.y = -0.7;
  g.add(a, b);
  g.userData.kind = 'dragonfly';
  return g;
}

function makeBird(mats, species) {
  if (species === 'duck') return makeDuck(mats);
  if (species === 'sandpiper') return makeSandpiper(mats);
  if (species === 'heron') return makeHeron(mats);
  if (species === 'dragonfly') return makeDragonfly(mats);
  return makeSparrow(mats);
}

function delayAlong(x, z, growPath) {
  if (!growPath || growPath.length < 1) return 0;
  let best = 1e9;
  let bestI = 0;
  for (let i = 0; i < growPath.length; i++) {
    const d = Math.hypot(x - growPath[i].x, z - growPath[i].y);
    if (d < best) {
      best = d;
      bestI = i;
    }
  }
  const u = growPath.length < 2 ? 0 : bestI / (growPath.length - 1);
  return u * 0.72;
}

function strokeWinding(strokes) {
  let w = 0;
  let L = 0;
  for (const st of strokes) {
    const pts = st.points;
    L += polylineLength(pts);
    for (let i = 1; i < pts.length - 1; i++) {
      const ax = pts[i].x - pts[i - 1].x;
      const ay = pts[i].y - pts[i - 1].y;
      const bx = pts[i + 1].x - pts[i].x;
      const by = pts[i + 1].y - pts[i].y;
      const la = Math.hypot(ax, ay) || 1;
      const lb = Math.hypot(bx, by) || 1;
      const dot = THREE.MathUtils.clamp((ax * bx + ay * by) / (la * lb), -1, 1);
      w += Math.acos(dot);
    }
  }
  return { w, L };
}

function offscreen(toward) {
  const ang = Math.atan2(toward.z, toward.x) + Math.PI + (Math.random() - 0.5) * 1.1;
  const r = 13 + Math.random() * 3;
  return new THREE.Vector3(Math.cos(ang) * r, 2.2 + Math.random() * 1.4, Math.sin(ang) * r);
}

function perchY(species, x, z, grid, tide) {
  const waterY = tideToWaterY(tide);
  if (species === 'duck') return waterY + 0.02;
  if (species === 'dragonfly') return terrainHeight(x, z) + 0.42 + hash2(x * 10, z * 10) * 0.12;
  if (species === 'heron') return Math.max(0.02, waterY * 0.35);
  if (species === 'sandpiper') return 0.03;
  return terrainHeight(x, z) + 0.02;
}

export class Wetland {
  constructor(scene, mats) {
    this.scene = scene;
    this.mats = mats;
    this.group = new THREE.Group();
    this.group.name = 'wetland';
    scene.add(this.group);

    this.stems = new THREE.InstancedMesh(CYL, mats.reedStem, MAX_REEDS);
    this.heads = new THREE.InstancedMesh(HEAD, mats.reedHead, MAX_REEDS);
    this.stems.frustumCulled = false;
    this.heads.frustumCulled = false;
    this.stems.count = 0;
    this.heads.count = 0;
    this.stems.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.stems);
    this.group.add(this.heads);

    this.birdsGroup = new THREE.Group();
    this.group.add(this.birdsGroup);
    this.liveBirds = new Map();
    this.reeds = [];
    this.tide = 0.52;
    this.time = 0;
  }

  clear() {
    this.reeds = [];
    this.stems.count = 0;
    this.heads.count = 0;
    for (const b of this.liveBirds.values()) this.birdsGroup.remove(b.mesh);
    this.liveBirds.clear();
  }

  rebuild(grid, strokes, _landmarks, growPath) {
    this._placeReeds(grid, growPath);
    this._syncBirds(grid, strokes);
    this.applyTide(this.tide);
  }

  snapGrow() {
    for (const r of this.reeds) r.t = 99;
    this._writeReeds(0);
    for (const b of this.liveBirds.values()) {
      if (b.state === 'inbound') {
        b.state = 'perched';
        b.mesh.position.copy(b.perch);
      }
    }
  }

  tick(dt) {
    this.time += dt;
    let growing = false;
    for (const r of this.reeds) {
      if (r.t < r.delay + r.dur) growing = true;
      r.t += dt;
    }
    this._writeReeds(this.time);
    this._tickBirds(dt);
    return growing;
  }

  applyTide(t) {
    this.tide = t;
    for (const b of this.liveBirds.values()) {
      b.perch.y = perchY(b.species, b.perch.x, b.perch.z, null, t);
      if (b.state === 'perched') b.mesh.position.y = b.perch.y;
    }
  }

  _placeReeds(grid, growPath) {
    const prev = new Map(this.reeds.map((r) => [r.key, r]));
    const next = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const id = j * N + i;
        const type = grid.type[id];
        if (!type) continue;
        const sdf = grid.sdf[id];
        const p = gridToWorld(i, j);
        if (!insideIsland(p.x, p.y)) continue;
        const edge = sdf > -0.28 && sdf < 0.16;
        const interior = type === TYPE.narrow && sdf < -0.04 && sdf > -0.55;
        if (!edge && !interior) continue;
        const dens = type === TYPE.narrow ? 0.7 : type === TYPE.river ? 0.38 : 0.22;
        const extra = interior ? 0.22 : 0;
        if (hash2(i, j, 3) > dens + extra) continue;
        const nClump = type === TYPE.narrow ? 1 + (hash2(i, j, 8) > 0.55 ? 1 : 0) : 1;
        for (let k = 0; k < nClump; k++) {
          if (next.length >= MAX_REEDS) break;
          const ox = (hash2(i, j, 11 + k) - 0.5) * 0.11;
          const oz = (hash2(i, j, 17 + k) - 0.5) * 0.11;
          const x = p.x + ox;
          const z = p.y + oz;
          const key = `reed:${i}:${j}:${k}`;
          const h = 0.32 + hash2(i, j, 4 + k) * (type === TYPE.narrow ? 0.55 : 0.38);
          const yaw = hash2(i, j, 9 + k) * Math.PI * 2;
          const old = prev.get(key);
          next.push({
            key,
            x,
            z,
            h,
            yaw,
            lean: (hash2(i, j, 13 + k) - 0.5) * 0.18,
            delay: old ? old.delay : delayAlong(x, z, growPath),
            dur: old ? old.dur : 0.38 + hash2(i, j, 2) * 0.12,
            t: old ? old.t : 0,
          });
        }
      }
    }
    this.reeds = next;
    this.stems.count = next.length;
    this.heads.count = next.length;
    this._writeReeds(this.time);
  }

  _writeReeds(time) {
    const wind = Math.sin(time * 1.15) * 0.05;
    for (let i = 0; i < this.reeds.length; i++) {
      const r = this.reeds[i];
      const u = THREE.MathUtils.clamp((r.t - r.delay) / r.dur, 0, 1);
      const grow = easeOutCubic(u);
      const h = r.h * Math.max(0.001, grow);
      _p.set(r.x, h * 0.5, r.z);
      _e.set(r.lean + wind * (0.4 + r.h), r.yaw, wind * 0.35);
      _q.setFromEuler(_e);
      _s.set(0.9 + r.h * 0.15, h, 0.9 + r.h * 0.15);
      _m.compose(_p, _q, _s);
      this.stems.setMatrixAt(i, _m);
      _p.set(r.x, h + 0.01, r.z);
      _s.set(0.85 + r.h * 0.4, 0.85 + r.h * 0.25, 0.85 + r.h * 0.4);
      _s.multiplyScalar(Math.max(0.001, grow));
      _m.compose(_p, _q, _s);
      this.heads.setMatrixAt(i, _m);
    }
    this.stems.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }

  _wetStats(grid, strokes) {
    const kinds = new Set();
    const spots = { sparrow: [], dragonfly: [], sandpiper: [], duck: [], heron: [] };
    let playerWet = 0;
    for (let j = 2; j < N - 2; j += 2) {
      for (let i = 2; i < N - 2; i += 2) {
        const id = j * N + i;
        const type = grid.type[id];
        if (!type) continue;
        kinds.add(type);
        playerWet++;
        const p = gridToWorld(i, j);
        if (!insideIsland(p.x, p.y)) continue;
        const sdf = grid.sdf[id];
        const land = sdf > 0.02 && sdf < 0.22;
        const mud = sdf > -0.12 && sdf < 0.1;
        const water = sdf < -0.08;
        if (land) spots.sparrow.push(p);
        if (type === TYPE.narrow && sdf < 0.12) spots.dragonfly.push(p);
        if (type === TYPE.river && mud) spots.sandpiper.push(p);
        if (type === TYPE.harbor && water) spots.duck.push(p);
        if (mud) spots.heron.push(p);
      }
    }
    const { w, L } = strokeWinding(strokes);
    return { kinds, playerWet, spots, winding: w, shoreL: L };
  }

  _syncBirds(grid, strokes) {
    const st = this._wetStats(grid, strokes);
    const wanted = [];
    const pick = (list, n, species) => {
      if (!list.length || n <= 0) return;
      const step = Math.max(1, Math.floor(list.length / n));
      for (let k = 0; k < n; k++) {
        const p = list[(k * step + Math.floor(hash2(k, n, species.length) * step)) % list.length];
        wanted.push({
          key: `${species}:${k}`,
          species,
          x: p.x,
          z: p.y,
        });
      }
    };

    if (st.playerWet > 0) {
      pick(st.spots.sparrow, Math.min(4, 1 + Math.floor(st.playerWet / 90)), 'sparrow');
    }
    if (st.kinds.has(TYPE.narrow)) {
      pick(st.spots.dragonfly, Math.min(4, 1 + Math.floor(st.spots.dragonfly.length / 18)), 'dragonfly');
    }
    if (st.kinds.has(TYPE.river)) {
      pick(st.spots.sandpiper, Math.min(3, 1 + Math.floor(st.spots.sandpiper.length / 22)), 'sandpiper');
    }
    if (st.kinds.has(TYPE.harbor)) {
      pick(st.spots.duck, Math.min(3, 1 + Math.floor(st.spots.duck.length / 20)), 'duck');
    }
    if (st.kinds.size >= 2 && st.shoreL > 5.8 && st.winding > 1.05) {
      pick(st.spots.heron, 1, 'heron');
    }

    const keep = new Set(wanted.map((w) => w.key));
    for (const [key, b] of this.liveBirds) {
      if (!keep.has(key) && b.state !== 'outbound') {
        b.state = 'outbound';
        b.t = 0;
        b.from = b.mesh.position.clone();
        b.to = offscreen(b.mesh.position);
        b.dur = 1.15 + Math.random() * 0.35;
      }
    }

    for (const w of wanted) {
      const perch = new THREE.Vector3(w.x, perchY(w.species, w.x, w.z, grid, this.tide), w.z);
      const existing = this.liveBirds.get(w.key);
      if (existing) {
        existing.perch.copy(perch);
        if (existing.state === 'outbound') {
          existing.state = 'inbound';
          existing.t = 0;
          existing.from = existing.mesh.position.clone();
          existing.to = perch.clone();
          existing.dur = 1.4;
        } else if (existing.state === 'perched') {
          existing.mesh.position.copy(perch);
        } else {
          existing.to.copy(perch);
        }
        continue;
      }
      const meshG = makeBird(this.mats, w.species);
      const from = offscreen(perch);
      meshG.position.copy(from);
      this.birdsGroup.add(meshG);
      this.liveBirds.set(w.key, {
        mesh: meshG,
        species: w.species,
        state: 'inbound',
        t: 0,
        dur: 1.35 + hash2(w.x * 5, w.z * 5) * 0.7,
        from,
        to: perch.clone(),
        perch,
      });
    }
  }

  _tickBirds(dt) {
    const gone = [];
    for (const [key, b] of this.liveBirds) {
      if (b.state === 'perched') {
        if (b.species === 'dragonfly') {
          b.mesh.position.y = b.perch.y + Math.sin(this.time * 3.2 + b.perch.x) * 0.045;
          b.mesh.rotation.y += dt * 0.6;
        } else if (b.species === 'duck') {
          b.mesh.position.y = b.perch.y + Math.sin(this.time * 1.6 + b.perch.z) * 0.012;
        } else {
          b.mesh.position.y = b.perch.y + Math.sin(this.time * 2.1 + b.perch.x) * 0.006;
        }
        continue;
      }
      b.t += dt;
      const u = THREE.MathUtils.clamp(b.t / b.dur, 0, 1);
      const e = b.state === 'inbound' ? easeOutCubic(u) : u * u;
      const lift = Math.sin(u * Math.PI) * (b.species === 'heron' ? 1.6 : 1.15);
      b.mesh.position.lerpVectors(b.from, b.to, e);
      b.mesh.position.y += lift;
      const dx = b.to.x - b.from.x;
      const dz = b.to.z - b.from.z;
      if (dx || dz) b.mesh.rotation.y = Math.atan2(dx, dz);
      b.mesh.rotation.x = b.state === 'inbound' ? -0.25 * (1 - e) : 0.2 * e;
      if (u >= 1) {
        if (b.state === 'inbound') {
          b.state = 'perched';
          b.mesh.position.copy(b.perch);
          b.mesh.rotation.x = 0;
        } else {
          this.birdsGroup.remove(b.mesh);
          gone.push(key);
        }
      }
    }
    for (const k of gone) this.liveBirds.delete(k);
  }
}

export { Wetland as Town };
