import { create } from 'zustand';
import { validatePedigree } from '../utils/validators';
// v0.4: the app now renders via the new clinical layout engine
// (pedigreeLayoutV2), which packs each union's children into a local,
// non-overlapping bus — fixing the "single global horizontal bus" collapse.
// The old engine (pedigreeLayout.js) is retained for its direct unit tests
// until Phase 5 retires it. Same { nodes, edges } contract, so the renderer
// and audits are unchanged.
import { computePedigreeLayoutV2 as computePedigreeLayout } from '../utils/pedigreeLayoutV2';
import { auditPedigreeGraph } from '../utils/graphIntegrity';
import { auditLayoutIntegrity } from '../utils/layoutIntegrity';
import { saveSession, loadSession, clearSession } from '../utils/persistence';
import {
  deriveV1Graph, cloneInitialState, mergeWithDefaults, EMPTY_GRAPH,
} from '../graph/v1pipeline';
import { moveChildInOrder } from '../utils/childOrdering';
import { siblingsInCategory } from '../utils/siblingCounts';
import { assessRelationshipMutation } from '../utils/relationshipSafety';

/**
 * Tag each issue with which auditor produced it, so callers (export gating,
 * the UI banner) can tell a semantic graph problem from a geometry/rendering
 * problem apart without re-deriving it from the `code` string.
 */
function tagIssues(issues, source) {
  return issues.map(issue => ({ ...issue, source }));
}

/**
 * v0.5 Faz 2a (DM-2): allocate the numeric suffix for a new direct-edit id.
 * Ids used to be `…_${graphEdits.length}`, so removing an earlier edit made
 * the next edit reuse a live id — and the builder silently drops duplicate
 * ids, so the new spouse/child never appeared. The allocator is monotonic:
 * it never returns a number already used by any edit or custom link, and it
 * records the high-water mark in `wizardData.editSeq`.
 */
const EDIT_ID_FIELDS = ['spouseId', 'childId', 'unionId', 'parent1Id', 'parent2Id'];
function allocEditIndex(wd) {
  let next = Math.max(wd.editSeq || 0, (wd.graphEdits || []).length);
  for (const e of wd.graphEdits || []) {
    for (const k of EDIT_ID_FIELDS) {
      const m = typeof e[k] === 'string' && e[k].match(/_(\d+)(?:_[12])?$/);
      if (m) next = Math.max(next, Number(m[1]) + 1);
    }
  }
  for (const link of wd.customConsanguinity || []) {
    if (Number.isInteger(link.seq)) next = Math.max(next, link.seq + 1);
  }
  wd.editSeq = next + 1;
  return next;
}

/**
 * Store-level feedback for an action that was refused. Returned from an
 * updater instead of `{}` so the reason reaches the UI (App.jsx shows it as
 * a dismissible notice) rather than only the developer console. wizardData
 * is unchanged, so nothing is pushed onto the undo stack.
 */
function blocked(reason) {
  return { actionNotice: { message: reason, at: Date.now() } };
}

const hasOwn = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key);

/** Wizard fields that set a specific person's age/sex (see updateWizardData). */
const WIZARD_FIELD_OVERRIDES = {
  'proband.age': { id: 'proband', field: 'age' },
  'proband.sex': { id: 'proband', field: 'sex' },
  'parents.motherAge': { id: 'mother', field: 'age' },
  'parents.fatherAge': { id: 'father', field: 'age' },
};

/**
 * Reason string if giving `personId` the sex `newSex` would contradict one of
 * their existing partnerships under the current union rule (kadın + erkek,
 * both sexes known), otherwise null. Placeholder partners ("belirtilmemiş
 * ebeveyn") are exempt — they stand in for an unknown person by design.
 */
