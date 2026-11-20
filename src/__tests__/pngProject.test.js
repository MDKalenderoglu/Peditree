/**
 * pngProject.test.js — a PNG saved with Kaydet → PNG carries the PediTree
 * file and "Aç" opens it to edit again (clinician request 2026-11-20: a PNG
 * downloaded in clinic could not be edited later).
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { embedProject, readProject, isPng } from '../utils/pngProject';
import { usePedigreeStore } from '../state/usePedigreeStore';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });

// a real 1×1 PNG
const TINY_PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
const S = () => usePedigreeStore.getState();

describe('the PediTree file inside a PNG', () => {
  it('written and read back, Turkish letters included; the picture stays a PNG ending in IEND', () => {
    const text = JSON.stringify({ name: 'Ayşe Çığ Öztürk', note: 'ğüşıöç İ' });
    const out = embedProject(TINY_PNG, text);
    expect(isPng(out)).toBe(true);
    expect(new TextDecoder().decode(out.subarray(out.length - 8, out.length - 4))).toBe('IEND');
    expect(readProject(out)).toBe(text);
    // the image data itself is untouched: everything before IEND is the original's
    expect(out.subarray(0, TINY_PNG.length - 12)).toEqual(TINY_PNG.subarray(0, TINY_PNG.length - 12));
  });

  it('saved again: one file inside, the newer', () => {
    const twice = embedProject(embedProject(TINY_PNG, 'eski'), 'yeni');
    expect(readProject(twice)).toBe('yeni');
    expect(twice.length).toBe(embedProject(TINY_PNG, 'yeni').length);
  });

  it('a PNG without it, a damaged one, or not a PNG: nothing', () => {
    expect(readProject(TINY_PNG)).toBeNull();
    const out = embedProject(TINY_PNG, 'veri');
    out[out.length - 20] ^= 0xff; // inside the chunk
    expect(readProject(out)).toBeNull();
    expect(readProject(new TextEncoder().encode('{"a":1}'))).toBeNull();
  });
});

describe('Aç with a PNG', () => {
  beforeEach(() => S().resetPedigree());

  it('a picture saved by PediTree opens the drawing with everything in it', () => {
    S().addFinding('mother', 'Miyop', null);
    S().setPatientName('Ayşe Yılmaz');
    const file = S().exportProjectFile();
    const png = embedProject(TINY_PNG, file);
    S().resetPedigree();
    expect(S().doc.graph.conditionKey || []).toEqual([]);
    S().openPngFile(png);
    expect(S().doc.patientName).toBe('Ayşe Yılmaz');
    expect(S().doc.graph.individuals.find(i => i.id === 'mother').conditions.map(c => c.label)).toEqual(['Miyop']);
  });

  it('a picture without it (shared, made smaller by an app, from elsewhere) opens nothing and says why', () => {
    S().addFinding('mother', 'Miyop', null);
    const before = S().doc;
    S().openPngFile(TINY_PNG);
    expect(S().doc).toBe(before);
    expect(S().actionNotice.message).toMatch(/Kaydet → PNG/);
    S().openPngFile(null);
    expect(S().doc).toBe(before);
  });
});
