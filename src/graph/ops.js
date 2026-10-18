/**
 * ops.js — graph operations on a schema v2 document (pure, atomic).
 *
 * Every operation returns `{ ok: true, doc, created }` with a NEW document,
 * or `{ ok: false, doc, reason }` with the ORIGINAL document untouched and a
 * Turkish reason for the clinician. Operations are atomic: a multi-step
 * change (e.g. "uncle + spouse + two children") is validated once at the
 * end and either applied completely or not at all.
 *
 * Commit pipeline: clone → mutate draft → finalize (birth order,
 * generations, consanguinity — finalize.js) → validate (validate.js);
 * a change that introduces any NEW error is refused.
 *
 * Semantics follow the v1 store actions they replace (usePedigreeStore.js)
 * so behaviour does not change for the clinician; what changes is that the
 * result is stored as graph, not replayed from instructions.
 */
import { cloneGraph, indexGraph, makePerson, SOCIAL_LINK_KINDS } from './model';
import { allocateEditNumber, retire } from './ids';
import { finalizeGraph } from './finalize';
import { validateDocument, errorsOf } from './validate';
import {
  computeDeletionPlanFor, computeUnionCreationPlan, computeSiblingCreationPlan,
  computeAddParentsPlan, computeAddSiblingPlan,
} from './plans';
import { reconcileOrder, moveChildInOrder } from '../utils/childOrdering';

const issueKey = (i) => `${i.code}|${[...(i.ids || [])].sort().join(',')}`;

/** Thrown inside a mutation to refuse the whole operation. */
export class Blocked extends Error {}
export const block = (reason) => { throw new Blocked(reason); };

/**
 * Run `mutate(draft)` on a copy of `doc`. `mutate` may return extra result
 * fields (e.g. `{ created: { spouseId } }`) or call `block(reason)`.
 */
export function commit(doc, mutate) {
  const before = new Set(errorsOf(validateDocument(doc)).map(issueKey));
  const draft = {
    ...doc,
    graph: cloneGraph(doc.graph),
    ids: { counters: { ...(doc.ids?.counters || {}) }, retired: [...(doc.ids?.retired || [])] },
  };
  let extra;
  try {
    extra = mutate(draft) || {};
  } catch (e) {
    if (e instanceof Blocked) return { ok: false, doc, reason: e.message };
    throw e;
  }
  finalizeGraph(draft.graph, { anchorId: draft.wizardAnchorId });
  // An operation that changed nothing returns the ORIGINAL document, so
  // callers see a no-op (no undo step, no autosave, same object identity).
  const sameAs = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  if (sameAs(draft.graph, cloneGraph(doc.graph)) && sameAs(draft.ids, { counters: { ...(doc.ids?.counters || {}) }, retired: [...(doc.ids?.retired || [])] })
      && sameAs(draft.wizardMeta ?? null, doc.wizardMeta ?? null)) {
    return { ok: true, doc, created: {}, ...extra };
  }
  const introduced = errorsOf(validateDocument(draft)).filter((i) => !before.has(issueKey(i)));
  if (introduced.length) {
    return { ok: false, doc, reason: `İşlem grafiği tutarsız hâle getireceği için uygulanmadı: ${introduced[0].message}`, issues: introduced };
  }
  return { ok: true, doc: draft, created: {}, ...extra };
}

// ── draft primitives (used inside commit; never on a stored document) ──

function assertFreshId(draft, id) {
  const taken = draft.graph.individuals.some((i) => i.id === id) || draft.graph.unions.some((u) => u.id === id);
  if (taken || draft.ids.retired.includes(id)) block(`Kimlik zaten kullanılmış: ${id}`);
}

export function draftAddPerson(draft, props) {
  assertFreshId(draft, props.id);
  const person = makePerson(props);
  draft.graph.individuals.push(person);
  return person;
}

export function draftAddUnion(draft, id, a, b, fields = {}) {
  assertFreshId(draft, id);
  const union = {
    id, partners: [a, b],
    consanguineous: false, consanguinityDegree: null, consanguinityStatus: 'none',
    status: 'together', relationshipBackground: 'not_asked',
    ...fields,
  };
  draft.graph.unions.push(union);
  return union;
}

