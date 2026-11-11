// @vitest-environment jsdom
/**
 * screen.test.js — the real app, drawn in a simulated browser (jsdom), read
 * the way a clinician reads it: what is drawn around each person, what the
 * ring menu and the side panel offer, what the keyboard and the pop-ups do.
 * These replace tests that only matched the source code (Codex audit
 * 2026-11-01: a source match passed while the page went blank).
 *
 * jsdom has no layout engine: text widths are estimates (support/dom.js),
 * so collisions between marks are measured in the browser instead
 * (src/audit/markCollisions.js). Positions here come from the layout and
 * the drawing's own attributes.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { mount, settle, createElement } from './support/dom';
import App from '../App';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { useViewSettings } from '../utils/drawingStyle';
import { prepareExportSvg } from '../utils/exportUtils';

const S = () => usePedigreeStore.getState();
const g = () => S().doc.graph;
let view;

beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  view = mount(createElement(App));
  await settle();
});
afterAll(() => view.unmount());
beforeEach(async () => { await settle(() => { S().resetPedigree(); }); });

const $ = (sel) => view.container.querySelector(sel);
const $$ = (sel) => [...view.container.querySelectorAll(sel)];
/** the drawn group of a person (D3 binds the person to it) */
const drawn = (id) => $$('.node-group').find(el => el.__data__ && el.__data__.id === id);
const numbersIn = (d) => (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
const lastSibling = (id) => g().parentChildRelationships.find(r => r.children.includes(id)).children.at(-1);
const run = (fn) => settle(fn);
/** A pointer event of a given kind ('mouse', 'pen', 'touch'); jsdom has no PointerEvent. */
const pointer = (type, pointerType, related) => {
  const ev = new MouseEvent(type, { bubbles: true, relatedTarget: related || null });
  Object.defineProperty(ev, 'pointerType', { value: pointerType });
  return ev;
};

describe('a pen on a tablet (clinician report 2026-11-10: the ring did not open with the pen)', () => {
  // a pen reports a pixel or two of movement in every tap; the drawing's pan cancels such a touch, so the
  // tap never became a click. The drawing now turns a short, still pen tap into the click itself.
  const penTap = async (el, { dx = 2, ms = 120 } = {}) => {
    const at = (type, x, t) => { const ev = pointer(type, 'pen'); Object.defineProperty(ev, 'clientX', { value: x }); Object.defineProperty(ev, 'clientY', { value: 50 }); Object.defineProperty(ev, 'timeStamp', { value: t }); return ev; };
    await run(() => el.dispatchEvent(at('pointerdown', 100, 1000)));
    await run(() => el.dispatchEvent(at('pointerup', 100 + dx, 1000 + ms)));
  };
  it('a pen tap on a person selects them and opens the ring; a tap on the empty drawing steps back', async () => {
    await penTap(drawn('mother').querySelector('circle, rect, path'));
    expect(S().selectedIds).toEqual(['mother']);
    expect($('.radial-menu')).not.toBeNull();
    await penTap($('#pedigree-svg'));
    expect($('.radial-menu')).toBeNull();
  });
  it('a pen that really moves pans the drawing: no selection; a mouse or a finger keeps its own click', async () => {
    await penTap(drawn('father').querySelector('circle, rect, path'), { dx: 30 });
    expect(S().selectedIds || []).toEqual([]);
    await penTap(drawn('father').querySelector('circle, rect, path'), { ms: 1500 }); // a long press is no tap
    expect(S().selectedIds || []).toEqual([]);
    const mouseUp = pointer('pointerup', 'mouse');
    await run(() => drawn('father').dispatchEvent(pointer('pointerdown', 'mouse')));
    await run(() => drawn('father').dispatchEvent(mouseUp));
    expect(S().selectedIds || []).toEqual([]); // no click made for a mouse: its own click comes
  });
});

describe('marks around a person', () => {
  it('the proband: an arrow with "P"; the consultand: an arrow without "P"; the same person: one arrow with "P"', async () => {
    await run(() => S().setConsultand('mother'));
    expect(drawn('proband').querySelectorAll('.proband-arrow')).toHaveLength(1);
    expect(drawn('proband').querySelector('.proband-p').textContent).toBe('P');
    expect(drawn('mother').querySelectorAll('.proband-arrow')).toHaveLength(1);
    expect(drawn('mother').querySelector('.proband-p')).toBeNull();
    expect(drawn('father').querySelector('.proband-arrow')).toBeNull();
    await run(() => S().setConsultand('proband'));
    expect(drawn('proband').querySelectorAll('.proband-arrow')).toHaveLength(1);
    expect(drawn('proband').querySelectorAll('.proband-p')).toHaveLength(1);
    expect($$('.proband-p')).toHaveLength(1);
  });

  it('the name line of the key shows the proband, else the consultand', async () => {
    await run(() => { S().setPatientName('Ayşe Yılmaz'); S().setConsultand('mother'); });
    expect($('.patient-header').textContent).toBe('Ayşe Yılmaz');
    expect($('.legend-proband rect')).not.toBeNull(); // the proband is a boy
    await run(() => S().clearProband());
    expect($('.legend-proband circle')).not.toBeNull(); // now the consultand, the mother
  });

  it('brackets for adopted in, adopted out and adopted by relatives — nobody else; the arrow and the text below stay outside them', async () => {
    await run(() => {
      S().addSiblingTo('father', 'female');
      const aunt = lastSibling('father');
      S().addSpouseTo(aunt, 'male');
      S().setAdoption('proband', g().unions.find(u => u.partners.includes(aunt)).id);
      S().addChildToUnion('U_PARENTS', 'female', { adopted: true });
      S().setAdoption('mother', 'out');
      S().updateIndividual('proband', { age: '12' });
    });
    const adoptedIn = g().socialParentLinks.find(l => l.childId !== 'proband').childId;
    const bracketed = $$('.node-group').filter(el => el.querySelector('.adoption-brackets')).map(el => el.__data__.id).sort();
    expect(bracketed).toEqual(['mother', 'proband', adoptedIn].sort());
    // dashed lines of descent: one into the adopted-in child, one from the aunt's couple to the proband
    expect($$('.pedigree-viewport > path[stroke-dasharray]').length).toBeGreaterThanOrEqual(2);
    const b = Math.max(...numbersIn(drawn('proband').querySelector('.adoption-brackets').getAttribute('d')).map(Math.abs));
    const arrow = numbersIn(drawn('proband').querySelector('.proband-arrow').getAttribute('d'));
    const tip = [arrow[2], arrow[3]]; // "M start L tip …"
    expect(tip[0]).toBeLessThan(-b);
    expect(tip[1]).toBeGreaterThan(b);
    const firstLine = drawn('proband').querySelector('.annotations text');
    expect(Number(firstLine.getAttribute('y'))).toBeGreaterThan(b + 8);
  });

  it('several people in one symbol: the number (or n) inside, said out loud to a screen reader', async () => {
    await run(() => { S().addSiblingTo('proband', 'male', { count: 3 }); S().addSiblingTo('proband', 'unknown', { count: 'n' }); });
    const groups = g().individuals.filter(i => i.count !== undefined);
    expect(groups.map(p => drawn(p.id).querySelector('.group-count').textContent).sort()).toEqual(['3', 'n']);
    const labels = groups.map(p => drawn(p.id).getAttribute('aria-label'));
    expect(labels.some(l => /3 erkek/.test(l))).toBe(true);
    expect(labels.some(l => /sayısı bilinmeyen/.test(l))).toBe(true);
  });

  it('separated and divorced: the relationship line broken by "//" (NSGC 2022 Fig 3; clinician decision 2026-11-02)', async () => {
    for (const status of ['separated', 'divorced']) {
      await run(() => S().setUnionStatus('U_PARENTS', status));
      expect($$('.relationship-ended')).toHaveLength(2);
    }
    await run(() => S().setUnionStatus('U_PARENTS', 'together'));
    expect($$('.relationship-ended')).toHaveLength(0);
  });

  it('the side panel\'s İlişki: the three choices side by side, one tap each (clinician request 2026-11-05)', async () => {
    await select('mother');
    const group = $$('.editor-body [role="radiogroup"]').find(r => r.getAttribute('aria-label') === 'İlişki');
    const choices = () => [...group.querySelectorAll('[role="radio"]')];
    expect(choices().map(b => [b.textContent, b.getAttribute('aria-checked')])).toEqual([['Birlikte', 'true'], ['Boşanmış/Ayrılmış', 'false'], ['Bilinmiyor', 'false']]);
    await click(choices()[1]);
    expect(g().unions.find(u => u.id === 'U_PARENTS').status).toBe('divorced');
    expect($$('.relationship-ended')).toHaveLength(2);
    expect(choices()[1].getAttribute('aria-checked')).toBe('true');
    await click(choices()[0]);
    expect(g().unions.find(u => u.id === 'U_PARENTS').status).toBe('together');
    expect($$('.relationship-ended')).toHaveLength(0);
  });

  it('pedigree numbers stand beside the symbol, never centred over the line of descent, and never on top of each other', async () => {
    await run(() => { for (let k = 0; k < 4; k++) S().addSiblingTo('proband', k % 2 ? 'male' : 'female'); });
    const numbers = $$('.pedigree-number');
    expect(numbers.length).toBe(g().individuals.length);
    expect(numbers.every(t => ['start', 'end'].includes(t.getAttribute('text-anchor')))).toBe(true);
    const at = numbers.map(t => { const gr = t.closest('.node-group').__data__; return `${gr.x + Number(t.getAttribute('x'))},${gr.y + Number(t.getAttribute('y'))}`; });
    expect(new Set(at).size).toBe(at.length);
  });
});

describe('lines', () => {
  const doubleAt = () => $$('.pedigree-viewport > path:not(.ui-only)').filter(p => /^M[\d.-]+,[\d.-]+L/.test(p.getAttribute('d') || '')).map(p => numbersIn(p.getAttribute('d')));

  it('a consanguineous couple: two plain parallel strokes, no text, no colour of their own — declared or drawn from shared ancestors alike', async () => {
    const before = $$('.pedigree-viewport > path:not(.ui-only)').length;
    await run(() => S().setUnionRelationshipBackground('U_PARENTS', 'consanguinity_reported'));
    const strokes = $$('.pedigree-viewport > path:not(.ui-only)');
    expect(strokes.length).toBe(before + 1); // the relationship line is now two strokes
    const colours = new Set(strokes.map(p => p.getAttribute('stroke')));
    expect(colours.size).toBe(1);
    expect($$('.pedigree-viewport > text').filter(t => /kuzen|akraba/i.test(t.textContent))).toHaveLength(0);
    // the two strokes of the parents' line, 2 × 2 px apart
    const horizontal = doubleAt().filter(n => n.length === 4 && n[1] === n[3]);
    const ys = [...new Set(horizontal.map(n => n[1]))].sort((a, b) => a - b);
    expect(ys.some((y, k) => k && y - ys[k - 1] === 4)).toBe(true);
  });

  it('the line of descent from a double line starts at its lower stroke, not in the gap', async () => {
    await run(() => S().setUnionRelationshipBackground('U_PARENTS', 'consanguinity_reported'));
    const lines = doubleAt().filter(n => n.length === 4);
    const horizontal = lines.filter(n => n[1] === n[3]);
    const lower = Math.max(...horizontal.map(n => n[1]).filter(y => horizontal.filter(m => m[1] === y - 4).length));
    const drop = lines.find(n => n[0] === n[2] && Math.min(n[1], n[3]) >= lower - 4 && Math.min(n[1], n[3]) <= lower);
    expect(Math.min(drop[1], drop[3])).toBe(lower);
  });
});

describe('text under the symbols and in the notes', () => {
  it('genetic test: each written line under the symbol; "test yapıldı" when nothing is written; never an "E" prefix', async () => {
    await run(() => S().updateIndividual('mother', { geneticTest: 'tested' }));
    const lines = () => [...drawn('mother').querySelectorAll('.annotations text')].map(t => t.textContent);
    expect(lines()).toContain('test yapıldı');
    await run(() => S().updateIndividual('mother', { geneticNote: 'TGFBR2 c.1609C>T het\nsonuç bekleniyor' }));
    expect(lines()).toEqual(expect.arrayContaining(['TGFBR2 c.1609C>T het', 'sonuç bekleniyor']));
    expect($$('text').some(t => /^E[:+ −-]/.test(t.textContent))).toBe(false);
  });

  it('the notes name people by pedigree number, never an internal id; an unsure finding reads "bilinmiyor"; a birth week stays', async () => {
    await run(() => {
      S().updateIndividual('mother', { notes: 'tip 2 DM' });
      S().addFinding('mother', 'Miyop', null);
      S().setFindingStatus('father', 'Miyop', 'unknown');
      S().addChildToUnion('U_PARENTS', 'female', { ongoingPregnancy: true });
    });
    const fetus = g().individuals.find(i => i.ongoingPregnancy).id;
    await run(() => { S().setGestationWeeks(fetus, '32'); S().setPregnancyKind(fetus, ''); });
    const notes = $$('.notes-legend text').map(t => t.textContent).join(' ');
    expect(notes).toMatch(/tip 2 DM/);
    expect(notes).toMatch(/bilinmiyor/);
    expect(notes).toMatch(/doğum: 32 hf/);
    expect(notes).not.toMatch(/\bmother\b|\bfather\b|de_ch_/);
    expect(notes).toMatch(/II-\d/);
  });

  it('long text under the bottom row: the notes start below it', async () => {
    await run(() => S().updateIndividual('proband', { geneticTest: 'tested', geneticNote: 'satır bir\nsatır iki\nsatır üç\nsatır dört', notes: 'not' }));
    const p = drawn('proband');
    const lowest = p.__data__.y + Math.max(...[...p.querySelectorAll('.annotations text')].map(t => Number(t.getAttribute('y'))));
    const notesTop = Math.min(...$$('.notes-legend text').map(t => Number(t.getAttribute('y'))));
    expect(notesTop).toBeGreaterThan(lowest);
  });

  it('two findings in one person are two regions with a dividing line; the key is part of the drawing', async () => {
    await run(() => { S().addFinding('mother', 'Miyop', null); S().addFinding('mother', 'Kolestaz', null); });
    const regions = drawn('mother').querySelector('.condition-regions');
    expect(regions).not.toBeNull();
    expect(regions.querySelectorAll('.region-divider').length).toBeGreaterThan(0);
    expect($('svg .condition-legend')).not.toBeNull();
    expect($$('.condition-legend text').map(t => t.textContent)).toEqual(expect.arrayContaining(['Miyop', 'Kolestaz']));
  });
});

// ── interaction helpers ──
const key = (k, opts = {}, target = document.body) => run(() => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts })));
const click = (el) => run(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
const pointerDown = (el) => run(() => el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })));
const buttons = (root = view.container) => [...root.querySelectorAll('button')];
const saveButton = () => $('.canvas-toolbar [data-popup="download"] > button');
const button = (text, root) => buttons(root).find(b => b.textContent.trim() === text || b.getAttribute('aria-label') === text);
const select = (id) => click(drawn(id));
const flyout = () => $('.radial-flyout');
const flyoutText = () => (flyout() ? flyout().textContent.replace(/\s+/g, ' ') : '');
// the choices of Durum, Bilgiler or İkiz: a list beside the ring (clinician request 2026-11-05)
const choiceRows = () => $$('.radial-panel .ring-choice');
const choiceLabels = () => $$('.radial-panel .ring-sex button, .radial-panel .ring-choice').map(b => b.getAttribute('aria-label'));
const panelText = () => ($('.editor-body') ? $('.editor-body').textContent.replace(/\s+/g, ' ') : '');

