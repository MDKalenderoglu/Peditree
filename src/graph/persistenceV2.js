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
import { normalizeGenetics } from './model';
import { validateDocument, errorsOf } from './validate';
import { clearChildlessWithChildren } from './finalize';
import { t } from '../i18n';

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
    // the same checks as a project file (Codex audit 2026-11-01: a broken
    // session was taken as valid, failed to draw and was silently replaced)
    const r = parseProjectFile(raw);
    if (r.ok && !r.migrated) return { doc: r.doc, source: 'v2', ...(r.normalizations.length ? { notice: r.normalizations.join(' ') } : {}) };
    keepBrokenSession(ls, raw);
    return { doc: null, source: null, notice: t('Bu sekmede kayıtlı pedigri açılamadı ({v0}); boş bir pedigriyle başlandı. Kayıt silinmedi; üzerine yazılmaması için ayrıca saklandı.', { v0: r.ok ? t('biçim tanınmadı') : r.reason.replace(/\.$/, '') }) };
  }

  let rawV1;
  try { rawV1 = ls.getItem(V1_KEY); } catch { rawV1 = null; }
  if (!rawV1) return { doc: null, source: null };

  let envelope;
  try { envelope = JSON.parse(rawV1); } catch {
    return { doc: null, source: null, notice: t('Eski kayıt okunamadı (geçersiz JSON); kayıt değiştirilmeden bırakıldı.') };
  }
  const wdOk = (w) => w && typeof w === 'object' && w.proband && typeof w.proband === 'object' && w.parents && typeof w.parents === 'object';
  if (!envelope || envelope.schemaVersion !== 1 || !wdOk(envelope.wizardData)) {
    return { doc: null, source: null, notice: t('Eski kayıt tanınmadı; kayıt değiştirilmeden bırakıldı.') };
  }
  const result = migrateV1ToV2({ ...envelope.wizardData, savedAt: envelope.savedAt });
  if (!result.ok) return { doc: null, source: null, notice: t('{reason} Eski kayıt değiştirilmeden bırakıldı.', { reason: result.reason }) };
  if (!saveDocument(result.doc)) {
    return { doc: result.doc, source: 'migrated-v1', normalizations: result.normalizations, notice: t('Yeni biçime aktarılan pedigri kaydedilemedi; eski kayıt korunuyor.') };
  }
  try {
    ls.setItem(V1_BACKUP_KEY, rawV1);
    ls.removeItem(V1_KEY);
  } catch (err) {
    console.warn('[persistenceV2] Could not move the v1 session to the backup key:', err);
  }
  return { doc: result.doc, source: 'migrated-v1', normalizations: result.normalizations };
}

