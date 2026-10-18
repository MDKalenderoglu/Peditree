/**
 * clinicalFixtures.test.js — the stress fixtures must themselves be valid
 * pedigrees, or engine benchmarks built on them are meaningless.
 */
import { describe, it, expect } from 'vitest';
import { CLINICAL_FIXTURES } from '../audit/clinicalFixtures';
import { auditPedigreeGraph } from '../utils/graphIntegrity';

function ancestors(graph, id) {
  const parentUnionOf = new Map();
  for (const r of graph.parentChildRelationships) for (const c of r.children) parentUnionOf.set(c, r.unionId);
  const unionById = new Map(graph.unions.map(u => [u.id, u]));
  const seen = new Set();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    const uid = parentUnionOf.get(cur);
    if (!uid) continue;
    for (const pid of unionById.get(uid).partners) if (!seen.has(pid)) { seen.add(pid); stack.push(pid); }
  }
  return seen;
}

describe('clinical stress fixtures are valid pedigrees', () => {
  for (const f of CLINICAL_FIXTURES) {
    it(`${f.id} ${f.name}`, () => {
      const g = f.build();
      const ids = g.individuals.map(i => i.id);
      expect(new Set(ids).size).toBe(ids.length);
      const byId = new Map(g.individuals.map(i => [i.id, i]));
      const childCount = new Map();
      for (const r of g.parentChildRelationships) {
        const un = g.unions.find(u => u.id === r.unionId);
        expect(un, `PCR ${r.unionId} has a union`).toBeTruthy();
        const pg = byId.get(un.partners[0]).generation;
        for (const c of r.children) {
          childCount.set(c, (childCount.get(c) || 0) + 1);
          expect(byId.get(c).generation, `${c} is one generation below its parents`).toBe(pg + 1);
        }
      }
      for (const n of childCount.values()) expect(n).toBe(1);
      for (const un of g.unions) {
        const [a, b] = un.partners.map(pid => byId.get(pid));
        expect(a && b).toBeTruthy();
        expect(a.generation).toBe(b.generation);
        if (un.consanguinityStatus === 'known_supported') {
          const shared = [...ancestors(g, a.id)].filter(x => ancestors(g, b.id).has(x));
          expect(shared.length, `${un.id} shares an ancestor`).toBeGreaterThan(0);
        }
      }
      const errors = auditPedigreeGraph(g).filter(i => i.severity === 'error');
      expect(errors.map(e => e.code)).toEqual([]);
    });
  }
});
