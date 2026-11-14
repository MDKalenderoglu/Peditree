# PediTree — pre-release audit

Date: 2026-11-02 · Branch `stabilization/clinical-layout` · audited from `dad57bf`, fixes in `83ad967` and after ·
Auditor: Claude (Opus 5.5) working alone in the repository, with no clinician present during the run.
Companion files: [CLINICAL_NOMENCLATURE_AUDIT.md](CLINICAL_NOMENCLATURE_AUDIT.md),
[SECURITY_PRIVACY_AUDIT.md](SECURITY_PRIVACY_AUDIT.md), [TEST_MATRIX.md](TEST_MATRIX.md).

## Decision

**NO-GO: release blocked, on missing evidence and sign-off rather than on a known defect.**
No P0 or P1 defect was found. The production build, all 1046 automated tests, the layout gates
and the twelve clinical acceptance scenarios pass. The block came from these items:

1. Safari / iPad and Firefox were never run (only Chromium); the clinician uses tablets.
2. Three NSGC 2022 coverage gaps need the clinician's decision, or need to be stated on the page:
   gender identity, same-sex couples, presymptomatic carrier.
3. The security headers have never been checked on a live preview deployment.

A GO would not mean
regulatory certification, an independent security certification or formal clinical validation.

## Architecture (as found)

- **Client-only static web app.** React 19, Vite 8, D3 (SVG), Zustand. No backend, no account, no
  network calls: the built bundle holds no endpoint other than the GitHub, DOI and React-error
  links. `public/_headers` sets the CSP `connect-src 'self'`.
- **Data model:** schema v2 graph document (`src/graph/document.js`): individuals, unions,
  biological parent-child relationships, social parent links (adoption) and reproductive links
  (ART). IDs are permanent and never reused (`ids.retired`). Every change goes through
  `ops.commit`: clone, mutate, finalize, validate. An operation that adds a new validation error
  is refused as a whole.
- **Persistence:** autosave of the whole document in `sessionStorage`, so it survives a reload
  and is gone when the tab closes. Project files (`.peditree.json`) and PED files are downloaded
  by the user. Only device preferences go to `localStorage`: look, ring menu, language.
- **Layout:** PCL engine (`src/layout/pcl/`): constrained ordering, a separated QP so symbols
  cannot overlap, NSGC routing, and edit-local relayout. Two fallback engines are kept on purpose.
- **Rendering:** D3 into one SVG. The export (SVG/PNG/PDF), printing and sharing use a canonical
  copy of that SVG.
- **Languages (new in this cycle):** Turkish and English. The drawing's language can be set
  apart from the screens'. Stored data never depends on the language.
- **Tests:** Vitest. Most are node tests; some draw the real app in jsdom (`screen.test.js`,
  `english.test.js`, `acceptance.test.js`). Layout benchmark and fuzz harnesses are in `scripts/`.

Architectural assessment: rules live in the data layer, so menus, files and PED import all pass
through the same validation. The graph and the drawn positions are separate; layout hints are
only a stability aid. Nothing found compromises pedigree correctness or persistence.
Maintainability risks are size and the kept fallbacks: `PedigreeCanvas.jsx` (~1000 lines),
`ops.js`, and two legacy layout engines.

## Method

1. Read the repository, CLAUDE.md, `docs/PEDITREE_*` and the Git state. Baseline was `dad57bf`,
   with a clean tree apart from the audit work.
2. Ran every existing gate: unit and screen tests, lint, build, generation snapshot, layout
   benchmark, layout fuzz with two seeds, and npm audit.
3. Added a clinical acceptance suite (`src/__tests__/acceptance.test.js`). It builds 12 synthetic
   families through the store's operations, the same calls the ring and the panel make. For each
   family it checks validation, drawn geometry, every person on screen, save → open equality, a
   full undo/redo round trip and PED export. It also checks Turkish letters through the screen,
   the file and the export, and gives every control a screen-reader name.
4. Measured performance (layout, edit, save, open) at 10, 20, 50 and 100 people.
5. Security and privacy: searched the code for dangerous APIs, checked storage use, inspected the
   built bundle, CSP and headers, and reviewed the hostile-file tests.
6. Accessibility: checked accessible names, computed the contrast of drawing and UI text colours,
   and checked reduced-motion handling.
7. Manual Chromium check in the dev preview: English screens, ring, Settings, a tablet-width
   window and the mark-collision audit.
8. Mutation checks on the new tests: each was shown to fail when the behaviour is broken on
   purpose.

## Findings

