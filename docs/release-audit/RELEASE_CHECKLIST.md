# Release checklist

## Done

- [x] Production build passes; no source maps; no external run-time resources
- [x] 1046 automated tests pass; lint clean; generation snapshot unchanged
- [x] Layout gates: PCL 13/13 clean; fuzz 0 % on seeds 1 and 12345
- [x] 12 clinical acceptance scenarios pass: valid, drawn, saved and reopened, undo/redo, PED
- [x] Turkish letters survive the screen, the file and the export
- [x] English interface; the drawing's language can be set apart; storage is language-neutral
- [x] Every control has a screen-reader name; drawing text meets WCAG AA contrast (A-01 fixed)
- [x] Shipped dependencies: 0 known vulnerabilities
- [x] Security headers written (`public/_headers`); patient data never leave the browser

## Before a public release (blocking)

- [ ] **Safari / iPad and Firefox:** on each, do the core journey once:
      New → add family → findings → save → open → download PNG / PDF → print → share
- [ ] **Clinician decisions**, or a visible "not supported" note in About and README:
  - [ ] Relationship ended: "//" as in NSGC 2022 Fig 3 (now a single slash)
  - [ ] Gender identity / AMAB-AFAB-UAAB (G-1)
  - [ ] Same-sex and unknown-sex partners (G-2)
  - [ ] Presymptomatic carrier and the "documented evaluation" asterisk (G-3)
- [ ] **Privacy:**
  - [ ] Add the shared-device sentences to About and README
- [ ] **Deployment:**
  - [ ] Cloudflare Pages preview deploy (`docs/PEDITREE_DEPLOYMENT.md`)
  - [ ] Check the response headers live, CSP above all
  - [ ] Open the preview on a tablet
- [ ] **Push** the branches (the user does this, with GitHub Desktop)

## Recommended (not blocking)

- [ ] A short usability run with 3–5 clinicians: a three-generation pedigree without help, with
      notes taken. Also a prerequisite for the paper.
- [ ] English drawings: "35 y" / "d. 35 y" (B2022 Fig 2), if approved
- [ ] Remove the legacy v1 localStorage writer (A-08) together with its tests
- [ ] Placeholder contrast (A-05); index.html and manifest text in English too (A-10)
- [ ] Update eslint when a non-breaking fix for minimatch exists (A-06)
- [ ] Code-split the bundle if first-load time matters on phones (A-07)

## Rollback

The site is static. Rolling back means redeploying the previous commit in Cloudflare Pages
(Deployments → previous → "Rollback"). No data migration is involved: files are schema v2, but a file saved by a newer version
may hold fields an older one refuses (e.g. assisted reproduction links, added 2026-11-01); keep
that in mind before rolling back across such a change.
