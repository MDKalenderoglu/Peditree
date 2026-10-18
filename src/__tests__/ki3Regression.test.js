/**
 * ki3Regression.test.js — frozen KI-3 stress pedigrees (263 / 387 / 474
 * people), read from versioned JSON fixtures (src/__tests__/regression/ki3),
 * never regenerated from a seed: the generator's output depends on the store
 * and layout engine, so a seed alone does not pin the family.
 *
 * Provenance: scripts/ki3-fixtures.runner.mjs reproduces the original Faz 3
 * conditions (frozen schema-1 store, in-store engine `recursive`, seeds
 * p3/p4/p5). The structural signature equals the original record; the PCL of
 * commit 4e57a32 shows 3 / 13 / 7 footprint violations on these graphs, the
 * current PCL none (docs/PEDITREE_KNOWN_ISSUES.md, KI-3).
 *
 * Per fixture: file integrity, semantic validity, geometric invariants
 * (symbol overlap, lines through symbols, footprint …), connector
 * readability (crossings without jump, collinear lines, false junctions),
 * clinical readability ceilings, determinism, time budget.
 *
 * Ceilings are the values measured on 2026-10-18 (ratchet): a change may
 * improve them (then lower the ceiling), never worsen them.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalGraph, graphSha256, structuralSignature } from './regression/ki3/fixtureUtils';
import { computePclLayout } from '../layout/pcl';
import { checkAllInvariants } from '../audit/layoutInvariants';
import { checkConnectorReadability, readabilityMetrics } from '../audit/connectorReadability';
import { auditPedigreeGraph } from '../utils/graphIntegrity';
import { validateGraphStructure } from '../graph/validate';
import { createDocument } from '../graph/document';
import { validateDocument, errorsOf } from '../graph/validate';

beforeAll(() => { ['log', 'warn', 'table', 'info'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });

const CASES = [
  {
    id: 'ki3-p3-263',
    signature: { individuals: 263, unions: 51, crossFamilyUnions: 8, generations: 7 },
    // measured 2026-10-18: 177 ms median; product budget for ≤ 300 people is 2 s
    budgetMs: 2000,
    ceilings: { offCenter: 23, maxCentreOffset: 3399, longUnions: 7, bridgedCrossings: 123 },
  },
  {
    id: 'ki3-p4-387',
    signature: { individuals: 387, unions: 74, crossFamilyUnions: 9, generations: 7 },
    // measured 1713 ms median (KI-10: footprint rounds); regression ceiling, not a product target
    budgetMs: 3500,
    ceilings: { offCenter: 32, maxCentreOffset: 13048, longUnions: 5, bridgedCrossings: 133 },
  },
  {
    id: 'ki3-p5-474',
    signature: { individuals: 474, unions: 90, crossFamilyUnions: 13, generations: 8 },
    // measured 2778 ms median (KI-10); regression ceiling, not a product target
    budgetMs: 5000,
    ceilings: { offCenter: 35, maxCentreOffset: 17881, longUnions: 9, bridgedCrossings: 387 },
  },
];

const load = (id) => JSON.parse(readFileSync(join(process.cwd(), 'src/__tests__/regression/ki3', `${id}.json`), 'utf8'));

for (const c of CASES) {
  describe(`KI-3 fixture ${c.id}`, () => {
    let fixture, graph, layout;
    beforeAll(() => {
      fixture = load(c.id);
      graph = fixture.graph;
      layout = computePclLayout(graph);
    });

    it('fixture file is intact (content hash, signature, provenance)', () => {
      expect(fixture.fixtureVersion).toBe(1);
      expect(graphSha256(canonicalGraph(graph))).toBe(fixture.graphSha256);
      expect(structuralSignature(graph)).toEqual(c.signature);
      expect(fixture.structuralSignature).toEqual(c.signature);
      expect(fixture.provenance.inStoreLayoutEngine).toBe('recursive');
    });

    it('semantics: valid pedigree graph, valid as a schema v2 document', () => {
      expect(auditPedigreeGraph(graph).filter(i => i.severity === 'error')).toEqual([]);
      expect(validateGraphStructure(graph)).toEqual([]);
      expect(errorsOf(validateDocument(createDocument(graph)))).toEqual([]);
    });

    it('geometry: no layout invariant violation (symbol overlap, line through symbol, footprint …)', () => {
      expect(checkAllInvariants({ ...graph, ...layout }).map(v => v.code)).toEqual([]);
    });

    it('connectors: no unmarked crossing, collinear foreign lines or false junction', () => {
      expect(checkConnectorReadability({ ...graph, ...layout }).map(v => v.code)).toEqual([]);
    });

    it('every person is placed exactly once with finite coordinates', () => {
      expect(layout.nodes.length).toBe(graph.individuals.length);
      expect(new Set(layout.nodes.map(n => n.id)).size).toBe(graph.individuals.length);
      for (const n of layout.nodes) expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
    });

    it('clinical readability does not get worse (ratchet on measured values)', () => {
      const m = readabilityMetrics({ ...graph, ...layout });
      for (const [k, ceiling] of Object.entries(c.ceilings)) expect(m[k], k).toBeLessThanOrEqual(ceiling);
    });

    it('deterministic: same graph → identical layout', () => {
      const again = computePclLayout(graph);
      expect(again.nodes.map(n => [n.id, n.x, n.y])).toEqual(layout.nodes.map(n => [n.id, n.x, n.y]));
      expect(again.edges).toEqual(layout.edges);
    });

    it(`time budget: median of 3 runs ≤ ${c.budgetMs} ms`, () => {
      const ts = [];
      for (let k = 0; k < 3; k++) {
        const t0 = performance.now();
        computePclLayout(graph);
        ts.push(performance.now() - t0);
      }
      ts.sort((a, b) => a - b);
      expect(ts[1]).toBeLessThan(c.budgetMs);
    }, 60000);
  });
}
