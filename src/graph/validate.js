/**
 * validate.js — structural invariants of a schema v2 document
 * (docs/PEDITREE_DATA_MODEL_V2.md §2.3). Every graph operation runs this
 * before and after the mutation and refuses any change that introduces a
 * new error, so the stored graph can never become structurally invalid
 * through the editor.
 *
 * Issues: { severity: 'error' | 'warning', code, message (Turkish), ids }
 */
import { auditPedigreeGraph } from '../utils/graphIntegrity';
import { SOCIAL_LINK_KINDS, SEX_AT_BIRTH, indexGraph, isGroup, validGroupCount, GROUP_FORBIDDEN, GROUP_MAX, isPregnancy, ancestorsOf, PREGNANCY_FIELDS, REPRO_ROLES, EGG_SOURCE, CARRIER_ROLES, ART_DONOR_RELATION } from './model';

const FLAG_FIELDS = ['affected', 'carrier', 'presymptomatic', 'deceased', 'proband', 'consultand', 'adoptedOut', 'placeholder', ...PREGNANCY_FIELDS];
const FINDING_STATUSES = ['affected', 'carrier', 'unknown'];
import { multiplesWarnings } from './multiples';
import { carrierFindingIssues } from './conditionKey';
import { t } from '../i18n';

export function validateGraphStructure(graph, { retired = [] } = {}) {
  const out = [];
  const err = (code, message, ids = []) => out.push({ severity: 'error', code, message, ids });
  const idx = indexGraph(graph);
  const retiredSet = new Set(retired);

  for (const ind of graph.individuals) {
    if (retiredSet.has(ind.id)) err('RETIRED_ID_REUSED', t('Emekliye ayrılmış kimlik yeniden kullanılmış: {id}', { id: ind.id }), [ind.id]);
  }

  const pairKeys = new Set();
  for (const u of graph.unions) {
    const [a, b] = u.partners || [];
    const key = [a, b].sort().join('|');
    if (a && b && a !== b && pairKeys.has(key)) err('DUPLICATE_PARTNERSHIP', t('Aynı iki kişi için ikinci bir birliktelik var ({id}).', { id: u.id }), [u.id]);
    pairKeys.add(key);
    for (const p of [a, b]) {
      if (p && idx.bioParentUnion.get(p) === u.id) err('CHILD_IS_OWN_PARENT', t('Bir kişi kendi ebeveyn birliğinin partneri olamaz ({p}).', { p }), [p, u.id]);
    }
  }

  // Codex audit 2026-11-01: rules that only the menus enforced
  // — siblings are never partners (CLAUDE.md rule 3), whatever flag is set
  for (const u of graph.unions) {
    const [a, b] = u.partners || [];
    const pa = idx.bioParentUnion.get(a);
    if (pa && pa === idx.bioParentUnion.get(b)) err('SIBLING_PARTNERS', t('Kardeşler eş olamaz.'), [a, b, u.id]);
  }
  // — a pregnancy outcome is never a partner or a parent: the operations
  //   refuse it (ops.js); an older file that has one opens with a warning
  //   (an early version's stress pedigrees do), so nothing is lost
  for (const ind of graph.individuals) {
    if (isPregnancy(ind) && (idx.unionsOf.get(ind.id) || []).length) out.push({ severity: 'warning', code: 'PREGNANCY_PARTNER', message: t('Bir gebelik sonucunun (düşük, ölü doğum, süren gebelik, sonlandırma, dış gebelik) eşi ya da çocuğu çizilmiş; bu kişinin türünü ya da ilişkisini kontrol edin.'), ids: [ind.id] });
  }
  // — clinical fields hold only what they mean
  for (const ind of graph.individuals) {
    if (!['male', 'female', 'unknown'].includes(ind.sex)) err('FIELD_SEX', t('Bir kişinin cinsiyeti anlaşılamadı ("{v0}").', { v0: String(ind.sex) }), [ind.id]);
    const notFlag = FLAG_FIELDS.filter((f) => ind[f] !== undefined && ind[f] !== null && typeof ind[f] !== 'boolean');
    if (notFlag.length) err('FIELD_FLAG', t('Bir kişinin "{v0}" alanı evet / hayır değil.', { v0: notFlag[0] }), [ind.id]);
    if (PREGNANCY_FIELDS.filter((f) => ind[f] === true).length > 1) err('PREGNANCY_KIND_MULTIPLE', t('Bir gebelik sonucu aynı anda iki türde işaretli (ör. hem düşük hem ölü doğum).'), [ind.id]);
    if (ind.sexAtBirth !== undefined && !SEX_AT_BIRTH.includes(ind.sexAtBirth)) err('FIELD_SEX_AT_BIRTH', t('Bir kişinin doğumda atanan cinsiyeti anlaşılamadı ("{v0}").', { v0: String(ind.sexAtBirth) }), [ind.id]);
    if (ind.lmp !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(ind.lmp))) err('FIELD_LMP', t('Bir gebeliğin son adet tarihi anlaşılamadı ("{v0}").', { v0: String(ind.lmp) }), [ind.id]);
    if (ind.presymptomatic && ind.affected) out.push({ severity: 'warning', code: 'PRESYMPTOMATIC_AFFECTED', message: t('Bir kişi hem etkilenmiş hem belirtisiz taşıyıcı olarak işaretli; birini kaldırın.'), ids: [ind.id] });
    if (ind.conditions !== undefined && !Array.isArray(ind.conditions)) err('FIELD_CONDITIONS', t('Bir kişinin bulguları bir liste değil.'), [ind.id]);
    for (const c of Array.isArray(ind.conditions) ? ind.conditions : []) {
      // a finding without a status comes from an older record and is kept as it is
      if (!c || typeof c.label !== 'string' || !c.label.trim() || (c.status !== undefined && !FINDING_STATUSES.includes(c.status))) {
        err('FIELD_FINDING', t('Bir kişinin bulgusu anlaşılamadı ({name}, durum "{status}").', { name: c && typeof c.label === 'string' ? `"${c.label}"` : t('adsız'), status: c && String(c.status) }), [ind.id]);
      }
    }
  }

  // Ancestry cycle: following biological parent links upward must never
  // return to the start (DM-10).
  const state = new Map(); // id -> 1 visiting, 2 done
  const parentsOf = (id) => {
    const uid = idx.bioParentUnion.get(id);
    return uid ? (idx.unionById.get(uid)?.partners || []) : [];
  };
  const visit = (id, path) => {
    state.set(id, 1);
    for (const p of parentsOf(id)) {
      if (state.get(p) === 1) {
        err('ANCESTRY_CYCLE', t('Atalık döngüsü: bir kişi kendi atası olamaz ({v0}).', { v0: [...path, p].join(' → ') }), [id, p]);
        continue;
      }
      if (!state.has(p)) visit(p, [...path, p]);
    }
    state.set(id, 2);
  };
  for (const ind of graph.individuals) if (!state.has(ind.id)) visit(ind.id, [ind.id]);

  // several people in one symbol (model.js isGroup): a number and a sex only
  for (const ind of graph.individuals) {
    if (!isGroup(ind)) continue;
    if (!validGroupCount(ind.count)) err('GROUP_COUNT', t('Sembol içindeki sayı 2 ile {GROUP_MAX} arasında bir tam sayı ya da "n" olmalı ({id}).', { GROUP_MAX, id: ind.id }), [ind.id]);
    if (idx.unionsOf.get(ind.id)?.length) err('GROUP_PARTNER', t('Birden çok kişiyi gösteren sembol eş olamaz; önce "Tek tek ayır" ile kişileri ayırın.'), [ind.id]);
    const marked = GROUP_FORBIDDEN.filter((f) => ind[f]);
    if (marked.length || (ind.conditions || []).length) err('GROUP_CLINICAL', t('Birden çok kişiyi gösteren sembolde bulgu, taşıyıcılık, ölüm, genetik test, proband ya da danışan işareti olamaz; bu kişiyi "Tek tek ayır" ile ayrı çizin.'), [ind.id]);
  }
  // adoption (model.js adoptionOf): one adoptive family; "adopted out" needs drawn parents and no adoptive family
  const adoptive = new Map();
  for (const l of graph.socialParentLinks || []) {
    if (l.kind !== 'adoptive') continue;
    if (adoptive.has(l.childId)) err('ADOPTION_MULTIPLE', t('Bir kişinin en fazla bir evlat edinen ailesi olabilir.'), [l.childId]);
    adoptive.set(l.childId, l.unionId);
    const parents = idx.unionById.get(l.unionId)?.partners || [];
    if (parents.some((p) => ancestorsOf(graph, p, idx).has(l.childId))) err('ADOPTION_BY_DESCENDANT', t('Bir kişi kendi soyundan gelen biri tarafından evlat edinilemez.'), [l.childId, l.unionId]);
    const child = idx.byId.get(l.childId);
    if (child && (isPregnancy(child) || child.placeholder)) err('ADOPTION_KIND', t('Gebelik ya da belirtilmemiş ebeveyn evlat edinilmiş olarak işaretlenemez.'), [l.childId]);
  }
  for (const ind of graph.individuals) {
    if (!ind.adoptedOut) continue;
    if (!idx.bioParentUnion.has(ind.id)) err('ADOPTED_OUT_NO_PARENTS', t('Evlat verilen kişinin biyolojik ebeveynleri çizili olmalı.'), [ind.id]);
    if (adoptive.has(ind.id)) err('ADOPTED_OUT_AND_IN', t('Evlat verilen kişinin evlat edinen ailesi çizimde varsa "evlat verildi" yerine o aile seçilir.'), [ind.id]);
    if (isPregnancy(ind) || ind.placeholder) err('ADOPTION_KIND', t('Gebelik ya da belirtilmemiş ebeveyn evlat edinilmiş olarak işaretlenemez.'), [ind.id]);
  }

  // assisted reproduction (model.js REPRO_ROLES; NSGC 2022/2025 Figure 5)
  const repro = graph.reproductiveLinks || [];
  const seenRepro = new Set();
  for (const l of repro) {
    const ids = [l.childId, l.personId];
    const child = idx.byId.get(l.childId), person = idx.byId.get(l.personId);
    if (!child || !person) { err('REPRO_MISSING', t('Yardımcı üreme kaydındaki çocuk ya da kişi grafikte yok.'), ids); continue; }
    if (!REPRO_ROLES.includes(l.role)) { err('REPRO_ROLE', t('Bilinmeyen yardımcı üreme rolü: {role}.', { role: l.role }), ids); continue; }
    const key = `${l.childId}|${l.personId}`;
    if (seenRepro.has(key)) err('REPRO_DUPLICATE', t('Aynı kişi aynı çocuk için iki kez kayıtlı.'), ids);
    seenRepro.add(key);
    const uid = idx.bioParentUnion.get(l.childId);
    if (!uid) err('REPRO_NO_PARENTS', t('Yardımcı üremeyle doğan çocuğun anne-babası (ya da tek ebeveyni) çizili olmalı.'), ids);
    else if ((idx.unionById.get(uid)?.partners || []).includes(l.personId)) err('REPRO_IS_PARENT', t('Donör ya da taşıyıcı, çocuğun çizili anne-babasından biri olamaz.'), ids);
    if (l.personId === l.childId || ancestorsOf(graph, l.personId, idx).has(l.childId)) err('REPRO_DESCENDANT', t('Bir kişi kendi soyundan gelen birinin donörü ya da taşıyıcısı olamaz.'), ids);
    const wants = l.role === 'sperm_donor' ? 'male' : 'female';
    if (person.sex !== wants) err('REPRO_SEX', l.role === 'sperm_donor' ? t('Sperm donörü erkek olmalı.') : t('Yumurta donörü, gestasyonel taşıyıcı ve taşıyıcı anne kadın olmalı.'), ids);
    if (isPregnancy(person) || person.placeholder || isGroup(person)) err('REPRO_KIND', t('Gebelik, belirtilmemiş ebeveyn ya da sayılı sembol donör veya taşıyıcı olamaz.'), ids);
    if (isGroup(child)) err('REPRO_KIND', t('Sayılı sembol için yardımcı üreme işaretlenemez; önce "Tek tek ayır".'), ids);
  }
  const byChild = new Map();
  for (const l of repro) { if (!byChild.has(l.childId)) byChild.set(l.childId, []); byChild.get(l.childId).push(l.role); }
  for (const [childId, roles] of byChild) {
    const n = (list) => roles.filter((r) => list.includes(r)).length;
    if (n(['sperm_donor']) > 1) err('REPRO_SLOT', t('Bir çocuğun en fazla bir sperm donörü olabilir.'), [childId]);
    if (n(EGG_SOURCE) > 1) err('REPRO_SLOT', t('Bir çocuğun yumurtası tek kişiden gelir: yumurta donörü ya da taşıyıcı anne, ikisi birden değil.'), [childId]);
    if (n(CARRIER_ROLES) > 1) err('REPRO_SLOT', t('Bir gebeliği tek kişi taşır: gestasyonel taşıyıcı ya da taşıyıcı anne, ikisi birden değil.'), [childId]);
  }
  // twins (multiples.js): one pregnancy has one carrier; identical (MZ) twins share their genetic parents too
  const rolesOf = (id, list) => repro.filter((l) => l.childId === id && list.includes(l.role)).map((l) => `${l.role}:${l.personId}`).sort().join(',');
  for (const rel of graph.parentChildRelationships) {
    for (const m of rel.multiples || []) {
      const [first, ...rest] = m.children;
      const shared = m.zygosity === 'monozygotic' ? ['sperm_donor', ...EGG_SOURCE, ...CARRIER_ROLES] : CARRIER_ROLES;
      if (rest.some((c) => rolesOf(c, shared) !== rolesOf(first, shared))) {
        err('REPRO_TWINS', m.zygosity === 'monozygotic'
          ? t('Tek yumurta ikizlerinin donörleri ve taşıyıcısı aynı olmalı.')
          : t('Aynı gebelikten doğan ikizleri aynı kişi taşır.'), m.children);
      }
    }
  }

  // a donor or carrier added through the panel has no family of their own (clinician decision 2026-11-01)
  for (const ind of graph.individuals) {
    if (ind.relation !== ART_DONOR_RELATION) continue;
    if (idx.bioParentUnion.has(ind.id) || (idx.unionsOf.get(ind.id) || []).length) err('REPRO_DONOR_FAMILY', t('Donör ya da taşıyıcının ailesi çizilmez; aile öyküsünü not ve bulgu olarak girin.'), [ind.id]);
  }

  // the consultand (model.js): at most one, a born person
  const consultands = graph.individuals.filter((i) => i.consultand);
  if (consultands.length > 1) err('CONSULTAND_MULTIPLE', t('Pedigride birden fazla danışan işaretli; danışan en fazla bir kişidir.'), consultands.map((i) => i.id));
  for (const c of consultands) {
    if (c.placeholder || isPregnancy(c)) err('CONSULTAND_KIND', t('Danışan bir gebelik ya da belirtilmemiş ebeveyn olamaz.'), [c.id]);
  }
  for (const rel of graph.parentChildRelationships) {
    for (const m of rel.multiples || []) {
      if (m.children.some((c) => isGroup(idx.byId.get(c)))) err('GROUP_MULTIPLE', t('Birden çok kişiyi gösteren sembol ikiz/üçüz grubunda olamaz.'), m.children);
    }
  }

  const seenLink = new Set();
  for (const l of graph.socialParentLinks || []) {
    const ids = [l.childId, l.unionId];
    if (!idx.byId.has(l.childId)) err('SOCIAL_LINK_MISSING_CHILD', t('Sosyal ebeveynlik bağındaki çocuk grafikte yok ({childId}).', { childId: l.childId }), ids);
    if (!idx.unionById.has(l.unionId)) err('SOCIAL_LINK_MISSING_UNION', t('Sosyal ebeveynlik bağındaki birliktelik grafikte yok ({unionId}).', { unionId: l.unionId }), ids);
    if (!SOCIAL_LINK_KINDS.includes(l.kind)) err('SOCIAL_LINK_KIND', t('Bilinmeyen sosyal ebeveynlik türü: {kind}.', { kind: l.kind }), ids);
    if (idx.bioParentUnion.get(l.childId) === l.unionId) err('SOCIAL_LINK_DUPLICATES_BIOLOGICAL', t('Aynı ebeveyn birliği hem biyolojik hem sosyal ebeveyn olarak bağlı.'), ids);
    if ((idx.unionById.get(l.unionId)?.partners || []).includes(l.childId)) err('CHILD_IS_OWN_PARENT', t('Bir kişi kendi sosyal ebeveyn birliğinin partneri olamaz ({childId}).', { childId: l.childId }), ids);
    const key = `${l.childId}|${l.unionId}`;
    if (seenLink.has(key)) err('SOCIAL_LINK_DUPLICATE', t('Aynı sosyal ebeveynlik bağı iki kez kayıtlı.'), ids);
    seenLink.add(key);
  }
  return out;
}

/** Structural invariants + the existing semantic graph audit. */
export function validateDocument(doc) {
  const g = doc.graph;
  return [
    ...validateGraphStructure(g, { retired: doc.ids?.retired || [] }),
    ...auditPedigreeGraph(g),
    ...multiplesWarnings(g),
    ...carrierFindingIssues(g),
  ];
}

export const errorsOf = (issues) => issues.filter((i) => i.severity === 'error');
