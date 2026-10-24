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
 *   parentFlip     mother/father left-right order changed; classified as
 *                  "grandparent union edit" when the edit created, removed or
 *                  re-partnered a union with one of the parents' parents in
 *                  it, or changed a parent's own parent union (e.g. a union
 *                  between two grandparents can force the grandparent couples,
 *                  and so the parents, to trade sides); otherwise "without" —
 *                  a flip the edit gave no structural reason for. Adding a
 *                  child (an uncle, an aunt) to the grandparents does NOT count.
 *                  Flips "without" are further split by the store's layout
 *                  report: "for readability" when every edit-local layout
 *                  had more readability problems (line crossings, off-centre
 *                  couples) than the fresh layout used instead
 *                  (layoutInfo.level 'full'); otherwise "unexplained".
 *   movedFraction  share of people whose position (x or y) changed by more than 2 px
 *   neighbourGapChanged  share of row neighbours (two people side by side on
 *                  a row, both drawn before and after) whose distance changed
 *                  by more than 2 px — local rearrangement; a block that
 *                  slides as a whole changes only the gaps at its edges
 *   meanShiftPx    mean |Δx| (raw) and aligned on the proband
 *   readability    after every edit, the drawing the store shows vs a fresh
 *                  PCL layout of the same graph: off-centre couples, line
 *                  crossings, long partner lines (> 3 slots), side-hanging
 *                  sibship lines and partnership lines running over another
 *                  partner of one of the two (KI-8) (readabilityMetrics) —
 *                  the price, if any, that stability pays in readability
 * Targeted edits also report: people outside the affected block that moved
 * (> 2 px), family shape changes (couples and sibships entirely outside the
 * block whose internal spacing changed by > 2 px — moved as a unit or not),
 * sibling-order changes, and undo/redo and save/load fidelity.
 */
import { makeRng, seedToInt } from './prng.js';
import { resetModel, chooseOp, applyOp } from './fuzzModel.js';
import { readabilityMetrics } from './connectorReadability.js';
import { computePclLayout } from '../layout/pcl/index.js';

const MOVE_PX = 2;

const xMapOf = (S) => new Map(S().pedigreeData.nodes.map((n) => [n.id, n.x]));
// position = x and y: a row pushed down by a taller gap is movement too
const posMapOf = (S) => new Map(S().pedigreeData.nodes.map((n) => [n.id, [n.x, n.y]]));
const moveOf = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));

// the partners of a person's parent union
function parentsOf(graph, id) {
  const r = graph.parentChildRelationships.find((pcr) => pcr.children.includes(id));
  const u = r && graph.unions.find((x) => x.id === r.unionId);
  return u ? u.partners : [];
}

