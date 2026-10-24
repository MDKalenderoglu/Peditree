/**
 * conditionKey.js — the pedigree's findings key (legend) and how each finding
 * marks a symbol (NSGC: a symbol divided into regions, each region one
 * finding, defined in the legend; clinician requests 2026-10-24).
 *
 * Model: graph.conditionKey = [{ id, label, region, fill }] — one entry per
 * finding that at least one person has (person.conditions[].label, matched
 * without case).
 *   region: 'q1' upper-left · 'q2' upper-right · 'q3' lower-right · 'q4' lower-left
 *   fill:   'solid' · 'hatch' · 'dots' · 'grey'
 * (region, fill) is the finding's signature — unique in the key. A new
 * finding gets the next free signature (four quadrants in solid first), the
 * clinician may choose another; it then keeps it while the pedigree is
 * edited. An entry nobody has any more is dropped. finalize.js keeps the key
 * in step after every operation.
 */

export const normLabel = (label) => String(label ?? '').trim().toLocaleLowerCase('tr');

export const REGIONS = ['q1', 'q2', 'q3', 'q4'];
export const REGION_LABEL = { q1: 'Sol üst', q2: 'Sağ üst', q3: 'Sağ alt', q4: 'Sol alt' };
export const FILLS = ['solid', 'hatch', 'dots', 'grey'];
export const FILL_LABEL = { solid: 'Siyah', hatch: 'Tarama', dots: 'Noktalı', grey: 'Gri' };
// angles (degrees, screen: 0 = east, clockwise)
export const REGION_ANGLES = { q1: [180, 270], q2: [270, 360], q3: [0, 90], q4: [90, 180] };

const personLabels = (p) => (Array.isArray(p.conditions) ? p.conditions : [])
  .map((c) => (c && typeof c.label === 'string' ? c.label.trim() : ''))
  .filter(Boolean);

const signature = (e) => `${e.region}|${e.fill}`;
const validStyle = (e) => REGIONS.includes(e.region) && FILLS.includes(e.fill);

/** The next free (region, fill): quadrants in solid first, then the other fills. */
export function suggestStyle(key = []) {
  const taken = new Set(key.filter(validStyle).map(signature));
  for (const fill of FILLS) for (const region of REGIONS) if (!taken.has(`${region}|${fill}`)) return { region, fill };
  return { region: 'q1', fill: 'solid' };
}

export function styleTaken(key, { region, fill }, exceptLabel) {
  return (key || []).some((e) => validStyle(e) && e.region === region && e.fill === fill && normLabel(e.label) !== normLabel(exceptLabel));
}

/** Bring graph.conditionKey in step with the people's findings (in place). */
export function deriveConditionKey(graph) {
  const used = new Map(); // norm → first label seen
  for (const p of graph.individuals) {
    for (const label of personLabels(p)) if (!used.has(normLabel(label))) used.set(normLabel(label), label);
  }
  const key = [];
  for (const e of graph.conditionKey || []) {
    if (!used.has(normLabel(e.label))) continue;
    // an entry from before styles existed (or a clash) gets the next free signature
    key.push(validStyle(e) && !styleTaken(key, e) ? e : { ...e, ...suggestStyle(key) });
  }
  const have = new Set(key.map((e) => normLabel(e.label)));
  let n = Math.max(0, ...key.map((e) => Number(String(e.id).replace(/^k/, '')) || 0));
  for (const [norm, label] of used) {
    if (have.has(norm)) continue;
    key.push({ id: `k${++n}`, label, ...suggestStyle(key) });
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
 *   { mode: 'none' }   — empty (a person-level carrier: classic half fill)
 *   { mode: 'full' }   — solid: affected with no finding named
 *   { mode: 'regions', parts: [{ region, fill, a0, a1, carrier }] }
 * Each finding the person is affected by fills its region; a carrier of a
 * finding gets half of the region (clinician decision 2026-10-24). Two
 * findings of one person sharing a region (more than four findings in the
 * pedigree) split that region between them.
 */
export function fillFor(person, key = []) {
  const conds = (Array.isArray(person.conditions) ? person.conditions : [])
    .filter((c) => c && c.label && (c.status === 'affected' || c.status === 'carrier'));
  const marks = [];
  for (const c of conds) {
    const e = keyEntry(key, c.label);
    if (!e || !validStyle(e) || marks.some((m) => m.label === e.label)) continue;
    marks.push({ label: e.label, region: e.region, fill: e.fill, carrier: c.status === 'carrier' });
  }
  if (marks.length) {
    const parts = [];
    for (const region of REGIONS) {
      const here = marks.filter((m) => m.region === region);
      const [a0, a1] = REGION_ANGLES[region];
      const step = (a1 - a0) / (here.length || 1);
      here.forEach((m, k) => {
        const lo = a0 + step * k, hi = lo + step;
        parts.push({ region, fill: m.fill, carrier: m.carrier, a0: lo, a1: m.carrier ? (lo + hi) / 2 : hi });
      });
    }
    return { mode: 'regions', parts };
  }
  if (person.affected) return { mode: 'full' };
  return { mode: 'none' };
}
