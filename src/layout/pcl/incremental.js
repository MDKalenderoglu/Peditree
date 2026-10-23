/**
 * incremental.js — edit-local relayout (KI-2).
 *
 * After an edit, the clinician should see only the affected family block
 * change; the rest of the pedigree stays where it was. Previous coordinates
 * are keyed by permanent person ids (schema v2), so "the same person" is
 * well defined across edits.
 *
 *   1. affected people = what the edit touched (new / removed people, the
 *      partners of changed unions, the parents and children of changed child
 *      groups, people whose generation changed, social links that changed);
 *   2. 'local': only atoms containing affected people may be re-ordered;
 *      everyone else is pulled hard to their previous x (index.js W_PIN);
 *   3. 'wide': every atom may move, the previous order is still preferred;
 *   4. 'full': the normal fresh layout.
 * A level is accepted only if its drawing has no layout-invariant and no
 * connector-readability violation, and has no more line crossings, off-centre
 * couples or long partner lines than the previous drawing; stability never
 * keeps a misleading, tangled or lopsided drawing. When no stable level
 * qualifies, the fresh layout is computed too, and the clean candidate with
 * the fewest readability problems (their sum) wins — on a tie the more
 * stable one. An unchanged graph (reopened file, undo target) is
 * reproduced exactly ('frozen').
 */
import { computePclLayout } from './index';
import { checkAllInvariants } from '../../audit/layoutInvariants';
import { checkConnectorReadability, readabilityMetrics } from '../../audit/connectorReadability';
import { displayParentage } from '../../graph/model';

const WIDE_SHARE = 0.5; // an edit touching more than half the people: start wide

/** People affected by the change prevGraph → graph (ids present in graph). */
export function affectedPeople(prevGraph, graph) {
  const out = new Set();
  const prevInd = new Map((prevGraph.individuals || []).map((i) => [i.id, i]));
  const curInd = new Map((graph.individuals || []).map((i) => [i.id, i]));
  const add = (id) => { if (curInd.has(id)) out.add(id); };

  for (const [id, p] of curInd) {
    const before = prevInd.get(id);
    if (!before) { out.add(id); continue; }
    if (before.generation !== p.generation || !!before.pregnancyLoss !== !!p.pregnancyLoss || !!before.stillbirth !== !!p.stillbirth) out.add(id);
  }
  const prevUnions = new Map((prevGraph.unions || []).map((u) => [u.id, u]));
  const curUnions = new Map((graph.unions || []).map((u) => [u.id, u]));
  for (const [id, u] of curUnions) {
    const before = prevUnions.get(id);
    if (!before || before.partners.join('|') !== u.partners.join('|')) {
      u.partners.forEach(add);
      if (before) before.partners.forEach(add);
    }
  }
  for (const [id, u] of prevUnions) if (!curUnions.has(id)) u.partners.forEach(add);

  const kids = (g) => new Map((g.parentChildRelationships || []).map((r) => [r.unionId, r.children]));
  const prevKids = kids(prevGraph), curKids = kids(graph);
  for (const uid of new Set([...prevKids.keys(), ...curKids.keys()])) {
    const a = prevKids.get(uid) || [], b = curKids.get(uid) || [];
    if (a.join('|') === b.join('|')) continue;
    (curUnions.get(uid) || prevUnions.get(uid) || { partners: [] }).partners.forEach(add);
    const sa = new Set(a), sb = new Set(b);
    const added = b.filter((c) => !sa.has(c)), removed = a.filter((c) => !sb.has(c));
    // a child added or removed: the parents and that child are affected; the
    // existing siblings keep their places (they make room, but stay pinned).
    // A pure birth-order change affects the whole sibship.
    const kept = b.filter((c) => sa.has(c));
    const reordered = kept.join('|') !== a.filter((c) => sb.has(c)).join('|');
    (reordered ? [...a, ...b] : [...added, ...removed]).forEach(add);
  }
  const links = (g) => new Set((g.socialParentLinks || []).map((l) => `${l.childId}|${l.unionId}|${l.kind}`));
  const pl = links(prevGraph), cl = links(graph);
  for (const k of new Set([...pl, ...cl])) {
    if (pl.has(k) && cl.has(k)) continue;
    const [childId, unionId] = k.split('|');
    add(childId);
    (curUnions.get(unionId) || prevUnions.get(unionId) || { partners: [] }).partners.forEach(add);
  }
  // people related to a removed person (their partners, parents, children)
  for (const [id] of prevInd) {
    if (curInd.has(id)) continue;
    for (const u of prevGraph.unions || []) if (u.partners.includes(id)) u.partners.forEach(add);
    for (const r of prevGraph.parentChildRelationships || []) {
      if (r.children.includes(id)) { r.children.forEach(add); (prevUnions.get(r.unionId)?.partners || []).forEach(add); }
    }
  }
  return out;
}

