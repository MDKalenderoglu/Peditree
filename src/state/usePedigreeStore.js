/**
 * usePedigreeStore.js — application state (schema v2, graph-first).
 *
 * Source of truth: `doc`, a schema v2 graph document
 * (docs/PEDITREE_DATA_MODEL_V2.md). Every change — from the wizard or the
 * person editor — is an atomic graph operation (src/graph/ops.js,
 * src/graph/wizardAdapter.js) that either produces a new valid document or
 * is refused with a Turkish reason (shown as `actionNotice`; nothing changes
 * and nothing enters the undo stack).
 *
 * Derived on every document change (never stored separately):
 *   pedigreeData    — graph + layout ({ nodes, edges }) for the renderer
 *   warnings        — semantic validator messages
 *   integrityIssues — structural + graph audit + layout audit
 *   wizardData      — the wizard's view of the graph (read-only; kept under
 *                     its v1 name for the panel), see deriveWizardView
 *
 * Undo/redo: bounded stacks of document snapshots. Selection, open
 * accordion section and dismissed warnings are UI state, not undoable.
 *
 * Persistence: the document is autosaved (persistenceV2.js); a v1 session
 * found at start-up is migrated without loss (migrate.js).
 */
import { create } from 'zustand';
import { validatePedigree } from '../utils/validators';
import { computePedigreeLayoutV2 as computePedigreeLayout } from '../utils/pedigreeLayoutV2';
import { auditLayoutIntegrity } from '../utils/layoutIntegrity';
import { assessRelationshipMutation } from '../utils/relationshipSafety';
import { validateDocument } from '../graph/validate';
import * as ops from '../graph/ops';
import { wizardOps, deriveWizardView } from '../graph/wizardAdapter';
import { migrateV1ToV2 } from '../graph/migrate';
import { cloneInitialState } from '../graph/v1pipeline';
import {
  loadDocument, saveDocument, clearAllSessions, serializeDocument, parseProjectFile,
} from '../graph/persistenceV2';

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

const MAX_UNDO_HISTORY = 50;

function tagIssues(issues, source) {
  return issues.map(issue => ({ ...issue, source }));
}

/** A fresh pedigree: exactly the v1 starter (3 generations), as a v2 document. */
export function starterDocument() {
  return migrateV1ToV2(cloneInitialState()).doc;
}

function deriveAll(doc, ui = {}) {
  const graph = doc.graph;
  const layout = computePedigreeLayout(graph);
  const combined = { ...graph, ...layout };
  const warnings = validatePedigree(combined);
  const graphIssues = tagIssues(validateDocument(doc), 'graph');
  const errors = graphIssues.filter(i => i.severity === 'error');
  if (errors.length > 0) console.error('Pedigree graph integrity failed', errors);
  const layoutIssues = tagIssues(auditLayoutIntegrity(layout, graph), 'layout');
  const integrityIssues = [...graphIssues, ...layoutIssues];
  return {
    pedigreeData: combined,
    warnings,
    integrityIssues,
    wizardData: deriveWizardView(doc, ui),
    lastGraphDebug: {
      individualCount: graph.individuals.length,
      unionCount: graph.unions.length,
      relationshipCount: graph.parentChildRelationships.length,
      issues: integrityIssues,
    },
  };
}

function bootstrap() {
  let doc;
  let notice = null;
  try {
    const loaded = loadDocument();
    doc = loaded.doc;
    if (loaded.notice) notice = loaded.notice;
    else if (loaded.source === 'migrated-v1') {
      notice = 'Kayıtlı pedigri yeni veri biçimine taşındı (veri kaybı yok; eski kayıt yedeklendi).';
    }
  } catch (err) {
    console.warn('[usePedigreeStore] Failed to read saved pedigree — starting clean.', err);
    doc = null;
  }
  const actionNotice = notice ? { message: notice, at: Date.now() } : null;
  if (doc) {
    try {
      return { doc, ...deriveAll(doc), actionNotice };
    } catch (err) {
      console.error('[usePedigreeStore] Saved pedigree failed to load — starting clean (saved data not deleted).', err);
    }
  }
  const fresh = starterDocument();
  return { doc: fresh, ...deriveAll(fresh), actionNotice };
}