/** Attach `childId` to union `unionId` (biological). Appends to the group. */
export function draftAddChild(draft, unionId, childId, { orderPolicy = 'byAge' } = {}) {
  const idx = indexGraph(draft.graph);
  const existing = idx.bioParentUnion.get(childId);
  if (existing && existing !== unionId) block('Bu kişinin zaten bir biyolojik ebeveyn birliği var; ikinci bir biyolojik ebeveyn birliği eklenemez.');
  if (existing === unionId) return;
  let rel = idx.pcrByUnion.get(unionId);
  if (!rel) {
    rel = { unionId, children: [], orderPolicy };
    draft.graph.parentChildRelationships.push(rel);
  }
  rel.children.push(childId);
}

/**
 * Remove a person. Same clinical rule as v1 (graphDeletion.js, Faz 2a DM-4):
 * children are never removed; a union that still has children and another
 * partner keeps existing with an explicit "unspecified parent" placeholder
 * in the removed partner's slot (its consanguinity claim is dropped); other
 * unions of the person are removed. Removed ids are retired.
 */
export function draftRemovePerson(draft, id) {
  const g = draft.graph;
  const idx = indexGraph(g);
  const person = idx.byId.get(id);
  if (!person) block('Birey grafikte bulunamadı.');
  const removedIds = [id];
  const removedUnions = new Set();

  const orphanPlaceholders = [];
  for (const uid of idx.unionsOf.get(id) || []) {
    const u = idx.unionById.get(uid);
    const other = u.partners.find((p) => p !== id);
    const kids = idx.childrenOf(uid);
    // with no real partner left (the other slot is already an "unspecified"
    // placeholder) the union goes, as in v1 when both partners were deleted
    const otherIsPlaceholder = !!idx.byId.get(other)?.placeholder;
    if (!other || kids.length === 0 || otherIsPlaceholder) {
      removedUnions.add(uid);
      if (otherIsPlaceholder && (idx.unionsOf.get(other) || []).length === 1) orphanPlaceholders.push(other);
      continue;
    }
    const placeholderId = `${uid}__unspecified`;
    if (!idx.byId.has(placeholderId)) {
      g.individuals.push(makePerson({
        id: placeholderId, sex: 'unknown', generation: person.generation,
        relation: 'unspecified_parent', label: 'Belirtilmemiş ebeveyn', placeholder: true,
      }));
    }
    u.partners = u.partners.map((p) => (p === id ? placeholderId : p));
    Object.assign(u, { consanguineous: false, consanguinityStatus: 'none', consanguinityDegree: null, relationshipBackground: 'not_asked' });
  }

  removedIds.push(...orphanPlaceholders);
  g.individuals = g.individuals.filter((i) => !removedIds.includes(i.id));
  g.unions = g.unions.filter((u) => !removedUnions.has(u.id));
  g.parentChildRelationships = g.parentChildRelationships
    .filter((r) => !removedUnions.has(r.unionId))
    .map((r) => ({ ...r, children: r.children.filter((c) => !removedIds.includes(c)) }))
    .filter((r) => r.children.length > 0);
  g.socialParentLinks = (g.socialParentLinks || []).filter((l) => !removedIds.includes(l.childId) && !removedUnions.has(l.unionId));
  draft.ids = retire(draft.ids, [...removedIds, ...removedUnions]);
  return { removedIds, removedUnionIds: [...removedUnions] };
}

function graphView(draftOrDoc) {
  return draftOrDoc.graph;
}

function editNumber(draft) {
  const { n, ids } = allocateEditNumber(draft.ids, draft.graph);
  draft.ids = ids;
  return n;
}

function partnerSexConflict(graph, personId, newSex) {
  const byId = new Map(graph.individuals.map((i) => [i.id, i]));
  for (const u of graph.unions) {
    if (!u.partners.includes(personId)) continue;
    const partner = byId.get(u.partners.find((p) => p !== personId));
    if (!partner || partner.placeholder) continue;
    if (newSex === 'unknown') return 'Bu bireyin bir eşi/birlikteliği var; cinsiyet "bilinmiyor" olarak değiştirilemez.';
    if (partner.sex === newSex) return 'Bu cinsiyet değişikliği mevcut bir birlikteliği aynı cinsiyetli yapar; değişiklik uygulanmadı.';
  }
  return null;
}

