/**
 * layout-benchmark.runner.mjs — compares layout engines on the clinical
 * stress fixtures (src/audit/clinicalFixtures.js). Measurement only; always
 * passes. Writes reports/layout-benchmark.{json,md}.
 */
import { it, expect, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CLINICAL_FIXTURES } from '../src/audit/clinicalFixtures.js';
import { ENGINES } from '../src/audit/engines.js';
import { checkAllInvariants } from '../src/audit/layoutInvariants.js';
import { checkConnectorReadability, readabilityMetrics } from '../src/audit/connectorReadability.js';

const ROOT = process.cwd();
const SELECTED = (process.env.LAYOUT_BENCH_ENGINES || Object.keys(ENGINES).join(',')).split(',');

function uniq(list) { return [...new Set(list.map(v => v.code))].sort(); }

it('layout engine benchmark (measurement, always passes)', () => {
  ['log', 'table', 'warn'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {}));
  const rows = [];
  for (const engine of SELECTED) {
    const layout = ENGINES[engine];
    if (!layout) continue;
    for (const f of CLINICAL_FIXTURES) {
      const graph = f.build();
      const t0 = performance.now();
      let result; let error = null;
      try { result = layout(graph); } catch (e) { error = String(e && e.message || e); }
      const ms = performance.now() - t0;
      if (error) { rows.push({ engine, fixture: f.id, name: f.name, error }); continue; }
      const pd = { ...graph, ...result };
      rows.push({
        engine, fixture: f.id, name: f.name, ms: +ms.toFixed(2),
        invariantCodes: uniq(checkAllInvariants(pd)),
        readabilityCodes: uniq(checkConnectorReadability(pd)),
        readabilityViolations: checkConnectorReadability(pd).length,
        metrics: readabilityMetrics(pd),
      });
    }
  }
  mkdirSync(join(ROOT, 'reports'), { recursive: true });
  writeFileSync(join(ROOT, 'reports', 'layout-benchmark.json'), JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
  const L = ['# Layout Engine Benchmark — clinical stress fixtures', '', `Generated: ${new Date().toISOString()}`, ''];
  for (const engine of SELECTED) {
    const er = rows.filter(r => r.engine === engine);
    if (!er.length) continue;
    const clean = er.filter(r => !r.error && !r.invariantCodes.length && !r.readabilityCodes.length).length;
    L.push(`## ${engine} — fully clean on ${clean}/${er.length} fixtures`, '');
    L.push('| fixture | invariants | readability (violations) | off-centre / unions | max centre offset | long unions | max union span | crossings | width/person | ms |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const r of er) {
      if (r.error) { L.push(`| ${r.fixture} | ERROR: ${r.error} |||||||||`); continue; }
      const m = r.metrics;
      L.push(`| ${r.fixture} ${r.name} | ${r.invariantCodes.join(', ') || '✅'} | ${r.readabilityCodes.join(', ') || '✅'} (${r.readabilityViolations}) | ${m.offCenter}/${m.unionsWithChildren} | ${m.maxCentreOffset} | ${m.longUnions} | ${m.maxUnionSpan} | ${m.crossings} | ${m.widthPerIndividual} | ${r.ms} |`);
    }
    L.push('');
  }
  writeFileSync(join(ROOT, 'reports', 'layout-benchmark.md'), L.join('\n'));
  console.info(L.join('\n'));
  expect(true).toBe(true);
});
