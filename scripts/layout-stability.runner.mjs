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
import { readFileSync } from 'node:fs';
import { runRandomPopulation, runTargeted, runFixtureEdits } from '../src/audit/stabilityHarness.js';
import * as ops from '../src/graph/ops.js';
import { computePclLayout } from '../src/layout/pcl/index.js';
import { computeStableLayout } from '../src/layout/pcl/incremental.js';
import { displayParentage } from '../src/graph/model.js';
import { checkAllInvariants } from '../src/audit/layoutInvariants.js';
import { checkConnectorReadability } from '../src/audit/connectorReadability.js';
import { createDocument } from '../src/graph/document.js';

it('layout stability report', () => {
  ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {}));
  const label = process.env.STABILITY_LABEL || 'current';
  const commit = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'unknown'; } })();
  const dirty = (() => { try { return execSync('git status --porcelain -- src').toString().trim() ? ' (+ uncommitted src changes)' : ''; } catch { return ''; } })();
  const t0 = Date.now();
  const random = runRandomPopulation(usePedigreeStore, { prefix: 'stab', sequences: 200, ops: 12 });
  const ki2 = runRandomPopulation(usePedigreeStore, { prefix: 'ki2-', sequences: 40, ops: 10 });
  const targeted = runTargeted(usePedigreeStore);
  const fixtures = ['ki3-p3-263', 'ki3-p4-387', 'ki3-p5-474'].map((id) => [id, JSON.parse(readFileSync(join(process.cwd(), 'src/__tests__/regression/ki3', `${id}.json`), 'utf8')).graph]);
  const large = runFixtureEdits({ fixtures, ops, computePclLayout, computeStableLayout, displayParentage, checkAllInvariants, checkConnectorReadability, createDocument });
  const report = { label, commit: commit + dirty, node: process.version, generatedAt: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), populations: { 'random-200x12': random, 'ki2-40x10': ki2 }, targeted, large };
  mkdirSync(join(process.cwd(), 'reports'), { recursive: true });
  writeFileSync(join(process.cwd(), 'reports', `layout-stability-${label}.json`), JSON.stringify(report, null, 2));
  const L = [`# Layout stability (KI-2) — ${label}`, '', `Commit: \`${report.commit}\` · Node ${report.node} · ${report.generatedAt} · ${report.seconds} s`, '',
    'Method: src/audit/stabilityHarness.js — store-level, raw coordinates of what the clinician sees; "moved" = |Δx| or |Δy| > 2 px; transitions = applied (not refused) edits. "Row neighbours whose gap changed" = two people side by side on a row whose distance changed by more than 2 px (local rearrangement; a block sliding as a whole only changes the gaps at its edges).', '',
    '## Random edit populations', '',
    'A parent flip "after a grandparent union edit" happened in an edit that created, removed or re-partnered a union with one of the parents\u2019 parents in it, or changed a parent\u2019s own parent union (e.g. a union between two grandparents, which can force the grandparent couples and so the parents to trade sides); adding an uncle or aunt does not count. "For readability": every edit-local layout had more readability problems (line crossings + off-centre couples + long partner lines) than the fresh layout the store used instead. Every other flip is "unexplained". Relayout level: n/a = no edit-local relayout (fresh layout after every edit).', '',
    '| population | transitions | parent flips / transitions with both parents | flip rate | flips: after a grandparent union edit / for readability / unexplained | moved fraction (of which vertical) | row neighbours whose gap changed | edits with no movement | mean shift raw / x-aligned (px) | p90 / max of the largest shift per edit (px) | relayout level per edit |',
    '|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const [name, p] of Object.entries(report.populations)) {
    const levels = Object.entries(p.layoutLevels || {}).map(([k, v]) => `${k} ${v}`).join(', ');
    L.push(`| ${name} | ${p.transitions} | ${p.parentFlips} / ${p.parentFlipTransitions} | ${(p.parentFlipRate * 100).toFixed(1)} % | ${p.parentFlipsGrandparentEdit} / ${p.parentFlipsForReadability} / ${p.parentFlipsUnexplained} | ${(p.movedFraction * 100).toFixed(1)} % (${(p.movedVerticallyFraction * 100).toFixed(1)} %) | ${(p.neighbourGapChanged * 100).toFixed(1)} % | ${(p.editsWithNoMovement * 100).toFixed(1)} % | ${p.meanShiftRawPx} / ${p.meanShiftAlignedPx} | ${p.p90MaxShiftPx} / ${p.maxShiftPx} | ${levels} |`);
  }
  L.push('', '### Readability cost of stability', '',
    'After every edit, the drawing the store shows vs a fresh PCL layout of the same graph (summed over all edits; off-centre = couple more than half a slot from the centre of its children; crossings = line jumps; long partner line = partners more than 3 slots apart; side-hanging = the couple\u2019s midpoint lies outside its children\u2019s span, which every single child not exactly below its parents counts as).', '',
    '| population | off-centre couples drawn / fresh | edits with more off-centre couples than fresh | line crossings drawn / fresh | edits with more crossings than fresh | long partner lines (> 3 slots) drawn / fresh | edits with more long partner lines than fresh | side-hanging sibship lines drawn / fresh | partnership line over another partner (KI-8) drawn / fresh |', '|---|---|---|---|---|---|---|---|---|');
  for (const [name, p] of Object.entries(report.populations)) {
    const r = p.readability;
    L.push(`| ${name} | ${r.offCenterDrawn} / ${r.offCenterFresh} | ${r.editsMoreOffCenterThanFresh} | ${r.crossingsDrawn} / ${r.crossingsFresh} | ${r.editsMoreCrossingsThanFresh} | ${r.longUnionsDrawn} / ${r.longUnionsFresh} | ${r.editsMoreLongUnionsThanFresh} | ${r.sideHangDrawn} / ${r.sideHangFresh} | ${r.lineOverOwnPartnerDrawn} / ${r.lineOverOwnPartnerFresh} |`);
  }
  L.push('', '## Targeted clinical edits', '', 'Affected block = edited person, new people, the edited person’s sibship (siblings may make room), their partners, and the parents of every new child. A family (couple, or sibship of 2+) counts as untouched when all its members are outside the block; it is reshaped when the spacing between its members changed by more than 2 px (moving as a unit does not count).', '',
    '| scenario | edit | people | moved outside block / outside | untouched families reshaped / untouched families | parent flip | sibling-order changes | undo exact (max px) | redo exact | save→load max px |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const r of targeted) {
    if (r.skipped) { L.push(`| ${r.scenario} | ${r.edit} | — | (not applicable) ||||||| `); continue; }
    L.push(`| ${r.scenario} | ${r.edit} | ${r.people} | ${r.movedOutside} / ${r.outside} | ${r.familyShapeChanges.replace('/', ' / ')} | ${r.parentFlip ? 'YES' : 'no'} | ${r.siblingOrderChanges} | ${r.undoExact ? 'yes' : 'no'} (${r.undoMaxPx}) | ${r.redoExact ? 'yes' : 'no'} | ${r.saveLoadMaxPx} |`);
  }
  L.push('', '## Large families (frozen KI-3 fixtures, PCL level)', '', 'Previous drawing = the fixture\u2019s fresh layout; one edit, drawn edit-locally. Readability: drawn (fresh layout of the edited graph).', '',
    '| fixture | edit | level | moved / people | mean / max shift (px) | off-centre | crossings | long partner lines | side-hanging | line over another partner | invariant / readability violations | time edit (fresh) ms | reopen exact (ms) |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of large) {
    if (r.skipped) { L.push(`| ${r.fixture} | ${r.edit} | (refused) |||||||||||`); continue; }
    const c = (k) => `${r.drawn[k]} (${r.fresh[k]})`;
    L.push(`| ${r.fixture} | ${r.edit} | ${r.level} | ${r.moved} / ${r.people} | ${r.meanShiftPx} / ${r.maxShiftPx} | ${c('offCenter')} | ${c('bridgedCrossings')} | ${c('longUnions')} | ${c('sideHang')} | ${c('lineOverOwnPartner')} | ${r.invariants} / ${r.readabilityViolations} | ${r.ms} (${r.freshMs}) | ${r.reopenExact ? 'yes' : 'NO'} (${r.reopenMs}) |`);
  }
  writeFileSync(join(process.cwd(), 'reports', `layout-stability-${label}.md`), L.join('\n') + '\n');
  console.info(L.join('\n'));
});
