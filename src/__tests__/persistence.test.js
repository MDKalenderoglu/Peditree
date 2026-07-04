/**
 * persistence.test.js — versioned localStorage persistence (v0.2).
 *
 * The vitest environment for this project is 'node' (see vite.config.js),
 * so there is no real `window`/`localStorage` global by default. Each test
 * installs a minimal in-memory Storage-like mock on `globalThis.window`
 * rather than pulling in a full DOM environment — persistence.js only ever
 * calls setItem/getItem/removeItem, so this is a faithful enough double.
 *
 * Run: npm test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

function installMockLocalStorage() {
  const store = new Map();
  const mockStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
  globalThis.window = { localStorage: mockStorage };
  return mockStorage;
}

function uninstallMockLocalStorage() {
  delete globalThis.window;
}

describe('persistence.js (v0.2)', () => {
  let persistence;

  beforeEach(async () => {
    installMockLocalStorage();
    // Re-import fresh each time isn't necessary — the module has no
    // internal mutable state — but we do need window installed BEFORE
    // the functions run, which beforeEach guarantees per-test.
    persistence = await import('../utils/persistence');
  });

  afterEach(() => {
    uninstallMockLocalStorage();
  });

  it('round-trips a saved wizardData object', () => {
    const { saveSession, loadSession } = persistence;
    const wizardData = { proband: { sex: 'male', age: '10' }, parents: { motherExists: true } };

    const ok = saveSession(wizardData);
    expect(ok).toBe(true);

    const restored = loadSession();
    expect(restored).not.toBeNull();
    expect(restored.wizardData).toEqual(wizardData);
  });

  it('loadSession returns null when nothing has been saved', () => {
    const { loadSession } = persistence;
    expect(loadSession()).toBeNull();
  });

  it('loadSession returns null (never throws) for invalid JSON under the storage key', () => {
    const { loadSession, STORAGE_KEY } = persistence;
    globalThis.window.localStorage.setItem(STORAGE_KEY, '{not valid json');
    expect(() => loadSession()).not.toThrow();
    expect(loadSession()).toBeNull();
  });

  it('loadSession returns null for a well-formed but unrelated JSON blob', () => {
    const { loadSession, STORAGE_KEY } = persistence;
    globalThis.window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ some: 'unrelated', data: 123 }));
    expect(loadSession()).toBeNull();
  });

  it('loadSession returns null for a schema version mismatch', () => {
    const { loadSession, STORAGE_KEY } = persistence;
    globalThis.window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      schemaVersion: 999,
      wizardData: { proband: {}, parents: {} },
    }));
    expect(loadSession()).toBeNull();
  });

  it('clearSession removes the saved session', () => {
    const { saveSession, loadSession, clearSession } = persistence;
    saveSession({ proband: {}, parents: {} });
    expect(loadSession()).not.toBeNull();

    clearSession();
    expect(loadSession()).toBeNull();
  });

  it('saveSession never throws even if localStorage.setItem throws (e.g. quota exceeded)', () => {
    const { saveSession } = persistence;
    globalThis.window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    expect(() => saveSession({ proband: {}, parents: {} })).not.toThrow();
    expect(saveSession({ proband: {}, parents: {} })).toBe(false);
  });
});
