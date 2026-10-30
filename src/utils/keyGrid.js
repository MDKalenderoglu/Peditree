/**
 * keyGrid.js — the findings key in as many entries per row as the drawing's
 * width allows (clinician request 2026-10-27: one entry under another left a
 * tall empty band above the pedigree). Entries run left to right, then on to
 * the next row, in the key's own order, each as wide as itself with the same
 * gap after every one (clinician request 2026-10-30: equal gaps; columns as
 * wide as their widest entry left wide holes after short words); each row is
 * as tall as its tallest entry.
 *
 * @param {number[]} widths   width of each entry (symbol + text)
 * @param {number[]} heights  height of each entry (its wrapped lines)
 * @param {number} avail      the width the key may take
 * @param {number} gap        space between two entries
 * @returns {{ cols, width, height, cells: Array<{ x, y }> }}  cols: most entries in a row
 */
export function keyGrid(widths, heights, avail, gap) {
  if (!widths.length) return { cols: 0, width: 0, height: 0, cells: [] };
  const rows = [];
  widths.forEach((w, i) => {
    const row = rows[rows.length - 1];
    if (row && row.width + gap + w <= avail) {
      row.items.push({ i, x: row.width + gap });
      row.width += gap + w;
    } else {
      rows.push({ items: [{ i, x: 0 }], width: w });
    }
  });
  const cells = [];
  let y = 0;
  rows.forEach((row) => {
    row.items.forEach(({ i, x }) => { cells[i] = { x, y }; });
    y += Math.max(...row.items.map(({ i }) => heights[i]));
  });
  return {
    cols: Math.max(...rows.map((r) => r.items.length)),
    width: Math.max(...rows.map((r) => r.width)),
    height: y,
    cells,
  };
}
