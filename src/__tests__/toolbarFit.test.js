/**
 * toolbarFit.test.js — the top bar keeps to one row (clinician request
 * 2026-11-04): while it would take two rows, the next part folds, the least
 * used first, and "Kaydet" never. The page has no layout in jsdom, so the
 * bar here is laid out by a small flow model: items side by side, a new row
 * when the next one does not fit; a folded word gives its width back.
 */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { fitToolbar, wraps } from '../utils/toolbarFit';

/** A bar of `width` px holding [name, width, foldOrder?, wordWidth?] items. */
function bar(width, items) {
  const el = document.createElement('div');
  const kids = items.map(([name, w, order, word = 0]) => {
    const c = document.createElement('div');
    c.dataset.name = name;
    c.dataset.w = w;
    if (order) {
      const label = document.createElement('span');
      label.dataset.foldOrder = order;
      label.dataset.word = word;
      c.appendChild(label);
    }
    el.appendChild(c);
    return c;
  });
  const widthOf = (c) => {
    const label = c.querySelector('[data-fold-order]');
    const folded = label && label.classList.contains('folded');
    return folded ? Number(c.dataset.w) - Number(label.dataset.word) : Number(c.dataset.w);
  };
  const layout = () => {
    let x = 0, row = 0;
    return new Map(kids.map((c) => {
      const w = widthOf(c);
      if (x + w > width && x > 0) { row += 1; x = 0; }
      x += w;
      return [c, row];
    }));
  };
  for (const c of kids) {
    Object.defineProperty(c, 'offsetWidth', { get: () => widthOf(c) });
    Object.defineProperty(c, 'offsetHeight', { get: () => 34 });
    Object.defineProperty(c, 'offsetTop', { get: () => layout().get(c) * 44 });
  }
  return el;
}

const folded = (el) => [...el.querySelectorAll('.folded')].map((l) => l.parentNode.dataset.name);
// widths roughly as on screen: a word of 60 px beside its 30 px icon
const ITEMS = [
  ['brand', 150, 1, 70], ['name', 180], ['date', 170],
  ['Yeni', 90, 11, 50], ['Aç', 70, 10, 30], ['Kaydet', 95],
  ['undo', 34], ['redo', 34], ['Konumlandır', 130, 6, 95],
  ['İndir', 100, 9, 45], ['Yazdır', 90, 5, 55], ['Paylaş', 90, 4, 55],
  ['Atıf', 70, 3, 35], ['Geri bildirim', 130, 2, 95], ['Ayarlar', 100, 8, 60],
];
const total = ITEMS.reduce((sum, [, w]) => sum + w, 0);

describe('the top bar keeps to one row', () => {
  it('wide enough: nothing folds', () => {
    const el = bar(total + 10, ITEMS);
    expect(fitToolbar(el)).toBe(0);
    expect(folded(el)).toEqual([]);
    expect(wraps(el)).toBe(false);
  });

  it('a little narrower: only the least used fold, in their order (subtitle, Geri bildirim, Atıf …)', () => {
    const el = bar(total - 100, ITEMS);
    fitToolbar(el);
    expect(wraps(el)).toBe(false);
    expect(folded(el)).toEqual(['brand', 'Geri bildirim']);
  });

  it('narrower still: more fold, Kaydet never; Yeni is the last word to go', () => {
    const el = bar(total - 500, ITEMS);
    fitToolbar(el);
    expect(wraps(el)).toBe(false);
    expect(folded(el)).not.toContain('Kaydet');
    expect(folded(el)).not.toContain('Yeni');
    const all = bar(400, ITEMS);
    fitToolbar(all);
    expect(folded(all)).toEqual(expect.arrayContaining(['Yeni', 'Aç', 'İndir', 'Ayarlar']));
    expect(folded(all)).not.toContain('Kaydet');
  });

  it('wider again: the words come back', () => {
    const el = bar(total - 500, ITEMS);
    fitToolbar(el);
    expect(folded(el).length).toBeGreaterThan(0);
    // the same bar measured at full width (the page widened): everything unfolds
    const wide = bar(total + 10, ITEMS);
    for (const l of el.querySelectorAll('.folded')) wide.querySelector(`[data-name="${l.parentNode.dataset.name}"] span`).classList.add('folded');
    fitToolbar(wide);
    expect(folded(wide)).toEqual([]);
  });
});
