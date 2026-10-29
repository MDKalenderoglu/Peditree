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
import { fromPed } from '../graph/ped';
import { buildTemplate } from '../graph/templates';
import { sidewaysMove, dropMove, againstAges } from '../utils/sidewaysMove';
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
/**
 * The patient's name is a label, not part of the family: undo / redo of a
 * graph edit keep the name as it is now (audit 2026-10-25: undo used to
 * bring an earlier name back, also into the file names).
 */
function withName(doc, current) {
  // another document (a file opened, a PED imported, "Yeni"): its own name
  // comes back with it (second audit 2026-10-25)
  if (!current || doc.docId !== current.docId) return doc;
  const name = current && current.patientName;
  if ((doc.patientName || '') === (name || '')) return doc;
  const out = { ...doc };
  if (name) out.patientName = name; else delete out.patientName;
  return out;
}

/**
 * Every document gets its own id when it is created, opened or imported;
 * edits keep it (commit copies the document). Undo uses it to tell "the
 * same patient, edited" from "another patient's file".
 */
let docSeq = 0;
export const withDocId = (doc) => ({ ...doc, docId: `d${Date.now().toString(36)}${(docSeq++).toString(36)}` });

export function starterDocument() {
  const doc = withDocId(migrateV1ToV2(cloneInitialState()).doc);
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
    // "Konumlandır": the layout with the fewest bends (tidy.js)
    const t = computeTidyLayout(graph);
    return { nodes: t.nodes, edges: t.edges, layoutInfo: { level: 'full', reason: `Konumlandır (en az kırılma: ${t.variant})` } };
  }
  const l = computePedigreeLayout(graph, ctx && ctx.straightStart ? { straightStart: true } : {});
  return { nodes: l.nodes, edges: l.edges, layoutInfo: { level: 'full', reason: ctx && ctx.reason ? ctx.reason : 'fresh layout' } };
}

