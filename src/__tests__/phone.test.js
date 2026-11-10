// @vitest-environment jsdom
/**
 * phone.test.js — the touch mode (clinician request 2026-11-10: on a phone the desktop screen, made
 * smaller, could not be used — the ring covered the drawing, the panel ate the page, icons said too
 * little). The real app in a simulated browser whose window matches a phone: a short top bar (Menü with
 * every action named, the patient, Kaydet), the drawing over the whole screen, and a sheet with the
 * person's labelled tiles — the ring's own choices — that is drawn up for the details and down to close.
 * Same pedigree, same operations: what a tile does is what the ring does.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount, settle, createElement } from './support/dom';
import App from '../App';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { useViewSettings } from '../utils/drawingStyle';

const S = () => usePedigreeStore.getState();
let view;
let realMatch;
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const buttons = (root = document) => [...root.querySelectorAll('button')];
const named = (name, root) => buttons(root).find((b) => b.getAttribute('aria-label') === name || b.textContent.trim() === name);
const run = (fn) => settle(fn);
const click = (el) => run(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
const drawn = (id) => $$('.node-group').find((el) => el.__data__ && el.__data__.id === id);
const tile = (name) => $$('.touch-sheet .dock-tile').find((b) => b.getAttribute('aria-label') === name);
const pointerAt = (type, y) => {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: y });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  return ev;
};
const dragGrip = async (dy) => {
  const grip = $('.touch-sheet .sheet-grip');
  await run(() => grip.dispatchEvent(pointerAt('pointerdown', 400)));
  await run(() => grip.dispatchEvent(pointerAt('pointermove', 400 + dy)));
  await run(() => grip.dispatchEvent(pointerAt('pointerup', 400 + dy)));
};

beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  realMatch = window.matchMedia;
  // a phone: its query matches, nothing else does
  window.matchMedia = (q) => ({ matches: /max-width:\s*600px/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  useViewSettings.getState().setView({ tourOffer: false, touchMode: 'auto' });
  view = mount(createElement(App));
  await settle();
});
afterAll(() => { view.unmount(); window.matchMedia = realMatch; useViewSettings.getState().setView({ touchMode: 'auto' }); });
beforeEach(async () => { await run(() => { useViewSettings.getState().setView({ touchMode: 'auto' }); S().resetPedigree(); }); });

describe('the touch mode turns on by itself on a phone; Ayarlar can turn it off', () => {
  it('a phone gets the touch screen; "Kapalı" brings back the computer screen, "Açık" keeps it on anywhere', async () => {
    expect($('.app-shell').classList.contains('touch')).toBe(true);
    expect($('.toolbar').classList.contains('touch-bar')).toBe(true);
    await run(() => useViewSettings.getState().setView({ touchMode: 'off' }));
    expect($('.app-shell').classList.contains('touch')).toBe(false);
    expect($('.toolbar > .patient-name')).not.toBeNull(); // the computer's bar, the name field on it
  });
});

describe('the top bar: Menü with every action named, the patient, Kaydet', () => {
  it('Menü lists every action by name; Ayarlar from there opens the settings', async () => {
    await click(named('Menü', $('.toolbar')));
    const items = [...$('.more-popover').querySelectorAll('b')].map((b) => b.textContent);
    expect(items).toEqual(['Geri al', 'Yinele', 'Yeni', 'Aç', 'Konumlandır', 'Yazdır', 'Paylaş', 'Ayarlar', 'Tanıtım turu', 'Atıf', 'Geri bildirim', 'PediTree hakkında']);
    await click([...$('.more-popover').querySelectorAll('.download-item')].find((b) => b.textContent.includes('Ayarlar')));
    expect($('.settings-dialog')).not.toBeNull();
    await click([...$('.settings-dialog').querySelectorAll('[role="tab"]')].find((b) => b.textContent.includes('Görünüm')));
    expect([...$('.settings-dialog').querySelectorAll('.set-row-title')].map((x) => x.textContent)).toContain('Dokunmatik görünüm');
    await run(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  });

  it('the patient button shows the name; it opens the name and date of birth', async () => {
    await run(() => S().setPatientName('Ayşe Yılmaz'));
    const btn = named('Hasta bilgileri', $('.toolbar'));
    expect(btn.textContent).toContain('Ayşe Yılmaz');
    await click(btn);
    expect($('.patient-popover .patient-name').value).toBe('Ayşe Yılmaz');
    expect($('.patient-popover .birth-date')).not.toBeNull();
    await run(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  });
});

describe('a person tapped: the sheet with the ring’s choices as named tiles', () => {
  it('eight named tiles, no ring over the drawing; Kardeş opens its list with words, and Kız adds a sister', async () => {
    await click(drawn('proband'));
    expect($('.radial-ring')).toBeNull();
    expect($$('.touch-sheet .dock-tile').map((b) => b.textContent)).toEqual(['Ebeveyn', 'Kardeş', 'Eş', 'Çocuk', 'Bulgu', 'Durum', 'İkiz', 'Bilgiler']);
    const before = S().doc.graph.individuals.length;
    await click(tile('Kardeş'));
    const list = $('.touch-sheet .radial-flyout');
    expect([...list.querySelectorAll('.dock-word')].map((w) => w.textContent)).toEqual(expect.arrayContaining(['Erkek', 'Kız', 'Düşük']));
    await click([...list.querySelectorAll('.quick-btn')].find((b) => b.querySelector('.dock-word')?.textContent === 'Kız'));
    expect(S().doc.graph.individuals.length).toBe(before + 1);
    expect(S().doc.graph.individuals.at(-1).sex).toBe('female');
  });

  it('Durum opens its list in the sheet; a choice there marks the person', async () => {
    await click(drawn('mother'));
    await click(tile('Durum'));
    const affected = [...$('.touch-sheet .radial-panel').querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Etkilenmiş');
    await click(affected);
    expect(S().doc.graph.individuals.find((i) => i.id === 'mother').affected).toBe(true);
  });

  it('"Ayrıntılar" or drawing the handle up shows the details; down goes back to the tiles, down again closes', async () => {
    await click(drawn('mother'));
    await click(named('Ayrıntılar', $('.touch-sheet')));
    expect($('.touch-sheet').classList.contains('sheet-full')).toBe(true);
    expect($('.touch-sheet .editor-panel, .touch-sheet .card')).not.toBeNull();
    await dragGrip(80); // down: back to the tiles
    expect($('.touch-sheet').classList.contains('sheet-full')).toBe(false);
    expect($('.touch-sheet .dock-tile')).not.toBeNull();
    await dragGrip(-80); // up: the details
    expect($('.touch-sheet').classList.contains('sheet-full')).toBe(true);
    await dragGrip(80);
    await dragGrip(80); // down from the tiles: the sheet closes, the person is let go
    expect($('.touch-sheet')).toBeNull();
    expect(S().selectedIds || []).toEqual([]);
  });

  it('a couple (the line between them) goes straight to the details: no tiles for two people', async () => {
    await run(() => S().selectIndividual('father'));
    await run(() => S().selectIndividual('mother', { additive: true }));
    expect($('.touch-sheet')).not.toBeNull();
    expect($('.touch-sheet .dock-tile')).toBeNull();
    expect($('.touch-sheet').classList.contains('sheet-full')).toBe(true);
  });
});

describe('a reminder to save', () => {
  it('after a change not yet saved, the phone is told that its browser may close the tab; × puts it away', async () => {
    await run(() => S().setPatientName('')); // (a name typed in an earlier test would count as unsaved work)
    expect($('.save-tip')).toBeNull();
    await run(() => S().addSiblingTo('proband', 'female'));
    expect($('.save-tip').textContent).toMatch(/arka planda kalan sekmeleri kapatabilir/);
    await click($('.save-tip .notice-dismiss'));
    expect($('.save-tip')).toBeNull();
  });
});

describe('the stylesheet', () => {
  it('portrait: a sheet from below; landscape: a column at the right; the bar keeps Menü, the patient and Kaydet', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/ui.css'), 'utf8');
    expect(css).toMatch(/\.app-shell\.touch \.touch-sheet \{\s*display: flex; flex-direction: column; position: fixed; left: 0; right: 0; bottom: 0;/);
    expect(css).toMatch(/@media \(orientation: landscape\) \{\s*\.app-shell\.touch\.has-editor \{ grid-template-columns: minmax\(0, 1fr\) 320px; \}/);
    expect(css).toMatch(/\.toolbar\.touch-bar > \* \{ display: none; \}/);
    expect(css).toMatch(/\.radial-menu\.ring-dock \{ position: static; width: auto; height: auto; pointer-events: auto;/);
  });
});
