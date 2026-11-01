/**
 * doubleLine.test.js — a cross-generation couple's line (clinician feedback
 * 2026-11-01): two bends where nothing is in the way, not four, and the
 * double line drawn as two parallel paths whose corners meet.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { chainOf, offsetPolyline } from '../utils/doubleLine';
import { starterDocument } from '../state/usePedigreeStore';
import { buildTemplate, relationSpec, pathsOf } from '../graph/templates';
import { computeTidyLayout } from '../layout/pcl/tidy';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });

describe('double line around corners', () => {
  it('the segments in any order become one polyline', () => {
    const segs = [
      { x1: 10, y1: 100, x2: 50, y2: 100 },
      { x1: 0, y1: 0, x2: 10, y2: 0 },
      { x1: 10, y1: 0, x2: 10, y2: 100 },
    ];
    const chain = chainOf(segs);
    // either end may come first
    expect(chain[0][0] === 0 ? chain : [...chain].reverse()).toEqual([[0, 0], [10, 0], [10, 100], [50, 100]]);
    expect(chainOf([{ x1: 0, y1: 0, x2: 1, y2: 0 }, { x1: 5, y1: 5, x2: 6, y2: 5 }])).toBeNull();
  });

  it('each side keeps the same distance on every segment and meets at the corners', () => {
    const left = offsetPolyline([[0, 0], [10, 0], [10, 100], [50, 100]], -2);
    expect(left).toEqual([[0, -2], [12, -2], [12, 98], [50, 98]]);
    const right = offsetPolyline([[0, 0], [10, 0], [10, 100], [50, 100]], 2);
    expect(right).toEqual([[0, 2], [8, 2], [8, 102], [50, 102]]);
  });
});

describe('cross-generation couple line', () => {
  it('a once-removed couple in a ready-made family: across, down, across — two bends', () => {
    for (const [f, m] of [[1, 2], [2, 1], [2, 3], [3, 2]]) for (const fp of pathsOf(f)) for (const mp of pathsOf(m)) {
      const r = buildTemplate(starterDocument(), relationSpec({ father: fp, mother: mp }));
      const t = computeTidyLayout(r.doc.graph);
      const points = chainOf(t.edges.filter(e => e.unionId === 'U_PARENTS' && e.type.startsWith('consanguineous')));
      expect(points, `${fp}|${mp}`).not.toBeNull();
      const turns = points.slice(1, -1).filter((p, i) => {
        const a = points[i], b = points[i + 2];
        return (a[0] === p[0]) !== (p[0] === b[0]);
      }).length;
      expect(turns, `${fp}|${mp}`).toBe(2);
    }
  });
});
