/**
 * graphIntegrity.js
 *
 * Pure, deterministic audit layer for the pedigree graph model.
 * Does NOT mutate the input graph — only reads and reports.
 *
 * @param {{ individuals: Array, unions: Array, parentChildRelationships: Array }} graph
 * @returns {Array<{ severity: 'error'|'warning', code: string, message: string, ids: string[] }>}
 */
export function auditPedigreeGraph(graph) {
  const { individuals = [], unions = [], parentChildRelationships = [] } = graph;
  const issues = [];

  // Build lookup sets once
  const individualIdSet = new Set();
  const unionIdSet = new Set();

  // ──────────────────────────────────────
  // 1. Duplicate individual IDs
  // ──────────────────────────────────────
  const seenIndIds = new Map(); // id → count
  for (const ind of individuals) {
    seenIndIds.set(ind.id, (seenIndIds.get(ind.id) || 0) + 1);
    individualIdSet.add(ind.id);
  }
  for (const [id, count] of seenIndIds) {
    if (count > 1) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_INDIVIDUAL_ID',
        message: `Individual ID '${id}' appears ${count} times`,
        ids: [id],
      });
    }
  }

  // ──────────────────────────────────────
  // 2. Duplicate union IDs
  // ──────────────────────────────────────
  const seenUnionIds = new Map(); // id → count
  for (const u of unions) {
    seenUnionIds.set(u.id, (seenUnionIds.get(u.id) || 0) + 1);
    unionIdSet.add(u.id);
  }
  for (const [id, count] of seenUnionIds) {
    if (count > 1) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_UNION_ID',
        message: `Union ID '${id}' appears ${count} times`,
        ids: [id],
      });
    }
  }

  // ──────────────────────────────────────
  // 3. Union partner missing from individuals
  // ──────────────────────────────────────
  for (const u of unions) {
    const partners = u.partners || [];
    for (const pid of partners) {
      if (!individualIdSet.has(pid)) {
        issues.push({
          severity: 'error',
          code: 'UNION_PARTNER_MISSING',
          message: `Union '${u.id}' references partner '${pid}' which does not exist in individuals`,
          ids: [u.id, pid],
        });
      }
    }
  }

  // ──────────────────────────────────────
  // 4. Union where partner1Id === partner2Id
  // ──────────────────────────────────────
  for (const u of unions) {
    const partners = u.partners || [];
    if (partners.length === 2 && partners[0] === partners[1]) {
      issues.push({
        severity: 'error',
        code: 'UNION_SELF_PARTNER',
        message: `Union '${u.id}' has the same individual '${partners[0]}' as both partners`,
        ids: [u.id, partners[0]],
      });
    }
  }

  // ──────────────────────────────────────
  // 5. parentChildRelationship referencing a missing union
  // ──────────────────────────────────────
  for (const rel of parentChildRelationships) {
    if (!unionIdSet.has(rel.unionId)) {
      issues.push({
        severity: 'error',
        code: 'PCR_MISSING_UNION',
        message: `parentChildRelationship references union '${rel.unionId}' which does not exist`,
        ids: [rel.unionId],
      });
    }
  }

  // ──────────────────────────────────────
  // 6. parentChildRelationship referencing a missing child
  // ──────────────────────────────────────
  for (const rel of parentChildRelationships) {
    for (const childId of (rel.children || [])) {
      if (!individualIdSet.has(childId)) {
        issues.push({
          severity: 'error',
          code: 'PCR_MISSING_CHILD',
          message: `parentChildRelationship (union '${rel.unionId}') references child '${childId}' which does not exist in individuals`,
          ids: [rel.unionId, childId],
        });
      }
    }
  }

  // ──────────────────────────────────────
  // 7. Child connected to more than one parent union
  // ──────────────────────────────────────
  const childToUnions = new Map(); // childId → [unionId, ...]
  for (const rel of parentChildRelationships) {
    for (const childId of (rel.children || [])) {
      if (!childToUnions.has(childId)) {
        childToUnions.set(childId, []);
      }
      childToUnions.get(childId).push(rel.unionId);
    }
  }
  for (const [childId, unionIds] of childToUnions) {
    if (unionIds.length > 1) {
      issues.push({
        severity: 'error',
        code: 'CHILD_MULTI_UNION',
        message: `Child '${childId}' is attached to ${unionIds.length} parent unions: ${unionIds.join(', ')}`,
        ids: [childId, ...unionIds],
      });
    }
  }

  // ──────────────────────────────────────
  // 8. Siblings in same PCR with inconsistent generation
  // ──────────────────────────────────────
  const indById = new Map();
  for (const ind of individuals) {
    indById.set(ind.id, ind);
  }
  for (const rel of parentChildRelationships) {
    const childGens = [];
    for (const childId of (rel.children || [])) {
      const child = indById.get(childId);
      if (child) {
        childGens.push({ id: childId, generation: child.generation });
      }
    }
    if (childGens.length > 1) {
      const firstGen = childGens[0].generation;
      const mismatched = childGens.filter(c => c.generation !== firstGen);
      if (mismatched.length > 0) {
        issues.push({
          severity: 'error',
          code: 'SIBLING_GENERATION_INCONSISTENT',
          message: `Children of union '${rel.unionId}' have inconsistent generations: ${childGens.map(c => `${c.id}=${c.generation}`).join(', ')}`,
          ids: [rel.unionId, ...childGens.map(c => c.id)],
        });
      }
    }
  }

  // ──────────────────────────────────────
  // 9. Union partners with inconsistent generation
  // ──────────────────────────────────────
  for (const u of unions) {
    const partners = u.partners || [];
    if (partners.length === 2) {
      const p1 = indById.get(partners[0]);
      const p2 = indById.get(partners[1]);
      if (p1 && p2 && p1.generation !== p2.generation) {
        issues.push({
          severity: 'error',
          code: 'PARTNER_GENERATION_INCONSISTENT',
          message: `Union '${u.id}' partners have different generations: '${p1.id}'=${p1.generation}, '${p2.id}'=${p2.generation}`,
          ids: [u.id, p1.id, p2.id],
        });
      }
    }
  }

  // ──────────────────────────────────────
  // 10. Child ordering metadata consistency (if present)
  // ──────────────────────────────────────
  // If the graph carries ordering metadata (Map<unionId, string[]>),
  // verify that every token in the ordering refers to a real child of that union.
  if (graph.childOrderingMetadata instanceof Map) {
    for (const [unionId, orderedIds] of graph.childOrderingMetadata) {
      const rel = parentChildRelationships.find(r => r.unionId === unionId);
      if (!rel) {
        issues.push({
          severity: 'warning',
          code: 'ORDERING_ORPHAN_UNION',
          message: `Ordering metadata references union '${unionId}' which has no parent-child relationship`,
          ids: [unionId],
        });
        continue;
      }

      const childSet = new Set(rel.children);
      for (const token of orderedIds) {
        if (!childSet.has(token)) {
          issues.push({
            severity: 'warning',
            code: 'ORDERING_STALE_TOKEN',
            message: `Ordering metadata for union '${unionId}' contains token '${token}' which is not a child of that union`,
            ids: [unionId, token],
          });
        }
      }

      // Check for children missing from ordering
      const orderedSet = new Set(orderedIds);
      for (const childId of rel.children) {
        if (!orderedSet.has(childId)) {
          issues.push({
            severity: 'warning',
            code: 'ORDERING_MISSING_CHILD',
            message: `Child '${childId}' of union '${unionId}' is not present in ordering metadata`,
            ids: [unionId, childId],
          });
        }
      }
    }
  }

  // ──────────────────────────────────────
  // 11. Proband count — exactly one required for a clinically complete
  //     pedigree. Zero is a valid *mid-edit* state (warning only); more
  //     than one is a structural violation (error) that should never
  //     survive the builder's stage 10d proband-assignment pass.
  // ──────────────────────────────────────
  {
    const probandIds = individuals.filter(i => i.proband).map(i => i.id);
    if (probandIds.length === 0) {
      issues.push({
        severity: 'warning',
        code: 'PROBAND_MISSING',
        message: 'Pedigride proband (index vaka) işaretlenmemiş.',
        ids: [],
      });
    } else if (probandIds.length > 1) {
      issues.push({
        severity: 'error',
        code: 'PROBAND_MULTIPLE',
        message: `Pedigride birden fazla proband işaretli: ${probandIds.join(', ')}`,
        ids: probandIds,
      });
    }
  }

  // ──────────────────────────────────────
  // 12. Consanguinity reported but not structurally resolved.
  //     Distinct from CHECK 13 below: this is an EXPECTED, non-broken state
  //     (the user declared consanguinity for a degree/path this app doesn't
  //     model ancestors for) — a warning, not evidence of a corrupt graph.
  // ──────────────────────────────────────
  for (const u of unions) {
    if (u.consanguinityStatus === 'reported_unresolved') {
      issues.push({
        severity: 'warning',
        code: 'CONSANGUINITY_UNRESOLVED',
        message: `Union '${u.id}' akraba evliliği olarak işaretli, ancak ortak ata yapısı grafikte modellenmedi (reported_unresolved). Çift çizgi yerine belirsizlik işareti çizilecek.`,
        ids: [u.id],
      });
    }
  }

  // ──────────────────────────────────────
  // 13. Consanguinity flagged but status never finalized — this app's own
  //     builder always resolves `consanguineous: true` to either
  //     'known_supported' or 'reported_unresolved' (see
  //     pedigreeBuilderFromWizard.js). Seeing 'pending'/missing here means
  //     the graph did not go through that pipeline (e.g. malformed/imported
  //     data) — a graph-invalid state, not a normal unresolved report.
  // ──────────────────────────────────────
  for (const u of unions) {
    if (u.consanguineous === true &&
        u.consanguinityStatus !== 'known_supported' &&
        u.consanguinityStatus !== 'reported_unresolved') {
      issues.push({
        severity: 'error',
        code: 'CONSANGUINITY_STATUS_MISSING',
        message: `Union '${u.id}' consanguineous=true ancak consanguinityStatus geçerli bir değere sahip değil ('${u.consanguinityStatus}').`,
        ids: [u.id],
      });
    }
  }

  return issues;
}
