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
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
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
