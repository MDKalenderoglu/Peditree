/**
 * carrierBasis.test.js — what a carrier status rests on (clinician decision
 * 2026-11-17, after Bennett 2008 Fig. 4 and 2022 §4.5): a genetic test or a
 * report — never a finding a relative happens to share, nor an "obligate
 * carrier" read from the pedigree (a de novo variant, uniparental disomy). Asked whenever carrier status is entered; kept on the
 * person (carrierBasis) or on the carried finding (conditions[].basis); a
 * carrier without it is a soft note. Also: no plain grey for a finding, and
 * with the solid half black stays the carrier's wherever a carrier is drawn.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { validateDocument, errorsOf } from '../graph/validate';
import { clinicalNotices } from '../utils/clinicalNotices';
import { deriveConditionKey, displayStyles, fillFor, FILLS } from '../graph/conditionKey';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
const S = () => usePedigreeStore.getState();
const P = (id) => S().doc.graph.individuals.find(i => i.id === id);
const missing = () => validateDocument(S().doc).find(i => i.code === 'CARRIER_BASIS_MISSING');

describe('a carrier status rests on a genetic test or a report (clinician decision 2026-11-17)', () => {
  beforeEach(() => S().resetPedigree());

  it('"Taşıyıcı" is kept with its basis; a genetic test marks the person tested (+); no longer a carrier, no basis', () => {
    expect(S().updateIndividual('mother', { carrier: true, carrierBasis: 'report' }).ok).toBe(true);
    expect(P('mother')).toMatchObject({ carrier: true, carrierBasis: 'report' });
    expect(P('mother').geneticTest).toBeUndefined();
    expect(S().updateIndividual('father', { carrier: true, carrierBasis: 'test' }).ok).toBe(true);
    expect(P('father')).toMatchObject({ carrierBasis: 'test', geneticTest: 'tested' });
    expect(S().updateIndividual('mother', { carrier: false }).ok).toBe(true);
    expect(P('mother').carrierBasis).toBeUndefined();
  });

  it('refused: a basis that is neither — "obligate" from the pedigree too — and a basis for someone who is not a carrier', () => {
    expect(S().updateIndividual('mother', { carrier: true, carrierBasis: 'tahmin' }).ok).toBe(false);
    expect(S().updateIndividual('mother', { carrier: true, carrierBasis: 'obligate' }).ok).toBe(false);
    expect(S().setFindingStatus('mother', 'FMF', 'carrier', 'obligate').ok).toBe(false);
    expect(P('mother').carrier).toBeFalsy();
    expect(S().updateIndividual('father', { carrierBasis: 'report' }).ok).toBe(false);
    expect(S().setFindingStatus('mother', 'FMF', 'carrier', 'tahmin').ok).toBe(false);
    expect(S().setFindingStatus('mother', 'FMF', 'affected', 'test').ok).toBe(false);
  });

  it('the carrier of a named finding keeps its basis on the finding; another status drops it', () => {
    expect(S().setFindingStatus('mother', 'FMF', 'carrier', 'test').ok).toBe(true);
    expect(P('mother').conditions).toEqual([{ label: 'FMF', status: 'carrier', basis: 'test' }]);
    expect(P('mother').geneticTest).toBe('tested');
    S().setFindingStatus('mother', 'FMF', 'affected');
    expect(P('mother').conditions).toEqual([{ label: 'FMF', status: 'affected' }]);
  });

  it('a carrier without a basis (a file from before) is a soft note naming the person, never an error', () => {
    S().updateIndividual('mother', { carrier: true });
    S().setFindingStatus('father', 'FMF', 'carrier');
    const issue = missing();
    expect(issue.severity).toBe('warning');
    expect(issue.ids.sort()).toEqual(['father', 'mother']);
    expect(errorsOf(validateDocument(S().doc))).toEqual([]);
    const notes = clinicalNotices({ warningIssues: [{ item: issue, _warningId: 'w' }] }, S().pedigreeData);
    expect(notes[0].text).toMatch(/II-\d/); // pedigree numbers, never ids
    expect(notes[0].text).not.toMatch(/mother|father/);
    S().updateIndividual('mother', { carrierBasis: 'report' });
    S().setFindingStatus('father', 'FMF', 'carrier', 'test');
    expect(missing()).toBeUndefined();
  });

  it('a file saved with "obligate" opens: the basis is dropped and the note asks for one', () => {
    const d = JSON.parse(S().exportProjectFile());
    const mother = d.graph.individuals.find(i => i.id === 'mother');
    Object.assign(mother, { carrier: true, carrierBasis: 'obligate', conditions: [{ label: 'FMF', status: 'carrier', basis: 'obligate' }] });
    d.graph.conditionKey = [{ id: 'k1', label: 'FMF', fill: 'solid' }];
    expect(S().openProjectFile(JSON.stringify(d)).ok).toBe(true);
    expect(P('mother').carrier).toBe(true);
    expect(P('mother').carrierBasis).toBeUndefined();
    expect(P('mother').conditions).toEqual([{ label: 'FMF', status: 'carrier' }]);
    expect(missing().ids).toEqual(['mother']);
  });

  it('a file with an unknown basis does not open', () => {
    const d = JSON.parse(S().exportProjectFile());
    d.graph.individuals.find(i => i.id === 'mother').carrier = true;
    d.graph.individuals.find(i => i.id === 'mother').carrierBasis = 'tahmin';
    expect(S().openProjectFile(JSON.stringify(d)).ok).toBe(false);
  });
});

describe('finding patterns that cannot be misread (clinician report 2026-11-17)', () => {
  it('no plain grey: a finding from an older file in grey gets a free pattern', () => {
    expect(FILLS).not.toContain('grey');
    const g = { individuals: [{ id: 'a', conditions: [{ label: 'A', status: 'affected' }, { label: 'B', status: 'affected' }] }],
      conditionKey: [{ id: 'k1', label: 'A', fill: 'solid' }, { id: 'k2', label: 'B', fill: 'grey' }] };
    const fill = deriveConditionKey(g).conditionKey[1].fill;
    expect(fill).not.toBe('grey');
    expect(FILLS).toContain(fill);
  });

  it('with the solid half, a finding in black is drawn in another pattern beside any carrier — a named one too', () => {
    const key = [{ id: 'k1', label: 'Katarakt', fill: 'hatch' }, { id: 'k2', label: 'Miyop', fill: 'solid' }];
    const p = { conditions: [{ label: 'Katarakt', status: 'carrier', basis: 'test' }, { label: 'Miyop', status: 'affected' }] };
    const st = displayStyles([p], key, 'half');
    const parts = fillFor(p, st.key, 'half', st).parts;
    expect(parts.map(x => x.fill)).not.toContain('solid'); // no black half beside the carrier's
    expect(key[1].fill).toBe('solid'); // the file keeps the clinician's choice
    // with the NSGC 2022 hatching there is no solid carrier half to be confused with: black stays
    expect(displayStyles([p], key, 'split').key[1].fill).toBe('solid');
  });
});

describe('a finding\'s genetic test result, shared by everyone with a result for it (clinician request 2026-11-17)', () => {
  beforeEach(() => S().resetPedigree());
  const lines = (id) => String(P(id).geneticNote || '').split('\n').filter(Boolean);

  it('written once, it lands on the tested carriers and the affected, marked tested (+); a carrier by report or someone without the finding gets nothing', () => {
    S().setFindingStatus('mother', 'FMF', 'carrier', 'test');
    S().setFindingStatus('father', 'FMF', 'carrier', 'report');
    S().addFinding('proband', 'FMF');
    expect(S().setFindingVariant('FMF', '  MEFV:c.2080A>G ').ok).toBe(true);
    expect(lines('mother')).toEqual(['MEFV:c.2080A>G']);
    expect(lines('proband')).toEqual(['MEFV:c.2080A>G']);
    expect(P('proband').geneticTest).toBe('tested');
    expect(P('father').geneticNote).toBeUndefined();
    expect(P('pat_gf').geneticNote).toBeUndefined();
    // kept with the finding through every later operation, and in a saved file
    S().updateIndividual('mat_gf', { age: '70' });
    expect(S().doc.graph.conditionKey[0].variant).toBe('MEFV:c.2080A>G');
    S().openProjectFile(S().exportProjectFile());
    expect(S().doc.graph.conditionKey[0].variant).toBe('MEFV:c.2080A>G');
  });

  it('each line is the person\'s own (zygosity beside it); someone who comes to have the finding later gets the line, someone who loses it loses the line as written', () => {
    S().setFindingStatus('mother', 'FMF', 'carrier', 'test');
    S().setFindingVariant('FMF', 'MEFV:c.2080A>G');
    S().updateIndividual('mother', { geneticNote: 'MEFV:c.2080A>G het' });
    S().addFinding('proband', 'FMF');
    expect(lines('proband')).toEqual(['MEFV:c.2080A>G']);
    S().setFindingStatus('father', 'FMF', 'carrier', 'test');
    expect(lines('father')).toEqual(['MEFV:c.2080A>G']);
    S().setFindingStatus('proband', 'FMF', 'none');
    expect(P('proband').geneticNote).toBeUndefined();
    // a carrier by report: no test result
    S().setFindingStatus('father', 'FMF', 'carrier', 'report');
    expect(P('father').geneticNote).toBeUndefined();
    expect(lines('mother')).toEqual(['MEFV:c.2080A>G het']); // her own line, untouched
  });

  it('a changed result replaces the line where it stands; an empty one takes it away; a very long one is refused', () => {
    S().setFindingStatus('mother', 'FMF', 'carrier', 'test');
    S().updateIndividual('mother', { geneticNote: 'Kromozom analizi normal' });
    S().setFindingVariant('FMF', 'MEFV:c.2080A>G');
    expect(lines('mother')).toEqual(['Kromozom analizi normal', 'MEFV:c.2080A>G']);
    S().setFindingVariant('FMF', 'MEFV:c.2177T>C');
    expect(lines('mother')).toEqual(['Kromozom analizi normal', 'MEFV:c.2177T>C']);
    S().setFindingVariant('FMF', '');
    expect(lines('mother')).toEqual(['Kromozom analizi normal']);
    expect(S().doc.graph.conditionKey[0].variant).toBeUndefined();
    expect(S().setFindingVariant('FMF', 'x'.repeat(121)).ok).toBe(false);
  });
});
