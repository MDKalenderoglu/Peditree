# 4-Week Implementation Roadmap

Companion to `AUDIT_PEDIGREE_APP.md`, `PEDIGREE_ARCHITECTURE_DECISION.md`, `PEDIGREE_DATA_MODEL_PROPOSAL.md`. Sequenced so each week's output is real and shippable on its own — no week depends on a future week's unfinished work, and no week builds on top of something the audit already flagged as broken.

Per `CLAUDE.md`'s refactor rules: one concern per slice, graph-correctness work does not mix with UI work, and `auditPedigreeGraph`/`validatePedigree` must pass with zero errors after every change in every week.

---

## Week 1 — Stop the bleeding: fix what's broken, enforce what's already specified

Nothing in this week is a new feature. Everything here is either a live bug (verified in the audit) or an unenforced invariant `CLAUDE.md` already declares non-negotiable. Shipping features on top of these would be building on a known-cracked foundation.

> **Update — "Pedigree Core Stabilization v0.2" landed most of this week's scope.** See `CHANGELOG_PEDIGREE_V0_2.md` for the authoritative record. Done: SVG/PNG export fix (L.1), the consanguinity-without-shared-ancestry fix (L.3), exactly-one-proband enforcement (L.5), and `integrityIssues` now surfaced in the live UI (a prerequisite for L.6 that this document didn't originally call out separately). **Not done, still open:** persistence was implemented as part of v0.2 ahead of its original Week-3 slot, but the full warning/error/**fatal** three-tier split with export gated specifically on `fatal` (L.6) was not built — v0.2 gates export on `severity: 'error'` visibility only (shown, not blocking), and `layoutIntegrity.js` still is not wired into the live app (L.7). The dead-parser cleanup (L.4) was done via quarantine to `src/experimental/` rather than deletion — see `PEDIGREE_MODEL_BOUNDARY.md`.

**Day 1–2:**
- Fix SVG/PNG export: add `id="pedigree-svg"` to the `<svg>` element in `PedigreeCanvas.jsx` (audit C.10/L.1). Add a regression test that actually calls `exportSVG()`/`exportPNG()` against a rendered DOM and asserts a non-null element is found — the fact this broke silently with zero test coverage is itself the gap to close.
- Fix the export-while-zoomed bug identified in audit §F: before serializing, reset the SVG's `viewBox` to the full computed bounds (the same `minX/maxX/minY/maxY` calculation already in `PedigreeCanvas.jsx`'s `useEffect`), independent of current pan/zoom transform.

**Day 2–3:**
- Fix the consanguinity-without-shared-ancestry violation (audit C.6/D.4): constrain `pedigreeBuilderFromWizard.js` stage 2 so `union.consanguineous = true` is only set when the path engine (stage 7) actually produced shared-ancestor nodes for that union; otherwise set a new `consanguinityPath: { status: 'declared_unverified' }` (per the data-model proposal) and have `PedigreeCanvas.jsx` render a visually distinct marker (e.g., a single dashed line with a small "?" glyph) instead of the standard double line.
- Add `graphIntegrity.js` CHECK 11: exactly one individual has `proband: true`. Same pattern as the existing duplicate-ID check (CHECK 1) — this is a ~10 line addition given the established style.
- Add a guard in `usePedigreeStore.js`'s `updateIndividual` action rejecting a `proband: true` update on a second individual (defense in depth — the UI doesn't expose this today, but the store action shouldn't rely on that).

**Day 4:**
- Wire `layoutIntegrity.js` into the live app (`generateDerivedData()` in `usePedigreeStore.js`), not just the test suite. Surface its issues in the same warnings mechanism as `validatePedigree`.
- Split the flat `warnings[]` into severity tiers (`warning`/`error`/`fatal`) per the prior clinical review's own recommendation (`hatalar` item 10) — reclassify each existing `validators.js` message into one of the three, and gate the export buttons on zero `fatal` issues.

**Day 5:**
- Decide and execute on the dead code: either delete `turkishPedigreeParser.js`/`TextInputPanel.jsx`/`JsonPanel.jsx`, or explicitly scope a follow-up ticket to rebuild the parser to emit the *same* deterministic ID scheme as the live builder (not UUIDs) and wire it into `App.jsx`. Do not leave it half-present past this week.
- Run the full existing test suite + `verify-generations.mjs` and confirm zero regressions from all of the above.

**Exit criteria:** export works and reflects the true full pedigree; no double consanguinity line can be rendered without backing structure; exactly-one-proband is enforced, not incidental; `layoutIntegrity` runs live; warnings are severity-tiered and export is gated on fatal issues; no orphaned parallel data model remains in the tree.

---

## Week 2 — Data model: additive schema for real clinical annotation

All changes here follow the migration path in `PEDIGREE_DATA_MODEL_PROPOSAL.md` — additive, non-breaking, verified against the existing test suite at every step (per `CLAUDE.md`'s snapshot-generation-values discipline: record current output for a representative pedigree before each change, assert unchanged after).

**Day 1:**
- Add `schemaVersion` and `metadata` (`ExportMetadata`) to the top-level document in `usePedigreeStore.js`.
- Introduce the `RelationType` controlled vocabulary; migrate the ~25 literal `relation:` strings in `pedigreeBuilderFromWizard.js` to it. Verify against existing test assertions on `relation` values before merging.

**Day 2:**
- Add `PregnancyOutcome` as an optional field alongside the existing `pregnancyLoss`/`stillbirth` booleans (audit D.1). Add a `type: 'termination'` option to `IndividualEditor.jsx` for pregnancy-loss individuals, with its own render marker in `PedigreeCanvas.jsx` (standard convention: distinct from spontaneous-loss triangle).
- Add `TwinRelationship` as a new top-level array. Add a minimal UI affordance (in `IndividualEditor.jsx`, "mark as twin of →" picker restricted to same-generation, same-parent-union siblings) and the corresponding renderer support (diagonal line to a shared point on the sibship rail, solid for MZ / open for DZ per convention).

**Day 3:**
- Add `Assertion<T>`-wrapped `affectedStatus`/`carrierStatus` alongside the existing booleans (existing booleans stay as the fast render path, driven from the new assertion's `.value`). Add `certainty`/`source` dropdowns to `IndividualEditor.jsx`'s existing affected/carrier checkboxes.
- Add `adopted: 'in' | 'out' | null` field + UI toggle + renderer convention (bracket around the symbol, per standard nomenclature).

**Day 4:**
- Add `PhenotypeAnnotation[]`, `ClinicalNote[]` to `Individual`; add a structured phenotype-entry UI to `IndividualEditor.jsx` (label + optional HPO ID + certainty/source), migrating the free-text `condition` field to populate the first `PhenotypeAnnotation` on save (backward-compatible, not a breaking rename).
- Add `Variant[]` (top-level) and `GenotypeAnnotation[]` (per-individual) — schema only this day, no UI yet (UI is day 5, since it depends on the variant-picker pattern being decided once, not per-field).

**Day 5:**
- Build the genotype-entry UI: a variant picker (create-or-select from the graph's existing `variants[]`, so two people tested for "the same" variant actually reference the same `Variant.id` rather than two independently-typed duplicates) + zygosity/test-method/date fields.
- Full regression pass: `auditPedigreeGraph`, `validatePedigree`, `layoutIntegrity`, full test suite, plus manual verification in the browser preview for a representative multi-generation pedigree with the new fields populated.

**Exit criteria:** every clinically-relevant field type identified in audit §F (annotation readiness checklist) has a place in the schema and a UI to populate it; nothing existing broke; the schema is versioned.

---

## Week 3 — Persistence and real interoperability

**Day 1–2:**
- Persistence (audit L.2, the single highest-leverage fix in the whole audit): `localStorage` autosave of `wizardData` on every store mutation (debounced), restore on load, with a schema-version check against the new `schemaVersion` field (fail gracefully — "this file is a newer/older format" — rather than crash on mismatch).
- Add explicit "Save pedigree" (download as `.json`) / "Load pedigree" (file picker) using the same shape, as a manual-portability escape hatch independent of `localStorage` (covers the "different computer" / "email to a colleague" case `localStorage` can't).

**Day 3:**
- PED export: derive PED rows (`family, individual, father, mother, sex, phenotype`) directly from the existing `individuals`/`unions`/`parentChildRelationships` graph for liveborn individuals with two identified parents (audit §I — flagged as one of the more immediately feasible formats given the graph is already correctly typed for it). Explicitly document the mapping decision for pregnancy losses/stillbirths/single-parent individuals (PED has no native encoding for these — decide and document a convention, e.g. omission with a warning, rather than silently guessing).

**Day 4:**
- CSV research-table export: flatten `individuals[]` (plus resolved `phenotypes`/`genotypes` where present) to rows. Straightforward now that the schema is stabilized from week 2.
- PDF/report export: build a proper "fit to full bounds, add patient/clinician header from `metadata`, add the existing clinical-notes legend" report layout, either via browser print-to-PDF of a dedicated print stylesheet or a headless-render step — decide based on whether a backend exists yet (it doesn't; browser print-to-PDF is the pragmatic default for this timeframe).

**Day 5:**
- Begin the FHIR `FamilyMemberHistory` relationship-code mapping table (`RelationType` → SNOMED/v3-RoleCode), as a standalone module with its own tests — do not wire full FHIR export yet if it doesn't fit the week; landing the mapping table alone still de-risks the eventual export.
- Full regression pass + manual browser verification: save → reload → confirm identical render; export each new format and manually inspect output validity.

**Exit criteria:** a clinician can close the tab and come back to the same pedigree; a pedigree can be handed to a genetics lab as PED; a pedigree can be handed to a researcher as CSV; the FHIR relationship vocabulary problem (audit D.10/I) has a concrete mapping, not just an identified gap.

---

## Week 4 — Reasoning groundwork (not full inheritance/segregation features yet)

This week is deliberately scoped to *groundwork*, not shipped reasoning features — per the architecture decision, reasoning built before the schema existed would have been throwaway work; reasoning built in week 4 on top of weeks 2–3's schema is not.

**Day 1–2:**
- Build the relationship-degree function (`computeRelationshipDegree(graph, idA, idB) → { degree, pathType, sharedAncestorUnionIds }`) on top of the existing `graphTraversal.js` adjacency maps (already 80% of what's needed per audit §J) — pure, tested function, no UI yet.
- Add tests for the function against the same representative pedigree shapes already used in `verify-generations.mjs`, extended with expected relationship-degree answers.

**Day 3:**
- Layout engine refactor (audit §M, `PEDIGREE_ARCHITECTURE_DECISION.md`): replace the cursor-based/order-dependent positioning in `pedigreeLayout.js` with a subtree-width-aware two-pass algorithm (compute required width bottom-up per branch, assign x-positions top-down) — keeping the exact same function signature/contract (`{individuals, unions, parentChildRelationships} → {nodes, edges}`) so nothing upstream or downstream changes. This is scheduled here, not week 1, because it's a real algorithmic rewrite that deserves its own isolated slice per `CLAUDE.md`'s "one concern per slice" rule, and because the relationship-degree function from Day 1–2 is unrelated and shouldn't be blocked on it.

**Day 4:**
- Using the relationship-degree function + the week 2 genotype/phenotype schema, build (but do not yet surface in the primary UI) a first segregation-consistency checker: given a `Variant` and the `GenotypeAnnotation`s recorded against it across the pedigree, flag topological inconsistencies (e.g., an obligate-carrier position — a child of two heterozygous parents — recorded as `wild_type`). Surface this initially as a debug/dev-only panel, not a clinician-facing claim, until it has been validated against known real pedigrees.
- Explicitly do **not** ship an autosomal-dominant/recessive/X-linked *pattern suggestion* feature this week — the audit's safety section (§H) is clear that overconfident inheritance suggestions are a named risk, and this groundwork needs validation against real cases before it becomes a clinician-facing claim.

**Day 5:**
- Write up validation results against a handful of hand-constructed reference pedigrees with known inheritance patterns (AR with consanguinity, AD with incomplete penetrance noted via `certainty`, X-linked recessive with carrier females) — this is the evidence needed to decide, in a subsequent cycle, whether/how to surface inheritance-pattern suggestions to clinicians, and what confidence language to use when it does.
- Full regression pass across everything shipped in weeks 1–4.

**Exit criteria:** a tested, reusable relationship-degree function exists; the layout engine no longer relies on ad-hoc shift-repair passes; a segregation-consistency checker exists and has been validated (not yet clinician-facing); a clear, evidence-based decision point exists for whether/how to ship inheritance-pattern suggestions next — rather than shipping an overconfident feature under deadline pressure.

---

## What this roadmap deliberately does not promise

- It does not promise a shipped, clinician-facing "this pedigree suggests autosomal recessive inheritance" feature within 4 weeks. Per audit §H, shipping that without validation is itself a listed safety risk — the roadmap ends week 4 at "validated groundwork + a decision point," not at a shipped claim.
- It does not promise full FHIR round-trip export — only the relationship-vocabulary mapping table that blocks it today.
- It does not promise a rebuilt text/conversational pedigree-entry flow — the existing one was already built once and abandoned (dead `turkishPedigreeParser.js`); re-attempting it is a legitimate future project but is out of scope for stabilizing and extending the current graph/wizard core.
