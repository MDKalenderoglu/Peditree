/**
 * multiples.test.js — twins, triplets (clinician request 2026-10-24; NSGC and
 * the clinic's reference sheet: one point on the sibship line, monozygotic =
 * bar, zygosity unknown = "?", dizygotic / trizygotic = no mark).
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { checkAllInvariants } from '../audit/layoutInvariants';
import { checkConnectorReadability } from '../audit/connectorReadability';
import { zygosityLabel, multipleName } from '../graph/multiples';
import { resetModel, chooseOp, applyOp } from '../audit/fuzzModel';
import { makeRng, seedToInt } from '../audit/prng';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
beforeEach(() => S().resetPedigree());

const S = () => usePedigreeStore.getState();
const rel = () => S().doc.graph.parentChildRelationships.find(r => r.children.includes('proband'));
const group = () => (rel().multiples || [])[0];
const person = (id) => S().doc.graph.individuals.find(i => i.id === id);
const edgesOf = (uid) => S().pedigreeData.edges.filter(e => e.unionId === uid);
const errors = () => (S().integrityIssues || []).filter(i => i.severity === 'error');

describe('model', () => {
  it('a twin of the proband: one group, monozygotic twins share the sex', () => {
    S().addMultipleSibling('proband', { zygosity: 'monozygotic', sex: 'female' });
    expect(group().zygosity).toBe('monozygotic');
    expect(group().children[0]).toBe('proband');
    expect(person(group().children[1]).sex).toBe(person('proband').sex);
    expect(errors()).toEqual([]);
  });

  it('a third makes triplets; dizygotic triplets read "Trizigotik"', () => {
    S().addMultipleSibling('proband', { zygosity: 'dizygotic', sex: 'female' });
    S().addMultipleSibling('proband', { sex: 'male' });
    expect(group().children).toHaveLength(3);
    expect(multipleName(3)).toBe('Üçüz');
    expect(zygosityLabel('dizygotic', 3)).toBe('Trizigotik');
  });

  it('two existing siblings become twins; members always stand together', () => {
    S().addSiblingOfCategory('male');
    S().addSiblingOfCategory('female');
    const [b, f] = [S().wizardData.siblings.male[0].id, S().wizardData.siblings.female[0].id];
    S().setMultipleBirth(['proband', f], 'unknown');
    const kids = rel().children;
    expect(Math.abs(kids.indexOf('proband') - kids.indexOf(f))).toBe(1);
    // an explicit order that would split them: they are kept side by side
    S().setChildOrder(rel().unionId, ['proband', b, f]);
    const after = rel().children;
    expect(Math.abs(after.indexOf('proband') - after.indexOf(f))).toBe(1);
  });

  it('leaving or deleting dissolves a group of two; zygosity can change', () => {
    S().addMultipleSibling('proband', {});
    const twin = group().children[1];
    S().setMultipleZygosity('proband', 'dizygotic');
    expect(group().zygosity).toBe('dizygotic');
    S().leaveMultipleBirth(twin);
    expect(rel().multiples).toBeUndefined();
    S().addMultipleSibling('proband', {});
    S().deleteIndividual(group().children[1]);
    expect(rel().multiples).toBeUndefined();
  });

  it('monozygotic twins of different sex: a warning, not an error', () => {
    S().addSiblingOfCategory('female');
    S().setMultipleBirth(['proband', S().wizardData.siblings.female[0].id], 'monozygotic');
    expect((S().integrityIssues || []).some(i => i.code === 'MONOZYGOTIC_SEX_DIFFERS' && i.severity === 'warning')).toBe(true);
  });

  it('save → load and undo keep / restore the group', () => {
    S().addMultipleSibling('proband', { zygosity: 'monozygotic' });
    const file = S().exportProjectFile();
    S().resetPedigree();
    S().openProjectFile(file);
    expect(group()).toMatchObject({ zygosity: 'monozygotic' });
    S().resetPedigree();
    S().addMultipleSibling('proband', {});
    S().undo();
    expect(rel().multiples).toBeUndefined();
  });
});

describe('drawing', () => {
  it('twins hang from one point; monozygotic = bar; audits clean', () => {
    S().addSiblingOfCategory('male');
    S().addMultipleSibling('proband', { zygosity: 'monozygotic' });
    const own = edgesOf(rel().unionId);
    const stems = own.filter(e => e.type === 'childStem' && group().children.includes(e.childId));
    expect(new Set(stems.map(e => e.x1)).size).toBe(1); // one point on the bus
    expect(stems.every(e => e.twin)).toBe(true);
    expect(own.filter(e => e.type === 'twinBar')).toHaveLength(1);
    expect(own.some(e => e.type === 'twinUnknown')).toBe(false);
    expect(checkAllInvariants(S().pedigreeData)).toEqual([]);
    expect(checkConnectorReadability(S().pedigreeData)).toEqual([]);
  });

  it('zygosity unknown = "?"; dizygotic = no mark', () => {
    S().addMultipleSibling('proband', {});
    expect(edgesOf(rel().unionId).filter(e => e.type === 'twinUnknown')).toHaveLength(1);
    S().setMultipleZygosity('proband', 'dizygotic');
    const own = edgesOf(rel().unionId);
    expect(own.some(e => e.type === 'twinUnknown' || e.type === 'twinBar')).toBe(false);
  });

  it('twins as the only children: the line of descent splits at one point (no sibship line between them)', () => {
    S().addMultipleSibling('proband', { zygosity: 'dizygotic', sex: 'female' });
    const own = edgesOf(rel().unionId);
    const drop = own.find(e => e.type === 'parentChildDrop');
    const stems = own.filter(e => e.type === 'childStem');
    expect(stems.every(e => e.x1 === drop.x1 && e.y1 === drop.y2)).toBe(true);
    expect(own.filter(e => e.type === 'sibship' && e.x2 - e.x1 > 1)).toHaveLength(0);
  });
});

describe('robustness: twins in random pedigrees', () => {
  it('100 random pedigrees, random twins / triplets: no exception, no invariant, readability or graph error', () => {
    const bad = [];
    let groups = 0;
    for (let c = 0; c < 100; c++) {
      const rng = makeRng(seedToInt(`twins${c}`));
      resetModel();
      for (let s = 0; s < 10; s++) { let op = null; for (let r = 0; r < 6 && !op; r++) op = chooseOp(rng); if (op) applyOp(op); }
      const rels = S().doc.graph.parentChildRelationships;
      for (let k = 0; k < 3 && rels.length; k++) {
        const r = S().doc.graph.parentChildRelationships[rng.int(S().doc.graph.parentChildRelationships.length)];
        const z = rng.pick(['monozygotic', 'dizygotic', 'unknown']);
        if (r.children.length >= 2 && rng.int(2)) S().setMultipleBirth([r.children[0], r.children[1]], z);
        else S().addMultipleSibling(r.children[rng.int(r.children.length)], { zygosity: z, sex: rng.pick(['male', 'female', 'unknown']) });
      }
      groups += S().doc.graph.parentChildRelationships.filter(r => r.multiples).length;
      const found = [...checkAllInvariants(S().pedigreeData), ...checkConnectorReadability(S().pedigreeData), ...errors()].map(v => v.code);
      if (found.length) bad.push(`${c}: ${[...new Set(found)].join(',')}`);
    }
    expect(groups).toBeGreaterThan(100);
    expect(bad).toEqual([]);
  }, 120000);
});