/** Line crossings in a drawing (each is drawn with a line jump). */
export function crossingsOf(edges) {
  return (edges || []).reduce((n, e) => n + (Array.isArray(e.bridges) ? e.bridges.length : 0), 0);
}

function clean(graph, layout) {
  const drawn = { ...displayParentage(graph).graph, ...layout };
  return checkAllInvariants(drawn).length === 0 && checkConnectorReadability(drawn).length === 0;
}

/** Readability problems a drawing has: line crossings, off-centre couples, long partner lines. */
function problemsOf(graph, layout) {
  const m = readabilityMetrics({ ...displayParentage(graph).graph, ...layout });
  return { crossings: crossingsOf(layout.edges), offCenter: m.offCenter, longUnions: m.longUnions };
}
const noWorse = (p, base) => p.crossings <= base.crossings && p.offCenter <= base.offCenter && p.longUnions <= base.longUnions;

/**
 * @param {object} graph       the new graph
 * @param {{ prevGraph?: object, prevNodes?: Array<{id,x,y}>, prevEdges?: Array, frozen?: boolean }} previous
 * @returns layout with meta.stability = { level, affected, tried, crossings }
 */
export function computeStableLayout(graph, previous = {}) {
  const prevNodes = previous.prevNodes || [];
  if (!prevNodes.length) {
    const full = computePclLayout(graph);
    return { ...full, meta: { ...full.meta, stability: { level: 'full', reason: 'no previous layout', affected: null, tried: ['full'] } } };
  }
  const prevX = new Map(prevNodes.map((n) => [n.id, n.x]));
  const prevY = new Map(prevNodes.map((n) => [n.id, n.y]));
  const affected = previous.frozen || !previous.prevGraph ? new Set() : affectedPeople(previous.prevGraph, graph);
  const people = (graph.individuals || []).length || 1;
  const frozen = !!previous.frozen || (previous.prevGraph && affected.size === 0);
  // the previous drawing's readability problems; an edit-local result may not add any
  const baseline = previous.prevGraph && Array.isArray(previous.prevEdges)
    ? problemsOf(previous.prevGraph, { nodes: prevNodes, edges: previous.prevEdges })
    : null;
  const tried = [];
  const done = (layout, level, problems, extra = {}) => ({
    ...layout,
    meta: { ...layout.meta, stability: { level, affected: affected.size, tried, ...(problems || problemsOf(graph, layout)), ...extra } },
  });
  const total = (p) => p.crossings + p.offCenter + p.longUnions;

  // Someone was removed: keep the order the clinician knows, but close up
  // the gaps (clinician request 2026-10-23) — fresh coordinates, previous order.
  const ids = new Set(graph.individuals.map((i) => i.id));
  const removed = !!previous.prevGraph && (previous.prevGraph.individuals || []).some((i) => !ids.has(i.id));
  if (removed) {
    tried.push('compact');
    const compact = computePclLayout(graph, { stability: { prevX, prevY, freePersons: null, orderOnly: true } });
    if (clean(graph, compact)) return done(compact, 'compact');
  }
  // (a removal whose compact layout was not clean goes straight to a fresh layout)
  const attempts = [];
  if (!removed) {
    if (affected.size / people <= WIDE_SHARE) attempts.push(['local', { prevX, prevY, freePersons: affected, frozen }]);
    attempts.push(['wide', { prevX, prevY, freePersons: null }]);
  }
  const cleanStable = []; // clean but with added readability problems: [level, layout, problems]
  for (const [level, stability] of attempts) {
    tried.push(level);
    const layout = computePclLayout(graph, { stability });
    if (!clean(graph, layout)) continue;
    if (frozen) return done(layout, level === 'local' ? 'frozen' : level);
    const p = problemsOf(graph, layout);
    if (!baseline || noWorse(p, baseline)) return done(layout, level, p);
    cleanStable.push([level, layout, p]);
  }
  tried.push('full');
  const full = computePclLayout(graph);
  // fewest readability problems among the clean stable candidates (the more local wins a tie)
  const best = cleanStable.reduce((b, c) => (!b || total(c[2]) < total(b[2]) ? c : b), null);
  const pf = problemsOf(graph, full);
  if (best && (!clean(graph, full) || total(pf) >= total(best[2]))) {
    return done(best[1], best[0], best[2], { reason: 'the edit adds readability problems in every layout' });
  }
  return done(full, 'full', pf, { reason: best ? 'fewer readability problems (crossings, off-centre couples, long partner lines) than the stable layouts' : 'stable layouts were not clean' });
}
