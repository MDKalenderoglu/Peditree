/**
 * sidewaysMove.test.js — moving a person left / right (Shift+arrows,
 * dragging; clinician request 2026-10-25): partners swap sides, siblings
 * change birth order, nothing else moves.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { serializeDocument, parseProjectFile } from '../graph/persistenceV2';
import { displayParentage } from '../graph/model';
import { setMultipleBirth } from '../graph/multiples';
import { updatePerson } from '../graph/ops';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
const S = () => usePedigreeStore.getState();
const x = (id) => S().pedigreeData.nodes.find(n => n.id === id).x;
const sibs = () => S().doc.graph.parentChildRelationships.find(r => r.children.includes('proband')).children;

describe('moving sideways', () => {
  it('the mother moves to the father’s left and stays there across later edits; undo puts her back', () => {
    S().resetPedigree();
    expect(x('father')).toBeLessThan(x('mother'));
    S().moveSideways('mother', 'left');
    expect(x('mother')).toBeLessThan(x('father'));
    S().addSiblingTo('proband', 'male');
    S().relayout();
    expect(x('mother')).toBeLessThan(x('father'));
    S().undo(); S().undo(); S().undo();
    expect(x('father')).toBeLessThan(x('mother'));
  });

  it('a sibling moves one place in the birth order; dragging onto a sibling takes its place', () => {
    S().resetPedigree();
    S().addSiblingTo('proband', 'male');
    S().addSiblingTo('proband', 'female');
    const [a, b, c] = sibs();
    S().moveSideways(c, 'left');
    expect(sibs()).toEqual([a, c, b]);
    S().dropOnto(c, a);
    expect(sibs()).toEqual([c, a, b]);
    expect(x(c)).toBeLessThan(x(a));
  });

  it('nowhere to go: nothing moves and the reason is shown', () => {
    S().resetPedigree();
    const before = S().doc;
    S().moveSideways('proband', 'left');
    expect(S().doc).toBe(before);
    expect(S().actionNotice.message).toMatch(/yer değiştirebileceği/);
    S().dropOnto('proband', 'mother');
    expect(S().doc).toBe(before);
  });

  // clinician request 2026-11-07: an adopted-in child (brackets, dashed line from the adoptive
  // parents) could not be moved — "Yalnızca eşiyle yer değiştirebilir …"
  it('an adopted-in child moves among its adoptive siblings; the birth order of the others stays; undo puts it back', () => {
    S().resetPedigree();
    S().addSiblingTo('proband', 'male');
    const [p, b] = sibs();
    S().addChildToUnion('U_PARENTS', 'female', { adopted: true });
    const adopted = S().doc.graph.socialParentLinks.at(-1).childId;
    expect(x(adopted)).toBeGreaterThan(x(b)); // drawn after the biological children
    S().moveSideways(adopted, 'left');
    expect(S().actionNotice?.message || '').not.toMatch(/Yalnızca eşiyle/);
    expect(x(p)).toBeLessThan(x(adopted));
    expect(x(adopted)).toBeLessThan(x(b));
    expect(sibs()).toEqual([p, b]); // only biological children in the birth order, unchanged
    expect(S().doc.graph.parentChildRelationships.find((r) => r.unionId === 'U_PARENTS').birthOrderExplicit).toBeFalsy();
    S().dropOnto(adopted, p);
    expect(x(adopted)).toBeLessThan(x(p));
    // a biological child passes the adopted one
    S().moveSideways(p, 'left');
    expect(x(p)).toBeLessThan(x(adopted));
    expect(sibs()).toEqual([p, b]);
    // the place is kept across a later edit and a save → open
    S().updateIndividual(b, { age: '4' });
    expect(x(p)).toBeLessThan(x(adopted));
    expect(x(adopted)).toBeLessThan(x(b));
    S().undo(); S().undo(); S().undo(); S().undo();
    expect(x(adopted)).toBeGreaterThan(x(b));
  });

  it('dropped onto a biological sibling, an adopted-in child takes that place', () => {
    S().resetPedigree();
    S().addSiblingTo('proband', 'male');
    const [p] = sibs();
    S().addChildToUnion('U_PARENTS', 'male', { adopted: true });
    const adopted = S().doc.graph.socialParentLinks.at(-1).childId;
    S().dropOnto(adopted, p);
    expect(x(adopted)).toBeLessThan(x(p));
    expect(S().doc.graph.socialParentLinks.at(-1).slot).toBe(0);
  });

  it('a move against known ages is made and said', () => {
    S().resetPedigree();
    S().addSiblingTo('proband', 'male');
    const [p, b] = sibs();
    S().updateIndividual(p, { age: '20' });
    S().updateIndividual(b, { age: '10' });
    S().moveSideways(b, 'left');
    expect(sibs()).toEqual([b, p]);
    expect(S().actionNotice.message).toMatch(/yaşlarla uyuşmuyor/);
  });
});

describe('an adopted-in child keeps its place in the drawing (socialParentLinks[].slot)', () => {
  const drawnSibs = (doc) => displayParentage(doc.graph).graph.parentChildRelationships.find((r) => r.unionId === 'U_PARENTS').children;
  const adoptedFamily = () => {
    S().resetPedigree();
    S().addSiblingTo('proband', 'male');
    S().addChildToUnion('U_PARENTS', 'female', { adopted: true });
    const adopted = S().doc.graph.socialParentLinks.at(-1).childId;
    S().moveSideways(adopted, 'left');
    return adopted;
  };

  it('saved and opened again, it stands where it was moved', () => {
    const adopted = adoptedFamily();
    const before = drawnSibs(S().doc);
    expect(before.indexOf(adopted)).toBe(1);
    const opened = parseProjectFile(serializeDocument(S().doc));
    expect(opened.ok).toBe(true);
    expect(drawnSibs(opened.doc)).toEqual(before);
  });

  it('a place that is not a whole number is ignored on opening and dropped by the next edit', () => {
    const adopted = adoptedFamily();
    const doc = structuredClone(S().doc);
    doc.graph.socialParentLinks.at(-1).slot = 'x';
    const opened = parseProjectFile(serializeDocument(doc));
    expect(opened.ok).toBe(true);
    expect(drawnSibs(opened.doc).at(-1)).toBe(adopted); // after the biological children
    const edited = updatePerson(opened.doc, 'proband', { notes: 'x' });
    expect(edited.ok).toBe(true);
    expect('slot' in edited.doc.graph.socialParentLinks.at(-1)).toBe(false);
  });

  it('never between two twins of one birth', () => {
    const adopted = adoptedFamily();
    const [p, b] = sibs();
    const r = setMultipleBirth(S().doc, [p, b], 'dizygotic');
    expect(r.ok).toBe(true);
    const order = drawnSibs(r.doc);
    expect(Math.abs(order.indexOf(p) - order.indexOf(b))).toBe(1);
    expect(order).toContain(adopted);
  });
});

