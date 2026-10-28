/**
 * doubleLineJunction.test.js — a line leaving a double relationship line
 * (consanguinity) downwards starts at its lower stroke, never in the gap
 * between the two strokes (clinician feedback 2026-10-28: the line of
 * descent started at the middle and poked into the gap).
 *
 * The renderer runs in the browser (D3, DOM), so this guards its source, as
 * the other notation tests do; measured in the browser on a pedigree with
 * two double lines: 0 line ends in a gap.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'src/components/PedigreeCanvas.jsx'), 'utf8');

describe('lines leaving a double line', () => {
  it('the two strokes and the lines leaving them share one offset', () => {
    expect(src).toMatch(/const DOUBLE_OFFSET = 2;/);
    expect(src).toMatch(/drawStroke\(g, edge, 0, -DOUBLE_OFFSET\); drawStroke\(g, edge, 0, DOUBLE_OFFSET\);/);
  });

  it('a line of descent starts at the lower stroke of a double line', () => {
    const block = src.slice(src.indexOf("case 'parentChildDrop':"), src.indexOf("case 'sibship':"));
    expect(block).toMatch(/case 'childlessDrop':/);
    expect(block).toMatch(/belowDouble\(edge\.x1, edge\.y1, edge\.unionId\)/);
  });

  it('the childless / infertile mark starts there too', () => {
    expect(src).toMatch(/m\.append\('line'\)\.attr\('x1', e\.x\)\.attr\('y1', belowDouble\(e\.x, e\.y, e\.unionId\)\)/);
  });

  it('only the line\'s own union counts: another couple\'s double line at the same point moves nothing (review finding)', () => {
    expect(src).toMatch(/const sameUnion = \(e, unionId\) => !unionId \|\| !e\.unionId \|\| e\.unionId === unionId;/);
    expect(src).toMatch(/doubleLevels\.some\(e => sameUnion\(e, unionId\) &&/);
  });

  it('only a point on a horizontal double line moves; every other line stays where the layout put it', () => {
    expect(src).toMatch(/const belowDouble = \(x, y, unionId\) => \(onDouble\(x, y, unionId\) \? y \+ DOUBLE_OFFSET : y\);/);
    expect(src).toMatch(/consanguineousUnionUnresolved'\) && e\.y1 === e\.y2\)/);
  });
});
