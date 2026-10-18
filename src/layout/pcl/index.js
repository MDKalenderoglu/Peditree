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
import { orderLayers } from './ordering';
import { solveSeparatedQP } from './qp';
import { routeConnectors, estimateLevelNeeds, planBands } from './routing';

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
const W_FOOTPRINT = 40;
const FOOTPRINT_MARGIN = 6;   // px inside the allowed boundary
// The invariant tolerates a bystander up to half a symbol inside the outer
// children; PCL keeps everyone off the whole sibship line (boundary at the
// outermost children's centres): an aunt standing right above the proband
// reads like a parent even when she is not strictly inside the fan.
const FOOTPRINT_INSET = 0;
const FOOTPRINT_ROUNDS = 80;

/**
 * @param {{individuals:Array, unions:Array, parentChildRelationships:Array}} graph
 * @param {{ previous?: Map<string, number> }} [opts]  previous x per id (stability)
 */
export function computePclLayout(graph, opts = {}) {
  const individuals = graph.individuals || [];
  if (individuals.length === 0) return { nodes: [], edges: [] };

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t0 = now();
  const S = buildStructure(graph);
  const { order } = orderLayers(S);
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
      x0[index.get(id)] = cursor;
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
        ? { w: W_SPOUSE, idx: [index.get(r), index.get(l)], c: [1, -1], d: PCL.SPOUSE_GAP }
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
    terms.push({ w: W_CENTRE, idx, c, d: 0 });
  }

  if (opts.previous instanceof Map) {
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
          existing.d -= violation + FOOTPRINT_MARGIN;
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
  const tSolved = now();
  const { x } = solution;

  let minX = Infinity;
  for (const v of x) minX = Math.min(minX, v);
  const shift = opts.previous instanceof Map ? 0 : PCL.X_MARGIN - minX;
  const xPos = {};
  ids.forEach((id, i) => { xPos[id] = Math.round((x[i] + shift) * 2) / 2; });

  // Rows are GEN_Y_SPACING apart unless the gap above a row needs more room
  // for its relationship lanes and sibship buses (routing.planBands).
  const plans = planBands(estimateLevelNeeds(S, rows, xPos), PCL.GEN_Y_SPACING);
  const rowY = new Map();
  let yCursor = PCL.Y_TOP;
  gens.forEach((g, k) => {
    if (k > 0) yCursor += (plans.get(g) || { gap: PCL.GEN_Y_SPACING }).gap * (g - gens[k - 1]);
    rowY.set(g, yCursor);
  });
  const yPos = {};
  ids.forEach((id) => { yPos[id] = rowY.get(S.indById.get(id).generation ?? gens[0]); });

  const edges = routeConnectors(S, rows, xPos, yPos, plans);
  const tRouted = now();
  const nodes = individuals.map(ind => ({ ...ind, x: xPos[ind.id] ?? 0, y: yPos[ind.id] ?? 0 }));
  return {
    nodes, edges,
    meta: {
      order: rows,
      timings: { orderMs: tOrdered - t0, solveMs: tSolved - tOrdered, routeMs: tRouted - tSolved, qpSolves, qpIterations },
    },
  };
}
