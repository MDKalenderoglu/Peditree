/**
 * conditionKey.test.js — several findings in one pedigree (clinician request
 * 2026-10-24): each finding owns a region of the symbol, defined in the
 * legend; a person's symbol fills only the regions of their own findings.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { deriveConditionKey, fillFor, regionAngles, keyIndex } from '../graph/conditionKey';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });

const S = () => usePedigreeStore.getState();
const person = (id) => S().doc.graph.individuals.find(i => i.id === id);
const key = () => S().doc.graph.conditionKey.map(e => e.label);
const affected = (...labels) => labels.map(label => ({ label, status: 'affected' }));

describe('the legend follows the findings', () => {
  beforeEach(() => S().resetPedigree());

  it('proband with myopia, tall stature, arachnodactyly; uncle-side relatives with myopia only', () => {
    S().updateIndividual('proband', { conditions: affected('Miyop', 'Uzun boy', 'Araknodaktili') });
    S().addSiblingOfCategory('female');
    const sister = S().wizardData.siblings.female[0].id;
    S().updateIndividual(sister, { conditions: affected('miyop ') }); // same finding, other spelling
    expect(key()).toEqual(['Miyop', 'Uzun boy', 'Araknodaktili']);
    const k = S().doc.graph.conditionKey;
    expect(fillFor(person('proband'), k)).toEqual({ mode: 'segments', count: 4, filled: [0, 1, 2], carriers: [] });
    expect(fillFor(person(sister), k)).toEqual({ mode: 'segments', count: 4, filled: [0], carriers: [] });
    expect(fillFor(person('mother'), k)).toEqual({ mode: 'none' });
    expect(S().pedigreeData.conditionKey).toEqual(k); // the renderer gets the same key
  });

  it('a finding keeps its region while others are added; an unused finding leaves the legend', () => {
    S().updateIndividual('mother', { conditions: affected('A') });
    S().updateIndividual('father', { conditions: affected('B') });
    S().updateIndividual('proband', { conditions: affected('C') });
    expect(keyIndex(S().doc.graph.conditionKey, 'B')).toBe(1);
    S().updateIndividual('mother', { conditions: [] });
    expect(key()).toEqual(['B', 'C']);
    S().updateIndividual('mother', { conditions: affected('D') });
    expect(key()).toEqual(['B', 'C', 'D']);
    expect(S().doc.graph.conditionKey.map(e => e.id)).toEqual(['k2', 'k3', 'k4']);
  });

  it('one finding in the pedigree: classic solid fill; affected without a finding: solid', () => {
    const k = [{ id: 'k1', label: 'Miyop' }];
    expect(fillFor({ conditions: affected('Miyop') }, k)).toEqual({ mode: 'full' });
    expect(fillFor({ affected: true }, [...k, { id: 'k2', label: 'X' }])).toEqual({ mode: 'full' });
    expect(fillFor({ carrier: true }, k)).toEqual({ mode: 'none' }); // person-level carrier: half fill, unchanged
    expect(fillFor({ conditions: [{ label: 'Miyop', status: 'carrier' }] }, k)).toEqual({ mode: 'carrier' });
  });

  it('a carrier of one finding gets that region marked, not filled', () => {
    const k = [{ id: 'k1', label: 'A' }, { id: 'k2', label: 'B' }];
    expect(fillFor({ conditions: [{ label: 'B', status: 'carrier' }] }, k)).toEqual({ mode: 'segments', count: 4, filled: [], carriers: [1] });
  });

  it('regions: quadrants clockwise from upper-left; more than four findings: equal sectors from 12 o’clock', () => {
    expect([0, 1, 2, 3].map(i => regionAngles(i, 4))).toEqual([[180, 270], [270, 360], [360, 450], [450, 540]]);
    expect(regionAngles(0, 6)).toEqual([-90, -30]);
    expect(fillFor({ conditions: affected('E') }, 'ABCDE'.split('').map((l, i) => ({ id: `k${i}`, label: l }))).count).toBe(5);
  });

  it('save → load keeps the legend', () => {
    S().updateIndividual('proband', { conditions: affected('Miyop', 'Uzun boy') });
    const file = S().exportProjectFile();
    S().resetPedigree();
    S().openProjectFile(file);
    expect(key()).toEqual(['Miyop', 'Uzun boy']);
  });

  it('deriveConditionKey ignores empty labels and works on a graph without a key', () => {
    const g = { individuals: [{ id: 'a', conditions: [{ label: '  ' }, { label: 'X' }] }] };
    expect(deriveConditionKey(g).conditionKey).toEqual([{ id: 'k1', label: 'X' }]);
  });
});

describe('renderer contract', () => {
  const src = readFileSync(join(process.cwd(), 'src/components/PedigreeCanvas.jsx'), 'utf8');
  it('regions are drawn from the shared fill rule and the legend is inside the SVG', () => {
    expect(src).toMatch(/fillFor\(d, conditionKey\)/);
    expect(src).toMatch(/condition-legend/);
    expect(src).toMatch(/svg\.append\('g'\)\.attr\('class', 'condition-legend'\)/);
  });
  it('note markers under symbols use the notes legend numbering', () => {
    expect(src).toMatch(/notedNodes\.indexOf\(d\)/);
  });
});
