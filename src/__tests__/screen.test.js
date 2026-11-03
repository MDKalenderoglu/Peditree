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
const button = (text, root) => buttons(root).find(b => b.textContent.trim() === text || b.getAttribute('aria-label') === text);
const select = (id) => click(drawn(id));
const flyout = () => $('.radial-flyout');
const flyoutText = () => (flyout() ? flyout().textContent.replace(/\s+/g, ' ') : '');
const arcLabels = () => $$('.radial-arcs text').map(t => t.textContent);
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
    expect(arcLabels()).toEqual(expect.arrayContaining(['Etkilenmiş', 'Taşıyıcı', 'Vefat', 'Proband', 'Danışan']));
  });

  it('"Birden çok" in the ring adds one symbol with the number inside', async () => {
    await select('proband');
    await key('k');
    const add = buttons(flyout()).find(b => /3 erkek \(tek sembol/.test(b.getAttribute('aria-label') || ''));
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
      expect(arcLabels().slice(3)).toEqual(['Proband', 'Etkilenmiş', 'Taşıyıcı', 'Vefat', 'Diğer…']);
      await click(button('Ayarlar'));
      expect($('[aria-label="Ayarlar"]').textContent).toMatch(/Halka menü/);
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
      const opened = $$(`[data-popup="${name}"] *`).length;
      await pointerDown(drawn('mother'));
      expect($$(`[data-popup="${name}"] *`).length).toBeLessThan(opened);
      await click(button(open) || buttons().find(b => b.textContent.includes(open)));
      await key('Escape');
      expect($$(`[data-popup="${name}"] *`).length).toBeLessThan(opened);
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

  it('the keyboard help is grouped and written in full sentences', async () => {
    await click(button('PediTree hakkında'));
    await click(buttons().find(b => b.textContent.includes('Klavye kısayolları')));
    const text = $('[data-popup="keys"]').textContent;
    expect(text).toMatch(/Kişiler arasında gezinmek/);
    expect(text).toMatch(/Seçili kişi için \(önce bir kişiye tıklayın\)/);
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
  it('Kaydet writes what is still being typed: an age not yet confirmed reaches the file', async () => {
    const dl = captureDownloads();
    try {
      await select('mother');
      const age = $('.input-age');
      await typeInto(age, '52');
      expect(g().individuals.find(i => i.id === 'mother').age).toBe(''); // not confirmed yet
      await click(button('Kaydet') || buttons().find(b => b.textContent.trim() === 'Kaydet'));
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
      await click(buttons().find(b => b.textContent.includes('İndir')));
      expect($('[data-popup="download"]').textContent).toMatch(/PDF/);
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
      expect(help.textContent).toMatch(/PED dosyası.*isim, yaş ve bulgular gelmez/);
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

  it('the text size setting changes the name, key and notes only — never the text under the symbols', async () => {
    const { useViewSettings } = await import('../utils/drawingStyle');
    await run(() => { S().setPatientName('Ayşe'); S().updateIndividual('mother', { age: '52', notes: 'not' }); });
    const sizes = () => ({ head: $('.patient-header').getAttribute('font-size'), under: drawn('mother').querySelector('.annotations text').getAttribute('font-size') });
    const normal = sizes();
    try {
      await run(() => useViewSettings.getState().setView({ legendSize: 'xlarge' }));
      const big = sizes();
      expect(parseFloat(big.head)).toBeGreaterThan(parseFloat(normal.head));
      expect(big.under).toBe(normal.under);
    } finally {
      await run(() => useViewSettings.getState().setView({ legendSize: 'normal' }));
    }
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

describe('the page around the drawing', () => {
  it('notices sit above the drawing in the page, never over it', async () => {
    await run(() => S().clearProband()); // a soft note appears
    const notices = $('.canvas-notices'), stage = $('.canvas-stage');
    expect(notices.querySelector('.notice-strip')).not.toBeNull();
    expect(notices.compareDocumentPosition(stage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
      await click(buttons().find(b => b.textContent.includes('İndir')));
      await click(buttons().find(b => /SVG/.test(b.textContent)));
      await settle();
      expect(view.container.textContent).toMatch(/Seçtiğiniz yazı tipi dosyaya eklenemedi/);
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
    const note = $('textarea.radial-note');
    note.focus();
    await typeInto(note, 'birinci satır');
    await key('Enter', { shiftKey: true }, note);
    expect(g().individuals.find(i => i.id === 'mother').notes).toBe('');
    await key('Enter', {}, note);
    expect(g().individuals.find(i => i.id === 'mother').notes).toBe('birinci satır');
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

describe('the About window (the logo)', () => {
  it('says what PediTree is not, that patient data goes nowhere, and how to report a bug — with the real forms and e-mail', async () => {
    const { REPOSITORY_URL, CONTACT_EMAIL } = await import('../utils/appInfo');
    await click(button('PediTree hakkında'));
    const about = $('[data-popup="about"]');
    const text = about.textContent;
    expect(text).toMatch(/tıbbi cihaz değildir/);
    expect(text).toMatch(/Hasta bilgisi hiçbir sunucuya gönderilmez/);
    expect(text).toMatch(/PediTree adı ve logosu lisansa dahil değildir/);
    expect(text).toMatch(/hasta adı, doğum tarihi/);
    const links = [...about.querySelectorAll('a')].map(a => a.getAttribute('href'));
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
    expect(arcLabels().join(' ')).not.toMatch(/Belirtisiz/);
    await click([...$$('.radial-arcs .radial-arc')].find(a => a.textContent.includes('Diğer')));
    const pre = [...$$('.radial-arcs .radial-arc')].find(a => a.textContent.includes('Belirtisiz'));
    await click(pre);
    expect(g().individuals.find(i => i.id === 'mother').presymptomatic).toBe(true);
    expect(drawn('mother').querySelector('.presymptomatic-line')).not.toBeNull();
    expect($('.condition-legend').textContent).toMatch(/Belirtisiz taşıyıcı/);
    // affected: the line goes (symptoms now)
    await run(() => S().updateIndividual('mother', { affected: true }));
    expect(drawn('mother').querySelector('.presymptomatic-line')).toBeNull();
    // sex at birth: hidden in the panel at first; shown once brought forward or filled
    await key('Escape');
    await select('father');
    expect(panelText()).not.toMatch(/Doğumda atanan cinsiyet/);
    await click(buttons().find(b => b.textContent.startsWith('Diğer bilgiler')));
    await click(button('AFAB'));
    expect(g().individuals.find(i => i.id === 'father').sexAtBirth).toBe('AFAB');
    expect(drawn('father').querySelector('.sex-at-birth').textContent).toBe('AFAB');
    await key('Escape'); await key('Escape');
    await select('father');
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
    expect($('[data-popup="about"]').textContent).toMatch(/aynı cinsiyetten eşler/);
    await key('Escape');
  });

  it('Ayarlar → Yan panel: a part hidden there leaves the panel, comes back under "Diğer bilgiler…", and is kept on this device', async () => {
    await click(button('Ayarlar') || buttons().find(b => b.textContent.includes('Ayarlar')));
    const box = [...$$('.settings-popover label.check')].find(l => l.textContent.includes('Genetik test'));
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
