/**
 * layoutOwnership.test.js — v0.4.1 regression fixtures.
 *
 * Root cause fixed: the per-generation X packer (layoutPacking.js) only
 * enforced a flat minimum gap between ADJACENT same-generation nodes. It had
 * no notion that a node anchoring a wide sibship below it needs its full
 * descendant footprint reserved — so a childless sibling one seat away from
 * the true parents could end up sitting horizontally inside that footprint,
 * visually (though not structurally) implying they were also a parent.
 *
 * The fix (placeGenerationWithFootprints in layoutPacking.js) reserves each
 * union's exact child-footprint as a solid block neither non-anchors before
 * nor after it may intrude into, and CHECK 11 (UNRELATED_NODE_IN_CHILD_
 * FOOTPRINT) in layoutIntegrity.js is the permanent regression gate for it.
 *
 * These fixtures are the acceptance harness: each must audit clean.
 */
import { describe, it, expect } from 'vitest';
import { computePedigreeLayoutV2 } from '../utils/pedigreeLayoutV2';
import { auditLayoutIntegrity } from '../utils/layoutIntegrity';
import { auditPedigreeGraph } from '../utils/graphIntegrity';
import { buildPedigreeFromWizard } from '../builder/pedigreeBuilderFromWizard';
import { baseState } from './helpers';

function auditClean(state, label) {
  const graph = buildPedigreeFromWizard(state);
  const graphIssues = auditPedigreeGraph(graph);
  const layout = computePedigreeLayoutV2(graph);
  const layoutIssues = auditLayoutIntegrity(layout, graph);
  const errors = [...graphIssues, ...layoutIssues].filter(i => i.severity === 'error');
  expect(errors, `${label}: no errors — ${errors.map(e => e.code).join(',')}`).toHaveLength(0);
  const ambiguityCodes = ['SIBSHIP_BUS_OVERLAP', 'EDGE_THROUGH_NODE', 'UNRELATED_NODE_IN_CHILD_FOOTPRINT'];
  for (const code of ambiguityCodes) {
    const hits = layoutIssues.filter(i => i.code === code);
    expect(hits, `${label}: ${code} — ${JSON.stringify(hits)}`).toHaveLength(0);
  }
  return { graph, layout };
}

describe('layout ownership — unrelated-root-families-do-not-share-bus', () => {
  it('two unrelated ancestor couples, each contributing exactly one child to a marriage, stay visually separate', () => {
    // mother's parents (U_MAT_GP) and father's parents (U_PAT_GP) are two
    // completely independent root couples whose only connection is that
    // their single children (mother, father) later marry each other.
    auditClean(baseState(), '2-root-families');
  });
});

describe('layout ownership — adding-siblings-to-parents-does-not-collapse-ancestor-layout', () => {
  it('mother and father each gain a sibling; the ancestor layout above them stays readable', () => {
    const s = baseState();
    s.maternalRelatives.uncles = [{ id: '_mu0', children: { male: 0, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } }];
    s.paternalRelatives.aunts = [{ id: '_pa0', children: { male: 0, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } }];
    auditClean(s, 'siblings-added-to-parents');
  });

  it('same, but with a wide (6-child) sibship below the married-in couple', () => {
    const s = baseState();
    s.maternalRelatives.uncles = [{ id: '_mu0', children: { male: 0, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } }];
    s.paternalRelatives.aunts = [{ id: '_pa0', children: { male: 0, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } }];
    s.siblings.male = [{ id: 'm0', age: '20' }, { id: 'm1', age: '18' }];
    s.siblings.female = [{ id: 'f0', age: '16' }];
    s.siblings.unknown = [{ id: 'u0', age: '' }];
    s.siblings.pregnancyLoss = 1;
    const { graph, layout } = auditClean(s, 'wide-sibship-under-married-siblings');

    // Explicit geometric proof, not just "audit says zero": the aunt/uncle
    // sitting one seat from the true parents must be OUTSIDE the fan.
    const rel = graph.parentChildRelationships.find(r => r.unionId === 'U_PARENTS');
    const childXs = rel.children.map(c => layout.nodes.find(n => n.id === c).x);
    const [lo, hi] = [Math.min(...childXs), Math.max(...childXs)];
    const matUncleX = layout.nodes.find(n => n.id === 'mat_uncle_0').x;
    const patAuntX = layout.nodes.find(n => n.id === 'pat_aunt_0').x;
    expect(matUncleX < lo || matUncleX > hi).toBe(true);
    expect(patAuntX < lo || patAuntX > hi).toBe(true);
  });

  it('mother has TWO siblings ahead of her in the row (a run of non-anchors before the anchor)', () => {
    const s = baseState();
    s.maternalRelatives.uncles = [
      { id: '_mu0', children: { male: 0, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
      { id: '_mu1', children: { male: 0, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
    ];
    s.siblings.male = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, age: '20' }));
    auditClean(s, 'two-siblings-before-anchor');
  });
});

describe('layout ownership — aunt-uncle-branches-remain-separate-without-union', () => {
  it('5 maternal uncles and 5 paternal aunts, none married, none overlapping any cousin branch', () => {
    const s = baseState();
    s.maternalRelatives.uncles = Array.from({ length: 5 }, (_, i) => ({
      id: `_mu${i}`, children: { male: 1, female: 1, unknown: 0, pregnancyLoss: 0, stillbirth: 0 },
    }));
    s.paternalRelatives.aunts = Array.from({ length: 5 }, (_, i) => ({
      id: `_pa${i}`, children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 },
    }));
    auditClean(s, '5-uncles-5-aunts-with-cousins');
  });
});

