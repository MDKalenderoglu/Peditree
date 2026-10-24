/**
 * migrate.js — schema 1 (wizardData replay) → schema 2 (graph document),
 * without data loss (docs/PEDITREE_DATA_MODEL_V2.md §2.4).
 *
 * 1. Run the v1 pipeline exactly as the v1 store does (v1pipeline.js) → G1,
 *    the graph the clinician actually saw: template persons, direct edits,
 *    "make siblings" links, deletions with placeholders, manual clinical
 *    edits, relationship backgrounds, birth orders, proband.
 * 2. The document stores G1 as its graph. Child groups v1 sorted by age get
 *    orderPolicy 'byAge' (only when their current order IS the age order —
 *    v1 applied right-panel ages after sorting), every other group keeps its
 *    order ('insertion').
 * 3. Ids: v1 ids are kept unchanged; deleted ids are retired; the direct-edit
 *    counter continues from v1's editSeq.
 * 4. The complete v1 wizardData is kept in provenance.v1Snapshot.
 * 5. Consanguinity is derived from the drawn shared ancestors
 *    (finalize.js deriveConsanguinity): v1 drew partners who share an
 *    ancestor with a single line unless someone ticked the box, and left the
 *    degree empty. The unions this changes are listed in
 *    `consanguinityDerived` — added facts, never a loss.
 * 6. Verification: the v2 derivation rules (finalize.js), which every later
 *    operation applies, must not change the graph further. Any difference is
 *    reported in `normalizations` (an empty list is the expected outcome).
 */
import { deriveV1Graph, mergeWithDefaults } from './v1pipeline';
import { createDocument } from './document';
import { finalizeGraph, deriveConsanguinity } from './finalize';
import { deriveConditionKey } from './conditionKey';
import { cloneGraph, indexGraph } from './model';
import { defaultChildOrder } from '../utils/childOrdering';

const V1_SORTED_GROUP = /^(U_PARENTS|U_MOTHER_OTHER_\d+|U_FATHER_OTHER_\d+|U_(GP_)?(MAT|PAT)_(UNCLE|AUNT)_\d+|U_GEN4_\d+)$/;

export function migrateV1ToV2(rawWizardData, { now = new Date().toISOString() } = {}) {
  const snapshot = JSON.parse(JSON.stringify(rawWizardData || {}));
  const wd = mergeWithDefaults(JSON.parse(JSON.stringify(rawWizardData || {})));
  let graph;
  try {
    ({ graph } = deriveV1Graph(wd));
  } catch (err) {
    return { ok: false, reason: `Eski kayıt okunamadı (v1 grafiği oluşturulamadı): ${err && err.message}` };
  }

  const idx = indexGraph({ ...graph, socialParentLinks: [] });
  for (const rel of graph.parentChildRelationships) {
    const kids = rel.children.map((id) => idx.byId.get(id)).filter(Boolean);
    const ageOrdered = defaultChildOrder(kids).join('|') === rel.children.join('|');
    rel.orderPolicy = V1_SORTED_GROUP.test(rel.unionId) && ageOrdered ? 'byAge' : 'insertion';
  }
  graph.socialParentLinks = [];
  const consanguinityDerived = deriveConsanguinity(graph);
  deriveConditionKey(graph); // legend from the people's conditions (v1 had none stored)

  const editSeq = Number.isInteger(wd.editSeq) ? wd.editSeq : 0;
  const retired = [...new Set((wd.deletedIndividualIds || []).filter((id) => !idx.byId.has(id)))].sort();
  const doc = createDocument(graph, {
    wizardAnchorId: 'proband',
    ids: { counters: editSeq > 0 ? { edit: editSeq - 1 } : {}, retired },
    provenance: { migratedFrom: 1, migratedAt: now, v1Snapshot: snapshot },
  });
  doc.createdAt = snapshot.savedAt || now;

  const normalizations = semanticDiff(doc.graph, finalizeGraph(cloneGraph(doc.graph), { anchorId: doc.wizardAnchorId }));
  return { ok: true, doc, normalizations, consanguinityDerived };
}

// Absent and empty-default values ('' / [] / false / null) mean the same
// thing to a clinician (the v1 live session filled empty defaults that a v1
// reload did not), so they are dropped before comparing.
const isEmptyDefault = (v) => v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0);
const stable = (o) => {
  const keys = Object.keys(o).filter((k) => !isEmptyDefault(o[k])).sort();
  return JSON.stringify(Object.fromEntries(keys.map((k) => [k, o[k]])));
};

/**
 * Differences between two graphs that a clinician could see: persons and
 * every field on them, unions and their fields, biological and social
 * parent links with child order. Empty list = semantically equal.
 */
export function semanticDiff(a, b) {
  const out = [];
  const cmpById = (kind, xs, ys, keyOf, fmt) => {
    const mx = new Map(xs.map((x) => [keyOf(x), x]));
    const my = new Map(ys.map((y) => [keyOf(y), y]));
    for (const [k, x] of mx) {
      if (!my.has(k)) { out.push(`${kind} ${k}: yalnız ilk grafikte`); continue; }
      const fx = fmt(x), fy = fmt(my.get(k));
      if (fx !== fy) out.push(`${kind} ${k}: ${fx} ≠ ${fy}`);
    }
    for (const k of my.keys()) if (!mx.has(k)) out.push(`${kind} ${k}: yalnız ikinci grafikte`);
  };
  cmpById('kişi', a.individuals, b.individuals, (i) => i.id, (i) => stable(i));
  cmpById('birliktelik', a.unions, b.unions, (u) => u.id, (u) => stable(u));
  cmpById('ebeveyn-çocuk', a.parentChildRelationships, b.parentChildRelationships, (r) => r.unionId,
    (r) => `${r.children.join(',')}${r.birthOrderExplicit ? ' (açık sıra)' : ''}${(r.multiples || []).map((m) => ` [${m.zygosity}: ${m.children.join(',')}]`).join('')}`);
  cmpById('lejant', a.conditionKey || [], b.conditionKey || [], (c) => c.id, (c) => c.label);
  cmpById('sosyal bağ', a.socialParentLinks || [], b.socialParentLinks || [], (l) => `${l.childId}|${l.unionId}`, (l) => l.kind);
  return out;
}