/** A session record that could not be opened is kept apart, so autosave never writes over it. */
export const BROKEN_SESSION_KEY = 'clinical_pedigree_app.session.v2.unreadable';
export function keepBrokenSession(ss, raw) {
  if (!ss) return;
  try { ss.setItem(BROKEN_SESSION_KEY, raw); } catch { /* full: the notice still tells the clinician */ }
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

// genetic test results saved before 2026-10-27 (E+ / E− / E VUS) open as
// "+" with the result as the first written line (graph/model.js)
function currentGenetics(doc) {
  const people = doc && doc.graph && Array.isArray(doc.graph.individuals) ? doc.graph.individuals : [];
  people.forEach((p) => { if (p && typeof p === 'object') normalizeGenetics(p); });
  return doc;
}

export function serializeDocument(doc) {
  return JSON.stringify({ ...doc, savedAt: new Date().toISOString() }, null, 2);
}

export const MAX_PROJECT_FILE_CHARS = 20 * 1024 * 1024;

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const isId = (x) => typeof x === 'string' && x.length > 0;
const textOrNumber = (v) => v === undefined || v === null || typeof v === 'string' || typeof v === 'number';
const UNION_TEXT_FIELDS = ['status', 'childless', 'childlessReason', 'lineNote', 'relationshipBackground', 'consanguinityStatus', 'leftPartner'];
const TEXT_FIELDS = ['label', 'displayLabel', 'notes', 'condition', 'causeOfDeath', 'age', 'ageAtDeath', 'relation', 'sex', 'geneticTest', 'geneticNote', 'birthDate', 'sexAtBirth', 'lmp'];

/**
 * The form of a v2 document, checked before anything reads it (audit
 * 2026-10-25: a person that is null made the validator throw, a union with
 * one partner was accepted). Returns the first problem, or null.
 */
export function shapeProblem(doc) {
  const g = doc.graph;
  for (const p of g.individuals) {
    if (!isObj(p) || !isId(p.id)) return t('bir kişinin kaydı bozuk (kimliği yok)');
    for (const f of TEXT_FIELDS) {
      const v = p[f];
      if (v !== undefined && v !== null && typeof v !== 'string' && typeof v !== 'number') return t('"{id}" kişisinin "{f}" alanı metin değil', { id: p.id, f });
    }
    // the week of birth, a group's count (security audit run 2, 2026-11-15: an object here passed every
    // check and threw while being drawn)
    for (const f of ['gestationWeeks', 'count']) {
      const v = p[f];
      if (v !== undefined && v !== null && typeof v !== 'string' && typeof v !== 'number') return t('"{id}" kişisinin "{f}" alanı metin değil', { id: p.id, f });
    }
    if (p.conditions !== undefined && (!Array.isArray(p.conditions) || p.conditions.some((c) => !isObj(c) || typeof c.label !== 'string'
      || !textOrNumber(c.onsetAge) || !(c.status === undefined || c.status === null || typeof c.status === 'string')))) return t('"{id}" kişisinin bulguları bozuk', { id: p.id });
  }
  for (const u of g.unions) {
    if (!isObj(u) || !isId(u.id) || !Array.isArray(u.partners) || u.partners.length !== 2 || !u.partners.every(isId) || u.partners[0] === u.partners[1]) {
      return `${t('bir çift kaydı tam olarak iki farklı kişiyi içermiyor')}${isObj(u) && u.id ? ` (${u.id})` : ''}`;
    }
    // the couple's words and marks the drawing writes out (security audit run 2: a reason for being
    // childless that was not text threw while being drawn)
    for (const f of UNION_TEXT_FIELDS) {
      const v = u[f];
      if (v !== undefined && v !== null && typeof v !== 'string') return t('"{id}" çiftinin "{f}" alanı metin değil', { id: u.id, f });
    }
    if (!textOrNumber(u.consanguinityDegree)) return t('"{id}" çiftinin "{f}" alanı metin değil', { id: u.id, f: 'consanguinityDegree' });
  }
  for (const r of g.parentChildRelationships) {
    if (!isObj(r) || !isId(r.unionId) || !Array.isArray(r.children) || !r.children.every(isId)) return t('bir ebeveyn–çocuk kaydı bozuk');
    if (r.ownGamete !== undefined && (!Array.isArray(r.ownGamete) || r.ownGamete.some((e) => !isObj(e) || !isId(e.childId) || !isId(e.partnerId)))) return t('bir ebeveyn–çocuk kaydı bozuk');
  }
  if (g.socialParentLinks !== undefined && (!Array.isArray(g.socialParentLinks) || g.socialParentLinks.some((l) => !isObj(l) || !isId(l.childId) || !isId(l.unionId) || typeof l.kind !== 'string'))) {
    return t('bir sosyal ebeveynlik kaydı bozuk');
  }
  if (g.reproductiveLinks !== undefined && (!Array.isArray(g.reproductiveLinks) || g.reproductiveLinks.some((l) => !isObj(l) || !isId(l.childId) || !isId(l.personId) || typeof l.role !== 'string'))) {
    return t('bir yardımcı üreme kaydı bozuk');
  }
  if (g.conditionKey !== undefined && (!Array.isArray(g.conditionKey) || g.conditionKey.some((e) => !isObj(e) || typeof e.label !== 'string'))) {
    return t('bulgu açıklaması bozuk');
  }
  return null;
}

/**
 * The document's own fields — the patient's name, the anchor, the id counters, the wizard's and the
 * file's notes — of the type the program reads (security audit 2026-11-15: a patient name that was
 * not text made the drawing throw while being shown, and the session kept it, so the tab broke again
 * on every reload). Returns the first problem, or null.
 */
export function documentProblem(doc) {
  const textOrNone = (v) => v === undefined || v === null || typeof v === 'string';
  const objOrNone = (v) => v === undefined || v === null || isObj(v);
  if (!textOrNone(doc.patientName)) return t('"{f}" alanı bozuk', { f: 'patientName' });
  if (!textOrNone(doc.wizardAnchorId)) return t('"{f}" alanı bozuk', { f: 'wizardAnchorId' });
  if (doc.ids !== undefined && doc.ids !== null) {
    const { counters, retired } = isObj(doc.ids) ? doc.ids : {};
    if (!isObj(doc.ids) || !objOrNone(counters) || !(retired === undefined || (Array.isArray(retired) && retired.every((x) => typeof x === 'string')))) {
      return t('"{f}" alanı bozuk', { f: 'ids' });
    }
  }
  if (!objOrNone(doc.wizardMeta)) return t('"{f}" alanı bozuk', { f: 'wizardMeta' });
  if (!objOrNone(doc.provenance)) return t('"{f}" alanı bozuk', { f: 'provenance' });
  return null;
}

/**
 * The counts in an old (v1) file — how many brothers, sisters, children, losses … — drive the
 * builder's loops one person at a time, before any other check (security audit run 2, 2026-11-15:
 * a count of a billion in a few bytes would hang the tab). A clinical family is far smaller: any one
 * count above V1_MAX_COUNT, or all of them together above MAX_V1_PEOPLE, is refused.
 */
const V1_COUNT_KEYS = new Set(['male', 'female', 'unknown', 'deceased', 'pregnancyLoss', 'stillbirth']);
const V1_MAX_COUNT = 100;
const MAX_V1_PEOPLE = 3000;
export function v1CountProblem(wizardData) {
  let total = 0, bad = false;
  const walk = (x, depth) => {
    if (bad || depth > 12 || !x || typeof x !== 'object') return;
    for (const [k, v] of Object.entries(x)) {
      if (V1_COUNT_KEYS.has(k) && (typeof v === 'number' || typeof v === 'string')) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) {
          if (n > V1_MAX_COUNT) { bad = true; return; }
          total += n;
        }
      } else if (typeof v === 'object') walk(v, depth + 1);
    }
  };
  walk(wizardData, 0);
  return bad || total > MAX_V1_PEOPLE ? t('Dosyadaki aile, çizilebilecek boyuttan büyük olduğundan açılmadı.') : null;
}

