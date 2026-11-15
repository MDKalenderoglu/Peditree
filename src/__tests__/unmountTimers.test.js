// @vitest-environment jsdom
/**
 * unmountTimers.test.js — the page leaves no work behind when it closes (CI 2026-11-15: the phone
 * tests ended, the app was taken down, and a "put the page back at its top" timer started by a box
 * losing focus ran 120 ms later, in a page that no longer existed). A timer the app starts is cleared
 * when the app goes.
 */
import { it, expect, vi } from 'vitest';
import { mount, settle, createElement } from './support/dom';
import App from '../App';

it('a box losing focus, then the app closing: the delayed "back to the top" never runs afterwards', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const view = mount(createElement(App));
  await settle();
  // what the delayed step reads first: count the reads once the app has gone
  let reads = 0, gone = false;
  const real = Object.getOwnPropertyDescriptor(Document.prototype, 'activeElement');
  Object.defineProperty(document, 'activeElement', { configurable: true, get() { if (gone) reads += 1; return real.get.call(this); } });
  try {
    document.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    view.unmount();
    gone = true;
    await new Promise((r) => setTimeout(r, 200));
    expect(reads).toBe(0);
  } finally {
    delete document.activeElement;
  }
});
