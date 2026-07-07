/**
 * recursiveIntervalPacker.js — v0.5 layout engine (Step 1).
 *
 * Replaces the per-generation barycenter heuristic with a two-pass,
 * Reingold–Tilford-style recursion over the DESCENT FOREST
 * (layoutModel.js). Its defining property — the fix the fuzz baseline
 * demanded — is that **every subtree occupies a disjoint horizontal
 * interval by construction**: a subtree is placed starting at a running
 * cursor and returns its right edge, so sibling/root subtrees can never
 * overlap. That structurally rules out the dominant baseline failures
 * (NODE_SYMBOL_OVERLAP, UNRELATED_FAMILY_BLOCK_OVERLAP,
 * UNRELATED_NODE_IN_CHILD_FOOTPRINT, SHARED_CHILD_BUS,
 * WRONG_PARENT_BUS_ATTACHMENT) rather than trying to detect-and-patch them.
 *
 * Placement rule per person: each individual is placed EXACTLY ONCE, by
 * their primary lineage (as a child of their parent union) or, for a
 * married-in spouse with no lineage, by their union's couple placement.
 *
 * Convergent marriages (both partners bloodline — e.g. the proband's mother
 * from the maternal grandparents and father from the paternal grandparents)
 * are pulled together by couple-adjacency ordering (biasOf): the marrying-out
 * child of each ancestor subtree is biased to the shared boundary so the
 * union line stays local.
 *
 * KNOWN REMAINING CLASS (measured, tracked): an individual who is a partner
 * in MULTIPLE unions (remarriage / a founder with a second spouse) is placed
 * by their first-owned union's lineage; the additional unions are separate
 * roots, so the person can sit apart from a second spouse and produce a long
 * union line. Multi-marriage clustering is the next iteration.
 */

import { buildLayoutModel } from './layoutModel';

const GEN_Y_SPACING = 150;
const NODE_SLOT = 90;
const SPOUSE_GAP = 70;
const HALF = 20;
const SIBLING_GAP = 24;
const ROOT_GAP = 80;
const COUPLE_WIDTH = SPOUSE_GAP + 2 * HALF;
const Y_TOP = 80;

export function computeRecursiveLayout(graph) {
  const model = buildLayoutModel(graph);
  const { generations } = model;
  if (generations.length === 0) return { xPos: {}, yPos: {} };

  const minGen = generations[0];
  const yPos = {};
  for (const ind of graph.individuals) {
    yPos[ind.id] = Y_TOP + (ind.generation - minGen) * GEN_Y_SPACING;
  }

  const ctx = buildContext(model);
  const xPos = {};

  // Pass 1: subtree widths (post-order).
  const width = new Map();
  for (const root of ctx.rootOrder) computeWidth(root, ctx, width);

  // Pass 2: placement (pre-order), roots left-to-right at a running cursor.
  let cursor = 0;
  for (const root of ctx.rootOrder) {
    place(root, cursor, ctx, width, xPos);
    cursor += (width.get(root) ?? COUPLE_WIDTH) + ROOT_GAP;
  }

  // Fallback: any individual not reached by the forest (isolated, or a
  // partner in an unreached union) is appended so nothing is left unplaced.
  for (const ind of graph.individuals) {
    if (typeof xPos[ind.id] !== 'number') {
      xPos[ind.id] = cursor + HALF;
      cursor += NODE_SLOT;
    }
  }

  return { xPos, yPos };
}

