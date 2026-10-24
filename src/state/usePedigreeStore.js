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
import { selectedPacker } from '../utils/layoutPacking';
import { computeStableLayout } from '../layout/pcl/incremental';
import { computeTidyLayout } from '../layout/pcl/tidy';
import { auditLayoutIntegrity } from '../utils/layoutIntegrity';
import { assessRelationshipMutation } from '../utils/relationshipSafety';
import { validateDocument } from '../graph/validate';
import { displayParentage } from '../graph/model';
import * as ops from '../graph/ops';
import { wizardOps, deriveWizardView } from '../graph/wizardAdapter';
import * as multiples from '../graph/multiples';
import * as findings from '../graph/findings';
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

/**
 * Selection: any number of people (Cmd/Ctrl-click adds/removes). The first
 * two are mirrored in selectedId / selectedId2 (pair actions, couple card).
 */
const sel = (ids) => ({ selectedIds: ids, selectedId: ids[0] || null, selectedId2: ids[1] || null });

function tagIssues(issues, source) {
  return issues.map(issue => ({ ...issue, source }));
}

/** A fresh pedigree: exactly the v1 starter (3 generations), as a v2 document. */
export function starterDocument() {
  const doc = migrateV1ToV2(cloneInitialState()).doc;
  // the proband opens marked affected (clinician request 2026-10-25)
  const p = doc.graph.individuals.find((i) => i.id === doc.wizardAnchorId);
  if (p) p.affected = true;
  return doc;
}

/**
 * Layout for a document. With a previous layout (`ctx.prevNodes`) and the
 * PCL engine, the edit-local relayout keeps unaffected people in place
 * (KI-2, src/layout/pcl/incremental.js); otherwise a fresh layout.
 */
function layoutFor(graph, ctx) {
  if (ctx && ctx.prevNodes && ctx.prevNodes.length && selectedPacker() === 'pcl') {
    const r = computeStableLayout(graph, ctx);
    return { nodes: r.nodes, edges: r.edges, layoutInfo: r.meta.stability };
  }
  if (ctx && ctx.tidy && selectedPacker() === 'pcl') {
    // "Yeniden Düzenle": the layout with the fewest bends (tidy.js)
    const t = computeTidyLayout(graph);
    return { nodes: t.nodes, edges: t.edges, layoutInfo: { level: 'full', reason: `Yeniden Düzenle (en az kırılma: ${t.variant})` } };
  }
  const l = computePedigreeLayout(graph, ctx && ctx.straightStart ? { straightStart: true } : {});
  return { nodes: l.nodes, edges: l.edges, layoutInfo: { level: 'full', reason: ctx && ctx.reason ? ctx.reason : 'fresh layout' } };
}

/** Position hints saved with a document: { version, positions: { id: [x, y] } }. */
function hintsFromNodes(nodes) {
  return { version: 1, positions: Object.fromEntries((nodes || []).map((n) => [n.id, [n.x, n.y]])) };
}
function nodesFromHints(hints) {
  if (!hints || hints.version !== 1 || !hints.positions) return null;
  return Object.entries(hints.positions).map(([id, [x, y]]) => ({ id, x, y }));
}
function withoutHints(doc) {
  if (!doc || !doc.layoutHints) return doc;
  const { layoutHints, ...rest } = doc; // eslint-disable-line no-unused-vars
  return rest;
}

