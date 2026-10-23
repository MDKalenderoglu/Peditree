/**
 * persistenceV2.js — schema v2 storage (docs/PEDITREE_DATA_MODEL_V2.md §2.4).
 *
 * Autosave: the whole graph document under `clinical_pedigree_app.session.v2`.
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

const storage = () => (typeof window !== 'undefined' && window.localStorage) ? window.localStorage : null;

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
  const ls = storage();
  if (!ls) return;
  for (const k of [STORAGE_KEY_V2, V1_KEY, V1_BACKUP_KEY]) {
    try { ls.removeItem(k); } catch { /* ignore */ }
  }
}

export function serializeDocument(doc) {
  return JSON.stringify({ ...doc, savedAt: new Date().toISOString() }, null, 2);
}

/**
 * Parse a project file. Returns `{ ok, doc, migrated, reason }`; a document
 * with structural errors is refused rather than opened in a broken state.
 */
export function parseProjectFile(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    return { ok: false, reason: 'Dosya okunamadı: geçerli bir JSON değil.' };
  }
  let doc, migrated = false, normalizations = [];
  if (isDocumentV2(parsed)) {
    doc = parsed;
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
