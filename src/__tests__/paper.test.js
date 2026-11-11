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

  // the tile's lines, read back from its picture: [[x, ink], …] for the vertical ones
  const tileLines = (bg) => {
    const svg = decodeURIComponent(bg.backgroundImage.match(/data:image\/svg\+xml,([^"]+)/)[1]);
    return [...svg.matchAll(/<path d='M([\d.]+) 0V[\d.]+M0 [\d.]+H[\d.]+' stroke='([^']+)'/g)].map((m) => [Number(m[1]), m[2]]);
  };

  it('grid: one tile of 80 units with a heavier line on its edge and a light one every 20, starting on the drawing’s origin', () => {
    const bg = paperBackground('grid', { x: 130, y: 45, scale: 1 });
    expect(px(bg.backgroundSize)).toEqual([[80, 80]]);
    const [[ox, oy]] = px(bg.backgroundPosition);
    expect(((130 - ox) % 80 + 80) % 80).toBeCloseTo(0, 5);
    expect(((45 - oy) % 80 + 80) % 80).toBeCloseTo(0, 5);
    const lines = tileLines(bg);
    expect(lines.map(([x]) => x).sort((a, b) => a - b)).toEqual([0.5, 20, 40, 60]);
    // one picture: the heavy and the light lines can never drift apart into doubled lines (clinician report 2026-11-11)
    expect(bg.backgroundImage.split('url(')).toHaveLength(2);
  });

  it('zoomed in or out, the lines keep to the drawing: twice the zoom, twice the spacing', () => {
    expect(px(paperBackground('grid', { x: 0, y: 0, scale: 2 }).backgroundSize)[0]).toEqual([160, 160]);
    // far out (20 units = 2 px) the light lines would run together: they thin to every 4th
    const far = tileLines(paperBackground('grid', { x: 0, y: 0, scale: 0.1 })).map(([x]) => x).sort((a, b) => a - b);
    expect(far[1]).toBeGreaterThanOrEqual(8);
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
