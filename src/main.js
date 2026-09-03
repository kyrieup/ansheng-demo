import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  WIDTHS,
  TYPE,
  makePalette,
  WaterGrid,
  createIsland,
  updateIsland,
  createDish,
  createWater,
  rebuildWater,
  tideToLevel,
  tideToWaterY,
  insideIsland,
  simplify,
  polylineLength,
  findIntersections,
  applyTimeOfDay,
  terrainHeight,
} from './world.js';
import { Town } from './town.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb8896a);
scene.fog = new THREE.FogExp2(0xb8896a, 0.038);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 80);
camera.position.set(8.2, 8.4, 8.6);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0.25, 0);
controls.minDistance = 6.5;
controls.maxDistance = 20;
controls.minPolarAngle = 0.55;
controls.maxPolarAngle = 1.12;
controls.enablePan = false;
controls.mouseButtons = {
  LEFT: -1,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.ROTATE,
};
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };

const hemi = new THREE.HemisphereLight(0xf0c8a0, 0x4a4034, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb070, 1.1);
sun.position.set(8, 6, 5);
sun.castShadow = false;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 30;
sun.shadow.camera.left = -10;
sun.shadow.camera.right = 10;
sun.shadow.camera.top = 10;
sun.shadow.camera.bottom = -10;
sun.shadow.bias = -0.0008;
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffe6c8, 0.55));

const mats = makePalette();
const grid = new WaterGrid();
const island = createIsland(grid, mats);
scene.add(island);
scene.add(createDish(mats));
const water = createWater(grid);
rebuildWater(water, grid, 0.5);
scene.add(water);

const preview = new THREE.Mesh(new THREE.BufferGeometry(), mats.preview);
preview.frustumCulled = false;
scene.add(preview);

const town = new Town(scene, mats);
const mirrors = new THREE.Group();
mirrors.name = "mirrors";
scene.add(mirrors);

function syncMirrors() {
  while (mirrors.children.length) {
    const c = mirrors.children[0];
    mirrors.remove(c);
  }
  const clone = town.group.clone(true);
  clone.traverse((obj) => {
    if (obj.material) {
      const matsArr = Array.isArray(obj.material) ? obj.material : [obj.material];
      const next = matsArr.map((mat) => {
        const cm = mat.clone();
        cm.transparent = true;
        cm.opacity = (cm.opacity ?? 1) * 0.35;
        cm.depthWrite = false;
        return cm;
      });
      obj.material = Array.isArray(obj.material) ? next : next[0];
      obj.castShadow = false;
    }
  });
  const wy = tideToWaterY(tide);
  clone.scale.y = -1;
  clone.position.y = 2 * wy;
  mirrors.add(clone);
}


const ctx = { scene, mats, hemi, sun, water };

let tide = 0.5;
let tod = 0.68;
let width = 'narrow';
let eraseMode = false;
let drawing = false;
let strokePts = [];
let nextId = 1;
let strokes = [];
const history = [];

applyTimeOfDay(tod, ctx);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const drawPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.28);
const hit = new THREE.Vector3();

function hitIsland(ev) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const isleHits = raycaster.intersectObject(island, false);
  if (isleHits.length) return isleHits[0].point;
  if (raycaster.ray.intersectPlane(drawPlane, hit)) return hit.clone();
  return null;
}

