/**
 * keyboardNav.test.js — arrow keys move the selection around the drawing
 * (clinician request 2026-10-25).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { nextPerson, RING_KEYS } from '../utils/keyboardNav';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
const S = () => usePedigreeStore.getState();
const D = () => ({ ...S().pedigreeData, unions: S().doc.graph.unions, parentChildRelationships: S().doc.graph.parentChildRelationships });

describe('arrow keys', () => {
  it('up from the proband reaches a parent, up again a grandparent; down comes back', () => {
    S().resetPedigree();
    const up = nextPerson(D(), 'proband', 'up');
    expect(['mother', 'father']).toContain(up);
    const gp = nextPerson(D(), up, 'up');
    const gps = S().doc.graph.unions.filter(u => u.id === 'U_MAT_GP' || u.id === 'U_PAT_GP').flatMap(u => u.partners);
    expect(gps).toContain(gp);
    expect(nextPerson(D(), up, 'down')).toBe('proband');
  });
  it('left and right walk along the row; the end of the row stays', () => {
    S().resetPedigree();
    S().addSiblingTo('proband', 'male');
    const row = S().pedigreeData.nodes.filter(n => n.generation === S().pedigreeData.nodes.find(x => x.id === 'proband').generation).sort((a, b) => a.x - b.x).map(n => n.id);
    expect(row.length).toBe(2);
    expect(nextPerson(D(), row[0], 'right')).toBe(row[1]);
    expect(nextPerson(D(), row[1], 'left')).toBe(row[0]);
    expect(nextPerson(D(), row[1], 'right')).toBeNull();
  });
  it('nobody below: stays', () => {
    S().resetPedigree();
    expect(nextPerson(D(), 'proband', 'down')).toBeNull();
  });
  it('letters: A parents, E spouse, K sibling, C/Ç child, B finding, D status, İ twin, N note', () => {
    expect(RING_KEYS).toMatchObject({ a: 'parents', e: 'spouse', k: 'left', c: 'bottom', 'ç': 'bottom', b: 'findings', d: 'status', i: 'twins', n: 'note' });
  });
});
