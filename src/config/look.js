/** Locked look contract from 美术. Do not invent hexes. #FFB060 is dusk sun only — never a mesh. */

export const GRASS_DRY = 0x7a8b4e;
export const GRASS_WET = 0x4e6a38;
export const MUD_DRY = 0x8a6e4c;
export const MUD_WET = 0x3e2c20;

export const DISH = 0x5c564c;
export const DISH_BOTTOM = 0x3e2c20;
export const DISH_LIP = 7.55;

/** Dry-tide puddle: heal-filter silver, not charcoal or olive. */
export const WATER_DRY = 0xc8d0c8;
export const WATER_WET = 0x2a6b68;

export const SUN_DUSK = 0xffb060;

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

export const SKY_STOPS = [
  { t: 0, color: 0xc5d4c8, density: 0.062, name: 'dawn' },
  { t: 0.5, color: 0xb4c8bc, density: 0.03, name: 'day' },
  { t: 0.85, color: 0xc4a080, density: 0.04, name: 'dusk' },
  { t: 1, color: 0x1b1a24, density: 0.03, name: 'night' },
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
