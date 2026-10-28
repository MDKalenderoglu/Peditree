/**
 * drawingStyleSvg.js — puts a drawing style (drawingStyle.js drawingSpec) on
 * a finished pedigree <svg>: the typeface of its text and, for the
 * hand-drawn look, a pen-drawn version of every stroke. Runs on the screen
 * drawing after every redraw, and on an export copy (so an export can be
 * standard while the screen is hand-drawn). Never adds, removes or moves a
 * symbol or a line; text is never wavered (it must stay legible).
 *
 * Every stroke is drawn again by geometry, never by a pixel filter (a filter
 * broke outlines into dashes — clinician feedback 2026-10-28): connecting
 * lines, twins' diagonals, "//", slashes, brackets, the proband's arrow, the
 * childless bars, symbol outlines and the key's symbols.
 * - Straight pieces become gentle curves; their end points stay exactly
 *   where they were, so lines still meet and corners stay corners.
 * - The bend depends only on where a piece runs along its length, so
 *   parallel strokes (a double line, the two bars of "infertile") bend alike
 *   and keep their gap.
 * - A symbol keeps its exact fill; only its outline is drawn by hand (the
 *   original outline is hidden, never removed). The lines dividing a symbol
 *   into findings and the edges of the findings' sectors are drawn alike, so
 *   the white gap between two findings runs along its divider; a carrier's
 *   dot is a hand-drawn dot of the same fill. Text is left as it is.
 * - Every piece bends visibly (at least 1 px); slashes across a symbol or a
 *   relationship line up to MARK_BOW.
 *
 * Idempotent and reversible: original font sizes are kept in data-fs, original
 * paths in data-d; hand-drawn outlines carry the class hand-stroke.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Largest sideways bow of a hand-drawn line piece, px (a double line's strokes are 4 px apart, and bend alike). */
export const MAX_BOW = 2.2;
/** Largest bow of a symbol's outline, px (outline width 2). */
export const SHAPE_BOW = 1.2;
/** Largest bow of a mark across or beside a symbol: the deceased / TOP slash, "//" of a separation. */
export const MARK_BOW = 2.4;
/** Largest bow of the lines dividing a symbol into findings, and of the white gap that runs with them. */
export const REGION_BOW = 1;
/** Every piece of 5 px or more bends at least this much (or its largest bow, if smaller): visibly drawn by hand. */
const MIN_BOW = 1;

// a small, fixed pseudo-random number in [-1, 1] for a place on the drawing
function wobbleAt(a, b, salt) {
  let h = Math.imul(Math.round(a * 2) ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul(Math.round(b * 2) + salt, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 13;
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

const f2 = (v) => +v.toFixed(2);

/** One straight piece (x0,y0)→(x1,y1) as cubic curves, ends fixed. */
function sketchPiece(x0, y0, x1, y1, { maxBow, salt, rel = 0.06 }) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 5) return `L${f2(x1)},${f2(y1)}`;
  // drawn the same whichever end it starts from (a region's edge and the line dividing it coincide)
  const EPS = 1e-6;
  if (x1 - x0 < -EPS || (Math.abs(x1 - x0) <= EPS && y1 < y0)) {
    const back = sketchPiece(x1, y1, x0, y0, { maxBow, salt, rel });
    return reverseCurves(x1, y1, back);
  }
  const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
  // the side a bow goes to: one fixed normal per direction (the same for parallel strokes)
  let nx = -uy, ny = ux;
  if (nx < -1e-9 || (Math.abs(nx) <= 1e-9 && ny < 0)) { nx = -nx; ny = -ny; }
  // where the piece runs along its length (not across it): equal for parallel strokes
  const along = Math.min(x0 * Math.abs(ux) + y0 * Math.abs(uy), x1 * Math.abs(ux) + y1 * Math.abs(uy));
  const n = Math.max(1, Math.round(len / 45));
  const seg = len / n;
  const amp = Math.min(maxBow, Math.max(MIN_BOW, len * rel));
  let out = '';
  for (let k = 0; k < n; k++) {
    const p0 = [x0 + (x1 - x0) * (k / n), y0 + (y1 - y0) * (k / n)];
    const p1 = [x0 + (x1 - x0) * ((k + 1) / n), y0 + (y1 - y0) * ((k + 1) / n)];
    const key = along + Math.round(seg * k);
    // a bow of at least 2/3 of amp, at most amp (a cubic's peak is 3/4 of its larger control offset)
    const w1 = wobbleAt(key, len, salt + 1), w2 = wobbleAt(key, len, salt + 2);
    const peak = amp * (0.66 + 0.34 * Math.abs(w1));
    const o1 = (w1 < 0 ? -1 : 1) * peak / 0.75;
    const o2 = o1 * (0.55 + 0.45 * Math.abs(w2));
    const at = (t, o) => [p0[0] + (p1[0] - p0[0]) * t + nx * o, p0[1] + (p1[1] - p0[1]) * t + ny * o];
    const [c1, c2] = [at(1 / 3, o1), at(2 / 3, o2)];
    out += `C${f2(c1[0])},${f2(c1[1])} ${f2(c2[0])},${f2(c2[1])} ${f2(p1[0])},${f2(p1[1])}`;
  }
  return out;
}

// "C c1 c2 p …" from (sx, sy), traversed backwards
function reverseCurves(sx, sy, d) {
  const n = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/g) || []).map(Number);
  const curves = [];
  let px = sx, py = sy;
  for (let i = 0; i + 5 < n.length; i += 6) { curves.push([px, py, n[i], n[i + 1], n[i + 2], n[i + 3], n[i + 4], n[i + 5]]); px = n[i + 4]; py = n[i + 5]; }
  return curves.reverse().map(([ax, ay, c1x, c1y, c2x, c2y]) => `C${f2(c2x)},${f2(c2y)} ${f2(c1x)},${f2(c1y)} ${f2(ax)},${f2(ay)}`).join('');
}