/**
 * Parse a project file. Returns `{ ok, doc, migrated, reason }`; a document
 * with structural errors is refused rather than opened in a broken state.
 * It never throws: whatever goes wrong comes back as a reason.
 */
export function parseProjectFile(text) {
  if (typeof text !== 'string') return { ok: false, reason: t('Dosya okunamadı.') };
  if (text.length > MAX_PROJECT_FILE_CHARS) return { ok: false, reason: t('Dosya çok büyük (20 MB üzeri) ve bir PediTree pedigrisi olarak tanınmadığı için açılmadı.') };
  try {
    return parseChecked(text);
  } catch (err) {
    console.warn('[persistenceV2] Project file could not be read:', err);
    return { ok: false, reason: t('Dosyanın içeriği bozuk olduğundan dosya açılamadı.') };
  }
}

function parseChecked(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    return { ok: false, reason: t('Dosya okunamadı; geçerli bir JSON dosyası değil.') };
  }
  let doc, migrated = false, normalizations = [];
  if (isDocumentV2(parsed)) {
    doc = parsed;
    const problem = shapeProblem(doc) || documentProblem(doc);
    if (problem) return { ok: false, reason: t('Dosyadaki pedigri bozuk olduğundan açılmadı: {problem}.', { problem }) };
    if (!Array.isArray(doc.graph.socialParentLinks)) doc.graph.socialParentLinks = [];
    if (!Array.isArray(doc.graph.reproductiveLinks)) doc.graph.reproductiveLinks = [];
    if (!Array.isArray(doc.graph.conditionKey)) doc.graph.conditionKey = [];
    if (!doc.ids) doc.ids = { counters: {}, retired: [] };
    if (!doc.wizardAnchorId) doc.wizardAnchorId = 'proband';
    currentGenetics(doc);
  } else {
    const wizardData = parsed && parsed.schemaVersion === 1 && parsed.wizardData ? parsed.wizardData
      : (parsed && parsed.proband && parsed.parents ? parsed : null);
    if (!wizardData) return { ok: false, reason: t('Dosya bir PediTree pedigrisi olarak tanınmadı.') };
    const many = v1CountProblem(wizardData);
    if (many) return { ok: false, reason: many };
    const r = migrateV1ToV2(wizardData);
    if (!r.ok) return { ok: false, reason: r.reason };
    doc = r.doc; migrated = true; normalizations = r.normalizations;
    // an old file's people go through the same checks as a new file's (security audit run 2, 2026-11-15:
    // a finding text that was not text came in through the old format and threw while being drawn)
    const problem = shapeProblem(doc) || documentProblem(doc);
    if (problem) return { ok: false, reason: t('Dosyadaki pedigri bozuk olduğundan açılmadı: {problem}.', { problem }) };
  }
  const cleared = doc.graph.unions.filter((u) => u.childless).length;
  clearChildlessWithChildren(doc.graph);
  if (doc.graph.unions.filter((u) => u.childless).length < cleared) normalizations = [...normalizations, t('Çocuğu bulunan bir çiftteki “çocuksuz / infertil” işareti kaldırıldı.')];
  const errors = errorsOf(validateDocument(doc));
  if (errors.length) return { ok: false, reason: t('Dosyadaki pedigri tutarsız olduğundan açılmadı: {v0}', { v0: errors[0].message }) };
  return { ok: true, doc, migrated, normalizations };
}
