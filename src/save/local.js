export const SAVE_KEY = 'ansheng-v1';

const SKIP = ['shot', 'river', 'empty', 'drawn'];

export function skipLoad(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search.startsWith('?') || search.length === 0 ? search : `?${search}`);
  return SKIP.some((k) => q.has(k));
}

export function serialize(state) {
  return {
    strokes: (state.strokes || []).map((s) => ({
      id: s.id,
      width: s.width,
      points: (s.points || []).map((p) => ({ x: p.x, y: p.y })),
      connected: !!s.connected,
    })),
    nextId: state.nextId,
    tide: state.tide,
    tod: state.tod,
  };
}

export function save(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(state)));
  } catch (_) {
    /* ignore quota / private mode */
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.strokes)) return null;
    return data;
  } catch (_) {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (_) {
    /* ignore */
  }
}
