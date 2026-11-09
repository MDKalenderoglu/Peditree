/**
 * toolbarFit.js — the top bar stays one row (clinician request 2026-11-04:
 * two rows looked bad and wasted room). Rather than guess widths (Turkish
 * and English words differ, so do typefaces), it measures: the bar is laid
 * out with every word, and while it still takes a second row the next part
 * folds, one at a time, the least used first (App.jsx `data-fold-order`:
 * the brand's subtitle; then the words of Geri bildirim, Atıf,
 * Konumlandır, Çoklu seçim, Ayarlar, Aç, Yeni — their icons stay; then a
 * narrower name field; last the logo's wordmark and the dividers). "Kaydet"
 * never folds; İndir, Yazdır and Paylaş are icons
 * alone at every width (clinician 2026-11-05). A folded word stays in its button for screen readers, and
 * every button says what it does in its tooltip (ui.css `.folded`).
 * When even the icons do not fit (a tablet, whose buttons are larger for a finger;
 * clinician report 2026-11-09: two rows on a tablet), the least used buttons
 * go, one at a time, into "Diğer" (⋯), which then shows (`data-overflow-order`:
 * Atıf, Geri bildirim, Yazdır, Paylaş, Yeni, Aç, Çoklu seçim, Konumlandır).
 * Kaydet, Geri al, Yinele, İndir and Ayarlar always stay on the bar; last of all
 * the word "Doğum" before the birth date box gives way (an upright small tablet).
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
  const extras = [...el.querySelectorAll('[data-overflow-order]')];
  const most = Math.max(0, ...extras.map((p) => Number(p.dataset.overflowOrder)));
  const overflowTo = (n) => {
    for (const p of extras) p.classList.toggle('overflowed', Number(p.dataset.overflowOrder) <= n);
    el.classList.toggle('has-overflow', n > 0);
    el.setAttribute('data-overflow', String(n));
  };
  let level = 0;
  foldTo(0);
  overflowTo(0);
  while (level < last && wraps(el)) foldTo(++level);
  let n = 0;
  while (n < most && wraps(el)) overflowTo(++n);
  return level + n;
}

/** The buttons now in "Diğer" (⋯), by their `data-overflow` names, least used first. */
export function overflowed(el) {
  if (!el) return [];
  return [...el.querySelectorAll('.overflowed[data-overflow]')]
    .sort((a, b) => Number(a.dataset.overflowOrder) - Number(b.dataset.overflowOrder))
    .map((p) => p.dataset.overflow);
}
