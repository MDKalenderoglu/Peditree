import { create } from 'zustand';
import { buildPedigreeFromWizard } from '../builder/pedigreeBuilderFromWizard';
import { validatePedigree } from '../utils/validators';
import { computePedigreeLayout } from '../utils/pedigreeLayout';
import { auditPedigreeGraph } from '../utils/graphIntegrity';
import { auditLayoutIntegrity } from '../utils/layoutIntegrity';
import { saveSession, loadSession, clearSession } from '../utils/persistence';
import { moveChildInOrder } from '../utils/childOrdering';

/**
 * Tag each issue with which auditor produced it, so callers (export gating,
 * the UI banner) can tell a semantic graph problem from a geometry/rendering
 * problem apart without re-deriving it from the `code` string.
 */
function tagIssues(issues, source) {
  return issues.map(issue => ({ ...issue, source }));
}

/**
 * Pure, read-only check for whether `targetId` can be safely deleted via
 * direct graph edits, and (if so) the full transitive cascade of graphEdits
 * entries + individual IDs that removal must take with it.
 *
 * Only individuals that originated from a direct graph edit (an addSpouse's
 * `spouseId`, or an addChild's `childId`) can be deleted at all in v0.3a.1.
 * This app's wizard-driven core individuals (mother, father, siblings,
 * proband, collateral relatives, ...) are derived from wizard *counts*, not
 * freestanding graph nodes — there is no safe single-node "delete" for them
 * without the wizard/graph dependency inversion CLAUDE.md already flags as
 * future work. Attempting to delete one would either silently resurrect on
 * the next rebuild (the wizard count that produced it is unchanged) or
 * require mutating wizard counts as a side effect of "delete", which is a
 * confusing, easy-to-get-wrong UX this hotfix deliberately does not attempt.
 *
 * Exported for direct unit testing.
 *
 * @returns {{ ok: boolean, reason?: string, cascadeIndividualIds?: string[], cascadeUnionIds?: string[], cascadeEditIndices?: number[] }}
 */
export function computeDeletionPlan(wizardData, pedigreeData, targetId) {
  const graphEdits = wizardData.graphEdits || [];
  const targetInd = (pedigreeData.individuals || []).find(i => i.id === targetId);

  if (!targetInd) {
    return { ok: false, reason: 'Birey grafikte bulunamadı.' };
  }

  const isDirectEdit = graphEdits.some(e =>
    (e.type === 'addSpouse' && e.spouseId === targetId) ||
    (e.type === 'addChild' && e.childId === targetId)
  );
  if (!isDirectEdit) {
    return {
      ok: false,
      reason: 'Bu birey sihirbaz (wizard) verisinden türetildi — doğrudan silinemez. ' +
        'Bunun yerine ilgili sihirbaz alanını (kardeş sayısı, akraba sayısı vb.) güncelleyin.',
    };
  }

  if (targetInd.proband) {
    return {
      ok: false,
      reason: 'Proband silinemez. Önce başka bir bireyi proband olarak atayın, ardından tekrar deneyin.',
    };
  }

  // Transitive closure over graphEdits: collect every edit that structurally
  // depends on targetId (or on any individual/union already collected).
  const removedIndividualIds = new Set([targetId]);
  const removedUnionIds = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const edit of graphEdits) {
      if (edit.type === 'addSpouse') {
        if (removedIndividualIds.has(edit.targetId) || removedIndividualIds.has(edit.spouseId)) {
          if (!removedIndividualIds.has(edit.spouseId)) { removedIndividualIds.add(edit.spouseId); changed = true; }
          if (!removedUnionIds.has(edit.unionId)) { removedUnionIds.add(edit.unionId); changed = true; }
        }
      } else if (edit.type === 'addChild') {
        if (removedUnionIds.has(edit.unionId) && !removedIndividualIds.has(edit.childId)) {
          removedIndividualIds.add(edit.childId);
          changed = true;
        }
      } else if (edit.type === 'linkPartners') {
        if (removedIndividualIds.has(edit.person1) || removedIndividualIds.has(edit.person2)) {
          if (!removedUnionIds.has(edit.unionId)) { removedUnionIds.add(edit.unionId); changed = true; }
        }
      }
    }
  }

  const cascadeContainsProband = (pedigreeData.individuals || []).some(
    i => i.proband && removedIndividualIds.has(i.id)
  );
  if (cascadeContainsProband) {
    return {
      ok: false,
      reason: 'Bu silme işlemi proband bireyi de kapsayacaktı — önce proband atamasını değiştirin.',
    };
  }

  const cascadeEditIndices = [];
  graphEdits.forEach((edit, idx) => {
    const touchesRemoved =
      (edit.type === 'addSpouse' && (removedIndividualIds.has(edit.spouseId) || removedIndividualIds.has(edit.targetId))) ||
      (edit.type === 'addChild' && (removedIndividualIds.has(edit.childId) || removedUnionIds.has(edit.unionId))) ||
      (edit.type === 'linkPartners' && (removedIndividualIds.has(edit.person1) || removedIndividualIds.has(edit.person2) || removedUnionIds.has(edit.unionId)));
    if (touchesRemoved) cascadeEditIndices.push(idx);
  });

  return {
    ok: true,
    cascadeIndividualIds: [...removedIndividualIds],
    cascadeUnionIds: [...removedUnionIds],
    cascadeEditIndices,
  };
}

