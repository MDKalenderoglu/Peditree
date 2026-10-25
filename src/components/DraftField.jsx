/**
 * DraftField.jsx — a text box that writes to the pedigree once the clinician
 * pauses, leaves the box or presses Enter, not on every key (audit
 * 2026-10-25: each key was a full graph operation, a relayout and its own
 * undo step). What is typed is never lost: a pending draft is written when
 * the box unmounts (another person selected) and, through flushDrafts(),
 * before the page is left.
 */
import { useEffect, useRef, useState } from 'react';
import { pendingDrafts as pending } from '../utils/drafts';

const IDLE_MS = 700;

export default function DraftField({ value, onCommit, as = 'input', ...rest }) {
  const shown = value ?? '';
  const [draft, setDraft] = useState(shown);
  const [focused, setFocused] = useState(false);
  const timer = useRef(null);
  const commitRef = useRef(null);

  // the person's value changed elsewhere (undo, the drawing): show it
  const [lastShown, setLastShown] = useState(shown);
  if (!focused && shown !== lastShown) {
    setLastShown(shown);
    setDraft(shown);
  }

  const schedule = (next) => {
    // the commit keeps the target it was typed for, even if the selection moves on
    const commit = () => {
      clearTimeout(timer.current);
      timer.current = null;
      pending.delete(commit);
      if (commitRef.current === commit) commitRef.current = null;
      if (next !== shown) onCommit(next);
    };
    if (commitRef.current) pending.delete(commitRef.current);
    clearTimeout(timer.current);
    commitRef.current = commit;
    pending.add(commit);
    timer.current = setTimeout(commit, IDLE_MS);
  };
  const commitNow = () => { if (commitRef.current) commitRef.current(); };

  useEffect(() => () => { if (commitRef.current) commitRef.current(); }, []);

  const Tag = as;
  return (
    <Tag {...rest} value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => { setDraft(e.target.value); schedule(e.target.value); }}
      onBlur={() => { commitNow(); setFocused(false); }}
      onKeyDown={(e) => { if (e.key === 'Enter' && as === 'input') commitNow(); }} />
  );
}
