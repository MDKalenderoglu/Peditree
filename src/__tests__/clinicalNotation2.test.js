/**
 * clinicalNotation2.test.js — clinician decisions 2026-10-25: genetic test
 * "+" / "−" with the clinician's lines under the symbol (no "E" prefix —
 * NSGC 2022, clinician decision 2026-10-27), the age a
 * finding was diagnosed at (in the notes), childlessness and infertility.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { geneticLines, withGeneticLine, normalizeGenetics, TESTED_TEXT } from '../graph/model';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
const S = () => usePedigreeStore.getState();
const P = (id) => S().doc.graph.individuals.find(i => i.id === id);
const U = (id) => S().doc.graph.unions.find(u => u.id === id);

describe('genetic test status (clinician decision 2026-10-27: "−" none, "+" done, lines under the symbol)', () => {
  it('"+" or "−" only; "−" removes what was written; survives save and open', () => {
    S().resetPedigree();
    S().updateIndividual('mother', { geneticTest: 'tested', geneticNote: 'FBN1 c.1585C>T het\nTGFBR2 c.1609C>T het' });
    expect(P('mother').geneticTest).toBe('tested');
    expect(geneticLines(P('mother'))).toEqual(['FBN1 c.1585C>T het', 'TGFBR2 c.1609C>T het']);
    const before = S().doc;
    S().updateIndividual('mother', { geneticTest: 'positive' }); // the old codes are refused
    expect(S().doc).toBe(before);
    const saved = JSON.stringify(S().doc);
    S().resetPedigree();
    S().openProjectFile(saved);
    expect(geneticLines(P('mother'))).toHaveLength(2);
    S().updateIndividual('mother', { geneticTest: '' });
    expect(P('mother').geneticTest).toBeUndefined();
    expect(P('mother').geneticNote).toBeUndefined();
  });
  it('a written line means a test was done; blank lines are dropped', () => {
    S().resetPedigree();
    S().updateIndividual('father', { geneticNote: '  sonuç bekleniyor \n\n' });
    expect(P('father').geneticTest).toBe('tested');
    expect(P('father').geneticNote).toBe('sonuç bekleniyor');
  });
  it('one line is replaced, added or removed without touching the others', () => {
    const note = 'A\nB\nC';
    expect(withGeneticLine(note, 1, 'b2')).toBe('A\nb2\nC');
    expect(withGeneticLine(note, Infinity, 'D')).toBe('A\nB\nC\nD');
    expect(withGeneticLine(note, 0, '  ')).toBe('B\nC');
    expect(withGeneticLine('', 0, 'ilk')).toBe('ilk');
  });
  it('a result saved before the change (E+ / E− / E VUS) opens as "+" with the result as the first line', () => {
    S().resetPedigree();
    const doc = JSON.parse(JSON.stringify(S().doc));
    const mother = doc.graph.individuals.find(i => i.id === 'mother');
    Object.assign(mother, { geneticTest: 'vus', geneticNote: 'MYH7 c.1988G>A' });
    doc.graph.individuals.find(i => i.id === 'father').geneticTest = 'negative';
    S().openProjectFile(JSON.stringify(doc));
    expect(P('mother').geneticTest).toBe('tested');
    expect(geneticLines(P('mother'))).toEqual(['VUS', 'MYH7 c.1988G>A']);
    expect(geneticLines(P('father'))).toEqual(['negatif']);
    const p = { geneticTest: 'positive' };
    normalizeGenetics(p);
    expect(p).toEqual({ geneticTest: 'tested', geneticNote: 'pozitif' });
  });
  it('the drawing writes each line under the symbol, "test yapıldı" when none, no "E" anywhere', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/PedigreeCanvas.jsx'), 'utf8');
    expect(src).toMatch(/geneticRows\(d\)\.forEach/);
    expect(src).toMatch(/'geneticLine'/);
    expect(src).toMatch(/TESTED_TEXT/);
    expect(src).not.toMatch(/'E: '/);
    expect(TESTED_TEXT).toBe('test yapıldı');
  });
});

describe('ring and selection step back on an empty click (clinician request 2026-10-27)', () => {
  it('open menu → ring → selection, one level per click; selecting a person brings the ring back', () => {
    const app = readFileSync(join(process.cwd(), 'src/App.jsx'), 'utf8');
    expect(app).toMatch(/if \(ringShown && ringRef\.current\?\.back\(\)\) return;\s*if \(ringShown\) \{ setRingHidden\(true\); return; \}\s*clearSelection\(\);/);
    expect(app).toMatch(/const handleNodeSelect = \(id, opts\) => \{\s*setRingHidden\(false\);/);
    expect(app).toMatch(/onBackgroundClick=\{onBackgroundClick\}/);
    const canvas = readFileSync(join(process.cwd(), 'src/components/PedigreeCanvas.jsx'), 'utf8');
    expect(canvas).toMatch(/svg\.on\('click\.background'/);
    const ring = readFileSync(join(process.cwd(), 'src/components/RadialAddMenu.jsx'), 'utf8');
    expect(ring).toMatch(/back: \(\) => \{/);
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

describe('pop-up windows and help text (clinician request 2026-10-27)', () => {
  const app = readFileSync(join(process.cwd(), 'src/App.jsx'), 'utf8');
  it('every toolbar pop-up closes on a click outside it or Escape, and that click does nothing else', () => {
    for (const name of ['new', 'keys', 'share', 'more']) expect(app).toContain(`data-popup="${name}"`);
    expect(app).toMatch(/document\.addEventListener\('pointerdown', onDown, true\)/);
    expect(app).toMatch(/e\.key !== 'Escape'/);
    expect(app).toMatch(/performance\.now\(\) - popupClosedAt\.current < 1000/);
  });
  it('the keyboard help is grouped and written in full sentences', () => {
    expect(app).toContain("['Kişiler arasında gezinmek', [");
    expect(app).toContain("['Seçili kişi için (önce bir kişiye tıklayın)', [");
    expect(app).not.toMatch(/'simit açılır'|odaktaki kişiyi seç/);
  });
  it('the editor tip says where the buttons are and how to bring them back', () => {
    const ed = readFileSync(join(process.cwd(), 'src/components/IndividualEditor.jsx'), 'utf8');
    expect(ed).toContain('Düğmeler görünmüyorsa kişinin sembolüne yeniden tıklayın.');
    expect(ed).not.toContain('etrafındaki halkayı');
  });
});
