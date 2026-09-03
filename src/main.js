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
  insideIsland,
  simplify,
  polylineLength,
  findIntersections,
  applyTimeOfDay,
  loadOptionalArtTextures,
  applyArtTextures,
} from './world.js';
import { Wetland } from './town.js';
import { loadSlots, setMats, makeDish } from './art/slots.js';
import { save as persistSave, load as loadSave, skipLoad } from './save/local.js';
import { audio } from './audio/hooks.js';
import { createMirrors, rebuildMirrors, applyTideMirrors, syncMirrors } from './render/mirrors.js';
import { SKY_STOPS } from './config/look.js';

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
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY_STOPS[0].color);
scene.fog = new THREE.FogExp2(SKY_STOPS[0].color, SKY_STOPS[0].density);

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

const hemi = new THREE.HemisphereLight(0xe6efe4, 0x3a4538, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xf2f0e0, 0.9);
sun.position.set(8, 8, 5);
sun.castShadow = false;
scene.add(sun);
scene.add(new THREE.AmbientLight(0xe8eee0, 0.5));

const mats = makePalette();
setMats(mats);
const grid = new WaterGrid();
let tide = 0.52;
let tod = 0.2;
const island = createIsland(grid, mats, tide);
scene.add(island);
let dish = createDish(mats);
scene.add(dish);
const water = createWater(grid);
rebuildWater(water, grid, tide);
scene.add(water);

const preview = new THREE.Mesh(new THREE.BufferGeometry(), mats.preview);
preview.frustumCulled = false;
scene.add(preview);

const wetland = new Wetland(scene, mats);
const mirrors = createMirrors(scene);

const ctx = { scene, mats, hemi, sun, water };

let width = 'narrow';
let eraseMode = false;
let drawing = false;
let strokePts = [];
let nextId = 1;
let strokes = [];
const history = [];
const bootParams = new URLSearchParams(location.search);
const skipPersist = skipLoad(location.search);

applyTimeOfDay(tod, ctx);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const drawPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.16);
const hit = new THREE.Vector3();

function persist() {
  if (skipPersist) return;
  persistSave({ strokes, nextId, tide, tod });
}

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
  const pts = strokePts.map((p) => new THREE.Vector3(p.x, 0.18, p.y));
  const half = (eraseMode ? 0.28 : WIDTHS[width] * 0.5) + 0.02;
  preview.geometry.dispose();
  preview.geometry = buildRibbon(pts, half);
  mats.preview.color.set(eraseMode ? 0xc07060 : 0x8fcfc4);
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
  audio.stroke();

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
  updateIsland(island, grid, tide);
  rebuildWater(water, grid, tide);
  const lm = landmarksFrom(strokes);
  wetland.tod = tod;
  wetland.rebuild(grid, strokes, lm, growPath);
  wetland.applyTide(tide);
  rebuildMirrors(mirrors, wetland, tide);
  persist();
}

function undo() {
  const snap = history.pop();
  if (!snap) return;
  grid.restore(snap.grid);
  strokes = snap.strokes;
  nextId = snap.nextId;
  grid.syncTexture();
  updateIsland(island, grid, tide);
  rebuildWater(water, grid, tide);
  wetland.tod = tod;
  wetland.rebuild(grid, strokes, landmarksFrom(strokes), null);
  wetland.applyTide(tide);
  rebuildMirrors(mirrors, wetland, tide);
  persist();
}

function applySaved(data) {
  strokes = (data.strokes || []).map((s) => ({
    id: s.id,
    width: s.width,
    connected: !!s.connected,
    points: (s.points || []).map((p) => new THREE.Vector2(p.x, p.y)),
  }));
  nextId = Number(data.nextId) || strokes.reduce((m, s) => Math.max(m, s.id), 0) + 1;
  if (typeof data.tide === 'number') tide = data.tide;
  if (typeof data.tod === 'number') tod = data.tod;
  document.getElementById('tide').value = String(Math.round(tide * 100));
  document.getElementById('tod').value = String(Math.round(tod * 100));
  rebuildGridFromStrokes();
  applyTimeOfDay(tod, ctx);
  finishRebuild(null);
  wetland.snapGrow();
  rebuildMirrors(mirrors, wetland, tide);
}

function resetAll() {
  strokes = [];
  nextId = 1;
  history.length = 0;
  tide = 0.52;
  tod = 0.2;
  document.getElementById('tide').value = '52';
  document.getElementById('tod').value = '20';
  rebuildGridFromStrokes();
  applyTimeOfDay(tod, ctx);
  finishRebuild(null);
  wetland.snapGrow();
  rebuildMirrors(mirrors, wetland, tide);
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

document.getElementById('reset').addEventListener('click', resetAll);

document.getElementById('tide').addEventListener('input', (e) => {
  tide = Number(e.target.value) / 100;
  rebuildWater(water, grid, tide);
  updateIsland(island, grid, tide);
  wetland.applyTide(tide);
  applyTideMirrors(mirrors, tide);
  audio.tideChange();
  persist();
});

document.getElementById('tod').addEventListener('input', (e) => {
  tod = Number(e.target.value) / 100;
  applyTimeOfDay(tod, ctx);
  persist();
});

document.getElementById('tod').addEventListener('change', () => {
  wetland.tod = tod;
  wetland.rebuildFauna();
  rebuildMirrors(mirrors, wetland, tide);
  persist();
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

function playDemoStrokes() {
  if (bootParams.has('shot') || bootParams.has('river') || bootParams.has('empty')) {
    document.body.classList.add('shot');
  }
  if (bootParams.has('shot') || bootParams.has('river')) {
    width = 'river';
    strokePts = [];
    if (bootParams.has('river') && !bootParams.has('shot')) {
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
      width = 'narrow';
      strokePts = [];
      for (let i = 0; i <= 14; i++) {
        const u = i / 14;
        strokePts.push(new THREE.Vector2(-2.4 + u * 4.8, 2.15 + Math.sin(u * 3.1) * 0.25));
      }
      commitStroke();
      width = 'harbor';
      strokePts = [];
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        strokePts.push(new THREE.Vector2(2.2 + Math.sin(u * 1.2) * 0.4, -0.6 + u * 2.4));
      }
      commitStroke();
    }
    wetland.snapGrow();
    rebuildMirrors(mirrors, wetland, tide);
  }
}

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  controls.update();
  wetland.tick(dt);
  syncMirrors(mirrors, wetland);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

async function boot() {
  audio.ambient();
  await loadSlots(mats);
  const artDish = makeDish();
  if (artDish) {
    scene.remove(dish);
    dish = artDish;
    scene.add(dish);
  }
  applyArtTextures(island, water, await loadOptionalArtTextures());
  applyTimeOfDay(tod, ctx);
  rebuildWater(water, grid, tide);

  if (!skipPersist) {
    const data = loadSave();
    if (data) applySaved(data);
  } else {
    playDemoStrokes();
  }

  frame();
}

boot();
