/**
 * pclLayout.test.js — PCL layout engine (src/layout/pcl): solver building
 * blocks, clinical drawing rules, and the quality / performance gates from
 * docs/PEDITREE_LAYOUT_ARCHITECTURE.md that a regression must not slip past.
 */
import { describe, it, expect } from 'vitest';
import { projectLayer, solveSeparatedQP } from '../layout/pcl/qp';
import { computePclLayout } from '../layout/pcl';
import { buildStructure } from '../layout/pcl/structure';
import { CLINICAL_FIXTURES } from '../audit/clinicalFixtures';
import { makeLargePedigree, LARGE_PEDIGREE_CASES } from '../audit/largePedigrees';
import { checkAllInvariants } from '../audit/layoutInvariants';
import { checkConnectorReadability } from '../audit/connectorReadability';
import { auditPedigreeGraph } from '../utils/graphIntegrity';

const xOf = (layout) => new Map(layout.nodes.map(n => [n.id, n.x]));

/** Small DSL for hand-built graphs. */
function graph() {
  const individuals = [], unions = [], parentChildRelationships = [];
  return {
    p(id, sex, generation, extra = {}) { individuals.push({ id, sex, generation, label: id, ...extra }); return id; },
    u(id, a, b, extra = {}) { unions.push({ id, partners: [a, b], status: 'together', ...extra }); return id; },
    kids(unionId, children, extra = {}) { parentChildRelationships.push({ unionId, children, ...extra }); },
    done() { return { individuals, unions, parentChildRelationships }; },
  };
}

describe('qp — exact per-row projection (PAVA)', () => {
  it('leaves a feasible row unchanged', () => {
    expect(projectLayer([0, 100, 250], [100, 100])).toEqual([0, 100, 250]);
  });
  it('projects an infeasible row onto the closest feasible one', () => {
    // two symbols on the same spot, gap 100: split symmetrically
    expect(projectLayer([50, 50], [100])).toEqual([0, 100]);
    const out = projectLayer([0, 10, 20], [100, 100]);
    expect(out[1] - out[0]).toBeCloseTo(100, 9);
    expect(out[2] - out[1]).toBeCloseTo(100, 9);
    expect((out[0] + out[1] + out[2]) / 3).toBeCloseTo(10, 9); // mean preserved
  });
});

describe('qp — separated quadratic program', () => {
  it('centres a couple over its two children while keeping minimum gaps', () => {
    // vars: 0,1 = parents (row 0); 2,3 = children (row 1)
    const layers = [{ ids: [0, 1], gaps: [70] }, { ids: [2, 3], gaps: [100] }];
    const terms = [
      { w: 1, idx: [0, 1, 2, 3], c: [0.5, 0.5, -0.5, -0.5], d: 0 },
      { w: 0.5, idx: [1, 0], c: [1, -1], d: 70 },
      { w: 0.02, idx: [3, 2], c: [1, -1], d: 100 },
      { w: 0.05, idx: [2], c: [1], d: 300 },
    ];
    const { x, converged } = solveSeparatedQP(4, layers, terms, [0, 0, 0, 0]);
    expect(converged).toBe(true);
    expect(x[1] - x[0]).toBeGreaterThanOrEqual(70 - 1e-6);
    expect(x[3] - x[2]).toBeGreaterThanOrEqual(100 - 1e-6);
    expect(Math.abs((x[0] + x[1]) / 2 - (x[2] + x[3]) / 2)).toBeLessThan(1);
  });
});

describe('PCL — clinical stress fixtures', () => {
  for (const f of CLINICAL_FIXTURES) {
    it(`${f.id} ${f.name}: no invariant or readability violation`, () => {
      const g = f.build();
      const full = { ...g, ...computePclLayout(g) };
      expect(checkAllInvariants(full).map(v => v.code)).toEqual([]);
      expect(checkConnectorReadability(full).map(v => v.code)).toEqual([]);
    });
  }

  it('is deterministic', () => {
    for (const f of CLINICAL_FIXTURES) {
      const g = f.build();
      const a = computePclLayout(g), b = computePclLayout(g);
      expect(a.nodes.map(n => [n.id, n.x, n.y])).toEqual(b.nodes.map(n => [n.id, n.x, n.y]));
      expect(a.edges).toEqual(b.edges);
    }
  });

  it('every structural connector names the union that owns it', () => {
    const g = CLINICAL_FIXTURES.find(f => f.id === 'CS-12').build();
    const structural = new Set(['union', 'consanguineousUnion', 'consanguineousUnionUnresolved', 'parentChildDrop', 'sibship', 'childStem']);
    const edges = computePclLayout(g).edges.filter(e => structural.has(e.type));
    expect(edges.length).toBeGreaterThan(0);
    for (const e of edges) expect(g.unions.some(u => u.id === e.unionId)).toBe(true);
  });
});

