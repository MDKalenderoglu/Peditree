/**
 * typedDate.test.js — a date typed with or without separators (clinician request 2026-11-12: a phone's
 * number keyboard has no dot; "12122024" must read 12.12.2024 while it is typed, on every device).
 */
import { describe, it, expect } from 'vitest';
import { typeDate, parseTypedDate } from '../utils/age';

/** key by key, as a keyboard sends it */
const type = (keys, from = '') => { let v = from; for (const k of keys) v = typeDate(v + k, v); return v; };
const today = new Date(2026, 10, 12);

describe('a date as it is typed', () => {
  it('digits alone get their dots: 12122024 → 12.12.2024', () => {
    expect(type('12122024')).toBe('12.12.2024');
    expect(parseTypedDate(type('12122024'), today)).toBe('2024-12-12');
    expect(type('1')).toBe('1');
    expect(type('12')).toBe('12.');
    expect(type('121')).toBe('12.1');
    expect(type('1212')).toBe('12.12.');
    // a year of two digits
    expect(parseTypedDate(type('120324'), today)).toBe('2024-03-12');
    // more digits than a date holds: the rest is not kept
    expect(type('1212202499')).toBe('12.12.2024');
  });

  it('a separator the clinician types is kept, any of . , / - or a space; a mix works', () => {
    for (const sep of ['.', ',', '/', '-', ' ']) expect(type(`12${sep}12${sep}2024`)).toBe('12.12.2024');
    expect(type('3.5.25')).toBe('3.5.25');
    expect(parseTypedDate(type('3.5.25'), today)).toBe('2025-05-03');
    expect(type('1.12.2024')).toBe('1.12.2024');
    // a dot in one place, forgotten in the other
    expect(type('12.122024')).toBe('12.12.2024');
    expect(type('1212.2024')).toBe('12.12.2024');
    // the whole date pasted at once
    expect(typeDate('12122024', '')).toBe('12.12.2024');
  });

  it('deleting never brings the dot back', () => {
    let v = type('1212'); // "12.12."
    v = typeDate(v.slice(0, -1), v);
    expect(v).toBe('12.12');
    v = typeDate(v.slice(0, -1), v);
    expect(v).toBe('12.1');
    v = typeDate(v.slice(0, -1), v);
    expect(v).toBe('12.');
    v = typeDate(v.slice(0, -1), v);
    expect(v).toBe('12');
    v = typeDate(v.slice(0, -1), v);
    expect(v).toBe('1');
  });

  it('too few digits for a whole date are not guessed: 6812 is no date', () => {
    expect(type('6812')).toBe('68.12.');
    expect(parseTypedDate(type('6812'), today)).toBe(null);
    // nor a day or month that does not exist
    expect(parseTypedDate(type('31022024'), today)).toBe(null);
  });
});
