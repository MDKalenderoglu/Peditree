/**
 * layoutModel.js — v0.4 clinical layout engine, Phase 1.
 *
 * Pure, coordinate-free structural derivation of a pedigree graph into the
 * family-unit model that the new layout engine packs (Phase 2) and routes
 * (Phase 3). This module computes NO x/y positions and produces NO edges —
 * it only re-expresses the raw graph (individuals / unions /
 * parentChildRelationships) as the relationships the packer needs:
 *
 *   - generation layers (vertical bands)
 *   - each child's single parent union
 *   - each individual's partner unions (0..N — supports remarriage)
 *   - sibling groups (a union's children)
 *   - the descent FOREST of unions: which union hangs beneath which, via a
 *     single "primary" bloodline anchor per union, with any extra bloodline
 *     link (cousin/consanguineous marriage) recorded separately as a LOOP
 *     so the tree stays a tree and the loop is drawn as a back-edge later.
 *
 * Nothing here changes app behavior; it is consumed only by the new engine's
 * later phases and by its own tests. See PEDIGREE_LAYOUT_ENGINE_REDESIGN_PLAN.md.
 */

/**
 * @param {{ individuals: Array, unions: Array, parentChildRelationships: Array }} graph
 * @returns {object} the structural layout model (see module docblock)
 */
export function buildLayoutModel(graph) {
  const individuals = graph.individuals || [];
  const unions = graph.unions || [];
  const pcrs = graph.parentChildRelationships || [];

  const indById = new Map(individuals.map(i => [i.id, i]));
  const unionById = new Map(unions.map(u => [u.id, u]));

  // ── Generation layers ──
  const generationLayers = new Map();
  for (const ind of individuals) {
    const g = ind.generation;
    if (!generationLayers.has(g)) generationLayers.set(g, []);
    generationLayers.get(g).push(ind.id);
  }
  const generations = [...generationLayers.keys()].sort((a, b) => a - b);

  // ── child → parent union (invariant: at most one, per childToUnionMap) ──
  const childToParentUnion = new Map();
  for (const rel of pcrs) {
    for (const cid of rel.children) {
      if (indById.has(cid)) childToParentUnion.set(cid, rel.unionId);
    }
  }

  // ── individual → the unions they are a PARTNER in (0..N) ──
  const partnerUnions = new Map();
  for (const ind of individuals) partnerUnions.set(ind.id, []);
  for (const u of unions) {
    for (const pid of u.partners) {
      if (partnerUnions.has(pid)) partnerUnions.get(pid).push(u.id);
    }
  }

  // ── sibling groups: one per union that actually has children ──
  const siblingGroups = [];
  for (const rel of pcrs) {
    const childIds = rel.children.filter(c => indById.has(c));
    if (childIds.length > 0) siblingGroups.push({ unionId: rel.unionId, childIds });
  }
  const childIdsOfUnion = new Map(siblingGroups.map(sg => [sg.unionId, sg.childIds]));

  // ── founders: individuals with no parent union ──
  const founders = individuals.filter(i => !childToParentUnion.has(i.id)).map(i => i.id);

  // ── descent forest of UNIONS ──
  // For each union, find which of its partners are themselves children of
  // another union (bloodline anchors). Exactly one is chosen as the
  // "primary" parent union (the tree edge); any other is a loop (drawn as a
  // back-edge — the classic consanguinity handling).
  const unionParentUnions = new Map();   // unionId -> [parentUnionId...] (0,1,2)
  const primaryParentUnion = new Map();  // unionId -> parentUnionId | null
  const loopParentUnions = new Map();    // unionId -> [parentUnionId...] extras

  for (const u of unions) {
    const parents = [];
    for (const pid of u.partners) {
      const pu = childToParentUnion.get(pid);
      if (pu && !parents.includes(pu)) parents.push(pu);
    }
    unionParentUnions.set(u.id, parents);
    // Primary = the parent union of the FIRST partner that has one, so the
    // choice is deterministic and stable across rebuilds.
    let primary = null;
    for (const pid of u.partners) {
      const pu = childToParentUnion.get(pid);
      if (pu) { primary = pu; break; }
    }
    primaryParentUnion.set(u.id, primary);
    loopParentUnions.set(u.id, parents.filter(p => p !== primary));
  }

  // childUnionsOf[U] = unions whose PRIMARY anchor is U (tree children).
  const childUnionsOf = new Map(unions.map(u => [u.id, []]));
  for (const u of unions) {
    const primary = primaryParentUnion.get(u.id);
    if (primary && childUnionsOf.has(primary)) childUnionsOf.get(primary).push(u.id);
  }

  // rootUnions = unions with no primary parent union (founder couples).
  const rootUnions = unions.filter(u => primaryParentUnion.get(u.id) == null).map(u => u.id);

  // Family blocks: one per union (childless unions have an empty childIds).
  const familyBlocks = unions.map(u => ({
    unionId: u.id,
    partnerIds: [...u.partners],
    childIds: childIdsOfUnion.get(u.id) || [],
    generation: indById.get(u.partners[0])?.generation ?? null,
  }));

  // Leaf children: children that are NOT a partner in any union (they have
  // no descent subtree of their own; the packer places them directly).
  const leafChildren = [];
  for (const sg of siblingGroups) {
    for (const cid of sg.childIds) {
      if ((partnerUnions.get(cid) || []).length === 0) leafChildren.push(cid);
    }
  }

  return {
    generations,
    generationLayers,
    childToParentUnion,
    partnerUnions,
    siblingGroups,
    childIdsOfUnion,
    founders,
    unionParentUnions,
    primaryParentUnion,
    loopParentUnions,
    childUnionsOf,
    rootUnions,
    familyBlocks,
    leafChildren,
    // lookups carried through for the later phases' convenience
    indById,
    unionById,
  };
}
