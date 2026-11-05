/**
 * symbolText.js — the lines written under a symbol, and how much room they
 * take (clinician report 2026-11-05: a genetic result under a partner ran
 * across the couple's line of descent). The drawing writes these lines
 * (PedigreeCanvas annotations); the layout keeps them clear of lines and of
 * each other (pcl/index.js gaps, routing.js row bands). One source for both,
 * so the room the layout gives is the room the drawing takes.
 */
import { isSmallSymbol, isPregnancy, GENETIC_TESTED, TESTED_TEXT, geneticLines } from '../graph/model';
import { annotationAge, pregnancyLine, lmpLine } from './annotations';
import { packLines } from './textWrap';
import { t } from '../i18n';

/** A text of spaces only is nothing to read (an older file may hold one). */
export const filled = (s) => typeof s === 'string' && s.trim() !== '';

/** Findings with the age they were diagnosed at (shown in the notes). */
export const onsetsOf = (n) => (n.conditions || []).filter(c => c && c.label && c.onsetAge && (c.status === 'affected' || c.status === 'carrier'));
/** Findings the clinician is unsure about (shown in the notes). */
export const unsureOf = (n) => (n.conditions || []).filter(c => c && c.label && c.status === 'unknown');
/** The week a child was born in (kept from a pregnancy, shown in the notes). */
export const bornWeek = (n) => (!isPregnancy(n) && n.gestationWeeks ? n.gestationWeeks : null);
/** Has the person a numbered entry in the notes under the pedigree ([1] under the symbol)? */
export const hasNoteNumber = (n) => filled(n.notes) || filled(n.condition) || (n.deceased && filled(n.causeOfDeath))
  || onsetsOf(n).length > 0 || unsureOf(n).length > 0 || !!bornWeek(n);

/** The genetic test lines under a symbol, each wrapped (~20 characters fit between two siblings), never cut. */
export function geneticRows(d, testedText) {
  if (d.geneticTest !== GENETIC_TESTED) return [];
  const lines = geneticLines(d);
  if (!lines.length) return [{ text: testedText, k: 0, value: '', placeholder: true }];
  return lines.flatMap((line, k) => packLines([{ text: line }], d.proband || d.consultand ? 17 : 20)
    .map(part => ({ text: part.map(x => x.text).join(''), k, value: line })));
}

// what the drawing uses (PedigreeCanvas): sizes in px
export const TEXT = {
  HALF: 20, LOSS: 14,           // half a symbol; a small triangle
  FIRST: 14, LINE: 13, GENETIC: 11,
  PROBAND_SHIFT: 14,            // the proband's lines stand right of the arrow
  ADOPTED_EXTRA: 9,             // below an adopted person's brackets
  // a character's width in font sizes, generous: measured up to 0.635 with the
  // drawing's typefaces at their own scale (Patrick Hand, Caveat ×1.15), 2026-11-05
  EM: 0.68,
};
const LANGS = ['tr', 'en'];
const CONDITION_MAX = 15;

/**
 * How far the text under a symbol reaches: `left` / `right` of the symbol's
 * centre and `depth` below it, in px. The longer of the two languages, so
 * the layout does not move when the drawing's language changes.
 */
export function textBox(d, { bracketed = !!d.adoptedOut } = {}) {
  const small = isSmallSymbol(d);
  const half = small ? TEXT.LOSS : TEXT.HALF;
  const widths = [];
  let lines = 0;
  const line = (texts, size) => {
    const shown = texts.filter(Boolean);
    if (!shown.length) return;
    lines += 1;
    widths.push(Math.max(...shown.map(s => String(s).length)) * size * TEXT.EM);
  };
  line([d.sexAtBirth], 11);
  line(LANGS.map(l => annotationAge(d, l)?.text), 11);
  line(LANGS.map(l => pregnancyLine(d, l)), 11);
  line(LANGS.map(l => lmpLine(d, l)), 11);
  const rows = LANGS.map(l => geneticRows(d, t(TESTED_TEXT, null, l)));
  const genetic = Math.max(...rows.map(r => r.length));
  for (const r of rows) for (const row of r) widths.push(row.text.length * 9 * TEXT.EM);
  line([d.displayLabel], 11);
  line([filled(d.condition) ? d.condition.slice(0, CONDITION_MAX) : ''], 10);
  if (hasNoteNumber(d)) line(['[99]'], 9);
  const halfText = widths.length ? Math.max(...widths) / 2 : 0;
  const shift = d.proband || d.consultand ? TEXT.PROBAND_SHIFT : 0;
  const depth = lines || genetic
    ? half + TEXT.FIRST + lines * TEXT.LINE + genetic * TEXT.GENETIC + (bracketed ? TEXT.ADOPTED_EXTRA : 0)
    : half;
  return { left: Math.max(half, halfText - shift), right: Math.max(half, halfText ? halfText + shift : 0), depth };
}
