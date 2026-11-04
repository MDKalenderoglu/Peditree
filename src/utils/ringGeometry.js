/**
 * ringGeometry.js — where the ring menu's parts lie (RadialAddMenu.jsx;
 * clinician request 2026-11-03: the ring's words must fit and the bands look
 * even). The ring is thick enough for the four directions' words across it;
 * every choice on a band is the same length along it, whatever band it is
 * on; a band stays within one half of the circle, so every word reads upright,
 * the words of one band all turn the same way, and a band reads from left to right.
 */
export const RING_T = 48;   // ring thickness
export const BAND_T = 34;   // band thickness
export const BAND_GAP = 4;  // between two bands
export const BUTTON_L = 88; // one choice, measured along the middle of its band
export const MAX_SPAN = 168; // degrees: a band stays within one half of the circle

/**
 * Bands of choices around the ring, centred as close to `centre` (degrees,
 * 0 = east, clockwise) as the half of the circle it lies in allows. `rows`:
 * the choices of each band, innermost first. Returns one entry per choice:
 * its angles, radii and the turn that keeps its word upright.
 */
export function layoutBands(centre, rows, R) {
  const geo = rows.map((items, k) => {
    const r1 = R + 40 + k * (BAND_T + BAND_GAP), r2 = r1 + BAND_T;
    const per = (BUTTON_L / ((r1 + r2) / 2)) * (180 / Math.PI);
    return { items, r1, r2, per, span: per * items.length };
  });
  const c0 = ((centre % 360) + 360) % 360;
  const lower = c0 > 0 && c0 < 180; // below the person: words read with their top towards the ring
  const lo = lower ? 0 : 180, hi = lo + 180;
  const widest = Math.max(0, ...geo.map((g) => g.span));
  const c = Math.min(Math.max(c0, lo + widest / 2 + 2), hi - widest / 2 - 2);
  const flip = lower ? -180 : -360;
  // angles grow clockwise: right to left below the person, so there the first choice
  // is placed last and every band reads from left to right (clinician 2026-11-04)
  return geo.flatMap((g) => g.items.map((it, k) => {
    const at = lower ? g.items.length - 1 - k : k;
    const a0 = c - g.span / 2 + at * g.per;
    return { it, a0, a1: a0 + g.per, r: g.r1, R: g.r2, flip };
  }));
}

/**
 * Choices split over as few bands as keep each band within half the circle,
 * evenly (6 → 3 + 3, 7 → 4 + 3). `first`: the band the first of them is on.
 */
export function splitRows(items, first, R) {
  if (!items.length) return [];
  for (let n = 1; ; n++) {
    const size = Math.ceil(items.length / n);
    const r1 = R + 40 + first * (BAND_T + BAND_GAP);
    const per = (BUTTON_L / (r1 + BAND_T / 2)) * (180 / Math.PI);
    if (size * per <= MAX_SPAN || size === 1) {
      const rows = [];
      for (let k = 0, at = 0; k < n; k++) {
        const take = Math.ceil((items.length - at) / (n - k));
        rows.push(items.slice(at, at + take));
        at += take;
      }
      return rows;
    }
  }
}
