#!/usr/bin/env node
/**
 * layout-stability.mjs — edit-stability report (KI-2).
 *   npm run audit:layout-stability -- --label before
 * Writes reports/layout-stability-<label>.{json,md}.
 */
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
const i = args.indexOf('--label');
const env = { ...process.env, STABILITY_LABEL: i !== -1 && args[i + 1] ? args[i + 1] : 'current' };
const res = spawnSync('npx', ['vitest', 'run', '--config', 'scripts/stability.vitest.config.js', '--silent=false'], { stdio: 'inherit', env, cwd: process.cwd() });
process.exit(res.status || 0);
