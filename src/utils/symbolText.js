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

/**
 * Ayarlar → Çizim → Yazı boyutu scales every text of the drawing (clinician
 * request 2026-11-05: not only the key and the notes). A device preference
 * (drawingStyle.js sets it); the layout reads it here, so a larger text gets
 * more room. The symbols themselves keep their size.
 */
let SCALE = 1;
export function setTextScale(k) { SCALE = Number.isFinite(k) && k > 0 ? k : 1; }
export const textScale = () => SCALE;
const CONDITION_MAX = 15;

/** The words on a "same village" couple's relationship line: the clinician's, or "Aynı köy". */
export const lineNoteText = (note, lang) => (filled(note) ? note : t('Aynı köy', null, lang));
export const LINE_NOTE_SIZE = 10; // px, as drawn (PedigreeCanvas)
/** How wide those words are at most (both languages, so the layout does not move with the language). */
export const lineNoteWidth = (note) => Math.max(...LANGS.map((l) => lineNoteText(note, l).length)) * LINE_NOTE_SIZE * TEXT.EM * SCALE;

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
    widths.push(Math.max(...shown.map(s => String(s).length)) * size * TEXT.EM * SCALE);
  };
  line([d.sexAtBirth], 11);
  line(LANGS.map(l => annotationAge(d, l)?.text), 11);
  line(LANGS.map(l => pregnancyLine(d, l)), 11);
  line(LANGS.map(l => lmpLine(d, l)), 11);
  const rows = LANGS.map(l => geneticRows(d, t(TESTED_TEXT, null, l)));
  const genetic = Math.max(...rows.map(r => r.length));
  for (const r of rows) for (const row of r) widths.push(row.text.length * 9 * TEXT.EM * SCALE);
  line([d.displayLabel], 11);
  line([filled(d.condition) ? d.condition.slice(0, CONDITION_MAX) : ''], 10);
  if (hasNoteNumber(d)) line(['[99]'], 9);
  const halfText = widths.length ? Math.max(...widths) / 2 : 0;
  const arrow = !!(d.proband || d.consultand);
  const shift = arrow ? TEXT.PROBAND_SHIFT : 0;
  const depth = lines || genetic
    ? half + (TEXT.FIRST + lines * TEXT.LINE + genetic * TEXT.GENETIC) * SCALE + (bracketed ? TEXT.ADOPTED_EXTRA : 0) + belowArrow(d, widths.length ? widths[0] / 2 : 0)
    : half;
  // the arrow stands at the lower left, or at the lower right where a line takes the left (PedigreeCanvas,
  // clinician report 2026-11-12): the lines move away from it, to either side — room on both
  const reach = Math.max(half, halfText ? halfText + shift : 0);
  return { left: arrow ? reach : Math.max(half, halfText - shift), right: reach, depth };
}

/**
 * The first line under the proband's / consultand's symbol so wide that, moved aside from the arrow, it may
 * still reach the arrow's tip (the LMP under a pregnancy, a long label): room is kept for the lines to start
 * below the arrow — the drawing moves them there only when, measured, they do reach it (PedigreeCanvas;
 * clinician report 2026-11-12). Returns that room in px (0 for everyone else).
 */
export const ARROW_DROP = 22;
export function belowArrow(d, firstHalf) {
  if (!(d.proband || d.consultand)) return 0;
  const half = isSmallSymbol(d) ? TEXT.LOSS : TEXT.HALF;
  return firstHalf > TEXT.PROBAND_SHIFT + half + 3 ? ARROW_DROP * SCALE : 0;
}
