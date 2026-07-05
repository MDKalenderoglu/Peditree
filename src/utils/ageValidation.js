/**
 * ageValidation.js
 *
 * Pure helper shared by every age-like input in the app (chronological age,
 * age at death, gestational age). Clinical requirement (v0.3a.2): none of
 * these can ever be negative — an impossible value must never reach the
 * store, whether typed directly or pasted/edited programmatically.
 *
 * Normalizes rather than blocks: a negative number is clamped to '0' rather
 * than rejecting the keystroke outright, which is friendlier for the common
 * "typed a stray minus sign" slip than refusing all input. Empty string and
 * non-numeric input are passed through unchanged — those are handled by the
 * existing "optional field" semantics elsewhere (an unset age is valid).
 */

/**
 * @param {string|number} raw
 * @returns {string|number} the same value, or '0' if it parsed as a negative number
 */
export function sanitizeAgeValue(raw) {
  if (raw === '' || raw === null || raw === undefined) return raw;
  const num = Number(raw);
  if (Number.isNaN(num)) return raw;
  if (num < 0) return '0';
  return raw;
}

/**
 * Whether a raw age-like value is currently invalid (negative). Used to
 * show inline validation feedback without necessarily having sanitized yet.
 * @param {string|number} raw
 * @returns {boolean}
 */
export function isNegativeAgeValue(raw) {
  if (raw === '' || raw === null || raw === undefined) return false;
  const num = Number(raw);
  return !Number.isNaN(num) && num < 0;
}
