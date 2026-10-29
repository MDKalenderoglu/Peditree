/** nameCase.test.js — patient names start with capitals, by Turkish rules (clinician request 2026-10-30). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nameCase } from '../utils/nameCase';

describe('nameCase', () => {
  it('every word starts with a capital, by Turkish rules', () => {
    expect(nameCase('ayşe nur yılmaz')).toBe('Ayşe Nur Yılmaz');
    expect(nameCase('ismail ılgaz')).toBe('İsmail Ilgaz');
    expect(nameCase('AYŞE IŞIK')).toBe('Ayşe Işık');
    expect(nameCase('şükrü çelik öztürk')).toBe('Şükrü Çelik Öztürk');
  });
  it('hyphenated names; suffixes after an apostrophe stay small; spacing kept', () => {
    expect(nameCase('ayşe-gül yılmaz')).toBe('Ayşe-Gül Yılmaz');
    expect(nameCase("ali'nin")).toBe("Ali'nin");
    expect(nameCase('  ahmet   can ')).toBe('  Ahmet   Can ');
    expect(nameCase('')).toBe('');
    expect(nameCase(null)).toBe('');
  });
  it('the toolbar box and the name on the drawing use it', () => {
    const app = readFileSync(join(process.cwd(), 'src/App.jsx'), 'utf8');
    const canvas = readFileSync(join(process.cwd(), 'src/components/PedigreeCanvas.jsx'), 'utf8');
    expect(app).toMatch(/onBlur=\{e => setPatientName\(nameCase\(e\.target\.value\)\.trim\(\)\)\}/);
    expect(app).toMatch(/if \(kind === 'patientName'\) setPatientName\(nameCase\(v\)\.trim\(\)\)/);
    expect(canvas).toMatch(/const name = nameCase\(patientName\)\.trim\(\);/);
  });
});
