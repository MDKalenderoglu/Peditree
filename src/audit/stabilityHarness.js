/**
 * stabilityHarness.js — edit-stability measurement (KI-2). One method, used
 * for the "before" baseline and every "after" run, so numbers are comparable.
 *
 * Everything is measured on what the clinician sees: the store's derived
 * `pedigreeData.nodes` before and after each edit (raw coordinates; the
 * proband-aligned variant is reported too).
 *
 * Populations (fixed, deterministic):
 *   random-200x12  200 sequences × 12 random editor operations (seeds stab0…)
 *   ki2-40x10      40 sequences × 10 operations (seeds ki2-0…), the KI-2 ratchet set
 *   targeted       clinical scenarios × deterministic edits (add spouse,
 *                  child, sibling) with an explicit affected block
 *
 * Metrics per edit transition (people present before and after):
 *   parentFlip     mother/father left-right order changed
 *   movedFraction  share of people whose position (x or y) changed by more than 2 px
 *   meanShiftPx    mean |Δx| (raw) and aligned on the proband
 * Targeted edits also report: people outside the affected block that moved
 * (> 2 px), sibling-order changes, and undo/redo and save/load fidelity.
 */
import { makeRng, seedToInt } from './prng.js';
import { resetModel, chooseOp, applyOp } from './fuzzModel.js';

const MOVE_PX = 2;

const xMapOf = (S) => new Map(S().pedigreeData.nodes.map((n) => [n.id, n.x]));
// position = x and y: a row pushed down by a taller gap is movement too
const posMapOf = (S) => new Map(S().pedigreeData.nodes.map((n) => [n.id, [n.x, n.y]]));
const moveOf = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));

function compare(before, after) {
  const common = [...before.keys()].filter((id) => after.has(id));
  const anchor = common.includes('proband') ? 'proband' : common[0];
  const dx = anchor ? after.get(anchor)[0] - before.get(anchor)[0] : 0;
  let moved = 0, movedY = 0, sumRaw = 0, sumAligned = 0, maxRaw = 0;
  for (const id of common) {
    const a = before.get(id), b = after.get(id);
    const raw = moveOf(a, b);
    if (raw > MOVE_PX) moved++;
    if (Math.abs(a[1] - b[1]) > MOVE_PX) movedY++;
    sumRaw += raw; maxRaw = Math.max(maxRaw, raw);
    sumAligned += Math.abs(b[0] - a[0] - dx);
  }
  const X = (m, id) => m.get(id)[0];
  const flip = ['mother', 'father'].every((p) => before.has(p) && after.has(p))
    && Math.sign(X(after, 'mother') - X(after, 'father')) !== Math.sign(X(before, 'mother') - X(before, 'father'));
  const hasParents = ['mother', 'father'].every((p) => before.has(p) && after.has(p));
  return { n: common.length, moved, movedY, sumRaw, sumAligned, maxRaw, flip, hasParents };
}

function summarize(rows) {
  const t = rows.length || 1;
  const parentPairs = rows.filter((r) => r.hasParents).length;
  const flips = rows.filter((r) => r.flip).length;
  const people = rows.reduce((a, r) => a + r.n, 0) || 1;
  return {
    transitions: rows.length,
    parentFlips: flips,
    parentFlipTransitions: parentPairs,
    parentFlipRate: +(flips / (parentPairs || 1)).toFixed(4),
    movedFraction: +(rows.reduce((a, r) => a + r.moved, 0) / people).toFixed(4),
    movedVerticallyFraction: +(rows.reduce((a, r) => a + r.movedY, 0) / people).toFixed(4),
    editsWithNoMovement: +(rows.filter((r) => r.moved === 0).length / t).toFixed(4),
    meanShiftRawPx: +(rows.reduce((a, r) => a + r.sumRaw, 0) / people).toFixed(1),
    meanShiftAlignedPx: +(rows.reduce((a, r) => a + r.sumAligned, 0) / people).toFixed(1),
    p90MaxShiftPx: (() => { const m = rows.map((r) => r.maxRaw).sort((a, b) => a - b); return Math.round(m[Math.floor(m.length * 0.9)] || 0); })(),
  };
}

export function runRandomPopulation(store, { prefix, sequences, ops }) {
  const S = () => store.getState();
  const rows = [];
  for (let c = 0; c < sequences; c++) {
    const rng = makeRng(seedToInt(`${prefix}${c}`));
    resetModel();
    let prev = posMapOf(S);
    for (let s = 0; s < ops; s++) {
      let op = null;
      for (let r = 0; r < 6 && !op; r++) op = chooseOp(rng);
      if (!op) continue;
      const docBefore = S().doc;
      applyOp(op);
      if (S().doc === docBefore) continue; // refused / no-op: nothing to measure
      const next = posMapOf(S);
      rows.push(compare(prev, next));
      prev = next;
    }
  }
  return summarize(rows);
}

// ── targeted clinical scenarios ──