/**
 * Pure, read-only check for whether two individuals can safely become
 * partners via a new union (v0.3a.1 multi-select "make partners" action).
 * Exported for direct unit testing.
 *
 * @returns {{ ok: boolean, reason?: string, requiresConsanguineousFlag?: boolean }}
 */
export function computeUnionCreationPlan(pedigreeData, id1, id2) {
  const individuals = pedigreeData.individuals || [];
  const unions = pedigreeData.unions || [];
  const pcrs = pedigreeData.parentChildRelationships || [];

  if (!id1 || !id2 || id1 === id2) {
    return { ok: false, reason: 'Aynı birey kendisiyle birleştirilemez.' };
  }
  const ind1 = individuals.find(i => i.id === id1);
  const ind2 = individuals.find(i => i.id === id2);
  if (!ind1 || !ind2) {
    return { ok: false, reason: 'Bireylerden biri grafikte bulunamadı.' };
  }
  if ((ind1.pregnancyLoss || ind1.stillbirth) || (ind2.pregnancyLoss || ind2.stillbirth)) {
    return { ok: false, reason: 'Düşük/ölü doğum kaydı bir bireyle eş yapılamaz.' };
  }

  const alreadyPartnered = unions.some(u => u.partners.includes(id1) && u.partners.includes(id2));
  if (alreadyPartnered) {
    return { ok: false, reason: 'Bu iki birey zaten aynı birlikte (union).' };
  }

  const childToUnion = {};
  pcrs.forEach(rel => rel.children.forEach(cid => { childToUnion[cid] = rel.unionId; }));
  const sameParentUnion = childToUnion[id1] && childToUnion[id1] === childToUnion[id2];
  if (sameParentUnion) {
    return {
      ok: false,
      reason: 'Bu iki birey aynı ebeveyn birliğinin çocukları (kardeş) — akraba evliliği olarak ' +
        'işaretlenmeden eş yapılamaz.',
      requiresConsanguineousFlag: true,
    };
  }

  return { ok: true };
}

