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
 */
const UNITS = [
  { unit: 'y', re: /^(yıl|yil|yaş|yas|y)?$/ },
  { unit: 'm', re: /^ay$/ },
  { unit: 'd', re: /^(gün|gun|g)$/ },
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

export const AGE_EXAMPLE = 'örnek: 35, 2,5, 3 ay, 12 gün';

/** 'YYYY-MM-DD' → the age on `today`, or null for a future or impossible date. */
export function ageFromBirthDate(iso, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const birth = new Date(y, mo - 1, d);
  if (birth.getFullYear() !== y || birth.getMonth() !== mo - 1 || birth.getDate() !== d) return null;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((t - birth) / 86400000);
  if (days < 0) return null;
  const months = (t.getFullYear() - y) * 12 + (t.getMonth() - (mo - 1)) - (t.getDate() < d ? 1 : 0);
  if (months < 1) return `${days} gün`;
  if (months < 24) return `${months} ay`;
  return String(Math.floor(months / 12));
}
