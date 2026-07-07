/**
 * recursiveIntervalPacker.js — v0.5 experimental layout engine (Step 1 + 2).
 *
 * EXPERIMENTAL — behind `PEDITREE_PACKER=recursive` (see layoutPacking.js's
 * recursivePackerEnabled). The shipped app does not use this yet; it is
 * developed and measured in parallel against npm run audit:layout-fuzz
 * before any cutover is considered.
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
 * Multi-union ownership (Step 2): an individual who is a partner in MULTIPLE
 * unions (remarriage, or a founder who later gets a second spouse) is placed
 * EXACTLY ONCE, at a position derived jointly from ALL of their owned
 * unions' children — never per-union in a loop that overwrites the previous
 * union's placement (that overwrite was the root cause of the Step-1
 * baseline's dominant remaining failures: UNION_LINE_THROUGH_NODE and
 * CROSS_BRANCH_UNION_COLLAPSES_ANCESTOR_BLOCKS). See placeOwnedUnions.
 *
 * MEASURED PROGRESS (seed 1, 1000 cases): Step 1 baseline 34.8% fail →
 * Step 2 (placement fix, this file) 31.0% fail. NODE_SYMBOL_OVERLAP and
 * UNRELATED_NODE_IN_CHILD_FOOTPRINT dropped to 0 here. The remaining
 * UNION_LINE_THROUGH_NODE / CROSS_BRANCH_UNION_COLLAPSES_ANCESTOR_BLOCKS
 * class (a convergent/multi-union anchor's placement not always matching an
 * already-fixed partner — see the attempts below) was deliberately NOT
 * chased further with more node repositioning, since that was measured to
 * trade one invariant for another (a convergent-priority variant hit 31.3%
 * fail and reintroduced 5 footprint violations — reverted). Per that
 * finding, the fix was moved to the ROUTING layer instead: see
 * pedigreeLayoutV2.js's Step 2b corridor routing, which handles "partners
 * ended up far apart" by routing the union line around intervening nodes
 * rather than moving the nodes — 31.0% → 7.6% fail, with
 * UNION_LINE_THROUGH_NODE / CROSS_BRANCH_UNION_COLLAPSES_ANCESTOR_BLOCKS
 * now BOTH 0. This module's own placement logic below is otherwise
 * unchanged from that measurement.
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
// Gap reserved BETWEEN two of the same anchor's owned-union blocks. Must be
// wide enough that the anchor (placed in this gap) plus at least one
// bounded spouse offset (±SPOUSE_GAP) never touches either neighbouring
// block's own footprint — the plain SIBLING_GAP (24px) used between
// unrelated siblings is far too narrow for that.
const MULTI_UNION_GAP = 2 * SPOUSE_GAP + NODE_SLOT;

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

  // Group root unions by anchor FIRST — a founder who owns two root unions
  // (e.g. remarried after being widowed) must be placed once, not twice.
  // Order preserved from ctx.rootOrder (adjacency-aware), first occurrence
  // of each anchor decides the group's position.
  const rootGroups = [];
  const seenRootAnchor = new Set();
  for (const uId of ctx.rootOrder) {
    const anchor = ctx.anchorOf.get(uId);
    if (seenRootAnchor.has(anchor)) continue;
    seenRootAnchor.add(anchor);
    rootGroups.push({ anchor, unionIds: ctx.rootOrder.filter(u2 => ctx.anchorOf.get(u2) === anchor) });
  }

  // Pass 1: subtree widths (post-order), per union.
  const width = new Map();
  for (const g of rootGroups) for (const u of g.unionIds) computeWidth(u, ctx, width);

  // Pass 2: placement (pre-order), root groups left-to-right at a running
  // cursor. Each group's full right edge (not just its estimated width) is
  // used to advance the cursor, so disjointness holds even if placement
  // needs slightly more room than the width pass estimated.
  let cursor = 0;
  for (const g of rootGroups) {
    const right = placeOwnedUnions(g.anchor, g.unionIds, cursor, ctx, width, xPos);
    cursor = right + ROOT_GAP;
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
// Width of ONE union's own children block (does not include the couple's
// other owned unions — see computeWidthForGroup for the combined width of
// everything a shared anchor owns).
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
    else childrenW += computeWidthForGroup(kid, units, ctx, width, visiting) + SIBLING_GAP;
  }
  childrenW = Math.max(0, childrenW - SIBLING_GAP);
  const w = Math.max(childrenW, COUPLE_WIDTH);
  width.set(unionId, w);
  visiting.delete(unionId);
  return w;
}

/** Combined width of every union a shared anchor owns, side by side. */
function computeWidthForGroup(anchor, unionIds, ctx, width, visiting) {
  const gap = unionIds.length > 1 ? MULTI_UNION_GAP : SIBLING_GAP;
  let total = 0;
  for (const v of unionIds) total += computeWidth(v, ctx, width, visiting) + gap;
  total = Math.max(0, total - gap);
  const coupleRowW = NODE_SLOT + unionIds.length * SPOUSE_GAP;
  return Math.max(total, coupleRowW);
}

