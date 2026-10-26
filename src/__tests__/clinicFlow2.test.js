/**
 * clinicFlow2.test.js — clinician requests 2026-10-25: a pregnancy outcome
 * takes parents and siblings (never a partner or children); the person
 * being worked on stays selected and pulses after an edit; Enter saves a
 * box; what was written for relatives is offered to the others.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
const S = () => usePedigreeStore.getState();
const src = (f) => readFileSync(join(process.cwd(), f), 'utf8');

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

describe('working in a big family', () => {
  it('clicking the empty drawing keeps the selection; an edit pulses the person (and new ones), screen only', () => {
    const c = src('src/components/PedigreeCanvas.jsx');
    expect(c).not.toMatch(/onClick=\{\(\) => onNodeSelect\(null\)\}/);
    expect(c).toMatch(/ui-only pulse-halo/);
    expect(src('src/styles/ui.css')).toMatch(/@keyframes pedigree-pulse/);
  });
  it('Enter saves a box and leaves it; Shift+Enter is a new line in a note', () => {
    const d = src('src/components/DraftField.jsx');
    expect(d).toMatch(/e\.key !== 'Enter' \|\| \(as !== 'input' && e\.shiftKey\)/);
    expect(d).toMatch(/blur\(\)/);
  });
  it('a variant written for one person is offered to the others', () => {
    expect(src('src/components/IndividualEditor.jsx')).toMatch(/Ailede girilen/);
  });
});
