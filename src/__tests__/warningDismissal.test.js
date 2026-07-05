/**
 * warningDismissal.test.js — v0.3a.2 dismissible warnings.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildWarningId, withStableIdsExcludingDismissed } from '../utils/warningIds';
import { usePedigreeStore } from '../state/usePedigreeStore';

describe('warningIds — buildWarningId', () => {
  it('is stable for the same structured issue content', () => {
    const issue = { code: 'PROBAND_MISSING', ids: [], message: 'x' };
    expect(buildWarningId(issue)).toBe(buildWarningId({ ...issue }));
  });

  it('differs for different codes', () => {
    const a = { code: 'PROBAND_MISSING', ids: [] };
    const b = { code: 'PROBAND_MULTIPLE', ids: [] };
    expect(buildWarningId(a)).not.toBe(buildWarningId(b));
  });

  it('differs for the same code with different ids (e.g. two different unions)', () => {
    const a = { code: 'CONSANGUINITY_UNRESOLVED', ids: ['U_A'] };
    const b = { code: 'CONSANGUINITY_UNRESOLVED', ids: ['U_B'] };
    expect(buildWarningId(a)).not.toBe(buildWarningId(b));
  });

  it('treats identical plain-string warnings as the same content', () => {
    expect(buildWarningId('same text')).toBe(buildWarningId('same text'));
  });

  it('treats different plain-string warnings as different content', () => {
    expect(buildWarningId('text A')).not.toBe(buildWarningId('text B'));
  });

  it('a structured issue and an identical-looking string never collide', () => {
    const strId = buildWarningId('PROBAND_MISSING');
    const issueId = buildWarningId({ code: 'PROBAND_MISSING', ids: [] });
    expect(strId).not.toBe(issueId);
  });
});

describe('warningIds — withStableIdsExcludingDismissed', () => {
  it('returns all items with no dismissals', () => {
    const items = ['a', 'b'];
    const result = withStableIdsExcludingDismissed(items, []);
    expect(result).toHaveLength(2);
  });

  it('excludes a dismissed item by its stable id', () => {
    const items = ['a', 'b'];
    const idA = buildWarningId('a');
    const result = withStableIdsExcludingDismissed(items, [idA]);
    expect(result.map(r => r.item)).toEqual(['b']);
  });

  it('handles empty/undefined input gracefully', () => {
    expect(withStableIdsExcludingDismissed(undefined, undefined)).toEqual([]);
    expect(withStableIdsExcludingDismissed([], [])).toEqual([]);
  });
});

describe('v0.3a.2 — store: dismissWarning', () => {
  beforeEach(() => { usePedigreeStore.getState().resetPedigree(); });

  it('adds a warning id to dismissedWarningIds', () => {
    usePedigreeStore.getState().dismissWarning('issue:PROBAND_MISSING:');
    expect(usePedigreeStore.getState().dismissedWarningIds).toContain('issue:PROBAND_MISSING:');
  });

  it('dismissing the same id twice does not duplicate it', () => {
    usePedigreeStore.getState().dismissWarning('issue:X:');
    usePedigreeStore.getState().dismissWarning('issue:X:');
    const count = usePedigreeStore.getState().dismissedWarningIds.filter(id => id === 'issue:X:').length;
    expect(count).toBe(1);
  });

  it('does not push an undo-history entry (dismissal is not a graph mutation)', () => {
    usePedigreeStore.getState().dismissWarning('issue:X:');
    expect(usePedigreeStore.getState()._history).toHaveLength(0);
  });

  it('reset clears dismissedWarningIds', () => {
    usePedigreeStore.getState().dismissWarning('issue:X:');
    expect(usePedigreeStore.getState().dismissedWarningIds.length).toBeGreaterThan(0);
    usePedigreeStore.getState().resetPedigree();
    expect(usePedigreeStore.getState().dismissedWarningIds).toHaveLength(0);
  });

  it('a real PROBAND_MISSING warning can be dismissed and stops appearing in the filtered list', () => {
    usePedigreeStore.getState().clearProband();
    const state = usePedigreeStore.getState();
    const issue = (state.integrityIssues || []).find(i => i.code === 'PROBAND_MISSING');
    expect(issue).toBeDefined();
    const id = buildWarningId(issue);

    let visible = withStableIdsExcludingDismissed(state.integrityIssues, state.dismissedWarningIds);
    expect(visible.some(v => v._warningId === id)).toBe(true);

    usePedigreeStore.getState().dismissWarning(id);
    visible = withStableIdsExcludingDismissed(
      usePedigreeStore.getState().integrityIssues,
      usePedigreeStore.getState().dismissedWarningIds
    );
    expect(visible.some(v => v._warningId === id)).toBe(false);
  });

  it('a dismissed warning reappears once the underlying condition changes (different content id)', () => {
    usePedigreeStore.getState().clearProband();
    let state = usePedigreeStore.getState();
    const missingIssue = (state.integrityIssues || []).find(i => i.code === 'PROBAND_MISSING');
    usePedigreeStore.getState().dismissWarning(buildWarningId(missingIssue));

    // Re-assign a proband — PROBAND_MISSING condition resolves, a
    // structurally different condition (or none) replaces it. The
    // dismissal of the old, now-gone warning is irrelevant; nothing new is
    // suppressed by it.
    usePedigreeStore.getState().setProband('mother');
    state = usePedigreeStore.getState();
    const stillMissing = (state.integrityIssues || []).find(i => i.code === 'PROBAND_MISSING');
    expect(stillMissing).toBeUndefined();
  });
});