/**
 * Pure, read-only check for whether two individuals can safely become
 * siblings via `addCustomConsanguinity` (v0.3a.1 "make siblings" action —
 * this store action name predates this hotfix and is legacy naming, but
 * the operation it performs is a genuine biological parent-child link, not
 * a consanguinity-flag shortcut; see the docblock on `addCustomConsanguinity`
 * below and `pedigreeBuilderFromWizard.js` stage 10a).
 *
 * Mirrors the exact cases `pedigreeBuilderFromWizard.js` stage 10a handles:
 *   - already siblings (same parent union)      → ok, no-op
 *   - exactly one has an existing parent union   → ok, attaches the other
 *   - neither has a parent union                 → ok, fabricates one shared
 *                                                    parent union (two new
 *                                                    "Ortak Baba/Anne" nodes)
 *   - BOTH already have DIFFERENT parent unions   → NOT SAFE. The builder
 *     cannot merge two existing parent unions without breaking the
 *     single-parent-union invariant (`childToUnionMap`), so stage 10a
 *     silently does nothing in this case today. Silently doing nothing is
 *     itself a hazard (the clinician clicks "Kardeş Yap," sees no error,
 *     and may believe it worked) — this plan surfaces that case as
 *     `ok: false` so the UI can disable/explain it instead of silently
 *     no-op'ing.
 *
 * Exported for direct unit testing.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
export function computeSiblingCreationPlan(pedigreeData, id1, id2) {
  const individuals = pedigreeData.individuals || [];
  const unions = pedigreeData.unions || [];
  const pcrs = pedigreeData.parentChildRelationships || [];

  if (!id1 || !id2 || id1 === id2) {
    return { ok: false, reason: 'Aynı birey kendisiyle kardeş yapılamaz.' };
  }
  const ind1 = individuals.find(i => i.id === id1);
  const ind2 = individuals.find(i => i.id === id2);
  if (!ind1 || !ind2) {
    return { ok: false, reason: 'Bireylerden biri grafikte bulunamadı.' };
  }
  if (ind1.pregnancyLoss || ind1.stillbirth || ind2.pregnancyLoss || ind2.stillbirth) {
    return { ok: false, reason: 'Düşük/ölü doğum kaydı bir bireyle kardeş bağı kurulamaz.' };
  }
  if (ind1.proband || ind2.proband) {
    return { ok: false, reason: 'Proband için bu yoldan kardeş bağı kurulamaz.' };
  }
  if (typeof ind1.generation === 'number' && typeof ind2.generation === 'number' && ind1.generation !== ind2.generation) {
    // Matches the same safeguard WizardPanel.jsx's CustomConsanguinityAdder
    // already applies when picking a sibling pair from the wizard — two
    // individuals at different generations cannot be full/half siblings,
    // and attaching them under one shared parent union produces a
    // SIBLING_GENERATION_INCONSISTENT / SIBLING_Y_MISMATCH graph-integrity
    // error. Block before the builder ever gets there.
    return {
      ok: false,
      reason: `Bu iki birey farklı jenerasyonlarda (${ind1.generation} ve ${ind2.generation}) — kardeş yapılamaz.`,
    };
  }

  const alreadyPartnered = unions.some(u => u.partners.includes(id1) && u.partners.includes(id2));
  if (alreadyPartnered) {
    return { ok: false, reason: 'Bu iki birey zaten eş (union) — aynı anda kardeş yapılamaz.' };
  }

  const childToUnion = {};
  pcrs.forEach(rel => rel.children.forEach(cid => { childToUnion[cid] = rel.unionId; }));
  const p1Union = childToUnion[id1];
  const p2Union = childToUnion[id2];

  if (p1Union && p2Union && p1Union === p2Union) {
    return { ok: true, action: 'noop', reason: 'Bu iki birey zaten kardeş.' };
  }
  if (p1Union && p2Union && p1Union !== p2Union) {
    // The unsafe case: the builder cannot merge two distinct existing
    // parent unions without violating childToUnionMap's single-parent
    // invariant — it would silently no-op today. Block explicitly instead.
    return {
      ok: false,
      reason: 'Her iki bireyin de farklı ebeveyn birlikleri zaten var — bu ikisi doğrudan kardeş ' +
        'yapılamaz (mevcut iki ayrı ebeveyn birliği güvenli şekilde birleştirilemez). ' +
        'Bu işlem devre dışı bırakıldı; graf modeli bu birleştirmeyi desteklemeden etkinleştirilmeyecek.',
    };
  }

  // Exactly one has a parent union (attach the other), or neither has one
  // (fabricate a shared parent union) — both are the safe, already-handled
  // paths in pedigreeBuilderFromWizard.js stage 10a.
  return { ok: true, action: (p1Union || p2Union) ? 'attach' : 'fabricate' };
}

const initialState = {
  proband: { sex: 'male', age: '' },
  siblings: {
    male: [],
    female: [],
    unknown: [],
    pregnancyLoss: 0,
    deceased: 0,
  },
  parents: {
    motherExists: true,
    motherAge: '',
    fatherExists: true,
    fatherAge: '',
    consanguineous: false,
    consanguinityDegree: 'yok',
    consanguinityPath: 'unknown',
    relationshipStatus: 'together',
    motherOtherUnions: [],
    fatherOtherUnions: [],
  },
  maternalRelatives: { uncles: [], aunts: [] },
  paternalRelatives: { uncles: [], aunts: [] },
  // Grandparent-level: great-uncles/great-aunts (siblings of grandparents)
  maternalGPRelatives: { uncles: [], aunts: [] },  // siblings of mat_gf/mat_gm
  paternalGPRelatives: { uncles: [], aunts: [] },  // siblings of pat_gf/pat_gm
  // Great-grandparents: explicit parent pairs for each grandparent
  greatGrandparents: {
    mat_gf: false, // whether to show parents of maternal grandfather
    mat_gm: false,
    pat_gf: false,
    pat_gm: false,
  },
  gen4: [],
  // Custom consanguinity links: arbitrary sibling/shared-ancestor relationships
  // Each entry: { id, type: 'siblings', person1: indId, person2: indId }
  // "siblings" means person1 and person2 share parents — builder creates a
  // shared parent union and attaches both as children.
  customConsanguinity: [],
  // Union-keyed child ordering: { [unionId]: string[] }
  // Each value is an ordered array of builder-level child IDs.
  // Currently only 'U_PARENTS' is populated from wizard interactions.
  childOrders: {},
  // Direct graph edits — additions made through the right-panel editor.
  // These are applied as a post-pass in the builder after all wizard-driven
  // nodes are created. Each edit is a persistent instruction:
  //   { type: 'addSpouse', targetId, spouseId, unionId, spouseSex }
  //   { type: 'addChild', unionId, childId, sex }
  graphEdits: [],
  // Which individual currently holds the clinical `proband: true` flag.
  // 'proband' (the wizard's own fixed slot) by default; null = no proband
  // assigned (a valid mid-edit state). See pedigreeBuilderFromWizard.js
  // stage 10d, which is the single place that actually applies this.
  probandId: 'proband',
  // Manual per-individual edits made via the right-panel IndividualEditor
  // (displayLabel, affected, carrier, deceased, notes, condition,
  // ageAtDeath, causeOfDeath) — persisted here (keyed by individual id) so
  // they survive both a full wizard rebuild and a page reload. Previously
  // these edits lived only in the in-memory pedigreeData snapshot and were
  // carried forward by mergeManualEdits() below; that still happens for the
  // current session, but manualEdits is what makes them reload-safe.
  manualEdits: {},
};

// ────────────────────────────────────────────────────
// Migration: siblingOrder → childOrders['U_PARENTS']
// ────────────────────────────────────────────────────
// The old wizard state stores proband ordering as UI-slot tokens in
// `siblings.siblingOrder` (e.g. ['m_0', 'proband', 'f_0']).
// This migrates them to builder-level IDs in childOrders['U_PARENTS']
// (e.g. ['sib_m_0', 'proband', 'sib_f_0']).
//
// Called during generateDerivedData so the builder always receives
// childOrders in the canonical format.

const TOKEN_TO_PREFIX = {
  proband: 'proband',
  m: 'sib_m_', f: 'sib_f_', u: 'sib_u_',
  loss: 'sib_loss_', still: 'sib_still_',
};

function siblingTokenToBuilderId(token) {
  if (token === 'proband') return 'proband';
  const sep = token.indexOf('_');
  if (sep === -1) return null;
  const prefix = token.substring(0, sep);
  const suffix = token.substring(sep + 1);
  const mapped = TOKEN_TO_PREFIX[prefix];
  return mapped ? mapped + suffix : null;
}

function migrateSiblingOrder(wizardData) {
  const sibOrder = wizardData.siblings?.siblingOrder;
  const childOrders = wizardData.childOrders || {};

  // Only migrate if siblingOrder exists and childOrders['U_PARENTS'] does not
  if (Array.isArray(sibOrder) && sibOrder.length > 0 && !childOrders['U_PARENTS']) {
    const builderIds = sibOrder.map(siblingTokenToBuilderId).filter(Boolean);
    if (builderIds.length > 0) {
      childOrders['U_PARENTS'] = builderIds;
    }
  }

  return childOrders;
}

/**
 * Build graph → merge manual edits → compute layout → validate
 */
