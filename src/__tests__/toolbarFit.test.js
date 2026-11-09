/**
 * toolbarFit.test.js — the top bar keeps to one row (clinician request
 * 2026-11-04): while it would take two rows, the next part folds, the least
 * used first, and "Kaydet" never. The page has no layout in jsdom, so the
 * bar here is laid out by a small flow model: items side by side, a new row
 * when the next one does not fit; a folded word gives its width back.
 */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { fitToolbar, wraps, overflowed, watchToolbar } from '../utils/toolbarFit';

/**
 * A bar of `width` px holding [name, width, foldOrder?, wordWidth?, overflowOrder?] items; "more" (⋯)
 * takes its room only while something went into it, an item in it none.
 */
function bar(width, items) {
  const el = document.createElement('div');
  const kids = items.map(([name, w, order, word = 0, extra]) => {
    const c = document.createElement('div');
    c.dataset.name = name;
    c.dataset.w = w;
    if (extra) { c.dataset.overflowOrder = extra; c.dataset.overflow = name; }
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
    if (c.classList.contains('overflowed')) return 0;
    if (c.dataset.name === 'more' && !el.classList.contains('has-overflow')) return 0;
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

  it('a tablet: when even the icons do not fit, the least used buttons go into "Diğer" one at a time; Kaydet, Geri al, Yinele, İndir and Ayarlar stay (clinician report 2026-11-09)', () => {
    // a finger's buttons are larger: 44 px icons
    const TOUCH = [
      ['brand', 130, 1, 40], ['name', 150], ['date', 160],
      ['Yeni', 90, 11, 46, 5], ['Aç', 80, 10, 36, 6], ['Kaydet', 95],
      ['undo', 44], ['redo', 44], ['Konumlandır', 140, 6, 96, 8],
      ['Çoklu seçim', 140, 7, 96, 7], ['İndir', 60], ['Yazdır', 44, 0, 0, 3], ['Paylaş', 44, 0, 0, 4],
      ['Atıf', 90, 3, 46, 1], ['Geri bildirim', 140, 2, 96, 2], ['more', 44], ['Ayarlar', 110, 8, 66],
    ];
    const iconsOnly = TOUCH.reduce((sum, [, w, , word = 0]) => sum + w - word, 0) - 44; // "more" not yet shown
    // the icons alone just fit: nothing goes into Diğer, and Diğer does not show
    const fits = bar(iconsOnly + 5, TOUCH);
    fitToolbar(fits);
    expect(wraps(fits)).toBe(false);
    expect(overflowed(fits)).toEqual([]);
    expect(fits.classList.contains('has-overflow')).toBe(false);
    // a tablet in landscape (a little short): only the least used go
    const landscape = bar(iconsOnly - 60, TOUCH);
    fitToolbar(landscape);
    expect(wraps(landscape)).toBe(false);
    expect(landscape.classList.contains('has-overflow')).toBe(true);
    expect(overflowed(landscape)).toEqual(['Atıf', 'Geri bildirim', 'Yazdır']);
    // upright: more go, in their order; the essentials never
    const upright = bar(760, TOUCH);
    fitToolbar(upright);
    expect(wraps(upright)).toBe(false);
    expect(overflowed(upright)).toEqual(['Atıf', 'Geri bildirim', 'Yazdır', 'Paylaş', 'Yeni', 'Aç', 'Çoklu seçim', 'Konumlandır'].slice(0, overflowed(upright).length));
    expect(overflowed(upright).length).toBeGreaterThan(3);
    for (const kept of ['Kaydet', 'undo', 'redo', 'İndir', 'Ayarlar', 'more']) expect(upright.querySelector(`[data-name="${kept}"]`).offsetWidth).toBeGreaterThan(0);
    // wide again: everything is back on the bar
    const wide = bar(5000, TOUCH);
    for (const c of upright.querySelectorAll('.overflowed')) wide.querySelector(`[data-name="${c.dataset.name}"]`).classList.add('overflowed');
    fitToolbar(wide);
    expect(overflowed(wide)).toEqual([]);
    expect(wide.classList.contains('has-overflow')).toBe(false);
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
  it('the words grow after the first fit (the typeface arrives late): the bar is fitted again, though its width is the same', () => {
    const el = bar(total, ITEMS);
    Object.defineProperty(el, 'clientWidth', { get: () => total });
    let changed = null;
    class FakeObserver { constructor(cb) { changed = cb; } observe() {} disconnect() {} }
    const stop = watchToolbar(el, FakeObserver);
    expect(folded(el)).toEqual([]);
    // the real typeface: Konumlandır's word is wider now, the bar takes a second row
    el.querySelector('[data-name="Konumlandır"]').dataset.w = 170;
    expect(wraps(el)).toBe(true);
    changed();
    expect(wraps(el)).toBe(false);
    expect(folded(el).length).toBeGreaterThan(0);
    stop();
  });
});
