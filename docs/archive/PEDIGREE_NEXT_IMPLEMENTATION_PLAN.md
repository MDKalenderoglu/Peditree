# Pedigree Next Implementation Plan

Status: planning document. No code changes in this pass.
Breaks `PEDIGREE_COMPLEXITY_REQUIREMENTS.md` into PR-sized phases. Each phase follows CLAUDE.md's "Preferred Workflow": read before writing, audit after every graph change, one concern per slice, snapshot `generation` values before builder changes, new node types go builder → layout → renderer in that order.

## Ordering rationale

v0.3 (visual encoding) is render/data-model work, zero risk to the graph/layout invariants CLAUDE.md protects, and delivers the most clinically visible gap (multi-condition marking) fastest — but per architecture review it is split into three sequential slices (v0.3a/b/c below) rather than shipped as one PR, since the original single-slice framing understated its actual surface area (data migration + editor rewrite + new integrity check + partitioned geometry + a guaranteed breaking visual change). v0.4 (relationship/union editing) touches the builder and store but not the layout algorithm's core logic. v0.5 (adoption/twins/triplets) requires new layout primitives. v0.6 (complex layout stabilization) is explicitly gated on the layout-engine replacement question CLAUDE.md defers — it may end up being "harden the existing engine" rather than "replace it," decided after v0.3-v0.5 stress-test data (`PEDIGREE_LAYOUT_STRESS_TEST_PLAN.md`) comes in.

---

## v0.3 — Multi-condition visual encoding

**Revised per architecture review: v0.3 is split into three sequential, independently revertable slices (v0.3a, v0.3b, v0.3c) rather than one PR.** The original single-slice plan mixed a data migration, an editor rewrite, a new integrity check, partitioned-fill geometry, and a guaranteed breaking visual change into one change — that is not "pure render, zero risk" as originally framed. Each slice below must land, pass its own acceptance criteria, and show zero `auditPedigreeGraph`/`auditLayoutIntegrity` regressions before the next slice starts.

Cross-slice rules:
- **v0.3a must not change carrier rendering** and **must not implement partitioned fills** — solid fills and legend rows only.
- **v0.3b must not change relationship/union/adoption/twin/layout logic** — fill geometry and export parity only, no builder/layout touch.
- **v0.3c must be isolated** because carrier rendering is the one guaranteed breaking visual change across all of v0.3 and must be trivially revertable on its own.
- Do not implement adoption, twins, triplets, union editing, or layout-engine changes in any v0.3 slice — those remain v0.4/v0.5/v0.6.
- **R1.1 (auto-defaulting `affected: true` on proband assignment) is rejected** (see `PEDIGREE_COMPLEXITY_REQUIREMENTS.md` §1) and must not be implemented in any v0.3 slice. Proband and affected stay fully independent, with no automatic coupling.

### v0.3a — Data model + editor + legend, solid fills only

**Goal:** `Individual.conditions[]`, condition registry, legacy-string migration, editor UI, auto-legend. No partitioned fills, no carrier change. Corresponds to R2.1, R2.2, R2.4, R2.5.

