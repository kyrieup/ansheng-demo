/** Procedural WebAudio hooks. No assets, no mixer UI. */

let ctx = null;
let noiseBuf = null;
let rustleBuf = null;
let strokeOut = null;
let strokeSrc = null;
let strokeFilter = null;
let strokeGain = null;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function brownNoise(acx, seconds) {
  const n = Math.floor(acx.sampleRate * seconds);
  const buf = acx.createBuffer(1, n, acx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + white * 0.02) * 0.98;
    d[i] = last * 3.4;
  }
  return buf;
}

function rustleNoise(acx, seconds) {
  const n = Math.floor(acx.sampleRate * seconds);
  const buf = acx.createBuffer(1, n, acx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / acx.sampleRate;
    const crackle = Math.random() > 0.86 ? (Math.random() * 2 - 1) * 0.7 : 0;
    d[i] = (Math.random() * 2 - 1) * 0.22 + crackle * Math.exp(-t * 8);
  }
  return buf;
}

function ensureBuffers(acx) {
  if (!noiseBuf) noiseBuf = brownNoise(acx, 2.2);
  if (!rustleBuf) rustleBuf = rustleNoise(acx, 0.9);
}

function ensureStrokeGraph(acx) {
  if (strokeOut) return;
  strokeFilter = acx.createBiquadFilter();
  strokeFilter.type = 'lowpass';
  strokeFilter.frequency.value = 260;
  strokeFilter.Q.value = 0.55;
  strokeGain = acx.createGain();
  strokeGain.gain.value = 0;
  strokeFilter.connect(strokeGain);
  strokeGain.connect(acx.destination);
  strokeOut = strokeGain;
}

export function strokeStart() {
  const acx = ac();
  if (!acx) return;
  ensureBuffers(acx);
  ensureStrokeGraph(acx);
  const now = acx.currentTime;
  if (!strokeSrc) {
    strokeSrc = acx.createBufferSource();
    strokeSrc.buffer = noiseBuf;
    strokeSrc.loop = true;
    strokeSrc.connect(strokeFilter);
    strokeSrc.start();
  }
  strokeFilter.frequency.setTargetAtTime(280, now, 0.05);
  strokeGain.gain.cancelScheduledValues(now);
  strokeGain.gain.setTargetAtTime(0.055, now, 0.04);
}

export function strokeStop() {
  if (!ctx || !strokeGain) return;
  const now = ctx.currentTime;
  strokeGain.gain.cancelScheduledValues(now);
  strokeGain.gain.setTargetAtTime(0, now, 0.05);
}

/** While dragging: wet friction. Safe to call once; start/stop own the loop. */
export function stroke() {
  strokeStart();
}

export function grow() {
  const acx = ac();
  if (!acx) return;
  ensureBuffers(acx);
  const now = acx.currentTime;
  const bursts = 4;
  for (let i = 0; i < bursts; i++) {
    const src = acx.createBufferSource();
    src.buffer = rustleBuf;
    src.playbackRate.value = 0.85 + Math.random() * 0.45;
    const bp = acx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400 + i * 380 + Math.random() * 220;
    bp.Q.value = 1.1;
    const g = acx.createGain();
    const t0 = now + i * 0.038;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.07 - i * 0.01, t0 + 0.018);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16 + i * 0.02);
    src.connect(bp);
    bp.connect(g);
    g.connect(acx.destination);
    src.start(t0);
    src.stop(t0 + 0.22);
  }
}

export function land() {}
export function leave() {}
export function tideChange() {}
export function ambient() {
  ac();
}

export const audio = {
  stroke,
  strokeStart,
  strokeStop,
  grow,
  land,
  leave,
  tideChange,
  ambient,
};
export const HOOKS = ['stroke', 'grow', 'land', 'leave', 'tideChange', 'ambient'];