/** Position hints saved with a document: { version, positions: { id: [x, y] } }. */
function hintsFromNodes(nodes) {
  return { version: 1, positions: Object.fromEntries((nodes || []).map((n) => [n.id, [n.x, n.y]])) };
}
function nodesFromHints(hints) {
  if (!hints || hints.version !== 1 || !hints.positions || typeof hints.positions !== 'object') return null;
  const entries = Object.entries(hints.positions);
  // a damaged hint is dropped and the family drawn afresh (second audit 2026-10-25)
  const ok = entries.every(([, v]) => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n)));
  return ok ? entries.map(([id, [x, y]]) => ({ id, x, y })) : null;
}
/** Ages that follow a birth date, as of today (a file or session opened later). */
function withBirthDateAges(doc) {
  const r = ops.refreshBirthDateAges(doc, new Date());
  return r.ok ? r.doc : doc;
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
      const clean = withBirthDateAges(withoutHints(doc));
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
  // a move from sidewaysMove.js / dropMove: one undo step; a birth order
  // that now contradicts known ages is said (the drawing follows the clinician)
  const applyMove = (m, id) => {
    if (m.kind === 'none') {
      if (m.reason) zSet({ actionNotice: { message: m.reason, kind: 'info', at: Date.now() } });
      return { ok: false, reason: m.reason };
    }
    if (m.kind === 'partner') {
      const res = apply(ops.setLeftPartner(get().doc, m.unionId, m.leftPartner));
      // the edit-local drawing keeps people in place; when the two stand in
      // different families the whole branches swap, so draw it afresh
      const st = get();
      const u = st.doc.graph.unions.find((x) => x.id === m.unionId);
      const xOf = (pid) => (st.pedigreeData.nodes.find((n) => n.id === pid) || {}).x;
      const other = u && u.partners.find((p) => p !== m.leftPartner);
      if (res.ok && u && !(xOf(m.leftPartner) < xOf(other))) {
        zSet(deriveAll(st.doc, st.ui, { tidy: true, reason: 'Eşler yer değiştirdi' }));
      }
      return res;
    }
    let d = get().doc;
    const children = (doc) => doc.graph.parentChildRelationships.find((r) => r.unionId === m.unionId).children;
    for (let i = 0; i < children(d).length; i++) {
      const r = ops.moveChild(d, m.unionId, id, m.dir);
      if (!r.ok) return apply(r);
      if (r.doc === d) break;
      d = r.doc;
      if (!m.target) break;
      const c = children(d);
      if (m.dir === 'left' ? c.indexOf(id) < c.indexOf(m.target) : c.indexOf(id) > c.indexOf(m.target)) break;
    }
    const result = apply({ ok: true, doc: d });
    const st = get();
    if (result.ok && againstAges({ ...st.pedigreeData, parentChildRelationships: st.doc.graph.parentChildRelationships }, m.unionId)) {
      zSet({ actionNotice: { message: 'Bu doğum sırası bilinen yaşlarla uyuşmuyor; çizim elle verdiğiniz sırayı gösteriyor.', kind: 'info', at: Date.now() } });
    }
    return result;
  };

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
    // the proband's birth date (optional): their age follows it, as of today
    setProbandBirthDate: (iso) => {
      const proband = get().doc.graph.individuals.find(i => i.proband);
      if (!proband) return apply({ ok: false, reason: 'Önce bir kişiyi proband yapın.' });
      return apply(ops.setBirthDate(get().doc, proband.id, iso || ''));
    },

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
    setPregnancyKind: (id, kind) => apply(ops.setPregnancyKind(get().doc, id, kind)),
    setGestationWeeks: (id, weeks) => apply(ops.setGestationWeeks(get().doc, id, weeks)),
    setFindingOnset: (personId, label, onset) => apply(findings.setFindingOnset(get().doc, personId, label, onset)),
    setChildlessness: (unionId, kind, reason) => apply(ops.setChildlessness(get().doc, unionId, kind, reason)),

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

    // ── moving a person left / right (Shift+arrows, dragging) ──
    setLeftPartner: (unionId, personId) => apply(ops.setLeftPartner(get().doc, unionId, personId)),
    moveSideways: (id, dir) => applyMove(sidewaysMove(get().pedigreeData, id, dir), id),
    dropOnto: (id, targetId) => applyMove(dropMove(get().pedigreeData, id, targetId), id),

    // ── person editor ──
    addSpouseTo: (targetId, spouseSex = 'unknown') => apply(ops.addPartner(get().doc, targetId, { sex: spouseSex })),
    // extra: { pregnancyLoss | stillbirth | ongoingPregnancy | termination | ectopic: true } for a pregnancy outcome
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

    // a new pedigree from a ready-made template (graph/templates.js): like
    // "Yeni", nothing to undo; drawn with the fewest bends
    newFromTemplate: (spec) => {
      const r = buildTemplate(starterDocument(), spec);
      if (!r.ok) return apply({ ok: false, reason: `Şablon kurulamadı: ${r.reason}` });
      zSet(() => {
        clearAllSessions();
        const ui = { gen4Pending: [] };
        return {
          doc: r.doc, ui,
          _history: [], _future: [], _viewHistory: [], _viewFuture: [],
          ...sel([]),
          dismissedWarningIds: [], openSectionId: 'proband', actionNotice: null,
          ...deriveAll(r.doc, ui, { tidy: true, reason: 'Şablon' }),
        };
      });
      return { ok: true };
    },

    /** The current pedigree as a project file (`.peditree.json`). */
    exportProjectFile: () => serializeDocument({ ...get().doc, layoutHints: hintsFromNodes(get().pedigreeData.nodes) }),

    /**
     * "Konumlandır": a fresh layout of the whole pedigree, ignoring the
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
      const doc = withDocId(withBirthDateAges(withoutHints(parsed.doc)));
      let derived;
      try {
        derived = deriveAll(doc, get().ui, prevNodes ? { prevNodes, frozen: true } : null);
      } catch (err) {
        // a file that passes the checks but cannot be drawn leaves the open pedigree as it is
        console.warn('[openProjectFile] could not draw the file:', err);
        return apply({ ok: false, reason: 'Dosyadaki pedigri çizilemedi, açılmadı.' });
      }
      const result = apply({ ok: true, doc }, sel([]), derived);
      if (parsed.migrated) zSet({ actionNotice: { message: 'Eski biçimdeki dosya yeni veri biçimine taşınarak açıldı.', kind: 'info', at: Date.now() } });
      return { ...result, migrated: parsed.migrated };
    },

    // a PED file from a lab or another tool: drawn afresh, one undo step
    importPedFile: (text) => {
      const r = fromPed(text);
      if (!r.ok) return apply({ ok: false, reason: r.reason });
      let derived;
      try {
        derived = deriveAll(r.doc, get().ui, { tidy: true, reason: 'PED dosyası' });
      } catch (err) {
        console.warn('[importPedFile] could not draw the file:', err);
        return apply({ ok: false, reason: 'PED dosyasındaki aile çizilemedi, açılmadı.' });
      }
      const result = apply({ ok: true, doc: withDocId(r.doc) }, sel([]), derived);
      zSet({ actionNotice: { message: r.notice, kind: 'info', at: Date.now() } });
      return result;
    },

    // ── undo / redo ──
    undo: () => zSet((state) => {
      const history = state._history || [];
      if (history.length === 0) return {};
      const prev = withName(history[history.length - 1], state.doc);
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
      const next = withName(future[future.length - 1], state.doc);
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

/**
 * Leaving the page loses what was not downloaded (autosave is per tab):
 * ask whenever the pedigree is not the blank starter and differs from what
 * was last downloaded — also when only the patient's name was typed, or the
 * pedigree came back from the session after a reload (audit 2026-10-25: it
 * used to ask only when there was something to undo).
 */
let starterJson = null;
export function needsLeaveWarning(doc, downloadedDoc) {
  if (!doc || doc === downloadedDoc) return false;
  if (!starterJson) starterJson = JSON.stringify(starterDocument().graph);
  return !!(doc.patientName && doc.patientName.trim()) || JSON.stringify(doc.graph) !== starterJson;
}

// ── Autosave (debounced) ──
let saveTimer = null;
function saveNow() {
  saveTimer = null;
  const st = usePedigreeStore.getState();
  const ok = saveDocument({ ...st.doc, layoutHints: hintsFromNodes(st.pedigreeData.nodes) });
  // shown on the page while it lasts (audit 2026-10-25: it used to fail silently)
  if (!!st.autosaveFailed !== !ok) usePedigreeStore.setState({ autosaveFailed: !ok });
}
usePedigreeStore.subscribe((state, prevState) => {
  // the document or only the drawing ("Yeniden Düzenle") changed: save both
  if (state.doc === prevState.doc && state.pedigreeData === prevState.pedigreeData) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
});
/** Write a pending autosave at once (the page is being left or reloaded). */
export function flushAutosave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveNow();
}