export const usePedigreeStore = create((zSet, get) => {
  /**
   * Commit an operation result. A refused operation only shows its reason;
   * a no-op (same document) changes nothing; a real change pushes the
   * previous document on the undo stack and clears redo.
   */
  const apply = (result, extra = {}, derived = null) => {
    if (!result || !result.ok) {
      zSet({ actionNotice: { message: (result && result.reason) || 'İşlem uygulanamadı.', at: Date.now() } });
      return result;
    }
    const state = get();
    if (result.doc === state.doc) {
      if (Object.keys(extra).length) zSet(extra);
      return result;
    }
    const ui = extra.ui || state.ui;
    zSet({
      doc: result.doc,
      _history: [...(state._history || []), state.doc].slice(-MAX_UNDO_HISTORY),
      _future: [],
      actionNotice: null,
      lastCreated: result.created || {},
      ...extra,
      ...(derived || deriveAll(result.doc, ui)),
    });
    return result;
  };

  /**
   * Relationship-creating actions ("make partners", "make siblings", add
   * parents / sibling) keep the v0.3a.2 safety net: a change that makes the
   * drawing newly ambiguous (new graph error or new layout ambiguity, see
   * relationshipSafety.js) is refused instead of committed.
   */
  const applyGuarded = (result) => {
    const state = get();
    if (!result || !result.ok || result.doc === state.doc) return apply(result);
    const derived = deriveAll(result.doc, state.ui);
    const assessment = assessRelationshipMutation(state.integrityIssues, derived.integrityIssues);
    if (assessment.blocked) return apply({ ok: false, doc: state.doc, reason: assessment.reason });
    return apply(result, {}, derived);
  };

  /** Run operations in sequence as ONE undoable step (all or nothing). */
  const chain = (doc, steps) => {
    let cur = { ok: true, doc, created: {} };
    for (const step of steps) {
      const next = step(cur.doc);
      if (!next.ok) return { ...next, doc };
      cur = { ...next, created: { ...cur.created, ...(next.created || {}) } };
    }
    return cur;
  };

  const withUi = (ui) => {
    const state = get();
    zSet({ ui, ...deriveAll(state.doc, ui) });
  };

  return {
    ...bootstrap(),
    ui: { gen4Pending: [] },
    // ids created by the last successful operation (e.g. { spouseId, unionId })
    lastCreated: {},
    _history: [],
    _future: [],
    selectedId: null,
    selectedId2: null,
    dismissedWarningIds: [],
    openSectionId: 'proband',

    // ── UI state (not undoable) ──
    selectIndividual: (id, opts = {}) => zSet((state) => {
      const additive = !!opts.additive;
      if (!additive) return { selectedId: id, selectedId2: null };
      if (id === state.selectedId) return {};
      if (id === state.selectedId2) return { selectedId2: null };
      if (!state.selectedId) return { selectedId: id, selectedId2: null };
      return { selectedId2: id };
    }),
    dismissActionNotice: () => zSet(() => ({ actionNotice: null })),
    clearSelection: () => zSet(() => ({ selectedId: null, selectedId2: null })),
    dismissWarning: (warningId) => zSet((state) => ({
      dismissedWarningIds: [...new Set([...(state.dismissedWarningIds || []), warningId])],
    })),
    setOpenSection: (sectionId) => zSet((state) => ({
      openSectionId: state.openSectionId === sectionId ? null : sectionId,
    })),

    // ── wizard (adapter over the graph) ──
    updateWizardData: (section, field, value) => {
      const doc = get().doc;
      if (section === 'proband') return apply(wizardOps.setProbandField(doc, field, value));
      if (section === 'parents') return apply(wizardOps.setParentsField(doc, field, value));
      return apply({ ok: true, doc });
    },
    updateSiblingCount: (type, count) => apply(wizardOps.setSiblingCount(get().doc, type, count)),
    addSiblingOfCategory: (category) => apply(wizardOps.addSibling(get().doc, category)),
    removeLastSibling: (category) => apply(wizardOps.removeLastSibling(get().doc, category)),
    updateSiblingAge: (type, idx, age) => apply(wizardOps.setSiblingAge(get().doc, type, idx, age)),
    addOtherUnion: (parentType) => apply(wizardOps.addOtherUnion(get().doc, parentType)),
    updateOtherUnion: (parentType, idx, field, value) => apply(wizardOps.updateOtherUnion(get().doc, parentType, idx, field, value)),
    removeOtherUnion: (parentType, idx) => apply(wizardOps.removeOtherUnion(get().doc, parentType, idx)),
    updateRelativeCount: (side, relativeType, count) => apply(wizardOps.setRelativeCount(get().doc, side, relativeType, count)),
    updateRelativeChildren: (side, relativeType, index, sex, count) =>
      apply(wizardOps.setRelativeChildren(get().doc, side, relativeType, index, sex, count)),
    toggleGreatGrandparents: (gpKey, value) => apply(wizardOps.setGreatGrandparents(get().doc, gpKey, value)),

    addGen4: (targetPath) => {
      const ui = get().ui;
      withUi({ ...ui, gen4Pending: [...ui.gen4Pending, { id: `pending:${ui.gen4Pending.length}:${targetPath}`, targetPath }] });
    },
    updateGen4: (idx, field, value) => {
      const state = get();
      const entry = state.wizardData.gen4[idx];
      if (!entry) return undefined;
      if (entry.pending && field === 'targetPath') {
        return withUi({ ...state.ui, gen4Pending: state.ui.gen4Pending.map(p => (p.id === entry.id ? { ...p, targetPath: value } : p)) });
      }
      const r = wizardOps.updateGen4(state.doc, entry, field, value);
      if (!r.ok) return apply(r);
      return apply(r, { ui: { ...state.ui, gen4Pending: state.ui.gen4Pending.filter(p => p.id !== entry.id) } });
    },
    removeGen4: (idx) => {
      const state = get();
      const entry = state.wizardData.gen4[idx];
      if (!entry) return undefined;
      const ui = { ...state.ui, gen4Pending: state.ui.gen4Pending.filter(p => p.id !== entry.id) };
      if (entry.pending) return withUi(ui);
      return apply(wizardOps.removeGen4(state.doc, entry), { ui });
    },

    addCustomConsanguinity: (person1, person2) => applyGuarded(ops.makeSiblings(get().doc, person1, person2)),
    removeCustomConsanguinity: (idx) => apply(wizardOps.removeCustomSiblingLink(get().doc, idx)),
    markUnionConsanguineous: (unionId, value) => apply(ops.setUnionConsanguineous(get().doc, unionId, value)),
    setUnionRelationshipBackground: (unionId, value) => apply(ops.setRelationshipBackground(get().doc, unionId, value)),

    // ── birth order ──
    getChildOrder: (unionId) => {
      const rel = get().doc.graph.parentChildRelationships.find(r => r.unionId === unionId);
      return rel && rel.birthOrderExplicit ? [...rel.children] : undefined;
    },
    setChildOrder: (unionId, order) => apply(ops.setChildOrder(get().doc, unionId, order)),
    clearChildOrder: (unionId) => apply(ops.clearChildOrder(get().doc, unionId)),
    reorderChild: (unionId, childId, direction) => apply(ops.moveChild(get().doc, unionId, childId, direction)),

    // ── person editor ──
    addSpouseTo: (targetId, spouseSex = 'unknown') => apply(ops.addPartner(get().doc, targetId, { sex: spouseSex })),
    addChildToUnion: (unionId, sex = 'unknown') => apply(ops.addChild(get().doc, unionId, { sex })),
    addChildTo: (targetId, childSex = 'unknown') => apply(ops.addChildToPerson(get().doc, targetId, { sex: childSex })),
    addParentsTo: (targetId, opts = {}) => applyGuarded(ops.addParents(get().doc, targetId, opts)),
    addSiblingTo: (targetId, sex = 'unknown') => applyGuarded(ops.addSibling(get().doc, targetId, { sex })),
    createUnionBetween: (id1, id2, opts = {}) => applyGuarded(ops.linkPartners(get().doc, id1, id2, opts)),

    updateIndividual: (id, updates) => {
      const rest = { ...updates };
      delete rest.proband;
      const steps = [];
      if (Object.keys(rest).length) steps.push((doc) => ops.updatePerson(doc, id, rest));
      if (Object.prototype.hasOwnProperty.call(updates, 'proband')) {
        steps.push((doc) => {
          const current = doc.graph.individuals.find(i => i.proband);
          if (updates.proband) return ops.setProband(doc, id);
          return current && current.id === id ? ops.setProband(doc, null) : { ok: true, doc };
        });
      }
      return apply(chain(get().doc, steps));
    },
    setProband: (id) => apply(ops.setProband(get().doc, id)),
    clearProband: () => apply(ops.setProband(get().doc, null)),

    deleteIndividual: (id) => {
      const state = get();
      return apply(ops.removePerson(state.doc, id), {
        selectedId: state.selectedId === id ? null : state.selectedId,
        selectedId2: state.selectedId2 === id ? null : state.selectedId2,
      });
    },

    // ── documents ──
    resetPedigree: () => zSet(() => {
      clearAllSessions();
      const fresh = starterDocument();
      const ui = { gen4Pending: [] };
      return {
        doc: fresh, ui,
        _history: [], _future: [],
        selectedId: null, selectedId2: null,
        dismissedWarningIds: [], openSectionId: 'proband', actionNotice: null,
        ...deriveAll(fresh, ui),
      };
    }),

    /** The current pedigree as a project file (`.peditree.json`). */
    exportProjectFile: () => serializeDocument(get().doc),

    /** Open a project file (v2, or v1 which is migrated). Undoable. */
    openProjectFile: (text) => {
      const parsed = parseProjectFile(text);
      if (!parsed.ok) return apply({ ok: false, reason: parsed.reason });
      const result = apply({ ok: true, doc: parsed.doc }, { selectedId: null, selectedId2: null });
      if (parsed.migrated) zSet({ actionNotice: { message: 'Eski biçimdeki dosya yeni veri biçimine taşınarak açıldı.', at: Date.now() } });
      return { ...result, migrated: parsed.migrated };
    },

    // ── undo / redo ──
    undo: () => zSet((state) => {
      const history = state._history || [];
      if (history.length === 0) return {};
      const prev = history[history.length - 1];
      return {
        doc: prev,
        _history: history.slice(0, -1),
        _future: [...(state._future || []), state.doc].slice(-MAX_UNDO_HISTORY),
        ...deriveAll(prev, state.ui),
      };
    }),
    redo: () => zSet((state) => {
      const future = state._future || [];
      if (future.length === 0) return {};
      const next = future[future.length - 1];
      return {
        doc: next,
        _future: future.slice(0, -1),
        _history: [...(state._history || []), state.doc].slice(-MAX_UNDO_HISTORY),
        ...deriveAll(next, state.ui),
      };
    }),
  };
});

// ── Autosave (debounced) ──
let saveTimer = null;
usePedigreeStore.subscribe((state, prevState) => {
  if (state.doc === prevState.doc) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDocument(usePedigreeStore.getState().doc), 300);
});
