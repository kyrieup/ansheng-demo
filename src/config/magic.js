/** Reed grow timings. First cluster along the stroke is visible in ~1s; ease from the root. Never pop the whole bank. */

export const REED_FIRST_VISIBLE = 1.0;
export const REED_FIRST_DELAY = 0.62;
export const REED_ALONG_STROKE = 0.88;
export const REED_GROW_DUR = 0.42;
export const REED_GROW_DUR_JITTER = 0.12;

export function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

export function delayAlongStroke(x, z, growPath) {
  if (!growPath || growPath.length < 1) return 0;
  let best = 1e9;
  let bestI = 0;
  for (let i = 0; i < growPath.length; i++) {
    const d = Math.hypot(x - growPath[i].x, z - growPath[i].y);
    if (d < best) {
      best = d;
      bestI = i;
    }
  }
  const u = growPath.length < 2 ? 0 : bestI / (growPath.length - 1);
  return REED_FIRST_DELAY + u * REED_ALONG_STROKE;
}
