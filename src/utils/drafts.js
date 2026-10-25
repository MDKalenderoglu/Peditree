/**
 * drafts.js — text boxes that have not written what was typed yet
 * (components/DraftField.jsx). Before the page is left, App writes them all
 * (flushDrafts), then the autosave.
 */
export const pendingDrafts = new Set(); // commit functions

/** Write every draft not written yet. */
export function flushDrafts() {
  [...pendingDrafts].forEach((commit) => commit());
}
