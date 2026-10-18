#!/usr/bin/env node
/**
 * layout-benchmark.mjs — CLI wrapper for the layout-engine benchmark.
 *   npm run audit:layout-benchmark
 *   npm run audit:layout-benchmark -- --engines recursive,legacy
 */
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
const i = args.indexOf('--engines');
const env = { ...process.env };
if (i !== -1 && args[i + 1]) env.LAYOUT_BENCH_ENGINES = args[i + 1];
const res = spawnSync('npx', ['vitest', 'run', '--config', 'scripts/benchmark.vitest.config.js', '--silent=false'], { stdio: 'inherit', env, cwd: process.cwd() });
process.exit(res.status || 0);
