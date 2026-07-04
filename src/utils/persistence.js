/**
 * persistence.js
 *
 * Versioned localStorage persistence for the wizard state.
 *
 * Only `wizardData` is persisted — it is the single source of truth that
 * `buildPedigreeFromWizard()` deterministically derives the full graph from
 * (see usePedigreeStore.js: generateDerivedData). Persisting the derived
 * graph/layout instead would risk saving a stale or inconsistent snapshot.
 *
 * Storage key is versioned (`.v1`) so a future incompatible wizardData shape
 * can be detected and handled explicitly instead of silently misinterpreted.
 * Bumping SCHEMA_VERSION and STORAGE_KEY together is the intended migration
 * path — do not reinterpret old data under a new version number in place.
 */

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'clinical_pedigree_app.session.v1';

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Minimal structural validation — enough to reject obviously corrupt or
 * foreign data without trying to fully re-validate wizard semantics here
 * (that's `auditPedigreeGraph`/`validatePedigree`'s job, run after load).
 */
function isValidEnvelope(parsed) {
  if (!isPlainObject(parsed)) return false;
  if (parsed.schemaVersion !== SCHEMA_VERSION) return false;
  if (!isPlainObject(parsed.wizardData)) return false;
  // Spot-check a couple of fields that must exist on any real wizardData
  // shape, so an unrelated JSON blob under the same key is still rejected.
  if (!isPlainObject(parsed.wizardData.proband)) return false;
  if (!isPlainObject(parsed.wizardData.parents)) return false;
  return true;
}

/**
 * Persist the current wizard state. Never throws — a storage failure
 * (quota exceeded, private-browsing restrictions, etc.) is logged and
 * swallowed, since failing to autosave must never crash the app or
 * interrupt editing.
 */
export function saveSession(wizardData) {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    const envelope = {
      schemaVersion: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      wizardData,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch (err) {
    console.warn('[persistence] Failed to save pedigree session:', err);
    return false;
  }
}

/**
 * Load the previously saved wizard state.
 * Returns null (never throws) if nothing is saved, the data is not valid
 * JSON, the schema version doesn't match, or the shape looks unrelated to
 * a wizardData object. Callers should treat null as "start clean" and may
 * want to surface a one-time recoverable warning when `reason` indicates
 * the key existed but was rejected.
 *
 * @returns {{ wizardData: object } | null}
 */
export function loadSession() {
  if (typeof window === 'undefined' || !window.localStorage) return null;

  let raw;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[persistence] localStorage unavailable:', err);
    return null;
  }
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn('[persistence] Saved pedigree session is not valid JSON — ignoring and starting clean.', err);
    return null;
  }

  if (!isValidEnvelope(parsed)) {
    console.warn(
      `[persistence] Saved pedigree session has an unrecognized or incompatible shape ` +
      `(expected schemaVersion ${SCHEMA_VERSION}) — ignoring and starting clean.`
    );
    return null;
  }

  return { wizardData: parsed.wizardData, savedAt: parsed.savedAt };
}

/**
 * Clear the saved session ("New pedigree").
 */
export function clearSession() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[persistence] Failed to clear pedigree session:', err);
  }
}
