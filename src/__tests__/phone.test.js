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
import { mount, settle, createElement, act } from './support/dom';
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
    // a phone's Ayarlar: the whole screen, a list of sections in a phone's words, then the one chosen with a way back
    const dialog = $('.settings-dialog.touch');
    expect(dialog).not.toBeNull();
    const list = [...dialog.querySelectorAll('.settings-list-item')].map((b) => b.textContent.trim());
    expect(list).toEqual(['Dil', 'Görünüm', 'Çizim', 'Ekleme seçenekleri', 'Kişi ayrıntıları', 'Dosyalar', 'Semboller', 'Hakkında']);
    await click([...dialog.querySelectorAll('.settings-list-item')].find((b) => b.textContent.includes('Görünüm')));
    const rows = [...$('.settings-dialog').querySelectorAll('.set-row-title')].map((x) => x.textContent);
    expect(rows).toContain('Dokunmatik görünüm');
    expect(rows).not.toContain('Simidin saydamlığı'); // no ring on a phone
    await click($('.settings-dialog .settings-back'));
    expect($('.settings-dialog .settings-list')).not.toBeNull();
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
  it('one row of five named buttons, no ring over the drawing; Ekle shows the relatives, Kardeş its list with words, and Kız adds a sister', async () => {
    await click(drawn('proband'));
    expect($('.radial-ring')).toBeNull();
    expect($$('.touch-sheet .dock-tile').map((b) => b.textContent)).toEqual(['Ekle', 'Bulgu', 'Durum', 'Bilgiler', 'Ayrıntılar']);
    const before = S().doc.graph.individuals.length;
    await click($$('.touch-sheet .dock-tile').find((b) => b.textContent === 'Ekle'));
    expect($$('.touch-sheet .dock-chip').map((b) => b.textContent)).toEqual(['Ebeveyn', 'Kardeş', 'Eş', 'Çocuk', 'İkiz']);
    await click($$('.touch-sheet .dock-chip').find((b) => b.textContent === 'Kardeş'));
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

describe('the tour on a phone', () => {
  it('its own steps on what a phone shows: the bar, Ekle, the details, the couple, Menü, the patient, Kaydet', async () => {
    await click(named('Menü', $('.toolbar')));
    await click([...$('.more-popover').querySelectorAll('.download-item')].find((b) => b.textContent.includes('Tanıtım turu')));
    expect($('.tour.touch')).not.toBeNull();
    const shown = () => $('.tour').dataset.shown;
    const next = async (id) => {
      await run(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
      for (let i = 0; i < 40 && shown() !== id; i++) await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
      expect(shown()).toBe(id);
    };
    await next('t-drawing');
    await next('t-bar');
    expect($('.touch-sheet .dock-tile')).not.toBeNull();
    await next('t-add');
    expect($('.touch-sheet .dock-chip')).not.toBeNull(); // the tour opened "Ekle"
    await next('t-details');
    expect($('.touch-sheet').classList.contains('sheet-full')).toBe(true);
    await next('t-couple');
    expect($('.touch-sheet')).toBeNull(); // the line itself is shown, no details over it
    await next('t-arrange');
    await next('t-childless');
    expect($('.new-popover').textContent).toMatch(/Çocuksuz \/ infertil çift/);
    await next('t-menu');
    expect($('.more-popover')).not.toBeNull();
    await next('t-patient');
    await next('t-save');
    expect($('.download-popover')).not.toBeNull();
    await click($('.tour-close'));
    expect($('.tour')).toBeNull();
  });
});

describe('a reminder to save', () => {
  it('after a change not yet saved, the phone is told that its browser may close the tab; × puts it away', async () => {
    await run(() => S().setPatientName('')); // (a name typed in an earlier test would count as unsaved work)
    expect($('.save-tip')).toBeNull();
    await run(() => S().addSiblingTo('proband', 'female'));
    // one slim line with its own Kaydet; the reason in its tooltip
    expect($('.save-tip').textContent).toMatch(/Kaydedilmemiş değişiklik var/);
    expect($('.save-tip').getAttribute('title')).toMatch(/arka planda kalan sekmeleri kapatabilir/);
    await click($('.save-tip .save-tip-go'));
    expect($('.download-popover')).not.toBeNull();
    await run(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
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

describe('the phone, third request (clinician 2026-11-12)', () => {
  const drag = async (el, dy) => {
    await run(() => el.dispatchEvent(pointerAt('pointerdown', 400)));
    await run(() => el.dispatchEvent(pointerAt('pointermove', 400 + dy)));
    await run(() => el.dispatchEvent(pointerAt('pointerup', 400 + dy)));
  };
  const full = () => $('.touch-sheet').classList.contains('sheet-full');

  it('Konumlandır and the full-screen button stand on the bar right of Hasta (Sığdır stays on the drawing, 2026-11-12)', async () => {
    const bar = [...$('.toolbar').children];
    const at = (sel) => bar.findIndex((el) => el.matches(sel));
    expect(at('.touch-quick')).toBe(at('[data-popup="patient"]') + 1);
    const quick = $('.touch-quick');
    expect(buttons(quick).map((b) => b.getAttribute('aria-label'))).toEqual(['Konumlandır', 'Tam ekran']);
    expect(named('Sığdır', $('.zoom-controls'))).toBeTruthy();
    await click(named('Konumlandır', quick));
    expect(S().layoutInfo.reason).toMatch(/Konumlandır/);
    // a browser without full screen for pages (an iPhone): the button says how to get it
    await click(named('Tam ekran', quick));
    expect($('[data-popup="fullscreen"] .keys-popover').textContent).toMatch(/Ana Ekrana Ekle/);
    await run(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect($('[data-popup="fullscreen"] .keys-popover')).toBeNull();
  });

  it('the sheet: a tap on its head opens the details; drawn up from the tiles it opens, without pressing a tile; drawn down by the head it goes back', async () => {
    await click(drawn('mother'));
    expect(full()).toBe(false);
    await run(() => $('.touch-sheet .sheet-title').dispatchEvent(pointerAt('pointerdown', 400)));
    await run(() => $('.touch-sheet .sheet-title').dispatchEvent(pointerAt('pointerup', 400)));
    expect(full()).toBe(true);
    await drag($('.touch-sheet .side-header'), 90); // down by the details' head: back to the tiles
    expect(full()).toBe(false);
    const status = tile('Durum');
    await drag(status, -90); // up, starting on a tile
    await click(status); // the click a drag ends with
    expect(full()).toBe(true);
    expect($('.touch-sheet .radial-panel')).toBeNull(); // the tile did not open its list
    // a field is never a handle
    await drag($('.touch-sheet').querySelector('input, textarea'), 90);
    expect(full()).toBe(true);
    await drag($('.touch-sheet .side-header'), 90);
    await drag($('.touch-sheet .sheet-head'), 90); // down from the tiles: closed, the person let go
    expect($('.touch-sheet')).toBeNull();
  });
});


describe('the page never stays shifted up (clinician report 2026-11-12, iPhone: the top bar gone, no way back)', () => {
  it('scrolled away while nothing is typed: back to the top; while the name is typed: left alone until the box is left', async () => {
    const calls = [];
    const real = window.scrollTo;
    window.scrollTo = (x, y) => { calls.push([x, y]); document.documentElement.scrollTop = 0; };
    try {
      document.documentElement.scrollTop = 140;
      await run(() => window.dispatchEvent(new Event('scroll')));
      expect(calls).toEqual([[0, 0]]);
      // the patient's name being typed: the browser may shift the page to show the box
      await click(named('Hasta bilgileri'));
      const box = $('.patient-popover input');
      await run(() => box.focus());
      document.documentElement.scrollTop = 140;
      await run(() => window.dispatchEvent(new Event('scroll')));
      expect(calls.length).toBe(1);
      // the box left (the keyboard goes): the page comes back
      await run(() => box.blur());
      await new Promise((r) => setTimeout(r, 200));
      expect(calls.length).toBe(2);
    } finally {
      window.scrollTo = real;
      document.documentElement.scrollTop = 0;
    }
  });
});

describe('the zoom and Sığdır in reach while a person’s sheet is docked (clinician request 2026-11-12)', () => {
  it('the sheet tells the page how much of the screen it covers; the variable goes with the sheet', async () => {
    const shell = $('.app-shell');
    await run(() => S().selectIndividual('proband'));
    expect($('.touch-sheet')).not.toBeNull();
    expect(shell.style.getPropertyValue('--touch-sheet-h')).toMatch(/^\d+px$/);
    expect($('.zoom-controls')).not.toBeNull();
    await run(() => S().clearSelection());
    expect(shell.style.getPropertyValue('--touch-sheet-h')).toBe('');
  });
});

describe('the page never stays zoomed in (clinician report 2026-11-12, iPhone: the top bar gone, the sheet cut on both sides)', () => {
  it('zoomed while nothing is typed: the zoom is taken back; the page never zooms into a box; a pinch on the sheet is stopped', async () => {
    const meta = document.querySelector('meta[name="viewport"]') || document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'viewport' }));
    meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0');
    const was = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    Object.defineProperty(window, 'visualViewport', { value: { scale: 2.3, addEventListener() {}, removeEventListener() {} }, configurable: true });
    try {
      await run(() => window.dispatchEvent(new Event('scroll')));
      expect(meta.getAttribute('content')).toMatch(/user-scalable=no/);
      await new Promise((r) => setTimeout(r, 450));
      expect(meta.getAttribute('content')).toBe('width=device-width, initial-scale=1.0, maximum-scale=1.0');
    } finally {
      if (was) Object.defineProperty(window, 'visualViewport', was); else delete window.visualViewport;
    }
    // a pinch outside the drawing is stopped, on the drawing it is the drawing's
    const pinch = (el) => { const e = new Event('gesturestart', { bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; };
    expect(pinch($('.toolbar'))).toBe(true);
    expect(pinch($('#pedigree-svg'))).toBe(false);
  });
});

describe('the phone, fourth request (clinician 2026-11-12)', () => {
  it('a browser with full screen: the button asks it, and shows the way back', async () => {
    const el = document.documentElement;
    let asked = 0;
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
    el.requestFullscreen = () => { asked++; Object.defineProperty(document, 'fullscreenElement', { value: el, configurable: true }); document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve(); };
    try {
      // the hook reads the browser when the bar is drawn: draw it again
      await run(() => useViewSettings.getState().setView({ touchMode: 'off' }));
      await run(() => useViewSettings.getState().setView({ touchMode: 'auto' }));
      await click(named('Tam ekran', $('.touch-quick')));
      expect(asked).toBe(1);
      expect(named('Tam ekrandan çık', $('.touch-quick'))).toBeTruthy();
    } finally {
      delete document.fullscreenEnabled; delete document.fullscreenElement; delete el.requestFullscreen;
      document.dispatchEvent(new Event('fullscreenchange'));
    }
  });

  it('Menü → Yeni opens its two choices (its window stood inside a hidden box); Menü opens over a person’s sheet', async () => {
    await click(named('Menü', $('.toolbar')));
    await click([...$('.more-popover').querySelectorAll('.download-item')].find((b) => b.textContent.includes('Yeni')));
    const pop = $('.new-popover');
    expect(pop).not.toBeNull();
    expect([...pop.querySelectorAll('b')].map((b) => b.textContent)).toEqual(['Yeni aile', 'Çocuksuz / infertil çift', 'Akraba evliliği']);
    const css = readFileSync(join(process.cwd(), 'src/styles/ui.css'), 'utf8');
    expect(css).toMatch(/\.toolbar\.touch-bar \.toolbar-group > \.keys-wrap:not\(\[data-popup="download"\]\), \.toolbar\.touch-bar \.toolbar-end > \.keys-wrap:not\(\.toolbar-more\) \{ display: contents; \}/);
    // the bar (and what it opens) above the person's sheet
    const z = (sel) => Number((new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{[^}]*z-index: (\\d+)').exec(css) || [])[1]);
    expect(z('.toolbar.touch-bar')).toBeGreaterThan(z('.app-shell.touch .touch-sheet'));
    await run(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  });

  it('the birth date typed as digits alone gets its dots, and is kept as a date', async () => {
    await click(named('Hasta bilgileri'));
    const box = $('.patient-popover .birth-date');
    const typeKey = (ch) => run(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(box, box.value + ch);
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    box.focus();
    for (const ch of '12122000') await typeKey(ch);
    expect(box.value).toBe('12.12.2000');
    await run(() => box.blur());
    expect(S().doc.graph.individuals.find((i) => i.proband).birthDate).toBe('2000-12-12');
    await run(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  });
});

describe('a couple without children (clinician request 2026-11-12)', () => {
  it('Yeni → "Çocuksuz / infertil çift": the proband and a partner, two bars under their line; a child added takes the mark away', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      await click(named('Menü', $('.toolbar')));
      await click([...$('.more-popover').querySelectorAll('.download-item')].find((b) => b.textContent.includes('Yeni')));
      await click([...$('.new-popover').querySelectorAll('.download-item')].find((b) => b.textContent.includes('Çocuksuz / infertil çift')));
      expect(confirm).toHaveBeenCalled();
      const g = S().doc.graph;
      const u = g.unions.find((x) => x.partners.includes('proband'));
      const partner = g.individuals.find((i) => i.id === u.partners.find((p) => p !== 'proband'));
      expect(partner.sex).not.toBe(g.individuals.find((i) => i.id === 'proband').sex);
      expect(u.childless).toBe('infertile');
      // the proband's parents stay
      expect(g.parentChildRelationships.some((r) => r.children.includes('proband'))).toBe(true);
      // drawn: two bars under the couple
      expect(S().pedigreeData.edges.some((e) => e.type === 'childless' && e.unionId === u.id && e.kind === 'infertile')).toBe(true);
      // a child born later: the mark goes by itself
      await run(() => S().addChildToUnion(u.id, 'female'));
      expect(S().doc.graph.unions.find((x) => x.id === u.id).childless).toBeUndefined();
    } finally {
      confirm.mockRestore();
    }
  });
});

