/**
 * wizardAdapter.js — the wizard as an input adapter over the graph (schema v2).
 *
 * The wizard no longer owns data. Its counts and fields are DERIVED from the
 * graph relative to the wizard anchor (the proband slot): parents = the
 * anchor's biological parents, siblings = their other children, maternal
 * relatives = the mother's siblings, and so on. Changing a wizard control
 * runs one atomic graph operation (ops.commit) — the same graph the person
 * editor changes, so the two panels can no longer disagree (DM-6/UX-1).
 *
 * Ids of people the wizard creates keep the v1 symbolic style (`sib_m_2`,
 * `mat_uncle_1_cf_0`, `U_MAT_UNCLE_1`) with suffixes from the permanent
 * allocator — never reused. Lowering a count removes only an UNTOUCHED
 * person (no clinical data, no relations beyond what the wizard created);
 * otherwise the operation is refused and the clinician removes the person
 * explicitly (with the deletion preview). Clinical data never silently
 * disappears and never re-attaches to someone else.
 */
import { commit, block, draftAddPerson, draftAddUnion, draftAddChild, draftRemovePerson } from './ops';
import { indexGraph, hasClinicalData } from './model';
import { allocateId } from './ids';
import { computeDeletionPlanFor } from './plans';

// ── id helpers ──

function freeId(d, base) {
  const taken = (id) => d.graph.individuals.some((i) => i.id === id) || d.graph.unions.some((u) => u.id === id) || d.ids.retired.includes(id);
  if (!taken(base)) return base;
  for (let k = 2; ; k++) if (!taken(`${base}_${k}`)) return `${base}_${k}`;
}

function alloc(d, prefix, suffix = '') {
  const r = allocateId(d.ids, d.graph, prefix, suffix);
  d.ids = r.ids;
  return r;
}

// ── roles ──

const isReal = (idx, id) => !!id && idx.byId.has(id) && !idx.byId.get(id).placeholder;

export function rolesOf(graph, anchorId) {
  const idx = indexGraph(graph);
  const anchor = idx.byId.has(anchorId) ? anchorId : null;
  const parentsUnion = anchor ? idx.bioParentUnion.get(anchor) || null : null;
  const partnerBySex = (uid, sex) => {
    if (!uid) return null;
    const id = (idx.unionById.get(uid)?.partners || []).find((p) => idx.byId.get(p)?.sex === sex);
    return isReal(idx, id) ? id : null;
  };
  const mother = partnerBySex(parentsUnion, 'female');
  const father = partnerBySex(parentsUnion, 'male');
  const matGP = mother ? idx.bioParentUnion.get(mother) || null : null;
  const patGP = father ? idx.bioParentUnion.get(father) || null : null;
  return {
    idx, anchor, parentsUnion, mother, father, matGP, patGP,
    mat_gf: partnerBySex(matGP, 'male'), mat_gm: partnerBySex(matGP, 'female'),
    pat_gf: partnerBySex(patGP, 'male'), pat_gm: partnerBySex(patGP, 'female'),
  };
}

const siblingCategory = (p) => {
  if (p.pregnancyLoss) return 'pregnancyLoss';
  if (p.stillbirth) return 'deceased';
  return p.sex === 'male' || p.sex === 'female' ? p.sex : 'unknown';
};

function childCounts(idx, uid) {
  const out = { male: 0, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 };
  for (const id of uid ? idx.childrenOf(uid) : []) {
    const p = idx.byId.get(id);
    if (!p) continue;
    if (p.pregnancyLoss) out.pregnancyLoss++;
    else if (p.stillbirth) out.stillbirth++;
    else out[p.sex === 'male' || p.sex === 'female' ? p.sex : 'unknown']++;
  }
  return out;
}

const firstUnionOf = (idx, id) => (idx.unionsOf.get(id) || []).find((uid) => isReal(idx, idx.partnerOf(uid, id))) || null;

/** Siblings of `personId` (other children of their biological parent union). */
function siblingsOf(idx, personId) {
  const uid = personId ? idx.bioParentUnion.get(personId) : null;
  return uid ? idx.childrenOf(uid).filter((c) => c !== personId && isReal(idx, c)) : [];
}

// ── view ──

const SIDE = {
  maternalRelatives: { base: 'mother', sideKey: 'mat', union: 'MAT' },
  paternalRelatives: { base: 'father', sideKey: 'pat', union: 'PAT' },
  maternalGPRelatives: { base: 'mat_gf', sideKey: 'gp_mat', union: 'GP_MAT' },
  paternalGPRelatives: { base: 'pat_gf', sideKey: 'gp_pat', union: 'GP_PAT' },
};

function relativesView(r, side) {
  const { idx } = r;
  const baseId = r[SIDE[side].base];
  const out = { uncles: [], aunts: [] };
  for (const id of siblingsOf(idx, baseId)) {
    const p = idx.byId.get(id);
    if (p.pregnancyLoss || p.stillbirth || (p.sex !== 'male' && p.sex !== 'female')) continue;
    const unionId = firstUnionOf(idx, id);
    (p.sex === 'male' ? out.uncles : out.aunts).push({
      id, personId: id, unionId,
      children: childCounts(idx, unionId),
      childIds: unionId ? [...idx.childrenOf(unionId)] : [],
    });
  }
  return out;
}

/**
 * The wizard's view of the graph, in the shape the v1 wizard panel used
 * (counts, lists, flags) plus the real ids behind every entry.
 */
