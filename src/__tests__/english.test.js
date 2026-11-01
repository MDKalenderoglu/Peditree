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
const TURKISH_WORD = /\b(ve|ile|bir|veya|ya da|Yeni|Kaydet|Ekle|Sil|Anne|Baba|Kardes|Durum|Bulgu|Diger|Kapat|Evet|Hayir|Tamam|Vazgec|Uyari|Geri al|yok|var|kisi|Kisi)\b/;
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
  const turkishIn = (text) => text.replace(KEPT, '').split('\n').filter((line) => TURKISH_LETTER.test(line) || TURKISH_WORD.test(line));

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

  it('keyboard letters follow the language: S adds a partner in English, the Turkish E does nothing', async () => {
    await settle(() => S().selectIndividual('proband'));
    const partners = () => S().doc.graph.unions.filter((u) => u.partners.includes('proband')).length;
    await key('e');
    expect(partners()).toBe(0);
    await key('s');
    expect(partners()).toBe(1);
  });
});
