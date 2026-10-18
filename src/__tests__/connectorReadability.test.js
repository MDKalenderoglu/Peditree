/**
 * connectorReadability.test.js — correctness of the connector-ownership
 * detectors themselves (true positives AND true negatives), on hand-built
 * edge sets, independent of any layout engine.
 */
import { describe, it, expect } from 'vitest';
import { checkConnectorReadability, readabilityMetrics } from '../audit/connectorReadability';

const codes = (edges) => checkConnectorReadability({ edges }).map(v => v.code);

// A clean nuclear family: union line, drop, bus, two stems — all owned by U1.
const nuclear = [
  { type: 'union', x1: 20, y1: 0, x2: 50, y2: 0, unionId: 'U1' },
  { type: 'parentChildDrop', x1: 35, y1: 0, x2: 35, y2: 75, unionId: 'U1' },
  { type: 'sibship', x1: -10, y1: 75, x2: 80, y2: 75, unionId: 'U1' },
  { type: 'childStem', x1: -10, y1: 75, x2: -10, y2: 130, unionId: 'U1' },
  { type: 'childStem', x1: 80, y1: 75, x2: 80, y2: 130, unionId: 'U1' },
];

describe('connectorReadability — true negatives', () => {
  it('a single family\'s own connectors never flag each other', () => {
    expect(codes(nuclear)).toEqual([]);
  });

  it('two families side by side with separate buses are clean', () => {
    const shifted = nuclear.map(e => ({ ...e, x1: e.x1 + 300, x2: e.x2 + 300, unionId: 'U2' }));
    expect(codes([...nuclear, ...shifted])).toEqual([]);
  });

  it('parallel foreign lines farther apart than the tolerance are clean', () => {
    const e = [
      { type: 'sibship', x1: 0, y1: 75, x2: 200, y2: 75, unionId: 'U1' },
      { type: 'sibship', x1: 100, y1: 90, x2: 300, y2: 90, unionId: 'U2' },
    ];
    expect(codes(e)).toEqual([]);
  });

  it('a crossing marked with a line jump (bridge) is not an ambiguity', () => {
    const e = [
      { type: 'union', x1: 0, y1: 100, x2: 400, y2: 100, unionId: 'U1', bridges: [200] },
      { type: 'childStem', x1: 200, y1: 75, x2: 200, y2: 130, unionId: 'U2' },
    ];
    expect(codes(e)).toEqual([]);
  });

  it('non-structural edges (divorce slash) are ignored', () => {
    const e = [...nuclear, { type: 'divorceSlash', x: 35, y: 0, unionId: 'U9' }];
    expect(codes(e)).toEqual([]);
  });
});

describe('connectorReadability — true positives', () => {
  it('flags an unbridged crossing between different families', () => {
    const e = [
      { type: 'union', x1: 0, y1: 100, x2: 400, y2: 100, unionId: 'U1' },
      { type: 'childStem', x1: 200, y1: 75, x2: 200, y2: 130, unionId: 'U2' },
    ];
    expect(codes(e)).toEqual(['FOREIGN_CONNECTOR_CROSSING']);
  });

  it('flags a foreign union line running along another family\'s bus', () => {
    const e = [
      { type: 'sibship', x1: 0, y1: 75, x2: 200, y2: 75, unionId: 'U1' },
      { type: 'union', x1: 150, y1: 77, x2: 400, y2: 77, unionId: 'U2' },
    ];
    expect(codes(e)).toEqual(['COLLINEAR_FOREIGN_CONNECTORS']);
  });

  it('flags a corridor riser that continues another family\'s child stem (the "broken connector" seen in QA)', () => {
    const e = [
      { type: 'childStem', x1: 55, y1: 155, x2: 55, y2: 210, unionId: 'U_GP' },
      { type: 'union', x1: 55, y1: 210, x2: 55, y2: 190, unionId: 'U_PARENTS' },
    ];
    expect(codes(e)).toContain('COLLINEAR_FOREIGN_CONNECTORS');
  });

  it('flags a foreign line ending on another family\'s line (T-junction illusion)', () => {
    const e = [
      { type: 'sibship', x1: 0, y1: 75, x2: 200, y2: 75, unionId: 'U1' },
      { type: 'childStem', x1: 120, y1: 75, x2: 120, y2: 130, unionId: 'U2' },
    ];
    expect(codes(e)).toEqual(['FOREIGN_T_JUNCTION']);
  });
});

describe('readabilityMetrics', () => {
  it('measures couple centring over children', () => {
    const pd = {
      nodes: [{ id: 'a', x: 0 }, { id: 'b', x: 70 }, { id: 'c1', x: 200 }, { id: 'c2', x: 290 }],
      unions: [{ id: 'U', partners: ['a', 'b'] }],
      parentChildRelationships: [{ unionId: 'U', children: ['c1', 'c2'] }],
      edges: [],
    };
    const m = readabilityMetrics(pd);
    expect(m.unionsWithChildren).toBe(1);
    expect(m.maxCentreOffset).toBe(210); // mid 35 vs children centre 245
    expect(m.offCenter).toBe(1);
    expect(m.sideHang).toBe(1);
  });

  it('never throws on empty input', () => {
    expect(() => readabilityMetrics({})).not.toThrow();
    expect(checkConnectorReadability(null)).toEqual([]);
  });
});
