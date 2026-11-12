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
// the card turns to the asked step once its screen has come to rest
const shownStep = () => ($('.tour') ? $('.tour').dataset.shown : null);
const shownAs = async (id) => { for (let i = 0; i < 40 && shownStep() !== id; i++) await wait(60); expect(shownStep()).toBe(id); };
const goTo = async (id) => {
  for (let i = 0; i < TOUR_STEPS.length && step() !== id; i++) await key(index(id) > index(step()) ? 'ArrowRight' : 'ArrowLeft');
  expect(step()).toBe(id);
  await shownAs(id);
  await wait(100);
};

// where every element stands: still at 100 unless a test moves it
const box = { left: () => 100, of: () => null };
let rect;
beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  // a box for everything on the page (jsdom lays nothing out)
  rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    const own = box.of(this);
    if (own) return own;
    const left = box.left();
    return { left, top: 100, right: left + 60, bottom: 140, width: 60, height: 40, x: left, y: 100 };
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
    await goTo('kinship');
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
    await goTo('couple');
    expect([...S().selectedIds].sort()).toEqual(['father', 'mother']); // the line between them: the couple
    expect($('.editor-panel').textContent).toContain('Bu çift');
    await goTo('kinship');
    expect([...document.querySelectorAll('.editor-panel .field-label')].some((l) => l.textContent.trim() === 'Akrabalık')).toBe(true);
    expect(lit()).toBe(true);
    await goTo('patient');
    expect(S().selectedIds || []).toEqual([]);
    await goTo('settings');
    expect($('.settings-dialog')).not.toBeNull();
    expect(lit()).toBe(true);
    await goTo('about'); // Hakkında, before the end: what PediTree is and where to report a problem
    expect($('.settings-dialog .about-links')).not.toBeNull();
    expect(lit()).toBe(true);
    await goTo('again');
    expect($('.settings-dialog')).toBeNull(); // the next step closes it again
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
      if (i < TOUR_STEPS.length - 1) { await click(buttonNamed('İleri', card)); await shownAs(TOUR_STEPS[i + 1].id); }
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
      await goTo('open');
      expect($('.tour-note')).not.toBeNull();
      // shown by its line in ⋯, which the tour opened — not by ⋯ alone (clinician report 2026-11-12, a tablet)
      for (let i = 0; i < 20 && !$('.more-popover [data-more="open"]'); i++) await wait(60);
      expect($('.more-popover [data-more="open"]')).not.toBeNull();
      // a step whose folded button opens a window: the window, not ⋯ over it
      await goTo('new');
      await wait(300);
      expect($('.new-popover')).not.toBeNull();
      expect($('.more-popover')).toBeNull();
      await goTo('save'); // Kaydet never goes there
      expect($('.tour-note')).toBeNull();
    } finally {
      moved.forEach((b) => b.classList.remove('overflowed'));
      bar.classList.remove('has-overflow');
      if ($('.tour')) await key('Escape');
    }
  });
});

