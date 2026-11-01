/**
 * clinicFlow2.test.js — clinician requests 2026-10-25: a pregnancy outcome
 * takes parents and siblings (never a partner or children); the person
 * being worked on stays selected and pulses after an edit; Enter saves a
 * box; what was written for relatives is offered to the others.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
const S = () => usePedigreeStore.getState();

describe('pregnancy outcomes and their relatives', () => {
  it('a loss with no parents drawn gets parents and a sibling; never a partner or a child', () => {
    S().resetPedigree();
    S().addSpouseTo('proband', 'female');
    const u = S().doc.graph.unions.find(x => x.partners.includes('proband')).id;
    S().addChildToUnion(u, 'unknown', { termination: true });
    const top = S().doc.graph.parentChildRelationships.find(r => r.unionId === u).children[0];
    S().addSiblingTo(top, 'female');
    expect(S().doc.graph.parentChildRelationships.find(r => r.unionId === u).children).toHaveLength(2);
    const before = S().doc;
    S().addSpouseTo(top, 'male');
    S().addChildTo(top, 'male');
    expect(S().doc.graph.unions.length).toBe(before.graph.unions.length);
    expect((S().integrityIssues || []).filter(i => i.severity === 'error')).toEqual([]);
  });
  it('a loss drawn alone (a fetus as the proband) gets parents', async () => {
    const { computeAddParentsPlan } = await import('../graph/plans');
    expect(computeAddParentsPlan({ individuals: [{ id: 'f', ectopic: true }], unions: [], parentChildRelationships: [] }, 'f').ok).toBe(true);
  });
});

// working in a big family
// moved to screen.test.js: stepping back on an empty click; the pulse after an edit
// moved to screen.test.js: Enter confirms a box; Shift+Enter in a note
// moved to screen.test.js: family variants offered in the side panel
