/**
 * relationshipSafety.test.js — v0.3a.2 audit-before-commit safety net for
 * relationship-creation actions ("make partners" / "make siblings").
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  introducesNewGraphErrors,
  describeNewGraphErrors,
  introducesNewLayoutAmbiguity,
  assessRelationshipMutation,
} from '../utils/relationshipSafety';
import { buildPedigreeFromWizard } from '../builder/pedigreeBuilderFromWizard';
import { auditPedigreeGraph } from '../utils/graphIntegrity';
import { computePedigreeLayout } from '../utils/pedigreeLayout';
import { auditLayoutIntegrity } from '../utils/layoutIntegrity';
import { baseState } from './helpers';
import { usePedigreeStore } from '../state/usePedigreeStore';

function tagIssues(issues, source) {
  return issues.map(i => ({ ...i, source }));
}

describe('relationshipSafety — introducesNewGraphErrors (pure)', () => {
  it('is false when nothing changed', () => {
    const issues = [{ severity: 'error', code: 'X', ids: ['a'] }];
    expect(introducesNewGraphErrors(issues, issues)).toBe(false);
  });

  it('is false when the same errors persist (no new ones)', () => {
    const before = [{ severity: 'error', code: 'X', ids: ['a'] }];
    const after = [{ severity: 'error', code: 'X', ids: ['a'] }];
    expect(introducesNewGraphErrors(before, after)).toBe(false);
  });

  it('is true when a genuinely new error appears', () => {
    const before = [];
    const after = [{ severity: 'error', code: 'SIBLING_GENERATION_INCONSISTENT', ids: ['U1', 'a', 'b'] }];
    expect(introducesNewGraphErrors(before, after)).toBe(true);
  });

  it('ignores warnings — only error severity counts', () => {
    const before = [];
    const after = [{ severity: 'warning', code: 'PROBAND_MISSING', ids: [] }];
    expect(introducesNewGraphErrors(before, after)).toBe(false);
  });

  it('is false when a pre-existing error is simply still there among other unrelated new warnings', () => {
    const before = [{ severity: 'error', code: 'X', ids: ['a'] }];
    const after = [
      { severity: 'error', code: 'X', ids: ['a'] },
      { severity: 'warning', code: 'Y', ids: [] },
    ];
    expect(introducesNewGraphErrors(before, after)).toBe(false);
  });
});

describe('relationshipSafety — describeNewGraphErrors (pure)', () => {
  it('describes the new error message in clear (non-code-only) language', () => {
    const before = [];
    const after = [{ severity: 'error', code: 'X', ids: ['a'], message: 'Test error message.' }];
    expect(describeNewGraphErrors(before, after)).toContain('Test error message.');
    expect(describeNewGraphErrors(before, after)).toMatch(/güvenli çizilemiyor/);
  });

  it('falls back to a generic clinical-language message if no new error is actually found', () => {
    expect(describeNewGraphErrors([], [])).toMatch(/güvenli çizilemiyor/);
  });
});

describe('relationshipSafety — introducesNewLayoutAmbiguity / assessRelationshipMutation (v0.3a.4)', () => {
  it('is false when the ambiguity count is unchanged', () => {
    const before = [{ severity: 'warning', code: 'SIBSHIP_BUS_OVERLAP', ids: ['U1', 'U2'] }];
    const after = [{ severity: 'warning', code: 'SIBSHIP_BUS_OVERLAP', ids: ['U1', 'U2'] }];
    expect(introducesNewLayoutAmbiguity(before, after)).toBe(false);
  });

  it('is true when the ambiguity count increases', () => {
    const before = [];
    const after = [{ severity: 'warning', code: 'SIBSHIP_BUS_OVERLAP', ids: ['U1', 'U2'] }];
    expect(introducesNewLayoutAmbiguity(before, after)).toBe(true);
  });

  it('counts EDGE_THROUGH_NODE toward ambiguity as well', () => {
    const before = [];
    const after = [{ severity: 'warning', code: 'EDGE_THROUGH_NODE', ids: ['x'] }];
    expect(introducesNewLayoutAmbiguity(before, after)).toBe(true);
  });

  it('is false when a pre-existing overlap simply persists (does not block unrelated edits)', () => {
    const before = [
      { severity: 'warning', code: 'SIBSHIP_BUS_OVERLAP', ids: ['U1', 'U2'] },
      { severity: 'warning', code: 'SIBSHIP_BUS_OVERLAP', ids: ['U3', 'U4'] },
    ];
    const after = [
      { severity: 'warning', code: 'SIBSHIP_BUS_OVERLAP', ids: ['U1', 'U2'] },
      { severity: 'warning', code: 'SIBSHIP_BUS_OVERLAP', ids: ['U3', 'U4'] },
    ];
    expect(introducesNewLayoutAmbiguity(before, after)).toBe(false);
  });

  it('assessRelationshipMutation blocks on a new graph error', () => {
    const before = [];
    const after = [{ severity: 'error', code: 'SIBLING_GENERATION_INCONSISTENT', ids: ['U1'], message: 'x' }];
    const result = assessRelationshipMutation(before, after);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/güvenli çizilemiyor/);
  });

  it('assessRelationshipMutation blocks on increased ambiguity with a readability-focused message', () => {
    const before = [];
    const after = [{ severity: 'warning', code: 'SIBSHIP_BUS_OVERLAP', ids: ['U1', 'U2'] }];
    const result = assessRelationshipMutation(before, after);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/okunamaz/);
  });

  it('assessRelationshipMutation does not block when nothing got worse', () => {
    const issues = [{ severity: 'warning', code: 'SIBSHIP_BUS_OVERLAP', ids: ['U1', 'U2'] }];
    expect(assessRelationshipMutation(issues, issues).blocked).toBe(false);
  });
});

describe('relationshipSafety — end-to-end detection against a real broken pedigree', () => {
  it('detects a SIBLING_GENERATION_INCONSISTENT error introduced by an unsafe custom-consanguinity link', () => {
    // Baseline: a clean pedigree with no errors.
    const cleanState = baseState();
    const cleanGraph = buildPedigreeFromWizard(cleanState);
    const cleanIssues = tagIssues(auditPedigreeGraph(cleanGraph), 'graph');

    // Unsafe mutation, bypassing the store's own pre-checks (computeSiblingCreationPlan
    // would normally block this at the UI layer) — directly construct a
    // customConsanguinity link between two individuals at different
    // generations (proband, gen 3, and mat_gf, gen 1), which the builder
    // will happily attach as "siblings" under a shared fabricated parent
    // pair, producing a real SIBLING_GENERATION_INCONSISTENT error.
    const brokenState = baseState();
    brokenState.customConsanguinity = [{ id: '_cc_0', type: 'siblings', person1: 'proband', person2: 'mat_gf' }];
    const brokenGraph = buildPedigreeFromWizard(brokenState);
    const brokenIssues = tagIssues(auditPedigreeGraph(brokenGraph), 'graph');

    expect(introducesNewGraphErrors(cleanIssues, brokenIssues)).toBe(true);
    const reason = describeNewGraphErrors(cleanIssues, brokenIssues);
    expect(reason).toMatch(/güvenli çizilemiyor/);
  });

  it('does NOT flag a safe custom-consanguinity link (same generation, no pre-existing parents) as introducing new errors', () => {
    const cleanState = baseState();
    const cleanGraph = buildPedigreeFromWizard(cleanState);
    const cleanIssues = tagIssues(auditPedigreeGraph(cleanGraph), 'graph');

    const safeState = baseState();
    safeState.graphEdits = [
      { type: 'addSpouse', targetId: 'mother', spouseId: 'de_sp_0', unionId: 'U_DE_0', spouseSex: 'male' },
      { type: 'addSpouse', targetId: 'father', spouseId: 'de_sp_1', unionId: 'U_DE_1', spouseSex: 'female' },
    ];
    safeState.customConsanguinity = [{ id: '_cc_0', type: 'siblings', person1: 'de_sp_0', person2: 'de_sp_1' }];
    const safeGraph = buildPedigreeFromWizard(safeState);
    const safeIssues = tagIssues(auditPedigreeGraph(safeGraph), 'graph');

    expect(introducesNewGraphErrors(cleanIssues, safeIssues)).toBe(false);
  });

  it('also checks layout-integrity issues, not just graph-integrity ones', () => {
    const cleanState = baseState();
    const cleanGraph = buildPedigreeFromWizard(cleanState);
    const cleanLayout = computePedigreeLayout(cleanGraph);
    const cleanIssues = tagIssues(auditLayoutIntegrity(cleanLayout, cleanGraph), 'layout');

    const brokenState = baseState();
    brokenState.customConsanguinity = [{ id: '_cc_0', type: 'siblings', person1: 'proband', person2: 'mat_gf' }];
    const brokenGraph = buildPedigreeFromWizard(brokenState);
    const brokenLayout = computePedigreeLayout(brokenGraph);
    const brokenIssues = tagIssues(auditLayoutIntegrity(brokenLayout, brokenGraph), 'layout');

    // Whether or not this specific fixture trips a *layout* error (it may
    // only trip the graph-level SIBLING_GENERATION_INCONSISTENT check), the
    // function must not throw and must return a boolean either way.
    expect(typeof introducesNewGraphErrors(cleanIssues, brokenIssues)).toBe('boolean');
  });
});

describe('v0.3a.2 — store: relationship-creation actions roll back on unsafe mutation', () => {
  const ORIGINAL_PACKER = process.env.PEDITREE_PACKER;
  beforeEach(() => { usePedigreeStore.getState().resetPedigree(); });
  afterEach(() => {
    if (ORIGINAL_PACKER === undefined) delete process.env.PEDITREE_PACKER;
    else process.env.PEDITREE_PACKER = ORIGINAL_PACKER;
  });

  it('addCustomConsanguinity is blocked by computeSiblingCreationPlan before ever reaching the audit stage (different generations)', () => {
    const before = usePedigreeStore.getState().wizardData;
    usePedigreeStore.getState().addCustomConsanguinity('proband', 'mat_gf');
    // Blocked at the plan-check layer — wizardData never changes.
    expect(usePedigreeStore.getState().wizardData).toBe(before);
  });

  it('v0.4: addCustomConsanguinity rolls back a cross-pedigree sibling link that would collapse readability', () => {
    // Making mother's married-in spouse and father's married-in spouse into
    // siblings fabricates a shared-parent couple whose child-connector rail
    // must span the entire pedigree width (the two spouses sit on opposite
    // sides). Under the old per-generation engine that is correctly detected
    // as unreadable and rolled back. (The genuine "addCustomConsanguinity
    // creates a real biological PCR link" fact is covered at the builder
    // level in pedigree.test.js's custom-consanguinity suite.)
    //
    // Step 4C note: the recursive packer (now default) genuinely renders
    // this shape cleanly (0 graph/layout issues, verified) — the disjoint-
    // interval construction that made it the default no longer trips this
    // specific ambiguity. Pinned to legacy here because this test targets
    // the ROLLBACK MECHANISM itself (assessRelationshipMutation), which
    // still must fire for engines/scenarios that genuinely regress —
    // recursivePackerRuntimeEntryPoint.test.js covers the recursive engine.
    process.env.PEDITREE_PACKER = 'legacy';
    usePedigreeStore.getState().addSpouseTo('mother', 'male');
    let state = usePedigreeStore.getState();
    const spouse1 = state.wizardData.graphEdits.find(e => e.type === 'addSpouse').spouseId;
    usePedigreeStore.getState().addSpouseTo('father', 'female');
    state = usePedigreeStore.getState();
    const spouse2 = state.wizardData.graphEdits.filter(e => e.type === 'addSpouse')[1].spouseId;
    const before = usePedigreeStore.getState().wizardData;

    usePedigreeStore.getState().addCustomConsanguinity(spouse1, spouse2);
    state = usePedigreeStore.getState();
    // rolled back — no PCR link committed, wizardData unchanged
    expect(state.wizardData).toBe(before);
    const pcrs = state.pedigreeData.parentChildRelationships;
    expect(pcrs.some(rel => rel.children.includes(spouse1) && rel.children.includes(spouse2))).toBe(false);
  });

  it('createUnionBetween rolls back a same-generation union whose geometry would collapse readability (v0.3a.4)', () => {
    // Making one already-married individual (newSpouse, wed to a brother) a
    // SECOND partner of the proband is generation-valid but produces
    // overlapping child-connector rails under the old per-generation engine
    // — the layout-safety net must roll it back rather than commit an
    // unreadable pedigree. (A clean same-gen union — two genuinely
    // unattached individuals — is allowed; see the computeUnionCreationPlan
    // tests below for that contract. The graph model here makes such an
    // unattached same-gen pair hard to construct without going through
    // addSpouseTo, which is the intended clean path.)
    //
    // Step 4C note: pinned to legacy — see the addCustomConsanguinity test
    // above for why (the recursive default now renders this shape cleanly).
    process.env.PEDITREE_PACKER = 'legacy';
    usePedigreeStore.getState().updateSiblingCount('male', 1);
    usePedigreeStore.getState().addSpouseTo('sib_m_0', 'female');
    let state = usePedigreeStore.getState();
    const newSpouseId = state.wizardData.graphEdits.find(e => e.type === 'addSpouse').spouseId;
    const before = usePedigreeStore.getState().wizardData;

    usePedigreeStore.getState().createUnionBetween('proband', newSpouseId);
    state = usePedigreeStore.getState();
    expect(state.wizardData).toBe(before); // rolled back — no mutation committed
    expect(state.pedigreeData.unions.some(u => u.partners.includes('proband') && u.partners.includes(newSpouseId))).toBe(false);
  });

  it('createUnionBetween rolls back (does not commit) a cross-generation pairing', () => {
    // mat_gf's spouse stub is generation 1; pairing it with proband
    // (generation 3) would introduce PARTNER_GENERATION_INCONSISTENT.
    usePedigreeStore.getState().addSpouseTo('mat_gf', 'female');
    let state = usePedigreeStore.getState();
    const newSpouseId = state.wizardData.graphEdits.find(e => e.type === 'addSpouse').spouseId;
    const before = usePedigreeStore.getState().wizardData;

    usePedigreeStore.getState().createUnionBetween('proband', newSpouseId);
    state = usePedigreeStore.getState();
    expect(state.wizardData).toBe(before); // rolled back — no mutation committed
    expect(state.pedigreeData.unions.some(u => u.partners.includes('proband') && u.partners.includes(newSpouseId))).toBe(false);
  });

  it('Step 5A: createUnionBetween does not commit a same-sex union (blocked at the plan check, before any audit)', () => {
    // mat_gf and pat_gf: same generation (1), unrelated (different
    // branches, not siblings) — isolates the sex check from the
    // cross-generation check, both of which independently block same-sex
    // unions here since they're also both male.
    const before = usePedigreeStore.getState().wizardData;
    usePedigreeStore.getState().createUnionBetween('mat_gf', 'pat_gf');
    const state = usePedigreeStore.getState();
    expect(state.wizardData).toBe(before); // blocked before any wizardData mutation
    expect(state.pedigreeData.unions.some(u => u.partners.includes('mat_gf') && u.partners.includes('pat_gf'))).toBe(false);
  });
});
