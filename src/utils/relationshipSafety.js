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
