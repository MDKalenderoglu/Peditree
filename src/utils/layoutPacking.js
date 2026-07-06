/**
 * layoutPacking.js — v0.4 clinical layout engine, Phase 2.
 *
 * Pure x/y coordinate assignment built on the Phase-1 structural model
 * (layoutModel.js). Produces `{ xPos, yPos }` maps. NOT yet wired into the
 * renderer — it is developed and validated in parallel (per
 * PEDIGREE_LAYOUT_ENGINE_REDESIGN_PLAN.md's v0.4a "parallel engine" step)
 * so its output can be checked against the SIBSHIP_BUS_OVERLAP /
 * EDGE_THROUGH_NODE audits on real fixtures BEFORE any cutover.
 *
 * Core guarantee (the fix for the "single global bus" collapse): within
 * every generation, each sibling group is laid out as a CONTIGUOUS,
 * non-overlapping horizontal interval — sibling groups are never
 * interleaved. Because a union's child-connector rail spans exactly its own
 * (contiguous) children, two different unions' rails can no longer overlap.
 *
 * Algorithm:
 *   1. Order each generation left-to-right (top→bottom), keeping sibling
 *      groups contiguous and married-in spouses adjacent to their partner.
 *   2. Assign X bottom-up so a couple centers over its children, with a
 *      per-layer minimum-separation pass that preserves order and
 *      contiguity.
 *   3. A light top-down pass nudges nodes that have no children (founders,
 *      married-in spouses) toward their partner/parents for tidiness.
 */

import { buildLayoutModel } from './layoutModel';

const GEN_Y_SPACING = 150;
const NODE_SLOT = 90;      // horizontal slot per individual (matches NODE_X_SPACING)
const SPOUSE_GAP = 70;     // gap between two partners of a union
const Y_TOP = 80;

/**
 * @param {{ individuals: Array, unions: Array, parentChildRelationships: Array }} graph
 * @returns {{ xPos: Object<string,number>, yPos: Object<string,number>, order: Map<number,string[]> }}
 */
export function computeFamilyBlockLayout(graph) {
  const model = buildLayoutModel(graph);
  const { generations } = model;

  if (generations.length === 0) return { xPos: {}, yPos: {}, order: new Map() };

  const minGen = generations[0];
  const yPos = {};
  for (const ind of graph.individuals) {
    yPos[ind.id] = Y_TOP + (ind.generation - minGen) * GEN_Y_SPACING;
  }

  const order = orderGenerations(model);
  const xPos = assignX(order, model, generations);

  return { xPos, yPos, order };
}

// ─────────────────────────────────────────────────────────────
// Step 1 — ordering
// ─────────────────────────────────────────────────────────────

function orderGenerations(model) {
  const { generations, generationLayers } = model;
  const order = new Map();

  generations.forEach((gen, gi) => {
    const idsThisGen = generationLayers.get(gen) || [];
    if (gi === 0) {
      order.set(gen, orderTopGeneration(idsThisGen, model));
      return;
    }
    const parentOrder = order.get(generations[gi - 1]) || [];
    order.set(gen, orderMiddleGeneration(idsThisGen, parentOrder, model));
  });

  return order;
}

/**
 * Order one generation so that couples end up ADJACENT even when the two
 * partners come from different sibling blocks (the convergent-marriage case
 * that produces the "union line spans across unrelated siblings" defect).
 *
 * Approach: sibling blocks are seriated (chained so marriage-joined blocks
 * are neighbours), the child who marries into the next/previous block is
 * pulled to that block's touching edge, and married-in spouses are inlined
 * beside their partner (alternating sides when a person has multiple unions).
 */
