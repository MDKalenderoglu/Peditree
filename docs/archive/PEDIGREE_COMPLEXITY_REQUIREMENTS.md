# Pedigree Complexity Requirements

Status: planning document. No code changes in this pass.
Scope: translates the 8 clinical-review issues into precise, testable requirements against the current codebase (`src/builder/pedigreeBuilderFromWizard.js`, `src/utils/pedigreeLayout.js`, `src/utils/graphIntegrity.js`, `src/utils/validators.js`, `src/components/PedigreeCanvas.jsx`, `src/components/IndividualEditor.jsx`, `src/state/usePedigreeStore.js`).

Explicitly out of scope (per instruction): HPO, genotype, ACMG classification, inheritance-pattern prediction, genetic counseling content, clinical trial matching, external API integration. This app draws pedigrees; it does not interpret them.

Legend: **[V1]** = must-have, next 1-2 PRs. **[V2]** = later, after V1 lands and is stable.

---

## 1. Proband visualization

**Current state:** `Individual.proband` and `Individual.affected` are already independent booleans (confirmed in `pedigreeBuilderFromWizard.js` stage 10d and `PedigreeCanvas.jsx` — the proband arrow and the fill are drawn by two separate `if` blocks). There is no hard-coded `proband === affected` anywhere today. The gap is only in *default value on assignment*.

**REJECTED — R1.1 (auto-default `affected: true` on `setProband`).** Architecture review rejected this requirement. It contradicted R1.2 in the same list and is a clinical-safety hazard: a proband can be unaffected (an unaffected consultand is a common index case in genetic counseling), and auto-writing an affection status as a *side effect* of marking someone proband silently asserts a clinical finding the clinician never entered.

**Requirements:**
- **[V1-R1.1]** `proband` and `affected` are independent clinical facts. No code path may derive `affected` from `proband`, or `proband` from `affected`, in the builder, the store, or the UI. Calling `setProband(id)` must never write, default, or otherwise change that individual's `affected` value. It is acceptable for `IndividualEditor.jsx` to offer a separate, visible, user-initiated action (e.g. an explicit "also mark affected" button/checkbox next to the proband control) — but it must require its own deliberate click, never fire automatically or silently.
- **[V1-R1.2]** `affected` and `proband` must remain two independent fields in the data model and in every UI control. No code path may derive one from the other. (Restated from R1.1 for emphasis — this is the governing rule for this section.)
- **[V1-R1.3]** Exactly-one-proband invariant (`graphIntegrity.js` CHECK 11: `PROBAND_MISSING`/`PROBAND_MULTIPLE`) must continue to pass unchanged. Nothing in this section touches the invariant enforcement in builder stage 10d.
- **[V1-R1.4]** Reassigning proband to a different individual must never change that new individual's `affected` value, explicitly set or not. There is no default to protect against once R1.1 (auto-default) is rejected, so no `affectedExplicitlySet` bit is needed for this purpose.

## 2. Multiple diseases / phenotypes per individual

**Current state:** `Individual.condition` is a single free-text string (`IndividualEditor.jsx`), rendered as one italic line under the node. `affected`/`carrier` are single booleans producing one fill (`PedigreeCanvas.jsx`: `fill = affected ? NODE_STROKE : carrier ? 'url(#carrier-half)' : NODE_FILL`). There is no per-condition visual encoding and no legend beyond the ad hoc "Klinik Notlar" text box.

