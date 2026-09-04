import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  WIDTHS,
  TYPE,
  makePalette,
  WaterGrid,
  createIsland,
  updateIsland,
  applyIslandSink,
  createWater,
  rebuildWater,
  insideIsland,
  terrainHeight,
  simplify,
  polylineLength,
  findIntersections,
  applyTimeOfDay,
  loadArtTextures,
  applyArtTextures,
} from './world.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Wetland } from './town.js';
import { loadSlots, setMats, makeDish } from './art/slots.js';
import { save as persistSave, load as loadSave, skipLoad } from './save/local.js';
import { audio } from './audio/hooks.js';
import { createMirrors, rebuildMirrors, applyTideMirrors, syncMirrors } from './render/mirrors.js';
import { SKY_STOPS, loadSkyFogJson, DEFAULT_TOD, DEFAULT_TIDE, MOOD_LOOKS } from './config/look.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
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

const hemi = new THREE.HemisphereLight(0x8fa092, 0x243028, 0.28);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb060, 0.98);
sun.position.set(8, 8, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.05;
sun.shadow.radius = 4;
sun.shadow.blurSamples = 16;
if ('intensity' in sun.shadow) sun.shadow.intensity = 0.32;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 42;
sun.shadow.camera.left = -11;
sun.shadow.camera.right = 11;
sun.shadow.camera.top = 11;
sun.shadow.camera.bottom = -11;
sun.shadow.camera.updateProjectionMatrix();
sun.target.position.set(0, 0.15, 0);
scene.add(sun);
scene.add(sun.target);

const mats = makePalette();
setMats(mats);
const grid = new WaterGrid();
let tide = DEFAULT_TIDE;
let tod = DEFAULT_TOD;
const island = createIsland(grid, mats, tide);
scene.add(island);
const water = createWater(grid);
rebuildWater(water, grid, tide);
scene.add(water);

const preview = new THREE.Mesh(new THREE.BufferGeometry(), mats.preview);
preview.frustumCulled = false;
preview.renderOrder = 12;
scene.add(preview);

function makeSoftDisc() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 3, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,0.72)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.28)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const tip = new THREE.Mesh(
  new THREE.CircleGeometry(1, 40),
  new THREE.MeshBasicMaterial({
    map: makeSoftDisc(),
    color: 0x6e7a44,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  }),
);
tip.rotation.x = -Math.PI / 2;
tip.visible = false;
tip.renderOrder = 5;
tip.frustumCulled = false;
scene.add(tip);

const sink = { x: 0, z: 0, amp: 0, vel: 0, target: 0, radius: 0.7 };
let soakLive = false;
let lastWaterMs = 0;

const wetland = new Wetland(scene, mats);
const mirrors = createMirrors(scene);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// Almost-invisible halo on water highlights and dusk sun only.
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.05, 0.2, 0.91);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const ctx = { scene, mats, hemi, sun, water, renderer, bloomPass };

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
  const pts = strokePts.map((p) => new THREE.Vector3(p.x, terrainHeight(p.x, p.y) + 0.06, p.y));
  const half = (eraseMode ? 0.28 : WIDTHS[width] * 0.5) + 0.02;
  preview.geometry.dispose();
  preview.geometry = buildRibbon(pts, half);
  mats.preview.color.set(eraseMode ? 0xc07060 : 0x8aaa78);
}

function tipRadius() {
  return eraseMode ? 0.3 : WIDTHS[width] * 0.52;
}

function placeTip(p) {
  if (!p) {
    tip.visible = false;
    return;
  }
  tip.position.set(p.x, p.y + 0.035, p.z);
  const r = tipRadius();
  tip.scale.setScalar(r);
  tip.material.color.set(eraseMode ? 0xc45a48 : 0x6e7a44);
  tip.material.opacity = eraseMode ? 0.3 : 0.34;
  tip.visible = true;
  sink.x = p.x;
  sink.z = p.z;
  sink.radius = r * 1.4;
}

function liveSoak(forceWater = false) {
  grid.syncTexture();
  updateIsland(island, grid, tide, { normals: false });
  applyIslandSink(island, sink);
  const now = performance.now();
  if (forceWater || now - lastWaterMs > 90) {
    rebuildWater(water, grid, tide);
    lastWaterMs = now;
  }
}

function liveStampPoint(x, z) {
  if (eraseMode) {
    grid.eraseStroke([new THREE.Vector2(x, z)], WIDTHS[width] * 0.65);
  } else {
    grid.stampCircle(x, z, WIDTHS[width] * 0.5, TYPE[width], nextId);
  }
}

function liveStampSeg(a, b) {
  if (eraseMode) {
    grid.eraseStroke([a, b], WIDTHS[width] * 0.65);
  } else {
    grid.stampCapsule(a.x, a.y, b.x, b.y, WIDTHS[width] * 0.5, TYPE[width], nextId);
  }
}