// ── context: forest lookups + couple-adjacency ordering ────────
function buildContext(model) {
  const { unionById, childToParentUnion, partnerUnions, childIdsOfUnion, childUnionsOf, rootUnions } = model;

  // anchorPartner(U) = the partner through which U hangs in the forest (the
  // first partner that is a child of another union); falls back to partner[0]
  // for founder couples where neither partner has a lineage.
  const anchorOf = new Map();
  for (const u of model.unionById.values()) {
    const a = u.partners.find(p => childToParentUnion.has(p));
    anchorOf.set(u.id, a || u.partners[0]);
  }
  // unionsAnchoredBy(c) = unions whose anchor partner is c (a bloodline child
  // who marries places their own union subtree here).
  const anchoredBy = new Map();
  for (const u of model.unionById.values()) {
    const a = anchorOf.get(u.id);
    if (!anchoredBy.has(a)) anchoredBy.set(a, []);
    anchoredBy.get(a).push(u.id);
  }

  const rootOrder = orderRoots(rootUnions, model);
  const rootOfNode = computeRootOfNode(model);
  const rootIndex = new Map(rootOrder.map((r, i) => [r, i]));

  // biasOf(c): does individual c marry INTO a root to the right (+1) or left
  // (-1) of c's own root? Pulls a convergent-married child to the shared
  // boundary of the two ancestor subtrees so the union line stays local.
  const biasOf = (c) => {
    const myRootIdx = rootIndex.get(rootOfNode.get(c));
    if (myRootIdx === undefined) return 0;
    let bias = 0;
    for (const uId of (partnerUnions.get(c) || [])) {
      const u = unionById.get(uId);
      if (!u) continue;
      const other = u.partners.find(p => p !== c);
      if (other === undefined || !childToParentUnion.has(other)) continue;
      const otherRootIdx = rootIndex.get(rootOfNode.get(other));
      if (otherRootIdx === undefined || otherRootIdx === myRootIdx) continue;
      bias += otherRootIdx > myRootIdx ? 1 : -1;
    }
    return Math.sign(bias);
  };

  const orderedChildren = (unionId) => {
    const kids = (childIdsOfUnion.get(unionId) || []).filter(id => model.indById.has(id));
    return kids
      .map((id, i) => ({ id, i, b: biasOf(id) }))
      .sort((a, b) => (a.b - b.b) || (a.i - b.i))
      .map(o => o.id);
  };

  return {
    model, unionById, childToParentUnion, partnerUnions, childUnionsOf,
    anchorOf, anchoredBy, orderedChildren, rootOrder,
    indById: model.indById,
  };
}

