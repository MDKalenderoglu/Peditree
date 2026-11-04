/**
 * toolbarFit.js — the top bar stays one row (clinician request 2026-11-04:
 * two rows looked bad and wasted room). Rather than guess widths (Turkish
 * and English words differ, so do typefaces), it measures: the bar is laid
 * out with every word, and while it still takes a second row the next part
 * folds, one at a time, the least used first (App.jsx `data-fold-order`:
 * the brand's subtitle; then the words of Geri bildirim, Atıf, Paylaş,
 * Yazdır, Konumlandır, Ayarlar, İndir, Aç, Yeni — their icons stay; then a
 * narrower name field; last the logo's wordmark and the dividers). "Kaydet"
 * never folds. A folded word stays in its button for screen readers, and
 * every button says what it does in its tooltip (ui.css `.folded`). Only a
 * window narrower than all of that (a tablet upright) takes two rows.
 */

/** Does the bar take more than one row? (its items' middles differ by more than half an item) */
export function wraps(el) {
  const items = [...el.children].filter((c) => c.offsetWidth > 0);
  if (items.length < 2) return false;
  const mids = items.map((c) => c.offsetTop + c.offsetHeight / 2);
  const half = Math.max(...items.map((c) => c.offsetHeight)) / 2;
  return Math.max(...mids) - Math.min(...mids) > half;
}

/** Fold the bar as little as it takes to fit one row; returns how many steps it took. */
export function fitToolbar(el) {
  if (!el) return 0;
  const parts = [...el.querySelectorAll('[data-fold-order]')];
  const last = Math.max(0, ...parts.map((p) => Number(p.dataset.foldOrder)));
  const foldTo = (level) => {
    for (const p of parts) p.classList.toggle('folded', Number(p.dataset.foldOrder) <= level);
    el.setAttribute('data-fold', String(level));
  };
  let level = 0;
  foldTo(0);
  while (level < last && wraps(el)) foldTo(++level);
  return level;
}