function tickSink(dt) {
  const k = 26;
  const damp = 8.5;
  const acc = (sink.target - sink.amp) * k - sink.vel * damp;
  sink.vel += acc * dt;
  sink.amp += sink.vel * dt;
  if (sink.amp < 0) {
    sink.amp = 0;
    sink.vel = 0;
  }
  if (sink.amp > 0.04) sink.amp = 0.04;
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

function commitStroke({ live = false } = {}) {
  const pts = simplify(strokePts, 0.07);
  strokePts = [];
  updatePreview();
  placeTip(null);
  audio.strokeStop();
  sink.target = 0;
  if (pts.length < 1) {
    soakLive = false;
    return;
  }
  const L = polylineLength(pts);
  if (L < 0.18 && pts.length < 3) {
    const p = pts[0];
    pts.push(new THREE.Vector2(p.x + 0.05, p.y));
  }

  if (!live) snapshot();

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
    const pondId = nextId++;
    strokes.push({ id: pondId, width, points: pondPts, connected: false });
    if (live) grid.deepenWet(pondPts, width, pondId);
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
  if (live) grid.deepenWet(pts, width, id);
  finishRebuild(pts);
}

function finishRebuild(growPath) {
  soakLive = false;
  grid.syncTexture();
  updateIsland(island, grid, tide);
  applyIslandSink(island, sink);
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
  applyIslandSink(island, sink);
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
  tide = DEFAULT_TIDE;
  tod = DEFAULT_TOD;
  document.getElementById('tide').value = String(Math.round(DEFAULT_TIDE * 100));
  document.getElementById('tod').value = String(Math.round(DEFAULT_TOD * 100));
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
  soakLive = true;
  snapshot();
  strokePts = [new THREE.Vector2(p.x, p.z)];
  sink.target = 0.032;
  placeTip(p);
  liveStampPoint(p.x, p.z);
  liveSoak(true);
  audio.strokeStart();
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  const p = hitIsland(e);
  if (!p || !insideIsland(p.x, p.z)) return;
  placeTip(p);
  sink.target = 0.032;
  const last = strokePts[strokePts.length - 1];
  const q = new THREE.Vector2(p.x, p.z);
  if (last.distanceTo(q) < 0.05) {
    applyIslandSink(island, sink);
    return;
  }
  strokePts.push(q);
  liveStampSeg(last, q);
  updatePreview();
  liveSoak();
});

function endDraw(e) {
  if (!drawing) return;
  drawing = false;
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch (_) {}
  commitStroke({ live: true });
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
  applyIslandSink(island, sink);
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
  composer.render();
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
  composer.setSize(innerWidth, innerHeight);
});

function applyMoodLook() {
  const mood = bootParams.get('mood');
  const look = mood ? MOOD_LOOKS[mood] : null;
  if (!look) return false;
  tide = look.tide;
  tod = look.tod;
  wetland.tod = tod;
  document.getElementById('tide').value = String(Math.round(tide * 100));
  document.getElementById('tod').value = String(Math.round(tod * 100));
  applyTimeOfDay(tod, ctx);
  rebuildWater(water, grid, tide);
  updateIsland(island, grid, tide);
  applyIslandSink(island, sink);
  wetland.applyTide(tide);
  applyTideMirrors(mirrors, tide);
  return true;
}

function playDemoStrokes() {
  if (bootParams.has('shot') || bootParams.has('river') || bootParams.has('empty')) {
    document.body.classList.add('shot');
  }
  applyMoodLook();
  if (bootParams.has('empty')) return;
  if (bootParams.has('shot') || bootParams.has('river') || bootParams.has('mood')) {
    width = 'river';
    strokePts = [];
    if (bootParams.has('river') && !bootParams.has('shot')) {
      for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        strokePts.push(new THREE.Vector2(2.55 + Math.sin(u * 1.55) * 0.7, -3.55 + u * 7.4));
      }
      commitStroke();
    } else {
      // Shore / mudflat / pool — reeds as a bank, center stays mud or water.
      width = 'narrow';
      strokePts = [];
      for (let i = 0; i <= 18; i++) {
        const u = i / 18;
        const theta = 2.55 + u * 1.65;
        const R = 5.55 + Math.sin(u * 2.2) * 0.18;
        strokePts.push(new THREE.Vector2(Math.cos(theta) * R, Math.sin(theta) * R));
      }
      commitStroke();
      width = 'river';
      strokePts = [];
      for (let i = 0; i <= 16; i++) {
        const u = i / 16;
        strokePts.push(new THREE.Vector2(1.85 + Math.sin(u * 2.1) * 0.55, -2.05 + u * 3.9));
      }
      commitStroke();
      width = 'harbor';
      strokePts = [];
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        strokePts.push(new THREE.Vector2(0.35 + Math.cos(a) * 0.82, 0.15 + Math.sin(a) * 0.62));
      }
      commitStroke();
    }
    wetland.snapGrow();
    applyMoodLook();
    wetland.tod = tod;
    wetland.rebuildFauna();
    wetland.snapGrow();
    rebuildMirrors(mirrors, wetland, tide);
  }
}

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  controls.update();
  wetland.tick(dt);
  tickSink(dt);
  applyIslandSink(island, sink);
  syncMirrors(mirrors, wetland);
  composer.render();
  requestAnimationFrame(frame);
}

async function boot() {
  audio.ambient();
  await loadSlots();
  scene.add(makeDish());
  applyArtTextures(island, water, await loadArtTextures());
  await loadSkyFogJson();
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
