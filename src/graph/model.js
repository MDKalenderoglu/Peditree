/**
 * model.js — schema v2 constants and small pure helpers over the pedigree
 * graph (docs/PEDITREE_DATA_MODEL_V2.md).
 *
 * The graph is the single source of truth:
 *   individuals               — every clinical field lives on the person
 *   unions                    — exactly two partners
 *   parentChildRelationships  — BIOLOGICAL parenthood, ≤ 1 per child
 *   socialParentLinks         — social parenthood (adoptive, foster, …), any number
 */

export const SCHEMA_VERSION = 2;

export const SOCIAL_LINK_KINDS = ['adoptive', 'foster', 'step', 'guardian'];

/** Fields every individual carries (builder defaults, unchanged from v1). */
export const PERSON_DEFAULTS = {
  sex: 'unknown',
  age: '',
  generation: 3,
  relation: '',
  label: '',
  displayLabel: '',
  affected: false,
  carrier: false,
  deceased: false,
  proband: false,
  pregnancyLoss: false,
  stillbirth: false,
  notes: '',
};

/**
 * Fields a clinician enters about a person. A person with any of these set
 * must never be removed as a side effect (e.g. lowering a wizard count).
 */
export const CLINICAL_FIELDS = [
  'age', 'displayLabel', 'affected', 'carrier', 'notes', 'condition',
  'ageAtDeath', 'causeOfDeath', 'conditions',
];

export function makePerson(props) {
  return { ...PERSON_DEFAULTS, ...props };
}

export function emptyGraph() {
  return { individuals: [], unions: [], parentChildRelationships: [], socialParentLinks: [] };
}

/** Deep copy (plain JSON data only). */
export function cloneGraph(graph) {
  return JSON.parse(JSON.stringify({
    individuals: graph.individuals || [],
    unions: graph.unions || [],
    parentChildRelationships: graph.parentChildRelationships || [],
    socialParentLinks: graph.socialParentLinks || [],
  }));
}

export function hasClinicalData(person) {
  if (!person) return false;
  return CLINICAL_FIELDS.some((f) => {
    const v = person[f];
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== null && v !== '' && v !== false;
  });
}

/** Lookup structures for one graph snapshot. */
export function indexGraph(graph) {
  const byId = new Map(graph.individuals.map((i) => [i.id, i]));
  const unionById = new Map(graph.unions.map((u) => [u.id, u]));
  const pcrByUnion = new Map(graph.parentChildRelationships.map((r) => [r.unionId, r]));
  const bioParentUnion = new Map();
  for (const r of graph.parentChildRelationships) for (const c of r.children) bioParentUnion.set(c, r.unionId);
  const unionsOf = new Map(graph.individuals.map((i) => [i.id, []]));
  for (const u of graph.unions) for (const p of u.partners || []) if (unionsOf.has(p)) unionsOf.get(p).push(u.id);
  const childrenOf = (uid) => (pcrByUnion.get(uid)?.children || []);
  const partnerOf = (uid, id) => {
    const u = unionById.get(uid);
    return u ? (u.partners[0] === id ? u.partners[1] : u.partners[0]) : undefined;
  };
  return { byId, unionById, pcrByUnion, bioParentUnion, unionsOf, childrenOf, partnerOf };
}

/** All biological ancestors of `id` (individual ids), following PCR links. */
export function ancestorsOf(graph, id, idx = indexGraph(graph)) {
  const out = new Set();
  const stack = [id];
  const seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    const uid = idx.bioParentUnion.get(cur);
    if (!uid) continue;
    for (const p of idx.unionById.get(uid)?.partners || []) {
      if (!out.has(p)) { out.add(p); stack.push(p); }
    }
  }
  return out;
}

/**
 * The parentage used for DRAWING and generation: biological links, plus a
 * social link (adoptive, foster, …) for a child that has no biological
 * parents in the graph — such a child is drawn under its social parents
 * (NSGC: adopted-in child, dashed line of descent). A child with biological
 * parents is drawn under them; its social link is kept in the model and
 * drawn as a second line in Faz 4.
 *
 * Returns the graph with those children folded into parentChildRelationships
 * and `socialChildren`: Map childId → kind.
 */
export function displayParentage(graph) {
  const links = graph.socialParentLinks || [];
  const socialChildren = new Map();
  if (!links.length) return { graph, socialChildren };
  const bio = new Set((graph.parentChildRelationships || []).flatMap((r) => r.children));
  const pcrs = (graph.parentChildRelationships || []).map((r) => ({ ...r, children: [...r.children] }));
  for (const l of links) {
    if (bio.has(l.childId) || socialChildren.has(l.childId)) continue;
    let rel = pcrs.find((r) => r.unionId === l.unionId);
    if (!rel) { rel = { unionId: l.unionId, children: [] }; pcrs.push(rel); }
    rel.children.push(l.childId);
    socialChildren.set(l.childId, l.kind);
  }
  return { graph: { ...graph, parentChildRelationships: pcrs }, socialChildren };
}
