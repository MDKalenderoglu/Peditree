/**
 * kinship.js — how two people are related, read from the drawn graph.
 *
 * Consanguinity is a fact of the structure (non-negotiable rule 4): when two
 * partners share an ancestor that exists in the graph, the degree is the one
 * the drawing shows, whichever panel created the structure (wizard template,
 * "make siblings", the person editor). finalize.js uses this after every
 * operation, so every panel reads the same answer.
 */
import { indexGraph } from './model';

/** ancestor id → fewest generations up from `id` (parents = 1). */
function ancestorDepths(idx, id) {
  const depth = new Map();
  let frontier = [id];
  for (let d = 1; frontier.length; d++) {
    const next = [];
    for (const cur of frontier) {
      const uid = idx.bioParentUnion.get(cur);
      if (!uid) continue;
      for (const p of idx.unionById.get(uid)?.partners || []) {
        if (depth.has(p) || p === id) continue;
        depth.set(p, d);
        next.push(p);
      }
    }
    frontier = next;
  }
  return depth;
}

const DEGREE_LABEL = {
  first_cousin: '1. derece kuzen',
  second_cousin: '2. derece kuzen',
  first_cousin_once_removed: '1. kuzenin çocuğu (bir kuşak fark)',
  second_cousin_once_removed: '2. kuzenin çocuğu (bir kuşak fark)',
  double_first_cousin: 'Çift 1. derece kuzen',
  avuncular: 'Amca/dayı/hala/teyze – yeğen',
  multiple_relationship: 'Birden fazla akrabalık yolu',
  other: 'Diğer akrabalık',
};
export const degreeLabel = (degree) => DEGREE_LABEL[degree] || null;

function degreeFor(m, n, half) {
  const lo = Math.min(m, n), hi = Math.max(m, n);
  if (half) return 'other';
  if (lo === 1 && hi === 2) return 'avuncular'; // e.g. uncle and niece (cross-generation partners)
  if (lo === 2 && hi === 2) return 'first_cousin';
  if (lo === 3 && hi === 3) return 'second_cousin';
  if (lo === 2 && hi === 3) return 'first_cousin_once_removed';
  if (lo === 3 && hi === 4) return 'second_cousin_once_removed';
  return 'other';
}

/**
 * @returns null when `a` and `b` share no drawn ancestor, else
 *   { degree, label, ancestors: string[], couples: [{ ancestors, m, n }] }
 *   — `ancestors` are the nearest common ancestors (none of them is an
 *   ancestor of another common ancestor).
 */
export function kinshipOf(graph, a, b, idx = indexGraph(graph)) {
  if (!a || !b || a === b) return null;
  const da = ancestorDepths(idx, a), db = ancestorDepths(idx, b);
  const common = [...da.keys()].filter((x) => db.has(x) && !idx.byId.get(x)?.placeholder);
  if (!common.length) return null;
  const commonSet = new Set(common);
  // nearest: drop a common ancestor whose own descendant is also common
  const isAboveAnother = new Set();
  for (const c of common) for (const up of ancestorDepths(idx, c).keys()) if (commonSet.has(up)) isAboveAnother.add(up);
  const nearest = common.filter((c) => !isAboveAnother.has(c));
  // group nearest common ancestors into couples (both partners of one union)
  const couples = [];
  const used = new Set();
  for (const c of nearest) {
    if (used.has(c)) continue;
    const partner = (idx.unionsOf.get(c) || []).map((uid) => idx.partnerOf(uid, c)).find((p) => nearest.includes(p) && !used.has(p));
    const group = partner ? [c, partner] : [c];
    group.forEach((g) => used.add(g));
    couples.push({ ancestors: group, m: da.get(c), n: db.get(c), half: group.length === 1 });
  }
  let degree;
  if (couples.length === 1) {
    degree = degreeFor(couples[0].m, couples[0].n, couples[0].half);
  } else if (couples.length === 2 && couples.every((c) => !c.half && c.m === 2 && c.n === 2)) {
    degree = 'double_first_cousin';
  } else {
    degree = 'multiple_relationship';
  }
  return { degree, label: DEGREE_LABEL[degree], ancestors: nearest, couples };
}

