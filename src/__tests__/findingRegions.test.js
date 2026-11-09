// @vitest-environment jsdom
/**
 * The regions of findings in a symbol, drawn by the real app (clinician report 2026-11-07: a
 * square with one finding showed white gaps in the middle of its dividing lines — every sector
 * had a white edge that broke the dark lines where they cross). The dividing lines are whole and
 * lie over the sectors; a white gap stands only where two findings meet.
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

describe('finding regions (clinician report 2026-11-07)', () => {
  it('one finding in one quarter (as in the report): no white edge, no white gap, the dividing lines whole and over it', async () => {
    // two findings in the family give each one a quarter; the father has only the first
    await settle(() => { S().addFinding('mother', 'Miyop', null); S().addFinding('mother', 'Kolestaz', null); S().addFinding('father', 'Miyop', null); });
    const g = regionsOf('father');
    const sectors = kids(g).filter((el) => el.tagName === 'path');
    expect(sectors.length).toBe(1);
    expect(sectors[0].getAttribute('stroke')).toBe('none');
    expect(kids(g).filter((el) => el.classList.contains('region-gap'))).toEqual([]);
    const dividers = kids(g).filter((el) => el.classList.contains('region-divider'));
    expect(dividers.length).toBe(2);
    // whole: each runs through the centre from one side to the other
    for (const l of dividers) {
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((at) => Number(l.getAttribute(at)));
      expect(Math.sign(x1) * Math.sign(x2) <= 0 && Math.sign(y1) * Math.sign(y2) <= 0).toBe(true);
      expect(Math.hypot(x2 - x1, y2 - y1)).toBeGreaterThan(40);
    }
    // over the sector
    const order = kids(g);
    expect(Math.min(...dividers.map((l) => order.indexOf(l)))).toBeGreaterThan(order.indexOf(sectors[0]));
  });

  it('two findings side by side: a white gap where they meet, starting off the centre so the cross stays whole', async () => {
    await settle(() => { S().addFinding('mother', 'Miyop', null); S().addFinding('mother', 'Kolestaz', null); });
    const g = regionsOf('mother');
    const gaps = kids(g).filter((el) => el.classList.contains('region-gap'));
    expect(gaps.length).toBeGreaterThan(0);
    for (const l of gaps) {
      expect(l.getAttribute('stroke')).toBe('#ffffff');
      expect(Math.hypot(Number(l.getAttribute('x1')), Number(l.getAttribute('y1')))).toBeGreaterThan(0.4);
    }
    // the gaps are drawn last, over the dividing lines
    const order = kids(g);
    const last = Math.max(...kids(g).filter((el) => el.classList.contains('region-divider')).map((l) => order.indexOf(l)));
    expect(Math.min(...gaps.map((l) => order.indexOf(l)))).toBeGreaterThan(last);
  });
});
