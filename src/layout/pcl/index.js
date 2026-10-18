/**
 * PCL — Pedigree-Constrained Layered layout (docs/PEDITREE_LAYOUT_ARCHITECTURE.md).
 *
 *   1. structure.js  graph → generation rows of atoms (sibships in birth order,
 *                    married-in spouses beside their partner, founder couples)
 *   2. ordering.js   left-to-right order of atoms (crossings, partners apart)
 *   3. this file     x coordinates by a separated quadratic program (qp.js):
 *                    couple midpoint over its children, partners at the
 *                    spouse gap, compact sibships, optional stability towards
 *                    a previous layout; hard minimum gaps → no overlaps
 *   4. routing.js    standard pedigree connectors with ownership, lanes and
 *                    line jumps
 *
 * Returns the same { nodes, edges } contract the renderer already consumes.
 * Pure and deterministic.
 */
import { buildStructure } from './structure';
import { orderLayers, orderLayersStable } from './ordering';
import { solveSeparatedQP } from './qp';
import { routeConnectors, estimateLevelNeeds, planBands } from './routing';
import { displayParentage } from '../../graph/model';

export const PCL = {
  GEN_Y_SPACING: 160,
  Y_TOP: 80,
  SPOUSE_GAP: 70,    // centre-to-centre distance of two adjacent partners
  SIBLING_GAP: 100,  // centre-to-centre distance inside one sibship
  FAMILY_GAP: 130,   // between different families on a row (visual grouping)
  X_MARGIN: 60,
};

const W_CENTRE = 1;
const W_SPOUSE = 0.5;
const W_FAR_PARTNERS = 0.03;
const W_COMPACT_IN = 0.02;
const W_COMPACT_OUT = 0.01;
const W_STABLE = 0.05;
// edit-local stability (KI-2): people the edit did not touch are pulled to
// their previous x much harder than any drawing preference (centre = 1),
// but still softer than hard gaps and the footprint rule (40) — stability
// never overrides correctness.
const W_PIN = 6;
// untouched families keep their SHAPE (spacing between neighbours), so a
// family that must make room for a widened sibship moves as a unit instead
// of being distorted
const W_SHAPE = 12;
const IRLS_ROUNDS = 30;
const IRLS_EPS_PX = 8;
const IRLS_MIN_SCALE = 0.01;
const IRLS_MAX_SCALE = 8;
// edit-local mode: the two terms that shape a couple — centred over its
// children, partners side by side — count as much as the firmest pin, in the
// PCL's own proportion (centre : partner gap = 1 : 0.5). Readability before
// stability: weaker, off-centre couples accumulate edit after edit; centring
// alone, partners drift apart under their own parents. Untouched families do
// not move all the same (anchoring, below).
const COUPLE_SCALE = W_PIN * IRLS_MAX_SCALE;
const W_STABLE_FREE = 0.05;
const W_STABLE_WIDE = 0.4;

const W_FOOTPRINT = 40;
const FOOTPRINT_MARGIN = 6;   // px inside the allowed boundary
// The invariant tolerates a bystander up to half a symbol inside the outer
// children; PCL keeps everyone off the whole sibship line (boundary at the
// outermost children's centres): an aunt standing right above the proband
// reads like a parent even when she is not strictly inside the fan.
const FOOTPRINT_INSET = 0;
const FOOTPRINT_ROUNDS = 400;   // upper bound; only pathological graphs need more than a few

/**
 * @param {{individuals:Array, unions:Array, parentChildRelationships:Array}} graph
 * @param {{ previous?: Map<string, number>,
 *           stability?: { prevX: Map<string, number>, prevY?: Map<string, number>,
 *                         freePersons: Set<string> | null, frozen?: boolean } }} [opts]
 *   previous: legacy weak pull towards previous x
 *   stability: edit-local relayout (KI-2, see src/layout/pcl/incremental.js):
 *     freePersons = people affected by the edit (null = every one free, 'wide');
 *     frozen = graph unchanged: reuse previous coordinates exactly
 */