function orderMiddleGeneration(idsThisGen, parentOrder, model) {
  const { childToParentUnion, partnerUnions, childIdsOfUnion, unionById } = model;
  const parentRank = new Map(parentOrder.map((id, i) => [id, i]));
  const idSet = new Set(idsThisGen);

  const bloodline = idsThisGen.filter(id => childToParentUnion.has(id));
  const marriedIn = idsThisGen.filter(id => !childToParentUnion.has(id));

  // One block per parent union with children here.
  const unionIds = [...new Set(bloodline.map(id => childToParentUnion.get(id)))];
  const blockById = new Map();
  for (const unionId of unionIds) {
    const union = unionById.get(unionId);
    const ranks = (union?.partners || []).map(p => parentRank.get(p)).filter(r => r !== undefined);
    const bary = ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 1e9;
    const kids = (childIdsOfUnion.get(unionId) || []).filter(c => idSet.has(c));
    blockById.set(unionId, { unionId, bary, kids: [...kids] });
  }

  const parentUnionOf = (id) => childToParentUnion.get(id);

  // Cross-block marriages: a union at this gen whose two partners are
  // bloodline children of DIFFERENT blocks. Record which child touches which
  // other block, so we can pull them to the shared edge.
  const joins = []; // { blockA, blockB, childA, childB }
  const seenUnions = new Set();
  for (const id of bloodline) {
    for (const uId of (partnerUnions.get(id) || [])) {
      if (seenUnions.has(uId)) continue;
      const union = unionById.get(uId);
      if (!union) continue;
      const [a, b] = union.partners;
      if (!idSet.has(a) || !idSet.has(b)) continue;
      const pa = parentUnionOf(a), pb = parentUnionOf(b);
      if (pa && pb && pa !== pb && blockById.has(pa) && blockById.has(pb)) {
        joins.push({ blockA: pa, blockB: pb, childA: a, childB: b });
        seenUnions.add(uId);
      }
    }
  }

  // Seriate blocks: greedy chain — start from lowest-barycenter block, then
  // repeatedly append a not-yet-placed block joined to the last placed one;
  // otherwise the lowest-barycenter remaining block.
  const remaining = [...blockById.keys()].sort((x, y) => blockById.get(x).bary - blockById.get(y).bary);
  const joinNeighbours = new Map();
  for (const j of joins) {
    if (!joinNeighbours.has(j.blockA)) joinNeighbours.set(j.blockA, []);
    if (!joinNeighbours.has(j.blockB)) joinNeighbours.set(j.blockB, []);
    joinNeighbours.get(j.blockA).push(j.blockB);
    joinNeighbours.get(j.blockB).push(j.blockA);
  }
  const blockSeq = [];
  const placedBlocks = new Set();
  while (remaining.length) {
    let next;
    const last = blockSeq[blockSeq.length - 1];
    if (last && joinNeighbours.has(last)) {
      next = (joinNeighbours.get(last) || []).find(nb => !placedBlocks.has(nb));
    }
    if (!next) next = remaining.find(b => !placedBlocks.has(b));
    if (!next) break;
    blockSeq.push(next);
    placedBlocks.add(next);
    remaining.splice(remaining.indexOf(next), 1);
  }

  // Within-block edge placement: a child married to the adjacent block goes
  // to the touching edge (left edge toward the previous block, right edge
  // toward the next block).
  const orderKidsForBlock = (blockId, prevBlockId, nextBlockId) => {
    const block = blockById.get(blockId);
    const kids = [...block.kids];
    const leftAnchors = [];   // marry to previous block → left edge
    const rightAnchors = [];  // marry to next block → right edge
    for (const j of joins) {
      if (j.blockA === blockId && j.blockB === prevBlockId) leftAnchors.push(j.childA);
      if (j.blockB === blockId && j.blockA === prevBlockId) leftAnchors.push(j.childB);
      if (j.blockA === blockId && j.blockB === nextBlockId) rightAnchors.push(j.childA);
      if (j.blockB === blockId && j.blockA === nextBlockId) rightAnchors.push(j.childB);
    }
    const middle = kids.filter(k => !leftAnchors.includes(k) && !rightAnchors.includes(k));
    return [...leftAnchors, ...middle, ...rightAnchors];
  };

  let seq = [];
  blockSeq.forEach((blockId, i) => {
    const prev = blockSeq[i - 1];
    const next = blockSeq[i + 1];
    seq.push(...orderKidsForBlock(blockId, prev, next));
  });

  // Inline married-in spouses beside their partner, choosing the side that
  // is NOT already occupied by another of that partner's spouses — so a
  // person with two partners ends up between them (…spouseA, P, spouseB…),
  // and neither union line crosses the other spouse.
  const arePartners = (a, b) => (partnerUnions.get(a) || []).some(uId => {
    const u = unionById.get(uId);
    return u && u.partners.includes(b);
  });
  for (const spouseId of marriedIn) {
    let placed = false;
    for (const uId of (partnerUnions.get(spouseId) || [])) {
      const union = unionById.get(uId);
      if (!union) continue;
      const partner = union.partners.find(p => p !== spouseId);
      const pIdx = seq.indexOf(partner);
      if (pIdx === -1) continue;
      const rightNeighbor = seq[pIdx + 1];
      const leftNeighbor = seq[pIdx - 1];
      const rightTaken = rightNeighbor && arePartners(partner, rightNeighbor);
      const leftTaken = leftNeighbor && arePartners(partner, leftNeighbor);
      // default right; if right is already a partner and left is free, go left
      const insertAt = (rightTaken && !leftTaken) ? pIdx : pIdx + 1;
      seq.splice(insertAt, 0, spouseId);
      placed = true;
      break;
    }
    if (!placed) seq.push(spouseId);
  }

  // Defensive: any id not yet ordered, appended stably.
  for (const id of idsThisGen) if (!seq.includes(id)) seq.push(id);
  return seq;
}

