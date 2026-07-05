/**
 * accordionState.test.js — v0.3a.3 true single-open accordion.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';

describe('v0.3a.3 — store: setOpenSection (single-open accordion)', () => {
  beforeEach(() => { usePedigreeStore.getState().resetPedigree(); });

  it('defaults to the "proband" section open', () => {
    expect(usePedigreeStore.getState().openSectionId).toBe('proband');
  });

  it('opening a different section replaces the open one (never more than one open)', () => {
    usePedigreeStore.getState().setOpenSection('siblings');
    expect(usePedigreeStore.getState().openSectionId).toBe('siblings');

    usePedigreeStore.getState().setOpenSection('parents');
    expect(usePedigreeStore.getState().openSectionId).toBe('parents');
  });

  it('opening the already-open section closes it (click-to-close)', () => {
    usePedigreeStore.getState().setOpenSection('siblings');
    expect(usePedigreeStore.getState().openSectionId).toBe('siblings');

    usePedigreeStore.getState().setOpenSection('siblings');
    expect(usePedigreeStore.getState().openSectionId).toBeNull();
  });

  it('does not push an undo-history entry (pure UI state, not a graph mutation)', () => {
    usePedigreeStore.getState().setOpenSection('consanguinity');
    expect(usePedigreeStore.getState()._history).toHaveLength(0);
  });

  it('reset restores the open section to the default', () => {
    usePedigreeStore.getState().setOpenSection('gen4');
    expect(usePedigreeStore.getState().openSectionId).toBe('gen4');

    usePedigreeStore.getState().resetPedigree();
    expect(usePedigreeStore.getState().openSectionId).toBe('proband');
  });
});
