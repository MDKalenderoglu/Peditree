/**
 * layoutInvariantsCheckerCorrectness.test.js — v0.5 Step 3 + 3C.
 *
 * Regression tests for the layout-fuzz invariant checkers themselves (not
 * the layout engine). Guards against two real bugs found via the fuzz
 * harness's own evidence trail, both in `checkUnrelatedFamilyBlockOverlap`:
 *
 * Step 3: it used to compute ONE global x-bbox per root union by flattening
 * every descendant across ALL generations, which could inflate a root's
 * bbox using a convergent partner's position from a totally different
 * generation/row — producing a false UNRELATED_FAMILY_BLOCK_OVERLAP even
 * when no two nodes ever shared a visual row. Fixed by comparing bboxes PER
 * GENERATION instead.
 *
 * Step 3C: even per-generation, a root's occupied space was still a single
 * convex min/max SPAN across its own members — but a root's own two
 * founding partners can legitimately end up far apart (the recursive
 * packer's multi-union placement pulls a married-in partner who separately
 * owns another union away from their birth-family position; see
 * PEDIGREE_LAYOUT_ENGINE_REDESIGN_PLAN.md's tracked follow-up). Treating
 * the raw span between them as "solid family territory" flagged anything
 * unrelated that merely sat in the EMPTY corridor between the two, with no
 * actual symbol overlap. Fixed by comparing DISJOINT occupied intervals
 * (each member's own symbol box) instead of one convex span.
 *
 * These tests exist so a future change to the checker can't silently
 * reintroduce any of: missing real overlaps, flagging cross-generation
 * numerical coincidences, or flagging empty-corridor coincidences.
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

describe('checkUnrelatedFamilyBlockOverlap — disjoint occupied-interval correctness (Step 3C)', () => {
  // Shared shape for tests 1/2/4: root U_MAT_GP's own two founding partners
  // (mat_gf, mat_gm) end up far apart — mat_gf stays put, mat_gm is pulled
  // away because she independently owns a second, unrelated marriage
  // elsewhere (the exact pattern found in the fuzz evidence: a married-in
  // partner who separately anchors another root union). An unrelated third
  // root (U_MID) sits numerically BETWEEN mat_gf and mat_gm, in what used
  // to be treated as U_MAT_GP's "territory" under the old convex-span model.
  function farApartPartnersFixture({ midGeneration = 1, midX = 400, touchesMatGf = false } = {}) {
    const individuals = [
      { id: 'mat_gf', sex: 'male', generation: 1 }, { id: 'mat_gm', sex: 'female', generation: 1 },
      { id: 'mother', sex: 'female', generation: 2 },
      { id: 'mid_a', sex: 'female', generation: midGeneration }, { id: 'mid_b', sex: 'male', generation: midGeneration },
    ];
    const unions = [
      { id: 'U_MAT_GP', partners: ['mat_gf', 'mat_gm'] },
      { id: 'U_MID', partners: ['mid_a', 'mid_b'] },
    ];
    const parentChildRelationships = [{ unionId: 'U_MAT_GP', children: ['mother'] }];
    const nodes = [
      { id: 'mat_gf', x: 0, y: 100, generation: 1 },
      { id: 'mat_gm', x: 800, y: 100, generation: 1 }, // far from mat_gf — no marriage bridges U_MID
      { id: 'mother', x: 400, y: 250, generation: 2 },
      { id: 'mid_a', x: touchesMatGf ? 10 : midX, y: midGeneration === 1 ? 100 : 900, generation: midGeneration },
      { id: 'mid_b', x: (touchesMatGf ? 10 : midX) + 70, y: midGeneration === 1 ? 100 : 900, generation: midGeneration },
    ];
    return { individuals, unions, parentChildRelationships, nodes, edges: [] };
  }

  it('Test 1 — does NOT flag an unrelated block sitting in the empty corridor between two far-apart root partners', () => {
    const pd = farApartPartnersFixture({ midGeneration: 1, midX: 400 });
    const violations = checkAllInvariants(pd);
    expect(violations.find(v => v.code === 'UNRELATED_FAMILY_BLOCK_OVERLAP')).toBeUndefined();
  });

  it('Test 2 — same shape, unrelated block near the OTHER end of the corridor: still not flagged (convex hull would have caught this, disjoint intervals must not)', () => {
    const pd = farApartPartnersFixture({ midGeneration: 1, midX: 600 });
    const violations = checkAllInvariants(pd);
    expect(violations.find(v => v.code === 'UNRELATED_FAMILY_BLOCK_OVERLAP')).toBeUndefined();
  });

  it('Test 3 — true positive still caught: an unrelated member whose symbol box genuinely touches a far-apart partner\'s own symbol box', () => {
    const pd = farApartPartnersFixture({ midGeneration: 1, touchesMatGf: true }); // mid_a/mid_b placed AT mat_gf's own position
    const violations = checkAllInvariants(pd);
    const hit = violations.find(v => v.code === 'UNRELATED_FAMILY_BLOCK_OVERLAP');
    expect(hit).toBeDefined();
    expect(hit.message).toMatch(/generation 1/);
  });

  it('Test 4 — generation-awareness preserved even with far-apart partners: unrelated block at a DIFFERENT generation, numerically inside the corridor, is not flagged', () => {
    const pd = farApartPartnersFixture({ midGeneration: 5, midX: 400 });
    const violations = checkAllInvariants(pd);
    expect(violations.find(v => v.code === 'UNRELATED_FAMILY_BLOCK_OVERLAP')).toBeUndefined();
  });
});
