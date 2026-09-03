import * as THREE from 'three';

export const WORLD = 16;
export const N = 128;
export const HALF = WORLD * 0.5;
export const WIDTHS = { narrow: 0.55, river: 1.15, harbor: 1.9 };
export const TYPE = { none: 0, narrow: 1, river: 2, harbor: 3 };

export function cellSize() {
  return WORLD / (N - 1);
}

export function worldToGrid(x, z) {
  const s = N - 1;
  return {
    i: THREE.MathUtils.clamp(((x + HALF) / WORLD) * s, 0, s),
    j: THREE.MathUtils.clamp(((z + HALF) / WORLD) * s, 0, s),
  };
}

export function gridToWorld(i, j) {
  const c = cellSize();
  return new THREE.Vector2(-HALF + i * c, -HALF + j * c);
}

export function hash2(i, j, k = 0) {
  const n = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

export function noise2(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export function islandRadius(theta) {
  return (
    7.05 *
    (1 +
      0.07 * Math.sin(3 * theta + 0.5) +
      0.045 * Math.sin(5 * theta + 1.3) +
      0.025 * Math.sin(8 * theta + 0.2))
  );
}

export function insideIsland(x, z) {
  const r = Math.hypot(x, z);
  const th = Math.atan2(z, x);
  return r < islandRadius(th) - 0.12;
}

export function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  const th = Math.atan2(z, x);
  const R = islandRadius(th);
  const d = r / R;
  const bowl = (1 - d * d) * 0.16;
  const n = 0.04 * noise2(x * 0.45, z * 0.45) + 0.02 * noise2(x * 1.1, z * 1.1);
  const rim = Math.exp(-((d - 0.82) * (d - 0.82)) * 28) * 0.05;
  return THREE.MathUtils.clamp(0.2 + bowl + n + rim, 0.16, 0.48);
}

export function makePalette() {
  const std = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      metalness: 0.02,
      ...extra,
    });
  return {
    grass: std(0x6b8a54, { emissive: 0x243818, emissiveIntensity: 0.22 }),
    dish: std(0x2a3028, { roughness: 0.78 }),
    mud: std(0x6e5844, { roughness: 1 }),
    mudWet: std(0x4a3c2e, { roughness: 0.95 }),
    reedStem: std(0x4d6a38, { roughness: 0.82 }),
    reedHead: std(0xc4a24a, { roughness: 0.7 }),
    sparrow: std(0x5a4638),
    duck: std(0x3e4a36),
    sandpiper: std(0x8a7060),
    heron: std(0x6a6e70),
    dragonfly: new THREE.MeshBasicMaterial({
      color: 0x3a5a38,
      toneMapped: false,
    }),
    preview: new THREE.MeshBasicMaterial({
      color: 0x8fcfc4,
      transparent: true,
      opacity: 0.72,
      depthWrite: true,
    }),
  };
}

