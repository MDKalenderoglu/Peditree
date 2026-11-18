// @vitest-environment jsdom
/**
 * The parts of findings in a symbol, drawn by the real app. NSGC 2022 (clinician decision
 * 2026-11-16): the symbol is divided among what the person has, each part in its own pattern, and a
 * dark line runs along every edge between parts, from the middle to the outline. It used to be a
 * white gap where two findings met (clinician report 2026-11-16: two patterns then read as one) and
 * quarters crowded into slivers with three findings or more beside a carrier's half.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { mount, settle, createElement } from './support/dom';
import App from '../App';
import { usePedigreeStore } from '../state/usePedigreeStore';

const S = () => usePedigreeStore.getState();
let view;

beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  view = mount(createElement(App));
  await settle();
});
afterAll(() => view.unmount());
beforeEach(async () => { await settle(() => { S().resetPedigree(); }); });

const regionsOf = (id) => [...view.container.querySelectorAll('.node-group')]
  .find((el) => el.__data__ && el.__data__.id === id).querySelector('.condition-regions');
const kids = (g) => [...g.children];
const parts = (g) => kids(g).filter((el) => el.classList.contains('condition-region') || el.classList.contains('condition-carrier'));
const dividers = (g) => kids(g).filter((el) => el.classList.contains('region-divider'));
// the direction a divider runs to, in degrees (0 = east, clockwise)
const angle = (l) => Math.round(((Math.atan2(Number(l.getAttribute('y2')), Number(l.getAttribute('x2'))) * 180) / Math.PI + 360) % 360);

describe('finding parts (NSGC 2022, clinician decision 2026-11-16)', () => {
  it('one finding fills the whole symbol in its pattern: no dividing line', async () => {
    await settle(() => { S().addFinding('mother', 'Miyop', null); S().addFinding('mother', 'Kolestaz', null); S().addFinding('father', 'Kolestaz', null); });
    const g = regionsOf('father');
    expect(parts(g)).toHaveLength(1);
    expect(parts(g)[0].getAttribute('fill')).toBe('url(#fill-hatch)');
    expect(dividers(g)).toEqual([]);
  });

  it('several findings: equal parts, a dark line along every edge from the middle, over the parts; no white gap', async () => {
    await settle(() => { ['Miyop', 'Kolestaz', 'Katarakt'].forEach((f) => S().addFinding('mother', f, null)); });
    const g = regionsOf('mother');
    // the first finding is stored black; the proband, affected without a finding, holds black, so it is drawn checkered (2026-11-18)
    expect(parts(g).map((p) => p.getAttribute('fill'))).toEqual(['url(#fill-checker)', 'url(#fill-hatch)', 'url(#fill-dots)']);
    expect(dividers(g).map(angle).sort((a, b) => a - b)).toEqual([30, 150, 270]);
    for (const l of dividers(g)) {
      expect(l.getAttribute('stroke')).toBe('#1e293b');
      expect([Number(l.getAttribute('x1')), Number(l.getAttribute('y1'))]).toEqual([0, 0]);
    }
    expect(kids(g).filter((el) => el.classList.contains('region-gap'))).toEqual([]);
    const order = kids(g);
    expect(Math.min(...dividers(g).map((l) => order.indexOf(l)))).toBeGreaterThan(Math.max(...parts(g).map((p) => order.indexOf(p))));
  });

  it('a carrier with three findings: the half on the left, the findings share the right half; the half\'s edge runs top to bottom', async () => {
    await settle(() => {
      S().updateIndividual('mother', { carrier: true });
      ['Miyop', 'Kolestaz', 'Katarakt'].forEach((f) => S().addFinding('mother', f, null));
    });
    const g = regionsOf('mother');
    expect(parts(g).map((p) => p.getAttribute('class'))).toEqual(['condition-carrier', 'condition-region', 'condition-region', 'condition-region']);
    expect(dividers(g).map(angle).sort((a, b) => a - b)).toEqual([30, 90, 330, 270].sort((a, b) => a - b));
  });
});