**Requirements:**
- **[V1-R2.1]** An individual must be able to carry a list of condition entries, not one string: `conditions: [{ id, label, status: 'affected'|'carrier'|'unknown' }]` (see `PEDIGREE_RELATIONSHIP_MODEL_SPEC.md` for the exact shape).
- **[V1-R2.2]** A pedigree-level condition registry must exist (`{ id, label, fillStyle }`) so the same condition drawn on multiple individuals maps to one consistent visual pattern and one legend entry, not a re-derived one per node.
- **[V1-R2.3]** Visual encoding must support, at minimum: full fill (1 condition), half fill (2 conditions), quarter fill (3-4 conditions), per `PEDIGREE_VISUAL_ENCODING_SPEC.md`. **[V2]** arbitrary hatch/pattern fill for 5+ conditions is a stretch goal, not required for V1 — cap the *drawn* partitions at 4 and overflow into a numbered legend reference for anything beyond that.
- **[V1-R2.4]** Legend must render automatically whenever any individual has ≥1 condition, listing each condition's label + fill sample.
- **[V1-R2.5]** Backward compatibility: `affected: true` with no `conditions` entries must still render as full solid fill (today's behavior). `carrier: true` must still render as today's carrier symbol. Existing saved sessions (`persistence.js`) with the old single-`condition`-string field must load without crashing — migrate `condition` string into `conditions: [{ label: condition, status: 'affected' }]` on read if `conditions` is absent.

## 3. Every individual must support full editing

**Current state:** `IndividualEditor.jsx` already operates on *any* selected node — `onAddSpouse`/`onAddChild`/`onUpdate` take a target `node.id`, not a hardcoded proband reference. This is further along than the issue text suggests. Concretely supported today for any individual: add one spouse (only if they have zero unions — `!hasUnion` gates the button), add child to an existing union, toggle affected/carrier/deceased, free-text notes/condition, set as proband. **Not supported for any individual today:** a second/third partner, adding a parent to an individual who doesn't have one, un-consanguineous-flagging an arbitrary union from the editor UI (only from the wizard's "Akraba evliliği" controls and `markUnionConsanguineous` which is keyed by union, not exposed per-individual in `IndividualEditor.jsx`).

**Requirements:**
- **[V1-R3.1]** Remove the `!hasUnion` gate in `IndividualEditor.jsx` — allow adding a 2nd, 3rd, ... partner to any individual. Each additional union must carry its own `status` (see requirement 4).
- **[V1-R3.2]** `addChildTo`/`addChildToUnion` (`usePedigreeStore.js`) must let the caller pick *which* union a new child attaches to when an individual has more than one union (currently `addChildTo` blindly picks `graph.unions?.find(...)` — the *first* match — which is wrong once multi-partner support lands).
- **[V2-R3.3]** Add a "make consanguineous" / "reported, unresolved" toggle to `IndividualEditor.jsx` per union, not only reachable via the wizard's parents-only consanguinity controls.
- **[V2-R3.4]** Add-parent-to-an-individual-with-no-parents affordance (currently the only way to give someone parents is via wizard stages 6/9b/9c or the `customConsanguinity` mechanism — there is no generic "add parents to this person" button in `IndividualEditor.jsx`).
- **[V1-R3.5]** Every field currently editable on the proband/nuclear family (affected, carrier, deceased, notes, conditions) must render identically in `IndividualEditor.jsx` regardless of `relation` value — audit for any `if (node.relation === 'proband')` style special-casing (none found in current read, but must not regress).

## 4. Partnership and marriage status

**Current state:** `Union.status` already exists as a string field, defaulted to `'together'` in `pedigreeBuilderFromWizard.js`, and `pedigreeLayout.js`/`PedigreeCanvas.jsx` already render a single slash for `'separated'` and a double slash for `'divorced'`. This is partially done. Missing: `'ended_previous'` and `'unknown'` statuses, and the *consanguinity* status axis (`consanguinityStatus`: `known_supported`/`reported_unresolved`/`none`) is a **separate field** from `status` — the issue text bundles "consanguineous known-supported / reported-unresolved" into the same list as "current/divorced/separated", which conflates two orthogonal axes in this codebase. Requirements below keep them separate to avoid breaking the existing `consanguinityStatus` machinery.

**Requirements:**
- **[V1-R4.1]** Extend `Union.status` enum to: `'together'` (current/ongoing), `'separated'`, `'divorced'`, `'ended_previous'` (non-marital ended relationship), `'unknown'`. Keep `'together'` as the default rather than renaming it to `'current'`, to avoid a data migration on every existing saved session.
- **[V1-R4.2]** Every union-creating UI path (wizard "other unions", `addSpouseTo`) must let the user pick `status` at creation time, not only after the fact.
- **[V2-R4.3]** Visual distinction beyond the existing single/double slash: `'ended_previous'` and `'unknown'` need their own marker (e.g. dashed union line for `'unknown'`, per PSTF conventions) — see `PEDIGREE_VISUAL_ENCODING_SPEC.md`.
- **[V1-R4.4]** Consanguinity status (`consanguinityStatus`) stays a per-union field independent of `status` — a union can be simultaneously `status: 'divorced'` and `consanguinityStatus: 'known_supported'`. No requirement here should merge these two fields.

