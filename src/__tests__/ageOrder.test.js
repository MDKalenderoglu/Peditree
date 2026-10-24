/**
 * ageOrder.test.js — entering an age puts the sibship in age order at once
 * (clinician request 2026-10-25): in every sibship, also one drawn in
 * insertion order (aunts / uncles, parents added from the ring) and one whose
 * order was set by hand; a sibling without an age stays where they were.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { ageOrder } from '../graph/finalize';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });

const S = () => usePedigreeStore.getState();
const sibshipOf = (id) => S().doc.graph.parentChildRelationships.find(r => r.children.includes(id));
const xOf = (id) => S().pedigreeData.nodes.find(n => n.id === id).x;
const leftToRight = (id) => [...sibshipOf(id).children].sort((a, b) => xOf(a) - xOf(b));

describe('ageOrder', () => {
  const k = (id, age, extra = {}) => ({ id, age, ...extra });
  it('sorts the aged among their places; the unaged keep theirs', () => {
    expect(ageOrder([k('a', ''), k('b', ''), k('c', '30')])).toEqual(['a', 'b', 'c']);
    expect(ageOrder([k('a', '5'), k('b', ''), k('c', '30')])).toEqual(['c', 'b', 'a']);
  });
  it('a group sorted by the earlier rule (aged first) is unchanged', () => {
    expect(ageOrder([k('a', '40'), k('b', '20'), k('c', ''), k('d', '')])).toEqual(['a', 'b', 'c', 'd']);
  });
  it('pregnancy losses then stillbirths follow the liveborn; in place they stay put', () => {
    const kids = [k('m', '', { pregnancyLoss: true }), k('a', '3'), k('s', '', { stillbirth: true }), k('b', '9')];
    expect(ageOrder(kids)).toEqual(['b', 'a', 'm', 's']);
    expect(ageOrder(kids, { inPlace: true })).toEqual(['m', 'b', 's', 'a']);
  });
});

describe('entering an age moves the sibling in the drawing', () => {
  it('the proband’s sibship', () => {
    S().resetPedigree();
    S().addSiblingTo('proband', 'male');
    S().addSiblingTo('proband', 'female');
    const [a, b, c] = sibshipOf('proband').children;
    S().updateIndividual(c, { age: '1' });
    expect(leftToRight('proband')).toEqual([a, b, c]); // the youngest's age alone moves nobody
    S().updateIndividual(a, { age: '30' });
    S().updateIndividual(b, { age: '12' });
    S().updateIndividual(a, { age: '8' });
    expect(leftToRight('proband')).toEqual([b, a, c]);
  });

  it('a sibship drawn in insertion order (the mother and her siblings)', () => {
    S().resetPedigree();
    S().addSiblingTo('mother', 'female');
    S().addSiblingTo('mother', 'male');
    const [m, , u] = sibshipOf('mother').children;
    S().updateIndividual(u, { age: '60' });
    S().updateIndividual(m, { age: '40' });
    const order = leftToRight('mother');
    expect(order.indexOf(u)).toBeLessThan(order.indexOf(m));
    expect((S().integrityIssues || []).filter(i => i.severity === 'error')).toEqual([]);
  });

  it('a hand-set order: aged siblings follow their ages, the others stay where they were put', () => {
    S().resetPedigree();
    S().addSiblingTo('proband', 'male');
    S().addSiblingTo('proband', 'female');
    S().addChildToUnion(sibshipOf('proband').unionId, 'unknown', { pregnancyLoss: true });
    const rel = sibshipOf('proband');
    const [a, b, c, loss] = rel.children;
    S().setChildOrder(rel.unionId, [a, loss, b, c]);
    S().updateIndividual(c, { age: '20' });
    S().updateIndividual(a, { age: '4' });
    expect(sibshipOf('proband').children).toEqual([c, loss, b, a]);
    expect(sibshipOf('proband').birthOrderExplicit).toBe(true);
  });

  it('an age change is one undo step and undo restores the order', () => {
    S().resetPedigree();
    S().addSiblingTo('proband', 'male');
    S().updateIndividual('proband', { age: '10' });
    const before = [...sibshipOf('proband').children];
    S().updateIndividual(before[1], { age: '50' });
    expect(sibshipOf('proband').children).toEqual([before[1], before[0]]);
    S().undo();
    expect(sibshipOf('proband').children).toEqual(before);
  });
});
