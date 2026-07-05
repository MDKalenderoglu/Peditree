/**
 * pedigreeNumbering.js
 *
 * v0.3a.3 — pedigree-standard visible identifiers: Roman-numeral generation
 * labels (I, II, III, ...) and left-to-right per-generation numbering
 * (I-1, I-2, II-1, II-2, II-3, ...), per the classical pedigree convention
 * (confirmed against the reference PDF and reference pedigree images —
 * oldest generation at the top gets "I", generations increase downward,
 * individuals within a generation are numbered left to right by their
 * rendered position).
 *
 * This is purely a DISPLAY layer — it never replaces or reads from the
 * internal deterministic ID scheme (`mother`, `mat_gf`, `sib_m_0`, ...),
 * which remains the graph's real identity. Clinicians should never need to
 * see the internal ID; the pedigree ID (e.g. "II-3") is what's shown on
 * canvas, in the selected-person editor, and in export.
 *
 * Derived entirely from `nodes` (each already carrying `.generation` and
 * `.x` from pedigreeLayout.js) — no new store state, no layout changes.
 * Recomputing this on every render means birth-order changes (which move
 * `x`) automatically renumber correctly with no extra plumbing.
 */

const ROMAN_NUMERALS = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

/**
 * Convert a positive integer to a Roman numeral. Pedigree generations are
 * always 1-indexed for display (the oldest generation present is always
 * "I", regardless of what internal `generation` number it happens to carry
 * — see `computePedigreeIds`), so this never needs to handle zero/negative
 * input in practice, but degrades gracefully (returns '' ) if it ever does.
 *
 * @param {number} num
 * @returns {string}
 */
export function toRomanNumeral(num) {
  if (!Number.isFinite(num) || num < 1) return '';
  let n = Math.floor(num);
  let result = '';
  for (const [value, symbol] of ROMAN_NUMERALS) {
    while (n >= value) {
      result += symbol;
      n -= value;
    }
  }
  return result;
}

/**
 * Compute the pedigree-standard display ID for every node.
 *
 * @param {Array<{ id: string, generation: number, x: number }>} nodes
 * @returns {Map<string, { generationLabel: string, indexInGeneration: number, displayId: string }>}
 *   keyed by each node's internal `id`
 */
export function computePedigreeIds(nodes) {
  const result = new Map();
  if (!nodes || nodes.length === 0) return result;

  const generations = [...new Set(nodes.map(n => n.generation))].sort((a, b) => a - b);
  const generationRank = new Map(generations.map((g, i) => [g, i + 1])); // 1-indexed, oldest = I

  // Group by generation, then sort each group left-to-right by x.
  const byGeneration = new Map();
  for (const node of nodes) {
    if (!byGeneration.has(node.generation)) byGeneration.set(node.generation, []);
    byGeneration.get(node.generation).push(node);
  }

  for (const [generation, groupNodes] of byGeneration) {
    const sorted = [...groupNodes].sort((a, b) => a.x - b.x);
    const generationLabel = toRomanNumeral(generationRank.get(generation));
    sorted.forEach((node, idx) => {
      const indexInGeneration = idx + 1;
      result.set(node.id, {
        generationLabel,
        indexInGeneration,
        displayId: `${generationLabel}-${indexInGeneration}`,
      });
    });
  }

  return result;
}
