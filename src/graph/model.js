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
import { tk } from '../i18n';

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
// stored as a pregnancy's label (Turkish, like every label the program writes) and shown through `t`
export const PREGNANCY_LABEL = { loss: tk('Düşük'), stillbirth: tk('Ölü doğum'), ongoing: tk('Devam eden gebelik'), termination: tk('Sonlandırma (TOP)'), ectopic: tk('Dış gebelik (ECT)') };
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

/**
 * Sex assigned at birth, written under the symbol when it differs from the
 * gender the symbol shows (NSGC 2022 Box 1 and Fig 1; clinician decision
 * 2026-11-02). Absent = not stated. The symbol itself stays the person's gender.
 */
export const SEX_AT_BIRTH = ['AMAB', 'AFAB', 'UAAB'];
/**
 * The sex a person's gametes follow (NSGC 2022: the symbol shows gender identity; AMAB / AFAB under it
 * when sex assigned at birth differs): sex assigned at birth when written, otherwise the symbol's sex.
 */
/** The partner of a same-sex couple whose own gamete made this child (PCR.ownGamete), or null. */
export function ownGameteOf(graph, childId) {
  const rel = (graph.parentChildRelationships || []).find((r) => r.children.includes(childId));
  return (rel?.ownGamete || []).find((e) => e.childId === childId)?.partnerId || null;
}
export const reproductiveSex = (p) => (!p ? 'unknown' : p.sexAtBirth === 'AMAB' ? 'male' : p.sexAtBirth === 'AFAB' ? 'female' : p.sex);
/**
 * Two partners who cannot have a child together without a donor (clinician decision 2026-11-10, same-sex
 * partners): both male or both female by reproductive sex. 'female' / 'male' — which gamete the couple has —
 * or null.
 */
export function sameReproductiveSex(a, b) {
  if (!a || !b || a.placeholder || b.placeholder) return null;
  const x = reproductiveSex(a);
  return (x === 'male' || x === 'female') && x === reproductiveSex(b) ? x : null;
}
/**
 * A presymptomatic / asymptomatic carrier (NSGC 2022 Fig 2: "no clinical
 * symptoms now, but could later exhibit symptoms", typically dominant): a
 * vertical line through the symbol. Never with "affected" — marking a person
 * affected clears it (ops.updatePerson); clinician decision 2026-11-02.
 */
export const PRESYMPTOMATIC = 'presymptomatic';
/**
 * recordsReviewed: the clinician saw the medical records / test report behind
 * this person's findings ("documented evaluation, records reviewed", NSGC 2022
 * Fig 2): an asterisk at the symbol's lower right, explained in the key;
 * clinician decision 2026-11-03.
 */
