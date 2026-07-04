import { describe, it, expect } from 'vitest';
import {
  normalizeIndividualConditions,
  buildConditionRegistry,
  hasAnyConditions,
  hasAffectedCondition,
} from '../utils/conditionRegistry';

describe('conditionRegistry — normalizeIndividualConditions', () => {
  it('returns [] for undefined individual', () => {
    expect(normalizeIndividualConditions(undefined)).toEqual([]);
  });

  it('returns [] when conditions is undefined and no legacy condition string', () => {
    expect(normalizeIndividualConditions({ id: 'a' })).toEqual([]);
  });

  it('returns [] when conditions is an empty array and no legacy condition string', () => {
    expect(normalizeIndividualConditions({ id: 'a', conditions: [] })).toEqual([]);
  });

  it('does not crash on malformed entries (null/empty label+id)', () => {
    expect(() => normalizeIndividualConditions({ id: 'a', conditions: [null, {}, { label: '' }] })).not.toThrow();
    expect(normalizeIndividualConditions({ id: 'a', conditions: [null, {}, { label: '' }] })).toEqual([]);
  });

  it('normalizes a structured condition entry, defaulting status to unknown', () => {
    const result = normalizeIndividualConditions({ id: 'a', conditions: [{ label: 'Epilepsi' }] });
    expect(result).toEqual([{ conditionId: 'epilepsi', label: 'Epilepsi', status: 'unknown' }]);
  });

  it('preserves an explicit conditionId over the derived slug', () => {
    const result = normalizeIndividualConditions({
      id: 'a',
      conditions: [{ conditionId: 'cond_1', label: 'Kanser', status: 'affected' }],
    });
    expect(result).toEqual([{ conditionId: 'cond_1', label: 'Kanser', status: 'affected' }]);
  });

  it('derives a stable id from label when conditionId is absent', () => {
    const r1 = normalizeIndividualConditions({ id: 'a', conditions: [{ label: 'Kistik Fibrozis' }] });
    const r2 = normalizeIndividualConditions({ id: 'b', conditions: [{ label: 'Kistik Fibrozis' }] });
    expect(r1[0].conditionId).toBe(r2[0].conditionId);
  });

  it('normalizes a legacy condition string when conditions[] is absent, deriving affected status', () => {
    const result = normalizeIndividualConditions({ id: 'a', condition: 'Astim', affected: true });
    expect(result).toEqual([{ conditionId: 'astim', label: 'Astim', status: 'affected' }]);
  });

  it('normalizes a legacy condition string deriving carrier status', () => {
    const result = normalizeIndividualConditions({ id: 'a', condition: 'Astim', affected: false, carrier: true });
    expect(result[0].status).toBe('carrier');
  });

  it('normalizes a legacy condition string deriving unknown status when neither affected nor carrier', () => {
    const result = normalizeIndividualConditions({ id: 'a', condition: 'Astim' });
    expect(result[0].status).toBe('unknown');
  });

  it('is idempotent — repeated calls on the same individual never duplicate entries', () => {
    const ind = { id: 'a', condition: 'Astim', affected: true };
    const first = normalizeIndividualConditions(ind);
    const second = normalizeIndividualConditions(ind);
    expect(first).toEqual(second);
    expect(first).toHaveLength(1);
  });

  it('prefers structured conditions[] over the legacy condition string when both are present', () => {
    const result = normalizeIndividualConditions({
      id: 'a',
      condition: 'Legacy text',
      conditions: [{ label: 'Structured entry', status: 'affected' }],
    });
    expect(result).toEqual([{ conditionId: 'structured_entry', label: 'Structured entry', status: 'affected' }]);
  });
});

