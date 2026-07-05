/**
 * layoutAudit.test.js — v0.3a.4 layout-audit detectors:
 *   - SIBSHIP_BUS_OVERLAP (the "single global horizontal bus" ambiguity)
 *   - EDGE_THROUGH_NODE (connector passing through an unrelated symbol)
 */
import { describe, it, expect } from 'vitest';
import { auditLayoutIntegrity } from '../utils/layoutIntegrity';

function codes(issues, code) {
  return issues.filter(i => i.code === code);
}

describe('layoutAudit — SIBSHIP_BUS_OVERLAP', () => {
  it('flags two unions whose child rails share a Y and overlap in X', () => {
    // Two unions, each with two children, both at the same generation, whose
    // child X-ranges overlap — the ambiguous "global bus" case.
    const graph = {
      individuals: [
        { id: 'pA', x: 100, y: 0 }, { id: 'pB', x: 180, y: 0 },
        { id: 'pC', x: 500, y: 0 }, { id: 'pD', x: 580, y: 0 },
        { id: 'c1', x: 120, y: 150 }, { id: 'c2', x: 560, y: 150 }, // union1's kids straddle union2
        { id: 'c3', x: 300, y: 150 }, { id: 'c4', x: 340, y: 150 },
      ],
      unions: [
        { id: 'U1', partners: ['pA', 'pB'] },
        { id: 'U2', partners: ['pC', 'pD'] },
      ],
      parentChildRelationships: [
        { unionId: 'U1', children: ['c1', 'c2'] }, // rail spans x=120..560
        { unionId: 'U2', children: ['c3', 'c4'] }, // rail spans x=300..340 — inside U1's span
      ],
    };
    const layout = { nodes: graph.individuals, edges: [] };
    const issues = auditLayoutIntegrity(layout, graph);
    expect(codes(issues, 'SIBSHIP_BUS_OVERLAP').length).toBeGreaterThan(0);
  });

  it('does NOT flag two unions whose child rails are at the same Y but X-ranges are far apart', () => {
    const graph = {
      individuals: [
        { id: 'pA', x: 100, y: 0 }, { id: 'pB', x: 180, y: 0 },
        { id: 'pC', x: 900, y: 0 }, { id: 'pD', x: 980, y: 0 },
        { id: 'c1', x: 120, y: 150 }, { id: 'c2', x: 200, y: 150 },
        { id: 'c3', x: 920, y: 150 }, { id: 'c4', x: 1000, y: 150 },
      ],
      unions: [
        { id: 'U1', partners: ['pA', 'pB'] },
        { id: 'U2', partners: ['pC', 'pD'] },
      ],
      parentChildRelationships: [
        { unionId: 'U1', children: ['c1', 'c2'] }, // x=120..200
        { unionId: 'U2', children: ['c3', 'c4'] }, // x=920..1000 — no overlap
      ],
    };
    const layout = { nodes: graph.individuals, edges: [] };
    const issues = auditLayoutIntegrity(layout, graph);
    expect(codes(issues, 'SIBSHIP_BUS_OVERLAP')).toHaveLength(0);
  });

  it('does NOT flag two unions at clearly different rail heights even if X overlaps', () => {
    const graph = {
      individuals: [
        { id: 'pA', x: 100, y: 0 }, { id: 'pB', x: 180, y: 0 },
        { id: 'pC', x: 100, y: 150 }, { id: 'pD', x: 180, y: 150 },
        { id: 'c1', x: 120, y: 150 }, { id: 'c2', x: 200, y: 150 },
        { id: 'c3', x: 120, y: 300 }, { id: 'c4', x: 200, y: 300 },
      ],
      unions: [
        { id: 'U1', partners: ['pA', 'pB'] },
        { id: 'U2', partners: ['pC', 'pD'] },
      ],
      parentChildRelationships: [
        { unionId: 'U1', children: ['c1', 'c2'] }, // rail at (0+150)/2 = 75
        { unionId: 'U2', children: ['c3', 'c4'] }, // rail at (150+300)/2 = 225
      ],
    };
    const layout = { nodes: graph.individuals, edges: [] };
    const issues = auditLayoutIntegrity(layout, graph);
    expect(codes(issues, 'SIBSHIP_BUS_OVERLAP')).toHaveLength(0);
  });

  it('is warning severity, not error (does not break existing zero-error fixtures)', () => {
    const graph = {
      individuals: [
        { id: 'pA', x: 100, y: 0 }, { id: 'pB', x: 180, y: 0 },
        { id: 'pC', x: 500, y: 0 }, { id: 'pD', x: 580, y: 0 },
        { id: 'c1', x: 120, y: 150 }, { id: 'c2', x: 560, y: 150 },
        { id: 'c3', x: 300, y: 150 }, { id: 'c4', x: 340, y: 150 },
      ],
      unions: [
        { id: 'U1', partners: ['pA', 'pB'] },
        { id: 'U2', partners: ['pC', 'pD'] },
      ],
      parentChildRelationships: [
        { unionId: 'U1', children: ['c1', 'c2'] },
        { unionId: 'U2', children: ['c3', 'c4'] },
      ],
    };
    const layout = { nodes: graph.individuals, edges: [] };
    const issues = auditLayoutIntegrity(layout, graph);
    const overlap = codes(issues, 'SIBSHIP_BUS_OVERLAP');
    expect(overlap.length).toBeGreaterThan(0);
    expect(overlap.every(i => i.severity === 'warning')).toBe(true);
  });
});

describe('layoutAudit — EDGE_THROUGH_NODE', () => {
  const baseGraph = {
    individuals: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 400, y: 0 },
      { id: 'victim', x: 200, y: 0 }, // sits right on a horizontal a↔b union line
    ],
    unions: [{ id: 'U1', partners: ['a', 'b'] }],
    parentChildRelationships: [],
  };

  it('flags a union connector that runs straight through an unrelated node', () => {
    const layout = {
      nodes: baseGraph.individuals,
      edges: [{ type: 'union', unionId: 'U1', x1: 20, y1: 0, x2: 380, y2: 0 }],
    };
    const issues = auditLayoutIntegrity(layout, baseGraph);
    const hits = codes(issues, 'EDGE_THROUGH_NODE');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(i => i.severity === 'warning')).toBe(true);
    expect(hits.some(i => i.ids.includes('victim'))).toBe(true);
  });

  it('does NOT flag a connector that only touches its own endpoints', () => {
    const graph = {
      individuals: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 400, y: 0 }],
      unions: [{ id: 'U1', partners: ['a', 'b'] }],
      parentChildRelationships: [],
    };
    const layout = {
      nodes: graph.individuals,
      edges: [{ type: 'union', unionId: 'U1', x1: 20, y1: 0, x2: 380, y2: 0 }],
    };
    const issues = auditLayoutIntegrity(layout, graph);
    expect(codes(issues, 'EDGE_THROUGH_NODE')).toHaveLength(0);
  });

  it('does NOT flag a node that is near the line but clearly off it (different Y)', () => {
    const graph = {
      individuals: [
        { id: 'a', x: 0, y: 0 }, { id: 'b', x: 400, y: 0 },
        { id: 'bystander', x: 200, y: 150 },
      ],
      unions: [{ id: 'U1', partners: ['a', 'b'] }],
      parentChildRelationships: [],
    };
    const layout = {
      nodes: graph.individuals,
      edges: [{ type: 'union', unionId: 'U1', x1: 20, y1: 0, x2: 380, y2: 0 }],
    };
    const issues = auditLayoutIntegrity(layout, graph);
    expect(codes(issues, 'EDGE_THROUGH_NODE')).toHaveLength(0);
  });
});
