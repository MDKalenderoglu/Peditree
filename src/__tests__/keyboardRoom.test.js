// @vitest-environment jsdom
/**
 * keyboardRoom.test.js — a phone's keyboard never hides the box being typed in (clinician report
 * 2026-11-17, iPhone: the sheet's boxes stood under the keyboard). The real app on a simulated phone
 * whose browser, like a phone's, keeps the page as tall as it was and shrinks only what is in sight
 * (window.visualViewport): a box in the sheet takes the keyboard, the page says how much room is left,
 * and the stylesheet stands the sheet and the dialogs in it; the box is scrolled or lifted into sight.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount, settle, createElement } from './support/dom';
import App from '../App';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { useViewSettings } from '../utils/drawingStyle';
import { reveal, sightOf, takesKeyboard, KB_MIN } from '../utils/keyboardRoom';

const S = () => usePedigreeStore.getState();
const html = () => document.documentElement;
const run = (fn) => settle(fn);
const frame = () => new Promise((r) => setTimeout(r, 30));
let view, realMatch, realVV;
// a phone 390 × 844 whose sight shrinks to `h` when the keyboard comes up
const vv = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1, width: 390 });
const keyboard = async (h) => {
  vv.height = h;
  await run(() => vv.dispatchEvent(new Event('resize')));
  await frame();
  await settle();
};

beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  realMatch = window.matchMedia;
  realVV = Object.getOwnPropertyDescriptor(window, 'visualViewport');
  window.matchMedia = (q) => ({ matches: /max-width:\s*600px/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
  useViewSettings.getState().setView({ tourOffer: false, touchMode: 'auto' });
  view = mount(createElement(App));
  await settle();
});
afterAll(() => {
  view.unmount();
  window.matchMedia = realMatch;
  if (realVV) Object.defineProperty(window, 'visualViewport', realVV); else delete window.visualViewport;
});

describe('the keyboard and what is in sight (clinician report 2026-11-17)', () => {
  it('a box in the sheet takes the keyboard: the page says the room left; gone with the keyboard; nothing without a box', async () => {
    await run(() => { S().resetPedigree(); S().selectIndividual('father'); });
    const box = [...document.querySelectorAll('.touch-sheet input, .touch-sheet textarea')].find(takesKeyboard)
      || (() => { const i = document.createElement('input'); document.querySelector('.touch-sheet').appendChild(i); return i; })();
    // the keyboard up with nothing typed in (a bar the browser shows): nothing changes
    await keyboard(500);
    expect(html().classList.contains('kb-open')).toBe(false);
    await run(() => box.focus());
    await keyboard(500);
    expect(html().classList.contains('kb-open')).toBe(true);
    expect(html().style.getPropertyValue('--kb')).toBe('344px');
    expect(html().style.getPropertyValue('--vvh')).toBe('500px');
    // a short bar of the browser is not a keyboard
    await keyboard(844 - KB_MIN + 20);
    expect(html().classList.contains('kb-open')).toBe(false);
    await keyboard(500);
    expect(html().classList.contains('kb-open')).toBe(true);
    // the browser moves the sight down the page to show the box (iPhone 2026-11-17): still a keyboard, the sheet's
    // foot where the sight ends
    vv.offsetTop = 344;
    await keyboard(500);
    expect(html().classList.contains('kb-open')).toBe(true);
    expect(html().style.getPropertyValue('--kb')).toBe('0px');
    expect(html().style.getPropertyValue('--vvtop')).toBe('344px');
    vv.offsetTop = 0;
    await keyboard(500);
    await run(() => box.blur());
    await keyboard(844);
    expect(html().classList.contains('kb-open')).toBe(false);
    expect(html().style.getPropertyValue('--kb')).toBe('');
  });

  it('the stylesheet stands the sheet and the dialogs in what is in sight while the keyboard is open', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/ui.css'), 'utf8');
    const rule = (sel) => { const at = css.indexOf(`${sel} {`); return at < 0 ? '' : css.slice(at, css.indexOf('}', at)); };
    const sheet = rule('html.kb-open .app-shell.touch .touch-sheet, html.kb-open .app-shell.touch .touch-sheet.sheet-full');
    expect(sheet).toMatch(/bottom: calc\(var\(--kb, 0px\) \+ 6px\)/);
    expect(sheet).toMatch(/max-height: min\(calc\(var\(--vvh, 100dvh\) - 12px\), calc\(var\(--vvh, 100dvh\) \+ var\(--vvtop, 0px\) - var\(--touch-bar-h, 56px\) - 14px\)\)/);
    expect(sheet).toMatch(/top: auto/);
    expect(rule('html.kb-open .settings-backdrop, html.kb-open .relation-backdrop')).toMatch(/top: var\(--vvtop, 0px\); height: var\(--vvh, 100dvh\)/);
    // the person's buttons step aside while typing (iPhone 2026-11-17: the bar stood over the genetic box)
    expect(rule('html.kb-open .app-shell.touch .touch-sheet .dock-tiles, html.kb-open .app-shell.touch .touch-sheet .dock-add')).toMatch(/display: none/);
  });
});

describe('the box brought into sight', () => {
  const sight = { kb: 344, vvh: 500, vvtop: 0 };
  const boxAt = (top, height = 30) => ({ top, bottom: top + height, left: 0, right: 100, width: 100, height });

  it('in a scrolling part (the sheet\'s body): scrolled up just enough; already in sight: left as it is', () => {
    const body = document.createElement('div');
    body.style.overflowY = 'auto';
    Object.defineProperty(body, 'scrollHeight', { value: 900 });
    Object.defineProperty(body, 'clientHeight', { value: 300 });
    const input = document.createElement('input');
    body.appendChild(input);
    document.body.appendChild(body);
    input.getBoundingClientRect = () => boxAt(620);
    reveal(input, sight);
    expect(body.scrollTop).toBe(620 + 30 - (500 - 12));
    body.scrollTop = 0;
    input.getBoundingClientRect = () => boxAt(200);
    reveal(input, sight);
    expect(body.scrollTop).toBe(0);
    body.remove();
  });

  it('in sight but under the scrolling part\'s own edge (iPhone 2026-11-17): scrolled into what the part shows', () => {
    const body = document.createElement('div');
    body.style.overflowY = 'auto';
    Object.defineProperty(body, 'scrollHeight', { value: 900 });
    Object.defineProperty(body, 'clientHeight', { value: 300 });
    body.getBoundingClientRect = () => ({ top: 100, bottom: 400, left: 0, right: 390, width: 390, height: 300 });
    const input = document.createElement('input');
    body.appendChild(input);
    document.body.appendChild(body);
    input.getBoundingClientRect = () => boxAt(380); // above the keyboard (500), below the part's edge (400)
    reveal(input, sight);
    expect(body.scrollTop).toBe(380 + 30 - (400 - 12));
    body.remove();
  });

  it('the drawing\'s own text box: lifted above the keyboard, put back once in sight', () => {
    const input = document.createElement('input');
    input.className = 'input inline-edit';
    document.body.appendChild(input);
    input.getBoundingClientRect = () => boxAt(700);
    reveal(input, sight);
    expect(input.style.translate).toMatch(new RegExp(`^0(px)? -${700 + 30 - (500 - 12)}px$`));
    input.getBoundingClientRect = () => boxAt(100);
    reveal(input, sight);
    expect(input.style.translate).toBe('');
    input.remove();
  });

  it('what is in sight is read from visualViewport; a keyboard only for boxes that type', () => {
    expect(sightOf({ innerHeight: 844, visualViewport: { height: 500, offsetTop: 40 } })).toEqual({ kb: 304, vvh: 500, vvtop: 40, shrunk: 344 });
    expect(sightOf({ innerHeight: 844 })).toBeNull();
    const make = (tag, type) => { const e = document.createElement(tag); if (type) e.setAttribute('type', type); return e; };
    expect([make('input'), make('input', 'text'), make('textarea'), make('input', 'checkbox'), make('button')].map(takesKeyboard)).toEqual([true, true, true, false, false]);
  });
});