export class WaterGrid {
  constructor() {
    this.sdf = new Float32Array(N * N);
    this.type = new Uint8Array(N * N);
    this.strokeId = new Int16Array(N * N);
    this.sdf.fill(12);
    this.strokeId.fill(-1);
    this.texData = new Uint8Array(N * N * 4);
    this.texture = new THREE.DataTexture(this.texData, N, N, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.flipY = false;
    this.stampCenterPond();
    this.syncTexture();
  }

  idx(i, j) {
    return j * N + i;
  }

  sample(x, z) {
    const g = worldToGrid(x, z);
    const i0 = Math.floor(g.i);
    const j0 = Math.floor(g.j);
    const i1 = Math.min(i0 + 1, N - 1);
    const j1 = Math.min(j0 + 1, N - 1);
    const fx = g.i - i0;
    const fz = g.j - j0;
    const a = this.sdf[this.idx(i0, j0)];
    const b = this.sdf[this.idx(i1, j0)];
    const c = this.sdf[this.idx(i0, j1)];
    const d = this.sdf[this.idx(i1, j1)];
    return a * (1 - fx) * (1 - fz) + b * fx * (1 - fz) + c * (1 - fx) * fz + d * fx * fz;
  }

  sampleType(x, z) {
    const g = worldToGrid(x, z);
    return this.type[this.idx(Math.round(g.i), Math.round(g.j))];
  }

  isWaterWorld(x, z, level = 0) {
    return this.sample(x, z) < level;
  }

  stampCenterPond() {
    const rx = 1.28;
    const rz = 0.82;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const p = gridToWorld(i, j);
        const dist = Math.hypot(p.x / rx, p.y / rz) - 1;
        const id = this.idx(i, j);
        if (dist < this.sdf[id]) this.sdf[id] = dist;
      }
    }
  }

  stampCapsule(ax, az, bx, bz, radius, type, sid) {
    const minx = Math.min(ax, bx) - radius - 0.2;
    const maxx = Math.max(ax, bx) + radius + 0.2;
    const minz = Math.min(az, bz) - radius - 0.2;
    const maxz = Math.max(az, bz) + radius + 0.2;
    const g0 = worldToGrid(minx, minz);
    const g1 = worldToGrid(maxx, maxz);
    const i0 = Math.max(0, Math.floor(g0.i));
    const j0 = Math.max(0, Math.floor(g0.j));
    const i1 = Math.min(N - 1, Math.ceil(g1.i));
    const j1 = Math.min(N - 1, Math.ceil(g1.j));
    const vx = bx - ax;
    const vz = bz - az;
    const len2 = vx * vx + vz * vz || 1e-6;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const p = gridToWorld(i, j);
        if (!insideIsland(p.x, p.y)) continue;
        let t = ((p.x - ax) * vx + (p.y - az) * vz) / len2;
        t = THREE.MathUtils.clamp(t, 0, 1);
        const qx = ax + vx * t;
        const qz = az + vz * t;
        const dist = Math.hypot(p.x - qx, p.y - qz) - radius;
        const id = this.idx(i, j);
        if (dist < this.sdf[id]) {
          this.sdf[id] = dist;
          this.strokeId[id] = sid;
        }
        if (dist < 0.16 && type > this.type[id]) this.type[id] = type;
      }
    }
  }

  stampCircle(x, z, radius, type, sid) {
    this.stampCapsule(x, z, x, z, radius, type, sid);
  }

  stampStroke(points, widthKey, sid) {
    const radius = WIDTHS[widthKey] * 0.5;
    const type = TYPE[widthKey];
    if (points.length === 1) {
      this.stampCircle(points[0].x, points[0].y, radius * 1.35, type, sid);
      return;
    }
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      this.stampCapsule(a.x, a.y, b.x, b.y, radius, type, sid);
    }
  }

  eraseStroke(points, radius) {
    if (points.length === 0) return;
    const pts = points.length === 1 ? [points[0], points[0]] : points;
    for (let s = 0; s < pts.length - 1; s++) {
      const ax = pts[s].x;
      const az = pts[s].y;
      const bx = pts[s + 1].x;
      const bz = pts[s + 1].y;
      const minx = Math.min(ax, bx) - radius;
      const maxx = Math.max(ax, bx) + radius;
      const minz = Math.min(az, bz) - radius;
      const maxz = Math.max(az, bz) + radius;
      const g0 = worldToGrid(minx, minz);
      const g1 = worldToGrid(maxx, maxz);
      const vx = bx - ax;
      const vz = bz - az;
      const len2 = vx * vx + vz * vz || 1e-6;
      for (let j = Math.max(0, Math.floor(g0.j)); j <= Math.min(N - 1, Math.ceil(g1.j)); j++) {
        for (let i = Math.max(0, Math.floor(g0.i)); i <= Math.min(N - 1, Math.ceil(g1.i)); i++) {
          const p = gridToWorld(i, j);
          let t = ((p.x - ax) * vx + (p.y - az) * vz) / len2;
          t = THREE.MathUtils.clamp(t, 0, 1);
          const dist = Math.hypot(p.x - (ax + vx * t), p.y - (az + vz * t));
          if (dist < radius) {
            const id = this.idx(i, j);
            this.sdf[id] = 12;
            this.type[id] = 0;
            this.strokeId[id] = -1;
          }
        }
      }
    }
    this.stampCenterPond();
  }

  cloneState() {
    return {
      sdf: this.sdf.slice(),
      type: this.type.slice(),
      strokeId: this.strokeId.slice(),
    };
  }

  restore(state) {
    this.sdf.set(state.sdf);
    this.type.set(state.type);
    this.strokeId.set(state.strokeId);
  }

  syncTexture() {
    const d = this.texData;
    for (let i = 0; i < N * N; i++) {
      const v = THREE.MathUtils.clamp(this.sdf[i] * 0.04 + 0.5, 0, 1);
      d[i * 4] = Math.round(v * 255);
      d[i * 4 + 1] = this.type[i] * 80;
      d[i * 4 + 2] = 0;
      d[i * 4 + 3] = 255;
    }
    this.texture.needsUpdate = true;
  }
}

