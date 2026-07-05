/**
 * redo.test.js — v0.3a.2 redo stack tests.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';

describe('v0.3a.2 — store: redo', () => {
  beforeEach(() => { usePedigreeStore.getState().resetPedigree(); });

  it('redo reapplies exactly one undone step', () => {
    usePedigreeStore.getState().updateSiblingCount('male', 2);
    usePedigreeStore.getState().undo();
    expect(usePedigreeStore.getState().wizardData.siblings.male).toHaveLength(0);

    usePedigreeStore.getState().redo();
    expect(usePedigreeStore.getState().wizardData.siblings.male).toHaveLength(2);
  });

  it('undo then redo restores the exact prior state (round-trip)', () => {
    usePedigreeStore.getState().updateSiblingCount('male', 3);
    const afterMutation = usePedigreeStore.getState().wizardData;

    usePedigreeStore.getState().undo();
    usePedigreeStore.getState().redo();

    expect(usePedigreeStore.getState().wizardData).toEqual(afterMutation);
  });

  it('a new mutation after undo clears the redo stack', () => {
    usePedigreeStore.getState().updateSiblingCount('male', 2);
    usePedigreeStore.getState().undo();
    expect(usePedigreeStore.getState()._future.length).toBeGreaterThan(0);

    usePedigreeStore.getState().updateSiblingCount('female', 1);
    expect(usePedigreeStore.getState()._future).toHaveLength(0);
  });

  it('redo is a no-op when the redo stack is empty', () => {
    const before = usePedigreeStore.getState().wizardData;
    usePedigreeStore.getState().redo();
    expect(usePedigreeStore.getState().wizardData).toBe(before);
  });

  it('reset clears both the undo and redo stacks', () => {
    usePedigreeStore.getState().updateSiblingCount('male', 2);
    usePedigreeStore.getState().undo();
    expect(usePedigreeStore.getState()._future.length).toBeGreaterThan(0);

    usePedigreeStore.getState().resetPedigree();
    expect(usePedigreeStore.getState()._history).toHaveLength(0);
    expect(usePedigreeStore.getState()._future).toHaveLength(0);
  });

  it('selection changes do not pollute the redo stack', () => {
    usePedigreeStore.getState().updateSiblingCount('male', 2);
    usePedigreeStore.getState().undo();
    const futureBefore = usePedigreeStore.getState()._future.length;

    usePedigreeStore.getState().selectIndividual('mother');
    usePedigreeStore.getState().selectIndividual('father', { additive: true });
    usePedigreeStore.getState().clearSelection();

    expect(usePedigreeStore.getState()._future).toHaveLength(futureBefore);
  });

  it('multiple undo/redo cycles compose correctly', () => {
    usePedigreeStore.getState().updateSiblingCount('male', 1);
    usePedigreeStore.getState().updateSiblingCount('male', 2);
    usePedigreeStore.getState().updateSiblingCount('male', 3);
    expect(usePedigreeStore.getState().wizardData.siblings.male).toHaveLength(3);

    usePedigreeStore.getState().undo();
    usePedigreeStore.getState().undo();
    expect(usePedigreeStore.getState().wizardData.siblings.male).toHaveLength(1);

    usePedigreeStore.getState().redo();
    expect(usePedigreeStore.getState().wizardData.siblings.male).toHaveLength(2);

    usePedigreeStore.getState().redo();
    expect(usePedigreeStore.getState().wizardData.siblings.male).toHaveLength(3);

    // Nothing left to redo.
    usePedigreeStore.getState().redo();
    expect(usePedigreeStore.getState().wizardData.siblings.male).toHaveLength(3);
  });

  it('redo preserves graph integrity (zero errors) after restoring', () => {
    usePedigreeStore.getState().updateSiblingCount('male', 3);
    usePedigreeStore.getState().undo();
    usePedigreeStore.getState().redo();
    const errors = (usePedigreeStore.getState().integrityIssues || []).filter(i => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });
});
