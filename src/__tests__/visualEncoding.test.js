import { describe, it, expect } from 'vitest';
import { buildConditionRegistry, hasAffectedCondition } from '../utils/conditionRegistry';
import { auditPedigreeGraph } from '../utils/graphIntegrity';

/**
 * v0.3a rendering-semantics tests.
 *
 * PedigreeCanvas.jsx itself is not exercised here (the project's vitest
 * environment is 'node', not 'jsdom' — there is no DOM/SVG render harness in
 * this repo). Instead these tests assert on the exact derived render input
 * (`hasAffectedCondition`, the condition registry) that PedigreeCanvas.jsx
 * consumes directly, per PEDIGREE_NEXT_IMPLEMENTATION_PLAN.md's guidance to
 * prefer pure-function assertions over pixel output.
 */

describe('v0.3a — backward-compatible fill semantics', () => {
  it('an existing affected individual with no conditions[] resolves to solid-fill exactly as before', () => {
    const ind = { id: 'proband', affected: true, conditions: [] };
    // The canvas's fill decision is `d.affected || hasAffectedCondition(d)`.
    // With no conditions, hasAffectedCondition must be false, so the whole
    // decision reduces to the pre-existing `d.affected` boolean, unchanged.
    expect(hasAffectedCondition(ind)).toBe(false);
    expect(ind.affected || hasAffectedCondition(ind)).toBe(true);
  });

  it('an unaffected individual with no conditions and no legacy condition string resolves to no fill', () => {
    const ind = { id: 'a', affected: false, carrier: false };
    expect(ind.affected || hasAffectedCondition(ind)).toBe(false);
  });

  it('an individual with one affected structured condition resolves to solid-fill semantics', () => {
    const ind = { id: 'a', affected: false, conditions: [{ label: 'Epilepsi', status: 'affected' }] };
    expect(hasAffectedCondition(ind)).toBe(true);
    expect(ind.affected || hasAffectedCondition(ind)).toBe(true);
  });

  it('an individual with multiple conditions still resolves to a single boolean fill decision (no partitioning in v0.3a)', () => {
    const ind = {
      id: 'a',
      conditions: [
        { label: 'A', status: 'affected' },
        { label: 'B', status: 'affected' },
        { label: 'C', status: 'carrier' },
        { label: 'D', status: 'unknown' },
      ],
    };
    // v0.3a exposes no per-condition partition/quadrant/pattern data — the
    // render input is a plain boolean, regardless of how many conditions
    // exist. Partitioned fill geometry is v0.3b, not implemented here.
    expect(typeof hasAffectedCondition(ind)).toBe('boolean');
    expect(hasAffectedCondition(ind)).toBe(true);
  });

  it('carrier-only individuals are unaffected by the conditions fill logic (carrier rendering untouched in v0.3a)', () => {
    const ind = { id: 'a', affected: false, carrier: true, conditions: [{ label: 'X', status: 'carrier' }] };
    expect(hasAffectedCondition(ind)).toBe(false);
    expect(ind.affected || hasAffectedCondition(ind)).toBe(false);
    // carrier flag itself is untouched — still available for the existing
    // (unchanged in v0.3a) carrier-half-fill branch in PedigreeCanvas.jsx.
    expect(ind.carrier).toBe(true);
  });
});

describe('v0.3a — condition legend deduplication (stress-test Fixture 8 subset)', () => {
  it('a shared conditionId across a proband, a sibling, and a maternal uncle yields exactly one legend row', () => {
    const individuals = [
      { id: 'proband', conditions: [{ conditionId: 'c1', label: 'Cond 1', status: 'affected' }] },
      { id: 'sibling', conditions: [{ conditionId: 'c2', label: 'Cond 2', status: 'affected' }] },
      { id: 'mat_uncle_0', conditions: [{ conditionId: 'c2', label: 'Cond 2', status: 'affected' }] },
    ];
    const registry = buildConditionRegistry(individuals);
    expect(registry).toHaveLength(2);
    expect(registry.map(r => r.conditionId).sort()).toEqual(['c1', 'c2']);
  });

  it('an individual with 4 simultaneous conditions contributes 4 distinct rows, no dedup collapse', () => {
    const individuals = [
      {
        id: 'a',
        conditions: [
          { label: 'W', status: 'affected' },
          { label: 'X', status: 'affected' },
          { label: 'Y', status: 'affected' },
          { label: 'Z', status: 'affected' },
        ],
      },
    ];
    const registry = buildConditionRegistry(individuals);
    expect(registry).toHaveLength(4);
  });
});

describe('v0.3a — graphIntegrity CONDITION_ID_UNLABELED', () => {
  const baseGraph = { unions: [], parentChildRelationships: [] };

  it('does not fire for a normal labeled condition', () => {
    const issues = auditPedigreeGraph({
      ...baseGraph,
      individuals: [{ id: 'a', conditions: [{ label: 'Epilepsi', status: 'affected' }] }],
    });
    expect(issues.filter(i => i.code === 'CONDITION_ID_UNLABELED')).toHaveLength(0);
  });

  it('does not fire for an individual with no conditions at all', () => {
    const issues = auditPedigreeGraph({ ...baseGraph, individuals: [{ id: 'a' }] });
    expect(issues.filter(i => i.code === 'CONDITION_ID_UNLABELED')).toHaveLength(0);
  });

  it('fires as a warning (not an error) for a condition entry with neither label nor conditionId', () => {
    const issues = auditPedigreeGraph({
      ...baseGraph,
      individuals: [{ id: 'a', conditions: [{ status: 'affected' }] }],
    });
    const hits = issues.filter(i => i.code === 'CONDITION_ID_UNLABELED');
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('warning');
    expect(hits[0].ids).toContain('a');
  });

  it('does not fire when conditionId is present even without a label', () => {
    const issues = auditPedigreeGraph({
      ...baseGraph,
      individuals: [{ id: 'a', conditions: [{ conditionId: 'c1', status: 'affected' }] }],
    });
    expect(issues.filter(i => i.code === 'CONDITION_ID_UNLABELED')).toHaveLength(0);
  });

  it('a valid pedigree with well-labeled conditions has zero CONDITION_ID_UNLABELED warnings', () => {
    const issues = auditPedigreeGraph({
      ...baseGraph,
      individuals: [
        { id: 'proband', proband: true, conditions: [{ label: 'Cond 1', status: 'affected' }] },
        { id: 'sibling', conditions: [{ label: 'Cond 2', status: 'affected' }] },
      ],
    });
    expect(issues.filter(i => i.code === 'CONDITION_ID_UNLABELED')).toHaveLength(0);
  });
});
