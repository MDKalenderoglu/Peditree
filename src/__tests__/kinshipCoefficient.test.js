/**
 * kinshipCoefficient.test.js — Wright's kinship coefficient from the drawn
 * family, the inbreeding coefficient of a couple's children, and the Turkish
 * name of a first-cousin marriage (clinician request 2026-10-25; for
 * counselling and for comparing with homozygosity on arrays / exomes).
 */
import { describe, it, expect } from 'vitest';
import { kinshipCoefficient, childInbreeding, formatCoefficient, cousinMarriageName } from '../graph/kinship';

/** A tiny graph: couples [id, father, mother], children of each couple. */
function fam(spec) {
  const individuals = [];
  const unions = [];
  const parentChildRelationships = [];
  const add = (id, sex) => { if (!individuals.some(i => i.id === id)) individuals.push({ id, sex }); };
  for (const [uid, f, m, kids] of spec) {
    add(f, 'male'); add(m, 'female');
    unions.push({ id: uid, partners: [f, m] });
    for (const [k, sex] of kids) add(k, sex);
    parentChildRelationships.push({ unionId: uid, children: kids.map(([k]) => k) });
  }
  return { individuals, unions, parentChildRelationships, socialParentLinks: [] };
}

// grandparents G1 × G2 → A (m), B (f), C (m); A × a' → x ; B × b' → y ; C × c' → z
const cousins = () => fam([
  ['UG', 'G1', 'G2', [['A', 'male'], ['B', 'female'], ['C', 'male']]],
  ['UA', 'A', 'a2', [['x', 'male']]],
  ['UB', 'b1', 'B', [['y', 'female']]],
  ['UC', 'C', 'c2', [['z', 'female']]],
]);

describe('kinship coefficient φ', () => {
  it('known values: self 1/2, parent–child 1/4, siblings 1/4, uncle–niece 1/8, first cousins 1/16, unrelated 0', () => {
    const g = cousins();
    expect(kinshipCoefficient(g, 'A', 'A')).toBe(1 / 2);
    expect(kinshipCoefficient(g, 'A', 'x')).toBe(1 / 4);
    expect(kinshipCoefficient(g, 'A', 'B')).toBe(1 / 4);
    expect(kinshipCoefficient(g, 'A', 'y')).toBe(1 / 8);
    expect(kinshipCoefficient(g, 'x', 'y')).toBe(1 / 16);
    expect(kinshipCoefficient(g, 'a2', 'b1')).toBe(0);
    expect(kinshipCoefficient(g, 'x', 'y')).toBe(kinshipCoefficient(g, 'y', 'x'));
  });

  it('second cousins 1/64; double first cousins 1/8', () => {
    const second = fam([
      ['UG', 'G1', 'G2', [['A', 'male'], ['B', 'female']]],
      ['UA', 'A', 'a2', [['p', 'male']]],
      ['UB', 'b1', 'B', [['q', 'female']]],
      ['UP', 'p', 'p2', [['x', 'male']]],
      ['UQ', 'q1', 'q', [['y', 'female']]],
    ]);
    expect(kinshipCoefficient(second, 'x', 'y')).toBe(1 / 64);
    // two brothers marry two sisters
    const double = fam([
      ['U1', 'G1', 'G2', [['A', 'male'], ['C', 'male']]],
      ['U2', 'H1', 'H2', [['B', 'female'], ['D', 'female']]],
      ['UA', 'A', 'B', [['x', 'male']]],
      ['UC', 'C', 'D', [['y', 'female']]],
    ]);
    expect(kinshipCoefficient(double, 'x', 'y')).toBe(1 / 8);
  });

  it('a child of first cousins is inbred (F = 1/16); inbreeding raises the self-kinship', () => {
    const g = cousins();
    g.unions.push({ id: 'UXY', partners: ['x', 'y'] });
    g.individuals.push({ id: 'k', sex: 'male' });
    g.parentChildRelationships.push({ unionId: 'UXY', children: ['k'] });
    expect(childInbreeding(g, 'UXY')).toBe(1 / 16);
    expect(kinshipCoefficient(g, 'k', 'k')).toBe((1 + 1 / 16) / 2);
  });

  it('adoptive (social) parents do not count; a placeholder parent is unrelated', () => {
    const g = cousins();
    g.socialParentLinks.push({ childId: 'a2', unionId: 'UG', kind: 'adoptive' });
    expect(kinshipCoefficient(g, 'a2', 'A')).toBe(0);
  });
});

describe('written for the clinician', () => {
  it('a fraction and a percentage', () => {
    expect(formatCoefficient(1 / 16)).toBe('1/16 (%6,25)');
    expect(formatCoefficient(1 / 8)).toBe('1/8 (%12,5)');
    expect(formatCoefficient(5 / 64)).toBe('5/64 (%7,81)');
    expect(formatCoefficient(0)).toBe('0');
  });
  it('first-cousin marriages by the Turkish names: amca, teyze, hala–dayı çocukları', () => {
    const g = cousins();
    // x (father A) and z (father C): fathers are brothers
    expect(cousinMarriageName(g, 'x', 'z')).toBe('amca çocukları');
    // x (father A) and y (mother B): a brother and a sister
    expect(cousinMarriageName(g, 'x', 'y')).toBe('hala–dayı çocukları');
    const sisters = fam([
      ['UG', 'G1', 'G2', [['B', 'female'], ['D', 'female']]],
      ['UB', 'b1', 'B', [['x', 'male']]],
      ['UD', 'd1', 'D', [['y', 'female']]],
    ]);
    expect(cousinMarriageName(sisters, 'x', 'y')).toBe('teyze çocukları');
    expect(cousinMarriageName(g, 'A', 'B')).toBeNull(); // not first cousins
  });
});
