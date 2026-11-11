/**
 * TidyIcon.jsx — "Konumlandır": the four arrows of moving things into place (clinician choice
 * 2026-11-11; the grid of squares and the small pedigree did not call the action to mind).
 * lucide's Move, kept under one name so the bar, the phone's menu and the tour show the same.
 */
import { Move } from 'lucide-react';

export default function TidyIcon(props) {
  return <Move className="tidy-icon" aria-hidden="true" {...props} />;
}
