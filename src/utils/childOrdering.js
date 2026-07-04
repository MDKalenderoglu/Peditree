/**
 * childOrdering.js
 *
 * Generation-agnostic, union-scoped child ordering infrastructure.
 *
 * Every parent-child relationship (union → children[]) can have an explicit
 * left-to-right ordering. Ordering metadata is keyed by union ID, making it
 * work uniformly for proband siblings, half-siblings, cousin groups, and
 * any future descendant groups.
 *
 * Terminology:
 *   - "child group key" = union ID (e.g. 'U_PARENTS', 'U_MAT_UNCLE_0')
 *   - "token"           = child individual ID (deterministic, symbolic)
 *   - "ordering"        = ordered array of tokens for one child group
 *
 * This module is pure (no side effects, no mutation of inputs).
 */

// ────────────────────────────────────────────────────
// Token generation
// ────────────────────────────────────────────────────

/**
 * Generate the canonical set of child tokens for a given union's children.
 * Tokens are individual IDs — they are already deterministic and symbolic.
 *
 * @param {string[]} childIds - the current children of this union
 * @returns {string[]} tokens (same as childIds, identity mapping)
 */
export function generateTokens(childIds) {
  return [...childIds];
}

// ────────────────────────────────────────────────────
// Reconciliation
// ────────────────────────────────────────────────────

/**
 * Reconcile an explicit manual ordering against the current set of valid tokens.
 *
 * Rules:
 *   1. Prune tokens that no longer exist in `validTokens`.
 *   2. Preserve the relative order of surviving tokens.
 *   3. Append newly introduced valid tokens at the end (in their natural order).
 *   4. Never silently delete the anchor child (if one is specified).
 *
 * @param {string[]} manualOrder  - previous explicit ordering (may contain stale tokens)
 * @param {string[]} validTokens  - current valid child IDs for this union
 * @param {string|null} anchorId  - optional anchor child that must survive (e.g. 'proband')
 * @returns {string[]} reconciled ordering
 */
export function reconcileOrder(manualOrder, validTokens, anchorId = null) {
  const validSet = new Set(validTokens);

  // Step 1+2: filter stale, preserve order
  const surviving = manualOrder.filter(token => validSet.has(token));

  // Step 3: find newly introduced tokens not in manual order
  const survivingSet = new Set(surviving);
  const newTokens = validTokens.filter(token => !survivingSet.has(token));

  const result = [...surviving, ...newTokens];

  // Step 4: ensure anchor is present (defensive — should already be in validTokens)
  if (anchorId && validSet.has(anchorId) && !result.includes(anchorId)) {
    result.push(anchorId);
  }

  return result;
}

// ────────────────────────────────────────────────────
// Default ordering
// ────────────────────────────────────────────────────

/**
 * Default deterministic ordering for a child group when no manual order exists.
 *
 * Rules (applied uniformly to all child groups):
 *   1. Liveborn children first, sorted by age descending (oldest left).
 *   2. Children without age come after aged children, in builder insertion order.
 *   3. Pregnancy losses after all liveborn children.
 *   4. Stillbirths after pregnancy losses.
 *   5. Within each category, preserve builder insertion order.
 *
 * @param {Array<{id: string, age?: string, pregnancyLoss?: boolean, stillbirth?: boolean}>} children
 * @returns {string[]} ordered child IDs
 */
export function defaultChildOrder(children) {
  const sorted = [...children].sort((a, b) => {
    // Category: liveborn < pregnancyLoss < stillbirth
    const catA = a.stillbirth ? 2 : a.pregnancyLoss ? 1 : 0;
    const catB = b.stillbirth ? 2 : b.pregnancyLoss ? 1 : 0;
    if (catA !== catB) return catA - catB;

    // Within liveborn: age descending
    if (catA === 0) {
      const ageA = parseInt(a.age);
      const ageB = parseInt(b.age);
      const hasA = !isNaN(ageA);
      const hasB = !isNaN(ageB);
      if (hasA && hasB) return ageB - ageA;
      if (hasA && !hasB) return -1;
      if (!hasA && hasB) return 1;
    }

    // Preserve insertion order (stable sort fallback)
    return 0;
  });

  return sorted.map(c => c.id);
}

