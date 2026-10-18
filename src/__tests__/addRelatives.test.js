/**
 * addRelatives.test.js — v0.3a.3 selected-person "add mother/father/both
 * parents/sibling" actions.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  usePedigreeStore,
  computeAddParentsPlan,
  computeAddSiblingPlan,
} from '../state/usePedigreeStore';

describe('v0.3a.3 — computeAddParentsPlan', () => {
  beforeEach(() => { usePedigreeStore.getState().resetPedigree(); });

  it('allows adding parents to an individual with none yet', () => {
    // mat_gf doesn't exist unless great-grandparents are enabled — use the
    // proband's own child-less spouse stub instead once created.
    usePedigreeStore.getState().addSpouseTo('proband', 'female');
    const s2 = usePedigreeStore.getState();
    const spouseId = s2.lastCreated.spouseId;
    const plan = computeAddParentsPlan(s2.pedigreeData, spouseId);
    expect(plan.ok).toBe(true);
  });

  it('blocks adding parents to an individual who already has parents', () => {
    const state = usePedigreeStore.getState();
    const plan = computeAddParentsPlan(state.pedigreeData, 'proband'); // already has U_PARENTS
    expect(plan.ok).toBe(false);
  });

  it('blocks adding parents to a pregnancy-loss/stillbirth individual', () => {
    const pedigreeData = { individuals: [{ id: 'a', pregnancyLoss: true }], unions: [], parentChildRelationships: [] };
    const plan = computeAddParentsPlan(pedigreeData, 'a');
    expect(plan.ok).toBe(false);
  });

  it('blocks for a nonexistent individual', () => {
    const state = usePedigreeStore.getState();
    const plan = computeAddParentsPlan(state.pedigreeData, 'nonexistent');
    expect(plan.ok).toBe(false);
  });
});

describe('v0.3a.3 — computeAddSiblingPlan', () => {
  beforeEach(() => { usePedigreeStore.getState().resetPedigree(); });

  it('allows adding a sibling when the target already has a parent union', () => {
    const state = usePedigreeStore.getState();
    const plan = computeAddSiblingPlan(state.pedigreeData, 'proband');
    expect(plan.ok).toBe(true);
    expect(plan.unionId).toBe('U_PARENTS');
  });

  it('blocks adding a sibling when the target has no parent union', () => {
    usePedigreeStore.getState().addSpouseTo('proband', 'female');
    const state = usePedigreeStore.getState();
    const spouseId = state.lastCreated.spouseId;
    const plan = computeAddSiblingPlan(state.pedigreeData, spouseId);
    expect(plan.ok).toBe(false);
  });

  it('blocks for a nonexistent individual', () => {
    const state = usePedigreeStore.getState();
    const plan = computeAddSiblingPlan(state.pedigreeData, 'nonexistent');
    expect(plan.ok).toBe(false);
  });
});

describe('v0.3a.3 — store: addParentsTo', () => {
  beforeEach(() => { usePedigreeStore.getState().resetPedigree(); });

  it('adding both parents creates a real mother+father union and attaches the target as their child', () => {
    usePedigreeStore.getState().addSpouseTo('proband', 'female');
    let state = usePedigreeStore.getState();
    const spouseId = state.lastCreated.spouseId;

    usePedigreeStore.getState().addParentsTo(spouseId);
    state = usePedigreeStore.getState();
    const errors = (state.integrityIssues || []).filter(i => i.severity === 'error');
    expect(errors).toHaveLength(0);

    const pcrs = state.pedigreeData.parentChildRelationships;
    const parentRel = pcrs.find(rel => rel.children.includes(spouseId));
    expect(parentRel).toBeDefined();
    const union = state.pedigreeData.unions.find(u => u.id === parentRel.unionId);
    const partners = union.partners.map(pid => state.pedigreeData.individuals.find(i => i.id === pid));
    expect(partners.map(p => p.sex).sort()).toEqual(['female', 'male']);
  });

  it('"add mother only" creates a female parent plus an explicitly-unspecified placeholder partner', () => {
    usePedigreeStore.getState().addSpouseTo('proband', 'female');
    let state = usePedigreeStore.getState();
    const spouseId = state.lastCreated.spouseId;

    usePedigreeStore.getState().addParentsTo(spouseId, { onlyMother: true });
    state = usePedigreeStore.getState();
    const pcrs = state.pedigreeData.parentChildRelationships;
    const parentRel = pcrs.find(rel => rel.children.includes(spouseId));
    const union = state.pedigreeData.unions.find(u => u.id === parentRel.unionId);
    const partners = union.partners.map(pid => state.pedigreeData.individuals.find(i => i.id === pid));

    const mother = partners.find(p => p.sex === 'female');
    const placeholder = partners.find(p => p.sex === 'unknown');
    expect(mother).toBeDefined();
    expect(placeholder).toBeDefined();
    // The placeholder must be visibly marked as unspecified, not a
    // silently-fabricated named parent.
    expect(placeholder.label).toMatch(/belirtilmedi/);
  });

  it('is a no-op (does not mutate wizardData) when the target already has parents', () => {
    const before = usePedigreeStore.getState().wizardData;
    usePedigreeStore.getState().addParentsTo('proband'); // already has U_PARENTS
    expect(usePedigreeStore.getState().wizardData).toBe(before);
  });

  it('does not create duplicate parents if called twice on the same individual', () => {
    usePedigreeStore.getState().addSpouseTo('proband', 'female');
    let state = usePedigreeStore.getState();
    const spouseId = state.lastCreated.spouseId;

    usePedigreeStore.getState().addParentsTo(spouseId);
    const afterFirst = usePedigreeStore.getState().pedigreeData.individuals.length;

    usePedigreeStore.getState().addParentsTo(spouseId); // blocked — already has parents now
    const afterSecond = usePedigreeStore.getState().pedigreeData.individuals.length;

    expect(afterSecond).toBe(afterFirst);
  });

  it('undo reverses adding parents cleanly', () => {
    usePedigreeStore.getState().addSpouseTo('proband', 'female');
    let state = usePedigreeStore.getState();
    const spouseId = state.lastCreated.spouseId;

    usePedigreeStore.getState().addParentsTo(spouseId);
    const withParents = usePedigreeStore.getState().pedigreeData.individuals.length;

    usePedigreeStore.getState().undo();
    const afterUndo = usePedigreeStore.getState().pedigreeData.individuals.length;
    expect(afterUndo).toBe(withParents - 2); // both new parent individuals removed
  });
});

describe('v0.3a.3 — store: addSiblingTo', () => {
  beforeEach(() => { usePedigreeStore.getState().resetPedigree(); });

  it('adds a sibling to the target\'s existing parent union', () => {
    usePedigreeStore.getState().addSiblingTo('proband', 'female');
    const state = usePedigreeStore.getState();
    const errors = (state.integrityIssues || []).filter(i => i.severity === 'error');
    expect(errors).toHaveLength(0);

    const pcrs = state.pedigreeData.parentChildRelationships;
    const parentsRel = pcrs.find(rel => rel.unionId === 'U_PARENTS');
    expect(parentsRel.children.length).toBeGreaterThan(1);
    expect(parentsRel.children).toContain('proband');
  });

  it('is a no-op when the target has no parent union', () => {
    usePedigreeStore.getState().addSpouseTo('proband', 'female');
    let state = usePedigreeStore.getState();
    const spouseId = state.lastCreated.spouseId;
    const before = usePedigreeStore.getState().wizardData;

    usePedigreeStore.getState().addSiblingTo(spouseId, 'male');
    expect(usePedigreeStore.getState().wizardData).toBe(before);
  });

  it('undo reverses adding a sibling cleanly', () => {
    const before = usePedigreeStore.getState().pedigreeData.individuals.length;
    usePedigreeStore.getState().addSiblingTo('proband', 'female');
    expect(usePedigreeStore.getState().pedigreeData.individuals.length).toBe(before + 1);

    usePedigreeStore.getState().undo();
    expect(usePedigreeStore.getState().pedigreeData.individuals.length).toBe(before);
  });
});
