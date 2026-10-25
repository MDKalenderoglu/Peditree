/**
 * graphOps.test.js — schema v2 graph core (src/graph): permanent ids,
 * structural validation, atomic graph operations.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { buildPedigreeFromWizard } from '../builder/pedigreeBuilderFromWizard';
import { baseState } from './helpers';
import { createDocument } from '../graph/document';
import { allocateId, allocateEditNumber, emptyIds, retire } from '../graph/ids';
import { validateDocument, validateGraphStructure, errorsOf } from '../graph/validate';
import { indexGraph } from '../graph/model';
import * as ops from '../graph/ops';

beforeAll(() => {
  ['log', 'warn', 'table'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {}));
});

function starterDoc(mutateState) {
  const s = baseState();
  if (mutateState) mutateState(s);
  return createDocument(buildPedigreeFromWizard(s));
}
const person = (doc, id) => doc.graph.individuals.find(i => i.id === id);
const union = (doc, id) => doc.graph.unions.find(u => u.id === id);
const kidsOf = (doc, uid) => doc.graph.parentChildRelationships.find(r => r.unionId === uid)?.children || [];
const ok = (r) => { expect(r.reason).toBeUndefined(); expect(r.ok).toBe(true); return r; };

describe('permanent ids', () => {
  it('never hands out a live or retired id again', () => {
    const g = { individuals: [{ id: 'sib_m_0' }, { id: 'sib_m_1' }], unions: [] };
    let ids = retire(emptyIds(), ['sib_m_2']);
    const a = allocateId(ids, g, 'sib_m_');
    expect(a.id).toBe('sib_m_3');
    ids = a.ids;
    expect(allocateId(ids, { individuals: [], unions: [] }, 'sib_m_').id).toBe('sib_m_4');
  });
  it('one edit number is shared by the ids an action creates together', () => {
    const g = { individuals: [{ id: 'de_sp_4' }], unions: [{ id: 'U_DE_LINK_6' }] };
    expect(allocateEditNumber(emptyIds(), g).n).toBe(7);
  });
});

describe('structural validation', () => {
  it('the wizard starter graph is valid', () => {
    expect(errorsOf(validateDocument(starterDoc()))).toEqual([]);
  });
  it('detects an ancestry cycle', () => {
    const g = {
      individuals: [{ id: 'a', sex: 'male' }, { id: 'b', sex: 'female' }, { id: 'c', sex: 'male' }],
      unions: [{ id: 'U1', partners: ['a', 'b'] }, { id: 'U2', partners: ['c', 'b'] }],
      parentChildRelationships: [{ unionId: 'U1', children: ['c'] }, { unionId: 'U2', children: ['a'] }],
    };
    expect(validateGraphStructure(g).map(i => i.code)).toContain('ANCESTRY_CYCLE');
  });
  it('detects a duplicate partnership and a reused retired id', () => {
    const g = {
      individuals: [{ id: 'a', sex: 'male' }, { id: 'b', sex: 'female' }],
      unions: [{ id: 'U1', partners: ['a', 'b'] }, { id: 'U2', partners: ['b', 'a'] }],
      parentChildRelationships: [],
    };
    const codes = validateGraphStructure(g, { retired: ['a'] }).map(i => i.code);
    expect(codes).toContain('DUPLICATE_PARTNERSHIP');
    expect(codes).toContain('RETIRED_ID_REUSED');
  });
});

describe('graph operations', () => {
  it('a refused operation returns the identical, untouched document', () => {
    const doc = starterDoc();
    const snapshot = JSON.stringify(doc);
    const r = ops.addPartner(doc, 'proband', { sex: 'male' }); // proband is male: same-sex
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/kadın ve erkek/);
    expect(r.doc).toBe(doc);
    expect(JSON.stringify(doc)).toBe(snapshot);
  });

  it('a change that would introduce a structural error is refused by commit', () => {
    const doc = starterDoc();
    const r = ops.commit(doc, (d) => {
      // make the father a child of the proband's parents: ancestry cycle
      d.graph.parentChildRelationships.find(x => x.unionId === 'U_PARENTS').children.push('father');
      d.graph.parentChildRelationships.find(x => x.unionId === 'U_PAT_GP').children =
        kidsOf(d, 'U_PAT_GP').filter(c => c !== 'father');
    });
    expect(r.ok).toBe(false);
    expect(r.doc).toBe(doc);
  });

  it('addPartner + addChild create permanent ids, correct generations and links', () => {
    let doc = starterDoc();
    const r1 = ok(ops.addPartner(doc, 'proband', { sex: 'female' }));
    doc = r1.doc;
    const { spouseId, unionId } = r1.created;
    expect(spouseId).toBe('de_sp_0');
    expect(unionId).toBe('U_DE_0');
    expect(person(doc, spouseId).generation).toBe(person(doc, 'proband').generation);
    const r2 = ok(ops.addChild(doc, unionId, { sex: 'male' }));
    doc = r2.doc;
    expect(r2.created.childId).toBe('de_ch_1');
    expect(person(doc, 'de_ch_1').generation).toBe(person(doc, 'proband').generation + 1);
    expect(kidsOf(doc, unionId)).toEqual(['de_ch_1']);
  });

  it('a removed person\'s id is retired and never reused', () => {
    let doc = starterDoc();
    doc = ok(ops.addPartner(doc, 'proband', { sex: 'female' })).doc;
    doc = ok(ops.removePerson(doc, 'de_sp_0')).doc;
    expect(person(doc, 'de_sp_0')).toBeUndefined();
    expect(union(doc, 'U_DE_0')).toBeUndefined();
    expect(doc.ids.retired).toEqual(expect.arrayContaining(['de_sp_0', 'U_DE_0']));
    const again = ok(ops.addPartner(doc, 'proband', { sex: 'female' }));
    expect(again.created.spouseId).toBe('de_sp_1');
  });

  it('removing a parent keeps the children linked to the other parent (placeholder)', () => {
    const doc = ok(ops.removePerson(starterDoc(), 'father')).doc;
    const u = union(doc, 'U_PARENTS');
    expect(u.partners).toContain('mother');
    expect(u.partners).toContain('U_PARENTS__unspecified');
    expect(person(doc, 'U_PARENTS__unspecified').placeholder).toBe(true);
    expect(kidsOf(doc, 'U_PARENTS')).toContain('proband');
    expect(ops.removePerson(doc, 'proband').ok).toBe(false); // proband protected
    // removing the remaining real parent removes the union (children keep no parents)
    const both = ok(ops.removePerson(doc, 'mother')).doc;
    expect(union(both, 'U_PARENTS')).toBeUndefined();
    expect(person(both, 'U_PARENTS__unspecified')).toBeUndefined();
    expect(person(both, 'proband')).toBeTruthy();
  });

  it('addParents with only a mother creates an unspecified co-parent', () => {
    let doc = ok(ops.addPartner(starterDoc(), 'proband', { sex: 'female' })).doc;
    const r = ok(ops.addParents(doc, 'de_sp_0', { onlyMother: true }));
    doc = r.doc;
    expect(person(doc, r.created.parent1Id).sex).toBe('female');
    expect(person(doc, r.created.parent2Id).label).toMatch(/belirtilmedi/);
    expect(kidsOf(doc, r.created.unionId)).toEqual(['de_sp_0']);
    expect(ops.addParents(doc, 'de_sp_0').ok).toBe(false); // already has parents
  });

  it('addSibling attaches to the existing parent union; refused without parents', () => {
    let doc = starterDoc();
    const r = ok(ops.addSibling(doc, 'proband', { sex: 'female' }));
    doc = r.doc;
    expect(kidsOf(doc, 'U_PARENTS')).toContain(r.created.childId);
    doc = ok(ops.addPartner(doc, 'proband', { sex: 'female' })).doc;
    const spouse = doc.graph.individuals.find(i => i.relation === 'spouse_direct').id;
    expect(ops.addSibling(doc, spouse, { sex: 'male' }).ok).toBe(false);
  });

  it('makeSiblings fabricates shared parents and refuses two different parent unions', () => {
    let doc = starterDoc(s => {
      s.siblings.female = [{ id: 'f', age: '' }];
      s.maternalRelatives.uncles = [{ id: 'u', children: { male: 0, female: 1, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } }];
    });
    doc = ok(ops.addPartner(doc, 'proband', { sex: 'female' })).doc;   // de_sp_0, gen 3, no parents
    doc = ok(ops.addPartner(doc, 'sib_f_0', { sex: 'male' })).doc;     // de_sp_1, gen 3, no parents
    const r = ok(ops.makeSiblings(doc, 'de_sp_0', 'de_sp_1'));
    const kids = kidsOf(r.doc, r.created.unionId);
    expect(kids).toEqual(expect.arrayContaining(['de_sp_0', 'de_sp_1']));
    expect(person(r.doc, 'cc_2_f').generation).toBe(person(r.doc, 'proband').generation - 1);
    const refused = ops.makeSiblings(r.doc, 'proband', 'mat_uncle_0_cf_0');
    expect(refused.ok).toBe(false);
    expect(refused.doc).toBe(r.doc);
  });

  it('a union declared consanguineous is drawn as supported only with real shared ancestors', () => {
    let doc = starterDoc(s => {
      s.maternalRelatives.uncles = [{ id: 'u', children: { male: 0, female: 1, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } }];
    });
    // proband (male) × his maternal first cousin (female): shared grandparents exist
    const r = ok(ops.linkPartners(doc, 'proband', 'mat_uncle_0_cf_0', { markConsanguineous: true }));
    doc = r.doc;
    expect(union(doc, r.created.unionId).consanguinityStatus).toBe('known_supported');
    expect(union(doc, r.created.unionId).relationshipBackground).toBe('consanguinity_structurally_supported');
    // proband × an unrelated spouse declared consanguineous: unresolved
    let doc2 = ok(ops.addPartner(starterDoc(), 'proband', { sex: 'female' })).doc;
    doc2 = ok(ops.setRelationshipBackground(doc2, 'U_DE_0', 'consanguinity_reported')).doc;
    expect(union(doc2, 'U_DE_0').consanguinityStatus).toBe('reported_unresolved');
  });

  it('updatePerson refuses a sex change that would make a partnership same-sex', () => {
    const doc = starterDoc();
    const r = ops.updatePerson(doc, 'mother', { sex: 'male' });
    expect(r.ok).toBe(false);
    const r2 = ok(ops.updatePerson(doc, 'mother', { age: '52', affected: true, id: 'hack', proband: true }));
    expect(person(r2.doc, 'mother').age).toBe('52');
    expect(person(r2.doc, 'mother').affected).toBe(true);
    expect(person(r2.doc, 'mother').proband).toBe(false); // protected field
    expect(person(r2.doc, 'hack')).toBeUndefined();
  });

  it('setProband keeps exactly one proband', () => {
    const doc = ok(ops.setProband(starterDoc(), 'mother')).doc;
    expect(doc.graph.individuals.filter(i => i.proband).map(i => i.id)).toEqual(['mother']);
  });

  it('children follow age (oldest first); a hand-set order is kept until an age is entered', () => {
    let doc = starterDoc(s => { s.siblings.male = [{ id: 'a', age: '' }, { id: 'b', age: '' }]; });
    // the policy v1 applied to the proband's sibship (set by migrateV1ToV2)
    doc.graph.parentChildRelationships.find(r => r.unionId === 'U_PARENTS').orderPolicy = 'byAge';
    doc = ok(ops.updatePerson(doc, 'sib_m_1', { age: '40' })).doc;
    expect(kidsOf(doc, 'U_PARENTS')[0]).toBe('sib_m_1');
    doc = ok(ops.setChildOrder(doc, 'U_PARENTS', ['proband', 'sib_m_0', 'sib_m_1'])).doc;
    expect(kidsOf(doc, 'U_PARENTS')).toEqual(['proband', 'sib_m_0', 'sib_m_1']);
    // other edits leave the hand-set order alone
    doc = ok(ops.updatePerson(doc, 'sib_m_0', { label: 'Ağabey' })).doc;
    expect(kidsOf(doc, 'U_PARENTS')).toEqual(['proband', 'sib_m_0', 'sib_m_1']);
    // entering an age sorts the aged siblings (clinician request 2026-10-25)
    doc = ok(ops.updatePerson(doc, 'sib_m_0', { age: '50' })).doc;
    expect(kidsOf(doc, 'U_PARENTS')).toEqual(['sib_m_0', 'sib_m_1', 'proband']);
    expect(doc.graph.parentChildRelationships.find(r => r.unionId === 'U_PARENTS').birthOrderExplicit).toBe(true);
  });

  it('social parenthood is separate from biological parenthood', () => {
    let doc = ok(ops.addPartner(starterDoc(), 'proband', { sex: 'female' })).doc;
    doc = ok(ops.addParents(doc, 'de_sp_0')).doc; // biological parents of the spouse
    // the spouse is also raised by her aunt's family: adoptive link to another union
    doc = ok(ops.addPartner(doc, 'de_par_1_1', { sex: 'male' })).doc;
    const adoptive = doc.graph.unions.find(u => u.partners.includes('de_par_1_1') && u.id !== 'U_DE_PARENTS_1').id;
    doc = ok(ops.addSocialParentLink(doc, 'de_sp_0', adoptive, 'adoptive')).doc;
    const idx = indexGraph(doc.graph);
    expect(idx.bioParentUnion.get('de_sp_0')).toBe('U_DE_PARENTS_1');
    expect(doc.graph.socialParentLinks).toEqual([{ childId: 'de_sp_0', unionId: adoptive, kind: 'adoptive' }]);
    expect(ops.addSocialParentLink(doc, 'de_sp_0', 'U_DE_PARENTS_1', 'adoptive').ok).toBe(false); // = biological
    expect(ops.addSocialParentLink(doc, 'de_sp_0', adoptive, 'xyz').ok).toBe(false);
    // the adoptive couple is the spouse's own mother and her new partner:
    // removing him removes the link with the union (the mother is her
    // biological parent already — audit 2026-10-25)
    doc = ok(ops.removePerson(doc, doc.graph.unions.find(u => u.id === adoptive).partners.find(p => p !== 'de_par_1_1'))).doc;
    expect(doc.graph.socialParentLinks).toEqual([]);
  });
});