function partnerSexConflict(pedigreeData, personId, newSex) {
  const individuals = pedigreeData.individuals || [];
  const byId = new Map(individuals.map(i => [i.id, i]));
  for (const u of pedigreeData.unions || []) {
    if (!u.partners.includes(personId)) continue;
    const partner = byId.get(u.partners.find(p => p !== personId));
    if (!partner || partner.placeholder) continue;
    if (newSex === 'unknown') {
      return 'Bu bireyin bir eşi/birlikteliği var; cinsiyet "bilinmiyor" olarak değiştirilemez.';
    }
    if (partner.sex === newSex) {
      return 'Bu cinsiyet değişikliği mevcut bir birlikteliği aynı cinsiyetli yapar; değişiklik uygulanmadı.';
    }
  }
  return null;
}

// Pure relationship feasibility checks live in src/graph/plans.js (shared
// with the graph operations); re-exported here for existing callers.
import {
  computeDeletionPlan, computeUnionCreationPlan, computeSiblingCreationPlan,
  computeAddParentsPlan, computeAddSiblingPlan,
} from '../graph/plans';
export {
  computeDeletionPlan, computeUnionCreationPlan, computeSiblingCreationPlan,
  computeAddParentsPlan, computeAddSiblingPlan,
};

/**
 * Build graph → merge manual edits → compute layout → validate
 */
