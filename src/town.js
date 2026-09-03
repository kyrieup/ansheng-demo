import * as THREE from 'three';
import {
  TYPE,
  WIDTHS,
  hash2,
  insideIsland,
  terrainHeight,
  polylineLength,
  maxCurvaturePoint,
} from './world.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8);
const CONE = new THREE.ConeGeometry(1, 1, 8);

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function mesh(geo, mat, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (sz == null) m.scale.setScalar(sx);
  else m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function makeHouse(mats, opt) {
  const g = new THREE.Group();
  const stories = opt.stories;
  const w = opt.w;
  const d = opt.d;
  const storyH = 0.36;
  const h = stories * storyH;
  const plaster = opt.warm ? mats.plasterWarm : mats.plaster;
  const roofMat = opt.blueRoof ? mats.roofBlue : mats.roof;
  const face = opt.faceSign == null ? 1 : opt.faceSign;
  const faceZ = face * (d * 0.5 + 0.012);

  const stilts = [];
  const stiltH = 0.4;
  if (opt.stilt) {
    const xs = [-w * 0.42, 0, w * 0.42];
    const zs = [-d * 0.36, d * 0.44];
    for (const ox of xs) {
      for (const oz of zs) {
        const p = mesh(CYL, mats.timber, ox, stiltH * 0.5, oz, 0.026, stiltH, 0.026);
        g.add(p);
        stilts.push(p);
      }
    }
    g.add(mesh(BOX, mats.timber, 0, stiltH - 0.018, d * 0.05, w * 1.05, 0.036, d * 1.14));
  }

  const base = opt.stilt ? stiltH : 0;
  const upperN = Math.max(0, stories - 1);
  if (upperN > 0) {
    const uh = upperN * storyH;
    const body = mesh(BOX, plaster, 0, base + storyH + uh * 0.5, 0, w, uh, d);
    g.add(body);
  }

  const pillars = new THREE.Group();
  pillars.visible = false;
  const pc = [
    [-w * 0.4, -d * 0.38],
    [w * 0.4, -d * 0.38],
    [-w * 0.4, d * 0.42],
    [0, d * 0.42],
    [w * 0.4, d * 0.42],
  ];
  for (const [ox, oz] of pc) {
    pillars.add(mesh(CYL, mats.timber, ox, base + storyH * 0.5, oz, 0.026, storyH * 0.92, 0.026));
  }
  pillars.add(mesh(BOX, mats.timber, 0, base + storyH - 0.01, d * 0.02, w * 0.94, 0.034, d * 0.92));
  g.add(pillars);

  const groundWall = mesh(BOX, plaster, 0, base + storyH * 0.5, 0, w * 1.001, storyH * 0.96, d * 1.001);
  if (stories >= 1) g.add(groundWall);

  const roofY = base + h;
  const wallT = 0.055;
  for (const side of [-1, 1]) {
    const x = side * (w * 0.5 + 0.03);
    const wallH = h + 0.22;
    g.add(mesh(BOX, plaster, x, base + wallH * 0.5, 0.04, wallT, wallH, d * 1.2));
    g.add(mesh(BOX, plaster, x, roofY + 0.12, d * 0.1, wallT * 1.15, 0.24, d * 0.85));
    g.add(mesh(BOX, plaster, x, roofY + 0.26, d * 0.3, wallT * 1.15, 0.18, d * 0.48));
    g.add(mesh(BOX, roofMat, x, roofY + 0.24, d * 0.1, wallT * 1.7, 0.045, d * 0.92));
    g.add(mesh(BOX, roofMat, x, roofY + 0.36, d * 0.3, wallT * 1.7, 0.045, d * 0.54));
  }

  const frontRoof = mesh(BOX, roofMat, 0, roofY + 0.11, d * 0.35, w * 1.55, 0.055, d * 1.45);
  frontRoof.rotation.x = -0.5;
  g.add(frontRoof);
  const backRoof = mesh(BOX, roofMat, 0, roofY + 0.08, -d * 0.28, w * 1.4, 0.05, d * 0.9);
  backRoof.rotation.x = 0.4;
  g.add(backRoof);
  g.add(mesh(BOX, roofMat, 0, roofY + 0.025, face * (d * 0.55), w * 1.72, 0.1, d * 1.55));
  g.add(mesh(BOX, mats.timber, 0, roofY + 0.16, d * 0.08, w * 0.22, 0.055, d * 0.28));

  const windows = [];
  for (let s = 0; s < stories; s++) {
    const wy = base + s * storyH + storyH * 0.55;
    const nWin = opt.narrow && s === 0 ? 1 : s === 0 ? 2 : opt.narrow ? 1 : 2;
    for (let k = 0; k < nWin; k++) {
      const wx = nWin === 1 ? 0 : k === 0 ? -w * 0.17 : w * 0.17;
      const frame = mesh(BOX, mats.timber, wx, wy, faceZ, 0.115, 0.155, 0.02);
      const pane = mesh(BOX, mats.window, wx, wy, faceZ + face * 0.014, 0.075, 0.108, 0.01);
      pane.castShadow = false;
      g.add(frame, pane);
      pane.userData.story = s;
      frame.userData.story = s;
      windows.push(pane, frame);
    }
    g.add(mesh(BOX, mats.timber, 0, base + s * storyH + 0.035, faceZ, w * 0.9, 0.018, 0.028));
  }

  g.userData = { groundWall, pillars, stilts, baseY: 0, storyH, windows, stilt: !!opt.stilt };
  return g;
}

function makeBoat(mats, harbor) {
  const g = new THREE.Group();
  g.add(mesh(BOX, mats.boat, 0, 0.05, 0, harbor ? 0.62 : 0.42, 0.07, harbor ? 0.2 : 0.14));
  const prow = mesh(BOX, mats.boat, harbor ? 0.28 : 0.2, 0.06, 0, 0.16, 0.05, harbor ? 0.12 : 0.08);
  prow.rotation.z = -0.4;
  g.add(prow);
  g.add(mesh(BOX, mats.boatDark, 0.02, 0.09, 0, harbor ? 0.28 : 0.18, 0.03, harbor ? 0.12 : 0.08));
  if (harbor) g.add(mesh(CYL, mats.timber, -0.12, 0.16, 0, 0.015, 0.16, 0.015));
  return g;
}

function makeCat(mats, kind) {
  const g = new THREE.Group();
  const m = kind === 0 ? mats.catOrange : kind === 1 ? mats.catBlack : mats.catWhite;
  g.add(mesh(BOX, m, 0, 0.04, 0, 0.09, 0.05, 0.055));
  g.add(mesh(BOX, m, 0.05, 0.08, 0, 0.045, 0.04, 0.04));
  g.add(mesh(BOX, m, 0.055, 0.11, 0.015, 0.015, 0.02, 0.012));
  g.add(mesh(BOX, m, 0.055, 0.11, -0.015, 0.015, 0.02, 0.012));
  const tail = mesh(BOX, m, -0.055, 0.08, 0, 0.012, 0.05, 0.012);
  tail.rotation.z = 0.5;
  g.add(tail);
  return g;
}

function makeLantern(mats) {
  const g = new THREE.Group();
  g.add(mesh(CYL, mats.timber, 0, 0.18, 0, 0.018, 0.36, 0.018));
  const lamp = mesh(BOX, mats.lantern, 0.0, 0.34, 0.04, 0.06, 0.07, 0.06);
  lamp.castShadow = false;
  g.add(lamp);
  g.userData.lamp = lamp;
  g.userData.hangY = 0.34;
  return g;
}

function makeBollard(mats) {
  const g = new THREE.Group();
  g.add(mesh(CYL, mats.stone, 0, 0.08, 0, 0.045, 0.16, 0.045));
  g.add(mesh(CYL, mats.stoneLight, 0, 0.16, 0, 0.055, 0.03, 0.055));
  return g;
}

function makeStairs(mats, dir) {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const s = mesh(
      BOX,
      mats.stone,
      dir.x * (0.04 + i * 0.075),
      0.155 - i * 0.032,
      dir.z * (0.04 + i * 0.075),
      0.34,
      0.04,
      0.15
    );
    g.add(s);
  }
  return g;
}

