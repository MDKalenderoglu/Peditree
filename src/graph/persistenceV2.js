/**
 * persistenceV2.js — schema v2 storage (docs/PEDITREE_DATA_MODEL_V2.md §2.4).
 *
 * Autosave: the whole graph document under `clinical_pedigree_app.session.v2`
 * in the browser's SESSION storage (clinician decision 2026-10-25): it
 * survives a reload, and nothing is kept once the tab is closed — what the
 * clinician does not download is not stored anywhere. Data an earlier version
 * left in the persistent localStorage is moved into the session once and
 * removed from localStorage.
 *
 * First start after the upgrade: when only a v1 session exists it is
 * migrated (migrate.js); the v2 document is written and the original v1
 * envelope is MOVED to `…session.v1.backup` — kept intact (no data loss) and
 * no longer under the v1 key, so it is not migrated a second time. If the
 * migration fails, nothing is written and the v1 session stays where it was.
 *
 * Project files (`.peditree.json`): the same v2 document as JSON. Opening a
 * file accepts a v2 document, a v1 storage envelope or a bare v1 wizardData,
 * migrating the latter two.
 *
 * Never throws: storage failures are reported, never crash the app.
 */
import { STORAGE_KEY as V1_KEY } from '../utils/persistence';
import { migrateV1ToV2 } from './migrate';
import { isDocumentV2 } from './document';
import { validateDocument, errorsOf } from './validate';

export const STORAGE_KEY_V2 = 'clinical_pedigree_app.session.v2';
export const V1_BACKUP_KEY = 'clinical_pedigree_app.session.v1.backup';
export const PROJECT_FILE_EXTENSION = '.peditree.json';

const storage = () => (typeof window !== 'undefined' && window.sessionStorage) ? window.sessionStorage : null;
const legacyStorage = () => (typeof window !== 'undefined' && window.localStorage) ? window.localStorage : null;

/** Move anything an earlier version kept in localStorage into this session, then remove it there. */
function adoptLegacy(ss) {
  const ls = legacyStorage();
  if (!ls || ls === ss) return;
  for (const k of [STORAGE_KEY_V2, V1_KEY, V1_BACKUP_KEY]) {
    let v;
    try { v = ls.getItem(k); } catch { v = null; }
    if (v === null) continue;
    try {
      if (ss.getItem(k) === null) ss.setItem(k, v);
      ls.removeItem(k);
    } catch (err) {
      console.warn('[persistenceV2] Could not move an earlier saved pedigree into the session:', err);
    }
  }
}

export function saveDocument(doc) {
  const ls = storage();
  if (!ls) return false;
  try {
    ls.setItem(STORAGE_KEY_V2, JSON.stringify({ ...doc, savedAt: new Date().toISOString() }));
    return true;
  } catch (err) {
    console.warn('[persistenceV2] Failed to save pedigree document:', err);
    return false;
  }
}

/**
 * @returns {{ doc, source: 'v2' | 'migrated-v1', normalizations?: string[] } | { doc: null, source: null, notice?: string }}
 */
export function loadDocument() {
  const ls = storage();
  if (!ls) return { doc: null, source: null };
  adoptLegacy(ls);

  let raw;
  try { raw = ls.getItem(STORAGE_KEY_V2); } catch { raw = null; }
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (isDocumentV2(parsed)) return { doc: parsed, source: 'v2' };
    } catch { /* fall through */ }
    return { doc: null, source: null, notice: 'Kayıtlı pedigri okunamadı (biçim tanınmadı); temiz başlatıldı. Eski veriler silinmedi.' };
  }

  let rawV1;
  try { rawV1 = ls.getItem(V1_KEY); } catch { rawV1 = null; }
  if (!rawV1) return { doc: null, source: null };

  let envelope;
  try { envelope = JSON.parse(rawV1); } catch {
    return { doc: null, source: null, notice: 'Eski kayıt okunamadı (geçersiz JSON); dokunulmadı.' };
  }
  const wdOk = (w) => w && typeof w === 'object' && w.proband && typeof w.proband === 'object' && w.parents && typeof w.parents === 'object';
  if (!envelope || envelope.schemaVersion !== 1 || !wdOk(envelope.wizardData)) {
    return { doc: null, source: null, notice: 'Eski kayıt tanınmadı; dokunulmadı.' };
  }
  const result = migrateV1ToV2({ ...envelope.wizardData, savedAt: envelope.savedAt });
  if (!result.ok) return { doc: null, source: null, notice: `${result.reason} Eski kayıt dokunulmadan bırakıldı.` };
  if (!saveDocument(result.doc)) {
    return { doc: result.doc, source: 'migrated-v1', normalizations: result.normalizations, notice: 'Taşınan pedigri kaydedilemedi; eski kayıt korunuyor.' };
  }
  try {
    ls.setItem(V1_BACKUP_KEY, rawV1);
    ls.removeItem(V1_KEY);
  } catch (err) {
    console.warn('[persistenceV2] Could not move the v1 session to the backup key:', err);
  }
  return { doc: result.doc, source: 'migrated-v1', normalizations: result.normalizations };
}