const PROTECTED_FIELDS = new Set(['id', 'generation', 'proband', 'placeholder']);

// ── operations ──

/** Edit a person's fields (clinical data, label, age, sex …). */
export function updatePerson(doc, id, fields) {
  return commit(doc, (d) => {
    const p = d.graph.individuals.find((i) => i.id === id);
    if (!p) block('Birey grafikte bulunamadı.');
    if (Object.prototype.hasOwnProperty.call(fields, 'sex')) {
      const conflict = partnerSexConflict(d.graph, id, fields.sex);
      if (conflict) block(conflict);
    }
    for (const [k, v] of Object.entries(fields)) {
      if (PROTECTED_FIELDS.has(k)) continue;
      p[k] = v;
    }
  });
}

/** Exactly one proband (or none, an explicit mid-edit state). */
export function setProband(doc, id) {
  return commit(doc, (d) => {
    if (id !== null && !d.graph.individuals.some((i) => i.id === id)) block('Birey grafikte bulunamadı.');
    for (const p of d.graph.individuals) p.proband = p.id === id;
  });
}

/** Add a new partner (spouse) to an existing person. */
export function addPartner(doc, personId, opts = {}) {
  return commit(doc, (d) => {
    const target = d.graph.individuals.find((i) => i.id === personId);
    if (!target) block('Birey grafikte bulunamadı.');
    const sex = opts.sex || 'unknown';
    if (target.sex === 'unknown') block('Eş eklemek için önce bu bireyin cinsiyeti belirtilmeli (birey düzenleme panelinden).');
    if (sex === 'unknown' || sex === target.sex) block('Eş/birliktelik yalnızca kadın ve erkek arasında kurulabilir.');
    let spouseId = opts.spouseId;
    let unionId = opts.unionId;
    if (!spouseId || !unionId) {
      const n = editNumber(d);
      spouseId = spouseId || `de_sp_${n}`;
      unionId = unionId || `U_DE_${n}`;
    }
    draftAddPerson(d, {
      id: spouseId, sex, generation: target.generation,
      relation: opts.relation || 'spouse_direct',
      label: opts.label ?? (sex === 'male' ? 'Es (E)' : 'Es (K)'),
    });
    draftAddUnion(d, unionId, personId, spouseId, { status: opts.status || 'together' });
    return { created: { spouseId, unionId } };
  });
}

/** Make two existing people partners (v1 "make partners"). */
export function linkPartners(doc, a, b, opts = {}) {
  const plan = computeUnionCreationPlan(graphView(doc), a, b);
  const proceed = plan.ok || (plan.requiresConsanguineousFlag && opts.markConsanguineous);
  if (!proceed) return { ok: false, doc, reason: plan.reason };
  return commit(doc, (d) => {
    const unionId = opts.unionId || `U_DE_LINK_${editNumber(d)}`;
    draftAddUnion(d, unionId, a, b, {
      status: opts.status || 'together',
      consanguineous: !!opts.markConsanguineous,
    });
    return { created: { unionId } };
  });
}

/** Add a child to an existing union. */
export function addChild(doc, unionId, opts = {}) {
  return commit(doc, (d) => {
    const union = d.graph.unions.find((u) => u.id === unionId);
    if (!union) block('Birliktelik grafikte bulunamadı.');
    const parent = d.graph.individuals.find((i) => i.id === union.partners[0]);
    const sex = opts.sex || 'unknown';
    const childId = opts.childId || `de_ch_${editNumber(d)}`;
    draftAddPerson(d, {
      id: childId, sex,
      generation: parent ? parent.generation + 1 : 3,
      relation: opts.relation || 'child_direct',
      label: opts.label ?? (sex === 'male' ? 'Cocuk (E)' : sex === 'female' ? 'Cocuk (K)' : 'Cocuk'),
      ...(opts.pregnancyLoss ? { pregnancyLoss: true } : {}),
      ...(opts.stillbirth ? { stillbirth: true, deceased: true } : {}),
    });
    draftAddChild(d, unionId, childId, { orderPolicy: opts.orderPolicy || 'byAge' });
    return { created: { childId } };
  });
}

