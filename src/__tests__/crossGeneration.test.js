/**
 * crossGeneration.test.js — partners from different generations (clinician
 * decision 2026-10-24, notation spec §8; any number of generations apart since
 * 2026-11-11): never between an ancestor and a descendant, never siblings; each partner stays on their own
 * generation row, the relationship line steps down between the rows, the
 * children are one generation below the lower partner.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { usePedigreeStore, computeUnionCreationPlan } from '../state/usePedigreeStore';
import { checkAllInvariants } from '../audit/layoutInvariants';
import { checkConnectorReadability } from '../audit/connectorReadability';
import { kinshipOf } from '../graph/kinship';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
beforeEach(() => S().resetPedigree());

const S = () => usePedigreeStore.getState();
const person = (id) => S().doc.graph.individuals.find(i => i.id === id);
const node = (id) => S().pedigreeData.nodes.find(n => n.id === id);
const errors = () => (S().integrityIssues || []).filter(i => i.severity === 'error');

/** Mother's brother marries the proband's sister (uncle and niece). */
function uncleAndNiece() {
  S().updateRelativeCount('maternalRelatives', 'uncles', 1);
  S().addSiblingOfCategory('female');
  const uncle = S().wizardData.maternalRelatives.uncles[0].id;
  const niece = S().wizardData.siblings.female[0].id;
  S().createUnionBetween(uncle, niece);
  const u = S().doc.graph.unions.find(x => x.partners.includes(uncle) && x.partners.includes(niece));
  return { uncle, niece, u };
}

describe('who may become partners across generations', () => {
  it('one generation apart: allowed, marked crossGeneration', () => {
    S().updateRelativeCount('maternalRelatives', 'uncles', 1);
    S().addSiblingOfCategory('female');
    const plan = computeUnionCreationPlan(S().pedigreeData, S().wizardData.maternalRelatives.uncles[0].id, S().wizardData.siblings.female[0].id);
    expect(plan).toEqual({ ok: true, crossGeneration: true });
  });

  it('two generations apart: allowed (clinician 2026-11-11); ancestor and descendant, or siblings: refused', () => {
    S().updateRelativeCount('maternalGPRelatives', 'uncles', 1);
    S().addSiblingOfCategory('female');
    const greatUncle = S().wizardData.maternalGPRelatives.uncles[0].id;
    expect(computeUnionCreationPlan(S().pedigreeData, greatUncle, S().wizardData.siblings.female[0].id)).toEqual({ ok: true, crossGeneration: true });
    // the proband and the grandmother: ancestor and descendant, refused with a plain reason
    const anc = computeUnionCreationPlan(S().pedigreeData, 'proband', 'mat_gm');
    expect(anc.ok).toBe(false);
    expect(anc.reason).toMatch(/doğrudan soy bağı/);
    S().addGen4('proband');
    S().updateGen4(0, 'female', 1);
    const daughter = S().wizardData.gen4[0].childIds[0];
    // the proband's father and the proband's daughter: grandfather and granddaughter
    expect(computeUnionCreationPlan(S().pedigreeData, 'father', daughter).ok).toBe(false);
    S().addSiblingOfCategory('male');
    expect(computeUnionCreationPlan(S().pedigreeData, S().wizardData.siblings.male[0].id, S().wizardData.siblings.female[0].id).ok).toBe(false);
  });

  it('same generation stays a plain union (no flag)', () => {
    S().addSpouseTo('proband', 'female');
    const u = S().doc.graph.unions.find(x => x.partners.includes('proband') && x.id !== S().wizardData.parents.unionId);
    expect(u.crossGeneration).toBeUndefined();
  });
});

