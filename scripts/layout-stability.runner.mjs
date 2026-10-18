/**
 * layout-stability.runner.mjs — runs the KI-2 stability populations
 * (src/audit/stabilityHarness.js) against the app store and writes
 * reports/layout-stability-<label>.{json,md}. Measurement only.
 */
import { it, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { usePedigreeStore } from '../src/state/usePedigreeStore.js';
import { runRandomPopulation, runTargeted } from '../src/audit/stabilityHarness.js';

it('layout stability report', () => {
  ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {}));
  const label = process.env.STABILITY_LABEL || 'current';
  const commit = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'unknown'; } })();
  const dirty = (() => { try { return execSync('git status --porcelain -- src').toString().trim() ? ' (+ uncommitted src changes)' : ''; } catch { return ''; } })();
  const t0 = Date.now();
  const random = runRandomPopulation(usePedigreeStore, { prefix: 'stab', sequences: 200, ops: 12 });
  const ki2 = runRandomPopulation(usePedigreeStore, { prefix: 'ki2-', sequences: 40, ops: 10 });
  const targeted = runTargeted(usePedigreeStore);
  const report = { label, commit: commit + dirty, node: process.version, generatedAt: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), populations: { 'random-200x12': random, 'ki2-40x10': ki2 }, targeted };
  mkdirSync(join(process.cwd(), 'reports'), { recursive: true });
  writeFileSync(join(process.cwd(), 'reports', `layout-stability-${label}.json`), JSON.stringify(report, null, 2));
  const L = [`# Layout stability (KI-2) — ${label}`, '', `Commit: \`${report.commit}\` · Node ${report.node} · ${report.generatedAt} · ${report.seconds} s`, '',
    'Method: src/audit/stabilityHarness.js — store-level, raw coordinates of what the clinician sees; "moved" = |Δx| > 2 px; transitions = applied (not refused) edits.', '',
    '## Random edit populations', '',
    '| population | transitions | parent flips / transitions with both parents | flip rate | moved fraction | edits with no movement | mean shift raw / aligned (px) | p90 max shift (px) |',
    '|---|---|---|---|---|---|---|---|'];
  for (const [name, p] of Object.entries(report.populations)) {
    L.push(`| ${name} | ${p.transitions} | ${p.parentFlips} / ${p.parentFlipTransitions} | ${(p.parentFlipRate * 100).toFixed(1)} % | ${(p.movedFraction * 100).toFixed(1)} % | ${(p.editsWithNoMovement * 100).toFixed(1)} % | ${p.meanShiftRawPx} / ${p.meanShiftAlignedPx} | ${p.p90MaxShiftPx} |`);
  }
  L.push('', '## Targeted clinical edits', '', 'Affected block = edited person, their sibship (siblings must make room), their partners, new people.', '',
    '| scenario | edit | people | moved outside block / outside | parent flip | sibling-order changes | undo exact (max px) | redo exact | save→load max px |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of targeted) {
    if (r.skipped) { L.push(`| ${r.scenario} | ${r.edit} | — | (not applicable) |||||| `); continue; }
    L.push(`| ${r.scenario} | ${r.edit} | ${r.people} | ${r.movedOutside} / ${r.outside} | ${r.parentFlip ? 'YES' : 'no'} | ${r.siblingOrderChanges} | ${r.undoExact ? 'yes' : 'no'} (${r.undoMaxPx}) | ${r.redoExact ? 'yes' : 'no'} | ${r.saveLoadMaxPx} |`);
  }
  writeFileSync(join(process.cwd(), 'reports', `layout-stability-${label}.md`), L.join('\n') + '\n');
  console.info(L.join('\n'));
});