/** Add a child to a person, creating a spouse + union first if they have none. */
export function addChildToPerson(doc, personId, opts = {}) {
  const idx = indexGraph(doc.graph);
  const existing = (idx.unionsOf.get(personId) || [])[0];
  if (existing) return addChild(doc, existing, opts);
  const target = idx.byId.get(personId);
  if (!target) return { ok: false, doc, reason: 'Birey grafikte bulunamadı.' };
  const spouseSex = target.sex === 'male' ? 'female' : target.sex === 'female' ? 'male' : 'unknown';
  const r1 = addPartner(doc, personId, { sex: spouseSex });
  if (!r1.ok) return r1;
  const r2 = addChild(r1.doc, r1.created.unionId, opts);
  if (!r2.ok) return { ...r2, doc };
  return { ...r2, created: { ...r1.created, ...r2.created } };
}

/** Add mother + father (or one of them with an unspecified co-parent). */
export function addParents(doc, childId, opts = {}) {
  const plan = computeAddParentsPlan(graphView(doc), childId);
  if (!plan.ok) return { ok: false, doc, reason: plan.reason };
  return commit(doc, (d) => {
    const target = d.graph.individuals.find((i) => i.id === childId);
    const n = editNumber(d);
    const parent1Id = `de_par_${n}_1`;
    const parent2Id = `de_par_${n}_2`;
    const unionId = `U_DE_PARENTS_${n}`;
    let s1 = 'female', s2 = 'male', placeholder2 = false;
    if (opts.onlyMother) { s2 = 'unknown'; placeholder2 = true; }
    if (opts.onlyFather) { s1 = 'male'; s2 = 'unknown'; placeholder2 = true; }
    const gen = target.generation - 1;
    draftAddPerson(d, { id: parent1Id, sex: s1, generation: gen, relation: 'added_parent', label: s1 === 'male' ? 'Baba' : 'Anne' });
    draftAddPerson(d, {
      id: parent2Id, sex: s2, generation: gen, relation: 'added_parent',
      label: placeholder2 ? 'Diğer Ebeveyn (belirtilmedi)' : (s2 === 'male' ? 'Baba' : 'Anne'),
    });
    draftAddUnion(d, unionId, parent1Id, parent2Id);
    draftAddChild(d, unionId, childId, { orderPolicy: 'insertion' });
    return { created: { parent1Id, parent2Id, unionId } };
  });
}

/** Add a sibling (a new child of the person's existing parent union). */
export function addSibling(doc, personId, opts = {}) {
  const plan = computeAddSiblingPlan(graphView(doc), personId);
  if (!plan.ok) return { ok: false, doc, reason: plan.reason };
  return addChild(doc, plan.unionId, opts);
}

/** "Make siblings": attach to an existing parent union or create shared parents. */
export function makeSiblings(doc, a, b) {
  const plan = computeSiblingCreationPlan(graphView(doc), a, b);
  if (!plan.ok) return { ok: false, doc, reason: plan.reason };
  if (plan.action === 'noop') return { ok: true, doc, created: {} };
  return commit(doc, (d) => {
    const idx = indexGraph(d.graph);
    const ua = idx.bioParentUnion.get(a), ub = idx.bioParentUnion.get(b);
    if (ua && !ub) { draftAddChild(d, ua, b); return { created: { unionId: ua } }; }
    if (ub && !ua) { draftAddChild(d, ub, a); return { created: { unionId: ub } }; }
    const n = editNumber(d);
    const gen = Math.min(idx.byId.get(a).generation, idx.byId.get(b).generation) - 1;
    draftAddPerson(d, { id: `cc_${n}_f`, sex: 'male', generation: gen, relation: 'cc_parent', label: 'Ortak Baba' });
    draftAddPerson(d, { id: `cc_${n}_m`, sex: 'female', generation: gen, relation: 'cc_parent', label: 'Ortak Anne' });
    draftAddUnion(d, `U_CC_${n}`, `cc_${n}_f`, `cc_${n}_m`);
    draftAddChild(d, `U_CC_${n}`, a, { orderPolicy: 'insertion' });
    draftAddChild(d, `U_CC_${n}`, b);
    return { created: { unionId: `U_CC_${n}` } };
  });
}

