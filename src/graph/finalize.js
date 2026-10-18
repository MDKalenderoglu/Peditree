/**
 * finalize.js — derived fields recomputed after every graph mutation, so no
 * operation has to remember them:
 *
 *   1. birth order of child groups whose order is not explicit
 *      (orderPolicy 'byAge' — v1's default ordering: liveborn by age, oldest
 *      first; unaged keep their place; then pregnancy losses, stillbirths);
 *   2. generation (topology-derived BFS from the wizard anchor — the same
 *      computeGenerations the v1 builder runs);
 *   3. consanguinity: a union declared consanguineous is 'known_supported'
 *      only when the partners share an ancestor that exists in the graph
 *      (non-negotiable rule 4), otherwise 'reported_unresolved'; its
 *      relationshipBackground follows (same rule as builder stage 10b).
 *
 * Mutates the (already cloned) graph in place and returns it.
 */
import { computeGenerations } from '../utils/graphTraversal';
import { defaultChildOrder } from '../utils/childOrdering';
import { indexGraph, ancestorsOf } from './model';

export function finalizeGraph(graph, { anchorId = 'proband' } = {}) {
  const idx0 = indexGraph(graph);

  for (const rel of graph.parentChildRelationships) {
    if (rel.birthOrderExplicit || rel.orderPolicy !== 'byAge') continue;
    const kids = rel.children.map((id) => idx0.byId.get(id)).filter(Boolean);
    if (kids.length < 2) continue;
    rel.children = defaultChildOrder(kids);
  }

  const anchor = idx0.byId.has(anchorId)
    ? anchorId
    : (graph.individuals.find((i) => i.proband) || graph.individuals[0] || {}).id;
  if (anchor) computeGenerations(graph, anchor, 3);

  const idx = indexGraph(graph);
  for (const u of graph.unions) {
    if (!u.consanguineous) {
      if (!u.consanguinityStatus) u.consanguinityStatus = 'none';
      if (!u.relationshipBackground) u.relationshipBackground = 'not_asked';
      continue;
    }
    const [a, b] = u.partners;
    const aa = ancestorsOf(graph, a, idx);
    const shared = [...ancestorsOf(graph, b, idx)].some((x) => aa.has(x));
    u.consanguinityStatus = shared ? 'known_supported' : 'reported_unresolved';
    u.relationshipBackground = shared ? 'consanguinity_structurally_supported' : 'consanguinity_reported';
  }
  return graph;
}
