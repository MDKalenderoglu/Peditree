/**
 * finalize.js — derived fields recomputed after every graph mutation, so no
 * operation has to remember them:
 *
 *   1. birth order of child groups whose order is not explicit
 *      (orderPolicy 'byAge': liveborn by age, oldest first — the aged
 *      siblings are sorted among the places they hold; the unaged,
 *      pregnancy losses and stillbirths keep theirs);
 *   2. generation (topology-derived BFS from the wizard anchor — the same
 *      computeGenerations the v1 builder runs);
 *   3. consanguinity: partners who share an ancestor that exists in the
 *      graph are consanguineous, 'known_supported', with the degree the
 *      drawing shows (kinship.js; non-negotiable rule 4); a union declared
 *      consanguineous without shared ancestors is 'reported_unresolved'; its
 *      relationshipBackground follows (same rule as builder stage 10b);
 *   4. the condition key (legend) follows the people's conditions
 *      (conditionKey.js);
 *   5. twins / multiple births stay valid and side by side (multiples.js).
 *
 * Mutates the (already cloned) graph in place and returns it.
 */
import { computeGenerations } from '../utils/graphTraversal';
import { indexGraph, displayParentage } from './model';
import { kinshipOf } from './kinship';
import { deriveConditionKey } from './conditionKey';
import { normalizeMultiples } from './multiples';

// declared degrees richer than a partly drawn structure
const KEEP_DECLARED = new Set(['other', 'multiple_relationship', 'double_first_cousin']);

export function finalizeGraph(graph, { anchorId = 'proband' } = {}) {
  const idx0 = indexGraph(graph);

  for (const rel of graph.parentChildRelationships) {
    if (rel.birthOrderExplicit || rel.orderPolicy !== 'byAge') continue;
    const kids = rel.children.map((id) => idx0.byId.get(id)).filter(Boolean);
    if (kids.length < 2) continue;
    rel.children = ageOrder(kids);
  }
  // twins / multiple births stand together whatever the order rule did
  normalizeMultiples(graph);

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

const ageOf = (p) => { const a = parseInt(p.age, 10); return Number.isFinite(a) ? a : null; };

/**
 * Step 1: liveborn siblings with a known age stand oldest → youngest; they
 * are sorted among the places they already hold, so a sibling whose age is
 * not known yet stays where the clinician drew them (entering the youngest
 * child's age first does not move that child to the front). Pregnancy
 * losses and stillbirths stay where they are: their place is the order of
 * the pregnancies, which the clinician sets with "Doğum sırası" — they are
 * never sent to the end (clinician decision 2026-10-25).
 */
export function ageOrder(kids) {
  const isLive = (k) => !k.pregnancyLoss && !k.stillbirth;
  const aged = kids.filter((k) => isLive(k) && ageOf(k) !== null);
  const sorted = [...aged].sort((a, b) => ageOf(b) - ageOf(a)); // stable: equal ages keep their order
  let n = 0;
  return kids.map((k) => (isLive(k) && ageOf(k) !== null ? sorted[n++] : k)).map((k) => k.id);
}

/**
 * Step 3: partners who share a drawn ancestor ARE consanguineous, whichever
 * panel drew the shared ancestry, with the degree the drawing shows (a
 * declared degree richer than a partly drawn structure is kept). A union
 * the drawing alone made consanguineous (`consanguinityFromStructure`)
 * loses it again when the shared ancestors are removed; one the clinician
 * declared stays, as reported. Returns the
 * ids of the unions whose consanguinity fields it changed.
 */
export function deriveConsanguinity(graph) {
  const idx = indexGraph(graph);
  const changed = [];
  for (const u of graph.unions) {
    const before = JSON.stringify([u.consanguineous, u.consanguinityDegree, u.consanguinityStatus, u.relationshipBackground]);
    const kin = kinshipOf(graph, u.partners[0], u.partners[1], idx);
    if (kin) {
      // remember when only the drawing made them consanguineous
      if (!u.consanguineous) u.consanguinityFromStructure = true;
      u.consanguineous = true;
      if (!KEEP_DECLARED.has(u.consanguinityDegree)) u.consanguinityDegree = kin.degree;
    } else if (u.consanguinityFromStructure) {
      // the shared ancestors are gone and nobody declared it: no double line
      // (audit 2026-10-25; it used to stay as "reported")
      delete u.consanguinityFromStructure;
      u.consanguineous = false;
      u.consanguinityDegree = null;
      u.consanguinityStatus = 'none';
      u.relationshipBackground = 'not_asked';
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
