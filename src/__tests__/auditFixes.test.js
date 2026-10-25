/**
 * auditFixes.test.js — findings of the read-only audit (2026-10-25), each
 * reproduced before it was fixed:
 *   #1 consanguinity derived from shared ancestors goes when they go;
 *   #6 an "affected" set by hand survives findings changing;
 *   #4 the patient's name is not undone with a graph edit;
 *   #7 removing a social parent keeps the child's link to the other one;
 *   #9 the age at death is shown without an age;
 *   #10 long key / note text is wrapped, never cut.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { usePedigreeStore, needsLeaveWarning } from '../state/usePedigreeStore';
import { annotationAge } from '../utils/annotations';
import { packLines } from '../utils/textWrap';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });

const S = () => usePedigreeStore.getState();
const P = (id) => S().doc.graph.individuals.find(i => i.id === id);
const sibsOf = (id) => S().doc.graph.parentChildRelationships.find(r => r.children.includes(id)).children;
const errors = () => (S().integrityIssues || []).filter(i => i.severity === 'error');

/** proband married to a first cousin (the mother's sister's daughter) */
function cousinMarriage() {
  S().resetPedigree();
  S().addSiblingTo('mother', 'female');
  const aunt = sibsOf('mother').find(c => c !== 'mother');
  S().addChildTo(aunt, 'female');
  const kidsUnion = S().doc.graph.unions.find(u => u.partners.includes(aunt));
  const cousin = S().doc.graph.parentChildRelationships.find(r => r.unionId === kidsUnion.id).children[0];
  S().createUnionBetween('proband', cousin);
  const union = () => S().doc.graph.unions.find(u => u.partners.includes('proband') && u.partners.includes(cousin));
  return { cousin, union };
}

describe('#1 consanguinity follows the shared ancestors', () => {
  it('drawn first cousins are consanguineous; removing both shared grandparents takes it away', () => {
    const { union } = cousinMarriage();
    expect(union().consanguineous).toBe(true);
    expect(union().consanguinityDegree).toBe('first_cousin');
    const gp = S().doc.graph.unions.find(u => u.id === 'U_MAT_GP').partners;
    gp.forEach(id => S().deleteIndividual(id));
    expect(union().consanguineous).toBe(false);
    expect(union().consanguinityStatus).toBe('none');
    expect(errors()).toEqual([]);
  });

  it('a consanguinity the clinician declared stays (reported) when there are no shared ancestors', () => {
    S().resetPedigree();
    S().setUnionRelationshipBackground('U_PARENTS', 'consanguinity_reported');
    const u = S().doc.graph.unions.find(x => x.id === 'U_PARENTS');
    expect(u.consanguineous).toBe(true);
    expect(u.consanguinityStatus).toBe('reported_unresolved');
  });

  it('declared first, then drawn, then the drawing removed: the declaration stays', () => {
    const { union } = cousinMarriage();
    S().setUnionRelationshipBackground(union().id, 'consanguinity_reported');
    S().doc.graph.unions.find(u => u.id === 'U_MAT_GP').partners.forEach(id => S().deleteIndividual(id));
    expect(union().consanguineous).toBe(true);
    expect(union().consanguinityStatus).toBe('reported_unresolved');
  });

  it('undo brings the derived consanguinity back', () => {
    const { union } = cousinMarriage();
    const [a, b] = S().doc.graph.unions.find(u => u.id === 'U_MAT_GP').partners;
    S().deleteIndividual(a);
    S().deleteIndividual(b);
    S().undo();
    S().undo();
    expect(union().consanguineous).toBe(true);
  });
});

