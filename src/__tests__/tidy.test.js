/**
 * tidy.test.js — "Yeniden Düzenle" gives the drawing with the fewest bends
 * (clinician request 2026-10-25): never more bends than a fresh layout,
 * never an invariant or readability violation.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { computePclLayout } from '../layout/pcl';
import { computeTidyLayout, bendScore } from '../layout/pcl/tidy';
import { CLINICAL_FIXTURES } from '../audit/clinicalFixtures';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });

describe('Yeniden Düzenle: fewest bends', () => {
  it('on the clinical fixtures: never more bends than a fresh layout, always clean, staircases removed where possible', () => {
    let fresh = 0, tidy = 0;
    for (const f of CLINICAL_FIXTURES) {
      const g = f.build();
      const a = Math.floor(bendScore(computePclLayout(g).edges));
      const t = computeTidyLayout(g);
      const b = Math.floor(bendScore(t.edges));
      expect(t.clean).toBe(true);
      expect(b).toBeLessThanOrEqual(a);
      fresh += a; tidy += b;
    }
    expect(tidy).toBeLessThan(fresh);
    expect(Math.floor(bendScore(computeTidyLayout(CLINICAL_FIXTURES[0].build()).edges))).toBe(0); // CS-01: no staircase
  });

  it('the toolbar button uses it and stays one undo step', () => {
    const S = () => usePedigreeStore.getState();
    S().resetPedigree();
    S().addSiblingOfCategory('female');
    const steps = S()._history.length;
    S().relayout();
    expect(S().layoutInfo.reason).toMatch(/en az kırılma/);
    expect(S()._history.length).toBe(steps + 1);
    expect(Math.floor(bendScore(S().pedigreeData.edges))).toBeLessThanOrEqual(Math.floor(bendScore(computePclLayout(S().doc.graph).edges)));
  });
});