describe('PCL — birth order', () => {
  // Paternal grandparents with three sons; the father (stored first, as the
  // wizard always does) married the mother, whose parents are drawn too.
  function family(pcrExtra = {}) {
    const b = graph();
    b.p('pgf', 'male', 1); b.p('pgm', 'female', 1); b.u('U_PGP', 'pgf', 'pgm');
    b.p('mgf', 'male', 1); b.p('mgm', 'female', 1); b.u('U_MGP', 'mgf', 'mgm');
    b.p('father', 'male', 2); b.p('uncle1', 'male', 2); b.p('uncle2', 'male', 2);
    b.kids('U_PGP', ['father', 'uncle1', 'uncle2'], pcrExtra);
    b.p('mother', 'female', 2); b.p('aunt', 'female', 2);
    b.kids('U_MGP', ['mother', 'aunt']);
    b.u('U_PARENTS', 'father', 'mother');
    b.p('proband', 'female', 3, { proband: true }); b.kids('U_PARENTS', ['proband']);
    b.p('uncle1_sp', 'female', 2); b.u('U_UNCLE1', 'uncle1', 'uncle1_sp');
    b.p('cousin', 'male', 3); b.kids('U_UNCLE1', ['cousin']);
    return b.done();
  }
  const rowOf = (layout, gen) => layout.nodes.filter(n => n.generation === gen).sort((a, b) => a.x - b.x).map(n => n.id);

  it('unknown birth order: the parent who married into the other family sits at the end of the sibship, beside the spouse', () => {
    const layout = computePclLayout(family());
    const row = rowOf(layout, 2);
    expect(Math.abs(row.indexOf('father') - row.indexOf('mother'))).toBe(1);
    const full = { ...family(), ...layout };
    expect(checkAllInvariants(full)).toEqual([]);
    expect(checkConnectorReadability(full)).toEqual([]);
  });

  it('explicit birth order (PCR.birthOrderExplicit) is drawn exactly as given', () => {
    const g = family({ birthOrderExplicit: true });
    const x = xOf(computePclLayout(g));
    expect(x.get('father')).toBeLessThan(x.get('uncle1'));
    expect(x.get('uncle1')).toBeLessThan(x.get('uncle2'));
  });

  it('known ages are never contradicted (older sibling stays left)', () => {
    const g = family();
    const byId = new Map(g.individuals.map(i => [i.id, i]));
    byId.get('father').age = '60';
    byId.get('uncle1').age = '55';
    // uncle2 has no age: the father may still move past him, never past uncle1
    const S = buildStructure(g);
    const atom = S.atoms[S.personAtom.get('father')];
    for (const arr of atom.arrangements) {
      expect(arr.indexOf('father')).toBeLessThan(arr.indexOf('uncle1'));
    }
    const x = xOf(computePclLayout(g));
    expect(x.get('father')).toBeLessThan(x.get('uncle1'));
  });
});

describe('PCL — realistic large pedigrees (synthetic)', () => {
  for (const c of LARGE_PEDIGREE_CASES) {
    it(`${c.name}: valid graph, no invariant or readability violation`, () => {
      const g = makeLargePedigree(c);
      expect(auditPedigreeGraph(g).filter(i => i.severity === 'error')).toEqual([]);
      const full = { ...g, ...computePclLayout(g) };
      expect(checkAllInvariants(full).map(v => v.code)).toEqual([]);
      expect(checkConnectorReadability(full).map(v => v.code)).toEqual([]);
    }, 30000);
  }

  // Product budgets (PEDITREE brief): 100 people < 500 ms, 300 people < 2 s.
  it('meets the relayout time budgets', () => {
    const budget = { 'realistic-100': 500, 'realistic-300': 2000 };
    for (const c of LARGE_PEDIGREE_CASES.filter(k => budget[k.name])) {
      const g = makeLargePedigree(c);
      computePclLayout(g); // warm-up (JIT)
      const t0 = performance.now();
      computePclLayout(g);
      expect(performance.now() - t0, c.name).toBeLessThan(budget[c.name]);
    }
  }, 60000);
});

describe('PCL — orientation is stable across edits', () => {
  it('adding a spouse and a child to a sibling does not mirror the drawing (seen in the editor)', async () => {
    const { usePedigreeStore } = await import('../state/usePedigreeStore');
    const S = () => usePedigreeStore.getState();
    const prevPacker = process.env.PEDITREE_PACKER;
    delete process.env.PEDITREE_PACKER; // the shipped default engine
    try {
      S().resetPedigree();
      S().updateSiblingCount('male', 2);
      S().updateSiblingCount('female', 1);
      S().updateRelativeCount('maternalRelatives', 'uncles', 1);
      S().updateRelativeChildren('maternalRelatives', 'uncles', 0, 'female', 2);
      S().addSpouseTo('proband', 'female');
      const side = () => {
        const x = xOf(S().pedigreeData);
        return Math.sign(x.get('mother') - x.get('father'));
      };
      const before = side();
      expect(before).toBe(1); // man left of woman: father left, mother right
      S().addSpouseTo('sib_m_0', 'female');
      const uid = S().pedigreeData.unions.find(u => u.partners.includes('sib_m_0')).id;
      S().addChildToUnion(uid, 'male');
      expect(side()).toBe(before);
    } finally {
      if (prevPacker === undefined) delete process.env.PEDITREE_PACKER; else process.env.PEDITREE_PACKER = prevPacker;
    }
  });
});