export function deriveWizardView(doc, ui = {}) {
  const r = rolesOf(doc.graph, doc.wizardAnchorId);
  const { idx } = r;
  const p = (id) => (id ? idx.byId.get(id) : undefined);
  const anchor = p(r.anchor) || {};
  const pu = r.parentsUnion ? idx.unionById.get(r.parentsUnion) : null;

  const siblings = { male: [], female: [], unknown: [], pregnancyLoss: 0, deceased: 0 };
  for (const id of r.parentsUnion ? idx.childrenOf(r.parentsUnion) : []) {
    if (id === r.anchor || !isReal(idx, id)) continue;
    const c = siblingCategory(p(id));
    if (c === 'pregnancyLoss' || c === 'deceased') siblings[c]++;
    else siblings[c].push({ id, age: p(id).age || '' });
  }

  const otherUnions = (personId) => (personId ? (idx.unionsOf.get(personId) || []) : [])
    .filter((uid) => uid !== r.parentsUnion)
    .map((uid) => ({
      id: uid, unionId: uid, spouseId: idx.partnerOf(uid, personId),
      status: idx.unionById.get(uid).status || 'together',
      children: childCounts(idx, uid),
      childIds: [...idx.childrenOf(uid)],
    }));

  const meta = doc.wizardMeta?.parentsConsanguinity;
  const gen4 = [];
  const sibship = [r.anchor, ...(r.parentsUnion ? idx.childrenOf(r.parentsUnion) : [])]
    .filter((id, i, a) => id && a.indexOf(id) === i && isReal(idx, id) && !p(id).pregnancyLoss && !p(id).stillbirth);
  for (const id of sibship) {
    const unionId = firstUnionOf(idx, id);
    const kids = unionId ? idx.childrenOf(unionId) : [];
    if (!kids.length) continue;
    const c = childCounts(idx, unionId);
    gen4.push({ id: `g4:${id}`, targetPath: id, unionId, male: c.male, female: c.female, unknown: c.unknown, childIds: [...kids] });
  }
  for (const pending of ui.gen4Pending || []) {
    if (!gen4.some((g) => g.targetPath === pending.targetPath)) gen4.push({ ...pending, male: 0, female: 0, unknown: 0, childIds: [], pending: true });
  }

  const customConsanguinity = doc.graph.unions
    .filter((u) => u.partners.every((x) => p(x)?.relation === 'cc_parent'))
    .map((u) => {
      const kids = idx.childrenOf(u.id);
      return { id: u.id, unionId: u.id, person1: kids[0], person2: kids[1], type: 'siblings' };
    });

  return {
    derivedFromGraph: true,
    proband: { id: r.anchor, sex: anchor.sex || 'unknown', age: anchor.age || '' },
    siblings,
    parents: {
      motherId: r.mother, fatherId: r.father, unionId: r.parentsUnion,
      motherExists: !!r.mother, motherAge: p(r.mother)?.age || '',
      fatherExists: !!r.father, fatherAge: p(r.father)?.age || '',
      consanguineous: !!pu?.consanguineous,
      consanguinityDegree: pu?.consanguineous ? (pu.consanguinityDegree || 'unknown') : 'yok',
      consanguinityPath: pu?.consanguineous ? (meta?.path || 'unknown') : 'unknown',
      relationshipStatus: pu?.status || 'together',
      motherOtherUnions: otherUnions(r.mother),
      fatherOtherUnions: otherUnions(r.father),
    },
    maternalRelatives: relativesView(r, 'maternalRelatives'),
    paternalRelatives: relativesView(r, 'paternalRelatives'),
    maternalGPRelatives: relativesView(r, 'maternalGPRelatives'),
    paternalGPRelatives: relativesView(r, 'paternalGPRelatives'),
    greatGrandparents: Object.fromEntries(['mat_gf', 'mat_gm', 'pat_gf', 'pat_gm'].map((k) => [k, !!(r[k] && idx.bioParentUnion.get(r[k]))])),
    gen4,
    customConsanguinity,
  };
}

// ── draft helpers ──

/** A person who can be removed as a side effect: no clinical data, no relation besides `allowedUnions`. */
function untouched(d, id, { allowedUnions = [], allowParents = true } = {}) {
  const idx = indexGraph(d.graph);
  const p = idx.byId.get(id);
  if (!p || hasClinicalData(p)) return false;
  if ((idx.unionsOf.get(id) || []).some((uid) => !allowedUnions.includes(uid))) return false;
  if (!allowParents && idx.bioParentUnion.has(id)) return false;
  if ((d.graph.socialParentLinks || []).some((l) => l.childId === id)) return false;
  return true;
}

const TOUCHED_REASON = 'Bu kişiye klinik bilgi ya da yeni bir ilişki girilmiş; sayıyı azaltmak bunu sessizce silerdi. Kişiyi seçip "Seçili Bireyi Sil" ile kaldırın.';

function removeUntouched(d, id, opts) {
  if (!untouched(d, id, opts)) block(TOUCHED_REASON);
  const plan = computeDeletionPlanFor(d.graph, id);
  if (!plan.ok) block(plan.reason);
  draftRemovePerson(d, id);
}

