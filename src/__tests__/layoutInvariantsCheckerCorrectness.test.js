/**
 * layoutInvariantsCheckerCorrectness.test.js — v0.5 Step 3.
 *
 * Regression tests for the layout-fuzz invariant checkers themselves (not
 * the layout engine). Guards against a real bug found via the fuzz
 * harness's own evidence trail: `checkUnrelatedFamilyBlockOverlap` used to
 * compute ONE global x-bbox per root union by flattening every descendant
 * across ALL generations, which could inflate a root's bbox using a
 * convergent partner's position from a totally different generation/row —
 * producing a false UNRELATED_FAMILY_BLOCK_OVERLAP even when no two nodes
 * ever shared a visual row. The fix compares bboxes PER GENERATION instead.
 *
 * These tests exist so a future change to the checker can't silently
 * reintroduce either failure mode: missing real overlaps, or flagging
 * cross-generation numerical coincidences that a viewer could never
 * perceive as a collision.
 */
import { describe, it, expect } from 'vitest';
import { checkAllInvariants } from '../audit/layoutInvariants';

describe('checkUnrelatedFamilyBlockOverlap — per-generation correctness', () => {
  it('still catches a genuine same-generation overlap between unrelated families', () => {
    const individuals = [
      { id: 'a1', sex: 'female', generation: 1 }, { id: 'a2', sex: 'male', generation: 1 },
      { id: 'a3', sex: 'unknown', generation: 2 },
      { id: 'b1', sex: 'female', generation: 1 }, { id: 'b2', sex: 'male', generation: 1 },
      { id: 'b3', sex: 'unknown', generation: 2 },
    ];
    const unions = [
      { id: 'UA', partners: ['a1', 'a2'] },
      { id: 'UB', partners: ['b1', 'b2'] },
    ];
    const parentChildRelationships = [
      { unionId: 'UA', children: ['a3'] },
      { unionId: 'UB', children: ['b3'] },
    ];
    // Family A occupies gen1 x=[0,70]; Family B occupies gen1 x=[30,100] —
    // a decisive 40px overlap in the SAME row, no marriage bridges them.
    const nodes = [
      { id: 'a1', x: 0, y: 100, generation: 1 }, { id: 'a2', x: 70, y: 100, generation: 1 },
      { id: 'a3', x: 35, y: 250, generation: 2 },
      { id: 'b1', x: 30, y: 100, generation: 1 }, { id: 'b2', x: 100, y: 100, generation: 1 },
      { id: 'b3', x: 65, y: 250, generation: 2 },
    ];
    const violations = checkAllInvariants({ individuals, unions, parentChildRelationships, nodes, edges: [] });
    const hit = violations.find(v => v.code === 'UNRELATED_FAMILY_BLOCK_OVERLAP');
    expect(hit).toBeDefined();
    expect(hit.message).toMatch(/generation 1/);
  });

  it('does NOT flag two family blocks in different generations that only numerically overlap in X', () => {
    const individuals = [
      { id: 'a1', sex: 'female', generation: 1 }, { id: 'a2', sex: 'male', generation: 1 },
      { id: 'c1', sex: 'female', generation: 5 }, { id: 'c2', sex: 'male', generation: 5 },
    ];
    const unions = [
      { id: 'UA', partners: ['a1', 'a2'] },
      { id: 'UC', partners: ['c1', 'c2'] },
    ];
    // Same X range, but generation 1 vs generation 5 — never the same row.
    const nodes = [
      { id: 'a1', x: 0, y: 100, generation: 1 }, { id: 'a2', x: 70, y: 100, generation: 1 },
      { id: 'c1', x: 10, y: 900, generation: 5 }, { id: 'c2', x: 60, y: 900, generation: 5 },
    ];
    const violations = checkAllInvariants({ individuals, unions, parentChildRelationships: [], nodes, edges: [] });
    expect(violations.find(v => v.code === 'UNRELATED_FAMILY_BLOCK_OVERLAP')).toBeUndefined();
  });

  it('still allows two blocks bridged by a convergent marriage to touch/overlap', () => {
    const individuals = [
      { id: 'gpA1', sex: 'female', generation: 1 }, { id: 'gpA2', sex: 'male', generation: 1 },
      { id: 'gpB1', sex: 'female', generation: 1 }, { id: 'gpB2', sex: 'male', generation: 1 },
      { id: 'mom', sex: 'female', generation: 2 }, { id: 'dad', sex: 'male', generation: 2 },
      { id: 'kid', sex: 'unknown', generation: 3 },
    ];
    const unions = [
      { id: 'UGA', partners: ['gpA1', 'gpA2'] },
      { id: 'UGB', partners: ['gpB1', 'gpB2'] },
      { id: 'UPARENTS', partners: ['mom', 'dad'] },
    ];
    const parentChildRelationships = [
      { unionId: 'UGA', children: ['mom'] },
      { unionId: 'UGB', children: ['dad'] },
      { unionId: 'UPARENTS', children: ['kid'] },
    ];
    const nodes = [
      { id: 'gpA1', x: 0, y: 100, generation: 1 }, { id: 'gpA2', x: 70, y: 100, generation: 1 },
      { id: 'gpB1', x: 100, y: 100, generation: 1 }, { id: 'gpB2', x: 170, y: 100, generation: 1 },
      { id: 'mom', x: 60, y: 250, generation: 2 }, { id: 'dad', x: 130, y: 250, generation: 2 },
      { id: 'kid', x: 95, y: 400, generation: 3 },
    ];
    const violations = checkAllInvariants({ individuals, unions, parentChildRelationships, nodes, edges: [] });
    expect(violations.find(v => v.code === 'UNRELATED_FAMILY_BLOCK_OVERLAP')).toBeUndefined();
  });
});
