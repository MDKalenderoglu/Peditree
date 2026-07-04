/**
 * conditionRegistry.js
 *
 * Pure, DOM-free helpers for v0.3a multi-condition support.
 *
 * `Individual.conditions` is additive and optional:
 *   conditions?: [{ conditionId?: string, label: string, status: 'affected'|'carrier'|'unknown' }]
 *
 * `conditionId` is optional on individual entries — when absent it is
 * derived from the label via a stable slug, so two individuals who each
 * type the same condition text end up sharing one registry row without
 * requiring a separate registry-management UI (per
 * PEDIGREE_RELATIONSHIP_MODEL_SPEC.md §2 / PEDIGREE_VISUAL_ENCODING_SPEC.md §2.1).
 *
 * Legacy compatibility: an individual with no `conditions[]` but a non-empty
 * legacy `condition` free-text string is normalized, read-only, into a single
 * condition entry deriving status from `affected`/`carrier`. This is a pure
 * derivation done at read time — it never writes back to the individual or
 * to persistence, so calling it repeatedly can never create duplicate stored
 * entries. Full persistence-level migration (rewriting `condition` into a
 * stored `conditions[]` on session load) is deferred: usePedigreeStore.js's
 * manualEdits/mergedIndividuals overlay path is not covered by existing tests
 * for this kind of rewrite, and a write-on-load migration risks interacting
 * with the debounced autosave in ways this slice does not need to risk —
 * read-time normalization is fully equivalent for rendering purposes and
 * satisfies "undefined and [] must behave identically" without touching
 * persistence.js.
 */

function slugify(label) {
  if (!label) return '';
  const slug = label
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'condition';
}

function deriveConditionId(entry) {
  if (entry && typeof entry.conditionId === 'string' && entry.conditionId.trim()) {
    return entry.conditionId.trim();
  }
  return slugify(entry && entry.label);
}

function normalizeStatus(status) {
  return status === 'affected' || status === 'carrier' ? status : 'unknown';
}

/**
 * Normalize one individual's conditions to a consistent shape, regardless of
 * whether they came from the structured `conditions[]` field or the legacy
 * free-text `condition` string. Never mutates the input.
 *
 * @param {object} individual
 * @returns {Array<{ conditionId: string, label: string, status: string }>}
 */
export function normalizeIndividualConditions(individual) {
  if (!individual) return [];

  if (Array.isArray(individual.conditions) && individual.conditions.length > 0) {
    return individual.conditions
      .filter(c => c && (c.label || c.conditionId))
      .map(c => ({
        conditionId: deriveConditionId(c),
        label: (c.label && c.label.trim()) || c.conditionId,
        status: normalizeStatus(c.status),
      }));
  }

  // Legacy fallback — read-only derivation, see module docblock.
  if (typeof individual.condition === 'string' && individual.condition.trim()) {
    const label = individual.condition.trim();
    return [{
      conditionId: slugify(label),
      label,
      status: individual.affected ? 'affected' : individual.carrier ? 'carrier' : 'unknown',
    }];
  }

  return [];
}

/**
 * Derive a stable, insertion-ordered registry of unique conditions across a
 * set of individuals. First occurrence (in `individuals` order) wins the
 * registry slot for a given conditionId; later duplicates are deduped.
 *
 * @param {Array<object>} individuals
 * @returns {Array<{ conditionId: string, label: string }>}
 */
export function buildConditionRegistry(individuals) {
  const registry = [];
  const seen = new Set();

  for (const ind of (individuals || [])) {
    for (const cond of normalizeIndividualConditions(ind)) {
      if (!cond.conditionId || seen.has(cond.conditionId)) continue;
      seen.add(cond.conditionId);
      registry.push({ conditionId: cond.conditionId, label: cond.label });
    }
  }

  return registry;
}

/**
 * Whether an individual has at least one condition (structured or
 * legacy-derived) with status 'affected'. Shared by the canvas fill logic
 * and by tests, so the render decision is verifiable without a DOM harness.
 *
 * @param {object} individual
 * @returns {boolean}
 */
export function hasAffectedCondition(individual) {
  return normalizeIndividualConditions(individual).some(c => c.status === 'affected');
}

/**
 * Whether any individual carries at least one structured condition entry.
 * Deliberately checks the raw `conditions[]` field only (not the legacy
 * `condition`-string fallback) — this is the literal v0.3a legend trigger:
 * the legend should appear once someone uses the new structured field, not
 * retroactively for every pre-existing session that merely has free-text
 * `condition` notes (those already render via the existing "Klinik Notlar"
 * legend and must not regress or duplicate into a second legend).
 *
 * @param {Array<object>} individuals
 * @returns {boolean}
 */
export function hasAnyConditions(individuals) {
  return (individuals || []).some(ind => Array.isArray(ind?.conditions) && ind.conditions.length > 0);
}
