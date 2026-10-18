#!/usr/bin/env node
/**
 * ki3-fixtures.mjs — CLI wrapper: regenerate the frozen KI-3 fixtures.
 *   npm run audit:freeze-ki3            (writes only missing fixtures)
 *   npm run audit:freeze-ki3 -- --force (rewrites them)
 */
import { spawnSync } from 'node:child_process';
const env = { ...process.env };
if (process.argv.includes('--force')) env.KI3_FORCE = '1';
const res = spawnSync('npx', ['vitest', 'run', '--config', 'scripts/ki3-fixtures.vitest.config.js', '--silent=false'], { stdio: 'inherit', env, cwd: process.cwd() });
process.exit(res.status || 0);
