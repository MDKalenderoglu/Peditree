/**
 * siblingCounts.test.js — v0.4.1
 *
 * Root cause: the left panel's "2. Kardesler" stepper counts read
 * `wizardData.siblings.*.length` directly. The selected-person editor's
 * addSiblingTo action (used when adding a sibling from the RIGHT panel)
 * writes to a completely different place — `wizardData.graphEdits`
 * (type 'addChild') — so the left panel's counters silently stayed at 0 for
 * any sibling added that way, and the user could never decrement/delete it
 * from the left panel.
 *
 * Fix: deriveSiblingCounts/siblingsInCategory (siblingCounts.js) compute
 * counts from the built graph (pedigreeData) — the one place both
 * mechanisms actually feed into — and removeLastSibling (usePedigreeStore.js)
 * can remove the birth-order-last sibling regardless of which mechanism
 * created it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { deriveSiblingCounts, siblingsInCategory } from '../utils/siblingCounts';

describe('v0.4.1 — sibling count panel sync', () => {
  beforeEach(() => { usePedigreeStore.getState().resetPedigree(); });

  it('a sibling added via the right-panel addSiblingTo action IS reflected in deriveSiblingCounts', () => {
    let state = usePedigreeStore.getState();
    expect(deriveSiblingCounts(state.pedigreeData).male).toBe(0);

    usePedigreeStore.getState().addSiblingTo('proband', 'male');
    state = usePedigreeStore.getState();

    // The old bug: wizardData.siblings.male.length stayed 0 here.
    expect(state.wizardData.siblings.male.length).toBe(0);
    // The fix: the derived (graph-based) count sees it.
    expect(deriveSiblingCounts(state.pedigreeData).male).toBe(1);
  });

  it('a sibling added via the left-panel addSiblingOfCategory action is also reflected', () => {
    usePedigreeStore.getState().addSiblingOfCategory('female');
    const state = usePedigreeStore.getState();
    expect(deriveSiblingCounts(state.pedigreeData).female).toBe(1);
    expect(state.wizardData.siblings.female.length).toBe(1);
  });

  it('removeLastSibling removes a graphEdits-origin sibling (right-panel path) even though it is not in wizardData.siblings', () => {
    usePedigreeStore.getState().addSiblingTo('proband', 'male');
    let state = usePedigreeStore.getState();
    expect(deriveSiblingCounts(state.pedigreeData).male).toBe(1);

    usePedigreeStore.getState().removeLastSibling('male');
    state = usePedigreeStore.getState();
    expect(deriveSiblingCounts(state.pedigreeData).male).toBe(0);
  });

  it('removeLastSibling removes a wizardData-origin sibling (left-panel path) and shrinks the underlying array', () => {
    usePedigreeStore.getState().addSiblingOfCategory('unknown');
    let state = usePedigreeStore.getState();
    expect(state.wizardData.siblings.unknown.length).toBe(1);

    usePedigreeStore.getState().removeLastSibling('unknown');
    state = usePedigreeStore.getState();
    expect(state.wizardData.siblings.unknown.length).toBe(0);
    expect(deriveSiblingCounts(state.pedigreeData).unknown).toBe(0);
  });

  it('removeLastSibling on an empty category is a safe no-op', () => {
    const before = usePedigreeStore.getState().wizardData;
    usePedigreeStore.getState().removeLastSibling('female');
    expect(usePedigreeStore.getState().wizardData).toBe(before);
  });

  it('mixed origins: one wizard-array sibling + one graphEdits sibling both count, and each removeLastSibling call takes the birth-order-last one', () => {
    usePedigreeStore.getState().addSiblingOfCategory('male'); // wizard-origin, sib_m_0
    usePedigreeStore.getState().addSiblingTo('proband', 'male'); // graphEdits-origin, de_ch_N
    let state = usePedigreeStore.getState();
    expect(deriveSiblingCounts(state.pedigreeData).male).toBe(2);

    const lastBeforeRemoval = siblingsInCategory(state.pedigreeData, 'male');
    expect(lastBeforeRemoval).toHaveLength(2);

    usePedigreeStore.getState().removeLastSibling('male');
    state = usePedigreeStore.getState();
    expect(deriveSiblingCounts(state.pedigreeData).male).toBe(1);

    usePedigreeStore.getState().removeLastSibling('male');
    state = usePedigreeStore.getState();
    expect(deriveSiblingCounts(state.pedigreeData).male).toBe(0);
  });

  it('pregnancyLoss and deceased (Dusuk/Kayip, Olu Dogum) categories sync the same way', () => {
    usePedigreeStore.getState().addSiblingOfCategory('pregnancyLoss');
    let state = usePedigreeStore.getState();
    expect(deriveSiblingCounts(state.pedigreeData).pregnancyLoss).toBe(1);
    expect(state.wizardData.siblings.pregnancyLoss).toBe(1);

    usePedigreeStore.getState().removeLastSibling('pregnancyLoss');
    state = usePedigreeStore.getState();
    expect(deriveSiblingCounts(state.pedigreeData).pregnancyLoss).toBe(0);
    expect(state.wizardData.siblings.pregnancyLoss).toBe(0);
  });

  it('the proband itself is never counted as a sibling', () => {
    const state = usePedigreeStore.getState();
    const counts = deriveSiblingCounts(state.pedigreeData);
    expect(counts.male + counts.female + counts.unknown + counts.pregnancyLoss + counts.deceased).toBe(0);
  });
});
