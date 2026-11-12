/**
 * age.js — ages in years, months or days (clinician decision 2026-10-25).
 *
 * Written the way the drawing shows them: years as a plain number ("35",
 * "2,5"), months "3 ay", days "12 gün". Input accepts "35 yaş", "35 yıl",
 * "3ay", "12g", "2.5" …; anything else is refused rather than guessed
 * ("12a" used to be read as 12 years). Ages are compared in days, so a
 * three-month-old is younger than a two-year-old.
 *
 * The proband's optional birth date gives the age as of today: days under a
 * month, months under two years, then full years.
 *
 * The stored form stays the Turkish one whatever the screen's language (a
 * file reads the same everywhere); `shownAge` writes it in the language of
 * the screen or the drawing ("3 mo", "12 d", "2.5"), and English input is
 * read too ("3 months", "12 days", "35 y").
 */
import { tk, currentLang } from '../i18n';

const UNITS = [
  { unit: 'y', re: /^(yıl|yil|yaş|yas|y|yr|yrs|years?)?$/ },
  { unit: 'm', re: /^(ay|mo|mos|months?)$/ },
  { unit: 'd', re: /^(gün|gun|g|d|days?)$/ },
];
const DAYS = { y: 365.25, m: 30.4375, d: 1 };

/** { value, unit: 'y' | 'm' | 'd' } or null (empty or unreadable). */
export function parseAge(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toLocaleLowerCase('tr');
  const m = /^(\d+(?:[.,]\d+)?)\s*([^\d\s.,]*)$/.exec(s);
  if (!m) return null;
  const value = Number(m[1].replace(',', '.'));
  const u = UNITS.find((x) => x.re.test(m[2]));
  if (!u || !Number.isFinite(value)) return null;
  return { value, unit: u.unit };
}

export function formatAge({ value, unit }) {
  const n = String(value).replace('.', ',');
  return unit === 'm' ? `${n} ay` : unit === 'd' ? `${n} gün` : n;
}

/** The age as stored: '' stays '', a readable age in its written form, null if unreadable. */
export function normalizeAge(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return '';
  const a = parseAge(raw);
  return a ? formatAge(a) : null;
}

/** The age in days, for comparing; null when unknown or unreadable. */
export function ageInDays(raw) {
  const a = parseAge(raw);
  return a ? a.value * DAYS[a.unit] : null;
}

export const AGE_EXAMPLE = tk('örnek: 35, 2,5, 3 ay, 12 gün');

/** A stored age as the reader's language writes it: "3 ay" → "3 mo", "2,5" → "2.5" in English. */
export function shownAge(raw, lang = currentLang()) {
  if (lang !== 'en' || raw === null || raw === undefined) return raw;
  const a = parseAge(raw);
  if (!a) return raw;
  const n = String(a.value);
  return a.unit === 'm' ? `${n} mo` : a.unit === 'd' ? `${n} d` : n;
}

/** 'YYYY-MM-DD' → the age on `today`, or null for a future or impossible date. */
export function ageFromBirthDate(iso, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const birth = new Date(y, mo - 1, d);
  if (birth.getFullYear() !== y || birth.getMonth() !== mo - 1 || birth.getDate() !== d) return null;
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((now - birth) / 86400000);
  if (days < 0) return null;
  const months = (now.getFullYear() - y) * 12 + (now.getMonth() - (mo - 1)) - (now.getDate() < d ? 1 : 0);
  if (months < 1) return `${days} gün`;
  if (months < 24) return `${months} ay`;
  return String(Math.floor(months / 12));
}

/**
 * A date typed the quick way (clinician request 2026-10-25), day first:
 * "3.5.25", "3/05/2025", "03.05.2022", "3-5-2025", "3 5 25", "030525",
 * "03052025", or "2025-05-03". A two-digit year is this century unless that
 * would be in the future (then the last one). Returns 'YYYY-MM-DD' or null.
 */
export function parseTypedDate(raw, today = new Date()) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let d, m, y;
  let k = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (k) [, y, m, d] = k;
  else if ((k = /^(\d{1,2})[./\-\s]+(\d{1,2})[./\-\s]+(\d{2}|\d{4})$/.exec(s))) [, d, m, y] = k;
  else if ((k = /^(\d{2})(\d{2})(\d{2}|\d{4})$/.exec(s))) [, d, m, y] = k;
  else return null;
  let year = Number(y);
  if (String(y).length === 2) {
    year += 2000;
    if (year > today.getFullYear()) year -= 100;
  }
  const iso = `${year}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
  const date = new Date(year, Number(m) - 1, Number(d));
  return date.getFullYear() === year && date.getMonth() === Number(m) - 1 && date.getDate() === Number(d) ? iso : null;
}

/**
 * A date as it is typed (clinician request 2026-11-12): a phone's number keyboard has no dot, and many people
 * type the digits alone anyway — "12122024" shows as "12.12.2024" while it is typed. A separator the
 * clinician types (. , / - or a space) is kept as a dot and ends that part: "3.5.25", "1.12.2024" and a
 * mix ("12.122024") work too. Day and month take two digits each, the year up to four; a dot follows a
 * full day or month while typing forward (never while deleting). Whether the date exists is decided by
 * parseTypedDate when the box is left — a few digits that cannot be a whole date ("6812") are not guessed.
 */
export function typeDate(raw, prev = '') {
  const s = String(raw ?? '');
  if (!/^[\d.,/\-\s]*$/.test(s)) return s; // something else (a letter): left as typed, judged on leaving
  const parts = s.split(/[.,/\-\s]+/);
  const endsWithSep = /[.,/\-\s]$/.test(s);
  const widths = [2, 2, 4];
  const fields = [];
  parts.forEach((part, i) => {
    let p = part;
    const closed = i < parts.length - 1; // a separator follows: this part is complete as typed
    while (p && fields.length < 3) {
      const w = widths[fields.length];
      if (closed && p.length <= w) { fields.push(p); p = ''; }
      else { fields.push(p.slice(0, w)); p = p.slice(w); }
    }
  });
  let out = fields.join('.');
  const growing = s.length > String(prev ?? '').length;
  const last = fields[fields.length - 1] || '';
  if (fields.length && fields.length < 3 && (endsWithSep || (growing && last.length === widths[fields.length - 1]))) out += '.';
  return out;
}

/** 'YYYY-MM-DD' → '03.05.2025' (how the clinician writes it). */
export function formatDate(iso) {
  const k = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return k ? `${k[3]}.${k[2]}.${k[1]}` : '';
}
