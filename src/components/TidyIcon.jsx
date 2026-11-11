/**
 * TidyIcon.jsx — "Konumlandır" (clinician request 2026-11-11: the four squares said nothing about a
 * pedigree). A small pedigree — a couple, their line of descent, a child — set straight, with a spark
 * for "tidied". Drawn like the lucide icons beside it (24 × 24, the current colour, round strokes).
 */
export default function TidyIcon({ size = 24, strokeWidth = 2, ...rest }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="tidy-icon" {...rest}>
      <rect x="2" y="3" width="6" height="6" rx="0.5" />
      <circle cx="15" cy="6" r="3" />
      <path d="M8 6h4M10 6v9" />
      <rect x="7" y="15" width="6" height="6" rx="0.5" />
      <path d="M19 13.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" />
    </svg>
  );
}
