/** Locked fauna table. Do not invent numbers. tod 0=dawn, 0.5=noon, 1=dusk. */

export const MUL = {
  sparrow: { dawn: 1.5, noon: 1.0, dusk: 0.7 },
  dragonfly: { dawn: 1.2, noon: 1.2, dusk: 0.0 },
  sandpiper: { dawn: 1.4, noon: 1.0, dusk: 0.8 },
  duck: { dawn: 1.1, noon: 1.0, dusk: 1.0 },
  heron: { dawn: 1.0, noon: 0.8, dusk: 1.2 },
};

export const LAND_DELAY_MUL = { dawn: 0.65, noon: 1.0, dusk: 1.2 };

export const HERON_OK = { kindCount: 2, length: 5.5, winding: 2.2 };

export const SPARROW_FLOOR_TOD = 0.7;

export function lerpTod(tod, dawn, noon, dusk) {
  const t = Math.min(1, Math.max(0, Number(tod) || 0));
  if (t <= 0.5) {
    const u = t / 0.5;
    return dawn + (noon - dawn) * u;
  }
  const u = (t - 0.5) / 0.5;
  return noon + (dusk - noon) * u;
}

export function mulOf(species, tod) {
  const m = MUL[species];
  if (!m) return 1;
  return lerpTod(tod, m.dawn, m.noon, m.dusk);
}

export function landDelayMul(tod) {
  return lerpTod(tod, LAND_DELAY_MUL.dawn, LAND_DELAY_MUL.noon, LAND_DELAY_MUL.dusk);
}

/** Current nOf() caps from town.js. */
export function nOf(species, st) {
  switch (species) {
    case 'sparrow':
      if (st.playerWet <= 0) return 0;
      return Math.min(4, 1 + Math.floor(st.playerWet / 90));
    case 'dragonfly':
      if (!st.hasNarrow) return 0;
      return Math.min(4, 1 + Math.floor(st.dragonflySpots / 18));
    case 'sandpiper':
      if (!st.hasRiver) return 0;
      return Math.min(3, 1 + Math.floor(st.sandpiperSpots / 22));
    case 'duck':
      if (!st.hasHarbor) return 0;
      return Math.min(3, 1 + Math.floor(st.duckSpots / 20));
    case 'heron':
      return heronOk(st) ? 1 : 0;
    default:
      return 0;
  }
}

export function heronOk(st) {
  return st.kindCount >= HERON_OK.kindCount && st.shoreL > HERON_OK.length && st.winding > HERON_OK.winding;
}

/** n = round(nOf * mul). Sparrow floor: any wet stroke and tod<0.7 → at least 1. Dusk is not padded. */
export function countOf(species, st, tod, hasWetStroke) {
  let n = Math.round(nOf(species, st) * mulOf(species, tod));
  if (species === 'sparrow' && hasWetStroke && tod < SPARROW_FLOOR_TOD) {
    n = Math.max(n, 1);
  }
  return n;
}
