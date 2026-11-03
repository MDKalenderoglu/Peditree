/**
 * multiplePartners.test.js — one person, several partners side by side on
 * one row (clinician report 2026-11-03: "birden fazla eş girdim ve üst üste
 * binen yerler çok karışık oldu"). The relationship lines to the farther
 * partners run as lanes above the row; they must nest (the farther the
 * partner, the higher the lane and the nearer its riser to the centre of the
 * person), so no lane crosses another and no line jump is needed; a riser
 * starts on the symbol's outline, never in the air above a circle.
 */
import { describe, it, expect } from 'vitest';
import { buildStructure } from '../layout/pcl/structure';
import { routeConnectors, estimateLevelNeeds, planBands } from '../layout/pcl/routing';
import { computePclLayout } from '../layout/pcl';

const person = (id, sex, extra = {}) => ({ id, sex, generation: 0, ...extra });
const union = (id, a, b) => ({ id, partners: [a, b], status: 'married' });

/** A person and partners in a row at the given x, routed as the layout does. */
function route(order, sexOf, unions) {
  const graph = {
    individuals: order.map((id) => person(id, sexOf[id])),
    unions,
    parentChildRelationships: [],
    socialParentLinks: [],
  };
  const S = buildStructure(graph);
  const rows = new Map([[0, order]]);
  const xPos = Object.fromEntries(order.map((id, k) => [id, k * 100]));
  const yPos = Object.fromEntries(order.map((id) => [id, 0]));
  const plans = planBands(estimateLevelNeeds(S, rows, xPos), 160);
  return routeConnectors(S, rows, xPos, yPos, plans);
}

/** Does vertical v cross horizontal h (strictly inside both)? */
const crosses = (v, h) => {
  const [y1, y2] = [Math.min(v.y1, v.y2), Math.max(v.y1, v.y2)];
  const [x1, x2] = [Math.min(h.x1, h.x2), Math.max(h.x1, h.x2)];
  return v.x1 > x1 + 0.5 && v.x1 < x2 - 0.5 && h.y1 > y1 + 0.5 && h.y1 < y2 - 0.5;
};
const laneCrossings = (edges) => {
  const vs = edges.filter((e) => e.x1 === e.x2 && e.y1 !== e.y2);
  const hs = edges.filter((e) => e.y1 === e.y2 && e.x1 !== e.x2);
  return vs.flatMap((v) => hs.filter((h) => h.unionId !== v.unionId && crosses(v, h)).map((h) => [v.unionId, h.unionId]));
};

describe('one person with several partners on one side', () => {
  // the woman W, then four husbands to her right: H1 next to her, H2–H4 reached by lanes
  const order = ['W', 'H1', 'H2', 'H3', 'H4'];
  const sexOf = { W: 'female', H1: 'male', H2: 'male', H3: 'male', H4: 'male' };
  const unions = ['H1', 'H2', 'H3', 'H4'].map((h) => union(`U_${h}`, 'W', h));

  it('the lanes nest: no lane crosses another, no line jump is needed', () => {
    const edges = route(order, sexOf, unions);
    expect(laneCrossings(edges)).toEqual([]);
    expect(edges.filter((e) => e.bridges && e.bridges.length)).toEqual([]);
  });

  it('the farther the partner, the higher the lane and the nearer its riser to the centre of the woman', () => {
    const edges = route(order, sexOf, unions);
    const lane = (uid) => edges.find((e) => e.unionId === uid && e.lane);
    const riser = (uid) => edges.find((e) => e.unionId === uid && e.x1 === e.x2 && Math.abs(e.x1) < 30);
    const ys = ['U_H2', 'U_H3', 'U_H4'].map((u) => lane(u).y1);
    expect(ys).toEqual(ys.slice().sort((a, b) => b - a)); // y grows downward: H2 lowest
    const xs = ['U_H2', 'U_H3', 'U_H4'].map((u) => riser(u).x1);
    expect(xs).toEqual(xs.slice().sort((a, b) => b - a)); // H4's riser nearest the centre
    expect(new Set(xs).size).toBe(3);
  });

  it('a riser starts on the circle, not in the air above it', () => {
    const edges = route(order, sexOf, unions);
    for (const u of ['U_H2', 'U_H3', 'U_H4']) {
      const r = edges.find((e) => e.unionId === u && e.x1 === e.x2 && Math.abs(e.x1) < 30);
      const start = Math.max(r.y1, r.y2); // the lower end, at the symbol
      expect(Math.hypot(r.x1, start)).toBeCloseTo(20, 0); // on the circle of radius 20 around W
    }
  });

  it('the same to the left of a man with three wives', () => {
    const o = ['F3', 'F2', 'F1', 'M'];
    const sx = { M: 'male', F1: 'female', F2: 'female', F3: 'female' };
    const edges = route(o, sx, ['F1', 'F2', 'F3'].map((f) => union(`U_${f}`, f, 'M')));
    expect(laneCrossings(edges)).toEqual([]);
    expect(edges.filter((e) => e.bridges && e.bridges.length)).toEqual([]);
  });
});

describe('the whole layout of a woman with four husbands', () => {
  it('draws every partnership without crossings between them', () => {
    const graph = {
      individuals: [person('W', 'female'), ...['H1', 'H2', 'H3', 'H4'].map((h) => person(h, 'male'))],
      unions: ['H1', 'H2', 'H3', 'H4'].map((h) => union(`U_${h}`, 'W', h)),
      parentChildRelationships: [],
      socialParentLinks: [],
    };
    const { edges } = computePclLayout(graph);
    expect(laneCrossings(edges)).toEqual([]);
    expect(edges.filter((e) => e.bridges && e.bridges.length)).toEqual([]);
  });
});
