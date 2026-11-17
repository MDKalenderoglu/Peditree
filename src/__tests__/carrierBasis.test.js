/**
 * carrierBasis.test.js — what a carrier status rests on (clinician decision
 * 2026-11-17, after Bennett 2008 Fig. 4 and 2022 §4.5): a genetic test, the
 * pedigree (obligate carrier) or a report — never a finding a relative
 * happens to share. Asked whenever carrier status is entered; kept on the
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

describe('a carrier status rests on a test, the pedigree or a report (clinician decision 2026-11-17)', () => {
  beforeEach(() => S().resetPedigree());

  it('"Taşıyıcı" is kept with its basis; a genetic test marks the person tested (+); no longer a carrier, no basis', () => {
    expect(S().updateIndividual('mother', { carrier: true, carrierBasis: 'obligate' }).ok).toBe(true);
    expect(P('mother')).toMatchObject({ carrier: true, carrierBasis: 'obligate' });
    expect(P('mother').geneticTest).toBeUndefined();
    expect(S().updateIndividual('father', { carrier: true, carrierBasis: 'test' }).ok).toBe(true);
    expect(P('father')).toMatchObject({ carrierBasis: 'test', geneticTest: 'tested' });
    expect(S().updateIndividual('mother', { carrier: false }).ok).toBe(true);
    expect(P('mother').carrierBasis).toBeUndefined();
  });

  it('refused: a basis that is none of the three, and a basis for someone who is not a carrier', () => {
    expect(S().updateIndividual('mother', { carrier: true, carrierBasis: 'tahmin' }).ok).toBe(false);
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
    S().setFindingStatus('father', 'FMF', 'carrier', 'obligate');
    expect(missing()).toBeUndefined();
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