/** Remove a couple whose union lost its last child, when the partner was wizard-created and is untouched. */
function dropEmptyAutoSpouse(d, unionId, personId, autoRelations) {
  const idx = indexGraph(d.graph);
  if (!idx.unionById.has(unionId) || idx.childrenOf(unionId).length) return;
  const spouse = idx.partnerOf(unionId, personId);
  const sp = idx.byId.get(spouse);
  if (sp && autoRelations.includes(sp.relation) && untouched(d, spouse, { allowedUnions: [unionId], allowParents: false })) {
    draftRemovePerson(d, spouse);
  }
}

/** Remove now-childless, untouched ancestor couples upward from a union. */
function pruneEmptyAncestors(d, unionId) {
  let uid = unionId;
  while (uid) {
    const idx = indexGraph(d.graph);
    const u = idx.unionById.get(uid);
    if (!u || idx.childrenOf(uid).length) return;
    if (!u.partners.every((p) => untouched(d, p, { allowedUnions: [uid] }))) return;
    const up = u.partners.map((p) => idx.bioParentUnion.get(p)).find(Boolean);
    for (const p of [...u.partners]) if (indexGraph(d.graph).byId.has(p)) draftRemovePerson(d, p);
    uid = up;
  }
}

const SIB_KIND = {
  male: { prefix: 'sib_m_', props: { sex: 'male', label: 'Erkek Kardeş' }, rank: 1 },
  female: { prefix: 'sib_f_', props: { sex: 'female', label: 'Kız Kardeş' }, rank: 2 },
  unknown: { prefix: 'sib_u_', props: { sex: 'unknown', label: 'Kardeş' }, rank: 3 },
  pregnancyLoss: { prefix: 'sib_loss_', props: { sex: 'unknown', pregnancyLoss: true, label: 'Düşük' }, rank: 4 },
  deceased: { prefix: 'sib_still_', props: { sex: 'unknown', stillbirth: true, deceased: true, label: 'Ölü Doğum' }, rank: 5 },
};

function rankOf(p, anchorId) {
  if (p.id === anchorId) return 0;
  return SIB_KIND[siblingCategory(p)].rank;
}

/** Insert a new child after the last child of the same or a lower category (v1 group order). */
function insertByRank(d, unionId, childId, anchorId) {
  draftAddChild(d, unionId, childId, { orderPolicy: 'byAge' });
  const idx = indexGraph(d.graph);
  const rel = idx.pcrByUnion.get(unionId);
  if (rel.birthOrderExplicit) return; // explicit order: new child goes last
  const others = rel.children.filter((c) => c !== childId);
  const rank = rankOf(idx.byId.get(childId), anchorId);
  let at = others.length;
  for (let k = others.length - 1; k >= 0; k--) {
    if (rankOf(idx.byId.get(others[k]), anchorId) <= rank) { at = k + 1; break; }
    at = k;
  }
  others.splice(at, 0, childId);
  rel.children = others;
}

function draftAddSibling(d, category) {
  const r = rolesOf(d.graph, d.wizardAnchorId);
  if (!r.parentsUnion) block('Kardeş eklemek için önce probandın anne ve babası olmalı.');
  const kind = SIB_KIND[category];
  if (!kind) block(`Bilinmeyen kardeş türü: ${category}`);
  const { id } = alloc(d, kind.prefix);
  draftAddPerson(d, { id, generation: r.idx.byId.get(r.anchor).generation, relation: 'sibling', ...kind.props });
  insertByRank(d, r.parentsUnion, id, r.anchor);
  return id;
}

function draftRemoveLastSibling(d, category) {
  const r = rolesOf(d.graph, d.wizardAnchorId);
  if (!r.parentsUnion) return null;
  const list = r.idx.childrenOf(r.parentsUnion)
    .filter((id) => id !== r.anchor && isReal(r.idx, id) && siblingCategory(r.idx.byId.get(id)) === category);
  if (!list.length) return null;
  const last = list[list.length - 1];
  removeUntouched(d, last);
  return last;
}

// ── parents ──

function ensureGrandparents(d, parentId, side) {
  const idx = indexGraph(d.graph);
  if (idx.bioParentUnion.has(parentId)) return idx.bioParentUnion.get(parentId);
  const gen = idx.byId.get(parentId).generation - 1;
  const gf = freeId(d, `${side}_gf`), gm = freeId(d, `${side}_gm`);
  const labels = side === 'mat' ? ['Dede (Anne)', 'Anneanne'] : ['Dede (Baba)', 'Babaanne'];
  draftAddPerson(d, { id: gf, sex: 'male', generation: gen, relation: `${side === 'mat' ? 'maternal' : 'paternal'}_gf`, label: labels[0] });
  draftAddPerson(d, { id: gm, sex: 'female', generation: gen, relation: `${side === 'mat' ? 'maternal' : 'paternal'}_gm`, label: labels[1] });
  const uid = freeId(d, side === 'mat' ? 'U_MAT_GP' : 'U_PAT_GP');
  draftAddUnion(d, uid, gf, gm);
  draftAddChild(d, uid, parentId, { orderPolicy: 'insertion' });
  return uid;
}