function generateDerivedData(wizardData, currentPedigreeData) {
  // Ensure childOrders is populated (migration + initialization)
  if (!wizardData.childOrders) {
    wizardData.childOrders = {};
  }
  // Run migration from legacy siblingOrder if needed
  wizardData.childOrders = migrateSiblingOrder(wizardData);

  const newGraph = buildPedigreeFromWizard(wizardData);

  // ── Graph integrity audit (detect-only, never mutates) ──
  const graphIssues = tagIssues(auditPedigreeGraph(newGraph), 'graph');
  console.log("GRAPH:", newGraph);
  console.log("INTEGRITY ISSUE COUNT:", graphIssues.length);
  console.table(graphIssues);

  const errors = graphIssues.filter(i => i.severity === 'error');
  if (errors.length > 0) {
    console.error('Pedigree graph integrity failed', errors);
  }

  // Preserve manual edits by matching deterministic IDs.
  // Two sources, preferred in this order:
  //   1. currentPedigreeData — the in-memory state from earlier this session
  //      (authoritative if present; reflects the very latest edit).
  //   2. wizardData.manualEdits — the persisted overlay, used on first load
  //      after a page reload (before currentPedigreeData has been populated
  //      by anything) and as a fallback if a given individual isn't in the
  //      in-memory snapshot for any reason.
  // `proband` is deliberately never read from either source here — it is
  // graph-derived, assigned once by the builder's stage 10d from
  // wizardData.probandId, which is the single source of truth for it.
  const manualEditsOverlay = wizardData.manualEdits || {};
  const mergedIndividuals = newGraph.individuals.map(newInd => {
    const existing = (currentPedigreeData.individuals || []).find(i => i.id === newInd.id);
    const persisted = manualEditsOverlay[newInd.id];
    const source = existing || persisted;
    if (source) {
      return {
        ...newInd,
        displayLabel: source.displayLabel || newInd.displayLabel,
        affected: source.affected || false,
        carrier: source.carrier || false,
        // Only preserve deceased if NOT a stillbirth (builder sets that)
        deceased: newInd.stillbirth ? newInd.deceased : (source.deceased || false),
        notes: source.notes || '',
        condition: source.condition || '',
        ageAtDeath: source.ageAtDeath || '',
        causeOfDeath: source.causeOfDeath || '',
        // conditions[] is additive (v0.3a) — pass through whichever source
        // has it; `[] || x` still yields `[]` since arrays are truthy, so an
        // explicit "cleared to empty" state from `source` is preserved and
        // not silently overwritten by a stale `newInd` value.
        conditions: source.conditions || newInd.conditions || [],
      };
    }
    return newInd;
  });
  newGraph.individuals = mergedIndividuals;

  const layout = computePedigreeLayout(newGraph);
  const combined = { ...newGraph, ...layout };
  const warnings = validatePedigree(combined);

  // ── Layout integrity audit (detect-only, never mutates) ──
  // Geometry problems (missing/duplicate positions, dangling edges) are a
  // distinct failure class from semantic graph problems above — merged into
  // the same integrityIssues list (tagged `source: 'layout'`) so they reach
  // the existing warning banner and export-gating logic without a separate
  // UI surface.
  const layoutIssues = tagIssues(auditLayoutIntegrity(layout, newGraph), 'layout');
  const layoutErrors = layoutIssues.filter(i => i.severity === 'error');
  if (layoutErrors.length > 0) {
    console.error('Pedigree layout integrity failed', layoutErrors);
  }

  const integrityIssues = [...graphIssues, ...layoutIssues];

  return {
    pedigreeData: combined,
    warnings,
    integrityIssues,
    lastGraphDebug: {
      individualCount: newGraph.individuals.length,
      unionCount: newGraph.unions.length,
      relationshipCount: newGraph.parentChildRelationships.length,
      issues: integrityIssues,
    },
  };
}

const EMPTY_GRAPH = { individuals: [], unions: [], parentChildRelationships: [], nodes: [], edges: [] };

function cloneInitialState() {
  return JSON.parse(JSON.stringify(initialState));
}

/**
 * Merge a persisted wizardData object over a fresh default state, so a save
 * from an older schema version (missing a field this version added, e.g.
 * `probandId` or `manualEdits`) still produces a structurally complete
 * wizardData rather than a builder crash on a missing key.
 */
function mergeWithDefaults(loaded) {
  const base = cloneInitialState();
  if (!loaded || typeof loaded !== 'object') return base;

  const nestedObjectKeys = [
    'proband', 'siblings', 'parents', 'maternalRelatives', 'paternalRelatives',
    'maternalGPRelatives', 'paternalGPRelatives', 'greatGrandparents',
    'childOrders', 'manualEdits', 'consanguineousUnions',
  ];
  const arrayKeys = ['customConsanguinity', 'gen4', 'graphEdits'];

  const merged = { ...base, ...loaded };
  nestedObjectKeys.forEach(key => {
    merged[key] = { ...(base[key] || {}), ...(loaded[key] || {}) };
  });
  arrayKeys.forEach(key => {
    merged[key] = Array.isArray(loaded[key]) ? loaded[key] : base[key];
  });
  merged.probandId = (typeof loaded.probandId === 'string' || loaded.probandId === null)
    ? loaded.probandId
    : base.probandId;

  return merged;
}