/** "New pedigree": the user explicitly deletes the saved pedigree (all versions). */
export function clearAllSessions() {
  for (const st of [storage(), legacyStorage()]) {
    if (!st) continue;
    for (const k of [STORAGE_KEY_V2, V1_KEY, V1_BACKUP_KEY]) {
      try { st.removeItem(k); } catch { /* ignore */ }
    }
  }
}

export function serializeDocument(doc) {
  return JSON.stringify({ ...doc, savedAt: new Date().toISOString() }, null, 2);
}

export const MAX_PROJECT_FILE_CHARS = 20 * 1024 * 1024;

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const isId = (x) => typeof x === 'string' && x.length > 0;
const TEXT_FIELDS = ['label', 'displayLabel', 'notes', 'condition', 'causeOfDeath', 'age', 'ageAtDeath', 'relation', 'sex'];

/**
 * The form of a v2 document, checked before anything reads it (audit
 * 2026-10-25: a person that is null made the validator throw, a union with
 * one partner was accepted). Returns the first problem, or null.
 */
export function shapeProblem(doc) {
  const g = doc.graph;
  for (const p of g.individuals) {
    if (!isObj(p) || !isId(p.id)) return 'bir kişinin kaydı bozuk (kimliği yok)';
    for (const f of TEXT_FIELDS) {
      const v = p[f];
      if (v !== undefined && v !== null && typeof v !== 'string' && typeof v !== 'number') return `"${p.id}" kişisinin "${f}" alanı metin değil`;
    }
    if (p.conditions !== undefined && (!Array.isArray(p.conditions) || p.conditions.some((c) => !isObj(c) || typeof c.label !== 'string'))) return `"${p.id}" kişisinin bulguları bozuk`;
  }
  for (const u of g.unions) {
    if (!isObj(u) || !isId(u.id) || !Array.isArray(u.partners) || u.partners.length !== 2 || !u.partners.every(isId) || u.partners[0] === u.partners[1]) {
      return `bir birliktelik tam iki farklı kişiyi bağlamıyor${isObj(u) && u.id ? ` (${u.id})` : ''}`;
    }
  }
  for (const r of g.parentChildRelationships) {
    if (!isObj(r) || !isId(r.unionId) || !Array.isArray(r.children) || !r.children.every(isId)) return 'bir ebeveyn–çocuk kaydı bozuk';
  }
  if (g.socialParentLinks !== undefined && (!Array.isArray(g.socialParentLinks) || g.socialParentLinks.some((l) => !isObj(l) || !isId(l.childId) || !isId(l.unionId) || typeof l.kind !== 'string'))) {
    return 'bir sosyal ebeveynlik kaydı bozuk';
  }
  if (g.conditionKey !== undefined && (!Array.isArray(g.conditionKey) || g.conditionKey.some((e) => !isObj(e) || typeof e.label !== 'string'))) {
    return 'bulgu açıklaması bozuk';
  }
  return null;
}

/**
 * Parse a project file. Returns `{ ok, doc, migrated, reason }`; a document
 * with structural errors is refused rather than opened in a broken state.
 * It never throws: whatever goes wrong comes back as a reason.
 */
export function parseProjectFile(text) {
  if (typeof text !== 'string') return { ok: false, reason: 'Dosya okunamadı.' };
  if (text.length > MAX_PROJECT_FILE_CHARS) return { ok: false, reason: 'Dosya çok büyük (20 MB üstü); bir Peditree pedigrisi değil gibi görünüyor, açılmadı.' };
  try {
    return parseChecked(text);
  } catch (err) {
    console.warn('[persistenceV2] Project file could not be read:', err);
    return { ok: false, reason: 'Dosya okunamadı: içeriği bozuk, açılmadı.' };
  }
}

function parseChecked(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    return { ok: false, reason: 'Dosya okunamadı: geçerli bir JSON değil.' };
  }
  let doc, migrated = false, normalizations = [];
  if (isDocumentV2(parsed)) {
    doc = parsed;
    const problem = shapeProblem(doc);
    if (problem) return { ok: false, reason: `Dosyadaki pedigri bozuk, açılmadı: ${problem}.` };
    if (!Array.isArray(doc.graph.socialParentLinks)) doc.graph.socialParentLinks = [];
    if (!Array.isArray(doc.graph.conditionKey)) doc.graph.conditionKey = [];
    if (!doc.ids) doc.ids = { counters: {}, retired: [] };
    if (!doc.wizardAnchorId) doc.wizardAnchorId = 'proband';
  } else {
    const wizardData = parsed && parsed.schemaVersion === 1 && parsed.wizardData ? parsed.wizardData
      : (parsed && parsed.proband && parsed.parents ? parsed : null);
    if (!wizardData) return { ok: false, reason: 'Dosya bir Peditree pedigrisi değil (tanınmayan biçim).' };
    const r = migrateV1ToV2(wizardData);
    if (!r.ok) return { ok: false, reason: r.reason };
    doc = r.doc; migrated = true; normalizations = r.normalizations;
  }
  const errors = errorsOf(validateDocument(doc));
  if (errors.length) return { ok: false, reason: `Dosyadaki pedigri tutarsız, açılmadı: ${errors[0].message}` };
  return { ok: true, doc, migrated, normalizations };
}
