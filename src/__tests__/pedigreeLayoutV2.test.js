/**
 * pedigreeLayoutV2.test.js — v0.4 Phase 3: full new layout engine.
 *
 * The acceptance harness for the rewrite: builds each stress pedigree, runs
 * the new engine end-to-end (positions + typed edges), and asserts the FULL
 * layout audit (position AND edge level) is clean — zero SIBSHIP_BUS_OVERLAP,
 * zero EDGE_THROUGH_NODE, zero structural errors.
 */
import { describe, it, expect } from 'vitest';
import { computePedigreeLayoutV2 } from '../utils/pedigreeLayoutV2';
import { auditLayoutIntegrity } from '../utils/layoutIntegrity';
import { auditPedigreeGraph } from '../utils/graphIntegrity';
import { buildPedigreeFromWizard } from '../builder/pedigreeBuilderFromWizard';
import { baseState } from './helpers';

function auditV2(state) {
  const graph = buildPedigreeFromWizard(state);
  const graphIssues = auditPedigreeGraph(graph);
  const layout = computePedigreeLayoutV2(graph);
  const layoutIssues = auditLayoutIntegrity(layout, graph);
  const errors = [...graphIssues, ...layoutIssues].filter(i => i.severity === 'error');
  const count = (code) => layoutIssues.filter(i => i.code === code).length;
  return { graph, layout, layoutIssues, errors, count };
}

function expectReadable(state, label) {
  const r = auditV2(state);
  expect(r.errors, `${label}: no errors — ${r.errors.map(e => e.code).join(',')}`).toHaveLength(0);
  expect(r.count('SIBSHIP_BUS_OVERLAP'), `${label}: SIBSHIP_BUS_OVERLAP`).toBe(0);
  expect(r.count('EDGE_THROUGH_NODE'), `${label}: EDGE_THROUGH_NODE`).toBe(0);
  // sanity: some edges were produced
  expect(r.layout.edges.length).toBeGreaterThan(0);
  return r;
}

describe('pedigreeLayoutV2 — full engine is readable on stress fixtures', () => {
  it('1. simple 3-generation family', () => {
    expectReadable(baseState(), '3-gen');
  });

  it('2. 5-generation upward pedigree (great-grandparents)', () => {
    const s = baseState();
    s.greatGrandparents = { mat_gf: true, mat_gm: true, pat_gf: true, pat_gm: true };
    expectReadable(s, '5-gen-up');
  });

  it('3. gen-4 descendant branch', () => {
    const s = baseState();
    s.gen4 = [{ id: '_g0', targetPath: 'proband', male: 2, female: 1, unknown: 0 }];
    expectReadable(s, 'gen4');
  });

  it('4. large sibship (5+5)', () => {
    const s = baseState();
    s.siblings.male = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, age: `${30 - i}` }));
    s.siblings.female = Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, age: `${25 - i}` }));
    expectReadable(s, 'large-sibship');
  });

  it('5. 5+ maternal uncles (standalone, no children)', () => {
    const s = baseState();
    s.maternalRelatives.uncles = Array.from({ length: 5 }, (_, i) => ({
      id: `_mu${i}`, children: { male: 0, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 },
    }));
    expectReadable(s, '5-uncles-standalone');
  });

  it('6. 5+ paternal aunts each with children', () => {
    const s = baseState();
    s.paternalRelatives.aunts = Array.from({ length: 5 }, (_, i) => ({
      id: `_pa${i}`, children: { male: 1, female: 1, unknown: 0, pregnancyLoss: 0, stillbirth: 0 },
    }));
    expectReadable(s, '5-aunts-kids');
  });

  it('7. aunt/uncle with children on both sides', () => {
    const s = baseState();
    s.maternalRelatives.uncles = [{ id: '_mu0', children: { male: 2, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } }];
    s.paternalRelatives.aunts = [{ id: '_pa0', children: { male: 0, female: 2, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } }];
    expectReadable(s, 'both-sides');
  });

  it('8. cousin branch (uncle with children = proband cousins)', () => {
    const s = baseState();
    s.maternalRelatives.uncles = [{ id: '_mu0', children: { male: 1, female: 1, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } }];
    expectReadable(s, 'cousins');
  });

  it('9. multiple partners for the proband', () => {
    const s = baseState();
    s.graphEdits = [
      { type: 'addSpouse', targetId: 'proband', spouseId: 'de_sp_0', unionId: 'U_DE_0', spouseSex: 'female' },
      { type: 'addChild', unionId: 'U_DE_0', childId: 'de_ch_1', sex: 'male' },
      { type: 'addSpouse', targetId: 'proband', spouseId: 'de_sp_2', unionId: 'U_DE_2', spouseSex: 'female' },
      { type: 'addChild', unionId: 'U_DE_2', childId: 'de_ch_3', sex: 'female' },
    ];
    expectReadable(s, 'multi-partner');
  });

  it('10. half-siblings (mother has an extra union)', () => {
    const s = baseState();
    s.parents.motherOtherUnions = [{ id: '_mou0', status: 'together', children: { male: 1, female: 1, unknown: 0 } }];
    expectReadable(s, 'half-sibs');
  });

  it('11. first-cousin consanguinity (reported → structurally supported)', () => {
    const s = baseState();
    s.parents.consanguineous = true;
    s.parents.consanguinityDegree = 'first_cousin';
    s.parents.consanguinityPath = 'mothers_paternal_is_fathers_paternal';
    expectReadable(s, 'consanguinity');
  });

  it('12. pregnancy loss + stillbirth siblings', () => {
    const s = baseState();
    s.siblings.male = [{ id: 'm0', age: '20' }];
    s.siblings.pregnancyLoss = 1;
    expectReadable(s, 'losses');
  });

  it('13. divorced parents still route children under the union', () => {
    const s = baseState();
    s.parents.relationshipStatus = 'divorced';
    expectReadable(s, 'divorced');
  });
});

