/**
 * v1pipeline.js — the v1 (schema 1) replay pipeline, extracted verbatim from
 * usePedigreeStore.js so the store and the v1 → v2 migration
 * (src/graph/migrate.js) derive EXACTLY the same graph from a saved
 * `wizardData`:
 *
 *   wizardData ─ buildPedigreeFromWizard ─ pruneStaleOverlays
 *              ─ applyIndividualDeletions ─ manual-edit merge ─► graph
 *
 * Pure apart from the documented in-place updates of the passed wizardData
 * (childOrders migration, stale-overlay pruning).
 */
import { buildPedigreeFromWizard } from '../builder/pedigreeBuilderFromWizard';
import { applyIndividualDeletions } from '../utils/graphDeletion';
import { auditPedigreeGraph } from '../utils/graphIntegrity';

const hasOwn = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key);

/**
 * v0.5 Faz 2a (DM-5/DM-6): ids of wizard-derived individuals are positional
 * (`mat_uncle_2` is "the third maternal uncle"), so once a count goes down
 * and up again a *different* person receives the same id. Any per-person
 * overlay still keyed by that id (manual edits — affected, label, age — a
 * deletion tombstone, direct edits hanging off them, custom sibling links)
 * would silently re-attach to the new person. Prune every overlay entry whose
 * id the builder no longer produces, using the pre-deletion graph so the
 * deletion overlay itself does not prune its own tombstones.
 *
 * Mutates `wizardData` (always a fresh clone owned by the calling action).
 */
export function pruneStaleOverlays(wizardData, builtGraph) {
  const liveIds = new Set(builtGraph.individuals.map(i => i.id));
  const liveUnionIds = new Set(builtGraph.unions.map(u => u.id));
  if (wizardData.manualEdits) {
    for (const id of Object.keys(wizardData.manualEdits)) {
      if (!liveIds.has(id)) delete wizardData.manualEdits[id];
    }
  }
  if (Array.isArray(wizardData.deletedIndividualIds)) {
    wizardData.deletedIndividualIds = wizardData.deletedIndividualIds.filter(id => liveIds.has(id));
  }
  if (Array.isArray(wizardData.graphEdits)) {
    // An edit whose created entity is absent never materialised (its target
    // or union is gone); keeping it would resurrect it on whoever reuses the
    // target id later.
    wizardData.graphEdits = wizardData.graphEdits.filter(e => {
      if (e.type === 'addSpouse') return liveIds.has(e.spouseId);
      if (e.type === 'addChild') return liveIds.has(e.childId);
      if (e.type === 'linkPartners') return liveUnionIds.has(e.unionId);
      if (e.type === 'addParents') return liveIds.has(e.parent1Id);
      return true;
    });
  }
  if (Array.isArray(wizardData.customConsanguinity)) {
    wizardData.customConsanguinity = wizardData.customConsanguinity.filter(
      link => liveIds.has(link.person1) && liveIds.has(link.person2)
    );
  }
}


export const initialState = {
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

export function migrateSiblingOrder(wizardData) {
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


export const EMPTY_GRAPH = { individuals: [], unions: [], parentChildRelationships: [], nodes: [], edges: [] };

export function cloneInitialState() {
  return JSON.parse(JSON.stringify(initialState));
}

/**
 * Merge a persisted wizardData object over a fresh default state, so a save
 * from an older schema version (missing a field this version added, e.g.
 * `probandId` or `manualEdits`) still produces a structurally complete
 * wizardData rather than a builder crash on a missing key.
 */
export function mergeWithDefaults(loaded) {
  const base = cloneInitialState();
  if (!loaded || typeof loaded !== 'object') return base;

  const nestedObjectKeys = [
    'proband', 'siblings', 'parents', 'maternalRelatives', 'paternalRelatives',
    'maternalGPRelatives', 'paternalGPRelatives', 'greatGrandparents',
    'childOrders', 'manualEdits', 'consanguineousUnions', 'unionRelationshipBackgrounds',
  ];
  const arrayKeys = ['customConsanguinity', 'gen4', 'graphEdits', 'deletedIndividualIds'];

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


export function deriveV1Graph(wizardData, currentPedigreeData = EMPTY_GRAPH) {
  // Ensure childOrders is populated (migration + initialization)
  if (!wizardData.childOrders) {
    wizardData.childOrders = {};
  }
  // Run migration from legacy siblingOrder if needed
  wizardData.childOrders = migrateSiblingOrder(wizardData);

  let newGraph = buildPedigreeFromWizard(wizardData);
  // Pruned entries never contributed anything to this build (their target
  // ids are absent), so the graph does not need to be rebuilt afterwards.
  pruneStaleOverlays(wizardData, newGraph);

  // v0.3a.2 generic "delete anyone" overlay — applied post-build, before
  // any audit runs, so the audit reflects the pedigree the user actually
  // sees (post-deletion), not a stale pre-deletion state. See
  // graphDeletion.js for what this does and does not do.
  if (wizardData.deletedIndividualIds && wizardData.deletedIndividualIds.length > 0) {
    newGraph = applyIndividualDeletions(newGraph, wizardData.deletedIndividualIds);
  }

  // ── Graph integrity audit (detect-only, never mutates) ──
  const graphIssues = auditPedigreeGraph(newGraph);

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
  const mergedIndividuals = newGraph.individuals.map(builtInd => {
    const existing = (currentPedigreeData.individuals || []).find(i => i.id === builtInd.id);
    const persisted = manualEditsOverlay[builtInd.id];
    // v0.5 Faz 2a (DM-3): age and sex are taken ONLY from explicit editor
    // edits (the persisted overlay), never from the previous snapshot —
    // otherwise a stale snapshot value would shadow a later wizard edit.
    // Previously neither was merged at all, so an age typed in the right
    // panel vanished on the next structural rebuild.
    const newInd = {
      ...builtInd,
      ...(hasOwn(persisted, 'age') ? { age: persisted.age } : {}),
      ...(hasOwn(persisted, 'sex') ? { sex: persisted.sex } : {}),
    };
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
  return { graph: newGraph, graphIssues };
}