describe('#6 a hand-set "affected" is never erased by findings', () => {
  it('affected by hand, a finding added then made carrier: still affected', () => {
    S().resetPedigree();
    S().updateIndividual('mother', { affected: true });
    S().addFinding('mother', 'Bulgu X', null);
    S().setFindingStatus('mother', 'Bulgu X', 'carrier');
    expect(P('mother').affected).toBe(true);
    S().setFindingStatus('mother', 'Bulgu X', 'none');
    expect(P('mother').affected).toBe(true);
  });

  it('affected only because of a finding: removing the finding clears it', () => {
    S().resetPedigree();
    S().addFinding('mother', 'Bulgu X', null);
    expect(P('mother').affected).toBe(true);
    S().setFindingStatus('mother', 'Bulgu X', 'carrier');
    expect(P('mother').affected).toBe(false);
  });

  it('a hand toggle after a finding takes over', () => {
    S().resetPedigree();
    S().addFinding('mother', 'Bulgu X', null);
    S().updateIndividual('mother', { affected: true }); // confirmed by hand
    S().setFindingStatus('mother', 'Bulgu X', 'none');
    expect(P('mother').affected).toBe(true);
  });
});

describe('#4 the patient name is not undone with the family', () => {
  it('undo and redo keep the latest name', () => {
    S().resetPedigree();
    S().setPatientName('Örnek A');
    S().updateIndividual('proband', { age: '5' });
    S().setPatientName('Örnek B');
    S().undo();
    expect(S().doc.patientName).toBe('Örnek B');
    expect(P('proband').age).toBeFalsy();
    S().redo();
    expect(S().doc.patientName).toBe('Örnek B');
    expect(P('proband').age).toBe('5');
  });
});

describe('#7 removing a social parent', () => {
  /** the mother remarried; `kid` is linked to the new couple by a social link of `kind` */
  function setup(kind, { onlySocial }) {
    S().resetPedigree();
    S().addSpouseTo('mother', 'male');
    const doc = JSON.parse(JSON.stringify(S().doc));
    const u2 = doc.graph.unions.find(u => u.partners.includes('mother') && u.id !== 'U_PARENTS');
    let kid;
    if (onlySocial) {
      kid = 'adopted_1';
      doc.graph.individuals.push({ ...doc.graph.individuals.find(i => i.id === 'proband'), id: kid, proband: false, label: 'Evlatlık', affected: false });
    } else {
      kid = 'proband';
    }
    doc.graph.socialParentLinks.push({ childId: kid, unionId: u2.id, kind });
    S().openProjectFile(JSON.stringify(doc));
    expect(S().doc.graph.socialParentLinks).toHaveLength(1);
    return { kid, u2, stepFather: u2.partners.find(p => p !== 'mother') };
  }

  it('an adopted child (only adoptive parents) stays with the remaining adoptive parent', () => {
    const { kid, stepFather } = setup('adoptive', { onlySocial: true });
    S().deleteIndividual(stepFather);
    const links = S().doc.graph.socialParentLinks.filter(l => l.childId === kid);
    expect(links).toHaveLength(1);
    expect(S().doc.graph.unions.find(u => u.id === links[0].unionId).partners).toContain('mother');
    expect(errors()).toEqual([]);
  });

  it('a step link goes with the step-parent (the remaining partner is the child’s own parent)', () => {
    const { stepFather, u2 } = setup('step', { onlySocial: false });
    S().deleteIndividual(stepFather);
    expect(S().doc.graph.socialParentLinks).toEqual([]);
    expect(S().doc.graph.unions.find(u => u.id === u2.id)).toBeUndefined();
    expect(errors()).toEqual([]);
  });
});

describe('#9 age annotation', () => {
  it('the age at death is shown when no age is filled in', () => {
    expect(annotationAge({ deceased: true, ageAtDeath: '42' })).toEqual({ text: 'd.42', kind: 'ageAtDeath', value: '42' });
    expect(annotationAge({ deceased: true, age: '50', ageAtDeath: '42' })).toEqual({ text: 'd.42', kind: 'ageAtDeath', value: '42' });
    expect(annotationAge({ age: '7' })).toEqual({ text: '7', kind: 'age', value: '7' });
    expect(annotationAge({ age: '7', ageAtDeath: '9' })).toEqual({ text: '7', kind: 'age', value: '7' });
    expect(annotationAge({ pregnancyLoss: true, age: '1' })).toBeNull();
    expect(annotationAge({})).toBeNull();
  });
});