function compare(before, after, graphBefore = null, graphAfter = null) {
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
  let grandparentEdit = false;
  if (flip && graphBefore && graphAfter) {
    const key = (u) => `${u.id}:${u.partners.join('|')}`;
    const ub = new Set(graphBefore.unions.map(key)), ua = new Set(graphAfter.unions.map(key));
    const changed = [...graphBefore.unions.filter((u) => !ua.has(key(u))), ...graphAfter.unions.filter((u) => !ub.has(key(u)))];
    const gps = new Set(['mother', 'father'].flatMap((p) => [...parentsOf(graphBefore, p), ...parentsOf(graphAfter, p)]));
    grandparentEdit = changed.some((u) => u.partners.some((id) => gps.has(id)))
      || ['mother', 'father'].some((p) => parentsOf(graphBefore, p).join('|') !== parentsOf(graphAfter, p).join('|'));
  }
  // row neighbours (by previous position) whose distance changed
  const byRow = new Map();
  for (const id of common) {
    const y = before.get(id)[1];
    if (!byRow.has(y)) byRow.set(y, []);
    byRow.get(y).push(id);
  }
  let pairs = 0, gapChanged = 0;
  for (const ids of byRow.values()) {
    ids.sort((p, q) => before.get(p)[0] - before.get(q)[0]);
    for (let k = 1; k < ids.length; k++) {
      const a = ids[k - 1], b = ids[k];
      pairs++;
      const sameRow = after.get(a)[1] === after.get(b)[1];
      if (!sameRow || Math.abs((after.get(b)[0] - after.get(a)[0]) - (before.get(b)[0] - before.get(a)[0])) > MOVE_PX) gapChanged++;
    }
  }
  return { n: common.length, moved, movedY, sumRaw, sumAligned, maxRaw, flip, hasParents, grandparentEdit, pairs, gapChanged };
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
    parentFlipsGrandparentEdit: rows.filter((r) => r.flip && r.grandparentEdit).length,
    parentFlipsNoGrandparentEdit: rows.filter((r) => r.flip && !r.grandparentEdit).length,
    parentFlipsForReadability: rows.filter((r) => r.flip && !r.grandparentEdit && r.freshForReadability).length,
    parentFlipsUnexplained: rows.filter((r) => r.flip && !r.grandparentEdit && !r.freshForReadability).length,
    movedFraction: +(rows.reduce((a, r) => a + r.moved, 0) / people).toFixed(4),
    neighbourGapChanged: +(rows.reduce((a, r) => a + r.gapChanged, 0) / (rows.reduce((a, r) => a + r.pairs, 0) || 1)).toFixed(4),
    movedVerticallyFraction: +(rows.reduce((a, r) => a + r.movedY, 0) / people).toFixed(4),
    editsWithNoMovement: +(rows.filter((r) => r.moved === 0).length / t).toFixed(4),
    meanShiftRawPx: +(rows.reduce((a, r) => a + r.sumRaw, 0) / people).toFixed(1),
    meanShiftAlignedPx: +(rows.reduce((a, r) => a + r.sumAligned, 0) / people).toFixed(1),
    readability: (() => {
      const sum = (k, w) => rows.reduce((a, r) => a + ((r[w] && r[w][k]) || 0), 0);
      const worse = (k) => rows.filter((r) => r.drawn && r.fresh && r.drawn[k] > r.fresh[k]).length;
      return {
        offCenterDrawn: sum('offCenter', 'drawn'), offCenterFresh: sum('offCenter', 'fresh'),
        crossingsDrawn: sum('bridgedCrossings', 'drawn'), crossingsFresh: sum('bridgedCrossings', 'fresh'),
        longUnionsDrawn: sum('longUnions', 'drawn'), longUnionsFresh: sum('longUnions', 'fresh'),
        sideHangDrawn: sum('sideHang', 'drawn'), sideHangFresh: sum('sideHang', 'fresh'),
        lineOverOwnPartnerDrawn: sum('lineOverOwnPartner', 'drawn'), lineOverOwnPartnerFresh: sum('lineOverOwnPartner', 'fresh'),
        editsMoreOffCenterThanFresh: worse('offCenter'), editsMoreCrossingsThanFresh: worse('bridgedCrossings'),
        editsMoreLongUnionsThanFresh: worse('longUnions'),
      };
    })(),
    layoutLevels: rows.reduce((acc, r) => { if (r.level) acc[r.level] = (acc[r.level] || 0) + 1; return acc; }, {}),
    maxShiftPx: Math.round(Math.max(0, ...rows.map((r) => r.maxRaw))),
    p90MaxShiftPx: (() => { const m = rows.map((r) => r.maxRaw).sort((a, b) => a - b); return Math.round(m[Math.floor(m.length * 0.9)] || 0); })(),
  };
}

function crossGenerationPair(graph, a, b) {
  const gen = (id) => (graph.individuals.find((i) => i.id === id) || {}).generation;
  return typeof gen(a) === 'number' && typeof gen(b) === 'number' && gen(a) !== gen(b);
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
      // The KI-2 ceilings were measured (2026-10-18) while partners from
      // different generations were refused. Such a pair still counts as
      // refused here, so the population — and its ratchet — stay the same
      // edits (the RNG advances exactly as before). Cross-generation
      // partnerships (2026-10-24) are covered by the fuzz gates and
      // crossGeneration.test.js.
      if (op.op === 'createUnion' && crossGenerationPair(docBefore.graph, op.a, op.b)) continue;
      applyOp(op);
      if (S().doc === docBefore) continue; // refused / no-op: nothing to measure
      const next = posMapOf(S);
      const info = S().layoutInfo || {};
      const drawn = readabilityMetrics(S().pedigreeData);
      const fresh = readabilityMetrics({ ...S().doc.graph, ...computePclLayout(S().doc.graph) });
      rows.push({ ...compare(prev, next, docBefore.graph, S().doc.graph), level: info.level || 'n/a', drawn, fresh, freshForReadability: info.level === 'full' && /fewer readability problems/.test(info.reason || '') });
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

/**
 * Affected block of an edit = the edited person, the new people, the edited
 * person's sibship (siblings may have to make room), the edited person's
 * partners, and the parents of every new child (their sibship grew, so they
 * must re-centre over it). Everyone else is "outside the block".
 */
function affectedBlock(S, targetId, newIds) {
  const g = S().doc.graph;
  const block = new Set([targetId, ...newIds]);
  const bio = g.parentChildRelationships.find((r) => r.children.includes(targetId));
  if (bio) bio.children.forEach((c) => block.add(c));
  for (const u of g.unions) if (u.partners.includes(targetId)) u.partners.forEach((p) => block.add(p));
  const isNew = new Set(newIds);
  for (const r of g.parentChildRelationships) {
    if (!r.children.some((c) => isNew.has(c))) continue;
    (g.unions.find((u) => u.id === r.unionId)?.partners || []).forEach((p) => block.add(p));
  }
  return block;
}

// couples and sibships entirely outside the block whose internal spacing changed
function familyShapeChanges(S, before, after, block) {
  const g = S().doc.graph;
  const groups = [
    ...g.unions.map((u) => u.partners),
    ...g.parentChildRelationships.map((r) => r.children).filter((c) => c.length > 1),
  ].filter((ids) => ids.every((id) => before.has(id) && after.has(id) && !block.has(id)));
  return groups.filter((ids) => ids.some((id) => Math.abs((after.get(id)[0] - after.get(ids[0])[0]) - (before.get(id)[0] - before.get(ids[0])[0])) > MOVE_PX)).length
    + '/' + groups.length;
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
        familyShapeChanges: familyShapeChanges(S, before, after, block),
        parentFlip: c.flip, siblingOrderChanges,
        undoExact, undoMaxPx: Math.round(undoMaxPx * 10) / 10, redoExact,
        saveLoadMaxPx: Math.round(loadMaxPx * 10) / 10,
      });
    }
  }
  return results;
}

