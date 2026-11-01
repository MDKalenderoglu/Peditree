/**
 * doubleLine.js — a consanguineous couple's double line that turns corners
 * (cross-generation partners, clinician feedback 2026-11-01): the segments
 * as one polyline, and that polyline moved to either side with mitred
 * corners, so the two strokes meet instead of crossing at each bend.
 */

/**
 * A relationship line of several segments (a cross-generation couple's
 * stepped line) as one ordered polyline, or null when the segments do not
 * join end to end.
 */
export function chainOf(segments) {
  const key = (x, y) => `${Math.round(x * 2)},${Math.round(y * 2)}`;
  const ends = new Map();
  segments.forEach((e, i) => [[e.x1, e.y1], [e.x2, e.y2]].forEach(([x, y]) => {
    const k = key(x, y);
    ends.set(k, [...(ends.get(k) || []), i]);
  }));
  const start = segments.findIndex((e) => ends.get(key(e.x1, e.y1)).length === 1 || ends.get(key(e.x2, e.y2)).length === 1);
  if (start < 0) return null;
  const used = new Set([start]);
  const first = segments[start];
  const forward = ends.get(key(first.x1, first.y1)).length === 1;
  const points = forward ? [[first.x1, first.y1], [first.x2, first.y2]] : [[first.x2, first.y2], [first.x1, first.y1]];
  for (;;) {
    const [x, y] = points[points.length - 1];
    const next = (ends.get(key(x, y)) || []).find((i) => !used.has(i));
    if (next === undefined) break;
    used.add(next);
    const e = segments[next];
    points.push(key(e.x1, e.y1) === key(x, y) ? [e.x2, e.y2] : [e.x1, e.y1]);
  }
  return used.size === segments.length ? points : null;
}

/** The polyline moved `d` to one side, its corners mitred, so a double line turns as one line. */
export function offsetPolyline(points, d) {
  const normals = points.slice(1).map(([x, y], i) => {
    const [px, py] = points[i];
    const len = Math.hypot(x - px, y - py) || 1;
    return [-(y - py) / len, (x - px) / len];
  });
  return points.map(([x, y], k) => {
    const a = normals[Math.max(0, k - 1)], b = normals[Math.min(normals.length - 1, k)];
    const dot = a[0] * b[0] + a[1] * b[1];
    const m = 1 + dot < 1e-6 ? 1 : d / (1 + dot);
    return [x + (a[0] + b[0]) * m, y + (a[1] + b[1]) * m];
  });
}