function makeMudSteps(mats, dir) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    g.add(
      mesh(
        BOX,
        mats.mud,
        dir.x * (0.04 + i * 0.08),
        0.012 + i * 0.02,
        dir.z * (0.04 + i * 0.08),
        0.22,
        0.02,
        0.14
      )
    );
  }
  g.userData.mud = true;
  return g;
}

function makeBrick(mats, alley) {
  const g = new THREE.Group();
  const len = alley ? 0.4 : 0.62;
  const h = alley ? 0.16 : 0.28;
  const thick = alley ? 0.11 : 0.16;
  g.add(mesh(BOX, alley ? mats.brickDark : mats.brick, 0, h * 0.48, 0, len, h, thick));
  g.add(mesh(BOX, mats.stoneLight, 0, h + 0.02, 0.02, len * 1.06, 0.045, thick * 1.28));
  return g;
}

function makeBridge(mats) {
  const g = new THREE.Group();
  g.add(mesh(BOX, mats.stone, 0, 0.14, 0, 1.15, 0.08, 0.42));
  g.add(mesh(BOX, mats.stoneLight, 0, 0.22, 0.18, 1.1, 0.1, 0.06));
  g.add(mesh(BOX, mats.stoneLight, 0, 0.22, -0.18, 1.1, 0.1, 0.06));
  const arch = mesh(CYL, mats.stone, 0, 0.02, 0, 0.28, 0.42, 0.28);
  arch.rotation.x = Math.PI / 2;
  arch.scale.set(1, 1, 0.35);
  g.add(arch);
  return g;
}

