/**
 * conditionKey.test.js — findings in the symbol, defined in a legend. NSGC 2022
 * (Figure 2, §4.5; clinician decision 2026-11-16): each finding has a fill
 * pattern of its own, suggested automatically and changeable; the symbol is
 * divided among what the person has, in equal parts in the order of the key,
 * from the top clockwise, one finding the whole symbol; a carrier is drawn on
 * the LEFT half and the person's findings share the RIGHT half; a plain
 * "affected" without a finding stays a full fill. (It used to be a fixed
 * quarter per finding: with a carrier's half and three or more findings the
 * quarters crowded into slivers.)
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { deriveConditionKey, fillFor, suggestStyle, keyEntry, displayStyles, FILLS } from '../graph/conditionKey';
import { keyGrid } from '../utils/keyGrid';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });

const S = () => usePedigreeStore.getState();
const person = (id) => S().doc.graph.individuals.find(i => i.id === id);
const key = () => S().doc.graph.conditionKey;
const labels = () => key().map(e => e.label);
const part = (p) => `${p.fill}${p.carrier ? ':carrier' : ''}@${p.a0}-${p.a1}`;
const partsOf = (p, k = key(), mark, styles) => fillFor(p, k, mark, styles).parts?.map(part);
const aff = (...ls) => ls.map(label => ({ label, status: 'affected' }));
const K = (...fills) => fills.map((fill, i) => ({ id: `k${i + 1}`, label: 'ABCDEFGH'[i], fill }));

describe('the legend follows the findings', () => {
  beforeEach(() => S().resetPedigree());

  it('proband with myopia, tall stature, arachnodactyly; a sister with myopia only: one pattern per finding, the same on everyone', () => {
    S().addFinding('proband', 'Miyop');
    S().addFinding('proband', 'Uzun boy');
    S().addFinding('proband', 'Araknodaktili');
    S().addSiblingOfCategory('female');
    const sister = S().wizardData.siblings.female[0].id;
    S().addFinding(sister, 'miyop '); // same finding, other spelling
    expect(labels()).toEqual(['Miyop', 'Uzun boy', 'Araknodaktili']);
    expect(key().map(e => e.fill)).toEqual(['solid', 'hatch', 'dots']);
    expect(key().every(e => !('region' in e))).toBe(true);
    // the proband stays fully filled (clinician decision 2026-10-25); one finding fills a relative's whole symbol
    expect(fillFor(person('proband'), key())).toEqual({ mode: 'full' });
    expect(partsOf(person(sister))).toEqual(['solid@270-630']);
    expect(fillFor(person('mother'), key())).toEqual({ mode: 'none' });
    expect(person('proband').affected).toBe(true);
    expect(S().pedigreeData.conditionKey).toEqual(key()); // the renderer gets the same key
  });

  it('the symbol is divided among the findings in equal parts, in the key\'s order, from the top clockwise', () => {
    const k = K('solid', 'hatch', 'dots', 'grid', 'horiz');
    expect(partsOf({ conditions: aff('B', 'A') }, k)).toEqual(['solid@270-450', 'hatch@450-630']);
    expect(partsOf({ conditions: aff('A', 'B', 'C') }, k)).toEqual(['solid@270-390', 'hatch@390-510', 'dots@510-630']);
    expect(partsOf({ conditions: aff('A', 'B', 'C', 'D') }, k)).toEqual(['solid@270-360', 'hatch@360-450', 'dots@450-540', 'grid@540-630']);
    expect(partsOf({ conditions: aff('A', 'B', 'C', 'D', 'E') }, k)).toHaveLength(5);
  });

  it('the clinician chooses the pattern; a taken one is refused; it can change later', () => {
    S().addFinding('father', 'A', { fill: 'hatch' });
    expect(keyEntry(key(), 'A')).toEqual({ id: 'k1', label: 'A', fill: 'hatch' });
    const before = S().doc;
    S().addFinding('mother', 'B', { fill: 'hatch' });
    expect(S().doc).toBe(before);
    expect(S().actionNotice.message).toMatch(/başka bir bulguyu göstermektedir/);
    S().setFindingStyle('A', { fill: 'vert' });
    expect(partsOf(person('father'))).toEqual(['vert@270-630']);
    S().setFindingStyle('A', { fill: 'nope' });
    expect(S().actionNotice.message).toMatch(/Geçersiz/);
  });

  it('suggestion: the fills in order, one each; null when all eight are used', () => {
    expect(suggestStyle([])).toEqual({ fill: 'solid' });
    expect(suggestStyle(K('solid', 'hatch'))).toEqual({ fill: 'dots' });
    expect(suggestStyle(K(...FILLS))).toBeNull();
    expect(FILLS).toHaveLength(8);
  });

  it('a finding keeps its pattern while others come and go; an unused finding leaves the legend', () => {
    S().addFinding('mother', 'A');
    S().addFinding('father', 'B');
    S().addFinding('proband', 'C');
    expect(keyEntry(key(), 'B').fill).toBe('hatch');
    S().setFindingStatus('mother', 'A', 'none');
    expect(labels()).toEqual(['B', 'C']);
    expect(keyEntry(key(), 'B').fill).toBe('hatch');
    S().addFinding('mother', 'D');
    expect(keyEntry(key(), 'D').fill).toBe('solid'); // the freed pattern
  });

  it('a carrier: the left half in the finding’s fill; plain affected: full; person-level carrier: the left half cross-hatched (NSGC 2022)', () => {
    S().addFinding('mother', 'Miyop');
    S().setFindingStatus('mother', 'Miyop', 'carrier');
    expect(partsOf(person('mother'))).toEqual(['solid:carrier@90-270']);
    expect(person('mother').affected).toBe(false);
    expect(fillFor({ affected: true }, key())).toEqual({ mode: 'full' });
    expect(partsOf({ carrier: true }, key(), 'split')).toEqual(['cross:carrier@90-270']);
    // by default (clinician decision 2026-11-17) the person-level carrier's half is solid
    expect(partsOf({ carrier: true }, key())).toEqual(['solid:carrier@90-270']);
  });

  it('a carrier with findings: the carrier half on the left, the findings share the right half in equal parts', () => {
    const k = K('solid', 'hatch', 'dots', 'grid', 'horiz');
    const carries = [{ label: 'A', status: 'carrier' }];
    expect(partsOf({ conditions: [...carries, ...aff('B')] }, k)).toEqual(['solid:carrier@90-270', 'hatch@270-450']);
    expect(partsOf({ conditions: [...carries, ...aff('C', 'B')] }, k)).toEqual(['solid:carrier@90-270', 'hatch@270-360', 'dots@360-450']);
    expect(partsOf({ conditions: [...carries, ...aff('B', 'C', 'D', 'E')] }, k)).toEqual(['solid:carrier@90-270', 'hatch@270-315', 'dots@315-360', 'grid@360-405', 'horiz@405-450']);
    // a person-level carrier: the half in its own pattern, never a finding's
    expect(partsOf({ carrier: true, conditions: aff('B', 'C') }, k, 'split')).toEqual(['cross:carrier@90-270', 'hatch@270-360', 'dots@360-450']);
  });

  it('two carried findings share the left half (upper, lower); affected without a named finding fills the right half', () => {
    const k = K('hatch', 'grid');
    const p = { affected: true, conditions: [{ label: 'A', status: 'carrier' }, { label: 'B', status: 'carrier' }] };
    expect(partsOf(p, k)).toEqual(['hatch:carrier@180-270', 'grid:carrier@90-180', 'solid@270-450']);
  });

  it('a carried finding drawn solid beside "affected" without a name: black stays with "affected", the finding takes another pattern — never a solid symbol', () => {
    const k = K('solid', 'hatch');
    const p = { affected: true, conditions: [{ label: 'A', status: 'carrier' }] };
    const styles = displayStyles([p], k);
    const parts = fillFor(p, styles.key, 'split', styles).parts;
    expect(parts.map(q => q.fill)).toEqual(['checker', 'solid']);
    // and if no pattern were left, "affected" would take one instead of the carrier's black
    const noPick = fillFor(p, k, 'split', { affectedFill: 'grid' }).parts;
    expect(noPick.map(q => q.fill)).toEqual(['solid', 'grid']);
  });

  it('the proband affected by X stays fully filled; both parents carry X; a parent’s extra finding is drawn on the right in its own pattern', () => {
    S().addFinding('proband', 'X');
    S().setFindingStatus('mother', 'X', 'carrier');
    S().setFindingStatus('father', 'X', 'carrier');
    S().addFinding('father', 'Y', null);
    expect(fillFor(person('proband'), key())).toEqual({ mode: 'full' });
    expect(partsOf(person('mother'))).toEqual(['solid:carrier@90-270']);
    expect(partsOf(person('father'))).toEqual(['solid:carrier@90-270', 'hatch@270-450']);
  });

  it('a finding never moves for anyone because someone carries another one (it used to: findings piled into one quarter)', () => {
    S().addFinding('mother', 'A');
    S().addFinding('mother', 'B');
    S().addFinding('father', 'C');
    S().addFinding('proband', 'D');
    const fills = () => ['A', 'B', 'C', 'D'].map(l => keyEntry(key(), l).fill);
    expect(fills()).toEqual(['solid', 'hatch', 'dots', 'grid']);
    S().addSiblingTo('proband', 'female');
    const sib = S().doc.graph.parentChildRelationships.find(r => r.children.includes('proband')).children.find(c => c !== 'proband');
    S().setFindingStatus(sib, 'C', 'carrier');
    S().setFindingStatus(sib, 'A', 'affected');
    expect(fills()).toEqual(['solid', 'hatch', 'dots', 'grid']);
    expect(partsOf(person('mother'))).toEqual(['solid@270-450', 'hatch@450-630']);
    expect(partsOf(person(sib))).toEqual(['dots:carrier@90-270', 'solid@270-450']);
  });

  it('renaming a finding on the key renames it for everyone; a name already in use is refused', () => {
    S().addFinding('mother', 'Miyp');
    S().addFinding('father', 'Miyp');
    S().addFinding('proband', 'OSB');
    S().renameFinding('Miyp', 'Miyop');
    expect(labels()).toEqual(['Miyop', 'OSB']);
    expect(['mother', 'father'].every(id => person(id).conditions.some(c => c.label === 'Miyop'))).toBe(true);
    const before = S().doc;
    S().renameFinding('Miyop', 'osb');
    expect(S().doc).toBe(before);
    expect(S().actionNotice.message).toMatch(/başka bir bulgu/);
  });

  it('save → load keeps the legend with its patterns', () => {
    S().addFinding('proband', 'Miyop', { fill: 'checker' });
    const file = S().exportProjectFile();
    S().resetPedigree();
    S().openProjectFile(file);
    expect(keyEntry(key(), 'Miyop')).toMatchObject({ fill: 'checker' });
  });

  it('deriveConditionKey: empty labels ignored; entries from before patterns get one; an older file\'s quarters are dropped and a shared fill is parted', () => {
    const g = { individuals: [{ id: 'a', conditions: [{ label: '  ' }, { label: 'X' }, { label: 'Y' }] }], conditionKey: [{ id: 'k1', label: 'Y' }] };
    expect(deriveConditionKey(g).conditionKey).toEqual([
      { id: 'k1', label: 'Y', fill: 'solid' },
      { id: 'k2', label: 'X', fill: 'hatch' },
    ]);
    // a file from before 2026-11-16: four findings, all solid in four quarters
    const old = {
      individuals: [{ id: 'a', conditions: aff('A', 'B', 'C', 'D') }],
      conditionKey: ['q1', 'q2', 'q3', 'q4'].map((region, i) => ({ id: `k${i + 1}`, label: 'ABCD'[i], region, fill: i === 3 ? 'grid' : 'solid' })),
    };
    expect(deriveConditionKey(old).conditionKey).toEqual([
      { id: 'k1', label: 'A', fill: 'solid' }, { id: 'k2', label: 'B', fill: 'hatch' },
      { id: 'k3', label: 'C', fill: 'dots' }, { id: 'k4', label: 'D', fill: 'grid' },
    ]);
  });
});

describe('black is kept for what has no name, where it is drawn (clinician 2026-11-16)', () => {
  it('"affected" without a finding named beside findings: a solid finding is shown in another pattern', () => {
    const k = K('solid', 'hatch');
    const people = [{ affected: true }, { conditions: aff('A') }];
    const st = displayStyles(people, k);
    expect(st.key.map(e => e.fill)).toEqual(['checker', 'hatch']); // the boldest pattern in place of black
    expect(k.map(e => e.fill)).toEqual(['solid', 'hatch']); // the stored key is untouched
    // without such a person nothing changes
    expect(displayStyles([{ conditions: aff('A') }], k).key.map(e => e.fill)).toEqual(['solid', 'hatch']);
  });

  it('"Yarısı siyah": a plain carrier\'s half is solid; a solid finding then takes another pattern', () => {
    const k = K('solid');
    const carrier = { carrier: true, conditions: aff('A') };
    const st = displayStyles([carrier], k, 'half');
    expect(st.key[0].fill).not.toBe('solid');
    expect(partsOf(carrier, st.key, 'half', st)).toEqual(['solid:carrier@90-270', `${st.key[0].fill}@270-450`]);
  });

  it('with all eight patterns in use the carrier\'s half stays solid: the black finding and "affected" without a name take the spare patterns (clinician report 2026-11-17)', () => {
    const plain = { carrier: true };
    const full = displayStyles([plain, { conditions: aff('A') }], K(...FILLS), 'half');
    expect(partsOf(plain, full.key, 'half', full)).toEqual(['solid:carrier@90-270']);
    expect(full.key[0].fill).toBe('bands');
    // beside a solid carrier half, "affected" without a name: one more spare, never a finding's pattern
    const both = { carrier: true, affected: true };
    const st = displayStyles([both, { conditions: aff('A') }], K(...FILLS), 'half');
    expect(partsOf(both, st.key, 'half', st)).toEqual(['solid:carrier@90-270', 'zigzag@270-450']);
    const shown = [...st.key.map(e => e.fill), st.affectedFill, 'solid'];
    expect(new Set(shown).size).toBe(shown.length); // every mark in the drawing is told apart
    // the stored key is untouched
    expect(K(...FILLS)[0].fill).toBe('solid');
  });
});

describe('the findings key runs in columns (clinician request 2026-10-27)', () => {
  it('short entries stand side by side in one row when the drawing is wide enough', () => {
    const g = keyGrid([100, 80, 90], [20, 20, 20], 1000, 10);
    expect(g.cols).toBe(3);
    expect(g.height).toBe(20);
    expect(g.cells).toEqual([{ x: 0, y: 0 }, { x: 110, y: 0 }, { x: 200, y: 0 }]);
  });
  it('a narrow drawing gets fewer columns; entries keep their order left to right, then down', () => {
    const g = keyGrid([100, 100, 100, 100, 100], [20, 35, 20, 20, 20], 320, 10);
    expect(g.cols).toBe(3);
    expect(g.width).toBe(320);
    expect(g.cells.map(c => c.y)).toEqual([0, 0, 0, 35, 35]); // a row is as tall as its tallest entry
    expect(g.cells[3].x).toBe(0);
    expect(g.height).toBe(55);
  });
  it('an entry wider than the drawing still gets its own column, nothing is dropped', () => {
    const g = keyGrid([500, 50], [20, 20], 300, 10);
    expect(g.cols).toBe(1);
    expect(g.cells).toHaveLength(2);
    expect(keyGrid([], [], 300, 10).cells).toEqual([]);
  });
  it('every entry is followed by the same gap, whatever the other rows hold (clinician request 2026-10-30)', () => {
    const g = keyGrid([60, 200, 70, 300, 40], [20, 20, 20, 20, 20], 400, 10);
    expect(g.cells).toEqual([{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 280, y: 0 }, { x: 0, y: 20 }, { x: 310, y: 20 }]);
    expect(g.width).toBe(350);
  });
  // moved to screen.test.js: the key entries follow one another with the same gap
});

describe('a finding removed from the whole pedigree (clinician request 2026-11-17)', () => {
  beforeEach(() => S().resetPedigree());
  it('goes from everyone who has it and from the key; an "affected" it set goes with it; one undo brings it all back', () => {
    S().addFinding('mother', 'Miyop');
    S().setFindingStatus('father', 'Miyop', 'carrier');
    S().setFindingStatus('pat_gf', 'Miyop', 'unknown');
    S().addFinding('proband', 'Kolestaz');
    S().updateIndividual('pat_gm', { affected: true });
    S().setFindingStatus('pat_gm', 'Miyop', 'affected');
    expect(S().removeFinding('Miyop').ok).toBe(true);
    expect(labels()).toEqual(['Kolestaz']);
    for (const id of ['mother', 'father', 'pat_gf', 'pat_gm']) expect((person(id).conditions || []).map(c => c.label)).toEqual([]);
    expect(person('mother').affected).toBe(false); // set by the finding: cleared with it
    expect(person('pat_gm').affected).toBe(true); // set by hand: kept
    expect(person('proband').conditions.map(c => c.label)).toEqual(['Kolestaz']);
    S().undo();
    expect(labels()).toEqual(['Miyop', 'Kolestaz']);
    expect(person('father').conditions).toEqual([{ label: 'Miyop', status: 'carrier' }]);
    expect(person('mother').affected).toBe(true);
  });
  it('a finding nobody has is refused with the reason', () => {
    expect(S().removeFinding('Yok böyle').ok).toBe(false);
  });
});