describe('uncle and niece: model, generations, drawing', () => {
  it('partners keep their generations; the child is one below the niece; consanguinity from the drawing', () => {
    const { uncle, niece, u } = uncleAndNiece();
    expect(u.crossGeneration).toBe(true);
    S().addChildToUnion(u.id, 'male');
    const kid = S().doc.graph.parentChildRelationships.find(r => r.unionId === u.id).children[0];
    expect([person(uncle).generation, person(niece).generation, person(kid).generation]).toEqual([2, 3, 4]);
    expect(union(u.id).consanguinityDegree).toBe('avuncular');
    expect(kinshipOf(S().doc.graph, uncle, niece).label).toMatch(/yeğen/);
    expect(errors()).toEqual([]);
  });

  it('each partner on their own row, no stand-in drawn, a stepped line owned by the couple; layout audits clean', () => {
    const { uncle, niece, u } = uncleAndNiece();
    S().addChildToUnion(u.id, 'female');
    expect(node(uncle).y).toBeLessThan(node(niece).y);
    expect(S().pedigreeData.nodes.some(n => n.crossGenerationGhost)).toBe(false);
    const own = S().pedigreeData.edges.filter(e => e.unionId === u.id);
    const stepped = own.filter(e => e.crossGeneration);
    expect(stepped.length).toBeGreaterThanOrEqual(3);
    // the stepped line starts beside the uncle and ends on the niece's row
    expect(Math.min(...stepped.map(e => Math.min(e.y1, e.y2)))).toBe(node(uncle).y);
    expect(Math.max(...stepped.map(e => Math.max(e.y1, e.y2)))).toBe(node(niece).y);
    expect(own.some(e => e.type === 'parentChildDrop')).toBe(true);
    expect(checkAllInvariants(S().pedigreeData)).toEqual([]);
    expect(checkConnectorReadability(S().pedigreeData)).toEqual([]);
  });

  it('divorce slash, undo and save → load keep working', () => {
    const { u } = uncleAndNiece();
    S().setUnionStatus(u.id, 'divorced');
    expect(S().pedigreeData.edges.some(e => e.type === 'divorceSlash' && e.unionId === u.id)).toBe(true);
    const file = S().exportProjectFile();
    S().resetPedigree();
    S().openProjectFile(file);
    expect(union(u.id)).toMatchObject({ crossGeneration: true, status: 'divorced' });
    expect(errors()).toEqual([]);
    S().undo();
    S().undo();
    expect(S().doc.graph.unions.some(x => x.id === u.id)).toBe(false);
  });
});

describe('great-uncle and great-niece: two generations apart', () => {
  function greatUncleAndNiece() {
    S().updateRelativeCount('maternalGPRelatives', 'uncles', 1);
    S().addSiblingOfCategory('female');
    const gu = S().wizardData.maternalGPRelatives.uncles[0].id;
    const niece = S().wizardData.siblings.female[0].id;
    S().createUnionBetween(gu, niece);
    const u = S().doc.graph.unions.find(x => x.partners.includes(gu) && x.partners.includes(niece));
    return { gu, niece, u };
  }
  it('generations kept, child below the niece, F from the drawing, audits clean', () => {
    const { gu, niece, u } = greatUncleAndNiece();
    expect(u.crossGeneration).toBe(true);
    S().addChildToUnion(u.id, 'male');
    const kid = S().doc.graph.parentChildRelationships.find(r => r.unionId === u.id).children[0];
    expect([person(gu).generation, person(niece).generation, person(kid).generation]).toEqual([1, 3, 4]);
    expect(union(u.id).consanguineous).toBe(true);
    expect(errors()).toEqual([]);
    expect(checkAllInvariants(S().pedigreeData)).toEqual([]);
    expect(checkConnectorReadability(S().pedigreeData)).toEqual([]);
  });
  it('the line runs straight down through the row in between: one vertical, nobody on its way', () => {
    const { gu, niece, u } = greatUncleAndNiece();
    S().addChildToUnion(u.id, 'female');
    const own = S().pedigreeData.edges.filter(e => e.unionId === u.id && e.crossGeneration);
    const verticals = own.filter(e => e.x1 === e.x2 && e.y1 !== e.y2);
    expect(verticals).toHaveLength(1);
    const [v] = verticals;
    expect(Math.min(v.y1, v.y2)).toBe(node(gu).y);
    expect(Math.max(v.y1, v.y2)).toBe(node(niece).y);
    const between = S().pedigreeData.nodes.filter(n => n.y > node(gu).y && n.y < node(niece).y);
    expect(between.length).toBeGreaterThan(0);
    for (const n of between) expect(Math.abs(n.x - v.x1)).toBeGreaterThanOrEqual(28);
  });
});

describe('stability (KI-2) of a cross-generation edit', () => {
  it('making the uncle and the niece partners moves nobody else already drawn', () => {
    S().updateRelativeCount('maternalRelatives', 'uncles', 1);
    S().updateRelativeCount('paternalRelatives', 'aunts', 2);
    S().addSiblingOfCategory('female');
    const x = () => Object.fromEntries(S().pedigreeData.nodes.map(n => [n.id, n.x]));
    const before = x();
    const [uncle, niece] = [S().wizardData.maternalRelatives.uncles[0].id, S().wizardData.siblings.female[0].id];
    S().createUnionBetween(uncle, niece);
    const after = x();
    // the partners themselves may shift a little, so their line runs straight down (2026-11-11)
    expect(Object.keys(before).filter(k => k !== uncle && k !== niece && Math.abs(before[k] - after[k]) > 2)).toEqual([]);
    expect([uncle, niece].filter(k => Math.abs(before[k] - after[k]) > 12)).toEqual([]);
    expect(checkConnectorReadability(S().pedigreeData)).toEqual([]);
  });
});

function union(id) { return S().doc.graph.unions.find(x => x.id === id); }