function draftEnsureParent(d, which) {
  const r = rolesOf(d.graph, d.wizardAnchorId);
  if (r[which]) return r[which];
  const sex = which === 'mother' ? 'female' : 'male';
  const anchor = r.idx.byId.get(r.anchor);
  const id = freeId(d, which);
  draftAddPerson(d, { id, sex, generation: anchor.generation - 1, relation: which, label: which === 'mother' ? 'Anne' : 'Baba' });
  if (r.parentsUnion) {
    const u = d.graph.unions.find((x) => x.id === r.parentsUnion);
    const placeholder = u.partners.find((x) => r.idx.byId.get(x)?.placeholder);
    if (placeholder) {
      u.partners = u.partners.map((x) => (x === placeholder ? id : x));
      d.graph.individuals = d.graph.individuals.filter((i) => i.id !== placeholder);
    } else {
      block('Probandın ebeveyn birliğinde boş yer yok.');
    }
  } else {
    // no parents at all yet: create the parents' union with an unspecified co-parent
    const co = freeId(d, 'U_PARENTS__unspecified');
    draftAddPerson(d, { id: co, sex: 'unknown', generation: anchor.generation - 1, relation: 'unspecified_parent', label: 'Belirtilmemiş ebeveyn', placeholder: true });
    const uid = freeId(d, 'U_PARENTS');
    draftAddUnion(d, uid, sex === 'female' ? id : co, sex === 'female' ? co : id);
    draftAddChild(d, uid, r.anchor, { orderPolicy: 'byAge' });
  }
  ensureGrandparents(d, id, which === 'mother' ? 'mat' : 'pat');
  return id;
}

function draftRemoveParent(d, which) {
  const r = rolesOf(d.graph, d.wizardAnchorId);
  const id = r[which];
  if (!id) return;
  const gp = r.idx.bioParentUnion.get(id);
  const plan = computeDeletionPlanFor(d.graph, id);
  if (!plan.ok) block(plan.reason);
  if (hasClinicalData(r.idx.byId.get(id))) block(TOUCHED_REASON);
  draftRemovePerson(d, id);
  if (gp) pruneEmptyAncestors(d, gp);
}

// ── parents' consanguinity (template structures of builder stage 7) ──

const FIRST_COUSIN_PATHS = {
  mothers_paternal_is_fathers_paternal: ['mat_gf', 'pat_gf'],
  mothers_maternal_is_fathers_maternal: ['mat_gm', 'pat_gm'],
  cross_cousin_1: ['mat_gm', 'pat_gf'],
  cross_cousin_2: ['mat_gf', 'pat_gm'],
};

function makeSiblingPair(d, a, b, ids, gen, record) {
  const idx = indexGraph(d.graph);
  const ua = idx.bioParentUnion.get(a), ub = idx.bioParentUnion.get(b);
  if (ua && ub && ua === ub) return ua;
  if (ua && ub) block('Seçilen akrabalık yolu, bu büyük ebeveynlerin zaten çizili olan farklı ebeveynleriyle çelişiyor; önce o ebeveynleri kaldırın.');
  if (ua || ub) {
    const target = ua || ub, child = ua ? b : a;
    draftAddChild(d, target, child, { orderPolicy: 'insertion' });
    record.attached.push({ childId: child, unionId: target });
    return target;
  }
  const f = freeId(d, ids.f), m = freeId(d, ids.m), u = freeId(d, ids.u);
  draftAddPerson(d, { id: f, sex: 'male', generation: gen, relation: 'ggf', label: ids.labels[0] });
  draftAddPerson(d, { id: m, sex: 'female', generation: gen, relation: 'ggm', label: ids.labels[1] });
  draftAddUnion(d, u, f, m);
  draftAddChild(d, u, a, { orderPolicy: 'insertion' });
  draftAddChild(d, u, b);
  record.createdIds.push(f, m, u);
  return u;
}

function ensureParentsOf(d, personId, ids, gen, record) {
  const idx = indexGraph(d.graph);
  if (idx.bioParentUnion.has(personId)) return idx.bioParentUnion.get(personId);
  const f = freeId(d, ids.f), m = freeId(d, ids.m), u = freeId(d, ids.u);
  draftAddPerson(d, { id: f, sex: 'male', generation: gen, relation: 'ggf', label: ids.labels[0] });
  draftAddPerson(d, { id: m, sex: 'female', generation: gen, relation: 'ggm', label: ids.labels[1] });
  draftAddUnion(d, u, f, m);
  draftAddChild(d, u, personId, { orderPolicy: 'insertion' });
  record.createdIds.push(f, m, u);
  return u;
}

function teardownTemplate(d) {
  const meta = d.wizardMeta?.parentsConsanguinity;
  if (!meta) return;
  for (const { childId, unionId } of meta.attached || []) {
    const rel = d.graph.parentChildRelationships.find((x) => x.unionId === unionId);
    if (rel) rel.children = rel.children.filter((c) => c !== childId);
  }
  d.graph.parentChildRelationships = d.graph.parentChildRelationships.filter((x) => x.children.length);
  const people = (meta.createdIds || []).filter((id) => d.graph.individuals.some((i) => i.id === id));
  for (const id of people) {
    const idx = indexGraph(d.graph);
    const own = idx.unionsOf.get(id) || [];
    const ok = untouched(d, id, { allowedUnions: own.filter((uid) => (meta.createdIds || []).includes(uid)) });
    if (!ok) block('Akrabalık şablonunun oluşturduğu büyük ebeveynlere bilgi girilmiş; şablon değiştirilemez. Önce o kişileri düzenleyin ya da silin.');
  }
  for (const id of people) if (indexGraph(d.graph).byId.has(id)) draftRemovePerson(d, id);
}

