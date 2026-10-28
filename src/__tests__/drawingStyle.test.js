/**
 * drawingStyle.test.js — the viewer's drawing style (clinician request
 * 2026-10-28): standard or hand-drawn, a choice of typefaces, kept per device.
 * The hand-drawn look must never change what the drawing says.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DRAWING_FONTS, DEFAULT_VIEW, STANDARD_FAMILY, normalizeView, applyViewChange, drawingSpec, exportSpec, STANDARD_SPEC,
} from '../utils/drawingStyle';
import { sketchPath, sketchCircle, MAX_BOW, SHAPE_BOW, MARK_BOW, REGION_BOW, junctionSplitter, pathPieces } from '../utils/drawingStyleSvg';

const src = (p) => readFileSync(join(process.cwd(), p), 'utf8');

/** Points along a path made of M / L / C / A commands (curves sampled). */
function samplePath(d, steps = 20) {
  const t = d.match(/[MLCAZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  const pts = [];
  let i = 0, cx = 0, cy = 0;
  const n = () => Number(t[i++]);
  while (i < t.length) {
    const c = t[i++];
    if (c === 'M' || c === 'L') { cx = n(); cy = n(); pts.push([cx, cy]); }
    else if (c === 'A') { for (let k = 0; k < 5; k++) n(); cx = n(); cy = n(); pts.push([cx, cy]); }
    else if (c === 'Z') { /* closes back to the start */ }
    else if (c === 'C') {
      const [x1, y1, x2, y2, x, y] = [n(), n(), n(), n(), n(), n()];
      for (let s = 1; s <= steps; s++) {
        const u = s / steps, v = 1 - u;
        pts.push([v ** 3 * cx + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u ** 3 * x, v ** 3 * cy + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u ** 3 * y]);
      }
      cx = x; cy = y;
    }
  }
  return pts;
}

describe('drawing style settings', () => {
  it('starts standard, with plain pedigree numbers and exports as on screen', () => {
    expect(DEFAULT_VIEW).toEqual({ drawStyle: 'standard', fontId: 'standard', plainNumbers: true, exportAs: 'screen' });
    expect(drawingSpec(DEFAULT_VIEW)).toMatchObject({ hand: false, family: STANDARD_FAMILY, k: 1, numberK: 1 });
  });

  it('offers plain and handwritten typefaces, none wider than the standard text', () => {
    expect(DRAWING_FONTS.filter(f => f.group === 'plain').map(f => f.id)).toEqual(['standard', 'atkinson', 'serif']);
    expect(DRAWING_FONTS.filter(f => f.group === 'hand').map(f => f.id)).toEqual(['kalam', 'patrick', 'caveat']);
    // measured width ratios (drawingStyle.js) × k stay at or below the standard width
    const ratio = { standard: 1, atkinson: 0.931, serif: 0.996, kalam: 0.901, patrick: 0.752, caveat: 0.723 };
    for (const f of DRAWING_FONTS) {
      expect(f.k * ratio[f.id]).toBeLessThanOrEqual(1.0005);
      expect(f.k).toBeLessThanOrEqual(1.15);
      if (f.files) expect(Object.values(f.files).flat().every(Boolean)).toBe(true); // latin and latin-ext (ğ ş ı İ)
    }
  });

  it('keeps only known values from storage', () => {
    expect(normalizeView({ drawStyle: 'crayon', fontId: 'comic', plainNumbers: 'no', exportAs: 'x' }))
      .toEqual({ drawStyle: 'standard', fontId: 'standard', plainNumbers: true, exportAs: 'screen' });
    expect(normalizeView(null)).toEqual(DEFAULT_VIEW);
  });

  it('choosing the hand-drawn look with a plain typeface also picks a handwritten one, never overriding a choice', () => {
    expect(applyViewChange(DEFAULT_VIEW, { drawStyle: 'hand' }).fontId).toBe('kalam');
    expect(applyViewChange({ ...DEFAULT_VIEW, fontId: 'caveat' }, { drawStyle: 'hand' }).fontId).toBe('caveat');
    expect(applyViewChange(DEFAULT_VIEW, { drawStyle: 'hand', fontId: 'serif' }).fontId).toBe('serif');
    // back to standard keeps the typeface the clinician has
    expect(applyViewChange({ ...DEFAULT_VIEW, drawStyle: 'hand', fontId: 'kalam' }, { drawStyle: 'standard' }).fontId).toBe('kalam');
  });

  it('pedigree numbers stay plain under a handwritten typeface when asked (I-1 / II-3 never misread)', () => {
    const hand = drawingSpec({ ...DEFAULT_VIEW, drawStyle: 'hand', fontId: 'caveat' });
    expect(hand.numberFamily).toBe(STANDARD_FAMILY);
    expect(hand.numberK).toBe(1);
    expect(drawingSpec({ ...DEFAULT_VIEW, fontId: 'caveat', plainNumbers: false }).numberFamily).toBe(hand.family);
    // a plain typeface is used for the numbers too
    expect(drawingSpec({ ...DEFAULT_VIEW, fontId: 'atkinson' }).numberFamily).toMatch(/Atkinson/);
  });

  it('exports follow the screen, or are always standard when the clinician chose that', () => {
    const v = { ...DEFAULT_VIEW, drawStyle: 'hand', fontId: 'kalam' };
    expect(exportSpec(v).hand).toBe(true);
    expect(exportSpec({ ...v, exportAs: 'standard' })).toEqual(STANDARD_SPEC);
  });

  it('is a viewing preference on this device: localStorage, never the pedigree document', () => {
    const s = src('src/utils/drawingStyle.js');
    expect(s).toMatch(/window\.localStorage\.setItem\(VIEW_KEY/);
    expect(s).not.toMatch(/sessionStorage|patientName|graph/);
    expect(src('src/state/usePedigreeStore.js')).not.toMatch(/drawStyle|fontId/);
  });
});

describe('hand-drawn lines keep their meaning', () => {
  it('every end point and line jump stays where it was; only straight pieces bend', () => {
    const d = 'M10,50L90,50A6,6 0 0 1 102,50L300,50';
    const s = sketchPath(d);
    expect(s.startsWith('M10,50')).toBe(true);
    expect(s).toContain('A6 6 0 0 1 102,50'); // the line jump, as it was
    expect(s.endsWith(' 300,50')).toBe(true);
    expect(s).toMatch(/C/);
    expect(sketchPath('M0,0L4,0')).toBe('M0,0L4,0'); // too short to bend (under 5 px)
  });

  it('bends at most MAX_BOW px sideways', () => {
    for (const d of ['M0,100L400,100', 'M50,0L50,260', 'M-30,7.5L611,7.5']) {
      const horiz = d.split('L')[0].split(',')[1] === d.split('L')[1].split(',')[1];
      const base = horiz ? Number(d.split(',')[1].split('L')[0]) : Number(d.slice(1).split(',')[0]);
      for (const [x, y] of samplePath(sketchPath(d))) expect(Math.abs((horiz ? y : x) - base)).toBeLessThanOrEqual(MAX_BOW + 1e-9);
    }
  });

  it('the two strokes of a double line (consanguinity) bend alike: their gap never changes', () => {
    for (const [a, b] of [['M120.5,398L239.5,398', 'M120.5,402L239.5,402'], ['M40,10L40,180', 'M44,10L44,180']]) {
      const pa = samplePath(sketchPath(a)), pb = samplePath(sketchPath(b));
      expect(pa.length).toBe(pb.length);
      const horiz = a.split(',')[1].split('L')[0] === a.split(',')[2];
      pa.forEach(([x, y], k) => {
        const [x2, y2] = pb[k];
        if (horiz) { expect(x2).toBeCloseTo(x, 6); expect(y2 - y).toBeCloseTo(4, 6); }
        else { expect(y2).toBeCloseTo(y, 6); expect(x2 - x).toBeCloseTo(4, 6); }
      });
    }
  });

  it('is the same every time (a reload or an export does not redraw it differently)', () => {
    expect(sketchPath('M0,0L500,0')).toBe(sketchPath('M0,0L500,0'));
  });

  it('slanted lines (twins, slashes, "//") bend too, ends fixed, within MAX_BOW', () => {
    const d = 'M200,100L140,180';
    const s = sketchPath(d);
    expect(s.startsWith('M200,100')).toBe(true);
    expect(s.endsWith(' 140,180')).toBe(true);
    expect(s).toMatch(/C/);
    // distance of every point from the straight line
    const len = Math.hypot(60, 80);
    for (const [x, y] of samplePath(s)) expect(Math.abs((x - 200) * 80 - (y - 100) * -60) / len).toBeLessThanOrEqual(MAX_BOW + 1e-9);
  });

  it('closed outlines (squares, diamonds, triangles) keep their corners and close', () => {
    const s = sketchPath('M-15,-15L15,-15L15,15L-15,15Z', { maxBow: SHAPE_BOW, salt: 3 });
    for (const corner of ['M-15,-15', ' 15,-15', ' 15,15', ' -15,15']) expect(s).toContain(corner);
    expect(s.endsWith(' -15,-15Z')).toBe(true);
  });

  it('a hand-drawn circle is closed and never more than SHAPE_BOW from the true circle; symbols differ', () => {
    const s = sketchCircle(0, 0, 15, 42);
    expect(s.endsWith('Z')).toBe(true);
    for (const [x, y] of samplePath(s, 40)) expect(Math.abs(Math.hypot(x, y) - 15)).toBeLessThanOrEqual(SHAPE_BOW + 0.15);
    expect(sketchCircle(0, 0, 15, 42)).toBe(s);
    expect(sketchCircle(0, 0, 15, 43)).not.toBe(s);
  });

  it('two parallel bars (infertile) bend alike', () => {
    const a = samplePath(sketchPath('M90,224L112,224', { maxBow: SHAPE_BOW })), b = samplePath(sketchPath('M90,229L112,229', { maxBow: SHAPE_BOW }));
    a.forEach(([x, y], k) => { expect(b[k][0]).toBeCloseTo(x, 6); expect(b[k][1] - y).toBeCloseTo(5, 6); });
  });

  it('where one line ends on another, the bend passes exactly through that point (no poke, no gap)', () => {
    // a relationship line, its line of descent, the sibship line, two children's lines
    const paths = ['M100,200L300,200', 'M200,200L200,260', 'M120,260L280,260', 'M120,260L120,300', 'M280,260L280,300'];
    const splitsFor = junctionSplitter(paths.flatMap(pathPieces));
    const host = (d, x, y) => samplePath(sketchPath(d, { splitsFor }), 40).some(([px, py]) => Math.hypot(px - x, py - y) < 1e-6);
    expect(host(paths[0], 200, 200)).toBe(true); // the line of descent leaves the relationship line
    expect(host(paths[2], 200, 260)).toBe(true); // and reaches the sibship line
  });

  it('a double line keeps its strokes parallel when a line of descent leaves the lower one', () => {
    const paths = ['M120,398L240,398', 'M120,402L240,402', 'M180,402L180,460'];
    const splitsFor = junctionSplitter(paths.flatMap(pathPieces));
    const top = samplePath(sketchPath(paths[0], { splitsFor })), bottom = samplePath(sketchPath(paths[1], { splitsFor }));
    expect(top.length).toBe(bottom.length);
    top.forEach(([x, y], k) => { expect(bottom[k][0]).toBeCloseTo(x, 6); expect(bottom[k][1] - y).toBeCloseTo(4, 6); });
    expect(bottom.some(([x, y]) => x === 180 && y === 402)).toBe(true);
  });

  it("the twins' bar ends exactly on the twins' slanted lines", () => {
    const paths = ['M200,100L150,160', 'M200,100L250,160', 'M175,130L225,130'];
    const splitsFor = junctionSplitter(paths.flatMap(pathPieces));
    const pts = samplePath(sketchPath(paths[0], { splitsFor }), 40);
    expect(pts.some(([x, y]) => Math.hypot(x - 175, y - 130) < 1e-6)).toBe(true);
  });

  it('every piece visibly bends: at least 2/3 of its allowed bow (slashes of deceased, TOP and separation too)', () => {
    const bowOf = (d, [x0, y0, x1, y1]) => {
      const L = Math.hypot(x1 - x0, y1 - y0);
      return Math.max(...samplePath(d, 60).map(([x, y]) => Math.abs((x - x0) * (y1 - y0) - (y - y0) * (x1 - x0)) / L));
    };
    // a deceased slash (68 px, two pieces) and a separation slash (20 px), as sketchElement draws them
    const slash = sketchPath('M-24,-24L24,24', { maxBow: MARK_BOW, rel: 0.1 });
    expect(bowOf(slash, [-24, -24, 24, 24])).toBeGreaterThan(1.2);
    expect(bowOf(slash, [-24, -24, 24, 24])).toBeLessThanOrEqual(MARK_BOW + 1e-9);
    const sep = sketchPath('M274.5,408L286.5,392', { maxBow: MARK_BOW, rel: 0.1 });
    expect(bowOf(sep, [274.5, 408, 286.5, 392])).toBeGreaterThan(1);
    // a union line
    expect(bowOf(sketchPath('M100,50L170,50'), [100, 50, 170, 50])).toBeGreaterThan(0.6);
  });

  it("a finding's sector edge and the line dividing the symbol bend alike: the white gap stays on the divider", () => {
    const R = 30.6;
    const sector = `M0,0L${R * Math.cos(-Math.PI / 2)},${R * Math.sin(-Math.PI / 2)}A${R},${R} 0 0 1 ${R},0Z`;
    const dividers = [`M0,${-R}L0,${R}`, `M${-R},0L${R},0`];
    const splitsFor = junctionSplitter([...dividers, sector].flatMap(pathPieces));
    const sec = samplePath(sketchPath(sector, { maxBow: REGION_BOW, salt: 9, splitsFor }), 30);
    const div = dividers.flatMap(d => samplePath(sketchPath(d, { maxBow: REGION_BOW, salt: 9, splitsFor }), 60));
    // every point of the sector's straight edges lies on a divider (the arc is outside the symbol)
    for (const [x, y] of sec.filter(([x, y]) => Math.hypot(x, y) < 17)) {
      expect(Math.min(...div.map(([a, b]) => Math.hypot(a - x, b - y)))).toBeLessThan(0.15);
    }
  });

  it('drawn by geometry, never a pixel filter (a filter broke outlines into dashes); fills, regions and text untouched', () => {
    const svgSrc = src('src/utils/drawingStyleSvg.js');
    expect(svgSrc).not.toMatch(/feTurbulence|feDisplacementMap|setAttribute\('filter'/);
    expect(svgSrc).toMatch(/querySelectorAll\('\.condition-regions'\)/); // regions: divider and sector edges drawn alike
    expect(svgSrc).toMatch(/tag === 'text'/);
    // the original outline is hidden, never removed; its fill stays exact
    expect(svgSrc).toMatch(/setAttribute\('stroke-opacity', '0'\)/);
    // a carrier's dot: a hand-drawn dot of the same fill, the original hidden
    expect(svgSrc).toMatch(/setAttribute\('fill-opacity', '0'\)/);
    // the original dot's outline (page stylesheet) is hidden too, or a stiff ring stays around the hand-drawn dot
    expect(svgSrc).toMatch(/setAttribute\('fill-opacity', '0'\);\n\s*c\.setAttribute\('stroke-opacity', '0'\)/);
    expect(src('src/styles/app.css')).toMatch(/\.condition-regions path\.region-divider-sketch \{\s*stroke: #1e293b;/);
    // a dashed line keeps its dashes
    expect(svgSrc).toMatch(/'stroke-dasharray'/);
    // selection, focus and drop styles reach the hand-drawn outline
    expect(src('src/styles/app.css')).toMatch(/\.node-selected > \.pedigree-shape-sketch/);
    expect(src('src/styles/ui.css')).toMatch(/focus-visible > \.pedigree-shape-sketch/);
  });

  it('the renderer applies the style after drawing; exports apply the export style to their copy', () => {
    expect(src('src/components/PedigreeCanvas.jsx')).toMatch(/applyDrawingStyle\(svgRef\.current, drawing\)/);
    const ex = src('src/utils/exportUtils.js');
    expect(ex).toMatch(/if \(spec\) applyDrawingStyle\(clone, spec\)/);
    expect(ex).toMatch(/stripStyleHelpers\(clone\)/);
  });
});