function makePlaza(mats) {
  const g = new THREE.Group();
  g.add(mesh(BOX, mats.stoneLight, 0, 0.03, 0, 1.35, 0.04, 1.35));
  g.add(mesh(CYL, mats.stone, 0, 0.08, 0, 0.16, 0.08, 0.16));
  const lamp = makeLantern(mats);
  lamp.position.set(0.45, 0, 0.45);
  g.add(lamp);
  const lamp2 = makeLantern(mats);
  lamp2.position.set(-0.45, 0, -0.45);
  g.add(lamp2);
  return g;
}

function makeCourtyardRing(mats) {
  const g = new THREE.Group();
  g.add(mesh(CYL, mats.stone, 0, 0.03, 0, 0.85, 0.04, 0.85));
  return g;
}

function makeLaundry(mats, span, seed) {
  const g = new THREE.Group();
  const line = mesh(BOX, mats.timber, 0, 0, 0, span, 0.012, 0.012);
  g.add(line);
  const n = 2 + (seed % 2);
  for (let i = 0; i < n; i++) {
    const cloth = i % 3 === 0 ? mats.clothA : i % 3 === 1 ? mats.clothB : mats.clothC;
    const x = (i / (n - 1 || 1) - 0.5) * span * 0.7;
    const h = 0.1 + hash2(seed, i, 3) * 0.08;
    const c = mesh(BOX, cloth, x, -h * 0.45, 0, 0.07, h, 0.012);
    c.rotation.z = (hash2(seed, i, 7) - 0.5) * 0.25;
    g.add(c);
  }
  return g;
}

