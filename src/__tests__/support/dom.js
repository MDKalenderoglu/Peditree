/**
 * dom.js — render the real app or a component in a simulated browser
 * (jsdom) and read what it draws: behaviour tests instead of matching the
 * source code (Codex audit 2026-11-01). A test file that uses it starts
 * with `// @vitest-environment jsdom`.
 *
 * jsdom has no layout engine: text widths, boxes and fonts are stubbed
 * with plain estimates — enough to draw; geometry that needs real
 * measurement is checked in the browser (src/audit/markCollisions.js).
 */
import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

let installed = false;
export function installDomStubs() {
  if (installed) return;
  installed = true;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const proto = window.SVGElement.prototype;
  // about 6 px per character at the drawing's text size
  if (!proto.getComputedTextLength) proto.getComputedTextLength = function () { return (this.textContent || '').length * 6; };
  if (!proto.getBBox) proto.getBBox = function () { return { x: 0, y: 0, width: (this.textContent || '').length * 6, height: 12 }; };
  if (!proto.getScreenCTM) proto.getScreenCTM = function () { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; }, multiply() { return this; } }; };
  if (!document.fonts) Object.defineProperty(document, 'fonts', { value: { ready: Promise.resolve(), addEventListener() {}, removeEventListener() {}, check: () => true } });
  if (!window.matchMedia) window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  if (!window.ResizeObserver) window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!window.scrollTo) window.scrollTo = () => {};
}

/** Mount a React element; returns { container, rerender, unmount }. */
export function mount(element) {
  installDomStubs();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return {
    container,
    rerender: (el) => act(() => root.render(el)),
    unmount: () => { act(() => root.unmount()); container.remove(); },
  };
}

/** Run a store action (or any state change) and let React and D3 redraw. */
export async function settle(fn) {
  await act(async () => { if (fn) fn(); await new Promise((r) => setTimeout(r, 0)); });
}

export { createElement, act };
