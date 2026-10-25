/**
 * exportReadiness.js
 *
 * Severity-tiered gating for pedigree export. Pure, detect-only — reads the
 * already-computed integrityIssues (graph + layout, tagged by source in
 * usePedigreeStore.js) plus a few export-specific checks that don't belong
 * in either auditor, and classifies the pedigree's current export readiness
 * into three tiers:
 *
 *   fatal   — export is blocked; the rendered SVG cannot be trusted to
 *             represent the data (missing render target, corrupted state,
 *             a graph-structural violation that would misrepresent family
 *             structure, or more than one proband surviving normalization).
 *   error   — export is allowed but requires explicit user confirmation
 *             (or, if confirmation isn't feasible in the calling context,
 *             a visible warning) — a real data-quality problem that does
 *             not by itself make the drawing misleading.
 *   warning — export proceeds; the issue is surfaced for awareness only.
 *
 * This module does not decide *how* to present these (that's App.jsx's
 * job) — it only classifies.
 */

// graphIntegrity.js codes that mean the graph itself is structurally
// invalid in a way that would misrepresent family structure if drawn
// (duplicate/dangling references, a child with two conflicting parent
// sets, a union partnered with itself) — plus PROBAND_MULTIPLE, called out
// explicitly as a fatal condition ("multiple probands after normalization
// failure"). Every one of these should be unreachable through the app's
// own UI (the builder normalizes them away) — seeing one here means the
// state is corrupt, imported, or otherwise bypassed normal construction.
const FATAL_GRAPH_CODES = new Set([
  'DUPLICATE_INDIVIDUAL_ID',
  'DUPLICATE_UNION_ID',
  'UNION_PARTNER_MISSING',
  'UNION_SELF_PARTNER',
  'PCR_MISSING_UNION',
  'PCR_MISSING_CHILD',
  'CHILD_MULTI_UNION',
  'PROBAND_MULTIPLE',
]);

const KNOWN_SEX_SYMBOLS = new Set(['male', 'female', 'unknown']);

/**
 * @param {object} params
 * @param {{individuals: Array, nodes: Array}} params.pedigreeData
 * @param {Array<{severity: string, code: string, message: string, source?: string}>} params.integrityIssues
 * @param {*} params.svgElement - the live svg DOM node, or null/undefined if none is available
 * @param {{k: number, x: number, y: number}|null} [params.zoomTransform] - current d3 zoom transform, if known
 * @returns {{ fatal: string[], errors: string[], warnings: string[], canExport: boolean }}
 */
export function assessExportReadiness({ pedigreeData, integrityIssues, svgElement, zoomTransform }) {
  const fatal = [];
  const errors = [];
  const warnings = [];

  // --- FATAL: no renderable SVG ---
  if (!svgElement) {
    fatal.push('Pedigri çizimi bulunamadı — dışa aktarılacak bir çizim yok.');
  }

  const individuals = pedigreeData?.individuals || [];
  const nodes = pedigreeData?.nodes || [];

  // --- FATAL: corrupted pedigree state ---
  // Individuals exist in the graph but layout produced no renderable nodes
  // for them at all — the SVG would be empty or wrong, not just imperfect.
  if (individuals.length > 0 && nodes.length === 0) {
    fatal.push('Pedigri verisi bozuk görünüyor: bireyler var ancak hiçbir düzen (layout) üretilmedi.');
  }

  // --- Classify existing graph/layout integrity issues ---
  for (const issue of (integrityIssues || [])) {
    if (issue.severity === 'error' && issue.source === 'layout') {
      // Any layout-level error (missing/duplicate node position, dangling
      // edge, mismatched Y) means the rendered picture does not correctly
      // reflect the data — two people could visually merge into one dot,
      // or a relationship line could point at nothing.
      fatal.push(`[Düzen] ${issue.message}`);
    } else if (issue.severity === 'error' && FATAL_GRAPH_CODES.has(issue.code)) {
      fatal.push(`[Grafik] ${issue.message}`);
    } else if (issue.severity === 'error') {
      errors.push(issue.message);
    } else if (issue.severity === 'warning') {
      warnings.push(issue.message);
    }
  }

  // --- Additional warning-tier checks (no existing auditor covers these) ---

  // Unsupported symbol type — defensive: a sex value the renderer has no
  // shape for at all (not the normal 'unknown' diamond case).
  const unsupportedSymbol = individuals.filter(i => !KNOWN_SEX_SYMBOLS.has(i.sex));
  if (unsupportedSymbol.length > 0) {
    warnings.push(
      `Desteklenmeyen sembol türü: ${unsupportedSymbol.map(i => i.id).join(', ')} için tanımlı bir cinsiyet sembolü yok.`
    );
  }

  // Missing/unknown sex specifically where it's clinically relevant —
  // the proband or an affected individual, not a spouse stub or an
  // otherwise-unremarkable relative.
  const clinicallyRelevantUnknownSex = individuals.filter(i =>
    i.sex === 'unknown' && !i.pregnancyLoss && !i.stillbirth && (i.proband || i.affected)
  );
  if (clinicallyRelevantUnknownSex.length > 0) {
    warnings.push(
      `Klinik olarak önemli bireylerde cinsiyet bilinmiyor: ${clinicallyRelevantUnknownSex.map(i => i.id).join(', ')}.`
    );
  }

  // (v0.5 Faz 2a, EX-2: export now always renders the whole pedigree from a
  // canonical copy with the zoom/pan transform removed — see
  // exportUtils.prepareExportSvg — so the current on-screen view can no
  // longer clip the file and no longer warrants a warning. `zoomTransform`
  // is still accepted for API compatibility.)
  void zoomTransform;

  return { fatal, errors, warnings, canExport: fatal.length === 0 };
}
