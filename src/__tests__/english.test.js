// @vitest-environment jsdom
/**
 * english.test.js — the English interface (clinician decisions 2026-11-02).
 *
 * The dictionary: every text the code gives to the translation has its
 * English, with the same {placeholders}, and no English text carries a
 * Turkish letter. The screens: the real app in English, every window
 * opened, read for Turkish — a Turkish letter, a text the dictionary lacks
 * (i18n `missing`), or a Turkish word written past the translation.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mount, settle, createElement } from './support/dom';
import { translationKeys } from '../i18n/keys';
import EN from '../i18n/en';
import { useLang, missing, t } from '../i18n';
import App from '../App';
import { usePedigreeStore } from '../state/usePedigreeStore';

const TURKISH_LETTER = /[çğıöşüÇĞİÖŞÜ]/;
// proper names that keep their letters: the language's own name, the author's
const KEPT = /Türkçe|Kalenderoğlu|Doğukan/g;
// Turkish words with no Turkish letter, as they would slip through untranslated
const TURKISH_WORD = /\b(ve|ile|bir|veya|ya da|Yeni|Kaydet|Ekle|Sil|Anne|Baba|Kardes|Durum|Bulgu|Diger|Kapat|Evet|Hayir|Tamam|Vazgec|Uyari|Geri al|yok|var|kisi|Kisi|Vefat|Erkek|erkek|Birlikte|Bilinmiyor|bilinmiyor|Bilinmeyen|Gebelik|gebelik|yumurta|Daha az|Akraba|akraba|Evlat|evlat|Hala|Amca|Teyze|Dede|Anneanne|Babaanne|Kaldir|Etiket|Yaz|Bilgi|Hata|Sorulmadi|Sola|Yukari|Asagi|Varsayilana|Zigosite|Bilgiler|Genetik|Ailede|girilen|Cocuk|Hepsine|birden|Birden)\b/;
const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort();

describe('the English dictionary', () => {
  const keys = translationKeys();

  it('has every text the code translates', () => {
    const lacking = [...keys.keys()].filter((k) => !Object.prototype.hasOwnProperty.call(EN, k));
    expect(lacking).toEqual([]);
  });

  it('keeps every {placeholder} of the Turkish', () => {
    const wrong = Object.entries(EN).filter(([k, v]) => placeholders(k).join() !== placeholders(v).join()).map(([k]) => k);
    expect(wrong).toEqual([]);
  });

  it('writes no Turkish letter', () => {
    const wrong = Object.values(EN).filter((v) => TURKISH_LETTER.test(v.replace(KEPT, '')));
    expect(wrong).toEqual([]);
  });

  it('gives a text in the language asked for, and Turkish when the dictionary lacks it', () => {
    expect(t('Kaydet', null, 'en')).toBe('Save');
    expect(t('Kaydet', null, 'tr')).toBe('Kaydet');
    expect(t('Geri al ({n} adım)', { n: 3 }, 'en')).toBe('Undo (3)');
    expect(t('bir sözlükte olmayan yazı', null, 'en')).toBe('bir sözlükte olmayan yazı');
    expect(missing.has('bir sözlükte olmayan yazı')).toBe(true);
    missing.clear();
  });
});

describe('what is stored does not depend on the language', () => {
  it('the same edits in English and in Turkish give the same document: labels and ages stay in their stored form; English age input is read', async () => {
    const { usePedigreeStore: store } = await import('../state/usePedigreeStore');
    const run = (lang, age) => {
      useLang.getState().setLang({ ui: lang });
      const S = store.getState;
      S().resetPedigree();
      S().addSpouseTo('proband', 'female');
      const spouse = S().doc.graph.unions.find((u) => u.partners.includes('proband')).partners.find((x) => x !== 'proband');
      S().addParentsTo(spouse, {});
      S().addChildTo('proband', 'unknown', { pregnancyLoss: true });
      S().updateIndividual('proband', { age });
      S().addChildTo('proband', 'unknown', { stillbirth: true });
      return JSON.parse(S().exportProjectFile());
    };
    const strip = (d) => ({ graph: d.graph, ids: d.ids });
    const tr = run('tr', '3 ay');
    const en = run('en', '3 mo');
    useLang.getState().setLang({ ui: 'tr' });
    expect(strip(en)).toEqual(strip(tr));
    expect(en.graph.individuals.find((i) => i.id === 'proband').age).toBe('3 ay');
    expect(en.graph.individuals.map((i) => i.label)).toEqual(expect.arrayContaining(['Anne', 'Baba']));
  });
});

describe('the screens in English', () => {
  let view;
  const S = () => usePedigreeStore.getState();
  const $ = (sel) => view.container.querySelector(sel);
  const buttons = () => [...view.container.querySelectorAll('button')];
  const click = (el) => settle(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  const key = (k) => settle(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })));
  const byText = (text) => buttons().find((b) => b.textContent.trim() === text || b.getAttribute('aria-label') === text);
  /** what a region says: its text and the words in its attributes */
  const said = (root) => [root.textContent, ...[...root.querySelectorAll('[title],[aria-label],[placeholder],[alt]')]
    .flatMap((el) => ['title', 'aria-label', 'placeholder', 'alt'].map((a) => el.getAttribute(a)).filter(Boolean))].join('\n');
  // what the clinician typed (names, notes, findings, results) is never translated: left out of the check
  const typed = () => S().doc.graph.individuals.flatMap((p) => [p.displayLabel, p.notes, p.causeOfDeath, ...String(p.geneticNote || '').split('\n'),
    ...(p.conditions || []).map((c) => c.label)]).concat(S().doc.graph.unions.map((u) => u.childlessReason), S().doc.patientName)
    .filter((x) => x && String(x).trim()).map(String).sort((a, b) => b.length - a.length);
  const turkishIn = (text) => {
    let rest = text.replace(KEPT, '');
    for (const x of typed()) rest = rest.split(x.trim()).join(' ');
    return rest.split('\n').filter((line) => TURKISH_LETTER.test(line) || TURKISH_WORD.test(line));
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    useLang.getState().setLang({ ui: 'en', drawing: 'same' });
    missing.clear();
    view = mount(createElement(App));
    await settle(() => S().resetPedigree());
  });
  afterAll(() => {
    view.unmount();
    useLang.getState().setLang({ ui: 'tr', drawing: 'same' });
  });

  it('the toolbar and each of its windows: About, keyboard help, New, Open, Download, Share, Settings', async () => {
    const toolbar = $('.canvas-toolbar');
    const seen = [said(toolbar)];
    for (const open of ['About PediTree', 'New', 'Download', 'Settings']) {
      const b = byText(open) || buttons().find((x) => x.textContent.includes(open));
      expect(b, open).toBeTruthy();
      await click(b);
      seen.push(said(toolbar));
      await key('Escape');
    }
    // the keyboard help opens from the About window
    await click(byText('About PediTree'));
    await click(buttons().find((x) => x.textContent.includes('Keyboard shortcuts')));
    seen.push(said(toolbar));
    expect(said(toolbar)).toMatch(/Adds the mother and father/);
    expect([...toolbar.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(expect.arrayContaining(['P', 'S', 'B', 'C', 'F', 'A', 'T', 'N']));
    await key('Escape');
    // "Open" explains first which files it opens
    await click(byText('Open'));
    seen.push(said(toolbar));
    await key('Escape');
    expect(turkishIn(seen.join('\n'))).toEqual([]);
    expect([...missing]).toEqual([]);
  });

  it('the language can be changed in Settings, and the screens follow at once', async () => {
    await click(byText('Settings'));
    await click(byText('Türkçe'));
    expect(byText('Kaydet')).toBeTruthy();
    expect(useLang.getState().ui).toBe('tr');
    await click(byText('English'));
    expect(byText('Save')).toBeTruthy();
    await key('Escape');
  });

  it('in the family with every mark: each person’s side panel and every part of the ring, also "More…" and the sibling and child choices', async () => {
    const { buildMarkFamily } = await import('../audit/markCollisions');
    await settle(() => buildMarkFamily(usePedigreeStore));
    const seen = [];
    const sweep = () => {
      for (const sel of ['.editor-panel', '.radial-menu']) { const el = $(sel); if (el) seen.push(said(el)); }
    };
    const people = S().doc.graph.individuals.filter((p) => !p.placeholder);
    for (const p of people) {
      await settle(() => S().selectIndividual(p.id));
      sweep();
      for (const k of ['b', 'c', 'a', 'f', 't', 'n']) {
        await key(k);
        sweep();
        const more = buttons().find((b) => b.textContent.trim() === 'More…');
        if (more) { await click(more); sweep(); }
      }
      await key('Escape');
    }
    // two people, and several people, selected together
    await settle(() => S().selectIndividual(people[1].id));
    await settle(() => S().selectIndividual(people[2].id, { additive: true }));
    sweep();
    await settle(() => S().selectIndividual(people[3].id, { additive: true }));
    sweep();
    expect(seen.length).toBeGreaterThan(people.length * 3);
    expect(turkishIn(seen.join('\n'))).toEqual([]);
    expect([...missing]).toEqual([]);
  });

  it('the drawing in English: the key, the notes, ages, weeks and "tested" — the clinician’s own text as typed', async () => {
    const { buildMarkFamily } = await import('../audit/markCollisions');
    await settle(() => buildMarkFamily(usePedigreeStore));
    await settle(() => {
      const ids = S().doc.graph.individuals.filter((p) => !p.placeholder && !p.count && !p.relation?.startsWith?.('art'));
      S().updateIndividual(ids[2].id, { age: '3 ay' });
      S().updateIndividual(ids[3].id, { deceased: true, ageAtDeath: '12 gün', causeOfDeath: 'MI' });
      S().updateIndividual(ids[4].id, { carrier: true });
    });
    const svg = $('.pedigree-viewport').ownerSVGElement;
    const text = said(svg);
    expect(text).toMatch(/Notes/);
    expect(text).toMatch(/3 mo/);
    expect(text).toMatch(/d\.12 d/);
    expect(text).toMatch(/Carrier/);
    expect(turkishIn(text)).toEqual([]);
    expect([...missing]).toEqual([]);
  });

  it('the drawing’s language apart from the screens: Turkish screens, English drawing — and the reverse', async () => {
    await settle(() => useLang.getState().setLang({ ui: 'tr', drawing: 'en' }));
    const svg = () => $('.pedigree-viewport').ownerSVGElement;
    expect(said(svg())).toMatch(/Notes/);
    expect(said(svg())).not.toMatch(/Notlar/);
    expect(said(svg())).toMatch(/3 mo/);
    expect(byText('Kaydet')).toBeTruthy();
    await settle(() => useLang.getState().setLang({ ui: 'en', drawing: 'tr' }));
    expect(said(svg())).toMatch(/Notlar/);
    expect(said(svg())).toMatch(/3 ay/);
    expect(byText('Save')).toBeTruthy();
    await settle(() => useLang.getState().setLang({ ui: 'en', drawing: 'same' }));
    expect(said(svg())).toMatch(/Notes/);
  });

  it('a notice on screen is worded again when the language changes; the drawing does not move', async () => {
    await settle(() => useLang.getState().setLang({ ui: 'en', drawing: 'same' }));
    await settle(() => S().resetPedigree());
    await settle(() => S().clearProband());
    const strip = () => $('.notice-strip');
    await click(strip().querySelector('button'));
    expect(strip().textContent).toMatch(/No proband is marked/);
    const before = S().pedigreeData.nodes.map((n) => [n.id, n.x, n.y]);
    await settle(() => useLang.getState().setLang({ ui: 'tr' }));
    expect(strip().textContent).toMatch(/Proband işaretlenmedi/);
    expect(S().pedigreeData.nodes.map((n) => [n.id, n.x, n.y])).toEqual(before);
    await settle(() => useLang.getState().setLang({ ui: 'en' }));
    expect(strip().textContent).toMatch(/No proband is marked/);
  });

  it('keyboard letters follow the language: S adds a partner in English, the Turkish E does nothing', async () => {
    await settle(() => useLang.getState().setLang({ ui: 'en', drawing: 'same' }));
    await settle(() => S().resetPedigree());
    await settle(() => S().selectIndividual('proband'));
    const partners = () => S().doc.graph.unions.filter((u) => u.partners.includes('proband')).length;
    await key('e');
    expect(partners()).toBe(0);
    await key('s');
    expect(partners()).toBe(1);
  });
});
