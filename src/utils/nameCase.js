/**
 * nameCase.js — a person's name as names are written (clinician request
 * 2026-10-30: "ayşe nur yılmaz" → "Ayşe Nur Yılmaz").
 *
 * Every word, and every part of a hyphenated name, starts with a capital,
 * the rest is small, by Turkish rules (i → İ, I → ı). After an apostrophe
 * the suffix stays small ("Ali'nin").
 */
export function nameCase(name) {
  return String(name ?? '')
    .toLocaleLowerCase('tr')
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toLocaleUpperCase('tr'));
}
