/**
 * model.js — schema v2 constants and small pure helpers over the pedigree
 * graph (docs/PEDITREE_DATA_MODEL_V2.md).
 *
 * The graph is the single source of truth:
 *   individuals               — every clinical field lives on the person
 *   unions                    — exactly two partners
 *   parentChildRelationships  — BIOLOGICAL parenthood, ≤ 1 per child
 *   socialParentLinks         — social parenthood (adoptive, foster, …), any number
 *   conditionKey              — the legend: [{ id, label }], derived from the
 *                               people's conditions (conditionKey.js)
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
 * Pregnancy outcomes (NSGC; clinician decision 2026-10-25), distinct types
 * (non-negotiable rule 5): spontaneous loss (SAB), stillbirth (SB), ongoing
 * pregnancy (P), termination (TOP), ectopic pregnancy (ECT). None is a born
 * person: no partners, children or parents of their own, no age line.
 * Losses, terminations and ectopics are small triangles; a stillbirth and an
 * ongoing pregnancy are drawn at full size (by sex). `gestationWeeks` is the
 * week, written below the symbol.
 */
export const PREGNANCY_FIELDS = ['pregnancyLoss', 'stillbirth', 'ongoingPregnancy', 'termination', 'ectopic'];
export const PREGNANCY_KINDS = { loss: 'pregnancyLoss', stillbirth: 'stillbirth', ongoing: 'ongoingPregnancy', termination: 'termination', ectopic: 'ectopic' };
export const PREGNANCY_LABEL = { loss: 'Düşük', stillbirth: 'Ölü doğum', ongoing: 'Devam eden gebelik', termination: 'Sonlandırma (TOP)', ectopic: 'Dış gebelik (ECT)' };
export const isPregnancy = (p) => !!p && PREGNANCY_FIELDS.some((f) => p[f]);
export const pregnancyKind = (p) => (!p ? null : p.ongoingPregnancy ? 'ongoing' : p.stillbirth ? 'stillbirth'
  : p.termination ? 'termination' : p.ectopic ? 'ectopic' : p.pregnancyLoss ? 'loss' : null);
/** Drawn as a small triangle (NSGC: SAB, TOP, ECT). */
export const isSmallSymbol = (p) => ['loss', 'termination', 'ectopic'].includes(pregnancyKind(p));

// Genetic testing (clinician decision 2026-10-27): geneticTest 'tested' = "+"
// (a test was done), absent = "−" (none); geneticNote holds the clinician's
// own lines, one per variant or result ("FBN1 c.1585C>T het", "sonuç
// bekleniyor" …), drawn one under another below the symbol with no "E"
// prefix (NSGC 2022 §4.2). A test with no line written shows TESTED_TEXT.
export const GENETIC_TESTED = 'tested';
export const TESTED_TEXT = 'test yapıldı';
export const geneticLines = (p) => String((p && p.geneticNote) || '').split('\n').map((s) => s.trim()).filter(Boolean);
/** The note with line `index` replaced by `text` (appended past the end; an empty text removes the line). */
export function withGeneticLine(note, index, text) {
  const lines = geneticLines({ geneticNote: note });
  const t = String(text ?? '').trim();
  if (!t) lines.splice(index, 1);
  else if (index >= lines.length) lines.push(t);
  else lines[index] = t;
  return lines.join('\n');
}
// results stored before 2026-10-27 (E+ / E− / E VUS) become the first line,
// so nothing the clinician entered is lost
const OLD_RESULT = { positive: 'pozitif', negative: 'negatif', vus: 'VUS' };
/** Bring a person's genetic test fields to the current form (in place). */
export function normalizeGenetics(p) {
  if (OLD_RESULT[p.geneticTest]) {
    p.geneticNote = [OLD_RESULT[p.geneticTest], ...geneticLines(p)].join('\n');
    p.geneticTest = GENETIC_TESTED;
  }
  if (p.geneticNote !== undefined) {
    const note = geneticLines(p).join('\n');
    if (note) p.geneticNote = note; else delete p.geneticNote;
  }
  // a written result means a test was done
  if (p.geneticNote && !p.geneticTest) p.geneticTest = GENETIC_TESTED;
}

/**
 * Fields a clinician enters about a person. A person with any of these set
 * must never be removed as a side effect (e.g. lowering a wizard count).
 */
export const CLINICAL_FIELDS = [
  'age', 'displayLabel', 'affected', 'carrier', 'notes', 'condition',
  'ageAtDeath', 'causeOfDeath', 'conditions', 'geneticTest', 'geneticNote', 'birthDate',
];

export function makePerson(props) {
  return { ...PERSON_DEFAULTS, ...props };
}

export function emptyGraph() {
  return { individuals: [], unions: [], parentChildRelationships: [], socialParentLinks: [], conditionKey: [] };
}

/** Deep copy (plain JSON data only). */
export function cloneGraph(graph) {
  return JSON.parse(JSON.stringify({
    individuals: graph.individuals || [],
    unions: graph.unions || [],
    parentChildRelationships: graph.parentChildRelationships || [],
    socialParentLinks: graph.socialParentLinks || [],
    conditionKey: graph.conditionKey || [],
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
