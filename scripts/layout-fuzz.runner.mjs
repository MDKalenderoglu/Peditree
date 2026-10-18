/**
 * layout-fuzz.runner.mjs — vitest entry for the layout-fuzz harness.
 *
 * Not a pass/fail test: it is a MEASUREMENT run. It reads config from env
 * (set by scripts/layout-fuzz.mjs), executes the fuzz suite against the real
 * store, and writes:
 *   reports/layout-fuzz-baseline.json  (machine)
 *   reports/layout-fuzz-baseline.md    (human)
 *   src/__tests__/fixtures/layout-fuzz/*.json  (minimal repros as fixtures)
 * The single `it` always passes (exit 0) so surfaced failures are reported,
 * not thrown — per the Step-0 contract.
 */
import { it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, replayOps } from '../src/audit/fuzzRunner.js';
import { NAMED_SCENARIOS } from '../src/audit/namedScenarios.js';

const SEED = process.env.LAYOUT_FUZZ_SEED || '1';
const CASES = parseInt(process.env.LAYOUT_FUZZ_CASES || '1000', 10);
const MAXOPS = parseInt(process.env.LAYOUT_FUZZ_MAXOPS || '14', 10);
const ROOT = process.cwd();

function pct(n) { return `${(n * 100).toFixed(1)}%`; }

it('layout-fuzz baseline run (measurement, always passes)', () => {
  const result = runSuite({ seed: SEED, cases: CASES, maxOps: MAXOPS });

  // ── Replay the 6 named QA scenarios ──
  const named = NAMED_SCENARIOS.map(s => {
    const { codes, readCodes, metrics } = replayOps(s.opSeq);
    return {
      name: s.name, description: s.description, failed: codes.length > 0, codes,
      readFailed: readCodes.length > 0, readCodes, metrics, opSeq: s.opSeq,
    };
  });

  // ── Write JSON report ──
  mkdirSync(join(ROOT, 'reports'), { recursive: true });
  const json = {
    generatedAt: new Date().toISOString(),
    seed: SEED, cases: CASES, maxOps: MAXOPS,
    passed: result.passed, failed: result.failed, failureRate: result.failureRate,
    codeCounts: result.codeCounts,
    implementedInvariants: result.implementedInvariants,
    topFailingSeeds: result.topFailingSeeds,
    minimalRepros: result.minimalRepros,
    readability: result.readability,
    namedScenarios: named,
  };
  writeFileSync(join(ROOT, 'reports', 'layout-fuzz-baseline.json'), JSON.stringify(json, null, 2));

  // ── Save minimal repros as deterministic regression fixtures ──
  const fixDir = join(ROOT, 'src', '__tests__', 'fixtures', 'layout-fuzz');
  mkdirSync(fixDir, { recursive: true });
  result.minimalRepros.forEach((r, idx) => {
    writeFileSync(join(fixDir, `repro-${String(idx + 1).padStart(2, '0')}-${r.signature.replace(/\W+/g, '_').slice(0, 60)}.json`),
      JSON.stringify({ caseSeed: r.caseSeed, codes: r.codes, opCount: r.opCount, opSeq: r.opSeq }, null, 2));
  });
  named.filter(n => n.failed).forEach(n => {
    writeFileSync(join(fixDir, `named-${n.name}.json`),
      JSON.stringify({ name: n.name, description: n.description, codes: n.codes, opSeq: n.opSeq }, null, 2));
  });

  // ── Write Markdown report ──
  const lines = [];
  lines.push('# Layout Fuzz — Baseline Report', '');
  lines.push(`Generated: ${json.generatedAt}`, '');
  lines.push(`Config: seed=\`${SEED}\`, cases=${CASES}, maxOpsPerCase=${MAXOPS}`, '');
  lines.push('## Result', '');
  lines.push(`- cases run: **${CASES}**`);
  lines.push(`- cases passed: **${result.passed}**`);
  lines.push(`- cases failed: **${result.failed}**`);
  lines.push(`- failure rate: **${pct(result.failureRate)}**`, '');
  lines.push('## Failure types by count', '');
  const sortedCodes = Object.entries(result.codeCounts).sort((a, b) => b[1] - a[1]);
  if (sortedCodes.length === 0) lines.push('_none_');
  else { lines.push('| invariant | failing cases |', '|---|---|'); sortedCodes.forEach(([c, n]) => lines.push(`| ${c} | ${n} |`)); }
  lines.push('');
  lines.push('## Implemented vs TODO invariants', '');
  lines.push('Implemented (checked every case):');
  result.implementedInvariants.forEach(c => lines.push(`- ${c}`));
  lines.push('', 'TODO invariants (declared in spec, not yet auto-checked): _none — all 13 spec invariants implemented._', '');
  lines.push('## Top 10 failing case seeds', '');
  if (result.topFailingSeeds.length === 0) lines.push('_none_');
  else { lines.push('| caseSeed | failAtStep | ops | codes |', '|---|---|---|---|'); result.topFailingSeeds.forEach(f => lines.push(`| ${f.caseSeed} | ${f.failStep} | ${f.opCount} | ${f.codes.join(', ')} |`)); }
  lines.push('');
  lines.push('## Top minimal repros (after shrinking)', '');
  if (result.minimalRepros.length === 0) lines.push('_none_');
  else result.minimalRepros.forEach((r, i) => {
    lines.push(`### repro ${i + 1} — ${r.signature} (${r.opCount} ops, caseSeed ${r.caseSeed})`);
    lines.push('```json', JSON.stringify(r.opSeq), '```', '');
  });
  const r = result.readability;
  lines.push('## Readability tier (connector ownership — connectorReadability.js)', '');
  lines.push('Reported separately from the 13-invariant tier above so historical baselines stay comparable.', '');
  lines.push(`- cases failing readability: **${r.failed}/${CASES}** (${pct(r.failureRate)})`);
  lines.push(`- end-state metrics: off-centre couple in ${r.metrics.withOffCenter} cases, side-hanging bus in ${r.metrics.withSideHang}, long union line (>3 slots) in ${r.metrics.withLongUnion}, foreign crossings in ${r.metrics.withCrossing} cases (${r.metrics.crossings} total)`, '');
  const rc = Object.entries(r.codeCounts).sort((a, b) => b[1] - a[1]);
  if (rc.length) { lines.push('| readability code | failing cases |', '|---|---|'); rc.forEach(([c, n]) => lines.push(`| ${c} | ${n} |`)); lines.push(''); }
  lines.push('## Named QA scenarios', '');
  lines.push('| scenario | invariant tier | readability tier | codes |', '|---|---|---|---|');
  named.forEach(n => lines.push(`| ${n.name} | ${n.failed ? '❌ FAIL' : '✅ pass'} | ${n.readFailed ? '❌ FAIL' : '✅ pass'} | ${[...n.codes, ...n.readCodes].join(', ') || '—'} |`));
  lines.push('');
  writeFileSync(join(ROOT, 'reports', 'layout-fuzz-baseline.md'), lines.join('\n'));

  console.log(`\n[layout-fuzz] invariant tier: ${result.passed}/${CASES} passed, ${result.failed} failed (${pct(result.failureRate)}); readability tier: ${CASES - result.readability.failed}/${CASES} passed (${pct(result.readability.failureRate)} failed). Report: reports/layout-fuzz-baseline.md\n`);
  expect(true).toBe(true);
});
