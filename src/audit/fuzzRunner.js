/**
 * fuzzRunner.js — orchestrates the model-based layout fuzz.
 *
 * For each case: reset the store, apply a random valid operation sequence,
 * and after EVERY op run the full invariant suite. The first op that trips
 * any invariant makes the case a failure; its prefix (the minimal-so-far
 * reproducing sequence) plus the tripped codes and a compact graph snapshot
 * are recorded. Deterministic: a case is fully determined by its caseSeed,
 * and replay needs only the recorded op list.
 */
import { makeRng, seedToInt } from './prng.js';
import { resetModel, chooseOp, applyOp, snapshot } from './fuzzModel.js';
import { checkAllInvariants, INVARIANT_CODES } from './layoutInvariants.js';

function uniqueCodes(violations) {
  return [...new Set(violations.map(v => v.code))].sort();
}

function compactSnapshot(pd) {
  return {
    individuals: (pd.individuals || []).map(i => ({ id: i.id, sex: i.sex, generation: i.generation, relation: i.relation, x: i.nodeX, y: i.nodeY })),
    nodes: (pd.nodes || []).map(n => ({ id: n.id, x: n.x, y: n.y, generation: n.generation })),
    unions: (pd.unions || []).map(u => ({ id: u.id, partners: u.partners })),
    parentChildRelationships: (pd.parentChildRelationships || []).map(r => ({ unionId: r.unionId, children: r.children })),
  };
}

const caseRng = (baseSeed, i) => makeRng((seedToInt(baseSeed) ^ Math.imul(i + 1, 2654435761)) >>> 0);

/**
 * Run a single case. Applies up to maxOps operations, stopping at the first
 * op that trips an invariant. Returns a result descriptor.
 */
export function runCase(baseSeed, caseIndex, maxOps) {
  const rng = caseRng(baseSeed, caseIndex);
  resetModel();
  const opSeq = [];
  for (let step = 0; step < maxOps; step++) {
    let op = null;
    for (let retry = 0; retry < 6 && !op; retry++) op = chooseOp(rng);
    if (!op) continue;
    applyOp(op);
    opSeq.push(op);
    const violations = checkAllInvariants(snapshot());
    if (violations.length > 0) {
      return {
        failed: true,
        caseIndex,
        caseSeed: (seedToInt(baseSeed) ^ Math.imul(caseIndex + 1, 2654435761)) >>> 0,
        failStep: step,
        codes: uniqueCodes(violations),
        opSeq,
        snapshot: compactSnapshot(snapshot()),
      };
    }
  }
  return { failed: false, caseIndex, opSeq };
}

/** Replay an explicit op sequence from a clean reset; return tripped codes. */
export function replayOps(opSeq) {
  resetModel();
  for (const op of opSeq) applyOp(op);
  const violations = checkAllInvariants(snapshot());
  return { codes: uniqueCodes(violations), violations, snapshot: compactSnapshot(snapshot()) };
}

/**
 * Greedy shrink: remove ops (repeatedly, back to front) while replay still
 * reproduces at least one of the original failure codes. Bounded so large
 * sequences don't blow up runtime.
 */
export function shrink(opSeq, originalCodes) {
  const targets = new Set(originalCodes);
  let current = [...opSeq];
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (let i = current.length - 1; i >= 0; i--) {
      const candidate = current.slice(0, i).concat(current.slice(i + 1));
      if (candidate.length === 0) continue;
      const { codes } = replayOps(candidate);
      if (codes.some(c => targets.has(c))) {
        current = candidate;
        improved = true;
        break;
      }
    }
  }
  const final = replayOps(current);
  return { opSeq: current, codes: final.codes };
}

/**
 * Run a suite of `cases` cases starting at `seed`. Returns an aggregate
 * result object suitable for report generation. `shrinkTop` shrinks the
 * first N distinct-signature failures for minimal repros.
 */
export function runSuite({ seed, cases, maxOps = 14, shrinkTop = 10 }) {
  const failures = [];
  const codeCounts = {};
  let passed = 0;

  for (let i = 0; i < cases; i++) {
    const res = runCase(seed, i, maxOps);
    if (!res.failed) { passed++; continue; }
    for (const code of res.codes) codeCounts[code] = (codeCounts[code] || 0) + 1;
    failures.push(res);
  }

  // Pick distinct-signature failures to shrink (one per unique code-set),
  // shortest opSeq first, up to shrinkTop.
  const bySignature = new Map();
  for (const f of failures) {
    const sig = f.codes.join('+');
    const cur = bySignature.get(sig);
    if (!cur || f.opSeq.length < cur.opSeq.length) bySignature.set(sig, f);
  }
  const toShrink = [...bySignature.values()]
    .sort((a, b) => a.opSeq.length - b.opSeq.length)
    .slice(0, shrinkTop);
  const minimalRepros = toShrink.map(f => {
    const sh = shrink(f.opSeq, f.codes);
    return { caseSeed: f.caseSeed, signature: f.codes.join('+'), opCount: sh.opSeq.length, codes: sh.codes, opSeq: sh.opSeq };
  });

  return {
    seed,
    cases,
    maxOps,
    passed,
    failed: failures.length,
    failureRate: cases > 0 ? failures.length / cases : 0,
    codeCounts,
    implementedInvariants: INVARIANT_CODES,
    topFailingSeeds: failures.slice(0, 10).map(f => ({ caseSeed: f.caseSeed, failStep: f.failStep, codes: f.codes, opCount: f.opSeq.length })),
    minimalRepros,
    allFailures: failures,
  };
}