/**
 * Build the store's initial wizardData + derived state. Never throws:
 * a corrupt/incompatible saved session, or one that somehow fails to build,
 * is logged and discarded in favor of a clean start — this is what
 * satisfies "invalid localStorage content must not crash the app."
 */
function bootstrapState() {
  let wizardData = cloneInitialState();

  try {
    const session = loadSession(); // already validates shape; returns null if invalid/absent
    if (session) {
      wizardData = mergeWithDefaults(session.wizardData);
    }
  } catch (err) {
    console.warn('[usePedigreeStore] Failed to read saved pedigree session — starting clean.', err);
    wizardData = cloneInitialState();
  }

  try {
    const derived = generateDerivedData(wizardData, EMPTY_GRAPH);
    return { wizardData, ...derived };
  } catch (err) {
    console.error(
      '[usePedigreeStore] Restored pedigree data failed to build — clearing saved session and starting clean.',
      err
    );
    clearSession();
    const clean = cloneInitialState();
    return { wizardData: clean, ...generateDerivedData(clean, EMPTY_GRAPH) };
  }
}

// Bounded undo stack size (v0.3a.1). Chosen per task spec — generous enough
// for a real editing session without unbounded memory growth from the deep
// JSON clones already taken of wizardData on every mutating action.
const MAX_UNDO_HISTORY = 50;