/** A straight piece split at its junctions (fractions 0 < t < 1, ascending), each part bent on its own. */
function sketchPieceThrough(x0, y0, x1, y1, ts, opts) {
  let out = '', px = x0, py = y0;
  for (const t of [...ts, 1]) {
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    out += sketchPiece(px, py, x, y, opts);
    px = x; py = y;
  }
  return out;
}

/**
 * The hand-drawn version of a path of straight pieces and arcs ("M", "L",
 * "A", "Z" — connectors, brackets, the proband's arrow, diamonds,
 * triangles). Arcs (line jumps) and every point stay where they were.
 * `splitsFor(x0, y0, x1, y1)` may name further points of a piece that must
 * stay exactly in place (where another line meets it), as fractions along it.
 * Returns the path unchanged when it holds anything else.
 */
export function sketchPath(d, { maxBow = MAX_BOW, salt = 0, splitsFor = null, rel = 0.06 } = {}) {
  const tokens = String(d).match(/[MLAZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  if (!tokens) return d;
  let out = '';
  let i = 0, cx = 0, cy = 0, sx = 0, sy = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'M') { cx = sx = num(); cy = sy = num(); out += `M${f2(cx)},${f2(cy)}`; }
    else if (cmd === 'L') {
      const x = num(), y = num();
      out += sketchPieceThrough(cx, cy, x, y, splitsFor ? splitsFor(cx, cy, x, y) : [], { maxBow, salt, rel });
      cx = x; cy = y;
    }
    else if (cmd === 'A') {
      const a = [num(), num(), num(), num(), num(), num(), num()];
      out += `A${a.slice(0, 5).join(' ')} ${f2(a[5])},${f2(a[6])}`;
      cx = a[5]; cy = a[6];
    } else if (cmd === 'Z' || cmd === 'z') {
      out += `${sketchPiece(cx, cy, sx, sy, { maxBow, salt, rel })}Z`;
      cx = sx; cy = sy;
    } else return d;
  }
  return out;
}

/** A hand-drawn circle: closed, its radius never more than SHAPE_BOW from the true one. */
export function sketchCircle(cx, cy, r, salt = 0) {
  const N = 16;
  const ph1 = Math.PI * wobbleAt(r, salt, 3), ph2 = Math.PI * wobbleAt(r, salt, 4);
  const a1 = 0.6 + 0.4 * wobbleAt(r, salt, 5), a2 = 0.4 * wobbleAt(r, salt, 6);
  const amp = Math.min(SHAPE_BOW, r * 0.06) / (Math.abs(a1) + Math.abs(a2));
  const pts = [];
  for (let k = 0; k < N; k++) {
    const t = (2 * Math.PI * k) / N;
    const rr = r + amp * (a1 * Math.sin(2 * t + ph1) + a2 * Math.sin(3 * t + ph2));
    pts.push([cx + rr * Math.cos(t), cy + rr * Math.sin(t)]);
  }
  // a closed Catmull-Rom curve through the points, as cubic Béziers
  let out = `M${f2(pts[0][0])},${f2(pts[0][1])}`;
  for (let k = 0; k < N; k++) {
    const p0 = pts[(k - 1 + N) % N], p1 = pts[k], p2 = pts[(k + 1) % N], p3 = pts[(k + 2) % N];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    out += `C${f2(c1[0])},${f2(c1[1])} ${f2(c2[0])},${f2(c2[1])} ${f2(p2[0])},${f2(p2[1])}`;
  }
  return `${out}Z`;
}