function buildRibbon(points, half) {
  if (points.length < 2) return new THREE.BufferGeometry();
  const left = [];
  const right = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    const nx = -tz / len;
    const nz = tx / len;
    left.push(p.x + nx * half, p.y, p.z + nz * half);
    right.push(p.x - nx * half, p.y, p.z - nz * half);
  }
  const pos = [];
  const idx = [];
  for (let i = 0; i < points.length; i++) {
    pos.push(left[i * 3], left[i * 3 + 1], left[i * 3 + 2]);
    pos.push(right[i * 3], right[i * 3 + 1], right[i * 3 + 2]);
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function updatePreview() {
  if (strokePts.length < 2) {
    preview.geometry.dispose();
    preview.geometry = new THREE.BufferGeometry();
    return;
  }
  const pts = strokePts.map((p) => new THREE.Vector3(p.x, 0.22, p.y));
  const half = (eraseMode ? 0.28 : WIDTHS[width] * 0.5) + 0.02;
  preview.geometry.dispose();
  preview.geometry = buildRibbon(pts, half);
  mats.preview.color.set(eraseMode ? 0xc07060 : 0x7ec8c4);
}

function snapshot() {
  history.push({
    grid: grid.cloneState(),
    strokes: strokes.map((s) => ({
      id: s.id,
      width: s.width,
      points: s.points.map((p) => p.clone()),
      connected: s.connected,
    })),
    nextId,
  });
  if (history.length > 24) history.shift();
}

function landmarksFrom(list) {
  const junctions = findIntersections(list).map((h) => ({ x: h.x, z: h.z, dir: 0 }));
  const deadends = [];
  for (const s of list) {
    const pts = s.points;
    if (pts.length < 1) continue;
    const ends = [pts[0], pts[pts.length - 1]];
    for (const e of ends) {
      const nearOther = list.some((o) => {
        if (o.id === s.id) return false;
        return o.points.some((p) => p.distanceTo(e) < 0.55);
      });
      const nearCenter = e.length() < 1.5;
      if (!nearOther && !nearCenter) deadends.push({ x: e.x, z: e.y });
    }
  }
  const uniq = [];
  for (const d of deadends) {
    if (!uniq.some((u) => Math.hypot(u.x - d.x, u.z - d.z) < 0.6)) uniq.push(d);
  }
  return { junctions, deadends: uniq };
}

function rebuildGridFromStrokes() {
  grid.sdf.fill(12);
  grid.type.fill(0);
  grid.strokeId.fill(-1);
  grid.stampCenterPond();
  for (const s of strokes) {
    grid.stampStroke(s.points, s.width, s.id);
  }
}

function commitStroke() {
  const pts = simplify(strokePts, 0.07);
  strokePts = [];
  updatePreview();
  if (pts.length < 1) return;
  const L = polylineLength(pts);
  if (L < 0.18 && pts.length < 3) {
    const p = pts[0];
    pts.push(new THREE.Vector2(p.x + 0.05, p.y));
  }

  snapshot();

  if (eraseMode) {
    strokes = strokes
      .map((s) => ({
        ...s,
        points: s.points.filter((p) => pts.every((q) => p.distanceTo(q) > WIDTHS[width] * 0.65)),
      }))
      .filter((s) => s.points.length > 1);
    rebuildGridFromStrokes();
    finishRebuild(pts);
    return;
  }

  const start = pts[0];
  const end = pts[pts.length - 1];
  const connected =
    grid.sample(start.x, start.y) < 0.18 || grid.sample(end.x, end.y) < 0.18;

  if (!connected && L < 2.2) {
    const c = pts.reduce((a, p) => a.add(p), new THREE.Vector2()).multiplyScalar(1 / pts.length);
    grid.stampCircle(c.x, c.y, Math.max(0.45, WIDTHS[width] * 0.7), TYPE[width], nextId);
    const pondPts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      pondPts.push(new THREE.Vector2(c.x + Math.cos(a) * 0.35, c.y + Math.sin(a) * 0.35));
    }
    strokes.push({ id: nextId++, width, points: pondPts, connected: false });
    finishRebuild(pts);
    return;
  }

  const id = nextId++;
  grid.stampStroke(pts, width, id);
  if (!connected) {
    grid.stampCircle(end.x, end.y, WIDTHS[width] * 0.85, TYPE[width], id);
    grid.stampCircle(start.x, start.y, WIDTHS[width] * 0.85, TYPE[width], id);
  }
  strokes.push({ id, width, points: pts, connected });
  finishRebuild(pts);
}

