/**
 * conditionKey.js — the pedigree's findings key (legend) and how each finding
 * marks a symbol. NSGC 2022 (Bennett et al., Figure 2 and §4.5): the symbol
 * is divided among what the person has, each part in a fill pattern of its
 * own, defined in the legend (clinician decision 2026-11-16, replacing the
 * fixed quarter per finding of 2026-10-24: with a carrier's half and three or
 * more findings the quarters crowded into slivers no one could read).
 *
 * Model: graph.conditionKey = [{ id, label, fill }] — one entry per finding
 * that at least one person has (person.conditions[].label, matched without
 * case). The fill is the finding's sign, unique in the key: a new finding
 * gets the next free one, the clinician may choose another; it keeps it while
 * the pedigree is edited. An entry nobody has any more is dropped. An entry
 * from an older file keeps its fill; its quarter (region) is dropped, and of
 * two entries with one fill the later gets the next free one. finalize.js
 * keeps the key in step after every operation.
 */
import { tk } from '../i18n';

export const normLabel = (label) => String(label ?? '').trim().toLocaleLowerCase('tr');

// in the order a new finding is offered them
export const FILLS = ['solid', 'hatch', 'dots', 'grey', 'horiz', 'vert', 'back', 'checker'];
export const FILL_LABEL = {
  solid: tk('Siyah'), hatch: tk('Tarama'), dots: tk('Noktalı'), grey: tk('Gri'),
  horiz: tk('Yatay çizgili'), vert: tk('Dikey çizgili'), back: tk('Ters tarama'), checker: tk('Damalı'),
};
/**
 * A carrier without a named finding (person.carrier): the left half in a
 * pattern of its own, never a finding's, explained in the key as
 * "Taşıyıcı" (NSGC 2022 §4.5: no carrier dot — a divided symbol, a fill
 * pattern defined in the legend; clinician decision 2026-11-02).
 */
export const CARRIER_FILL = 'cross';
/**
 * How the viewer wants that carrier drawn (Ayarlar → Çizim, a device
 * preference — the file never changes; clinician decisions 2026-11-04 and
 * 2026-11-16, 2026-11-17): 'half' the left half solid as most publications draw
 * a carrier — the default (clinician decision 2026-11-17: a carrier is drawn
 * solid, not patterned) —, 'split' the NSGC 2022 left half above, or 'dot' the
 * classic dot in the middle (NSGC 2008) — each explained in the key. A
 * carried finding with a name keeps its own pattern in all: a dot cannot say
 * which. With 'half' the carrier's half is always solid; what would meet it
 * changes instead (displayStyles).
 */
export const CARRIER_MARKS = [
  { id: 'half', label: tk('Yarısı siyah (klasik)') },
  { id: 'split', label: tk('Bölünmüş (NSGC 2022)') },
  { id: 'dot', label: tk('Ortada nokta') },
];

const conditionsOf = (p) => (Array.isArray(p.conditions) ? p.conditions : []).filter((c) => c && typeof c.label === 'string' && c.label.trim());
const isPlainCarrier = (p) => !!p.carrier && !conditionsOf(p).some((c) => c.status === 'carrier');
// "affected" set by hand without a finding named: the whole symbol solid, or the right half beside a carrier's (the proband aside)
export const isUnnamedAffected = (p) => !!p.affected && !p.proband && !conditionsOf(p).some((c) => c.status === 'affected');

/**
 * How the drawing shows the key (the stored key never changes). Solid black is
 * kept for what reads as solid without a name where that is drawn: a plain
 * carrier's half with "Yarısı siyah (klasik)" (clinician 2026-11-16: the
 * carrier mark never changes; what would meet it changes instead), and a
 * person marked "affected" without a finding named. A finding whose fill is
 * solid is then shown in the next free fill, in the drawing and the key alike.
 * affectedFill: the fill of "affected" without a name drawn beside a carrier
 * whose half is already solid ("Etkilenmiş" in the key). halfFree is false
 * only when no fill is left for such a finding: then plain carriers keep the
 * NSGC 2022 hatching.
 */
export function displayStyles(people = [], key = [], carrierMark = 'half') {
  const out = key.map((e) => ({ ...e }));
  const used = () => new Set(out.map((e) => e.fill));
  // in place of black, the boldest pattern first (checkered reads as dark; the two hatchings are kept apart)
  const free = () => ['checker', 'horiz', 'vert', 'dots', 'grey', 'hatch', 'back'].find((f) => !used().has(f));
  const reserve = (carrierMark === 'half' && people.some(isPlainCarrier)) || (out.length > 0 && people.some(isUnnamedAffected));
  let halfFree = true;
  const solid = out.find((e) => e.fill === 'solid');
  if (reserve && solid) {
    const f = free();
    if (f) solid.fill = f;
    else if (carrierMark === 'half') halfFree = false;
  }
  const affectedFill = free() || 'grey';
  return { key: halfFree ? out : key, halfFree, affectedFill };
}

const validStyle = (e) => FILLS.includes(e.fill);

// one fill per finding: when all are used no new finding can be drawn apart
// from the others; adding one is refused with this message (clinician
// decision 2026-10-25: an explicit warning, the clinician simplifies)
export const KEY_CAPACITY = FILLS.length;
export const KEY_FULL_MESSAGE = tk('8 bulgu sınırına ulaşıldı: her bulgu sembolde kendine ait bir desenle gösterildiğinden kullanılabilecek desen kalmadı. Yeni bir bulgu eklemek için benzer bulgular tek bir ad altında toplanabilir ya da gereksiz bir bulgu kaldırılabilir.');

export function keyFull(key = []) {
  return new Set(key.filter(validStyle).map((e) => e.fill)).size >= KEY_CAPACITY;
}