const num = (el, a) => Number(el.getAttribute(a) || 0);

/** The straight pieces of a path of M / L / A commands (arcs left out). */
export function pathPieces(d) {
  const tokens = String(d).match(/[MLAZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
  const pieces = [];
  let i = 0, cx = 0, cy = 0;
  const n = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const c = tokens[i++];
    if (c === 'M') { cx = n(); cy = n(); }
    else if (c === 'L') { const x = n(), y = n(); pieces.push([cx, cy, x, y]); cx = x; cy = y; }
    else if (c === 'A') { for (let k = 0; k < 5; k++) n(); cx = n(); cy = n(); }
  }
  return pieces;
}

const TOL = 0.6;
/**
 * Where lines meet: every end of every piece. A piece is split wherever
 * another line ends on it (a line of descent on a relationship line, a child's
 * line on the sibship line, the twins' bar on their lines), so the bend
 * passes exactly through the meeting point: no poke, no gap. Parallel pieces
 * (the strokes of a double line, the bars of "infertile") share their splits,
 * so they keep bending alike.
 */
export function junctionSplitter(allPieces) {
  const ends = allPieces.flatMap(([x0, y0, x1, y1]) => [[x0, y0], [x1, y1]]);
  const own = (x0, y0, x1, y1) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1) return [];
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    const ts = [];
    for (const [px, py] of ends) {
      const along = (px - x0) * ux + (py - y0) * uy;
      const off = Math.abs((px - x0) * uy - (py - y0) * ux);
      if (off <= TOL && along > TOL && along < len - TOL) ts.push(along / len);
    }
    return ts;
  };
  return (x0, y0, x1, y1) => {
    const ts = own(x0, y0, x1, y1);
    const horiz = Math.abs(y1 - y0) < 0.01, vert = Math.abs(x1 - x0) < 0.01;
    if (horiz || vert) {
      // the parallel partners: the same span, at most 6 px away
      for (const [a0, b0, a1, b1] of allPieces) {
        const same = horiz
          ? Math.abs(b1 - b0) < 0.01 && Math.abs(b0 - y0) > 0.01 && Math.abs(b0 - y0) <= 6 && Math.min(a0, a1) === Math.min(x0, x1) && Math.max(a0, a1) === Math.max(x0, x1)
          : Math.abs(a1 - a0) < 0.01 && Math.abs(a0 - x0) > 0.01 && Math.abs(a0 - x0) <= 6 && Math.min(b0, b1) === Math.min(y0, y1) && Math.max(b0, b1) === Math.max(y0, y1);
        if (!same) continue;
        // its splits, carried over to this piece (same direction of travel)
        const flip = horiz ? (a1 - a0) * (x1 - x0) < 0 : (b1 - b0) * (y1 - y0) < 0;
        for (const t of own(a0, b0, a1, b1)) ts.push(flip ? 1 - t : t);
      }
    }
    return [...new Set(ts.map((t) => +t.toFixed(6)))].sort((p, q) => p - q);
  };
}

/** The hand-drawn outline of a symbol or a straight line element, as path data. */
export function sketchElement(el, salt = 0) {
  const tag = el.tagName.toLowerCase();
  if (tag === 'circle') return sketchCircle(num(el, 'cx'), num(el, 'cy'), num(el, 'r'), salt);
  if (tag === 'rect') {
    const x = num(el, 'x'), y = num(el, 'y'), w = num(el, 'width'), h = num(el, 'height');
    return sketchPath(`M${x},${y}L${x + w},${y}L${x + w},${y + h}L${x},${y + h}Z`, { maxBow: SHAPE_BOW, salt });
  }
  if (tag === 'line') {
    // a slash is short: it bends relatively more, to read as drawn by hand
    return sketchPath(`M${num(el, 'x1')},${num(el, 'y1')}L${num(el, 'x2')},${num(el, 'y2')}`, { maxBow: MARK_BOW, salt, rel: 0.1 });
  }
  if (tag === 'path') return sketchPath(el.getAttribute('d'), { maxBow: SHAPE_BOW, salt });
  return null;
}