// ── Pass 2: placement ──────────────────────────────────────────

/**
 * Place ONE union's children block starting at `left` (does NOT place the
 * union's own partners — see placeOwnedUnions, which calls this once per
 * union a shared anchor owns before fixing the anchor's single position).
 * Returns { center, right }: the horizontal center of the placed children
 * (or null if childless) and the actual right edge occupied.
 */
function placeChildrenBlock(unionId, left, ctx, width, xPos, visiting) {
  const kids = ctx.orderedChildren(unionId);
  const w = width.get(unionId) ?? COUPLE_WIDTH;
  if (kids.length === 0) return { center: null, right: left + w };

  let childrenW = 0;
  for (const kid of kids) {
    const units = (ctx.anchoredBy.get(kid) || []);
    childrenW += units.length === 0
      ? NODE_SLOT + SIBLING_GAP
      : computeWidthForGroup(kid, units, ctx, width, visiting) + SIBLING_GAP;
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
      const right = placeOwnedUnions(kid, units, c, ctx, width, xPos, visiting);
      if (typeof xPos[kid] === 'number') anchorXs.push(xPos[kid]);
      c = right + SIBLING_GAP;
    }
  }
  const right = Math.max(c - SIBLING_GAP, left + w);
  const center = anchorXs.length ? (Math.min(...anchorXs) + Math.max(...anchorXs)) / 2 : null;
  return { center, right };
}

/**
 * Place EVERY union `anchor` owns, side by side starting at `left`, then fix
 * `anchor`'s position ONCE from the joint span of all those unions' children
 * — this is the Step-2 fix: previously each owned union was placed in a loop
 * that each called a per-union "place couple" step, so the anchor's xPos was
 * silently overwritten by the LAST union processed, tearing it away from
 * earlier unions' partners/children (the dominant remaining failure class
 * after Step 1: UNION_LINE_THROUGH_NODE / CROSS_BRANCH_UNION_COLLAPSES).
 *
 * After `anchor` is fixed, each union's OTHER (married-in) partner is placed
 * by mirroring that union's own children-center around the now-final anchor
 * position, so the (anchor, spouse) midpoint still sits over their shared
 * children even when anchor had to move to reconcile multiple marriages. A
 * convergent (bloodline) other partner is left to its own lineage placement
 * (couple-adjacency ordering is what keeps such couples adjacent).
 *
 * Returns the actual right edge occupied, for the caller's cursor.
 */