export function computePclLayout(inputGraph, opts = {}) {
  // social-only children (e.g. adopted-in) are drawn under their social parents
  const { graph, socialChildren } = displayParentage(inputGraph);
  const individuals = graph.individuals || [];
  if (individuals.length === 0) return { nodes: [], edges: [] };

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t0 = now();
  const S = buildStructure(graph);
  const stability = opts.stability || null;
  const { order } = stability ? orderLayersStable(S, stability) : orderLayers(S);
  const tOrdered = now();

  // ── persons per row, in order ──
  const rows = new Map();
  for (const gen of S.gens) {
    const ids = [];
    for (const aid of order.get(gen) || []) ids.push(...S.atoms[aid].persons);
    rows.set(gen, ids);
  }
  // Safety net: anyone the structure step could not place still gets a row.
  const placed = new Set([...rows.values()].flat());
  for (const ind of individuals) {
    if (placed.has(ind.id)) continue;
    const g = ind.generation ?? 0;
    if (!rows.has(g)) rows.set(g, []);
    rows.get(g).push(ind.id);
  }
  const gens = [...rows.keys()].sort((a, b) => a - b);

  const index = new Map();
  const ids = [];
  for (const g of gens) for (const id of rows.get(g)) { index.set(id, ids.length); ids.push(id); }
  const n = ids.length;

  const sameAtom = (a, b) => S.personAtom.get(a) !== undefined && S.personAtom.get(a) === S.personAtom.get(b);
  const gapBetween = (a, b) => {
    if (S.isPartners(a, b)) return PCL.SPOUSE_GAP;
    if (sameAtom(a, b)) return PCL.SIBLING_GAP;
    return PCL.FAMILY_GAP;
  };

  const layers = [];
  const terms = [];
  const x0 = new Array(n).fill(0);
  for (const g of gens) {
    const row = rows.get(g);
    const gaps = [];
    let cursor = 0;
    row.forEach((id, k) => {
      if (k > 0) {
        const gap = gapBetween(row[k - 1], id);
        gaps.push(gap);
        cursor += gap;
        const w = sameAtom(row[k - 1], id) ? W_COMPACT_IN : W_COMPACT_OUT;
        terms.push({ w, idx: [index.get(id), index.get(row[k - 1])], c: [1, -1], d: gap });
      }
      x0[index.get(id)] = stability && stability.prevX.has(id) ? stability.prevX.get(id) : cursor;
    });
    layers.push({ ids: row.map(id => index.get(id)), gaps });
  }

  const rowPos = new Map();
  for (const g of gens) rows.get(g).forEach((id, k) => rowPos.set(id, k));

  for (const u of S.unions) {
    const [a, b] = u.partners || [];
    if (!index.has(a) || !index.has(b)) continue;
    const sameRow = S.indById.get(a).generation === S.indById.get(b).generation;
    if (sameRow) {
      const [l, r] = rowPos.get(a) <= rowPos.get(b) ? [a, b] : [b, a];
      const adjacent = Math.abs(rowPos.get(a) - rowPos.get(b)) === 1;
      terms.push(adjacent
        ? { w: W_SPOUSE, idx: [index.get(r), index.get(l)], c: [1, -1], d: PCL.SPOUSE_GAP, couple: true }
        : { w: W_FAR_PARTNERS, idx: [index.get(r), index.get(l)], c: [1, -1], d: PCL.SPOUSE_GAP });
    }
    const kids = (S.childrenOf.get(u.id) || []).filter(c => index.has(c));
    if (!kids.length) continue;
    const ordered = kids.slice().sort((p, q) => rowPos.get(p) - rowPos.get(q));
    const first = ordered[0], last = ordered[ordered.length - 1];
    const idx = [index.get(a), index.get(b)];
    const c = [0.5, 0.5];
    if (first === last) { idx.push(index.get(first)); c.push(-1); }
    else { idx.push(index.get(first), index.get(last)); c.push(-0.5, -0.5); }
    terms.push({ w: W_CENTRE, idx, c, d: 0, couple: true });
  }

  const pinTerms = [];
  if (stability && stability.freePersons !== null) {
    for (const t of terms) if (t.couple) t.w *= COUPLE_SCALE;
  }
  if (stability) {
    for (const [id, px] of stability.prevX) {
      if (!index.has(id) || !Number.isFinite(px)) continue;
      const w = stability.freePersons === null ? W_STABLE_WIDE
        : (stability.freePersons.has(id) ? W_STABLE_FREE : W_PIN);
      const term = { w, idx: [index.get(id)], c: [1], d: px };
      terms.push(term);
      if (stability.freePersons !== null && !stability.freePersons.has(id)) pinTerms.push(term);
    }
    if (stability.freePersons !== null) {
      const pinned = (id) => stability.prevX.has(id) && !stability.freePersons.has(id);
      const heads = (id) => (S.partnerUnions.get(id) || []).some((uid) => (S.childrenOf.get(uid) || []).length > 0);
      const partners = (a, b) => (S.partnerUnions.get(a) || []).some((uid) => S.partnerIn(uid, a) === b);
      // neighbours on a row that were drawn side by side keep their spacing —
      // unless both head a family of their own (e.g. two siblings who are
      // parents): the gap between two families may grow when one widens
      for (const g of gens) {
        const row = rows.get(g);
        for (let k = 1; k < row.length; k++) {
          const a = row[k - 1], b = row[k];
          if (!pinned(a) || !pinned(b)) continue;
          if (!partners(a, b) && (heads(a) || heads(b))) continue;
          const prevGap = stability.prevX.get(b) - stability.prevX.get(a);
          if (prevGap <= 0) continue;
          terms.push({ w: W_SHAPE, idx: [index.get(b), index.get(a)], c: [1, -1], d: prevGap });
        }
      }
      // Anchoring: the previous drawing must be at rest. Terms among untouched
      // people still pull a little at their previous positions (the previous
      // solve had footprint multipliers and a solver tolerance this one does
      // not share); those forces are cancelled by offsetting each pin's
      // target, so only what the edit changed — terms involving new or
      // affected people, a family re-centred firmly — can move anyone.
      const fixed = new Set(ids.map((id, i) => (pinned(id) ? i : -1)).filter((i) => i >= 0));
      const pinSet = new Set(pinTerms);
      const g = new Float64Array(n);
      for (const t of terms) {
        if (pinSet.has(t) || !t.idx.every((k) => fixed.has(k))) continue;
        const r = t.idx.reduce((acc, k, q) => acc + t.c[q] * stability.prevX.get(ids[k]), 0) - t.d;
        t.idx.forEach((k, q) => { g[k] += 2 * t.w * r * t.c[q]; });
      }
      for (const t of pinTerms) {
        t.prev = t.d;
        t.bias = g[t.idx[0]];
        t.d = t.prev + t.bias / (2 * t.w);
      }
    }
  } else if (opts.previous instanceof Map) {
    for (const [id, px] of opts.previous) {
      if (index.has(id) && Number.isFinite(px)) terms.push({ w: W_STABLE, idx: [index.get(id)], c: [1], d: px });
    }
  }

  // Footprint rule (layout invariant UNRELATED_NODE_IN_CHILD_FOOTPRINT): no one
  // on the parents' row except the couple themselves may stand above the
  // inner span of that couple's children — the eye reads a person standing
  // over a sibship as one of its parents. This couples two rows, so it is not
  // part of the per-row projection; it is enforced with one-sided penalty
  // terms added for each violated pair and kept once added (an active-set
  // style outer loop, deterministic).
  const unionKids = [];
  for (const u of S.unions) {
    const [a, b] = u.partners || [];
    if (!index.has(a) || !index.has(b)) continue;
    if (S.indById.get(a).generation !== S.indById.get(b).generation) continue;
    const kids = (S.childrenOf.get(u.id) || []).filter(c => index.has(c));
    if (kids.length < 2) continue;
    const ordered = kids.slice().sort((p, q) => rowPos.get(p) - rowPos.get(q));
    unionKids.push({ u, first: ordered[0], last: ordered[ordered.length - 1], parentRow: rows.get(S.indById.get(a).generation) });
  }
  // A penalty's equilibrium stops short of the boundary. Rather than raising
  // the weight (which ill-conditions the solve), a pair that is still
  // violated has its target shifted by the remaining violation — the method
  // of multipliers — so the constraint ends up satisfied at a moderate weight.
  const footprintTerms = new Map();
  let solution = solveSeparatedQP(n, layers, terms, x0);
  let qpIterations = solution.iterations;
  let qpSolves = 1;
  // run after every solve that may have moved people (the edit-local
  // reweighting rounds below re-solve, so they settle the footprint again)
  const settleFootprint = () => {
    let needPolish = false;
    for (let round = 0; round < FOOTPRINT_ROUNDS; round++) {
      const xs = solution.x;
      let changed = 0;
      for (const { u, first, last, parentRow } of unionKids) {
        const L = xs[index.get(first)], R = xs[index.get(last)];
        if (R - L <= 2 * FOOTPRINT_INSET) continue;
        for (const q of parentRow) {
          if (u.partners.includes(q)) continue;
          const xq = xs[index.get(q)];
          // 1 px safety: coordinates are rounded to 0.5 px afterwards and the
          // invariant's test is strict
          if (xq <= L + FOOTPRINT_INSET - 1 || xq >= R - FOOTPRINT_INSET + 1) continue;
          const leftSide = xq <= (L + R) / 2;
          const key = `${u.id}|${q}|${leftSide ? 'L' : 'R'}`;
          const existing = footprintTerms.get(key);
          if (existing) {
            const violation = leftSide ? xq - (L + FOOTPRINT_INSET) : (R - FOOTPRINT_INSET) - xq;
            // a pair that stays violated round after round is fighting other
            // terms: grow its step (bounded) so it converges in few rounds
            existing.updates = (existing.updates || 0) + 1;
            existing.d -= (violation + FOOTPRINT_MARGIN) * Math.min(8, 1 + 0.5 * existing.updates);
            changed++;
            continue;
          }
          const term = leftSide
            ? { w: W_FOOTPRINT, idx: [index.get(q), index.get(first)], c: [1, -1], d: FOOTPRINT_INSET - FOOTPRINT_MARGIN }
            : { w: W_FOOTPRINT, idx: [index.get(last), index.get(q)], c: [1, -1], d: FOOTPRINT_INSET - FOOTPRINT_MARGIN };
          footprintTerms.set(key, term);
          terms.push(term);
          changed++;
        }
      }
      if (!changed && !needPolish) break;
      // Settle the footprint terms at a coarse tolerance, then polish at full
      // tolerance and check again (the polish may move a pair back over).
      const polish = !changed;
      solution = solveSeparatedQP(n, layers, terms, solution.x, polish ? {} : { tol: 2e-2 });
      needPolish = !polish;
      qpIterations += solution.iterations;
      qpSolves++;
    }
  };
  settleFootprint();
  // Edit-local mode: approximate an L1 position objective by iteratively
  // reweighted least squares — a pinned person who barely moved is pulled
  // much harder (snaps back exactly), one who must make room is pulled less
  // (moves with its block). Least squares alone spreads a displacement over
  // many people; L1 prefers moving few. Hard gaps are kept by every solve;
  // the footprint rule is settled again after every round.
  if (pinTerms.length) {
    for (let round = 0; round < IRLS_ROUNDS; round++) {
      let change = 0;
      for (const t of pinTerms) {
        const d = Math.abs(solution.x[t.idx[0]] - t.prev);
        const w = W_PIN * Math.min(IRLS_MAX_SCALE, Math.max(IRLS_MIN_SCALE, IRLS_EPS_PX / Math.max(d, 1e-6)));
        change = Math.max(change, Math.abs(w - t.w) / t.w);
        t.w = w;
        t.d = t.prev + t.bias / (2 * t.w); // keep the anchoring exact
      }
      if (change < 0.02) break; // weights settled
      solution = solveSeparatedQP(n, layers, terms, solution.x);
      qpIterations += solution.iterations;
      qpSolves++;
      settleFootprint();
    }
  }
  const tSolved = now();
  const { x } = solution;

  let minX = Infinity;
  for (const v of x) minX = Math.min(minX, v);
  // with a previous layout, coordinates stay absolute (no re-normalisation)
  const shift = (opts.previous instanceof Map || stability) ? 0 : PCL.X_MARGIN - minX;
  const xPos = {};
  ids.forEach((id, i) => { xPos[id] = Math.round((x[i] + shift) * 2) / 2; });
  if (stability && stability.frozen && ids.every((id) => stability.prevX.has(id))) {
    // unchanged graph (e.g. a reopened file): the previous coordinates exactly
    ids.forEach((id) => { xPos[id] = stability.prevX.get(id); });
  }

  // Rows are GEN_Y_SPACING apart unless the gap above a row needs more room
  // for its relationship lanes and sibship buses (routing.planBands).
  const plans = planBands(estimateLevelNeeds(S, rows, xPos), PCL.GEN_Y_SPACING);
  const rowY = new Map();
  // a row keeps its previous height unless the gap above it now needs more
  // room for its lines (then it, and the rows below, move down)
  const prevRowY = new Map();
  if (stability && stability.prevY) {
    for (const g of gens) {
      const id = rows.get(g).find((p) => stability.prevY.has(p));
      if (id !== undefined) prevRowY.set(g, stability.prevY.get(id));
    }
  }
  const gapAbove = (k) => (plans.get(gens[k]) || { gap: PCL.GEN_Y_SPACING }).gap * (gens[k] - gens[k - 1]);
  const k0 = gens.findIndex((g) => prevRowY.has(g));
  if (k0 < 0) {
    let yCursor = PCL.Y_TOP;
    gens.forEach((g, k) => {
      if (k > 0) yCursor += gapAbove(k);
      rowY.set(g, yCursor);
    });
  } else {
    // the topmost previously drawn row keeps its height; new rows above it
    // stack upwards, rows below keep theirs unless a gap must grow
    rowY.set(gens[k0], prevRowY.get(gens[k0]));
    for (let k = k0 - 1; k >= 0; k--) rowY.set(gens[k], rowY.get(gens[k + 1]) - gapAbove(k + 1));
    for (let k = k0 + 1; k < gens.length; k++) {
      const needed = rowY.get(gens[k - 1]) + gapAbove(k);
      rowY.set(gens[k], prevRowY.has(gens[k]) ? Math.max(needed, prevRowY.get(gens[k])) : needed);
    }
  }
  const yPos = {};
  ids.forEach((id) => { yPos[id] = rowY.get(S.indById.get(id).generation ?? gens[0]); });

  const edges = routeConnectors(S, rows, xPos, yPos, plans);
  if (socialChildren.size) markSocialDescent(edges, S, socialChildren);
  const tRouted = now();
  const nodes = individuals.map(ind => ({ ...ind, x: xPos[ind.id] ?? 0, y: yPos[ind.id] ?? 0 }));
  return {
    nodes, edges,
    meta: {
      order: rows,
      timings: { orderMs: tOrdered - t0, solveMs: tSolved - tOrdered, routeMs: tRouted - tSolved, qpSolves, qpIterations, footprintTerms: footprintTerms.size },
    },
  };
}

/**
 * Lines of descent to a child linked only socially carry `descentKind`
 * (the renderer draws them dashed): the child's own stem always; the
 * union's drop and sibship line when every child of the union is social.
 */
function markSocialDescent(edges, S, socialChildren) {
  const allSocial = new Set();
  for (const [uid, kids] of S.childrenOf) {
    if (kids.length && kids.every((c) => socialChildren.has(c))) allSocial.add(uid);
  }
  for (const e of edges) {
    if (e.type === 'childStem' && socialChildren.has(e.childId)) e.descentKind = socialChildren.get(e.childId);
    else if ((e.type === 'parentChildDrop' || e.type === 'sibship') && allSocial.has(e.unionId)) {
      e.descentKind = socialChildren.get(S.childrenOf.get(e.unionId)[0]);
    }
  }
}
