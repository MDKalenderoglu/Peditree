/**
 * drawingStyleSvg.js — puts a drawing style (drawingStyle.js drawingSpec) on
 * a finished pedigree <svg>: the typeface of its text and, for the
 * hand-drawn look, a slight waver on lines and symbols. Runs on the screen
 * drawing after every redraw, and on an export copy (so an export can be
 * standard while the screen is hand-drawn). Never adds, removes or moves a
 * symbol or a line; text is never wavered (it must stay legible).
 *
 * Connecting lines waver by their geometry: each straight piece becomes a
 * gentle curve whose ends stay exactly where they were (lines still meet),
 * and the curve depends only on where the piece runs along its length, so
 * the two strokes of a double line (consanguinity) bend alike and keep their
 * gap. Symbols waver through an SVG filter; the regions of findings inside a
 * symbol are left out, so their white separating gap stays whole.
 *
 * Idempotent: the original font size of every text is kept in data-fs, the
 * original path of every line in data-d.
 */
import { HAND_FILTER_ID, HAND_WAVER } from './drawingStyle';

const SVG_NS = 'http://www.w3.org/2000/svg';
const NODE_FILTERS = 5; // a few noise patterns, so neighbouring symbols do not waver alike
const nodeFilter = (i) => `${HAND_FILTER_ID}-node-${i % NODE_FILTERS}`;

function makeFilter(doc, id, seed, region) {
  const f = doc.createElementNS(SVG_NS, 'filter');
  f.setAttribute('id', id);
  f.setAttribute('class', 'hand-filter');
  // user space, not the bounding box: a straight line has a box of height 0
  f.setAttribute('filterUnits', 'userSpaceOnUse');
  for (const [k, v] of Object.entries(region)) f.setAttribute(k, String(v));
  const t = doc.createElementNS(SVG_NS, 'feTurbulence');
  t.setAttribute('type', 'fractalNoise');
  t.setAttribute('baseFrequency', String(HAND_WAVER.baseFrequency));
  t.setAttribute('numOctaves', String(HAND_WAVER.numOctaves));
  t.setAttribute('seed', String(seed));
  t.setAttribute('result', 'noise');
  const d = doc.createElementNS(SVG_NS, 'feDisplacementMap');
  d.setAttribute('in', 'SourceGraphic');
  d.setAttribute('in2', 'noise');
  d.setAttribute('scale', String(HAND_WAVER.scale));
  d.setAttribute('xChannelSelector', 'R');
  d.setAttribute('yChannelSelector', 'G');
  f.append(t, d);
  return f;
}

const wavers = (el) => el.tagName.toLowerCase() !== 'text'
  && !['annotations', 'ui-only', 'pulse-halo', 'condition-regions'].some((c) => el.classList.contains(c));

// a small, fixed pseudo-random number in [-1, 1] for a place on the drawing
function wobbleAt(a, b, salt) {
  let h = Math.imul(Math.round(a * 2) ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul(Math.round(b * 2) + salt, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 13;
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

/** Largest sideways bow of a hand-drawn line piece, px (a double line's strokes are 4 px apart). */
export const MAX_BOW = 2.2;

/**
 * The hand-drawn version of a connector path (PedigreeCanvas connectorPath:
 * "M x,y L x,y …" with line-jump arcs "A …"). Straight pieces of 14 px or
 * more become cubic curves, one per ~55 px, bowing at most MAX_BOW px; arcs
 * and every end point stay exactly where they were.
 */
export function sketchPath(d) {
  const tokens = String(d).match(/[MLA]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  if (!tokens) return d;
  const out = [];
  let i = 0, cx = 0, cy = 0;
  const num = () => Number(tokens[i++]);
  const f = (v) => +v.toFixed(2);
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'M') { cx = num(); cy = num(); out.push(`M${f(cx)},${f(cy)}`); }
    else if (cmd === 'A') {
      const args = [num(), num(), num(), num(), num(), num(), num()];
      cx = args[5]; cy = args[6];
      out.push(`A${args.slice(0, 5).join(' ')} ${f(cx)},${f(cy)}`);
    } else if (cmd === 'L') {
      const x = num(), y = num();
      const len = Math.hypot(x - cx, y - cy);
      if ((x !== cx && y !== cy) || len < 14) { out.push(`L${f(x)},${f(y)}`); cx = x; cy = y; continue; }
      const horiz = y === cy;
      // where the piece runs along its length: the same for both strokes of a double line
      const along0 = horiz ? Math.min(cx, x) : Math.min(cy, y);
      const n = Math.max(1, Math.round(len / 55));
      const seg = len / n;
      const amp = Math.min(MAX_BOW, len * 0.05);
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const p0 = [cx + (x - cx) * t0, cy + (y - cy) * t0];
        const p1 = [cx + (x - cx) * t1, cy + (y - cy) * t1];
        const key = along0 + Math.round(seg * k);
        // sideways offsets of the two control points (perpendicular to the piece)
        const o1 = amp * wobbleAt(key, len, 1), o2 = amp * wobbleAt(key, len, 2);
        const at = (t, o) => [p0[0] + (p1[0] - p0[0]) * t + (horiz ? 0 : o), p0[1] + (p1[1] - p0[1]) * t + (horiz ? o : 0)];
        const c1 = at(1 / 3, o1), c2 = at(2 / 3, o2);
        out.push(`C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p1[0])},${f(p1[1])}`);
      }
      cx = x; cy = y;
    } else {
      return d; // a path this function does not know: left as it is
    }
  }
  return out.join('');
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

  // --- the hand-drawn waver: connecting lines ---
  const viewport = svg.querySelector('.pedigree-viewport');
  const connectors = viewport
    ? [...viewport.children].filter((el) => el.tagName.toLowerCase() === 'path' && !el.classList.contains('ui-only'))
    : [];
  connectors.forEach((p) => {
    const d = p.getAttribute('data-d') ?? p.getAttribute('d');
    p.setAttribute('data-d', d);
    p.setAttribute('d', spec.hand ? sketchPath(d) : d);
  });

  // --- the hand-drawn waver: symbols ---
  svg.querySelectorAll('.hand-filter').forEach((f) => f.remove());
  svg.querySelectorAll(`[filter^="url(#${HAND_FILTER_ID}"]`).forEach((el) => el.removeAttribute('filter'));
  if (!spec.hand) return;
  let defs = svg.querySelector('defs');
  if (!defs) { defs = doc.createElementNS(SVG_NS, 'defs'); svg.insertBefore(defs, svg.firstChild); }
  for (let i = 0; i < NODE_FILTERS; i++) {
    defs.append(makeFilter(doc, nodeFilter(i), HAND_WAVER.seed + 11 * (i + 1), { x: -90, y: -90, width: 180, height: 180 }));
  }
  // everything of a person but its text and the regions of its findings
  svg.querySelectorAll('.node-group').forEach((n, i) => {
    [...n.children].filter(wavers).forEach((el) => el.setAttribute('filter', `url(#${nodeFilter(i)})`));
  });
  // the symbols of the key
  svg.querySelectorAll('.condition-legend > g').forEach((cell, i) => {
    [...cell.children].filter(wavers).forEach((el) => el.setAttribute('filter', `url(#${nodeFilter(i + 2)})`));
  });
}

/** An export copy keeps no helper attributes. */
export function stripStyleHelpers(svg) {
  svg.querySelectorAll?.('[data-fs]').forEach((t) => t.removeAttribute('data-fs'));
  svg.querySelectorAll?.('[data-d]').forEach((p) => p.removeAttribute('data-d'));
}