describe('the ring, the menus and the windows the steps talk about (clinician 2026-11-10: the ring and the panel in detail)', () => {
  it('each ring step opens its own part and closes the one before: Kardeş’s list, Durum, Bulgu; the overview none', async () => {
    await click(buttonNamed('Tanıtım turu'));
    const openSector = () => [...document.querySelectorAll('.radial-sector.on')].map((x) => x.getAttribute('aria-label'));
    const openSat = () => [...document.querySelectorAll('.radial-sat.on')].map((x) => x.getAttribute('aria-label'));
    await goTo('ring-add');
    expect(openSector()).toEqual(['Kardeş']);
    expect($('.radial-menu .radial-flyout').textContent).toMatch(/Gebelik.*Evlat edinilmiş/);
    await goTo('ring-status');
    expect(openSector()).toEqual([]);
    expect(openSat()).toEqual(['Durum']);
    expect($('.radial-menu .radial-panel').textContent).toMatch(/Etkilenmiş/);
    await goTo('ring-findings');
    expect(openSat()).toEqual(['Bulgu']);
    await goTo('ring');
    expect(openSector()).toEqual([]);
    expect(openSat()).toEqual([]);
    await key('Escape');
  });

  it('Yeni’s menu, the related-family window and Kaydet’s menu open at their steps and close at the next', async () => {
    await click(buttonNamed('Tanıtım turu'));
    await goTo('new');
    expect($('.toolbar [data-popup="new"] .keys-popover').textContent).toMatch(/Akraba evliliği/);
    await goTo('relation');
    expect($('.toolbar [data-popup="new"] .keys-popover')).toBeNull();
    expect($('.relation-dialog')).not.toBeNull();
    expect(document.body.classList.contains('touring')).toBe(true); // its window does not dim the page twice
    await goTo('open');
    expect($('.relation-dialog')).toBeNull();
    await goTo('save');
    expect([...document.querySelectorAll('.download-popover .download-group')].map((g) => g.textContent)).toEqual(['Resim olarak', 'Sonra düzenlemek için', 'Analiz programları için']);
    await goTo('arrange');
    expect($('.download-popover')).toBeNull();
    await key('Escape');
    expect(document.body.classList.contains('touring')).toBe(false);
  });

  it('the lit area waits until what it points at has come to rest, then glides there once (clinician report 2026-11-10: from step 7 to 8 it sped up)', async () => {
    await click(buttonNamed('Tanıtım turu'));
    await goTo('drawing');
    const spotLeft = () => parseFloat($('.tour-spot').style.left);
    expect(spotLeft()).toBe(94); // 100, less the lit area's margin
    // the next step's part still moving (a panel sliding in): every look finds it somewhere else
    let n = 0;
    box.left = () => 300 + (n++) * 7;
    try {
      await key('ArrowRight');
      await wait(400);
      expect(spotLeft()).toBe(94); // it did not chase the moving part
      // nor did the words go ahead of it: the card still says the last step, a little faded
      expect($('.tour-title').textContent).toBe('Çizim alanı');
      expect($('.tour-card').classList.contains('is-waiting')).toBe(true);
      expect($('.tour-count').textContent).toBe(`2 / ${TOUR_STEPS.length}`);
      // the part comes to rest at 300
      box.left = () => 300;
      await wait(200); // (the simulated page shows what changed when each wait ends)
      // the part at rest: the words, the count and the light turn to the next step together
      expect($('.tour-title').textContent).toBe('Simit menüsü');
      expect($('.tour-count').textContent).toBe(`3 / ${TOUR_STEPS.length}`);
      expect($('.tour-card').classList.contains('is-waiting')).toBe(false);
      await wait(600);
      expect(spotLeft()).toBe(294);
    } finally {
      box.left = () => 100;
    }
    await key('Escape');
  });
});

const unionOf = (a, b) => (S().doc.graph.unions.find((x) => x.partners.includes(a) && x.partners.includes(b)) || {}).id;

