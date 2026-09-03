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
import { countOf, landDelayMul } from './config/fauna.js';
import { REED_GROW_DUR, REED_GROW_DUR_JITTER, easeOutCubic, delayAlongStroke } from './config/magic.js';
import { makeBird, makeReedCluster } from './art/slots.js';
import { audio } from './audio/hooks.js';
import { DEFAULT_TOD } from './config/look.js';

const MAX_REEDS = 1600;

function densityFor(type) {
  if (type === TYPE.narrow) return 'lush';
  if (type === TYPE.river) return 'sparse';
  return 'single';
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

    this.reedGroup = new THREE.Group();
    this.reedGroup.name = 'reedClusters';
    this.group.add(this.reedGroup);

    this.birdsGroup = new THREE.Group();
    this.group.add(this.birdsGroup);
    this.liveBirds = new Map();
    this.reeds = [];
    this.reedMode = 'gltf';
    this.tide = 0.52;
    this.tod = DEFAULT_TOD;
    this.time = 0;
    this.grid = null;
    this.strokes = [];
  }

  clear() {
    this._clearReedObjects();
    this.reeds = [];
    for (const b of this.liveBirds.values()) this.birdsGroup.remove(b.mesh);
    this.liveBirds.clear();
  }

  _clearReedObjects() {
    while (this.reedGroup.children.length) {
      this.reedGroup.remove(this.reedGroup.children[0]);
    }
  }

  rebuild(grid, strokes, _landmarks, growPath) {
    this.grid = grid;
    this.strokes = strokes || [];
    this._placeReeds(grid, growPath);
    this._syncBirds(grid, this.strokes, growPath);
    this.applyTide(this.tide);
  }

  rebuildFauna() {
    if (!this.grid) return;
    this._syncBirds(this.grid, this.strokes, null);
  }

  snapGrow() {
    for (const r of this.reeds) {
      r.t = 99;
      if (r.obj) {
        r.obj.scale.set(1, 1, 1);
        r.obj.visible = true;
      }
    }
    this._writeReeds(0);
    for (const b of this.liveBirds.values()) {
      if (b.state === 'inbound' || b.state === 'wait') {
        b.state = 'perched';
        b.mesh.position.copy(b.perch);
        b.mesh.rotation.x = 0;
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
    let spawned = false;
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
        // Coarse field → distinct foliage islands, not a uniform toothpick hedge.
        const clump = hash2(Math.floor(i / 4), Math.floor(j / 4), 5);
        const inClump = type === TYPE.narrow ? clump > 0.28 : type === TYPE.river ? clump > 0.42 : clump > 0.52;
        let keep;
        if (type === TYPE.narrow) {
          // 湿草 / reed-dense: thick along the stroke, extra-dense in clumps.
          keep = inClump ? 0.96 : 0.55;
          if (interior) keep = Math.max(keep, 0.78);
        } else if (type === TYPE.river) {
          keep = inClump ? 0.58 : 0.18;
        } else {
          keep = inClump ? 0.3 : 0.08;
        }
        if (hash2(i, j, 3) > keep) continue;
        const density = densityFor(type);
        const extras = type === TYPE.narrow && inClump && hash2(i, j, 21) > 0.62 ? 1 : 0;
        for (let k = 0; k <= extras; k++) {
          if (next.length >= MAX_REEDS) break;
          const spread = k ? 0.22 : 0.1;
          const ox = (hash2(i, j, 11 + k * 3) - 0.5) * spread;
          const oz = (hash2(i, j, 17 + k * 5) - 0.5) * spread;
          const x = p.x + ox;
          const z = p.y + oz;
          const key = `reed:${i}:${j}:${k}`;
          const yaw = hash2(i, j, 9 + k) * Math.PI * 2;
          const old = prev.get(key);
          if (!old) spawned = true;
          next.push({
            key,
            x,
            z,
            yaw,
            density,
            lean: (hash2(i, j, 13 + k) - 0.5) * 0.18,
            delay: old ? old.delay : delayAlongStroke(x, z, growPath),
            dur: old ? old.dur : REED_GROW_DUR + hash2(i, j, 2 + k) * REED_GROW_DUR_JITTER,
            t: old ? old.t : 0,
            obj: old && old.obj && old.density === density ? old.obj : null,
          });
        }
      }
    }

    const keep = new Set(next.map((r) => r.obj).filter(Boolean));
    for (const r of prev.values()) {
      if (r.obj && !keep.has(r.obj)) this.reedGroup.remove(r.obj);
    }

    this.reedMode = 'gltf';
    for (const r of next) {
      if (!r.obj) {
        r.obj = makeReedCluster(r.density);
        this.reedGroup.add(r.obj);
      }
      r.obj.position.set(r.x, 0, r.z);
      r.obj.rotation.y = r.yaw;
    }

    this.reeds = next;
    this._writeReeds(this.time);
    if (spawned) audio.grow();
  }

  _writeReeds(time) {
    const wind = Math.sin(time * 1.15) * 0.05;
    for (const r of this.reeds) {
      if (!r.obj) continue;
      const u = THREE.MathUtils.clamp((r.t - r.delay) / r.dur, 0, 1);
      const grow = easeOutCubic(u);
      r.obj.visible = grow > 0.02;
      r.obj.scale.set(1, Math.max(0.001, grow), 1);
      r.obj.rotation.z = r.lean + wind * 0.35;
      r.obj.rotation.x = wind * 0.2;
    }
  }

  _wetStats(grid, strokes) {
    const kinds = new Set();
    const spots = { sparrow: [], dragonfly: [], sandpiper: [], duck: [], heron: [], any: [] };
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
        spots.any.push(p);
        if (land) spots.sparrow.push(p);
        if (type === TYPE.narrow && sdf < 0.12) spots.dragonfly.push(p);
        if (type === TYPE.river && mud) spots.sandpiper.push(p);
        if (type === TYPE.harbor && water) spots.duck.push(p);
        if (mud) spots.heron.push(p);
      }
    }
    const { w, L } = strokeWinding(strokes);
    return {
      kinds,
      playerWet,
      spots,
      winding: w,
      shoreL: L,
      kindCount: kinds.size,
      hasNarrow: kinds.has(TYPE.narrow),
      hasRiver: kinds.has(TYPE.river),
      hasHarbor: kinds.has(TYPE.harbor),
      dragonflySpots: spots.dragonfly.length,
      sandpiperSpots: spots.sandpiper.length,
      duckSpots: spots.duck.length,
    };
  }

  _syncBirds(grid, strokes, growPath) {
    const st = this._wetStats(grid, strokes);
    const hasWetStroke = (strokes || []).length > 0;
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

    const sparrowN = countOf('sparrow', st, this.tod, hasWetStroke);
    pick(st.spots.sparrow.length ? st.spots.sparrow : st.spots.any, sparrowN, 'sparrow');
    pick(st.spots.dragonfly, countOf('dragonfly', st, this.tod, hasWetStroke), 'dragonfly');
    pick(st.spots.sandpiper, countOf('sandpiper', st, this.tod, hasWetStroke), 'sandpiper');
    pick(st.spots.duck, countOf('duck', st, this.tod, hasWetStroke), 'duck');
    pick(st.spots.heron, countOf('heron', st, this.tod, hasWetStroke), 'heron');

    const keep = new Set(wanted.map((w) => w.key));
    for (const [key, b] of this.liveBirds) {
      if (!keep.has(key) && b.state !== 'outbound') {
        b.state = 'outbound';
        b.t = 0;
        b.from = b.mesh.position.clone();
        b.to = offscreen(b.mesh.position);
        b.dur = 1.15 + Math.random() * 0.35;
        audio.leave();
      }
    }

    const delayMul = landDelayMul(this.tod);
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
      const meshG = makeBird(w.species);
      const from = offscreen(perch);
      meshG.position.copy(from);
      this.birdsGroup.add(meshG);
      const delay = delayAlongStroke(w.x, w.z, growPath) * delayMul;
      this.liveBirds.set(w.key, {
        mesh: meshG,
        species: w.species,
        state: delay > 0 ? 'wait' : 'inbound',
        t: 0,
        delay,
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
      if (b.state === 'wait') {
        b.t += dt;
        if (b.t >= b.delay) {
          b.state = 'inbound';
          b.t = 0;
        }
        continue;
      }
      if (b.state === 'perched') {
        if (b.species === 'dragonfly') {
          b.mesh.position.y = b.perch.y + Math.sin(this.time * 3.2 + b.perch.x) * 0.045;
          b.mesh.rotation.y += dt * 0.6;
          const wings = b.mesh.userData.flapWings;
          if (wings && wings.length) {
            const flap = Math.sin(this.time * 28) * 0.4;
            for (const w of wings) {
              const left = w.name.startsWith('wing_l');
              w.rotation.z = flap * (left ? 1 : -1);
            }
          }
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
          audio.land();
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
