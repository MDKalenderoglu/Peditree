#!/usr/bin/env node
/**
 * clinical-benchmark.mjs — Clinical Usability Benchmark (KI-1).
 *   npm run audit:clinical-benchmark -- --label baseline
 * Writes reports/clinical-benchmark-<label>.{json,md}. Measurement only.
 */
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
const i = args.indexOf('--label');
const env = { ...process.env, BENCH_LABEL: i !== -1 && args[i + 1] ? args[i + 1] : 'current' };
const res = spawnSync('npx', ['vitest', 'run', '--config', 'scripts/clinical-benchmark.vitest.config.js', '--silent=false'], { stdio: 'inherit', env, cwd: process.cwd() });
process.exit(res.status || 0);
