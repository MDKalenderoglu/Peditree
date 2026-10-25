/**
 * validate.js — structural invariants of a schema v2 document
 * (docs/PEDITREE_DATA_MODEL_V2.md §2.3). Every graph operation runs this
 * before and after the mutation and refuses any change that introduces a
 * new error, so the stored graph can never become structurally invalid
 * through the editor.
 *
 * Issues: { severity: 'error' | 'warning', code, message (Turkish), ids }
 */
import { auditPedigreeGraph } from '../utils/graphIntegrity';
import { SOCIAL_LINK_KINDS, indexGraph } from './model';
import { multiplesWarnings } from './multiples';
import { carrierFindingIssues } from './conditionKey';

export function validateGraphStructure(graph, { retired = [] } = {}) {
  const out = [];
  const err = (code, message, ids = []) => out.push({ severity: 'error', code, message, ids });
  const idx = indexGraph(graph);
  const retiredSet = new Set(retired);

  for (const ind of graph.individuals) {
    if (retiredSet.has(ind.id)) err('RETIRED_ID_REUSED', `Emekliye ayrılmış kimlik yeniden kullanılmış: ${ind.id}`, [ind.id]);
  }

  const pairKeys = new Set();
  for (const u of graph.unions) {
    const [a, b] = u.partners || [];
    const key = [a, b].sort().join('|');
    if (a && b && a !== b && pairKeys.has(key)) err('DUPLICATE_PARTNERSHIP', `Aynı iki kişi için ikinci bir birliktelik var (${u.id}).`, [u.id]);
    pairKeys.add(key);
    for (const p of [a, b]) {
      if (p && idx.bioParentUnion.get(p) === u.id) err('CHILD_IS_OWN_PARENT', `Bir kişi kendi ebeveyn birliğinin partneri olamaz (${p}).`, [p, u.id]);
    }
  }

  // Ancestry cycle: following biological parent links upward must never
  // return to the start (DM-10).
  const state = new Map(); // id -> 1 visiting, 2 done
  const parentsOf = (id) => {
    const uid = idx.bioParentUnion.get(id);
    return uid ? (idx.unionById.get(uid)?.partners || []) : [];
  };
  const visit = (id, path) => {
    state.set(id, 1);
    for (const p of parentsOf(id)) {
      if (state.get(p) === 1) {
        err('ANCESTRY_CYCLE', `Atalık döngüsü: bir kişi kendi atası olamaz (${[...path, p].join(' → ')}).`, [id, p]);
        continue;
      }
      if (!state.has(p)) visit(p, [...path, p]);
    }
    state.set(id, 2);
  };
  for (const ind of graph.individuals) if (!state.has(ind.id)) visit(ind.id, [ind.id]);

  const seenLink = new Set();
  for (const l of graph.socialParentLinks || []) {
    const ids = [l.childId, l.unionId];
    if (!idx.byId.has(l.childId)) err('SOCIAL_LINK_MISSING_CHILD', `Sosyal ebeveynlik bağındaki çocuk grafikte yok (${l.childId}).`, ids);
    if (!idx.unionById.has(l.unionId)) err('SOCIAL_LINK_MISSING_UNION', `Sosyal ebeveynlik bağındaki birliktelik grafikte yok (${l.unionId}).`, ids);
    if (!SOCIAL_LINK_KINDS.includes(l.kind)) err('SOCIAL_LINK_KIND', `Bilinmeyen sosyal ebeveynlik türü: ${l.kind}.`, ids);
    if (idx.bioParentUnion.get(l.childId) === l.unionId) err('SOCIAL_LINK_DUPLICATES_BIOLOGICAL', 'Aynı ebeveyn birliği hem biyolojik hem sosyal ebeveyn olarak bağlı.', ids);
    if ((idx.unionById.get(l.unionId)?.partners || []).includes(l.childId)) err('CHILD_IS_OWN_PARENT', `Bir kişi kendi sosyal ebeveyn birliğinin partneri olamaz (${l.childId}).`, ids);
    const key = `${l.childId}|${l.unionId}`;
    if (seenLink.has(key)) err('SOCIAL_LINK_DUPLICATE', 'Aynı sosyal ebeveynlik bağı iki kez kayıtlı.', ids);
    seenLink.add(key);
  }
  return out;
}

/** Structural invariants + the existing semantic graph audit. */
export function validateDocument(doc) {
  const g = doc.graph;
  return [
    ...validateGraphStructure(g, { retired: doc.ids?.retired || [] }),
    ...auditPedigreeGraph(g),
    ...multiplesWarnings(g),
    ...carrierFindingIssues(g),
  ];
}

export const errorsOf = (issues) => issues.filter((i) => i.severity === 'error');
