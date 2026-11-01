/**
 * art.test.js — assisted reproduction (NSGC 2022 Figure 5 as corrected in
 * 2025; clinician decisions 2026-11-01): sperm / egg donors, a gestational
 * carrier (G), a surrogate (D, gives the egg and carries). The drawn parents
 * stay the couple; kinship and F follow the genetic parents; a donor added
 * here has no family of their own.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { usePedigreeStore, starterDocument } from '../state/usePedigreeStore';
import { indexGraph, reproMarkOf } from '../graph/model';
import { kinshipOf, personInbreeding, childInbreeding } from '../graph/kinship';
import { validateDocument, errorsOf } from '../graph/validate';
import { parseProjectFile, serializeDocument } from '../graph/persistenceV2';
import { buildTemplate, relationSpec } from '../graph/templates';
import { toPed } from '../graph/ped';
import { computePedigreeIds } from '../utils/pedigreeNumbering';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
beforeEach(() => S().resetPedigree());

const S = () => usePedigreeStore.getState();
const g = () => S().doc.graph;
const person = (id) => g().individuals.find(i => i.id === id);
const valid = () => expect(errorsOf(validateDocument(S().doc))).toEqual([]);
const add = (childId, role, opts) => { const r = S().addReproductiveLink(childId, role, opts); expect(r.ok, r.reason).toBe(true); return r.created.personId; };

describe('donors and carriers', () => {
  it('a sperm donor: a new man beside the parents, "D" in his symbol, the genetic father of that child only', () => {
    const d = add('proband', 'sperm_donor');
    expect(person(d)).toMatchObject({ sex: 'male', relation: 'art_donor', label: 'Sperm donörü' });
    expect(reproMarkOf(g(), d)).toBe('D');
    expect(indexGraph(g()).geneticParents('proband')).toEqual([d, 'mother']);
    S().addChildToUnion('U_PARENTS', 'female');
    const sister = g().parentChildRelationships.find(r => r.unionId === 'U_PARENTS').children.find(c => c !== 'proband');
    expect(indexGraph(g()).geneticParents(sister)).toEqual(['father', 'mother']);
    valid();
  });

  it('egg donor, gestational carrier ("G") and surrogate ("D"): the genetic mother changes only with an egg', () => {
    const egg = add('proband', 'egg_donor');
    expect(indexGraph(g()).geneticParents('proband')).toEqual(['father', egg]);
    const carrier = add('proband', 'gestational_carrier');
    expect(reproMarkOf(g(), carrier)).toBe('G');
    expect(indexGraph(g()).geneticParents('proband')).toEqual(['father', egg]);
    S().resetPedigree();
    const sur = add('proband', 'surrogate');
    expect(reproMarkOf(g(), sur)).toBe('D');
    expect(indexGraph(g()).geneticParents('proband')).toEqual(['father', sur]);
    valid();
  });

  it('one sperm source, one egg source and one carrier per child; the right sex; never a parent or a descendant; never a group', () => {
    add('proband', 'sperm_donor');
    expect(S().addReproductiveLink('proband', 'sperm_donor').ok).toBe(false);
    add('proband', 'egg_donor');
    expect(S().addReproductiveLink('proband', 'surrogate').reason).toMatch(/yumurtası zaten/);
    add('proband', 'gestational_carrier');
    expect(S().addReproductiveLink('proband', 'surrogate').ok).toBe(false);
    S().resetPedigree();
    expect(S().addReproductiveLink('proband', 'gestational_carrier', { personId: 'pat_gf' }).ok).toBe(false); // a man
    expect(S().addReproductiveLink('proband', 'egg_donor', { personId: 'mother' }).ok).toBe(false); // the mother
    S().addChildTo('proband', 'female');
    const daughter = g().parentChildRelationships.find(r => !['U_PARENTS', 'U_PAT_GP', 'U_MAT_GP'].includes(r.unionId)).children[0];
    expect(S().addReproductiveLink('proband', 'surrogate', { personId: daughter }).ok).toBe(false); // a descendant
    S().addSiblingTo('proband', 'male', { count: 3 });
    const group = g().individuals.find(i => i.count).id;
    expect(S().addReproductiveLink(group, 'sperm_donor').ok).toBe(false);
    expect(S().addReproductiveLink('pat_gf', 'sperm_donor').reason).toMatch(/anne-babası/);
  });

  it('a relative may carry: the mother sister as the gestational carrier keeps her own family', () => {
    S().addSiblingTo('mother', 'female');
    const aunt = g().parentChildRelationships.find(r => r.children.includes('mother')).children.find(c => c !== 'mother');
    add('proband', 'gestational_carrier', { personId: aunt });
    expect(reproMarkOf(g(), aunt)).toBe('G');
    expect(indexGraph(g()).geneticParents('proband')).toEqual(['father', 'mother']);
    valid();
  });

  it('a donor added here has no family: parents, partner, siblings and children are refused with the reason', () => {
    const d = add('proband', 'sperm_donor');
    for (const r of [S().addParentsTo(d), S().addSpouseTo(d, 'female'), S().addSiblingTo(d, 'male', { createParents: true }), S().addChildTo(d, 'male')]) {
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/aile öyküsünü not ve bulgu/);
    }
    // notes and findings are fine
    expect(S().updateIndividual(d, { notes: 'Babası 45 yaşında MI' }).ok).toBe(true);
    expect(S().addFinding(d, 'Miyop', null).ok).toBe(true);
  });

  it('taken away: a donor added only for it goes too; one with notes stays; deleting the child or the donor takes the link', () => {
    const d = add('proband', 'sperm_donor');
    expect(S().removeReproductiveLink('proband', d).ok).toBe(true);
    expect(person(d)).toBeUndefined();
    const d2 = add('proband', 'sperm_donor');
    S().updateIndividual(d2, { notes: 'bilgi' });
    S().removeReproductiveLink('proband', d2);
    expect(person(d2)).toBeDefined();
    S().resetPedigree();
    S().addSiblingTo('proband', 'female');
    const sis = g().parentChildRelationships.find(r => r.unionId === 'U_PARENTS').children.find(c => c !== 'proband');
    const egg = add(sis, 'egg_donor');
    S().deleteIndividual(sis);
    expect(g().reproductiveLinks).toEqual([]);
    expect(person(egg)).toBeDefined(); // the clinician deletes a person explicitly, never as a side effect
    valid();
  });
});

describe('genetics follow the genetic parents', () => {
  const cousins = () => {
    const t = buildTemplate(starterDocument(), relationSpec({ father: ['male'], mother: ['male'] }));
    S().openProjectFile(JSON.stringify(t.doc));
  };

  it('first-cousin parents: their own child F = 1/16; a child by donor sperm F = 0; the couple keeps its double line', () => {
    cousins();
    const parents = g().unions.find(u => u.partners.includes('father') && u.partners.includes('mother'));
    expect(childInbreeding(g(), parents.id)).toBe(1 / 16);
    expect(personInbreeding(g(), 'proband')).toBe(1 / 16);
    add('proband', 'sperm_donor');
    expect(personInbreeding(g(), 'proband')).toBe(0);
    expect(g().unions.find(u => u.id === parents.id).consanguineous).toBe(true);
  });

  it('a donor-conceived person marrying a cousin on the donor-replaced side is not related to them', () => {
    // the proband's father's sister's son
    S().addSiblingTo('father', 'female');
    const aunt = g().parentChildRelationships.find(r => r.children.includes('father')).children.find(c => c !== 'father');
    S().addChildTo(aunt, 'female');
    const cousin = g().parentChildRelationships.find(r => r.children.length === 1 && g().unions.find(u => u.id === r.unionId).partners.includes(aunt)).children[0];
    expect(kinshipOf(g(), 'proband', cousin)).not.toBeNull();
    add('proband', 'sperm_donor');
    expect(kinshipOf(g(), 'proband', cousin)).toBeNull();
  });

  it('a PED file is genetic: the sperm donor is the father in it', () => {
    const d = add('proband', 'sperm_donor');
    const nodes = S().pedigreeData.nodes;
    const rows = toPed(g(), nodes).trim().split('\n').map(l => l.split('\t'));
    const ids = computePedigreeIds(nodes);
    const row = rows.find(r => r[1] === ids.get('proband').displayId);
    expect(row[2]).toBe(ids.get(d).displayId);
    expect(row[3]).toBe(ids.get('mother').displayId);
  });
});

describe('kept and refused in files', () => {
  it('survives save and open and undo; a file with a donor who has parents, or a broken link, is refused', () => {
    const d = add('proband', 'egg_donor');
    const text = serializeDocument(S().doc);
    const back = parseProjectFile(text);
    expect(back.ok).toBe(true);
    expect(back.doc.graph.reproductiveLinks).toEqual([{ childId: 'proband', personId: d, role: 'egg_donor' }]);
    const bad = JSON.parse(text);
    bad.graph.parentChildRelationships.find(r => r.unionId === 'U_MAT_GP').children.push(d);
    expect(parseProjectFile(JSON.stringify(bad)).ok).toBe(false);
    const broken = JSON.parse(text);
    broken.graph.reproductiveLinks = [{ childId: 'proband', personId: 'nobody', role: 'egg_donor' }];
    expect(parseProjectFile(JSON.stringify(broken)).ok).toBe(false);
    S().undo();
    expect(g().reproductiveLinks).toEqual([]);
    expect(person(d)).toBeUndefined();
  });
});
