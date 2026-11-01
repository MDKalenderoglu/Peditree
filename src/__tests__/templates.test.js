/**
 * templates.test.js — every ready-made consanguinity template (clinician
 * decision 2026-10-25) builds a valid pedigree, the parents' consanguinity
 * and degree follow from the drawing, and the drawing keeps its rules.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { starterDocument, usePedigreeStore } from '../state/usePedigreeStore';
import { buildTemplate, pathName, pathsOf, relativeName, relationInfo, relationSpec, canPair, GENERATIONS_UP, DOUBLE_FIRST_COUSINS } from '../graph/templates';
import { errorsOf, validateDocument } from '../graph/validate';
import { computeTidyLayout, bendScore } from '../layout/pcl/tidy';
import { checkAllInvariants } from '../audit/layoutInvariants';
import { checkConnectorReadability } from '../audit/connectorReadability';
import { childInbreeding } from '../graph/kinship';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });

const DEGREE = { '1,1': 'first_cousin', '2,2': 'second_cousin', '3,3': 'third_cousin', '1,2': 'first_cousin_once_removed', '2,3': 'second_cousin_once_removed' };
const PAIRS = GENERATIONS_UP.flatMap(f => GENERATIONS_UP.map(m => ({ father: f, mother: m }))).filter(canPair);

// the drawn family: valid, the parents consanguineous with the expected degree and F, the drawing clean
function checkFamily(spec, label, degree, F) {
  const r = buildTemplate(starterDocument(), spec);
  expect(r.ok, `${label}: ${r.reason}`).toBe(true);
  expect(errorsOf(validateDocument(r.doc)), label).toEqual([]);
  const u = r.doc.graph.unions.find(x => x.partners.includes('father') && x.partners.includes('mother'));
  expect(u.consanguineous, label).toBe(true);
  expect(u.consanguinityDegree, label).toBe(degree);
  expect(childInbreeding(r.doc.graph, u.id), label).toBe(F);
  const t = computeTidyLayout(r.doc.graph);
  expect(t.nodes.length, label).toBe(r.doc.graph.individuals.length);
  const drawn = { ...r.doc.graph, nodes: t.nodes, edges: t.edges };
  expect(checkAllInvariants(drawn).map(v => v.code || v.invariant || v), label).toEqual([]);
  expect(checkConnectorReadability(drawn).map(v => v.code || v), label).toEqual([]);
}

describe('consanguinity templates', () => {
  it('the choices: each parent 1–3 generations below the siblings, at most one apart', () => {
    expect(PAIRS.map(p => `${p.father},${p.mother}`)).toEqual(['1,1', '1,2', '2,1', '2,2', '2,3', '3,2', '3,3']);
    expect(pathsOf(2)).toEqual([['male', 'male'], ['male', 'female'], ['female', 'male'], ['female', 'female']]);
    expect(pathName('father', ['male', 'female'])).toBe('babanın babasının annesi');
    expect(pathName('mother', ['female'])).toBe('annenin annesi');
  });

  it('the relatives by the words of the clinic, with the way up under them', () => {
    expect(pathsOf(1).map(relativeName)).toEqual([{ main: 'Babası', way: null }, { main: 'Annesi', way: null }]);
    expect(pathsOf(2).map(relativeName)).toEqual([
      { main: 'Dedesi', way: 'babasının babası' }, { main: 'Babaannesi', way: 'babasının annesi' },
      { main: 'Dedesi', way: 'annesinin babası' }, { main: 'Anneannesi', way: 'annesinin annesi' },
    ]);
    expect(relativeName(['male', 'female', 'male'])).toEqual({ main: 'Babasının annesinin babası', way: null });
  });

  it('the relationship is named and explained', () => {
    expect(relationInfo({ father: 1, mother: 1 }, { father: ['male'], mother: ['male'] })).toMatchObject({ name: '1. derece kuzen (amca çocukları)', F: 1 / 16 });
    expect(relationInfo({ father: 1, mother: 1 }, { father: ['female'], mother: ['female'] }).name).toBe('1. derece kuzen (teyze çocukları)');
    expect(relationInfo({ father: 1, mother: 1 }, { father: ['male'], mother: ['female'] }).name).toBe('1. derece kuzen (hala–dayı çocukları)');
    expect(relationInfo({ father: 3, mother: 3 })).toMatchObject({ name: '3. derece kuzen', F: 1 / 256 });
    expect(relationInfo({ father: 1, mother: 2 })).toMatchObject({ name: '1. derece kuzenin çocuğu (bir kuşak fark)', sentence: 'Anne, babanın kuzeninin kızıdır; bir kuşak aşağıdadır.', F: 1 / 32 });
    expect(relationInfo({ father: 3, mother: 2 }).sentence).toBe('Baba, annenin 2. derece kuzeninin oğludur; bir kuşak aşağıdadır.');
  });

  for (const up of PAIRS) {
    it(`${up.father} and ${up.mother} generations up: every relative on each side builds a valid family, the right degree and F, drawn without breaking a rule`, () => {
      const info = relationInfo(up);
      for (const father of pathsOf(up.father)) for (const mother of pathsOf(up.mother)) {
        checkFamily(relationSpec({ father, mother }), `${father}|${mother}`, DEGREE[[up.father, up.mother].sort().join(',')], info.F);
      }
    }, 60000);
  }

  // clinician feedback 2026-11-01: lines of descent stepping sideways where they could run straight
  it('every cousin family opens with straight lines of descent: no jog, no lane, no line jump', () => {
    const bent = [];
    for (const up of PAIRS) for (const father of pathsOf(up.father)) for (const mother of pathsOf(up.mother)) {
      const r = buildTemplate(starterDocument(), relationSpec({ father, mother }));
      if (Math.floor(bendScore(computeTidyLayout(r.doc.graph).edges)) > 0) bent.push(`${father}|${mother}`);
    }
    expect(bent).toEqual([]);
  });

  it('double first cousins: both ready-made families', () => {
    for (const item of DOUBLE_FIRST_COUSINS) checkFamily(item.spec, item.id, 'double_first_cousin', 1 / 8);
  });

  it('the older parent of a once-removed pair is the one with the shorter way up', () => {
    expect(relationSpec({ father: ['male'], mother: ['male', 'female'] }).older).toBe('father');
    expect(relationSpec({ father: ['male', 'male', 'male'], mother: ['female', 'male'] }).older).toBe('mother');
    expect(relationSpec({ father: ['male'], mother: ['female'] }).older).toBeUndefined();
  });

  it('"Yeni" from a template: one fresh pedigree, nothing to undo', () => {
    const S = () => usePedigreeStore.getState();
    S().updateIndividual('proband', { label: 'eski' });
    S().newFromTemplate(relationSpec({ father: ['male'], mother: ['male'] }));
    expect(S().doc.graph.unions.find(x => x.id === 'U_PARENTS').consanguineous).toBe(true);
    expect(S()._history).toEqual([]);
    expect((S().integrityIssues || []).filter(i => i.severity === 'error')).toEqual([]);
  });
});