function deriveAll(doc, ui = {}, ctx = null) {
  const graph = doc.graph;
  const { layoutInfo, ...layout } = layoutFor(graph, ctx);
  const combined = { ...graph, ...layout };
  const warnings = validatePedigree(combined);
  const graphIssues = tagIssues(validateDocument(doc), 'graph');
  const errors = graphIssues.filter(i => i.severity === 'error');
  if (errors.length > 0) console.error('Pedigree graph integrity failed', errors);
  // geometry is audited against the parentage that is drawn (adopted-in
  // children under their social parents), see displayParentage
  const layoutIssues = tagIssues(auditLayoutIntegrity(layout, displayParentage(graph).graph), 'layout');
  const integrityIssues = [...graphIssues, ...layoutIssues];
  return {
    pedigreeData: combined,
    warnings,
    integrityIssues,
    layoutInfo,
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
      const prevNodes = nodesFromHints(doc.layoutHints);
      const clean = withoutHints(doc);
      return { doc: clean, ...deriveAll(clean, {}, prevNodes ? { prevNodes, frozen: true } : null), actionNotice };
    } catch (err) {
      console.error('[usePedigreeStore] Saved pedigree failed to load — starting clean (saved data not deleted).', err);
    }
  }
  const fresh = starterDocument();
  return { doc: fresh, ...deriveAll(fresh, {}, { straightStart: true }), actionNotice };
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
      _viewHistory: [...(state._viewHistory || []), viewOf(state)].slice(-MAX_UNDO_HISTORY),
      _future: [],
      _viewFuture: [],
      actionNotice: null,
      lastCreated: result.created || {},
      ...extra,
      ...(derived || deriveAll(result.doc, ui, editContext(state))),
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
    const derived = deriveAll(result.doc, state.ui, editContext(state));
    const assessment = assessRelationshipMutation(state.integrityIssues, derived.integrityIssues);
    if (assessment.blocked) return apply({ ok: false, doc: state.doc, reason: assessment.reason });
    return apply(result, {}, derived);
  };

  /** What an edit's relayout starts from: the previous graph and what was drawn. */
  // A removal keeps the previous order but closes up the drawing
  // (incremental.js 'compact'); additions stay edit-local.
  const editContext = (state) => ({ prevGraph: state.doc.graph, prevNodes: state.pedigreeData.nodes, prevEdges: state.pedigreeData.edges });

  /** Everything derived from a document, as drawn — restored verbatim by undo/redo. */
  const viewOf = (state) => ({
    pedigreeData: state.pedigreeData, warnings: state.warnings, integrityIssues: state.integrityIssues,
    layoutInfo: state.layoutInfo, lastGraphDebug: state.lastGraphDebug,
  });

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

  // UI-only change (e.g. a pending gen-4 entry): the graph and the drawing stay
  const withUi = (ui) => {
    const state = get();
    zSet({ ui, wizardData: deriveWizardView(state.doc, ui) });
  };

  return {
    ...bootstrap(),
    ui: { gen4Pending: [] },
    // ids created by the last successful operation (e.g. { spouseId, unionId })
    lastCreated: {},
    _history: [],
    _future: [],
    // derived views (drawing) aligned with _history/_future, so undo/redo
    // brings back exactly the drawing the clinician saw
    _viewHistory: [],
    _viewFuture: [],
    ...sel([]),
    dismissedWarningIds: [],
    openSectionId: 'proband',

    // ── UI state (not undoable) ──
    selectIndividual: (id, opts = {}) => zSet((state) => {
      if (!id) return sel([]);
      if (!opts.additive) return sel([id]);
      const ids = state.selectedIds || [];
      return sel(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
    }),
    dismissActionNotice: () => zSet(() => ({ actionNotice: null })),
    clearSelection: () => zSet(() => sel([])),
    // clicking a relationship line selects the couple (pair panel: status, children)
    selectUnion: (unionId) => zSet((state) => {
      const u = state.doc.graph.unions.find(x => x.id === unionId);
      return u ? sel([u.partners[0], u.partners[1]]) : {};
    }),
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
    setUnionStatus: (unionId, status) => apply(ops.setUnionStatus(get().doc, unionId, status)),

    // patient's name: printed on the drawing and in the file names; saved
    // with the document (not an undo step: it is a label, not the family)
    setPatientName: (name) => zSet((state) => ({ doc: { ...state.doc, patientName: name } })),

    // ── several people at once (one undo step each) ──
    updateMany: (ids, patch) => apply(chain(get().doc, ids.map(id => (d) => ops.updatePerson(d, id, patch)))),
    setFindingStatusMany: (ids, label, status) => apply(chain(get().doc, ids.map(id => (d) => findings.setFindingStatus(d, id, label, status)))),
    addFindingMany: (ids, label, style) => apply(chain(get().doc, ids.map((id, k) => (d) => (k === 0
      ? findings.addFinding(d, id, label, style)
      : findings.setFindingStatus(d, id, label, 'affected'))))),

    // ── findings (legend regions) ──
    addFinding: (personId, label, style) => apply(findings.addFinding(get().doc, personId, label, style)),
    setFindingStatus: (personId, label, status) => apply(findings.setFindingStatus(get().doc, personId, label, status)),
    setFindingStyle: (label, style) => apply(findings.setFindingStyle(get().doc, label, style)),
    renameFinding: (oldLabel, newLabel) => apply(findings.renameFinding(get().doc, oldLabel, newLabel)),

    // ── twins / multiple births ──
    setMultipleBirth: (childIds, zygosity) => apply(multiples.setMultipleBirth(get().doc, childIds, zygosity)),
    addMultipleSibling: (personId, opts) => apply(multiples.addMultipleSibling(get().doc, personId, opts)),
    setMultipleZygosity: (personId, zygosity) => apply(multiples.setMultipleZygosity(get().doc, personId, zygosity)),
    leaveMultipleBirth: (personId) => apply(multiples.leaveMultipleBirth(get().doc, personId)),

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
    // extra: { pregnancyLoss: true } or { stillbirth: true } for a pregnancy outcome
    addChildToUnion: (unionId, sex = 'unknown', extra = {}) => apply(ops.addChild(get().doc, unionId, { sex, ...extra })),
    addChildTo: (targetId, childSex = 'unknown', extra = {}) => apply(ops.addChildToPerson(get().doc, targetId, { sex: childSex, ...extra })),
    addParentsTo: (targetId, opts = {}) => applyGuarded(ops.addParents(get().doc, targetId, opts)),
    addSiblingTo: (targetId, sex = 'unknown', extra = {}) => applyGuarded(ops.addSibling(get().doc, targetId, { sex, ...extra })),
    createUnionBetween: (id1, id2, opts = {}) => applyGuarded(ops.linkPartners(get().doc, id1, id2, opts)),
    // social (non-biological) parenthood — model + layout in Faz 2b; editor UI in Faz 4
    addSocialParentLink: (childId, unionId, kind) => applyGuarded(ops.addSocialParentLink(get().doc, childId, unionId, kind)),
    removeSocialParentLink: (childId, unionId) => apply(ops.removeSocialParentLink(get().doc, childId, unionId)),

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
      return apply(ops.removePerson(state.doc, id), sel((state.selectedIds || []).filter(x => x !== id)));
    },

    // ── documents ──
    resetPedigree: () => zSet(() => {
      clearAllSessions();
      const fresh = starterDocument();
      const ui = { gen4Pending: [] };
      return {
        doc: fresh, ui,
        _history: [], _future: [], _viewHistory: [], _viewFuture: [],
        ...sel([]),
        dismissedWarningIds: [], openSectionId: 'proband', actionNotice: null,
        // a new pedigree opens with straight lines of descent
        ...deriveAll(fresh, ui, { straightStart: true }),
      };
    }),

    /** The current pedigree as a project file (`.peditree.json`). */
    exportProjectFile: () => serializeDocument({ ...get().doc, layoutHints: hintsFromNodes(get().pedigreeData.nodes) }),

    /**
     * "Yeniden Düzenle": a fresh layout of the whole pedigree, ignoring the
     * previous drawing. Undoable (restores the previous drawing).
     */
    relayout: () => zSet((state) => ({
      _history: [...(state._history || []), state.doc].slice(-MAX_UNDO_HISTORY),
      _viewHistory: [...(state._viewHistory || []), viewOf(state)].slice(-MAX_UNDO_HISTORY),
      _future: [], _viewFuture: [],
      ...deriveAll(state.doc, state.ui, { reason: 'Yeniden Düzenle', tidy: true }),
    })),

    /** Open a project file (v2, or v1 which is migrated). Undoable. */
    openProjectFile: (text) => {
      const parsed = parseProjectFile(text);
      if (!parsed.ok) return apply({ ok: false, reason: parsed.reason });
      const prevNodes = nodesFromHints(parsed.doc.layoutHints);
      const doc = withoutHints(parsed.doc);
      const derived = deriveAll(doc, get().ui, prevNodes ? { prevNodes, frozen: true } : null);
      const result = apply({ ok: true, doc }, sel([]), derived);
      if (parsed.migrated) zSet({ actionNotice: { message: 'Eski biçimdeki dosya yeni veri biçimine taşınarak açıldı.', at: Date.now() } });
      return { ...result, migrated: parsed.migrated };
    },

    // ── undo / redo ──
    undo: () => zSet((state) => {
      const history = state._history || [];
      if (history.length === 0) return {};
      const prev = history[history.length - 1];
      const views = state._viewHistory || [];
      const view = views.length === history.length ? views[views.length - 1] : null;
      return {
        doc: prev,
        _history: history.slice(0, -1),
        _viewHistory: views.slice(0, -1),
        _future: [...(state._future || []), state.doc].slice(-MAX_UNDO_HISTORY),
        _viewFuture: [...(state._viewFuture || []), viewOf(state)].slice(-MAX_UNDO_HISTORY),
        ...(view ? { ...view, wizardData: deriveWizardView(prev, state.ui) } : deriveAll(prev, state.ui)),
      };
    }),
    redo: () => zSet((state) => {
      const future = state._future || [];
      if (future.length === 0) return {};
      const next = future[future.length - 1];
      const views = state._viewFuture || [];
      const view = views.length === future.length ? views[views.length - 1] : null;
      return {
        doc: next,
        _future: future.slice(0, -1),
        _viewFuture: views.slice(0, -1),
        _history: [...(state._history || []), state.doc].slice(-MAX_UNDO_HISTORY),
        _viewHistory: [...(state._viewHistory || []), viewOf(state)].slice(-MAX_UNDO_HISTORY),
        ...(view ? { ...view, wizardData: deriveWizardView(next, state.ui) } : deriveAll(next, state.ui)),
      };
    }),
  };
});

// ── Autosave (debounced) ──
let saveTimer = null;
usePedigreeStore.subscribe((state, prevState) => {
  // the document or only the drawing ("Yeniden Düzenle") changed: save both
  if (state.doc === prevState.doc && state.pedigreeData === prevState.pedigreeData) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const st = usePedigreeStore.getState();
    saveDocument({ ...st.doc, layoutHints: hintsFromNodes(st.pedigreeData.nodes) });
  }, 300);
});
