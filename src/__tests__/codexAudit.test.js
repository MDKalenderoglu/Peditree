/**
 * codexAudit.test.js — the findings of the Codex read-only audit
 * (2026-11-01), each reproduced first and kept as a behaviour test: the
 * mark audit keeps the open family; PED keeps "unknown", refuses invalid
 * codes and invents no proband; validation refuses sibling couples,
 * pregnancies with partners or children, invalid clinical fields and a
 * childless mark beside children; a broken session is reported.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { runMarkAudit } from '../audit/markCollisions';
import { fromPed, toPed } from '../graph/ped';
import { computePclLayout } from '../layout/pcl/index';
import * as ops from '../graph/ops';
import { parseProjectFile, serializeDocument, loadDocument, BROKEN_SESSION_KEY } from '../graph/persistenceV2';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
beforeEach(() => S().resetPedigree());

const S = () => usePedigreeStore.getState();
const g = () => S().doc.graph;

function fakeStorage(entries = {}) {
  const m = new Map(Object.entries(entries));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), dump: () => Object.fromEntries(m) };
}

describe('1 — the mark audit puts the open family back', () => {
  it('document, undo history, selection and the saved session are as before, also when measuring fails', async () => {
    S().addSiblingTo('proband', 'female');
    S().updateIndividual('mother', { notes: 'hasta notu' });
    S().selectIndividual('mother');
    const before = S();
    const ss = fakeStorage({ 'clinical_pedigree_app.session.v2': '{"saved":"family"}' });
    const found = await runMarkAudit(usePedigreeStore, { measure: () => 'measured', storage: ss, settle: 0 });
    expect(found).toBe('measured');
    expect(S().doc).toBe(before.doc);
    expect(S()._history).toBe(before._history);
    expect(S().selectedIds).toEqual(before.selectedIds);
    expect(ss.dump()).toEqual({ 'clinical_pedigree_app.session.v2': '{"saved":"family"}' });
    await expect(runMarkAudit(usePedigreeStore, { measure: () => { throw new Error('boom'); }, storage: ss, settle: 0 })).rejects.toThrow('boom');
    expect(S().doc).toBe(before.doc);
    expect(g().individuals.find(i => i.id === 'mother').notes).toBe('hasta notu');
  });
});

describe('2, 9 — PED files', () => {
  const people = (doc) => doc.graph.individuals.filter(i => !i.placeholder);
  const out = (doc) => toPed(doc.graph, computePclLayout(doc.graph).nodes).trim().split('\n').map(l => l.split('\t'));

  it('"unknown" (0 or -9) stays unknown through open and download; it is never written as unaffected', () => {
    const r = fromPed('F A 0 0 1 0\nF B 0 0 2 -9\nF C 0 0 1 1\nF D 0 0 2 2\n');
    expect(r.ok, r.reason).toBe(true);
    expect(out(r.doc).map(c => c[5]).sort()).toEqual(['0', '0', '1', '2']);
    expect(r.notice).toMatch(/2 kişinin hastalık durumu bilinmiyor/);
  });

  it('a code that is not 0, -9, 1 or 2 is refused, naming the person', () => {
    const r = fromPed('F A 0 0 1 banana\n');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/"A".*"banana"/);
  });

  it('nobody affected: no proband is invented; with an affected person, that person is the proband', () => {
    const none = fromPed('F A 0 0 1 1\nF B 0 0 2 1\nF C A B 1 1\n');
    expect(none.ok, none.reason).toBe(true);
    expect(people(none.doc).filter(i => i.proband)).toEqual([]);
    expect(none.notice).toMatch(/proband işaretlenmedi/);
    const one = fromPed('F A 0 0 1 1\nF B 0 0 2 1\nF C A B 1 2\n');
    expect(people(one.doc).filter(i => i.proband).map(i => i.label)).toEqual(['C']);
  });

  it('a parent named but not listed has an unknown status, not "unaffected"', () => {
    const r = fromPed('F C A B 1 2\n');
    const parents = people(r.doc).filter(i => i.label === 'A' || i.label === 'B');
    expect(parents.every(p => (p.conditions || []).some(c => c.status === 'unknown'))).toBe(true);
  });
});

describe('5, 6, 7, 10 — rules held in the data, not only in the menus', () => {
  const file = (mut) => { const d = JSON.parse(serializeDocument(S().doc)); mut(d); return parseProjectFile(JSON.stringify(d)); };
  const mother = (d) => d.graph.individuals.find(i => i.id === 'mother');
  const sister = () => { S().addSiblingTo('proband', 'female'); return g().parentChildRelationships.find(r => r.children.includes('proband')).children.find(c => c !== 'proband'); };

  it('5: a file with an unknown sex, a non-yes/no mark, two pregnancy kinds or a meaningless finding is refused', () => {
    expect(file(d => { mother(d).sex = 'alien'; }).ok).toBe(false);
    expect(file(d => { mother(d).affected = 'evet'; }).ok).toBe(false);
    expect(file(d => { mother(d).conditions = [{ label: 'X', status: 'banana' }]; }).ok).toBe(false);
    S().addChildTo('proband', 'unknown', { pregnancyLoss: true });
    expect(file(d => { d.graph.individuals.find(i => i.pregnancyLoss).stillbirth = true; }).ok).toBe(false);
    // an older record's finding without a status still opens
    expect(file(d => { mother(d).conditions = [{ id: 'c1', label: 'Talasemi' }]; }).ok).toBe(true);
  });

  it('6: a pregnancy outcome never gets a partner or children, by any operation', () => {
    S().addChildTo('proband', 'male', { ongoingPregnancy: true });
    const fetus = g().individuals.find(i => i.ongoingPregnancy).id;
    expect(ops.addPartner(S().doc, fetus, { sex: 'female' }).ok).toBe(false);
    expect(ops.linkPartners(S().doc, fetus, 'mat_gm').ok).toBe(false);
    S().addSpouseTo('proband', 'female');
    const wife = g().unions.find(u => u.partners.includes('proband')).partners.find(p => p !== 'proband');
    expect(ops.updatePerson(S().doc, wife, { pregnancyLoss: true }).reason).toMatch(/gebelik sonucunun/);
  });

  it('7: siblings are never partners — not by the operation with a consanguinity flag, not in a file', () => {
    const sis = sister();
    expect(ops.linkPartners(S().doc, 'proband', sis, { markConsanguineous: true }).ok).toBe(false);
    const r = file(d => d.graph.unions.push({ id: 'U_SIB', partners: ['proband', sis], status: 'together', consanguineous: true, consanguinityStatus: 'known_supported', relationshipBackground: 'consanguinity_reported' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Kardeşler eş olamaz/);
  });

  it('10: a child added to a childless couple takes the "childless / infertile" mark away; an older file is cleaned on opening', () => {
    S().addSpouseTo('proband', 'female');
    const u = g().unions.find(x => x.partners.includes('proband')).id;
    S().setChildlessness(u, 'infertile', 'azospermi');
    S().addChildToUnion(u, 'male');
    expect(g().unions.find(x => x.id === u).childless).toBeUndefined();
    const d = JSON.parse(serializeDocument(S().doc));
    d.graph.unions.find(x => x.id === u).childless = 'by_choice';
    const r = parseProjectFile(JSON.stringify(d));
    expect(r.ok).toBe(true);
    expect(r.doc.graph.unions.find(x => x.id === u).childless).toBeUndefined();
    expect(r.normalizations.join(' ')).toMatch(/çocuksuz/);
  });
});

describe('8 — a broken session is reported, and kept apart', () => {
  it('a stored pedigree that fails the file checks is not opened as valid: the clinician is told, the record is kept', () => {
    const d = JSON.parse(serializeDocument(S().doc));
    d.graph.individuals = [null];
    const raw = JSON.stringify(d);
    const ss = fakeStorage({ 'clinical_pedigree_app.session.v2': raw });
    vi.stubGlobal('window', { sessionStorage: ss, localStorage: ss });
    try {
      const r = loadDocument();
      expect(r.doc).toBeNull();
      expect(r.notice).toMatch(/açılamadı.*Kayıt silinmedi/);
      expect(ss.getItem(BROKEN_SESSION_KEY)).toBe(raw);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a good stored pedigree still opens', () => {
    S().addSiblingTo('proband', 'female');
    const ss = fakeStorage({ 'clinical_pedigree_app.session.v2': serializeDocument(S().doc) });
    vi.stubGlobal('window', { sessionStorage: ss, localStorage: ss });
    try {
      const r = loadDocument();
      expect(r.source).toBe('v2');
      expect(r.doc.graph.individuals.length).toBe(g().individuals.length);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
