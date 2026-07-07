/**
 * layoutPacking.test.js — v0.4 Phase 2: pure family-block x/y packing.
 *
 * Validates the coordinate output against the position-level layout audits.
 * (Edge-level audits like NO_PARENT_CHILD_EDGES / EDGE_THROUGH_NODE are a
 * Phase-3 concern — this phase produces positions only, so those are not
 * asserted here.)
 *
 * These assertions (in particular "couple centered over children") encode
 * the OLD per-generation barycenter engine's specific placement heuristic,
 * predating the recursive packer. Since Step 4C made recursive the default
 * (see layoutPacking.js's recursivePackerEnabled), this file pins itself to
 * PEDITREE_PACKER=legacy so it keeps validating the engine it was written
 * for — recursivePackerRuntimeEntryPoint.test.js covers the now-default
 * recursive engine through the real store path instead.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeFamilyBlockLayout } from '../utils/layoutPacking';
import { auditLayoutIntegrity } from '../utils/layoutIntegrity';
import { buildPedigreeFromWizard } from '../builder/pedigreeBuilderFromWizard';
import { baseState } from './helpers';

const ORIGINAL_PACKER = process.env.PEDITREE_PACKER;
beforeEach(() => { process.env.PEDITREE_PACKER = 'legacy'; });
afterEach(() => {
  if (ORIGINAL_PACKER === undefined) delete process.env.PEDITREE_PACKER;
  else process.env.PEDITREE_PACKER = ORIGINAL_PACKER;
});

function positionAudit(state) {
  const graph = buildPedigreeFromWizard(state);
  const { xPos, yPos } = computeFamilyBlockLayout(graph);
  const nodes = graph.individuals.map(i => ({ ...i, x: xPos[i.id], y: yPos[i.id] }));
  const issues = auditLayoutIntegrity({ nodes, edges: [] }, graph);
  const count = (code) => issues.filter(i => i.code === code).length;
  return { graph, nodes, xPos, yPos, issues, count };
}

const POSITION_ERROR_CODES = [
  'MISSING_LAYOUT_NODE',
  'INVALID_NODE_POSITION',
  'DUPLICATE_NODE_POSITION',
  'PARTNER_Y_MISMATCH',
  'SIBLING_Y_MISMATCH',
];

function expectCleanPositions(state, label) {
  const r = positionAudit(state);
  // finite everywhere
  expect(r.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)), `${label}: finite`).toBe(true);
  // no position-level errors
  for (const code of POSITION_ERROR_CODES) {
    expect(r.count(code), `${label}: ${code}`).toBe(0);
  }
  // THE core fix: no overlapping sibling buses
  expect(r.count('SIBSHIP_BUS_OVERLAP'), `${label}: SIBSHIP_BUS_OVERLAP`).toBe(0);
  return r;
}

describe('layoutPacking — no bus overlap on representative pedigrees', () => {
  it('simple nuclear family (base)', () => {
    expectCleanPositions(baseState(), 'base');
  });

  it('large sibship (5 male + 5 female siblings)', () => {
    const s = baseState();
    s.siblings.male = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, age: `${30 - i}` }));
    s.siblings.female = Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, age: `${25 - i}` }));
    expectCleanPositions(s, 'large-sibship');
  });

  it('maternal + paternal collateral branches with children', () => {
    const s = baseState();
    s.maternalRelatives.uncles = [{ id: '_mu0', children: { male: 2, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } }];
    s.paternalRelatives.aunts = [{ id: '_pa0', children: { male: 0, female: 2, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } }];
    expectCleanPositions(s, 'collateral');
  });

  it('5 maternal uncles each with children (past the old cap, upper-gen collateral)', () => {
    const s = baseState();
    s.maternalRelatives.uncles = Array.from({ length: 5 }, (_, i) => ({
      id: `_mu${i}`, children: { male: 1, female: 1, unknown: 0, pregnancyLoss: 0, stillbirth: 0 },
    }));
    expectCleanPositions(s, '5-uncles');
  });

  it('great-grandparents (5-ish generations upward)', () => {
    const s = baseState();
    s.greatGrandparents = { mat_gf: true, mat_gm: true, pat_gf: true, pat_gm: true };
    expectCleanPositions(s, 'great-grandparents');
  });

  it('proband descendants (gen 4 branch)', () => {
    const s = baseState();
    s.gen4 = [{ id: '_g0', targetPath: 'proband', male: 2, female: 1, unknown: 0 }];
    expectCleanPositions(s, 'gen4');
  });

  it('first-cousin consanguinity', () => {
    const s = baseState();
    s.parents.consanguineous = true;
    s.parents.consanguinityDegree = 'first_cousin';
    s.parents.consanguinityPath = 'mothers_paternal_is_fathers_paternal';
    expectCleanPositions(s, 'consanguinity');
  });

  it('mixed pregnancy losses / stillbirths among siblings', () => {
    const s = baseState();
    s.siblings.male = [{ id: 'm0', age: '20' }];
    s.siblings.pregnancyLoss = 2;
    s.siblings.deceased = 0;
    expectCleanPositions(s, 'losses');
  });
});

describe('layoutPacking — structural guarantees', () => {
  it('siblings of one union occupy a contiguous X-interval not interleaved with other unions', () => {
    const s = baseState();
    s.maternalRelatives.uncles = [{ id: '_mu0', children: { male: 2, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } }];
    const r = positionAudit(s);

    // proband's sibship (U_PARENTS children) vs the uncle's children — their
    // X-intervals must not interleave.
    const groupX = (unionId) => {
      const rel = r.graph.parentChildRelationships.find(p => p.unionId === unionId);
      const xs = rel.children.map(c => r.xPos[c]);
      return { min: Math.min(...xs), max: Math.max(...xs) };
    };
    const parents = groupX('U_PARENTS');
    const uncle = groupX('U_MAT_UNCLE_0');
    // disjoint intervals (one entirely left of the other)
    const disjoint = parents.max < uncle.min || uncle.max < parents.min;
    expect(disjoint).toBe(true);
  });

  it('a couple is positioned reasonably centered over its children', () => {
    const s = baseState();
    s.siblings.male = [{ id: 'a', age: '20' }, { id: 'b', age: '18' }];
    const r = positionAudit(s);
    const kids = ['proband', 'sib_m_0', 'sib_m_1'];
    const kidXs = kids.map(k => r.xPos[k]);
    const kidCenter = (Math.min(...kidXs) + Math.max(...kidXs)) / 2;
    const coupleCenter = (r.xPos['mother'] + r.xPos['father']) / 2;
    // couple center within one node-slot of the children's center
    expect(Math.abs(coupleCenter - kidCenter)).toBeLessThanOrEqual(90);
  });

  it('empty graph produces empty maps without throwing', () => {
    const { xPos, yPos } = computeFamilyBlockLayout({ individuals: [], unions: [], parentChildRelationships: [] });
    expect(xPos).toEqual({});
    expect(yPos).toEqual({});
  });
});
