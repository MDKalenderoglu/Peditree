/**
 * clinicalNotation2.test.js — clinician decisions 2026-10-25: genetic test
 * "+" / "−" with the clinician's lines under the symbol (no "E" prefix —
 * NSGC 2022, clinician decision 2026-10-27), the age a
 * finding was diagnosed at (in the notes), childlessness and infertility.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { geneticLines, withGeneticLine, normalizeGenetics } from '../graph/model';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
const S = () => usePedigreeStore.getState();
const P = (id) => S().doc.graph.individuals.find(i => i.id === id);
const U = (id) => S().doc.graph.unions.find(u => u.id === id);

describe('genetic test status (clinician decision 2026-10-27: "−" none, "+" done, lines under the symbol)', () => {
  it('"+" or "−" only; "−" removes what was written; survives save and open', () => {
    S().resetPedigree();
    S().updateIndividual('mother', { geneticTest: 'tested', geneticNote: 'FBN1 c.1585C>T het\nTGFBR2 c.1609C>T het' });
    expect(P('mother').geneticTest).toBe('tested');
    expect(geneticLines(P('mother'))).toEqual(['FBN1 c.1585C>T het', 'TGFBR2 c.1609C>T het']);
    const before = S().doc;
    S().updateIndividual('mother', { geneticTest: 'positive' }); // the old codes are refused
    expect(S().doc).toBe(before);
    const saved = JSON.stringify(S().doc);
    S().resetPedigree();
    S().openProjectFile(saved);
    expect(geneticLines(P('mother'))).toHaveLength(2);
    S().updateIndividual('mother', { geneticTest: '' });
    expect(P('mother').geneticTest).toBeUndefined();
    expect(P('mother').geneticNote).toBeUndefined();
  });
  it('a written line means a test was done; blank lines are dropped', () => {
    S().resetPedigree();
    S().updateIndividual('father', { geneticNote: '  sonuç bekleniyor \n\n' });
    expect(P('father').geneticTest).toBe('tested');
    expect(P('father').geneticNote).toBe('sonuç bekleniyor');
  });
  it('one line is replaced, added or removed without touching the others', () => {
    const note = 'A\nB\nC';
    expect(withGeneticLine(note, 1, 'b2')).toBe('A\nb2\nC');
    expect(withGeneticLine(note, Infinity, 'D')).toBe('A\nB\nC\nD');
    expect(withGeneticLine(note, 0, '  ')).toBe('B\nC');
    expect(withGeneticLine('', 0, 'ilk')).toBe('ilk');
  });
  it('a result saved before the change (E+ / E− / E VUS) opens as "+" with the result as the first line', () => {
    S().resetPedigree();
    const doc = JSON.parse(JSON.stringify(S().doc));
    const mother = doc.graph.individuals.find(i => i.id === 'mother');
    Object.assign(mother, { geneticTest: 'vus', geneticNote: 'MYH7 c.1988G>A' });
    doc.graph.individuals.find(i => i.id === 'father').geneticTest = 'negative';
    S().openProjectFile(JSON.stringify(doc));
    expect(P('mother').geneticTest).toBe('tested');
    expect(geneticLines(P('mother'))).toEqual(['VUS', 'MYH7 c.1988G>A']);
    expect(geneticLines(P('father'))).toEqual(['negatif']);
    const p = { geneticTest: 'positive' };
    normalizeGenetics(p);
    expect(p).toEqual({ geneticTest: 'tested', geneticNote: 'pozitif' });
  });
  // moved to screen.test.js: genetic test lines under the symbol
});

// ring and selection step back on an empty click (clinician request 2026-10-27)
// moved to screen.test.js: an empty click steps back one level

describe('diagnosis age of a finding', () => {
  it('set per person and finding, read like an age when it is one, otherwise kept as written (free text, clinician 2026-11-07)', () => {
    S().resetPedigree();
    S().addFinding('mother', 'Miyop', null);
    S().setFindingOnset('mother', 'Miyop', '3AY');
    expect(P('mother').conditions[0].onsetAge).toBe('3 ay');
    S().setFindingOnset('mother', 'Miyop', '  çocuklukta ');
    expect(P('mother').conditions[0].onsetAge).toBe('çocuklukta');
    S().setFindingOnset('mother', 'Miyop', '');
    expect(P('mother').conditions[0].onsetAge).toBeUndefined();
  });
});

describe('childlessness and infertility', () => {
  it('one bar by choice / reason unknown, two bars infertile, with the reason; cleared', () => {
    S().resetPedigree();
    S().addSpouseTo('proband', 'female');
    const u = S().doc.graph.unions.find(x => x.partners.includes('proband')).id;
    S().setChildlessness(u, 'infertile', 'azospermi');
    expect(U(u).childless).toBe('infertile');
    expect(U(u).childlessReason).toBe('azospermi');
    S().setChildlessness(u, null, '');
    expect(U(u).childless).toBeUndefined();
    expect(U(u).childlessReason).toBeUndefined();
  });
});

// pop-up windows and help text (clinician request 2026-10-27)
// moved to screen.test.js: pop-ups close on an outside tap or Escape; that tap does nothing else
// moved to screen.test.js: the keyboard help
// moved to screen.test.js: the tip in the side panel
