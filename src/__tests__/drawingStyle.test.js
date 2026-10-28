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
import { sketchPath, sketchCircle, MAX_BOW, SHAPE_BOW } from '../utils/drawingStyleSvg';

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
    expect(sketchPath('M0,0L5,0')).toBe('M0,0L5,0'); // too short to bend
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

  it('drawn by geometry, never a pixel filter (a filter broke outlines into dashes); fills, regions and text untouched', () => {
    const svgSrc = src('src/utils/drawingStyleSvg.js');
    expect(svgSrc).not.toMatch(/feTurbulence|feDisplacementMap|setAttribute\('filter'/);
    expect(svgSrc).toMatch(/'condition-regions'/); // the white gap between findings is not redrawn
    expect(svgSrc).toMatch(/tag === 'text'/);
    // the original outline is hidden, never removed; its fill stays exact
    expect(svgSrc).toMatch(/setAttribute\('stroke-opacity', '0'\)/);
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
