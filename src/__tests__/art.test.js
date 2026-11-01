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
import { layoutParentage } from '../layout/pcl/art';
import { checkAllInvariants } from '../audit/layoutInvariants';
import { checkConnectorReadability } from '../audit/connectorReadability';

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

describe('twins share what their pregnancy shares', () => {
  const twins = (zygosity) => {
    S().addMultipleSibling('proband', { sex: 'male', zygosity });
    return g().parentChildRelationships.find(r => r.unionId === 'U_PARENTS').children.find(c => c !== 'proband');
  };
  it('identical twins: a donor or carrier for one is for both; removing it takes it from both', () => {
    const t = twins('monozygotic');
    const d = add('proband', 'sperm_donor');
    expect(indexGraph(g()).geneticParents(t)).toEqual([d, 'mother']);
    S().removeReproductiveLink(t, d);
    expect(g().reproductiveLinks).toEqual([]);
    valid();
  });
  it('fraternal twins: one carrier for both, but a donor only where it is set', () => {
    const t = twins('dizygotic');
    const c = add('proband', 'gestational_carrier');
    add('proband', 'egg_donor');
    expect(g().reproductiveLinks.filter(l => l.personId === c).map(l => l.childId).sort()).toEqual(['proband', t].sort());
    expect(indexGraph(g()).geneticParents(t)).toEqual(['father', 'mother']);
    valid();
  });
  it('twins made after a donor was set get it too; two different donors for identical twins are refused', () => {
    const d = add('proband', 'sperm_donor');
    const r = S().addMultipleSibling('proband', { sex: 'male', zygosity: 'monozygotic' });
    expect(r.ok, r.reason).toBe(true);
    const t = g().parentChildRelationships.find(x => x.unionId === 'U_PARENTS').children.find(c => c !== 'proband');
    expect(indexGraph(g()).geneticParents(t)[0]).toBe(d);
    S().resetPedigree();
    const t2 = twins('dizygotic');
    add('proband', 'sperm_donor');
    add(t2, 'sperm_donor');
    expect(S().setMultipleZygosity('proband', 'monozygotic').ok).toBe(false);
  });
});

describe('drawn: every case of the figure keeps the drawing\'s rules', () => {
  const lay = () => ({ ...layoutParentage(g()), nodes: S().pedigreeData.nodes, edges: S().pedigreeData.edges });
  const at = (id) => S().pedigreeData.nodes.find(n => n.id === id);
  const rowOf = (id) => S().pedigreeData.nodes.filter(n => n.y === at(id).y).sort((a, b) => a.x - b.x).map(n => n.id);
  const cases = {
    'sperm donor': () => add('proband', 'sperm_donor'),
    'egg donor': () => add('proband', 'egg_donor'),
    'double donor': () => { add('proband', 'sperm_donor'); add('proband', 'egg_donor'); },
    'gestational carrier': () => add('proband', 'gestational_carrier'),
    'surrogate': () => add('proband', 'surrogate'),
    'carrier with the couple\'s own children': () => { S().addSiblingTo('proband', 'female'); add('proband', 'gestational_carrier'); },
    'identical twins carried, with a donor': () => { S().addMultipleSibling('proband', { sex: 'male', zygosity: 'monozygotic' }); add('proband', 'gestational_carrier'); add('proband', 'sperm_donor'); },
    'a relative carries': () => { S().addSiblingTo('mother', 'female'); add('proband', 'gestational_carrier', { personId: g().parentChildRelationships.find(r => r.children.includes('mother')).children.find(c => c !== 'mother') }); },
    'a relative donates': () => { S().addSiblingTo('father', 'male'); add('proband', 'sperm_donor', { personId: g().parentChildRelationships.find(r => r.children.includes('father')).children.find(c => c !== 'father') }); },
    'an ongoing pregnancy by donor sperm': () => add(S().addChildToUnion('U_PARENTS', 'unknown', { ongoingPregnancy: true }).created.childId, 'sperm_donor'),
  };
  for (const [name, build] of Object.entries(cases)) {
    it(`${name}: no layout or readability fault, no integrity issue`, () => {
      build();
      expect(checkAllInvariants(lay()).map(v => v.code)).toEqual([]);
      expect(checkConnectorReadability(lay()).map(v => v.code)).toEqual([]);
      // not one issue, warnings included (the layout audit's findings are warnings)
      expect(S().integrityIssues.map(i => i.code)).toEqual([]);
    });
  }
  it('a sperm donor stands beside the father, an egg donor beside the mother — never between the couple; also after a carrier', () => {
    S().addSiblingTo('proband', 'female');
    const sis = g().parentChildRelationships.find(r => r.unionId === 'U_PARENTS').children.find(c => c !== 'proband');
    const carrier = add(sis, 'gestational_carrier'); // the carried child moves under her; its parents must still be found
    const sperm = add(sis, 'sperm_donor');
    const egg = add('proband', 'egg_donor');
    const row = rowOf('mother');
    const [f, m] = [row.indexOf('father'), row.indexOf('mother')];
    expect(Math.abs(f - m)).toBe(1); // nobody between the couple
    const out = (i, from, away) => Math.sign(i - from) === Math.sign(from - away); // on `from`'s side away from `away`
    expect(Math.abs(row.indexOf(sperm) - f)).toBe(1);
    expect(out(row.indexOf(sperm), f, m)).toBe(true);
    // the carrier beside the mother, the egg donor one further out
    expect(Math.abs(row.indexOf(carrier) - m)).toBe(1);
    expect(Math.abs(row.indexOf(egg) - m)).toBe(2);
    expect(out(row.indexOf(carrier), m, f) && out(row.indexOf(egg), m, f)).toBe(true);
  });
  it('a carried child stands under the carrier, her line down to it; the parents\' line and the donor\'s join it', () => {
    const c = add('proband', 'gestational_carrier');
    add('proband', 'sperm_donor');
    expect(at('proband').x).toBeCloseTo(at(c).x, 0);
    const edges = S().pedigreeData.edges;
    const drop = edges.find(e => e.type === 'parentChildDrop' && Math.abs(e.x1 - at(c).x) < 1 && e.y1 === at(c).y + 20);
    expect(drop).toBeTruthy();
    const repro = edges.filter(e => e.type === 'reproLine');
    expect(repro.map(e => e.artKind).sort()).toEqual(['donor', 'parents']);
    expect(repro.every(e => e.x2 === drop.x2 && e.y2 === Math.max(drop.y1, drop.y2))).toBe(true);
    // no relationship line between the carrier or the donor and anyone
    expect(edges.some(e => ['union', 'consanguineousUnion'].includes(e.type) && e.unionId?.startsWith('__art__'))).toBe(false);
  });
});
