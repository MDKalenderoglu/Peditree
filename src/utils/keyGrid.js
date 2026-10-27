/**
 * keyGrid.js — the findings key in as many columns as the drawing's width
 * allows (clinician request 2026-10-27: one entry under another left a tall
 * empty band above the pedigree). Entries run left to right, then on to the
 * next row, in the key's own order; each column is as wide as its widest
 * entry, each row as tall as its tallest.
 *
 * @param {number[]} widths   width of each entry (symbol + text)
 * @param {number[]} heights  height of each entry (its wrapped lines)
 * @param {number} avail      the width the key may take
 * @param {number} gap        space between two columns
 * @returns {{ cols, width, height, cells: Array<{ x, y }> }}
 */
export function keyGrid(widths, heights, avail, gap) {
  const n = widths.length;
  if (!n) return { cols: 0, width: 0, height: 0, cells: [] };
  for (let cols = n; cols >= 1; cols--) {
    const colW = Array(cols).fill(0);
    widths.forEach((w, i) => { colW[i % cols] = Math.max(colW[i % cols], w); });
    const width = colW.reduce((a, b) => a + b, 0) + gap * (cols - 1);
    if (width > avail && cols > 1) continue;
    const rows = Math.ceil(n / cols);
    const rowH = Array(rows).fill(0);
    heights.forEach((h, i) => { rowH[Math.floor(i / cols)] = Math.max(rowH[Math.floor(i / cols)], h); });
    const colX = colW.map((_, c) => colW.slice(0, c).reduce((a, b) => a + b, 0) + gap * c);
    const rowY = rowH.map((_, r) => rowH.slice(0, r).reduce((a, b) => a + b, 0));
    return {
      cols,
      width,
      height: rowH.reduce((a, b) => a + b, 0),
      cells: widths.map((_, i) => ({ x: colX[i % cols], y: rowY[Math.floor(i / cols)] })),
    };
  }
  return { cols: 0, width: 0, height: 0, cells: [] };
}