const GRASS_A = new THREE.Color(0x6b8a54);
const GRASS_B = new THREE.Color(0x7d9a60);
const STAIN = new THREE.Color(0x3f5234);
const MUDFLAT = new THREE.Color(0x6e5844);
const TMP_C = new THREE.Color();

function islandVertexColor(x, z, sdf, tide) {
  const carve = smooth01(0.2, -0.08, sdf);
  TMP_C.copy(GRASS_A).lerp(GRASS_B, noise2(x * 2.2, z * 2.2));
  TMP_C.lerp(STAIN, THREE.MathUtils.clamp((0.08 - sdf) * 2.4, 0, 1));
  const dry = THREE.MathUtils.clamp(1 - tide * 1.15, 0, 1);
  TMP_C.lerp(MUDFLAT, carve * dry);
  TMP_C.lerp(STAIN, carve * (1 - dry) * 0.55);
  return TMP_C;
}

export function createIsland(grid, mats, tide = 0.52) {
  const rings = 56;
  const segs = 96;
  const positions = [];
  const colors = [];
  const indices = [];

  for (let r = 0; r <= rings; r++) {
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const theta = t * Math.PI * 2;
      const R = islandRadius(theta);
      const rr = (r / rings) * R;
      const x = Math.cos(theta) * rr;
      const z = Math.sin(theta) * rr;
      const sdf = grid.sample(x, z);
      const base = terrainHeight(x, z);
      const carve = smooth01(0.2, -0.08, sdf);
      const y = THREE.MathUtils.lerp(base, 0.015, carve);
      positions.push(x, y, z);
      islandVertexColor(x, z, sdf, tide);
      colors.push(TMP_C.r, TMP_C.g, TMP_C.b);
    }
  }

  const stride = segs + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * stride + s;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData.rings = rings;
  mesh.userData.segs = segs;
  return mesh;
}