/** Remove a person (blocked for the proband and for placeholders). */
export function removePerson(doc, id) {
  const plan = computeDeletionPlanFor(graphView(doc), id);
  if (!plan.ok) return { ok: false, doc, reason: plan.reason };
  return commit(doc, (d) => ({ created: draftRemovePerson(d, id) }));
}

/** Union status (together / separated / divorced / unknown). */
export function setUnionStatus(doc, unionId, status) {
  return commit(doc, (d) => {
    const u = d.graph.unions.find((x) => x.id === unionId);
    if (!u) block('Birliktelik grafikte bulunamadı.');
    u.status = status;
  });
}

const CONSANGUINITY_BACKGROUNDS = new Set(['consanguinity_reported', 'consanguinity_structurally_supported']);

/**
 * Relationship background (relationshipBackground.js). Declaring
 * 'consanguinity_reported' marks the union consanguineous; whether it is
 * drawn as structurally supported is derived from real shared ancestors.
 */
export function setRelationshipBackground(doc, unionId, value) {
  return commit(doc, (d) => {
    const u = d.graph.unions.find((x) => x.id === unionId);
    if (!u) block('Birliktelik grafikte bulunamadı.');
    if (CONSANGUINITY_BACKGROUNDS.has(value)) {
      u.consanguineous = true;
    } else {
      u.consanguineous = false;
      u.consanguinityStatus = 'none';
      u.relationshipBackground = value;
    }
  });
}

/** Legacy boolean consanguinity flag (v1 markUnionConsanguineous). */
export function setUnionConsanguineous(doc, unionId, value, extra = {}) {
  return commit(doc, (d) => {
    const u = d.graph.unions.find((x) => x.id === unionId);
    if (!u) block('Birliktelik grafikte bulunamadı.');
    u.consanguineous = !!value;
    Object.assign(u, extra);
    if (!value) {
      u.consanguinityStatus = 'none';
      if (CONSANGUINITY_BACKGROUNDS.has(u.relationshipBackground)) u.relationshipBackground = 'not_asked';
    }
  });
}

/** Explicit birth order for one sibship (NSGC: oldest → youngest, left → right). */
export function setChildOrder(doc, unionId, order) {
  return commit(doc, (d) => {
    const rel = d.graph.parentChildRelationships.find((r) => r.unionId === unionId);
    if (!rel) block('Bu birlikteliğin çocuğu yok.');
    rel.children = reconcileOrder(order, rel.children);
    rel.birthOrderExplicit = true;
  });
}

export function clearChildOrder(doc, unionId) {
  return commit(doc, (d) => {
    const rel = d.graph.parentChildRelationships.find((r) => r.unionId === unionId);
    if (!rel) return;
    delete rel.birthOrderExplicit;
  });
}

export function moveChild(doc, unionId, childId, direction) {
  const rel = doc.graph.parentChildRelationships.find((r) => r.unionId === unionId);
  if (!rel) return { ok: false, doc, reason: 'Bu birlikteliğin çocuğu yok.' };
  return setChildOrder(doc, unionId, moveChildInOrder([...rel.children], childId, direction));
}

/** Social (non-biological) parenthood: adoptive, foster, step, guardian. */
export function addSocialParentLink(doc, childId, unionId, kind) {
  if (!SOCIAL_LINK_KINDS.includes(kind)) return { ok: false, doc, reason: `Bilinmeyen sosyal ebeveynlik türü: ${kind}` };
  return commit(doc, (d) => {
    if (!d.graph.individuals.some((i) => i.id === childId)) block('Birey grafikte bulunamadı.');
    if (!d.graph.unions.some((u) => u.id === unionId)) block('Birliktelik grafikte bulunamadı.');
    if ((d.graph.socialParentLinks || []).some((l) => l.childId === childId && l.unionId === unionId)) block('Bu sosyal ebeveynlik bağı zaten var.');
    d.graph.socialParentLinks = [...(d.graph.socialParentLinks || []), { childId, unionId, kind }];
  });
}

export function removeSocialParentLink(doc, childId, unionId) {
  return commit(doc, (d) => {
    d.graph.socialParentLinks = (d.graph.socialParentLinks || []).filter((l) => !(l.childId === childId && l.unionId === unionId));
  });
}