function buildTemplate(d, degree, path) {
  const record = { createdIds: [], attached: [] };
  const r = rolesOf(d.graph, d.wizardAnchorId);
  const need = (k) => r[k] || block('Akrabalık yolunu çizmek için anne ve babanın ebeveynleri çizili olmalı.');
  const gpGen = () => r.idx.byId.get(need('mat_gf')).generation - 1;
  if (degree === 'first_cousin' && FIRST_COUSIN_PATHS[path]) {
    const [a, b] = FIRST_COUSIN_PATHS[path].map(need);
    makeSiblingPair(d, a, b, { f: 'ggf', m: 'ggm', u: 'U_GG', labels: ['Büyük Dede', 'Büyük Anne'] }, gpGen(), record);
  } else if (degree === 'double_first_cousin') {
    makeSiblingPair(d, need('mat_gf'), need('pat_gf'), { f: 'ggf_1', m: 'ggm_1', u: 'U_GG_1', labels: ['Büyük Dede 1', 'Büyük Anne 1'] }, gpGen(), record);
    makeSiblingPair(d, need('mat_gm'), need('pat_gm'), { f: 'ggf_2', m: 'ggm_2', u: 'U_GG_2', labels: ['Büyük Dede 2', 'Büyük Anne 2'] }, gpGen(), record);
  } else if (degree === 'second_cousin') {
    const gen = gpGen();
    const um = ensureParentsOf(d, need('mat_gf'), { f: 'ggf_mat', m: 'ggm_mat', u: 'U_GG_MAT', labels: ['B.Dede (Anne)', 'B.Anne (Anne)'] }, gen, record);
    const up = ensureParentsOf(d, need('pat_gf'), { f: 'ggf_pat', m: 'ggm_pat', u: 'U_GG_PAT', labels: ['B.Dede (Baba)', 'B.Anne (Baba)'] }, gen, record);
    const idx = indexGraph(d.graph);
    const fm = idx.unionById.get(um).partners.find((p) => idx.byId.get(p).sex === 'male');
    const fp = idx.unionById.get(up).partners.find((p) => idx.byId.get(p).sex === 'male');
    makeSiblingPair(d, fm, fp, { f: 'gggf', m: 'gggm', u: 'U_GGG', labels: ['Ata Dede', 'Ata Anne'] }, gen - 1, record);
  }
  return record;
}

function draftSetParentsConsanguinity(d, { consanguineous, degree, path }) {
  const r = rolesOf(d.graph, d.wizardAnchorId);
  if (!r.parentsUnion || !r.mother || !r.father) block('Akraba evliliği için anne ve baba çizili olmalı.');
  teardownTemplate(d);
  const u = d.graph.unions.find((x) => x.id === r.parentsUnion);
  if (!consanguineous) {
    Object.assign(u, { consanguineous: false, consanguinityDegree: null, consanguinityStatus: 'none' });
    if (['consanguinity_reported', 'consanguinity_structurally_supported'].includes(u.relationshipBackground)) u.relationshipBackground = 'not_asked';
    d.wizardMeta = { ...(d.wizardMeta || {}), parentsConsanguinity: null };
    return;
  }
  const record = buildTemplate(d, degree, path);
  Object.assign(u, { consanguineous: true, consanguinityDegree: degree });
  d.wizardMeta = { ...(d.wizardMeta || {}), parentsConsanguinity: { degree, path, ...record } };
}

// ── relatives (uncles/aunts, great-uncles/aunts) ──

function relativeBaseId(d, side) {
  const r = rolesOf(d.graph, d.wizardAnchorId);
  const base = r[SIDE[side].base];
  if (!base) {
    const what = { mother: 'anne', father: 'baba', mat_gf: 'anne tarafı dede', pat_gf: 'baba tarafı dede' }[SIDE[side].base];
    block(`Bu akrabaları eklemek için önce ${what} çizili olmalı.`);
  }
  return base;
}

function draftAddRelative(d, side, type) {
  const base = relativeBaseId(d, side);
  const isGP = side.endsWith('GPRelatives');
  let parentsUnion = indexGraph(d.graph).bioParentUnion.get(base);
  if (!parentsUnion) {
    if (!isGP) block('Bu akrabaları eklemek için önce büyük ebeveynler çizili olmalı.');
    const sk = SIDE[side].sideKey.replace('gp_', '');
    const gen = indexGraph(d.graph).byId.get(base).generation - 1;
    const label = sk === 'mat' ? 'Anne' : 'Baba';
    const f = freeId(d, `ggp_${sk}_f`), m = freeId(d, `ggp_${sk}_m`), u = freeId(d, `U_GGP_${sk}`);
    draftAddPerson(d, { id: f, sex: 'male', generation: gen, relation: 'ggf', label: `B.Dede (${label})` });
    draftAddPerson(d, { id: m, sex: 'female', generation: gen, relation: 'ggm', label: `B.Anne (${label})` });
    draftAddUnion(d, u, f, m);
    draftAddChild(d, u, base, { orderPolicy: 'insertion' });
    parentsUnion = u;
  }
  const role = type === 'uncles' ? 'uncle' : 'aunt';
  const { id } = alloc(d, `${SIDE[side].sideKey}_${role}_`);
  const sk = SIDE[side].sideKey;
  const LABELS = {
    mat: { uncle: ['dayi', 'Dayı'], aunt: ['teyze', 'Teyze'] },
    pat: { uncle: ['amca', 'Amca'], aunt: ['hala', 'Hala'] },
    gp_mat: { uncle: ['buyuk_dayi', 'B.Dayı'], aunt: ['buyuk_teyze', 'B.Teyze'] },
    gp_pat: { uncle: ['buyuk_dayi', 'B.Amca'], aunt: ['buyuk_teyze', 'B.Hala'] },
  }[sk][role];
  const n = Number(id.match(/(\d+)$/)[1]);
  draftAddPerson(d, {
    id, sex: role === 'uncle' ? 'male' : 'female',
    generation: indexGraph(d.graph).byId.get(base).generation,
    relation: LABELS[0], label: `${LABELS[1]} ${n + 1}`,
  });
  draftAddChild(d, parentsUnion, id, { orderPolicy: 'insertion' });
  return id;
}

