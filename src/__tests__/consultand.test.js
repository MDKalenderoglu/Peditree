/**
 * consultand.test.js — the person who came for counselling (NSGC 2022;
 * clinician decisions 2026-11-01): an arrow without "P", at most one per
 * pedigree, possibly with no proband at all (a soft note, not an error);
 * the top bar's name and birth date belong to the proband, else the
 * consultand.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import * as ops from '../graph/ops';
import { validateDocument, errorsOf } from '../graph/validate';
import { subjectOf } from '../graph/model';
import { parseProjectFile, serializeDocument } from '../graph/persistenceV2';
import { clinicalNotices } from '../utils/clinicalNotices';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
beforeEach(() => S().resetPedigree());

const S = () => usePedigreeStore.getState();
const person = (id) => S().doc.graph.individuals.find(i => i.id === id);
const consultands = () => S().doc.graph.individuals.filter(i => i.consultand).map(i => i.id);

describe('the consultand', () => {
  it('one person at a time; marking another moves the mark; the proband can be the consultand too', () => {
    expect(S().setConsultand('mother').ok).toBe(true);
    expect(consultands()).toEqual(['mother']);
    expect(S().setConsultand('father').ok).toBe(true);
    expect(consultands()).toEqual(['father']);
    expect(S().setConsultand('proband').ok).toBe(true);
    expect(person('proband')).toMatchObject({ proband: true, consultand: true });
    expect(S().clearConsultand().ok).toBe(true);
    expect(consultands()).toEqual([]);
    expect(errorsOf(validateDocument(S().doc))).toEqual([]);
  });

  it('a pedigree with a consultand and no proband is valid; the missing proband is a soft note', () => {
    S().setConsultand('mother');
    expect(S().clearProband().ok).toBe(true);
    const issues = validateDocument(S().doc);
    expect(errorsOf(issues)).toEqual([]);
    const missing = issues.find(i => i.code === 'PROBAND_MISSING');
    expect(missing.severity).toBe('warning');
    const notes = clinicalNotices({ warningIssues: [{ item: missing, _warningId: 'w' }] }, S().pedigreeData);
    expect(notes[0].text).toMatch(/taşıyıcılık taramasında/);
    expect(notes[0].text).toMatch(/not kapatılabilir/);
  });

  it('never a pregnancy, a placeholder or a group; a file with two consultands is refused', () => {
    S().addChildTo('proband', 'unknown', { pregnancyLoss: true });
    const loss = S().doc.graph.individuals.find(i => i.pregnancyLoss).id;
    expect(S().setConsultand(loss).ok).toBe(false);
    S().addSiblingTo('proband', 'male', { count: 3 });
    const group = S().doc.graph.individuals.find(i => i.count).id;
    expect(S().setConsultand(group).reason).toMatch(/Tek tek ayır/);
    S().setConsultand('mother');
    expect(S().updateIndividual('mother', { pregnancyLoss: true }).ok).toBe(false);
    S().updateIndividual('mother', { consultand: false }); // only setConsultand changes the mark
    expect(person('mother').consultand).toBe(true);
    const bad = JSON.parse(serializeDocument(S().doc));
    bad.graph.individuals.find(i => i.id === 'father').consultand = true;
    expect(parseProjectFile(JSON.stringify(bad)).ok).toBe(false);
  });

  it('survives save and open, and undo', () => {
    S().setConsultand('mother');
    const back = parseProjectFile(serializeDocument(S().doc));
    expect(back.ok).toBe(true);
    expect(back.doc.graph.individuals.find(i => i.id === 'mother').consultand).toBe(true);
    S().undo();
    expect(consultands()).toEqual([]);
  });

  it('the top bar belongs to the proband, else the consultand', () => {
    S().setConsultand('mother');
    expect(subjectOf(S().doc.graph.individuals).id).toBe('proband');
    S().clearProband();
    expect(subjectOf(S().doc.graph.individuals).id).toBe('mother');
    expect(S().setProbandBirthDate('1990-05-04').ok).toBe(true);
    expect(person('mother').birthDate).toBe('1990-05-04');
    S().clearConsultand();
    expect(subjectOf(S().doc.graph.individuals)).toBeNull();
    expect(S().setProbandBirthDate('1990-05-04').ok).toBe(false);
  });

  // moved to screen.test.js: arrows, "P" and the key's first line (marks around a person)

  it('the plain operation refuses an unknown person', () => {
    expect(ops.setConsultand(S().doc, 'nobody').ok).toBe(false);
  });
});
