/**
 * conditionKey.js — the pedigree's condition key (legend) and which part of
 * a symbol each condition fills (NSGC: a symbol divided into regions, each
 * region one condition, defined in the legend; clinician request 2026-10-24).
 *
 * Model: graph.conditionKey = [{ id, label }] — one entry per condition that
 * at least one person has (person.conditions[].label, matched without
 * case). The position in the key is the condition's region: 1 upper-left,
 * 2 upper-right, 3 lower-right, 4 lower-left; with more than four
 * conditions, equal pie sectors clockwise from 12 o'clock. New conditions
 * are appended, so a condition keeps its region while the pedigree is
 * edited; an entry nobody has any more is dropped. finalize.js keeps the
 * key in step after every operation.
 */

export const normLabel = (label) => String(label ?? '').trim().toLocaleLowerCase('tr');

const personLabels = (p) => (Array.isArray(p.conditions) ? p.conditions : [])
  .map((c) => (c && typeof c.label === 'string' ? c.label.trim() : ''))
  .filter(Boolean);

/** Bring graph.conditionKey in step with the people's conditions (in place). */
export function deriveConditionKey(graph) {
  const used = new Map(); // norm → first label seen
  for (const p of graph.individuals) {
    for (const label of personLabels(p)) if (!used.has(normLabel(label))) used.set(normLabel(label), label);
  }
  const key = (graph.conditionKey || []).filter((e) => used.has(normLabel(e.label)));
  const have = new Set(key.map((e) => normLabel(e.label)));
  let n = Math.max(0, ...key.map((e) => Number(String(e.id).replace(/^k/, '')) || 0));
  for (const [norm, label] of used) {
    if (have.has(norm)) continue;
    key.push({ id: `k${++n}`, label });
    have.add(norm);
  }
  graph.conditionKey = key;
  return graph;
}

/** Index of the key entry for a label, or -1. */
export function keyIndex(key, label) {
  const n = normLabel(label);
  return (key || []).findIndex((e) => normLabel(e.label) === n);
}

/**
 * How a person's symbol is filled:
 *   { mode: 'none' }                       — empty
 *   { mode: 'full' }                       — solid (one condition in the
 *                                            pedigree, or affected with no
 *                                            condition named)
 *   { mode: 'segments', count, filled, carriers } — region indices
 */
export function fillFor(person, key = []) {
  const conds = (Array.isArray(person.conditions) ? person.conditions : []).filter((c) => c && c.label);
  const affected = conds.filter((c) => c.status === 'affected').map((c) => keyIndex(key, c.label)).filter((i) => i >= 0);
  const carriers = conds.filter((c) => c.status === 'carrier').map((c) => keyIndex(key, c.label)).filter((i) => i >= 0);
  if (key.length >= 2 && (affected.length || carriers.length)) {
    return { mode: 'segments', count: Math.max(4, key.length), filled: [...new Set(affected)], carriers: [...new Set(carriers)] };
  }
  if (affected.length || person.affected) return { mode: 'full' };
  return { mode: 'none' };
}

/** Angles (degrees, screen coordinates: 0 = east, clockwise) of region i of n. */
export function regionAngles(i, n) {
  if (n === 4) return [180 + 90 * i, 270 + 90 * i]; // upper-left first, clockwise
  const step = 360 / n;
  return [-90 + step * i, -90 + step * (i + 1)];
}
