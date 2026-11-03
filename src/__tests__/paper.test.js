/**
 * paper.test.js — squared and dotted paper under the drawing (paper.js;
 * clinician request 2026-11-03): its lines lie on the drawing's own units,
 * so they move and zoom with the drawing; far out it thins instead of
 * turning grey; plain is no background at all.
 */
import { describe, it, expect } from 'vitest';
import { paperBackground } from '../utils/paper';

const px = (s) => s.split(',').map((p) => p.trim().split(' ').map(parseFloat));

describe('the paper under the drawing', () => {
  it('plain: nothing is painted', () => {
    expect(paperBackground('plain', { x: 0, y: 0, scale: 1 })).toBeNull();
  });

  it('grid: a line every 20 drawing units, a heavier one every 80, starting on the drawing’s origin', () => {
    const bg = paperBackground('grid', { x: 130, y: 45, scale: 1 });
    expect(px(bg.backgroundSize)).toEqual([[80, 80], [80, 80], [20, 20], [20, 20]]);
    // the origin (130, 45) on screen lies on a heavy line and on a light one
    for (const [[ox, oy], [w]] of px(bg.backgroundPosition).map((p, k) => [p, px(bg.backgroundSize)[k]])) {
      expect(((130 - ox) % w + w) % w).toBeCloseTo(0, 5);
      expect(((45 - oy) % w + w) % w).toBeCloseTo(0, 5);
    }
  });

  it('zoomed in or out, the lines keep to the drawing: twice the zoom, twice the spacing', () => {
    expect(px(paperBackground('grid', { x: 0, y: 0, scale: 2 }).backgroundSize)[2]).toEqual([40, 40]);
    // far out (20 units = 2 px) the light lines would run together: they thin to every 4th
    const far = px(paperBackground('grid', { x: 0, y: 0, scale: 0.1 }).backgroundSize)[2];
    expect(far[0]).toBeGreaterThanOrEqual(8);
  });

  it('dots: one dot on every crossing of the 20-unit grid', () => {
    const bg = paperBackground('dots', { x: 100, y: 60, scale: 1 });
    expect(bg.backgroundImage).toMatch(/radial-gradient/);
    const [[ox, oy]] = px(bg.backgroundPosition);
    // the tile's centre (where the dot is) falls on a multiple of 20 from the origin
    expect(((100 - (ox + 10)) % 20 + 20) % 20).toBeCloseTo(0, 5);
    expect(((60 - (oy + 10)) % 20 + 20) % 20).toBeCloseTo(0, 5);
  });
});
