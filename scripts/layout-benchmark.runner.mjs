/**
 * layout-benchmark.runner.mjs — compares layout engines on the clinical
 * stress fixtures (src/audit/clinicalFixtures.js) and on synthetic realistic
 * large pedigrees (src/audit/largePedigrees.js). Measurement only; always
 * passes. Writes reports/layout-benchmark.{json,md}.
 */
import { it, expect, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CLINICAL_FIXTURES } from '../src/audit/clinicalFixtures.js';
import { makeLargePedigree, LARGE_PEDIGREE_CASES } from '../src/audit/largePedigrees.js';
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
  // Realistic large pedigrees: median of 3 timed runs after one warm-up.
  const large = [];
  for (const engine of SELECTED) {
    const layout = ENGINES[engine];
    if (!layout) continue;
    for (const c of LARGE_PEDIGREE_CASES) {
      const graph = makeLargePedigree(c);
      let result; let error = null;
      const times = [];
      try {
        layout(graph);
        for (let k = 0; k < 3; k++) { const t0 = performance.now(); result = layout(graph); times.push(performance.now() - t0); }
      } catch (e) { error = String(e && e.message || e); }
      if (error) { large.push({ engine, case: c.name, individuals: graph.individuals.length, error }); continue; }
      times.sort((a, b) => a - b);
      const pd = { ...graph, ...result };
      large.push({
        engine, case: c.name, individuals: graph.individuals.length, loops: c.loops, ms: +times[1].toFixed(1),
        invariantViolations: checkAllInvariants(pd).length,
        readabilityViolations: checkConnectorReadability(pd).length,
        metrics: readabilityMetrics(pd),
      });
    }
  }
  mkdirSync(join(ROOT, 'reports'), { recursive: true });
  writeFileSync(join(ROOT, 'reports', 'layout-benchmark.json'), JSON.stringify({ generatedAt: new Date().toISOString(), rows, large }, null, 2));
  const L = ['# Layout Engine Benchmark — clinical stress fixtures', '', `Generated: ${new Date().toISOString()}`, ''];
  for (const engine of SELECTED) {
    const er = rows.filter(r => r.engine === engine);
    if (!er.length) continue;
    const clean = er.filter(r => !r.error && !r.invariantCodes.length && !r.readabilityCodes.length).length;
    L.push(`## ${engine} — fully clean on ${clean}/${er.length} fixtures`, '');
    L.push('| fixture | invariants | readability (violations) | off-centre / unions | max centre offset | long unions | max union span | crossings (unmarked / jumped) | stacked buses | width/person | ms |', '|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of er) {
      if (r.error) { L.push(`| ${r.fixture} | ERROR: ${r.error} ||||||||||`); continue; }
      const m = r.metrics;
      L.push(`| ${r.fixture} ${r.name} | ${r.invariantCodes.join(', ') || '✅'} | ${r.readabilityCodes.join(', ') || '✅'} (${r.readabilityViolations}) | ${m.offCenter}/${m.unionsWithChildren} | ${m.maxCentreOffset} | ${m.longUnions} | ${m.maxUnionSpan} | ${m.crossings} / ${m.bridgedCrossings} | ${m.stackedBuses} | ${m.widthPerIndividual} | ${r.ms} |`);
    }
    L.push('');
  }
  L.push('## Realistic large pedigrees (synthetic, src/audit/largePedigrees.js)', '');
  L.push('Median of 3 runs after a warm-up, in the vitest/node process. Product budgets: 100 people < 500 ms, 300 people < 2 s.', '');
  L.push('| engine | case | people | cousin loops | invariant violations | readability violations | off-centre / couples with children | max centre offset | crossings (unmarked / jumped) | width | ms |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of large) {
    if (r.error) { L.push(`| ${r.engine} | ${r.case} | ${r.individuals} | ERROR: ${r.error} ||||||||`); continue; }
    const m = r.metrics;
    L.push(`| ${r.engine} | ${r.case} | ${r.individuals} | ${r.loops} | ${r.invariantViolations || '✅ 0'} | ${r.readabilityViolations || '✅ 0'} | ${m.offCenter}/${m.unionsWithChildren} | ${m.maxCentreOffset} | ${m.crossings} / ${m.bridgedCrossings} | ${m.width} | ${r.ms} |`);
  }
  L.push('');
  writeFileSync(join(ROOT, 'reports', 'layout-benchmark.md'), L.join('\n'));
  console.info(L.join('\n'));
  expect(true).toBe(true);
});
