/**
 * ki3-fixtures.runner.mjs — regenerates the KI-3 stress pedigrees and writes
 * them as frozen, versioned JSON fixtures (src/__tests__/regression/ki3/).
 *
 * The original KI-3 graphs (Faz 3, 2026-10-18) came from the layout fuzz
 * model driving the schema-1 store with the in-store layout engine
 * `recursive` (the default before the PCL cutover). The fuzz model's choices
 * depend on that engine (relationship actions pass a layout safety check),
 * so the same seeds give different families under another store or engine.
 * This runner reproduces the original conditions exactly:
 *   - frozen schema-1 store (src/__tests__/support/v1Store.js)
 *   - PEDITREE_PACKER=recursive for the store's own relayouts
 *   - seeds p3 / p4 / p5 with 220 / 320 / 400 operations
 * and refuses to write a fixture whose structural signature differs from
 * the original record. Tests then read the JSON, never the seed.
 *
 *   npm run audit:freeze-ki3            (only writes missing fixtures)
 *   npm run audit:freeze-ki3 -- --force (rewrites; changes the sha256!)
 */
import { it, vi } from 'vitest';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeRng, seedToInt } from '../src/audit/prng.js';
import { resetModel, chooseOp, applyOp, setFuzzStore } from '../src/audit/fuzzModel.js';
import { useV1Store } from '../src/__tests__/support/v1Store.js';
import { canonicalGraph, graphSha256, structuralSignature } from '../src/__tests__/regression/ki3/fixtureUtils.js';

const DIR = join(process.cwd(), 'src/__tests__/regression/ki3');

// The original Faz 3 measurement (docs/PEDITREE_KNOWN_ISSUES.md, KI-3):
// individuals, unions, cross-family marriages, generation count.
const ORIGINAL = [
  { id: 'ki3-p3-263', seed: 'p3', ops: 220, signature: { individuals: 263, unions: 51, crossFamilyUnions: 8, generations: 7 } },
  { id: 'ki3-p4-387', seed: 'p4', ops: 320, signature: { individuals: 387, unions: 74, crossFamilyUnions: 9, generations: 7 } },
  { id: 'ki3-p5-474', seed: 'p5', ops: 400, signature: { individuals: 474, unions: 90, crossFamilyUnions: 13, generations: 8 } },
];

it('freeze KI-3 fixtures', () => {
  ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {}));
  const force = process.env.KI3_FORCE === '1';
  mkdirSync(DIR, { recursive: true });
  const prevPacker = process.env.PEDITREE_PACKER;
  process.env.PEDITREE_PACKER = 'recursive';
  setFuzzStore(useV1Store);
  const lines = [];
  try {
    for (const o of ORIGINAL) {
      const file = join(DIR, `${o.id}.json`);
      if (existsSync(file) && !force) { lines.push(`${o.id}: exists (kept)`); continue; }
      const rng = makeRng(seedToInt(o.seed));
      resetModel();
      for (let s = 0; s < o.ops; s++) {
        let op = null;
        for (let r = 0; r < 6 && !op; r++) op = chooseOp(rng);
        if (op) applyOp(op);
      }
      const graph = canonicalGraph(useV1Store.getState().pedigreeData);
      const sig = structuralSignature(graph);
      if (JSON.stringify(sig) !== JSON.stringify(o.signature)) {
        throw new Error(`${o.id}: structural signature ${JSON.stringify(sig)} differs from the original record ${JSON.stringify(o.signature)} — not written`);
      }
      const fixture = {
        fixtureVersion: 1,
        id: o.id,
        description: 'KI-3 stress pedigree (adversarial random editor operations). Frozen: tests must read this JSON, never regenerate from the seed.',
        provenance: {
          generator: 'src/audit/fuzzModel.js (chooseOp/applyOp)',
          seed: o.seed, operations: o.ops,
          store: 'schema-1 store, frozen copy src/__tests__/support/v1Store.js',
          inStoreLayoutEngine: 'recursive',
          frozenAt: new Date().toISOString(),
          originalRecord: 'Faz 3 measurement, 2026-10-18 (docs/PEDITREE_KNOWN_ISSUES.md KI-3)',
          identity: 'Structural signature (individuals, unions, cross-family unions, generations) equals the original record; no content hash of the original graph was recorded, so byte identity cannot be proven.',
        },
        structuralSignature: sig,
        graphSha256: graphSha256(graph),
        graph,
      };
      writeFileSync(file, JSON.stringify(fixture, null, 1) + '\n');
      lines.push(`${o.id}: written (${sig.individuals} people, sha256 ${fixture.graphSha256.slice(0, 12)}…)`);
    }
  } finally {
    setFuzzStore(null);
    if (prevPacker === undefined) delete process.env.PEDITREE_PACKER; else process.env.PEDITREE_PACKER = prevPacker;
  }
  console.info(lines.join('\n'));
});
