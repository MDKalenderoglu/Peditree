/**
 * pedigreeNumbering.test.js — v0.3a.3 pedigree-standard I-1/II-1 IDs.
 */
import { describe, it, expect } from 'vitest';
import { toRomanNumeral, computePedigreeIds } from '../utils/pedigreeNumbering';
import { buildPedigreeFromWizard } from '../builder/pedigreeBuilderFromWizard';
import { computePedigreeLayout } from '../utils/pedigreeLayout';
import { baseState } from './helpers';

describe('pedigreeNumbering — toRomanNumeral', () => {
  it('converts 1 through 10 correctly', () => {
    expect(toRomanNumeral(1)).toBe('I');
    expect(toRomanNumeral(2)).toBe('II');
    expect(toRomanNumeral(3)).toBe('III');
    expect(toRomanNumeral(4)).toBe('IV');
    expect(toRomanNumeral(5)).toBe('V');
    expect(toRomanNumeral(6)).toBe('VI');
    expect(toRomanNumeral(9)).toBe('IX');
    expect(toRomanNumeral(10)).toBe('X');
  });

  it('handles larger values (e.g. many-generation pedigrees) gracefully', () => {
    expect(toRomanNumeral(11)).toBe('XI');
    expect(toRomanNumeral(20)).toBe('XX');
  });

  it('returns empty string for invalid input rather than throwing', () => {
    expect(toRomanNumeral(0)).toBe('');
    expect(toRomanNumeral(-1)).toBe('');
    expect(toRomanNumeral(NaN)).toBe('');
    expect(toRomanNumeral(undefined)).toBe('');
  });
});

describe('pedigreeNumbering — computePedigreeIds (pure)', () => {
  it('returns an empty map for no nodes', () => {
    expect(computePedigreeIds([]).size).toBe(0);
    expect(computePedigreeIds(undefined).size).toBe(0);
  });

  it('assigns the oldest generation as "I" regardless of its raw internal generation number', () => {
    // Internal generations can be 0, negative (great-grandparents), etc. —
    // the DISPLAYED Roman numeral must still start at I for whichever
    // generation is oldest among the nodes actually present.
    const nodes = [
      { id: 'a', generation: -1, x: 100 },
      { id: 'b', generation: 0, x: 100 },
      { id: 'c', generation: 1, x: 100 },
    ];
    const ids = computePedigreeIds(nodes);
    expect(ids.get('a').generationLabel).toBe('I');
    expect(ids.get('b').generationLabel).toBe('II');
    expect(ids.get('c').generationLabel).toBe('III');
  });

  it('numbers individuals within a generation left-to-right by x position', () => {
    const nodes = [
      { id: 'right', generation: 1, x: 300 },
      { id: 'left', generation: 1, x: 100 },
      { id: 'middle', generation: 1, x: 200 },
    ];
    const ids = computePedigreeIds(nodes);
    expect(ids.get('left').indexInGeneration).toBe(1);
    expect(ids.get('middle').indexInGeneration).toBe(2);
    expect(ids.get('right').indexInGeneration).toBe(3);
  });

  it('produces the expected displayId format "ROMAN-N"', () => {
    const nodes = [{ id: 'a', generation: 2, x: 100 }, { id: 'b', generation: 2, x: 200 }];
    const ids = computePedigreeIds(nodes);
    expect(ids.get('a').displayId).toBe('I-1');
    expect(ids.get('b').displayId).toBe('I-2');
  });

  it('numbers each generation independently starting at 1', () => {
    const nodes = [
      { id: 'gen1_a', generation: 1, x: 100 },
      { id: 'gen1_b', generation: 1, x: 200 },
      { id: 'gen2_a', generation: 2, x: 100 },
    ];
    const ids = computePedigreeIds(nodes);
    expect(ids.get('gen1_a').displayId).toBe('I-1');
    expect(ids.get('gen1_b').displayId).toBe('I-2');
    expect(ids.get('gen2_a').displayId).toBe('II-1'); // resets to 1 in the next generation
  });

  it('reorder (x position swap) renumbers correctly — proves birth-order reorder updates numbering', () => {
    const before = [
      { id: 'a', generation: 1, x: 100 },
      { id: 'b', generation: 1, x: 200 },
    ];
    const beforeIds = computePedigreeIds(before);
    expect(beforeIds.get('a').indexInGeneration).toBe(1);
    expect(beforeIds.get('b').indexInGeneration).toBe(2);

    // Simulate a birth-order reorder swapping their x positions.
    const after = [
      { id: 'a', generation: 1, x: 200 },
      { id: 'b', generation: 1, x: 100 },
    ];
    const afterIds = computePedigreeIds(after);
    expect(afterIds.get('b').indexInGeneration).toBe(1);
    expect(afterIds.get('a').indexInGeneration).toBe(2);
  });
});

describe('pedigreeNumbering — integration with a real built + laid-out pedigree', () => {
  it('a 3+ generation pedigree produces I/II/III generation labels', () => {
    const state = baseState();
    const graph = buildPedigreeFromWizard(state);
    const layout = computePedigreeLayout(graph);
    const ids = computePedigreeIds(layout.nodes);

    const labels = new Set([...ids.values()].map(v => v.generationLabel));
    expect(labels.has('I')).toBe(true);
    expect(labels.has('II')).toBe(true);
    expect(labels.has('III')).toBe(true);
  });

  it('every node gets a unique displayId within its generation', () => {
    const state = baseState();
    state.maternalRelatives.uncles = [
      { id: '_mu0', children: { male: 1, female: 1, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
    ];
    const graph = buildPedigreeFromWizard(state);
    const layout = computePedigreeLayout(graph);
    const ids = computePedigreeIds(layout.nodes);

    const displayIds = [...ids.values()].map(v => v.displayId);
    expect(new Set(displayIds).size).toBe(displayIds.length);
  });

  it('every node in the graph receives a pedigree ID (no missing entries)', () => {
    const state = baseState();
    const graph = buildPedigreeFromWizard(state);
    const layout = computePedigreeLayout(graph);
    const ids = computePedigreeIds(layout.nodes);
    expect(ids.size).toBe(layout.nodes.length);
  });
});