function generateDerivedData(wizardData, currentPedigreeData) {
  // v1 replay pipeline (build → prune stale overlays → deletion overlay →
  // manual-edit merge), shared with the v1 → v2 migration so both always
  // produce exactly the same graph. Mutates wizardData (childOrders
  // migration, pruning) — callers pass their own clone.
  const { graph: newGraph, graphIssues: rawGraphIssues } = deriveV1Graph(wizardData, currentPedigreeData);
  const graphIssues = tagIssues(rawGraphIssues, 'graph');
  const errors = graphIssues.filter(i => i.severity === 'error');
  if (errors.length > 0) {
    console.error('Pedigree graph integrity failed', errors);
  }

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
   * actually changes it, so `undo()` can restore it later. Also clears the
   * redo stack (`_future`) — any new mutation after an undo invalidates
   * whatever was undone, per the v0.3a.2 spec ("any new graph mutation
   * after undo must clear redo stack"). Selection state
   * (`selectedId`/`selectedId2`) lives in this same store for convenient
   * access from every panel, but its own setters (`selectIndividual`,
   * `clearSelection`) intentionally use the raw `zSet`, bypassing this
   * tracked wrapper — selection is pure UI state and is deliberately
   * excluded from undo/redo per spec ("selection changes do not pollute
   * undo/redo").
   *
   * `resetPedigree`, `undo`, and `redo` all intentionally bypass this and
   * call the raw `zSet` directly — reset clears both stacks outright rather
   * than pushing itself as an undoable step, and undo/redo must not push
   * their own restoration back onto the stack they are popping from.
   */
  const set = (updater) => {
    const prevWizardData = get().wizardData;
    zSet(updater);
    const nextWizardData = get().wizardData;
    if (nextWizardData !== prevWizardData) {
      zSet((state) => ({
        _history: [...(state._history || []), prevWizardData].slice(-MAX_UNDO_HISTORY),
        _future: [],
        actionNotice: null,
      }));
    }
  };

  return {
  ...bootstrapState(),
  _history: [],
  _future: [],
  // Selection (v0.3a.1) — which individual(s) are currently highlighted.
  // At most two at a time (primary + secondary via Cmd/Ctrl-click).
  selectedId: null,
  selectedId2: null,
  // Dismissed warnings (v0.3a.2) — stable content-derived IDs, see warningIds.js.
  dismissedWarningIds: [],
  // v0.5 Faz 2a — why the last relationship action was refused (shown to the
  // clinician in Turkish instead of only logged to the console).
  actionNotice: null,
  // v0.3a.3 — which single left-panel accordion section is open (true
  // single-open accordion: opening one closes all others). Lives in the
  // store, not local component state, so it resets cleanly with the rest
  // of the UI state on resetPedigree().
  openSectionId: 'proband',

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

  /** Dismiss the "action refused" notice. Pure UI state, not undoable. */
  dismissActionNotice: () => zSet(() => ({ actionNotice: null })),

  /** Clear both selection slots. */
  clearSelection: () => zSet(() => ({ selectedId: null, selectedId2: null })),

  // ────────────────────────────────────────────────────
  // Dismissible warnings (v0.3a.2 — not undoable, see `set` docblock above)
  // ────────────────────────────────────────────────────

  /**
   * Dismiss a warning/integrity issue by its stable content-derived ID
   * (see warningIds.js). Dismissal is pure UI state, not a graph mutation —
   * it uses the raw `zSet`, bypassing undo/redo tracking, exactly like
   * selection. A dismissed warning stays hidden until the underlying
   * condition changes (its content-derived ID changes) or the pedigree is
   * reset.
   */
  dismissWarning: (warningId) => zSet((state) => ({
    dismissedWarningIds: [...new Set([...(state.dismissedWarningIds || []), warningId])],
  })),

  /**
   * v0.3a.3 — true single-open left-panel accordion. Setting a section
   * open implicitly closes every other section (there is only ever one
   * `openSectionId`). Passing the already-open id again closes it,
   * matching common accordion UX (click to close). Pure UI state, not
   * undoable — same category as selection/dismissed warnings.
   */
  setOpenSection: (sectionId) => zSet((state) => ({
    openSectionId: state.openSectionId === sectionId ? null : sectionId,
  })),

  updateWizardData: (section, field, value) => set((state) => {
    // v0.5 Faz 2a (DM-7): changing the proband's sex must not silently turn
    // an existing partnership into a same-sex or unknown-sex union.
    if (section === 'proband' && field === 'sex') {
      const conflict = partnerSexConflict(state.pedigreeData, 'proband', value);
      if (conflict) return blocked(conflict);
    }
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    // v0.5 Faz 2a (DM-3): the wizard field is the newest value for this
    // person — drop any older right-panel override of the same field.
    const overrideTarget = WIZARD_FIELD_OVERRIDES[`${section}.${field}`];
    if (overrideTarget && wd.manualEdits && wd.manualEdits[overrideTarget.id]) {
      delete wd.manualEdits[overrideTarget.id][overrideTarget.field];
    }
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

  /**
   * v0.4.1 — the left panel's Kardesler counts are now DERIVED from the
   * built graph (siblingCounts.js's deriveSiblingCounts), because a sibling
   * added via the selected-person editor's "add sibling" action
   * (addSiblingTo, below) writes to `wizardData.graphEdits`, a completely
   * separate mechanism from the `wizardData.siblings.*` arrays the old
   * length-based counters read — so those counters silently stayed at 0
   * for graphEdits-created siblings.
   *
   * Since the displayed count no longer corresponds 1:1 to any single
   * array's length, +/- must be exact single-unit operations rather than
   * "set array length to N": addSiblingOfCategory always adds exactly one
   * (append to the matching wizard array / bump the matching counter),
   * and removeLastSibling (further below, after deleteIndividual is
   * defined) always removes exactly one — from whichever mechanism
   * produced the birth-order-last individual in that category.
   */
  addSiblingOfCategory: (category) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (category === 'pregnancyLoss' || category === 'deceased') {
      wd.siblings[category] = (wd.siblings[category] || 0) + 1;
    } else {
      wd.siblings[category].push({ id: `_${Math.random()}`, age: '' });
    }
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  updateSiblingAge: (type, idx, age) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    wd.siblings[type][idx].age = age;
    const sibId = `sib_${{ male: 'm', female: 'f', unknown: 'u' }[type]}_${idx}`;
    if (wd.manualEdits && wd.manualEdits[sibId]) delete wd.manualEdits[sibId].age;
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
    // Re-validate independently of whatever the calling UI already
    // checked (same pattern as deleteIndividual/createUnionBetween) — this
    // action is never unsafe to call directly, regardless of caller.
    const plan = computeSiblingCreationPlan(state.pedigreeData, person1, person2);
    if (!plan.ok) {
      return blocked(plan.reason);
    }
    if (plan.action === 'noop') {
      return {}; // already siblings — nothing to do
    }

    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.customConsanguinity) wd.customConsanguinity = [];
    wd.customConsanguinity.push({
      id: `_cc_${Math.random()}`,
      // Stable number for the fabricated shared-parent ids (`cc_${seq}_f`);
      // positional numbering shifted them when an earlier link was removed.
      seq: allocEditIndex(wd),
      type: 'siblings',
      person1,
      person2,
    });

    // v0.3a.2 safety net: "make siblings" is the other action most likely
    // to silently produce a broken pedigree (see relationshipSafety.js) —
    // build the trial result before committing and roll back if it
    // introduces a new graph-integrity error.
    const derived = generateDerivedData(wd, state.pedigreeData);
    const assessment = assessRelationshipMutation(state.integrityIssues, derived.integrityIssues);
    if (assessment.blocked) {
      return blocked(assessment.reason);
    }
    return { wizardData: wd, ...derived };
  }),

  removeCustomConsanguinity: (idx) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.customConsanguinity) return {};
    wd.customConsanguinity.splice(idx, 1);
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  /**
   * Legacy (pre-v0.3a.2) boolean consanguinity flag. Kept for backward
   * compatibility with old saved sessions and existing callers — new UI
   * should use `setUnionRelationshipBackground` instead, which expresses
   * the full relationshipBackground model (see relationshipBackground.js).
   */
  markUnionConsanguineous: (unionId, value) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.consanguineousUnions) wd.consanguineousUnions = {};
    wd.consanguineousUnions[unionId] = value;
    const derived = generateDerivedData(wd, state.pedigreeData);
    return { wizardData: wd, ...derived };
  }),

  /**
   * v0.3a.2 — set a union's full relationshipBackground (not_asked /
   * no_consanguinity_reported / consanguinity_reported /
   * same_village_or_same_origin / unknown). See relationshipBackground.js
   * and pedigreeBuilderFromWizard.js stage 10b for how this is resolved
   * into rendering. `consanguinity_structurally_supported` is never set
   * directly here — it is derived by the builder from
   * `consanguinity_reported` plus the graph's own shared-ancestor check.
   */
  setUnionRelationshipBackground: (unionId, value) => set((state) => {
    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.unionRelationshipBackgrounds) wd.unionRelationshipBackgrounds = {};
    wd.unionRelationshipBackgrounds[unionId] = value;
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
   *
   * v0.5 Step 5A: a union is only ever kadın+erkek (opposite-sex). This
   * action must never fabricate a same-sex or unknown-sex union — blocked
   * with a console warning (mirrors the other guarded relationship actions)
   * rather than silently creating a clinically-invalid pairing.
   */
  addSpouseTo: (targetId, spouseSex = 'unknown') => set((state) => {
    const target = (state.pedigreeData.individuals || []).find(i => i.id === targetId);
    if (!target) return blocked('Birey grafikte bulunamadı.');
    if (target.sex === 'unknown') {
      return blocked('Eş eklemek için önce bu bireyin cinsiyeti belirtilmeli (birey düzenleme panelinden).');
    }
    if (spouseSex === 'unknown' || spouseSex === target.sex) {
      return blocked('Eş/birliktelik yalnızca kadın ve erkek arasında kurulabilir.');
    }

    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.graphEdits) wd.graphEdits = [];
    const idx = allocEditIndex(wd);
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
    const idx = allocEditIndex(wd);
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
      const idx = allocEditIndex(wd);
      wd.graphEdits.push({
        type: 'addChild',
        unionId: existingUnion.id,
        childId: `de_ch_${idx}`,
        sex: childSex,
      });
    } else {
      // Need to create spouse + union first, then add child
      const idx = allocEditIndex(wd);
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
    // v0.5 Faz 2a (DM-7/DM-8): sex is now editable for every individual,
    // but never in a way that contradicts an existing partnership.
    if (hasOwn(updates, 'sex')) {
      const conflict = partnerSexConflict(state.pedigreeData, id, updates.sex);
      if (conflict) return blocked(conflict);
    }
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
    // Keep the wizard's own proband sex selector in step with an editor edit.
    if (id === 'proband' && hasOwn(updates, 'sex')) wd.proband.sex = updates.sex;

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
   * (both slots), dismissed warnings, and the open accordion section so no
   * stale UI state survives into the fresh pedigree.
   */
  resetPedigree: () => zSet(() => {
    clearSession();
    const clean = cloneInitialState();
    return {
      wizardData: clean,
      _history: [],
      _future: [],
      selectedId: null,
      selectedId2: null,
      dismissedWarningIds: [],
      openSectionId: 'proband',
      ...generateDerivedData(clean, EMPTY_GRAPH),
    };
  }),

  // ────────────────────────────────────────────────────
  // Undo / Redo
  // ────────────────────────────────────────────────────

  /**
   * Revert exactly one graph-changing step by restoring the previous
   * wizardData snapshot from the bounded undo stack (see `set` above),
   * pushing the current (pre-undo) wizardData onto the redo stack
   * (`_future`) so `redo()` can bring it back. Never throws: if the
   * restored snapshot somehow fails to rebuild (it shouldn't, since every
   * snapshot on the stack once built successfully), the undo is aborted
   * rather than leaving the store in a broken state — mirroring
   * `bootstrapState()`'s own defensive rebuild handling.
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
    const future = [...(state._future || []), state.wizardData].slice(-MAX_UNDO_HISTORY);
    return { wizardData: prev, _history: nextHistory, _future: future, ...derived };
  }),

  /**
   * Reapply exactly one previously-undone graph-changing step by restoring
   * the most recent snapshot from the redo stack (`_future`), pushing the
   * current (pre-redo) wizardData back onto the undo stack so a further
   * `undo()` can reverse the redo itself. No-op if the redo stack is empty
   * (nothing to redo) or if the snapshot fails to rebuild.
   */
  redo: () => zSet((state) => {
    const future = state._future || [];
    if (future.length === 0) return {};
    const next = future[future.length - 1];
    const nextFuture = future.slice(0, -1);
    let derived;
    try {
      derived = generateDerivedData(JSON.parse(JSON.stringify(next)), EMPTY_GRAPH);
    } catch (err) {
      console.error('[usePedigreeStore] redo: snapshot failed to rebuild — aborting redo.', err);
      return {};
    }
    const history = [...(state._history || []), state.wizardData].slice(-MAX_UNDO_HISTORY);
    return { wizardData: next, _history: history, _future: nextFuture, ...derived };
  }),

  // ────────────────────────────────────────────────────
  // Selected-individual deletion (v0.3a.1, generalized v0.3a.2)
  // ────────────────────────────────────────────────────

  /**
   * Delete ANY individual (v0.3a.2 — no longer restricted to direct-edit
   * individuals; see `computeDeletionPlan`'s docblock). Uses the
   * `deletedIndividualIds` post-build overlay (graphDeletion.js) rather
   * than mutating wizard counts, so it works uniformly regardless of
   * whether the individual came from the wizard or a direct edit.
   *
   * No-op (does not mutate state) if the plan is not `ok` — callers should
   * check `computeDeletionPlan` first to decide whether to show a plain
   * delete button or a blocked explanation, but this action re-checks
   * internally regardless so it is never unsafe to call directly.
   */
  deleteIndividual: (id) => set((state) => {
    const plan = computeDeletionPlan(state.wizardData, state.pedigreeData, id);
    if (!plan.ok) {
      return blocked(plan.reason);
    }

    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.deletedIndividualIds) wd.deletedIndividualIds = [];
    if (!wd.deletedIndividualIds.includes(id)) wd.deletedIndividualIds.push(id);

    // Clean up per-individual/union overlays so no dangling references
    // survive the deletion (displayLabel/notes/conditions, child ordering,
    // custom-sibling links, consanguinity/relationship-background flags for
    // a now-gone union). Only the target's own overlays and the unions it
    // directly partnered in are cleaned — affected children are NOT
    // touched here; they remain in the graph, simply without a parent link
    // to the removed union (graphDeletion.js handles that structurally).
    if (wd.manualEdits) delete wd.manualEdits[id];
    if (Array.isArray(wd.customConsanguinity)) {
      wd.customConsanguinity = wd.customConsanguinity.filter(
        link => link.person1 !== id && link.person2 !== id
      );
    }
    // v0.5 Faz 2a (DM-4): a union keeps existing (with a placeholder in the
    // deleted partner's slot) while it still has children and another
    // partner, so its birth order must be kept; only its consanguinity /
    // relationship-background claims are dropped (they described the person
    // being deleted).
    const deletedSet = new Set(wd.deletedIndividualIds);
    (plan.affectedUnionIds || []).forEach(uid => {
      const union = (state.pedigreeData.unions || []).find(u => u.id === uid);
      const rel = (state.pedigreeData.parentChildRelationships || []).find(r => r.unionId === uid);
      const survivingKids = ((rel && rel.children) || []).filter(c => !deletedSet.has(c));
      const unionRemoved = !union || union.partners.every(p => deletedSet.has(p)) || survivingKids.length === 0;
      if (unionRemoved && wd.childOrders) delete wd.childOrders[uid];
      if (wd.consanguineousUnions) delete wd.consanguineousUnions[uid];
      if (wd.unionRelationshipBackgrounds) delete wd.unionRelationshipBackgrounds[uid];
    });

    const derived = generateDerivedData(wd, state.pedigreeData);

    // Move selection to a safe fallback: clear any slot that pointed at the
    // removed individual (no attempt to guess a "next" node — an explicit
    // clear is the safer default the v0.3a.1 spec allows).
    const clearedSelectedId = state.selectedId === id ? null : state.selectedId;
    const clearedSelectedId2 = state.selectedId2 === id ? null : state.selectedId2;

    return {
      wizardData: wd,
      ...derived,
      selectedId: clearedSelectedId,
      selectedId2: clearedSelectedId2,
    };
  }),

  /**
   * v0.4.1 — the left panel's decrement half of the Kardesler counters (see
   * addSiblingOfCategory above). Removes exactly the birth-order-LAST
   * sibling in the given category, regardless of whether that individual
   * was created via the wizard's `siblings.*` arrays or via the selected-
   * person editor's addSiblingTo (`graphEdits`, type 'addChild'):
   *   - wizard-origin (`sib_m_*` / `sib_f_*` / `sib_u_*` / `sib_loss_*` /
   *     `sib_still_*`) → shrink the matching wizard array/counter directly,
   *     the same simple mechanism updateSiblingCount already used.
   *   - anything else (a graphEdits-origin sibling) → route through the
   *     existing generic `deleteIndividual`, so it gets the same safety
   *     checks (computeDeletionPlan) and soft-delete overlay every other
   *     direct-edit deletion uses.
   * No-op if the category is already empty.
   */
  removeLastSibling: (category) => {
    const state = get();
    const matches = siblingsInCategory(state.pedigreeData, category);
    if (matches.length === 0) return;
    const last = matches[matches.length - 1];

    const wizardOriginPrefixes = { male: 'sib_m_', female: 'sib_f_', unknown: 'sib_u_', pregnancyLoss: 'sib_loss_', deceased: 'sib_still_' };
    const prefix = wizardOriginPrefixes[category];
    if (prefix && last.id.startsWith(prefix)) {
      set((s) => {
        const wd = JSON.parse(JSON.stringify(s.wizardData));
        if (category === 'pregnancyLoss' || category === 'deceased') {
          wd.siblings[category] = Math.max(0, (wd.siblings[category] || 0) - 1);
        } else {
          wd.siblings[category].length = Math.max(0, wd.siblings[category].length - 1);
        }
        const derived = generateDerivedData(wd, s.pedigreeData);
        return { wizardData: wd, ...derived };
      });
      return;
    }

    get().deleteIndividual(last.id);
  },

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
      return blocked(plan.reason);
    }

    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.graphEdits) wd.graphEdits = [];
    const idx = allocEditIndex(wd);
    const unionId = `U_DE_LINK_${idx}`;
    wd.graphEdits.push({ type: 'linkPartners', person1: id1, person2: id2, unionId, status: 'together' });

    if (opts.markConsanguineous) {
      if (!wd.consanguineousUnions) wd.consanguineousUnions = {};
      wd.consanguineousUnions[unionId] = true;
    }

    // v0.3a.2 safety net: build the trial result before committing. "Make
    // partners" is one of the two actions most likely to silently produce
    // an unreadable/broken pedigree (see relationshipSafety.js) — if this
    // specific change introduces a NEW graph-integrity error that wasn't
    // already present, roll back instead of committing a broken graph.
    const derived = generateDerivedData(wd, state.pedigreeData);
    const assessment = assessRelationshipMutation(state.integrityIssues, derived.integrityIssues);
    if (assessment.blocked) {
      return blocked(assessment.reason);
    }
    return { wizardData: wd, ...derived };
  }),

  // ────────────────────────────────────────────────────
  // Selected-person relative actions (v0.3a.3)
  // ────────────────────────────────────────────────────

  /**
   * "Add mother" / "add father" / "add both parents" for the selected
   * individual (see computeAddParentsPlan). Exactly one of `onlyMother`/
   * `onlyFather` may be set; omitting both adds a real mother+father pair.
   * "Add mother"/"add father" alone still creates a second, explicitly
   * unspecified placeholder individual to satisfy the two-partner union
   * invariant — see pedigreeBuilderFromWizard.js's 'addParents' case.
   */
  addParentsTo: (targetId, opts = {}) => set((state) => {
    const plan = computeAddParentsPlan(state.pedigreeData, targetId);
    if (!plan.ok) {
      return blocked(plan.reason);
    }

    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.graphEdits) wd.graphEdits = [];
    const idx = allocEditIndex(wd);
    const parent1Id = `de_par_${idx}_1`;
    const parent2Id = `de_par_${idx}_2`;
    const unionId = `U_DE_PARENTS_${idx}`;

    let parent1Sex, parent2Sex, parent2IsPlaceholder;
    if (opts.onlyMother) {
      parent1Sex = 'female'; parent2Sex = 'unknown'; parent2IsPlaceholder = true;
    } else if (opts.onlyFather) {
      parent1Sex = 'male'; parent2Sex = 'unknown'; parent2IsPlaceholder = true;
    } else {
      parent1Sex = 'female'; parent2Sex = 'male'; parent2IsPlaceholder = false;
    }

    wd.graphEdits.push({
      type: 'addParents', targetId, parent1Id, parent2Id, unionId,
      parent1Sex, parent2Sex, parent2IsPlaceholder,
    });

    // v0.3a.2/v0.3a.3 safety net: roll back if this introduces a new
    // graph-integrity error (same audit-before-commit pattern as
    // createUnionBetween/addCustomConsanguinity).
    const derived = generateDerivedData(wd, state.pedigreeData);
    const assessment = assessRelationshipMutation(state.integrityIssues, derived.integrityIssues);
    if (assessment.blocked) {
      return blocked(assessment.reason);
    }
    return { wizardData: wd, ...derived };
  }),

  /**
   * "Add sibling" for the selected individual — attaches a new child to
   * the target's EXISTING parent union (see computeAddSiblingPlan). Never
   * fabricates parents; blocked if the target has none yet.
   */
  addSiblingTo: (targetId, sex = 'unknown') => set((state) => {
    const plan = computeAddSiblingPlan(state.pedigreeData, targetId);
    if (!plan.ok) {
      return blocked(plan.reason);
    }

    const wd = JSON.parse(JSON.stringify(state.wizardData));
    if (!wd.graphEdits) wd.graphEdits = [];
    const idx = allocEditIndex(wd);
    wd.graphEdits.push({ type: 'addChild', unionId: plan.unionId, childId: `de_ch_${idx}`, sex });

    const derived = generateDerivedData(wd, state.pedigreeData);
    const assessment = assessRelationshipMutation(state.integrityIssues, derived.integrityIssues);
    if (assessment.blocked) {
      return blocked(assessment.reason);
    }
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
