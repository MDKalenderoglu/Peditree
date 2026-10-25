/**
 * sidewaysMove.test.js — moving a person left / right (Shift+arrows,
 * dragging; clinician request 2026-10-25): partners swap sides, siblings
 * change birth order, nothing else moves.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
const S = () => usePedigreeStore.getState();
const x = (id) => S().pedigreeData.nodes.find(n => n.id === id).x;
const sibs = () => S().doc.graph.parentChildRelationships.find(r => r.children.includes('proband')).children;

describe('moving sideways', () => {
  it('the mother moves to the father’s left and stays there across later edits; undo puts her back', () => {
    S().resetPedigree();
    expect(x('father')).toBeLessThan(x('mother'));
    S().moveSideways('mother', 'left');
    expect(x('mother')).toBeLessThan(x('father'));
    S().addSiblingTo('proband', 'male');
    S().relayout();
    expect(x('mother')).toBeLessThan(x('father'));
    S().undo(); S().undo(); S().undo();
    expect(x('father')).toBeLessThan(x('mother'));
  });

  it('a sibling moves one place in the birth order; dragging onto a sibling takes its place', () => {
    S().resetPedigree();
    S().addSiblingTo('proband', 'male');
    S().addSiblingTo('proband', 'female');
    const [a, b, c] = sibs();
    S().moveSideways(c, 'left');
    expect(sibs()).toEqual([a, c, b]);
    S().dropOnto(c, a);
    expect(sibs()).toEqual([c, a, b]);
    expect(x(c)).toBeLessThan(x(a));
  });

  it('nowhere to go: nothing moves and the reason is shown', () => {
    S().resetPedigree();
    const before = S().doc;
    S().moveSideways('proband', 'left');
    expect(S().doc).toBe(before);
    expect(S().actionNotice.message).toMatch(/yer değiştirebileceği/);
    S().dropOnto('proband', 'mother');
    expect(S().doc).toBe(before);
  });

  it('a move against known ages is made and said', () => {
    S().resetPedigree();
    S().addSiblingTo('proband', 'male');
    const [p, b] = sibs();
    S().updateIndividual(p, { age: '20' });
    S().updateIndividual(b, { age: '10' });
    S().moveSideways(b, 'left');
    expect(sibs()).toEqual([b, p]);
    expect(S().actionNotice.message).toMatch(/yaşlarla uyuşmuyor/);
  });
});