// where a symbol stands (its group's translate): every symbol gets its own hand
function placeSalt(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const m = /translate\(\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/.exec(p.getAttribute?.('transform') || '');
    if (m) return Math.round(Number(m[1]) * 7 + Number(m[2]) * 13) | 0;
  }
  return 0;
}

const SKIP = ['ui-only', 'pulse-halo', 'condition-regions', 'annotations', 'hand-stroke'];
const skipped = (el) => {
  for (let p = el; p && p.tagName && p.tagName.toLowerCase() !== 'svg'; p = p.parentElement) {
    const tag = p.tagName.toLowerCase();
    if (tag === 'defs' || tag === 'text' || tag === 'clippath' || tag === 'pattern') return true;
    if (SKIP.some((c) => p.classList?.contains(c))) return true;
  }
  return false;
};
const stroked = (el) => {
  const s = el.getAttribute('stroke');
  return !!s && s !== 'none' && s !== 'transparent' && Number(el.getAttribute('stroke-width') ?? 1) > 0;
};

/** Everything the hand-drawn look redraws: each stroked line or outline of the drawing and its key. */
export function handDrawnTargets(svg) {
  const roots = [...svg.querySelectorAll('.pedigree-viewport, .condition-legend')];
  return roots.flatMap((r) => [...r.querySelectorAll('path, rect, circle, line, polyline, ellipse')])
    .filter((el) => stroked(el) && !skipped(el));
}