/** The next free fill, in the order of FILLS; null when all are used. */
export function suggestStyle(key = []) {
  const taken = new Set(key.filter(validStyle).map((e) => e.fill));
  const fill = FILLS.find((f) => !taken.has(f));
  return fill ? { fill } : null;
}

export function styleTaken(key, { fill }, exceptLabel) {
  return (key || []).some((e) => e.fill === fill && normLabel(e.label) !== normLabel(exceptLabel));
}

// only for a file from elsewhere with more findings than fills (the editor
// refuses one more): it is still drawn, sharing the first fill
const FALLBACK_STYLE = { fill: 'solid' };

/** Bring graph.conditionKey in step with the people's findings (in place). */
export function deriveConditionKey(graph) {
  const used = new Map(); // norm → first label seen
  for (const p of graph.individuals) {
    for (const c of conditionsOf(p)) if (!used.has(normLabel(c.label))) used.set(normLabel(c.label), c.label.trim());
  }
  const key = [];
  for (const e of graph.conditionKey || []) {
    if (!used.has(normLabel(e.label))) continue;
    // an entry with no fill, or one another entry already has, gets the next free fill; a quarter from before is dropped
    const fill = validStyle(e) && !styleTaken(key, e) ? e.fill : (suggestStyle(key) || FALLBACK_STYLE).fill;
    key.push({ id: e.id, label: e.label, fill });
  }
  const have = new Set(key.map((e) => normLabel(e.label)));
  let n = Math.max(0, ...key.map((e) => Number(String(e.id).replace(/^k/, '')) || 0));
  for (const [norm, label] of used) {
    if (have.has(norm)) continue;
    key.push({ id: `k${++n}`, label, ...(suggestStyle(key) || FALLBACK_STYLE) });
    have.add(norm);
  }
  graph.conditionKey = key;
  return graph;
}

/** The key entry for a label, or undefined. */
export function keyEntry(key, label) {
  const n = normLabel(label);
  return (key || []).find((e) => normLabel(e.label) === n);
}

/** Index of the key entry for a label, or -1. */
export function keyIndex(key, label) {
  const n = normLabel(label);
  return (key || []).findIndex((e) => normLabel(e.label) === n);
}

/**
 * How a person's symbol is marked:
 *   { mode: 'none' }   — empty
 *   { mode: 'full' }   — solid: affected with no finding named; the proband
 *                        with findings (written beside the symbol in the key,
 *                        clinician decision 2026-10-25)
 *   { mode: 'regions', parts: [{ fill, a0, a1, carrier, label?, plain?, unnamed? }] }
 *                        angles in degrees, 0 = east, clockwise; a part of
 *                        360 degrees is the whole symbol
 * NSGC 2022: the symbol is divided among what the person has, in equal parts,
 * each in its own fill, in the order of the key, starting at the top and going
 * clockwise; one finding fills the whole symbol. A carrier is drawn on the
 * LEFT half (the carried finding's fill, several sharing the half from the
 * top; without a name CARRIER_FILL, or solid with 'half') and the findings
 * share the RIGHT half; "affected" without a name fills the right half
 * (solid, or styles.affectedFill when the carrier's half is solid). With
 * carrierMark 'dot' a plain carrier is drawn as the rest of the symbol plus
 * { dot: true } — a dot in the middle (CARRIER_MARKS).
 */
export function fillFor(person, key = [], carrierMark = 'half', styles = {}) {
  if (carrierMark === 'dot' && person.carrier) {
    // the dot: the rest of the symbol as for a non-carrier; a carried finding with a name keeps its half
    const f = regionsFor(person, key, false, styles, carrierMark);
    return f.parts?.some((p) => p.carrier) ? f : { ...f, dot: true };
  }
  return regionsFor(person, key, !!person.carrier, styles, carrierMark);
}

function regionsFor(person, key, plainCarrierHalf, styles, carrierMark) {
  const marks = [];
  for (const c of conditionsOf(person)) {
    if (c.status !== 'affected' && c.status !== 'carrier') continue;
    const e = keyEntry(key, c.label);
    if (!e || !validStyle(e) || marks.some((m) => m.label === e.label)) continue;
    marks.push({ label: e.label, fill: e.fill, carrier: c.status === 'carrier', at: keyIndex(key, e.label) });
  }
  const byKey = (a, b) => a.at - b.at;
  const affected = marks.filter((m) => !m.carrier).sort(byKey);
  const carried = marks.filter((m) => m.carrier).sort(byKey);
  if (person.proband && affected.length) return { mode: 'full' };
  const share = (list, from, span) => list.map((m, k) => ({
    label: m.label, fill: m.fill, carrier: m.carrier,
    a0: from + (k * span) / list.length, a1: from + ((k + 1) * span) / list.length,
  }));
  if (!carried.length && !plainCarrierHalf) {
    if (affected.length) return { mode: 'regions', parts: share(affected, 270, 360) };
    return { mode: person.affected ? 'full' : 'none' };
  }
  // the left half: what the person carries, from the top down
  const plainSolid = carrierMark === 'half' && styles.halfFree !== false;
  const left = carried.length
    ? share(carried, 270, -180).map((p) => ({ ...p, a0: p.a1, a1: p.a0 }))
    : [{ fill: plainSolid ? 'solid' : CARRIER_FILL, carrier: true, plain: plainSolid || undefined, a0: 90, a1: 270 }];
  const parts = [...left];
  if (affected.length) parts.push(...share(affected, 270, 180));
  else if (person.affected) {
    const leftSolid = left.some((p) => p.fill === 'solid');
    parts.push({ fill: leftSolid ? (styles.affectedFill || 'grey') : 'solid', carrier: false, unnamed: true, a0: 270, a1: 450 });
  }
  return { mode: 'regions', parts };
}
