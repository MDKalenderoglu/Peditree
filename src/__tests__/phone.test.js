// @vitest-environment jsdom
/**
 * phone.test.js — PediTree on a phone (clinician request 2026-11-10: colleagues want to use it on their
 * phones). The real app in a simulated browser whose window matches the phone width (max-width: 600px):
 * the patient's name and date of birth behind one button of the top bar, the least used buttons (also the
 * tour, Yinele and Ayarlar) in "Diğer", the side panel a sheet from below with a handle, and a reminder to
 * save, since a phone's browser closes background tabs more readily.
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
const buttons = (root = document) => [...root.querySelectorAll('button')];
const named = (name, root) => buttons(root).find((b) => b.getAttribute('aria-label') === name || b.textContent.trim() === name);
const click = (el) => settle(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
const drawn = (id) => [...document.querySelectorAll('.node-group')].find((el) => el.__data__ && el.__data__.id === id);

beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  realMatch = window.matchMedia;
  // a phone: the phone width matches, nothing else does
  window.matchMedia = (q) => ({ matches: /max-width:\s*600px/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  useViewSettings.getState().setView({ tourOffer: false });
  view = mount(createElement(App));
  await settle();
});
afterAll(() => { view.unmount(); window.matchMedia = realMatch; });
beforeEach(async () => { await settle(() => S().resetPedigree()); });

describe('the top bar of a phone', () => {
  it('the name and date of birth wait behind "Hasta bilgileri"; typed there they reach the pedigree', async () => {
    expect($('.toolbar > .patient-name')).toBeNull();
    const btn = named('Hasta bilgileri', $('.toolbar'));
    expect(btn).toBeTruthy();
    await click(btn);
    const box = $('.patient-popover');
    expect(box).not.toBeNull();
    const name = box.querySelector('.patient-name');
    await settle(() => {
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(name, 'Ayşe Yılmaz');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(S().doc.patientName).toBe('Ayşe Yılmaz');
    expect(box.querySelector('.birth-date')).not.toBeNull();
  });

  it('the tour, Yinele and Ayarlar can wait in "Diğer" and do there what they do', async () => {
    const bar = $('.toolbar');
    const moved = [...bar.querySelectorAll('[data-overflow="tour"], [data-overflow="redo"], [data-overflow="settings"]')];
    expect(moved.length).toBe(3);
    moved.forEach((b) => b.classList.add('overflowed'));
    bar.classList.add('has-overflow');
    try {
      await click(named('Diğer', bar));
      const menu = $('.more-popover');
      expect([...menu.querySelectorAll('b')].map((b) => b.textContent)).toEqual(expect.arrayContaining(['Tanıtım turu', 'Yinele', 'Ayarlar']));
      await click([...menu.querySelectorAll('.download-item')].find((b) => b.textContent.includes('Ayarlar')));
      expect($('.settings-dialog')).not.toBeNull();
      await settle(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    } finally {
      moved.forEach((b) => b.classList.remove('overflowed'));
      bar.classList.remove('has-overflow');
    }
  });
});

describe('the side panel of a phone: a sheet from below', () => {
  it('a handle draws it up to the whole screen and back; no edge to drag sideways', async () => {
    await click(drawn('mother'));
    const sheet = $('.app-shell > .side-right');
    const handle = sheet.querySelector('.sheet-handle');
    expect(handle).not.toBeNull();
    expect($('.panel-resizer')).toBeNull();
    expect(sheet.classList.contains('sheet-full')).toBe(false);
    await click(handle);
    expect($('.app-shell > .side-right').classList.contains('sheet-full')).toBe(true);
    expect(handle.getAttribute('aria-expanded')).toBe('true');
    await click($('.sheet-handle'));
    expect($('.app-shell > .side-right').classList.contains('sheet-full')).toBe(false);
  });

  it('the stylesheet makes it a sheet on a phone, and keeps the side panel elsewhere', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/ui.css'), 'utf8');
    const phone = css.slice(css.indexOf('@media (max-width: 600px) {'));
    expect(phone).toMatch(/\.app-shell > \.side-right \{\s*position: fixed; left: 0; right: 0; bottom: 0;/);
    expect(phone).toMatch(/\.app-shell > \.side-right\.sheet-full \{ height: calc\(100dvh - 64px\)/);
    expect(phone).toMatch(/\.panel-resizer \{ display: none; \}/);
    expect(css).toMatch(/\n\.sheet-handle \{ display: none; \}/); // nowhere but a phone
    // the patient window opens rightwards from its button near the bar's left end, not off the screen
    expect(css).toMatch(/\.patient-popover \{[^}]*left: -58px; right: auto;/);
  });
});

describe('a reminder to save', () => {
  it('after a change not yet saved, a phone is told that its browser may close the tab; × puts it away', async () => {
    expect($('.save-tip')).toBeNull(); // nothing to lose yet
    await settle(() => S().addSiblingTo('proband', 'female'));
    const tip = $('.save-tip');
    expect(tip).not.toBeNull();
    expect(tip.textContent).toMatch(/arka planda kalan sekmeleri kapatabilir/);
    await click(tip.querySelector('.notice-dismiss'));
    expect($('.save-tip')).toBeNull();
  });
});
