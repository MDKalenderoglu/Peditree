import { create } from 'zustand';
import { buildPedigreeFromWizard } from '../builder/pedigreeBuilderFromWizard';
import { validatePedigree } from '../utils/validators';
import { computePedigreeLayout } from '../utils/pedigreeLayout';
import { auditPedigreeGraph } from '../utils/graphIntegrity';
import { auditLayoutIntegrity } from '../utils/layoutIntegrity';
import { saveSession, loadSession, clearSession } from '../utils/persistence';

/**
 * Tag each issue with which auditor produced it, so callers (export gating,
 * the UI banner) can tell a semantic graph problem from a geometry/rendering
 * problem apart without re-deriving it from the `code` string.
 */
function tagIssues(issues, source) {
  return issues.map(issue => ({ ...issue, source }));
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

export const usePedigreeStore = create((set, get) => ({
  ...bootstrapState(),

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

  /** "New pedigree" — clears the saved session and resets to a clean wizard state. */
  resetPedigree: () => set(() => {
    clearSession();
    const clean = cloneInitialState();
    return { wizardData: clean, ...generateDerivedData(clean, EMPTY_GRAPH) };
  }),
}));

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
