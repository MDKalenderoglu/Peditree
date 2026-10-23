/**
 * finalize.js — derived fields recomputed after every graph mutation, so no
 * operation has to remember them:
 *
 *   1. birth order of child groups whose order is not explicit
 *      (orderPolicy 'byAge' — v1's default ordering: liveborn by age, oldest
 *      first; unaged keep their place; then pregnancy losses, stillbirths);
 *   2. generation (topology-derived BFS from the wizard anchor — the same
 *      computeGenerations the v1 builder runs);
 *   3. consanguinity: partners who share an ancestor that exists in the
 *      graph are consanguineous, 'known_supported', with the degree the
 *      drawing shows (kinship.js; non-negotiable rule 4); a union declared
 *      consanguineous without shared ancestors is 'reported_unresolved'; its
 *      relationshipBackground follows (same rule as builder stage 10b);
 *   4. the condition key (legend) follows the people's conditions
 *      (conditionKey.js).
 *
 * Mutates the (already cloned) graph in place and returns it.
 */
import { computeGenerations } from '../utils/graphTraversal';
import { defaultChildOrder } from '../utils/childOrdering';
import { indexGraph, displayParentage } from './model';
import { kinshipOf } from './kinship';
import { deriveConditionKey } from './conditionKey';

// declared degrees richer than a partly drawn structure
const KEEP_DECLARED = new Set(['other', 'multiple_relationship', 'double_first_cousin']);

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
  // generations follow the drawn parentage (a child with only adoptive
  // parents sits one row below them); the folded copy shares the
  // individual objects, so the computed generations land on the graph
  if (anchor) computeGenerations(displayParentage(graph).graph, anchor, 3);

  deriveConsanguinity(graph);
  deriveConditionKey(graph);
  return graph;
}

/**
 * Step 3: partners who share a drawn ancestor ARE consanguineous, whichever
 * panel drew the shared ancestry, with the degree the drawing shows (a
 * declared degree richer than a partly drawn structure is kept). Returns the
 * ids of the unions whose consanguinity fields it changed.
 */
export function deriveConsanguinity(graph) {
  const idx = indexGraph(graph);
  const changed = [];
  for (const u of graph.unions) {
    const before = JSON.stringify([u.consanguineous, u.consanguinityDegree, u.consanguinityStatus, u.relationshipBackground]);
    const kin = kinshipOf(graph, u.partners[0], u.partners[1], idx);
    if (kin) {
      u.consanguineous = true;
      if (!KEEP_DECLARED.has(u.consanguinityDegree)) u.consanguinityDegree = kin.degree;
    }
    if (!u.consanguineous) {
      if (!u.consanguinityStatus) u.consanguinityStatus = 'none';
      if (!u.relationshipBackground) u.relationshipBackground = 'not_asked';
    } else {
      u.consanguinityStatus = kin ? 'known_supported' : 'reported_unresolved';
      u.relationshipBackground = kin ? 'consanguinity_structurally_supported' : 'consanguinity_reported';
    }
    if (JSON.stringify([u.consanguineous, u.consanguinityDegree, u.consanguinityStatus, u.relationshipBackground]) !== before) changed.push(u.id);
  }
  return changed;
}
