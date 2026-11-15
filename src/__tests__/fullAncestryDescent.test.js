/**
 * fullAncestryDescent.test.js — lines of descent without needless steps (clinician report 2026-11-15:
 * a full ancestry drawn with steps at the outer ends of the top row, where nothing stood in the way;
 * "a clinician drawing by hand would never do that").
 *
 * - A founder couple (no parents drawn, no other partner) stands right over its only child,
 *   however far off the edits left it (index.js, the only-child settle).
 * - An only child within a few px of its parents' midpoint gets a straight line (routing.js
 *   SNAP_ONLY_CHILD): the straightest layout, which "Konumlandır" picks (tidy.js), then has no
 *   step at all on a full five-generation ancestry.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { bendScore } from '../layout/pcl/tidy';
import { checkAllInvariants } from '../audit/layoutInvariants';
import { checkConnectorReadability } from '../audit/connectorReadability';
import { layoutParentage } from '../layout/pcl/art';

const S = () => usePedigreeStore.getState();
const g = () => S().doc.graph;
const parentsOf = (id) => {
  const p = g().parentChildRelationships.find((r) => r.children.includes(id));
  return p ? g().unions.find((u) => u.id === p.unionId).partners : null;
};
/** couples with one child whose line of descent steps sideways: [unionId, px] */
function steps(drawing) {
  const out = [];
  for (const u of g().unions) {
    const p = g().parentChildRelationships.find((r) => r.unionId === u.id);
    if (!p || p.children.length !== 1) continue;
    const drop = drawing.edges.find((e) => e.unionId === u.id && e.type === 'parentChildDrop');
    const stem = drawing.edges.find((e) => e.unionId === u.id && e.type === 'childStem');
    if (drop && stem && Math.abs(drop.x1 - stem.x1) > 0.5) out.push([u.id, Math.round(drop.x1 - stem.x1)]);
  }
  return out;
}
const founderUnions = () => g().unions.filter((u) => u.partners.every((p) => !parentsOf(p)));

beforeAll(() => { ['log', 'warn', 'info'].forEach((k) => vi.spyOn(console, k).mockImplementation(() => {})); });

describe('a full ancestry: five generations, the proband to the sixteen great-great-grandparents', () => {
  beforeAll(() => {
    S().resetPedigree();
    const gps = ['pat_gf', 'pat_gm', 'mat_gf', 'mat_gm'];
    for (const id of gps) expect(S().addParentsTo(id)).not.toBe(false);
    for (const id of gps.flatMap(parentsOf)) S().addParentsTo(id);
    // and a group of three beside one great-grandparent, as in the clinician's drawing
    S().addSiblingTo(parentsOf('pat_gf')[1], 'female');
    S().setGroupCount(g().individuals.at(-1).id, 3);
  });

  it('drawn up an edit at a time: every founder couple stands right over its only child', () => {
    const drawing = S().pedigreeData;
    const founders = new Set(founderUnions().map((u) => u.id));
    expect(founders.size).toBe(8);
    expect(steps(drawing).filter(([id]) => founders.has(id))).toEqual([]);
  });

  it('"Konumlandır": no step in any line of descent, and the drawing is clean', () => {
    S().relayout();
    const drawing = S().pedigreeData;
    expect(steps(drawing)).toEqual([]);
    expect(bendScore(drawing.edges)).toBe(0);
    const drawn = { ...layoutParentage(g()), nodes: drawing.nodes, edges: drawing.edges };
    expect(checkAllInvariants(drawn)).toEqual([]);
    expect(checkConnectorReadability(drawn)).toEqual([]);
  });
});
