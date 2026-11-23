/**
 * exchangeMarriage.test.js — berdel / exchange marriages (clinician decision
 * 2026-11-23, after a comparison with OPX): two families whose children married
 * each other two or more times stand interleaved, every couple side by side,
 * each sibship line on a level of its own; the other family's parents may stand
 * over a sibship line (the one exception to the footprint rule). Where the rest
 * of the pedigree makes the interleaved drawing worse, the families stay apart.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { fromPed } from '../graph/ped';
import { computePclLayout } from '../layout/pcl/index';
import { layoutParentage } from '../layout/pcl/art';
import { checkAllInvariants } from '../audit/layoutInvariants';
import { checkConnectorReadability } from '../audit/connectorReadability';
import { exchangePairs } from '../layout/pcl/exchange';
import { auditLayoutIntegrity } from '../utils/layoutIntegrity';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });

const ped = (rows) => rows.map(l => 'X ' + l).join('\n');
// a PED file knows a couple only by a child: each couple has two
const BERDEL = ['P1 0 0 1 1', 'P2 0 0 2 1', 'Q1 0 0 1 1', 'Q2 0 0 2 1', 'X1 P1 P2 1 1', 'X2 P1 P2 2 1', 'Y1 Q1 Q2 1 1', 'Y2 Q1 Q2 2 1',
  'a1 X1 Y2 1 1', 'a2 X1 Y2 2 1', 'b1 Y1 X2 1 1', 'b2 Y1 X2 2 1'];
// two generations of it: the children of the two couples marry each other again
const BERDEL2 = [...BERDEL,
  'c1 a1 b2 1 1', 'c2 a1 b2 2 1', 'd1 b1 a2 1 1', 'd2 b1 a2 2 1', 'e1 c1 d2 1 2', 'e2 d1 c2 2 2'];

const draw = (rows) => {
  const doc = fromPed(ped(rows)).doc;
  const layout = computePclLayout(doc.graph);
  const id = (l) => doc.graph.individuals.find(i => i.label === l).id;
  const x = (l) => layout.nodes.find(n => n.id === id(l)).x;
  const drawn = { ...layoutParentage(doc.graph), nodes: layout.nodes, edges: layout.edges };
  return { doc, layout, x, drawn };
};

describe('exchange marriages (berdel)', () => {
  it('found: two siblings of one family married to two of another; a man married to two sisters is not one', () => {
    const { doc } = draw(BERDEL2);
    const { pairs } = exchangePairs(doc.graph);
    expect(pairs.map(p => p.couples.length)).toEqual([2, 2, 2]);
    const twoSisters = fromPed(ped(['P 0 0 1 1', 'Q 0 0 2 1', 'S1 P Q 2 1', 'S2 P Q 2 1', 'A 0 0 1 1', 'B 0 0 2 1', 'H A B 1 1', 'k1 H S1 1 1', 'k2 H S2 1 1'])).doc;
    expect(exchangePairs(twoSisters.graph).pairs).toEqual([]);
  });

  it('two generations of berdel: every couple side by side, no long partner line, the drawing compact; nothing breaks a rule', () => {
    const { x, layout, drawn } = draw(BERDEL2);
    for (const [a, b] of [['X1', 'Y2'], ['Y1', 'X2'], ['a1', 'b2'], ['b1', 'a2'], ['c1', 'd2'], ['d1', 'c2']]) {
      expect(Math.abs(x(a) - x(b)), `${a}–${b}`).toBeLessThan(130);
    }
    const xs = layout.nodes.map(n => n.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(450); // was 1176 px
    expect(checkAllInvariants(drawn)).toEqual([]);
    expect(checkConnectorReadability(drawn)).toEqual([]);
  });

  it('the two sibship lines of a pair run on levels of their own, and every line crossing them is marked', () => {
    const { layout, doc } = draw(BERDEL);
    const P = doc.graph.unions.find(u => u.partners.includes(doc.graph.individuals.find(i => i.label === 'P1').id)).id;
    const Q = doc.graph.unions.find(u => u.partners.includes(doc.graph.individuals.find(i => i.label === 'Q1').id)).id;
    const bus = (uid) => layout.edges.find(e => e.type === 'sibship' && e.unionId === uid);
    expect(Math.abs(bus(P).y1 - bus(Q).y1)).toBeGreaterThanOrEqual(15);
    const jumps = layout.edges.reduce((n, e) => n + (e.bridges || []).length, 0);
    expect(jumps).toBeGreaterThan(0);
  });

  it('the app shows no warning for it (no "overlapping rails", no one "inside a child fan")', () => {
    const S = usePedigreeStore.getState;
    expect(S().importPedFile(ped(BERDEL2)).ok).toBe(true);
    const issues = auditLayoutIntegrity(S().pedigreeData, S().doc.graph).filter(i => ['SIBSHIP_BUS_OVERLAP', 'UNRELATED_NODE_IN_CHILD_FOOTPRINT'].includes(i.code));
    expect(issues).toEqual([]);
    expect(S().integrityIssues.filter(i => i.severity !== 'info' && /BUS|FOOTPRINT/.test(i.code || ''))).toEqual([]);
  });

  it('an edit keeps the families interleaved (no switching back and forth)', () => {
    const S = usePedigreeStore.getState;
    S().importPedFile(ped(BERDEL));
    const id = (l) => S().doc.graph.individuals.find(i => i.label === l).id;
    const u = S().doc.graph.unions.find(x => x.partners.includes(id('X1')) && x.partners.includes(id('Y2'))).id;
    expect(S().addChildToUnion(u, 'female').ok).toBe(true);
    expect(S().addChildToUnion(u, 'male').ok).toBe(true);
    const x = (l) => S().pedigreeData.nodes.find(n => n.id === id(l)).x;
    expect(Math.abs(x('X1') - x('Y2'))).toBeLessThan(130);
    expect(Math.abs(x('X2') - x('Y1'))).toBeLessThan(130);
  });

  it('the other family\'s parents may stand over the sibship only in such a pair: another family there is still caught', () => {
    const { drawn } = draw(BERDEL);
    const P1 = drawn.nodes.find(n => n.id === drawn.individuals.find(i => i.label === 'P1').id);
    // a stranger on the parents' row, placed over the middle of the families
    const kids = drawn.nodes.filter(n => ['X1', 'X2'].includes(drawn.individuals.find(i => i.id === n.id).label));
    const stranger = { ...P1, id: 'stranger', x: (kids[0].x + kids[1].x) / 2 };
    const withStranger = { ...drawn, nodes: [...drawn.nodes, stranger], individuals: [...drawn.individuals, { id: 'stranger', generation: P1.generation }] };
    expect(checkAllInvariants(withStranger).map(v => v.code)).toContain('UNRELATED_NODE_IN_CHILD_FOOTPRINT');
  });
});