export const TESTED_TEXT = tk('test yapıldı');
export const geneticLines = (p) => String((p && p.geneticNote) || '').split('\n').map((s) => s.trim()).filter(Boolean);
/** The note with line `index` replaced by `text` (appended past the end; an empty text removes the line). */
export function withGeneticLine(note, index, text) {
  const lines = geneticLines({ geneticNote: note });
  const line = String(text ?? '').trim();
  if (!line) lines.splice(index, 1);
  else if (index >= lines.length) lines.push(line);
  else lines[index] = line;
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
 * Several people drawn as one symbol (NSGC "multiple individuals"; clinician
 * decisions 2026-11-01): `count` is the number written inside the symbol
 * (2–99) or 'n' when the number is not known. A square holds brothers, a
 * circle sisters, a diamond siblings of mixed or unknown sex. A group
 * carries its number and sex only: no finding, carrier or deceased mark, no
 * partner, children or proband; a person who needs any of these is drawn on
 * their own ("Tek tek ayır").
 */
export const GROUP_MAX = 99;
export const isGroup = (p) => !!p && p.count !== undefined && p.count !== null;
export const validGroupCount = (c) => c === 'n' || (Number.isInteger(c) && c >= 2 && c <= GROUP_MAX);
/** "3", or "n" */
export const groupText = (p) => String(p.count);
/** what a group may not carry */
export const GROUP_FORBIDDEN = ['affected', 'carrier', 'presymptomatic', 'recordsReviewed', 'sexAtBirth', 'deceased', 'geneticTest', 'proband', 'consultand', 'adoptedOut', ...PREGNANCY_FIELDS];

/**
 * Adoption (NSGC; clinician decisions 2026-11-01). The adopted person is
 * drawn in square brackets. Three cases:
 *   'in'       — only an adoptive link (socialParentLinks, kind 'adoptive'):
 *                under the adoptive parents, dashed line of descent;
 *   'out'      — `adoptedOut: true` on a child of drawn biological parents,
 *                the adoptive family not drawn: solid line from the parents;
 *   'relative' — biological parents AND an adoptive link to another drawn
 *                couple (e.g. an aunt and her husband): solid line from the
 *                parents, dashed line from the adoptive couple.
 * At most one adoptive link per person; foster / step / guardian links stay
 * in the model but are not offered in the menus.
 */
export function adoptionOf(graph, id) {
  const p = (graph.individuals || []).find((i) => i.id === id);
  if (!p) return null;
  const adoptive = (graph.socialParentLinks || []).find((l) => l.childId === id && l.kind === 'adoptive');
  const bio = (graph.parentChildRelationships || []).some((r) => r.children.includes(id));
  if (adoptive) return { kind: bio ? 'relative' : 'in', unionId: adoptive.unionId };
  if (p.adoptedOut) return { kind: 'out' };
  return null;
}

/**
 * The consultand (NSGC 2022; clinician decisions 2026-11-01): the person who
 * came for counselling — an arrow without "P" (the proband's arrow carries
 * "P"; one arrow + P when the two are the same person). At most one per
 * pedigree; a pedigree may have a consultand and no proband (carrier
 * screening, prenatal counselling). Not a pregnancy, a placeholder or a group.
 */
export const isConsultand = (p) => !!p && !!p.consultand;
/** whose name, birth date and findings head the drawing: the proband, else the consultand */
/**
 * Assisted reproduction (NSGC 2022 Figure 5 as corrected in 2025, Steinhaus
 * French et al., J Genet Couns 34:e2020; clinician decisions 2026-11-01).
 * `graph.reproductiveLinks`: [{ childId, personId, role }] — the child's
 * drawn parents stay the couple (or the single parent) of its parent union;
 *   'sperm_donor'          — D inside the symbol; the genetic father
 *   'egg_donor'            — D; the genetic mother
 *   'gestational_carrier'  — G; carries the pregnancy, no egg of her own
 *   'surrogate'            — D; gives the egg and carries the pregnancy
 * A carried child stands under the person carrying it. Kinship and F follow
 * the genetic parents (indexGraph.geneticParents). For two partners of the same reproductive sex the
 * ParentChildRelationship's `ownGamete: [{ childId, partnerId }]` names the partner whose own egg (two
 * women) or sperm (two men) made the child (clinician 2026-11-10); none named: that parent is unknown.
 * A donor or carrier the
 * clinician adds here (relation 'art_donor') has no parents or partner of
 * their own: family history goes in notes and findings.
 */
export const REPRO_ROLES = ['sperm_donor', 'egg_donor', 'gestational_carrier', 'surrogate'];
export const EGG_SOURCE = ['egg_donor', 'surrogate'];
export const CARRIER_ROLES = ['gestational_carrier', 'surrogate'];
export const REPRO_LABEL = { sperm_donor: tk('Sperm donörü'), egg_donor: tk('Yumurta donörü'), gestational_carrier: tk('Gestasyonel taşıyıcı'), surrogate: tk('Taşıyıcı anne') };
export const ART_DONOR_RELATION = 'art_donor';
/** the letter inside a person's symbol: 'G' for a gestational carrier, 'D' for a donor or surrogate */
export function reproMarkOf(graph, id) {
  const roles = (graph.reproductiveLinks || []).filter((l) => l.personId === id).map((l) => l.role);
  if (!roles.length) return null;
  return roles.every((r) => r === 'gestational_carrier') ? 'G' : 'D';
}
/** who carries the child, when not its own mother: the gestational carrier or surrogate link */
export const carrierLinkOf = (graph, childId) => (graph.reproductiveLinks || []).find((l) => l.childId === childId && CARRIER_ROLES.includes(l.role)) || null;

export const subjectOf = (individuals) => (individuals || []).find((i) => i.proband) || (individuals || []).find((i) => i.consultand) || null;

/**
 * Fields a clinician enters about a person. A person with any of these set
 * must never be removed as a side effect (e.g. lowering a wizard count).
 */
export const CLINICAL_FIELDS = [
  'age', 'displayLabel', 'affected', 'carrier', 'notes', 'condition',
  'ageAtDeath', 'causeOfDeath', 'conditions', 'geneticTest', 'geneticNote', 'birthDate',
  'presymptomatic', 'recordsReviewed', 'sexAtBirth', 'lmp',
];

export function makePerson(props) {
  return { ...PERSON_DEFAULTS, ...props };
}

export function emptyGraph() {
  return { individuals: [], unions: [], parentChildRelationships: [], socialParentLinks: [], reproductiveLinks: [], conditionKey: [] };
}

/** Deep copy (plain JSON data only). */
export function cloneGraph(graph) {
  return JSON.parse(JSON.stringify({
    individuals: graph.individuals || [],
    unions: graph.unions || [],
    parentChildRelationships: graph.parentChildRelationships || [],
    socialParentLinks: graph.socialParentLinks || [],
    reproductiveLinks: graph.reproductiveLinks || [],
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
  // the genetic parents (assisted reproduction, reproductiveLinks): the
  // drawn couple, a sperm donor in the father's place, an egg donor or a
  // surrogate in the mother's (father and mother by reproductive sex); null
  // for a person without drawn parents; a parent unknown is null in the pair
  const reproByChild = new Map();
  for (const l of graph.reproductiveLinks || []) {
    if (!reproByChild.has(l.childId)) reproByChild.set(l.childId, []);
    reproByChild.get(l.childId).push(l);
  }
  const geneticParents = (id) => {
    const uid = bioParentUnion.get(id);
    const links = reproByChild.get(id) || [];
    if (!uid) return null;
    const partners = unionById.get(uid)?.partners || [];
    const [a, b] = partners.map((p) => byId.get(p));
    const sperm = links.find((l) => l.role === 'sperm_donor');
    const egg = links.find((l) => EGG_SOURCE.includes(l.role));
    // two partners of the same reproductive sex: the donor gives the other gamete, and the partner whose
    // own gamete made the child is the PCR's ownGamete (clinician 2026-11-10); not chosen: unknown (null),
    // and kinship and F do not go through either partner
    const both = sameReproductiveSex(a, b);
    if (both) {
      const own = (pcrByUnion.get(uid)?.ownGamete || []).find((e) => e.childId === id)?.partnerId || null;
      return both === 'female'
        ? [sperm ? sperm.personId : null, egg ? egg.personId : own]
        : [sperm ? sperm.personId : own, egg ? egg.personId : null];
    }
    let father = [a, b].find((p) => p && reproductiveSex(p) === 'male')?.id;
    let mother = [a, b].find((p) => p && reproductiveSex(p) === 'female')?.id;
    if (!father) father = partners.find((p) => p !== mother);
    if (!mother) mother = partners.find((p) => p !== father);
    return [sperm ? sperm.personId : father, egg ? egg.personId : mother];
  };
  return { byId, unionById, pcrByUnion, bioParentUnion, unionsOf, childrenOf, partnerOf, geneticParents, reproByChild };
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
  // a child drawn under social parents stands at its own place among the siblings (`slot`, its
  // index in the drawn sibship, set by moving it: ops.moveChild); without one, after them
  const drawn = [];
  for (const l of links) {
    if (bio.has(l.childId) || socialChildren.has(l.childId)) continue;
    socialChildren.set(l.childId, l.kind);
    drawn.push({ l, slot: Number.isInteger(l.slot) && l.slot >= 0 ? l.slot : Infinity, k: drawn.length });
  }
  drawn.sort((p, q) => (p.slot - q.slot) || (p.k - q.k));
  for (const { l, slot } of drawn) {
    let rel = pcrs.find((r) => r.unionId === l.unionId);
    if (!rel) { rel = { unionId: l.unionId, children: [] }; pcrs.push(rel); }
    let at = Math.min(slot, rel.children.length);
    // never between two twins of one birth: they stand side by side
    const twinOf = (c) => (rel.multiples || []).find((m) => m.children.includes(c));
    while (at > 0 && at < rel.children.length && twinOf(rel.children[at]) && twinOf(rel.children[at]) === twinOf(rel.children[at - 1])) at++;
    rel.children.splice(at, 0, l.childId);
  }
  return { graph: { ...graph, parentChildRelationships: pcrs }, socialChildren };
}

/**
 * The labels the program writes on people (wizard, builder, operations),
 * stored in Turkish whatever the screen's language and shown through
 * i18n `shownLabel` ("Dayı 2" → "Maternal uncle 2").
 */
export const DEFAULT_LABELS = [
  tk('Anne'), tk('Baba'), tk('Proband'), tk('Erkek Kardeş'), tk('Kız Kardeş'), tk('Kardeş'), tk('Düşük'), tk('Ölü Doğum'),
  tk('Belirtilmemiş ebeveyn'), tk('İkiz'), tk('Ortak Baba'), tk('Ortak Anne'), tk('Dede'), tk('Dede (Anne)'), tk('Dede (Baba)'),
  tk('Anneanne'), tk('Babaanne'), tk('Büyük Dede'), tk('Büyük Anne'), tk('B.Dede'), tk('B.Anne'), tk('Ata Dede'), tk('Ata Anne'),
  tk('Dayı'), tk('Teyze'), tk('Amca'), tk('Hala'), tk('B.Dayı'), tk('B.Teyze'), tk('B.Amca'), tk('B.Hala'), tk('Anne Eşi'), tk('Baba Eşi'), tk('Diğer Ebeveyn (belirtilmedi)'),
  tk('Cocuk'), tk('Cocuk (E)'), tk('Cocuk (K)'),
];
