/**
 * relationshipBackground.test.js — v0.3a.2 consanguinity/same-village model.
 */
import { describe, it, expect } from 'vitest';
import {
  RELATIONSHIP_BACKGROUND,
  RELATIONSHIP_BACKGROUND_OPTIONS,
  isValidRelationshipBackground,
  resolveDeclaredRelationshipBackground,
  relationshipBackgroundToEdgeInfo,
} from '../utils/relationshipBackground';
import { buildPedigreeFromWizard } from '../builder/pedigreeBuilderFromWizard';
import { auditPedigreeGraph } from '../utils/graphIntegrity';
import { computePedigreeLayout } from '../utils/pedigreeLayout';
import { baseState } from './helpers';

function assertZeroErrors(issues) {
  expect(issues.filter(i => i.severity === 'error')).toHaveLength(0);
}

describe('relationshipBackground — pure helpers', () => {
  it('exposes exactly the 6 documented states', () => {
    expect(new Set(Object.values(RELATIONSHIP_BACKGROUND))).toEqual(new Set([
      'not_asked', 'no_consanguinity_reported', 'consanguinity_reported',
      'consanguinity_structurally_supported', 'same_village_or_same_origin', 'unknown',
    ]));
  });

  it('user-selectable options exclude the computed structurally_supported state', () => {
    const values = RELATIONSHIP_BACKGROUND_OPTIONS.map(o => o.value);
    expect(values).not.toContain('consanguinity_structurally_supported');
    expect(values).toHaveLength(5);
  });

  it('isValidRelationshipBackground accepts all 6 states and rejects garbage', () => {
    Object.values(RELATIONSHIP_BACKGROUND).forEach(v => expect(isValidRelationshipBackground(v)).toBe(true));
    expect(isValidRelationshipBackground('garbage')).toBe(false);
    expect(isValidRelationshipBackground(undefined)).toBe(false);
  });

  describe('resolveDeclaredRelationshipBackground', () => {
    it('prefers the new map over the legacy map', () => {
      const state = {
        unionRelationshipBackgrounds: { U1: 'same_village_or_same_origin' },
        consanguineousUnions: { U1: true },
      };
      expect(resolveDeclaredRelationshipBackground(state, 'U1')).toBe('same_village_or_same_origin');
    });

    it('falls back to the legacy consanguineousUnions map as consanguinity_reported', () => {
      const state = { consanguineousUnions: { U1: true } };
      expect(resolveDeclaredRelationshipBackground(state, 'U1')).toBe('consanguinity_reported');
    });

    it('returns null when nothing was declared for this union', () => {
      expect(resolveDeclaredRelationshipBackground({}, 'U1')).toBeNull();
    });

    it('ignores a legacy entry explicitly set to false', () => {
      const state = { consanguineousUnions: { U1: false } };
      expect(resolveDeclaredRelationshipBackground(state, 'U1')).toBeNull();
    });
  });

  describe('relationshipBackgroundToEdgeInfo', () => {
    it('consanguinity_structurally_supported → double line, no note', () => {
      expect(relationshipBackgroundToEdgeInfo('consanguinity_structurally_supported'))
        .toEqual({ edgeType: 'consanguineousUnion', noteText: null });
    });

    it('consanguinity_reported → unresolved double line, no note (label lives in the renderer)', () => {
      expect(relationshipBackgroundToEdgeInfo('consanguinity_reported'))
        .toEqual({ edgeType: 'consanguineousUnionUnresolved', noteText: null });
    });

    it('same_village_or_same_origin → single line + neutral note, NEVER a double line', () => {
      const info = relationshipBackgroundToEdgeInfo('same_village_or_same_origin');
      expect(info.edgeType).toBe('union');
      expect(info.noteText).toMatch(/köy|bölge/);
    });

    it('no_consanguinity_reported → single line + note', () => {
      const info = relationshipBackgroundToEdgeInfo('no_consanguinity_reported');
      expect(info.edgeType).toBe('union');
      expect(info.noteText).toBeTruthy();
    });

    it('unknown → single line + note', () => {
      const info = relationshipBackgroundToEdgeInfo('unknown');
      expect(info.edgeType).toBe('union');
      expect(info.noteText).toBeTruthy();
    });

    it('not_asked → single line, no note (silent default)', () => {
      expect(relationshipBackgroundToEdgeInfo('not_asked')).toEqual({ edgeType: 'union', noteText: null });
    });

    it('an unrecognized value falls back to the not_asked (silent default) rendering', () => {
      expect(relationshipBackgroundToEdgeInfo('garbage')).toEqual({ edgeType: 'union', noteText: null });
    });
  });
});