/** @param {SVGSVGElement} svg  @param {ReturnType<import('./drawingStyle').drawingSpec>} spec */
export function applyDrawingStyle(svg, spec) {
  if (!svg || !spec || typeof svg.querySelectorAll !== 'function') return;
  const doc = svg.ownerDocument;

  // --- typeface and size of every text ---
  svg.setAttribute('font-family', spec.family);
  svg.querySelectorAll('text').forEach((t) => {
    const base = t.getAttribute('data-fs') ?? t.getAttribute('font-size');
    if (base == null) return;
    t.setAttribute('data-fs', base);
    const number = t.classList.contains('pedigree-number');
    const k = number ? spec.numberK : spec.k;
    const px = parseFloat(base);
    if (Number.isFinite(px)) t.setAttribute('font-size', k === 1 ? base : `${+(px * k).toFixed(2)}px`);
    if (number && spec.numberFamily !== spec.family) t.setAttribute('font-family', spec.numberFamily);
    else t.removeAttribute('font-family');
  });

  // --- back to the drawing as the renderer made it ---
  svg.querySelectorAll('.hand-stroke').forEach((el) => el.remove());
  svg.querySelectorAll('[data-d]').forEach((p) => p.setAttribute('d', p.getAttribute('data-d')));
  svg.querySelectorAll('[data-hand-hidden]').forEach((el) => { el.removeAttribute('stroke-opacity'); el.removeAttribute('fill-opacity'); el.removeAttribute('data-hand-hidden'); });
  if (!spec.hand) return;

  // --- every stroke drawn by hand ---
  // the connecting lines meet each other: their pieces, to keep every meeting point in place
  const viewport = svg.querySelector('.pedigree-viewport');
  const isConnector = (el) => el.parentElement === viewport || el.parentElement?.classList.contains('childless-mark');
  const connectorPieces = handDrawnTargets(svg).filter((el) => isConnector(el) && !el.classList.contains('relationship-ended'))
    .flatMap((el) => (el.tagName.toLowerCase() === 'line'
      ? [[num(el, 'x1'), num(el, 'y1'), num(el, 'x2'), num(el, 'y2')]]
      : pathPieces(el.getAttribute('data-d') ?? el.getAttribute('d'))));
  const splitsFor = junctionSplitter(connectorPieces);
  // the regions of findings: their dividing lines and the edges of their sectors
  // are the same lines, drawn alike, so the white gap runs along the divider
  svg.querySelectorAll('.condition-regions').forEach((group) => {
    const salt = placeSalt(group);
    const dividers = [...group.querySelectorAll(':scope > line')];
    const sectors = [...group.querySelectorAll(':scope > path')];
    const pieces = [
      ...dividers.map((l) => [num(l, 'x1'), num(l, 'y1'), num(l, 'x2'), num(l, 'y2')]),
      ...sectors.flatMap((p) => pathPieces(p.getAttribute('data-d') ?? p.getAttribute('d'))),
    ];
    const local = junctionSplitter(pieces);
    sectors.forEach((p) => {
      const d = p.getAttribute('data-d') ?? p.getAttribute('d');
      p.setAttribute('data-d', d);
      p.setAttribute('d', sketchPath(d, { maxBow: REGION_BOW, salt, splitsFor: local }));
    });
    dividers.forEach((l) => {
      const pen = doc.createElementNS(SVG_NS, 'path');
      pen.setAttribute('d', sketchPath(`M${num(l, 'x1')},${num(l, 'y1')}L${num(l, 'x2')},${num(l, 'y2')}`, { maxBow: REGION_BOW, salt, splitsFor: local }));
      pen.setAttribute('fill', 'none');
      for (const a of ['stroke', 'stroke-width']) if (l.hasAttribute(a)) pen.setAttribute(a, l.getAttribute(a));
      pen.setAttribute('class', 'hand-stroke region-divider-sketch');
      l.setAttribute('stroke-opacity', '0');
      l.setAttribute('data-hand-hidden', '1');
      l.after(pen);
    });
  });
  // filled marks without an outline (the carrier's dot): a hand-drawn dot of the same fill
  svg.querySelectorAll('.node-group > circle:not([stroke]), .condition-legend circle:not([stroke])').forEach((c) => {
    if (skipped(c) || !c.getAttribute('fill') || c.getAttribute('fill') === 'none') return;
    const pen = doc.createElementNS(SVG_NS, 'path');
    pen.setAttribute('d', sketchCircle(num(c, 'cx'), num(c, 'cy'), num(c, 'r'), placeSalt(c)));
    pen.setAttribute('fill', c.getAttribute('fill'));
    pen.setAttribute('class', `hand-stroke ${c.getAttribute('class') || ''}`.trim());
    c.setAttribute('fill-opacity', '0');
    c.setAttribute('data-hand-hidden', '1');
    c.after(pen);
  });

  for (const el of handDrawnTargets(svg)) {
    const tag = el.tagName.toLowerCase();
    const inSymbol = !!el.closest('.node-group, .condition-legend');
    const salt = inSymbol ? placeSalt(el) : 0;
    const fill = el.getAttribute('fill');
    if (tag === 'path' && !inSymbol) {
      // a connector: the line itself takes the hand-drawn path (fill none)
      const d = el.getAttribute('data-d') ?? el.getAttribute('d');
      el.setAttribute('data-d', d);
      el.setAttribute('d', sketchPath(d, { salt, splitsFor }));
      continue;
    }
    if (tag === 'path' && (fill === 'none' || fill == null) && !el.classList.contains('pedigree-shape') && !el.classList.contains('pedigree-shape-outline')) {
      // brackets, the proband's arrow: an open stroke, redrawn in place
      const d = el.getAttribute('data-d') ?? el.getAttribute('d');
      el.setAttribute('data-d', d);
      el.setAttribute('d', sketchPath(d, { maxBow: SHAPE_BOW, salt }));
      continue;
    }
    // a symbol, a slash or a bar: its exact shape keeps its fill; a hand-drawn outline goes on top
    // childless bars meet their stem: junction-aware; slashes and symbols: on their own
    const d = tag === 'line' && isConnector(el) && !el.classList.contains('relationship-ended')
      ? sketchPath(`M${num(el, 'x1')},${num(el, 'y1')}L${num(el, 'x2')},${num(el, 'y2')}`, { maxBow: SHAPE_BOW, splitsFor })
      : sketchElement(el, el.classList.contains('relationship-ended') ? Math.round(num(el, 'x1') * 3 + num(el, 'y1')) : salt);
    if (!d) continue;
    const pen = doc.createElementNS(SVG_NS, 'path');
    pen.setAttribute('d', d);
    pen.setAttribute('fill', 'none');
    for (const a of ['stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'transform']) {
      if (el.hasAttribute(a)) pen.setAttribute(a, el.getAttribute(a));
    }
    pen.setAttribute('stroke-linejoin', 'round');
    const isShape = el.classList.contains('pedigree-shape');
    pen.setAttribute('class', `hand-stroke${isShape ? ' pedigree-shape-sketch' : ''}`);
    el.setAttribute('stroke-opacity', '0');
    el.setAttribute('data-hand-hidden', '1');
    el.after(pen);
  }
}

/** An export copy keeps no helper attributes. */
export function stripStyleHelpers(svg) {
  svg.querySelectorAll?.('[data-fs]').forEach((t) => t.removeAttribute('data-fs'));
  svg.querySelectorAll?.('[data-d]').forEach((p) => p.removeAttribute('data-d'));
  svg.querySelectorAll?.('[data-hand-hidden]').forEach((p) => p.removeAttribute('data-hand-hidden'));
}
