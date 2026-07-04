/**
 * graphTraversal.js
 *
 * BFS-based generation derivation from graph topology.
 * Computes generation values from the pedigree structure rather than
 * relying on hardcoded literals in the builder.
 *
 * Mutates individual.generation in place for every reachable node.
 * Unreachable nodes keep their constructor-assigned generation.
 *
 * @param {{ individuals: Array, unions: Array, parentChildRelationships: Array }} graph
 * @param {string} anchorId - Individual to anchor BFS from (typically 'proband')
 * @param {number} anchorGeneration - Generation value for the anchor (typically 3)
 * @returns {Array<{ code: string, message: string, ids: string[] }>} - Generation conflict warnings
 */
export function computeGenerations(graph, anchorId = 'proband', anchorGeneration = 3) {
  const { individuals, unions, parentChildRelationships } = graph;
  const warnings = [];

  // ── Build adjacency structures (all read-only over input arrays) ──

  // childId → unionId (at most one, by single-parent invariant)
  const childToUnion = new Map();
  for (const rel of parentChildRelationships) {
    for (const childId of rel.children) {
      childToUnion.set(childId, rel.unionId);
    }
  }

  // unionId → [partner1, partner2]  (array reference from the union object)
  const unionToPartners = new Map();
  for (const u of unions) {
    unionToPartners.set(u.id, u.partners);
  }

  // unionId → children[]  (array reference from the PCR object)
  const unionToChildren = new Map();
  for (const rel of parentChildRelationships) {
    unionToChildren.set(rel.unionId, rel.children);
  }

  // individualId → [unionId, ...]  (unions where this person is a PARTNER)
  const indToPartnerUnions = new Map();
  for (const u of unions) {
    for (const pid of u.partners) {
      if (!indToPartnerUnions.has(pid)) {
        indToPartnerUnions.set(pid, []);
      }
      indToPartnerUnions.get(pid).push(u.id);
    }
  }

  // ── BFS ──

  const derived = new Map();   // id → generation (first-derived value wins)
  const visited = new Set();   // ids already enqueued (prevents re-enqueue)
  const queue = [];            // FIFO: { id, gen }

  // Seed with anchor
  const anchorExists = individuals.some(i => i.id === anchorId);
  if (!anchorExists) {
    // Anchor not found — cannot derive anything; leave all generations as-is
    warnings.push({
      code: 'GENERATION_ANCHOR_MISSING',
      message: `Anchor individual '${anchorId}' not found in graph; generation derivation skipped`,
      ids: [anchorId],
    });
    return warnings;
  }

  derived.set(anchorId, anchorGeneration);
  visited.add(anchorId);
  queue.push({ id: anchorId, gen: anchorGeneration });

  while (queue.length > 0) {
    const { id, gen } = queue.shift();

    // ── 1. UP: if this person is a child in a union, parents get gen - 1 ──
    const parentUnionId = childToUnion.get(id);
    if (parentUnionId) {
      const partners = unionToPartners.get(parentUnionId) || [];
      for (const partnerId of partners) {
        if (!visited.has(partnerId)) {
          derived.set(partnerId, gen - 1);
          visited.add(partnerId);
          queue.push({ id: partnerId, gen: gen - 1 });
        } else if (derived.get(partnerId) !== gen - 1) {
          warnings.push({
            code: 'GENERATION_INCONSISTENT',
            message: `Individual '${partnerId}' derived as gen ${derived.get(partnerId)} but path through child '${id}' gives gen ${gen - 1}`,
            ids: [partnerId, id],
          });
        }
      }
    }

    // ── 2. DOWN + 3. LATERAL: iterate unions where this person is a partner ──
    const partnerUnions = indToPartnerUnions.get(id) || [];
    for (const unionId of partnerUnions) {

      // 2. DOWN: children get gen + 1
      const children = unionToChildren.get(unionId) || [];
      for (const childId of children) {
        if (!visited.has(childId)) {
          derived.set(childId, gen + 1);
          visited.add(childId);
          queue.push({ id: childId, gen: gen + 1 });
        } else if (derived.get(childId) !== gen + 1) {
          warnings.push({
            code: 'GENERATION_INCONSISTENT',
            message: `Individual '${childId}' derived as gen ${derived.get(childId)} but path through parent '${id}' gives gen ${gen + 1}`,
            ids: [childId, id],
          });
        }
      }

      // 3. LATERAL: co-partner gets same gen
      const partners = unionToPartners.get(unionId) || [];
      for (const partnerId of partners) {
        if (partnerId === id) continue; // skip self
        if (!visited.has(partnerId)) {
          derived.set(partnerId, gen);
          visited.add(partnerId);
          queue.push({ id: partnerId, gen });
        } else if (derived.get(partnerId) !== gen) {
          warnings.push({
            code: 'GENERATION_INCONSISTENT',
            message: `Partner '${partnerId}' derived as gen ${derived.get(partnerId)} but union '${unionId}' with '${id}' gives gen ${gen}`,
            ids: [partnerId, id, unionId],
          });
        }
      }
    }
  }

  // ── Apply derived generations to individuals ──
  // Mutate in place. Unreachable nodes keep their constructor-assigned generation.
  for (const ind of individuals) {
    if (derived.has(ind.id)) {
      ind.generation = derived.get(ind.id);
    }
  }

  return warnings;
}
