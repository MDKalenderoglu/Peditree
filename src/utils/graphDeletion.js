/**
 * graphDeletion.js
 *
 * v0.3a.2 — generic "delete anyone" support.
 *
 * Before this, deletion was only possible for individuals that originated
 * from a direct graph edit (a spouse/child added via the right-panel
 * editor) — wizard-derived individuals (mother, father, siblings, collateral
 * relatives, ...) could not be deleted at all, since they are produced by
 * wizard *counts*, not freestanding graph nodes.
 *
 * This module applies a post-build overlay instead of touching the wizard
 * fields themselves: `wizardData.deletedIndividualIds` lists individual IDs
 * to remove from whatever graph the builder produces, regardless of origin.
 * This works uniformly for every individual without needing per-relative
 * wizard-mutation logic (decrementing sibling counts, removing a specific
 * uncle/aunt entry, etc.) for each of the ~10 different wizard shapes that
 * can produce an individual.
 *
 * Known trade-off, accepted deliberately given the time budget for this
 * fix: the wizard's own count fields (e.g. "2 kardeş") are NOT decremented
 * when a wizard-derived sibling is deleted this way — the wizard panel will
 * still show a count of 2 even though only 1 individual remains visible on
 * the canvas (the deleted one is filtered out post-build). This is a
 * one-way overlay, not a bidirectional sync with the wizard's own state.
 * Documented here and in the final report rather than silently accepted.
 */

/**
 * Remove a set of individuals (by ID) from an already-built graph, and
 * cascade-clean everything that referenced them:
 *   - any union where either partner is being deleted is removed entirely
 *     (a union with a missing partner is not a valid union)
 *   - any parentChildRelationship for a removed union is removed
 *   - the deleted individual is stripped from any OTHER
 *     parentChildRelationship's children list (they simply stop being a
 *     child of that union — they are not further cascade-deleted; a
 *     parent's removal does not delete their children, matching the
 *     "affected children" preview language in the deletion confirmation UI)
 *   - a parentChildRelationship left with zero children is dropped
 *
 * Pure — never mutates the input graph.
 *
 * @param {{ individuals: Array, unions: Array, parentChildRelationships: Array }} graph
 * @param {string[]} deletedIds
 * @returns {{ individuals: Array, unions: Array, parentChildRelationships: Array }}
 */
export function applyIndividualDeletions(graph, deletedIds) {
  const deleteSet = new Set(deletedIds || []);
  if (deleteSet.size === 0) return graph;

  const individuals = graph.individuals.filter(i => !deleteSet.has(i.id));

  const removedUnionIds = new Set();
  const unions = graph.unions.filter(u => {
    const touchesDeleted = (u.partners || []).some(p => deleteSet.has(p));
    if (touchesDeleted) removedUnionIds.add(u.id);
    return !touchesDeleted;
  });

  const parentChildRelationships = graph.parentChildRelationships
    .filter(rel => !removedUnionIds.has(rel.unionId))
    .map(rel => ({ ...rel, children: rel.children.filter(cid => !deleteSet.has(cid)) }))
    .filter(rel => rel.children.length > 0);

  return { ...graph, individuals, unions, parentChildRelationships };
}