describe('the ring menu', () => {
  it('a click on a person selects them and shows the ring; letters open its parts', async () => {
    await select('proband');
    expect(S().selectedIds).toEqual(['proband']);
    expect($('.radial-ring')).not.toBeNull();
    await key('k');
    expect(flyoutText()).toMatch(/Gebelik/);
    expect(flyoutText()).toMatch(/Evlat edinilmiş/);
    expect(flyoutText()).toMatch(/Birden çok/);
    await key('d');
    expect(choiceLabels()).toEqual(expect.arrayContaining(['Etkilenmiş', 'Taşıyıcı', 'Vefat', 'Proband', 'Danışan']));
  });

  it('"Birden çok" in the ring adds one symbol with the number inside', async () => {
    await select('proband');
    await key('k');
    const add = buttons(flyout()).find(b => /3 erkek \(sayısı içine yazılan tek bir sembol/.test(b.getAttribute('aria-label') || ''));
    await click(add);
    expect(g().individuals.filter(i => i.count === 3 && i.sex === 'male')).toHaveLength(1);
  });

  it('the ring of a numbered symbol: no partner, no child, a note only; refused with a reason', async () => {
    await run(() => S().addSiblingTo('proband', 'male', { count: 3 }));
    const group = g().individuals.find(i => i.count).id;
    await select(group);
    const people = g().individuals.length;
    await key('e');
    expect(g().individuals.length).toBe(people);
    await key('c');
    expect(flyoutText()).toMatch(/Tek tek ayır/);
    expect(buttons(flyout()).filter(b => /^Çocuk:/.test(b.getAttribute('aria-label') || ''))).toHaveLength(0);
    const satellites = $$('.radial-sat').map(el => el.getAttribute('aria-label'));
    expect(satellites).toContain('Not');
    expect(satellites).not.toContain('Durum');
    expect(satellites).not.toContain('Bulgu');
    // its panel: the note alone (a group has number and sex only)
    await key('n');
    expect([...$('.radial-panel').querySelectorAll('.field-label')].map(l => l.firstChild.textContent.trim())).toEqual(['Not']);
  });

  it('Ayarlar → Halka menü: a hidden row is gone from the ring and comes back under "Diğer…"; the Durum order follows', async () => {
    const { useRingPrefs, DEFAULT_RING } = await import('../utils/ringPrefs');
    try {
      await run(() => useRingPrefs.getState().setRing({ ...DEFAULT_RING, status: ['proband', 'affected', 'carrier', 'deceased', 'consultand'], hidden: ['pregnancy', 'consultand'] }));
      await select('proband');
      await key('k');
      expect(flyoutText()).not.toMatch(/Gebelik/);
      await click(button('Diğer…', flyout()));
      expect(flyoutText()).toMatch(/Gebelik/);
      await click(button('Daha az', flyout()));
      await key('d');
      expect(choiceLabels().slice(3)).toEqual(['Proband', 'Etkilenmiş', 'Taşıyıcı', 'Vefat', 'Diğer…']);
      await click(button('Ayarlar'));
      const dialog = document.querySelector('.settings-dialog');
      await click([...dialog.querySelectorAll('[role="tab"]')].find(b => b.textContent.includes('Halka menü')));
      expect(dialog.querySelector('[role="tabpanel"]').textContent).toMatch(/Durum düğmesindeki seçenekler/);
      // the order set above is the order shown, hidden choices switched off
      const names = [...dialog.querySelectorAll('.set-list')][1].querySelectorAll('.set-list-name');
      expect([...names].map(n => n.textContent)).toEqual(['Proband', 'Etkilenmiş', 'Taşıyıcı', 'Vefat', 'Danışan', 'Presemptomatik']);
      const consultand = [...dialog.querySelectorAll('.set-list-label')].find(l => l.textContent === 'Danışan').querySelector('input');
      expect(consultand.checked).toBe(false);
      await key('Escape');
    } finally {
      await run(() => useRingPrefs.getState().setRing(DEFAULT_RING));
    }
  });

  it('the ring survives its person disappearing: undo with the ring open', async () => {
    await run(() => S().addSiblingTo('proband', 'male'));
    await select(lastSibling('proband'));
    await key('k');
    await run(() => S().undo());
    expect($('.pedigree-viewport')).not.toBeNull();
  });
});

describe('the side panel', () => {
  it('"Konumlandır" shows the four arrows of moving into place, not a grid (clinician 2026-11-11), and still lays the drawing out afresh', async () => {
    const b = $('.toolbar [data-overflow="relayout"]');
    expect(b.querySelector('svg.tidy-icon')).not.toBe(null);
    expect(b.querySelector('svg.tidy-icon').getAttribute('class')).toMatch(/lucide-move/);
    const before = S().history ? S().history.length : null;
    await click(b);
    expect(S().layoutInfo ? S().layoutInfo.level : 'full').toBe('full');
    if (before !== null) expect(S().history.length).toBeGreaterThanOrEqual(before);
  });

  it('says what the person is to the proband (clinician 2026-11-11): Anneanne, Teyze, a cousin with its way', async () => {
    const kin = () => ($('.side-header .person-kin') ? $('.side-header .person-kin').textContent : null);
    await select('mat_gm');
    expect(kin()).toBe('Anneanne');
    await run(() => S().updateRelativeCount('maternalRelatives', 'aunts', 1));
    const aunt = S().wizardData.maternalRelatives.aunts[0].id;
    await select(aunt);
    expect(kin()).toBe('Teyze');
    await run(() => S().addSpouseTo(aunt, 'male'));
    const u = g().unions.find(x => x.partners.includes(aunt));
    await run(() => S().addChildToUnion(u.id, 'male'));
    await select(g().parentChildRelationships.find(r => r.unionId === u.id).children[0]);
    expect(kin()).toBe('1. derece kuzen (teyze oğlu)');
    await select('proband');
    expect(kin()).toBe(null);
  });

  it('a numbered symbol: "Tek tek ayır" draws them one by one', async () => {
    await run(() => S().addSiblingTo('proband', 'male', { count: 3 }));
    await select(g().individuals.find(i => i.count).id);
    expect(panelText()).toMatch(/Birden çok kişi/);
    await click(button('Tek tek ayır (3 kişi)'));
    expect(g().individuals.filter(i => i.count !== undefined)).toHaveLength(0);
    expect(g().parentChildRelationships.find(r => r.children.includes('proband')).children).toHaveLength(4);
  });

  it('siblings chosen together: "Tek sembolde birleştir" merges them; with the proband it is off and says why', async () => {
    await run(() => { S().addSiblingTo('proband', 'male'); S().addSiblingTo('proband', 'male'); });
    const [a, b] = g().parentChildRelationships.find(r => r.children.includes('proband')).children.filter(c => c !== 'proband');
    await run(() => { S().selectIndividual(a); S().selectIndividual(b, { additive: true }); });
    expect(panelText()).toMatch(/Tek sembolde birleştir/);
    await run(() => S().selectIndividual('proband', { additive: true }));
    const merge = button('Birleştir');
    expect(merge.disabled).toBe(true);
    expect(panelText()).toMatch(/proband/);
    await run(() => { S().selectIndividual(a); S().selectIndividual(b, { additive: true }); });
    await click(button('Birleştir'));
    expect(g().individuals.find(i => i.id === a).count).toBe(2);
  });

  it('a variant written for one person is offered to the others; the tip says where the buttons are', async () => {
    await run(() => S().updateIndividual('mother', { geneticTest: 'tested', geneticNote: 'TGFBR2 c.1609C>T het' }));
    await run(() => S().updateIndividual('father', { geneticTest: 'tested' }));
    await select('father');
    expect(panelText()).toMatch(/Ailede girilen/);
    expect(panelText()).toMatch(/TGFBR2 c\.1609C>T het/);
    expect(panelText()).toMatch(/Düğmeler görünmüyorsa kişinin sembolüne yeniden tıklayın\./);
  });

  it('several people chosen: no ring (the panel works on all of them)', async () => {
    await run(() => { S().selectIndividual('mother'); S().selectIndividual('father', { additive: true }); });
    expect($('.radial-ring')).toBeNull();
  });
});

describe('stepping back, pop-ups and the keyboard', () => {
  it('an empty click steps back one level: open part → ring → selection; a click on a person brings the ring back', async () => {
    await select('proband');
    await key('k');
    const svg = $('svg.pedigree-svg') || $('.pedigree-viewport').ownerSVGElement;
    await click(svg);
    expect(flyout()).toBeNull();
    expect($('.radial-ring')).not.toBeNull();
    await click(svg);
    expect($('.radial-ring')).toBeNull();
    expect(S().selectedIds).toEqual(['proband']);
    await click(svg);
    expect(S().selectedIds).toEqual([]);
    await select('proband');
    expect($('.radial-ring')).not.toBeNull();
  });

  it('a toolbar pop-up closes on a click outside it or on Escape', async () => {
    for (const [open, name] of [['Ayarlar', 'settings'], ['Yeni', 'new']]) {
      await click(button(open) || buttons().find(b => b.textContent.includes(open)));
      expect($(`[data-popup="${name}"] [role="dialog"], [data-popup="${name}"] .keys-popover, [data-popup="${name}"] .new-menu`) || $$(`[data-popup="${name}"] *`).length > 1).toBeTruthy();
      // the settings window stands on the page itself, outside the app's frame
      const inPopup = () => document.querySelectorAll(`[data-popup="${name}"] *`).length;
      const opened = inPopup();
      await pointerDown(drawn('mother'));
      expect(inPopup()).toBeLessThan(opened);
      await click(button(open) || buttons().find(b => b.textContent.includes(open)));
      await key('Escape');
      expect(inPopup()).toBeLessThan(opened);
    }
  });

  it('shortcuts never fire while typing; Escape leaves the box; Ctrl+Z undoes', async () => {
    const name = $('input.patient-name');
    await select('proband');
    name.focus();
    const people = g().individuals.length;
    await key('e', {}, name);
    expect(g().individuals.length).toBe(people);
    await key('Escape', {}, name);
    expect(document.activeElement).not.toBe(name);
    await run(() => S().addSiblingTo('proband', 'male'));
    await key('z', { ctrlKey: true });
    expect(g().individuals.length).toBe(people);
  });

  it('the name typed in the toolbar is written with capitals and drawn at the top', async () => {
    const name = $('input.patient-name');
    await run(() => {
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(name, 'ayşe gül yılmaz');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await run(() => name.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(S().doc.patientName).toBe('Ayşe Gül Yılmaz');
    expect($('.patient-header').textContent).toBe('Ayşe Gül Yılmaz');
  });

  it('a name that looks like HTML stays text: nothing in it is run or drawn as an element', async () => {
    await run(() => { S().setPatientName('<img src=x onerror=alert(1)>'); S().updateIndividual('mother', { displayLabel: '<script>x</script>', notes: '<b>kalın</b>' }); });
    // nothing the clinician typed becomes an element: the drawing has no img/script/b, the texts hold the characters
    expect($$('svg img, svg script, svg b, svg foreignObject')).toHaveLength(0);
    expect($('.patient-header').textContent).toMatch(/^<img src=x onerror=alert\(1\)>$/i); // as text (with the name's capitals)
    expect($$('.pedigree-number, .annotations text, .notes-legend text').some(t => t.textContent.includes('<script>x</script>') || t.textContent.includes('<b>kalın</b>'))).toBe(true);
    expect($$('script').filter(el => view.container.contains(el))).toHaveLength(0);
  });

  it('the keyboard help is in Ayarlar → Klavye kısayolları, grouped and written in full sentences (clinician request 2026-11-04)', async () => {
    await click(button('Ayarlar'));
    const dialog = document.querySelector('.settings-dialog');
    await click([...dialog.querySelectorAll('[role="tab"]')].find(b => b.textContent.includes('Klavye kısayolları')));
    const text = dialog.querySelector('[role="tabpanel"]').textContent;
    expect(text).toMatch(/Kişiler arasında gezinmek/);
    expect(text).toMatch(/Seçili kişi için \(önce bir kişiye tıklayın\)/);
    expect([...dialog.querySelectorAll('kbd')].map(k => k.textContent)).toEqual(expect.arrayContaining(['A', 'E', 'K', 'C veya Ç', 'N']));
    // not a setting: no "kept on this device" line under it
    expect(dialog.querySelector('.settings-foot')).toBeNull();
    await key('Escape');
  });
});

// ── files: what a download would save ──
function captureDownloads() {
  const files = [];
  const blobs = new Map();
  const realCreate = URL.createObjectURL, realRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (b) => { const u = `blob:test/${blobs.size}`; blobs.set(u, b); return u; };
  URL.revokeObjectURL = () => {};
  const spy = vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    if (this.download) files.push({ name: this.download, blob: blobs.get(this.href) });
  });
  return { files, restore: () => { spy.mockRestore(); URL.createObjectURL = realCreate; URL.revokeObjectURL = realRevoke; } };
}
// jsdom's Blob has no text(): read it as the browser's FileReader would
const blobText = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsText(blob); });
const typeInto = (input, text) => run(() => {
  const proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('saving, opening and downloading', () => {
  it('Kaydet holds every way of keeping the drawing, the picture first; the PediTree file says what it is for; Cmd/Ctrl+S still writes that file (clinician 2026-11-10)', async () => {
    const dl = captureDownloads();
    try {
      expect(buttons().some(b => b.querySelector('.btn-label')?.textContent === 'İndir')).toBe(false); // no İndir of its own any more
      await click(saveButton());
      const menu = $('[data-popup="download"] .download-popover');
      const items = [...menu.querySelectorAll('.download-item b')].map(b => b.textContent);
      expect(items).toEqual(['PNG', 'PDF', 'SVG', 'PediTree dosyası', 'PED']);
      expect([...menu.querySelectorAll('.download-group')].map(g => g.textContent)).toEqual(['Resim olarak', 'Sonra düzenlemek için', 'Analiz programları için']);
      expect(dl.files.length).toBe(0); // opening the menu downloads nothing
      await key('Escape');
      await key('s', { metaKey: true });
      expect(dl.files.at(-1).name).toMatch(/\.peditree\.json$/);
    } finally { dl.restore(); }
  });

  it('Kaydet writes what is still being typed: an age not yet confirmed reaches the file', async () => {
    const dl = captureDownloads();
    try {
      await select('mother');
      const age = $('.input-age');
      await typeInto(age, '52');
      expect(g().individuals.find(i => i.id === 'mother').age).toBe(''); // not confirmed yet
      await click(saveButton());
      await click(buttons($('[data-popup="download"]')).find(b => b.textContent.includes('PediTree dosyası')));
      const saved = JSON.parse(await blobText(dl.files.at(-1).blob));
      expect(saved.graph.individuals.find(i => i.id === 'mother').age).toBe('52');
    } finally { dl.restore(); }
  });

  it('Enter confirms a box and leaves it', async () => {
    await select('mother');
    const age = $('.input-age');
    age.focus();
    await typeInto(age, '3 ay');
    await key('Enter', {}, age);
    expect(g().individuals.find(i => i.id === 'mother').age).toBe('3 ay');
    expect(document.activeElement).not.toBe(age);
  });

  it('the PED file goes to a laboratory: no patient name in it or in its name', async () => {
    const dl = captureDownloads();
    try {
      await run(() => S().setPatientName('Ayşe Yılmaz'));
      await click(saveButton());
      expect($('[data-popup="download"]').textContent).toMatch(/PDF/);
      // one line per format; PED's question shows once PED is chosen (clinician 2026-11-05: the menu said too much)
      expect($('[data-popup="download"]').textContent).not.toMatch(/Dosyada kim/);
      await click(buttons($('[data-popup="download"]')).find(b => b.textContent.startsWith('PED')));
      expect($('[data-popup="download"]').textContent).toMatch(/Dosyada hangi kişiler “etkilenmiş” olarak işaretlensin/);
      await click(buttons().find(b => b.textContent.includes('PED indir')));
      const ped = dl.files.at(-1);
      expect(ped.name).not.toMatch(/Ay[sş]e|Y[ıi]lmaz/i);
      expect(await blobText(ped.blob)).not.toMatch(/Ayşe|Yılmaz/);
    } finally { dl.restore(); }
  });

  it('"Aç" says which files it opens; "Bunu bir daha gösterme" goes straight to the file chooser; Ayarlar brings the window back', async () => {
    const { useViewSettings } = await import('../utils/drawingStyle');
    const chooser = vi.spyOn(window.HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    try {
      await click(buttons().find(b => b.textContent.trim() === 'Aç'));
      const help = $('[aria-label="Dosya aç"]');
      expect(help.textContent).toMatch(/PediTree dosyası.*\.peditree\.json/);
      expect(help.textContent).toMatch(/PED dosyası.*ad, yaş ve bulgular aktarılmaz/);
      await click(help.querySelector('input[type="checkbox"]'));
      expect(useViewSettings.getState().view.openHelp).toBe(false);
      await key('Escape');
      await click(buttons().find(b => b.textContent.trim() === 'Aç'));
      expect($('[aria-label="Dosya aç"]')).toBeNull();
      expect(chooser).toHaveBeenCalled();
    } finally {
      chooser.mockRestore();
      await run(() => useViewSettings.getState().setView({ openHelp: true }));
    }
  });

  it('a file dropped on the drawing asks first when the open family has unsaved work', async () => {
    await run(() => S().addSiblingTo('proband', 'male'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    try {
      const file = new File([JSON.stringify({ hello: 1 })], 'aile.peditree.json', { type: 'application/json' });
      const drop = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [file] } });
      const people = g().individuals.length;
      await run(() => $('.canvas-container').dispatchEvent(drop));
      expect(confirm).toHaveBeenCalled();
      expect(g().individuals.length).toBe(people);
    } finally { confirm.mockRestore(); }
  });

  it('the copy that is downloaded: every person and line, without selection, click areas or (when asked) the name', async () => {
    const { prepareExportSvg } = await import('../utils/exportUtils');
    await run(() => { S().setPatientName('Ayşe Yılmaz'); S().setUnionRelationshipBackground('U_PARENTS', 'consanguinity_reported'); });
    await select('mother');
    const svg = $('.pedigree-viewport').ownerSVGElement;
    const copy = prepareExportSvg(svg);
    expect(copy.querySelectorAll('.node-group')).toHaveLength(g().individuals.length);
    expect(copy.querySelectorAll('.pedigree-viewport > path').length).toBe($$('.pedigree-viewport > path:not(.ui-only)').length);
    expect(copy.querySelectorAll('.ui-only, .node-selected')).toHaveLength(0);
    expect(copy.querySelector('.patient-header')).not.toBeNull();
    expect(prepareExportSvg(svg, { withoutPatientName: true }).querySelector('.patient-header')).toBeNull();
  });
});

describe('the look of the drawing (Ayarlar), a preference of this device', () => {
  it('the hand-drawn look redraws lines and outlines as pen strokes, keeps dashes and fills, never uses a pixel filter; the family is untouched', async () => {
    const { useViewSettings } = await import('../utils/drawingStyle');
    await run(() => S().addChildToUnion('U_PARENTS', 'female', { adopted: true }));
    const doc = S().doc;
    const dashed = () => $$('.pedigree-viewport [stroke-dasharray]:not(.ui-only)').filter(el => el.getAttribute('stroke-opacity') !== '0').length;
    const dashedBefore = dashed();
    expect(dashedBefore).toBeGreaterThan(0);
    try {
      await run(() => useViewSettings.getState().setView({ drawStyle: 'hand' }));
      expect(S().doc).toBe(doc);
      expect(window.localStorage.getItem('peditree.view.v1')).toMatch(/"drawStyle":"hand"/);
      // every symbol gets a pen outline over its exact (now invisible) shape
      expect($$('.pedigree-shape-sketch').length).toBe($$('.pedigree-shape').length);
      expect($$('[filter]')).toHaveLength(0);
      expect(dashed()).toBe(dashedBefore); // a dashed line keeps its dashes
      expect($$('.pedigree-shape').every(s => s.getAttribute('stroke-opacity') === '0')).toBe(true);
    } finally {
      await run(() => useViewSettings.getState().setView({ drawStyle: 'standard' }));
    }
    expect($$('.hand-stroke')).toHaveLength(0);
  });

  it('the text size setting changes every text of the drawing, and the layout gives it room (clinician request 2026-11-05)', async () => {
    const { useViewSettings } = await import('../utils/drawingStyle');
    await run(() => { S().setPatientName('Ayşe'); S().updateIndividual('mother', { age: '52', notes: 'not', geneticTest: 'tested', geneticNote: 'MYH7:c.1208G>A het' }); });
    const sizes = () => ({
      head: parseFloat($('.patient-header').getAttribute('font-size')),
      under: parseFloat(drawn('mother').querySelector('.annotations text').getAttribute('font-size')),
      number: parseFloat(drawn('mother').querySelector('.pedigree-number').getAttribute('font-size')),
    });
    const apart = () => Math.abs(S().pedigreeData.nodes.find(n => n.id === 'mother').x - S().pedigreeData.nodes.find(n => n.id === 'father').x);
    await run(() => S().refreshLayout()); // a fresh layout to compare with
    const normal = sizes(), normalApart = apart(), undoSteps = S()._history.length;
    try {
      await run(() => useViewSettings.getState().setView({ textSize: 145 }));
      const big = sizes();
      expect(big.head).toBeGreaterThan(normal.head);
      expect(big.under).toBeGreaterThan(normal.under);
      expect(big.number).toBeGreaterThan(normal.number);
      expect(apart()).toBeGreaterThan(normalApart); // the genetic line's room grew with it
      expect(S()._history.length).toBe(undoSteps); // a view change, not an edit: nothing to undo
    } finally {
      await run(() => useViewSettings.getState().setView({ textSize: 100 }));
    }
    expect(sizes()).toEqual(normal);
    expect(apart()).toBe(normalApart);
  });

  it('a zoom stays through an edit', async () => {
    await click(button('Yakınlaştır'));
    const t = $('.pedigree-viewport').getAttribute('transform');
    expect(t).toBeTruthy();
    await run(() => S().addSiblingTo('proband', 'female'));
    expect($('.pedigree-viewport').getAttribute('transform')).toBe(t);
  });
});

describe('texts are corrected where they stand', () => {
  it('a click on the name, a label or an age on the drawing opens a box there; Enter saves it', async () => {
    await run(() => { S().setPatientName('Ayşe'); S().updateIndividual('mother', { age: '52' }); });
    await click($('.patient-header'));
    const box = view.container.querySelector('input.canvas-edit, textarea.canvas-edit, .canvas-edit input, .canvas-edit textarea') || document.activeElement;
    expect(box && ['INPUT', 'TEXTAREA'].includes(box.tagName)).toBe(true);
    await typeInto(box, 'Ayşe Gül');
    await key('Enter', {}, box);
    expect(S().doc.patientName).toBe('Ayşe Gül');
    const ageText = [...drawn('mother').querySelectorAll('.annotations text.editable')].find(t => /52/.test(t.textContent));
    expect(ageText).toBeTruthy();
  });
});

describe('"Aynı köy" on the relationship line (clinician request 2026-11-05)', () => {
  it('Akrabalık: "Var" or "Aynı köy" (no "Yok"); "Aynı köy" is written on the line, corrected there or in the panel, gone with "Var"', async () => {
    await select('mother');
    await key('Escape');
    const choice = () => $$('.editor-body [role="radiogroup"]').find(r => r.getAttribute('aria-label') === 'Akrabalık');
    expect(buttons(choice()).map(b => b.textContent)).toEqual(['Var', 'Aynı köy']);
    expect($('.line-note')).toBeNull();
    await click(button('Aynı köy', choice()));
    expect($('.line-note').textContent).toBe('Aynı köy');
    // a click on the words corrects them where they stand
    await click($('.line-note'));
    const box = view.container.querySelector('input.inline-edit') || document.activeElement;
    await typeInto(box, 'Yakın köy');
    await key('Enter', {}, box);
    const u = () => g().unions.find(x => x.id === 'U_PARENTS');
    expect(u().lineNote).toBe('Yakın köy');
    expect($('.line-note').textContent).toBe('Yakın köy');
    expect($('.editor-body input[aria-label="Çizginin üstündeki yazı"]').value).toBe('Yakın köy');
    // "Var": a double line, no words
    await click(button('Var', choice()));
    expect($('.line-note')).toBeNull();
    expect(u().lineNote).toBeUndefined();
  });
});

describe('the side panel is as wide as the clinician drags it (clinician request 2026-11-07)', () => {
  it('its edge is a handle: arrows widen and narrow it, a double click brings back the usual width; kept on this device', async () => {
    const { useViewSettings: views } = await import('../utils/drawingStyle');
    expect($('.panel-resizer')).toBeNull(); // no panel, no handle
    await select('mother');
    const handle = $('.panel-resizer');
    expect(handle.getAttribute('role')).toBe('separator');
    try {
      await key('ArrowLeft', {}, handle);
      expect($('.app-shell').style.getPropertyValue('--panel-w')).toBe('344px');
      expect(JSON.parse(window.localStorage.getItem('peditree.view.v1')).panelWidth).toBe(344);
      await key('ArrowRight', {}, handle);
      expect($('.app-shell').style.getPropertyValue('--panel-w')).toBe('328px');
      await run(() => handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
      expect($('.app-shell').style.getPropertyValue('--panel-w')).toBe('');
    } finally {
      await run(() => views.getState().setView({ panelWidth: 0 }));
    }
  });
});

describe('a tablet: the top bar keeps one row (clinician report 2026-11-09)', () => {
  it('the buttons with no room wait in "Diğer" (⋯), in their order, and do there what they do on the bar', async () => {
    const bar = $('.canvas-toolbar');
    const more = $('.toolbar-more > button');
    expect(more.getAttribute('aria-label')).toBe('Diğer');
    // what toolbarFit does when the bar is too narrow (jsdom has no layout): three buttons go into Diğer
    const moved = ['cite', 'feedback', 'relayout'].map(id => bar.querySelector(`[data-overflow="${id}"]`));
    try {
      moved.forEach(b => b.classList.add('overflowed'));
      bar.classList.add('has-overflow');
      await click(more);
      const items = () => [...document.querySelectorAll('.more-popover [role="menuitem"]')];
      expect(items().map(b => b.textContent)).toEqual(['Atıf', 'Geri bildirim', 'Konumlandır']);
      // Atıf from Diğer opens the citation, Diğer closes
      await click(items()[0]);
      expect($('.more-popover')).toBeNull();
      expect($('[role="dialog"][aria-label="Atıf"]')).not.toBeNull();
      // Konumlandır from Diğer arranges the drawing afresh (one undoable step)
      const steps = S()._history.length;
      await click(more);
      await click(items().find(b => b.textContent === 'Konumlandır'));
      expect(S()._history.length).toBe(steps + 1);
    } finally {
      moved.forEach(b => b.classList.remove('overflowed'));
      bar.classList.remove('has-overflow');
      if ($('.more-popover')) await key('Escape');
      if ($('[role="dialog"][aria-label="Atıf"]')) await key('Escape');
    }
  });
});

describe('the side panel opens beside the drawing (clinician report 2026-11-09, tablet)', () => {
  it('closing slides a still copy of the panel out over the drawing (clinician 2026-11-09: it vanished at once); the drawing gets its width at once, the copy takes no click and is gone when the motion ends', async () => {
    const proto = window.HTMLElement.prototype;
    const own = Object.getOwnPropertyDescriptor(proto, 'animate'); // jsdom has none
    const runs = [];
    proto.animate = function (frames, opts) {
      let end; const finished = new Promise((r) => { end = r; });
      runs.push({ el: this, frames, opts, end });
      return { finished };
    };
    const ghost = () => document.body.querySelector('.panel-ghost');
    try {
      await select('mother');
      const typed = $('.side-right input');
      expect(ghost()).toBeNull();
      await key('Escape');
      if ($('.app-shell').classList.contains('has-editor')) await key('Escape');
      expect($('.app-shell').classList.contains('has-editor')).toBe(false); // the drawing widens at once
      const g = ghost();
      expect(g).not.toBeNull();
      expect(g.getAttribute('aria-hidden')).toBe('true');
      expect(g.hasAttribute('inert')).toBe(true);
      expect(g.querySelector('[id]')).toBeNull();
      expect(g.textContent).toContain(drawn('mother').__data__.displayLabel || '');
      if (typed) expect(g.querySelector('input').value).toBe(typed.value);
      expect(view.container.contains(g)).toBe(false); // outside the app: the app itself is already closed
      expect(runs).toHaveLength(1);
      expect(runs[0].el).toBe(g);
      expect(runs[0].frames.at(-1)).toMatchObject({ opacity: 0 });
      await run(() => runs[0].end());
      expect(ghost()).toBeNull();
      // switching from one person to another is no closing
      await select('mother');
      await select('father');
      expect(ghost()).toBeNull();
      expect(runs).toHaveLength(1);
      await key('Escape');
      if ($('.app-shell').classList.contains('has-editor')) await key('Escape');
      await run(() => runs.at(-1).end());
      // reduced motion: no copy, no motion
      const mm = window.matchMedia;
      window.matchMedia = (q) => ({ ...mm(q), matches: q.includes('reduced-motion') });
      try {
        await select('mother');
        await key('Escape');
        if ($('.app-shell').classList.contains('has-editor')) await key('Escape');
        expect(ghost()).toBeNull();
        expect(runs).toHaveLength(2);
      } finally { window.matchMedia = mm; }
    } finally {
      if (own) Object.defineProperty(proto, 'animate', own); else delete proto.animate;
      document.body.querySelectorAll('.panel-ghost').forEach((n) => n.remove());
    }
  });

  it('the drawing stays where it was on screen, the same size, when the panel narrows its box; "Sığdır" still fits it', async () => {
    // jsdom has no layout: the drawing's box is 1000 px wide, 700 px while the side panel is open,
    // and the drawing fits its viewBox into that box (preserveAspectRatio meet), moved by the zoom
    const svg = $('#pedigree-svg');
    const proto = window.SVGElement.prototype;
    const ctm = proto.getScreenCTM;
    const width = () => ($('.app-shell').classList.contains('has-editor') ? 700 : 1000);
    const fit = () => {
      const [vx, vy, vw, vh] = svg.getAttribute('viewBox').split(' ').map(Number);
      const k = Math.min(width() / vw, 600 / vh);
      return { k, x: (width() - vw * k) / 2 - vx * k, y: 50 + (600 - vh * k) / 2 - vy * k };
    };
    svg.getBoundingClientRect = () => ({ left: 0, top: 50, width: width(), height: 600, right: width(), bottom: 650 });
    proto.getScreenCTM = function () {
      const f = fit();
      if (this === svg) return { a: f.k, d: f.k, e: f.x, f: f.y };
      // the viewport group, as the zoom actually moved it (its transform on the page)
      const [x, y, k] = numbersIn(this.getAttribute('transform') || 'translate(0,0) scale(1)');
      const t = { x, y, k };
      return { a: f.k * t.k, d: f.k * t.k, e: f.x + f.k * t.x, f: f.y + f.k * t.y };
    };
    const place = () => { const m = $('.pedigree-viewport').getScreenCTM(); return [m.a, m.e, m.f].map(v => Math.round(v * 1000) / 1000); };
    try {
      await run(() => S().relayout()); // a redraw notes where the drawing is
      const before = place();
      await select('mother'); // the panel opens: the box is narrower now
      expect(width()).toBe(700);
      expect(place()).toEqual(before);
      // closing the panel: still where it was
      await key('Escape');
      await key('Escape');
      expect(width()).toBe(1000);
      expect(place()).toEqual(before);
      // "Sığdır" fits the whole drawing into the box again
      await select('mother');
      await click(button('Sığdır'));
      expect(place()[0]).toBeCloseTo(fit().k, 3);
    } finally {
      proto.getScreenCTM = ctm;
      delete svg.getBoundingClientRect;
      await click(button('Sığdır'));
    }
  });
});

describe('a tablet leaves the page without warning (clinician report 2026-11-09)', () => {
  it('the last edit is kept when the tab goes to the background or the page is hidden, before the autosave would come', async () => {
    const saved = () => JSON.parse(window.sessionStorage.getItem('clinical_pedigree_app.session.v2') || '{}');
    const visibility = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState') || Object.getOwnPropertyDescriptor(document, 'visibilityState');
    try {
      for (const [name, leave] of [
        ['Background', () => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); }],
        ['Pagehide', () => window.dispatchEvent(new Event('pagehide'))],
      ]) {
        S().setPatientName(name); // the autosave waits a moment after an edit
        expect(saved().patientName).not.toBe(name);
        leave();
        expect(saved().patientName).toBe(name);
        delete document.visibilityState;
      }
    } finally {
      delete document.visibilityState;
      if (visibility && !Object.getOwnPropertyDescriptor(document, 'visibilityState') && !Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')) Object.defineProperty(Document.prototype, 'visibilityState', visibility);
      await run(() => S().setPatientName(''));
    }
  });
});

describe('a beta (clinician decision 2026-11-07)', () => {
  it('a small "Beta" badge by the logo, its meaning in the tooltip; About says the version is a beta and where to write', async () => {
    const badge = $('.toolbar .brand-btn .beta-badge');
    expect(badge.textContent).toBe('Beta');
    expect(badge.getAttribute('title')).toMatch(/Deneme sürümü/);
    await click($('.toolbar .brand-btn'));
    const about = $('[aria-label="PediTree hakkında"][role="dialog"]');
    expect(about.textContent).toMatch(/Sürüm \d+\.\d+\.\d+ \(beta\)/);
    expect(about.textContent).toMatch(/deneme \(beta\) sürümüdür/);
    await key('Escape');
  });
});

describe('the page around the drawing', () => {
  it('notices sit above the drawing in the page, never over it', async () => {
    await run(() => S().clearProband()); // a soft note appears
    const notices = $('.canvas-notices'), stage = $('.canvas-stage');
    expect(notices.querySelector('.notice-strip')).not.toBeNull();
    expect(notices.compareDocumentPosition(stage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the notes strip goes away in one click, without opening it (clinician request 2026-11-04); an export still checks them', async () => {
    await run(() => S().clearProband());
    const strip = () => $('.notice-strip');
    expect(strip().querySelector('ul')).toBeNull(); // closed
    await click(strip().querySelector('button[aria-label="Bu notların hepsini gizle"]'));
    expect(strip()).toBeNull();
    // dismissing only hides them: the warning itself is still in the data
    expect(S().warnings.length + (S().integrityIssues || []).length).toBeGreaterThan(0);
  });
});

describe('more of what the clinician sees', () => {
  const lines = () => $$('.pedigree-viewport > path:not(.ui-only), .pedigree-viewport > g.childless-mark > line').map(el => el.tagName === 'line'
    ? ['x1', 'y1', 'x2', 'y2'].map(a => Number(el.getAttribute(a)))
    : numbersIn(el.getAttribute('d')));

  it('the childless / infertile mark under a double line starts at its lower stroke', async () => {
    await run(() => {
      S().addSpouseTo('proband', 'female');
      const u = g().unions.find(x => x.partners.includes('proband')).id;
      S().setUnionRelationshipBackground(u, 'consanguinity_reported');
      S().setChildlessness(u, 'infertile');
    });
    const stem = $('.childless-mark line');
    const y1 = Number(stem.getAttribute('y1'));
    const strokes = lines().filter(n => n.length === 4 && n[1] === n[3]).map(n => n[1]);
    expect(strokes).toContain(y1);
    expect(strokes).toContain(y1 - 4);
  });

  it('another couple\'s double line at the same height moves nothing: a single line\'s descent starts on the line itself', async () => {
    await run(() => {
      S().setUnionRelationshipBackground('U_PAT_GP', 'consanguinity_reported');
    });
    const mat = g().unions.find(u => u.id === 'U_MAT_GP');
    const [a, b] = mat.partners.map(id => drawn(id).__data__);
    const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
    // the maternal grandparents' line of descent: vertical, leaving their (single) line between them
    const drop = lines().find(n => n.length === 4 && n[0] === n[2] && n[0] > lo && n[0] < hi && Math.abs(Math.min(n[1], n[3]) - a.y) <= 4);
    expect(drop).toBeTruthy();
    expect(Math.min(drop[1], drop[3])).toBe(a.y);
  });

  it('a handwritten typeface that cannot be put in the downloaded file: the clinician is told', async () => {
    const { useViewSettings } = await import('../utils/drawingStyle');
    const realFetch = globalThis.fetch;
    const dl = captureDownloads();
    globalThis.fetch = async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
    try {
      await run(() => useViewSettings.getState().setView({ fontId: 'kalam', exportAs: 'screen' }));
      await click(saveButton());
      await click(buttons().find(b => /SVG/.test(b.textContent)));
      await settle();
      expect(view.container.textContent).toMatch(/Seçilen yazı tipi dosyaya eklenemedi/);
    } finally {
      globalThis.fetch = realFetch;
      dl.restore();
      await run(() => useViewSettings.getState().setView({ fontId: 'standard' }));
    }
  });

  it('the click that closes a pop-up does nothing else (it does not select the person under it)', async () => {
    await click(button('Ayarlar'));
    await pointerDown(drawn('mother'));
    await click(drawn('mother'));
    expect(S().selectedIds).not.toContain('mother');
    // only that one click: the next tap selects as usual
    await pointerDown(drawn('mother'));
    await click(drawn('mother'));
    expect(S().selectedIds).toEqual(['mother']);
  });

  it('an edit makes the person (and anyone new) pulse — on the screen only', async () => {
    await select('mother');
    await run(() => S().addSiblingTo('mother', 'female'));
    const halos = $$('.pulse-halo');
    expect(halos.length).toBeGreaterThan(0);
    expect(halos.every(h => h.classList.contains('ui-only'))).toBe(true);
  });

  it('in a note, Shift+Enter is a new line; Enter saves', async () => {
    await select('mother');
    await key('n');
    await click(choiceRows().find(a => a.getAttribute('aria-label') === 'Not'));
    const note = $('textarea.radial-note');
    note.focus();
    await typeInto(note, 'birinci satır');
    await key('Enter', { shiftKey: true }, note);
    expect(g().individuals.find(i => i.id === 'mother').notes).toBe('');
    await key('Enter', {}, note);
    expect(g().individuals.find(i => i.id === 'mother').notes).toBe('birinci satır');
  });

  it('Bulgu: the age at diagnosis is written right beside the finding once it is "Var", free text too (clinician request 2026-11-07)', async () => {
    await run(() => S().addFinding('mother', 'Miyop', null));
    await select('mother');
    await key('b');
    const row = () => $$('.findings-panel .finding-row').find(r => r.textContent.includes('Miyop'));
    const box = row().querySelector('.finding-onset input');
    expect(box).not.toBeNull(); // added as "Var": the box is in the finding's own row
    await typeInto(box, 'çocuklukta');
    await key('Enter', {}, box);
    expect(g().individuals.find(i => i.id === 'mother').conditions[0].onsetAge).toBe('çocuklukta');
    expect($('.notes-legend').textContent).toMatch(/Miyop: tanı çocuklukta/);
    await click(button('Yok', row().querySelector('.finding-state')));
    expect($('.findings-panel .finding-onset')).toBeNull(); // "Yok": no age to write
  });

  it('a finding added with a typo is corrected in the ring: a click on its name, Enter saves for everyone; Escape keeps the old name', async () => {
    await run(() => { S().addFinding('mother', 'Miyp', null); S().setFindingStatus('father', 'Miyp', 'affected'); });
    await select('mother');
    await key('b');
    const nameButton = () => buttons($('.radial-panel')).find(b => b.getAttribute('aria-label') === 'Miyp: adı düzelt');
    expect(nameButton()).toBeDefined();
    // a small panel without a title: its named button stands beside it (clinician 2026-11-05)
    expect($('.radial-panel.findings-panel')).not.toBeNull();
    expect($('.findings-panel .radial-panel-title')).toBeNull();
    await click(nameButton());
    let box = $('.radial-panel input.finding-name-edit');
    expect(box.value).toBe('Miyp');
    await typeInto(box, 'Miyop');
    await key('Enter', {}, box);
    const labels = (id) => g().individuals.find(i => i.id === id).conditions.map(c => c.label);
    expect(labels('mother')).toEqual(['Miyop']);
    expect(labels('father')).toEqual(['Miyop']);
    expect(g().conditionKey.map(e => e.label)).toEqual(['Miyop']);
    expect($$('.condition-legend text').map(t => t.textContent)).toContain('Miyop');
    // Escape: nothing changes
    await click(buttons($('.radial-panel')).find(b => b.getAttribute('aria-label') === 'Miyop: adı düzelt'));
    box = $('.radial-panel input.finding-name-edit');
    await typeInto(box, 'Yanlış');
    await key('Escape', {}, box);
    expect(g().conditionKey.map(e => e.label)).toEqual(['Miyop']);
    expect($('.radial-panel')).not.toBeNull(); // Escape ended the correction only
  });

  // Bilgiler (clinician request 2026-11-04): one choice per part, each opening its own box
  const openInfo = async (part) => {
    if (!$('.ring-list-panel')) await key('n');
    await click(choiceRows().find(a => a.getAttribute('aria-label') === part));
    return $('.radial-info-box');
  };

  it('"Bilgiler" opens a list like Durum: Yaş, Genetik, Not (and "Ad" under "Diğer…"); what is written shows at the right', async () => {
    await run(() => S().updateIndividual('mother', { age: '52', notes: 'Meme ca\nikinci satır' }));
    await select('mother');
    await key('n');
    expect($('.radial-panel input, .radial-panel textarea')).toBeNull(); // no block of fields: a part opens its own box
    const rows = choiceRows();
    expect(rows.map(a => a.getAttribute('aria-label'))).toEqual(['Yaş', 'Genetik', 'Not', 'Diğer…']);
    expect(rows.map(a => a.querySelector('.ring-choice-value')?.textContent || '')).toEqual(['52', '', 'Meme ca', '']);
    await click(rows[3]);
    expect(choiceLabels()).toContain('Ad');
    const nameBox = await openInfo('Ad');
    expect(nameBox.querySelector('.radial-panel-title').textContent).toMatch(/^Ad/);
    // a part's box opens beside its own row, not under the list (clinician 2026-11-05: "like Bulgu");
    // the list has no title of its own: its named button stands beside it
    const row = choiceRows().find(b => b.getAttribute('aria-label') === 'Ad').parentElement;
    expect(nameBox.parentElement).toBe(row);
    expect(nameBox.classList.contains('ring-aside')).toBe(true);
    expect($('.ring-list-panel > .radial-panel-title')).toBeNull();
  });

  it('each part writes in its own box, the same fields as the side panel: age, genetic result as free text, note', async () => {
    await select('mother');
    const m = () => g().individuals.find(i => i.id === 'mother');
    const side = () => $('.editor-body');
    // Yaş
    let box = await openInfo('Yaş');
    expect(box.querySelector('.radial-panel-title').textContent).toBe('Yaş');
    const age = box.querySelector('input.input-age');
    expect(document.activeElement).toBe(age);
    await typeInto(age, '52');
    await key('Enter', {}, age);
    expect(m().age).toBe('52');
    expect(side().querySelector('input.input-age').value).toBe('52');
    // Genetik: no "−" / "+", a line written marks the test done
    box = await openInfo('Genetik');
    expect(buttons(box).some(b => /Genetik test yap/.test(b.getAttribute('aria-label') || ''))).toBe(false);
    const add = box.querySelector('input[aria-label="Varyant ya da sonuç ekle"]');
    expect(add.getAttribute('placeholder')).toMatch(/FBN1:c\./);
    expect(document.activeElement).toBe(add);
    await typeInto(add, 'FBN1:c.1585C>T het');
    await key('Enter', {}, add);
    expect([m().geneticTest, m().geneticNote]).toEqual(['tested', 'FBN1:c.1585C>T het']);
    expect(side().querySelector('input[aria-label="Genetik sonuç 1"]').value).toBe('FBN1:c.1585C>T het');
    expect(drawn('mother').querySelector('.annotations').textContent).toMatch(/FBN1:c\.1585C>T het/);
    // deleting the last line keeps "test yapıldı" and says so; "Kaldır" takes it away
    await click(buttons($('.radial-info-box')).find(b => b.getAttribute('aria-label') === 'Genetik sonuç 1 sil'));
    expect([m().geneticTest, m().geneticNote || '']).toEqual(['tested', '']);
    expect($('.radial-info-box').textContent).toMatch(/test yapıldı/);
    await click(button('Kaldır', $('.radial-info-box')));
    expect(m().geneticTest || '').toBe('');
    // Not
    box = await openInfo('Not');
    const note = box.querySelector('textarea.radial-note');
    expect(document.activeElement).toBe(note);
    await typeInto(note, 'Meme ca 45 yaşında');
    await key('Enter', {}, note);
    expect(m().notes).toBe('Meme ca 45 yaşında');
    expect(side().querySelector('textarea').value).toBe('Meme ca 45 yaşında');
    // a note emptied down to spaces or a blank line is gone: no [1] under the symbol, no "Notlar" (clinician report 2026-11-05)
    await typeInto(note, '  \n ');
    await key('Enter', {}, note);
    expect(m().notes).toBe('');
    expect(drawn('mother').querySelector('.annotations')?.textContent || '').not.toMatch(/\[1\]/);
    expect($$('.notes-legend text')).toHaveLength(0);
    await openInfo('Not');
    await openInfo('Not');
    const again = $('textarea.radial-note');
    await typeInto(again, 'Meme ca 45 yaşında');
    await key('Enter', {}, again);
    // the part shown is marked; a second click closes its box
    expect($$('.radial-panel .ring-choice.on').map(a => a.getAttribute('aria-label'))).toEqual(['Not']);
    await openInfo('Not');
    expect($('.radial-info-box')).toBeNull();
  });

  it('Genetik in the ring: "Test sonucu bekleniyor" writes that line in one tap; the line is corrected when the result comes (clinician requests 2026-11-06, 2026-11-07)', async () => {
    await select('mother');
    const m = () => g().individuals.find(i => i.id === 'mother');
    const box = await openInfo('Genetik');
    await click(button('Test sonucu bekleniyor', box));
    expect(m().geneticTest).toBe('tested');
    expect(m().geneticNote).toBe('sonuç bekleniyor');
    expect(drawn('mother').querySelector('.annotations').textContent).toMatch(/sonuç bekleniyor/);
    // a line is there: no button; the line itself is corrected
    expect(button('Test sonucu bekleniyor', $('.radial-info-box'))).toBeUndefined();
    const line = $('.radial-info-box input[aria-label="Genetik sonuç 1"]');
    expect(line.value).toBe('sonuç bekleniyor');
  });

  it('a pregnancy\'s Bilgiler has no age; Ayarlar → Halka menü hides or orders the parts', async () => {
    await run(() => S().addSiblingTo('proband', 'unknown', { ongoingPregnancy: true }));
    await select(g().individuals.find(i => i.ongoingPregnancy).id);
    await key('n');
    expect(choiceLabels()).toEqual(['Genetik', 'Not', 'Diğer…']);
    const { useRingPrefs, DEFAULT_RING } = await import('../utils/ringPrefs');
    try {
      await select('mother');
      await click(button('Ayarlar'));
      const dialog = document.querySelector('.settings-dialog');
      await click([...dialog.querySelectorAll('[role="tab"]')].find(b => b.textContent.includes('Halka menü')));
      expect(dialog.querySelector('[role="tabpanel"]').textContent).toMatch(/Bilgiler düğmesindeki seçenekler/);
      const sw = (name) => [...dialog.querySelectorAll('.set-list-label')].filter(l => l.textContent === name).at(-1).querySelector('input');
      expect(sw('Ad').checked).toBe(false);
      await click(sw('Genetik'));
      const up = () => buttons(dialog).filter(b => b.getAttribute('aria-label') === 'Not: yukarı').at(-1);
      await click(up());
      await click(up());
      await key('Escape');
      await select('mother');
      await key('n');
      expect(choiceLabels()).toEqual(['Not', 'Yaş', 'Diğer…']);
    } finally {
      await run(() => useRingPrefs.getState().setRing(DEFAULT_RING));
    }
  });

  it('Durum: the sexes side by side, then one row per choice with a check on what is on; "Diğer…" in the same list; no bands around the ring', async () => {
    await run(() => S().updateIndividual('mother', { affected: true }));
    await select('mother');
    // every corner button says its name
    expect($$('.radial-sat .radial-sat-label').map(l => l.textContent)).toEqual(['Bulgu', 'Durum', 'İkiz', 'Bilgiler']);
    await key('d');
    expect($('.radial-arcs')).toBeNull();
    const sexes = $$('.radial-panel .ring-sex button');
    expect(sexes.map(b => [b.textContent, b.getAttribute('aria-checked')])).toEqual([['Erkek', 'false'], ['Kadın', 'true'], ['Bilinmiyor', 'false']]);
    const on = () => choiceRows().filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.getAttribute('aria-label'));
    expect(on()).toEqual(['Etkilenmiş']);
    expect(choiceRows().find(b => b.classList.contains('on')).querySelector('.ring-check svg')).not.toBeNull();
    await click(choiceRows().find(b => b.getAttribute('aria-label') === 'Taşıyıcı'));
    expect(g().individuals.find(i => i.id === 'mother').carrier).toBe(true);
    expect(on()).toEqual(['Etkilenmiş', 'Taşıyıcı']);
    // the hidden choice comes into the same list
    expect(choiceLabels()).not.toContain('Presemptomatik');
    await click(choiceRows().find(b => b.textContent.includes('Diğer')));
    expect(choiceLabels()).toContain('Presemptomatik');
  });

  it('a mouse that comes over a corner button opens its list, and the click that follows keeps it open', async () => {
    await select('mother');
    const durum = $$('.radial-sat').find(b => b.getAttribute('aria-label') === 'Durum');
    // React's pointer enter comes from "pointerover"
    await run(() => durum.dispatchEvent(pointer('pointerover', 'mouse', document.body)));
    expect($('.ring-list-panel')).not.toBeNull();
    await click(durum);
    expect($('.ring-list-panel')).not.toBeNull();
    // a click later on closes it, as before
    await click(durum);
    expect($('.ring-list-panel')).toBeNull();
  });

  it('a pen or a finger: a tap opens the choices and they stay open when the pen lifts (clinician report 2026-11-09)', async () => {
    await select('mother');
    const sibling = $$('.radial-sector').find(el => el.getAttribute('aria-label') === 'Kardeş');
    for (const kind of ['pen', 'touch']) {
      // a tap: "enter", the click, then "leave" as the pen or finger lifts
      await run(() => sibling.dispatchEvent(pointer('pointerover', kind, document.body)));
      await click(sibling);
      await run(() => sibling.dispatchEvent(pointer('pointerout', kind, document.body)));
      await new Promise((r) => setTimeout(r, 400)); // past the delay after which a mouse leaving closes them
      await run();
      expect(flyout()).not.toBeNull();
      await click(sibling);
      expect(flyout()).toBeNull();
    }
  });

  it('İkiz: the three kinds as a list; a choice adds the twin and closes the list', async () => {
    await select('mother');
    await key('i');
    expect(choiceRows().map(b => b.getAttribute('aria-label'))).toEqual(['Tek yumurta', 'Çift yumurta', 'Bilinmiyor']);
    const kids = () => g().parentChildRelationships.find(r => r.children.includes('mother')).children.length;
    const before = kids();
    await click(choiceRows()[1]);
    expect(kids()).toBe(before + 1);
    expect(g().parentChildRelationships.find(r => r.children.includes('mother')).multiples[0].zygosity).toBe('dizygotic');
    expect($('.ring-list-panel')).toBeNull();
  });

  it('Ayarlar → Çizim → Sayfa zemini: squared or dotted paper is kept on this device; a download stays plain', async () => {
    await click(button('Ayarlar'));
    await click(document.getElementById('set-tab-drawing')); // the window stands on the page itself
    const group = document.querySelector('.segmented[aria-label="Sayfa zemini"]');
    expect([...group.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Düz', 'Kareli', 'Noktalı']);
    await click([...group.querySelectorAll('button')].find(b => b.textContent === 'Kareli'));
    expect(useViewSettings.getState().view.paper).toBe('grid');
    expect(JSON.parse(window.localStorage.getItem('peditree.view.v1')).paper).toBe('grid');
    // the copy for a download loses the screen's background
    const svg = $('#pedigree-svg');
    svg.style.backgroundImage = 'linear-gradient(red, red)';
    expect(prepareExportSvg(svg).getAttribute('style')).toBeNull();
    await run(() => useViewSettings.getState().setView({ paper: 'plain' }));
  });

  it('the findings key: every name can be corrected where it stands; the entries follow one another with the same gap', async () => {
    await run(() => { S().addFinding('mother', 'Miyop', null); S().addFinding('father', 'Kolestaz', null); S().addFinding('proband', 'OHA', null); S().clearProband(); });
    const entries = $$('.condition-legend text.editable');
    expect(entries.map(t => t.textContent)).toEqual(expect.arrayContaining(['Miyop', 'Kolestaz', 'OHA']));
    // on one row: the gap from the end of an entry's text to the next entry's symbol is the same
    const rows = new Map();
    for (const t of entries) { const y = t.getAttribute('y'); if (!rows.has(y)) rows.set(y, []); rows.get(y).push(t); }
    const row = [...rows.values()].find(r => r.length >= 2);
    if (row) {
      const xs = row.map(t => [Number(t.getAttribute('x')), t.textContent.length * 6]).sort((p, q) => p[0] - q[0]);
      const gaps = xs.slice(1).map(([x], k) => Math.round(x - (xs[k][0] + xs[k][1])));
      expect(new Set(gaps).size).toBe(1);
    }
  });
});

describe('lines carry their meaning in every case', () => {
  const strokesOf = (unionId) => {
    const [a, b] = g().unions.find(u => u.id === unionId).partners.map(id => drawn(id).__data__);
    const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
    return $$('.pedigree-viewport > path:not(.ui-only)').filter(p => {
      const n = numbersIn(p.getAttribute('d'));
      return n.length === 4 && n[1] === n[3] && Math.abs(n[1] - a.y) <= 2 && Math.min(n[0], n[2]) >= lo && Math.max(n[0], n[2]) <= hi;
    });
  };

  it('the room the layout keeps under a symbol is the room the drawing\'s lines take (symbolText.js; clinician report 2026-11-05)', async () => {
    const { textBox, TEXT } = await import('../utils/symbolText');
    await run(() => S().updateIndividual('mother', { age: '52', sexAtBirth: 'AFAB', displayLabel: 'Ayşe', geneticTest: 'tested', geneticNote: 'APC:c.1234G>A Het\nBRCA2 VUS', notes: 'öykü' }));
    await run(() => S().updateIndividual('father', { deceased: true, ageAtDeath: '61' }));
    for (const id of ['mother', 'father', 'proband']) {
      const texts = [...drawn(id).querySelectorAll('.annotations text')];
      const genetic = texts.filter(t => t.getAttribute('font-size') === '9px' && !/^\[\d+\]$/.test(t.textContent)).length;
      const lines = texts.length - genetic;
      const drawnDepth = lines + genetic ? TEXT.HALF + TEXT.FIRST + lines * TEXT.LINE + genetic * TEXT.GENETIC : TEXT.HALF;
      expect(textBox(g().individuals.find(i => i.id === id)).depth, id).toBe(drawnDepth);
    }
    // the widest line is no wider than the layout thinks (a character at most 0.68 of the font size)
    const widest = Math.max(...[...drawn('mother').querySelectorAll('.annotations text')].map(t => t.textContent.length * parseFloat(t.getAttribute('font-size')) * TEXT.EM));
    expect(2 * textBox(g().individuals.find(i => i.id === 'mother')).left).toBeGreaterThanOrEqual(widest - 0.01);
    await run(() => S().resetPedigree());
  });

  it('an older file whose note, cause of death or old text is only spaces gets no note number and no "Notlar" (clinician report 2026-11-05)', async () => {
    const { starterDocument } = await import('../state/usePedigreeStore');
    const doc = starterDocument();
    const mother = doc.graph.individuals.find(i => i.id === 'mother');
    Object.assign(mother, { notes: ' \n ', deceased: true, causeOfDeath: '  ', condition: ' ' });
    await run(() => S().openProjectFile(JSON.stringify(doc)));
    expect(g().individuals.find(i => i.id === 'mother').notes).toBe(' \n ');
    expect(drawn('mother').querySelector('.annotations')?.textContent || '').not.toMatch(/\[\d+\]/);
    expect($$('.notes-legend text')).toHaveLength(0);
    await run(() => S().resetPedigree());
  });

  it('consanguinity drawn from shared ancestors looks exactly like a declared one: two solid strokes, no dashes, no text', async () => {
    const { buildTemplate, relationSpec } = await import('../graph/templates');
    const { starterDocument } = await import('../state/usePedigreeStore');
    const t = buildTemplate(starterDocument(), relationSpec({ father: ['male'], mother: ['male'] }));
    await run(() => S().openProjectFile(JSON.stringify(t.doc)));
    const parents = g().unions.find(u => u.partners.includes('father') && u.partners.includes('mother'));
    expect(parents.consanguinityStatus).not.toBe('reported_unresolved');
    const structural = strokesOf(parents.id);
    expect(structural).toHaveLength(2);
    expect(structural.every(p => !p.getAttribute('stroke-dasharray'))).toBe(true);
    await run(() => S().resetPedigree());
    await run(() => S().setUnionRelationshipBackground('U_PARENTS', 'consanguinity_reported'));
    const declared = strokesOf('U_PARENTS');
    expect(declared).toHaveLength(2);
    expect(declared.map(p => p.getAttribute('stroke'))).toEqual(structural.map(p => p.getAttribute('stroke')));
    // no text on any line of the drawing
    expect($$('.pedigree-viewport > text')).toHaveLength(0);
  });

  it('the downloaded copy in "her zaman standart" is drawn standard even when the screen is hand-drawn', async () => {
    const { useViewSettings, exportSpec } = await import('../utils/drawingStyle');
    const { prepareExportSvg } = await import('../utils/exportUtils');
    try {
      await run(() => useViewSettings.getState().setView({ drawStyle: 'hand', exportAs: 'standard' }));
      const svg = $('.pedigree-viewport').ownerSVGElement;
      expect(svg.querySelectorAll('.hand-stroke').length).toBeGreaterThan(0);
      const copy = prepareExportSvg(svg, { spec: exportSpec(useViewSettings.getState().view) });
      expect(copy.querySelectorAll('.hand-stroke, .pedigree-shape-sketch')).toHaveLength(0);
      expect([...copy.querySelectorAll('.pedigree-shape')].every(s => s.getAttribute('stroke-opacity') !== '0')).toBe(true);
    } finally {
      await run(() => useViewSettings.getState().setView({ drawStyle: 'standard', exportAs: 'screen' }));
    }
  });
});

describe('the top bar (clinician request 2026-11-04: one row, no wasted room)', () => {
  it('what folds to its icon, the least used first, and that Kaydet never does; a folded word stays for screen readers', async () => {
    const parts = $$('.canvas-toolbar [data-fold-order]')
      .sort((a, b) => a.dataset.foldOrder - b.dataset.foldOrder)
      .filter(p => p.classList.contains('btn-label'))
      .map(p => p.textContent);
    expect(parts).toEqual(['Geri bildirim', 'Atıf', 'Konumlandır', 'Çoklu seçim', 'Ayarlar', 'Aç', 'Yeni']);
    // Yazdır, Paylaş: icons alone at every width (clinician 2026-11-05), named for screen readers, with a tooltip
    for (const name of ['Yazdır', 'Paylaş']) {
      const b = buttons().find(x => x.textContent.includes(name));
      expect(b.querySelector('.btn-label.icon-only')?.textContent, name).toBe(name);
      expect(b.title, name).toBeTruthy();
    }
    const save = buttons().find(b => b.textContent.includes('Kaydet'));
    expect(save.querySelector('[data-fold-order]')).toBeNull();
    // a folded word is hidden by the stylesheet only: the button still has its name
    $$('.canvas-toolbar .btn-label').forEach(l => l.classList.add('folded'));
    expect(button('Ayarlar')).toBeTruthy();
    $$('.canvas-toolbar .btn-label').forEach(l => l.classList.remove('folded'));
  });
});

describe('the About window (the logo), Atıf and Geri bildirim (clinician request 2026-11-04)', () => {
  it('the logo: what PediTree is, that patient data goes nowhere, its licence and copyright — no trademark line; the rest in Ayarlar', async () => {
    const { REPOSITORY_URL } = await import('../utils/appInfo');
    await click(button('PediTree hakkında'));
    const about = $('[data-popup="about"] [role="dialog"]');
    const text = about.textContent;
    expect(text).toMatch(/tıbbi cihaz niteliği taşımaz/);
    expect(text).toMatch(/Hasta bilgileri hiçbir sunucuya gönderilmez/);
    expect(text).toMatch(/Apache 2\.0/);
    expect(text).toMatch(/© 2026 Muhammed Doğukan Kalenderoğlu/);
    expect(text).not.toMatch(/lisansa dahil değildir/);
    expect(text).not.toMatch(/Atfı kopyala|Hata bildir/); // in the top bar now
    expect([...about.querySelectorAll('a')].map(a => a.getAttribute('href'))).toContain(REPOSITORY_URL);
    // its button opens Ayarlar at Hakkında, where everything is
    await click(buttons(about).find(b => b.textContent.includes('Ayarlar')));
    const dialog = document.querySelector('.settings-dialog');
    expect(dialog.querySelector('[role="tab"][aria-selected="true"]').textContent).toMatch(/Hakkında/);
    const all = dialog.querySelector('[role="tabpanel"]').textContent;
    for (const part of [/tıbbi cihaz niteliği taşımaz/, /Atfı kopyala/, /Hata bildir/, /Apache 2\.0/, /© 2026/]) expect(all).toMatch(part);
    await key('Escape');
  });

  it('"Atıf" and "Geri bildirim" in the top bar: the citation to copy; the real forms and e-mail, with the warning about patient data', async () => {
    const { REPOSITORY_URL, CONTACT_EMAIL, citationText } = await import('../utils/appInfo');
    await click(button('Atıf'));
    const cite = $('[data-popup="cite"] [role="dialog"]');
    expect(cite.querySelector('.about-cite').textContent).toBe(citationText());
    expect(buttons(cite).some(b => b.textContent === 'Atfı kopyala')).toBe(true);
    // the request reads plainly, no "şöyle" (clinician 2026-11-07); the citation follows it
    expect(cite.textContent).toMatch(/atıf yapılması rica olunur:/);
    await key('Escape');
    expect($('[data-popup="cite"] [role="dialog"]')).toBeNull();
    await click(button('Geri bildirim'));
    const fb = $('[data-popup="feedback"] [role="dialog"]');
    expect(fb.textContent).toMatch(/hasta adı, doğum tarihi/);
    const links = [...fb.querySelectorAll('a')].map(a => a.getAttribute('href'));
    expect(links).toEqual(expect.arrayContaining([
      `${REPOSITORY_URL}/issues/new?template=hata-bildirimi.yml`,
      `${REPOSITORY_URL}/issues/new?template=oneri.yml`,
    ]));
    expect(links.some(h => h.startsWith(`mailto:${CONTACT_EMAIL}`))).toBe(true);
    await key('Escape');
  });
});

describe('assisted reproduction on the screen', () => {
  it('"D" in a donor\'s and a surrogate\'s symbol, "G" in a gestational carrier\'s; white on a filled symbol; solid lines', async () => {
    await run(() => { S().addReproductiveLink('proband', 'sperm_donor'); S().addSiblingTo('proband', 'female'); });
    const sis = g().parentChildRelationships.find(r => r.unionId === 'U_PARENTS').children.find(c => c !== 'proband');
    await run(() => S().addReproductiveLink(sis, 'gestational_carrier'));
    const [donor, carrier] = g().reproductiveLinks.map(l => l.personId);
    expect(drawn(donor).querySelector('.repro-mark').textContent).toBe('D');
    expect(drawn(carrier).querySelector('.repro-mark').textContent).toBe('G');
    expect(drawn(donor).getAttribute('aria-label')).toMatch(/donör/);
    await run(() => S().updateIndividual(donor, { affected: true }));
    expect(drawn(donor).querySelector('.repro-mark').getAttribute('fill')).not.toBe(drawn(donor).querySelector('.pedigree-shape').getAttribute('fill'));
    const lines = $$('.repro-line');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.every(l => !l.getAttribute('stroke-dasharray'))).toBe(true);
  });

  it('the child\'s panel adds a donor (a new person, or someone in the drawing) and takes it away', async () => {
    await run(() => S().addSiblingTo('mother', 'female'));
    await select('proband');
    // rare: under "Diğer bilgiler…" until the clinician brings it forward (Ayarlar → Yan panel)
    expect(panelText()).not.toMatch(/Yardımcı üreme/);
    await click(buttons().find(b => b.textContent.startsWith('Diğer bilgiler')));
    expect(panelText()).toMatch(/Yardımcı üreme/);
    await click(button('Sperm donörü'));
    expect(g().reproductiveLinks.map(l => l.role)).toEqual(['sperm_donor']);
    const aunt = g().parentChildRelationships.find(r => r.children.includes('mother')).children.find(c => c !== 'mother');
    await select('proband');
    const who = [...$$('.editor-body select')].find(s => [...s.options].some(o => o.value === aunt));
    await run(() => { who.value = aunt; who.dispatchEvent(new Event('change', { bubbles: true })); });
    await click(button('Gestasyonel taşıyıcı (G)'));
    expect(g().reproductiveLinks.find(l => l.role === 'gestational_carrier').personId).toBe(aunt);
    expect(button('Gestasyonel taşıyıcı (G)').disabled).toBe(true);
    await click(buttons().find(b => b.textContent === 'Kaldır'));
    expect(g().reproductiveLinks.map(l => l.role)).toEqual(['gestational_carrier']);
  });

  it('a donor\'s ring: no family directions, with the reason; the panel says whom they are a donor for', async () => {
    await run(() => S().addReproductiveLink('proband', 'egg_donor'));
    const donor = g().reproductiveLinks[0].personId;
    await select(donor);
    await key('k');
    expect(flyoutText()).toMatch(/ailesi çizilmez/);
    expect(panelText()).toMatch(/için yumurta donörü/);
  });
});

describe('every person, every part of the ring (the areas that kept breaking)', () => {
  it('in the family with every mark: each person selected, each ring part opened — never a blank page, and each kind gets its own choices', async () => {
    const { buildMarkFamily } = await import('../audit/markCollisions');
    await run(() => buildMarkFamily(usePedigreeStore));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const seen = {};
    for (const p of g().individuals) {
      if (p.placeholder) continue;
      await select(p.id);
      expect($('.pedigree-viewport')).not.toBeNull();
      for (const k of ['k', 'c', 'd', 'b', 'i', 'n']) {
        await key(k);
        expect($('.pedigree-viewport')).not.toBeNull();
      }
      await key('k');
      const kind = p.count !== undefined ? 'group' : p.relation === 'art_donor' ? 'donor'
        : ['pregnancyLoss', 'stillbirth', 'ongoingPregnancy', 'termination', 'ectopic'].some(f => p[f]) ? 'pregnancy' : 'person';
      seen[kind] = flyoutText();
      await key('Escape');
    }
    // a donor's ring offers no family; a pregnancy offers siblings; a person offers the rows
    expect(seen.donor).toMatch(/ailesi çizilmez/);
    expect(seen.person).toMatch(/Gebelik/);
    expect(seen.pregnancy).toMatch(/Kardeş|Gebelik|Erkek|Kız/);
    expect(errors.mock.calls.filter(c => /Uncaught|TypeError|Cannot read/.test(String(c[0])))).toEqual([]);
    errors.mockRestore();
  });
});

describe('notation per the literature (NSGC 2022 and its 2025 correction)', () => {
  it('the deceased slash runs from the lower left to the upper right, as NSGC draws it, and stops at the corner of the proband’s arrow (clinician 2026-11-11)', async () => {
    await run(() => { S().updateIndividual('father', { deceased: true }); S().updateIndividual('proband', { deceased: true }); });
    for (const id of ['father', 'proband']) {
      const l = drawn(id).querySelector('.deceased-slash');
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(a => Number(l.getAttribute(a)));
      expect(x2 > x1 && y2 < y1).toBe(true);
    }
    const p = drawn('proband').querySelector('.deceased-slash'), f = drawn('father').querySelector('.deceased-slash');
    expect(Number(p.getAttribute('y1'))).toBeLessThan(Number(f.getAttribute('y1')));
  });

  it('ectopic pregnancy: the triangle with a slash and "ECT" below, like a termination but named', async () => {
    await run(() => { S().addChildTo('proband', 'unknown', { ectopic: true }); S().addChildTo('proband', 'unknown', { termination: true }); });
    const ect = g().individuals.find(i => i.ectopic).id, top = g().individuals.find(i => i.termination).id;
    expect(drawn(ect).querySelectorAll(':scope > line').length).toBe(1);
    expect(drawn(top).querySelectorAll(':scope > line').length).toBe(1);
    expect([...drawn(ect).querySelectorAll('text')].some(t => t.textContent === 'ECT')).toBe(true);
  });

  it('a carrier without a named finding: the left half cross-hatched, explained as "Taşıyıcı" in the key; never the old dot', async () => {
    await run(() => { S().updateIndividual('mother', { carrier: true }); S().updateIndividual('father', { carrier: true, affected: true }); });
    for (const id of ['mother', 'father']) {
      expect(drawn(id).querySelector('.condition-carrier').getAttribute('fill')).toBe('url(#fill-cross)');
      expect(drawn(id).querySelector('.carrier-dot')).toBeNull();
    }
    expect(drawn('father').querySelector('.condition-region').getAttribute('fill')).not.toBe('url(#fill-cross)');
    const row = $$('.condition-legend text').find(t => t.textContent === 'Taşıyıcı');
    expect(row).toBeTruthy();
    expect(row.classList.contains('editable')).toBe(false);
    await run(() => { S().updateIndividual('mother', { carrier: false }); S().updateIndividual('father', { carrier: false }); });
    expect($$('.condition-legend text').some(t => t.textContent === 'Taşıyıcı')).toBe(false);
  });

  it('a symbol in halves has no line across its empty half (clinician report 2026-11-04); quarters keep both lines', async () => {
    await run(() => { S().updateIndividual('mother', { carrier: true }); S().updateIndividual('father', { carrier: true, affected: true }); });
    const across = (id) => [...drawn(id).querySelectorAll('.region-divider')].filter(l => l.getAttribute('y1') === l.getAttribute('y2'));
    expect(across('mother')).toHaveLength(0);
    expect(across('father')).toHaveLength(0);
    expect(drawn('mother').querySelectorAll('.region-divider')).toHaveLength(1); // the line between the halves
    // a finding in a quarter: the symbol keeps both lines
    await run(() => { S().updateIndividual('mother', { carrier: false }); S().addFinding('mother', 'Miyop'); });
    expect(across('mother')).toHaveLength(1);
  });

  it('Ayarlar → "Ortada nokta": the carrier as a dot, in the drawing, the key and a download; the file is untouched', async () => {
    await run(() => { S().updateIndividual('mother', { carrier: true }); S().updateIndividual('father', { carrier: true, affected: true }); });
    const doc = S().doc;
    try {
      await run(() => useViewSettings.getState().setView({ carrierMark: 'dot' }));
      expect(S().doc).toBe(doc);
      // the mother: an empty circle with a dark dot in the middle, no hatched half
      expect(drawn('mother').querySelector('.condition-carrier')).toBeNull();
      const dot = drawn('mother').querySelector('.carrier-dot');
      expect([dot.getAttribute('cx'), dot.getAttribute('cy'), dot.getAttribute('fill')]).toEqual(['0', '0', '#1e293b']);
      // the father, affected: a filled square with a white dot
      expect(drawn('father').querySelector('.pedigree-shape').getAttribute('fill')).toBe('#1e293b');
      expect(drawn('father').querySelector('.carrier-dot').getAttribute('fill')).toBe('#ffffff');
      // the key explains the dot
      const row = $$('.condition-legend text').find(t => t.textContent === 'Taşıyıcı');
      expect(row.parentNode.querySelector('.carrier-dot') || row.previousElementSibling?.querySelector?.('.carrier-dot')).toBeTruthy();
      expect($$('.condition-legend [fill="url(#fill-cross)"]')).toHaveLength(0);
      // a download "always standard" still has the dot
      await run(() => useViewSettings.getState().setView({ exportAs: 'standard' }));
      const copy = prepareExportSvg($('.pedigree-viewport').ownerSVGElement);
      expect(copy.querySelectorAll('.carrier-dot').length).toBeGreaterThanOrEqual(3);
    } finally {
      await run(() => useViewSettings.getState().setView({ carrierMark: 'split', exportAs: 'screen' }));
    }
    expect(drawn('mother').querySelector('.carrier-dot')).toBeNull();
    expect(drawn('mother').querySelector('.condition-carrier')).toBeTruthy();
  });

  it('a carrier of a named finding keeps that finding\'s pattern with the dot chosen: a dot cannot say which', async () => {
    await run(() => S().addFinding('mother', 'FMF'));
    await run(() => { S().setFindingStatus('mother', 'FMF', 'carrier'); S().updateIndividual('mother', { carrier: true }); });
    try {
      await run(() => useViewSettings.getState().setView({ carrierMark: 'dot' }));
      expect(drawn('mother').querySelector('.condition-carrier')).toBeTruthy();
      expect(drawn('mother').querySelector('.carrier-dot')).toBeNull();
    } finally {
      await run(() => useViewSettings.getState().setView({ carrierMark: 'split' }));
    }
  });
});

describe('the ring\'s "Yardımcı üreme ile" row', () => {
  it('hidden at first, under "Diğer…"; a role, then the child: the child and the donor in one step', async () => {
    await select('mother');
    await key('c');
    expect(flyoutText()).not.toMatch(/Yardımcı üreme ile/);
    await click(button('Diğer…', flyout()));
    expect(flyoutText()).toMatch(/Yardımcı üreme ile/);
    const add = () => buttons(flyout()).find(b => /devam eden gebelik/.test(b.getAttribute('aria-label') || ''));
    expect(add().disabled).toBe(true); // a role first
    await click(buttons(flyout()).find(b => b.textContent === 'Sperm donörü'));
    await click(add());
    const pregnancy = g().individuals.find(i => i.ongoingPregnancy);
    expect(pregnancy).toBeTruthy();
    expect(g().reproductiveLinks).toEqual([expect.objectContaining({ childId: pregnancy.id, role: 'sperm_donor' })]);
  });
});

describe('NSGC 2022 additions (clinician decisions 2026-11-02) and the trimmed side panel', () => {
  it('ended relationship, presymptomatic carrier, sex at birth and LMP: entered from the ring and the panel, drawn, explained in the key', async () => {
    // presymptomatic: hidden in the ring at first, under "Diğer…" in Durum
    await select('mother');
    await key('d');
    expect(choiceLabels().join(' ')).not.toMatch(/Presemptomatik/);
    await click(choiceRows().find(a => a.textContent.includes('Diğer')));
    const pre = choiceRows().find(a => a.textContent.includes('Presemptomatik'));
    await click(pre);
    expect(g().individuals.find(i => i.id === 'mother').presymptomatic).toBe(true);
    expect(drawn('mother').querySelector('.presymptomatic-line')).not.toBeNull();
    expect($('.condition-legend').textContent).toMatch(/Presemptomatik/);
    // affected: the line goes (symptoms now)
    await run(() => S().updateIndividual('mother', { affected: true }));
    expect(drawn('mother').querySelector('.presymptomatic-line')).toBeNull();
    // sex at birth: hidden in the panel at first; shown once brought forward or filled (on someone without
    // children: a father recorded AFAB would leave his children without a known sperm source — validate.js)
    await key('Escape');
    await select('proband');
    expect(panelText()).not.toMatch(/Doğumda atanan cinsiyet/);
    await click(buttons().find(b => b.textContent.startsWith('Diğer bilgiler')));
    await click(button('AFAB'));
    expect(g().individuals.find(i => i.id === 'proband').sexAtBirth).toBe('AFAB');
    expect(drawn('proband').querySelector('.sex-at-birth').textContent).toBe('AFAB');
    await key('Escape'); await key('Escape');
    await select('proband');
    expect(panelText()).toMatch(/Doğumda atanan cinsiyet/); // filled: shown without "Diğer bilgiler"
    // LMP of an ongoing pregnancy, under the P
    await run(() => S().addChildToUnion('U_PARENTS', 'unknown', { ongoingPregnancy: true }));
    const p = g().individuals.find(i => i.ongoingPregnancy).id;
    await run(() => S().updateIndividual(p, { lmp: '3.5.26' }));
    expect(g().individuals.find(i => i.id === p).lmp).toBe('2026-05-03');
    expect(drawn(p).querySelector('.lmp-line').textContent).toBe('SAT 03.05.2026');
    // a born child has no LMP; a future date is refused
    await run(() => S().updateIndividual('proband', { lmp: '3.5.26' }));
    expect(g().individuals.find(i => i.id === 'proband').lmp).toBeUndefined();
    // ended relationship: "//"
    await run(() => S().setUnionStatus('U_PARENTS', 'divorced'));
    expect($$('.relationship-ended')).toHaveLength(2);
  });

  it('records reviewed (*): from the panel (under "Diğer bilgiler…" at first), at the lower right, outside brackets, in the key; About names what is not supported', async () => {
    await select('mother');
    expect(panelText()).not.toMatch(/Kayıtlarla doğrulandı/);
    await click(buttons().find(b => b.textContent.startsWith('Diğer bilgiler')));
    const box = [...$$('.editor-body label.check')].find(l => l.textContent.includes('Kayıtlarla doğrulandı'));
    await click(box.querySelector('input'));
    expect(g().individuals.find(i => i.id === 'mother').recordsReviewed).toBe(true);
    const star = drawn('mother').querySelector('.records-reviewed');
    expect(star.textContent).toBe('*');
    expect(+star.getAttribute('x')).toBeGreaterThan(0);
    expect(+star.getAttribute('y')).toBeGreaterThan(0);
    expect($('.condition-legend').textContent).toMatch(/Kayıtlarla doğrulandı/);
    // an adopted person: the asterisk stands outside the brackets
    const plainX = +star.getAttribute('x');
    await run(() => S().setAdoption('mother', 'out'));
    expect(+drawn('mother').querySelector('.records-reviewed').getAttribute('x')).toBeGreaterThan(plainX);
    // unticked: gone, from the drawing and the key
    await run(() => S().updateIndividual('mother', { recordsReviewed: false }));
    expect(drawn('mother').querySelector('.records-reviewed')).toBeNull();
    expect(g().individuals.find(i => i.id === 'mother').recordsReviewed).toBeUndefined();
    await key('Escape'); await key('Escape');
    await click(button('PediTree hakkında'));
    // same-sex partners are no longer "not supported" (Ayarlar → Çizim, clinician decision 2026-11-10)
    expect($('[data-popup="about"]').textContent).not.toMatch(/aynı cinsiyetten eşler/);
    await key('Escape');
  });

  it('Ayarlar → Yan panel: a part hidden there leaves the panel, comes back under "Diğer bilgiler…", and is kept on this device', async () => {
    await click(button('Ayarlar') || buttons().find(b => b.textContent.includes('Ayarlar')));
    const dialog = document.querySelector('.settings-dialog');
    await click([...dialog.querySelectorAll('[role="tab"]')].find(b => b.textContent.includes('Yan panel')));
    const box = [...dialog.querySelectorAll('label.set-row')].find(l => l.textContent.includes('Genetik test'));
    expect(box.querySelector('input').getAttribute('role')).toBe('switch');
    await click(box.querySelector('input'));
    await key('Escape');
    await select('mother');
    expect(panelText()).not.toMatch(/Genetik test/);
    await click(buttons().find(b => b.textContent.startsWith('Diğer bilgiler')));
    expect(panelText()).toMatch(/Genetik test/);
    expect(JSON.parse(window.localStorage.getItem('peditree.panel.v1')).hidden).toContain('genetic');
    // put back
    const { usePanelPrefs, DEFAULT_PANEL } = await import('../utils/panelPrefs');
    await run(() => usePanelPrefs.getState().setPanel(DEFAULT_PANEL));
  });
});

describe('the two free texts of a person (clinician question 2026-11-03)', () => {
  it('"Ad ya da kısaltma" goes under the symbol, "Not" into the numbered notes; the panel says where, once under both; a long name is warned about', async () => {
    await select('mother');
    const fields = $$('.editor-body label.field-col');
    const nameField = fields.find(l => l.textContent.includes('Ad ya da kısaltma'));
    const noteField = fields.find(l => l.textContent.includes('Not'));
    // one line under the two boxes (clinician 2026-11-05: the panel was too wordy), right after them
    const where = noteField.nextElementSibling;
    expect(where.textContent).toBe('Ad sembolün altında, not ise pedigrinin altında kişinin numarasıyla birlikte gösterilir.');
    await typeInto(nameField.querySelector('input'), 'Ayşe');
    await key('Enter', {}, nameField.querySelector('input'));
    await typeInto(noteField.querySelector('textarea'), 'Kardiyoloji takibinde');
    await key('Enter', {}, noteField.querySelector('textarea'));
    const m = g().individuals.find(i => i.id === 'mother');
    expect(m.displayLabel).toBe('Ayşe');
    expect(m.notes).toBe('Kardiyoloji takibinde');
    expect(drawn('mother').querySelector('.annotations').textContent).toMatch(/Ayşe/);
    expect(drawn('mother').querySelector('.annotations').textContent).toMatch(/\[1\]/);
    expect($('.notes-legend').textContent).toMatch(/Kardiyoloji takibinde/);
    // a long name: the panel says to put the details in the note
    await run(() => S().updateIndividual('mother', { displayLabel: 'Ayşe Yılmaz, 3 yıl önce opere' }));
    expect(panelText()).toMatch(/Uzun metinler çizimi kalabalıklaştırır/);
  });
});

describe('the side panel, calm and clear (clinician request 2026-11-05: "premium, not raw")', () => {
  const panelTitle = () => $('.side-header').textContent.replace(/\s+/g, ' ');
  const partnerTitles = () => $$('.editor-body .partner-title').map(el => el.textContent.replace(/\s+/g, ' ').trim());

  it('the header: the person’s symbol in miniature, the number, and what the drawing says as small labels', async () => {
    await run(() => S().updateIndividual('proband', { age: '34' }));
    await select('proband');
    expect($('.side-header .person-glyph rect')).not.toBeNull(); // a man: a square
    expect($('.side-header .person-id').textContent).toBe('III-1');
    expect($$('.side-header .person-chip').map(c => c.textContent)).toEqual(['Erkek', '34 yaş', 'Proband']);
    await select('mother');
    expect($('.side-header .person-glyph circle')).not.toBeNull();
    expect(panelTitle()).not.toMatch(/Proband/);
  });

  it('the tip on the ring’s buttons is said once on this device: "Anladım" puts it away for every person', async () => {
    const { usePanelTip } = await import('../utils/panelPrefs');
    await run(() => usePanelTip.setState({ seen: false }));
    await select('mother');
    expect(panelText()).toMatch(/Düğmeler görünmüyorsa/);
    await click(button('Anladım', $('.editor-body')));
    expect(panelText()).not.toMatch(/Düğmeler görünmüyorsa/);
    expect(window.localStorage.getItem('peditree.panelTip.v1')).toBe('1');
    await select('father');
    expect(panelText()).not.toMatch(/Düğmeler görünmüyorsa/);
    // put back for the other tests
    window.localStorage.removeItem('peditree.panelTip.v1');
    await run(() => usePanelTip.setState({ seen: false }));
  });

  it('a partner is named by the number and the name the clinician wrote, never by the program’s own label', async () => {
    await run(() => S().addSpouseTo('proband', 'female'));
    const wife = g().unions.find(u => u.partners.includes('proband')).partners.find(id => id !== 'proband');
    await select('proband');
    expect(partnerTitles()).toEqual(['Eş III-2']);
    expect(panelText()).not.toMatch(/\(K\)/);
    await run(() => S().updateIndividual(wife, { displayLabel: 'Ayşe' }));
    expect(partnerTitles()).toEqual(['Eş III-2 Ayşe']);
  });

  it('"Çocukları yok": two choices, a second tap takes the mark back; what it draws is said only once chosen', async () => {
    await run(() => S().addSpouseTo('proband', 'female'));
    const u = g().unions.find(x => x.partners.includes('proband'));
    await select('proband');
    const group = () => $$('.editor-body [role="radiogroup"]').find(r => r.getAttribute('aria-label') === 'Çocukları yok');
    expect(buttons(group()).map(b => b.textContent)).toEqual(['Çocuksuz', 'İnfertil']);
    expect(panelText()).not.toMatch(/kısa çizgi/);
    await click(button('İnfertil', group()));
    expect(g().unions.find(x => x.id === u.id).childless).toBe('infertile');
    expect(panelText()).toMatch(/Çizimde çift kısa çizgi/);
    await click(button('İnfertil', group()));
    expect(g().unions.find(x => x.id === u.id).childless).toBeFalsy();
    expect(panelText()).not.toMatch(/kısa çizgi/);
  });

  it('"Kişiyi sil" on the proband says why it cannot, when tapped, and deletes nobody', async () => {
    await select('proband');
    expect(panelText()).not.toMatch(/Proband silinemez/);
    const people = g().individuals.length;
    await click(button('Kişiyi sil', $('.editor-body')));
    expect(g().individuals).toHaveLength(people);
    expect($('#delete-why').textContent).toMatch(/Proband silinemez/);
    await select('mother');
    expect(panelText()).not.toMatch(/Proband silinemez/);
  });
});

describe('the Settings window (clinician request 2026-11-03)', () => {
  it('Semboller: every symbol and line drawn small with its name and meaning; the carrier as chosen in Çizim (clinician request 2026-11-05)', async () => {
    const { useViewSettings: views } = await import('../utils/drawingStyle');
    await click(button('Ayarlar'));
    const dialog = document.querySelector('.settings-dialog');
    await click([...dialog.querySelectorAll('[role="tab"]')].find(b => b.textContent.includes('Semboller')));
    const rows = () => [...dialog.querySelectorAll('.symbol-guide > li')];
    const names = rows().map(li => li.querySelector('.set-row-title').textContent);
    expect(names).toEqual(expect.arrayContaining(['Erkek', 'Kadın', 'Proband', 'Danışan', 'Etkilenmiş', 'Taşıyıcı', 'Vefat', 'Evlat edinilmiş',
      'Düşük', 'Ölü doğum (SB)', 'Akraba evliliği', 'Ayrılmış ya da boşanmış', 'Aynı köy', 'Tek yumurta ikiz']));
    for (const li of rows()) expect(li.querySelector('svg.symbol-guide-mark').children.length).toBeGreaterThan(0);
    // as drawn: a genetic test puts nothing inside the symbol, its lines go under it
    const genetic = rows().find(li => li.querySelector('.set-row-title').textContent === 'Genetik test');
    expect(genetic.querySelector('svg text')).toBeNull();
    expect(genetic.textContent).toMatch(/Sembolün altında sonuç satırları/);
    const carrier = () => rows().find(li => li.querySelector('.set-row-title').textContent === 'Taşıyıcı').querySelector('svg');
    expect(carrier().querySelector('pattern')).not.toBeNull(); // split (NSGC 2022) by default
    await run(() => views.getState().setView({ carrierMark: 'dot' }));
    expect(carrier().querySelector('pattern')).toBeNull();
    expect(carrier().querySelector('circle')).not.toBeNull();
    await run(() => views.getState().setView({ carrierMark: 'split' }));
    await key('Escape');
  });

  it('Görünüm: day, night or as the device; night darkens the screen, never the copies (clinician 2026-11-11)', async () => {
    const { useViewSettings: views } = await import('../utils/drawingStyle');
    await click(button('Ayarlar'));
    const dialog = document.querySelector('.settings-dialog');
    await click([...dialog.querySelectorAll('[role="tab"]')].find(b => b.textContent.includes('Görünüm')));
    const group = (name) => [...dialog.querySelectorAll('[role="radiogroup"]')].find(r => r.getAttribute('aria-label') === name);
    expect(buttons(group('Görünüm')).map(b => b.textContent)).toEqual(['Cihazla aynı', 'Gündüz', 'Gece']);
    try {
      expect(document.documentElement.getAttribute('data-mode')).toBe('light'); // the test browser prefers light
      await click(button('Gece', group('Görünüm')));
      expect(document.documentElement.getAttribute('data-mode')).toBe('dark');
      expect(JSON.parse(window.localStorage.getItem('peditree.view.v1')).mode).toBe('dark');
      // the copy that goes out keeps the symbols white (night is the screen's only)
      expect(prepareExportSvg(view.container.querySelector('.canvas-container svg')).outerHTML).toContain('fill="#ffffff"');
      await click(button('Gündüz', group('Görünüm')));
      expect(document.documentElement.getAttribute('data-mode')).toBe('light');
    } finally {
      await run(() => views.getState().setView({ mode: 'system' }));
    }
    await key('Escape');
  });

  it('Çizim: the text size by a slider in %, A and A at its ends, a sample, a way back to 100 (clinician 2026-11-11)', async () => {
    const { useViewSettings: views } = await import('../utils/drawingStyle');
    await click(button('Ayarlar'));
    const dialog = document.querySelector('.settings-dialog');
    await click([...dialog.querySelectorAll('[role="tab"]')].find(b => b.textContent.includes('Çizim')));
    try {
      expect(dialog.querySelector('.text-size-value').textContent).toBe('%100');
      expect(dialog.querySelector('.text-size-reset')).toBeNull();
      await click(button('Yazıyı büyüt', dialog));
      await click(button('Yazıyı büyüt', dialog));
      expect(dialog.querySelector('.text-size-value').textContent).toBe('%110');
      expect(dialog.querySelector('.text-size-sample').style.fontSize).toBe('13.2px');
      const slider = dialog.querySelector('.text-size input[type="range"]');
      await run(() => { const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(slider, '160'); slider.dispatchEvent(new Event('input', { bubbles: true })); });
      expect(views.getState().view.textSize).toBe(160);
      expect(button('Yazıyı büyüt', dialog).disabled).toBe(false); // stays usable, stays at the most
      await click(dialog.querySelector('.text-size-reset'));
      expect(views.getState().view.textSize).toBe(100);
    } finally {
      await run(() => views.getState().setView({ textSize: 100 }));
    }
    await key('Escape');
  });

  it('Görünüm: six colour themes from warm to cool, Çivit first chosen; the ring as see-through as chosen; kept on this device (clinician request 2026-11-07)', async () => {
    const { useViewSettings: views } = await import('../utils/drawingStyle');
    await click(button('Ayarlar'));
    const dialog = document.querySelector('.settings-dialog');
    await click([...dialog.querySelectorAll('[role="tab"]')].find(b => b.textContent.includes('Görünüm')));
    const group = (name) => [...dialog.querySelectorAll('[role="radiogroup"]')].find(r => r.getAttribute('aria-label') === name);
    expect(buttons(group('Renk teması')).map(b => b.textContent)).toEqual(['Kiremit', 'Kehribar', 'Gül', 'Çivit', 'Okyanus', 'Yeşim']);
    expect(button('Çivit', group('Renk teması')).getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    try {
      await click(button('Yeşim', group('Renk teması')));
      expect(document.documentElement.getAttribute('data-theme')).toBe('teal');
      expect(JSON.parse(window.localStorage.getItem('peditree.view.v1')).theme).toBe('teal');
      // the transparency one step at a time, no words; the value and a preview show it (clinician 2026-11-07)
      expect(document.documentElement.style.getPropertyValue('--ring-alpha')).toBe('0.95');
      expect(dialog.querySelector('.ring-clear-value').textContent).toBe('%5');
      expect(dialog.querySelectorAll('.ring-preview .ring-preview-pill')).toHaveLength(2);
      await click(button('Daha saydam', dialog));
      expect(document.documentElement.style.getPropertyValue('--ring-alpha')).toBe('0.9');
      await click(button('Daha az saydam', dialog));
      await click(button('Daha az saydam', dialog));
      expect(document.documentElement.style.getPropertyValue('--ring-alpha')).toBe('1');
      expect(button('Daha az saydam', dialog).disabled).toBe(true);
      const slider = dialog.querySelector('.ring-clear input[type="range"]');
      await run(() => { const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(slider, '100'); slider.dispatchEvent(new Event('input', { bubbles: true })); });
      // up to wholly clear (clinician 2026-11-11: 60 % was the most)
      expect(document.documentElement.style.getPropertyValue('--ring-alpha')).toBe('0');
      expect(JSON.parse(window.localStorage.getItem('peditree.view.v1')).ringClear).toBe(100);
      expect(button('Daha saydam', dialog).disabled).toBe(true);
    } finally {
      await run(() => views.getState().setView({ theme: 'indigo', ringClear: 5 }));
    }
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    await key('Escape');
  });

  it('few words: each setting says a few words at most, the longer explanation is in its tooltip (clinician 2026-11-05)', async () => {
    await click(button('Ayarlar'));
    const dialog = document.querySelector('.settings-dialog');
    await click([...dialog.querySelectorAll('[role="tab"]')].find(b => b.textContent.includes('Çizim')));
    const hints = [...dialog.querySelectorAll('.set-row-hint')].map(h => h.textContent);
    for (const h of hints.filter(h => !h.includes('(I-1, II-3)'))) expect(h.length).toBeLessThanOrEqual(40);
    const paper = [...dialog.querySelectorAll('.set-row')].find(r => r.textContent.includes('Sayfa zemini'));
    expect(paper.getAttribute('title')).toMatch(/indirilen ve yazdırılan çizimin zemini düz kalır/);
    expect(dialog.querySelector('.set-intro').textContent.length).toBeLessThanOrEqual(80);
    await key('Escape');
  });

  it('a window of its own: sections to choose, Tab stays inside, Escape closes, focus goes back to "Ayarlar"', async () => {
    const opener = button('Ayarlar');
    opener.focus();
    await click(opener);
    const dialog = document.querySelector('.settings-dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement.getAttribute('role')).toBe('tab');
    const tabs = [...dialog.querySelectorAll('[role="tab"]')].map(b => b.textContent.trim());
    expect(tabs).toEqual(['Dil', 'Görünüm', 'Çizim', 'Halka menü', 'Yan panel', 'Dosyalar', 'Semboller', 'Klavye kısayolları', 'Hakkında']);
    // Tab from the last control comes back to the first; Shift+Tab from the first goes to the last
    const focusable = [...dialog.querySelectorAll('button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), [tabindex="0"]')];
    focusable.at(-1).focus();
    await key('Tab', {}, focusable.at(-1));
    expect(document.activeElement).toBe(focusable[0]);
    await key('Tab', { shiftKey: true }, focusable[0]);
    expect(document.activeElement).toBe(focusable.at(-1));
    // arrows move between sections
    dialog.querySelector('[role="tab"][aria-selected="true"]').focus();
    await key('ArrowDown', {}, document.activeElement);
    expect(dialog.querySelector('[role="tab"][aria-selected="true"]').textContent).toMatch(/Görünüm/);
    await key('Escape');
    expect(document.querySelector('.settings-dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
