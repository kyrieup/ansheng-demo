/** Locked look contract from 美术. Do not invent hexes. #FFB060 is dusk sun only — never a mesh. */

export const GRASS_DRY = 0x7a8b4e;
export const GRASS_WET = 0x4e6a38;
export const MUD_DRY = 0x8a6e4c;
export const MUD_WET = 0x3e2c20;

export const DISH = 0x5c564c;
export const DISH_BOTTOM = 0x3e2c20;
export const DISH_LIP = 7.55;

export const WATER_DRY = 0x6b8f6a;
export const WATER_WET = 0x2a6b68;

export const SUN_DUSK = 0xffb060;

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
