import * as THREE from 'three';
import {
  GRASS_DRY,
  GRASS_WET,
  MUD_DRY,
  MUD_WET,
  DISH,
  DISH_BOTTOM,
  DISH_LIP,
  WATER_DRY,
  WATER_WET,
  SUN_DUSK,
  SKY_STOPS,
  lerpStops,
  ART_PATHS,
} from './config/look.js';

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
      metalness: 0,
      toneMapped: true,
      ...extra,
    });
  return {
    grass: std(GRASS_DRY, { emissive: 0x243818, emissiveIntensity: 0.22 }),
    dish: std(DISH, { roughness: 0.78 }),
    dishBottom: std(DISH_BOTTOM, { roughness: 0.95 }),
    mud: std(MUD_DRY, { roughness: 1 }),
    mudWet: std(MUD_WET, { roughness: 0.95 }),
    reedStem: std(0x4d6a38, { roughness: 0.82 }),
    reedHead: std(0xa07848, { roughness: 0.7 }),
    bill: std(0x8a8478, { roughness: 0.85 }),
    sparrow: std(0x5a4638),
    duck: std(0x3e4a36),
    sandpiper: std(0x8a7060),
    heron: std(0x6a6e70),
    dragonfly: std(0x3a5a38, {
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
      roughness: 0.55,
    }),
    preview: new THREE.MeshBasicMaterial({
      color: 0x8fcfc4,
      transparent: true,
      opacity: 0.72,
      depthWrite: true,
      toneMapped: false,
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

  /** On release: pull the wet edge one more notch so the soak "sets". */
  deepenWet(points, widthKey, sid) {
    if (!points?.length) return;
    const radius = WIDTHS[widthKey] * 0.56;
    const type = TYPE[widthKey];
    const notch = 0.05;
    const pts = points.length === 1 ? [points[0], points[0]] : points;
    for (let s = 0; s < pts.length - 1; s++) {
      const ax = pts[s].x;
      const az = pts[s].y;
      const bx = pts[s + 1].x;
      const bz = pts[s + 1].y;
      const minx = Math.min(ax, bx) - radius - 0.16;
      const maxx = Math.max(ax, bx) + radius + 0.16;
      const minz = Math.min(az, bz) - radius - 0.16;
      const maxz = Math.max(az, bz) + radius + 0.16;
      const g0 = worldToGrid(minx, minz);
      const g1 = worldToGrid(maxx, maxz);
      const vx = bx - ax;
      const vz = bz - az;
      const len2 = vx * vx + vz * vz || 1e-6;
      for (let j = Math.max(0, Math.floor(g0.j)); j <= Math.min(N - 1, Math.ceil(g1.j)); j++) {
        for (let i = Math.max(0, Math.floor(g0.i)); i <= Math.min(N - 1, Math.ceil(g1.i)); i++) {
          const p = gridToWorld(i, j);
          if (!insideIsland(p.x, p.y)) continue;
          let t = ((p.x - ax) * vx + (p.y - az) * vz) / len2;
          t = THREE.MathUtils.clamp(t, 0, 1);
          const dist = Math.hypot(p.x - (ax + vx * t), p.y - (az + vz * t));
          const reach = radius + 0.12;
          if (dist >= reach) continue;
          const id = this.idx(i, j);
          const fall = 1 - dist / reach;
          const next = this.sdf[id] - notch * fall * fall;
          if (next < this.sdf[id]) {
            this.sdf[id] = next;
            this.strokeId[id] = sid;
          }
          if (dist < radius + 0.04 && type > this.type[id]) this.type[id] = type;
        }
      }
    }
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

const COL_WATER_DRY = new THREE.Color(WATER_DRY);
const COL_WATER_WET = new THREE.Color(WATER_WET);
const COL_GRASS_DRY = new THREE.Color(GRASS_DRY);
const COL_GRASS_WET = new THREE.Color(GRASS_WET);
const COL_MUD_DRY = new THREE.Color(MUD_DRY);
const COL_MUD_WET = new THREE.Color(MUD_WET);
const COL_SPEC_DRY = new THREE.Color(0xb8c4be);
const COL_SPEC_WET = new THREE.Color(0x8ec4be);
const COL_PUDDLE_GLOW = new THREE.Color(0xb8c4c0);
const COZY_DUSK_FOG = new THREE.Color(0xe0b894);
const TMP_G = new THREE.Color();
const TMP_M = new THREE.Color();
const TMP_C = new THREE.Color();

function islandVertexColor(x, z, sdf, tide) {
  const carve = smooth01(0.18, -0.05, sdf);
  // Low tide keeps dry palette; wet lerp only kicks in toward 满.
  const wet = THREE.MathUtils.smoothstep(0.2, 0.78, THREE.MathUtils.clamp(tide, 0, 1));
  TMP_G.copy(COL_GRASS_DRY).lerp(COL_GRASS_WET, wet);
  TMP_M.copy(COL_MUD_DRY).lerp(COL_MUD_WET, wet);
  // Dry tide: exposed disc reads as mud; dry grass stays on the outer rim. Wet carve unchanged.
  const rimGrass = smooth01(5.55, 6.55, Math.hypot(x, z));
  const dryMud = (1 - wet) * (1 - rimGrass);
  TMP_C.copy(TMP_G).lerp(TMP_M, THREE.MathUtils.clamp(carve + dryMud * 0.84, 0, 1));
  return TMP_C;
}

export function createIsland(grid, mats, tide = 0.52) {
  const rings = 56;
  const segs = 96;
  const positions = [];
  const colors = [];
  const uvs = [];
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
      uvs.push(x / WORLD + 0.5, z / WORLD + 0.5);
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
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: true,
    side: THREE.DoubleSide,
    toneMapped: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData.rings = rings;
  mesh.userData.segs = segs;
  const pos = geo.attributes.position;
  mesh.userData.baseY = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) mesh.userData.baseY[i] = pos.getY(i);
  return mesh;
}

export function updateIsland(mesh, grid, tide = 0.52, opts = {}) {
  const pos = mesh.geometry.attributes.position;
  const col = mesh.geometry.attributes.color;
  const rings = mesh.userData.rings;
  const segs = mesh.userData.segs;
  if (!mesh.userData.baseY || mesh.userData.baseY.length !== pos.count) {
    mesh.userData.baseY = new Float32Array(pos.count);
  }
  const baseY = mesh.userData.baseY;
  let k = 0;
  for (let r = 0; r <= rings; r++) {
    for (let s = 0; s <= segs; s++) {
      const x = pos.getX(k);
      const z = pos.getZ(k);
      const sdf = grid.sample(x, z);
      const base = terrainHeight(x, z);
      const carve = smooth01(0.2, -0.08, sdf);
      const y = THREE.MathUtils.lerp(base, 0.015, carve);
      baseY[k] = y;
      pos.setY(k, y);
      islandVertexColor(x, z, sdf, tide);
      col.setXYZ(k, TMP_C.r, TMP_C.g, TMP_C.b);
      k++;
    }
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
  if (opts.normals !== false) mesh.geometry.computeVertexNormals();
}

/** Soft spring dip: 2–4cm under the brush tip, from stored base Y. */
export function applyIslandSink(mesh, sink) {
  const pos = mesh.geometry.attributes.position;
  const baseY = mesh.userData.baseY;
  if (!baseY || !sink) return;
  const R = Math.max(0.2, sink.radius || 0.7);
  const amp = sink.amp || 0;
  for (let k = 0; k < pos.count; k++) {
    let y = baseY[k];
    if (amp > 0.0004) {
      const d = Math.hypot(pos.getX(k) - sink.x, pos.getZ(k) - sink.z);
      if (d < R) {
        const u = 1 - d / R;
        y -= amp * u * u;
      }
    }
    pos.setY(k, y);
  }
  pos.needsUpdate = true;
}

export function createDish(mats) {
  const g = new THREE.Group();
  g.name = 'dish';
  g.userData.kind = 'dish';
  g.userData.procedural = true;
  const torus = new THREE.TorusGeometry(DISH_LIP, 0.44, 10, 64);
  torus.rotateX(Math.PI / 2);
  const lip = new THREE.Mesh(torus, mats.dish);
  lip.name = 'lip';
  lip.position.y = 0.18;
  lip.castShadow = true;
  lip.receiveShadow = true;
  g.add(lip);
  const under = new THREE.Mesh(new THREE.CylinderGeometry(7.35, 6.6, 0.7, 48, 1, true), mats.dish);
  under.name = 'wall';
  under.position.y = -0.22;
  under.castShadow = false;
  under.receiveShadow = true;
  g.add(under);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(6.6, 48), mats.dishBottom || mats.mudWet);
  bottom.name = 'bottom';
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = -0.55;
  bottom.castShadow = false;
  bottom.receiveShadow = true;
  g.add(bottom);
  return g;
}

export function buildWetGeometry(grid, level) {
  const positions = [];
  const uvs = [];
  const push = (p) => {
    positions.push(p.x, 0, p.y);
    uvs.push(p.x / (DISH_LIP * 2) + 0.5, p.y / (DISH_LIP * 2) + 0.5);
  };
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
      push(p00);
      push(p01);
      push(p10);
      push(p10);
      push(p01);
      push(p11);
    }
  }
  const geo = new THREE.BufferGeometry();
  if (positions.length) {
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }
  return geo;
}

export function createWater(grid) {
  const group = new THREE.Group();
  const waterMat = new THREE.MeshPhongMaterial({
    color: WATER_WET,
    transparent: true,
    opacity: 0.88,
    shininess: 28,
    specular: 0x6a8884,
    depthWrite: true,
    toneMapped: true,
    fog: true,
    side: THREE.DoubleSide,
  });
  const mudMat = new THREE.MeshLambertMaterial({
    color: MUD_DRY,
    toneMapped: true,
  });
  const waterMesh = new THREE.Mesh(buildWetGeometry(grid, 0.1), waterMat);
  const mudMesh = new THREE.Mesh(buildWetGeometry(grid, 0.22), mudMat);
  mudMesh.position.y = 0.016;
  mudMesh.receiveShadow = true;
  mudMesh.castShadow = false;
  waterMesh.position.y = 0.16;
  waterMesh.renderOrder = 2;
  waterMesh.receiveShadow = true;
  waterMesh.castShadow = false;
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
  mat.opacity = THREE.MathUtils.lerp(0.34, 0.88, tide);
  mat.color.copy(COL_WATER_DRY).lerp(COL_WATER_WET, tide);
  if (tide > 0.97) mat.color.copy(COL_WATER_WET);
  // Dry puddles skip fog so they stay silver, not charcoal pits.
  mat.fog = tide > 0.32 && tide < 0.7;
  mat.emissive.copy(COL_PUDDLE_GLOW).lerp(COL_WATER_WET, tide);
  mat.emissiveIntensity = THREE.MathUtils.lerp(0.055, 0.14, tide);
  mat.shininess = THREE.MathUtils.lerp(22, 96, tide);
  mat.specular.copy(COL_SPEC_DRY).lerp(COL_SPEC_WET, tide);
  if ('roughness' in mat) {
    mat.roughness = THREE.MathUtils.lerp(0.96, 0.08, tide);
    mat.metalness = THREE.MathUtils.lerp(0, 0.12, tide);
  }
  group.userData.mudMat.color.copy(COL_MUD_DRY).lerp(COL_MUD_WET, tide);
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
  const { a, b, u } = lerpStops(t, SKY_STOPS);
  SKY_A.set(a.color);
  SKY_B.set(b.color);
  const sky = SKY_A.clone().lerp(SKY_B, u);
  ctx.scene.background = sky;
  // Cozy dusk: warm rice-apricot. Dawn stays grey-green (thinned below).
  if (t > 0.52 && t < 0.98) {
    const cozy = t <= 0.85 ? THREE.MathUtils.smoothstep(0.52, 0.85, t) : 1 - THREE.MathUtils.smoothstep(0.85, 0.98, t);
    sky.lerp(COZY_DUSK_FOG, cozy * 0.7);
  }
  ctx.scene.fog.color.copy(sky);
  let density = a.density + (b.density - a.density) * u;
  // json dawn 0.062 eats the dish at this camera. Keep grey-green color, thinner mist.
  if (t < 0.35) {
    const mist = 1 - t / 0.35;
    density = THREE.MathUtils.lerp(density, 0.018, mist * mist);
  }
  ctx.scene.fog.density = density;

  const lights = lerpStops(t, LIGHT_STOPS);
  ctx.hemi.color.set(lights.a.hemi).lerp(new THREE.Color(lights.b.hemi), lights.u);
  ctx.hemi.groundColor.set(lights.a.ground).lerp(new THREE.Color(lights.b.ground), lights.u);
  ctx.hemi.intensity = lights.a.hemiI + (lights.b.hemiI - lights.a.hemiI) * lights.u;

  ctx.sun.color.set(lights.a.sun).lerp(new THREE.Color(lights.b.sun), lights.u);
  ctx.sun.intensity = lights.a.sunI + (lights.b.sunI - lights.a.sunI) * lights.u;
  const ang = lights.a.ang + (lights.b.ang - lights.a.ang) * lights.u;
  ctx.sun.position.set(Math.cos(ang) * 14, Math.sin(ang) * 11 + 1.2, 5.5);
  if (ctx.sun.target) {
    ctx.sun.target.position.set(0, 0.15, 0);
    ctx.sun.target.updateMatrixWorld();
  }
  if (ctx.renderer) {
    ctx.renderer.toneMappingExposure = t < 0.3 ? 1.2 : t > 0.7 ? 1.16 : 1.1;
  }
}

const SKY_A = new THREE.Color();
const SKY_B = new THREE.Color();
const LIGHT_STOPS = [
  // Dawn: crushed vs noon, still bright enough that #2A6B68 water and the lip read.
  { t: 0, sun: 0xc5d0c8, sunI: 0.74, hemi: 0xb8c8bc, hemiI: 0.68, ground: 0x364538, ang: 0.7 },
  // Noon may be bright; it is not the default screenshot light.
  { t: 0.5, sun: 0xf8f4e8, sunI: 1.18, hemi: 0xd2ddd4, hemiI: 0.48, ground: 0x3a4538, ang: 1.18 },
  // Dusk: #FFB060 is sun/highlight only — never copied onto a mesh.
  { t: 0.85, sun: SUN_DUSK, sunI: 0.86, hemi: 0xe6d4b8, hemiI: 0.8, ground: 0x5a4636, ang: 0.32 },
  { t: 1, sun: 0x6a7390, sunI: 0.05, hemi: 0x3a3c58, hemiI: 0.22, ground: 0x1a1820, ang: 0.08 },
];

async function loadPng(url) {
  try {
    const tex = await new THREE.TextureLoader().loadAsync(url);
    tex.colorSpace = THREE.NoColorSpace;
    return tex;
  } catch (err) {
    console.error(`[art] failed to load required ${url}`, err);
    throw err;
  }
}

export async function loadArtTextures() {
  return {
    terrain: await loadPng(ART_PATHS.terrain),
    water: await loadPng(ART_PATHS.water),
  };
}

/** PNG v2 maps are near-white grain. They multiply vertex soak / tide lerp and must not replace them. */
export function applyArtTextures(island, water, tex) {
  if (!tex?.terrain || !tex?.water) {
    const err = new Error('[art] required terrain.png / water.png not loaded');
    console.error(err.message);
    throw err;
  }
  tex.terrain.wrapS = THREE.RepeatWrapping;
  tex.terrain.wrapT = THREE.RepeatWrapping;
  tex.terrain.repeat.set(4, 4);
  island.material.map = tex.terrain;
  island.material.vertexColors = true;
  island.material.color.set(0xffffff);
  island.material.toneMapped = true;
  island.material.needsUpdate = true;

  tex.water.wrapS = THREE.ClampToEdgeWrapping;
  tex.water.wrapT = THREE.ClampToEdgeWrapping;
  tex.water.repeat.set(1, 1);
  water.userData.waterMat.map = tex.water;
  water.userData.waterMat.toneMapped = true;
  water.userData.waterMat.needsUpdate = true;
}

