/**
 * fixtureUtils.js — canonical form, content hash and structural signature
 * for frozen regression pedigrees (src/__tests__/regression/).
 */
import { createHash } from 'node:crypto';

/** The semantic graph only (no layout fields), keys in a stable order. */
export function canonicalGraph(pd) {
  const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
  return {
    individuals: (pd.individuals || []).map(i => {
      const { x, y, ...rest } = i; // eslint-disable-line no-unused-vars
      return sortKeys(rest);
    }),
    unions: (pd.unions || []).map(sortKeys),
    parentChildRelationships: (pd.parentChildRelationships || []).map(sortKeys),
  };
}

export function graphSha256(graph) {
  return createHash('sha256').update(JSON.stringify(graph)).digest('hex');
}

export function structuralSignature(graph) {
  const hasParents = new Set(graph.parentChildRelationships.flatMap(r => r.children));
  return {
    individuals: graph.individuals.length,
    unions: graph.unions.length,
    crossFamilyUnions: graph.unions.filter(u => u.partners.every(p => hasParents.has(p))).length,
    generations: new Set(graph.individuals.map(i => i.generation)).size,
  };
}
