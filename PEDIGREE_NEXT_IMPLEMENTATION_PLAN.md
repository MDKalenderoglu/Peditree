# Pedigree Next Implementation Plan

Status: planning document. No code changes in this pass.
Breaks `PEDIGREE_COMPLEXITY_REQUIREMENTS.md` into PR-sized phases. Each phase follows CLAUDE.md's "Preferred Workflow": read before writing, audit after every graph change, one concern per slice, snapshot `generation` values before builder changes, new node types go builder → layout → renderer in that order.

## Ordering rationale

v0.3 (visual encoding) is pure-render, zero risk to the graph/layout invariants CLAUDE.md protects, and delivers the most clinically visible gap (multi-condition marking) fastest. v0.4 (relationship/union editing) touches the builder and store but not the layout algorithm's core logic. v0.5 (adoption/twins/triplets) requires new layout primitives. v0.6 (complex layout stabilization) is explicitly gated on the layout-engine replacement question CLAUDE.md defers — it may end up being "harden the existing engine" rather than "replace it," decided after v0.3-v0.5 stress-test data (`PEDIGREE_LAYOUT_STRESS_TEST_PLAN.md`) comes in.

---

## v0.3 — Multi-condition visual encoding

**Goal:** `Individual.conditions[]`, full/half/quarter fill, legend, carrier moves to centered-dot. Corresponds to requirements R2.1-R2.5, R1.1-R1.4 (proband-affected default fits naturally in this slice since it's also a small render/store default change, not a layout change).

**Files likely to change:**
- `src/components/PedigreeCanvas.jsx` — new fill-geometry logic (full/half/quarter), new pattern `<defs>` (diagonal hatch, cross-hatch, dot), carrier rendering switched from `url(#carrier-half)` to centered-dot, legend extended for conditions.
- `src/components/IndividualEditor.jsx` — replace single `condition` text input with a repeatable conditions list UI (add/remove condition + status picker), keep legacy `condition` text field for the italic under-node label (per `PEDIGREE_VISUAL_ENCODING_SPEC.md` §4, it's retained, not replaced).
- `src/state/usePedigreeStore.js` — `updateIndividual` needs to accept `conditions` array updates; `generateDerivedData`'s manual-edits merge (`mergedIndividuals`) needs a `conditions` passthrough line alongside the existing `condition`/`carrier`/etc. fields; migration logic for legacy `condition` string → `conditions[]` on session load (`bootstrapState`/`mergeWithDefaults`).
- `src/utils/graphIntegrity.js` — new `CONDITION_ID_UNLABELED` warning check.
- New: a small pure helper module (e.g. `src/utils/conditionRegistry.js`) that derives the stable `{conditionId → {label, patternIndex}}` registry from `individuals[].conditions[]`, used by both the legend and the fill renderer — kept separate from `PedigreeCanvas.jsx` so it's independently unit-testable without a DOM/SVG harness.

**Tests to add:**
- `src/__tests__/conditionRegistry.test.js` (new) — registry derivation is stable/order-preserving, dedups shared condition labels across individuals, handles empty/undefined `conditions`.
- Extend `src/__tests__/pedigree.test.js` or a new `visualEncoding.test.js` — legacy `condition` string migrates correctly; `affected`+empty `conditions` still resolves to full-fill semantics (assert on the derived render input, not pixel output, since there's no visual-regression harness in this repo today).
- Manual verification via `preview_*` tools: load app, assign 2, 3, 4 conditions to different individuals, confirm legend and fills visually match spec, confirm carrier dot renders and doesn't visually collide with fill.

**Acceptance criteria:**
- Zero `auditPedigreeGraph`/`auditLayoutIntegrity` regressions on the existing test matrix (this phase touches no builder/layout code, so this should be automatic — confirms the "one concern per slice" boundary actually held).
- A pedigree with 4 individuals each carrying a different single condition renders 4 distinct patterns + a 4-row legend.
- An individual with `affected: true`, `conditions: []` (any pre-existing saved session) renders identically to before this change.
- `carrier: true` individuals render the new centered-dot symbol; call out this visual change explicitly in the PR description since it changes the appearance of every existing carrier node.

---

## v0.4 — Relationship / union editing

**Goal:** multi-partner support in the editing UI + store, extended `Union.status` enum, per-union child-add targeting. Corresponds to R3.1-R3.2, R4.1-R4.2, R4.4, R6.2 (as much of it as multi-partner layout needs), R7.1 (verification), R7.2-R7.3 (add-parent/add-sibling) if time permits — otherwise these two slip to a v0.4.1.

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

- **v0.3's carrier-symbol change is the one guaranteed visual break** across all phases — call it out prominently in that PR description; every other phase is additive.
- **v0.4's layout post-pass edit is the highest-risk single change** before v0.6 — it's the first time this codebase composes two sequential "shift everything right" passes for the same individual, and the existing code has no precedent for that composing correctly. Recommend writing Fixture 3's test *before* the implementation, not after, so the failure mode is visible pre-fix.
- **v0.5's twin/adoption layout work is genuinely new layout-engine surface**, not a post-pass bolt-on — this is where CLAUDE.md's "one concern per slice" rule matters most; resist the urge to also fix v0.4-discovered layout issues in the same PR.
- Across all phases: run `auditPedigreeGraph()` after every graph-shape change and confirm zero errors before touching layout, per CLAUDE.md's workflow — this plan does not repeat that instruction per-phase above but it applies uniformly.
