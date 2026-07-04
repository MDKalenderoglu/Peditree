/**
 * helpers.js — shared test utilities for pedigree test fixtures.
 */
import { buildPedigreeFromWizard } from '../builder/pedigreeBuilderFromWizard';
import { auditPedigreeGraph } from '../utils/graphIntegrity';

/**
 * Base wizard state used by all test cases.
 * Returns a deep copy each time — safe to mutate.
 */
export function baseState() {
  return {
    proband: { sex: 'male', age: '30' },
    siblings: {
      male: [], female: [], unknown: [],
      pregnancyLoss: 0, deceased: 0,
      siblingOrder: null,
    },
    parents: {
      motherExists: true, motherAge: '55',
      fatherExists: true, fatherAge: '58',
      consanguineous: false,
      consanguinityDegree: 'yok',
      consanguinityPath: 'unknown',
      relationshipStatus: 'together',
      motherOtherUnions: [],
      fatherOtherUnions: [],
    },
    maternalRelatives: { uncles: [], aunts: [] },
    paternalRelatives: { uncles: [], aunts: [] },
    gen4: [],
  };
}

/**
 * Build graph and run all audits. Returns { graph, issues, genMap }.
 */
export function buildAndAudit(state) {
  const graph = buildPedigreeFromWizard(state);
  const issues = auditPedigreeGraph(graph);

  const genMap = {};
  for (const ind of graph.individuals) {
    genMap[ind.id] = ind.generation;
  }

  return { graph, issues, genMap };
}

/**
 * Assert no integrity errors (severity === 'error') in audit issues.
 */
export function assertNoErrors(issues) {
  const errors = issues.filter(i => i.severity === 'error');
  if (errors.length > 0) {
    const details = errors.map(e => `[${e.code}] ${e.message}`).join('\n');
    throw new Error(`Expected zero integrity errors, got ${errors.length}:\n${details}`);
  }
}

/**
 * Assert no duplicate individual IDs in the graph.
 */
export function assertNoDuplicateIds(graph) {
  const seen = new Set();
  for (const ind of graph.individuals) {
    if (seen.has(ind.id)) {
      throw new Error(`Duplicate individual ID: '${ind.id}'`);
    }
    seen.add(ind.id);
  }
}

/**
 * Assert no child belongs to multiple parent-child relationships.
 */
export function assertSingleParent(graph) {
  const childSeen = new Map();
  for (const rel of graph.parentChildRelationships) {
    for (const cid of rel.children) {
      if (childSeen.has(cid)) {
        throw new Error(
          `Child '${cid}' in multiple unions: '${childSeen.get(cid)}' and '${rel.unionId}'`
        );
      }
      childSeen.set(cid, rel.unionId);
    }
  }
}

/**
 * Assert exactly one proband exists.
 */
export function assertOneProband(graph) {
  const probands = graph.individuals.filter(i => i.proband);
  if (probands.length !== 1) {
    throw new Error(`Expected exactly 1 proband, got ${probands.length}`);
  }
}

/**
 * Get children IDs for a given union (in order).
 */
export function childrenOfUnion(graph, unionId) {
  const rel = graph.parentChildRelationships.find(r => r.unionId === unionId);
  return rel ? rel.children : [];
}

/**
 * Find an individual by ID.
 */
export function findInd(graph, id) {
  return graph.individuals.find(i => i.id === id);
}