export const usePedigreeStore = create((zSet, get) => {
  /**
   * Tracked setter used by every wizardData-mutating action below. Records
   * the *previous* wizardData onto a bounded undo stack whenever an action
   * actually changes it, so `undo()` can restore it later. Selection state
   * (`selectedId`/`selectedId2`) lives in this same store for convenient
   * access from every panel, but its own setters (`selectIndividual`,
   * `clearSelection`) intentionally use the raw `zSet`, bypassing this
   * tracked wrapper — selection is pure UI state and is deliberately
   * excluded from undo per the v0.3a.1 spec ("undo does not need to cover
   * pure UI selection changes").
   *
   * `resetPedigree` and `undo` itself intentionally bypass this and call
   * the raw `zSet` directly — reset clears the undo stack outright rather
   * than pushing itself as an undoable step, and undo must not push its own
   * restoration back onto the stack it is popping from.
   */
  const set = (updater) => {
    const prevWizardData = get().wizardData;
    zSet(updater);
    const nextWizardData = get().wizardData;
    if (nextWizardData !== prevWizardData) {
      zSet((state) => ({
        _history: [...(state._history || []), prevWizardData].slice(-MAX_UNDO_HISTORY),
      }));
    }
  };

  return {
  ...bootstrapState(),
  _history: [],
  // Selection (v0.3a.1) — which individual(s) are currently highlighted.
  // At most two at a time (primary + secondary via Cmd/Ctrl-click).
  selectedId: null,
  selectedId2: null,

  // ────────────────────────────────────────────────────
  // Selection (not undoable — see `set` docblock above)
  // ────────────────────────────────────────────────────

  /**
   * Select an individual. Plain click (`additive: false`) replaces the
   * whole selection with just `id`. Cmd/Ctrl-click (`additive: true`)
   * toggles a second slot: clicking the current primary or secondary again
   * clears that slot; clicking a third individual while two are already
   * selected replaces the secondary (never grows past two, per spec).
   */
  selectIndividual: (id, opts = {}) => zSet((state) => {
    const additive = !!opts.additive;
    if (!additive) {
      return { selectedId: id, selectedId2: null };
    }
    if (id === state.selectedId) return {};
    if (id === state.selectedId2) return { selectedId2: null };
    if (!state.selectedId) return { selectedId: id, selectedId2: null };
    return { selectedId2: id };
  }),

  /** Clear both selection slots. */
  clearSelection: () => zSet(() => ({ selectedId: null, selectedId2: null })),

  updateWizardData: (section, field, value) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (section === 'proband') wd.proband[field] = value;
    else if (section === 'parents') wd.parents[field] = value;
    else if (section === 'siblings') wd.siblings[field] = value;
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  updateSiblingCount: (type, count) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    const arr = wd.siblings[type];
    while (arr.length < count) arr.push({ id: `_${Math.random()}`, age: '' });
    arr.length = count;
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  updateSiblingAge: (type, idx, age) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    wd.siblings[type][idx].age = age;
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  addOtherUnion: (parentType) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    const key = parentType === 'mother' ? 'motherOtherUnions' : 'fatherOtherUnions';
    wd.parents[key].push({ id: `_${Math.random()}`, status: 'together', children: { male: 0, female: 0, unknown: 0 } });
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  updateOtherUnion: (parentType, idx, field, value) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    const key = parentType === 'mother' ? 'motherOtherUnions' : 'fatherOtherUnions';
    if (field === 'status') wd.parents[key][idx].status = value;
    else wd.parents[key][idx].children[field] = value;
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  removeOtherUnion: (parentType, idx) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    const key = parentType === 'mother' ? 'motherOtherUnions' : 'fatherOtherUnions';
    wd.parents[key].splice(idx, 1);
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  updateRelativeCount: (side, relativeType, count) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    const arr = wd[side][relativeType];
    while (arr.length < count) arr.push({ id: `_${Math.random()}`, children: { male: 0, female: 0, unknown: 0 } });
    arr.length = count;
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  updateRelativeChildren: (side, relativeType, index, sex, count) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    const rel = wd[side][relativeType][index];

    if (!rel.children) {
      rel.children = {
        male: 0,
        female: 0,
        unknown: 0,
        pregnancyLoss: 0,
        stillbirth: 0,
      };
    }

    rel.children = {
      male: rel.children.male || 0,
      female: rel.children.female || 0,
      unknown: rel.children.unknown || 0,
      pregnancyLoss: rel.children.pregnancyLoss || 0,
      stillbirth: rel.children.stillbirth || 0,
    };

    rel.children[sex] = count;
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  /**
   * "Make siblings" — despite the legacy `customConsanguinity` naming (this
   * predates the v0.3a.1 hotfix and originally existed to support arbitrary
   * cousin-consanguinity paths beyond the wizard template), this does NOT
   * set a consanguinity flag on a union. It creates a genuine biological
   * parent-child structure: `pedigreeBuilderFromWizard.js` stage 10a either
   * (a) attaches both individuals as children of one already-existing
   * parent union, or (b) fabricates two new parent individuals ("Ortak
   * Baba"/"Ortak Anne") and a new union, then attaches both as children of
   * it — real `addChild`/`addUnion` calls, respecting `childToUnionMap`'s
   * single-parent-per-child invariant exactly like every other sibling
   * relationship in this app. It is not a shortcut or a "pseudo-relation."
   *
   * The one case this mechanism cannot safely handle — both individuals
   * already have DIFFERENT existing parent unions — is deliberately a
   * silent no-op at the builder level (merging two parent unions would
   * violate the single-parent invariant). Callers MUST check
   * `computeSiblingCreationPlan(pedigreeData, person1, person2)` first and
   * only call this action when it returns `ok: true`; the UI
   * (`IndividualEditor.jsx`'s `TwoPersonActions`) disables "Kardeş Yap"
   * with an explanation whenever the plan is not ok, rather than letting
   * the user hit the silent no-op.
   */
  addCustomConsanguinity: (person1, person2) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.customConsanguinity) wd.customConsanguinity = [];
    wd.customConsanguinity.push({
      id: `_cc_${Math.random()}`,
      type: 'siblings',
      person1,
      person2,
    });
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  removeCustomConsanguinity: (idx) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.customConsanguinity) return {};
    wd.customConsanguinity.splice(idx, 1);
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  markUnionConsanguineous: (unionId, value) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.consanguineousUnions) wd.consanguineousUnions = {};
    wd.consanguineousUnions[unionId] = value;
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  toggleGreatGrandparents: (gpKey, value) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.greatGrandparents) wd.greatGrandparents = {};
    wd.greatGrandparents[gpKey] = value;
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  addGen4: (targetPath) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    wd.gen4.push({ id: `_${Math.random()}`, targetPath, male: 0, female: 0, unknown: 0 });
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  updateGen4: (idx, field, value) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    wd.gen4[idx][field] = value;
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  removeGen4: (idx) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    wd.gen4.splice(idx, 1);
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  // ────────────────────────────────────────────────────
  // Child ordering actions (union-keyed)
  // ────────────────────────────────────────────────────

  /**
   * Get the explicit child ordering for a union, or undefined if none set.
   * Returns builder-level child IDs (e.g. ['proband', 'sib_m_0', 'sib_f_0']).
   */
  getChildOrder: (unionId) => {
    const state = get();
    const orders = state.wizardData.childOrders || {};
    return orders[unionId] || undefined;
  },

  /**
   * Set an explicit child ordering for a union.
   * `order` is an array of builder-level child IDs.
   * Triggers a full rebuild.
   */
  setChildOrder: (unionId, order) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.childOrders) wd.childOrders = {};
    wd.childOrders[unionId] = [...order];
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  /**
   * Clear the explicit child ordering for a union (revert to default).
   * Triggers a full rebuild.
   */
  clearChildOrder: (unionId) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (wd.childOrders) {
      delete wd.childOrders[unionId];
    }
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  // ────────────────────────────────────────────────────
  // Direct graph editing (right-panel additions)
  // ────────────────────────────────────────────────────

  /**
   * Add a spouse to an existing individual.
   * Creates a new individual + union in the graph.
   */
  addSpouseTo: (targetId, spouseSex = 'unknown') => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.graphEdits) wd.graphEdits = [];
    const idx = wd.graphEdits.length;
    const spouseId = `de_sp_${idx}`;
    const unionId = `U_DE_${idx}`;
    wd.graphEdits.push({
      type: 'addSpouse',
      targetId,
      spouseId,
      unionId,
      spouseSex,
    });
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  /**
   * Add a child to an existing union (identified by unionId).
   * If the individual has no union yet, creates spouse + union first.
   */
  addChildToUnion: (unionId, sex = 'unknown') => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.graphEdits) wd.graphEdits = [];
    const idx = wd.graphEdits.length;
    const childId = `de_ch_${idx}`;
    wd.graphEdits.push({
      type: 'addChild',
      unionId,
      childId,
      sex,
    });
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  /**
   * Add a child to an individual — auto-creates spouse+union if needed.
   */
  addChildTo: (targetId, childSex = 'unknown') => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.graphEdits) wd.graphEdits = [];

    // Check if target already has a union (from graph edits or wizard)
    const graph = state.pedigreeData;
    const existingUnion = graph.unions?.find(u => u.partners.includes(targetId));

    if (existingUnion) {
      // Add child to existing union
      const idx = wd.graphEdits.length;
      wd.graphEdits.push({
        type: 'addChild',
        unionId: existingUnion.id,
        childId: `de_ch_${idx}`,
        sex: childSex,
      });
    } else {
      // Need to create spouse + union first, then add child
      const idx = wd.graphEdits.length;
      const targetInd = graph.individuals?.find(i => i.id === targetId);
      const spouseSex = targetInd?.sex === 'male' ? 'female' : targetInd?.sex === 'female' ? 'male' : 'unknown';
      const spouseId = `de_sp_${idx}`;
      const unionId = `U_DE_${idx}`;
      wd.graphEdits.push({
        type: 'addSpouse',
        targetId,
        spouseId,
        unionId,
        spouseSex,
      });
      wd.graphEdits.push({
        type: 'addChild',
        unionId,
        childId: `de_ch_${idx + 1}`,
        sex: childSex,
      });
    }
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  /**
   * Remove a direct graph edit by index.
   */
  removeGraphEdit: (idx) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.graphEdits) return {};
    wd.graphEdits.splice(idx, 1);
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  // Update individual properties (from right-panel editor) — recalculate layout
  updateIndividual: (id, updates) => set((state) => {
    // Proband is a graph-derived, single-holder flag (see
    // pedigreeBuilderFromWizard.js stage 10d) — route any change to it
    // through a full rebuild via wizardData.probandId instead of the
    // generic direct-mutation path below, so the single-proband invariant
    // is enforced by construction rather than by remembering to clear
    // every other individual by hand here.
    if (Object.prototype.hasOwnProperty.call(updates, 'proband')) {
      const wd = JSON.parse(JSON.stringify(state.wizardData));
      if (updates.proband) {
        wd.probandId = id;
      } else if (wd.probandId === id) {
        wd.probandId = null;
      }
      const rest = { ...updates };
      delete rest.proband;
      let currentPedigreeData = state.pedigreeData;
      if (Object.keys(rest).length > 0) {
        if (!wd.manualEdits) wd.manualEdits = {};
        wd.manualEdits[id] = { ...(wd.manualEdits[id] || {}), ...rest };
        // Also fold `rest` into the snapshot generateDerivedData merges
        // from, so a combined call (proband + another field in one
        // `updates` object) doesn't have the field silently lost to merge
        // ordering — `existing` takes priority over `wd.manualEdits` below.
        const individuals = state.pedigreeData.individuals.map(ind =>
          ind.id === id ? { ...ind, ...rest } : ind
        );
        currentPedigreeData = { ...state.pedigreeData, individuals };
      }
      const derived = generateDerivedData(wd, currentPedigreeData);
      return { wizardData: wd, ...derived };
    }

    // Persist into wizardData.manualEdits so this survives a reload, in
    // addition to updating the live pedigreeData directly below for
    // immediate feedback without a full graph rebuild.
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.manualEdits) wd.manualEdits = {};
    wd.manualEdits[id] = { ...(wd.manualEdits[id] || {}), ...updates };

    const individuals = state.pedigreeData.individuals.map(ind =>
      ind.id === id ? { ...ind, ...updates } : ind
    );
    const newGraph = { ...state.pedigreeData, individuals };
    // Re-layout since display could change
    const layout = computePedigreeLayout(newGraph);
    const combined = { ...newGraph, ...layout };
    const warnings = validatePedigree(combined);
    const integrityIssues = [
      ...tagIssues(auditPedigreeGraph(combined), 'graph'),
      ...tagIssues(auditLayoutIntegrity(layout, newGraph), 'layout'),
    ];
    return { wizardData: wd, pedigreeData: combined, warnings, integrityIssues };
  }),

  // ────────────────────────────────────────────────────
  // Proband (single source of truth: wizardData.probandId)
  // ────────────────────────────────────────────────────

  /** Mark `id` as the proband. Clears the flag from whoever held it before. */
  setProband: (id) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    wd.probandId = id;
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  /** Explicit "no proband yet" state — a valid mid-edit state. */
  clearProband: () => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    wd.probandId = null;
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  // ────────────────────────────────────────────────────
  // Session lifecycle
  // ────────────────────────────────────────────────────

  /**
   * "New pedigree" — clears the saved session and resets to a clean wizard
   * state. Uses the raw `zSet`, not the tracked `set`, so reset is a hard
   * clean-slate action: it clears the undo stack outright (`_history: []`)
   * rather than becoming itself an undoable step. Also clears selection
   * (both slots) so no stale selected-individual reference survives into
   * the fresh pedigree.
   */
  resetPedigree: () => zSet(() => {
    clearSession();
    const clean = cloneInitialState();
    return {
      wizardData: clean,
      _history: [],
      selectedId: null,
      selectedId2: null,
      ...generateDerivedData(clean, EMPTY_GRAPH),
    };
  }),

  // ────────────────────────────────────────────────────
  // Undo
  // ────────────────────────────────────────────────────

  /**
   * Revert exactly one graph-changing step by restoring the previous
   * wizardData snapshot from the bounded undo stack (see `set` above).
   * Never throws: if the restored snapshot somehow fails to rebuild (it
   * shouldn't, since every snapshot on the stack once built successfully),
   * the undo is aborted rather than leaving the store in a broken state —
   * mirroring `bootstrapState()`'s own defensive rebuild handling.
   */
  undo: () => zSet((state) => {
    const history = state._history || [];
    if (history.length === 0) return {};
    const prev = history[history.length - 1];
    const nextHistory = history.slice(0, -1);
    let derived;
    try {
      derived = generateDerivedData(JSON.parse(JSON.stringify(prev)), EMPTY_GRAPH);
    } catch (err) {
      console.error('[usePedigreeStore] undo: restored wizardData failed to rebuild — aborting undo.', err);
      return {};
    }
    return { wizardData: prev, _history: nextHistory, ...derived };
  }),

  // ────────────────────────────────────────────────────
  // Selected-individual deletion (v0.3a.1)
  // ────────────────────────────────────────────────────

  /**
   * Delete a direct-graph-edit individual and its dependent cascade (see
   * `computeDeletionPlan`). No-op (does not mutate state) if the plan is
   * not `ok` — callers should check `computeDeletionPlan` first to decide
   * whether to show a plain delete button or a blocked explanation, but
   * this action re-checks internally regardless so it is never unsafe to
   * call directly.
   */
  deleteIndividual: (id) => set((state) => {
    const plan = computeDeletionPlan(state.wizardData, state.pedigreeData, id);
    if (!plan.ok) {
      console.warn('[usePedigreeStore] deleteIndividual blocked:', plan.reason);
      return {};
    }

    const wd = JSON.parse(JSON.stringify(state.wizardData));
    const removeEditIdx = new Set(plan.cascadeEditIndices);
    wd.graphEdits = (wd.graphEdits || []).filter((_, idx) => !removeEditIdx.has(idx));

    // Clean up per-individual/union overlays so no dangling references
    // survive the deletion (displayLabel/notes/conditions, child ordering,
    // custom-sibling links, consanguinity flags for a now-gone union).
    if (wd.manualEdits) {
      plan.cascadeIndividualIds.forEach(rid => { delete wd.manualEdits[rid]; });
    }
    if (wd.childOrders) {
      (plan.cascadeUnionIds || []).forEach(uid => { delete wd.childOrders[uid]; });
    }
    if (Array.isArray(wd.customConsanguinity)) {
      wd.customConsanguinity = wd.customConsanguinity.filter(
        link => !plan.cascadeIndividualIds.includes(link.person1) && !plan.cascadeIndividualIds.includes(link.person2)
      );
    }
    if (wd.consanguineousUnions) {
      (plan.cascadeUnionIds || []).forEach(uid => { delete wd.consanguineousUnions[uid]; });
    }

    const derived = generateDerivedData(wd, state.pedigreeData);

    // Move selection to a safe fallback: clear any slot that pointed at a
    // removed individual (no attempt to guess a "next" node — an explicit
    // clear is the safer default the v0.3a.1 spec allows).
    const clearedSelectedId = plan.cascadeIndividualIds.includes(state.selectedId) ? null : state.selectedId;
    const clearedSelectedId2 = plan.cascadeIndividualIds.includes(state.selectedId2) ? null : state.selectedId2;

    return {
      wizardData: wd,
      ...derived,
      selectedId: clearedSelectedId,
      selectedId2: clearedSelectedId2,
    };
  }),

  // ────────────────────────────────────────────────────
  // Multi-select "make partners" (v0.3a.1)
  // ────────────────────────────────────────────────────

  /**
   * Link two already-existing individuals as partners via a new union (see
   * `computeUnionCreationPlan`). Pass `{ markConsanguineous: true }` to
   * proceed even when the plan flags `requiresConsanguineousFlag` (the two
   * individuals are full/half siblings) — this still never fabricates a
   * shared ancestor; it only permits a union the semantic validator would
   * otherwise warn about, exactly as the wizard's own consanguinity flow does.
   */
  createUnionBetween: (id1, id2, opts = {}) => set((state) => {
    const plan = computeUnionCreationPlan(state.pedigreeData, id1, id2);
    const proceedAnyway = plan.requiresConsanguineousFlag && opts.markConsanguineous;
    if (!plan.ok && !proceedAnyway) {
      console.warn('[usePedigreeStore] createUnionBetween blocked:', plan.reason);
      return {};
    }

    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.graphEdits) wd.graphEdits = [];
    const idx = wd.graphEdits.length;
    const unionId = `U_DE_LINK_${idx}`;
    wd.graphEdits.push({ type: 'linkPartners', person1: id1, person2: id2, unionId, status: 'together' });

    if (opts.markConsanguineous) {
      if (!wd.consanguineousUnions) wd.consanguineousUnions = {};
      wd.consanguineousUnions[unionId] = true;
    }

    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  // ────────────────────────────────────────────────────
  // Birth-order reorder (v0.3a.1)
  // ────────────────────────────────────────────────────

  /**
   * Move a child left or right within its own sibling group (union). Never
   * moves a child into a different union — see `moveChildInOrder` in
   * childOrdering.js. Falls back to the currently-rendered child order
   * (post default-ordering) as the reorder baseline when no explicit
   * `childOrders` entry exists yet, so "move" always acts on what the user
   * actually sees.
   */
  reorderChild: (unionId, childId, direction) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.childOrders) wd.childOrders = {};
    const rel = (state.pedigreeData.parentChildRelationships || []).find(r => r.unionId === unionId);
    const currentOrder = wd.childOrders[unionId] || (rel ? [...rel.children] : []);
    const nextOrder = moveChildInOrder(currentOrder, childId, direction);
    wd.childOrders[unionId] = nextOrder;
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),
  };
});

// ── Autosave ──
// Persist wizardData (the single source the whole graph is deterministically
// derived from — see generateDerivedData) after every change. Debounced
// lightly so rapid-fire stepper clicks don't hit localStorage on every tick.
let saveTimer = null;
usePedigreeStore.subscribe((state, prevState) => {
  if (state.wizardData === prevState.wizardData) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSession(state.wizardData), 300);
});
