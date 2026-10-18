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
 *   - the deleted individual is stripped from every parentChildRelationship's
 *     children list (a parent's removal never deletes their children);
 *   - a union where BOTH partners are deleted is removed, with its
 *     parentChildRelationship;
 *   - a union where ONE partner is deleted and children remain keeps the
 *     children attached to the surviving parent: the deleted partner is
 *     replaced by an explicit placeholder individual (sex 'unknown',
 *     `placeholder: true`, label "Belirtilmemiş ebeveyn") — the same
 *     representation the "add mother only" action already uses. (v0.5 Faz 2a,
 *     DM-4: previously the whole union was dropped, which silently cut the
 *     child's link to the OTHER parent as well.)
 *   - a union where one partner is deleted and no children remain is removed;
 *   - a parentChildRelationship left with zero children is dropped.
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

  const byId = new Map(graph.individuals.map(i => [i.id, i]));
  const individuals = graph.individuals.filter(i => !deleteSet.has(i.id));

  const survivingChildren = new Map();
  for (const rel of graph.parentChildRelationships) {
    survivingChildren.set(rel.unionId, rel.children.filter(cid => !deleteSet.has(cid)));
  }

  const removedUnionIds = new Set();
  const unions = [];
  for (const u of graph.unions) {
    const partners = u.partners || [];
    const deletedPartners = partners.filter(p => deleteSet.has(p));
    if (deletedPartners.length === 0) { unions.push(u); continue; }
    const kids = survivingChildren.get(u.id) || [];
    if (deletedPartners.length === partners.length || kids.length === 0) {
      removedUnionIds.add(u.id);
      continue;
    }
    const survivor = byId.get(partners.find(p => !deleteSet.has(p)));
    const placeholderId = `${u.id}__unspecified`;
    individuals.push({
      id: placeholderId,
      sex: 'unknown',
      generation: survivor ? survivor.generation : byId.get(deletedPartners[0])?.generation,
      relation: 'unspecified_parent',
      label: 'Belirtilmemiş ebeveyn',
      displayLabel: '',
      placeholder: true,
      affected: false, carrier: false, deceased: false, proband: false,
      pregnancyLoss: false, stillbirth: false, notes: '',
    });
    unions.push({
      ...u,
      partners: partners.map(p => (deleteSet.has(p) ? placeholderId : p)),
      // a consanguinity claim about a person who is no longer in the
      // pedigree cannot be carried over to an unspecified stand-in
      consanguineous: false,
      consanguinityStatus: 'none',
      consanguinityDegree: null,
      relationshipBackground: 'not_asked',
    });
  }

  const parentChildRelationships = graph.parentChildRelationships
    .filter(rel => !removedUnionIds.has(rel.unionId))
    .map(rel => ({ ...rel, children: survivingChildren.get(rel.unionId) || [] }))
    .filter(rel => rel.children.length > 0);

  return { ...graph, individuals, unions, parentChildRelationships };
}