## 5. Adoption, twins, triplets

**Current state:** None of this exists. `Individual` has `pregnancyLoss`/`stillbirth` (booleans) which are correctly kept distinct per CLAUDE.md non-negotiable rule #5, and termination-of-pregnancy is *not currently modeled at all* (only loss/stillbirth) despite being mentioned in the issue list — flagging this as a gap, not assuming it's covered.

**Requirements:**
- **[V2-R5.1]** Adoption: add `Individual.adoptedRelationship: 'biological'|'adopted_in'|'adopted_out'|null`. Standard PSTF notation draws adopted individuals with brackets and uses a dashed parent-child line for the adoptive (non-biological) link — this needs a new edge subtype in `pedigreeLayout.js`/`PedigreeCanvas.jsx`, and a data model decision about whether a union's children can be mixed biological/adopted (see `PEDIGREE_RELATIONSHIP_MODEL_SPEC.md`).
- **[V2-R5.2]** Twins/triplets: new `multipleGestations` collection grouping 2-3 children of the same union with a shared birth event and a `zygosity: 'monozygotic'|'dizygotic'|'unknown'` field. Requires new layout logic (shared drop-line apex, MZ horizontal tie-bar) and new edge types.
- **[V2-R5.3]** Termination of pregnancy (TOP): add as a third distinct type alongside `pregnancyLoss`/`stillbirth`, not folded into either. Needs its own symbol per PSTF (a small triangle bisected differently from spontaneous loss, per convention) and its own field, e.g. `Individual.terminationOfPregnancy: boolean`.
- **[V2-R5.4]** Pregnancy-outcome mutual exclusion: `pregnancyLoss`, `stillbirth`, and `terminationOfPregnancy` must not all be true together. At most one pregnancy-outcome type may be active for a given individual/pregnancy event. Add a `validators.js` check enforcing this (new error, e.g. `PREGNANCY_OUTCOME_CONFLICT`) alongside the existing distinct-symbol requirement in CLAUDE.md rule #5.
- **[V2-R5.5]** Gestational age annotation: miscarriage (`pregnancyLoss`), stillbirth, and TOP are clinically incomplete without a gestational age (e.g. "SAB 10wk", "TOP 18wk"). Add `Individual.gestationalAge: string|number|null`, rendered as part of the existing under-node annotation line for any individual with an active pregnancy-outcome flag.
- Both twin/triplet grouping and adoption are **not required for V1** — they touch layout (`pedigreeLayout.js` sibship-rail logic) which CLAUDE.md explicitly says not to touch until generation-derivation work is validated, and they are lower clinical frequency than multi-condition marking and union-status. Deferred to v0.5 (see `PEDIGREE_NEXT_IMPLEMENTATION_PLAN.md`).

## 6. Complex layout problems

**Current state:** `pedigreeLayout.js` is a hand-rolled, cluster-by-role layout (maternal branch / paternal branch / ancestor-couple post-pass / gen4 post-pass / direct-edit post-pass) — not a general Sugiyama-style graph layout. It works for the wizard's fixed shapes (≤5 generations, one collateral branch per role) but has no generic overlap-avoidance for: large sibships (>6-7 children push into the next cluster's space), multiple partners per individual (the gen4/direct-edit post-passes assume *one* spouse-shift per individual), cousin-of-cousin branches (no representation at all today — collateral branches stop at first-cousin depth), and arbitrary loops (consanguinity paths are hand-built per specific degree in builder stage 7, not laid out generically).

