/**
 * groups.test.js — several people drawn as one symbol, the number inside
 * (NSGC "multiple individuals"; clinician decisions 2026-11-01): a number
 * (2–99) or "n" and a sex (square, circle, diamond) only — no finding,
 * carrier or deceased mark, partner, children or proband; "Tek tek ayır"
 * draws them one by one, "Tek sembolde birleştir" draws chosen siblings as
 * one symbol again.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import * as ops from '../graph/ops';
import { validateDocument, errorsOf } from '../graph/validate';
import { isGroup } from '../graph/model';
import { parseProjectFile, serializeDocument } from '../graph/persistenceV2';
import { toPed } from '../graph/ped';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
beforeEach(() => S().resetPedigree());

const S = () => usePedigreeStore.getState();
const person = (id) => S().doc.graph.individuals.find(i => i.id === id);
const siblingsOf = (id) => S().doc.graph.parentChildRelationships.find(r => r.children.includes(id)).children;

function addBrothers(count = 3) {
  const r = S().addSiblingTo('proband', 'male', { count });
  expect(r.ok, r.reason).toBe(true);
  return siblingsOf('proband').find(c => isGroup(person(c)));
}

describe('several people in one symbol', () => {
  it('three brothers: one square with 3, a sibling of the proband, the graph valid', () => {
    const g = addBrothers(3);
    expect(person(g)).toMatchObject({ sex: 'male', count: 3, label: 'Erkek kardeşler' });
    expect(errorsOf(validateDocument(S().doc))).toEqual([]);
    expect(S().pedigreeData.nodes.find(n => n.id === g)).toBeTruthy();
  });

  it('"n" when the number is not known; a diamond for siblings of mixed or unknown sex', () => {
    expect(S().addSiblingTo('proband', 'unknown', { count: 'n' }).ok).toBe(true);
    const g = siblingsOf('proband').find(c => isGroup(person(c)));
    expect(person(g)).toMatchObject({ sex: 'unknown', count: 'n', label: 'Kardeşler' });
  });

  it('the number typed: 2–99 or n', () => {
    expect(['3', ' 12 ', 'n', 'N', '99'].map(ops.parseGroupCount)).toEqual([3, 12, 'n', 'n', 99]);
    expect(['1', '0', '100', '2,5', 'üç', ''].map(ops.parseGroupCount)).toEqual([null, null, null, null, null, null]);
    expect(S().addSiblingTo('proband', 'male', { count: 1 }).ok).toBe(false);
    expect(S().addSiblingTo('proband', 'male', { count: 120 }).ok).toBe(false);
  });

  it('a number and a sex only: no finding, mark, partner or proband — refused with a plain reason', () => {
    const g = addBrothers(3);
    const before = S().doc;
    for (const r of [
      S().updateIndividual(g, { affected: true }),
      S().updateIndividual(g, { deceased: true }),
      ops.setProband(S().doc, g),
      ops.addPartner(S().doc, g, { sex: 'female' }),
      ops.addChildToPerson(S().doc, g, { sex: 'male' }),
    ]) {
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/Tek tek ayır/);
    }
    expect(S().doc).toBe(before);
    expect(S().setFindingStatus(g, 'Miyop', 'affected').ok).toBe(false);
  });

  it('the number can change; 1 makes one person again', () => {
    const g = addBrothers(3);
    expect(S().setGroupCount(g, 5).ok).toBe(true);
    expect(person(g).count).toBe(5);
    expect(S().setGroupCount(g, 'n').ok).toBe(true);
    expect(S().setGroupCount(g, 0).ok).toBe(false);
    expect(S().setGroupCount(g, 1).ok).toBe(true);
    expect(isGroup(person(g))).toBe(false);
  });

  it('a person with a partner or a finding is not turned into a group', () => {
    expect(S().setGroupCount('mother', 3).ok).toBe(false); // has a partner
  });

  it('"Tek tek ayır": three brothers become three squares in the same place; ids never reused', () => {
    const g = addBrothers(3);
    const at = siblingsOf('proband').indexOf(g);
    const r = S().splitGroup(g);
    expect(r.ok, r.reason).toBe(true);
    const kids = siblingsOf('proband');
    const three = kids.slice(at, at + 3);
    expect(three[0]).toBe(g);
    expect(three.map(id => person(id).sex)).toEqual(['male', 'male', 'male']);
    expect(three.some(id => isGroup(person(id)))).toBe(false);
    expect(new Set(S().doc.graph.individuals.map(i => i.id)).size).toBe(S().doc.graph.individuals.length);
    expect(errorsOf(validateDocument(S().doc))).toEqual([]);
  });

  it('"n" cannot be split until the number is known', () => {
    S().addSiblingTo('proband', 'female', { count: 'n' });
    const g = siblingsOf('proband').find(c => isGroup(person(c)));
    expect(S().splitGroup(g).ok).toBe(false);
  });

  it('survives save and open; a file with a broken group is refused', () => {
    const g = addBrothers(4);
    const text = serializeDocument(S().doc);
    const back = parseProjectFile(text);
    expect(back.ok).toBe(true);
    expect(back.doc.graph.individuals.find(i => i.id === g).count).toBe(4);
    const bad = JSON.parse(text);
    bad.graph.individuals.find(i => i.id === g).affected = true;
    expect(parseProjectFile(JSON.stringify(bad)).ok).toBe(false);
    bad.graph.individuals.find(i => i.id === g).affected = false;
    bad.graph.individuals.find(i => i.id === g).count = 1;
    expect(parseProjectFile(JSON.stringify(bad)).ok).toBe(false);
  });

  it('"Tek sembolde birleştir": split and merged again gives the same symbol, in the same place, selected', () => {
    const g = addBrothers(3);
    const at = siblingsOf('proband').indexOf(g);
    const { created } = S().splitGroup(g);
    const r = S().mergeIntoGroup([...created.childIds].reverse());
    expect(r.ok, r.reason).toBe(true);
    expect(person(g)).toMatchObject({ count: 3, sex: 'male', label: 'Erkek kardeşler' });
    expect(siblingsOf('proband').indexOf(g)).toBe(at);
    for (const id of created.childIds.slice(1)) expect(person(id)).toBeUndefined();
    expect(S().doc.ids.retired).toEqual(expect.arrayContaining(created.childIds.slice(1)));
    expect(S().selectedIds).toEqual([g]);
    expect(errorsOf(validateDocument(S().doc))).toEqual([]);
  });

  it('merging adds the numbers; any "n" gives n; brothers and sisters together give a diamond; notes are kept', () => {
    const g = addBrothers(3);
    S().addSiblingTo('proband', 'female');
    const sister = siblingsOf('proband').at(-1);
    S().updateIndividual(sister, { notes: 'Ankara’da yaşıyor' });
    expect(S().mergeIntoGroup([g, sister]).ok).toBe(true);
    expect(person(g)).toMatchObject({ count: 4, sex: 'unknown', label: 'Kardeşler', notes: 'Ankara’da yaşıyor' });
    S().addSiblingTo('proband', 'unknown', { count: 'n' });
    const n = siblingsOf('proband').find(c => c !== g && isGroup(person(c)));
    expect(S().mergeIntoGroup([g, n]).ok).toBe(true);
    expect(person(g).count).toBe('n');
  });

  it('only children of the same parents, with nothing a symbol with a number cannot show, are merged; refused whole otherwise', () => {
    S().addSiblingTo('proband', 'male');
    const brother = siblingsOf('proband').at(-1);
    const refused = [
      [['proband', brother], /proband/],                // the proband
      [[brother, 'mother'], /aynı anne-babanın/],       // not siblings
      [[brother], /en az iki/],
    ];
    for (const [ids, why] of refused) {
      const r = S().mergeIntoGroup(ids);
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(why);
    }
    S().addSiblingTo('proband', 'male');
    const other = siblingsOf('proband').at(-1);
    S().updateIndividual(other, { age: '12' });
    const r = S().mergeIntoGroup([brother, other]);
    expect(r.reason).toMatch(/Yaşı/);
    S().updateIndividual(other, { age: '' });
    S().addSpouseTo(other, 'female');
    const n = S().doc.graph.individuals.length;
    expect(S().mergeIntoGroup([brother, other]).reason).toMatch(/Eşi/);
    expect(S().doc.graph.individuals.length).toBe(n);
  });

  // moved to screen.test.js: "Tek sembolde birleştir" (the side panel)

  it('undo takes the group away in one step', () => {
    const n = S().doc.graph.individuals.length;
    addBrothers(3);
    S().undo();
    expect(S().doc.graph.individuals.length).toBe(n);
  });

  it('PED files list people one by one: a group is left out, like a pregnancy', () => {
    const g = addBrothers(3);
    const text = toPed(S().doc.graph, S().pedigreeData.nodes);
    expect(text.trim().split('\n')).toHaveLength(7);
    expect(text).not.toContain(g);
  });

  // moved to screen.test.js: the number inside the symbol (marks around a person)

  // moved to screen.test.js: the ring of a numbered symbol, "Birden çok", "Tek tek ayır"
});
