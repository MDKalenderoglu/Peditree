/**
 * annotations.js — the age line under a symbol (NSGC: the age, or "d." and
 * the age at death for a deceased person). The age at death is shown even
 * when no age is filled in (audit 2026-10-25: it used to need an age too).
 * Pregnancy losses and stillbirths carry no age line.
 *
 * @returns {{ text, kind: 'age' | 'ageAtDeath', value } | null}
 */
export function annotationAge(d) {
  if (!d || d.pregnancyLoss || d.stillbirth) return null;
  if (d.deceased && d.ageAtDeath) return { text: `d.${d.ageAtDeath}`, kind: 'ageAtDeath', value: d.ageAtDeath };
  if (d.age) return { text: String(d.age), kind: 'age', value: d.age };
  return null;
}