function distToPoly(x, z, points) {
  let best = 1e9;
  for (let i = 0; i < points.length; i++) {
    const dx = x - points[i].x;
    const dz = z - points[i].y;
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best;
}

function sampleAt(points, dist) {
  let remain = dist;
  const last = points.length - 2;
  for (let i = 0; i <= last; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = a.distanceTo(b);
    if (len < 1e-8) continue;
    if (remain <= len || i === last) {
      const t = THREE.MathUtils.clamp(remain / Math.max(len, 1e-8), 0, 1);
      const tx = (b.x - a.x) / len;
      const tz = (b.y - a.y) / len;
      return {
        x: a.x + (b.x - a.x) * t,
        z: a.y + (b.y - a.y) * t,
        tx,
        tz,
        nx: -tz,
        nz: tx,
      };
    }
    remain -= len;
  }
  const a = points[0];
  return { x: a.x, z: a.y, tx: 1, tz: 0, nx: 0, nz: 1 };
}

function sampleStroke(points, spacing) {
  const L = polylineLength(points);
  const out = [];
  if (L < 0.04 || points.length < 2) return out;
  const n = Math.max(1, Math.round(L / spacing));
  const sp = L / n;
  for (let k = 0; k <= n; k++) {
    const s = k * sp;
    out.push({ ...sampleAt(points, s), s, L });
  }
  return out;
}

function bayCount(widthKey, L) {
  if (L < 1.15) return 0;
  if (widthKey === 'narrow') return THREE.MathUtils.clamp(Math.round(L / 2.6), 2, 3);
  if (widthKey === 'harbor') return THREE.MathUtils.clamp(Math.round(L / 2.3), 2, 4);
  return THREE.MathUtils.clamp(Math.round(L / 1.55), 3, 6);
}


export class Town {
  constructor(scene, mats) {
    this.scene = scene;
    this.mats = mats;
    this.group = new THREE.Group();
    this.group.name = 'town';
    scene.add(this.group);
    this.live = new Map();
    this.tide = 0.5;
  }

  clear() {
    for (const m of this.live.values()) this.group.remove(m);
    this.live.clear();
  }

  rebuild(grid, strokes, landmarks, growPath) {
    const wanted = this._place(grid, strokes, landmarks, growPath);
    const keys = new Set(wanted.map((w) => w.key));
    for (const [k, m] of this.live) {
      if (!keys.has(k)) {
        this.group.remove(m);
        this.live.delete(k);
      }
    }
    for (const w of wanted) {
      if (this.live.has(w.key)) continue;
      const m = w.mesh;
      m.userData.grow = {
        delay: w.delay,
        dur: w.kind === 'boat' ? 0.5 : 0.32,
        t: 0,
        kind: w.kind,
        slideFrom: w.slideFrom || null,
        slideTo: w.mesh.position.clone(),
        baseScale: m.scale.clone(),
      };
      if (w.slideFrom) m.position.copy(w.slideFrom);
      m.scale.set(0.001, 0.001, 0.001);
      this.group.add(m);
      this.live.set(w.key, m);
    }
    this.applyTide(this.tide);
  }

  snapGrow() {
    for (const m of this.live.values()) {
      const g = m.userData.grow;
      if (!g) continue;
      g.t = 99;
      m.scale.copy(g.baseScale);
      if (g.slideFrom) m.position.copy(g.slideTo);
    }
  }

  tick(dt) {
    for (const m of this.live.values()) {
      const g = m.userData.grow;
      if (!g || g.t > g.delay + g.dur + 0.05) continue;
      g.t += dt;
      const u = THREE.MathUtils.clamp((g.t - g.delay) / g.dur, 0, 1);
      const s = g.kind === 'boat' ? easeOutCubic(u) : easeOutBack(u);
      m.scale.set(g.baseScale.x * s, g.baseScale.y * s, g.baseScale.z * s);
      if (g.slideFrom) {
        m.position.lerpVectors(g.slideFrom, g.slideTo, easeOutCubic(u));
      }
    }
  }

  applyTide(t) {
    this.tide = t;
    const ebb = THREE.MathUtils.clamp(1 - t * 2, 0, 1);
    const flood = THREE.MathUtils.clamp((t - 0.5) * 2, 0, 1);
    const waterY = THREE.MathUtils.lerp(0.03, 0.5, t);
    for (const m of this.live.values()) {
      const ud = m.userData;
      if (ud.mud) {
        m.visible = ebb > 0.15;
        m.scale.y = Math.max(0.05, ebb);
      }
      if (ud.groundWall && ud.pillars) {
        ud.groundWall.visible = flood < 0.55;
        ud.pillars.visible = flood >= 0.45;
      }
      if (ud.windows) {
        for (const w of ud.windows) {
          if (w.userData.story === 0) w.visible = flood < 0.55;
        }
      }
      if (ud.kind === 'boat') {
        const grounded = ebb > 0.35;
        const gy = ud.grow?.slideTo || m.position;
        m.position.y = grounded ? 0.045 : waterY + 0.02;
        m.rotation.z = grounded ? 0.14 : 0;
        m.rotation.x = grounded ? 0.04 : 0;
      }
      if (ud.lamp && ud.hangY != null) {
        ud.lamp.position.y = THREE.MathUtils.lerp(ud.hangY, Math.max(0.08, waterY - m.position.y + 0.04), flood);
      }
      if (ud.kind === 'lantern' && ud.lamp) {
        ud.lamp.position.y = THREE.MathUtils.lerp(0.34, Math.max(0.1, waterY - m.position.y + 0.05), flood);
      }
    }
  }

  _place(grid, strokes, landmarks, growPath) {
    const items = [];
    const occupied = [];
    const delayOf = (kind, along = 0, L = 1) => {
      const u = L > 0.01 ? THREE.MathUtils.clamp(along / L, 0, 1) : 0;
      if (kind === 'brick' || kind === 'mud' || kind === 'stairs' || kind === 'bollard') {
        return Math.min(0.98, (kind === 'brick' ? 0 : 0.08) + u * 0.88);
      }
      const base = {
        plaza: 0.12,
        bridge: 0.2,
        court: 0.1,
        house: 1.0,
        laundry: 1.12,
        lantern: 0.58,
        boat: 1.05,
        cat: 1.16,
      }[kind] || 0.3;
      return Math.min(1.25, base + u * 0.08);
    };

    const skipNear = (x, z, r) => {
      for (const o of occupied) {
        if (Math.hypot(x - o.x, z - o.z) < r) return true;
      }
      occupied.push({ x, z });
      return false;
    };

    const nearMark = (x, z, r) => {
      for (const jn of landmarks.junctions) {
        if (Math.hypot(x - jn.x, z - jn.z) < r) return true;
      }
      for (const de of landmarks.deadends) {
        if (Math.hypot(x - de.x, z - de.z) < r * 0.9) return true;
      }
      return false;
    };

    const houses = [];
    const onCenterPond = (x, z) => Math.hypot(x, z) < 1.58;

    for (const st of strokes) {
      const pts = st.points;
      const L = polylineLength(pts);
      if (pts.length < 2 || L < 0.2) continue;
      const tinyPond = st.connected === false && L < 2.4;
      if (tinyPond) continue;

      const halfW = WIDTHS[st.width] * 0.5;
      const narrow = st.width === 'narrow';
      const harbor = st.width === 'harbor';
      const river = st.width === 'river';
      const alley = narrow;
      const samples = sampleStroke(pts, alley ? 0.26 : 0.28);
      const mid = sampleAt(pts, L * 0.5);
      const inland = -(mid.x * mid.nx + mid.z * mid.nz);
      const prefSide = inland >= 0 ? 1 : -1;
      const houseSides = narrow ? [-1, 1] : [prefSide];

      for (const sm of samples) {
        for (const sign of [-1, 1]) {
          const nx = sm.nx * sign;
          const nz = sm.nz * sign;
          const qx = sm.x + nx * (halfW + 0.06);
          const qz = sm.z + nz * (halfW + 0.06);
          if (!insideIsland(qx, qz)) continue;
          if (onCenterPond(qx, qz)) continue;
          if (grid.sample(qx, qz) < -0.04) continue;
          const landH = terrainHeight(qx, qz);
          const brick = makeBrick(this.mats, alley);
          brick.position.set(qx, landH * 0.55, qz);
          brick.rotation.y = Math.atan2(nx, nz);
          brick.userData.kind = 'brick';
          items.push({
            key: `brick:${st.id}:${sign}:${sm.s.toFixed(2)}`,
            mesh: brick,
            delay: delayOf('brick', sm.s, L),
            kind: 'brick',
          });

          const towardWater = { x: -nx, z: -nz };
          if (river && sign === prefSide && hash2(st.id, Math.round(sm.s * 8), 2) > 0.52) {
            const stps = makeStairs(this.mats, towardWater);
            stps.position.set(sm.x + nx * (halfW - 0.02), 0.02, sm.z + nz * (halfW - 0.02));
            stps.rotation.y = Math.atan2(nx, nz);
            items.push({
              key: `stairs:${st.id}:${sign}:${sm.s.toFixed(2)}`,
              mesh: stps,
              delay: delayOf('stairs', sm.s, L),
              kind: 'stairs',
            });
          }

          if ((Math.round(sm.s * 6) + st.id) % 5 === 0) {
            const mud = makeMudSteps(this.mats, towardWater);
            mud.position.set(sm.x + nx * (halfW - 0.04), 0.01, sm.z + nz * (halfW - 0.04));
            mud.rotation.y = Math.atan2(nx, nz);
            mud.userData.mud = true;
            items.push({
              key: `mud:${st.id}:${sign}:${sm.s.toFixed(2)}`,
              mesh: mud,
              delay: delayOf('mud', sm.s, L),
              kind: 'mud',
            });
          }

          if (harbor && hash2(st.id, Math.round(sm.s * 5), 4) > 0.42) {
            const b = makeBollard(this.mats);
            b.position.set(qx, landH * 0.85, qz);
            items.push({
              key: `bol:${st.id}:${sign}:${sm.s.toFixed(2)}`,
              mesh: b,
              delay: delayOf('bollard', sm.s, L),
              kind: 'bollard',
            });
          }
        }
      }

      const nBays = bayCount(st.width, L);
      const bayW = narrow ? 0.46 : harbor ? 0.56 : 0.54;
      const bayD = narrow ? 0.3 : harbor ? 0.34 : 0.32;
      const gap = 0.012;
      const clusterLen = nBays * (bayW + gap);
      const margin = Math.min(0.85, L * 0.16);
      const startS = THREE.MathUtils.clamp(
        L * 0.52 - clusterLen * 0.5,
        margin,
        Math.max(margin, L - margin - clusterLen)
      );

      for (const sign of houseSides) {
        if (nBays <= 0) continue;
        let placed = 0;
        for (let k = 0; k < nBays; k++) {
          const sAlong = startS + k * (bayW + gap) + bayW * 0.5;
          if (sAlong > L - 0.05) break;
          const sm = sampleAt(pts, sAlong);
          const nx = sm.nx * sign;
          const nz = sm.nz * sign;
          const inland = harbor ? halfW + 0.05 : halfW + 0.2 + bayD * 0.5;
          const hx = sm.x + nx * inland;
          const hz = sm.z + nz * inland;
          if (!insideIsland(hx, hz)) continue;
          if (onCenterPond(hx, hz)) continue;
          if (!harbor && grid.sample(hx, hz) < 0.1) continue;
          if (nearMark(hx, hz, 0.85)) continue;
          if (skipNear(hx, hz, bayW * 0.72)) continue;

          const stories = narrow
            ? 1 + (hash2(st.id, k, 1) > 0.6 ? 1 : 0)
            : harbor
              ? 2
              : 2 + (hash2(st.id, k, 1) > 0.55 ? 1 : 0);
          const house = makeHouse(this.mats, {
            stories,
            w: bayW,
            d: bayD,
            stilt: harbor,
            narrow,
            warm: hash2(st.id, k, 6) > 0.72,
            blueRoof: hash2(st.id, k, 8) > 0.8,
            faceSign: 1,
          });
          const landH = terrainHeight(hx, hz);
          house.position.set(hx, harbor ? 0.02 : landH * 0.98, hz);
          house.lookAt(sm.x - nx * 2, house.position.y, sm.z - nz * 2);
          house.userData.kind = 'house';
          items.push({
            key: `house:${st.id}:${sign}:${k}`,
            mesh: house,
            delay: delayOf('house', sAlong, L),
            kind: 'house',
          });
          houses.push({
            x: hx,
            z: hz,
            nx,
            nz,
            typ: TYPE[st.width],
            s: sAlong,
            id: st.id,
            side: sign,
            i: k,
            j: sign,
          });
          placed++;
        }

        if (placed > 0) {
          const mid = startS + clusterLen * 0.5;
          const sm = sampleAt(pts, mid);
          const nx = sm.nx * sign;
          const nz = sm.nz * sign;
          const lx = sm.x + nx * (halfW + 0.05);
          const lz = sm.z + nz * (halfW + 0.05);
          if (insideIsland(lx, lz)) {
            const lan = makeLantern(this.mats);
            lan.position.set(lx, terrainHeight(lx, lz) * 0.98, lz);
            lan.userData.kind = 'lantern';
            items.push({
              key: `lan:${st.id}:${sign}`,
              mesh: lan,
              delay: delayOf('lantern', mid, L),
              kind: 'lantern',
            });
          }
        }
      }

      if (hash2(st.id, 21, 1) > 0.35) {
        const cs = L * 0.62;
        const sm = sampleAt(pts, cs);
        const sign = -prefSide;
        const nx = sm.nx * sign;
        const nz = sm.nz * sign;
        const cx = sm.x + nx * (halfW + 0.16);
        const cz = sm.z + nz * (halfW + 0.16);
        if (insideIsland(cx, cz) && grid.sample(cx, cz) > 0.05) {
          const cat = makeCat(this.mats, Math.floor(hash2(st.id, 22, 1) * 3));
          cat.position.set(cx, terrainHeight(cx, cz) * 0.95, cz);
          cat.rotation.y = hash2(st.id, 23, 1) * Math.PI * 2;
          items.push({
            key: `cat:${st.id}`,
            mesh: cat,
            delay: delayOf('cat', cs, L),
            kind: 'cat',
          });
        }
      }
    }

    for (let a = 0; a < houses.length; a++) {
      const A = houses[a];
      if (A.typ !== TYPE.narrow) continue;
      for (let b = a + 1; b < houses.length; b++) {
        const B = houses[b];
        if (B.typ !== TYPE.narrow || B.id !== A.id || B.side === A.side) continue;
        if (Math.abs(B.s - A.s) > 0.4) continue;
        const midX = (A.x + B.x) * 0.5;
        const midZ = (A.z + B.z) * 0.5;
        const dist = Math.hypot(B.x - A.x, B.z - A.z);
        if (dist < 0.45 || dist > 2.2) continue;
        if (grid.sample(midX, midZ) > 0.08) continue;
        const laundry = makeLaundry(this.mats, dist * 0.88, A.id * 13 + A.i);
        laundry.position.set(midX, 0.62, midZ);
        laundry.lookAt(B.x, 0.62, B.z);
        laundry.rotateY(Math.PI / 2);
        items.push({
          key: `laun:${A.id}:${A.i}:${B.i}`,
          mesh: laundry,
          delay: delayOf('laundry', A.s, 4),
          kind: 'laundry',
        });
        break;
      }
    }

    for (const jn of landmarks.junctions) {
      const plaza = makePlaza(this.mats);
      plaza.position.set(jn.x, terrainHeight(jn.x, jn.z) * 0.85, jn.z);
      items.push({
        key: `plaza:${jn.x.toFixed(1)}:${jn.z.toFixed(1)}`,
        mesh: plaza,
        delay: delayOf('plaza'),
        kind: 'plaza',
      });
      const bridge = makeBridge(this.mats);
      bridge.position.set(jn.x, 0.08, jn.z);
      if (jn.dir != null) bridge.rotation.y = jn.dir;
      items.push({
        key: `bridge:${jn.x.toFixed(1)}:${jn.z.toFixed(1)}`,
        mesh: bridge,
        delay: delayOf('bridge'),
        kind: 'bridge',
      });
    }

    for (const de of landmarks.deadends) {
      const ring = makeCourtyardRing(this.mats);
      ring.position.set(de.x, 0.04, de.z);
      items.push({
        key: `court:${de.x.toFixed(1)}:${de.z.toFixed(1)}`,
        mesh: ring,
        delay: delayOf('court'),
        kind: 'court',
      });
    }

    for (const st of strokes) {
      if (st.width === 'narrow') continue;
      const L = polylineLength(st.points);
      if (L < 0.8) continue;
      const nBoats = st.width === 'harbor' ? Math.max(2, Math.floor(L / 2.4)) : 1;
      const bend = maxCurvaturePoint(st.points);
      for (let b = 0; b < nBoats; b++) {
        const t = nBoats === 1 ? bend.t : (b + 0.5) / nBoats;
        const idx = Math.min(st.points.length - 1, Math.floor(t * (st.points.length - 1)));
        const p = st.points[idx];
        if (grid.sample(p.x, p.y) > -0.05) continue;
        const boat = makeBoat(this.mats, st.width === 'harbor');
        const p1 = st.points[Math.min(st.points.length - 1, idx + 1)];
        const p0 = st.points[Math.max(0, idx - 1)];
        const ang = Math.atan2(p1.x - p0.x, p1.y - p0.y);
        boat.position.set(p.x, 0.16, p.y);
        boat.rotation.y = ang + (st.width === 'harbor' ? 0.7 : 0);
        boat.userData.kind = 'boat';
        const slideFrom = new THREE.Vector3(p.x - Math.sin(ang) * 0.9, 0.16, p.y - Math.cos(ang) * 0.9);
        items.push({
          key: `boat:${st.id}:${b}`,
          mesh: boat,
          delay: delayOf('boat', t * L, L),
          kind: 'boat',
          slideFrom,
        });
      }
    }

    return items;
  }
}
