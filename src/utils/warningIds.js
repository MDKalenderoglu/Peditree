/**
 * warningIds.js
 *
 * v0.3a.2 — stable identity for dismissible warnings.
 *
 * The app surfaces two shapes of warning today:
 *   - plain strings from validators.js (`warnings`)
 *   - structured issues from graphIntegrity.js/layoutIntegrity.js
 *     (`integrityIssues`: { severity, code, message, ids, source })
 *
 * A dismissed warning must not reappear unless the underlying condition
 * changes (v0.3a.2 spec) — so the ID must be derived from the warning's
 * *content*, not its position in an array (array index is not stable
 * across rebuilds; two warnings can reorder or one can disappear while
 * another appears, silently un-dismissing the wrong one if index were used).
 *
 * For structured issues, `code:ids` is a precise, content-derived key —
 * the same underlying condition (e.g. the same union still consanguineous
 * and unresolved) always produces the same code+ids, so it stays dismissed
 * until that specific condition resolves, and a *different* union hitting
 * the same code gets its own distinct ID.
 *
 * For plain-string warnings (no structured `code`/`ids` available), the
 * message text itself is the content — two warnings are "the same
 * condition" if and only if the text is identical, which is exactly true
 * for validators.js's messages (they embed the relevant IDs in the text).
 */

/**
 * @param {{ code?: string, ids?: string[] }|string} warningOrIssue
 * @returns {string} a stable identifier for this warning's content
 */
export function buildWarningId(warningOrIssue) {
  if (typeof warningOrIssue === 'string') {
    return `str:${warningOrIssue}`;
  }
  const code = warningOrIssue?.code || 'unknown';
  const ids = Array.isArray(warningOrIssue?.ids) ? warningOrIssue.ids.join(',') : '';
  return `issue:${code}:${ids}`;
}

/**
 * Filter a list of warnings/issues down to the ones NOT currently
 * dismissed, tagging each with its computed `_warningId` for the caller to
 * pass back to `dismissWarning`.
 *
 * @param {Array<object|string>} items
 * @param {string[]} dismissedIds
 * @returns {Array<{ _warningId: string } & (object|{ text: string }))>}
 */
export function withStableIdsExcludingDismissed(items, dismissedIds) {
  const dismissedSet = new Set(dismissedIds || []);
  return (items || [])
    .map(item => ({ item, _warningId: buildWarningId(item) }))
    .filter(({ _warningId }) => !dismissedSet.has(_warningId));
}
