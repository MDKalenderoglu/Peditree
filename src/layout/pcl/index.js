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
import { displayParentage, isSmallSymbol, reproMarkOf } from '../../graph/model';
import { withArt, artEdges, isArtUnion } from './art';
import { withGhosts, isGhost, isPass } from './crossGeneration';
import { textBox, lineNoteWidth, TEXT, textScale } from '../../utils/symbolText';

export const PCL = {
  GEN_Y_SPACING: 160,
  Y_TOP: 80,
  SPOUSE_GAP: 70,    // centre-to-centre distance of two adjacent partners
  SIBLING_GAP: 100,  // centre-to-centre distance inside one sibship
  FAMILY_GAP: 130,   // between different families on a row (visual grouping)
  X_MARGIN: 60,
};

// the text under a symbol (symbolText.js) keeps this far from a neighbour's
// text and from the couple's line of descent (clinician report 2026-11-05)
const TEXT_CLEAR = 8;
const TEXT_LINE_CLEAR = 6;

const W_CENTRE = 1;
// opts.straightStart (a new pedigree): an only child stands right under a
// founder couple — a jog in a single line of descent reads as a staircase
// (clinician feedback 2026-10-24); the router draws an offset of up to
// SNAP_ONLY_CHILD px straight. Later edits start from that drawing. Not used
// generally: on dense pedigrees it pushes other couples off centre.
const W_CENTRE_ONLY = 8;
// tidy.js 'only' / 'strong': an only child exactly under the couple's
// midpoint. With the weaker pull a long partner line (consanguineous
// cousins) left the child 7–9 px off, and the line of descent met the
// couple's line off its middle (clinician feedback 2026-11-01); this one
// leaves under 1 px. Tidy keeps the variant only when it is clean.
const W_CENTRE_EXACT = 128;
// a cross-generation line runs this far from a neighbour's symbol or text on a row it passes
const PASS_CLEAR = 22;
// the line's way down — the stand-in on the lower row and the passes in between — under the
// upper partner's side, so the line runs straight down (clinician report 2026-11-11: stairs)
const W_XLINK_ALIGN = 8;
const XLINK_STUB = 8;          // routing.js STUB
const XLINK_BRACKET = 9;       // routing.js BRACKET_LINE
// an only child this far off its side-by-side parents' midpoint is pulled exactly under it
const ONLY_CHILD_SETTLE = 16;
const W_SPOUSE = 0.5;
// an only child (or one twin group) of a couple joined by a lane: under the lane's free gap
const W_LANE_CHILD = 8;
const LANE_ROUNDS = 4;
const LANE_SYMBOL_CLEAR = 16;  // px from a symbol between the partners
const LANE_END_CLEAR = 24;     // px from a partner, beside the lane's own riser (and brackets)
// at most this far from the couple's midpoint (connectorReadability counts a couple more than
// half a slot, 45 px, off its children as off-centre)
const LANE_MAX_SHIFT = 40;
const W_FAR_PARTNERS = 0.03;
const W_XLINK = 0.5; // a cross-generation partner over their stand-in (short stepped line)
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
 *     frozen = graph unchanged: reuse previous coordinates exactly;
 *     orderOnly = keep the previous order, fresh coordinates (after a removal)
 */
