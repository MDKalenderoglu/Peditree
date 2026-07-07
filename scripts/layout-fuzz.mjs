#!/usr/bin/env node
/**
 * layout-fuzz.mjs — CLI wrapper for the layout-fuzz harness.
 *
 * Usage:
 *   npm run audit:layout-fuzz
 *   npm run audit:layout-fuzz -- --seed 12345 --cases 1000
 *   npm run audit:layout-fuzz -- --seed 12345 --replay
 *
 * Parses args → sets env → runs the vitest runner (which resolves the app's
 * ESM/JSX toolchain) → prints the baseline summary. Runs in plain node
 * (only node builtins here); the actual work happens in the runner.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
function getFlag(name, def) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = args[i + 1];
  return (v && !v.startsWith('--')) ? v : true;
}

const seed = getFlag('seed', '1');
const replay = args.includes('--replay');
const cases = replay ? '1' : String(getFlag('cases', '1000'));
const maxops = String(getFlag('maxops', '14'));

const packer = getFlag('packer', ''); // '' = shipped engine, 'recursive' = new packer
const env = { ...process.env, LAYOUT_FUZZ_SEED: String(seed), LAYOUT_FUZZ_CASES: cases, LAYOUT_FUZZ_MAXOPS: maxops };
if (packer === 'recursive') env.PEDITREE_PACKER = 'recursive';

if (replay) {
  // Replay mode re-runs the same seed with 1 case for a deterministic
  // reproduction (identical seed ⇒ identical case). Reports to console.
  env.LAYOUT_FUZZ_CASES = '1';
}

console.log(`[layout-fuzz] seed=${seed} cases=${env.LAYOUT_FUZZ_CASES} maxOps=${maxops}${replay ? ' (replay)' : ''}`);

const res = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'scripts/fuzz.vitest.config.js'],
  { stdio: 'inherit', env, cwd: process.cwd() }
);

const reportPath = join(process.cwd(), 'reports', 'layout-fuzz-baseline.json');
if (existsSync(reportPath)) {
  const j = JSON.parse(readFileSync(reportPath, 'utf8'));
  console.log('\n──────── Layout Fuzz Baseline ────────');
  console.log(`passed:  ${j.passed}/${j.cases}`);
  console.log(`failed:  ${j.failed}  (rate ${(j.failureRate * 100).toFixed(1)}%)`);
  console.log('failures by invariant:');
  const sorted = Object.entries(j.codeCounts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) console.log('  (none)');
  else sorted.forEach(([c, n]) => console.log(`  ${String(n).padStart(5)}  ${c}`));
  console.log('named QA scenarios:');
  j.namedScenarios.forEach(n => console.log(`  ${n.failed ? 'FAIL' : 'pass'}  ${n.name}  ${n.codes.join(',') || ''}`));
  console.log('full report: reports/layout-fuzz-baseline.md');
  console.log('──────────────────────────────────────');
}

process.exit(res.status || 0);