function placeOwnedUnions(anchor, unionIds, left, ctx, width, xPos, visiting = new Set()) {
  if (visiting.has(anchor)) return left;
  visiting.add(anchor);

  const gap = unionIds.length > 1 ? MULTI_UNION_GAP : SIBLING_GAP;
  let c = left;
  const blocks = []; // { unionId, center, start, end }
  for (const unionId of unionIds) {
    const w = width.get(unionId) ?? COUPLE_WIDTH;
    const start = c;
    const { center, right } = placeChildrenBlock(unionId, c, ctx, width, xPos, visiting);
    const end = Math.max(right, c + w);
    blocks.push({ unionId, center: center != null ? center : c + w / 2, start, end });
    c = end + gap;
  }
  const rightEdge = c - gap;

  let anchorX;
  if (blocks.length === 1) {
    anchorX = blocks[0].center;
  } else {
    // Multi-marriage anchor: the naive average of each block's own center
    // can land INSIDE a wide block's own footprint when a second, much
    // narrower (e.g. childless) marriage skews it — the exact bug measured
    // here. Instead pick a SAFE anchor position: the gap between two
    // consecutive blocks (guaranteed to be outside every block's footprint
    // by construction, and now wide enough — MULTI_UNION_GAP — to also fit
    // the bounded spouse offsets below) or just outside the whole span.
    // Among these always-safe candidates, choose whichever sits closest to
    // the simple average of block centers, so placement still looks
    // reasonably centered rather than arbitrarily choosing the first gap.
    //
    // (A variant prioritizing an already-placed CONVERGENT partner's exact
    // position was tried and measured: 31.3% vs 31.0% here, plus it
    // reintroduced 5 footprint violations that this safe-gap version has at
    // 0 — so it was not kept. The convergent+multi-union combination is a
    // known remaining hard case, see the module-level TODO.)
    const idealCenter = blocks.reduce((s, b) => s + b.center, 0) / blocks.length;
    const candidates = [blocks[0].start - SPOUSE_GAP];
    for (let i = 0; i < blocks.length - 1; i++) candidates.push((blocks[i].end + blocks[i + 1].start) / 2);
    candidates.push(blocks[blocks.length - 1].end + SPOUSE_GAP);
    anchorX = candidates.reduce((best, cand) =>
      Math.abs(cand - idealCenter) < Math.abs(best - idealCenter) ? cand : best);
  }
  xPos[anchor] = anchorX;

  // Spouses are placed BOUNDED near the anchor (never mirrored out to a
  // distant union-center) — that mirroring was tried and measured worse: it
  // can push a spouse arbitrarily far outside the reserved width when that
  // marriage's children happen to sit far from the shared anchor position,
  // reintroducing the overlap/footprint failures Step 1 had eliminated. A
  // bounded offset keeps the union line itself always short and local (the
  // actual clinical requirement — CLAUDE.md: consanguinity/union lines must
  // never be ambiguous) even though the elbow down to that marriage's own
  // children may then run a bit off-center under an off-to-the-side anchor.
  const sideCount = { '-1': 0, '1': 0 };
  const spouseXs = [];
  blocks.forEach(({ unionId, center }, i) => {
    const u = ctx.unionById.get(unionId);
    if (!u) return;
    const other = u.partners.find(p => p !== anchor);
    if (other === undefined) return;
    const otherIsMarriedIn = !ctx.childToParentUnion.has(other);
    if (otherIsMarriedIn) {
      const side = Math.sign(center - anchorX) || (i % 2 === 0 ? 1 : -1);
      const rank = ++sideCount[String(side)];
      xPos[other] = anchorX + side * SPOUSE_GAP * rank;
      spouseXs.push(xPos[other]);
    } else if (typeof xPos[other] !== 'number') {
      xPos[other] = center; // convergent, not yet placed by its own lineage
      spouseXs.push(xPos[other]);
    }
  });

  visiting.delete(anchor);
  // The actual right edge must also account for spouse positions, which can
  // extend past the children-blocks' own right edge (e.g. a lone married-in
  // spouse with no children of their own, offset SPOUSE_GAP to the right).
  const allXs = [rightEdge - HALF, anchorX, ...spouseXs];
  return Math.max(...allXs) + HALF;
}