/**
 * Wright's kinship coefficient φ(a, b): the probability that an allele taken
 * at random from each is identical by descent, over the drawn biological
 * parentage (social parents do not count; an unspecified parent is a founder,
 * unrelated to everyone). Exact for these binary fractions. Informational
 * (clinician request 2026-10-25): the inbreeding coefficient F of a couple's
 * children is φ of the partners, e.g. first cousins 1/16; two people share
 * 2φ of their genes (non-inbred), e.g. first cousins 1/8.
 */
export function kinshipCoefficient(graph, a, b, idx = indexGraph(graph)) {
  const parents = (id) => {
    const u = idx.unionById.get(idx.bioParentUnion.get(id));
    return u ? u.partners : null;
  };
  const levels = new Map();
  const level = (id, seen = new Set()) => {
    if (levels.has(id)) return levels.get(id);
    if (seen.has(id)) return 0; // loop guard (never in a valid graph)
    seen.add(id);
    const ps = parents(id);
    const l = ps ? 1 + Math.max(...ps.map((p) => level(p, seen))) : 0;
    levels.set(id, l);
    return l;
  };
  const memo = new Map();
  const phi = (x, y) => {
    if (x === y) {
      const ps = parents(x);
      return (1 + (ps ? phi(ps[0], ps[1]) : 0)) / 2;
    }
    const key = x < y ? `${x}|${y}` : `${y}|${x}`;
    if (memo.has(key)) return memo.get(key);
    // go up from the one that cannot be the other's ancestor (an ancestor is
    // always on a lower level)
    const [p, q] = level(x) >= level(y) ? [x, y] : [y, x];
    const ps = parents(p);
    const v = ps ? (phi(ps[0], q) + phi(ps[1], q)) / 2 : 0;
    memo.set(key, v);
    return v;
  };
  return phi(a, b);
}

/** Inbreeding coefficient F of the children of a union (φ of the partners). */
export function childInbreeding(graph, unionId, idx = indexGraph(graph)) {
  const u = idx.unionById.get(unionId);
  return u ? kinshipCoefficient(graph, u.partners[0], u.partners[1], idx) : 0;
}

/** "1/16 (%6,25)" — the fraction the clinician knows, and a percentage. */
export function formatCoefficient(x) {
  if (!x) return '0';
  let k = 1;
  while (k < 40 && Math.abs(x * 2 ** k - Math.round(x * 2 ** k)) > 1e-9) k++;
  const pct = (x * 100).toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
  return `${Math.round(x * 2 ** k)}/${2 ** k} (%${pct})`;
}

/**
 * A first-cousin couple by the names used in the clinic: "amca çocukları"
 * (their fathers are brothers), "teyze çocukları" (their mothers are
 * sisters), "hala–dayı çocukları" (a brother and a sister). null when the two
 * are not first cousins through one pair of full siblings.
 */
export function cousinMarriageName(graph, a, b, idx = indexGraph(graph)) {
  const parentsOf = (id) => idx.unionById.get(idx.bioParentUnion.get(id))?.partners || [];
  const pairs = [];
  for (const pa of parentsOf(a)) {
    for (const pb of parentsOf(b)) {
      const ua = idx.bioParentUnion.get(pa);
      if (pa !== pb && ua && ua === idx.bioParentUnion.get(pb)) pairs.push([pa, pb]);
    }
  }
  if (pairs.length !== 1) return null;
  const [sa, sb] = pairs[0].map((id) => idx.byId.get(id)?.sex);
  if (sa === 'male' && sb === 'male') return 'amca çocukları';
  if (sa === 'female' && sb === 'female') return 'teyze çocukları';
  if ((sa === 'male' && sb === 'female') || (sa === 'female' && sb === 'male')) return 'hala–dayı çocukları';
  return null;
}
