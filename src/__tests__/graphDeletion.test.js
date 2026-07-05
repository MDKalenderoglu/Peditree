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

  it('removing a union partner removes the whole union', () => {
    const result = applyIndividualDeletions(sampleGraph(), ['a']);
    expect(result.unions).toHaveLength(0);
  });

  it('removing a union partner removes its parentChildRelationship entirely', () => {
    const result = applyIndividualDeletions(sampleGraph(), ['a']);
    expect(result.parentChildRelationships).toHaveLength(0);
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
