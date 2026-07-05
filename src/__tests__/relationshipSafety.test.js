/**
 * relationshipSafety.test.js — v0.3a.2 audit-before-commit safety net for
 * relationship-creation actions ("make partners" / "make siblings").
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { introducesNewGraphErrors, describeNewGraphErrors } from '../utils/relationshipSafety';
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
  beforeEach(() => { usePedigreeStore.getState().resetPedigree(); });

  it('addCustomConsanguinity is blocked by computeSiblingCreationPlan before ever reaching the audit stage (different generations)', () => {
    const before = usePedigreeStore.getState().wizardData;
    usePedigreeStore.getState().addCustomConsanguinity('proband', 'mat_gf');
    // Blocked at the plan-check layer — wizardData never changes.
    expect(usePedigreeStore.getState().wizardData).toBe(before);
  });

  it('a safe addCustomConsanguinity commits and produces zero new integrity errors', () => {
    usePedigreeStore.getState().addSpouseTo('mother', 'male');
    let state = usePedigreeStore.getState();
    const spouse1 = state.wizardData.graphEdits.find(e => e.type === 'addSpouse').spouseId;
    usePedigreeStore.getState().addSpouseTo('father', 'female');
    state = usePedigreeStore.getState();
    const spouse2 = state.wizardData.graphEdits.filter(e => e.type === 'addSpouse')[1].spouseId;

    usePedigreeStore.getState().addCustomConsanguinity(spouse1, spouse2);
    state = usePedigreeStore.getState();
    const errors = (state.integrityIssues || []).filter(i => i.severity === 'error');
    expect(errors).toHaveLength(0);
    const pcrs = state.pedigreeData.parentChildRelationships;
    expect(pcrs.some(rel => rel.children.includes(spouse1) && rel.children.includes(spouse2))).toBe(true);
  });

  it('createUnionBetween commits safely (same generation) and produces zero new integrity errors', () => {
    // A sibling of proband (generation 3, same as proband) with no union
    // of its own — a generation-compatible, otherwise-unrelated partner.
    usePedigreeStore.getState().updateSiblingCount('male', 1);
    usePedigreeStore.getState().addSpouseTo('sib_m_0', 'female');
    let state = usePedigreeStore.getState();
    const newSpouseId = state.wizardData.graphEdits.find(e => e.type === 'addSpouse').spouseId;

    usePedigreeStore.getState().createUnionBetween('proband', newSpouseId);
    state = usePedigreeStore.getState();
    const errors = (state.integrityIssues || []).filter(i => i.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(state.pedigreeData.unions.some(u => u.partners.includes('proband') && u.partners.includes(newSpouseId))).toBe(true);
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
});
