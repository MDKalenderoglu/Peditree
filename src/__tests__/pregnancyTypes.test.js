/**
 * pregnancyTypes.test.js — NSGC pregnancy outcomes (clinician decision
 * 2026-10-25): loss (SAB), stillbirth (SB, full size), ongoing pregnancy
 * (P), termination (TOP), ectopic (ECT); distinct types (rule 5).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { isPregnancy, isSmallSymbol, pregnancyKind } from '../graph/model';
import { pregnancyLine } from '../utils/annotations';
import { toPed } from '../graph/ped';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
const S = () => usePedigreeStore.getState();
const P = (id) => S().doc.graph.individuals.find(i => i.id === id);
const lastChild = () => S().doc.graph.parentChildRelationships.find(r => r.unionId === 'U_PARENTS').children.slice(-1)[0];
const errors = () => (S().integrityIssues || []).filter(i => i.severity === 'error');

describe('the five pregnancy outcomes', () => {
  it('each is added as its own type, with its label; only one flag at a time', () => {
    S().resetPedigree();
    const added = {};
    for (const [kind, flag] of [['loss', 'pregnancyLoss'], ['stillbirth', 'stillbirth'], ['ongoing', 'ongoingPregnancy'], ['termination', 'termination'], ['ectopic', 'ectopic']]) {
      S().addChildToUnion('U_PARENTS', 'unknown', { [flag]: true });
      added[kind] = lastChild();
      expect(pregnancyKind(P(added[kind]))).toBe(kind);
      expect(isPregnancy(P(added[kind]))).toBe(true);
    }
    expect(P(added.stillbirth).deceased).toBe(true);
    expect(isSmallSymbol(P(added.stillbirth))).toBe(false); // full size (NSGC)
    expect(isSmallSymbol(P(added.ongoing))).toBe(false);
    expect(isSmallSymbol(P(added.termination))).toBe(true);
    expect(isSmallSymbol(P(added.ectopic))).toBe(true);
    expect(errors()).toEqual([]);
  });

  it('the line below: SB 28 hf, TOP 16 hf, ECT, the week of a loss or ongoing pregnancy', () => {
    expect(pregnancyLine({ stillbirth: true, gestationWeeks: '28' })).toBe('SB 28 hf');
    expect(pregnancyLine({ termination: true, gestationWeeks: '16' })).toBe('TOP 16 hf');
    expect(pregnancyLine({ ectopic: true })).toBe('ECT');
    expect(pregnancyLine({ pregnancyLoss: true, gestationWeeks: '10' })).toBe('10 hf');
    expect(pregnancyLine({ ongoingPregnancy: true })).toBeNull();
    expect(pregnancyLine({ sex: 'male' })).toBeNull();
  });

  it('kind and week can be changed; an ongoing pregnancy that is born becomes a person', () => {
    S().resetPedigree();
    S().addChildToUnion('U_PARENTS', 'unknown', { pregnancyLoss: true });
    const id = lastChild();
    S().setPregnancyKind(id, 'termination');
    expect(pregnancyKind(P(id))).toBe('termination');
    expect(P(id).pregnancyLoss).toBe(false);
    S().setGestationWeeks(id, '16');
    expect(P(id).gestationWeeks).toBe('16');
    const before = S().doc;
    S().setGestationWeeks(id, '60');
    expect(S().doc).toBe(before);
    S().setPregnancyKind(id, 'ongoing');
    S().setPregnancyKind(id, '');
    expect(isPregnancy(P(id))).toBe(false);
    expect(P(id).gestationWeeks).toBeUndefined();
    expect(P(id).label).toBe('Cocuk');
  });

  it('a pregnancy cannot take a partner; it keeps its place among siblings; PED leaves it out', () => {
    S().resetPedigree();
    S().addChildToUnion('U_PARENTS', 'unknown', { ongoingPregnancy: true });
    const id = lastChild();
    const before = S().doc;
    S().addSpouseTo(id, 'male');
    expect(S().doc.graph.unions.length).toBe(before.graph.unions.length);
    S().updateIndividual('proband', { age: '5' });
    expect(S().doc.graph.parentChildRelationships.find(r => r.unionId === 'U_PARENTS').children.slice(-1)[0]).toBe(id);
    const ped = toPed(S().doc.graph, S().pedigreeData.nodes);
    expect(ped.trim().split('\n')).toHaveLength(7);
  });
});
