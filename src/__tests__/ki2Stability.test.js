/**
 * ki2Stability.test.js — KI-2 edit-local stability, measured on what the
 * clinician sees (the store's drawing) with the same harness that writes
 * reports/layout-stability-{before,after}.md (src/audit/stabilityHarness.js).
 *
 * Acceptance criteria (Aşama 1):
 *   1. unchanged persons keep their coordinates (attribute edits, reopen)
 *   2. displacement outside the edited block (ratchet, targeted edits)
 *   3. no unexplained parent left/right flip
 *   4. sibling order preserved
 *   5. undo / redo bring back the same drawing
 *   6. save → load gives the same drawing
 *   7. no regression in large / consanguineous families (KI-3 fixtures)
 * plus: stability never costs readability in aggregate (drawn vs fresh).
 *
 * Ceilings are the values measured on 2026-10-18 (ratchet): a change may
 * improve them (then lower the ceiling), never worsen them. They are not
 * targets — docs/PEDITREE_KNOWN_ISSUES.md (KI-2) lists what is still open.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { runRandomPopulation, runTargeted, SCENARIOS } from '../audit/stabilityHarness';
import { computePclLayout } from '../layout/pcl';
import { computeStableLayout, affectedPeople } from '../layout/pcl/incremental';
import { computePedigreeLayoutV2 } from '../utils/pedigreeLayoutV2';
import { createDocument } from '../graph/document';
import { addChildToPerson, addPartner, addSibling, updatePerson } from '../graph/ops';
import { checkAllInvariants } from '../audit/layoutInvariants';
import { checkConnectorReadability, readabilityMetrics } from '../audit/connectorReadability';
import { displayParentage } from '../graph/model';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });

const S = () => usePedigreeStore.getState();
const coords = () => JSON.stringify(S().pedigreeData.nodes.map(n => [n.id, n.x, n.y]).sort());

describe('KI-2 store level — random edit populations', () => {
  const CEILINGS = {
    // re-measured after KI-8 (2026-10-19). Raised, as a recorded trade-off of
    // KI-8 (docs/PEDITREE_KI8_REPORT.md): random editsWorseThanFresh.offCenter
    // 6 → 9 (fresh layouts themselves improved 144 → 117 off-centre couples;
    // drawn 92 → 88), sideHangDrawn 2318 → 2331 and 351 → 353 (+19 moderate
    // 5–45 px offsets, −2 above 45 px). Everything else is lower than before.
    // 2026-10-23, clinician request: after a removal the drawing closes up
    // (incremental.js 'compact': previous order, fresh coordinates). Removals
    // now move people on purpose, so movedFraction / neighbourGapChanged /
    // meanShiftRawPx were RAISED to the new measured values (random 0.3651 →
    // 0.3987, 0.1915 → 0.1998, 21.2 → 31.9 px; ki2 0.3627 → 0.3848, 16.5 →
    // 21.5 px); flips unchanged, unexplained flips 0; side-hang lowered.
    // 2026-10-24, clinician request: a new pedigree opens with straight lines
    // of descent (founder couples right over their only child, PCL
    // opts.straightStart — new pedigrees only). The populations start from
    // that drawing. Re-measured; recorded trade-off:
    //   lower (better): random parentFlips 9 → 8, movedFraction 0.3987 → 0.3915,
    //     sideHangDrawn 2238 → 2196;
    //   RAISED: random neighbourGapChanged 0.1998 → 0.2047, meanShiftRawPx
    //     31.9 → 33, editsWorseThanFresh.offCenter 9 → 10; ki2 movedFraction
    //     0.3848 → 0.3857, neighbourGapChanged 0.1956 → 0.2016, meanShiftRawPx
    //     21.5 → 22.2.
    // Unexplained flips stay 0; KI-3 large-pedigree ratchets unchanged.
    // 2026-10-25: the proband opens affected (clinician request) — it now
    // counts as a person with clinical data, so a few random edits end
    // differently: random movedFraction 0.3915 → 0.3917 (recorded).
    'random-200x12': {
      prefix: 'stab', sequences: 200, ops: 12, parentFlips: 8, movedFraction: 0.3917, neighbourGapChanged: 0.2047, meanShiftRawPx: 33,
      editsWorseThanFresh: { offCenter: 10, crossings: 3, longUnions: 2 }, sideHangDrawn: 2196,
    },
    'ki2-40x10': {
      prefix: 'ki2-', sequences: 40, ops: 10, parentFlips: 1, movedFraction: 0.3857, neighbourGapChanged: 0.2016, meanShiftRawPx: 22.2,
      editsWorseThanFresh: { offCenter: 0, crossings: 0, longUnions: 0 }, sideHangDrawn: 342,
    },
  };
  for (const [name, c] of Object.entries(CEILINGS)) {
    describe(name, () => {
      let p;
      beforeAll(() => { p = runRandomPopulation(usePedigreeStore, c); }, 120000);

      it('no parent flip without a structural reason (target: 0)', () => {
        expect(p.parentFlipsUnexplained).toBe(0);
      });
      it('parent flips, movement and local rearrangement do not get worse (ratchet)', () => {
        expect(p.parentFlips).toBeLessThanOrEqual(c.parentFlips);
        expect(p.movedFraction).toBeLessThanOrEqual(c.movedFraction);
        expect(p.neighbourGapChanged).toBeLessThanOrEqual(c.neighbourGapChanged);
        expect(p.meanShiftRawPx).toBeLessThanOrEqual(c.meanShiftRawPx);
      });
      it('stability costs no readability in aggregate: off-centre couples, crossings, long partner lines ≤ fresh layouts', () => {
        const r = p.readability;
        expect(r.offCenterDrawn).toBeLessThanOrEqual(r.offCenterFresh);
        expect(r.crossingsDrawn).toBeLessThanOrEqual(r.crossingsFresh);
        expect(r.longUnionsDrawn).toBeLessThanOrEqual(r.longUnionsFresh);
        expect(r.lineOverOwnPartnerDrawn).toBeLessThanOrEqual(r.lineOverOwnPartnerFresh); // KI-8
      });
      it('edits drawn worse than a fresh layout, and side-hanging sibship lines, do not increase (ratchet)', () => {
        const r = p.readability;
        expect(r.editsMoreOffCenterThanFresh).toBeLessThanOrEqual(c.editsWorseThanFresh.offCenter);
        expect(r.editsMoreCrossingsThanFresh).toBeLessThanOrEqual(c.editsWorseThanFresh.crossings);
        expect(r.editsMoreLongUnionsThanFresh).toBeLessThanOrEqual(c.editsWorseThanFresh.longUnions);
        // known cost: more single children not exactly below their parents than fresh (KI-2 risk)
        expect(r.sideHangDrawn).toBeLessThanOrEqual(c.sideHangDrawn);
      });
    });
  }
});

describe('KI-2 store level — targeted clinical edits', () => {
  // people outside the affected block that moved > 2 px, per scenario | edit
  const MOVED_OUTSIDE_CEILING = {
    'starter|child to the proband': 0,
    'starter|sibling to the proband': 0,
    'sibshipWithRelatives|spouse+child to first male sibling': 13,
    'sibshipWithRelatives|child to the proband': 0,
    'sibshipWithRelatives|sibling to the proband': 12,
    'sibshipWithRelatives|spouse to the first female sibling': 13,
    'consanguineousParents|spouse+child to first male sibling': 11,
    'consanguineousParents|child to the proband': 11,
    'consanguineousParents|sibling to the proband': 9,
    'consanguineousParents|spouse to the first female sibling': 11,
  };
  const RESHAPED_CEILING = 14; // untouched families whose internal spacing changed, all edits together
  let results;
  beforeAll(() => { results = runTargeted(usePedigreeStore).filter(r => !r.skipped); }, 120000);

  it('every scenario edit was applied', () => {
    expect(results.map(r => `${r.scenario}|${r.edit}`).sort()).toEqual(Object.keys(MOVED_OUTSIDE_CEILING).sort());
  });
  it('no parent flip, no sibling-order change', () => {
    for (const r of results) {
      expect(r.parentFlip, `${r.scenario} / ${r.edit}`).toBe(false);
      expect(r.siblingOrderChanges, `${r.scenario} / ${r.edit}`).toBe(0);
    }
  });
  it('undo and redo bring back exactly the drawing that was shown', () => {
    for (const r of results) {
      expect(r.undoExact, `${r.scenario} / ${r.edit}`).toBe(true);
      expect(r.redoExact, `${r.scenario} / ${r.edit}`).toBe(true);
    }
  });
  it('save → load reproduces the drawing (0 px)', () => {
    for (const r of results) expect(r.saveLoadMaxPx, `${r.scenario} / ${r.edit}`).toBe(0);
  });
  it('movement outside the edited block does not get worse (ratchet)', () => {
    for (const r of results) expect(r.movedOutside, `${r.scenario} / ${r.edit}`).toBeLessThanOrEqual(MOVED_OUTSIDE_CEILING[`${r.scenario}|${r.edit}`]);
    expect(results.reduce((a, r) => a + Number(r.familyShapeChanges.split('/')[0]), 0)).toBeLessThanOrEqual(RESHAPED_CEILING);
  });
});

describe('KI-2 store level — unchanged people, reopen, "Yeniden Düzenle"', () => {
  it('an attribute-only edit (affected status) leaves every coordinate unchanged', () => {
    SCENARIOS.consanguineousParents(S);
    const before = coords();
    S().updateIndividual('sib_m_0', { affected: true });
    expect(S().doc.graph.individuals.find(i => i.id === 'sib_m_0').affected).toBe(true);
    expect(coords()).toBe(before);
    expect(S().layoutInfo.level).toBe('frozen');
  });

  it('a project file carries the drawing; a file without it gets a fresh layout', () => {
    SCENARIOS.sibshipWithRelatives(S);
    S().addSiblingTo('proband', 'male');
    const drawn = coords();
    const file = S().exportProjectFile();
    expect(JSON.parse(file).layoutHints.version).toBe(1);
    S().resetPedigree();
    S().openProjectFile(file);
    expect(coords()).toBe(drawn);
    const bare = JSON.parse(file);
    delete bare.layoutHints;
    S().openProjectFile(JSON.stringify(bare));
    const fresh = computePedigreeLayoutV2(S().doc.graph);
    expect(coords()).toBe(JSON.stringify(fresh.nodes.map(n => [n.id, n.x, n.y]).sort()));
  });

  it('"Yeniden Düzenle" draws a fresh layout of the same graph and is undoable', () => {
    SCENARIOS.sibshipWithRelatives(S);
    S().addSpouseTo(S().wizardData.siblings.female[0].id, 'male');
    const doc = S().doc, drawn = coords();
    S().relayout();
    expect(S().doc).toBe(doc); // the graph does not change
    const fresh = computePedigreeLayoutV2(doc.graph);
    expect(coords()).toBe(JSON.stringify(fresh.nodes.map(n => [n.id, n.x, n.y]).sort()));
    expect(S().layoutInfo.level).toBe('full');
    S().undo();
    expect(coords()).toBe(drawn);
  });
});

describe('KI-2 PCL level — edit-local relayout', () => {
  const small = () => {
    SCENARIOS.consanguineousParents(S);
    return S().doc;
  };

  it('no change → the previous drawing exactly ("frozen"), nobody free → nobody moves', () => {
    const doc = small();
    const prev = computePclLayout(doc.graph);
    const same = computeStableLayout(doc.graph, { prevGraph: doc.graph, prevNodes: prev.nodes, prevEdges: prev.edges });
    expect(same.meta.stability.level).toBe('frozen');
    expect(same.nodes.map(n => [n.id, n.x, n.y])).toEqual(prev.nodes.map(n => [n.id, n.x, n.y]));
    // an attribute edit is not a structural change
    const edited = updatePerson(doc, 'sib_m_0', { affected: true }).doc;
    expect(affectedPeople(doc.graph, edited.graph).size).toBe(0);
  });

  it('a new child: affected = the parents and the child, not the whole sibship', () => {
    const doc = small();
    const r = addChildToPerson(doc, 'proband', { sex: 'female' });
    const aff = affectedPeople(doc.graph, r.doc.graph);
    expect([...aff].sort()).toEqual(['proband', r.created.spouseId, r.created.childId].sort());
  });

  it('a level is reported and the result is clean', () => {
    const doc = small();
    const prev = computePclLayout(doc.graph);
    const r = addSibling(doc, 'proband', { sex: 'male' });
    const L = computeStableLayout(r.doc.graph, { prevGraph: doc.graph, prevNodes: prev.nodes, prevEdges: prev.edges });
    expect(['local', 'wide', 'full']).toContain(L.meta.stability.level);
    const drawn = { ...displayParentage(r.doc.graph).graph, ...L };
    expect(checkAllInvariants(drawn)).toEqual([]);
    expect(checkConnectorReadability(drawn)).toEqual([]);
  });
});

// Large families: the frozen KI-3 stress pedigrees, edited once each. The
// readability guard often hands these dense drawings to a fresh layout
// (docs/PEDITREE_KNOWN_ISSUES.md, KI-2). Time ceilings are regression
// ceilings (KI-10), not product targets: measured 2026-10-18 — 263: ≤ 0.4 s,
// 387: ≤ 2.2 s, 474: ≤ 2.8 s (when the stable levels do not qualify, three
// layouts are computed).
describe('KI-2 large families (KI-3 fixtures)', () => {
  const load = (id) => JSON.parse(readFileSync(join(process.cwd(), 'src/__tests__/regression/ki3', `${id}.json`), 'utf8')).graph;
  const EDITS = {
    'child to proband': (d) => addChildToPerson(d, 'proband', { sex: 'female' }),
    'sibling to proband': (d) => addSibling(d, 'proband', { sex: 'male' }),
    'spouse to mother': (d) => addPartner(d, 'mother', { sex: 'male' }),
  };
  const CASES = [
    { id: 'ki3-p3-263', edits: Object.keys(EDITS), budgetMs: 2000 },
    { id: 'ki3-p4-387', edits: Object.keys(EDITS), budgetMs: 5000 },
    { id: 'ki3-p5-474', edits: ['child to proband', 'sibling to proband'], budgetMs: 8000 },
  ];
  for (const c of CASES) {
    describe(c.id, () => {
      let doc, prev;
      beforeAll(() => { doc = createDocument(load(c.id)); prev = computePclLayout(doc.graph); }, 60000);

      it('reopening reproduces the drawing exactly', () => {
        const L = computeStableLayout(doc.graph, { prevNodes: prev.nodes, frozen: true });
        expect(L.nodes.map(n => [n.id, n.x, n.y])).toEqual(prev.nodes.map(n => [n.id, n.x, n.y]));
      }, 60000);

      for (const name of c.edits) {
        it(`${name}: clean drawing, readability guarded, within the time ceiling`, () => {
          const r = EDITS[name](doc);
          expect(r.ok).toBe(true);
          const t0 = performance.now();
          const L = computeStableLayout(r.doc.graph, { prevGraph: doc.graph, prevNodes: prev.nodes, prevEdges: prev.edges });
          const ms = performance.now() - t0;
          const drawn = { ...displayParentage(r.doc.graph).graph, ...L };
          expect(checkAllInvariants(drawn).map(v => v.code)).toEqual([]);
          expect(checkConnectorReadability(drawn).map(v => v.code)).toEqual([]);
          expect(L.nodes.length).toBe(r.doc.graph.individuals.length);
          expect(ms).toBeLessThan(c.budgetMs);
          // the guarantee: no more crossings, off-centre couples or long
          // partner lines than the previous drawing — or, when the edit adds
          // problems in every layout, no more in total than a fresh layout
          const problems = (g, l) => {
            const m = readabilityMetrics({ ...displayParentage(g).graph, ...l });
            return [m.bridgedCrossings, m.offCenter, m.longUnions];
          };
          const now = problems(r.doc.graph, L), before = problems(doc.graph, prev);
          const sum = (a) => a.reduce((x, y) => x + y, 0);
          if (!now.every((v, k) => v <= before[k])) {
            expect(sum(now)).toBeLessThanOrEqual(sum(problems(r.doc.graph, computePclLayout(r.doc.graph))));
          }
        }, 120000);
      }
    });
  }
});