// Order root subtrees so roots bridged by a convergent marriage are adjacent.
function orderRoots(rootUnions, model) {
  if (rootUnions.length <= 1) return [...rootUnions];
  const rootOfNode = computeRootOfNode(model);
  const adj = new Map(rootUnions.map(r => [r, new Set()]));
  for (const u of model.unionById.values()) {
    const [p1, p2] = u.partners;
    const r1 = rootOfNode.get(p1), r2 = rootOfNode.get(p2);
    if (r1 && r2 && r1 !== r2 && adj.has(r1) && adj.has(r2)) {
      adj.get(r1).add(r2); adj.get(r2).add(r1);
    }
  }
  const remaining = [...rootUnions];
  const placed = new Set();
  const seq = [];
  while (remaining.length) {
    let next = seq.length ? [...(adj.get(seq[seq.length - 1]) || [])].find(r => !placed.has(r)) : null;
    if (!next) next = remaining.find(r => !placed.has(r));
    if (!next) break;
    seq.push(next); placed.add(next);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return seq;
}

// Map each node to the root union of its primary lineage.
function computeRootOfNode(model) {
  const rootOfNode = new Map();
  const rootOfUnion = new Map();
  const findRootUnion = (uid) => {
    let cur = uid, guard = 0;
    while (guard++ < 1000) {
      if (rootOfUnion.has(cur)) return rootOfUnion.get(cur);
      const parent = model.primaryParentUnion.get(cur);
      if (!parent) return cur;
      cur = parent;
    }
    return cur;
  };
  for (const u of model.unionById.values()) {
    const root = findRootUnion(u.id);
    rootOfUnion.set(u.id, root);
    for (const p of u.partners) if (!rootOfNode.has(p)) rootOfNode.set(p, root);
    for (const c of (model.childIdsOfUnion.get(u.id) || [])) rootOfNode.set(c, root);
  }
  return rootOfNode;
}

// ── Pass 1: widths ─────────────────────────────────────────────
function computeWidth(unionId, ctx, width, visiting = new Set()) {
  if (width.has(unionId)) return width.get(unionId);
  if (visiting.has(unionId)) return COUPLE_WIDTH;
  visiting.add(unionId);

  const kids = ctx.orderedChildren(unionId);
  if (kids.length === 0) {
    width.set(unionId, COUPLE_WIDTH);
    visiting.delete(unionId);
    return COUPLE_WIDTH;
  }
  let childrenW = 0;
  for (const kid of kids) {
    const units = (ctx.anchoredBy.get(kid) || []);
    if (units.length === 0) childrenW += NODE_SLOT + SIBLING_GAP;
    else for (const v of units) childrenW += computeWidth(v, ctx, width, visiting) + SIBLING_GAP;
  }
  childrenW = Math.max(0, childrenW - SIBLING_GAP);
  const w = Math.max(childrenW, COUPLE_WIDTH);
  width.set(unionId, w);
  visiting.delete(unionId);
  return w;
}

// ── Pass 2: placement ──────────────────────────────────────────
function place(unionId, left, ctx, width, xPos, visiting = new Set()) {
  if (visiting.has(unionId)) return;
  visiting.add(unionId);

  const kids = ctx.orderedChildren(unionId);
  const w = width.get(unionId) ?? COUPLE_WIDTH;

  if (kids.length === 0) {
    placeCouple(unionId, left + w / 2, ctx, xPos);
    visiting.delete(unionId);
    return;
  }

  let childrenW = 0;
  for (const kid of kids) {
    const units = (ctx.anchoredBy.get(kid) || []);
    if (units.length === 0) childrenW += NODE_SLOT + SIBLING_GAP;
    else for (const v of units) childrenW += (width.get(v) ?? COUPLE_WIDTH) + SIBLING_GAP;
  }
  childrenW = Math.max(0, childrenW - SIBLING_GAP);
  let c = left + Math.max(0, (w - childrenW) / 2);

  const anchorXs = [];
  for (const kid of kids) {
    const units = (ctx.anchoredBy.get(kid) || []);
    if (units.length === 0) {
      xPos[kid] = c + NODE_SLOT / 2;
      anchorXs.push(xPos[kid]);
      c += NODE_SLOT + SIBLING_GAP;
    } else {
      for (const v of units) {
        place(v, c, ctx, width, xPos, visiting);
        c += (width.get(v) ?? COUPLE_WIDTH) + SIBLING_GAP;
      }
      if (typeof xPos[kid] === 'number') anchorXs.push(xPos[kid]);
    }
  }

  const center = anchorXs.length
    ? (Math.min(...anchorXs) + Math.max(...anchorXs)) / 2
    : left + w / 2;
  placeCouple(unionId, center, ctx, xPos);
  visiting.delete(unionId);
}

/**
 * Place a union's partners around centerX. The anchor partner is pinned to
 * centerX (or centerX - SPOUSE_GAP/2 with a married-in spouse); a married-in
 * spouse sits one SPOUSE_GAP to the side. A convergent (bloodline) other
 * partner keeps its own lineage position — couple-adjacency ordering is what
 * keeps them next to each other.
 */
function placeCouple(unionId, centerX, ctx, xPos) {
  const u = ctx.unionById.get(unionId);
  if (!u) return;
  const anchor = ctx.anchorOf.get(unionId);
  const other = u.partners.find(p => p !== anchor);

  if (!other) {
    xPos[anchor] = centerX;
    return;
  }
  const otherIsMarriedIn = !ctx.childToParentUnion.has(other);
  if (otherIsMarriedIn) {
    xPos[anchor] = centerX - SPOUSE_GAP / 2;
    xPos[other] = centerX + SPOUSE_GAP / 2;
  } else {
    xPos[anchor] = centerX;
    if (typeof xPos[other] !== 'number') xPos[other] = centerX + SPOUSE_GAP;
  }
}
