/**
 * hgvs.test.js — a genetic test line written as the nomenclature writes it
 * (clinician request 2026-11-17: "fbn1" → "FBN1"): gene symbols in capitals
 * (HGNC), reference sequences in capitals, a variant's prefix small and its
 * nucleotides / amino acids as HGVS writes them; every other word as typed.
 * Applied when a line is written (the person's genetic test, a finding's shared
 * result); a line already there is never rewritten unasked.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { formatGeneticLine as f } from '../utils/hgvs';
import { withGeneticLine } from '../graph/model';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
const S = () => usePedigreeStore.getState();
const P = (id) => S().doc.graph.individuals.find(i => i.id === id);
const lines = (id) => String(P(id).geneticNote || '').split('\n').filter(Boolean);

describe('the nomenclature\'s capitals', () => {
  it('gene symbols in capitals — alone, before a variant, a reference, a zygosity or an exon; C9orf72 as HGNC writes it', () => {
    expect(f('fbn1')).toBe('FBN1');
    expect(f('cftr')).toBe('CFTR');
    expect(f('fbn1 het')).toBe('FBN1 het');
    expect(f('cftr:c.1234g>a')).toBe('CFTR:c.1234G>A');
    expect(f('mefv c.2080A>G hom')).toBe('MEFV c.2080A>G hom');
    expect(f('dmd ekzon 45-50 del')).toBe('DMD ekzon 45-50 del');
    expect(f('pik3ca')).toBe('PIK3CA'); // never Turkish capitals (İ)
    expect(f('c9orf72 tekrar artışı')).toBe('C9orf72 tekrar artışı');
  });

  it('reference sequences in capitals; a variant\'s prefix small, nucleotides in capitals, del / dup / ins small; amino acids in three letters', () => {
    expect(f('FBN1(nm_000138.5):C.1585C>T')).toBe('FBN1(NM_000138.5):c.1585C>T');
    expect(f('cftr c.1521_1523delctt')).toBe('CFTR c.1521_1523delCTT');
    expect(f('brca1 p.arg1443ter')).toBe('BRCA1 p.Arg1443Ter');
    expect(f('p.(gly12asp)')).toBe('p.(Gly12Asp)');
    expect(f('kras p.G12D')).toBe('KRAS p.G12D');
    expect(f('m.3243a>g')).toBe('m.3243A>G');
  });

  it('every other word as typed: results, the clinician\'s words, rsIDs, karyotypes, arrays', () => {
    for (const s of ['VUS', 'normal', 'sonuç bekleniyor', 'Varyant: c.123A>G', 'Test: WES negatif', 'trizomi 21', 'rs1234 het',
      'Down sendromu', '46,XY', 'arr[GRCh37] 22q11.21(18648855_21800471)x1', 'FBN1:c.1585C>T het']) {
      expect(f(s)).toBe(s);
    }
  });
});

describe('applied where a line is written (clinician request 2026-11-17)', () => {
  beforeEach(() => S().resetPedigree());

  it('the person\'s genetic test: a new line in the nomenclature\'s capitals; a line already there is not rewritten', () => {
    expect(S().updateIndividual('mother', { geneticNote: 'fbn1 c.1585c>t het' }).ok).toBe(true);
    expect(lines('mother')).toEqual(['FBN1 c.1585C>T het']);
    expect(P('mother').geneticTest).toBe('tested');
    // an older line, typed before this rule, stays as it was when another is added
    S().doc.graph.individuals.find(i => i.id === 'father').geneticNote = 'cftr eski';
    expect(S().updateIndividual('father', { geneticNote: withGeneticLine('cftr eski', Infinity, 'cftr:c.1521_1523delctt') }).ok).toBe(true);
    expect(lines('father')).toEqual(['cftr eski', 'CFTR:c.1521_1523delCTT']);
  });

  it('a finding\'s shared result: written once in the nomenclature\'s capitals, the same on everyone with a result for it', () => {
    S().setFindingStatus('mother', 'Kistik fibrozis', 'carrier', 'test');
    S().addFinding('proband', 'Kistik fibrozis');
    expect(S().setFindingVariant('Kistik fibrozis', 'cftr:c.1521_1523delctt').ok).toBe(true);
    expect(lines('mother')).toEqual(['CFTR:c.1521_1523delCTT']);
    expect(lines('proband')).toEqual(['CFTR:c.1521_1523delCTT']);
    expect(S().doc.graph.conditionKey.find(e => e.label === 'Kistik fibrozis').variant).toBe('CFTR:c.1521_1523delCTT');
    // typed again differently, the same result: nothing changes
    expect(S().setFindingVariant('Kistik fibrozis', 'CFTR:c.1521_1523delCTT').ok).toBe(true);
    expect(lines('proband')).toEqual(['CFTR:c.1521_1523delCTT']);
  });
});
