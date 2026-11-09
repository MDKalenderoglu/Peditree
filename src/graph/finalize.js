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
import { indexGraph, displayParentage, isPregnancy, normalizeGenetics, REPRO_ROLES, CARRIER_ROLES } from './model';
import { kinshipOf } from './kinship';
import { deriveConditionKey } from './conditionKey';
import { normalizeMultiples } from './multiples';
import { ageInDays } from '../utils/age';

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
  shareTwinLinks(graph);
  graph.individuals.forEach(normalizeGenetics);

  const anchor = idx0.byId.has(anchorId)
    ? anchorId
    : (graph.individuals.find((i) => i.proband) || graph.individuals[0] || {}).id;
  // generations follow the drawn parentage (a child with only adoptive
  // parents sits one row below them); the folded copy shares the
  // individual objects, so the computed generations land on the graph
  if (anchor) computeGenerations(displayParentage(graph).graph, anchor, 3);

  deriveConsanguinity(graph);
  deriveConditionKey(graph);
  clearChildlessWithChildren(graph);
  // an adopted-in child's place among its siblings is a whole index, or none
  for (const l of graph.socialParentLinks || []) if ('slot' in l && !(Number.isInteger(l.slot) && l.slot >= 0)) delete l.slot;
  return graph;
}

// compared in days: "3 ay" is younger than "2" (years)
const ageOf = (p) => ageInDays(p.age);

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
  const isLive = (k) => !isPregnancy(k);
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
    // the words on the relationship line belong to "Aynı köy" (ops.setLineNote): none kept unseen
    if (u.lineNote !== undefined && (u.relationshipBackground !== 'same_village_or_same_origin' || typeof u.lineNote !== 'string' || !u.lineNote.trim())) delete u.lineNote;
    if (JSON.stringify([u.consanguineous, u.consanguinityDegree, u.consanguinityStatus, u.relationshipBackground]) !== before) changed.push(u.id);
  }
  return changed;
}

/**
 * "No children" / "infertile" describe a couple without children: once a
 * child (biological or adopted) is added, the mark goes (Codex audit
 * 2026-11-01 — it stayed in the file, hidden, and came back when the child
 * was removed).
 */
export function clearChildlessWithChildren(graph) {
  const withKids = new Set([
    ...graph.parentChildRelationships.filter((r) => r.children.length).map((r) => r.unionId),
    ...(graph.socialParentLinks || []).map((l) => l.unionId),
  ]);
  for (const u of graph.unions) {
    if (u.childless && withKids.has(u.id)) { delete u.childless; delete u.childlessReason; }
  }
  return graph;
}

/**
 * Twins share what one pregnancy shares (validate.js REPRO_TWINS): its
 * carrier, and for identical (MZ) twins the donors too. A link one twin has
 * is given to the co-twins — also when the twins are made after it. Two
 * different donors for identical twins are not merged: validation refuses.
 */
export function shareTwinLinks(graph) {
  const links = graph.reproductiveLinks || [];
  if (!links.length) return graph;
  const has = new Set(links.map((l) => `${l.childId}|${l.personId}|${l.role}`));
  for (const rel of graph.parentChildRelationships) {
    for (const m of rel.multiples || []) {
      const shared = m.zygosity === 'monozygotic' ? REPRO_ROLES : CARRIER_ROLES;
      for (const l of links.filter((x) => m.children.includes(x.childId) && shared.includes(x.role))) {
        for (const c of m.children) {
          const key = `${c}|${l.personId}|${l.role}`;
          if (!has.has(key)) { has.add(key); links.push({ childId: c, personId: l.personId, role: l.role }); }
        }
      }
    }
  }
  graph.reproductiveLinks = links;
  return graph;
}