describe('pedigreeLayoutV2 — edge contract compatibility', () => {
  it('emits the same edge type vocabulary the renderer understands', () => {
    const s = baseState();
    s.siblings.male = [{ id: 'm0', age: '20' }];
    s.graphEdits = [{ type: 'addSpouse', targetId: 'proband', spouseId: 'de_sp_0', unionId: 'U_DE_0', spouseSex: 'female' }];
    const graph = buildPedigreeFromWizard(s);
    const { edges } = computePedigreeLayoutV2(graph);
    const allowed = new Set([
      'union', 'consanguineousUnion', 'consanguineousUnionUnresolved',
      'sibship', 'parentChildDrop', 'childStem', 'childlessDrop', 'childlessBar', 'divorceSlash',
    ]);
    for (const e of edges) expect(allowed.has(e.type), `unexpected edge type ${e.type}`).toBe(true);
    // has a union line and parent-child edges
    expect(edges.some(e => e.type === 'union' || e.type.startsWith('consanguineous'))).toBe(true);
    expect(edges.some(e => e.type === 'childStem')).toBe(true);
  });

  it('every node has finite x/y', () => {
    const graph = buildPedigreeFromWizard(baseState());
    const { nodes } = computePedigreeLayoutV2(graph);
    expect(nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
    expect(nodes.length).toBe(graph.individuals.length);
  });

  // v0.5 Step 5B — a union with no children yet must not be drawn as
  // clinically infertile/childless (the graph model has no such explicit
  // field); only the union/marriage line is drawn until real children
  // exist.
  it('Step 5B: a union with no children emits no childlessDrop/childlessBar markers — only the union line', () => {
    const s = baseState();
    s.graphEdits = [{ type: 'addSpouse', targetId: 'proband', spouseId: 'de_sp_0', unionId: 'U_DE_0', spouseSex: 'female' }];
    const graph = buildPedigreeFromWizard(s);
    const { edges } = computePedigreeLayoutV2(graph);
    const deUnionEdges = edges.filter(e => e.unionId === 'U_DE_0');
    expect(deUnionEdges.some(e => e.type === 'childlessDrop')).toBe(false);
    expect(deUnionEdges.some(e => e.type === 'childlessBar')).toBe(false);
    expect(deUnionEdges.some(e => e.type === 'union')).toBe(true);
    // no childless markers anywhere in the whole edge set either
    expect(edges.some(e => e.type === 'childlessDrop' || e.type === 'childlessBar')).toBe(false);
  });

  it('Step 5B: a union WITH children still emits the correct descendant/sibling connectors (unaffected by the childless-marker removal)', () => {
    const s = baseState();
    s.siblings.male = [{ id: 'm0', age: '20' }];
    const graph = buildPedigreeFromWizard(s);
    const { edges } = computePedigreeLayoutV2(graph);
    const parentsEdges = edges.filter(e => e.unionId === 'U_PARENTS');
    expect(parentsEdges.some(e => e.type === 'union')).toBe(true);
    expect(edges.some(e => e.type === 'parentChildDrop')).toBe(true);
    expect(edges.some(e => e.type === 'sibship')).toBe(true);
    expect(edges.filter(e => e.type === 'childStem').length).toBeGreaterThanOrEqual(2); // proband + m0
  });
});