describe('layout ownership — large-sibship-with-pregnancy-loss-events-keeps-local-child-bus', () => {
  it('a mixed 6-child sibship (male/female/unknown/loss/stillbirth) plus a childless aunt and uncle', () => {
    const s = baseState();
    s.siblings.male = [{ id: 'm0', age: '20' }, { id: 'm1', age: '18' }];
    s.siblings.female = [{ id: 'f0', age: '16' }];
    s.siblings.unknown = [{ id: 'u0', age: '' }];
    s.siblings.pregnancyLoss = 1;
    s.siblings.deceased = 1;
    s.maternalRelatives.uncles = [{ id: '_mu0', children: { male: 0, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } }];
    s.paternalRelatives.aunts = [{ id: '_pa0', children: { male: 0, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } }];
    auditClean(s, 'mixed-loss-sibship');
  });
});

describe('layout ownership — two-parental-origin-families-connected-by-child-union-remain-readable', () => {
  it('great-grandparents on both sides (4 independent root couples) feeding a compact middle generation', () => {
    const s = baseState();
    s.greatGrandparents = { mat_gf: true, mat_gm: true, pat_gf: true, pat_gm: true };
    auditClean(s, '4-root-couples-great-grandparents');
  });

  it('4 root couples + wide sibships at BOTH the grandparent and parent generation depths', () => {
    const s = baseState();
    s.greatGrandparents = { mat_gf: true, mat_gm: true, pat_gf: true, pat_gm: true };
    s.maternalRelatives.uncles = [{ id: '_mu0', children: { male: 3, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } }];
    s.paternalRelatives.aunts = [{ id: '_pa0', children: { male: 0, female: 3, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } }];
    s.siblings.male = Array.from({ length: 4 }, (_, i) => ({ id: `m${i}`, age: '20' }));
    const { graph, layout } = auditClean(s, '4-root-couples-plus-wide-sibships');

    // Generic geometric proof across ALL parent-child relationships in this
    // fixture: no same-generation individual (outside the union) sits
    // inside that union's child fan.
    const byGen = new Map();
    for (const n of layout.nodes) {
      if (!byGen.has(n.generation)) byGen.set(n.generation, []);
      byGen.get(n.generation).push(n);
    }
    for (const rel of graph.parentChildRelationships) {
      const kids = rel.children.map(c => layout.nodes.find(n => n.id === c)).filter(Boolean);
      if (kids.length < 2) continue;
      const xs = kids.map(k => k.x);
      const [lo, hi] = [Math.min(...xs), Math.max(...xs)];
      const union = graph.unions.find(u => u.id === rel.unionId);
      const parentGen = kids[0].generation - 1;
      for (const n of (byGen.get(parentGen) || [])) {
        if (union.partners.includes(n.id)) continue;
        expect(n.x > lo && n.x < hi, `${n.id} sits inside ${rel.unionId}'s fan [${lo},${hi}] at x=${n.x}`).toBe(false);
      }
    }
  });
});

describe('layout ownership — distant-same-generation-union-does-not-collapse-layout', () => {
  it('a proband spouse whose own ancestor line is unrelated to the proband stays readable', () => {
    const s = baseState();
    s.graphEdits = [
      { type: 'addSpouse', targetId: 'proband', spouseId: 'de_sp_0', unionId: 'U_DE_0', spouseSex: 'female' },
      { type: 'addChild', unionId: 'U_DE_0', childId: 'de_ch_1', sex: 'male' },
    ];
    auditClean(s, 'distant-spouse-union');
  });
});
