/**
 * auditFixes2.test.js — findings of the second read-only audit
 * (2026-10-25), each reproduced before it was fixed, and the clinician's
 * decisions that came with them (birth week kept; "unknown" for a finding).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { fillFor, suggestStyle } from '../graph/conditionKey';
import { toPed, fromPed } from '../graph/ped';
import { flushDrafts, pendingDrafts } from '../utils/drafts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
const S = () => usePedigreeStore.getState();
const P = (id) => S().doc.graph.individuals.find(i => i.id === id);
const lastChild = (uid = 'U_PARENTS') => S().doc.graph.parentChildRelationships.find(r => r.unionId === uid).children.slice(-1)[0];
const src = (f) => readFileSync(join(process.cwd(), f), 'utf8');

describe('#1 undo across opening another patient’s file', () => {
  it('undo after opening file B brings back A’s family with A’s name', () => {
    S().resetPedigree();
    S().setPatientName('Hasta A');
    S().updateIndividual('proband', { label: 'A' });
    const b = JSON.parse(JSON.stringify(S().doc));
    b.patientName = 'Hasta B';
    b.graph.individuals.find(i => i.id === 'proband').label = 'B';
    S().openProjectFile(JSON.stringify(b));
    expect(S().doc.patientName).toBe('Hasta B');
    S().undo();
    expect(P('proband').label).toBe('A');
    expect(S().doc.patientName).toBe('Hasta A');
    S().redo();
    expect(P('proband').label).toBe('B');
    expect(S().doc.patientName).toBe('Hasta B');
  });
  it('within one patient, undo still keeps the latest name', () => {
    S().resetPedigree();
    S().setPatientName('Örnek A');
    S().updateIndividual('proband', { age: '5' });
    S().setPatientName('Örnek B');
    S().undo();
    expect(S().doc.patientName).toBe('Örnek B');
  });
});

describe('#2 carrier and affected are both read', () => {
  it('affected and carrier without a named finding: affected right half, the NSGC carrier dot on the left', () => {
    const f = fillFor({ affected: true, carrier: true, conditions: [] }, []);
    expect(f.mode).toBe('regions');
    expect(f.parts).toEqual([{ region: 'q2', fill: 'solid', carrier: false, a0: 270, a1: 450 }]);
    expect(f.carrierDot).toBe(true);
  });
  it('a carried finding in black next to a plain "affected": the finding gets another fill for everyone', () => {
    S().resetPedigree();
    S().addFinding('proband', 'X'); // q1 solid
    S().setFindingStatus('mother', 'X', 'carrier');
    S().updateIndividual('mother', { affected: true });
    const x = S().doc.graph.conditionKey.find(e => e.label === 'X');
    expect(x.fill).not.toBe('solid');
  });
  it('when no distinct signature is left, an indistinguishable combination is refused with the reason', () => {
    S().resetPedigree();
    for (let i = 1; i <= 16; i++) S().addFinding('father', `B${i}`, suggestStyle(S().doc.graph.conditionKey));
    // B1 (q1 solid) carried and B2 (q2 solid) affected by the mother: no free right signature to move B2 to
    S().setFindingStatus('mother', 'B1', 'carrier');
    const before = S().doc;
    S().setFindingStatus('mother', 'B2', 'affected');
    expect(S().doc).toBe(before);
    expect(S().actionNotice.message).toMatch(/ayırt edilemez/);
  });
});

describe('#3 saving writes what is still being typed', () => {
  it('save, export and print flush pending drafts first', () => {
    const app = src('src/App.jsx');
    const save = app.slice(app.indexOf('const handleSaveProject'), app.indexOf('const handleSaveProject') + 300);
    expect(save).toMatch(/flushDrafts\(\)/);
    const gate = app.slice(app.indexOf('const gateExport'), app.indexOf('const gateExport') + 200);
    expect(gate).toMatch(/flushDrafts\(\)/);
    expect(app.slice(app.indexOf('const handleExportPed'), app.indexOf('const handleExportPed') + 200)).toMatch(/flushDrafts\(\)/);
  });
  it('a pending draft reaches the pedigree when flushed', () => {
    S().resetPedigree();
    const commit = () => { pendingDrafts.delete(commit); S().updateIndividual('proband', { geneticNote: 'yazılıyor' }); };
    pendingDrafts.add(commit);
    flushDrafts();
    expect(P('proband').geneticNote).toBe('yazılıyor');
  });
});

describe('#4 long text under the bottom row stays inside the drawing', () => {
  it('the drawing frame and the notes start below the lowest annotation line', () => {
    const c = src('src/components/PedigreeCanvas.jsx');
    expect(c).toMatch(/annotationBottom/);
    expect(c).toMatch(/const legendTop = Math\.max\(/);
  });
});

describe('#5 PED import limits', () => {
  it('a file too large or with too many people is refused with the reason', () => {
    expect(fromPed('F A 0 0 1 1\n'.repeat(1) + ' '.repeat(21 * 1024 * 1024)).reason).toMatch(/çok büyük/);
    const many = Array.from({ length: 3001 }, (_, k) => `F p${k} 0 0 1 1`).join('\n');
    expect(fromPed(many).reason).toMatch(/3000/);
  });
  it('a very deep ancestry is checked without recursion', () => {
    const lines = ['F a0 0 0 1 1', 'F m0 0 0 2 1'];
    for (let k = 1; k < 2500; k++) { lines.push(`F a${k} a${k - 1} m${k - 1} 1 1`); lines.push(`F m${k} 0 0 2 1`); }
    expect(() => fromPed(lines.join('\n'))).not.toThrow();
  });
});

describe('#6 the PED file name carries no patient name', () => {
  it('generic name and date only', () => {
    const app = src('src/App.jsx');
    expect(app).not.toMatch(/exportFileName\(doc\.patientName, 'ped'\)/);
    expect(app).toMatch(/exportFileName\('', 'ped'\)/);
  });
});

describe('#7 born: the gestational week stays as the birth week (clinician decision)', () => {
  it('kept on the person and shown in the notes', () => {
    S().resetPedigree();
    S().addChildToUnion('U_PARENTS', 'female', { ongoingPregnancy: true });
    const id = lastChild();
    S().setGestationWeeks(id, '32');
    S().setPregnancyKind(id, '');
    expect(P(id).gestationWeeks).toBe('32');
    expect(src('src/components/PedigreeCanvas.jsx')).toMatch(/doğum: /);
  });
});

describe('#8 a damaged layout hint does not stop a valid file from opening', () => {
  it('the hint is dropped, the family opens', () => {
    S().resetPedigree();
    const d = JSON.parse(S().exportProjectFile());
    d.layoutHints.positions.proband = null;
    d.layoutHints.positions.mother = ['a', 2];
    let r;
    expect(() => { r = S().openProjectFile(JSON.stringify(d)); }).not.toThrow();
    expect(r.ok).toBe(true);
  });
});

describe('PED: a finding the clinician is unsure about is "unknown" (clinician decision)', () => {
  it('not entered → 1 (no), unsure → 0 (unknown), affected → 2; the notes say "bilinmiyor"', () => {
    S().resetPedigree();
    S().addFinding('mother', 'Miyop', null);
    S().setFindingStatus('father', 'Miyop', 'unknown');
    expect(P('father').conditions[0].status).toBe('unknown');
    expect(P('father').affected).toBeFalsy();
    const rows = toPed(S().doc.graph, S().pedigreeData.nodes, { phenotype: 'Miyop' }).trim().split('\n').map(l => l.split('\t'));
    expect(rows.filter(r => r[5] === '0')).toHaveLength(1); // the father (unsure)
    expect(rows.filter(r => r[5] === '2')).toHaveLength(1); // the mother
    // the general affected mark: unsure about a finding and not affected → unknown
    const general = toPed(S().doc.graph, S().pedigreeData.nodes).trim().split('\n').map(l => l.split('\t'));
    expect(general.filter(r => r[5] === '0')).toHaveLength(1);
    expect(src('src/components/PedigreeCanvas.jsx')).toMatch(/bilinmiyor/);
  });
});