export const SCENARIOS = {
  starter: (S) => { S().resetPedigree(); },
  sibshipWithRelatives: (S) => {
    S().resetPedigree();
    S().updateSiblingCount('male', 2); S().updateSiblingCount('female', 1);
    S().updateRelativeCount('maternalRelatives', 'uncles', 1);
    S().updateRelativeChildren('maternalRelatives', 'uncles', 0, 'female', 2);
    S().updateRelativeCount('paternalRelatives', 'aunts', 1);
    S().updateRelativeChildren('paternalRelatives', 'aunts', 0, 'male', 2);
    S().addSpouseTo('proband', 'female');
  },
  consanguineousParents: (S) => {
    S().resetPedigree();
    S().updateSiblingCount('male', 1); S().updateSiblingCount('female', 1);
    S().updateWizardData('parents', 'consanguineous', true);
    S().updateWizardData('parents', 'consanguinityDegree', 'first_cousin');
    S().updateWizardData('parents', 'consanguinityPath', 'mothers_paternal_is_fathers_paternal');
    S().updateRelativeCount('maternalRelatives', 'aunts', 1);
    S().updateRelativeChildren('maternalRelatives', 'aunts', 0, 'male', 2);
    S().updateRelativeCount('paternalRelatives', 'uncles', 1);
    S().updateRelativeChildren('paternalRelatives', 'uncles', 0, 'female', 1);
  },
};

/** Deterministic edits applicable to any scenario: [name, (S) => targetPersonId] */
const EDITS = [
  ['spouse+child to first male sibling', (S) => {
    const t = S().wizardData.siblings.male[0]?.id;
    if (!t) return null;
    S().addSpouseTo(t, 'female');
    const u = S().lastCreated.unionId;
    if (u) S().addChildToUnion(u, 'male');
    return t;
  }],
  ['child to the proband', (S) => { S().addChildTo('proband', 'female'); return 'proband'; }],
  ['sibling to the proband', (S) => { S().addSiblingTo('proband', 'male'); return 'proband'; }],
  ['spouse to the first female sibling', (S) => {
    const t = S().wizardData.siblings.female[0]?.id;
    if (!t) return null;
    S().addSpouseTo(t, 'male');
    return t;
  }],
];

function affectedBlock(S, targetId, newIds) {
  const g = S().doc.graph;
  const block = new Set([targetId, ...newIds]);
  const bio = g.parentChildRelationships.find((r) => r.children.includes(targetId));
  if (bio) bio.children.forEach((c) => block.add(c)); // the target's sibship row
  for (const u of g.unions) if (u.partners.includes(targetId)) u.partners.forEach((p) => block.add(p));
  return block;
}

function siblingOrders(S) {
  const x = xMapOf(S);
  const out = new Map();
  for (const r of S().doc.graph.parentChildRelationships) {
    out.set(r.unionId, r.children.filter((c) => x.has(c)).sort((a, b) => x.get(a) - x.get(b)));
  }
  return out;
}

export function runTargeted(store) {
  const S = () => store.getState();
  const results = [];
  for (const [scenario, build] of Object.entries(SCENARIOS)) {
    for (const [edit, run] of EDITS) {
      build(S);
      const before = posMapOf(S);
      const beforeIds = new Set(before.keys());
      const ordersBefore = siblingOrders(S);
      const docBefore = S().doc;
      const historyBefore = S()._history.length;
      const beforeNodes = JSON.stringify(S().pedigreeData.nodes.map((n) => [n.id, n.x, n.y]).sort());
      const target = run(S);
      if (!target || S().doc === docBefore) { results.push({ scenario, edit, skipped: true }); continue; }
      const after = posMapOf(S);
      const newIds = [...after.keys()].filter((id) => !beforeIds.has(id));
      const block = affectedBlock(S, target, newIds);
      const outside = [...before.keys()].filter((id) => after.has(id) && !block.has(id));
      const movedOutside = outside.filter((id) => moveOf(after.get(id), before.get(id)) > MOVE_PX);
      const ordersAfter = siblingOrders(S);
      let siblingOrderChanges = 0;
      for (const [uid, ord] of ordersBefore) {
        const now = (ordersAfter.get(uid) || []).filter((c) => ord.includes(c));
        if (now.join('|') !== ord.filter((c) => now.includes(c)).join('|')) siblingOrderChanges++;
      }
      const c = compare(before, after);
      // undo / redo fidelity: undo every step the edit added, compare with before
      const snap = () => JSON.stringify(S().pedigreeData.nodes.map((n) => [n.id, n.x, n.y]).sort());
      const afterNodes = snap();
      const steps = S()._history.length - historyBefore;
      for (let k = 0; k < steps; k++) S().undo();
      const undone = posMapOf(S);
      const undoExact = snap() === beforeNodes;
      const undoMaxPx = Math.max(0, ...[...before.keys()].map((id) => (undone.has(id) ? moveOf(undone.get(id), before.get(id)) : Infinity)));
      for (let k = 0; k < steps; k++) S().redo();
      const redoExact = snap() === afterNodes;
      // save / load fidelity
      const file = S().exportProjectFile();
      S().resetPedigree();
      S().openProjectFile(file);
      const loaded = posMapOf(S);
      const loadMaxPx = Math.max(0, ...[...after.keys()].map((id) => (loaded.has(id) ? moveOf(loaded.get(id), after.get(id)) : Infinity)));
      results.push({
        scenario, edit, target,
        people: c.n, outside: outside.length, movedOutside: movedOutside.length,
        movedOutsideIds: movedOutside.slice(0, 12),
        parentFlip: c.flip, siblingOrderChanges,
        undoExact, undoMaxPx: Math.round(undoMaxPx * 10) / 10, redoExact,
        saveLoadMaxPx: Math.round(loadMaxPx * 10) / 10,
      });
    }
  }
  return results;
}