**Requirements:**
- **[V1-R6.1]** Large sibship (10+ children in one union): verify current `layoutUnionCluster`/nuclear-children centering does not overlap adjacent clusters; add a minimum-cluster-gap enforcement pass if it does (measurement work first, per `PEDIGREE_LAYOUT_STRESS_TEST_PLAN.md`, before deciding whether a fix is even needed).
- **[V2-R6.2]** Multiple partners per individual: extend the "post-pass" pattern (currently one shift-right pass for gen4, one for direct-edit) to iterate *all* additional-partner unions for a given individual, laying out 2nd/3rd spouse to alternating sides.
- **[V2-R6.3]** Cousin-of-cousin / grandchildren of aunts/uncles: requires generalizing `buildCollateralBranch()` recursion depth (today it is called exactly twice — once for aunts/uncles, once for GP-level great-aunts/great-uncles — with no recursive "children of cousins" step) and a corresponding layout extension.
- **[V2-R6.4]** Full Sugiyama-style layout replacement: explicitly **not** in scope until CLAUDE.md's "Do not replace the layout engine yet" gate is lifted (i.e., after `computeGenerations` — already implemented in `graphTraversal.js` — is fully validated across all pedigree shapes). This requirements doc records the *need* per the user's issue list; `PEDIGREE_NEXT_IMPLEMENTATION_PLAN.md` phases it as v0.6+, contingent on that gate.
- **[V1-R6.5]** Overlapping connector lines: audit-only for V1 — extend `layoutIntegrity.js` with a generic edge-crossing / node-overlap detector (currently only exact-duplicate-position detection exists, CHECK 3) so regressions are caught by tests before attempting any layout algorithm change.

## 7. Arbitrary branch expansion

**Current state:** Partially true already. `IndividualEditor.jsx` + `usePedigreeStore.js`'s `addSpouseTo`/`addChildTo`/`addChildToUnion` let a user attach a spouse+children to *any* existing individual in the graph (this shipped in commit `dde0a43`, "direct graph editing"). What's missing: attaching a *new collateral relative* (an uncle's cousin, a great-uncle not already modeled) rather than a direct descendant/spouse of an existing node, and adding ancestors upward from an arbitrary individual.

**Requirements:**
- **[V1-R7.1]** Confirm (via `PEDIGREE_LAYOUT_STRESS_TEST_PLAN.md` fixtures) that `addChildTo`/`addSpouseTo` work correctly on cousin-branch individuals (`mat_uncle_0_cm_0`-style IDs), not only on wizard-anchored fixed-ID nodes (`mother`, `father`, `proband`) — this is a real risk since the direct-edit layout post-pass in `pedigreeLayout.js` assumes the target already has an `xPos` from an earlier pass, which may not hold for deep cousin nodes depending on pass ordering.
- **[V2-R7.2]** "Add parent" affordance for arbitrary individuals with no existing parent union (ties to R3.4).
- **[V2-R7.3]** "Add sibling" affordance for arbitrary individuals (attach to their existing parent union without going through the wizard's proband-sibling stage).

## 8. General principle: proband-only operations must generalize

Already the direction of travel in this codebase (confirmed by commit history: `dde0a43` direct graph editing, `f9e75f0` dynamic dropY, `b50b587` collateral layout fixes). Restated as an acceptance gate rather than a new feature:

- **[V1-R8.1]** Every new editing capability added under requirements 1-4 above must be exposed through `IndividualEditor.jsx` keyed by `node.id`, with no `if (node.id === 'proband')`-style special case, unless a reviewer identifies a specific biological/structural impossibility (e.g. a stillbirth cannot have children — `isLoss` already gates the "Pedigriye Ekle" block correctly for this case).

---

## Summary table

| # | Issue | V1 (must-have) | V2 (later) |
|---|---|---|---|
| 1 | Proband visualization | Keep proband/affected fully independent, no auto-default (R1.1-1.4) | — |
| 2 | Multi-condition marking | Data model + full/half/quarter fill + legend (R2.1-2.5) | Arbitrary hatch patterns for 5+ |
| 3 | Full editing everywhere | Multi-partner button, per-union child target (R3.1-3.2, 3.5) | Add-parent, per-individual consanguinity toggle (R3.3-3.4) |
| 4 | Union status | Extended enum + creation-time picker (R4.1-4.2, 4.4) | New visual markers for ended/unknown (R4.3) |
| 5 | Adoption/twins/triplets | — (all deferred) | Adoption, twins/triplets, TOP (R5.1-5.3) |
| 6 | Layout stress | Sibship/overlap audit only (R6.1, R6.5) | Multi-partner layout, cousin-of-cousin, Sugiyama (R6.2-6.4) |
| 7 | Arbitrary expansion | Verify existing direct-edit on cousin nodes (R7.1) | Add-parent, add-sibling (R7.2-7.3) |
| 8 | Generalization principle | Acceptance gate on all of the above (R8.1) | — |