describe('#10 packLines wraps without losing text', () => {
  const join = (lines) => lines.map(l => l.map(p => p.text).join('')).join(' ');
  it('keeps every word, at most `max` characters a line, pieces carry their segment', () => {
    const segs = [{ text: '[1] II-1: ', id: 'head' }, { text: 'çok uzun bir klinik not metni burada devam ediyor', id: 'note' }];
    const lines = packLines(segs, 20);
    expect(lines.length).toBeGreaterThan(1);
    lines.forEach(l => expect(l.map(p => p.text).join('').length).toBeLessThanOrEqual(20));
    expect(join(lines).replace(/\s+/g, ' ').trim()).toBe('[1] II-1: çok uzun bir klinik not metni burada devam ediyor');
    expect(lines.flat().every(p => p.seg === segs[0] || p.seg === segs[1])).toBe(true);
  });
  it('splits a word longer than a line', () => {
    const lines = packLines([{ text: 'x'.repeat(45) }], 20);
    expect(lines.map(l => l[0].text.length)).toEqual([20, 20, 5]);
  });
  it('two labels with the same 49-character start stay different', () => {
    const a = 'A'.repeat(49) + ' bir', b = 'A'.repeat(49) + ' iki';
    expect(join(packLines([{ text: a }], 40))).not.toBe(join(packLines([{ text: b }], 40)));
  });
});

// ── package 2: reliability ──

describe('#8 opening a broken project file', () => {
  const validDoc = () => { S().resetPedigree(); return JSON.parse(JSON.stringify(S().doc)); };
  const variants = {
    'a person that is null': (d) => { d.graph.individuals.push(null); },
    'a person without an id': (d) => { d.graph.individuals.push({ sex: 'male' }); },
    'a union with one partner': (d) => { d.graph.unions[0].partners = [d.graph.unions[0].partners[0]]; },
    'a union with the same partner twice': (d) => { d.graph.unions[0].partners = ['mother', 'mother']; },
    'children that are not a list': (d) => { d.graph.parentChildRelationships[0].children = 'proband'; },
    'a note that is not text': (d) => { d.graph.individuals[0].notes = { x: 1 }; },
    'findings that are not a list': (d) => { d.graph.individuals[0].conditions = 'Miyop'; },
    'a social link without a child': (d) => { d.graph.socialParentLinks = [{ unionId: 'U_PARENTS', kind: 'adoptive' }]; },
  };
  for (const [name, spoil] of Object.entries(variants)) {
    it(`refused with a reason, the open pedigree unchanged: ${name}`, () => {
      const d = validDoc();
      spoil(d);
      const before = S().doc;
      let r;
      expect(() => { r = S().openProjectFile(JSON.stringify(d)); }).not.toThrow();
      expect(r.ok).toBe(false);
      expect(S().doc).toBe(before);
      expect(S().actionNotice.message).toMatch(/açılmadı|okunamadı|değil/);
    });
  }
  it('a file that is too large is refused before it is read as JSON', () => {
    const r = S().openProjectFile(' '.repeat(21 * 1024 * 1024));
    expect(r.ok).toBe(false);
    expect(S().actionNotice.message).toMatch(/çok büyük/);
  });
  it('a valid file still opens', () => {
    const d = validDoc();
    S().updateIndividual('proband', { label: 'Başka' });
    expect(S().openProjectFile(JSON.stringify(d)).ok).toBe(true);
    expect(P('proband').label).toBe(d.graph.individuals.find(i => i.id === 'proband').label);
  });
});

describe('#5 a failed autosave is shown', () => {
  afterEach(() => { vi.useRealTimers(); delete globalThis.window; });
  it('the store says so while saving fails, and stops saying so once it works again', () => {
    vi.useFakeTimers();
    let full = true;
    const m = new Map();
    globalThis.window = { sessionStorage: {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { if (full) throw new Error('QuotaExceededError'); m.set(k, v); },
      removeItem: (k) => m.delete(k),
    } };
    S().resetPedigree();
    S().updateIndividual('proband', { label: 'A' });
    vi.advanceTimersByTime(400);
    expect(S().autosaveFailed).toBe(true);
    full = false;
    S().updateIndividual('proband', { label: 'B' });
    vi.advanceTimersByTime(400);
    expect(S().autosaveFailed).toBe(false);
  });
});