// ────────────────────────────────────────────────────
// Apply ordering to a child group
// ────────────────────────────────────────────────────

/**
 * Apply ordering to a child array: either manual (with reconciliation) or default.
 *
 * @param {Array<{id: string, age?: string, pregnancyLoss?: boolean, stillbirth?: boolean}>} children
 *   - the child objects (must have at least `id`)
 * @param {string[]|null} manualOrder
 *   - explicit ordering tokens, or null/empty for default
 * @param {string|null} anchorId
 *   - anchor child ID (e.g. 'proband') — preserved during reconciliation
 * @returns {Array} children sorted according to ordering
 */
export function applyChildOrder(children, manualOrder, anchorId = null) {
  if (!children || children.length === 0) return [];

  const validTokens = children.map(c => c.id);

  let orderedIds;
  if (Array.isArray(manualOrder) && manualOrder.length > 0) {
    orderedIds = reconcileOrder(manualOrder, validTokens, anchorId);
  } else {
    orderedIds = defaultChildOrder(children);
  }

  // Sort children array by orderedIds position
  const orderIndex = new Map();
  orderedIds.forEach((id, i) => orderIndex.set(id, i));

  return [...children].sort((a, b) => {
    const ia = orderIndex.has(a.id) ? orderIndex.get(a.id) : Infinity;
    const ib = orderIndex.has(b.id) ? orderIndex.get(b.id) : Infinity;
    return ia - ib;
  });
}

// ────────────────────────────────────────────────────
// Birth-order reorder (v0.3a.1)
// ────────────────────────────────────────────────────

/**
 * Move one child left or right within an existing sibling-group ordering.
 * Pure and bounds-safe: a move past either end of the array is a no-op
 * (returns the input order, structurally unchanged) rather than wrapping or
 * throwing. Moving a token not present in `order` is also a no-op.
 *
 * This only ever reorders *within* the given order array — it cannot move
 * an individual into a different sibling group, matching the v0.3a.1
 * requirement that reorder controls must not double as arbitrary layout.
 *
 * @param {string[]} order - current child ID ordering for one union
 * @param {string} childId - the child to move
 * @param {'left'|'right'} direction
 * @returns {string[]} a new array (or the same array reference if no-op)
 */
export function moveChildInOrder(order, childId, direction) {
  if (!Array.isArray(order)) return order;
  const idx = order.indexOf(childId);
  if (idx === -1) return order;
  const swapWith = direction === 'left' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= order.length) return order;
  const next = [...order];
  [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
  return next;
}

// ────────────────────────────────────────────────────
// Ordering metadata store
// ────────────────────────────────────────────────────

/**
 * Build a complete ordering metadata map for all child groups in the graph.
 *
 * Returns a Map<unionId, string[]> where each value is the ordered child ID list
 * for that union's children. This is a read-only snapshot — the builder uses it
 * for sorting, and the integrity auditor uses it for consistency checks.
 *
 * @param {Array<{unionId: string, children: string[]}>} parentChildRelationships
 * @param {Map<string, {id: string, age?: string, pregnancyLoss?: boolean, stillbirth?: boolean}>} indById
 *   - individual lookup map
 * @param {Object<string, string[]>|null} manualOrders
 *   - optional manual orderings keyed by union ID (currently only 'U_PARENTS' from wizard)
 * @param {string|null} anchorId
 *   - anchor child for reconciliation
 * @returns {Map<string, string[]>} union ID → ordered child ID list
 */
export function buildOrderingMetadata(parentChildRelationships, indById, manualOrders = null, anchorId = null) {
  const metadata = new Map();

  for (const rel of parentChildRelationships) {
    const childObjects = rel.children
      .map(id => indById.get ? indById.get(id) : indById[id])
      .filter(Boolean);

    const manualOrder = manualOrders?.[rel.unionId] || null;
    const anchor = rel.unionId === 'U_PARENTS' ? anchorId : null;

    const ordered = applyChildOrder(childObjects, manualOrder, anchor);
    metadata.set(rel.unionId, ordered.map(c => c.id));
  }

  return metadata;
}
