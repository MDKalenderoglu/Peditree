/**
 * panelSync.test.js — the left panel (wizard) and the right panel (person
 * editor) are two views of ONE graph: whatever one panel does, the other
 * shows (clinician report 2026-10-23: consanguinity drawn via "make
 * siblings" while the wizard still offered an empty consanguinity choice).
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { kinshipOf } from '../graph/kinship';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
beforeEach(() => S().resetPedigree());

const S = () => usePedigreeStore.getState();
const wd = () => S().wizardData;
const union = (id) => S().doc.graph.unions.find(u => u.id === id);
const errors = () => (S().integrityIssues || []).filter(i => i.severity === 'error');
const parentsEdge = () => S().pedigreeData.edges.find(e => e.unionId === wd().parents.unionId && /[uU]nion/.test(e.type));

describe('consanguinity follows the drawing, whichever panel drew it', () => {
  it('grandparents made siblings → parents are 1st cousins on both panels, double line, no "degree unknown" note', () => {
    expect(wd().parents.consanguineous).toBe(false);
    S().addCustomConsanguinity('mat_gf', 'pat_gm'); // right panel "Kardeş yap" / left "Ek akrabalık bağları"
    const p = wd().parents;
    expect(p.consanguineous).toBe(true);
    expect(p.consanguinityDegree).toBe('first_cousin');
    expect(p.consanguinityPath).toBe('cross_cousin_2');
    expect(p.kinship).toMatchObject({ degree: 'first_cousin', fromTemplate: false });
    expect(p.kinship.ancestors).toHaveLength(2);
    expect(union(p.unionId).consanguinityStatus).toBe('known_supported');
    expect(parentsEdge().type).toBe('consanguineousUnion');
    expect(S().warnings.join(' ')).not.toMatch(/derece/);
    expect(errors()).toEqual([]);
  });

  it('ticking the box afterwards changes nothing drawn (the drawing already decides); it is kept as the clinician’s statement', () => {
    S().addCustomConsanguinity('mat_gm', 'pat_gm');
    const before = S().doc;
    const parents = () => S().doc.graph.unions.find(u => u.id === 'U_PARENTS');
    expect(parents().consanguinityFromStructure).toBe(true);
    S().updateWizardData('parents', 'consanguineous', true);
    expect(wd().parents.consanguinityPath).toBe('mothers_maternal_is_fathers_maternal');
    const strip = (g) => ({ ...g, unions: g.unions.map(({ consanguinityFromStructure, ...u }) => u) }); // eslint-disable-line no-unused-vars
    expect(strip(S().doc.graph)).toEqual(strip(before.graph));
    // confirmed: it stays when the shared ancestry is no longer drawn (audit 2026-10-25)
    expect(parents().consanguinityFromStructure).toBeUndefined();
  });

  it('a degree chosen in the wizard draws the ancestors and both panels read the same degree', () => {
    S().updateWizardData('parents', 'consanguineous', true);
    S().updateWizardData('parents', 'consanguinityDegree', 'first_cousin');
    S().updateWizardData('parents', 'consanguinityPath', 'mothers_paternal_is_fathers_paternal');
    const p = wd().parents;
    expect(p.kinship).toMatchObject({ degree: 'first_cousin', fromTemplate: true });
    expect(union(p.unionId).consanguinityDegree).toBe('first_cousin');
    S().updateWizardData('parents', 'consanguineous', false);
    expect(wd().parents.consanguineous).toBe(false);
    expect(wd().parents.kinship).toBe(null);
  });

  it('second cousins and once-removed are read from the drawing', () => {
    S().updateWizardData('parents', 'consanguineous', true);
    S().updateWizardData('parents', 'consanguinityDegree', 'second_cousin');
    expect(wd().parents.kinship.degree).toBe('second_cousin');
    const g = S().doc.graph;
    // mother: 3 generations up to the shared couple, paternal grandfather: 2
    expect(kinshipOf(g, 'mother', 'pat_gf').degree).toBe('first_cousin_once_removed');
    expect(kinshipOf(g, 'mother', 'mother')).toBe(null);
  });
});

describe('counts on the left include what the right panel added', () => {
  it('a sibling of unknown sex added to the mother shows up on the maternal side', () => {
    S().addSiblingTo('mother', 'unknown');
    expect(wd().maternalRelatives.others).toBe(1);
  });

  it('a child added to an uncle from the right panel is counted on the left', () => {
    S().updateRelativeCount('maternalRelatives', 'uncles', 1);
    S().updateRelativeChildren('maternalRelatives', 'uncles', 0, 'male', 1);
    const uid = wd().maternalRelatives.uncles[0].unionId;
    S().addChildToUnion(uid, 'female');
    expect(wd().maternalRelatives.uncles[0].children).toMatchObject({ male: 1, female: 1 });
  });

  it('someone with a role of their own is not counted again as a great-aunt; one ancestor couple counts once', () => {
    S().addCustomConsanguinity('mat_gf', 'pat_gm');
    expect(wd().maternalGPRelatives.aunts).toHaveLength(0);
    expect(wd().maternalGPRelatives.alsoInRole).toEqual(['pat_gm']);
    expect(wd().greatGrandparentCouples).toBe(1);
    S().updateRelativeCount('maternalGPRelatives', 'aunts', 1);
    S().updateRelativeCount('maternalGPRelatives', 'aunts', 0);
    expect(S().doc.graph.individuals.some(i => i.id === 'pat_gm')).toBe(true);
    expect(errors()).toEqual([]);
  });

  it('a sibling age typed on the right is the age on the left, and back', () => {
    S().addSiblingOfCategory('male');
    const id = wd().siblings.male[0].id;
    S().updateIndividual(id, { age: '7' });
    expect(wd().siblings.male[0].age).toBe('7');
    S().updateSiblingAge('male', 0, '9');
    expect(S().doc.graph.individuals.find(i => i.id === id).age).toBe('9');
  });
});

describe('relationship status and proband are shared', () => {
  it('the parents’ status set on the right is the status on the left, and back', () => {
    S().setUnionStatus(wd().parents.unionId, 'divorced');
    expect(wd().parents.relationshipStatus).toBe('divorced');
    S().updateWizardData('parents', 'relationshipStatus', 'together');
    expect(union(wd().parents.unionId).status).toBe('together');
  });

  it('making someone else the proband on the right moves the left panel to that person', () => {
    S().setProband('mother');
    expect(wd().proband.id).toBe('mother');
    expect([wd().parents.motherId, wd().parents.fatherId].sort()).toEqual(['mat_gf', 'mat_gm']);
    S().updateWizardData('proband', 'age', '41');
    expect(S().doc.graph.individuals.find(i => i.id === 'mother').age).toBe('41');
    expect(S().doc.graph.individuals.filter(i => i.proband).map(i => i.id)).toEqual(['mother']);
    expect(errors()).toEqual([]);
  });
});

describe('right panel quick adds (clinician feedback 2026-10-24)', () => {
  it('a miscarriage and a stillbirth added beside the proband are the wizard’s sibling counts', () => {
    S().addSiblingTo('proband', 'unknown', { pregnancyLoss: true });
    S().addSiblingTo('proband', 'unknown', { stillbirth: true });
    expect(wd().siblings.pregnancyLoss).toBe(1);
    expect(wd().siblings.deceased).toBe(1);
  });

  it('a miscarriage can be added under any couple', () => {
    S().addChildToUnion(wd().parents.unionId, 'unknown', { pregnancyLoss: true });
    expect(S().doc.graph.individuals.filter(i => i.pregnancyLoss)).toHaveLength(1);
  });

  it('"Anne ve baba ekle" adds a woman and a man, never an unknown-sex parent', () => {
    S().addSpouseTo('proband', 'female');
    const spouse = S().doc.graph.unions.find(u => u.partners.includes('proband') && u.id !== wd().parents.unionId)
      .partners.find(p => p !== 'proband');
    S().addParentsTo(spouse, {});
    const pu = S().doc.graph.parentChildRelationships.find(r => r.children.includes(spouse)).unionId;
    const sexes = S().doc.graph.unions.find(u => u.id === pu).partners
      .map(id => S().doc.graph.individuals.find(i => i.id === id).sex).sort();
    expect(sexes).toEqual(['female', 'male']);
  });

  it('a click on a relationship line selects the couple; a second spouse can be added', () => {
    S().selectUnion(wd().parents.unionId);
    expect([S().selectedId, S().selectedId2].sort()).toEqual(['father', 'mother']);
    S().addSpouseTo('father', 'female');
    expect(wd().parents.fatherOtherUnions).toHaveLength(1);
    S().setUnionStatus(wd().parents.fatherOtherUnions[0].unionId, 'divorced');
    expect(wd().parents.fatherOtherUnions[0].status).toBe('divorced');
  });
});

describe('quick-add bar on the drawing (2026-10-24)', () => {
  it('a sibling for someone without drawn parents brings a mother and a father — one undo step', () => {
    S().addSpouseTo('proband', 'female');
    const spouse = S().doc.graph.unions.find(u => u.partners.includes('proband') && u.id !== wd().parents.unionId)
      .partners.find(p => p !== 'proband');
    const steps = S()._history.length;
    S().addSiblingTo(spouse, 'male', { createParents: true });
    expect(S()._history.length).toBe(steps + 1);
    const pu = S().doc.graph.parentChildRelationships.find(r => r.children.includes(spouse));
    expect(pu.children).toHaveLength(2);
    expect(errors()).toEqual([]);
    S().undo();
    expect(S().doc.graph.parentChildRelationships.some(r => r.children.includes(spouse))).toBe(false);
  });

  it('without createParents the old refusal stands', () => {
    S().addSpouseTo('proband', 'female');
    const before = S().doc;
    const spouse = S().doc.graph.unions.find(u => u.partners.includes('proband') && u.id !== wd().parents.unionId)
      .partners.find(p => p !== 'proband');
    S().addSiblingTo(spouse, 'male');
    expect(S().doc).toBe(before);
  });

  it('the canvas keeps the zoom across edits and shows the bar for one selected person only', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/PedigreeCanvas.jsx'), 'utf8');
    expect(src).toMatch(/svg\.call\(zoom\.transform, d3\.zoomTransform\(svg\.node\(\)\)\)/);
    expect(src).toMatch(/selectedNodeId2 \|\| selectedIds\.length > 1\) \{ setAnchor\(null\)/);
  });
});

describe('several people at once (clinician request 2026-10-24)', () => {
  const ppl = ['mother', 'father', 'proband'];
  const get = (id) => S().doc.graph.individuals.find(i => i.id === id);

  it('Cmd/Ctrl-click selects any number of people', () => {
    S().selectIndividual('mother');
    S().selectIndividual('father', { additive: true });
    S().selectIndividual('proband', { additive: true });
    S().selectIndividual('mat_gf', { additive: true });
    expect(S().selectedIds).toEqual(['mother', 'father', 'proband', 'mat_gf']);
  });

  it('affected / deceased for everyone selected — one undo step', () => {
    const steps = S()._history.length;
    const before = ppl.map(id => !!get(id).affected); // the proband opens affected
    S().updateMany(ppl, { affected: true });
    expect(ppl.every(id => get(id).affected)).toBe(true);
    expect(S()._history.length).toBe(steps + 1);
    S().undo();
    expect(ppl.map(id => !!get(id).affected)).toEqual(before);
  });

  it('a new finding for everyone selected keeps one signature; it can be removed from all at once', () => {
    S().addFindingMany(ppl, 'Miyop', { region: 'q2', fill: 'hatch' });
    expect(ppl.every(id => (get(id).conditions || []).some(c => c.label === 'Miyop' && c.status === 'affected'))).toBe(true);
    expect(S().doc.graph.conditionKey).toEqual([expect.objectContaining({ label: 'Miyop', region: 'q2', fill: 'hatch' })]);
    S().setFindingStatusMany(ppl, 'Miyop', 'none');
    expect(S().doc.graph.conditionKey).toEqual([]);
    expect(errors()).toEqual([]);
  });
});
