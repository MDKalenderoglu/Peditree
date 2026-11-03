/**
 * paper.js — the page under the drawing (clinician request 2026-11-03: other
 * tools offer squared or dotted paper; the clinician chooses). Plain, grid or
 * dots, on the screen only: it lies in the drawing's own units, so it moves
 * and zooms with the drawing, and its heavier lines fall every 80 units — on
 * the rows the generations stand on. Exports and print stay plain (the copy
 * loses the <svg>'s style, exportUtils.js).
 */
import { tk } from '../i18n';

export const PAPERS = [
  { id: 'plain', label: tk('Düz') },
  { id: 'grid', label: tk('Kareli') },
  { id: 'dots', label: tk('Noktalı') },
];

const STEP = 20; // drawing units between two lines / dots
const MAJOR = 4; // a heavier line every MAJOR steps (80 units)
const MINOR_INK = 'rgba(100, 116, 139, 0.13)';
const MAJOR_INK = 'rgba(100, 116, 139, 0.24)';
const DOT_INK = 'rgba(100, 116, 139, 0.42)';

/**
 * The CSS background for `kind`, given where the drawing's origin is on the
 * <svg> (x, y, px) and how many px one drawing unit takes (scale). Null: plain.
 */
export function paperBackground(kind, { x, y, scale }) {
  if (kind !== 'grid' && kind !== 'dots') return null;
  let step = STEP * scale;
  while (step < 8) step *= MAJOR; // far out: fewer lines, never a grey wash
  const big = step * MAJOR;
  // where a tile starts so that its line (or, shifted by half a tile, its dot) lies on a multiple of the step
  const at = (s, shift = 0) => `${((x - shift) % s).toFixed(2)}px ${((y - shift) % s).toFixed(2)}px`;
  if (kind === 'dots') {
    const r = Math.max(0.8, Math.min(1.4, step / 14));
    return {
      backgroundImage: `radial-gradient(circle, ${DOT_INK} ${r}px, transparent ${r + 0.6}px)`,
      backgroundSize: `${step}px ${step}px`,
      backgroundPosition: at(step, step / 2),
    };
  }
  const line = (ink, dir) => `linear-gradient(${dir}, ${ink} 1px, transparent 1px)`;
  return {
    backgroundImage: [line(MAJOR_INK, 'to right'), line(MAJOR_INK, 'to bottom'), line(MINOR_INK, 'to right'), line(MINOR_INK, 'to bottom')].join(', '),
    backgroundSize: [big, big, step, step].map((s) => `${s}px ${s}px`).join(', '),
    backgroundPosition: [at(big), at(big), at(step), at(step)].join(', '),
  };
}

/** Paints the paper on the <svg> for its zoom group's current place. */
export function paintPaper(svgEl, kind) {
  if (!svgEl) return;
  const g = svgEl.querySelector('.pedigree-viewport');
  const m = g && typeof g.getScreenCTM === 'function' ? g.getScreenCTM() : null;
  const box = svgEl.getBoundingClientRect();
  const bg = m && m.a ? paperBackground(kind, { x: m.e - box.left, y: m.f - box.top, scale: m.a }) : null;
  svgEl.style.backgroundImage = bg ? bg.backgroundImage : '';
  svgEl.style.backgroundSize = bg ? bg.backgroundSize : '';
  svgEl.style.backgroundPosition = bg ? bg.backgroundPosition : '';
  if (bg) svgEl.setAttribute('data-paper', kind); else svgEl.removeAttribute('data-paper');
}