describe('#12 leaving the page asks whenever work would be lost', () => {
  it('only the patient name typed: asks', () => {
    S().resetPedigree();
    expect(needsLeaveWarning(S().doc, null)).toBe(false); // blank starter
    S().setPatientName('Örnek');
    expect(needsLeaveWarning(S().doc, null)).toBe(true);
  });
  it('a restored, never downloaded pedigree: asks; once downloaded: does not', () => {
    S().resetPedigree();
    S().updateIndividual('proband', { label: 'X' });
    const doc = S().doc;
    expect(needsLeaveWarning(doc, null)).toBe(true);
    expect(needsLeaveWarning(doc, doc)).toBe(false);
  });
});

describe('#2 the child of a cross-generation couple can be the proband', () => {
  it('the partners keep their own rows, the child one below the lower partner', () => {
    S().resetPedigree();
    S().addSpouseTo('proband', 'female');
    const wife = S().doc.graph.unions.find(u => u.partners.includes('proband')).partners.find(p => p !== 'proband');
    S().addParentsTo(wife);
    S().addSiblingTo(wife, 'female');
    const sis = sibsOf(wife).find(c => c !== wife);
    expect(S().createUnionBetween('father', sis).ok).toBe(true); // father one generation above her
    const u = S().doc.graph.unions.find(x => x.partners.includes('father') && x.partners.includes(sis));
    expect(u.crossGeneration).toBe(true);
    S().addChildToUnion(u.id, 'male');
    const kid = S().doc.graph.parentChildRelationships.find(r => r.unionId === u.id).children[0];
    const r = S().setProband(kid);
    expect(r.reason).toBeUndefined();
    expect(P(kid).proband).toBe(true);
    expect(P(sis).generation).toBe(P(kid).generation - 1);
    expect(P('father').generation).toBe(P(kid).generation - 2);
    expect(errors()).toEqual([]);
  });
});

describe('#13 the findings key holds 16 findings, then says so', () => {
  it('a 17th finding is refused with a clear message by every way in; the 16 stay usable', async () => {
    const { suggestStyle, keyFull } = await import('../graph/conditionKey');
    S().resetPedigree();
    for (let i = 1; i <= 16; i++) S().addFinding('mother', `Bulgu ${i}`, suggestStyle(S().doc.graph.conditionKey));
    const key = S().doc.graph.conditionKey;
    expect(key).toHaveLength(16);
    expect(new Set(key.map(e => `${e.region}|${e.fill}`)).size).toBe(16);
    expect(keyFull(key)).toBe(true);
    expect(suggestStyle(key)).toBeNull();
    const before = S().doc;
    S().addFinding('father', 'Bulgu 17', null);
    expect(S().doc).toBe(before);
    expect(S().actionNotice.message).toMatch(/16 bulgu sınırı/);
    S().setFindingStatus('father', 'Bulgu 17', 'carrier');
    expect(S().doc).toBe(before);
    S().addFindingMany(['father', 'proband'], 'Bulgu 17', null);
    expect(S().doc).toBe(before);
    S().setFindingStatus('father', 'Bulgu 3', 'affected');
    expect(P('father').conditions.map(c => c.label)).toEqual(['Bulgu 3']);
  });
});

describe('export messages name people by pedigree number', () => {
  it('a clinically relevant person with unknown sex is named II-…/III-…, not by an internal id', async () => {
    const { assessExportReadiness } = await import('../utils/exportReadiness');
    S().resetPedigree();
    S().addSiblingTo('proband', 'unknown');
    const sib = sibsOf('proband').find(c => c !== 'proband');
    S().updateIndividual(sib, { affected: true });
    const a = assessExportReadiness({ pedigreeData: S().pedigreeData, integrityIssues: [], svgElement: {} });
    const line = a.warnings.find(w => /cinsiyet bilinmiyor/.test(w));
    expect(line).toBeTruthy();
    expect(line).not.toContain(sib);
    expect(line).toMatch(/III-\d/);
  });
});
