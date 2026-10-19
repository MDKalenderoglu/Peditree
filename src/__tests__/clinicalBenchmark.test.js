/**
 * clinicalBenchmark.test.js — safety gate for the Clinical Usability
 * Benchmark (src/audit/clinicalBenchmark.js): every clinical-scale family is
 * semantically valid and drawn without a misleading connection. Quality
 * numbers (centring, lines, legibility, stability) are reported by
 * `npm run audit:clinical-benchmark`, not asserted here.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { CLINICAL_BENCHMARK } from '../audit/clinicalBenchmark';
import { caseDocument, measureDrawing } from '../audit/clinicalBenchmarkMetrics';
import { computePclLayout } from '../layout/pcl';

beforeAll(() => { ['log', 'warn', 'table', 'info'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });

describe('Clinical Usability Benchmark — safety', () => {
  for (const c of CLINICAL_BENCHMARK) {
    it(`${c.id} ${c.name}: valid family, every connection drawn by its owner, birth order kept`, () => {
      const doc = caseDocument(c);
      const m = measureDrawing(doc, computePclLayout(doc.graph));
      expect(m.semantics.documentErrors).toEqual([]);
      expect(m.semantics.integrityErrors).toEqual([]);
      expect(m.semantics.unsupportedConsanguinity).toEqual([]);
      expect(m.semantics.appWarnings).toEqual([]);
      expect(m.geometry.invariants).toEqual([]);
      expect(m.geometry.connectorViolations).toEqual([]);
      expect(m.geometry.wrongOwner).toEqual([]);
      expect(m.geometry.missingStem).toEqual([]);
      expect(m.birthOrderViolations).toEqual([]);
      expect(m.lines.unmarkedCrossings).toBe(0);
    });
  }
  it('covers the agreed clinical bands (10–20, 21–50, 51–100)', () => {
    const sizes = CLINICAL_BENCHMARK.map(c => caseDocument(c).graph.individuals.length);
    expect(sizes.some(n => n >= 10 && n <= 20)).toBe(true);
    expect(sizes.filter(n => n >= 21 && n <= 50).length).toBeGreaterThanOrEqual(4);
    expect(sizes.some(n => n >= 51 && n <= 100)).toBe(true);
  });
});