export function updateIsland(mesh, grid, tide = 0.52) {
  const pos = mesh.geometry.attributes.position;
  const col = mesh.geometry.attributes.color;
  const rings = mesh.userData.rings;
  const segs = mesh.userData.segs;
  let k = 0;
  for (let r = 0; r <= rings; r++) {
    for (let s = 0; s <= segs; s++) {
      const x = pos.getX(k);
      const z = pos.getZ(k);
      const sdf = grid.sample(x, z);
      const base = terrainHeight(x, z);
      const carve = smooth01(0.2, -0.08, sdf);
      pos.setY(k, THREE.MathUtils.lerp(base, 0.015, carve));
      islandVertexColor(x, z, sdf, tide);
      col.setXYZ(k, TMP_C.r, TMP_C.g, TMP_C.b);
      k++;
    }
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

export function createDish(mats) {
  const g = new THREE.Group();
  const torus = new THREE.TorusGeometry(7.55, 0.44, 10, 64);
  torus.rotateX(Math.PI / 2);
  const lip = new THREE.Mesh(torus, mats.dish);
  lip.position.y = 0.18;
  lip.castShadow = true;
  lip.receiveShadow = true;
  g.add(lip);
  const under = new THREE.Mesh(new THREE.CylinderGeometry(7.35, 6.6, 0.7, 48, 1, true), mats.dish);
  under.position.y = -0.22;
  g.add(under);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(6.6, 48), mats.mudWet);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = -0.55;
  g.add(bottom);
  return g;
}

export function buildWetGeometry(grid, level) {
  const positions = [];
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const s00 = grid.sdf[j * N + i];
      const s10 = grid.sdf[j * N + i + 1];
      const s01 = grid.sdf[(j + 1) * N + i];
      const s11 = grid.sdf[(j + 1) * N + i + 1];
      if ((s00 + s10 + s01 + s11) * 0.25 >= level) continue;
      const p00 = gridToWorld(i, j);
      const p10 = gridToWorld(i + 1, j);
      const p01 = gridToWorld(i, j + 1);
      const p11 = gridToWorld(i + 1, j + 1);
      positions.push(
        p00.x, 0, p00.y,
        p01.x, 0, p01.y,
        p10.x, 0, p10.y,
        p10.x, 0, p10.y,
        p01.x, 0, p01.y,
        p11.x, 0, p11.y
      );
    }
  }
  const geo = new THREE.BufferGeometry();
  if (positions.length) {
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }
  return geo;
}