Severity follows the brief (P0 blocker … P3 low). "Fixed" means fixed, tested and committed.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| A-01 | P2 | Accessibility | Drawing text below WCAG AA: note numbers "[n]" `#ef4444` 3.8:1 at 9 px; older-record text `#6366f1` 4.47:1; empty-page message `#94a3b8` 2.6:1 | **Fixed** (`83ad967`): `#b91c1c` 6.5:1, `#4f46e5`, `#64748b` |
| A-02 | P3 | i18n / PED | The PED family id was always `AILE1` (Turkish), English exports included | **Fixed**: `FAM1` when the drawing is English |
| A-03 | P2 | Privacy (by design) | While the tab is open, identifiable data sit unencrypted in `sessionStorage`. Anyone at the same unlocked device can read them | Accepted risk, documented; institutional rule needed (see security file) |
| A-04 | P2 | Layout (known) | KI-1 couple centring on 200–300-person pedigrees; KI-2 a widening sibship can push families or fall back to a fresh layout; KI-10 the 387/474-person stress graphs take 1.7–2.8 s | Open, documented with guard tests (`docs/PEDITREE_KNOWN_ISSUES.md`) |
| A-05 | P3 | Accessibility | Placeholder text `--faint` `#8a939e` is 3.2:1. Placeholders are examples; every field also has a visible label or a name | Open |
| A-06 | P3 | Dependencies | 6 moderate advisories (minimatch, via eslint) in **dev** tooling; the shipped dependencies have 0 (`npm audit --omit=dev`) | Open; update eslint when a non-breaking fix exists |
| A-07 | P3 | Performance | One JS chunk: 703 kB, 222 kB gzip. Loaded once, cached as immutable | Open (code-split later if needed) |
| A-08 | P3 | Privacy hygiene | The legacy v1 localStorage writer `utils/persistence.saveSession` is still in the code. Only tests call it, never the app (old data are moved to the session and deleted) | Open; remove with the v1 migration tests |
| A-09 | P3 | i18n | Dates are typed day-first in English too (the placeholder says dd.mm.yyyy); a US user could type mm/dd | Open, product decision |
| A-10 | P3 | i18n | The `index.html` description and the web-manifest name are Turkish only | Open |
| A-11 | P3 | i18n / dead text | `templates.relationInfo().name/.sentence` build Turkish sentences that no screen shows | Open (remove or translate if ever shown) |
| A-12 | P3 | Hardening | `globalThis.__PEDITREE_PACKER__` (fallback-engine switch) is reachable from the browser console in production | Open. Harmless: it affects only that user's own browser |

**P0: 0 · P1: 0 · P2: 3, of which 1 fixed · P3: 9, of which 1 fixed.**

Coverage gaps, also listed in the nomenclature file and marked CLINICAL REVIEW REQUIRED. These are
not defects:

- G-1: gender identity vs sex assigned at birth (central to NSGC 2022)
- G-2: same-sex and unknown-sex partners are refused (product rule pending)
- G-3: presymptomatic / asymptomatic carrier notation
- G-4: printing is a single A4 page, so large pedigrees shrink
- G-5: no HPO coding (planned)

## Corrections made in this cycle

- English interface (`4562518`, `d907646`, `dc523be`, `dad57bf`). Built as asked by the clinician.
  It is a feature, not an audit fix; it is listed because the audit covered it. The new code
  carries its own guards (`english.test.js`, 13 tests): the dictionary is complete, no Turkish
  shows on the English screens, the drawing follows its own language, and storage is identical in
  both languages.
- A-01 and A-02, plus the acceptance and accessibility suites (`83ad967`).

## Evidence and limits

- Results are in [TEST_MATRIX.md](TEST_MATRIX.md). Every PASS there was actually run on this
  machine (Apple M5 Pro, macOS, Node 24.18).
- **Not tested:**
  - Firefox and WebKit/Safari, real or automated. Playwright is not installed; adding it means
    downloading browsers.
  - Real screen readers.
  - Real printers.
  - A live deployment.
  - Clinicians using the app (usability).
- jsdom has no layout engine. Text widths in screen tests are estimates. Real collisions are
  measured in the browser by the mark audit, which returned `[]` in English and in Turkish. That
  audit does not cover line–line crossings, exports, print or narrow windows.

## Remaining risks

1. Browser differences on Safari/iPad: SVG text measurement, the share sheet, printing.
2. A clinician misreading a family type the app cannot draw (G-1, G-2, G-3). If the page states
   these limits, the risk is low.
3. Shared devices (A-03).
4. Very large pedigrees (A-04).
