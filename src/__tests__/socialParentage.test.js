/**
 * socialParentage.test.js — biological vs social parenthood (Faz 2b-5):
 * an adopted-in child (only a social link) is drawn under the adoptive
 * couple with a dashed line of descent; biological links stay
 * authoritative for everything else.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { buildPedigreeFromWizard } from '../builder/pedigreeBuilderFromWizard';
import { baseState } from './helpers';
import { createDocument } from '../graph/document';
import * as ops from '../graph/ops';
import { displayParentage, indexGraph } from '../graph/model';
import { computePclLayout } from '../layout/pcl';
import { checkAllInvariants } from '../audit/layoutInvariants';
import { checkConnectorReadability } from '../audit/connectorReadability';
import { validatePedigree } from '../utils/validators';

beforeAll(() => { ['log', 'warn', 'table'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });

function adoptionDoc() {
  let doc = createDocument(buildPedigreeFromWizard(baseState()));
  const r1 = ops.addPartner(doc, 'proband', { sex: 'female' });
  doc = r1.doc;
  const unionId = r1.created.unionId;
  const r2 = ops.addChild(doc, unionId, { sex: 'male' });        // biological son
  doc = r2.doc;
  const r3 = ops.commit(doc, (d) => {                             // adopted daughter: no biological parents drawn
    ops.draftAddPerson(d, { id: 'adopted_1', sex: 'female', generation: 9, relation: 'child_direct', label: 'Evlatlık' });
    d.graph.socialParentLinks.push({ childId: 'adopted_1', unionId, kind: 'adoptive' });
  });
  expect(r3.ok).toBe(true);
  return { doc: r3.doc, unionId, bioChild: r2.created.childId };
}

describe('social parenthood', () => {
  it('the adopted-in child gets the generation below the adoptive parents', () => {
    const { doc } = adoptionDoc();
    const byId = new Map(doc.graph.individuals.map(i => [i.id, i]));
    expect(byId.get('adopted_1').generation).toBe(byId.get('proband').generation + 1);
    expect(indexGraph(doc.graph).bioParentUnion.has('adopted_1')).toBe(false); // still not biological
  });

  it('is drawn under the adoptive couple, dashed, with no layout violation', () => {
    const { doc, unionId, bioChild } = adoptionDoc();
    const layout = computePclLayout(doc.graph);
    const stem = layout.edges.find(e => e.type === 'childStem' && e.childId === 'adopted_1');
    expect(stem).toBeTruthy();
    expect(stem.unionId).toBe(unionId);
    expect(stem.descentKind).toBe('adoptive');
    const bioStem = layout.edges.find(e => e.type === 'childStem' && e.childId === bioChild);
    expect(bioStem.descentKind).toBeUndefined();
    const drawn = { ...displayParentage(doc.graph).graph, ...layout };
    expect(checkAllInvariants(drawn).map(v => v.code)).toEqual([]);
    expect(checkConnectorReadability(drawn).map(v => v.code)).toEqual([]);
  });

  it('is not reported as disconnected', () => {
    const { doc } = adoptionDoc();
    const w = validatePedigree({ ...doc.graph, ...computePclLayout(doc.graph) });
    expect(w.filter(m => m.includes('ne bir ebeveyn çiftine'))).toEqual([]);
  });
});
