/**
 * exchange.js — exchange marriages between two sibships ("berdel", "değişik
 * evlilik"): two or more siblings of one family married to two or more
 * siblings of another, on the same row (clinician decision 2026-11-23, after
 * a comparison with OPX: with each sibship kept apart only one of the couples
 * could stand side by side, the others joined by long lines over the row, and
 * the drawing spread with every generation).
 *
 * For such a pair of sibships the two families stand interleaved, every
 * couple side by side (structure.js), and the rule that nobody but the
 * parents stands over a sibship line (index.js footprint, layoutInvariants.js
 * UNRELATED_NODE_IN_CHILD_FOOTPRINT) lets the other family's parents stand
 * over it: the two sibship lines run on levels of their own (routing.js).
 * Only for these pairs; everywhere else the rule is unchanged.
 */

/**
 * Pairs of parent unions whose children married each other at least twice,
 * each time a different sibling on both sides (a man married to two sisters
 * is not one). Returns Map unionId → Set of unionIds it exchanges with, and
 * the list of pairs { a, b, couples: [[childOfA, childOfB, unionId]] }.
 */
export function exchangePairs(graph) {
  const unions = graph.unions || [];
  const pcrs = graph.parentChildRelationships || [];
  const ind = new Map((graph.individuals || []).map((i) => [i.id, i]));
  const parentUnion = new Map();
  for (const r of pcrs) for (const c of r.children || []) if (!parentUnion.has(c)) parentUnion.set(c, r.unionId);
  const byPair = new Map();
  for (const u of unions) {
    if (u.crossGeneration || !u.partners || u.partners.length !== 2) continue;
    const [p, q] = u.partners;
    const pu = parentUnion.get(p), qu = parentUnion.get(q);
    if (!pu || !qu || pu === qu) continue;
    if (!ind.has(p) || !ind.has(q) || ind.get(p).generation !== ind.get(q).generation) continue;
    const [a, b] = pu < qu ? [pu, qu] : [qu, pu];
    const [x, y] = pu < qu ? [p, q] : [q, p];
    const key = `${a}|${b}`;
    if (!byPair.has(key)) byPair.set(key, { a, b, couples: [] });
    byPair.get(key).couples.push([x, y, u.id]);
  }
  const pairs = [];
  const mates = new Map();
  for (const pair of byPair.values()) {
    // a matching: every sibling in one couple only
    const xs = new Set(pair.couples.map((c) => c[0]));
    const ys = new Set(pair.couples.map((c) => c[1]));
    if (pair.couples.length < 2 || xs.size !== pair.couples.length || ys.size !== pair.couples.length) continue;
    pairs.push(pair);
    for (const [s, t] of [[pair.a, pair.b], [pair.b, pair.a]]) {
      if (!mates.has(s)) mates.set(s, new Set());
      mates.get(s).add(t);
    }
  }
  return { pairs, mates };
}

/** The partners allowed over union u's sibship line besides its own: the parents of the sibship it exchanges with. */
export function allowedOverSibship(mates, unionById, uid) {
  const out = new Set();
  for (const m of mates.get(uid) || []) for (const p of (unionById.get(m) || {}).partners || []) out.add(p);
  return out;
}
