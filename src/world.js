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
  const bowl = (1 - d * d) * 0.38;
  const n = 0.05 * noise2(x * 0.45, z * 0.45) + 0.025 * noise2(x * 1.1, z * 1.1);
  const rim = Math.exp(-((d - 0.82) * (d - 0.82)) * 28) * 0.07;
  return THREE.MathUtils.clamp(0.22 + bowl + n + rim, 0.16, 0.58);
}

export function makePalette() {
  const std = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.86,
      metalness: 0.02,
      ...extra,
    });
  return {
    plaster: std(0xf4f1ea, { roughness: 0.7, emissive: 0xb8b4aa, emissiveIntensity: 0.55, toneMapped: false }),
    plasterWarm: std(0xfaf6ee, { roughness: 0.7, emissive: 0xc4b8a8, emissiveIntensity: 0.45, toneMapped: false }),
    timber: std(0x3a2a22),
    roof: std(0x4b5058),
    roofBlue: std(0x44515a),
    brick: std(0x8a5a48),
    brickDark: std(0x6f4638),
    stone: std(0x9a9388),
    stoneLight: std(0xb4ada0),
    wood: std(0x5c4030),
    woodLight: std(0x7a5640),
    mud: std(0x6a4c38, { roughness: 1 }),
    mudWet: std(0x4e382c, { roughness: 0.95 }),
    grass: std(0x3cba5c, { emissive: 0x145a22, emissiveIntensity: 0.35 }),
    dish: std(0x6e6458, { roughness: 0.7 }),
    clothA: std(0xc45c4a, { side: THREE.DoubleSide }),
    clothB: std(0xd8c8a0, { side: THREE.DoubleSide }),
    clothC: std(0x4d6d72, { side: THREE.DoubleSide }),
    boat: std(0x5a3f30),
    boatDark: std(0x2e2118),
    catOrange: std(0xc47a3a),
    catBlack: std(0x222018),
    catWhite: std(0xe8e0d4),
    window: new THREE.MeshBasicMaterial({
      color: 0x1a1410,
      toneMapped: false,
    }),
    lantern: new THREE.MeshBasicMaterial({
      color: 0xffb060,
      toneMapped: false,
    }),
    preview: new THREE.MeshBasicMaterial({
      color: 0x4edcc8,
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
    const r = 1.22;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const p = gridToWorld(i, j);
        const dist = Math.hypot(p.x, p.y) - r;
        const id = this.idx(i, j);
        if (dist < this.sdf[id]) {
          this.sdf[id] = dist;
        }
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

export function createIsland(grid, mats) {
  const rings = 56;
  const segs = 96;
  const positions = [];
  const colors = [];
  const normals = [];
  const indices = [];
  const grass = new THREE.Color(0x3cc85a);
  const grass2 = new THREE.Color(0x58d86e);
  const dirt = new THREE.Color(0x6a5340);
  const mud = new THREE.Color(0x5a4030);
  const tmpC = new THREE.Color();

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
      tmpC.copy(grass).lerp(grass2, noise2(x * 2.2, z * 2.2));
      tmpC.lerp(dirt, THREE.MathUtils.clamp((0.06 - sdf) * 2.2, 0, 1));
      tmpC.lerp(mud, carve);
      colors.push(tmpC.r, tmpC.g, tmpC.b);
      normals.push(0, 1, 0);
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

export function updateIsland(mesh, grid) {
  const pos = mesh.geometry.attributes.position;
  const col = mesh.geometry.attributes.color;
  const rings = mesh.userData.rings;
  const segs = mesh.userData.segs;
  const grass = new THREE.Color(0x3cc85a);
  const grass2 = new THREE.Color(0x58d86e);
  const dirt = new THREE.Color(0x6a5340);
  const mud = new THREE.Color(0x5a4030);
  const tmpC = new THREE.Color();
  let k = 0;
  for (let r = 0; r <= rings; r++) {
    for (let s = 0; s <= segs; s++) {
      const x = pos.getX(k);
      const z = pos.getZ(k);
      const sdf = grid.sample(x, z);
      const base = terrainHeight(x, z);
      const carve = smooth01(0.2, -0.08, sdf);
      pos.setY(k, THREE.MathUtils.lerp(base, 0.015, carve));
      tmpC.copy(grass).lerp(grass2, noise2(x * 2.2, z * 2.2));
      tmpC.lerp(dirt, THREE.MathUtils.clamp((0.06 - sdf) * 2.2, 0, 1));
      tmpC.lerp(mud, carve);
      col.setXYZ(k, tmpC.r, tmpC.g, tmpC.b);
      k++;
    }
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

export function createDish(mats) {
  const g = new THREE.Group();
  const torus = new THREE.TorusGeometry(7.55, 0.38, 10, 64);
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


export function buildCanalGeometry(grid, level) {
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
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }
  return geo;
}

export function createWater(grid) {
  const group = new THREE.Group();
  const waterMat = new THREE.MeshBasicMaterial({
    color: 0x1ee8c4,
    transparent: true,
    opacity: 0.92,
    depthWrite: true,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const mudMat = new THREE.MeshLambertMaterial({
    color: 0x5a4030,
  });
  const waterMesh = new THREE.Mesh(buildCanalGeometry(grid, 0.08), waterMat);
  const mudMesh = new THREE.Mesh(buildCanalGeometry(grid, 0.22), mudMat);
  mudMesh.position.y = 0.018;
  waterMesh.position.y = 0.26;
  waterMesh.renderOrder = 2;
  group.add(mudMesh);
  group.add(waterMesh);
  group.userData.waterMesh = waterMesh;
  group.userData.mudMesh = mudMesh;
  group.userData.waterMat = waterMat;
  return group;
}

export function rebuildWater(group, grid, tide) {
  const level = tideToLevel(tide);
  group.userData.waterMesh.geometry.dispose();
  group.userData.waterMesh.geometry = buildCanalGeometry(grid, level);
  group.userData.mudMesh.geometry.dispose();
  group.userData.mudMesh.geometry = buildCanalGeometry(grid, Math.max(level, 0.2));
  group.userData.waterMesh.position.y = tideToWaterY(tide);
}

export function tideToLevel(t) {
  return THREE.MathUtils.lerp(-0.08, 0.38, t);
}

export function tideToWaterY(t) {
  return THREE.MathUtils.lerp(0.07, 0.48, t);
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
  const dusk = smooth01(0.35, 0.62, t);
  const night = smooth01(0.72, 0.95, t);
  const glow = THREE.MathUtils.clamp(dusk * 1.15 - night * 0.15, 0, 1);

  ctx.mats.window.color.setRGB(
    0.12 + glow * 1.05,
    0.09 + glow * 0.58,
    0.06 + glow * 0.18
  );
  ctx.mats.lantern.color.setRGB(0.55 + glow * 0.5, 0.28 + glow * 0.35, 0.08 + glow * 0.1);

  const skyDay = new THREE.Color(0x9bb3c0);
  const skyDusk = new THREE.Color(0xb8896a);
  const skyNight = new THREE.Color(0x1b1a24);
  const sky = skyDay.clone().lerp(skyDusk, dusk).lerp(skyNight, night);
  ctx.scene.background = sky;
  ctx.scene.fog.color.copy(sky);
  ctx.scene.fog.density = 0.028 + dusk * 0.012;

  ctx.hemi.color.set(dusk > 0.4 ? 0xe0b090 : 0xdde6ee).lerp(new THREE.Color(0x334), night);
  ctx.hemi.groundColor.set(0x3a342c);
  ctx.hemi.intensity = 0.7 - night * 0.25;

  ctx.sun.color.set(dusk > 0.35 ? 0xffb070 : 0xfff2d8).lerp(new THREE.Color(0x8899cc), night);
  ctx.sun.intensity = 1.35 - dusk * 0.45 - night * 0.5;
  const ang = THREE.MathUtils.lerp(0.72, 0.12, t);
  ctx.sun.position.set(Math.cos(ang) * 12, Math.sin(ang) * 10 + 1.5, 6);

  if (ctx.water && ctx.water.userData.waterMat) {
    const deep = new THREE.Color(0x1ee8c4).lerp(new THREE.Color(0x20a898), dusk * 0.35);
    ctx.water.userData.waterMat.color.copy(deep);
    ctx.water.userData.waterMat.specular = new THREE.Color(dusk > 0.5 ? 0xd4c4a0 : 0xc4f2ea);
  }
}