describe('what the clinician saw on 2026-11-10', () => {
  it('the line between partners: the couple is lit in the drawing as well as their card in the panel, two lit areas', async () => {
    await click(buttonNamed('Tanıtım turu'));
    await goTo('couple');
    expect(document.querySelectorAll('.tour-spot').length).toBe(2);
    expect(($('.tour-scrim').style.clipPath.match(/M/g) || []).length).toBe(3); // the window and two holes
    await goTo('kinship');
    expect(document.querySelectorAll('.tour-spot').length).toBe(2);
    await goTo('patient');
    expect(document.querySelectorAll('.tour-spot').length).toBe(1);
    await key('Escape');
  });

  it('the couple and consanguinity steps light the line between the partners itself (clinician 2026-11-11: show where to click)', async () => {
    // the parents' line stands at 300–380 × 500; everything else at the usual place
    box.of = (el) => (el.classList && el.classList.contains('union-hit') && el.getAttribute('data-union') === unionOf('mother', 'father')
      // a browser gives a straight line a box of no height
      ? { left: 300, top: 500, right: 380, bottom: 500, width: 80, height: 0, x: 300, y: 500 } : null);
    try {
      await click(buttonNamed('Tanıtım turu'));
      for (const step of ['couple', 'kinship']) {
        await goTo(step);
        await wait(600); // the light glides there
        const spots = [...document.querySelectorAll('.tour-spot')];
        expect(spots.some((sp) => parseFloat(sp.style.left) <= 300 && parseFloat(sp.style.top) <= 500 && parseFloat(sp.style.top) >= 485)).toBe(true);
      }
      expect($('.tour-text').textContent).toMatch(/çizgiye tıklayın/);
    } finally {
      box.of = () => null;
    }
    await key('Escape');
  });

  it('a lit area never reaches past the box it scrolls in (Hakkında: the light ran out of the settings window)', async () => {
    await click(buttonNamed('Tanıtım turu'));
    await goTo('about');
    // the settings section shows only 100–120 of what it holds
    box.of = (el) => (el.classList && el.classList.contains('settings-pane') ? { left: 0, top: 100, right: 1000, bottom: 120, width: 1000, height: 20, x: 0, y: 100 } : null);
    try {
      await wait(200);
      await wait(600); // the light glides there
      const spot = $('.tour-spot');
      expect(parseFloat(spot.style.top)).toBe(94);
      expect(parseFloat(spot.style.height)).toBe(32); // 20 seen, and the margin round it
    } finally { box.of = () => null; }
    await key('Escape');
  });

  it('a part further down the side panel is scrolled into view, and lands there even where the browser’s smooth scrolling would not run', async () => {
    await click(buttonNamed('Tanıtım turu'));
    await goTo('panel');
    const side = $('.app-shell > .side-right');
    side.scrollTop = 0;
    // the panel shows 50–300; "Diğer bilgiler" stands at 600, out of sight
    box.of = (el) => (el === side ? { left: 900, top: 50, right: 1200, bottom: 300, width: 300, height: 250, x: 900, y: 50 }
      : el.classList && el.classList.contains('more-parts') ? { left: 910, top: 600 - side.scrollTop, right: 1190, bottom: 640 - side.scrollTop, width: 280, height: 40, x: 910, y: 600 - side.scrollTop } : null);
    side.scrollTo = () => {}; // a browser that never runs smooth scrolling
    try {
      await goTo('more');
      await wait(600);
      expect(side.scrollTop).toBeGreaterThan(300);
      const spot = $('.tour-spot');
      expect(parseFloat(spot.style.top)).toBeGreaterThanOrEqual(50 - 6);
      expect(parseFloat(spot.style.top) + parseFloat(spot.style.height)).toBeLessThanOrEqual(300 + 6);
    } finally { box.of = () => null; delete side.scrollTo; }
    await key('Escape');
  });

  it('the × is drawn over the card’s words, so it always takes its click; it ends the tour at any step', async () => {
    await click(buttonNamed('Tanıtım turu'));
    await goTo('ring-status');
    const card = $('.tour-card');
    const kids = [...card.children];
    expect(kids.indexOf(card.querySelector('.tour-close'))).toBeGreaterThan(kids.indexOf(card.querySelector('.tour-body')));
    await click(card.querySelector('.tour-close'));
    expect($('.tour')).toBeNull();
    expect(document.body.classList.contains('touring')).toBe(false);
  });
});

