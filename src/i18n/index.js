/**
 * i18n — Turkish and English (clinician decisions 2026-11-02).
 *
 * The Turkish text stays in the code as written; `t('Kaydet')` gives it in
 * the current language from the English dictionary (en.js), `{name}` is
 * filled from the second argument. A text missing from the dictionary falls
 * back to Turkish — the screen test in English finds it (no Turkish letter
 * may show), and the dictionary test lists every key the code uses.
 *
 * Two languages are kept on the device (a preference, never in the pedigree
 * file): the interface's, and the drawing's — the same as the interface, or
 * Turkish / English on its own (a Turkish interface can download an English
 * drawing). The first opening follows the browser's language.
 *
 * Terms follow the English of NSGC 2022 (proband, consultand, affected,
 * carrier, SAB, TOP, ECT, SB, gestational carrier, surrogate, donor).
 * What the clinician types (names, notes, findings) is never translated.
 */
import { create } from 'zustand';
import EN from './en';

export const LANGS = ['tr', 'en'];
const KEY = 'peditree.lang.v1';

function browserLang() {
  const l = typeof navigator !== 'undefined' ? String(navigator.language || '') : '';
  return /^tr\b/i.test(l) || l === '' ? 'tr' : 'en';
}

export function normalizeLang(v) {
  const o = v && typeof v === 'object' ? v : {};
  return {
    ui: LANGS.includes(o.ui) ? o.ui : browserLang(),
    drawing: ['same', ...LANGS].includes(o.drawing) ? o.drawing : 'same',
  };
}

function read() {
  try {
    const raw = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(KEY) : null;
    return normalizeLang(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeLang(null);
  }
}

// the language messages are made in outside React (graph operations' reasons)
let current = 'tr';

export const useLang = create((set) => {
  const start = read();
  current = start.ui;
  return {
    ...start,
    setLang: (patch) => set((s) => {
      const next = normalizeLang({ ui: s.ui, drawing: s.drawing, ...patch });
      current = next.ui;
      try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private window: this page only */ }
      return next;
    }),
  };
});

/** The drawing's language: the interface's unless chosen apart. */
export const drawingLangOf = ({ ui, drawing }) => (drawing === 'same' ? ui : drawing);

export const currentLang = () => current;

const fill = (text, params) => (params ? String(text).replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : text);

/**
 * Texts asked for in English that the dictionary does not have (the screen
 * test in English reads it: every text the screens show must be there).
 */
export const missing = new Set();

/** `text` (Turkish, as written in the code) in `lang` (default: the interface's). */
export function t(text, params, lang = current) {
  if (text === null || text === undefined) return text;
  const s = String(text);
  if (lang !== 'en') return fill(s, params);
  if (!Object.prototype.hasOwnProperty.call(EN, s)) { missing.add(s); return fill(s, params); }
  return fill(EN[s], params);
}

/** Marks a text kept in a list or a constant and given to `t` when shown (the dictionary test finds it). */
export const tk = (text) => text;

const has = (s) => Object.prototype.hasOwnProperty.call(EN, s);
const SIDE_EN = { Anne: 'mother’s side', Baba: 'father’s side' };

/**
 * A person's stored default label (written by the program, in Turkish:
 * "Baba", "Anne Eşi 2", "B.Dede (Anne)"; model.js DEFAULT_LABELS) in the
 * reader's language. The stored label never changes; a label someone typed
 * stays as it is.
 */
export function shownLabel(label, lang = current) {
  if (!label || lang !== 'en') return label;
  const s = String(label);
  if (has(s)) return EN[s];
  let m = /^(.*\S) (\d+)$/.exec(s);
  if (m) return `${shownLabel(m[1], lang)} ${m[2]}`;
  m = /^(.*\S) \((.+)\)$/.exec(s);
  if (m) return `${shownLabel(m[1], lang)} (${SIDE_EN[m[2]] || shownLabel(m[2], lang)})`;
  return s;
}

/** A `t` bound to one language (the drawing's). */
export const tFor = (lang) => (text, params) => t(text, params, lang);

/** React: the current interface `t`, re-rendering when the language changes. */
export function useT() {
  const ui = useLang((s) => s.ui);
  return (text, params) => t(text, params, ui);
}
