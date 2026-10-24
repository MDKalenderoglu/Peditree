/**
 * clinicUsability.test.js — first clinician-feedback package (2026-10-23):
 *   - removing people closes up the drawing (previous order kept);
 *   - an extra partner's children include miscarriage and stillbirth;
 *   - the notes strip never shows internal ids or purely informational lines.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { clinicalNotices } from '../utils/clinicalNotices';
import { withStableIdsExcludingDismissed } from '../utils/warningIds';
import { exportFileName } from '../utils/exportUtils';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });

const S = () => usePedigreeStore.getState();
const width = () => {
  const xs = S().pedigreeData.nodes.map(n => n.x);
  return Math.max(...xs) - Math.min(...xs);
};

describe('removing people closes up the drawing', () => {
  it('lowering a count shrinks the drawing, keeps the parents’ sides and draws no misleading line', () => {
    S().resetPedigree();
    S().updateRelativeCount('maternalRelatives', 'uncles', 3);
    S().updateRelativeChildren('maternalRelatives', 'uncles', 0, 'male', 4);
    S().updateRelativeCount('paternalRelatives', 'aunts', 1);
    const before = width();
    const motherLeftOfFather = () => {
      const x = id => S().pedigreeData.nodes.find(n => n.id === id).x;
      return x('mother') < x('father');
    };
    const side = motherLeftOfFather();
    S().updateRelativeChildren('maternalRelatives', 'uncles', 0, 'male', 0);
    S().updateRelativeCount('maternalRelatives', 'uncles', 0);
    expect(['compact', 'full']).toContain(S().layoutInfo.level);
    expect(width()).toBeLessThan(before);
    expect(motherLeftOfFather()).toBe(side);
    expect((S().integrityIssues || []).filter(i => i.severity === 'error')).toEqual([]);
  });
});

describe('extra partner of a parent', () => {
  it('children can include a miscarriage and a stillbirth', () => {
    S().resetPedigree();
    S().addOtherUnion('mother');
    S().updateOtherUnion('mother', 0, 'pregnancyLoss', 1);
    S().updateOtherUnion('mother', 0, 'stillbirth', 1);
    const u = S().wizardData.parents.motherOtherUnions[0];
    expect(u.children.pregnancyLoss).toBe(1);
    expect(u.children.stillbirth).toBe(1);
    const kids = S().doc.graph.parentChildRelationships.find(r => r.unionId === u.unionId).children
      .map(id => S().doc.graph.individuals.find(i => i.id === id));
    expect(kids.filter(k => k.pregnancyLoss)).toHaveLength(1);
    expect(kids.filter(k => k.stillbirth)).toHaveLength(1);
  });
});

describe('notes strip speaks the clinician’s language', () => {
  it('consanguinity without a degree: one plain note, pedigree numbers, no ids, no "Bilgi"', () => {
    S().resetPedigree();
    S().updateWizardData('parents', 'consanguineous', true);
    const st = S();
    const errors = (st.integrityIssues || []).filter(i => i.severity === 'error');
    const warnings = (st.integrityIssues || []).filter(i => i.severity === 'warning');
    const notices = clinicalNotices({
      errorIssues: withStableIdsExcludingDismissed(errors, []),
      warningIssues: withStableIdsExcludingDismissed(warnings, []),
      warnings: withStableIdsExcludingDismissed(st.warnings || [], []),
    }, st.pedigreeData);
    const text = notices.map(n => n.text).join(' | ');
    expect(text).not.toMatch(/U_[A-Z_]+|reported_unresolved|\bmother\b|\bfather\b|Union/);
    expect(text).not.toMatch(/^Bilgi|\| Bilgi/);
    expect(notices.length).toBeLessThanOrEqual(1);
  });
});

describe('patient name and keyboard (clinician request 2026-10-25)', () => {
  it('the patient name names the downloads (Turkish letters readable) and travels in the project file', () => {
    expect(exportFileName('Ayşe Çiğdem Yılmaz', 'png', new Date('2026-10-25T10:00:00Z'))).toBe('pedigri-ayse-cigdem-yilmaz-2026-10-25.png');
    expect(exportFileName('', 'svg', new Date('2026-10-25T10:00:00Z'))).toBe('pedigri-2026-10-25.svg');
    S().resetPedigree();
    S().setPatientName('Ali Veli');
    const file = S().exportProjectFile();
    S().resetPedigree();
    expect(S().doc.patientName).toBeUndefined(); // a new pedigree is a new patient
    S().openProjectFile(file);
    expect(S().doc.patientName).toBe('Ali Veli');
  });

  it('the name is drawn at the top left of the SVG; shortcuts never fire while typing', () => {
    const canvas = readFileSync(join(process.cwd(), 'src/components/PedigreeCanvas.jsx'), 'utf8');
    expect(canvas).toMatch(/patient-header/);
    const app = readFileSync(join(process.cwd(), 'src/App.jsx'), 'utf8');
    expect(app).toMatch(/if \(typing\) \{ if \(e\.key === 'Escape'\) t\.blur\(\); return; \}/);
    expect(app).toMatch(/key === 'z'/);
  });
});
