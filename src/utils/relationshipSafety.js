/**
 * relationshipSafety.js
 *
 * v0.3a.2 — audit-before-commit safety net for relationship-creation
 * actions ("make partners" / "make siblings"). These are the two actions
 * most likely to introduce a graph-integrity error the user doesn't
 * immediately notice (e.g. a generation mismatch, a sibling-generation
 * inconsistency, a duplicate position) — this module gives store actions a
 * way to build the trial result FIRST, check whether it introduces any
 * NEW error-severity issue that wasn't already present, and reject the
 * mutation instead of committing a broken pedigree.
 *
 * This does not replace or rewrite the layout engine — it only decides
 * whether to accept or roll back a single proposed graph change, using the
 * existing graphIntegrity/layoutIntegrity audits as the source of truth.
 */

import { buildWarningId } from './warningIds';

/**
 * @param {Array<{severity:string}>} issues
 * @returns {Set<string>} stable IDs of every ERROR-severity issue
 */
function errorKeySet(issues) {
  return new Set((issues || []).filter(i => i.severity === 'error').map(buildWarningId));
}

/**
 * Whether `afterIssues` contains at least one error-severity issue that was
 * NOT already present in `beforeIssues` — i.e. this specific change
 * introduced a new structural problem, rather than the pedigree already
 * having pre-existing unrelated errors.
 *
 * @param {Array<object>} beforeIssues
 * @param {Array<object>} afterIssues
 * @returns {boolean}
 */
export function introducesNewGraphErrors(beforeIssues, afterIssues) {
  const beforeKeys = errorKeySet(beforeIssues);
  const afterErrors = (afterIssues || []).filter(i => i.severity === 'error');
  return afterErrors.some(issue => !beforeKeys.has(buildWarningId(issue)));
}

/**
 * Human-readable, non-technical description of the first newly-introduced
 * error, for surfacing to the user when a relationship-creation action is
 * rolled back. Falls back to a generic message if none is found (should not
 * normally happen if `introducesNewGraphErrors` returned true).
 *
 * @param {Array<object>} beforeIssues
 * @param {Array<object>} afterIssues
 * @returns {string}
 */
export function describeNewGraphErrors(beforeIssues, afterIssues) {
  const beforeKeys = errorKeySet(beforeIssues);
  const newErrors = (afterIssues || []).filter(
    i => i.severity === 'error' && !beforeKeys.has(buildWarningId(i))
  );
  if (newErrors.length === 0) {
    return 'Bu ilişki şu anda güvenli çizilemiyor; önce ebeveyn ilişkisini netleştirin.';
  }
  return 'Bu ilişki şu anda güvenli çizilemiyor: ' + newErrors.map(e => e.message).join(' ');
}

// v0.3a.4 — layout-ambiguity (readability) codes. These are WARNING severity
// in the audit (a wizard-built pedigree can already exhibit them before any
// user action, so they must not hard-fail existing pedigrees). But a
// relationship mutation that *increases* their count makes the drawing
// strictly less readable, which the user explicitly must not be allowed to
// do — so these are gated by count, not by presence.
const LAYOUT_AMBIGUITY_CODES = new Set(['SIBSHIP_BUS_OVERLAP', 'EDGE_THROUGH_NODE', 'UNRELATED_NODE_IN_CHILD_FOOTPRINT']);

function countAmbiguity(issues) {
  return (issues || []).filter(i => LAYOUT_AMBIGUITY_CODES.has(i.code)).length;
}

/**
 * Whether the proposed change makes the layout strictly *more* ambiguous
 * (more overlapping child buses / more connectors crossing unrelated
 * symbols) than before. Used to roll back a mutation that would collapse
 * the drawing's readability, even when the graph itself stays structurally
 * valid — the deeper layout fix is tracked in
 * PEDIGREE_LAYOUT_ENGINE_REDESIGN_PLAN.md.
 *
 * @param {Array<object>} beforeIssues
 * @param {Array<object>} afterIssues
 * @returns {boolean}
 */
export function introducesNewLayoutAmbiguity(beforeIssues, afterIssues) {
  return countAmbiguity(afterIssues) > countAmbiguity(beforeIssues);
}

/**
 * Whether a proposed change should be rolled back for ANY reason (a new
 * structural error OR increased layout ambiguity), with a single combined
 * check for convenience at mutation sites.
 *
 * @returns {{ blocked: boolean, reason: string }}
 */
export function assessRelationshipMutation(beforeIssues, afterIssues) {
  if (introducesNewGraphErrors(beforeIssues, afterIssues)) {
    return { blocked: true, reason: describeNewGraphErrors(beforeIssues, afterIssues) };
  }
  if (introducesNewLayoutAmbiguity(beforeIssues, afterIssues)) {
    return {
      blocked: true,
      reason: 'Bu işlem soy ağacını okunamaz hale getirecekti (ilişki çizgileri birbirine karışıyor) — ' +
        'işlem uygulanmadı. Daha az çakışan bir düzen için önce ilgili dalları sadeleştirin.',
    };
  }
  return { blocked: false, reason: '' };
}
