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
import { computeRecursiveLayout } from './recursiveIntervalPacker';

const GEN_Y_SPACING = 150;
const NODE_SLOT = 90;      // horizontal slot per individual (matches NODE_X_SPACING)
const SPOUSE_GAP = 70;     // gap between two partners of a union
const Y_TOP = 80;

/**
 * v0.5 (Step 1): the recursive disjoint-interval packer is being validated
 * in parallel against the fuzz baseline before cutover. While
 * `PEDITREE_PACKER=recursive` is set (fuzz runs / tests), the new packer is
 * used; otherwise the current engine runs unchanged. This lets the fuzzer
 * measure the new packer through the exact real store path without changing
 * shipped behaviour.
 */
export function recursivePackerEnabled() {
  return typeof process !== 'undefined' && process.env && process.env.PEDITREE_PACKER === 'recursive';
}

/**
 * @param {{ individuals: Array, unions: Array, parentChildRelationships: Array }} graph
 * @returns {{ xPos: Object<string,number>, yPos: Object<string,number>, order: Map<number,string[]> }}
 */
export function computeFamilyBlockLayout(graph) {
  if (recursivePackerEnabled()) {
    const { xPos, yPos } = computeRecursiveLayout(graph);
    return { xPos, yPos, order: new Map() };
  }

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

// Minimum horizontal gap enforced between two adjacent RESERVED footprints
// (or a footprint and a plain node) at the same generation. This is the fix
// for the "unrelated sibling pulled into the wide sibship fan below their
// neighbour" illusion: a union's descendant footprint is treated as a solid
// reserved block that nothing else may intrude into.
const BLOCK_GAP = 40;

function assignX(order, model, generations) {
  const { childIdsOfUnion } = model;
  const xPos = {};

  // Initialize the bottom generation by order at fixed spacing. It has no
  // descendants below it, so plain sequential placement is correct.
  const bottomGen = generations[generations.length - 1];
  placeByOrderInitial(order.get(bottomGen) || [], xPos);

  // Bottom-up: every higher generation is placed using RESERVED FOOTPRINTS —
  // a node (or a couple sharing a union) that already has children placed
  // below it reserves the full x-range those children occupy, and every
  // other node in the row (regardless of how far away in the sequence) must
  // stay outside that reserved range. This is what prevents a wide sibship
  // fan from visually running underneath an unrelated aunt/uncle/sibling
  // sitting just one slot away from the true parents.
  for (let gi = generations.length - 2; gi >= 0; gi--) {
    const gen = generations[gi];
    const seq = order.get(gen) || [];
    placeGenerationWithFootprints(seq, model, xPos, childIdsOfUnion);
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
 * Place one generation left to right. Any node that already has children
 * positioned below it (via a union it partners in) is an ANCHOR: its final
 * x is pinned to the center of that footprint, and the footprint's full
 * [minX,maxX] range is reserved — nothing else in the row may be placed
 * inside it. Two adjacent partners who share the SAME anchoring union are
 * treated as one couple sharing that single footprint, spread apart by
 * SPOUSE_GAP around its center. Nodes with no footprint of their own get a
 * default NODE_SLOT-wide slot, sequentially, after whatever reserved
 * footprint precedes them.
 */
function placeGenerationWithFootprints(seq, model, xPos, childIdsOfUnion) {
  const footprintOf = (id) => unionFootprintFor(id, model, childIdsOfUnion, xPos);

  // zoneMinX(id) is recorded for every ANCHORED id (solo, or part of a
  // couple sharing one footprint) — used by the backward pass below to stop
  // a childless sibling that comes BEFORE an anchor in the sequence from
  // being left sitting underneath that anchor's descendant fan (the mirror
  // of the forward-pass guarantee, which already handles anchors that come
  // AFTER a childless sibling).
  const zoneMinX = new Map();

  let cursor = -Infinity; // rightmost edge already reserved (footprint or default slot)
  let i = 0;
  while (i < seq.length) {
    const id = seq[i];
    const nextId = seq[i + 1];
    const fp = footprintOf(id);

    // Couple sharing one union's footprint (or no footprint at all, just a
    // married pair standing together): consume both seq slots at once.
    const sharedUnion = nextId && sharedUnionBetween(id, nextId, model);
    if (sharedUnion) {
      const combined = fp || footprintOf(nextId);
      const center = combined ? (combined.minX + combined.maxX) / 2 : null;
      const minCenter = cursor === -Infinity ? (center ?? 0) : cursor + BLOCK_GAP + SPOUSE_GAP / 2;
      const placedCenter = center != null ? Math.max(center, minCenter) : minCenter;
      xPos[id] = placedCenter - SPOUSE_GAP / 2;
      xPos[nextId] = placedCenter + SPOUSE_GAP / 2;
      const rightEdge = combined ? Math.max(combined.maxX, placedCenter + SPOUSE_GAP / 2) : placedCenter + SPOUSE_GAP / 2;
      cursor = rightEdge;
      if (combined) {
        zoneMinX.set(id, combined.minX);
        zoneMinX.set(nextId, combined.minX);
      }
      i += 2;
      continue;
    }

    if (fp) {
      // Solo anchor (e.g. an aunt/uncle who themselves has children).
      const center = (fp.minX + fp.maxX) / 2;
      const minCenter = cursor === -Infinity ? center : cursor + BLOCK_GAP + NODE_SLOT / 2;
      const placedCenter = Math.max(center, minCenter);
      xPos[id] = placedCenter;
      cursor = Math.max(fp.maxX, placedCenter);
      zoneMinX.set(id, fp.minX);
    } else {
      // No footprint: default slot, sequential.
      const x = cursor === -Infinity ? 0 : cursor + BLOCK_GAP + NODE_SLOT / 2;
      xPos[id] = x;
      cursor = x + NODE_SLOT / 2;
    }
    i += 1;
  }

  // Backward correction: a childless sibling positioned BEFORE an anchor in
  // the row must not sit inside that anchor's reserved footprint either —
  // the forward pass above only guarantees this for nodes AFTER an anchor
  // (since footprints aren't known until the anchor itself is processed).
  let boundary = Infinity;
  for (let j = seq.length - 1; j >= 0; j--) {
    const id = seq[j];
    if (zoneMinX.has(id)) {
      boundary = zoneMinX.get(id);
      continue;
    }
    const maxAllowed = boundary - BLOCK_GAP - NODE_SLOT / 2;
    if (xPos[id] > maxAllowed) xPos[id] = maxAllowed;
    boundary = xPos[id] - NODE_SLOT / 2;
  }
}

/** True if `a` and `b` are partners in a union whose children are the
 * footprint source for both (so they should be placed as one couple). */
function sharedUnionBetween(a, b, model) {
  const unionsA = model.partnerUnions.get(a) || [];
  for (const uId of unionsA) {
    const union = model.unionById.get(uId);
    if (union && union.partners.includes(b)) return uId;
  }
  return null;
}

/** Combined [minX,maxX] of every already-placed child across every union
 * `id` partners in, or null if none of its unions have placed children yet. */
function unionFootprintFor(id, model, childIdsOfUnion, xPos) {
  const unions = model.partnerUnions.get(id) || [];
  const childXs = [];
  for (const uId of unions) {
    const kids = childIdsOfUnion.get(uId) || [];
    for (const cid of kids) {
      if (typeof xPos[cid] === 'number') childXs.push(xPos[cid]);
    }
  }
  if (childXs.length === 0) return null;
  return { minX: Math.min(...childXs), maxX: Math.max(...childXs) };
}

export const _internals = { GEN_Y_SPACING, NODE_SLOT, SPOUSE_GAP, Y_TOP, BLOCK_GAP };