describe('relationshipBackground — builder integration', () => {
  it('every union gets a relationshipBackground, defaulting to not_asked', () => {
    const state = baseState();
    const graph = buildPedigreeFromWizard(state);
    graph.unions.forEach(u => {
      expect(u.relationshipBackground).toBe('not_asked');
    });
  });

  it('consanguinity_reported (new mechanism) with no real shared ancestor renders as the unresolved double line, not a "?"', () => {
    const state = baseState();
    state.maternalRelatives.uncles = [
      { id: '_mu0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
    ];
    state.unionRelationshipBackgrounds = { U_MAT_UNCLE_0: 'consanguinity_reported' };

    const graph = buildPedigreeFromWizard(state);
    const issues = auditPedigreeGraph(graph);
    assertZeroErrors(issues);

    const union = graph.unions.find(u => u.id === 'U_MAT_UNCLE_0');
    expect(union.relationshipBackground).toBe('consanguinity_reported');
    expect(union.consanguinityStatus).toBe('reported_unresolved');

    const layout = computePedigreeLayout(graph);
    const edge = layout.edges.find(e => e.unionId === 'U_MAT_UNCLE_0');
    expect(edge.type).toBe('consanguineousUnionUnresolved');
  });

  it('consanguinity_reported promotes to consanguinity_structurally_supported when a real shared ancestor exists', () => {
    const state = baseState();
    state.maternalRelatives.uncles = [
      { id: '_mu0', children: { male: 0, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
    ];
    state.graphEdits = [
      { type: 'linkPartners', person1: 'mother', person2: 'mat_uncle_0', unionId: 'U_TEST_LINK', status: 'together' },
    ];
    state.unionRelationshipBackgrounds = { U_TEST_LINK: 'consanguinity_reported' };

    const graph = buildPedigreeFromWizard(state);
    assertZeroErrors(auditPedigreeGraph(graph));

    const union = graph.unions.find(u => u.id === 'U_TEST_LINK');
    expect(union.relationshipBackground).toBe('consanguinity_structurally_supported');
    expect(union.consanguinityStatus).toBe('known_supported');

    const layout = computePedigreeLayout(graph);
    const edge = layout.edges.find(e => e.unionId === 'U_TEST_LINK');
    expect(edge.type).toBe('consanguineousUnion');
  });

  it('same_village_or_same_origin never sets consanguineous and never fabricates ancestry', () => {
    const state = baseState();
    state.unionRelationshipBackgrounds = { U_PARENTS: 'same_village_or_same_origin' };

    const beforeGraph = buildPedigreeFromWizard(baseState());
    const graph = buildPedigreeFromWizard(state);
    assertZeroErrors(auditPedigreeGraph(graph));

    const union = graph.unions.find(u => u.id === 'U_PARENTS');
    expect(union.relationshipBackground).toBe('same_village_or_same_origin');
    expect(union.consanguineous).toBe(false);
    expect(union.consanguinityStatus).toBe('none');
    expect(graph.individuals.length).toBe(beforeGraph.individuals.length);
    expect(graph.unions.length).toBe(beforeGraph.unions.length);

    const layout = computePedigreeLayout(graph);
    const edge = layout.edges.find(e => e.unionId === 'U_PARENTS');
    // Never a double line for same-village/origin.
    expect(edge.type).toBe('union');
    expect(edge.noteText).toMatch(/köy|bölge/);
  });

  it('no_consanguinity_reported renders as a plain union line with a note, no consanguinity flag', () => {
    const state = baseState();
    state.unionRelationshipBackgrounds = { U_PARENTS: 'no_consanguinity_reported' };
    const graph = buildPedigreeFromWizard(state);
    assertZeroErrors(auditPedigreeGraph(graph));
    const union = graph.unions.find(u => u.id === 'U_PARENTS');
    expect(union.relationshipBackground).toBe('no_consanguinity_reported');
    expect(union.consanguineous).toBe(false);
  });

  it('unknown renders as a plain union line with a note, no consanguinity flag', () => {
    const state = baseState();
    state.unionRelationshipBackgrounds = { U_PARENTS: 'unknown' };
    const graph = buildPedigreeFromWizard(state);
    assertZeroErrors(auditPedigreeGraph(graph));
    const union = graph.unions.find(u => u.id === 'U_PARENTS');
    expect(union.relationshipBackground).toBe('unknown');
    expect(union.consanguineous).toBe(false);
  });

  it('legacy consanguineousUnions map (old saved sessions) still resolves correctly via the new pipeline', () => {
    const state = baseState();
    state.maternalRelatives.uncles = [
      { id: '_mu0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
    ];
    state.consanguineousUnions = { U_MAT_UNCLE_0: true };
    const graph = buildPedigreeFromWizard(state);
    assertZeroErrors(auditPedigreeGraph(graph));
    const union = graph.unions.find(u => u.id === 'U_MAT_UNCLE_0');
    expect(union.relationshipBackground).toBe('consanguinity_reported');
    expect(union.consanguineous).toBe(true);
  });

  it('the new map takes priority when both legacy and new declarations exist for the same union', () => {
    const state = baseState();
    state.consanguineousUnions = { U_PARENTS: true };
    state.unionRelationshipBackgrounds = { U_PARENTS: 'same_village_or_same_origin' };
    const graph = buildPedigreeFromWizard(state);
    const union = graph.unions.find(u => u.id === 'U_PARENTS');
    expect(union.relationshipBackground).toBe('same_village_or_same_origin');
    expect(union.consanguineous).toBe(false);
  });

  it('the template first-cousin consanguinity path still resolves to consanguinity_structurally_supported', () => {
    const state = baseState();
    state.parents.consanguineous = true;
    state.parents.consanguinityDegree = 'first_cousin';
    state.parents.consanguinityPath = 'mothers_paternal_is_fathers_paternal';
    const graph = buildPedigreeFromWizard(state);
    assertZeroErrors(auditPedigreeGraph(graph));
    const union = graph.unions.find(u => u.id === 'U_PARENTS');
    expect(union.relationshipBackground).toBe('consanguinity_structurally_supported');
  });
});
