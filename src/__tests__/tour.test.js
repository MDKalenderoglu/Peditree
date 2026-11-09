// @vitest-environment jsdom
/**
 * tour.test.js — the guided tour (Tour.jsx; clinician request 2026-11-09: an assistant could not find
 * the ring, the side panel, birth order, consanguinity, saving …). The real app in a simulated browser:
 * the first opening offers the tour once; the tour runs on a sample family and gives back the patient's
 * drawing untouched (document, undo, selection), never saves the sample over the session's copy, takes
 * no key of the page, sets the screen up for each step (ring, panel, settings) and points at a part of
 * the top bar in "Diğer" when it went there.
 *
 * jsdom has no layout: every element gets a small box here so the tour can light it up.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { mount, settle, createElement, act } from './support/dom';
import App from '../App';
import { usePedigreeStore, flushAutosave } from '../state/usePedigreeStore';
import { useViewSettings } from '../utils/drawingStyle';
import { TOUR_STEPS, placeCard } from '../components/Tour';

const S = () => usePedigreeStore.getState();
const SESSION = 'clinical_pedigree_app.session.v2';
let view;
const $ = (sel) => document.querySelector(sel);
const run = (fn) => settle(fn);
const click = (el) => run(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
const key = (k, opts = {}) => run(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts })));
const buttonNamed = (text, root = document) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text || b.getAttribute('aria-label') === text);
const step = () => ($('.tour') ? $('.tour').dataset.step : null);
const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const index = (id) => TOUR_STEPS.findIndex((x) => x.id === id);
const goTo = async (id) => {
  for (let i = 0; i < TOUR_STEPS.length && step() !== id; i++) await key(index(id) > index(step()) ? 'ArrowRight' : 'ArrowLeft');
  expect(step()).toBe(id);
  await wait(80);
};

let rect;
beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  // a box for everything on the page (jsdom lays nothing out)
  rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    return { left: 100, top: 100, right: 160, bottom: 140, width: 60, height: 40, x: 100, y: 100 };
  };
  useViewSettings.getState().setView({ tourOffer: true });
  view = mount(createElement(App));
  await settle();
});
afterAll(() => { view.unmount(); Element.prototype.getBoundingClientRect = rect; });
beforeEach(async () => {
  if ($('.tour')) await key('Escape');
  await run(() => { S().resetPedigree(); });
});

describe('the first opening offers the tour', () => {
  it('a card offers it once; "Sonra" puts it off for good on this device, "?" in the top bar still opens the tour', async () => {
    expect($('.tour-offer')).not.toBeNull();
    await click(buttonNamed('Sonra', $('.tour-offer')));
    expect($('.tour-offer')).toBeNull();
    expect(useViewSettings.getState().view.tourOffer).toBe(false);
    await click(buttonNamed('Tanıtım turu'));
    expect(step()).toBe('welcome');
    await key('Escape');
    expect($('.tour')).toBeNull();
    expect($('.tour-offer')).toBeNull();
  });

  it('starting it from the card also stops the offer', async () => {
    await run(() => useViewSettings.getState().setView({ tourOffer: true }));
    await click(buttonNamed('Turu başlat', $('.tour-offer')));
    expect(step()).toBe('welcome');
    expect(useViewSettings.getState().view.tourOffer).toBe(false);
    await key('Escape');
  });
});

describe('the tour works on a sample family and gives the patient’s drawing back untouched', () => {
  it('document, undo steps and selection come back; the sample is never written over the session’s copy, not even by a reload in the middle', async () => {
    await run(() => { S().addSiblingTo('proband', 'female'); S().setPatientName('Ayşe Yılmaz'); });
    await run(() => S().selectIndividual('mother'));
    await run(() => flushAutosave());
    const before = { doc: S().doc, history: S()._history, selected: S().selectedIds };
    const saved = window.sessionStorage.getItem(SESSION);
    expect(JSON.parse(saved).patientName).toBe('Ayşe Yılmaz');

    await click(buttonNamed('Tanıtım turu'));
    // the sample family: no patient name, an older sister beside the proband, nothing to undo
    expect(S().doc).not.toBe(before.doc);
    expect(S().doc.patientName || '').toBe('');
    expect(S()._history).toEqual([]);
    const sample = S().doc.graph.individuals;
    expect(sample.find((i) => i.id === 'proband').age).toBe('8');
    expect(sample.some((i) => i.id !== 'proband' && i.age === '12' && i.sex === 'female')).toBe(true);
    // the steps change the sample (selection, panel); nothing of it reaches the session
    await goTo('partner');
    await wait(400); // longer than the autosave's wait
    await run(() => flushAutosave());
    expect(window.sessionStorage.getItem(SESSION)).toBe(saved);

    await key('Escape');
    expect($('.tour')).toBeNull();
    expect(S().doc).toBe(before.doc);
    expect(S()._history).toBe(before.history);
    expect(S().selectedIds).toEqual(before.selected);
    expect(S().tourBackup).toBeUndefined();
  });

  it('the page takes no key while the tour runs: no delete, no undo, no save, no ring letter', async () => {
    await click(buttonNamed('Tanıtım turu'));
    await goTo('ring'); // the proband selected, the ring open
    const doc = S().doc;
    const save = vi.fn();
    const created = URL.createObjectURL;
    URL.createObjectURL = save;
    try {
      for (const [k, o] of [['Delete', {}], ['Backspace', {}], ['z', { metaKey: true }], ['s', { ctrlKey: true }], ['k', {}], ['e', {}]]) await key(k, o);
      expect(S().doc).toBe(doc);
      expect(save).not.toHaveBeenCalled();
      expect(step()).toBe('ring');
    } finally { URL.createObjectURL = created; }
    // ← and → move through the steps
    await key('ArrowLeft');
    expect(step()).toBe('drawing');
    await key('ArrowRight');
    expect(step()).toBe('ring');
    await key('Escape');
  });

  it('a tap outside the card does nothing to the page', async () => {
    await click(buttonNamed('Tanıtım turu'));
    await goTo('drawing');
    const doc = S().doc;
    await click($('.tour-block'));
    expect(S().doc).toBe(doc);
    expect(S().selectedIds || []).toEqual([]);
    expect(step()).toBe('drawing');
    await key('Escape');
  });
});

describe('each step sets the screen up as it talks about it', () => {
  it('the ring, its parts, the side panel, the name and age, the birth order, the partner’s consanguinity, the settings', async () => {
    await click(buttonNamed('Tanıtım turu'));
    const lit = () => !!$('.tour-spot');
    await goTo('drawing');
    expect(lit()).toBe(true);
    await goTo('ring');
    expect(S().selectedIds).toEqual(['proband']);
    expect($('.radial-menu .radial-ring')).not.toBeNull();
    expect(lit()).toBe(true);
    await goTo('panel');
    expect($('.app-shell').classList.contains('has-editor')).toBe(true);
    await goTo('order');
    expect($('.editor-panel').textContent).toContain('Doğum sırası');
    expect(lit()).toBe(true);
    await goTo('partner');
    expect(S().selectedIds).toEqual(['father']);
    expect([...document.querySelectorAll('.editor-panel .field-label')].some((l) => l.textContent.trim() === 'Akrabalık')).toBe(true);
    expect(lit()).toBe(true);
    await goTo('patient');
    expect(S().selectedIds || []).toEqual([]);
    await goTo('settings');
    expect($('.settings-dialog')).not.toBeNull();
    expect(lit()).toBe(true);
    await key('ArrowRight');
    expect($('.settings-dialog')).toBeNull(); // the next step closes it again
    expect(step()).toBe('again');
    // the last step: "Bitir" ends the tour
    await click(buttonNamed('Bitir', $('.tour-card')));
    expect($('.tour')).toBeNull();
  });

  it('every step’s card has its title, its text, the step count and İleri (Bitir on the last); Geri from the second on', async () => {
    await click(buttonNamed('Tanıtım turu'));
    for (let i = 0; i < TOUR_STEPS.length; i++) {
      const card = $('.tour-card');
      expect(card.getAttribute('role')).toBe('dialog');
      expect(card.querySelector('.tour-count').textContent).toBe(`${i + 1} / ${TOUR_STEPS.length}`);
      expect(card.querySelector('.tour-title').textContent.length).toBeGreaterThan(2);
      expect(card.querySelector('.tour-text').textContent.length).toBeGreaterThan(20);
      expect(!!buttonNamed('Geri', card)).toBe(i > 0);
      expect(!!buttonNamed(i === TOUR_STEPS.length - 1 ? 'Bitir' : 'İleri', card)).toBe(true);
      if (i < TOUR_STEPS.length - 1) await click(buttonNamed('İleri', card));
    }
    await key('Escape');
  });

  it('a button that went into "Diğer" (⋯) on a narrow screen is shown there, and the card says so', async () => {
    const bar = $('.toolbar');
    const moved = [...bar.querySelectorAll('[data-overflow="new"], [data-overflow="open"]')];
    moved.forEach((b) => b.classList.add('overflowed'));
    bar.classList.add('has-overflow');
    try {
      await click(buttonNamed('Tanıtım turu'));
      await goTo('file');
      expect($('.tour-note')).not.toBeNull();
      await goTo('save'); // Kaydet never goes there
      expect($('.tour-note')).toBeNull();
    } finally {
      moved.forEach((b) => b.classList.remove('overflowed'));
      bar.classList.remove('has-overflow');
      if ($('.tour')) await key('Escape');
    }
  });
});

describe('the card stands beside what it points at', () => {
  const win = { w: 1280, h: 800 };
  const card = { w: 340, h: 200 };
  it('below a part of the top bar, its arrow over the part', () => {
    const p = placeCard({ left: 700, top: 6, right: 800, bottom: 52, width: 100, height: 46 }, card, win);
    expect(p.side).toBe('below');
    expect(p.top).toBeGreaterThan(52);
    expect(p.left + p.arrow).toBeCloseTo(750, 0);
  });
  it('left of the side panel, which is as tall as the window', () => {
    const p = placeCard({ left: 950, top: 50, right: 1286, bottom: 806, width: 336, height: 756 }, card, win);
    expect(p.side).toBe('left');
    expect(p.left + card.w).toBeLessThanOrEqual(950);
  });
  it('above a part low on the screen; in the middle when there is nothing to point at; never off the window', () => {
    const above = placeCard({ left: 500, top: 600, right: 700, bottom: 780, width: 200, height: 180 }, card, win);
    expect(above.side).toBe('above');
    expect(above.top + card.h).toBeLessThanOrEqual(600);
    const mid = placeCard(null, card, win);
    expect(mid.side).toBe(null);
    expect(mid.left).toBe((1280 - 340) / 2);
    const edge = placeCard({ left: 1250, top: 6, right: 1280, bottom: 40, width: 30, height: 34 }, card, win);
    expect(edge.left + card.w).toBeLessThanOrEqual(1280 - 12);
  });
});
