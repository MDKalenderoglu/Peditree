/**
 * layoutModel.test.js — v0.4 Phase 1: pure structural layout model.
 */
import { describe, it, expect } from 'vitest';
import { buildLayoutModel } from '../utils/layoutModel';
import { buildPedigreeFromWizard } from '../builder/pedigreeBuilderFromWizard';
import { baseState } from './helpers';

describe('layoutModel — generation layers', () => {
  it('groups individuals by generation, sorted ascending', () => {
    const graph = buildPedigreeFromWizard(baseState());
    const model = buildLayoutModel(graph);
    // base pedigree spans gen 1 (grandparents) .. gen 3 (proband)
    expect(model.generations[0]).toBeLessThan(model.generations[model.generations.length - 1]);
    // every individual appears in exactly one layer
    const total = [...model.generationLayers.values()].reduce((n, arr) => n + arr.length, 0);
    expect(total).toBe(graph.individuals.length);
  });

  it('places the proband in the same generation layer as its siblings', () => {
    const state = baseState();
    state.siblings.male = [{ id: '_s0', age: '20' }];
    const graph = buildPedigreeFromWizard(state);
    const model = buildLayoutModel(graph);
    const probandGen = graph.individuals.find(i => i.id === 'proband').generation;
    expect(model.generationLayers.get(probandGen)).toContain('proband');
    expect(model.generationLayers.get(probandGen)).toContain('sib_m_0');
  });
});

describe('layoutModel — child ↔ parent union', () => {
  it('maps each child to its single parent union', () => {
    const graph = buildPedigreeFromWizard(baseState());
    const model = buildLayoutModel(graph);
    expect(model.childToParentUnion.get('proband')).toBe('U_PARENTS');
    expect(model.childToParentUnion.get('mother')).toBe('U_MAT_GP');
    expect(model.childToParentUnion.get('father')).toBe('U_PAT_GP');
  });

  it('founders (grandparents) have no parent union', () => {
    const graph = buildPedigreeFromWizard(baseState());
    const model = buildLayoutModel(graph);
    expect(model.childToParentUnion.has('mat_gf')).toBe(false);
    expect(model.founders).toContain('mat_gf');
    expect(model.founders).toContain('pat_gm');
    // bloodline descendants are NOT founders
    expect(model.founders).not.toContain('proband');
  });
});

describe('layoutModel — partner unions (multi-partner support)', () => {
  it('records the union(s) each partner belongs to', () => {
    const graph = buildPedigreeFromWizard(baseState());
    const model = buildLayoutModel(graph);
    expect(model.partnerUnions.get('mother')).toContain('U_PARENTS');
    expect(model.partnerUnions.get('father')).toContain('U_PARENTS');
    expect(model.partnerUnions.get('mat_gf')).toContain('U_MAT_GP');
  });

  it('supports an individual partnered in more than one union', () => {
    const state = baseState();
    state.graphEdits = [
      { type: 'addSpouse', targetId: 'proband', spouseId: 'de_sp_0', unionId: 'U_DE_0', spouseSex: 'female' },
      { type: 'addSpouse', targetId: 'proband', spouseId: 'de_sp_1', unionId: 'U_DE_1', spouseSex: 'female' },
    ];
    const graph = buildPedigreeFromWizard(state);
    const model = buildLayoutModel(graph);
    const probUnions = model.partnerUnions.get('proband');
    expect(probUnions).toContain('U_DE_0');
    expect(probUnions).toContain('U_DE_1');
    expect(probUnions.length).toBeGreaterThanOrEqual(2);
  });
});

describe('layoutModel — sibling groups', () => {
  it('produces one sibling group per union with children', () => {
    const state = baseState();
    state.siblings.male = [{ id: '_s0', age: '20' }];
    state.siblings.female = [{ id: '_s1', age: '18' }];
    const graph = buildPedigreeFromWizard(state);
    const model = buildLayoutModel(graph);
    const parentsGroup = model.siblingGroups.find(sg => sg.unionId === 'U_PARENTS');
    expect(parentsGroup).toBeDefined();
    expect(parentsGroup.childIds).toContain('proband');
    expect(parentsGroup.childIds).toContain('sib_m_0');
    expect(parentsGroup.childIds).toContain('sib_f_0');
  });

  it('does not create a sibling group for a childless union', () => {
    const state = baseState();
    state.graphEdits = [
      { type: 'addSpouse', targetId: 'proband', spouseId: 'de_sp_0', unionId: 'U_DE_0', spouseSex: 'female' },
    ];
    const graph = buildPedigreeFromWizard(state);
    const model = buildLayoutModel(graph);
    expect(model.siblingGroups.find(sg => sg.unionId === 'U_DE_0')).toBeUndefined();
  });
});

