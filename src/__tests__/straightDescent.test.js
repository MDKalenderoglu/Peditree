/**
 * An only child (or one group of twins) hangs from a straight line of descent, never from a
 * staircase (clinician report 2026-11-07: after "Konumlandır" the line to the proband was stepped).
 * The case: the clinician fixed the birth order of the mother's sibship, so a younger sister
 * stands between the mother and the father; the couple is joined by a lane above the row and the
 * line of descent leaves through the gap beside the sister. The child must stand under that gap.
 */
import { describe, it, expect } from 'vitest';
import { starterDocument } from '../state/usePedigreeStore';
import * as ops from '../graph/ops';
import { addMultipleSibling } from '../graph/multiples';
import { computePclLayout } from '../layout/pcl';
import { computeTidyLayout } from '../layout/pcl/tidy';
import { computeStableLayout } from '../layout/pcl/incremental';
import { checkAllInvariants } from '../audit/layoutInvariants';
import { checkConnectorReadability } from '../audit/connectorReadability';

const ok = (r) => { if (!r.ok) throw new Error(r.reason); return r; };
const parentsOf = (doc, id) => doc.graph.parentChildRelationships.find((p) => p.children.includes(id)).unionId;

/** The mother's sibship in a fixed order; `between` of her sisters stand after her, before the father. */
function family({ between = 1, before = 2 } = {}) {
  let doc = starterDocument();
  const sibs = [];
  for (let k = 0; k < before + between; k++) {
    const r = ok(ops.addSibling(doc, 'mother', { sex: k % 2 ? 'male' : 'female' }));
    doc = r.doc;
    sibs.push(r.created.childId);
  }
  const order = [...sibs.slice(0, before), 'mother', ...sibs.slice(before)];
  doc = ok(ops.setChildOrder(doc, parentsOf(doc, 'mother'), order)).doc;
  return doc;
}

/** Families whose children all hang from one point; for each, how far the line of descent is from it. */
function jogs(layout) {
  const out = [];
  const byUnion = new Map();
  for (const e of layout.edges) {
    if (!e.unionId) continue;
    if (!byUnion.has(e.unionId)) byUnion.set(e.unionId, []);
    byUnion.get(e.unionId).push(e);
  }
  for (const [u, es] of byUnion) {
    const drop = es.find((e) => e.type === 'parentChildDrop');
    const apexes = [...new Set(es.filter((e) => e.type === 'childStem').map((e) => e.x1))];
    if (!drop || apexes.length !== 1) continue;
    const lane = es.some((e) => e.lane);
    const off = Math.abs(apexes[0] - drop.x1);
    if (off > 0.5) out.push({ u, off, lane });
  }
  return out;
}

const clean = (doc, layout) => {
  const pd = { ...doc.graph, ...layout };
  expect(checkAllInvariants(pd).map((v) => v.code)).toEqual([]);
  expect(checkConnectorReadability(pd).map((v) => v.code)).toEqual([]);
};

describe('a line of descent from a lane is straight (clinician report 2026-11-07)', () => {
  const shapes = {
    'one sister between the parents': () => family(),
    'two siblings between the parents': () => family({ between: 2, before: 1 }),
    'twins under the lane': () => ok(addMultipleSibling(family(), 'proband', { sex: 'female' })).doc,
    'the father has siblings too': () => {
      let doc = family();
      for (let k = 0; k < 2; k++) doc = ok(ops.addSibling(doc, 'father', { sex: 'male' })).doc;
      return doc;
    },
  };
  for (const [name, build] of Object.entries(shapes)) {
    it(`${name}: "Konumlandır" and a fresh layout draw it straight, and the drawing stays clean`, () => {
      const doc = build();
      for (const layout of [computeTidyLayout(doc.graph), computePclLayout(doc.graph)]) {
        const lanes = layout.edges.filter((e) => e.lane && e.unionId === 'U_PARENTS');
        expect(lanes.length).toBe(1); // the case really is a couple joined by a lane
        expect(jogs(layout).filter((j) => j.u === 'U_PARENTS')).toEqual([]);
        clean(doc, layout);
      }
    });
  }

  it('an edit elsewhere keeps the line straight (edit-local layout)', () => {
    const doc = family();
    const prev = computeTidyLayout(doc.graph);
    const next = ok(ops.addSibling(doc, 'father', { sex: 'female' })).doc;
    const L = computeStableLayout(next.graph, { prevGraph: doc.graph, prevNodes: prev.nodes, prevEdges: prev.edges });
    expect(jogs(L).filter((j) => j.u === 'U_PARENTS')).toEqual([]);
  });

  it('the proband stands under the gap, clear of the sister between the parents', () => {
    const doc = family();
    const layout = computeTidyLayout(doc.graph);
    const x = (id) => layout.nodes.find((n) => n.id === id).x;
    const sister = doc.graph.parentChildRelationships.find((p) => p.unionId === parentsOf(doc, 'mother')).children.at(-1);
    expect(x('proband')).toBeGreaterThan(x(sister) + 20 + 6);
    expect(x('proband')).toBeLessThan(x('father') - 20);
  });

  it('a couple side by side keeps its only child under its middle', () => {
    const doc = starterDocument();
    const layout = computeTidyLayout(doc.graph);
    const x = (id) => layout.nodes.find((n) => n.id === id).x;
    expect(x('proband')).toBeCloseTo((x('mother') + x('father')) / 2, 0);
    expect(jogs(layout)).toEqual([]);
  });
});