function orderTopGeneration(ids, model) {
  // Keep partners adjacent; otherwise stable input order.
  const placed = new Set();
  const seq = [];
  for (const id of ids) {
    if (placed.has(id)) continue;
    seq.push(id);
    placed.add(id);
    const unions = model.partnerUnions.get(id) || [];
    for (const uId of unions) {
      const union = model.unionById.get(uId);
      if (!union) continue;
      const partner = union.partners.find(p => p !== id);
      if (partner && ids.includes(partner) && !placed.has(partner)) {
        seq.push(partner);
        placed.add(partner);
      }
    }
  }
  return seq;
}

// ─────────────────────────────────────────────────────────────
// Step 2 — X assignment (bottom-up: parents center over children)
// ─────────────────────────────────────────────────────────────

function assignX(order, model, generations) {
  const { childIdsOfUnion } = model;
  const xPos = {};

  // Initialize the bottom generation by order at fixed spacing.
  const bottomGen = generations[generations.length - 1];
  placeByOrderInitial(order.get(bottomGen) || [], xPos);

  // Bottom-up: each higher generation is placed by first targeting each
  // node toward the center of its children (if any placed below), then
  // enforcing order + min separation left-to-right.
  for (let gi = generations.length - 2; gi >= 0; gi--) {
    const gen = generations[gi];
    const seq = order.get(gen) || [];

    // desired X per node
    const desired = new Map();
    for (const id of seq) {
      const center = childrenCenterFor(id, model, xPos, childIdsOfUnion);
      desired.set(id, center); // may be null
    }
    placeByOrderWithDesired(seq, desired, xPos);
  }

  // A couple of top-down tidy sweeps: pull childless/married-in nodes toward
  // their partner's or parents' position, then re-separate.
  for (let sweep = 0; sweep < 2; sweep++) {
    for (let gi = 0; gi < generations.length; gi++) {
      const gen = generations[gi];
      const seq = order.get(gen) || [];
      const desired = new Map();
      for (const id of seq) {
        const parentsCenter = parentsCenterFor(id, model, xPos);
        const childrenCenter = childrenCenterFor(id, model, xPos, childIdsOfUnion);
        // Prefer children center (keeps couples over kids); fall back to parents.
        desired.set(id, childrenCenter != null ? childrenCenter : parentsCenter);
      }
      placeByOrderWithDesired(seq, desired, xPos);
    }
  }

  return xPos;
}

function placeByOrderInitial(seq, xPos) {
  let x = 0;
  for (const id of seq) {
    xPos[id] = x;
    x += NODE_SLOT;
  }
}

/**
 * Place a generation's nodes in `seq` order, each as close to its desired X
 * as possible, but strictly left-to-right with a minimum gap so order and
 * contiguity are preserved (no overlaps, no interleaving).
 */
function placeByOrderWithDesired(seq, desired, xPos) {
  let cursor = -Infinity;
  for (let i = 0; i < seq.length; i++) {
    const id = seq[i];
    const want = desired.get(id);
    const minX = cursor === -Infinity ? (want ?? 0) : cursor + NODE_SLOT;
    const x = want != null ? Math.max(want, minX) : (cursor === -Infinity ? 0 : cursor + NODE_SLOT);
    xPos[id] = x;
    cursor = x;
  }
}

function childrenCenterFor(id, model, xPos, childIdsOfUnion) {
  // Union(s) where `id` is a partner and which have children already placed.
  const unions = model.partnerUnions.get(id) || [];
  const childXs = [];
  for (const uId of unions) {
    const kids = childIdsOfUnion.get(uId) || [];
    for (const cid of kids) {
      if (typeof xPos[cid] === 'number') childXs.push(xPos[cid]);
    }
  }
  if (childXs.length === 0) return null;
  return (Math.min(...childXs) + Math.max(...childXs)) / 2;
}

function parentsCenterFor(id, model, xPos) {
  const pu = model.childToParentUnion.get(id);
  if (!pu) return null;
  const union = model.unionById.get(pu);
  if (!union) return null;
  const pxs = union.partners.map(p => xPos[p]).filter(v => typeof v === 'number');
  if (pxs.length === 0) return null;
  return (Math.min(...pxs) + Math.max(...pxs)) / 2;
}

export const _internals = { GEN_Y_SPACING, NODE_SLOT, SPOUSE_GAP, Y_TOP };