describe('layoutModel — descent forest of unions', () => {
  it('U_PARENTS is a child-union of both grandparent unions via its two partners (primary + loop)', () => {
    const graph = buildPedigreeFromWizard(baseState());
    const model = buildLayoutModel(graph);
    // mother is a child of U_MAT_GP, father a child of U_PAT_GP — so
    // U_PARENTS has two bloodline parent unions.
    const parents = model.unionParentUnions.get('U_PARENTS');
    expect(parents).toContain('U_MAT_GP');
    expect(parents).toContain('U_PAT_GP');
    // exactly one is primary, the other is a loop back-edge
    const primary = model.primaryParentUnion.get('U_PARENTS');
    expect(['U_MAT_GP', 'U_PAT_GP']).toContain(primary);
    expect(model.loopParentUnions.get('U_PARENTS')).toHaveLength(1);
  });

  it('grandparent unions are roots (no parent union)', () => {
    const graph = buildPedigreeFromWizard(baseState());
    const model = buildLayoutModel(graph);
    expect(model.rootUnions).toContain('U_MAT_GP');
    expect(model.rootUnions).toContain('U_PAT_GP');
    expect(model.primaryParentUnion.get('U_MAT_GP')).toBeNull();
  });

  it('childUnionsOf links a grandparent union to U_PARENTS through the primary anchor', () => {
    const graph = buildPedigreeFromWizard(baseState());
    const model = buildLayoutModel(graph);
    const primary = model.primaryParentUnion.get('U_PARENTS');
    expect(model.childUnionsOf.get(primary)).toContain('U_PARENTS');
  });

  it('every non-root union is reachable from exactly one root via primary edges (forest property)', () => {
    const state = baseState();
    state.maternalRelatives.uncles = [
      { id: '_mu0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
    ];
    const graph = buildPedigreeFromWizard(state);
    const model = buildLayoutModel(graph);

    // Walk down from every root via childUnionsOf; every union must be visited
    // exactly once (no cycles in the primary-edge tree).
    const visited = new Set();
    const stack = [...model.rootUnions];
    let iterations = 0;
    while (stack.length && iterations < 10000) {
      iterations++;
      const u = stack.pop();
      expect(visited.has(u)).toBe(false); // no union visited twice → forest
      visited.add(u);
      for (const c of model.childUnionsOf.get(u) || []) stack.push(c);
    }
    // All unions reached.
    expect(visited.size).toBe(graph.unions.length);
  });
});

describe('layoutModel — leaf children', () => {
  it('classifies a childless, unpartnered sibling as a leaf child', () => {
    const state = baseState();
    state.siblings.male = [{ id: '_s0', age: '20' }];
    const graph = buildPedigreeFromWizard(state);
    const model = buildLayoutModel(graph);
    // sib_m_0 has no union of its own → leaf
    expect(model.leafChildren).toContain('sib_m_0');
  });

  it('does NOT classify the proband as a leaf child once it has a spouse+child', () => {
    const state = baseState();
    state.graphEdits = [
      { type: 'addSpouse', targetId: 'proband', spouseId: 'de_sp_0', unionId: 'U_DE_0', spouseSex: 'female' },
      { type: 'addChild', unionId: 'U_DE_0', childId: 'de_ch_1', sex: 'male' },
    ];
    const graph = buildPedigreeFromWizard(state);
    const model = buildLayoutModel(graph);
    expect(model.leafChildren).not.toContain('proband'); // proband now anchors a subtree
  });
});

describe('layoutModel — robustness', () => {
  it('handles an empty graph without throwing', () => {
    const model = buildLayoutModel({ individuals: [], unions: [], parentChildRelationships: [] });
    expect(model.generations).toEqual([]);
    expect(model.founders).toEqual([]);
    expect(model.rootUnions).toEqual([]);
  });

  it('every union appears as exactly one family block', () => {
    const graph = buildPedigreeFromWizard(baseState());
    const model = buildLayoutModel(graph);
    expect(model.familyBlocks.map(b => b.unionId).sort()).toEqual(graph.unions.map(u => u.id).sort());
  });
});
