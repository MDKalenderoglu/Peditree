/**
 * clinicalNotation2.test.js — clinician decisions 2026-10-25: genetic test
 * status below the symbol with free text (written out, no "E" prefix —
 * NSGC 2022, clinician decision 2026-10-27), the age a
 * finding was diagnosed at (in the notes), childlessness and infertility.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { GENETIC_TEST, parseGeneticTest } from '../graph/ops';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
const S = () => usePedigreeStore.getState();
const P = (id) => S().doc.graph.individuals.find(i => i.id === id);
const U = (id) => S().doc.graph.unions.find(u => u.id === id);

describe('genetic test status', () => {
  it('positive / negative / VUS / tested with a free note; cleared with an empty value; survives save and open', () => {
    S().resetPedigree();
    S().updateIndividual('mother', { geneticTest: 'positive', geneticNote: 'FBN1 c.1585C>T het' });
    expect(P('mother').geneticTest).toBe('positive');
    S().updateIndividual('father', { geneticTest: 'tested', geneticNote: 'sonuç belgesi yok' });
    const before = S().doc;
    S().updateIndividual('father', { geneticTest: 'maybe' });
    expect(S().doc).toBe(before);
    const saved = JSON.stringify(S().doc);
    S().openProjectFile(saved);
    expect(P('father').geneticNote).toBe('sonuç belgesi yok');
    S().updateIndividual('mother', { geneticTest: '' });
    expect(P('mother').geneticTest).toBeUndefined();
  });
  it('the drawing writes the result out under the symbol, with no "E" prefix and no "E:" line in the notes (NSGC 2022)', () => {
    expect(GENETIC_TEST).toEqual({ positive: 'pozitif', negative: 'negatif', vus: 'VUS', tested: 'test edildi' });
    const src = readFileSync(join(process.cwd(), 'src/components/PedigreeCanvas.jsx'), 'utf8');
    expect(src).toMatch(/GENETIC_TEST\[d\.geneticTest\]/);
    expect(src).not.toMatch(/'E: '/);
    expect(src).not.toMatch(/E\+ pozitif/);
  });
  it('typing over the drawn result reads the new words and the old E spellings', () => {
    for (const [typed, code] of [['pozitif', 'positive'], ['Negatif', 'negative'], ['vus', 'vus'], ['TEST EDİLDİ', 'tested'], ['TEST EDILDI', 'tested'], ['test  edildi', 'tested'],
      ['E+', 'positive'], ['E-', 'negative'], ['E−', 'negative'], ['E VUS', 'vus'], ['E', 'tested'], ['', '']]) {
      expect(parseGeneticTest(typed)).toBe(code);
    }
    expect(parseGeneticTest('belki')).toBeUndefined();
  });
  it('a file saved with a test result before the change opens with the same stored code', () => {
    S().resetPedigree();
    S().updateIndividual('mother', { geneticTest: 'vus', geneticNote: 'MYH7 c.1988G>A' });
    const saved = JSON.stringify(S().doc);
    S().resetPedigree();
    S().openProjectFile(saved);
    expect(P('mother').geneticTest).toBe('vus');
    expect(GENETIC_TEST[P('mother').geneticTest]).toBe('VUS');
  });
});

describe('diagnosis age of a finding', () => {
  it('set per person and finding, read like an age, refused when unreadable', () => {
    S().resetPedigree();
    S().addFinding('mother', 'Miyop', null);
    S().setFindingOnset('mother', 'Miyop', '3AY');
    expect(P('mother').conditions[0].onsetAge).toBe('3 ay');
    const before = S().doc;
    S().setFindingOnset('mother', 'Miyop', '12a');
    expect(S().doc).toBe(before);
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