// ── large families: the frozen KI-3 stress pedigrees ──

const FIXTURE_EDITS = [
  ['child to proband', (ops, d) => ops.addChildToPerson(d, 'proband', { sex: 'female' })],
  ['sibling to proband', (ops, d) => ops.addSibling(d, 'proband', { sex: 'male' })],
  ['spouse to mother', (ops, d) => ops.addPartner(d, 'mother', { sex: 'male' })],
];

/**
 * PCL level: each fixture's fresh layout is the previous drawing; one edit is
 * applied and drawn edit-locally (computeStableLayout). Reports the level
 * used, movement, readability (drawn vs a fresh layout of the edited graph),
 * violations and time. Dependencies are passed in so the harness itself does
 * not load the 400-person fixtures unless asked.
 */
export function runFixtureEdits({ fixtures, ops, computePclLayout, computeStableLayout, displayParentage, checkAllInvariants, checkConnectorReadability, createDocument }) {
  const keys = ['offCenter', 'bridgedCrossings', 'longUnions', 'sideHang', 'lineOverOwnPartner'];
  const pick = (m) => Object.fromEntries(keys.map((k) => [k, m[k]]));
  const out = [];
  for (const [id, graph] of fixtures) {
    const doc = createDocument(graph);
    let t0 = performance.now();
    const prev = computePclLayout(doc.graph);
    const freshMs = Math.round(performance.now() - t0);
    t0 = performance.now();
    const frozen = computeStableLayout(doc.graph, { prevNodes: prev.nodes, frozen: true });
    const reopenMs = Math.round(performance.now() - t0);
    const reopenExact = frozen.nodes.every((n, k) => n.x === prev.nodes[k].x && n.y === prev.nodes[k].y);
    for (const [edit, run] of FIXTURE_EDITS) {
      const r = run(ops, doc);
      if (!r.ok) { out.push({ fixture: id, edit, skipped: true }); continue; }
      t0 = performance.now();
      const L = computeStableLayout(r.doc.graph, { prevGraph: doc.graph, prevNodes: prev.nodes, prevEdges: prev.edges });
      const ms = Math.round(performance.now() - t0);
      const drawn = { ...displayParentage(r.doc.graph).graph, ...L };
      const fresh = { ...displayParentage(r.doc.graph).graph, ...computePclLayout(r.doc.graph) };
      const px = new Map(prev.nodes.map((n) => [n.id, n]));
      const shifts = L.nodes.filter((n) => px.has(n.id)).map((n) => Math.max(Math.abs(n.x - px.get(n.id).x), Math.abs(n.y - px.get(n.id).y)));
      out.push({
        fixture: id, edit, people: prev.nodes.length, level: L.meta.stability.level,
        moved: shifts.filter((d) => d > MOVE_PX).length, maxShiftPx: Math.round(Math.max(0, ...shifts)),
        meanShiftPx: +(shifts.reduce((a, b) => a + b, 0) / (shifts.length || 1)).toFixed(1),
        drawn: pick(readabilityMetrics(drawn)), fresh: pick(readabilityMetrics(fresh)),
        invariants: checkAllInvariants(drawn).length, readabilityViolations: checkConnectorReadability(drawn).length,
        ms, freshMs, reopenMs, reopenExact,
      });
    }
  }
  return out;
}

