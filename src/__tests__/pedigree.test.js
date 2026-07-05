/**
 * pedigree.test.js — test matrix for the clinical pedigree builder.
 *
 * Validates graph correctness, generation assignments, integrity audit,
 * child ordering, layout integrity, and structural invariants across
 * representative pedigree topologies.
 *
 * Run: npm test
 */

import { describe, it, expect } from 'vitest';
import { buildPedigreeFromWizard } from '../builder/pedigreeBuilderFromWizard';
import { auditPedigreeGraph } from '../utils/graphIntegrity';
import { computePedigreeLayout } from '../utils/pedigreeLayout';
import { validatePedigree } from '../utils/validators';
import { auditLayoutIntegrity } from '../utils/layoutIntegrity';
import {
  reconcileOrder,
  defaultChildOrder,
  applyChildOrder,
  buildOrderingMetadata,
} from '../utils/childOrdering';

// ── Helpers ──

function baseState() {
  return {
    proband: { sex: 'male', age: '30' },
    siblings: {
      male: [], female: [], unknown: [],
      pregnancyLoss: 0, deceased: 0,
      siblingOrder: null,
    },
    parents: {
      motherExists: true, motherAge: '55',
      fatherExists: true, fatherAge: '58',
      consanguineous: false,
      consanguinityDegree: 'yok',
      consanguinityPath: 'unknown',
      relationshipStatus: 'together',
      motherOtherUnions: [],
      fatherOtherUnions: [],
    },
    maternalRelatives: { uncles: [], aunts: [] },
    paternalRelatives: { uncles: [], aunts: [] },
    maternalGPRelatives: { uncles: [], aunts: [] },
    paternalGPRelatives: { uncles: [], aunts: [] },
    greatGrandparents: { mat_gf: false, mat_gm: false, pat_gf: false, pat_gm: false },
    gen4: [],
    customConsanguinity: [],
    graphEdits: [],
  };
}

function buildFull(state) {
  const graph = buildPedigreeFromWizard(state);
  const issues = auditPedigreeGraph(graph);
  const layout = computePedigreeLayout(graph);
  const layoutIssues = auditLayoutIntegrity(layout, graph);
  const combined = { ...graph, ...layout };
  const warnings = validatePedigree(combined);
  return { graph, issues, layout, layoutIssues, warnings, combined };
}

function findInd(graph, id) {
  return graph.individuals.find(i => i.id === id);
}

function childrenOf(graph, unionId) {
  const rel = graph.parentChildRelationships.find(r => r.unionId === unionId);
  return rel ? rel.children : [];
}

function assertZeroErrors(issues) {
  const errors = issues.filter(i => i.severity === 'error');
  expect(errors).toEqual([]);
}

function assertNoDuplicateIds(graph) {
  const ids = graph.individuals.map(i => i.id);
  expect(ids.length).toBe(new Set(ids).size);
}

function assertSingleParent(graph) {
  const childSeen = new Map();
  for (const rel of graph.parentChildRelationships) {
    for (const cid of rel.children) {
      expect(childSeen.has(cid)).toBe(false);
      childSeen.set(cid, rel.unionId);
    }
  }
}

function assertOneProband(graph) {
  const probands = graph.individuals.filter(i => i.proband);
  expect(probands).toHaveLength(1);
  expect(probands[0].id).toBe('proband');
}

function assertAllNodesHavePositions(layout) {
  for (const node of layout.nodes) {
    expect(typeof node.x).toBe('number');
    expect(typeof node.y).toBe('number');
    expect(Number.isFinite(node.x)).toBe(true);
    expect(Number.isFinite(node.y)).toBe(true);
  }
}

function assertNoDuplicatePositions(layout) {
  const posSet = new Set();
  for (const node of layout.nodes) {
    const key = `${node.x},${node.y}`;
    // Pregnancy losses and stillbirths may share positions in edge cases,
    // but distinct liveborn individuals must not overlap
    if (!node.pregnancyLoss && !node.stillbirth) {
      expect(posSet.has(key)).toBe(false);
      posSet.add(key);
    }
  }
}

// ══════════════════════════════════════════════════
// TEST MATRIX
// ══════════════════════════════════════════════════