function draftRemoveLastRelative(d, side, type, view) {
  const list = view[side][type];
  if (!list.length) return;
  const rel = list[list.length - 1];
  // the relative, their wizard-created spouse and children go together, only if untouched
  const idx = indexGraph(d.graph);
  const unionIds = idx.unionsOf.get(rel.id) || [];
  if (unionIds.length > 1) block(TOUCHED_REASON);
  for (const c of rel.childIds) if (!untouched(d, c)) block(TOUCHED_REASON);
  for (const c of rel.childIds) draftRemovePerson(d, c);
  if (rel.unionId) {
    const spouse = indexGraph(d.graph).partnerOf(rel.unionId, rel.id);
    if (spouse && !untouched(d, spouse, { allowedUnions: [rel.unionId], allowParents: false })) block(TOUCHED_REASON);
    if (spouse) draftRemovePerson(d, spouse);
  }
  removeUntouched(d, rel.id, { allowedUnions: [] });
}

const COUSIN_KIND = {
  male: { suffix: 'cm', props: { sex: 'male' } },
  female: { suffix: 'cf', props: { sex: 'female' } },
  unknown: { suffix: 'cu', props: { sex: 'unknown' } },
  pregnancyLoss: { suffix: 'loss', props: { sex: 'unknown', pregnancyLoss: true, label: 'Düşük' } },
  stillbirth: { suffix: 'still', props: { sex: 'unknown', stillbirth: true, deceased: true, label: 'Ölü Doğum' } },
};
const AUTO_SPOUSE_RELATIONS = ['spouse_dayi', 'spouse_teyze', 'spouse_amca', 'spouse_hala', 'spouse_gp_uncle', 'spouse_gp_aunt', 'spouse_gen4', 'spouse_direct'];

function ensureUnionFor(d, personId, spouseProps, unionBase) {
  const idx = indexGraph(d.graph);
  const existing = firstUnionOf(idx, personId);
  if (existing) return existing;
  const p = idx.byId.get(personId);
  if (p.sex !== 'male' && p.sex !== 'female') block('Çocuk eklemek için önce bu kişinin cinsiyeti belirtilmeli.');
  const spouseId = freeId(d, `${personId}_sp`);
  draftAddPerson(d, { id: spouseId, sex: p.sex === 'male' ? 'female' : 'male', generation: p.generation, ...spouseProps });
  const uid = freeId(d, unionBase);
  draftAddUnion(d, uid, personId, spouseId);
  return uid;
}

function setChildrenCount(d, personId, unionId, sex, count, idPrefix, kinds = COUSIN_KIND, relation = 'kuzen') {
  const idx = indexGraph(d.graph);
  const kind = kinds[sex];
  if (!kind) block(`Bilinmeyen çocuk türü: ${sex}`);
  const current = (unionId ? idx.childrenOf(unionId) : []).filter((c) => {
    const p = idx.byId.get(c);
    if (sex === 'pregnancyLoss') return p.pregnancyLoss;
    if (sex === 'stillbirth') return p.stillbirth;
    return !p.pregnancyLoss && !p.stillbirth && (sex === 'unknown' ? p.sex !== 'male' && p.sex !== 'female' : p.sex === sex);
  });
  const target = Math.max(0, count | 0);
  if (target > current.length) {
    const parent = idx.byId.get(personId);
    for (let k = current.length; k < target; k++) {
      const { id } = alloc(d, `${idPrefix}_${kind.suffix}_`);
      draftAddPerson(d, { id, generation: parent.generation + 1, relation, ...kind.props });
      draftAddChild(d, unionId, id, { orderPolicy: 'byAge' });
    }
  } else {
    for (const c of current.slice(target).reverse()) removeUntouched(d, c);
  }
}

// ── public wizard operations (each one atomic) ──

