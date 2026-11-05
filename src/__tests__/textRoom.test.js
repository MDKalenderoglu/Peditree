/**
 * textRoom.test.js — the text under a symbol keeps clear of the lines
 * (clinician report 2026-11-05: a genetic result under a partner ran across
 * the couple's line of descent). symbolText.textBox says how far the text
 * reaches; the PCL layout spaces partners and neighbours by it and makes the
 * row gap deep enough for it.
 */
import { describe, it, expect } from 'vitest';
import { starterDocument } from '../state/usePedigreeStore';
import { computePclLayout } from '../layout/pcl';
import { textBox, TEXT } from '../utils/symbolText';
import * as ops from '../graph/ops';

const ok = (r) => { expect(r.reason).toBeUndefined(); return r.doc; };
const family = (fields = {}) => {
  let doc = ok(ops.addSibling(starterDocument(), 'proband', { sex: 'female' }));
  for (const [id, f] of Object.entries(fields)) doc = ok(ops.updatePerson(doc, id, f));
  return doc;
};
const node = (layout, id) => layout.nodes.find((n) => n.id === id);
const bus = (layout) => layout.edges.find((e) => e.type === 'sibship' && e.unionId === 'U_PARENTS');

describe('how far the text under a symbol reaches', () => {
  it('a symbol with nothing under it: the symbol itself; text widens and deepens it', () => {
    expect(textBox({ id: 'a', sex: 'male' })).toEqual({ left: TEXT.HALF, right: TEXT.HALF, depth: TEXT.HALF });
    const genetic = textBox({ id: 'a', sex: 'male', geneticTest: 'tested', geneticNote: 'APC:c.1234G>A Het' });
    expect(genetic.left).toBeGreaterThan(40);
    expect(genetic.right).toBe(genetic.left);
    const more = textBox({ id: 'a', sex: 'male', age: '35', displayLabel: 'Ali', geneticTest: 'tested', geneticNote: 'APC:c.1234G>A Het\nBRCA2 neg' });
    expect(more.depth).toBe(TEXT.HALF + TEXT.FIRST + 2 * TEXT.LINE + 2 * TEXT.GENETIC);
    // the proband's lines stand right of the arrow
    const p = textBox({ id: 'a', sex: 'male', proband: true, geneticTest: 'tested', geneticNote: 'APC:c.1234G>A Het' });
    expect(p.right - p.left).toBeCloseTo(2 * TEXT.PROBAND_SHIFT);
  });

  it('the same room in both languages of the drawing (the layout does not move when the language changes)', () => {
    expect(textBox({ id: 'a', sex: 'male', deceased: true, ageAtDeath: '3 ay' }).left).toBeGreaterThanOrEqual('ölüm 3 ay'.length * 11 * TEXT.EM / 2);
  });
});

describe('the layout keeps lines clear of the text (clinician report 2026-11-05)', () => {
  it('a long genetic result under a partner: the couple stands apart enough that the line of descent misses it', () => {
    // the proband, a wife and a son: a couple at the usual 70 px, the line of descent from the middle
    const couple = (wifeFields = {}) => {
      let doc = ok(ops.addPartner(starterDocument(), 'proband', { sex: 'female' }));
      doc = ok(ops.addChildToPerson(doc, 'proband', { sex: 'male' }));
      const wife = doc.graph.unions.find((u) => u.partners.includes('proband')).partners.find((id) => id !== 'proband');
      return { doc: ok(ops.updatePerson(doc, wife, wifeFields)), wife };
    };
    const plain = couple();
    const plainLayout = computePclLayout(plain.doc.graph);
    expect(Math.abs(node(plainLayout, 'proband').x - node(plainLayout, plain.wife).x)).toBe(70);
    const { doc, wife } = couple({ geneticTest: 'tested', geneticNote: 'APC:c.1234G>A Het' });
    const layout = computePclLayout(doc.graph);
    const u = doc.graph.unions.find((x) => x.partners.includes(wife));
    const x = layout.edges.find((e) => e.type === 'parentChildDrop' && e.unionId === u.id).x1;
    const w = node(layout, wife);
    const box = textBox(doc.graph.individuals.find((i) => i.id === wife));
    expect(Math.abs(w.x - x)).toBeGreaterThanOrEqual((w.x > x ? box.left : box.right) + 6);
    // short text (an age, a first name) moves nobody
    const short = computePclLayout(couple({ age: '34', displayLabel: 'Ayşe' }).doc.graph);
    expect(short.nodes.map((n) => [n.id, n.x, n.y])).toEqual(plainLayout.nodes.map((n) => [n.id, n.x, n.y]));
  });

  it('two neighbours\' texts never touch', () => {
    const long = 'MYH7:c.1208G>A het';
    // the proband's two children, the usual 100 px apart
    let doc = ok(ops.addPartner(starterDocument(), 'proband', { sex: 'female' }));
    doc = ok(ops.addChildToPerson(doc, 'proband', { sex: 'male' }));
    doc = ok(ops.addChildToPerson(doc, 'proband', { sex: 'female' }));
    const u = doc.graph.unions.find((x) => x.partners.includes('proband'));
    const kids = doc.graph.parentChildRelationships.find((r) => r.unionId === u.id).children;
    const plain = computePclLayout(doc.graph);
    expect(Math.abs(node(plain, kids[0]).x - node(plain, kids[1]).x)).toBe(100);
    for (const id of kids) doc = ok(ops.updatePerson(doc, id, { geneticTest: 'tested', geneticNote: long }));
    const layout = computePclLayout(doc.graph);
    const [a, b] = kids.map((id) => node(layout, id)).sort((p, q) => p.x - q.x);
    const box = (n) => textBox(doc.graph.individuals.find((i) => i.id === n.id));
    expect(b.x - a.x).toBeGreaterThanOrEqual(box(a).right + box(b).left + 8);
  });

  it('many lines under a parent: the sibship line below stays under the last one', () => {
    const doc = family({ father: { age: '62', displayLabel: 'Mehmet', geneticTest: 'tested', geneticNote: 'APC:c.1234G>A Het\nMUTYH neg\nBRCA2 VUS\nTP53 neg', notes: 'öykü' } });
    const layout = computePclLayout(doc.graph);
    const father = node(layout, 'father');
    const depth = textBox(doc.graph.individuals.find((i) => i.id === 'father')).depth;
    expect(depth).toBeGreaterThan(62);
    expect(bus(layout).y1 - father.y).toBeGreaterThanOrEqual(depth + 8);
  });
});
