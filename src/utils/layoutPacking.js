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
  const { generations, generationLayers, childToParentUnion, partnerUnions, childIdsOfUnion } = model;
  const order = new Map();

  generations.forEach((gen, gi) => {
    const idsThisGen = generationLayers.get(gen) || [];
    if (gi === 0) {
      order.set(gen, orderTopGeneration(idsThisGen, model));
      return;
    }

    const parentOrder = order.get(generations[gi - 1]) || [];
    const parentRank = new Map(parentOrder.map((id, i) => [id, i]));

    // Bloodline individuals at this gen, grouped by their parent union.
    const bloodline = idsThisGen.filter(id => childToParentUnion.has(id));
    const marriedIn = idsThisGen.filter(id => !childToParentUnion.has(id));

    // Sibling blocks, ordered by the barycenter rank of their parent union's partners.
    const unionsWithKidsHere = [...new Set(bloodline.map(id => childToParentUnion.get(id)))];
    const blocks = unionsWithKidsHere.map(unionId => {
      const union = model.unionById.get(unionId);
      const partnerRanks = (union?.partners || [])
        .map(pid => parentRank.get(pid))
        .filter(r => r !== undefined);
      const bary = partnerRanks.length ? partnerRanks.reduce((a, b) => a + b, 0) / partnerRanks.length : 1e9;
      // children in this generation, in PCR (birth) order
      const kids = (childIdsOfUnion.get(unionId) || []).filter(cid => idsThisGen.includes(cid));
      return { unionId, bary, kids };
    });
    blocks.sort((a, b) => a.bary - b.bary);

    let seq = [];
    for (const block of blocks) seq.push(...block.kids);

    // Insert married-in spouses adjacent to their partner. If a spouse has
    // no placed partner in this generation, append at the end.
    for (const spouseId of marriedIn) {
      const spouseUnions = partnerUnions.get(spouseId) || [];
      // find a partner already in seq
      let insertIdx = -1;
      let before = false;
      for (const uId of spouseUnions) {
        const union = model.unionById.get(uId);
        if (!union) continue;
        const partner = union.partners.find(p => p !== spouseId);
        const pIdx = seq.indexOf(partner);
        if (pIdx !== -1) {
          insertIdx = pIdx;
          // place spouse on the outer side: if partner is a bloodline child,
          // the spouse goes to the partner's right by default.
          before = false;
          break;
        }
      }
      if (insertIdx === -1) seq.push(spouseId);
      else seq.splice(before ? insertIdx : insertIdx + 1, 0, spouseId);
    }

    // Any remaining ids not yet in seq (defensive) appended in stable order.
    for (const id of idsThisGen) if (!seq.includes(id)) seq.push(id);

    order.set(gen, seq);
  });

  return order;
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
