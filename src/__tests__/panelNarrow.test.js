// @vitest-environment jsdom
/**
 * The side panel dragged narrow (280 px; clinician report 2026-11-07: "Bilinmiyor" ran out of the
 * İlişki choices). jsdom measures no text, so the test reads what lets the row fit: the long
 * choice may break after its "/" (a <wbr>), in Turkish and in English, and its words stay whole.
 * Measured in the browser: 280, 300 and 328 px wide, nothing overflows.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mount, settle, createElement } from './support/dom';
import App from '../App';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { useLang } from '../i18n';

const S = () => usePedigreeStore.getState();
let view;

beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  view = mount(createElement(App));
  await settle(() => { S().resetPedigree(); });
});
afterAll(async () => {
  await settle(() => useLang.getState().setLang({ ui: 'tr', drawing: 'same' }));
  view.unmount();
});

const relation = () => view.container.querySelector('.editor-panel [role="radiogroup"][aria-label="İlişki"], .editor-panel [role="radiogroup"][aria-label="Relationship"]');

describe('İlişki in a narrow side panel', () => {
  it('"Boşanmış/Ayrılmış" may break after the "/"; the other choices are whole words', async () => {
    await settle(() => S().selectIndividual('mother'));
    const buttons = [...relation().querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Birlikte', 'Boşanmış/Ayrılmış', 'Bilinmiyor']);
    expect(buttons[1].querySelectorAll('wbr')).toHaveLength(1);
    expect(buttons[1].innerHTML).toMatch(/\/<wbr>Ayrılmış$/);
    expect(buttons[0].querySelector('wbr')).toBeNull();
    expect(buttons[2].querySelector('wbr')).toBeNull();
  });

  it('in English too', async () => {
    await settle(() => useLang.getState().setLang({ ui: 'en', drawing: 'same' }));
    await settle(() => S().selectIndividual('mother'));
    const divorced = [...relation().querySelectorAll('button')][1];
    expect(divorced.querySelectorAll('wbr')).toHaveLength(1);
    expect(divorced.textContent).toMatch(/\//);
  });
});
