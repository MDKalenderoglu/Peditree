/**
 * siblingCounts.js — v0.4.1
 *
 * The left panel's "2. Kardesler" stepper counts used to read directly from
 * `wizardData.siblings.*` arrays. But the selected-person editor's "add
 * sibling" action (usePedigreeStore.js's addSiblingTo) writes to a SEPARATE
 * mechanism (`wizardData.graphEdits`, type 'addChild'), so a sibling added
 * from the right panel was invisible to the left panel's counters — they
 * stayed at 0, and the user could never decrement/delete that sibling from
 * the left panel.
 *
 * The fix: derive the left panel's counts from the built graph
 * (`pedigreeData`), the single canonical source both mechanisms feed into,
 * instead of from either wizard sub-structure alone.
 */

/** Counts of the proband's full siblings (U_PARENTS children, excluding the
 * proband itself), bucketed to match the left panel's five categories. */
export function deriveSiblingCounts(pedigreeData) {
  const counts = { male: 0, female: 0, unknown: 0, pregnancyLoss: 0, deceased: 0 };
  const pcrs = pedigreeData?.parentChildRelationships || [];
  const individuals = pedigreeData?.individuals || [];
  const rel = pcrs.find(r => r.unionId === 'U_PARENTS');
  if (!rel) return counts;

  const indById = new Map(individuals.map(i => [i.id, i]));
  for (const childId of rel.children) {
    const ind = indById.get(childId);
    if (!ind || ind.relation === 'proband') continue;
    if (ind.pregnancyLoss) counts.pregnancyLoss += 1;
    else if (ind.stillbirth) counts.deceased += 1;
    else if (ind.sex === 'male') counts.male += 1;
    else if (ind.sex === 'female') counts.female += 1;
    else counts.unknown += 1;
  }
  return counts;
}

/** The full sibling list (excluding proband), in birth order, for a given
 * category — used to find "the last one" when decrementing from either
 * source (a wizardData.siblings.* entry or a graphEdits addChild entry). */
export function siblingsInCategory(pedigreeData, category) {
  const pcrs = pedigreeData?.parentChildRelationships || [];
  const individuals = pedigreeData?.individuals || [];
  const rel = pcrs.find(r => r.unionId === 'U_PARENTS');
  if (!rel) return [];

  const indById = new Map(individuals.map(i => [i.id, i]));
  const matches = (ind) => {
    if (category === 'pregnancyLoss') return !!ind.pregnancyLoss;
    if (category === 'deceased') return !!ind.stillbirth;
    if (ind.pregnancyLoss || ind.stillbirth) return false;
    return ind.sex === category;
  };
  return rel.children
    .map(id => indById.get(id))
    .filter(ind => ind && ind.relation !== 'proband' && matches(ind));
}