**Files likely to change:**
- `src/components/PedigreeCanvas.jsx` — render 1 condition as full fill, ≥2 conditions as full fill + legend rows only (no partitioning); legend extended for conditions. Carrier rendering unchanged.
- `src/components/IndividualEditor.jsx` — replace single `condition` text input with a repeatable conditions list UI (add/remove condition + status picker), keep legacy `condition` text field for the italic under-node label (per `PEDIGREE_VISUAL_ENCODING_SPEC.md` §4, it's retained, not replaced).
- `src/state/usePedigreeStore.js` — `updateIndividual` needs to accept `conditions` array updates; `generateDerivedData`'s manual-edits merge (`mergedIndividuals`) needs a `conditions` passthrough line alongside the existing `condition`/`carrier`/etc. fields; migration logic for legacy `condition` string → `conditions[]` on session load (`bootstrapState`/`mergeWithDefaults`).
- `src/utils/graphIntegrity.js` — new `CONDITION_ID_UNLABELED` warning check.
- New: a small pure helper module (e.g. `src/utils/conditionRegistry.js`) that derives the stable `{conditionId → {label, patternIndex}}` registry from `individuals[].conditions[]`, used by both the legend and the fill renderer — kept separate from `PedigreeCanvas.jsx` so it's independently unit-testable without a DOM/SVG harness.

**Tests to add:**
- `src/__tests__/conditionRegistry.test.js` (new) — registry derivation is stable/order-preserving, dedups shared condition labels across individuals, handles empty/undefined `conditions`.
- Extend `src/__tests__/pedigree.test.js` or a new `visualEncoding.test.js` — legacy `condition` string migrates correctly; `affected`+empty `conditions` still resolves to full-fill semantics (assert on the derived render input, not pixel output, since there's no visual-regression harness in this repo today).

**Acceptance criteria:**
- Zero `auditPedigreeGraph`/`auditLayoutIntegrity` regressions on the existing test matrix (this slice touches no builder/layout code).
- An individual with `affected: true`, `conditions: []` (any pre-existing saved session) renders identically to before this change.
- Legend renders automatically whenever any individual has ≥1 condition, listing each registry entry once even if shared across individuals (Fixture 8).

### v0.3b — Partitioned fill geometry + export parity

**Goal:** half/quarter fill, corrected 3-condition geometry, pattern `<defs>`, overflow marker, and export-parity verification. Corresponds to R2.3 (corrected).

**Files likely to change:**
- `src/components/PedigreeCanvas.jsx` — full/half/quarter fill geometry; **3 conditions render as three equal sections, not a quarter layout with a blank 4th quadrant** (the blank-quadrant design is rejected per `PEDIGREE_VISUAL_ENCODING_SPEC.md` §2.3 — an empty region reads as a false "assessed unaffected" signal); new pattern `<defs>` (diagonal hatch, cross-hatch, dot); `{n}` overflow marker for 5+ conditions, disambiguated from the existing `[n]` notes marker.
- Legend must be verified present inside SVG/PNG/PDF export output, not only the on-screen DOM — this is a mandatory acceptance gate per `PEDIGREE_VISUAL_ENCODING_SPEC.md` §2.5, not optional polish.

**Tests to add:**
- Extend `visualEncoding.test.js` — 3-condition individual renders three equal sections with no blank region; 4-condition individual renders exactly 4 quadrant fills; 6-condition individual renders 4 drawn + `{n}` overflow referencing the legend (Fixture 8, extended).
- Export-parity test/manual check per `PEDIGREE_LAYOUT_STRESS_TEST_PLAN.md` Fixture 11 — SVG/PNG/PDF export contains the same fills, patterns, and legend as the live render.

**Acceptance criteria:**
- Zero `auditPedigreeGraph`/`auditLayoutIntegrity` regressions.
- No individual with 3 conditions ever renders a blank/empty section.
- A pedigree with 4 individuals each carrying a different single condition renders 4 distinct patterns + a 4-row legend, verified in both on-screen preview and exported SVG/PNG.
- An exported file (SVG or PNG) with any partitioned/patterned node also contains the legend; absence of the legend in export fails acceptance outright.

### v0.3c — Carrier centered-dot visual correction

**Goal:** carrier rendering moves from vertical half-fill to a centered dot. Isolated on its own because it is the one guaranteed breaking visual change in v0.3. Corresponds to `PEDIGREE_VISUAL_ENCODING_SPEC.md` §1.

**Files likely to change:**
- `src/components/PedigreeCanvas.jsx` — carrier rendering switched from `url(#carrier-half)` to a centered filled dot (~20% of node radius), preserving z-order (shape outline → condition fill/pattern → carrier dot → deceased slash/stillbirth cross → proband arrow → selection highlight).

**Tests to add:**
- Assert carrier dot renders correctly both alone and layered on top of a partitioned condition fill (carrier-and-affected-by-a-different-condition case from `PEDIGREE_VISUAL_ENCODING_SPEC.md` §3).

**Acceptance criteria:**
- Zero `auditPedigreeGraph`/`auditLayoutIntegrity` regressions.
- `carrier: true` individuals render the new centered-dot symbol; call out this visual change explicitly in the PR description and CHANGELOG since it changes the appearance of every existing carrier node.

---

## v0.4 — Relationship / union editing

**Goal:** multi-partner support in the editing UI + store, extended `Union.status` enum, per-union child-add targeting. Corresponds to R3.1-R3.2, R4.1-R4.2, R4.4, R6.2 (as much of it as multi-partner layout needs), R7.1 (verification), R7.2-R7.3 (add-parent/add-sibling) if time permits — otherwise these two slip to a v0.4.1. (R1.1-R1.4, the proband/affected independence requirements, are not a v0.4 concern — they are already satisfied by rejecting the auto-default in v0.3; no further work needed there.)

**Files likely to change:**
- `src/components/IndividualEditor.jsx` — remove the `!hasUnion` gate on "Es Ekle"; render an "add another partner" affordance even when `hasUnion` is true; add a union-status picker (dropdown: together/separated/divorced/ended_previous/unknown) per rendered union block, wired to a new store action.
- `src/state/usePedigreeStore.js` — `addChildTo` must stop silently picking `unions?.find(...)`'s first match once >1 union exists (require explicit `unionId` from the caller in that case); new action `updateUnionStatus(unionId, status)`; `addSpouseTo` unchanged in signature but no longer gated by caller-side UI restriction.
- `src/builder/pedigreeBuilderFromWizard.js` — `status` opt already flows through `addUnion()` (stage 2 for `U_PARENTS`, `graphEdits` addSpouse path in stage 10c does not currently accept a `status` — needs a param addition); default remains `'together'`.
- `src/utils/pedigreeLayout.js` — direct-edit union post-pass (`directEditUnions.forEach`) needs to correctly compose when a target individual has 2+ `U_DE_*` unions (currently written assuming at most one "the other partner needs a position" case per individual — needs the shift-right logic to iterate all of that individual's not-yet-positioned unions, not just the one being processed, or unions can stomp on each other's shift). This is the one genuinely layout-touching piece of this phase — keep it isolated to the `directEditUnions` post-pass block only, do not touch the three-branch (maternal/paternal/nuclear) layout core.
- `src/utils/graphIntegrity.js` — no new checks strictly required (existing `UNION_PARTNER_MISSING`/`UNION_SELF_PARTNER` already generalize), but worth adding `INDIVIDUAL_MULTIPLE_UNIONS_UNORDERED` **only if** the stress tests in `PEDIGREE_LAYOUT_STRESS_TEST_PLAN.md` Fixture 3 reveal an actual layout ambiguity that needs a data-level tie-breaker (e.g. an explicit union ordering per individual) — decide after running Fixture 3, don't build speculatively.

**Tests to add:**
- Extend `pedigree.test.js` with Fixture 3 from the stress test plan (multiple marriages) as a first-class test, not just a manual stress fixture — this phase's PR is specifically what's supposed to make that fixture pass.
- `addChildTo`/`addChildToUnion` store-level tests: target with 2 unions, explicit `unionId` required, wrong/missing `unionId` handled gracefully (no silent wrong-union attachment).
- Union status enum round-trip: set each of the 5 status values via the new picker, confirm `pedigreeLayout.js` doesn't crash on the two new values (even if v0.4 doesn't yet give them a distinct visual marker — that's v0.4.1/R4.3, deferred per requirements doc).

**Acceptance criteria:**
- An individual can have 2+ partner unions, each independently assigned children, via the UI alone (no direct store manipulation needed).
- `auditPedigreeGraph` and `auditLayoutIntegrity` report zero errors on the multi-partner stress fixture.
- Existing single-partner pedigrees are pixel-position-identical before/after (confirms the post-pass change is additive, not a rewrite of the shared layout path).

---

## v0.5 — Adoption / twins / triplets / termination-of-pregnancy

**Goal:** `Individual.adoptedRelationship`, `MultipleGestation` collection, `Individual.terminationOfPregnancy`. Corresponds to R5.1-R5.3.

**Files likely to change:**
- `src/builder/pedigreeBuilderFromWizard.js` — new individual field defaults (`adoptedRelationship: null`, `terminationOfPregnancy: false`); no new stage needed for adoption itself (it's a flag on existing addInd calls), but a new "multiple gestation" grouping step, likely inserted right after whichever stage creates the relevant children (sibling stage, collateral-branch stage, gen4 stage — needs a design decision on whether MZ/DZ grouping is offered at every child-creation site or only the wizard's main sibling stage for v0.5, deferred to a follow-up spike since it multiplies UI surface across ~4 existing loops).
- `src/utils/graphIntegrity.js` — `MULTI_GESTATION_MISSING_CHILD`, `MULTI_GESTATION_UNION_MISMATCH`, `MULTI_GESTATION_SIZE` checks (per `PEDIGREE_RELATIONSHIP_MODEL_SPEC.md` §6).
- `src/utils/pedigreeLayout.js` — new edge types `twinTie`/`mzHorizontalBar`; sibship x-ordering must keep twin/triplet group members adjacent (touches the `layoutUnionCluster`/nuclear-children-centering x-assignment loops — this is real layout-engine surface, budget extra review time here per CLAUDE.md's "layout work does not mix with other concerns" — this phase should NOT also touch v0.4's multi-partner layout code in the same PR even though both live in `pedigreeLayout.js`).
- `src/components/PedigreeCanvas.jsx` — render `twinTie`/`mzHorizontalBar`; dashed vs. solid `childStem` based on `adoptedRelationship`; new termination-of-pregnancy symbol (small triangle variant distinct from existing pregnancy-loss triangle, e.g. bisected or filled differently — exact symbol TBD against PSTF reference at implementation time).
- `src/components/IndividualEditor.jsx` — adoption status picker, termination-of-pregnancy checkbox (parallel to existing pregnancyLoss/stillbirth wizard-level checkboxes, but this one is a per-individual manual edit since TOP isn't currently a wizard-stage concept).

**Tests to add:**
- Fixture 6 and Fixture 7 from the stress test plan, promoted to real tests once the fields exist.
- `graphIntegrity.js` unit tests for the 3 new `MULTI_GESTATION_*` checks (missing child, union mismatch, size-out-of-range).
- Layout test: twin pair never has a non-twin sibling positioned between them in x-order, regardless of the order children were added in.

**Acceptance criteria:**
- A union with 2 MZ twins + 1 non-twin sibling renders the twin tie-bar between the correct two nodes only.
- An adopted child's `childStem` edge is visually dashed, siblings in the same union unaffected.
- `auditPedigreeGraph` zero errors on a pedigree combining twins + adoption + TOP in one fixture (interaction test, not just isolated features).

---

## v0.6 — Complex layout stabilization

**Goal:** address whatever `PEDIGREE_LAYOUT_STRESS_TEST_PLAN.md` fixtures 1, 2, 5 (and the cross-cutting overlap/cluster-gap checks) reveal as actual (not hypothetical) problems, plus cousin-of-cousin branch expansion (R6.3) and generic large-sibship/multi-branch overlap avoidance (R6.1). Corresponds to R6.1, R6.3, R6.5, and is the phase where the "replace the layout engine?" question gets an evidence-based answer rather than a speculative one.

**Precondition:** this phase does not start until v0.3-v0.5 land and their stress-test fixtures have run against real/representative pedigree shapes — CLAUDE.md is explicit that the layout engine doesn't change until the generation-derivation work (`computeGenerations`, already implemented) is "validated to produce identical values for all existing pedigree shapes," which itself should be re-confirmed after v0.4/v0.5 add new node/edge types that `computeGenerations` needs to traverse correctly (twins and adopted children go through ordinary PCR/union edges, so this is very likely a non-issue, but must be explicitly re-verified, not assumed).

**Files likely to change:** primarily `src/utils/pedigreeLayout.js` and `src/utils/layoutIntegrity.js` (new overlap/cluster-gap checks land here first, ahead of any engine change, per the stress test plan's cross-cutting section) and `src/builder/pedigreeBuilderFromWizard.js`'s `buildCollateralBranch()` if cousin-of-cousin recursion is added.

**Tests to add:** whatever the v0.3-v0.5 stress-test runs flagged as real overlaps, converted into permanent regression fixtures; a recursion-depth test for `buildCollateralBranch()` if extended.

**Acceptance criteria:** defined after the stress-test evidence comes in — deliberately not fully specified now, since specifying acceptance criteria for a fix before confirming the bug exists risks over-building. The one criterion fixed in advance: no regression on any existing test in `pedigree.test.js`, `exportReadiness.test.js`, `exportUtils.test.js`, `persistence.test.js`.

---

## Cross-phase risk notes

- **v0.3's carrier-symbol change is the one guaranteed visual break** across all phases — it is isolated to v0.3c specifically (not bundled with v0.3a/v0.3b) so it can be called out and reverted independently; call it out prominently in that PR description. Every other phase, and every other v0.3 slice, is additive.
- **v0.4's layout post-pass edit is the highest-risk single change** before v0.6 — it's the first time this codebase composes two sequential "shift everything right" passes for the same individual, and the existing code has no precedent for that composing correctly. Recommend writing Fixture 3's test *before* the implementation, not after, so the failure mode is visible pre-fix.
- **v0.5's twin/adoption layout work is genuinely new layout-engine surface**, not a post-pass bolt-on — this is where CLAUDE.md's "one concern per slice" rule matters most; resist the urge to also fix v0.4-discovered layout issues in the same PR.
- Across all phases: run `auditPedigreeGraph()` after every graph-shape change and confirm zero errors before touching layout, per CLAUDE.md's workflow — this plan does not repeat that instruction per-phase above but it applies uniformly.