export const wizardOps = {
  setProbandField(doc, field, value) {
    return commit(doc, (d) => {
      const r = rolesOf(d.graph, d.wizardAnchorId);
      const p = d.graph.individuals.find((i) => i.id === r.anchor);
      if (!p) block('Proband yuvası grafikte yok.');
      if (field === 'sex') {
        for (const uid of r.idx.unionsOf.get(p.id) || []) {
          const partner = r.idx.byId.get(r.idx.partnerOf(uid, p.id));
          if (!partner || partner.placeholder) continue;
          if (value === 'unknown') block('Bu bireyin bir eşi/birlikteliği var; cinsiyet "bilinmiyor" olarak değiştirilemez.');
          if (partner.sex === value) block('Bu cinsiyet değişikliği mevcut bir birlikteliği aynı cinsiyetli yapar; değişiklik uygulanmadı.');
        }
      }
      if (field !== 'sex' && field !== 'age') block(`Bilinmeyen proband alanı: ${field}`);
      p[field] = value;
    });
  },

  setParentsField(doc, field, value) {
    return commit(doc, (d) => {
      const r = rolesOf(d.graph, d.wizardAnchorId);
      const person = (id) => d.graph.individuals.find((i) => i.id === id);
      switch (field) {
        case 'motherAge': if (!r.mother) block('Anne çizili değil.'); person(r.mother).age = value; break;
        case 'fatherAge': if (!r.father) block('Baba çizili değil.'); person(r.father).age = value; break;
        case 'relationshipStatus': {
          if (!r.parentsUnion) block('Anne-baba birlikteliği yok.');
          d.graph.unions.find((u) => u.id === r.parentsUnion).status = value;
          break;
        }
        case 'motherExists': if (value) draftEnsureParent(d, 'mother'); else draftRemoveParent(d, 'mother'); break;
        case 'fatherExists': if (value) draftEnsureParent(d, 'father'); else draftRemoveParent(d, 'father'); break;
        case 'consanguineous':
        case 'consanguinityDegree':
        case 'consanguinityPath': {
          const v = deriveWizardView(d).parents;
          const next = { consanguineous: v.consanguineous, degree: v.consanguinityDegree === 'yok' ? 'unknown' : v.consanguinityDegree, path: v.consanguinityPath };
          if (field === 'consanguineous') next.consanguineous = !!value;
          if (field === 'consanguinityDegree') next.degree = value;
          if (field === 'consanguinityPath') next.path = value;
          if (next.degree !== 'first_cousin') next.path = 'unknown';
          draftSetParentsConsanguinity(d, next);
          break;
        }
        default: block(`Bilinmeyen alan: ${field}`);
      }
    });
  },

  addSibling(doc, category) {
    return commit(doc, (d) => ({ created: { childId: draftAddSibling(d, category) } }));
  },

  removeLastSibling(doc, category) {
    return commit(doc, (d) => ({ created: { removedId: draftRemoveLastSibling(d, category) } }));
  },

  setSiblingCount(doc, type, count) {
    return commit(doc, (d) => {
      const n = () => deriveWizardView(d).siblings[type];
      const len = () => (Array.isArray(n()) ? n().length : n());
      while (len() < count) draftAddSibling(d, type);
      while (len() > count) if (!draftRemoveLastSibling(d, type)) break;
    });
  },

  setSiblingAge(doc, type, index, age) {
    const entry = deriveWizardView(doc).siblings[type]?.[index];
    if (!entry) return { ok: false, doc, reason: 'Kardeş bulunamadı.' };
    return commit(doc, (d) => { d.graph.individuals.find((i) => i.id === entry.id).age = age; });
  },

  addOtherUnion(doc, parentType) {
    return commit(doc, (d) => {
      const r = rolesOf(d.graph, d.wizardAnchorId);
      const parent = r[parentType];
      if (!parent) block(parentType === 'mother' ? 'Anne çizili değil.' : 'Baba çizili değil.');
      const key = parentType === 'mother' ? 'mother_spouse_' : 'father_spouse_';
      const { id, n } = alloc(d, key);
      const p = r.idx.byId.get(parent);
      draftAddPerson(d, {
        id, sex: parentType === 'mother' ? 'male' : 'female', generation: p.generation,
        relation: parentType === 'mother' ? 'spouse_mother' : 'spouse_father',
        label: `${parentType === 'mother' ? 'Anne' : 'Baba'} Eşi ${n + 1}`,
      });
      const uid = freeId(d, `${parentType === 'mother' ? 'U_MOTHER_OTHER' : 'U_FATHER_OTHER'}_${n}`);
      draftAddUnion(d, uid, parent, id);
      return { created: { spouseId: id, unionId: uid } };
    });
  },

  updateOtherUnion(doc, parentType, index, field, value) {
    const v = deriveWizardView(doc).parents[parentType === 'mother' ? 'motherOtherUnions' : 'fatherOtherUnions'][index];
    if (!v) return { ok: false, doc, reason: 'Birliktelik bulunamadı.' };
    return commit(doc, (d) => {
      if (field === 'status') { d.graph.unions.find((u) => u.id === v.unionId).status = value; return; }
      const parent = rolesOf(d.graph, d.wizardAnchorId)[parentType];
      const n = (v.unionId.match(/(\d+)$/) || [])[1] ?? v.unionId;
      setChildrenCount(d, parent, v.unionId, field, value, `hsib_${parentType === 'mother' ? 'mat' : 'pat'}`,
        {
          male: { suffix: `m_${n}`, props: { sex: 'male' } }, female: { suffix: `f_${n}`, props: { sex: 'female' } }, unknown: { suffix: `u_${n}`, props: { sex: 'unknown' } },
          pregnancyLoss: { suffix: `loss_${n}`, props: COUSIN_KIND.pregnancyLoss.props }, stillbirth: { suffix: `still_${n}`, props: COUSIN_KIND.stillbirth.props },
        },
        parentType === 'mother' ? 'half_sibling_maternal' : 'half_sibling_paternal');
    });
  },

  removeOtherUnion(doc, parentType, index) {
    const v = deriveWizardView(doc).parents[parentType === 'mother' ? 'motherOtherUnions' : 'fatherOtherUnions'][index];
    if (!v) return { ok: false, doc, reason: 'Birliktelik bulunamadı.' };
    return commit(doc, (d) => {
      for (const c of v.childIds) if (!untouched(d, c)) block(TOUCHED_REASON);
      for (const c of v.childIds) draftRemovePerson(d, c);
      if (!untouched(d, v.spouseId, { allowedUnions: [v.unionId], allowParents: false })) block(TOUCHED_REASON);
      draftRemovePerson(d, v.spouseId);
    });
  },

  setRelativeCount(doc, side, type, count) {
    return commit(doc, (d) => {
      const len = () => deriveWizardView(d)[side][type].length;
      while (len() < count) draftAddRelative(d, side, type);
      while (len() > count) draftRemoveLastRelative(d, side, type, deriveWizardView(d));
    });
  },

  setRelativeChildren(doc, side, type, index, sex, count) {
    const rel = deriveWizardView(doc)[side]?.[type]?.[index];
    if (!rel) return { ok: false, doc, reason: 'Akraba bulunamadı.' };
    return commit(doc, (d) => {
      const role = type === 'uncles' ? 'UNCLE' : 'AUNT';
      const n = (rel.id.match(/(\d+)$/) || [])[1] ?? '0';
      const spouseRelation = {
        maternalRelatives: { uncles: 'spouse_dayi', aunts: 'spouse_teyze' },
        paternalRelatives: { uncles: 'spouse_amca', aunts: 'spouse_hala' },
        maternalGPRelatives: { uncles: 'spouse_gp_uncle', aunts: 'spouse_gp_aunt' },
        paternalGPRelatives: { uncles: 'spouse_gp_uncle', aunts: 'spouse_gp_aunt' },
      }[side][type];
      let unionId = rel.unionId;
      if (!unionId && count > 0) unionId = ensureUnionFor(d, rel.id, { relation: spouseRelation }, `U_${SIDE[side].union}_${role}_${n}`);
      if (!unionId) return;
      setChildrenCount(d, rel.id, unionId, sex, count, rel.id);
      dropEmptyAutoSpouse(d, unionId, rel.id, AUTO_SPOUSE_RELATIONS);
    });
  },

  setGreatGrandparents(doc, gpKey, value) {
    return commit(doc, (d) => {
      const r = rolesOf(d.graph, d.wizardAnchorId);
      const gp = r[gpKey];
      if (!gp) block('Bu büyük ebeveyn çizili değil.');
      const existing = r.idx.bioParentUnion.get(gp);
      if (value) {
        if (existing) return;
        const labels = { mat_gf: 'Dede (Anne)', mat_gm: 'Anneanne', pat_gf: 'Dede (Baba)', pat_gm: 'Babaanne' }[gpKey];
        ensureParentsOf(d, gp, { f: `gg_${gpKey}_f`, m: `gg_${gpKey}_m`, u: `U_GG_${gpKey.toUpperCase()}`, labels: [`${labels} Baba`, `${labels} Anne`] },
          r.idx.byId.get(gp).generation - 1, { createdIds: [], attached: [] });
        return;
      }
      if (!existing) return;
      if (r.idx.childrenOf(existing).length > 1) block('Bu büyük ebeveynlerin başka çocukları da çizili (ör. büyük dayı/amca); ebeveynler kaldırılamaz.');
      const parents = r.idx.unionById.get(existing).partners;
      for (const p of parents) if (!untouched(d, p, { allowedUnions: [existing] })) block(TOUCHED_REASON);
      for (const p of parents) if (indexGraph(d.graph).byId.has(p)) draftRemovePerson(d, p);
    });
  },

  updateGen4(doc, entry, field, value) {
    return commit(doc, (d) => {
      if (field === 'targetPath') {
        if (entry.childIds?.length) block('Çocukları olan kaydın hedefi değiştirilemez; önce çocukları kaldırın.');
        return { pendingRetarget: value };
      }
      const target = entry.targetPath;
      if (!d.graph.individuals.some((i) => i.id === target)) block('Hedef kişi grafikte yok.');
      let unionId = entry.unionId;
      if (!unionId && value > 0) {
        const { n } = alloc(d, 'gen4_sp_');
        unionId = ensureUnionFor(d, target, { relation: 'spouse_gen4' }, `U_GEN4_${n}`);
      }
      if (!unionId) return;
      const prefix = (() => {
        const kid = indexGraph(d.graph).childrenOf(unionId).find((c) => /^gen4_\d+_/.test(c));
        if (kid) return kid.match(/^(gen4_\d+)_/)[1];
        return alloc(d, 'gen4_').id;
      })();
      setChildrenCount(d, target, unionId, field, value, prefix, COUSIN_KIND, 'gen4_child');
      dropEmptyAutoSpouse(d, unionId, target, AUTO_SPOUSE_RELATIONS);
    });
  },

  removeGen4(doc, entry) {
    return commit(doc, (d) => {
      for (const c of entry.childIds || []) if (!untouched(d, c)) block(TOUCHED_REASON);
      for (const c of entry.childIds || []) draftRemovePerson(d, c);
      if (entry.unionId) dropEmptyAutoSpouse(d, entry.unionId, entry.targetPath, AUTO_SPOUSE_RELATIONS);
    });
  },

  removeCustomSiblingLink(doc, index) {
    const link = deriveWizardView(doc).customConsanguinity[index];
    if (!link) return { ok: false, doc, reason: 'Bağ bulunamadı.' };
    return commit(doc, (d) => {
      const u = d.graph.unions.find((x) => x.id === link.unionId);
      for (const p of u.partners) if (!untouched(d, p, { allowedUnions: [u.id] })) block(TOUCHED_REASON);
      for (const p of [...u.partners]) if (indexGraph(d.graph).byId.has(p)) draftRemovePerson(d, p);
    });
  },
};
