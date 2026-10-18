/**
 * knownIssues.test.js — regression records for the open issues listed in
 * docs/PEDITREE_KNOWN_ISSUES.md (KI-1 … KI-7).
 *
 * Three kinds of guard:
 *   - fixed issues: an ordinary test that must keep passing;
 *   - open issues, ratchet: the measured value today is the ceiling — the
 *     test fails if it gets WORSE (lower the ceiling when it improves);
 *   - open issues, target: `it.fails` encodes the behaviour we want. It is
 *     expected to fail today; when the issue is fixed it starts passing, the
 *     `it.fails` turns red, and the record must be moved to "fixed".
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computePclLayout } from '../layout/pcl';
import { makeLargePedigree, LARGE_PEDIGREE_CASES } from '../audit/largePedigrees';
import { readabilityMetrics } from '../audit/connectorReadability';
import { checkAllInvariants } from '../audit/layoutInvariants';
import { makeRng, seedToInt } from '../audit/prng.js';
import { resetModel, chooseOp, applyOp, snapshot } from '../audit/fuzzModel.js';
import { usePedigreeStore } from '../state/usePedigreeStore';

beforeAll(() => {
  ['log', 'table', 'warn', 'info'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {}));
});

const graphOf = (pd) => ({ individuals: pd.individuals, unions: pd.unions, parentChildRelationships: pd.parentChildRelationships });

// The fuzz model drives the real store, which relayouts after every
// operation; building a 400-operation pedigree with PCL each step takes
// minutes, so the graph is built with the (fast) legacy engine and PCL is
// run once on the result.
function randomPedigree(seed, ops) {
  const prev = process.env.PEDITREE_PACKER;
  process.env.PEDITREE_PACKER = 'legacy';
  try {
    const rng = makeRng(seedToInt(seed));
    resetModel();
    for (let s = 0; s < ops; s++) {
      let op = null;
      for (let r = 0; r < 6 && !op; r++) op = chooseOp(rng);
      if (op) applyOp(op);
    }
    return graphOf(snapshot());
  } finally {
    if (prev === undefined) delete process.env.PEDITREE_PACKER; else process.env.PEDITREE_PACKER = prev;
  }
}

describe('KI-1 (open, P1) — couple centring on large pedigrees', () => {
  const offCentre = (c) => {
    const g = makeLargePedigree(c);
    return readabilityMetrics({ ...g, ...computePclLayout(g) });
  };

  it('ratchet: off-centre couples do not increase', () => {
    const ceiling = { 'realistic-100': 7, 'realistic-200': 37, 'realistic-300': 50 };
    for (const c of LARGE_PEDIGREE_CASES) {
      expect(offCentre(c).offCenter, c.name).toBeLessThanOrEqual(ceiling[c.name]);
    }
  }, 30000);

  it.fails('target: ≥ 95 % of couples with children centred within half a slot', () => {
    for (const c of LARGE_PEDIGREE_CASES) {
      const m = offCentre(c);
      expect(m.offCenter / m.unionsWithChildren, c.name).toBeLessThanOrEqual(0.05);
    }
  }, 30000);
});

describe('KI-2 (open, P1) — edits re-arrange unrelated parts of the drawing', () => {
  const S = () => usePedigreeStore.getState();
  const xMap = () => new Map(S().pedigreeData.nodes.map(n => [n.id, n.x]));

  function scenario() {
    S().resetPedigree();
    S().updateSiblingCount('male', 2);
    S().updateSiblingCount('female', 1);
    S().updateRelativeCount('maternalRelatives', 'uncles', 1);
    S().updateRelativeChildren('maternalRelatives', 'uncles', 0, 'female', 2);
    S().updateRelativeCount('paternalRelatives', 'aunts', 1);
    S().updateRelativeChildren('paternalRelatives', 'aunts', 0, 'male', 2);
    S().addSpouseTo('proband', 'female');
  }

  it('ratchet: parent left/right flips over 40 random edit sequences do not increase', () => {
    let flips = 0;
    for (let c = 0; c < 40; c++) {
      const rng = makeRng(seedToInt('ki2-' + c));
      resetModel();
      let prev = null;
      for (let s = 0; s < 10; s++) {
        let op = null;
        for (let r = 0; r < 6 && !op; r++) op = chooseOp(rng);
        if (!op) continue;
        applyOp(op);
        const x = new Map(computePclLayout(graphOf(snapshot())).nodes.map(n => [n.id, n.x]));
        if (prev && [x, prev].every(m => m.has('mother') && m.has('father'))) {
          if (Math.sign(x.get('mother') - x.get('father')) !== Math.sign(prev.get('mother') - prev.get('father'))) flips++;
        }
        prev = x;
      }
    }
    expect(flips).toBeLessThanOrEqual(KI2_FLIP_CEILING);
  }, 60000);

  it.fails('target: adding a spouse and a child to one sibling moves nobody outside that family block', () => {
    scenario();
    const before = xMap();
    S().addSpouseTo('sib_m_0', 'female');
    const uid = S().pedigreeData.unions.find(u => u.partners.includes('sib_m_0')).id;
    S().addChildToUnion(uid, 'male');
    const after = xMap();
    const block = new Set(['sib_m_0', ...S().pedigreeData.unions.find(u => u.id === uid).partners,
      ...(S().pedigreeData.parentChildRelationships.find(r => r.unionId === uid)?.children || [])]);
    const d = after.get('proband') - before.get('proband');
    const moved = [...before.keys()].filter(id => !block.has(id) && after.has(id) && Math.abs(after.get(id) - before.get(id) - d) > 2);
    expect(moved).toEqual([]);
  });
});

describe('KI-3 (fixed, P0) — footprint violations on adversarial random-operation pedigrees', () => {
  for (const [seed, ops] of [['p3', 220], ['p4', 320], ['p5', 400]]) {
    it(`${seed} (${ops} random operations): no layout invariant violation`, () => {
      const g = randomPedigree(seed, ops);
      expect(g.individuals.length).toBeGreaterThan(200);
      const full = { ...g, ...computePclLayout(g) };
      expect(checkAllInvariants(full).map(v => v.code)).toEqual([]);
    }, 60000);
  }
});

describe('KI-4 (open, P2) — pedigree number drawn on the line of descent', () => {
  it.fails('target: the "II-3" label is not centred on the symbol axis where the stem enters', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/PedigreeCanvas.jsx'), 'utf8');
    expect(src).not.toMatch(/\.attr\('y', -\(sz \+ 8\)\)\.attr\('text-anchor', 'middle'\)/);
  });
});

describe('KI-5 / KI-6 (fixed) — notices and toolbar never cover the canvas', () => {
  const css = () => readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8');
  const block = (sel) => {
    const s = css();
    const i = s.indexOf(`${sel} {`);
    return i < 0 ? '' : s.slice(i, s.indexOf('}', i));
  };
  it('the warning panel is in normal flow, inside the notice area above the canvas stage', () => {
    expect(block('.warning-panel')).not.toMatch(/position:\s*absolute/);
    const app = readFileSync(join(process.cwd(), 'src/App.jsx'), 'utf8');
    expect(app.indexOf('className="canvas-notices"')).toBeGreaterThan(-1);
    expect(app.indexOf('className="canvas-notices"')).toBeLessThan(app.indexOf('className="canvas-stage"'));
    expect(app.indexOf('className="warning-panel"')).toBeLessThan(app.indexOf('className="canvas-stage"'));
  });
  it('the toolbar wraps and is not overlaid on the canvas', () => {
    expect(block('.canvas-toolbar')).toMatch(/flex-wrap:\s*wrap/);
    expect(block('.canvas-toolbar')).not.toMatch(/position:\s*absolute/);
  });
});

// Measured 2026-10-18 (PCL with man-left tie-breaker). Lower it when it improves.
const KI2_FLIP_CEILING = 31;
