/**
 * keyboardRoom.js — a phone's on-screen keyboard never hides the box being
 * typed in (clinician report 2026-11-17, iPhone: the sheet's boxes stood
 * under the keyboard). A phone's browser does not make the page shorter when
 * the keyboard opens: only what is in sight (window.visualViewport) shrinks,
 * and whatever is fixed to the bottom of the page — the person's sheet — stays
 * behind the keyboard. While a box has the keyboard:
 *   - <html> carries `kb-open`, and the room in sight as CSS values: --kb (the
 *     keyboard's height below what is in sight), --vvh (the height in sight),
 *     --vvtop (how far the sight is moved down the page); ui.css then stands
 *     the sheet and the dialogs inside what is in sight;
 *   - the box itself is brought into sight: its scrolling part (the sheet's
 *     body, a dialog's) is scrolled; a box over the drawing (the drawing's own
 *     text box) is lifted above the keyboard.
 * Nothing changes on a computer or with no keyboard: no box, no keyboard
 * (under KB_MIN), or no visualViewport.
 */
import { useEffect } from 'react';

export const KB_MIN = 120; // px: less is a bar the browser shows, not a keyboard
const TEXT_TYPES = new Set(['text', 'search', 'email', 'tel', 'url', 'number', 'password', 'date', '']);

/** A box the keyboard writes in. */
export function takesKeyboard(el) {
  if (!el || !el.tagName) return false;
  if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
  return el.tagName === 'INPUT' && TEXT_TYPES.has(String(el.getAttribute('type') || '').toLowerCase());
}

/** What is in sight: the keyboard's height below it, its height and how far it is moved down the page. */
export function sightOf(win = window) {
  const vv = win.visualViewport;
  if (!vv) return null;
  const vvh = Math.round(vv.height), vvtop = Math.max(0, Math.round(vv.offsetTop || 0));
  return { kb: Math.max(0, Math.round(win.innerHeight - vvh - vvtop)), vvh, vvtop };
}

function scrollingParent(el) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}

/** The box brought into what is in sight (`sight` from sightOf), with a small margin. */
export function reveal(el, sight, margin = 12) {
  if (!el || !sight) return;
  if (el.style && el.style.translate && el.classList.contains('inline-edit')) el.style.translate = '';
  const r = el.getBoundingClientRect();
  const top = sight.vvtop + margin, bottom = sight.vvtop + sight.vvh - margin;
  const below = r.bottom - bottom, above = top - r.top;
  if (below <= 0 && above <= 0) return;
  const box = scrollingParent(el);
  if (box) {
    box.scrollTop += below > 0 ? below : -above;
    return;
  }
  // a box over the drawing (PedigreeCanvas inline-edit): lifted above the keyboard
  if (below > 0 && el.classList.contains('inline-edit')) el.style.translate = `0 ${-Math.round(below)}px`;
}

/** Mounted once (App): follows the keyboard while a box has it. */
export function useKeyboardRoom() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const root = document.documentElement;
    let raf = 0;
    const timers = new Set();
    const update = () => {
      const el = document.activeElement;
      const sight = sightOf(window);
      const open = !!sight && takesKeyboard(el) && sight.kb >= KB_MIN;
      root.classList.toggle('kb-open', open);
      if (open) {
        root.style.setProperty('--kb', `${sight.kb}px`);
        root.style.setProperty('--vvh', `${sight.vvh}px`);
        root.style.setProperty('--vvtop', `${sight.vvtop}px`);
      } else {
        ['--kb', '--vvh', '--vvtop'].forEach((k) => root.style.removeProperty(k));
      }
      // once the sheet and dialogs stand in what is in sight, the box itself
      if (sight && takesKeyboard(el)) requestAnimationFrame(() => reveal(document.activeElement, sightOf(window)));
    };
    const soon = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    // the keyboard comes up a moment after the box is touched: looked at again then
    const focused = () => {
      soon();
      const id = setTimeout(() => { timers.delete(id); soon(); }, 350);
      timers.add(id);
    };
    vv.addEventListener('resize', soon);
    vv.addEventListener('scroll', soon);
    document.addEventListener('focusin', focused);
    document.addEventListener('focusout', soon);
    return () => {
      vv.removeEventListener('resize', soon);
      vv.removeEventListener('scroll', soon);
      document.removeEventListener('focusin', focused);
      document.removeEventListener('focusout', soon);
      cancelAnimationFrame(raf);
      for (const id of timers) clearTimeout(id);
      root.classList.remove('kb-open');
      ['--kb', '--vvh', '--vvtop'].forEach((k) => root.style.removeProperty(k));
    };
  }, []);
}
