// @vitest-environment jsdom
/**
 * The symbol guide (Ayarlar → Semboller) draws each mark as the drawing draws it
 * (clinician report 2026-11-11: the guide's ECT had no slash).
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { mount } from './support/dom';
import SymbolGuide from '../components/SymbolGuide';

let view;
const doc = () => { if (!view) view = mount(createElement(SymbolGuide)); return view.container; };
const row = (name) => [...doc().querySelectorAll('li')].find((li) => li.querySelector('.set-row-title').textContent === name);
const slashes = (li) => [...li.querySelectorAll('path')].map((p) => p.getAttribute('d')).filter((d) => /^M[\d.]+,[\d.]+L[\d.]+,[\d.]+$/.test(d));

describe('the symbol guide matches the drawing', () => {
  it('ECT: a slashed triangle with "ECT" below, like TOP (2025 correction)', () => {
    expect(slashes(row('Dış gebelik (ECT)'))).toHaveLength(1);
    expect(row('Dış gebelik (ECT)').querySelector('text').textContent).toBe('ECT');
    expect(slashes(row('Sonlandırma (TOP)'))).toHaveLength(1);
  });
  it('SB: full size, the deceased slash, "SB" below', () => {
    expect(slashes(row('Ölü doğum (SB)'))).toHaveLength(1);
    expect(row('Ölü doğum (SB)').querySelector('text').textContent).toBe('SB');
  });
  it('the deceased slash runs as the drawing draws it: from the upper left to the lower right', () => {
    for (const name of ['Vefat', 'Ölü doğum (SB)']) {
      const [x1, y1, x2, y2] = slashes(row(name))[0].match(/[\d.]+/g).map(Number);
      expect(x2 > x1 && y2 > y1).toBe(true);
    }
  });
});
