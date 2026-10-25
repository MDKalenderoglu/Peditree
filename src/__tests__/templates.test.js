/**
 * templates.test.js — every ready-made consanguinity template (clinician
 * decision 2026-10-25) builds a valid pedigree, the parents' consanguinity
 * and degree follow from the drawing, and the drawing keeps its rules.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { starterDocument, usePedigreeStore } from '../state/usePedigreeStore';
import { buildTemplate, TEMPLATE_GROUPS, pathName } from '../graph/templates';
import { errorsOf, validateDocument } from '../graph/validate';
import { computeTidyLayout } from '../layout/pcl/tidy';
import { checkAllInvariants } from '../audit/layoutInvariants';
import { checkConnectorReadability } from '../audit/connectorReadability';
import { childInbreeding } from '../graph/kinship';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });

const DEGREE = { first: 'first_cousin', second: 'second_cousin', once: 'first_cousin_once_removed', double: 'double_first_cousin' };
const F = { first: 1 / 16, second: 1 / 64, once: 1 / 32, double: 1 / 8 };

describe('consanguinity templates', () => {
  it('the catalogue: 4 first, 16 second, 16 once removed, 2 double', () => {
    expect(TEMPLATE_GROUPS.map(g => g.items.length)).toEqual([4, 16, 16, 2]);
    expect(new Set(TEMPLATE_GROUPS.flatMap(g => g.items.map(i => i.id))).size).toBe(38);
    expect(pathName('father', ['male', 'female'])).toBe('babanın babasının annesi');
    expect(pathName('mother', ['female'])).toBe('annenin annesi');
  });

  for (const g of TEMPLATE_GROUPS) {
    it(`${g.label}: every one valid, the right degree and F, drawn without breaking a rule`, () => {
      for (const item of g.items) {
        const r = buildTemplate(starterDocument(), item.spec);
        expect(r.ok, `${item.id}: ${r.reason}`).toBe(true);
        expect(errorsOf(validateDocument(r.doc)), item.id).toEqual([]);
        const u = r.doc.graph.unions.find(x => x.partners.includes('father') && x.partners.includes('mother'));
        expect(u.consanguineous, item.id).toBe(true);
        expect(u.consanguinityDegree, item.id).toBe(DEGREE[g.id]);
        expect(childInbreeding(r.doc.graph, u.id), item.id).toBe(F[g.id]);
        const t = computeTidyLayout(r.doc.graph);
        expect(t.nodes.length, item.id).toBe(r.doc.graph.individuals.length);
        const drawn = { ...r.doc.graph, nodes: t.nodes, edges: t.edges };
        expect(checkAllInvariants(drawn).map(v => v.code || v.invariant || v), item.id).toEqual([]);
        expect(checkConnectorReadability(drawn).map(v => v.code || v), item.id).toEqual([]);
      }
    });
  }

  it('a first-cousin template is named the clinic way', () => {
    expect(TEMPLATE_GROUPS[0].items.map(i => i.label.split(' — ')[0])).toEqual(['Amca çocukları', 'Hala–dayı çocukları', 'Hala–dayı çocukları', 'Teyze çocukları']);
  });

  it('"Yeni" from a template: one fresh pedigree, nothing to undo', () => {
    const S = () => usePedigreeStore.getState();
    S().updateIndividual('proband', { label: 'eski' });
    S().newFromTemplate(TEMPLATE_GROUPS[0].items[0].spec);
    expect(S().doc.graph.unions.find(x => x.id === 'U_PARENTS').consanguineous).toBe(true);
    expect(S()._history).toEqual([]);
    expect((S().integrityIssues || []).filter(i => i.severity === 'error')).toEqual([]);
  });
});
