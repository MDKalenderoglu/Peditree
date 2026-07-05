import { describe, it, expect } from 'vitest';
import { sanitizeAgeValue, isNegativeAgeValue } from '../utils/ageValidation';

describe('ageValidation — sanitizeAgeValue', () => {
  it('passes through empty string unchanged', () => {
    expect(sanitizeAgeValue('')).toBe('');
  });

  it('passes through undefined/null unchanged', () => {
    expect(sanitizeAgeValue(undefined)).toBeUndefined();
    expect(sanitizeAgeValue(null)).toBeNull();
  });

  it('passes through a valid non-negative age unchanged', () => {
    expect(sanitizeAgeValue('30')).toBe('30');
    expect(sanitizeAgeValue(0)).toBe(0);
    expect(sanitizeAgeValue('0')).toBe('0');
  });

  it('clamps a negative string value to "0"', () => {
    expect(sanitizeAgeValue('-5')).toBe('0');
    expect(sanitizeAgeValue('-1')).toBe('0');
  });

  it('clamps a negative numeric value to "0"', () => {
    expect(sanitizeAgeValue(-12)).toBe('0');
  });

  it('passes through non-numeric text unchanged (not this helper\'s concern)', () => {
    expect(sanitizeAgeValue('abc')).toBe('abc');
  });
});

describe('ageValidation — isNegativeAgeValue', () => {
  it('is false for empty/undefined/null', () => {
    expect(isNegativeAgeValue('')).toBe(false);
    expect(isNegativeAgeValue(undefined)).toBe(false);
    expect(isNegativeAgeValue(null)).toBe(false);
  });

  it('is false for a valid non-negative age', () => {
    expect(isNegativeAgeValue('30')).toBe(false);
    expect(isNegativeAgeValue(0)).toBe(false);
  });

  it('is true for a negative value', () => {
    expect(isNegativeAgeValue('-5')).toBe(true);
    expect(isNegativeAgeValue(-1)).toBe(true);
  });

  it('is false for non-numeric text', () => {
    expect(isNegativeAgeValue('abc')).toBe(false);
  });
});
