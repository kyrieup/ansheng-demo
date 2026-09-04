/** Locked look contract from 美术 / Heal Filter v1. Do not invent hexes. #FFB060 is dusk sun only — never a mesh. */

export const GRASS_DRY = 0x7a8b4e;
export const GRASS_WET = 0x4e6a38;
export const MUD_DRY = 0x8a6e4c;
export const MUD_WET = 0x3e2c20;

export const DISH = 0x5c564c;
export const DISH_BOTTOM = 0x3e2c20;
export const DISH_LIP = 7.55;

export const PUDDLE_SILVER = 0xc8d0c8;
export const PUDDLE_WARM = 0xd4cfc4;
export const WATER_SEEP = 0x6b8f6a;
export const WATER_SILT = 0x7a9a8a;
export const WATER_DRY = PUDDLE_SILVER;
export const WATER_WET = 0x2a6b68;
export const MIRROR_HL = 0x4a8a86;

export const SUN_DUSK = 0xffb060;

export const UI_INK = 0x243028;
export const UI_PAPER = 0xf3ebdd;
export const UI_ON = 0x3d5a38;
export const UI_CREAM = 0xf7f0e6;

/** New game / 重置. Existing localStorage `tod` is not overwritten on load. */
export const DEFAULT_TOD = 0.85;
export const DEFAULT_TIDE = 0.52;

/** Screenshot looks. `?shot&mood=` skips save and hides HUD. */
export const MOOD_LOOKS = {
  'dry-dusk': { tide: 0.12, tod: 0.85 },
  'dusk-dry': { tide: 0.12, tod: 0.85 },
  'dawn-full': { tide: 1, tod: 0 },
  'full-dawn': { tide: 1, tod: 0 },
};

/** Reserved public/art paths. Loaded as required assets. */
export const ART_PATHS = {
  terrain: '/art/terrain.png',
  water: '/art/water.png',
  dish: '/art/dish.glb',
  skyFog: '/art/sky-fog.json',
};

/** Heal Filter v1 gauze. sky-fog.json may overwrite on load. Dish rim stays readable. */
export const SKY_STOPS = [
  { t: 0, color: 0xd2ddd2, density: 0.045, name: 'dawn' },
  { t: 0.5, color: 0xc5d4c4, density: 0.025, name: 'day' },
  { t: 0.85, color: 0xe0b894, density: 0.032, name: 'dusk' },
  { t: 1, color: 0x1b1a24, density: 0.028, name: 'night' },
];

export function lerpStops(t, stops) {
  const x = Math.min(1, Math.max(0, Number(t) || 0));
  let i = 0;
  while (i < stops.length - 2 && x > stops[i + 1].t) i++;
  const a = stops[i];
  const b = stops[i + 1];
  const u = (x - a.t) / Math.max(1e-6, b.t - a.t);
  return { a, b, u };
}

export function skyFogAt(tod) {
  const { a, b, u } = lerpStops(tod, SKY_STOPS);
  return {
    density: a.density + (b.density - a.density) * u,
    from: a.name,
    to: b.name,
    u,
  };
}

function parseHexColor(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v >>> 0;
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return parseInt(s, 16);
}

/** Merge /art/sky-fog.json onto SKY_STOPS. */
export function applySkyFogJson(data) {
  if (!data || typeof data !== 'object') return false;
  const root = data.sky_fog || data.fog || data;
  if (!root || typeof root !== 'object') return false;
  let used = false;
  for (const stop of SKY_STOPS) {
    const src = root[stop.name];
    if (!src || typeof src !== 'object') continue;
    const color = parseHexColor(src.color);
    const density = Number(src.density);
    if (color != null) {
      stop.color = color;
      used = true;
    }
    if (Number.isFinite(density)) {
      stop.density = density;
      used = true;
    }
  }
  return used;
}

/** Required /art/sky-fog.json. Fail loudly; do not keep silent defaults on fetch error. */
export async function loadSkyFogJson() {
  try {
    const res = await fetch(ART_PATHS.skyFog);
    if (!res.ok) throw new Error(`${ART_PATHS.skyFog} HTTP ${res.status}`);
    const data = await res.json();
    if (!applySkyFogJson(data)) throw new Error(`${ART_PATHS.skyFog} missing dawn/day/dusk/night`);
    return true;
  } catch (err) {
    console.error(`[art] failed to load required ${ART_PATHS.skyFog}`, err);
    throw err;
  }
}