describe('the look (clinician 2026-11-10: "çok kaba ve düz")', () => {
  it('the track along the card’s top shows the steps done and the one now; the page dims round the lit part with a rounded hole', async () => {
    await click(buttonNamed('Tanıtım turu'));
    await goTo('ring');
    const track = [...$('.tour-card .tour-track').children];
    expect(track.length).toBe(TOUR_STEPS.length);
    const at = index('ring');
    track.forEach((s, i) => expect(s.className).toBe(i < at ? 'done' : i === at ? 'now' : ''));
    const clip = $('.tour-scrim').style.clipPath;
    expect(clip).toMatch(/^path\(evenodd,/);
    expect(clip).toContain('Q'); // soft corners
    // a step with nothing to point at: the whole page dims, no hole
    await goTo('welcome');
    expect($('.tour-scrim').style.clipPath).toBe('');
    expect($('.tour-spot')).toBeNull();
    await key('Escape');
  });

  it('the first card and the first opening’s offer carry the small family that draws itself; every other card its step’s icon', async () => {
    await run(() => useViewSettings.getState().setView({ tourOffer: true }));
    expect($('.tour-offer .tour-family')).not.toBeNull();
    await click(buttonNamed('Turu başlat', $('.tour-offer')));
    expect($('.tour-card.tour-card-welcome .tour-hero .tour-family')).not.toBeNull();
    expect($('.tour-family .tf-proband')).not.toBeNull();
    await key('ArrowRight');
    await shownAs('drawing');
    expect($('.tour-card-welcome')).toBeNull();
    expect($('.tour-card .tour-icon svg')).not.toBeNull();
    await key('Escape');
  });
});

describe('the ring never slides the drawing back and forth (clinician report 2026-11-12, a tablet: the page went blank)', () => {
  it('a panel that never fits: the drawing slides once, the page stays', async () => {
    // the drawing 0–700 wide; the ring's panel always sticking out at the right, however far the drawing slides
    const svgX = () => { const svg = $('#pedigree-svg'); return svg && svg.__zoom ? svg.__zoom.x : 0; };
    box.of = (el) => {
      if (el.classList && el.classList.contains('canvas-stage')) return { left: 0, top: 0, right: 700, bottom: 900, width: 700, height: 900, x: 0, y: 0 };
      if (el.classList && (el.classList.contains('radial-panel') || el.classList.contains('radial-flyout'))) {
        return { left: 600, top: 300, right: 760, bottom: 400, width: 160, height: 100, x: 600, y: 300 };
      }
      // the person moves with the drawing (so the ring's place changes each time the drawing slides)
      if (el.classList && el.classList.contains('pedigree-shape') && el.closest('.node-selected')) {
        const left = 300 + svgX(); return { left, top: 300, right: left + 40, bottom: 340, width: 40, height: 40, x: left, y: 300 };
      }
      return null;
    };
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await run(() => S().selectIndividual('proband'));
      const before = svgX();
      const sat = $('.radial-menu .radial-sat[aria-label="Bulgu"]');
      expect(sat).not.toBeNull();
      await click(sat);
      await wait(200);
      expect($('.app-shell')).not.toBeNull();
      expect($('.radial-menu .radial-panel')).not.toBeNull();
      expect(errors.mock.calls.some((c) => String(c[0]).includes('Maximum update depth'))).toBe(false);
      // slid once, by what the panel stuck out (692 − 760); the popup makes up the rest itself
      expect(svgX() - before).toBe(-68);
    } finally {
      errors.mockRestore();
      box.of = () => null;
      await run(() => S().clearSelection());
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
    // a window nearly as large as the screen (Akraba evliliği): the corner that covers least of it
    const big = placeCard({ left: 274, top: 122, right: 1106, bottom: 678, width: 832, height: 556 }, card, win);
    expect(big.side).toBe(null);
    expect([big.left, big.top]).toEqual([12, 800 - 200 - 12]); // bottom left: only a strip of its edge
    const edge = placeCard({ left: 1250, top: 6, right: 1280, bottom: 40, width: 30, height: 34 }, card, win);
    expect(edge.left + card.w).toBeLessThanOrEqual(1280 - 12);
  });
});
