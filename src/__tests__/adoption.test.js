/**
 * adoption.test.js — adoption (NSGC; clinician decisions 2026-11-01): an
 * adopted-in child under the adoptive parents (dashed), an adopted-out child
 * under the biological parents (solid), a child adopted by relatives with
 * both lines; brackets in every case. One adoptive family per person.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { validateDocument, errorsOf } from '../graph/validate';
import { adoptionOf } from '../graph/model';
import { parseProjectFile, serializeDocument } from '../graph/persistenceV2';
import { buildMarkFamily } from '../audit/markCollisions';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
beforeEach(() => S().resetPedigree());

const S = () => usePedigreeStore.getState();
const g = () => S().doc.graph;
const parentsUnion = () => g().parentChildRelationships.find(r => r.children.includes('proband')).unionId;
const valid = () => expect(errorsOf(validateDocument(S().doc))).toEqual([]);

// the proband's aunt (father's sister) and her husband, to adopt a child of the family
function auntCouple() {
  S().addSiblingTo('father', 'female');
  const aunt = g().parentChildRelationships.find(r => r.children.includes('father')).children.find(c => c !== 'father');
  S().addSpouseTo(aunt, 'male');
  return g().unions.find(u => u.partners.includes(aunt)).id;
}

describe('adoption', () => {
  it('adopted in: a child with the adoptive link only, under the adoptive parents', () => {
    const r = S().addChildToUnion(parentsUnion(), 'female', { adopted: true });
    expect(r.ok, r.reason).toBe(true);
    const id = r.created.childId;
    expect(adoptionOf(g(), id)).toEqual({ kind: 'in', unionId: parentsUnion() });
    expect(g().parentChildRelationships.some(rel => rel.children.includes(id))).toBe(false);
    expect(S().pedigreeData.nodes.find(n => n.id === id).y).toBe(S().pedigreeData.nodes.find(n => n.id === 'proband').y);
    valid();
    // cannot be undone into a person with no parents at all
    expect(S().setAdoption(id, null).reason).toMatch(/biyolojik ebeveynlerini ekleyin/);
  });

  it('adopted out: a mark on a child of drawn parents; refused without parents', () => {
    expect(S().setAdoption('proband', 'out').ok).toBe(true);
    expect(adoptionOf(g(), 'proband')).toEqual({ kind: 'out' });
    valid();
    expect(S().setAdoption('pat_gf', 'out').ok).toBe(false);
    expect(S().setAdoption('proband', null).ok).toBe(true);
    expect(adoptionOf(g(), 'proband')).toBeNull();
  });

  it('adopted by relatives: biological parents kept, one adoptive couple, the latest choice wins', () => {
    const aunt = auntCouple();
    expect(S().setAdoption('proband', 'out').ok).toBe(true);
    expect(S().setAdoption('proband', aunt).ok).toBe(true);
    expect(adoptionOf(g(), 'proband')).toEqual({ kind: 'relative', unionId: aunt });
    expect(g().individuals.find(i => i.id === 'proband').adoptedOut).toBeUndefined();
    expect(g().socialParentLinks.filter(l => l.childId === 'proband')).toHaveLength(1);
    valid();
  });

  it('never by the own parents, by oneself, by a descendant; never a pregnancy or a group', () => {
    expect(S().setAdoption('proband', parentsUnion()).ok).toBe(false);
    S().addChildTo('proband', 'male');
    const own = g().unions.find(u => u.partners.includes('proband')).id;
    expect(S().setAdoption('proband', own).ok).toBe(false);
    const kid = g().parentChildRelationships.find(r => r.unionId === own).children[0];
    S().addSpouseTo(kid, 'female');
    const kidsUnion = g().unions.find(u => u.partners.includes(kid)).id;
    expect(S().setAdoption('proband', kidsUnion).ok).toBe(false);
    S().addSiblingTo('proband', 'male', { count: 3 });
    const group = g().individuals.find(i => i.count).id;
    expect(S().setAdoption(group, 'out').reason).toMatch(/Tek tek ayır/);
    expect(S().addChildToUnion(parentsUnion(), 'unknown', { adopted: true, pregnancyLoss: true }).ok).toBe(false);
  });

  it('drawn: adopted by relatives — a dashed line from inside the adoptive couple\'s line to the top of the child, beside the solid stem; brackets for in, out and by relatives', () => {
    const aunt = auntCouple();
    S().setAdoption('proband', aunt);
    const { nodes, edges } = S().pedigreeData;
    const at = (id) => nodes.find(n => n.id === id);
    const dashed = edges.filter(e => e.type === 'adoptiveDescent' && e.childId === 'proband');
    expect(dashed.length).toBeGreaterThanOrEqual(2);
    expect(dashed.every(e => e.descentKind === 'adoptive')).toBe(true);
    const [a, b] = g().unions.find(u => u.id === aunt).partners.map(at);
    const first = dashed[0], last = dashed.at(-1);
    expect(first.y1).toBe(a.y);
    expect(first.x1).toBeGreaterThan(Math.min(a.x, b.x) + 20);
    expect(first.x1).toBeLessThan(Math.max(a.x, b.x) - 20);
    const p = at('proband');
    expect(last.y2).toBe(p.y - 20);
    expect(Math.abs(last.x2 - p.x)).toBe(10);
    const solid = edges.find(e => e.type === 'childStem' && e.childId === 'proband');
    expect(solid.descentKind).toBeUndefined();
  });

  // clinician report 2026-11-01: relationship lines ran through brackets; the arrow touched them
  it('the family with every mark: no relationship line reaches inside an adopted person\'s brackets', () => {
    buildMarkFamily(usePedigreeStore);
    const { nodes, edges } = S().pedigreeData;
    const bracketed = nodes.filter(n => adoptionOf(g(), n.id));
    expect(bracketed.length).toBeGreaterThanOrEqual(7);
    const unionTypes = ['union', 'consanguineousUnion', 'consanguineousUnionUnresolved'];
    const bad = [];
    for (const n of bracketed) {
      for (const e of edges.filter(x => unionTypes.includes(x.type) && x.y1 === x.y2 && x.y1 === n.y)) {
        for (const x of [e.x1, e.x2]) {
          const d = Math.abs(x - n.x);
          if (d < 29 && Math.min(e.x1, e.x2) <= n.x + 29 && Math.max(e.x1, e.x2) >= n.x - 29) bad.push(`${n.id} ${d}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('survives save and open and undo; a file with two adoptive families is refused', () => {
    const aunt = auntCouple();
    S().setAdoption('proband', aunt);
    const text = serializeDocument(S().doc);
    expect(parseProjectFile(text).ok).toBe(true);
    const bad = JSON.parse(text);
    bad.graph.socialParentLinks.push({ childId: 'proband', unionId: bad.graph.unions.find(u => u.partners.includes('pat_gf')).id, kind: 'adoptive' });
    expect(parseProjectFile(JSON.stringify(bad)).ok).toBe(false);
    S().undo();
    expect(adoptionOf(g(), 'proband')).toBeNull();
  });
});
