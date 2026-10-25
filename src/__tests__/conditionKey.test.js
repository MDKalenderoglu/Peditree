/**
 * conditionKey.test.js — findings marked as regions of the symbol, defined in
 * a legend (clinician requests 2026-10-24): each finding has a signature
 * (quadrant + fill), suggested automatically and changeable; the same finding
 * marks the same region on everyone; a carrier of a finding gets half of its
 * region; a plain "affected" without a finding stays a full fill.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { deriveConditionKey, fillFor, suggestStyle, keyEntry } from '../graph/conditionKey';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });

const S = () => usePedigreeStore.getState();
const person = (id) => S().doc.graph.individuals.find(i => i.id === id);
const key = () => S().doc.graph.conditionKey;
const labels = () => key().map(e => e.label);
const regionsOf = (id) => fillFor(person(id), key()).parts?.map(p => `${p.region}:${p.fill}${p.carrier ? ':carrier' : ''}`);

describe('the legend follows the findings', () => {
  beforeEach(() => S().resetPedigree());

  it('proband with myopia, tall stature, arachnodactyly; a sister with myopia only: same region for the same finding', () => {
    S().addFinding('proband', 'Miyop');
    S().addFinding('proband', 'Uzun boy');
    S().addFinding('proband', 'Araknodaktili');
    S().addSiblingOfCategory('female');
    const sister = S().wizardData.siblings.female[0].id;
    S().addFinding(sister, 'miyop '); // same finding, other spelling
    expect(labels()).toEqual(['Miyop', 'Uzun boy', 'Araknodaktili']);
    // the proband stays fully filled (clinician decision 2026-10-25); the
    // findings' regions mark the relatives
    expect(fillFor(person('proband'), key())).toEqual({ mode: 'full' });
    expect(regionsOf(sister)).toEqual(['q1:solid']);
    expect(fillFor(person('mother'), key())).toEqual({ mode: 'none' });
    expect(person('proband').affected).toBe(true);
    expect(S().pedigreeData.conditionKey).toEqual(key()); // the renderer gets the same key
  });

  it('a single finding marks its region on a relative (the clinician paints a quarter); the proband stays full', () => {
    S().addFinding('mother', 'Miyop', { region: 'q2', fill: 'solid' });
    expect(regionsOf('mother')).toEqual(['q2:solid']);
    S().addFinding('proband', 'Miyop');
    expect(fillFor(person('proband'), key())).toEqual({ mode: 'full' });
  });

  it('the clinician chooses region and fill; a taken signature is refused; style can change later', () => {
    S().addFinding('father', 'A', { region: 'q3', fill: 'hatch' });
    expect(keyEntry(key(), 'A')).toMatchObject({ region: 'q3', fill: 'hatch' });
    const before = S().doc;
    S().addFinding('mother', 'B', { region: 'q3', fill: 'hatch' });
    expect(S().doc).toBe(before);
    expect(S().actionNotice.message).toMatch(/başka bir bulguda/);
    S().setFindingStyle('A', { region: 'q1', fill: 'dots' });
    expect(regionsOf('father')).toEqual(['q1:dots']);
  });

  it('suggestion: four quadrants in solid first, then other fills', () => {
    const k = ['q1', 'q2', 'q3', 'q4'].map((r, i) => ({ id: `k${i}`, label: `F${i}`, region: r, fill: 'solid' }));
    expect(suggestStyle([])).toEqual({ region: 'q1', fill: 'solid' });
    expect(suggestStyle(k)).toEqual({ region: 'q1', fill: 'hatch' });
  });

  it('a finding keeps its signature while others come and go; an unused finding leaves the legend', () => {
    S().addFinding('mother', 'A');
    S().addFinding('father', 'B');
    S().addFinding('proband', 'C');
    expect(keyEntry(key(), 'B').region).toBe('q2');
    S().setFindingStatus('mother', 'A', 'none');
    expect(labels()).toEqual(['B', 'C']);
    expect(keyEntry(key(), 'B').region).toBe('q2');
    S().addFinding('mother', 'D');
    expect(keyEntry(key(), 'D').region).toBe('q1'); // the freed quadrant
  });

  it('carrier of a finding: half of its region; plain affected: full; person-level carrier: none (half fill)', () => {
    S().addFinding('proband', 'Miyop');
    S().setFindingStatus('proband', 'Miyop', 'carrier');
    expect(regionsOf('proband')).toEqual(['q1:solid:carrier']);
    const part = fillFor(person('proband'), key()).parts[0];
    expect(part.a1 - part.a0).toBe(45);
    // the proband opens marked affected (clinician request 2026-10-25): a
    // finding made carrier never erases an "affected" it did not set
    expect(person('proband').affected).toBe(true);
    expect(fillFor({ affected: true }, key())).toEqual({ mode: 'full' });
    expect(fillFor({ carrier: true }, key())).toEqual({ mode: 'none' });
  });

  it('two findings of one person sharing a quadrant split it', () => {
    const k = [{ id: 'k1', label: 'A', region: 'q1', fill: 'solid' }, { id: 'k2', label: 'B', region: 'q1', fill: 'hatch' }];
    const f = fillFor({ conditions: [{ label: 'A', status: 'affected' }, { label: 'B', status: 'affected' }] }, k);
    expect(f.parts.map(p => [p.fill, p.a0, p.a1])).toEqual([['solid', 180, 225], ['hatch', 225, 270]]);
  });

  it('renaming a finding on the key renames it for everyone; a name already in use is refused', () => {
    S().addFinding('mother', 'Miyp');
    S().addFinding('father', 'Miyp');
    S().addFinding('proband', 'OSB');
    S().renameFinding('Miyp', 'Miyop');
    expect(labels()).toEqual(['Miyop', 'OSB']);
    expect(['mother', 'father'].every(id => person(id).conditions.some(c => c.label === 'Miyop'))).toBe(true);
    const before = S().doc;
    S().renameFinding('Miyop', 'osb');
    expect(S().doc).toBe(before);
    expect(S().actionNotice.message).toMatch(/başka bir bulgu/);
  });

  it('save → load keeps the legend with its signatures', () => {
    S().addFinding('proband', 'Miyop', { region: 'q4', fill: 'grey' });
    const file = S().exportProjectFile();
    S().resetPedigree();
    S().openProjectFile(file);
    expect(keyEntry(key(), 'Miyop')).toMatchObject({ region: 'q4', fill: 'grey' });
  });

  it('deriveConditionKey: empty labels ignored; entries from before styles get a signature', () => {
    const g = { individuals: [{ id: 'a', conditions: [{ label: '  ' }, { label: 'X' }, { label: 'Y' }] }], conditionKey: [{ id: 'k1', label: 'Y' }] };
    expect(deriveConditionKey(g).conditionKey).toEqual([
      { id: 'k1', label: 'Y', region: 'q1', fill: 'solid' },
      { id: 'k2', label: 'X', region: 'q2', fill: 'solid' },
    ]);
  });
});

describe('renderer contract', () => {
  const src = readFileSync(join(process.cwd(), 'src/components/PedigreeCanvas.jsx'), 'utf8');
  it('regions are drawn from the shared fill rule and the legend is inside the SVG', () => {
    expect(src).toMatch(/fillFor\(d, conditionKey\)/);
    expect(src).toMatch(/svg\.append\('g'\)\.attr\('class', 'condition-legend'\)/);
  });
  it('two findings never read as one: quadrant lines and a white gap the page style cannot paint over', () => {
    expect(src).toMatch(/region-divider/);
    expect(src).toMatch(/attr\('stroke', NODE_FILL\)/);
    const css = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8');
    expect(css).toMatch(/\.node-group \.condition-regions path \{\s*stroke: #ffffff;/);
  });
  it('every text on the page can be corrected where it stands; the notes title is "Notlar"', () => {
    for (const kind of ["'patientName'", "'finding'", "'displayLabel'", "'condition'"]) expect(src).toContain(`, ${kind}, `);
    expect(src).toContain('ageLine.kind, d.id, ageLine.value');
    for (const kind of ["['note',", "['causeOfDeath',", "['condition',"]) expect(src).toContain(kind);
    expect(src).toMatch(/className="inline-edit"/);
    expect(src).toMatch(/\.text\('Notlar'\)/);
    expect(src).not.toMatch(/Klinik Notlar/);
  });
  it('note markers under symbols use the notes legend numbering', () => {
    expect(src).toMatch(/notedNodes\.indexOf\(d\)/);
  });
});
