/**
 * ped.js — PED files (the "pre-makeped" / PLINK pedigree format), the
 * common language of genetic analysis tools: one row per person —
 * family, person, father, mother, sex (1 male, 2 female, 0 unknown),
 * phenotype (2 affected, 1 unaffected, 0 unknown). Clinician request
 * 2026-10-25: a lab or bioinformatics pipeline asks for it (trio exome).
 *
 * A PED file carries only who is whose child, sex and one affection status:
 * findings, twins, deceased, notes, pregnancy losses are not in it — the
 * project file (.peditree.json) keeps everything.
 *
 * Export: ids are the pedigree numbers (II-3), never the patient's name; the
 * clinician chooses what counts as affected ("affected" or one finding). A
 * finding not entered is written as unaffected (1); one marked "unknown"
 * as unknown (0).
 * Pregnancy losses and stillbirths are left out. An unspecified parent is
 * written as a person with unknown phenotype, so every child has both
 * parents or none (what most tools require).
 *
 * Import: headerless 6 columns (PLINK) or 5 columns (no family column), or
 * a header naming the columns (e.g. QuickPed: id fid mid sex aff, where fid
 * is the father). The first family of a multi-family file is opened.
 */
import { makePerson, indexGraph, isPregnancy } from './model';
import { createDocument } from './document';
import { finalizeGraph } from './finalize';
import { validateDocument, errorsOf } from './validate';
import { computePedigreeIds } from '../utils/pedigreeNumbering';
import { normLabel } from './conditionKey';

// ── export ──

/**
 * @param {{ individuals, unions, parentChildRelationships }} graph
 * @param {Array} nodes — the drawn nodes (for the pedigree numbers)
 * @param {{ phenotype?: 'affected' | string, familyId?: string }} opts
 *   phenotype: 'affected' (the person's affected mark) or a finding's label
 */
export function toPed(graph, nodes, { phenotype = 'affected', familyId = 'AILE1' } = {}) {
  const idx = indexGraph(graph);
  const pids = computePedigreeIds(nodes || []);
  const people = graph.individuals.filter((p) => !isPregnancy(p));
  const used = new Set();
  const idOf = new Map();
  people.forEach((p, k) => {
    let id = pids.get(p.id)?.displayId || `K${k + 1}`;
    while (used.has(id)) id += "'";
    used.add(id);
    idOf.set(p.id, id);
  });
  // father / mother of each union; an unspecified (placeholder) parent takes
  // the sex the other partner leaves
  const roles = new Map();
  for (const u of graph.unions) {
    const [a, b] = u.partners.map((id) => idx.byId.get(id));
    let father = [a, b].find((p) => p && p.sex === 'male');
    let mother = [a, b].find((p) => p && p.sex === 'female');
    if (!father) father = [a, b].find((p) => p && p !== mother);
    if (!mother) mother = [a, b].find((p) => p && p !== father);
    roles.set(u.id, { father: father?.id, mother: mother?.id });
    if (father) roles.set(`sex:${father.id}`, 1);
    if (mother) roles.set(`sex:${mother.id}`, 2);
  }
  // not entered = no (1); the clinician unsure = unknown (0), never "no"
  // (clinician decision 2026-10-25)
  const phenotypeOf = (p) => {
    if (p.placeholder) return 0;
    const conds = (p.conditions || []).filter(Boolean);
    if (phenotype === 'affected') return p.affected ? 2 : conds.some((c) => c.status === 'unknown') ? 0 : 1;
    const c = conds.find((x) => normLabel(x.label) === normLabel(phenotype));
    return c && c.status === 'affected' ? 2 : c && c.status === 'unknown' ? 0 : 1;
  };
  const rows = people.map((p) => {
    const uid = idx.bioParentUnion.get(p.id);
    const r = uid ? roles.get(uid) : null;
    const sex = p.sex === 'male' ? 1 : p.sex === 'female' ? 2 : (roles.get(`sex:${p.id}`) || 0);
    return [familyId, idOf.get(p.id), r && idOf.get(r.father) || '0', r && idOf.get(r.mother) || '0', sex, phenotypeOf(p)].join('\t');
  });
  return `${rows.join('\n')}\n`;
}

// ── import ──