describe('conditionRegistry — buildConditionRegistry', () => {
  it('returns an empty registry for an empty individuals array', () => {
    expect(buildConditionRegistry([])).toEqual([]);
  });

  it('returns an empty registry for undefined individuals', () => {
    expect(buildConditionRegistry(undefined)).toEqual([]);
  });

  it('does not crash when individuals have undefined/missing conditions', () => {
    expect(() => buildConditionRegistry([{ id: 'a' }, { id: 'b', conditions: undefined }])).not.toThrow();
    expect(buildConditionRegistry([{ id: 'a' }, { id: 'b', conditions: undefined }])).toEqual([]);
  });

  it('preserves stable insertion order across individuals', () => {
    const individuals = [
      { id: 'a', conditions: [{ label: 'Second seen', status: 'unknown' }] },
      { id: 'b', conditions: [{ label: 'First seen', status: 'unknown' }] },
    ];
    // 'a' comes before 'b' in the input array, so its condition registers first
    const registry = buildConditionRegistry(individuals);
    expect(registry.map(r => r.label)).toEqual(['Second seen', 'First seen']);
  });

  it('deduplicates a shared conditionId appearing on multiple individuals into one row', () => {
    const individuals = [
      { id: 'a', conditions: [{ conditionId: 'c2', label: 'Kanser', status: 'affected' }] },
      { id: 'b', conditions: [{ conditionId: 'c2', label: 'Kanser', status: 'affected' }] },
      { id: 'c', conditions: [{ conditionId: 'c1', label: 'Diyabet', status: 'affected' }] },
    ];
    const registry = buildConditionRegistry(individuals);
    expect(registry).toHaveLength(2);
    expect(registry.map(r => r.conditionId)).toEqual(['c2', 'c1']);
  });

  it('deduplicates a shared label (no explicit id) across individuals via the derived slug', () => {
    const individuals = [
      { id: 'a', conditions: [{ label: 'Norogelisimsel bozukluk', status: 'affected' }] },
      { id: 'b', conditions: [{ label: 'Norogelisimsel bozukluk', status: 'unknown' }] },
    ];
    const registry = buildConditionRegistry(individuals);
    expect(registry).toHaveLength(1);
  });

  it('normalizes a legacy condition string into exactly one registry entry', () => {
    const registry = buildConditionRegistry([{ id: 'a', condition: 'Astim', affected: true }]);
    expect(registry).toEqual([{ conditionId: 'astim', label: 'Astim' }]);
  });

  it('repeated registry builds over the same individuals never grow the registry', () => {
    const individuals = [{ id: 'a', conditions: [{ label: 'Epilepsi', status: 'affected' }] }];
    const first = buildConditionRegistry(individuals);
    const second = buildConditionRegistry(individuals);
    const third = buildConditionRegistry(individuals);
    expect(first).toEqual(second);
    expect(second).toEqual(third);
    expect(third).toHaveLength(1);
  });
});

describe('conditionRegistry — hasAnyConditions', () => {
  it('is false for individuals with no conditions field', () => {
    expect(hasAnyConditions([{ id: 'a' }, { id: 'b' }])).toBe(false);
  });

  it('is false for individuals with only legacy condition strings (no structured conditions[])', () => {
    expect(hasAnyConditions([{ id: 'a', condition: 'Astim', affected: true }])).toBe(false);
  });

  it('is true once any individual has a non-empty structured conditions[] array', () => {
    expect(hasAnyConditions([{ id: 'a' }, { id: 'b', conditions: [{ label: 'X' }] }])).toBe(true);
  });

  it('is false for an explicitly empty conditions[] array', () => {
    expect(hasAnyConditions([{ id: 'a', conditions: [] }])).toBe(false);
  });
});

describe('conditionRegistry — hasAffectedCondition', () => {
  it('is false when there are no conditions and no legacy affected-deriving condition string', () => {
    expect(hasAffectedCondition({ id: 'a' })).toBe(false);
  });

  it('is true when a structured condition has status affected', () => {
    expect(hasAffectedCondition({ id: 'a', conditions: [{ label: 'X', status: 'affected' }] })).toBe(true);
  });

  it('is false when structured conditions exist but none are affected', () => {
    expect(hasAffectedCondition({
      id: 'a',
      conditions: [{ label: 'X', status: 'carrier' }, { label: 'Y', status: 'unknown' }],
    })).toBe(false);
  });
});
