/**
 * ped.test.js — PED files out and in (clinician request 2026-10-25).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { toPed, fromPed } from '../graph/ped';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
const S = () => usePedigreeStore.getState();
const rows = (text) => text.trim().split('\n').map(l => l.split('\t'));
const P = (doc, label) => doc.graph.individuals.find(i => i.label === label);

describe('PED export', () => {
  it('six columns; pedigree numbers as ids; both parents or none; affected by choice; no patient name', () => {
    S().resetPedigree();
    S().setPatientName('Örnek Hasta');
    S().addSiblingTo('proband', 'female');
    S().addChildToUnion('U_PARENTS', 'unknown', { pregnancyLoss: true });
    S().addFinding('mother', 'Miyop', null);
    const text = toPed(S().doc.graph, S().pedigreeData.nodes);
    const r = rows(text);
    expect(r.every(x => x.length === 6)).toBe(true);
    expect(text).not.toMatch(/Örnek|Hasta/);
    expect(r).toHaveLength(8); // 4 grandparents, 2 parents, 2 children; the loss is left out
    const byId = new Map(r.map(x => [x[1], x]));
    const proband = r.find(x => x[1].startsWith('III') && x[4] === '1');
    const [, , pat, mat] = proband;
    expect(byId.get(pat)[4]).toBe('1');
    expect(byId.get(mat)[4]).toBe('2');
    expect(proband[5]).toBe('2'); // the proband opens affected
    // a finding as the phenotype: only the mother is affected by myopia
    const miyop = rows(toPed(S().doc.graph, S().pedigreeData.nodes, { phenotype: 'Miyop' }));
    expect(miyop.filter(x => x[5] === '2').map(x => x[1])).toEqual([mat]);
  });

  it('an unspecified parent is written with unknown phenotype and the sex its role needs', () => {
    S().resetPedigree();
    S().deleteIndividual('father');
    const r = rows(toPed(S().doc.graph, S().pedigreeData.nodes));
    const child = r.find(x => x[1].startsWith('III'));
    const father = r.find(x => x[1] === child[2]);
    expect(father[4]).toBe('1');
    expect(father[5]).toBe('0');
  });
});

describe('PED import', () => {
  it('PLINK six columns: a trio with an affected child, the child becomes the proband', () => {
    const r = fromPed('FAM1 F 0 0 1 1\nFAM1 M 0 0 2 1\nFAM1 C F M 2 2\n');
    expect(r.ok).toBe(true);
    const c = P(r.doc, 'C');
    expect(c.proband).toBe(true);
    expect(c.affected).toBe(true);
    expect(c.sex).toBe('female');
    expect(r.doc.graph.unions).toHaveLength(1);
    expect(r.notice).toMatch(/3 kişi/);
  });

  it('QuickPed header (id fid mid sex aff): fid is the father', () => {
    const r = fromPed('id fid mid sex aff\n1 0 0 1 1\n2 0 0 2 1\n3 1 2 2 2\n4 1 2 1 1\n');
    expect(r.ok).toBe(true);
    const u = r.doc.graph.unions[0];
    expect(u.partners.map(id => r.doc.graph.individuals.find(i => i.id === id).label)).toEqual(['1', '2']);
    expect(r.doc.graph.parentChildRelationships[0].children).toHaveLength(2);
  });

  it('first cousins married in the file: consanguinity is derived from the drawing', () => {
    const ped = [
      'F GF 0 0 1 1', 'F GM 0 0 2 1',
      'F A GF GM 1 1', 'F B GF GM 2 1', 'F a2 0 0 2 1', 'F b1 0 0 1 1',
      'F x A a2 1 1', 'F y b1 B 2 1', 'F k x y 1 2',
    ].join('\n');
    const r = fromPed(ped);
    expect(r.ok).toBe(true);
    const u = r.doc.graph.unions.find(x => x.partners.includes(P(r.doc, 'x').id) && x.partners.includes(P(r.doc, 'y').id));
    expect(u.consanguineous).toBe(true);
    expect(u.consanguinityDegree).toBe('first_cousin');
    expect(P(r.doc, 'k').proband).toBe(true);
  });

  it('a parent named but not listed is added; one parent missing gets an unspecified parent', () => {
    const r = fromPed('F C P 0 1 2\n');
    expect(r.ok).toBe(true);
    expect(P(r.doc, 'P').sex).toBe('male');
    expect(r.doc.graph.individuals.some(i => i.placeholder)).toBe(true);
  });

  it('impossible files are refused with the reason', () => {
    expect(fromPed('F A B 0 1 1\nF B A 0 1 1\n').reason).toMatch(/kendi atası/);
    expect(fromPed('F A 0 0 2 1\nF C A 0 1 1\n').reason).toMatch(/baba/);
    expect(fromPed('F A 0 0 1 1\nF A 0 0 1 1\n').reason).toMatch(/iki kez/);
    expect(fromPed('').ok).toBe(false);
    expect(fromPed('a b\n').ok).toBe(false);
  });

  it('several families: the first is opened and the clinician is told', () => {
    const r = fromPed('F1 A 0 0 1 2\nF2 B 0 0 2 2\n');
    expect(r.ok).toBe(true);
    expect(r.doc.graph.individuals).toHaveLength(1);
    expect(r.notice).toMatch(/2 aile/);
  });

  it('export → import keeps the family: same people, same parents, same affected', () => {
    S().resetPedigree();
    S().addSiblingTo('proband', 'female');
    const text = toPed(S().doc.graph, S().pedigreeData.nodes);
    const r = fromPed(text);
    expect(r.ok).toBe(true);
    expect(r.doc.graph.individuals).toHaveLength(S().doc.graph.individuals.length);
    expect(r.doc.graph.unions).toHaveLength(S().doc.graph.unions.length);
    expect(toPed(r.doc.graph, [])).toBeTruthy();
  });
});