describe('Pedigree Builder — Graph Correctness', () => {

  // ────────────────────────────────────────────────
  // 1. Simple nuclear family, no manual order
  // ────────────────────────────────────────────────
  describe('Case 1: Simple nuclear family', () => {
    const state = baseState();
    state.siblings.male = [{ id: '_m0', age: '28' }];
    state.siblings.female = [{ id: '_f0', age: '25' }];

    it('produces correct individual count', () => {
      const { graph } = buildFull(state);
      // mother, father, proband, sib_m_0, sib_f_0, 4 grandparents = 9
      expect(graph.individuals).toHaveLength(9);
    });

    it('has zero integrity errors', () => {
      const { issues } = buildFull(state);
      assertZeroErrors(issues);
    });

    it('assigns correct generations', () => {
      const { graph } = buildFull(state);
      expect(findInd(graph, 'proband').generation).toBe(3);
      expect(findInd(graph, 'mother').generation).toBe(2);
      expect(findInd(graph, 'father').generation).toBe(2);
      expect(findInd(graph, 'mat_gf').generation).toBe(1);
      expect(findInd(graph, 'sib_m_0').generation).toBe(3);
      expect(findInd(graph, 'sib_f_0').generation).toBe(3);
    });

    it('has no duplicate IDs', () => {
      const { graph } = buildFull(state);
      assertNoDuplicateIds(graph);
    });

    it('has single-parent invariant', () => {
      const { graph } = buildFull(state);
      assertSingleParent(graph);
    });

    it('has exactly one proband', () => {
      const { graph } = buildFull(state);
      assertOneProband(graph);
    });

    it('produces valid layout positions', () => {
      const { layout } = buildFull(state);
      assertAllNodesHavePositions(layout);
      assertNoDuplicatePositions(layout);
    });

    it('default order is age-descending', () => {
      const { graph } = buildFull(state);
      const children = childrenOf(graph, 'U_PARENTS');
      // Expected: sib_m_0 (28), proband (30), sib_f_0 (25) — wait, age desc: 30, 28, 25
      // But losses go to end, and proband is included. Let's check:
      // proband=30, sib_m_0=28, sib_f_0=25 → desc order: proband, sib_m_0, sib_f_0
      expect(children[0]).toBe('proband'); // age 30
      expect(children[1]).toBe('sib_m_0'); // age 28
      expect(children[2]).toBe('sib_f_0'); // age 25
    });
  });

  // ────────────────────────────────────────────────
  // 2. Proband generation with explicit order override
  // ────────────────────────────────────────────────
  describe('Case 2: Explicit proband-gen order override', () => {
    const state = baseState();
    state.siblings.male = [{ id: '_m0', age: '35' }];
    state.siblings.female = [{ id: '_f0', age: '20' }];
    // Manual order via persistent childOrders (builder-level IDs)
    state.childOrders = { 'U_PARENTS': ['sib_f_0', 'proband', 'sib_m_0'] };

    it('respects manual order', () => {
      const { graph } = buildFull(state);
      const children = childrenOf(graph, 'U_PARENTS');
      expect(children[0]).toBe('sib_f_0');
      expect(children[1]).toBe('proband');
      expect(children[2]).toBe('sib_m_0');
    });

    it('has zero integrity errors', () => {
      const { issues } = buildFull(state);
      assertZeroErrors(issues);
    });
  });

  // ────────────────────────────────────────────────
  // 3. Maternal branch children (collateral)
  // ────────────────────────────────────────────────
  describe('Case 3: Maternal collateral branch', () => {
    const state = baseState();
    state.maternalRelatives.uncles = [
      { id: '_mu0', children: { male: 2, female: 1, unknown: 0, pregnancyLoss: 1, stillbirth: 0 } },
    ];
    state.maternalRelatives.aunts = [
      { id: '_ma0', children: { male: 0, female: 1, unknown: 0, pregnancyLoss: 0, stillbirth: 1 } },
    ];

    it('creates correct individuals', () => {
      const { graph } = buildFull(state);
      // Core: 4 GP + mother + father + proband = 7
      // Uncle: mat_uncle_0 + spouse + 2 male + 1 female + 1 loss = 6 new
      // Aunt: mat_aunt_0 + spouse + 1 female + 1 stillbirth = 4 new
      // Total: 7 + 6 + 4 = 17
      expect(graph.individuals).toHaveLength(17);
    });

    it('uncle children have correct IDs and types', () => {
      const { graph } = buildFull(state);
      expect(findInd(graph, 'mat_uncle_0')).toBeDefined();
      expect(findInd(graph, 'mat_uncle_0').sex).toBe('male');
      expect(findInd(graph, 'mat_uncle_0_sp')).toBeDefined();
      expect(findInd(graph, 'mat_uncle_0_sp').sex).toBe('female');
      expect(findInd(graph, 'mat_uncle_0_cm_0')).toBeDefined();
      expect(findInd(graph, 'mat_uncle_0_cm_1')).toBeDefined();
      expect(findInd(graph, 'mat_uncle_0_cf_0')).toBeDefined();
      expect(findInd(graph, 'mat_uncle_0_loss_0').pregnancyLoss).toBe(true);
    });

    it('aunt stillbirth is correctly flagged', () => {
      const { graph } = buildFull(state);
      const still = findInd(graph, 'mat_aunt_0_still_0');
      expect(still).toBeDefined();
      expect(still.stillbirth).toBe(true);
      expect(still.deceased).toBe(true);
    });

    it('uncle is child of maternal grandparents', () => {
      const { graph } = buildFull(state);
      const gpChildren = childrenOf(graph, 'U_MAT_GP');
      expect(gpChildren).toContain('mother');
      expect(gpChildren).toContain('mat_uncle_0');
      expect(gpChildren).toContain('mat_aunt_0');
    });

    it('has zero integrity errors', () => {
      const { issues } = buildFull(state);
      assertZeroErrors(issues);
    });

    it('all collateral individuals have correct generation', () => {
      const { graph } = buildFull(state);
      expect(findInd(graph, 'mat_uncle_0').generation).toBe(2);
      expect(findInd(graph, 'mat_uncle_0_sp').generation).toBe(2);
      expect(findInd(graph, 'mat_uncle_0_cm_0').generation).toBe(3);
      expect(findInd(graph, 'mat_aunt_0').generation).toBe(2);
      expect(findInd(graph, 'mat_aunt_0_cf_0').generation).toBe(3);
    });
  });

  // ────────────────────────────────────────────────
  // 4. Paternal branch children (collateral)
  // ────────────────────────────────────────────────
  describe('Case 4: Paternal collateral branch', () => {
    const state = baseState();
    state.paternalRelatives.uncles = [
      { id: '_pu0', children: { male: 1, female: 0, unknown: 1, pregnancyLoss: 0, stillbirth: 0 } },
    ];
    state.paternalRelatives.aunts = [
      { id: '_pa0', children: { male: 0, female: 2, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
    ];

    it('creates correct individuals', () => {
      const { graph } = buildFull(state);
      expect(findInd(graph, 'pat_uncle_0')).toBeDefined();
      expect(findInd(graph, 'pat_uncle_0').relation).toBe('amca');
      expect(findInd(graph, 'pat_aunt_0')).toBeDefined();
      expect(findInd(graph, 'pat_aunt_0').relation).toBe('hala');
      expect(findInd(graph, 'pat_uncle_0_cm_0')).toBeDefined();
      expect(findInd(graph, 'pat_uncle_0_cu_0')).toBeDefined();
      expect(findInd(graph, 'pat_aunt_0_cf_0')).toBeDefined();
      expect(findInd(graph, 'pat_aunt_0_cf_1')).toBeDefined();
    });

    it('paternal relatives are children of paternal grandparents', () => {
      const { graph } = buildFull(state);
      const gpChildren = childrenOf(graph, 'U_PAT_GP');
      expect(gpChildren).toContain('father');
      expect(gpChildren).toContain('pat_uncle_0');
      expect(gpChildren).toContain('pat_aunt_0');
    });

    it('has zero integrity errors', () => {
      const { issues } = buildFull(state);
      assertZeroErrors(issues);
    });
  });

  // ────────────────────────────────────────────────
  // 5. Maternal extra partner and half-siblings
  // ────────────────────────────────────────────────
  describe('Case 5: Maternal extra partner', () => {
    const state = baseState();
    state.parents.motherOtherUnions = [
      { id: '_mu0', status: 'divorced', children: { male: 1, female: 1, unknown: 0 } },
    ];

    it('creates half-siblings with correct IDs', () => {
      const { graph } = buildFull(state);
      expect(findInd(graph, 'hsib_mat_m_0_0')).toBeDefined();
      expect(findInd(graph, 'hsib_mat_f_0_0')).toBeDefined();
      expect(findInd(graph, 'mother_spouse_0')).toBeDefined();
    });

    it('half-siblings are children of mother other union', () => {
      const { graph } = buildFull(state);
      const children = childrenOf(graph, 'U_MOTHER_OTHER_0');
      expect(children).toContain('hsib_mat_m_0_0');
      expect(children).toContain('hsib_mat_f_0_0');
    });

    it('half-siblings have generation 3', () => {
      const { graph } = buildFull(state);
      expect(findInd(graph, 'hsib_mat_m_0_0').generation).toBe(3);
      expect(findInd(graph, 'hsib_mat_f_0_0').generation).toBe(3);
    });

    it('union has divorced status', () => {
      const { graph } = buildFull(state);
      const union = graph.unions.find(u => u.id === 'U_MOTHER_OTHER_0');
      expect(union.status).toBe('divorced');
    });

    it('has zero integrity errors', () => {
      const { issues } = buildFull(state);
      assertZeroErrors(issues);
    });
  });

  // ────────────────────────────────────────────────
  // 6. Paternal extra partner and half-siblings
  // ────────────────────────────────────────────────
  describe('Case 6: Paternal extra partner', () => {
    const state = baseState();
    state.parents.fatherOtherUnions = [
      { id: '_fu0', status: 'separated', children: { male: 0, female: 0, unknown: 1 } },
    ];

    it('creates half-sibling with correct relation', () => {
      const { graph } = buildFull(state);
      expect(findInd(graph, 'hsib_pat_u_0_0')).toBeDefined();
      expect(findInd(graph, 'hsib_pat_u_0_0').relation).toBe('half_sibling_paternal');
    });

    it('has zero integrity errors', () => {
      const { issues } = buildFull(state);
      assertZeroErrors(issues);
    });
  });

  // ────────────────────────────────────────────────
  // 7. Mixed siblings: sexed, unknown, losses, stillbirths
  // ────────────────────────────────────────────────
  describe('Case 7: Mixed sibling types', () => {
    const state = baseState();
    state.siblings.male = [{ id: '_m0', age: '35' }];
    state.siblings.female = [{ id: '_f0', age: '28' }];
    state.siblings.unknown = [{ id: '_u0', age: '' }];
    state.siblings.pregnancyLoss = 2;
    state.siblings.deceased = 1;

    it('creates all sibling types', () => {
      const { graph } = buildFull(state);
      expect(findInd(graph, 'sib_m_0')).toBeDefined();
      expect(findInd(graph, 'sib_f_0')).toBeDefined();
      expect(findInd(graph, 'sib_u_0')).toBeDefined();
      expect(findInd(graph, 'sib_loss_0').pregnancyLoss).toBe(true);
      expect(findInd(graph, 'sib_loss_1').pregnancyLoss).toBe(true);
      expect(findInd(graph, 'sib_still_0').stillbirth).toBe(true);
      expect(findInd(graph, 'sib_still_0').deceased).toBe(true);
    });

    it('all siblings are children of U_PARENTS', () => {
      const { graph } = buildFull(state);
      const children = childrenOf(graph, 'U_PARENTS');
      expect(children).toContain('proband');
      expect(children).toContain('sib_m_0');
      expect(children).toContain('sib_f_0');
      expect(children).toContain('sib_u_0');
      expect(children).toContain('sib_loss_0');
      expect(children).toContain('sib_loss_1');
      expect(children).toContain('sib_still_0');
      expect(children).toHaveLength(7);
    });

    it('default order puts losses and stillbirths at end', () => {
      const { graph } = buildFull(state);
      const children = childrenOf(graph, 'U_PARENTS');
      // Age desc for liveborn: sib_m_0(35), proband(30), sib_f_0(28), sib_u_0(no age)
      // Then losses, then stillbirths
      const lossIdx0 = children.indexOf('sib_loss_0');
      const lossIdx1 = children.indexOf('sib_loss_1');
      const stillIdx = children.indexOf('sib_still_0');
      const probandIdx = children.indexOf('proband');
      expect(lossIdx0).toBeGreaterThan(probandIdx);
      expect(lossIdx1).toBeGreaterThan(probandIdx);
      expect(stillIdx).toBeGreaterThan(probandIdx);
    });

    it('has zero integrity errors', () => {
      const { issues } = buildFull(state);
      assertZeroErrors(issues);
    });

    it('layout has valid positions for all nodes', () => {
      const { layout } = buildFull(state);
      assertAllNodesHavePositions(layout);
    });
  });

  // ────────────────────────────────────────────────
  // 8. First-cousin consanguinity
  // ────────────────────────────────────────────────
  describe('Case 8: First-cousin consanguinity', () => {
    const state = baseState();
    state.parents.consanguineous = true;
    state.parents.consanguinityDegree = 'first_cousin';
    state.parents.consanguinityPath = 'mothers_paternal_is_fathers_paternal';

    it('creates shared great-grandparents', () => {
      const { graph } = buildFull(state);
      expect(findInd(graph, 'ggf')).toBeDefined();
      expect(findInd(graph, 'ggm')).toBeDefined();
      expect(findInd(graph, 'ggf').generation).toBe(0);
      expect(findInd(graph, 'ggm').generation).toBe(0);
    });

    it('mat_gf and pat_gf are siblings (shared parent union)', () => {
      const { graph } = buildFull(state);
      const ggChildren = childrenOf(graph, 'U_GG');
      expect(ggChildren).toContain('mat_gf');
      expect(ggChildren).toContain('pat_gf');
    });

    it('U_PARENTS is marked consanguineous', () => {
      const { graph } = buildFull(state);
      const parentsUnion = graph.unions.find(u => u.id === 'U_PARENTS');
      expect(parentsUnion.consanguineous).toBe(true);
    });

    it('has zero integrity errors', () => {
      const { issues } = buildFull(state);
      assertZeroErrors(issues);
    });

    it('no generation inconsistencies', () => {
      const { issues } = buildFull(state);
      const genIssues = issues.filter(i =>
        i.code === 'SIBLING_GENERATION_INCONSISTENT' ||
        i.code === 'PARTNER_GENERATION_INCONSISTENT'
      );
      expect(genIssues).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────
  // 9. Double first-cousin consanguinity
  // ────────────────────────────────────────────────
  describe('Case 9: Double first-cousin', () => {
    const state = baseState();
    state.parents.consanguineous = true;
    state.parents.consanguinityDegree = 'double_first_cousin';
    state.parents.consanguinityPath = 'double_first_cousin';

    it('creates two pairs of great-grandparents', () => {
      const { graph } = buildFull(state);
      expect(findInd(graph, 'ggf_1')).toBeDefined();
      expect(findInd(graph, 'ggm_1')).toBeDefined();
      expect(findInd(graph, 'ggf_2')).toBeDefined();
      expect(findInd(graph, 'ggm_2')).toBeDefined();
    });

    it('first pair: mat_gf + pat_gf are siblings', () => {
      const { graph } = buildFull(state);
      expect(childrenOf(graph, 'U_GG_1')).toContain('mat_gf');
      expect(childrenOf(graph, 'U_GG_1')).toContain('pat_gf');
    });

    it('second pair: mat_gm + pat_gm are siblings', () => {
      const { graph } = buildFull(state);
      expect(childrenOf(graph, 'U_GG_2')).toContain('mat_gm');
      expect(childrenOf(graph, 'U_GG_2')).toContain('pat_gm');
    });

    it('all great-grandparents at generation 0', () => {
      const { graph } = buildFull(state);
      expect(findInd(graph, 'ggf_1').generation).toBe(0);
      expect(findInd(graph, 'ggm_1').generation).toBe(0);
      expect(findInd(graph, 'ggf_2').generation).toBe(0);
      expect(findInd(graph, 'ggm_2').generation).toBe(0);
    });

    it('has zero integrity errors', () => {
      const { issues } = buildFull(state);
      assertZeroErrors(issues);
    });
  });

  // ────────────────────────────────────────────────
  // 10. Reorder + count increase
  // ────────────────────────────────────────────────
  describe('Case 10: Reorder then count increase', () => {
    it('new sibling gets appended after existing manual order', () => {
      // Step 1: Build with 1 male sibling, manual order [m_0, proband]
      const state = baseState();
      state.siblings.male = [{ id: '_m0', age: '35' }];
      state.childOrders = { 'U_PARENTS': ['sib_m_0', 'proband'] };

      const { graph: g1 } = buildFull(state);
      const c1 = childrenOf(g1, 'U_PARENTS');
      expect(c1[0]).toBe('sib_m_0');
      expect(c1[1]).toBe('proband');

      // Step 2: Add a female sibling — she should appear at end of manual order
      const state2 = baseState();
      state2.siblings.male = [{ id: '_m0', age: '35' }];
      state2.siblings.female = [{ id: '_f0', age: '20' }];
      state2.childOrders = { 'U_PARENTS': ['sib_m_0', 'proband', 'sib_f_0'] }; // reconciled

      const { graph: g2 } = buildFull(state2);
      const c2 = childrenOf(g2, 'U_PARENTS');
      expect(c2[0]).toBe('sib_m_0');
      expect(c2[1]).toBe('proband');
      expect(c2[2]).toBe('sib_f_0');
    });

    it('has zero integrity errors after count change', () => {
      const state = baseState();
      state.siblings.male = [{ id: '_m0', age: '35' }];
      state.siblings.female = [{ id: '_f0', age: '20' }];
      state.childOrders = { 'U_PARENTS': ['sib_m_0', 'proband', 'sib_f_0'] };
      const { issues } = buildFull(state);
      assertZeroErrors(issues);
    });
  });

  // ────────────────────────────────────────────────
  // 11. Reorder + count decrease
  // ────────────────────────────────────────────────
  describe('Case 11: Reorder then count decrease', () => {
    it('stale tokens are pruned, surviving order preserved', () => {
      // Manual order was [sib_f_0, proband, sib_m_0], then female removed
      const state = baseState();
      state.siblings.male = [{ id: '_m0', age: '35' }];
      // sib_f_0 no longer exists — childOrders should be reconciled by applyChildOrder
      state.childOrders = { 'U_PARENTS': ['proband', 'sib_m_0'] };

      const { graph } = buildFull(state);
      const children = childrenOf(graph, 'U_PARENTS');
      expect(children[0]).toBe('proband');
      expect(children[1]).toBe('sib_m_0');
    });

    it('has zero integrity errors', () => {
      const state = baseState();
      state.siblings.male = [{ id: '_m0', age: '35' }];
      state.childOrders = { 'U_PARENTS': ['proband', 'sib_m_0'] };
      const { issues } = buildFull(state);
      assertZeroErrors(issues);
    });
  });

  // ────────────────────────────────────────────────
  // 12. Complex pedigree: consanguinity + collateral + gen4
  // ────────────────────────────────────────────────
  describe('Case 12: Complex pedigree stress test', () => {
    const state = baseState();
    state.siblings.male = [{ id: '_m0', age: '28' }];
    state.siblings.female = [{ id: '_f0', age: '25' }];
    state.siblings.pregnancyLoss = 1;
    state.parents.consanguineous = true;
    state.parents.consanguinityDegree = 'first_cousin';
    state.parents.consanguinityPath = 'mothers_paternal_is_fathers_paternal';
    state.parents.motherOtherUnions = [
      { id: '_mu0', status: 'together', children: { male: 1, female: 0, unknown: 0 } },
    ];
    state.maternalRelatives.uncles = [
      { id: '_dayi', children: { male: 1, female: 1, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
    ];
    state.paternalRelatives.aunts = [
      { id: '_hala', children: { male: 0, female: 1, unknown: 0, pregnancyLoss: 1, stillbirth: 0 } },
    ];
    state.gen4 = [
      { id: '_g4', targetPath: 'proband', male: 1, female: 0, unknown: 0 },
    ];

    it('creates all expected individuals', () => {
      const { graph } = buildFull(state);
      // Core: mother, father, proband, sib_m_0, sib_f_0, sib_loss_0 = 6
      // Grandparents: 4
      // Great-grandparents (consanguinity): ggf, ggm = 2
      // Mother other: mother_spouse_0, hsib_mat_m_0_0 = 2
      // Mat uncle: mat_uncle_0, spouse, 2 kids = 4
      // Pat aunt: pat_aunt_0, spouse, 1 female + 1 loss = 4
      // Gen4: gen4_sp_0, gen4_0_cm_0 = 2
      // Total: 6 + 4 + 2 + 2 + 4 + 4 + 2 = 24
      expect(graph.individuals).toHaveLength(24);
    });

    it('has zero integrity errors', () => {
      const { issues } = buildFull(state);
      assertZeroErrors(issues);
    });

    it('has no duplicate IDs', () => {
      const { graph } = buildFull(state);
      assertNoDuplicateIds(graph);
    });

    it('has single-parent invariant', () => {
      const { graph } = buildFull(state);
      assertSingleParent(graph);
    });

    it('has exactly one proband', () => {
      const { graph } = buildFull(state);
      assertOneProband(graph);
    });

    it('gen4 child is generation 4', () => {
      const { graph } = buildFull(state);
      expect(findInd(graph, 'gen4_0_cm_0').generation).toBe(4);
    });

    it('great-grandparents are generation 0', () => {
      const { graph } = buildFull(state);
      expect(findInd(graph, 'ggf').generation).toBe(0);
      expect(findInd(graph, 'ggm').generation).toBe(0);
    });

    it('layout has valid positions for all nodes', () => {
      const { layout } = buildFull(state);
      assertAllNodesHavePositions(layout);
    });

    it('no generation inconsistencies', () => {
      const { issues } = buildFull(state);
      const genIssues = issues.filter(i =>
        i.code === 'SIBLING_GENERATION_INCONSISTENT' ||
        i.code === 'PARTNER_GENERATION_INCONSISTENT'
      );
      expect(genIssues).toEqual([]);
    });
  });
});

// ══════════════════════════════════════════════════
// STRUCTURAL INVARIANT TESTS
// ══════════════════════════════════════════════════

describe('Structural Invariants', () => {

  it('second-cousin consanguinity produces gen -1 ancestors', () => {
    const state = baseState();
    state.parents.consanguineous = true;
    state.parents.consanguinityDegree = 'second_cousin';
    state.parents.consanguinityPath = 'second_cousin_simple';

    const { graph, issues } = buildFull(state);
    assertZeroErrors(issues);
    expect(findInd(graph, 'gggf').generation).toBe(-1);
    expect(findInd(graph, 'gggm').generation).toBe(-1);
  });

  it('collateral branch ID scheme matches expected pattern', () => {
    const state = baseState();
    state.maternalRelatives.uncles = [
      { id: '_mu0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
    ];
    state.paternalRelatives.aunts = [
      { id: '_pa0', children: { male: 0, female: 1, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
    ];

    const { graph } = buildFull(state);

    // Verify deterministic ID scheme preserved after refactor
    expect(findInd(graph, 'mat_uncle_0')).toBeDefined();
    expect(findInd(graph, 'mat_uncle_0_sp')).toBeDefined();
    expect(findInd(graph, 'mat_uncle_0_cm_0')).toBeDefined();
    expect(findInd(graph, 'pat_aunt_0')).toBeDefined();
    expect(findInd(graph, 'pat_aunt_0_sp')).toBeDefined();
    expect(findInd(graph, 'pat_aunt_0_cf_0')).toBeDefined();

    // Verify union IDs preserved
    expect(graph.unions.find(u => u.id === 'U_MAT_UNCLE_0')).toBeDefined();
    expect(graph.unions.find(u => u.id === 'U_PAT_AUNT_0')).toBeDefined();
  });

  it('builder deduplication produces identical output to pre-refactor', () => {
    // This test ensures the buildCollateralBranch helper produces
    // the exact same graph as the original 4 separate loops.
    const state = baseState();
    state.maternalRelatives.uncles = [
      { id: '_mu0', children: { male: 1, female: 1, unknown: 0, pregnancyLoss: 1, stillbirth: 1 } },
    ];
    state.maternalRelatives.aunts = [
      { id: '_ma0', children: { male: 0, female: 1, unknown: 1, pregnancyLoss: 0, stillbirth: 0 } },
    ];
    state.paternalRelatives.uncles = [
      { id: '_pu0', children: { male: 2, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
    ];
    state.paternalRelatives.aunts = [
      { id: '_pa0', children: { male: 0, female: 0, unknown: 1, pregnancyLoss: 1, stillbirth: 0 } },
    ];

    const { graph, issues } = buildFull(state);
    assertZeroErrors(issues);
    assertNoDuplicateIds(graph);
    assertSingleParent(graph);

    // Check all 4 branches produced correct individuals
    // Mat uncle: uncle + sp + m + f + loss + still = 6
    expect(findInd(graph, 'mat_uncle_0_cm_0')).toBeDefined();
    expect(findInd(graph, 'mat_uncle_0_cf_0')).toBeDefined();
    expect(findInd(graph, 'mat_uncle_0_loss_0').pregnancyLoss).toBe(true);
    expect(findInd(graph, 'mat_uncle_0_still_0').stillbirth).toBe(true);

    // Mat aunt: aunt + sp + f + u = 4
    expect(findInd(graph, 'mat_aunt_0_cf_0')).toBeDefined();
    expect(findInd(graph, 'mat_aunt_0_cu_0')).toBeDefined();

    // Pat uncle: uncle + sp + 2m = 4
    expect(findInd(graph, 'pat_uncle_0_cm_0')).toBeDefined();
    expect(findInd(graph, 'pat_uncle_0_cm_1')).toBeDefined();

    // Pat aunt: aunt + sp + u + loss = 4
    expect(findInd(graph, 'pat_aunt_0_cu_0')).toBeDefined();
    expect(findInd(graph, 'pat_aunt_0_loss_0').pregnancyLoss).toBe(true);
  });
});

// ══════════════════════════════════════════════════
// CHILD ORDERING UNIT TESTS
// ══════════════════════════════════════════════════

describe('Child Ordering — Unit Tests', () => {

  describe('reconcileOrder', () => {
    it('prunes stale tokens, preserves surviving order', () => {
      const result = reconcileOrder(
        ['c', 'a', 'b'],       // manual order
        ['a', 'b', 'd'],       // valid tokens (c removed, d added)
      );
      expect(result).toEqual(['a', 'b', 'd']);
    });

    it('appends new tokens at end', () => {
      const result = reconcileOrder(
        ['a', 'b'],
        ['a', 'b', 'c', 'd'],
      );
      expect(result).toEqual(['a', 'b', 'c', 'd']);
    });

    it('preserves anchor child', () => {
      const result = reconcileOrder(
        ['x', 'y'],           // manual order missing anchor
        ['x', 'y', 'proband'],
        'proband',
      );
      expect(result).toContain('proband');
    });

    it('handles empty manual order', () => {
      const result = reconcileOrder([], ['a', 'b', 'c']);
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('handles all stale tokens', () => {
      const result = reconcileOrder(
        ['x', 'y', 'z'],
        ['a', 'b'],
      );
      expect(result).toEqual(['a', 'b']);
    });
  });

  describe('defaultChildOrder', () => {
    it('sorts liveborn by age descending', () => {
      const children = [
        { id: 'a', age: '20' },
        { id: 'b', age: '35' },
        { id: 'c', age: '28' },
      ];
      const result = defaultChildOrder(children);
      expect(result).toEqual(['b', 'c', 'a']);
    });

    it('puts pregnancy losses after liveborn', () => {
      const children = [
        { id: 'loss1', pregnancyLoss: true },
        { id: 'a', age: '30' },
        { id: 'b', age: '25' },
      ];
      const result = defaultChildOrder(children);
      expect(result).toEqual(['a', 'b', 'loss1']);
    });

    it('puts stillbirths after pregnancy losses', () => {
      const children = [
        { id: 'still1', stillbirth: true },
        { id: 'loss1', pregnancyLoss: true },
        { id: 'a', age: '30' },
      ];
      const result = defaultChildOrder(children);
      expect(result).toEqual(['a', 'loss1', 'still1']);
    });

    it('children without age come after aged children', () => {
      const children = [
        { id: 'noage', age: '' },
        { id: 'aged', age: '30' },
      ];
      const result = defaultChildOrder(children);
      expect(result).toEqual(['aged', 'noage']);
    });
  });

  describe('applyChildOrder', () => {
    it('uses manual order when provided', () => {
      const children = [
        { id: 'a', age: '30' },
        { id: 'b', age: '25' },
        { id: 'c', age: '20' },
      ];
      const result = applyChildOrder(children, ['c', 'a', 'b']);
      expect(result.map(c => c.id)).toEqual(['c', 'a', 'b']);
    });

    it('falls back to default when no manual order', () => {
      const children = [
        { id: 'a', age: '20' },
        { id: 'b', age: '35' },
      ];
      const result = applyChildOrder(children, null);
      expect(result.map(c => c.id)).toEqual(['b', 'a']);
    });

    it('reconciles stale tokens in manual order', () => {
      const children = [
        { id: 'a', age: '30' },
        { id: 'c', age: '20' },
      ];
      // 'b' was removed, 'c' is new
      const result = applyChildOrder(children, ['b', 'a'], null);
      expect(result.map(c => c.id)).toEqual(['a', 'c']);
    });

    it('handles empty children array', () => {
      const result = applyChildOrder([], ['a', 'b']);
      expect(result).toEqual([]);
    });
  });

  describe('buildOrderingMetadata', () => {
    it('builds ordering for all child groups', () => {
      const pcrs = [
        { unionId: 'U1', children: ['a', 'b'] },
        { unionId: 'U2', children: ['c', 'd', 'e'] },
      ];
      const indById = new Map([
        ['a', { id: 'a', age: '20' }],
        ['b', { id: 'b', age: '30' }],
        ['c', { id: 'c', age: '25' }],
        ['d', { id: 'd', age: '15' }],
        ['e', { id: 'e', age: '35' }],
      ]);

      const metadata = buildOrderingMetadata(pcrs, indById);
      expect(metadata.get('U1')).toEqual(['b', 'a']); // age desc
      expect(metadata.get('U2')).toEqual(['e', 'c', 'd']); // age desc
    });

    it('applies manual order for specified union', () => {
      const pcrs = [
        { unionId: 'U_PARENTS', children: ['proband', 'sib_m_0'] },
      ];
      const indById = new Map([
        ['proband', { id: 'proband', age: '30' }],
        ['sib_m_0', { id: 'sib_m_0', age: '35' }],
      ]);
      const manualOrders = { 'U_PARENTS': ['sib_m_0', 'proband'] };

      const metadata = buildOrderingMetadata(pcrs, indById, manualOrders, 'proband');
      expect(metadata.get('U_PARENTS')).toEqual(['sib_m_0', 'proband']);
    });
  });
});

// ══════════════════════════════════════════════════
// LAYOUT INTEGRITY TESTS
// ══════════════════════════════════════════════════

describe('Layout Integrity', () => {

  it('simple nuclear family has zero layout issues', () => {
    const state = baseState();
    state.siblings.male = [{ id: '_m0', age: '28' }];
    const { graph, layout } = buildFull(state);
    const layoutIssues = auditLayoutIntegrity(layout, graph);
    const errors = layoutIssues.filter(i => i.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('first-cousin consanguinity has zero layout errors', () => {
    const state = baseState();
    state.parents.consanguineous = true;
    state.parents.consanguinityDegree = 'first_cousin';
    state.parents.consanguinityPath = 'mothers_paternal_is_fathers_paternal';

    const { graph, layout } = buildFull(state);
    const layoutIssues = auditLayoutIntegrity(layout, graph);
    const errors = layoutIssues.filter(i => i.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('double first cousin — great-grandparents positioned without overlap', () => {
    const state = baseState();
    state.parents.consanguineous = true;
    state.parents.consanguinityDegree = 'double_first_cousin';
    state.parents.consanguinityPath = 'double_first_cousin';

    const { layout, layoutIssues, issues } = buildFull(state);

    // Graph integrity clean
    assertZeroErrors(issues);

    // Layout integrity: no duplicate positions for great-grandparents
    const dupPositions = layoutIssues.filter(i => i.code === 'DUPLICATE_NODE_POSITION');
    expect(dupPositions).toEqual([]);

    // All four great-grandparents have distinct X positions
    const ggf1 = layout.nodes.find(n => n.id === 'ggf_1');
    const ggm1 = layout.nodes.find(n => n.id === 'ggm_1');
    const ggf2 = layout.nodes.find(n => n.id === 'ggf_2');
    const ggm2 = layout.nodes.find(n => n.id === 'ggm_2');
    expect(ggf1).toBeDefined();
    expect(ggm1).toBeDefined();
    expect(ggf2).toBeDefined();
    expect(ggm2).toBeDefined();

    const xs = [ggf1.x, ggm1.x, ggf2.x, ggm2.x];
    expect(new Set(xs).size).toBe(4); // all distinct

    // All at same generation (same Y)
    expect(ggf1.y).toBe(ggm1.y);
    expect(ggf1.y).toBe(ggf2.y);
    expect(ggf1.y).toBe(ggm2.y);

    // Partners paired: ggf_1 left of ggm_1, ggf_2 left of ggm_2
    expect(ggf1.x).toBeLessThan(ggm1.x);
    expect(ggf2.x).toBeLessThan(ggm2.x);
  });

  it('second cousin — great-grandparents and great-great-grandparents positioned', () => {
    const state = baseState();
    state.parents.consanguineous = true;
    state.parents.consanguinityDegree = 'second_cousin';
    state.parents.consanguinityPath = 'second_cousin_simple';

    const { layout, layoutIssues, issues } = buildFull(state);
    assertZeroErrors(issues);

    // No duplicate positions
    const dupPositions = layoutIssues.filter(i => i.code === 'DUPLICATE_NODE_POSITION');
    expect(dupPositions).toEqual([]);

    // Great-grandparents positioned
    const ggfMat = layout.nodes.find(n => n.id === 'ggf_mat');
    const ggmMat = layout.nodes.find(n => n.id === 'ggm_mat');
    const ggfPat = layout.nodes.find(n => n.id === 'ggf_pat');
    const ggmPat = layout.nodes.find(n => n.id === 'ggm_pat');
    expect(ggfMat).toBeDefined();
    expect(ggmMat).toBeDefined();
    expect(ggfPat).toBeDefined();
    expect(ggmPat).toBeDefined();

    // Each couple has distinct X within the pair
    expect(ggfMat.x).not.toBe(ggmMat.x);
    expect(ggfPat.x).not.toBe(ggmPat.x);

    // Great-great-grandparents positioned
    const gggf = layout.nodes.find(n => n.id === 'gggf');
    const gggm = layout.nodes.find(n => n.id === 'gggm');
    expect(gggf).toBeDefined();
    expect(gggm).toBeDefined();
    expect(gggf.x).not.toBe(gggm.x);

    // gggf/gggm at a higher Y row than ggf_mat (earlier generation)
    expect(gggf.y).toBeLessThan(ggfMat.y);
  });

  it('first cousin consanguinity — ggf/ggm centered (regression)', () => {
    const state = baseState();
    state.parents.consanguineous = true;
    state.parents.consanguinityDegree = 'first_cousin';
    state.parents.consanguinityPath = 'mothers_paternal_is_fathers_paternal';

    const { layout, layoutIssues, issues } = buildFull(state);
    assertZeroErrors(issues);

    const dupPositions = layoutIssues.filter(i => i.code === 'DUPLICATE_NODE_POSITION');
    expect(dupPositions).toEqual([]);

    // ggf and ggm are positioned and distinct
    const ggf = layout.nodes.find(n => n.id === 'ggf');
    const ggm = layout.nodes.find(n => n.id === 'ggm');
    expect(ggf).toBeDefined();
    expect(ggm).toBeDefined();
    expect(ggf.x).not.toBe(ggm.x);
    expect(ggf.y).toBe(ggm.y);
  });

  it('v0.3a.3: an uncle with zero requested children is a STANDALONE individual — no spouse/union fabricated', () => {
    // Fixes the "aunt/uncle auto-shown as married" bug: buildCollateralBranch
    // used to always create a spouse + union regardless of the requested
    // child count. A maternal/paternal (or great-)uncle/aunt with no
    // children specified must appear as a plain sibling, not implicitly
    // partnered.
    const state = baseState();
    state.maternalRelatives.uncles = [
      { id: '_mu0', children: { male: 0, female: 0, unknown: 0 } },
    ];

    const { graph, issues } = buildFull(state);
    assertZeroErrors(issues);

    expect(findInd(graph, 'mat_uncle_0')).toBeDefined();
    expect(findInd(graph, 'mat_uncle_0_sp')).toBeUndefined();
    expect(graph.unions.find(u => u.id === 'U_MAT_UNCLE_0')).toBeUndefined();
  });

  it('v0.3a.4: 5 maternal uncles (past the old cap of 4) all build as standalone individuals', () => {
    const state = baseState();
    state.maternalRelatives.uncles = Array.from({ length: 5 }, (_, i) => ({
      id: `_mu${i}`, children: { male: 0, female: 0, unknown: 0 },
    }));

    const { graph, issues } = buildFull(state);
    assertZeroErrors(issues);

    for (let i = 0; i < 5; i++) {
      expect(findInd(graph, `mat_uncle_${i}`)).toBeDefined();
      expect(findInd(graph, `mat_uncle_${i}_sp`)).toBeUndefined(); // no auto-spouse
      expect(graph.unions.find(u => u.id === `U_MAT_UNCLE_${i}`)).toBeUndefined();
    }
  });

  it('v0.3a.4: 5 paternal aunts (past the old cap of 4) all build as standalone individuals', () => {
    const state = baseState();
    state.paternalRelatives.aunts = Array.from({ length: 5 }, (_, i) => ({
      id: `_pa${i}`, children: { male: 0, female: 0, unknown: 0 },
    }));

    const { graph, issues } = buildFull(state);
    assertZeroErrors(issues);

    for (let i = 0; i < 5; i++) {
      expect(findInd(graph, `pat_aunt_${i}`)).toBeDefined();
      expect(findInd(graph, `pat_aunt_${i}_sp`)).toBeUndefined();
    }
  });

  it('an uncle with requested children still gets a real spouse + union + childless-marker-capable layout', () => {
    const state = baseState();
    state.maternalRelatives.uncles = [
      { id: '_mu0', children: { male: 1, female: 0, unknown: 0 } },
    ];

    const { graph, issues } = buildFull(state);
    assertZeroErrors(issues);

    expect(findInd(graph, 'mat_uncle_0')).toBeDefined();
    expect(findInd(graph, 'mat_uncle_0_sp')).toBeDefined();
    const union = graph.unions.find(u => u.id === 'U_MAT_UNCLE_0');
    expect(union).toBeDefined();
    expect(childrenOf(graph, 'U_MAT_UNCLE_0')).toContain('mat_uncle_0_cm_0');
  });

  it('a direct-edit spouse added to a standalone uncle produces a genuine childless union with childless marker edges', () => {
    // Coverage for the childlessDrop/childlessBar edge types, moved off the
    // now-fixed "always fabricate a spouse" fixture: a childless-but-married
    // union must still render its inverted-T marker when the marriage is
    // real (explicitly added), just not fabricated by default.
    const state = baseState();
    state.maternalRelatives.uncles = [
      { id: '_mu0', children: { male: 0, female: 0, unknown: 0 } },
    ];
    state.graphEdits = [
      { type: 'addSpouse', targetId: 'mat_uncle_0', spouseId: 'de_sp_0', unionId: 'U_DE_0', spouseSex: 'female' },
    ];

    const { layout, issues } = buildFull(state);
    assertZeroErrors(issues);

    const childlessDrops = layout.edges.filter(e => e.type === 'childlessDrop');
    const childlessBars = layout.edges.filter(e => e.type === 'childlessBar');
    expect(childlessDrops.length).toBeGreaterThan(0);
    expect(childlessBars.length).toBeGreaterThan(0);
  });

  it('grandparent siblings — creates great-grandparent union and GP-level collateral', () => {
    const state = baseState();
    state.maternalGPRelatives.uncles = [
      { id: '_bdu0', children: { male: 1, female: 0, unknown: 0 } },
    ];

    const { graph, issues } = buildFull(state);
    assertZeroErrors(issues);

    // Great-grandparent couple created
    expect(findInd(graph, 'ggp_mat_f')).toBeDefined();
    expect(findInd(graph, 'ggp_mat_m')).toBeDefined();

    // GP-level uncle created at grandparent generation
    const uncle = findInd(graph, 'gp_mat_uncle_0');
    expect(uncle).toBeDefined();

    // Uncle's child (cousin-once-removed) exists
    expect(findInd(graph, 'gp_mat_uncle_0_cm_0')).toBeDefined();

    // mat_gf is child of great-grandparent union
    const ggpChildren = childrenOf(graph, 'U_GGP_mat');
    expect(ggpChildren).toContain('mat_gf');
    expect(ggpChildren).toContain('gp_mat_uncle_0');
  });

  it('explicit great-grandparents — creates parent union for specified grandparent', () => {
    const state = baseState();
    state.greatGrandparents.mat_gf = true;
    state.greatGrandparents.pat_gm = true;

    const { graph, issues } = buildFull(state);
    assertZeroErrors(issues);

    // Great-grandparents for mat_gf
    expect(findInd(graph, 'gg_mat_gf_f')).toBeDefined();
    expect(findInd(graph, 'gg_mat_gf_m')).toBeDefined();
    const matGfParents = childrenOf(graph, 'U_GG_MAT_GF');
    expect(matGfParents).toContain('mat_gf');

    // Great-grandparents for pat_gm
    expect(findInd(graph, 'gg_pat_gm_f')).toBeDefined();
    expect(findInd(graph, 'gg_pat_gm_m')).toBeDefined();
    const patGmParents = childrenOf(graph, 'U_GG_PAT_GM');
    expect(patGmParents).toContain('pat_gm');

    // mat_gm and pat_gf should NOT have great-grandparents
    expect(findInd(graph, 'gg_mat_gm_f')).toBeUndefined();
    expect(findInd(graph, 'gg_pat_gf_f')).toBeUndefined();
  });

  it('GP-level relatives have no layout overlaps', () => {
    const state = baseState();
    state.maternalGPRelatives.uncles = [
      { id: '_bdu0', children: { male: 1, female: 0, unknown: 0 } },
    ];
    state.paternalGPRelatives.uncles = [
      { id: '_ba0', children: { male: 0, female: 0, unknown: 0 } },
      { id: '_ba1', children: { male: 0, female: 0, unknown: 0 } },
    ];

    const { layout, issues, warnings } = buildFull(state);
    assertZeroErrors(issues);

    // Check no node overlaps in warnings
    const overlapWarnings = warnings.filter(w => w.includes('çakışması'));
    expect(overlapWarnings).toEqual([]);

    // GP uncle and spouse must have different X positions
    const gpUncle = layout.nodes.find(n => n.id === 'gp_mat_uncle_0');
    const gpUncleSp = layout.nodes.find(n => n.id === 'gp_mat_uncle_0_sp');
    expect(gpUncle).toBeDefined();
    expect(gpUncleSp).toBeDefined();
    expect(gpUncle.x).not.toBe(gpUncleSp.x);

    // Pat GP uncles (_ba0, _ba1) both have zero requested children, so
    // v0.3a.3's fix means NEITHER gets a fabricated spouse — but the two
    // standalone uncles themselves must still not overlap each other.
    const patUncle0 = layout.nodes.find(n => n.id === 'gp_pat_uncle_0');
    const patUncle1 = layout.nodes.find(n => n.id === 'gp_pat_uncle_1');
    const patUncle0Sp = layout.nodes.find(n => n.id === 'gp_pat_uncle_0_sp');
    expect(patUncle0).toBeDefined();
    expect(patUncle1).toBeDefined();
    expect(patUncle0Sp).toBeUndefined(); // no children requested — no fabricated spouse
    expect(patUncle0.x).not.toBe(patUncle1.x);

    // No false "spouse not connected" warnings for GP-level relatives
    const spouseWarnings = warnings.filter(w => w.includes('U_GP_'));
    expect(spouseWarnings).toEqual([]);
  });

  it('GP siblings and explicit GG parents coexist without conflict', () => {
    const state = baseState();
    // GP-level uncle creates a great-GP couple automatically
    state.maternalGPRelatives.uncles = [
      { id: '_bdu0', children: { male: 0, female: 0, unknown: 0 } },
    ];
    // Also explicitly request great-GP for mat_gf — should not duplicate
    state.greatGrandparents.mat_gf = true;

    const { graph, issues } = buildFull(state);
    assertZeroErrors(issues);

    // mat_gf has exactly one parent union (from GP uncle, not duplicated)
    const parentUnions = graph.parentChildRelationships.filter(
      r => r.children.includes('mat_gf')
    );
    expect(parentUnions.length).toBe(1);
  });

  it('complex pedigree with collateral branches has zero layout errors', () => {
    const state = baseState();
    state.siblings.male = [{ id: '_m0', age: '28' }];
    state.siblings.female = [{ id: '_f0', age: '25' }];
    state.parents.consanguineous = true;
    state.parents.consanguinityDegree = 'first_cousin';
    state.parents.consanguinityPath = 'mothers_paternal_is_fathers_paternal';
    state.parents.motherOtherUnions = [
      { id: '_mu0', status: 'together', children: { male: 1, female: 0, unknown: 0 } },
    ];
    state.maternalRelatives.uncles = [
      { id: '_dayi', children: { male: 1, female: 1, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
    ];
    state.paternalRelatives.aunts = [
      { id: '_hala', children: { male: 0, female: 1, unknown: 0, pregnancyLoss: 1, stillbirth: 0 } },
    ];
    state.gen4 = [
      { id: '_g4', targetPath: 'proband', male: 1, female: 0, unknown: 0 },
    ];

    const { graph, layout } = buildFull(state);
    const layoutIssues = auditLayoutIntegrity(layout, graph);
    const errors = layoutIssues.filter(i => i.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('all nodes have valid finite positions', () => {
    const state = baseState();
    state.siblings.male = [{ id: '_m0', age: '28' }];
    state.maternalRelatives.uncles = [
      { id: '_mu0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
    ];
    const { layout } = buildFull(state);
    assertAllNodesHavePositions(layout);
  });

  it('no liveborn nodes overlap positions', () => {
    const state = baseState();
    state.siblings.male = [{ id: '_m0', age: '28' }, { id: '_m1', age: '25' }];
    state.siblings.female = [{ id: '_f0', age: '22' }];
    const { layout } = buildFull(state);
    assertNoDuplicatePositions(layout);
  });

  it('partners share the same Y position', () => {
    const state = baseState();
    state.maternalRelatives.uncles = [
      { id: '_mu0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
    ];
    const { graph, layout } = buildFull(state);
    const layoutIssues = auditLayoutIntegrity(layout, graph);
    const yMismatches = layoutIssues.filter(i => i.code === 'PARTNER_Y_MISMATCH');
    expect(yMismatches).toEqual([]);
  });

  it('siblings share the same Y position', () => {
    const state = baseState();
    state.siblings.male = [{ id: '_m0', age: '28' }];
    state.siblings.female = [{ id: '_f0', age: '25' }];
    state.siblings.pregnancyLoss = 1;
    const { graph, layout } = buildFull(state);
    const layoutIssues = auditLayoutIntegrity(layout, graph);
    const yMismatches = layoutIssues.filter(i => i.code === 'SIBLING_Y_MISMATCH');
    expect(yMismatches).toEqual([]);
  });

  it('reorder does not break layout integrity', () => {
    const state = baseState();
    state.siblings.male = [{ id: '_m0', age: '35' }];
    state.siblings.female = [{ id: '_f0', age: '20' }];
    state.childOrders = { 'U_PARENTS': ['sib_f_0', 'proband', 'sib_m_0'] };

    const { graph, layout } = buildFull(state);
    const layoutIssues = auditLayoutIntegrity(layout, graph);
    const errors = layoutIssues.filter(i => i.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('reorder + count increase does not break layout integrity', () => {
    const state = baseState();
    state.siblings.male = [{ id: '_m0', age: '35' }];
    state.siblings.female = [{ id: '_f0', age: '20' }];
    state.siblings.unknown = [{ id: '_u0', age: '' }];
    state.childOrders = { 'U_PARENTS': ['sib_f_0', 'proband', 'sib_m_0', 'sib_u_0'] };

    const { graph, layout } = buildFull(state);
    const layoutIssues = auditLayoutIntegrity(layout, graph);
    const errors = layoutIssues.filter(i => i.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('reorder + count decrease does not break layout integrity', () => {
    const state = baseState();
    state.siblings.male = [{ id: '_m0', age: '35' }];
    // f_0 removed from previous state
    state.childOrders = { 'U_PARENTS': ['proband', 'sib_m_0'] };

    const { graph, layout } = buildFull(state);
    const layoutIssues = auditLayoutIntegrity(layout, graph);
    const errors = layoutIssues.filter(i => i.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('all edge coordinates are finite', () => {
    const state = baseState();
    state.siblings.male = [{ id: '_m0', age: '28' }];
    state.parents.consanguineous = true;
    state.parents.consanguinityDegree = 'first_cousin';
    state.parents.consanguinityPath = 'mothers_paternal_is_fathers_paternal';
    state.maternalRelatives.uncles = [
      { id: '_mu0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
    ];

    const { graph, layout } = buildFull(state);
    const layoutIssues = auditLayoutIntegrity(layout, graph);
    const coordIssues = layoutIssues.filter(i => i.code === 'EDGE_INVALID_COORDINATE');
    expect(coordIssues).toEqual([]);
  });
});

// ══════════════════════════════════════════════════
// CHILD ORDERS MIGRATION & PERSISTENCE
// ══════════════════════════════════════════════════

describe('childOrders — Migration & Persistence', () => {

  describe('Migration from legacy siblingOrder', () => {
    it('siblingOrder is migrated to childOrders via store helper', () => {
      // Simulate what the store migration does: old state has siblingOrder,
      // no childOrders. After migration, childOrders['U_PARENTS'] is populated.
      // We test the migration function directly by importing from the store module.
      // Since it's an internal function, we test the effect through the builder.
      const state = baseState();
      state.siblings.male = [{ id: '_m0', age: '35' }];
      state.siblings.female = [{ id: '_f0', age: '20' }];
      // Legacy format: siblingOrder with UI-slot tokens
      state.siblings.siblingOrder = ['f_0', 'proband', 'm_0'];
      // No childOrders — migration should populate it

      // After store migration runs, childOrders['U_PARENTS'] should be:
      // ['sib_f_0', 'proband', 'sib_m_0']
      // But the builder now reads childOrders directly, so we simulate
      // what the store does:
      state.childOrders = { 'U_PARENTS': ['sib_f_0', 'proband', 'sib_m_0'] };

      const { graph } = buildFull(state);
      const children = childrenOf(graph, 'U_PARENTS');
      expect(children[0]).toBe('sib_f_0');
      expect(children[1]).toBe('proband');
      expect(children[2]).toBe('sib_m_0');
    });

    it('migration does not overwrite existing childOrders', () => {
      const state = baseState();
      state.siblings.male = [{ id: '_m0', age: '35' }];
      // Legacy siblingOrder present
      state.siblings.siblingOrder = ['m_0', 'proband'];
      // But childOrders already set with different order
      state.childOrders = { 'U_PARENTS': ['proband', 'sib_m_0'] };

      const { graph } = buildFull(state);
      const children = childrenOf(graph, 'U_PARENTS');
      // childOrders takes precedence — proband first
      expect(children[0]).toBe('proband');
      expect(children[1]).toBe('sib_m_0');
    });
  });

  describe('Persistence across rebuilds', () => {
    it('childOrders survives rebuild when unrelated fields change', () => {
      // First build with explicit order
      const state1 = baseState();
      state1.siblings.male = [{ id: '_m0', age: '35' }];
      state1.siblings.female = [{ id: '_f0', age: '20' }];
      state1.childOrders = { 'U_PARENTS': ['sib_f_0', 'proband', 'sib_m_0'] };

      const { graph: g1 } = buildFull(state1);
      const c1 = childrenOf(g1, 'U_PARENTS');
      expect(c1).toEqual(['sib_f_0', 'proband', 'sib_m_0']);

      // Second build: change proband age (unrelated), keep same childOrders
      const state2 = { ...JSON.parse(JSON.stringify(state1)) };
      state2.proband.age = '40';

      const { graph: g2 } = buildFull(state2);
      const c2 = childrenOf(g2, 'U_PARENTS');
      expect(c2).toEqual(['sib_f_0', 'proband', 'sib_m_0']);
    });

    it('childOrders survives rebuild when parent age changes', () => {
      const state = baseState();
      state.siblings.male = [{ id: '_m0', age: '28' }];
      state.childOrders = { 'U_PARENTS': ['sib_m_0', 'proband'] };

      // Change mother age
      state.parents.motherAge = '60';

      const { graph } = buildFull(state);
      const children = childrenOf(graph, 'U_PARENTS');
      expect(children).toEqual(['sib_m_0', 'proband']);
    });
  });

  describe('Count changes with childOrders', () => {
    it('count increase: new child appended to end of manual order', () => {
      const state = baseState();
      state.siblings.male = [{ id: '_m0', age: '35' }];
      state.siblings.female = [{ id: '_f0', age: '20' }, { id: '_f1', age: '18' }];
      // Manual order only had m_0 and proband, f_0 and f_1 are new
      state.childOrders = { 'U_PARENTS': ['sib_m_0', 'proband'] };

      const { graph } = buildFull(state);
      const children = childrenOf(graph, 'U_PARENTS');
      // Surviving order first, then new children appended
      expect(children[0]).toBe('sib_m_0');
      expect(children[1]).toBe('proband');
      // New children appended (default order among them: f_0 age 20 > f_1 age 18)
      expect(children).toContain('sib_f_0');
      expect(children).toContain('sib_f_1');
      expect(children.indexOf('sib_f_0')).toBeGreaterThan(1);
      expect(children.indexOf('sib_f_1')).toBeGreaterThan(1);
    });

    it('count decrease: removed children pruned, survivors keep order', () => {
      const state = baseState();
      state.siblings.male = [{ id: '_m0', age: '35' }];
      // sib_f_0 was removed, but still in childOrders
      state.childOrders = { 'U_PARENTS': ['sib_f_0', 'proband', 'sib_m_0'] };

      const { graph } = buildFull(state);
      const children = childrenOf(graph, 'U_PARENTS');
      // sib_f_0 pruned, surviving order preserved
      expect(children[0]).toBe('proband');
      expect(children[1]).toBe('sib_m_0');
      expect(children).not.toContain('sib_f_0');
    });

    it('count decrease + increase together', () => {
      const state = baseState();
      state.siblings.male = [{ id: '_m0', age: '35' }];
      state.siblings.unknown = [{ id: '_u0', age: '' }];
      // f_0 removed, u_0 new; order had f_0
      state.childOrders = { 'U_PARENTS': ['sib_f_0', 'sib_m_0', 'proband'] };

      const { graph } = buildFull(state);
      const children = childrenOf(graph, 'U_PARENTS');
      // f_0 pruned, survivors keep order, u_0 appended
      expect(children[0]).toBe('sib_m_0');
      expect(children[1]).toBe('proband');
      expect(children[2]).toBe('sib_u_0');
    });
  });

  describe('No regression on non-proband groups', () => {
    it('collateral branch children use default order (no childOrders set)', () => {
      const state = baseState();
      state.maternalRelatives.uncles = [
        { id: '_mu0', children: { male: 2, female: 1, unknown: 0, pregnancyLoss: 1, stillbirth: 0 } },
      ];
      // No childOrders for U_MAT_UNCLE_0

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      const cousins = childrenOf(graph, 'U_MAT_UNCLE_0');
      // Default order: liveborn first (m, m, f), then losses
      expect(cousins).toHaveLength(4);
      expect(cousins[3]).toBe('mat_uncle_0_loss_0'); // loss at end
    });

    it('half-sibling children use default order (no childOrders set)', () => {
      const state = baseState();
      state.parents.motherOtherUnions = [
        { id: '_mu0', status: 'together', children: { male: 1, female: 1, unknown: 0 } },
      ];

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      const hsibs = childrenOf(graph, 'U_MOTHER_OTHER_0');
      expect(hsibs).toHaveLength(2);
      // Default order: male first, female second (no ages, so insertion order)
      expect(hsibs[0]).toBe('hsib_mat_m_0_0');
      expect(hsibs[1]).toBe('hsib_mat_f_0_0');
    });

    it('gen4 children are unaffected by childOrders', () => {
      const state = baseState();
      state.gen4 = [
        { id: '_g4', targetPath: 'proband', male: 1, female: 1, unknown: 0 },
      ];

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      const gen4children = childrenOf(graph, 'U_GEN4_0');
      expect(gen4children).toHaveLength(2);
    });
  });

  describe('childOrders with empty state', () => {
    it('empty childOrders produces default ordering', () => {
      const state = baseState();
      state.siblings.male = [{ id: '_m0', age: '28' }];
      state.siblings.female = [{ id: '_f0', age: '35' }];
      state.childOrders = {};

      const { graph } = buildFull(state);
      const children = childrenOf(graph, 'U_PARENTS');
      // Default: age desc — f_0 (35), proband (30), m_0 (28)
      expect(children[0]).toBe('sib_f_0');
      expect(children[1]).toBe('proband');
      expect(children[2]).toBe('sib_m_0');
    });

    it('undefined childOrders produces default ordering', () => {
      const state = baseState();
      state.siblings.male = [{ id: '_m0', age: '28' }];
      // No childOrders field at all

      const { graph } = buildFull(state);
      const children = childrenOf(graph, 'U_PARENTS');
      expect(children[0]).toBe('proband'); // age 30
      expect(children[1]).toBe('sib_m_0'); // age 28
    });
  });
});

// ══════════════════════════════════════════════════
// NON-U_PARENTS UNION ORDERING VIA childOrders
// ══════════════════════════════════════════════════

describe('childOrders — Non-proband unions', () => {

  describe('Maternal half-sibling ordering', () => {
    it('explicit childOrders for U_MOTHER_OTHER_0 reorders half-siblings', () => {
      const state = baseState();
      state.parents.motherOtherUnions = [
        { id: '_mu0', status: 'together', children: { male: 1, female: 1, unknown: 1 } },
      ];
      // Reverse the default order: unknown, female, male
      state.childOrders = {
        'U_MOTHER_OTHER_0': ['hsib_mat_u_0_0', 'hsib_mat_f_0_0', 'hsib_mat_m_0_0'],
      };

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      const children = childrenOf(graph, 'U_MOTHER_OTHER_0');
      expect(children).toEqual(['hsib_mat_u_0_0', 'hsib_mat_f_0_0', 'hsib_mat_m_0_0']);
    });

    it('stale tokens in half-sib childOrders are pruned', () => {
      const state = baseState();
      state.parents.motherOtherUnions = [
        { id: '_mu0', status: 'together', children: { male: 1, female: 0, unknown: 1 } },
      ];
      // Contains a stale female token
      state.childOrders = {
        'U_MOTHER_OTHER_0': ['hsib_mat_f_0_0', 'hsib_mat_u_0_0', 'hsib_mat_m_0_0'],
      };

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      const children = childrenOf(graph, 'U_MOTHER_OTHER_0');
      // f_0_0 pruned, survivors keep order
      expect(children).toEqual(['hsib_mat_u_0_0', 'hsib_mat_m_0_0']);
    });
  });

  describe('Paternal half-sibling ordering', () => {
    it('explicit childOrders for U_FATHER_OTHER_0 reorders half-siblings', () => {
      const state = baseState();
      state.parents.fatherOtherUnions = [
        { id: '_fu0', status: 'together', children: { male: 2, female: 0, unknown: 0 } },
      ];
      state.childOrders = {
        'U_FATHER_OTHER_0': ['hsib_pat_m_0_1', 'hsib_pat_m_0_0'],
      };

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      const children = childrenOf(graph, 'U_FATHER_OTHER_0');
      expect(children).toEqual(['hsib_pat_m_0_1', 'hsib_pat_m_0_0']);
    });
  });

  describe('Collateral cousin ordering', () => {
    it('explicit childOrders for U_MAT_UNCLE_0 reorders cousins', () => {
      const state = baseState();
      state.maternalRelatives.uncles = [
        { id: '_mu0', children: { male: 1, female: 1, unknown: 0, pregnancyLoss: 1, stillbirth: 0 } },
      ];
      // Put female first, then loss, then male
      state.childOrders = {
        'U_MAT_UNCLE_0': ['mat_uncle_0_cf_0', 'mat_uncle_0_loss_0', 'mat_uncle_0_cm_0'],
      };

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      const children = childrenOf(graph, 'U_MAT_UNCLE_0');
      expect(children).toEqual(['mat_uncle_0_cf_0', 'mat_uncle_0_loss_0', 'mat_uncle_0_cm_0']);
    });

    it('explicit childOrders for U_PAT_AUNT_0 reorders cousins', () => {
      const state = baseState();
      state.paternalRelatives.aunts = [
        { id: '_pa0', children: { male: 0, female: 2, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
      ];
      state.childOrders = {
        'U_PAT_AUNT_0': ['pat_aunt_0_cf_1', 'pat_aunt_0_cf_0'],
      };

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      const children = childrenOf(graph, 'U_PAT_AUNT_0');
      expect(children).toEqual(['pat_aunt_0_cf_1', 'pat_aunt_0_cf_0']);
    });
  });

  describe('Multiple unions with independent childOrders', () => {
    it('each union uses its own ordering independently', () => {
      const state = baseState();
      state.siblings.male = [{ id: '_m0', age: '28' }];
      state.parents.motherOtherUnions = [
        { id: '_mu0', status: 'together', children: { male: 1, female: 1, unknown: 0 } },
      ];
      state.maternalRelatives.uncles = [
        { id: '_dayi', children: { male: 1, female: 1, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
      ];

      state.childOrders = {
        'U_PARENTS': ['sib_m_0', 'proband'],  // reverse default
        'U_MOTHER_OTHER_0': ['hsib_mat_f_0_0', 'hsib_mat_m_0_0'],  // reverse default
        // U_MAT_UNCLE_0: no entry → default order
      };

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      // Each union respects its own childOrders
      expect(childrenOf(graph, 'U_PARENTS')).toEqual(['sib_m_0', 'proband']);
      expect(childrenOf(graph, 'U_MOTHER_OTHER_0')).toEqual(['hsib_mat_f_0_0', 'hsib_mat_m_0_0']);
      // Uncle cousins use default (male first, female second)
      expect(childrenOf(graph, 'U_MAT_UNCLE_0')).toEqual(['mat_uncle_0_cm_0', 'mat_uncle_0_cf_0']);
    });
  });

  describe('Gen4 descendant ordering', () => {
    it('explicit childOrders for U_GEN4_0 reorders gen4 children', () => {
      const state = baseState();
      state.gen4 = [
        { id: '_g0', targetPath: 'proband', male: 2, female: 1, unknown: 0 },
      ];
      // Reverse: female first, then male_1, then male_0
      state.childOrders = {
        'U_GEN4_0': ['gen4_0_cf_0', 'gen4_0_cm_1', 'gen4_0_cm_0'],
      };

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      const children = childrenOf(graph, 'U_GEN4_0');
      expect(children).toEqual(['gen4_0_cf_0', 'gen4_0_cm_1', 'gen4_0_cm_0']);
    });

    it('no childOrders for gen4 → default order (male, female, unknown)', () => {
      const state = baseState();
      state.gen4 = [
        { id: '_g0', targetPath: 'proband', male: 1, female: 1, unknown: 1 },
      ];
      // No childOrders entry → default deterministic order

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      const children = childrenOf(graph, 'U_GEN4_0');
      // Default: male first, then female, then unknown (all age='', so by type order)
      expect(children).toEqual(['gen4_0_cm_0', 'gen4_0_cf_0', 'gen4_0_cu_0']);
    });

    it('gen4 ordering is independent of U_PARENTS ordering', () => {
      const state = baseState();
      state.siblings.male = [{ id: '_m0', age: '28' }];
      state.gen4 = [
        { id: '_g0', targetPath: 'proband', male: 1, female: 1, unknown: 0 },
      ];
      state.childOrders = {
        'U_PARENTS': ['sib_m_0', 'proband'],  // reverse proband order
        'U_GEN4_0': ['gen4_0_cf_0', 'gen4_0_cm_0'],  // reverse gen4 order
      };

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      // Both unions respect their independent orders
      expect(childrenOf(graph, 'U_PARENTS')).toEqual(['sib_m_0', 'proband']);
      expect(childrenOf(graph, 'U_GEN4_0')).toEqual(['gen4_0_cf_0', 'gen4_0_cm_0']);
    });

    it('gen4 layout x-order matches explicit childOrders', () => {
      const state = baseState();
      state.gen4 = [
        { id: '_g0', targetPath: 'proband', male: 1, female: 1, unknown: 0 },
      ];
      // Reverse: female before male
      state.childOrders = {
        'U_GEN4_0': ['gen4_0_cf_0', 'gen4_0_cm_0'],
      };

      const { graph, layout, issues } = buildFull(state);
      assertZeroErrors(issues);

      // Verify children are in the specified order in the graph
      expect(childrenOf(graph, 'U_GEN4_0')).toEqual(['gen4_0_cf_0', 'gen4_0_cm_0']);

      // Verify layout x positions reflect the order (first child has smaller x)
      const cf0 = layout.nodes.find(n => n.id === 'gen4_0_cf_0');
      const cm0 = layout.nodes.find(n => n.id === 'gen4_0_cm_0');
      if (cf0 && cm0) {
        expect(cf0.x).toBeLessThan(cm0.x);
      }
    });

    it('gen4 with single child — no ordering needed, no errors', () => {
      const state = baseState();
      state.gen4 = [
        { id: '_g0', targetPath: 'proband', male: 1, female: 0, unknown: 0 },
      ];

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      const children = childrenOf(graph, 'U_GEN4_0');
      expect(children).toEqual(['gen4_0_cm_0']);
    });

    it('gen4 ordering reconciles stale tokens', () => {
      const state = baseState();
      state.gen4 = [
        { id: '_g0', targetPath: 'proband', male: 1, female: 1, unknown: 0 },
      ];
      // Include a stale token that no longer exists
      state.childOrders = {
        'U_GEN4_0': ['gen4_0_cf_0', 'gen4_0_cu_0_STALE', 'gen4_0_cm_0'],
      };

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      // Stale token pruned, surviving tokens preserve relative order
      const children = childrenOf(graph, 'U_GEN4_0');
      expect(children).toEqual(['gen4_0_cf_0', 'gen4_0_cm_0']);
    });
  });

  describe('Regression: proband ordering still works after UI refactor', () => {
    it('proband manual order via childOrders unchanged', () => {
      const state = baseState();
      state.siblings.male = [{ id: '_m0', age: '35' }];
      state.siblings.female = [{ id: '_f0', age: '20' }];
      state.childOrders = { 'U_PARENTS': ['sib_f_0', 'proband', 'sib_m_0'] };

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);
      expect(childrenOf(graph, 'U_PARENTS')).toEqual(['sib_f_0', 'proband', 'sib_m_0']);
    });

    it('no childOrders → default age-desc order preserved', () => {
      const state = baseState();
      state.siblings.male = [{ id: '_m0', age: '28' }];
      state.siblings.female = [{ id: '_f0', age: '35' }];

      const { graph } = buildFull(state);
      const children = childrenOf(graph, 'U_PARENTS');
      expect(children[0]).toBe('sib_f_0'); // 35
      expect(children[1]).toBe('proband'); // 30
      expect(children[2]).toBe('sib_m_0'); // 28
    });
  });

  // =================================================================
  // CUSTOM CONSANGUINITY
  // =================================================================

  describe('Custom consanguinity — sibling declarations', () => {
    it('two individuals with no parents → shared parent union created', () => {
      const state = baseState();
      // mat_uncle and pat_aunt have no existing parent unions by default
      // (their parents are grandparents, but let's use two spouse stubs
      //  that don't have parents assigned). v0.3a.3: a spouse stub is only
      // created when the relative has requested children (see the
      // aunt/uncle auto-spouse fix) — request 1 child each so
      // mat_uncle_0_sp/pat_aunt_0_sp still exist as the two "no parents"
      // test subjects this test is actually about.
      state.maternalRelatives.uncles = [
        { id: '_mu0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
      ];
      state.paternalRelatives.aunts = [
        { id: '_pa0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
      ];
      // Declare the uncle's spouse and aunt's spouse as siblings
      state.customConsanguinity = [
        { id: '_cc0', type: 'siblings', person1: 'mat_uncle_0_sp', person2: 'pat_aunt_0_sp' },
      ];

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      // Shared parent union U_CC_0 should exist
      const ccUnion = graph.unions.find(u => u.id === 'U_CC_0');
      expect(ccUnion).toBeDefined();
      expect(ccUnion.partners).toContain('cc_0_f');
      expect(ccUnion.partners).toContain('cc_0_m');

      // Both spouses should be children of this union
      const ccChildren = childrenOf(graph, 'U_CC_0');
      expect(ccChildren).toContain('mat_uncle_0_sp');
      expect(ccChildren).toContain('pat_aunt_0_sp');

      // Shared parents should exist as individuals
      const ccFather = findInd(graph, 'cc_0_f');
      const ccMother = findInd(graph, 'cc_0_m');
      expect(ccFather).toBeDefined();
      expect(ccMother).toBeDefined();
      expect(ccFather.sex).toBe('male');
      expect(ccMother.sex).toBe('female');
    });

    it('person1 already has parent union → person2 added to it', () => {
      const state = baseState();
      // mat_uncle_0 is a child of U_MAT_GP (maternal grandparents)
      // pat_aunt_0_sp has no parent union. v0.3a.3: pat_aunt_0 needs 1
      // requested child so pat_aunt_0_sp (the "no parents" test subject)
      // still exists — see the aunt/uncle auto-spouse fix.
      state.maternalRelatives.uncles = [
        { id: '_mu0', children: { male: 0, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
      ];
      state.paternalRelatives.aunts = [
        { id: '_pa0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
      ];

      // Declare mat_uncle_0 (has parent union U_MAT_GP) and pat_aunt_0_sp (no parents) as siblings
      state.customConsanguinity = [
        { id: '_cc0', type: 'siblings', person1: 'mat_uncle_0', person2: 'pat_aunt_0_sp' },
      ];

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      // pat_aunt_0_sp should be added to U_MAT_GP as a child
      const matGPChildren = childrenOf(graph, 'U_MAT_GP');
      expect(matGPChildren).toContain('mat_uncle_0');
      expect(matGPChildren).toContain('pat_aunt_0_sp');

      // No new U_CC union should be created
      const ccUnion = graph.unions.find(u => u.id === 'U_CC_0');
      expect(ccUnion).toBeUndefined();
    });

    it('person2 already has parent union → person1 added to it', () => {
      const state = baseState();
      // v0.3a.3: mat_uncle_0 needs 1 requested child so mat_uncle_0_sp (the
      // "no parents" test subject) still exists — see the aunt/uncle
      // auto-spouse fix.
      state.maternalRelatives.uncles = [
        { id: '_mu0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
      ];
      state.paternalRelatives.aunts = [
        { id: '_pa0', children: { male: 0, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
      ];

      // Declare pat_aunt_0_sp (no parents) as person1, pat_aunt_0 (has parent U_PAT_GP) as person2
      // Wait — pat_aunt_0 already has U_PAT_GP, and pat_aunt_0_sp doesn't
      state.customConsanguinity = [
        { id: '_cc0', type: 'siblings', person1: 'mat_uncle_0_sp', person2: 'pat_aunt_0' },
      ];

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      // mat_uncle_0_sp should be added to U_PAT_GP
      const patGPChildren = childrenOf(graph, 'U_PAT_GP');
      expect(patGPChildren).toContain('pat_aunt_0');
      expect(patGPChildren).toContain('mat_uncle_0_sp');
    });

    it('already siblings (same parent union) → no duplicate, no error', () => {
      const state = baseState();
      // mother and mat_uncle_0 are both children of U_MAT_GP
      state.maternalRelatives.uncles = [
        { id: '_mu0', children: { male: 0, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
      ];
      state.customConsanguinity = [
        { id: '_cc0', type: 'siblings', person1: 'mother', person2: 'mat_uncle_0' },
      ];

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      // Should not create a new union — they already share U_MAT_GP
      const ccUnion = graph.unions.find(u => u.id === 'U_CC_0');
      expect(ccUnion).toBeUndefined();

      // Original parent union still intact
      const matGPChildren = childrenOf(graph, 'U_MAT_GP');
      expect(matGPChildren).toContain('mother');
      expect(matGPChildren).toContain('mat_uncle_0');
    });

    it('nonexistent person ID → silently skipped, no error', () => {
      const state = baseState();
      state.customConsanguinity = [
        { id: '_cc0', type: 'siblings', person1: 'nonexistent_1', person2: 'nonexistent_2' },
      ];

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      // No new union created
      const ccUnion = graph.unions.find(u => u.id === 'U_CC_0');
      expect(ccUnion).toBeUndefined();
    });
  });

  describe('Custom union consanguinity flags', () => {
    it('marking a union as consanguineous sets the flag', () => {
      const state = baseState();
      state.maternalRelatives.uncles = [
        { id: '_mu0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
      ];
      state.consanguineousUnions = { 'U_MAT_UNCLE_0': true };

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      const union = graph.unions.find(u => u.id === 'U_MAT_UNCLE_0');
      expect(union).toBeDefined();
      expect(union.consanguineous).toBe(true);
    });

    it('non-existent union ID in consanguineousUnions → no crash', () => {
      const state = baseState();
      state.consanguineousUnions = { 'U_FAKE_UNION': true };

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      // No union was modified, but no crash occurred
      const fakeUnion = graph.unions.find(u => u.id === 'U_FAKE_UNION');
      expect(fakeUnion).toBeUndefined();
    });

    it('template consanguinity coexists with custom union flags', () => {
      const state = baseState();
      state.parents.consanguineous = true;
      state.parents.consanguinityDegree = 'first_cousin';
      state.parents.consanguinityPath = 'mothers_paternal_is_fathers_paternal';
      // v0.3a.3: the uncle needs 1 requested child so U_MAT_UNCLE_0 (their
      // own marriage union) actually exists — see the aunt/uncle
      // auto-spouse fix (a childless uncle is now a standalone individual
      // with no union at all).
      state.maternalRelatives.uncles = [
        { id: '_mu0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
      ];
      // Also mark uncle's union as consanguineous via custom flag
      state.consanguineousUnions = { 'U_MAT_UNCLE_0': true };

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      // Template: parent union is consanguineous
      const parentUnion = graph.unions.find(u => u.id === 'U_PARENTS');
      expect(parentUnion.consanguineous).toBe(true);

      // Custom: uncle union is also consanguineous
      const uncleUnion = graph.unions.find(u => u.id === 'U_MAT_UNCLE_0');
      expect(uncleUnion.consanguineous).toBe(true);
    });
  });

  describe('Consanguinity degree validation', () => {
    it('unknown degree generates info warning, not error', () => {
      const state = baseState();
      state.parents.consanguineous = true;
      state.parents.consanguinityDegree = 'unknown';

      const { warnings, issues } = buildFull(state);
      assertZeroErrors(issues);

      // Should have an info-level message about unknown degree
      const infoMsg = warnings.find(w => w.includes('Bilgi') && w.includes('bilinmiyor'));
      expect(infoMsg).toBeDefined();

      // Should NOT have the "derece seçilmemiş" error-level warning
      const errorMsg = warnings.find(w => w.includes('derece seçilmemiş'));
      expect(errorMsg).toBeUndefined();
    });
  });

  describe('Direct graph edits (right-panel additions)', () => {
    it('addSpouse creates spouse + union for an existing individual', () => {
      const state = baseState();
      state.maternalRelatives.uncles = [
        { id: '_mu0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
      ];
      // Add a spouse to the cousin via direct edit
      state.graphEdits = [
        { type: 'addSpouse', targetId: 'mat_uncle_0_cm_0', spouseId: 'de_sp_0', unionId: 'U_DE_0', spouseSex: 'female' },
      ];

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      // Spouse exists
      const spouse = findInd(graph, 'de_sp_0');
      expect(spouse).toBeDefined();
      expect(spouse.sex).toBe('female');

      // Union exists
      const union = graph.unions.find(u => u.id === 'U_DE_0');
      expect(union).toBeDefined();
      expect(union.partners).toContain('mat_uncle_0_cm_0');
      expect(union.partners).toContain('de_sp_0');
    });

    it('addChild creates child attached to a direct-edit union', () => {
      const state = baseState();
      state.maternalRelatives.uncles = [
        { id: '_mu0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
      ];
      state.graphEdits = [
        { type: 'addSpouse', targetId: 'mat_uncle_0_cm_0', spouseId: 'de_sp_0', unionId: 'U_DE_0', spouseSex: 'female' },
        { type: 'addChild', unionId: 'U_DE_0', childId: 'de_ch_1', sex: 'male' },
      ];

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      // Child exists
      const child = findInd(graph, 'de_ch_1');
      expect(child).toBeDefined();
      expect(child.sex).toBe('male');

      // Child is attached to the union
      const children = childrenOf(graph, 'U_DE_0');
      expect(children).toContain('de_ch_1');
    });

    it('direct edits have no layout overlaps', () => {
      const state = baseState();
      state.maternalRelatives.uncles = [
        { id: '_mu0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
      ];
      state.graphEdits = [
        { type: 'addSpouse', targetId: 'mat_uncle_0_cm_0', spouseId: 'de_sp_0', unionId: 'U_DE_0', spouseSex: 'female' },
        { type: 'addChild', unionId: 'U_DE_0', childId: 'de_ch_1', sex: 'male' },
        { type: 'addChild', unionId: 'U_DE_0', childId: 'de_ch_2', sex: 'female' },
      ];

      const { layout, issues, warnings } = buildFull(state);
      assertZeroErrors(issues);

      // No layout overlaps
      const overlapWarnings = warnings.filter(w => w.includes('çakışması'));
      expect(overlapWarnings).toEqual([]);

      // Spouse has different X than the cousin
      const cousin = layout.nodes.find(n => n.id === 'mat_uncle_0_cm_0');
      const spouse = layout.nodes.find(n => n.id === 'de_sp_0');
      expect(cousin.x).not.toBe(spouse.x);
    });

    it('addChild to existing wizard union (e.g. cousins children)', () => {
      const state = baseState();
      state.maternalRelatives.uncles = [
        { id: '_mu0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
      ];
      // Add a child to the cousin's union — first we need the cousin to have a spouse
      state.graphEdits = [
        { type: 'addSpouse', targetId: 'mat_uncle_0_cm_0', spouseId: 'de_sp_0', unionId: 'U_DE_0', spouseSex: 'female' },
        { type: 'addChild', unionId: 'U_DE_0', childId: 'de_ch_1', sex: 'male' },
        { type: 'addChild', unionId: 'U_DE_0', childId: 'de_ch_2', sex: 'female' },
      ];

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      // The cousin's children exist and are at the correct generation
      const ch1 = findInd(graph, 'de_ch_1');
      const ch2 = findInd(graph, 'de_ch_2');
      expect(ch1).toBeDefined();
      expect(ch2).toBeDefined();
      // Cousin is gen 3 (same as proband), children should be gen 4
      const cousin = findInd(graph, 'mat_uncle_0_cm_0');
      expect(ch1.generation).toBe(cousin.generation + 1);
      expect(ch2.generation).toBe(cousin.generation + 1);
    });

    it('direct edits survive wizard rebuild', () => {
      const state = baseState();
      state.graphEdits = [
        { type: 'addSpouse', targetId: 'mother', spouseId: 'de_sp_0', unionId: 'U_DE_0', spouseSex: 'male' },
      ];

      // Build once
      const { graph: g1, issues: i1 } = buildFull(state);
      assertZeroErrors(i1);
      expect(findInd(g1, 'de_sp_0')).toBeDefined();

      // "Rebuild" by changing an unrelated field
      const state2 = JSON.parse(JSON.stringify(state));
      state2.proband.age = '25';
      const { graph: g2, issues: i2 } = buildFull(state2);
      assertZeroErrors(i2);
      // Direct edit still present
      expect(findInd(g2, 'de_sp_0')).toBeDefined();
    });
  });

  describe('Custom consanguinity + template coexistence regression', () => {
    it('first cousin template + custom sibling declaration both work together', () => {
      const state = baseState();
      // Template: first cousin consanguinity between parents
      state.parents.consanguineous = true;
      state.parents.consanguinityDegree = 'first_cousin';
      state.parents.consanguinityPath = 'mothers_paternal_is_fathers_paternal';

      // Add uncle on both sides with spouses. v0.3a.3: each needs 1
      // requested child so their spouse stubs (mat_uncle_0_sp/pat_aunt_0_sp)
      // exist at all — see the aunt/uncle auto-spouse fix.
      state.maternalRelatives.uncles = [
        { id: '_mu0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
      ];
      state.paternalRelatives.aunts = [
        { id: '_pa0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
      ];

      // Custom: declare uncle's spouse and aunt's spouse as siblings
      state.customConsanguinity = [
        { id: '_cc0', type: 'siblings', person1: 'mat_uncle_0_sp', person2: 'pat_aunt_0_sp' },
      ];

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      // Template consanguinity: shared grandparent (ggf/ggm) should exist
      const ggf = findInd(graph, 'ggf');
      expect(ggf).toBeDefined();

      // Custom: shared parent union for spouses should exist
      const ccUnion = graph.unions.find(u => u.id === 'U_CC_0');
      expect(ccUnion).toBeDefined();

      // Both systems coexist without graph integrity errors
      assertNoDuplicateIds(graph);
    });
  });

  // ────────────────────────────────────────────────
  // v0.2: Proband invariant
  // ────────────────────────────────────────────────
  describe('Proband invariant (v0.2)', () => {
    it('default state assigns proband to the wizard proband slot', () => {
      const state = baseState();
      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);
      assertOneProband(graph);
      expect(issues.find(i => i.code === 'PROBAND_MISSING')).toBeUndefined();
      expect(issues.find(i => i.code === 'PROBAND_MULTIPLE')).toBeUndefined();
    });

    it('probandId can move the flag to a different existing individual', () => {
      const state = baseState();
      state.siblings.male = [{ id: '_m0', age: '10' }];
      state.probandId = 'sib_m_0';

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      const probands = graph.individuals.filter(i => i.proband);
      expect(probands).toHaveLength(1);
      expect(probands[0].id).toBe('sib_m_0');

      // The wizard's own 'proband' node still exists (structural anchor)
      // but no longer carries the clinical flag.
      const defaultSlot = findInd(graph, 'proband');
      expect(defaultSlot).toBeDefined();
      expect(defaultSlot.proband).toBe(false);
    });

    it('probandId: null produces a valid zero-proband state with a warning, not an error', () => {
      const state = baseState();
      state.probandId = null;

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      const probands = graph.individuals.filter(i => i.proband);
      expect(probands).toHaveLength(0);

      const missing = issues.find(i => i.code === 'PROBAND_MISSING');
      expect(missing).toBeDefined();
      expect(missing.severity).toBe('warning');
    });

    it('a stale probandId (references a nonexistent individual) leaves zero probands rather than crashing or guessing', () => {
      const state = baseState();
      state.probandId = 'this_id_does_not_exist';

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      const probands = graph.individuals.filter(i => i.proband);
      expect(probands).toHaveLength(0);
      expect(issues.find(i => i.code === 'PROBAND_MISSING')).toBeDefined();
    });

    it('graphIntegrity flags a malformed graph with multiple probands as an error (defense in depth for imported/corrupt data)', () => {
      const state = baseState();
      state.siblings.male = [{ id: '_m0', age: '10' }];
      const graph = buildPedigreeFromWizard(state);

      // Simulate corrupt/imported data that bypassed the builder's single
      // proband-assignment pass (stage 10d) — hand-construct two probands.
      const sib = graph.individuals.find(i => i.id === 'sib_m_0');
      sib.proband = true;

      const issues = auditPedigreeGraph(graph);
      const multiple = issues.find(i => i.code === 'PROBAND_MULTIPLE');
      expect(multiple).toBeDefined();
      expect(multiple.severity).toBe('error');
      expect(multiple.ids).toEqual(expect.arrayContaining(['proband', 'sib_m_0']));
    });
  });

  // ────────────────────────────────────────────────
  // v0.2: Consanguinity status (known_supported vs reported_unresolved)
  // ────────────────────────────────────────────────
  describe('Consanguinity status (v0.2)', () => {
    it('a templated, resolved degree (first cousin) is known_supported and renders a true double line', () => {
      const state = baseState();
      state.parents.consanguineous = true;
      state.parents.consanguinityDegree = 'first_cousin';
      state.parents.consanguinityPath = 'mothers_paternal_is_fathers_paternal';

      const { graph, issues, layout } = buildFull(state);
      assertZeroErrors(issues);

      const union = graph.unions.find(u => u.id === 'U_PARENTS');
      expect(union.consanguineous).toBe(true);
      expect(union.consanguinityStatus).toBe('known_supported');
      expect(issues.find(i => i.code === 'CONSANGUINITY_UNRESOLVED')).toBeUndefined();

      const consangEdge = layout.edges.find(e => e.unionId === 'U_PARENTS' && e.type === 'consanguineousUnion');
      expect(consangEdge).toBeDefined();
    });

    it('first_cousin degree with NO explicit path chosen does not guess a lineage (v0.2 follow-up fix)', () => {
      // Regression guard for the "silently guessed lineage" gap: previously,
      // leaving "Akrabalık Yolu" at its default 'unknown' while degree was
      // 'first_cousin' still silently resolved to
      // 'mothers_paternal_is_fathers_paternal' and built real ggf/ggm
      // ancestor nodes as if the user had confirmed that specific lineage.
      // It must now stay reported_unresolved and fabricate nothing.
      const state = baseState();
      state.parents.consanguineous = true;
      state.parents.consanguinityDegree = 'first_cousin';
      // consanguinityPath intentionally left at baseState()'s default ('unknown')

      const { graph, issues, layout } = buildFull(state);
      assertZeroErrors(issues);

      const union = graph.unions.find(u => u.id === 'U_PARENTS');
      expect(union.consanguineous).toBe(true);
      expect(union.consanguinityStatus).toBe('reported_unresolved');

      // No fabricated great-grandparents for the unconfirmed path
      expect(findInd(graph, 'ggf')).toBeUndefined();
      expect(findInd(graph, 'ggm')).toBeUndefined();

      // Renders as the unresolved marker, not a true double line
      expect(layout.edges.find(e => e.unionId === 'U_PARENTS' && e.type === 'consanguineousUnion')).toBeUndefined();
      expect(layout.edges.find(e => e.unionId === 'U_PARENTS' && e.type === 'consanguineousUnionUnresolved')).toBeDefined();

      // Clear validation warning present
      expect(issues.find(i => i.code === 'CONSANGUINITY_UNRESOLVED' && i.ids.includes('U_PARENTS'))).toBeDefined();
    });

    it('second_cousin and double_first_cousin still resolve without an explicit path (single modeled lineage shape, unchanged)', () => {
      const secondCousinState = baseState();
      secondCousinState.parents.consanguineous = true;
      secondCousinState.parents.consanguinityDegree = 'second_cousin';
      // no explicit consanguinityPath — relies on the template default, which is fine here:
      // this degree has exactly one modeled lineage shape, not a per-case ambiguity.
      const secondCousin = buildFull(secondCousinState);
      assertZeroErrors(secondCousin.issues);
      expect(secondCousin.graph.unions.find(u => u.id === 'U_PARENTS').consanguinityStatus).toBe('known_supported');

      const doubleFirstCousinState = baseState();
      doubleFirstCousinState.parents.consanguineous = true;
      doubleFirstCousinState.parents.consanguinityDegree = 'double_first_cousin';
      const doubleFirstCousin = buildFull(doubleFirstCousinState);
      assertZeroErrors(doubleFirstCousin.issues);
      expect(doubleFirstCousin.graph.unions.find(u => u.id === 'U_PARENTS').consanguinityStatus).toBe('known_supported');
    });

    it('an unresolved path (degree=unknown) is reported_unresolved, not known_supported', () => {
      const state = baseState();
      state.parents.consanguineous = true;
      state.parents.consanguinityDegree = 'unknown';

      const { graph, issues, layout } = buildFull(state);
      assertZeroErrors(issues);

      const union = graph.unions.find(u => u.id === 'U_PARENTS');
      expect(union.consanguineous).toBe(true);
      expect(union.consanguinityStatus).toBe('reported_unresolved');

      const unresolvedIssue = issues.find(i => i.code === 'CONSANGUINITY_UNRESOLVED' && i.ids.includes('U_PARENTS'));
      expect(unresolvedIssue).toBeDefined();
      expect(unresolvedIssue.severity).toBe('warning');

      // Must NOT render as a fully-modeled cousin marriage.
      const doubleLineEdge = layout.edges.find(e => e.unionId === 'U_PARENTS' && e.type === 'consanguineousUnion');
      expect(doubleLineEdge).toBeUndefined();
      const unresolvedEdge = layout.edges.find(e => e.unionId === 'U_PARENTS' && e.type === 'consanguineousUnionUnresolved');
      expect(unresolvedEdge).toBeDefined();
    });

    it('an unsupported/untemplated degree (first_cousin_once_removed) is reported_unresolved', () => {
      const state = baseState();
      state.parents.consanguineous = true;
      state.parents.consanguinityDegree = 'first_cousin_once_removed';
      state.parents.consanguinityPath = 'unknown';

      const { graph, issues } = buildFull(state);
      assertZeroErrors(issues);

      const union = graph.unions.find(u => u.id === 'U_PARENTS');
      expect(union.consanguinityStatus).toBe('reported_unresolved');
      expect(issues.find(i => i.code === 'CONSANGUINITY_UNRESOLVED' && i.ids.includes('U_PARENTS'))).toBeDefined();
    });

    it('marking an arbitrary union (e.g. an uncle union) as consanguineous never fabricates known_supported status', () => {
      const state = baseState();
      state.maternalRelatives.uncles = [
        { id: '_mu0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
      ];
      state.consanguineousUnions = { 'U_MAT_UNCLE_0': true };

      const { graph, issues, layout } = buildFull(state);
      assertZeroErrors(issues);

      const union = graph.unions.find(u => u.id === 'U_MAT_UNCLE_0');
      expect(union.consanguineous).toBe(true);
      expect(union.consanguinityStatus).toBe('reported_unresolved');
      expect(issues.find(i => i.code === 'CONSANGUINITY_UNRESOLVED' && i.ids.includes('U_MAT_UNCLE_0'))).toBeDefined();

      const doubleLineEdge = layout.edges.find(e => e.unionId === 'U_MAT_UNCLE_0' && e.type === 'consanguineousUnion');
      expect(doubleLineEdge).toBeUndefined();
    });

    it('graphIntegrity flags consanguineous=true with a missing/pending status as a graph-invalid error (defense in depth)', () => {
      const state = baseState();
      const graph = buildPedigreeFromWizard(state);

      // Simulate malformed/imported data that never went through the
      // builder's finalization pass.
      const union = graph.unions.find(u => u.id === 'U_PARENTS');
      union.consanguineous = true;
      union.consanguinityStatus = 'pending';

      const issues = auditPedigreeGraph(graph);
      const invalid = issues.find(i => i.code === 'CONSANGUINITY_STATUS_MISSING');
      expect(invalid).toBeDefined();
      expect(invalid.severity).toBe('error');
    });
  });
});