function finishRebuild(growPath) {
  grid.syncTexture();
  updateIsland(island, grid);
  rebuildWater(water, grid, tide);
  const lm = landmarksFrom(strokes);
  town.rebuild(grid, strokes, lm, growPath);
  town.applyTide(tide);
  syncMirrors();
}

function undo() {
  const snap = history.pop();
  if (!snap) return;
  grid.restore(snap.grid);
  strokes = snap.strokes;
  nextId = snap.nextId;
  grid.syncTexture();
  updateIsland(island, grid);
  rebuildWater(water, grid, tide);
  town.rebuild(grid, strokes, landmarksFrom(strokes), null);
  town.applyTide(tide);
  syncMirrors();
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const p = hitIsland(e);
  if (!p || !insideIsland(p.x, p.z)) return;
  drawing = true;
  strokePts = [new THREE.Vector2(p.x, p.z)];
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  const p = hitIsland(e);
  if (!p || !insideIsland(p.x, p.z)) return;
  const last = strokePts[strokePts.length - 1];
  const q = new THREE.Vector2(p.x, p.z);
  if (last.distanceTo(q) < 0.05) return;
  strokePts.push(q);
  updatePreview();
});

function endDraw(e) {
  if (!drawing) return;
  drawing = false;
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch (_) {}
  commitStroke();
}

canvas.addEventListener('pointerup', endDraw);
canvas.addEventListener('pointercancel', endDraw);

document.getElementById('widths').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-w]');
  if (!btn) return;
  width = btn.dataset.w;
  for (const b of document.querySelectorAll('#widths button')) b.classList.toggle('on', b === btn);
});

const eraseBtn = document.getElementById('erase');
eraseBtn.addEventListener('click', () => {
  eraseMode = !eraseMode;
  eraseBtn.classList.toggle('on', eraseMode);
});

document.getElementById('undo').addEventListener('click', undo);
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
    e.preventDefault();
    undo();
  }
});

document.getElementById('tide').addEventListener('input', (e) => {
  tide = Number(e.target.value) / 100;
  rebuildWater(water, grid, tide);
  town.applyTide(tide);
  syncMirrors();
});

document.getElementById('tod').addEventListener('input', (e) => {
  tod = Number(e.target.value) / 100;
  applyTimeOfDay(tod, ctx);
});

document.getElementById('shot').addEventListener('click', () => {
  document.body.classList.add('shot');
  renderer.render(scene, camera);
  requestAnimationFrame(() => {
    const a = document.createElement('a');
    a.download = 'ansheng.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
    document.body.classList.remove('shot');
  });
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

applyTimeOfDay(tod, ctx);
rebuildWater(water, grid, tide);

const bootParams = new URLSearchParams(location.search);
if (bootParams.has("shot") || bootParams.has("river") || bootParams.has("empty")) {
  document.body.classList.add("shot");
}
if (bootParams.has("shot") || bootParams.has("river")) {
  width = "river";
  strokePts = [];
  if (bootParams.has("river") && !bootParams.has("shot")) {
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      strokePts.push(new THREE.Vector2(2.55 + Math.sin(u * 1.55) * 0.7, -3.55 + u * 7.4));
    }
    commitStroke();
  } else {
    for (let i = 0; i <= 20; i++) {
      const u = i / 20;
      strokePts.push(new THREE.Vector2(Math.sin(u * 2.4) * 1.35, -0.15 + u * 4.8));
    }
    commitStroke();
    width = "narrow";
    strokePts = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      strokePts.push(new THREE.Vector2(-2.4 + u * 4.8, 2.15 + Math.sin(u * 3.1) * 0.25));
    }
    commitStroke();
    width = "harbor";
    strokePts = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      strokePts.push(new THREE.Vector2(2.2 + Math.sin(u * 1.2) * 0.4, -0.6 + u * 2.4));
    }
    commitStroke();
  }
  town.snapGrow();
  syncMirrors();
}

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  controls.update();
  town.tick(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
