// @vitest-environment jsdom
/**
 * A computer never stays on the phone's screen (clinician report 2026-11-11: "the screen turned into the
 * phone's"): the window looked narrow when the page first looked (opened small, or in the background)
 * and had grown before the page listened for changes, so no change ever came.
 */
import { it, expect, vi, afterAll } from 'vitest';
import { mount, settle, createElement } from './support/dom';
import App from '../App';
import { useViewSettings } from '../utils/drawingStyle';

const real = window.matchMedia;
afterAll(() => { window.matchMedia = real; });

it('a window that grew before the page listened shows the computer screen', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  useViewSettings.getState().setView({ tourOffer: false, touchMode: 'auto' });
  let narrow = true; // the first look: narrow
  window.matchMedia = (q) => {
    const phoneQuery = /max-width:\s*600px/.test(q);
    const res = { matches: phoneQuery && narrow, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
    if (phoneQuery) narrow = false; // ... and wide from then on, without a change event
    return res;
  };
  const view = mount(createElement(App));
  await settle();
  expect(document.querySelector('.app-shell').classList.contains('touch')).toBe(false);
  view.unmount();
});
