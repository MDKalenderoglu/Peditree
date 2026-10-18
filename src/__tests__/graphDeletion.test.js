/**
 * graphDeletion.test.js — v0.3a.2 pure graph-deletion overlay.
 */
import { describe, it, expect } from 'vitest';
import { applyIndividualDeletions } from '../utils/graphDeletion';

function sampleGraph() {
  return {
    individuals: [
      { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' },
    ],
    unions: [
      { id: 'U1', partners: ['a', 'b'] },
    ],
    parentChildRelationships: [
      { unionId: 'U1', children: ['c', 'd'] },
    ],
  };
}

describe('graphDeletion — applyIndividualDeletions', () => {
  it('returns the same graph reference when nothing is deleted', () => {
    const graph = sampleGraph();
    expect(applyIndividualDeletions(graph, [])).toBe(graph);
    expect(applyIndividualDeletions(graph, undefined)).toBe(graph);
  });

  it('removes the deleted individual from individuals', () => {
    const result = applyIndividualDeletions(sampleGraph(), ['c']);
    expect(result.individuals.map(i => i.id)).toEqual(['a', 'b', 'd']);
  });

  // v0.5 Faz 2a (DM-4): removing ONE parent used to drop the whole union,
  // silently cutting the children's link to the OTHER parent too. The
  // children now stay attached to the surviving parent through an explicit
  // "unspecified parent" placeholder in the deleted partner's slot.
  it('removing one partner of a union with children keeps the surviving parent link via a placeholder', () => {
    const result = applyIndividualDeletions(sampleGraph(), ['a']);
    expect(result.unions).toHaveLength(1);
    expect(result.unions[0].partners).toEqual(['U1__unspecified', 'b']);
    const ph = result.individuals.find(i => i.id === 'U1__unspecified');
    expect(ph).toMatchObject({ sex: 'unknown', placeholder: true });
    expect(result.parentChildRelationships).toEqual([{ unionId: 'U1', children: ['c', 'd'] }]);
  });

  it('removing both partners removes the union and its parentChildRelationship', () => {
    const result = applyIndividualDeletions(sampleGraph(), ['a', 'b']);
    expect(result.unions).toHaveLength(0);
    expect(result.parentChildRelationships).toHaveLength(0);
  });

  it('removing one partner of a childless union removes the union', () => {
    const g = sampleGraph();
    g.parentChildRelationships = [];
    const result = applyIndividualDeletions(g, ['a']);
    expect(result.unions).toHaveLength(0);
    expect(result.individuals.some(i => i.placeholder)).toBe(false);
  });

  it('removing one child leaves the union and PCR intact, minus that child', () => {
    const result = applyIndividualDeletions(sampleGraph(), ['c']);
    expect(result.unions).toHaveLength(1);
    expect(result.parentChildRelationships).toEqual([{ unionId: 'U1', children: ['d'] }]);
  });

  it('removing all children of a union drops the now-empty parentChildRelationship', () => {
    const result = applyIndividualDeletions(sampleGraph(), ['c', 'd']);
    expect(result.unions).toHaveLength(1); // union itself survives — only children removed
    expect(result.parentChildRelationships).toHaveLength(0);
  });

  it('deleting a parent orphans (does not cascade-delete) the children', () => {
    const result = applyIndividualDeletions(sampleGraph(), ['a']);
    expect(result.individuals.map(i => i.id)).toEqual(expect.arrayContaining(['c', 'd']));
  });

  it('never mutates the input graph', () => {
    const graph = sampleGraph();
    const snapshot = JSON.parse(JSON.stringify(graph));
    applyIndividualDeletions(graph, ['a', 'c']);
    expect(graph).toEqual(snapshot);
  });

  it('deleting an id not present in the graph is a safe no-op on structure', () => {
    const graph = sampleGraph();
    const result = applyIndividualDeletions(graph, ['nonexistent']);
    expect(result.individuals).toHaveLength(4);
    expect(result.unions).toHaveLength(1);
  });
});
