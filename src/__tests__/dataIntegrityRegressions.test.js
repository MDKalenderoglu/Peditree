/**
 * dataIntegrityRegressions.test.js — regression tests for the silent data
 * loss / misattribution defects found in the Faz 1 audit
 * (docs/PEDITREE_AUDIT_REPORT.md, DM-2 … DM-8). Each test drives the real
 * store exactly as the UI does.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { auditPedigreeGraph } from '../utils/graphIntegrity';

const S = () => usePedigreeStore.getState();
const ind = (id) => S().pedigreeData.individuals.find(i => i.id === id);
const parentUnionOf = (id) => S().pedigreeData.parentChildRelationships.find(r => r.children.includes(id));
const unionOf = (uid) => S().pedigreeData.unions.find(u => u.id === uid);

beforeEach(() => {
  ['log', 'table', 'warn'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {}));
  S().resetPedigree();
});

describe('DM-2 — ids are never reused (v2: permanent ids)', () => {
  it('a spouse re-added after removing an earlier one is actually created, with a new id', () => {
    S().addSpouseTo('proband', 'female');
    const first = S().lastCreated.spouseId;
    S().updateSiblingCount('male', 1);
    S().addSpouseTo('sib_m_0', 'female');
    S().deleteIndividual(first);
    S().addSpouseTo('proband', 'female');
    const second = S().lastCreated.spouseId;
    const pd = S().pedigreeData;
    expect(second).not.toBe(first);
    expect(pd.unions.some(u => u.partners.includes('proband') && u.partners.includes(second))).toBe(true);
    expect(pd.unions.some(u => u.partners.includes('sib_m_0'))).toBe(true);
    const ids = pd.individuals.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('DM-3 — right-panel age and sex edits survive later rebuilds', () => {
  it('age entered in the editor is kept after an unrelated structural edit', () => {
    S().updateIndividual('mother', { age: '52' });
    S().updateSiblingCount('female', 1);
    expect(ind('mother').age).toBe('52');
  });

  it('a sex correction made in the editor is kept after a rebuild', () => {
    S().addSiblingOfCategory('unknown');
    const sibId = S().pedigreeData.individuals.find(i => i.id.startsWith('sib_u_')).id;
    S().updateIndividual(sibId, { sex: 'female' });
    S().addSiblingOfCategory('male');
    expect(ind(sibId).sex).toBe('female');
  });

  it('editing the proband age in the wizard after an editor edit wins (no stale override)', () => {
    S().updateIndividual('proband', { age: '7' });
    S().updateWizardData('proband', 'age', '8');
    expect(ind('proband').age).toBe('8');
  });
});

describe('DM-4 — deleting one parent keeps the child linked to the other parent', () => {
  it('after deleting the father, the proband is still the mother\'s child', () => {
    S().updateSiblingCount('female', 1);
    S().deleteIndividual('father');
    const rel = parentUnionOf('proband');
    expect(rel).toBeTruthy();
    const u = unionOf(rel.unionId);
    expect(u.partners).toContain('mother');
    expect(parentUnionOf('sib_f_0')?.unionId).toBe(rel.unionId);
    // the replacement partner is an explicit, visibly-unspecified placeholder
    const other = ind(u.partners.find(p => p !== 'mother'));
    expect(other.sex).toBe('unknown');
    expect(other.placeholder).toBe(true);
    expect(auditPedigreeGraph(S().pedigreeData).filter(i => i.severity === 'error')).toEqual([]);
  });

  it('deleting both parents removes the union entirely (children keep no fabricated parents)', () => {
    S().deleteIndividual('father');
    S().deleteIndividual('mother');
    expect(parentUnionOf('proband')).toBeFalsy();
  });

  it('deleting a childless partner still removes the union', () => {
    S().addSpouseTo('proband', 'female');
    const sp = S().lastCreated.spouseId;
    S().deleteIndividual(sp);
    expect(S().pedigreeData.unions.some(u => u.partners.includes('proband'))).toBe(false);
  });
});

describe('DM-5/DM-6 — clinical data never re-attaches to a different (re-added) person', () => {
  it('lowering a count never silently removes a person with clinical data', () => {
    S().updateRelativeCount('maternalRelatives', 'uncles', 3);
    S().updateIndividual('mat_uncle_2', { affected: true, displayLabel: 'Ahmet' });
    S().updateRelativeCount('maternalRelatives', 'uncles', 2);
    expect(S().actionNotice?.message).toMatch(/klinik bilgi/);
    expect(ind('mat_uncle_2')).toMatchObject({ affected: true, displayLabel: 'Ahmet' });
    expect(S().wizardData.maternalRelatives.uncles).toHaveLength(3);
  });

  it('a person removed explicitly and re-added by the count is a new, clean person with a new id', () => {
    S().updateRelativeCount('maternalRelatives', 'uncles', 3);
    S().updateIndividual('mat_uncle_2', { affected: true, displayLabel: 'Ahmet' });
    S().deleteIndividual('mat_uncle_2');
    S().updateRelativeCount('maternalRelatives', 'uncles', 3);
    expect(ind('mat_uncle_2')).toBeUndefined();
    const added = S().wizardData.maternalRelatives.uncles[2];
    expect(added.id).not.toBe('mat_uncle_2');
    expect(ind(added.id).affected).toBe(false);
    expect(ind(added.id).displayLabel || '').toBe('');
  });

  it('a deleted sibling that is later re-created by the count is visible again (as a new person)', () => {
    S().updateSiblingCount('male', 2);
    S().deleteIndividual('sib_m_1');
    expect(S().wizardData.siblings.male).toHaveLength(1);
    S().updateSiblingCount('male', 2);
    expect(S().wizardData.siblings.male).toHaveLength(2);
    expect(ind('sib_m_1')).toBeUndefined();
    expect(S().wizardData.siblings.male.map(s => s.id)).toContain('sib_m_2');
  });
});

describe('DM-7 — union partner sex conflicts are visible to the integrity audit', () => {
  it('a sex change that makes an existing union same-sex is flagged, not silent', () => {
    S().addSpouseTo('proband', 'female');
    S().updateWizardData('proband', 'sex', 'female');
    const codes = S().integrityIssues.map(i => i.code);
    const conflict = codes.includes('UNION_PARTNER_SEX_CONFLICT') || ind('proband').sex === 'male';
    expect(conflict).toBe(true);
  });

  it('the editor refuses a sex change that would create a same-sex union', () => {
    S().addSpouseTo('proband', 'female');
    S().updateIndividual('proband', { sex: 'female' });
    expect(ind('proband').sex).toBe('male');
  });
});

describe('DM-7 — auditPedigreeGraph flags same-sex unions (defense in depth)', () => {
  const g = (sexA, sexB, extraB = {}) => ({
    individuals: [
      { id: 'a', sex: sexA, generation: 1, proband: true },
      { id: 'b', sex: sexB, generation: 1, ...extraB },
    ],
    unions: [{ id: 'U', partners: ['a', 'b'] }],
    parentChildRelationships: [],
  });
  const codes = (graph) => auditPedigreeGraph(graph).map(i => i.code);

  it('flags male + male and female + female', () => {
    expect(codes(g('male', 'male'))).toContain('UNION_PARTNER_SEX_CONFLICT');
    expect(codes(g('female', 'female'))).toContain('UNION_PARTNER_SEX_CONFLICT');
  });

  it('does not flag woman + man, unknown-sex partners, or an unspecified placeholder', () => {
    expect(codes(g('male', 'female'))).not.toContain('UNION_PARTNER_SEX_CONFLICT');
    expect(codes(g('male', 'unknown'))).not.toContain('UNION_PARTNER_SEX_CONFLICT');
    expect(codes(g('male', 'male', { placeholder: true }))).not.toContain('UNION_PARTNER_SEX_CONFLICT');
  });
});

describe('DM-12 — "Doğum Sırası" works for every sibship, not only the wizard-built ones', () => {
  const gens = () => Object.fromEntries(S().pedigreeData.individuals.map(i => [i.id, i.generation]));

  it('moving the father among his brothers reorders the grandparents\' children', () => {
    S().updateRelativeCount('paternalRelatives', 'uncles', 2);
    const before = gens();
    expect(parentUnionOf('father').children.slice(0, 1)).toEqual(['father']);
    S().reorderChild('U_PAT_GP', 'father', 'right');
    const rel = parentUnionOf('father');
    expect(rel.unionId).toBe('U_PAT_GP');
    expect(rel.children.indexOf('father')).toBe(1);
    expect(rel.birthOrderExplicit).toBe(true);
    expect(gens()).toEqual(before);
    expect(auditPedigreeGraph(S().pedigreeData).filter(i => i.severity === 'error')).toEqual([]);
  });

  it('a sibship without a stored order is not marked explicit', () => {
    S().updateRelativeCount('paternalRelatives', 'uncles', 2);
    expect(parentUnionOf('father').birthOrderExplicit).toBeUndefined();
  });

  it('children added by direct graph edits can be reordered too', () => {
    S().addSpouseTo('proband', 'female');
    const uid = S().pedigreeData.unions.find(u => u.partners.includes('proband')).id;
    S().addChildToUnion(uid, 'male');
    S().addChildToUnion(uid, 'female');
    const [first, second] = parentUnionOf(S().pedigreeData.parentChildRelationships.find(r => r.unionId === uid).children[0]).children;
    S().reorderChild(uid, second, 'left');
    expect(S().pedigreeData.parentChildRelationships.find(r => r.unionId === uid).children).toEqual([second, first]);
  });
});

describe('KI-7 — no false "not connected" warnings for people who married into the family', () => {
  const notConnected = () => (S().warnings || []).filter(w => /ebeveyn birliğine|ne bir ebeveyn çiftine/.test(String(w)));

  it('proband with a spouse (childless) and a sibling with spouse and child produce no such warning', () => {
    S().updateSiblingCount('male', 1);
    S().addSpouseTo('proband', 'female');
    S().addSpouseTo('sib_m_0', 'female');
    const uid = S().pedigreeData.unions.find(u => u.partners.includes('sib_m_0')).id;
    S().addChildToUnion(uid, 'male');
    expect(notConnected()).toEqual([]);
  });

  it('a person with neither parents nor partner is still reported', async () => {
    const { validatePedigree } = await import('../utils/validators');
    const w = validatePedigree({
      individuals: [{ id: 'a', sex: 'male', generation: 3, label: 'Ali' }],
      unions: [], parentChildRelationships: [],
    });
    expect(w.some(m => m.includes('Ali') && m.includes('ne bir ebeveyn çiftine'))).toBe(true);
  });
});