const MISSING = new Set(['0', '-9', 'na', '.', '']);
const HEADER_WORDS = /^(id|iid|fid|mid|pid|sex|aff|affected|pheno|phenotype|father|mother|famid|family|ped|pat|mat|paternal|maternal|dadid|momid)$/i;

function columnsOf(header) {
  const names = header.map((h) => h.toLowerCase());
  const at = (...keys) => names.findIndex((n) => keys.includes(n));
  const hasIid = names.includes('iid');
  return {
    family: hasIid ? at('fid', 'famid', 'family', 'ped') : at('famid', 'family', 'ped'),
    id: at('iid', 'id'),
    father: hasIid ? at('pat', 'father', 'paternal', 'dadid', 'pid') : at('fid', 'pat', 'father', 'paternal', 'dadid', 'pid'),
    mother: at('mid', 'mat', 'mother', 'maternal', 'momid'),
    sex: at('sex'),
    pheno: at('aff', 'affected', 'pheno', 'phenotype'),
  };
}

/**
 * @returns {{ ok: true, doc, notice } | { ok: false, reason }}
 */
export const MAX_PED_CHARS = 20 * 1024 * 1024;
export const MAX_PED_PEOPLE = 3000;

export function fromPed(text) {
  // limits (second audit 2026-10-25): a clinical family is far smaller
  if (String(text || '').length > MAX_PED_CHARS) return { ok: false, reason: 'PED dosyası çok büyük (20 MB üstü), açılmadı.' };
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (!lines.length) return { ok: false, reason: 'PED dosyası boş.' };
  let rows = lines.map((l) => l.split(/\s+/));
  let cols;
  if (rows[0].filter((t) => HEADER_WORDS.test(t)).length >= 3) {
    cols = columnsOf(rows[0]);
    rows = rows.slice(1);
    if (cols.id < 0 || cols.father < 0 || cols.mother < 0) return { ok: false, reason: 'PED başlığında kişi, baba ve anne sütunları bulunamadı.' };
  } else {
    const n = rows[0].length;
    if (n >= 6) cols = { family: 0, id: 1, father: 2, mother: 3, sex: 4, pheno: 5 };
    else if (n >= 4) cols = { family: -1, id: 0, father: 1, mother: 2, sex: 3, pheno: n >= 5 ? 4 : -1 };
    else return { ok: false, reason: 'Dosya bir PED dosyası gibi görünmüyor (en az 4 sütun gerekir: kişi, baba, anne, cinsiyet).' };
  }
  const get = (r, k) => (cols[k] >= 0 ? r[cols[k]] : undefined);
  const families = [...new Set(rows.map((r) => get(r, 'family') ?? ''))];
  const family = families[0];
  const recs = rows.filter((r) => (get(r, 'family') ?? '') === family).map((r) => ({
    id: get(r, 'id'),
    father: MISSING.has(String(get(r, 'father') ?? '0').toLowerCase()) ? null : get(r, 'father'),
    mother: MISSING.has(String(get(r, 'mother') ?? '0').toLowerCase()) ? null : get(r, 'mother'),
    sex: ({ 1: 'male', m: 'male', male: 'male', 2: 'female', f: 'female', female: 'female' })[String(get(r, 'sex') ?? '').toLowerCase()] || 'unknown',
    affected: String(get(r, 'pheno') ?? '') === '2',
  }));
  if (recs.some((r) => !r.id)) return { ok: false, reason: 'PED dosyasında kimliği olmayan bir satır var.' };
  if (recs.length > MAX_PED_PEOPLE) return { ok: false, reason: `PED dosyasındaki aile ${MAX_PED_PEOPLE} kişiden büyük (${recs.length}); bu boyutta bir pedigri çizilemez.` };
  const seen = new Set();
  for (const r of recs) {
    if (seen.has(r.id)) return { ok: false, reason: `PED dosyasında "${r.id}" iki kez geçiyor.` };
    seen.add(r.id);
  }
  // parents named but not listed get a row of their own
  const byId = new Map(recs.map((r) => [r.id, r]));
  for (const r of [...recs]) {
    for (const [role, sex] of [['father', 'male'], ['mother', 'female']]) {
      const pid = r[role];
      if (!pid) continue;
      if (pid === r.id) return { ok: false, reason: `"${r.id}" kendi ebeveyni olarak yazılmış.` };
      if (!byId.has(pid)) { const add = { id: pid, father: null, mother: null, sex, affected: false }; recs.push(add); byId.set(pid, add); }
      const parent = byId.get(pid);
      if (parent.sex === 'unknown') parent.sex = sex;
      else if (parent.sex !== sex) return { ok: false, reason: `"${pid}" hem ${sex === 'male' ? 'baba' : 'anne'} olarak yazılmış hem de cinsiyeti ${parent.sex === 'male' ? 'erkek' : 'kadın'}.` };
    }
  }
  // nobody may be their own ancestor (iterative: a very deep ancestry must
  // not exhaust the call stack)
  const state = new Map(); // 1 on the path, 2 done
  const cyclic = (start) => {
    const stack = [[start, 0]];
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [id, k] = top;
      if (k === 0) {
        if (state.get(id) === 2) { stack.pop(); continue; }
        state.set(id, 1);
      }
      const r = byId.get(id);
      const next = [r.father, r.mother][k];
      if (k < 2) {
        top[1] = k + 1;
        if (!next) continue;
        if (state.get(next) === 1) return true;
        if (state.get(next) !== 2) stack.push([next, 0]);
        continue;
      }
      state.set(id, 2);
      stack.pop();
    }
    return false;
  };
  const loop = recs.find((r) => cyclic(r.id));
  if (loop) return { ok: false, reason: `"${loop.id}" kendi atası olarak görünüyor; dosya açılmadı.` };

  const pid = new Map(recs.map((r, k) => [r.id, `ped_${k + 1}`]));
  const individuals = recs.map((r) => makePerson({
    id: pid.get(r.id), sex: r.sex, generation: 0, relation: 'imported',
    label: r.id, displayLabel: r.id, affected: r.affected,
  }));
  const unions = [];
  const pcrs = [];
  const unionOf = new Map();
  const pcrOf = new Map();
  for (const r of recs) {
    if (!r.father && !r.mother) continue;
    const key = `${r.father || '?'}|${r.mother || '?'}`;
    if (!unionOf.has(key)) {
      const uid = `U_PED_${unionOf.size + 1}`;
      const partner = (role) => {
        if (r[role]) return pid.get(r[role]);
        const id = `${uid}__unspecified`;
        individuals.push(makePerson({ id, sex: 'unknown', generation: 0, relation: 'unspecified_parent', label: 'Belirtilmemiş ebeveyn', placeholder: true }));
        return id;
      };
      unions.push({
        id: uid, partners: [partner('father'), partner('mother')],
        consanguineous: false, consanguinityDegree: null, consanguinityStatus: 'none', status: 'together', relationshipBackground: 'not_asked',
      });
      const rel = { unionId: uid, children: [], orderPolicy: 'insertion' };
      pcrs.push(rel);
      pcrOf.set(uid, rel);
      unionOf.set(key, uid);
    }
    pcrOf.get(unionOf.get(key)).children.push(pid.get(r.id));
  }
  // a proband is needed: the first affected person without children, else the first affected, else the first person
  const isParent = new Set(recs.flatMap((r) => [r.father, r.mother]).filter(Boolean));
  const proband = recs.find((r) => r.affected && !isParent.has(r.id)) || recs.find((r) => r.affected) || recs[0];
  individuals.find((i) => i.id === pid.get(proband.id)).proband = true;

  const graph = { individuals, unions, parentChildRelationships: pcrs, socialParentLinks: [], conditionKey: [] };
  finalizeGraph(graph, { anchorId: pid.get(proband.id) });
  const doc = createDocument(graph, { wizardAnchorId: pid.get(proband.id), provenance: { importedFrom: 'ped' } });
  const errors = errorsOf(validateDocument(doc));
  if (errors.length) return { ok: false, reason: `PED dosyasındaki aile çizilemedi: ${errors[0].message}` };
  const notes = [`PED dosyasından ${recs.length} kişi açıldı; proband olarak "${proband.id}" seçildi (değiştirebilirsiniz).`];
  if (families.length > 1) notes.push(`Dosyada ${families.length} aile vardı; ilki ("${family}") açıldı.`);
  return { ok: true, doc, notice: notes.join(' ') };
}
