/**
 * barPopovers.js — where the top bar's pop-up windows open on a computer (clinician report
 * 2026-11-14: with the bar floating on the paper, the windows lay over its lower edge, and
 * "PediTree hakkında" stood further right than the bar). Each open window starts BAR_POP_GAP
 * below the bar's lower edge — the same gap as between the bar and the side panel — whatever the
 * height of the button it belongs to; "PediTree hakkında" lines up with the bar's left edge.
 * A touch screen places its windows itself (ui.css, .touch-bar .keys-popover).
 */
export const BAR_POP_GAP = 10;

export function placeBarPopovers(bar) {
  if (!bar) return;
  const b = bar.getBoundingClientRect();
  for (const pop of bar.querySelectorAll('.keys-wrap > .keys-popover')) {
    const w = pop.parentElement.getBoundingClientRect();
    pop.style.top = `${Math.round(b.bottom - w.top + BAR_POP_GAP)}px`;
    if (pop.parentElement.dataset.popup === 'about') pop.style.left = `${Math.round(b.left - w.left)}px`;
  }
}
