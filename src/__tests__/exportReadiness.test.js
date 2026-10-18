/**
 * exportReadiness.test.js — severity-tiered export gating (v0.2 follow-up).
 *
 * Run: npm test
 */

import { describe, it, expect } from 'vitest';
import { assessExportReadiness } from '../utils/exportReadiness';

function basePedigreeData(overrides = {}) {
  return {
    individuals: [
      { id: 'proband', sex: 'male', proband: true, affected: false },
      { id: 'mother', sex: 'female', proband: false, affected: false },
    ],
    nodes: [
      { id: 'proband', x: 100, y: 100 },
      { id: 'mother', x: 60, y: 20 },
    ],
    ...overrides,
  };
}

describe('assessExportReadiness (v0.2 follow-up)', () => {
  it('a clean pedigree with a real svg element can export with no fatal/error/warning', () => {
    const result = assessExportReadiness({
      pedigreeData: basePedigreeData(),
      integrityIssues: [],
      svgElement: {},
      zoomTransform: { k: 1, x: 0, y: 0 },
    });
    expect(result.canExport).toBe(true);
    expect(result.fatal).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('FATAL: no svg element blocks export', () => {
    const result = assessExportReadiness({
      pedigreeData: basePedigreeData(),
      integrityIssues: [],
      svgElement: null,
    });
    expect(result.canExport).toBe(false);
    expect(result.fatal.some(m => m.includes('bulunamadı'))).toBe(true);
  });

  it('FATAL: individuals exist but layout produced zero nodes (corrupted state)', () => {
    const result = assessExportReadiness({
      pedigreeData: basePedigreeData({ nodes: [] }),
      integrityIssues: [],
      svgElement: {},
    });
    expect(result.canExport).toBe(false);
    expect(result.fatal.some(m => m.includes('bozuk'))).toBe(true);
  });

  it('FATAL: a graph-structural error (e.g. CHILD_MULTI_UNION) blocks export', () => {
    const result = assessExportReadiness({
      pedigreeData: basePedigreeData(),
      integrityIssues: [
        { severity: 'error', code: 'CHILD_MULTI_UNION', message: 'Child in two unions', source: 'graph' },
      ],
      svgElement: {},
    });
    expect(result.canExport).toBe(false);
    expect(result.fatal.some(m => m.includes('Child in two unions'))).toBe(true);
  });

  it('FATAL: multiple probands (PROBAND_MULTIPLE) blocks export', () => {
    const result = assessExportReadiness({
      pedigreeData: basePedigreeData(),
      integrityIssues: [
        { severity: 'error', code: 'PROBAND_MULTIPLE', message: 'Two probands', source: 'graph' },
      ],
      svgElement: {},
    });
    expect(result.canExport).toBe(false);
    expect(result.fatal.some(m => m.includes('Two probands'))).toBe(true);
  });

  it('FATAL: any layout-integrity error (source: layout) blocks export, regardless of code', () => {
    const result = assessExportReadiness({
      pedigreeData: basePedigreeData(),
      integrityIssues: [
        { severity: 'error', code: 'DUPLICATE_NODE_POSITION', message: 'Two nodes overlap', source: 'layout' },
      ],
      svgElement: {},
    });
    expect(result.canExport).toBe(false);
    expect(result.fatal.some(m => m.includes('Two nodes overlap'))).toBe(true);
  });

  it('ERROR (not fatal): a graph error not on the fatal allowlist is downgraded to confirm-required', () => {
    const result = assessExportReadiness({
      pedigreeData: basePedigreeData(),
      integrityIssues: [
        { severity: 'error', code: 'CONSANGUINITY_STATUS_MISSING', message: 'Status missing', source: 'graph' },
      ],
      svgElement: {},
    });
    expect(result.canExport).toBe(true); // not fatal — export is allowed after confirmation
    expect(result.fatal).toEqual([]);
    expect(result.errors).toContain('Status missing');
  });

  it('WARNING: PROBAND_MISSING and CONSANGUINITY_UNRESOLVED pass through as warnings, export still allowed', () => {
    const result = assessExportReadiness({
      pedigreeData: basePedigreeData(),
      integrityIssues: [
        { severity: 'warning', code: 'PROBAND_MISSING', message: 'No proband', source: 'graph' },
        { severity: 'warning', code: 'CONSANGUINITY_UNRESOLVED', message: 'Unresolved consanguinity', source: 'graph' },
      ],
      svgElement: {},
    });
    expect(result.canExport).toBe(true);
    expect(result.warnings).toContain('No proband');
    expect(result.warnings).toContain('Unresolved consanguinity');
  });

  it('WARNING: unsupported sex symbol is flagged', () => {
    const result = assessExportReadiness({
      pedigreeData: basePedigreeData({
        individuals: [
          { id: 'weird', sex: 'not_a_real_value', proband: false, affected: false },
        ],
      }),
      integrityIssues: [],
      svgElement: {},
    });
    expect(result.canExport).toBe(true);
    expect(result.warnings.some(w => w.includes('weird'))).toBe(true);
  });

  it('WARNING: unknown sex on the proband is flagged as clinically relevant', () => {
    const result = assessExportReadiness({
      pedigreeData: basePedigreeData({
        individuals: [
          { id: 'proband', sex: 'unknown', proband: true, affected: false },
        ],
      }),
      integrityIssues: [],
      svgElement: {},
    });
    expect(result.canExport).toBe(true);
    expect(result.warnings.some(w => w.includes('proband'))).toBe(true);
  });

  it('WARNING: unknown sex on a non-affected, non-proband relative is NOT flagged', () => {
    const result = assessExportReadiness({
      pedigreeData: basePedigreeData({
        individuals: [
          { id: 'uncle', sex: 'unknown', proband: false, affected: false },
        ],
      }),
      integrityIssues: [],
      svgElement: {},
    });
    expect(result.warnings.some(w => w.includes('Klinik olarak'))).toBe(false);
  });

  // v0.5 Faz 2a (EX-2): export renders a canonical copy with the zoom/pan
  // transform removed, so the on-screen view can no longer clip the file —
  // the old "you are zoomed in, reset first" warning no longer applies.
  it('a zoomed/panned view no longer warns: export is view-independent', () => {
    const result = assessExportReadiness({
      pedigreeData: basePedigreeData(),
      integrityIssues: [],
      svgElement: {},
      zoomTransform: { k: 2.5, x: 40, y: -30 },
    });
    expect(result.canExport).toBe(true);
    expect(result.warnings.some(w => w.includes('yakınlaştırılmış'))).toBe(false);
  });

  it('a default identity zoom transform does not trigger the clipping warning', () => {
    const result = assessExportReadiness({
      pedigreeData: basePedigreeData(),
      integrityIssues: [],
      svgElement: {},
      zoomTransform: { k: 1, x: 0, y: 0 },
    });
    expect(result.warnings.some(w => w.includes('yakınlaştırılmış'))).toBe(false);
  });
});
