/**
 * ageUnits.test.js — ages in years, months or days, and the proband's
 * optional birth date (clinician decision 2026-10-25).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { parseAge, normalizeAge, ageInDays, ageFromBirthDate } from '../utils/age';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });

const S = () => usePedigreeStore.getState();
const P = (id) => S().doc.graph.individuals.find(i => i.id === id);
const sibsOf = (id) => S().doc.graph.parentChildRelationships.find(r => r.children.includes(id)).children;

describe('reading an age', () => {
  it('years, months, days; written the way the drawing shows them', () => {
    expect(normalizeAge('35')).toBe('35');
    expect(normalizeAge(35)).toBe('35');
    expect(normalizeAge('35 yaş')).toBe('35');
    expect(normalizeAge('35 yıl')).toBe('35');
    expect(normalizeAge(' 3 ay ')).toBe('3 ay');
    expect(normalizeAge('3AY')).toBe('3 ay');
    expect(normalizeAge('12 gün')).toBe('12 gün');
    expect(normalizeAge('12g')).toBe('12 gün');
    expect(normalizeAge('2,5')).toBe('2,5');
    expect(normalizeAge('2.5')).toBe('2,5');
    expect(normalizeAge('')).toBe('');
  });
  it('what cannot be read is refused, not guessed', () => {
    for (const bad of ['12a', '-3', 'üç', '3 ay 2 gün', '1e3', '35 hafta']) expect(normalizeAge(bad)).toBeNull();
    expect(parseAge('abc')).toBeNull();
  });
  it('compared in days: 3 months is younger than 2 years, 2.9 older than 2.5', () => {
    expect(ageInDays('3 ay')).toBeLessThan(ageInDays('2'));
    expect(ageInDays('2,9')).toBeGreaterThan(ageInDays('2,5'));
    expect(ageInDays('40 gün')).toBeGreaterThan(ageInDays('1 ay'));
    expect(ageInDays('')).toBeNull();
    expect(ageInDays('12a')).toBeNull();
  });
});

describe('age from a birth date', () => {
  const today = new Date(2026, 9, 25); // 25 October 2026
  it('days under a month, months under two years, then years', () => {
    expect(ageFromBirthDate('2026-10-15', today)).toBe('10 gün');
    expect(ageFromBirthDate('2026-07-20', today)).toBe('3 ay');
    expect(ageFromBirthDate('2025-04-26', today)).toBe('17 ay');
    expect(ageFromBirthDate('1990-10-26', today)).toBe('35');
    expect(ageFromBirthDate('1990-10-25', today)).toBe('36');
    expect(ageFromBirthDate('2026-10-25', today)).toBe('0 gün');
  });
  it('a future or impossible date gives no age', () => {
    expect(ageFromBirthDate('2026-11-01', today)).toBeNull();
    expect(ageFromBirthDate('2026-02-30', today)).toBeNull();
    expect(ageFromBirthDate('25.10.1990', today)).toBeNull();
  });
});

describe('ages in the pedigree', () => {
  it('an age with a unit is stored as written on the drawing; an unreadable one is refused with an example', () => {
    S().resetPedigree();
    S().updateIndividual('proband', { age: '3AY' });
    expect(P('proband').age).toBe('3 ay');
    const before = S().doc;
    S().updateIndividual('proband', { age: '12a' });
    expect(S().doc).toBe(before);
    expect(S().actionNotice.message).toMatch(/3 ay/);
  });

  it('siblings are ordered by the real age: 3 months is the youngest', () => {
    S().resetPedigree();
    S().addSiblingTo('proband', 'male');
    S().addSiblingTo('proband', 'female');
    const [a, b, c] = sibsOf('proband');
    S().updateIndividual(a, { age: '3 ay' });
    S().updateIndividual(b, { age: '2' });
    S().updateIndividual(c, { age: '2,5' });
    expect(sibsOf('proband')).toEqual([c, b, a]);
  });

  it('the proband’s birth date sets the age; the age then follows the date', () => {
    S().resetPedigree();
    const r = S().setProbandBirthDate('2020-01-15');
    expect(r.ok).toBe(true);
    expect(P('proband').birthDate).toBe('2020-01-15');
    expect(P('proband').age).toBe(ageFromBirthDate('2020-01-15', new Date()));
    const before = S().doc;
    S().updateIndividual('proband', { age: '9' });
    expect(S().doc).toBe(before);
    expect(S().actionNotice.message).toMatch(/doğum tarihi/i);
    S().setProbandBirthDate('');
    expect(P('proband').birthDate).toBeUndefined();
    expect(P('proband').age).toBe(before.graph.individuals.find(i => i.id === 'proband').age); // the age stays
    S().updateIndividual('proband', { age: '9' });
    expect(P('proband').age).toBe('9');
  });

  it('a future birth date is refused', () => {
    S().resetPedigree();
    const before = S().doc;
    const next = new Date(); next.setFullYear(next.getFullYear() + 1);
    S().setProbandBirthDate(next.toISOString().slice(0, 10));
    expect(S().doc).toBe(before);
    expect(S().actionNotice.message).toMatch(/bugünden sonra/);
  });

  it('opening a file brings the age up to date from the birth date', () => {
    S().resetPedigree();
    S().setProbandBirthDate('2015-03-01');
    const doc = JSON.parse(JSON.stringify(S().doc));
    doc.graph.individuals.find(i => i.id === 'proband').age = '1'; // saved long ago
    expect(S().openProjectFile(JSON.stringify(doc)).ok).toBe(true);
    expect(P('proband').age).toBe(ageFromBirthDate('2015-03-01', new Date()));
  });
});
