/**
 * document.js — the persisted schema v2 document (docs/PEDITREE_DATA_MODEL_V2.md §2.2).
 */
import { SCHEMA_VERSION, cloneGraph } from './model';
import { emptyIds } from './ids';

/**
 * Wrap a graph into a v2 document. The graph is copied; derived fields are
 * kept as given (callers that need them recomputed run an operation, which
 * finalizes).
 */
export function createDocument(graph, { wizardAnchorId = 'proband', ids = emptyIds(), provenance = {} } = {}) {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    graph: cloneGraph(graph),
    ids: { counters: { ...(ids.counters || {}) }, retired: [...(ids.retired || [])] },
    wizardAnchorId,
    provenance,
  };
}

/** Structural shape check for anything claiming to be a v2 document. */
export function isDocumentV2(x) {
  return !!x && typeof x === 'object' && x.schemaVersion === SCHEMA_VERSION
    && x.graph && Array.isArray(x.graph.individuals) && Array.isArray(x.graph.unions)
    && Array.isArray(x.graph.parentChildRelationships);
}