export function createWater(grid) {
  const group = new THREE.Group();
  const waterMat = new THREE.MeshBasicMaterial({
    color: 0x8fcfc4,
    transparent: true,
    opacity: 0.88,
    depthWrite: true,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const mudMat = new THREE.MeshLambertMaterial({
    color: 0x6e5844,
  });
  const waterMesh = new THREE.Mesh(buildWetGeometry(grid, 0.1), waterMat);
  const mudMesh = new THREE.Mesh(buildWetGeometry(grid, 0.22), mudMat);
  mudMesh.position.y = 0.016;
  waterMesh.position.y = 0.16;
  waterMesh.renderOrder = 2;
  group.add(mudMesh);
  group.add(waterMesh);
  group.userData.waterMesh = waterMesh;
  group.userData.mudMesh = mudMesh;
  group.userData.waterMat = waterMat;
  group.userData.mudMat = mudMat;
  return group;
}

export function rebuildWater(group, grid, tide) {
  group.userData.waterMesh.geometry.dispose();
  group.userData.waterMesh.geometry = buildWetGeometry(grid, 0.1);
  group.userData.mudMesh.geometry.dispose();
  group.userData.mudMesh.geometry = buildWetGeometry(grid, 0.22);
  group.userData.waterMesh.position.y = tideToWaterY(tide);
  const mat = group.userData.waterMat;
  mat.opacity = THREE.MathUtils.lerp(0.18, 0.9, tide);
  const dryCol = new THREE.Color(0x8a9a70);
  const wetCol = new THREE.Color(0x8fcfc4);
  mat.color.copy(dryCol).lerp(wetCol, tide);
  group.userData.mudMat.color.set(tide < 0.42 ? 0x7a6248 : 0x534536);
  group.userData.mudMesh.visible = tide < 0.84;
}

export function tideToLevel(_t) {
  return 0.1;
}

export function tideToWaterY(t) {
  return THREE.MathUtils.lerp(0.045, 0.2, t);
}

export function smooth01(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function polylineLength(points) {
  let L = 0;
  for (let i = 1; i < points.length; i++) L += points[i].distanceTo(points[i - 1]);
  return L;
}

export function simplify(points, minDist = 0.08) {
  if (points.length < 2) return points.map((p) => p.clone());
  const out = [points[0].clone()];
  for (let i = 1; i < points.length; i++) {
    if (out[out.length - 1].distanceTo(points[i]) >= minDist) out.push(points[i].clone());
  }
  if (out.length === 1) out.push(points[points.length - 1].clone());
  return out;
}

export function maxCurvaturePoint(points) {
  if (points.length < 3) return { p: points[Math.floor(points.length / 2)], t: 0.5 };
  let best = 0;
  let bestI = Math.floor(points.length / 2);
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i].clone().sub(points[i - 1]).normalize();
    const b = points[i + 1].clone().sub(points[i]).normalize();
    const k = 1 - THREE.MathUtils.clamp(a.dot(b), -1, 1);
    if (k > best) {
      best = k;
      bestI = i;
    }
  }
  return { p: points[bestI], t: bestI / (points.length - 1), k: best };
}

export function segIntersect(a, b, c, d) {
  const den = (d.y - c.y) * (b.x - a.x) - (d.x - c.x) * (b.y - a.y);
  if (Math.abs(den) < 1e-8) return null;
  const ua = ((d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x)) / den;
  const ub = ((b.x - a.x) * (a.y - c.y) - (b.y - a.y) * (a.x - c.x)) / den;
  if (ua <= 0.04 || ua >= 0.96 || ub <= 0.04 || ub >= 0.96) return null;
  return new THREE.Vector2(a.x + ua * (b.x - a.x), a.y + ua * (b.y - a.y));
}

export function findIntersections(strokes) {
  const hits = [];
  for (let i = 0; i < strokes.length; i++) {
    for (let j = i + 1; j < strokes.length; j++) {
      const A = strokes[i].points;
      const B = strokes[j].points;
      for (let ia = 0; ia < A.length - 1; ia++) {
        for (let ib = 0; ib < B.length - 1; ib++) {
          const p = segIntersect(A[ia], A[ia + 1], B[ib], B[ib + 1]);
          if (p) hits.push({ x: p.x, z: p.y, a: strokes[i].id, b: strokes[j].id });
        }
      }
    }
  }
  const uniq = [];
  for (const h of hits) {
    if (!uniq.some((u) => Math.hypot(u.x - h.x, u.z - h.z) < 0.55)) uniq.push(h);
  }
  return uniq;
}

export function applyTimeOfDay(t, ctx) {
  const dusk = smooth01(0.32, 0.88, t);
  const mist = 1 - smooth01(0.0, 0.42, t);

  const skyMorn = new THREE.Color(0xc5d2c8);
  const skyDusk = new THREE.Color(0xc49a72);
  const sky = skyMorn.clone().lerp(skyDusk, dusk);
  ctx.scene.background = sky;
  ctx.scene.fog.color.copy(sky);
  ctx.scene.fog.density = 0.02 + mist * 0.032;

  ctx.hemi.color.set(0xe6efe4).lerp(new THREE.Color(0xf0c8a0), dusk);
  ctx.hemi.groundColor.set(0x3a4538);
  ctx.hemi.intensity = 0.92 - dusk * 0.18;

  ctx.sun.color.set(0xf2f0e0).lerp(new THREE.Color(0xffb070), dusk);
  ctx.sun.intensity = 0.92 - dusk * 0.22;
  const ang = THREE.MathUtils.lerp(0.88, 0.2, t);
  ctx.sun.position.set(Math.cos(ang) * 12, Math.sin(ang) * 10 + 1.5, 6);

  if (ctx.water && ctx.water.userData.waterMat) {
    const pale = new THREE.Color(0x8fcfc4);
    const duskWater = new THREE.Color(0x6aa090);
    ctx.water.userData.waterMat.color.copy(pale).lerp(duskWater, dusk * 0.45);
  }
}