export function computePclLayout(inputGraph, opts = {}) {
  // social-only children (e.g. adopted-in) are drawn under their social parents
  const { graph: drawn, socialChildren } = displayParentage(inputGraph);
  // partners on different rows: an invisible stand-in beside the lower one;
  // assisted reproduction: donors and carriers beside the woman carrying (art.js)
  const { graph, art } = withArt(withGhosts(drawn), inputGraph.reproductiveLinks || []);
  const individuals = graph.individuals || [];
  if (individuals.length === 0) return { nodes: [], edges: [] };

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t0 = now();
  const S = buildStructure(graph);
  S.art = art;
  // adopted people are drawn in brackets (model.js adoptionOf): lines meet the brackets
  S.bracketed = new Set([
    ...individuals.filter((i) => i.adoptedOut).map((i) => i.id),
    ...(inputGraph.socialParentLinks || []).filter((l) => l.kind === 'adoptive').map((l) => l.childId),
  ]);
  S.textBox = new Map(individuals.map((i) => [i.id, isGhost(i) ? null : textBox(i, { bracketed: S.bracketed.has(i.id) })]));
  const stability = opts.stability || null;
  const { order } = stability ? orderLayersStable(S, stability) : orderLayers(S);
  // orderOnly (after a removal): keep the previous left-to-right order,
  // but lay coordinates out afresh so the drawing closes up
  const place = stability && !stability.orderOnly ? stability : null;
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
  // how far each person's text reaches (age, genetic result, label …): two
  // texts never touch, and a couple's line of descent, which drops from the
  // middle between them, never runs through either partner's text
  const descends = new Set();
  for (const u of S.unions) {
    if (u.artVirtual || !(S.childrenOf.get(u.id) || []).length) continue;
    const [a, b] = u.partners || [];
    descends.add(`${a}\u0001${b}`).add(`${b}\u0001${a}`);
  }
  // "Aynı köy" on a couple's line (clinician request 2026-11-05): the line's visible part is
  // wide enough for its words, with a little room at each end
  const noteGap = new Map();
  for (const u of S.unions) {
    if (u.relationshipBackground !== 'same_village_or_same_origin') continue;
    const [a, b] = u.partners || [];
    const w = 2 * TEXT.HALF + lineNoteWidth(u.lineNote) + 2 * TEXT_LINE_CLEAR;
    noteGap.set(`${a}\u0001${b}`, w).set(`${b}\u0001${a}`, w);
  }
  const textGap = (l, r) => {
    const L = S.textBox.get(l), R = S.textBox.get(r);
    if (!L || !R) return 0;
    const apart = Math.max(L.right + R.left + TEXT_CLEAR, noteGap.get(`${l}\u0001${r}`) || 0);
    return descends.has(`${l}\u0001${r}`) ? Math.max(apart, 2 * (Math.max(L.right, R.left) + TEXT_LINE_CLEAR)) : apart;
  };
  // larger text (Ayarlar → Yazı boyutu): two neighbours' pedigree numbers, which stand at
  // their upper corners, grow too; the gap grows by as much (nothing changes at the usual size)
  const numberGrowth = Math.max(0, textScale() - 1) * 2 * 36;
  // a pass kept free for a cross-generation line (crossGeneration.js): beside a neighbour's
  // symbol and text, with room for the line
  const passGap = (pass, other, side) => {
    const T = S.textBox.get(other);
    const reach = Math.max(isGhost(S.indById.get(other)) ? 0 : 20, T ? T[side] : 0);
    return Math.ceil(reach + PASS_CLEAR + numberGrowth);
  };
  const gapBetween = (a, b) => {
    if (isPass(S.indById.get(a)) && isPass(S.indById.get(b))) return 2 * PASS_CLEAR;
    if (isPass(S.indById.get(a))) return passGap(a, b, 'left');
    if (isPass(S.indById.get(b))) return passGap(b, a, 'right');
    const base = S.isPartners(a, b) ? PCL.SPOUSE_GAP : sameAtom(a, b) ? PCL.SIBLING_GAP : PCL.FAMILY_GAP;
    return Math.max(base + numberGrowth, Math.ceil(textGap(a, b)));
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
      x0[index.get(id)] = place && place.prevX.has(id) ? place.prevX.get(id) : cursor;
    });
    layers.push({ ids: row.map(id => index.get(id)), gaps });
  }

  const rowPos = new Map();
  for (const g of gens) rows.get(g).forEach((id, k) => rowPos.set(id, k));
  const coupleTerm = new Map(); // union → its "couple over its children" term

  for (const u of S.unions) {
    const [a, b] = u.partners || [];
    if (!index.has(a) || !index.has(b)) continue;
    const sameRow = S.indById.get(a).generation === S.indById.get(b).generation;
    if (sameRow) {
      const [l, r] = rowPos.get(a) <= rowPos.get(b) ? [a, b] : [b, a];
      const adjacent = Math.abs(rowPos.get(a) - rowPos.get(b)) === 1;
      terms.push(adjacent
        ? { w: W_SPOUSE, idx: [index.get(r), index.get(l)], c: [1, -1], d: gapBetween(l, r), couple: true }
        : { w: W_FAR_PARTNERS, idx: [index.get(r), index.get(l)], c: [1, -1], d: PCL.SPOUSE_GAP });
    }
    const kids = (S.childrenOf.get(u.id) || []).filter(c => index.has(c));
    if (!kids.length) continue;
    // a child carried by a gestational carrier or surrogate stands right under her (art.js)
    if (isArtUnion(u)) {
      const carrier = u.artCarrier;
      if (carrier && index.has(carrier)) {
        const sorted = kids.slice().sort((p, q) => rowPos.get(p) - rowPos.get(q));
        const [f, l] = [sorted[0], sorted[sorted.length - 1]];
        terms.push(f === l
          ? { w: W_CENTRE_EXACT, idx: [index.get(carrier), index.get(f)], c: [1, -1], d: 0 }
          : { w: W_CENTRE_EXACT, idx: [index.get(carrier), index.get(f), index.get(l)], c: [1, -0.5, -0.5], d: 0 });
      }
      continue;
    }
    const ordered = kids.slice().sort((p, q) => rowPos.get(p) - rowPos.get(q));
    const first = ordered[0], last = ordered[ordered.length - 1];
    const idx = [index.get(a), index.get(b)];
    const c = [0.5, 0.5];
    if (first === last) { idx.push(index.get(first)); c.push(-1); }
    else { idx.push(index.get(first), index.get(last)); c.push(-0.5, -0.5); }
    // a founder couple (no parents drawn) over its only child: nothing above
    // pulls it elsewhere, so it can stand right over the child
    const founders = !S.parentUnion.has(a) && !S.parentUnion.has(b);
    // opts.straight (Yeniden Düzenle tries these, tidy.js): 'founders' (=
    // straightStart), 'only' (every only child under the couple), 'strong'
    // (every couple firmly over its children)
    const straight = opts.straight || (opts.straightStart ? 'founders' : null);
    let w = W_CENTRE;
    if (first === last && (straight === 'only' || straight === 'strong')) w = W_CENTRE_EXACT;
    else if (first === last && straight === 'founders' && founders) w = W_CENTRE_ONLY;
    else if (straight === 'strong') w = W_CENTRE * 4;
    const term = { w, idx, c, d: 0, couple: true };
    terms.push(term);
    coupleTerm.set(u.id, term);
  }

  const xlinkTerms = [];
  for (const link of S.crossLinks) {
    const { ghost, upper } = link;
    if (!index.has(ghost) || !index.has(upper)) continue;
    const term = { w: W_XLINK, idx: [index.get(ghost), index.get(upper)], c: [1, -1], d: 0 };
    terms.push(term);
    xlinkTerms.push({ link, term });
  }

  const pinTerms = [];
  if (place && place.freePersons !== null) {
    for (const t of terms) if (t.couple) t.w *= COUPLE_SCALE;
  }
  if (place) {
    for (const [id, px] of place.prevX) {
      if (!index.has(id) || !Number.isFinite(px)) continue;
      const w = place.freePersons === null ? W_STABLE_WIDE
        : (place.freePersons.has(id) ? W_STABLE_FREE : W_PIN);
      const term = { w, idx: [index.get(id)], c: [1], d: px };
      terms.push(term);
      if (place.freePersons !== null && !place.freePersons.has(id)) pinTerms.push(term);
    }
    if (place.freePersons !== null) {
      const pinned = (id) => place.prevX.has(id) && !place.freePersons.has(id);
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
          const prevGap = place.prevX.get(b) - place.prevX.get(a);
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
        const r = t.idx.reduce((acc, k, q) => acc + t.c[q] * place.prevX.get(ids[k]), 0) - t.d;
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
    if (isArtUnion(u)) continue; // no sibship line under an invisible bond
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
  // A couple whose partners do not stand side by side is joined by a lane above their row; its
  // line of descent leaves the lane through a free gap of that row, never through a symbol
  // (routing.js). An only child — or one group of twins — stands right under that gap: under the
  // couple's midpoint, which may be another person, the line hung from a jog, a staircase
  // (clinician report 2026-11-07). The couple's own centring term keeps the couple and the child
  // together, only offset by the distance from the midpoint to the gap.
  const laneFamilies = laneDropFamilies();
  for (let round = 0; laneFamilies.length && round < LANE_ROUNDS; round++) {
    const xs = solution.x;
    let changed = false;
    for (const f of laneFamilies) {
      const own = coupleTerm.get(f.u.id);
      if (!own) continue;
      const target = laneDropTarget(f, xs);
      const apex = f.kidIdx.reduce((sum, i) => sum + xs[i], 0) / f.kidIdx.length;
      if (target === null || Math.abs(apex - target) <= 1) continue;
      // only a child standing under the lane: one held far away by the rest of the
      // pedigree (a loop) keeps its place — pulling it would push whole families
      if (!f.pulled && (apex < xs[index.get(f.l)] || apex > xs[index.get(f.r)])) continue;
      const mid = (xs[index.get(f.l)] + xs[index.get(f.r)]) / 2;
      const d = mid - target; // ½·(a + b) − child = midpoint − gap
      if (f.pulled && Math.abs(own.d - d) <= 1) continue;
      if (!f.pulled) {
        f.pulled = true;
        own.w = Math.max(own.w, W_LANE_CHILD * (place && place.freePersons !== null ? COUPLE_SCALE : 1));
      }
      own.d = d;
      changed = true;
    }
    if (!changed) break;
    solution = solveSeparatedQP(n, layers, terms, solution.x);
    qpIterations += solution.iterations;
    qpSolves++;
    settleFootprint();
  }
  // A cross-generation line leaves the upper partner's side — or the bottom of the symbol,
  // off-centre, when that side carries a partner's line (routing.js) — and runs down onto the
  // stand-in beside the lower partner: the stand-in, and every pass on the rows in between,
  // stand right under that point, so the line needs no steps.
  if (xlinkTerms.length) {
    const xs0 = solution.x;
    for (const { link, term } of xlinkTerms) {
      const up = S.indById.get(link.upper);
      const dir = xs0[term.idx[0]] >= xs0[term.idx[1]] ? 1 : -1;
      const row = rows.get(up.generation);
      const neighbour = row[rowPos.get(link.upper) + dir];
      const h = isSmallSymbol(up) ? 14 : 20;
      const sideTaken = neighbour !== undefined && S.isPartners(link.upper, neighbour);
      term.d = dir * (sideTaken ? h - 4 : h + (S.bracketed && S.bracketed.has(link.upper) ? XLINK_BRACKET : 0) + XLINK_STUB);
      term.w = W_XLINK_ALIGN;
    }
    solution = solveSeparatedQP(n, layers, terms, solution.x);
    qpIterations += solution.iterations;
    qpSolves++;
    settleFootprint();
  }
  // A couple standing side by side over an only child (or one group of twins): the line of
  // descent leaves the middle of their line, at the same distance from both partners, and runs
  // straight down to the child (clinician report 2026-11-11: a line of descent nearer one partner
  // reads as lopsided). The solve leaves such a child a few px off; a firm pull settles it. Only
  // a child already nearly under the couple — one held elsewhere by the pedigree keeps its place.
  {
    const xs0 = solution.x;
    let changed = false;
    for (const u of S.unions) {
      const term = coupleTerm.get(u.id);
      if (!term || term.w >= W_CENTRE_EXACT) continue;
      const [a, b] = u.partners || [];
      if (S.indById.get(a).generation !== S.indById.get(b).generation) continue;
      if (Math.abs(rowPos.get(a) - rowPos.get(b)) !== 1) continue;
      const kids = (S.childrenOf.get(u.id) || []).filter(c => index.has(c));
      const m = kids.length > 1 && S.multipleOf && S.multipleOf.get(kids[0]);
      if (!(kids.length === 1 || (m && kids.every(k => m.members.includes(k))))) continue;
      const off = term.idx.reduce((s, k, q) => s + term.c[q] * xs0[k], 0);
      if (Math.abs(off) <= 0.25 || Math.abs(off) > ONLY_CHILD_SETTLE) continue;
      term.w = W_CENTRE_EXACT * (place && place.freePersons !== null ? COUPLE_SCALE : 1);
      changed = true;
    }
    if (changed) {
      solution = solveSeparatedQP(n, layers, terms, solution.x);
      qpIterations += solution.iterations;
      qpSolves++;
      settleFootprint();
    }
  }
  function laneDropFamilies() {
    const out = [];
    for (const u of S.unions) {
      if (isArtUnion(u)) continue;
      const [a, b] = u.partners || [];
      if (!index.has(a) || !index.has(b)) continue;
      if (S.indById.get(a).generation !== S.indById.get(b).generation) continue;
      if (Math.abs(rowPos.get(a) - rowPos.get(b)) <= 1) continue;
      const kids = (S.childrenOf.get(u.id) || []).filter(c => index.has(c));
      if (!kids.length) continue;
      const m = S.multipleOf && S.multipleOf.get(kids[0]);
      const oneApex = kids.length === 1 || (m && kids.every(k => m.members.includes(k)));
      if (!oneApex) continue;
      const ordered = kids.slice().sort((p, q) => rowPos.get(p) - rowPos.get(q));
      const kidIdx = kids.length === 1 ? [index.get(kids[0])] : [index.get(ordered[0]), index.get(ordered[ordered.length - 1])];
      const [l, r] = rowPos.get(a) < rowPos.get(b) ? [a, b] : [b, a];
      const row = rows.get(S.indById.get(a).generation);
      out.push({ u, l, r, seq: row.slice(rowPos.get(l), rowPos.get(r) + 1), kidIdx, pulled: false });
    }
    return out;
  }
  // the point of the free gap nearest the couple's midpoint, a little away from the symbols
  // (routing.js keeps the line 6 px off a symbol and beside the lane's own risers)
  function laneDropTarget({ l, r, seq }, xs) {
    const xOf = (p) => xs[index.get(p)];
    const half = (p) => { const ind = S.indById.get(p); return isGhost(ind) ? 0 : isSmallSymbol(ind) ? 14 : 20; };
    const mid = (xOf(l) + xOf(r)) / 2;
    let best = null;
    for (let k = 0; k + 1 < seq.length; k++) {
      const p = seq[k], q = seq[k + 1];
      const pu = S.isPartners(p, q) ? S.unions.find(v => v.partners.includes(p) && v.partners.includes(q)) : null;
      if (pu && (S.childrenOf.get(pu.id) || []).length) continue; // their own line of descent drops there
      const lo = xOf(p) + half(p) + (p === l ? LANE_END_CLEAR : LANE_SYMBOL_CLEAR);
      const hi = xOf(q) - half(q) - (q === r ? LANE_END_CLEAR : LANE_SYMBOL_CLEAR);
      const raw = xOf(q) - half(q) - (xOf(p) + half(p));
      if (raw <= 2 * 6) continue;
      const x = lo <= hi ? Math.min(hi, Math.max(lo, mid)) : (xOf(p) + half(p) + xOf(q) - half(q)) / 2;
      if (best === null || Math.abs(x - mid) < Math.abs(best - mid)) best = x;
    }
    // a gap far from the middle would leave the couple off-centre over its child: keep the jog
    return best !== null && Math.abs(best - mid) <= LANE_MAX_SHIFT ? best : null;
  }

  const tSolved = now();
  const { x } = solution;

  let minX = Infinity;
  for (const v of x) minX = Math.min(minX, v);
  // with a previous layout, coordinates stay absolute (no re-normalisation)
  const shift = (opts.previous instanceof Map || place) ? 0 : PCL.X_MARGIN - minX;
  const xPos = {};
  ids.forEach((id, i) => { xPos[id] = Math.round((x[i] + shift) * 2) / 2; });
  if (place && place.frozen && ids.every((id) => place.prevX.has(id))) {
    // unchanged graph (e.g. a reopened file): the previous coordinates exactly
    ids.forEach((id) => { xPos[id] = place.prevX.get(id); });
  }

  // Rows are GEN_Y_SPACING apart unless the gap above a row needs more room
  // for its relationship lanes and sibship buses (routing.planBands).
  const plans = planBands(estimateLevelNeeds(S, rows, xPos), PCL.GEN_Y_SPACING);
  const rowY = new Map();
  // a row keeps its previous height unless the gap above it now needs more
  // room for its lines (then it, and the rows below, move down)
  const prevRowY = new Map();
  if (place && place.prevY) {
    for (const g of gens) {
      const id = rows.get(g).find((p) => place.prevY.has(p));
      if (id !== undefined) prevRowY.set(g, place.prevY.get(id));
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
  routeRelativeAdoption(inputGraph, edges, xPos, yPos);
  edges.push(...artEdges(art, edges, xPos, yPos, (id) => (isSmallSymbol(S.indById.get(id)) ? 14 : PCL_NODE_HALF)));
  const tRouted = now();
  // stand-ins are never drawn
  const nodes = individuals.filter(ind => !isGhost(ind)).map(ind => {
    const n = { ...ind, x: xPos[ind.id] ?? 0, y: yPos[ind.id] ?? 0 };
    const mark = art ? reproMarkOf(inputGraph, ind.id) : null; // "D" / "G" inside the symbol
    if (mark) n.reproMark = mark;
    return n;
  });
  const shownRows = new Map([...rows].map(([g, list]) => [g, list.filter(id => !isGhost(S.indById.get(id)))]));
  return {
    nodes, edges,
    meta: {
      order: shownRows,
      timings: { orderMs: tOrdered - t0, solveMs: tSolved - tOrdered, routeMs: tRouted - tSolved, qpSolves, qpIterations, footprintTerms: footprintTerms.size },
    },
  };
}

/**
 * Adoption by relatives (model.js adoptionOf 'relative'; clinician decisions
 * 2026-11-01): the child stands under the biological parents (solid line);
 * a dashed line runs from the adoptive couple's line down to just above the
 * child's row, across, and into the top of the child's symbol beside the
 * solid stem. It leaves the couple's line beside its middle (where the
 * couple's own line of descent drops) and, on its way down, steps aside of
 * any symbol in a row between.
 */
const ADOPT_OFFSET = 10;   // px beside the solid stem at the child's top
const PCL_NODE_HALF = 20;  // half a symbol (routing.js NODE_HALF)
const ADOPT_LEAVE = 8;     // px beside the middle of the adoptive couple's line (inside it: partners stand 70 apart)
const ADOPT_ABOVE = 14;    // px above the child's sibship line
function routeRelativeAdoption(graph, edges, xPos, yPos) {
  const bio = new Set((graph.parentChildRelationships || []).flatMap((r) => r.children));
  const half = PCL_NODE_HALF;
  for (const l of graph.socialParentLinks || []) {
    if (l.kind !== 'adoptive' || !bio.has(l.childId) || xPos[l.childId] === undefined) continue;
    const u = (graph.unions || []).find((x) => x.id === l.unionId);
    if (!u || u.partners.some((p) => xPos[p] === undefined)) continue;
    const [a, b] = u.partners;
    // the couple's drawn line (a lane above the row when people stand between them): its longest level piece
    const level = edges.filter((e) => e.unionId === u.id && e.y1 === e.y2 && !e.descentKind
      && ['union', 'consanguineousUnion', 'consanguineousUnionUnresolved'].includes(e.type))
      .sort((p, q) => Math.abs(q.x2 - q.x1) - Math.abs(p.x2 - p.x1))[0];
    const uy = level ? level.y1 : Math.max(yPos[a], yPos[b]);
    const lineLo = level ? Math.min(level.x1, level.x2) : Math.min(xPos[a], xPos[b]);
    const lineHi = level ? Math.max(level.x1, level.x2) : Math.max(xPos[a], xPos[b]);
    const mid = (lineLo + lineHi) / 2;
    const cx = xPos[l.childId], cy = yPos[l.childId];
    const dir = cx >= mid ? 1 : -1;
    const stem = edges.find((e) => e.type === 'childStem' && e.childId === l.childId);
    const levelY = (stem ? Math.min(stem.y1, stem.y2) : cy - half - 30) - ADOPT_ABOVE;
    // leave beside the middle, stepping aside of any symbol between the rows
    const blocked = (x) => Object.keys(xPos).some((id) => yPos[id] > uy && yPos[id] < levelY + half
      && Math.abs(xPos[id] - x) < half + 6);
    let sx = mid + dir * ADOPT_LEAVE;
    for (let k = 1; k <= 12 && blocked(sx); k++) sx = mid + dir * (ADOPT_LEAVE + k * 12);
    sx = Math.min(lineHi - 4, Math.max(lineLo + 4, sx));
    const ex = cx - dir * ADOPT_OFFSET;
    const common = { type: 'adoptiveDescent', descentKind: 'adoptive', unionId: u.id, childId: l.childId };
    edges.push({ ...common, x1: sx, y1: uy, x2: sx, y2: levelY });
    if (Math.abs(ex - sx) > 0.5) edges.push({ ...common, x1: sx, y1: levelY, x2: ex, y2: levelY });
    edges.push({ ...common, x1: ex, y1: levelY, x2: ex, y2: cy - half });
  }
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
