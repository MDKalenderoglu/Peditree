/**
 * The line of descent leaves the middle of a couple's line, as far from one
 * partner as from the other (clinician report 2026-11-11: lines of descent
 * nearer one partner read as lopsided). An only child of a side-by-side
 * couple stands right under that middle, so its line runs straight down.
 */
import { describe, it, expect, vi } from 'vitest';
import { CLINICAL_FIXTURES } from '../audit/clinicalFixtures';
import { makeLargePedigree } from '../audit/largePedigrees';
import { computePclLayout } from '../layout/pcl';

function lopsided(graph) {
  const r = computePclLayout(graph);
  const pos = new Map(r.nodes.map((n) => [n.id, n]));
  const out = [];
  for (const e of r.edges) {
    if (e.type !== 'parentChildDrop') continue;
    const u = graph.unions.find((x) => x.id === e.unionId);
    if (!u || u.crossGeneration) continue;
    const [a, b] = u.partners.map((p) => pos.get(p));
    // a couple side by side: the line of descent starts on their own line
    if (!a || !b || a.y !== b.y || Math.abs(e.y1 - a.y) > 0.5) continue;
    if (Math.abs(a.x - b.x) > 120) continue;
    const off = e.x1 - (a.x + b.x) / 2;
    const stems = r.edges.filter((s) => s.type === 'childStem' && s.unionId === u.id);
    if (Math.abs(off) > 0.5) out.push({ union: u.id, off });
    // an only child nearly under the couple: settled there, straight down, no small jog
    // (one held well aside by its own partner keeps its place and its line steps over)
    const jog = stems.length === 1 ? Math.abs(stems[0].x1 - e.x1) : 0;
    if (jog > 0.5 && jog <= 16) out.push({ union: u.id, jog });
  }
  return out;
}

describe('line of descent from the middle of the couple', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  for (const f of CLINICAL_FIXTURES) {
    it(`${f.id}: every side-by-side couple, centred`, () => {
      expect(lopsided(f.build())).toEqual([]);
    });
  }
  it('a realistic 100-person pedigree', () => {
    expect(lopsided(makeLargePedigree({ seed: 1, target: 100, loops: 3 }))).toEqual([]);
  });
});
