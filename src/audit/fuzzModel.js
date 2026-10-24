/**
 * fuzzModel.js — model-based operation fuzzer for the layout engine.
 *
 * Drives the REAL Zustand store the way a clinician's clicks would: each
 * step chooses a valid clinical graph operation against the CURRENT graph
 * (real target ids, real union ids) and applies it through the actual store
 * action. This is deliberately operation-sequence based — the reported
 * failures come not from a hand-built final graph but from realistic action
 * sequences (add parents → add siblings to both → add child upstream → make
 * a distant union → add another sibling …), which is where the clinical
 * defects actually arise.
 *
 * Every applied op is recorded with its CONCRETE args, so replaying a
 * sequence needs only the op list (no PRNG) — deterministic by construction.
 *
 * Scope: only currently-supported clinical operations. Does NOT exercise
 * Track-C features (adoption/twins/triplets) which are not implemented yet.
 */
import { usePedigreeStore } from '../state/usePedigreeStore.js';

const SEXES = ['male', 'female', 'unknown'];
const STATE_FIELDS = ['affected', 'carrier', 'deceased'];

// The store the model drives: the app store by default. Tests can point it
// at another store with the same action API (e.g. the frozen v1 store used
// to produce v1 sessions for the migration tests).
let storeHook = usePedigreeStore;
export function setFuzzStore(hook) { storeHook = hook || usePedigreeStore; }
const store = () => storeHook.getState();
const graph = () => store().pedigreeData;

function individuals() { return (graph().individuals || []); }
function unions() { return (graph().unions || []); }
function nonProband() { return individuals().filter(i => i.relation !== 'proband'); }

/** Reset to the clean baseline pedigree (proband + parents + grandparents). */
export function resetModel() {
  store().resetPedigree();
}

/**
 * Weighted operation menu. Weighted toward the expansions the clinician
 * reported as breaking layout: upstream child adds, collateral branches,
 * distant unions, repeated sibling adds.
 */
const OP_WEIGHTS = [
  ['addSibling', 5],
  ['addSiblingCat', 3],
  ['addSpouse', 3],
  ['addChild', 4],
  ['addChildToUnion', 3],
  ['addParents', 4],
  ['addRelativeBranch', 5],
  ['addGreatGrandparents', 3],
  ['addGen4', 3],
  ['createUnion', 4],
  ['makeSiblings', 2],
  ['deleteIndividual', 2],
  ['setSex', 1],
  ['setState', 1],
];

function weightedPickOp(rng) {
  const total = OP_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = rng.int(total);
  for (const [op, w] of OP_WEIGHTS) { if (r < w) return op; r -= w; }
  return 'addSibling';
}

/**
 * Choose one concrete operation given the current graph. Returns an op
 * descriptor { op, ...args } with resolved ids, or null if it can't build a
 * valid one this round (caller retries).
 */
export function chooseOp(rng) {
  const op = weightedPickOp(rng);
  const inds = individuals();
  const ids = inds.map(i => i.id);
  if (ids.length === 0) return null;
  const anyId = () => rng.pick(ids);
  const sex = () => rng.pick(SEXES);

  switch (op) {
    case 'addSibling': return { op, target: anyId(), sex: sex() };
    case 'addSiblingCat': return { op, category: rng.pick(['male', 'female', 'unknown', 'pregnancyLoss', 'deceased']) };
    case 'addSpouse': return { op, target: anyId(), sex: sex() };
    case 'addChild': return { op, target: anyId(), sex: sex() };
    case 'addChildToUnion': {
      const us = unions();
      if (us.length === 0) return null;
      return { op, unionId: rng.pick(us).id, sex: sex() };
    }
    case 'addParents': return { op, target: anyId() };
    case 'addRelativeBranch': return {
      op,
      side: rng.pick(['maternalRelatives', 'paternalRelatives']),
      type: rng.pick(['uncles', 'aunts']),
      male: rng.int(4), female: rng.int(4),
    };
    case 'addGreatGrandparents': return { op, gpKey: rng.pick(['mat_gf', 'mat_gm', 'pat_gf', 'pat_gm']) };
    case 'addGen4': return { op, targetPath: 'proband', male: rng.int(4), female: rng.int(3) };
    case 'createUnion': {
      if (ids.length < 2) return null;
      const a = anyId(); let b = anyId(); let tries = 0;
      while (b === a && tries++ < 5) b = anyId();
      if (a === b) return null;
      return { op, a, b };
    }
    case 'makeSiblings': {
      if (ids.length < 2) return null;
      const a = anyId(); let b = anyId(); let tries = 0;
      while (b === a && tries++ < 5) b = anyId();
      if (a === b) return null;
      return { op, a, b };
    }
    case 'deleteIndividual': {
      const cands = nonProband();
      if (cands.length === 0) return null;
      return { op, id: rng.pick(cands).id };
    }
    case 'setSex': return { op, id: anyId(), sex: rng.pick(['male', 'female']) };
    case 'setState': return { op, id: anyId(), field: rng.pick(STATE_FIELDS) };
    default: return null;
  }
}

/**
 * Apply a recorded op through the real store. Never throws — a store action
 * that no-ops/rolls back is a valid outcome (that IS the app's behaviour).
 */
/** Exceptions thrown while applying ops (reset with resetOpErrors). */
export const opErrors = [];
export function resetOpErrors() { opErrors.length = 0; }

export function applyOp(o) {
  const s = store();
  try {
    switch (o.op) {
      case 'addSibling': s.addSiblingTo(o.target, o.sex); break;
      case 'addSiblingCat': s.addSiblingOfCategory(o.category); break;
      case 'addSpouse': s.addSpouseTo(o.target, o.sex); break;
      case 'addChild': s.addChildTo(o.target, o.sex); break;
      case 'addChildToUnion': s.addChildToUnion(o.unionId, o.sex); break;
      case 'addParents': s.addParentsTo(o.target); break;
      case 'addRelativeBranch': {
        const wd = s.wizardData;
        const arr = wd[o.side][o.type];
        const newIdx = arr.length;
        s.updateRelativeCount(o.side, o.type, newIdx + 1);
        if (o.male) store().updateRelativeChildren(o.side, o.type, newIdx, 'male', o.male);
        if (o.female) store().updateRelativeChildren(o.side, o.type, newIdx, 'female', o.female);
        break;
      }
      case 'addGreatGrandparents': s.toggleGreatGrandparents(o.gpKey, true); break;
      case 'addGen4': {
        const wd = s.wizardData;
        const newIdx = wd.gen4.length;
        s.addGen4(o.targetPath);
        if (o.male) store().updateGen4(newIdx, 'male', o.male);
        if (o.female) store().updateGen4(newIdx, 'female', o.female);
        break;
      }
      case 'createUnion': s.createUnionBetween(o.a, o.b); break;
      case 'makeSiblings': s.addCustomConsanguinity(o.a, o.b); break;
      case 'deleteIndividual': s.deleteIndividual(o.id); break;
      case 'setSex': s.updateIndividual(o.id, { sex: o.sex }); break;
      case 'setState': s.updateIndividual(o.id, { [o.field]: true }); break;
      default: break;
    }
  } catch (err) {
    // a broken op is data for the report, never a crash — but it is counted
    // (opErrors), so an exception inside the store cannot pass as a no-op
    opErrors.push({ op: o, message: String(err && err.message) });
  }
}

/** Current built pedigree ({individuals,unions,pcrs,nodes,edges}) after ops. */
export function snapshot() {
  return graph();
}
