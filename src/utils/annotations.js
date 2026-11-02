/**
 * annotations.js — the age line under a symbol (NSGC: the age, or "d." and
 * the age at death for a deceased person). The age at death is shown even
 * when no age is filled in (audit 2026-10-25: it used to need an age too).
 * Pregnancy outcomes carry no age line (see pregnancyLine).
 *
 * @returns {{ text, kind: 'age' | 'ageAtDeath', value } | null}
 */
import { isPregnancy, pregnancyKind } from '../graph/model';
import { t } from '../i18n';
import { shownAge } from './age';

export function annotationAge(d, lang) {
  if (!d || isPregnancy(d)) return null;
  if (d.deceased && d.ageAtDeath) return { text: `d.${shownAge(d.ageAtDeath, lang)}`, kind: 'ageAtDeath', value: d.ageAtDeath };
  if (d.age) return { text: String(shownAge(d.age, lang)), kind: 'age', value: d.age };
  return null;
}

/**
 * The line below a pregnancy outcome (NSGC): "SB 28 hf", "TOP 16 hf",
 * "ECT", the week for a loss or an ongoing pregnancy ("12 hf").
 */
export function pregnancyLine(d, lang) {
  const kind = pregnancyKind(d);
  if (!kind) return null;
  const w = d.gestationWeeks ? `${d.gestationWeeks} ${t('hf', null, lang)}` : '';
  const text = { stillbirth: ['SB', w], termination: ['TOP', w], ectopic: ['ECT', w], loss: [w], ongoing: [w] }[kind].filter(Boolean).join(' ');
  return text || null;
}
