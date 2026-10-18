/**
 * ki8PartnerSide.test.js — KI-8: the side a married-in partner stands on.
 *
 * Defect: a partnership line runs over another partner of one of its two
 * partners (readabilityMetrics.lineOverOwnPartner) — the line reads as if it
 * ended at that person. Causes fixed in src/layout/pcl/structure.js:
 *   1. a married-in spouse's side was fixed (man left) before ordering, so
 *      it could stand between a person and their partner from another family;
 *   2. the married-in partner of a married-in spouse was left out of the
 *      sibship block and appended at the end of the row;
 *   3. founder chains (A–B–C …) beyond one centre were kept in data order.
 * Spouse-side alternatives are offered to the ordering step and chosen by
 * its costs; birth order is never touched.
 *
 * Adversarial scenarios: two or more partners, widowed and remarried,
 * children from different unions, first-cousin marriage, several
 * consanguinity loops, a wide sibship gaining a spouse and a child, nested
 * married-in partners, founder chains, the same family reached by edits in a
 * different order, large dense pedigrees.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { computePclLayout } from '../layout/pcl';
import { readabilityMetrics, checkConnectorReadability } from '../audit/connectorReadability';
import { checkAllInvariants } from '../audit/layoutInvariants';
import { CLINICAL_FIXTURES } from '../audit/clinicalFixtures';
import { displayParentage } from '../graph/model';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });

const S = () => usePedigreeStore.getState();
const drawn = () => S().pedigreeData;
const metrics = (pd) => readabilityMetrics(pd);
const rowOf = (pd, id) => {
  const y = pd.nodes.find(n => n.id === id).y;
  return pd.nodes.filter(n => n.y === y).sort((a, b) => a.x - b.x).map(n => n.id);
};
const adjacent = (pd, a, b) => {
  const row = rowOf(pd, a);
  return Math.abs(row.indexOf(a) - row.indexOf(b)) === 1;
};
const clean = (pd) => {
  const d = { ...displayParentage(pd).graph, nodes: pd.nodes, edges: pd.edges };
  expect(checkAllInvariants(d).map(v => v.code)).toEqual([]);
  expect(checkConnectorReadability(d).map(v => v.code)).toEqual([]);
};
// every sibship drawn in its stored birth order
const birthOrderKept = (pd) => {
  const x = new Map(pd.nodes.map(n => [n.id, n.x]));
  for (const r of pd.parentChildRelationships) {
    if (!r.birthOrderExplicit) continue;
    const xs = r.children.filter(c => x.has(c)).map(c => x.get(c));
    expect(xs).toEqual(xs.slice().sort((a, b) => a - b));
  }
};

describe('KI-8 — the original case', () => {
  function build() {
    S().resetPedigree();
    S().updateWizardData('parents', 'consanguineous', true);
    S().updateWizardData('parents', 'consanguinityDegree', 'first_cousin');
    S().updateWizardData('parents', 'consanguinityPath', 'mothers_maternal_is_fathers_maternal');
    S().updateRelativeCount('maternalRelatives', 'uncles', 1);
    S().updateRelativeCount('paternalRelatives', 'aunts', 1);
    S().addOtherUnion('mother');
    S().updateOtherUnion('mother', 0, 'male', 1);
    const patGP = drawn().parentChildRelationships.find(r => r.children.includes('father')).unionId;
    S().setChildOrder(patGP, ['pat_aunt_0', 'father']);
  }

  it('first-cousin parents stay adjacent; the mother’s second partner stands on her other side', () => {
    build();
    const pd = drawn();
    expect(adjacent(pd, 'mother', 'father')).toBe(true);
    expect(adjacent(pd, 'mother', 'mother_spouse_0')).toBe(true);
    expect(metrics(pd).lineOverOwnPartner).toBe(0);
    clean(pd);
  });

  it('the explicit birth order (aunt before father) is kept', () => {
    build();
    const row = rowOf(drawn(), 'father');
    expect(row.indexOf('pat_aunt_0')).toBeLessThan(row.indexOf('father'));
    birthOrderKept(drawn());
  });

  it('"Yeniden Düzenle" (fresh layout) gives the same arrangement', () => {
    build();
    S().relayout();
    const pd = drawn();
    expect(adjacent(pd, 'mother', 'father')).toBe(true);
    expect(metrics(pd).lineOverOwnPartner).toBe(0);
  });
});

describe('KI-8 — adversarial clinical scenarios', () => {
  it('widowed and remarried: the deceased first husband and the second husband stand on either side of the mother', () => {
    S().resetPedigree();
    S().updateIndividual('father', { deceased: true });
    S().addOtherUnion('mother');
    S().updateOtherUnion('mother', 0, 'male', 1);
    const pd = drawn();
    expect(adjacent(pd, 'mother', 'father')).toBe(true);
    expect(adjacent(pd, 'mother', 'mother_spouse_0')).toBe(true);
    expect(metrics(pd).lineOverOwnPartner).toBe(0);
    clean(pd);
  });

  it('a brother with two married-in wives and children from both: each line short, half-siblings under their own couple', () => {
    S().resetPedigree();
    S().updateSiblingCount('male', 2);
    const sib = S().wizardData.siblings.male[0].id;
    S().addSpouseTo(sib, 'female');
    S().addChildToUnion(S().lastCreated.unionId, 'male');
    S().addSpouseTo(sib, 'female');
    S().addChildToUnion(S().lastCreated.unionId, 'female');
    const pd = drawn();
    expect(metrics(pd).lineOverOwnPartner).toBe(0);
    for (const u of pd.unions.filter(u => u.partners.includes(sib))) {
      const other = u.partners.find(p => p !== sib);
      expect(adjacent(pd, sib, other)).toBe(true);
    }
    clean(pd);
  });

  it('a married-in spouse who has a second partner: that partner stands beside them, not at the end of the row', () => {
    S().resetPedigree();
    S().updateRelativeCount('maternalRelatives', 'uncles', 2);
    S().updateRelativeCount('maternalRelatives', 'aunts', 1);
    S().updateRelativeChildren('maternalRelatives', 'uncles', 0, 'female', 1);
    S().updateRelativeCount('paternalRelatives', 'aunts', 1);
    S().addSpouseTo('mat_uncle_0_sp', 'male');
    const second = S().lastCreated.spouseId;
    const pd = drawn();
    expect(adjacent(pd, 'mat_uncle_0_sp', second)).toBe(true);
    expect(metrics(pd).lineOverOwnPartner).toBe(0);
    clean(pd);
  });

  it('a founder chain A–B–C–D–E (C listed first): each partner stands beside the one they are linked to', () => {
    const ind = (id, sex, generation, extra = {}) => ({ id, sex, generation, label: id, ...extra });
    const g = {
      individuals: [
        ind('C', 'male', 1), ind('D', 'female', 1), ind('A', 'male', 1), ind('B', 'female', 1), ind('E', 'male', 1),
        ind('ab', 'male', 2, { proband: true }), ind('cb', 'female', 2), ind('cd', 'male', 2), ind('de', 'female', 2),
      ],
      unions: [
        { id: 'U_AB', partners: ['A', 'B'] }, { id: 'U_CB', partners: ['C', 'B'] },
        { id: 'U_CD', partners: ['C', 'D'] }, { id: 'U_ED', partners: ['E', 'D'] },
      ],
      parentChildRelationships: [
        { unionId: 'U_AB', children: ['ab'] }, { unionId: 'U_CB', children: ['cb'] },
        { unionId: 'U_CD', children: ['cd'] }, { unionId: 'U_ED', children: ['de'] },
      ],
    };
    const pd = { ...g, ...computePclLayout(g) };
    expect(metrics(pd).lineOverOwnPartner).toBe(0);
    for (const [a, b] of [['A', 'B'], ['C', 'B'], ['C', 'D'], ['E', 'D']]) expect(adjacent(pd, a, b)).toBe(true);
    expect(checkAllInvariants(pd)).toEqual([]);
    expect(checkConnectorReadability(pd)).toEqual([]);
  });

  it('a wide sibship gains a spouse and a child: birth order kept, no line over a partner', () => {
    S().resetPedigree();
    S().updateSiblingCount('male', 4);
    S().updateSiblingCount('female', 3);
    const order = drawn().parentChildRelationships.find(r => r.unionId === 'U_PARENTS').children.slice();
    S().setChildOrder('U_PARENTS', order);
    const mid = S().wizardData.siblings.male[1].id;
    S().addSpouseTo(mid, 'female');
    S().addChildToUnion(S().lastCreated.unionId, 'male');
    const pd = drawn();
    birthOrderKept(pd);
    expect(metrics(pd).lineOverOwnPartner).toBe(0);
    clean(pd);
  });

  it('the same family reached by edits in a different order is drawn with the same arrangement', () => {
    const roles = (first) => {
      S().resetPedigree();
      const steps = {
        partner: () => { S().addSpouseTo('mother', 'male'); return { motherPartner: S().lastCreated.spouseId }; },
        child: () => { S().addChildTo('proband', 'female'); return { probandSpouse: S().lastCreated.spouseId, probandChild: S().lastCreated.childId }; },
      };
      const ids = first === 'partner' ? { ...steps.partner(), ...steps.child() } : { ...steps.child(), ...steps.partner() };
      S().relayout();
      const rename = new Map(Object.entries(ids).map(([role, id]) => [id, role]));
      const pd = drawn();
      expect(metrics(pd).lineOverOwnPartner).toBe(0);
      return [...new Set(pd.nodes.map(n => n.y))].sort((a, b) => a - b)
        .map(y => pd.nodes.filter(n => n.y === y).sort((a, b) => a.x - b.x).map(n => rename.get(n.id) || n.id).join(' '));
    };
    expect(roles('partner')).toEqual(roles('child'));
  });
});

describe('KI-8 — clinical and stress fixtures (fresh layouts)', () => {
  // structurally unavoidable: CS-06 is a man with three partners in one row —
  // one partnership line must pass over another partner
  const CEILING = { 'CS-06': 1 };
  for (const f of CLINICAL_FIXTURES) {
    it(`${f.id} ${f.name}: no partnership line over another partner${CEILING[f.id] ? ' (except the unavoidable one)' : ''}`, () => {
      const g = f.build();
      const pd = { ...g, ...computePclLayout(g) };
      expect(metrics(pd).lineOverOwnPartner).toBeLessThanOrEqual(CEILING[f.id] || 0);
    });
  }
  // measured 2026-10-19 (before KI-8: 1 / 3 / 1)
  const STRESS = { 'ki3-p3-263': 0, 'ki3-p4-387': 1, 'ki3-p5-474': 0 };
  for (const [id, ceiling] of Object.entries(STRESS)) {
    it(`${id}: partnership lines over another partner ≤ ${ceiling}`, () => {
      const g = JSON.parse(readFileSync(join(process.cwd(), 'src/__tests__/regression/ki3', `${id}.json`), 'utf8')).graph;
      expect(metrics({ ...g, ...computePclLayout(g) }).lineOverOwnPartner).toBeLessThanOrEqual(ceiling);
    }, 60000);
  }
});
