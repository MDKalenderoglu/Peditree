# Pedigree Relationship Model Spec

Status: planning document. No code changes in this pass.
Grounds itself in the current three-collection model documented in `CLAUDE.md` and implemented in `src/builder/pedigreeBuilderFromWizard.js`, `src/utils/graphIntegrity.js`, `src/utils/graphTraversal.js`, `src/utils/pedigreeLayout.js`.

## 1. Current model (baseline, unchanged fields)

```js
Individual   { id, sex, age, generation, relation, label, displayLabel,
               affected, carrier, deceased, proband,
               pregnancyLoss, stillbirth, notes, x?, y?,
               condition, ageAtDeath, causeOfDeath }   // manual-edit fields

Union        { id, partners: [id, id], consanguineous, consanguinityDegree,
               consanguinityPath, consanguinityStatus, status }

ParentChildRelationship  { unionId, children: string[] }
```

Invariants that must not be broken by anything below (CLAUDE.md non-negotiables, re-stated here for traceability):
- `idSet` — every individual ID globally unique.
- `childToUnionMap` — every child in at most one parent union.
- A union has exactly two partners, never siblings, never self (`graphIntegrity.js` CHECK 4 `UNION_SELF_PARTNER`, `validators.js` sibling-in-union check).
- Consanguinity requires real shared-ancestor nodes for `consanguinityStatus === 'known_supported'`; `reported_unresolved` is the honest fallback (already implemented, not touched here).
- `generation` is BFS-derived by `computeGenerations()` (`graphTraversal.js`), already implemented per CLAUDE.md's "Active work" section — new model additions below must not require re-deriving that function's contract (anchor at proband=3, upward via PCR→partners, downward via partners→PCR, lateral via union co-membership).

## 2. Multiple conditions per individual

```js
Individual.conditions: [
  { conditionId: string, status: 'affected' | 'carrier' | 'unknown' }
]
```

- Additive field. `affected`/`carrier` booleans remain and continue to drive the legacy single-fill/half-fill fallback (see `PEDIGREE_VISUAL_ENCODING_SPEC.md` §4) when `conditions` is empty.
- No new collection needed for the registry — it's derived at layout/render time from the individuals list (`conditions[].conditionId` + a label lookup), consistent with the codebase's existing preference for computed-not-stored derived data (`generation` itself is computed, not stored source-of-truth).
- `graphIntegrity.js` gets one new **[V1]** check: `CONDITION_ID_UNLABELED` (warning) — a `conditionId` appears in some individual's `conditions[]` but no individual in the graph has ever supplied a label for it (guards against a condition losing its only label if the one individual referencing it is deleted).

## 3. Union status (relationship + consanguinity are two separate axes)

```js
Union.status: 'together' | 'separated' | 'divorced' | 'ended_previous' | 'unknown'
Union.consanguinityStatus: 'none' | 'known_supported' | 'reported_unresolved'  // unchanged
```

These are orthogonal today (`status` drives divorce-slash rendering in `pedigreeLayout.js`; `consanguinityStatus` drives double-line vs dashed-amber rendering) and must stay orthogonal — a divorced consanguineous union is a real, valid, representable state.

**[V1]** Requirement: extend the `status` enum value set (currently only `'together' | 'separated' | 'divorced'` are handled by name in `pedigreeLayout.js`'s divorce-slash check — `'ended_previous'` and `'unknown'` fall through to no-marker today, which is silently acceptable but not distinct). Add explicit handling for the two new values in the edge-type switch (`pedigreeLayout.js`) and the render switch (`PedigreeCanvas.jsx`) rather than leaving them as an implicit "no marker" bucket, per `PEDIGREE_VISUAL_ENCODING_SPEC.md` §4.3 (deferred to V2 for the actual new marker, but the enum values themselves should exist in V1 so the data model doesn't need a second migration).

## 4. Multiple partners per individual

**No new collection needed.** The model already permits N unions referencing the same partner ID (nothing in `Union` or the builder prevents it structurally) — the gap is entirely in the *editing surface* and the *layout engine*, not the data model:

- `IndividualEditor.jsx`'s "Es Ekle" (add spouse) button is gated by `!hasUnion`, artificially limiting the UI to one partner even though the underlying `addSpouseTo()` action (`usePedigreeStore.js`) has no such restriction itself.
- `addChildTo()` (`usePedigreeStore.js`) resolves the target's union via `graph.unions?.find(u => u.partners.includes(targetId))` — the *first* match — which becomes ambiguous once a second union exists. **[V1]** fix: `addChildTo` must require an explicit `unionId` once the target has more than one union (fall back to auto-detect only when exactly one union exists), and `IndividualEditor.jsx` must render one "add child" affordance per existing union (it already does render per-union blocks in the `existingUnions.map(...)` loop — this part is already correct; only the single-union assumption in `addChildTo` needs fixing).
- `pedigreeLayout.js`'s direct-edit post-pass (`directEditUnions.forEach`) assumes exactly one spouse-shift is needed per newly-added union and shifts *everything* to the right of `mainX`. With two additional partners for the same individual, two sequential shifts must compose without overlapping each other — needs a stress-test fixture (`PEDIGREE_LAYOUT_STRESS_TEST_PLAN.md` §"multiple marriages") before deciding whether the existing shift logic already composes correctly or needs a rewrite.

No data model change required for this item; it's editing-surface + layout work (see `PEDIGREE_NEXT_IMPLEMENTATION_PLAN.md` v0.4).

## 5. Adoption

**[V2]** New field:

```js
Individual.adoptedRelationship: 'biological' | 'adopted_in' | 'adopted_out' | null
```

Key design question this spec resolves: **can a union have a mix of biological and adopted children?** Yes — clinically common (a couple with biological children who also adopt). This means the *adoption fact* cannot live on `ParentChildRelationship.children` as a single per-union flag; it must be per-child. Two options considered:

- (a) `ParentChildRelationship.children: string[]` stays as-is; adoption status lives entirely on the `Individual.adoptedRelationship` field, and the *renderer* decides dashed-vs-solid parent-child line by looking up each child's flag when drawing `childStem` edges.
- (b) Change `children: string[]` to `children: [{ id, relationshipType }]`.

**Decision: (a).** It keeps `ParentChildRelationship` untouched (avoids a breaking shape change to a structure referenced in ~6 files: builder, `graphIntegrity.js`, `graphTraversal.js`, `pedigreeLayout.js`, `layoutIntegrity.js`, `childOrdering.js`) and keeps "is this child adopted" as a property of the *person*, which is also correct biologically — adoption status doesn't change if the child later moves parent-child edges (it shouldn't, but the data shape shouldn't imply it can either).

Layout/render impact: `pedigreeLayout.js`'s `childStem` edge type gets a per-child lookup (`nodeById[cid].adoptedRelationship === 'adopted_in'`) to select solid vs. dashed stroke in `PedigreeCanvas.jsx` — no new edge *type* needed, just a conditional dash-array on the existing `childStem` type.

**Explicit limitation (architecture review):** simple adopted-child representation (one parent union, `adoptedRelationship` flag driving dashed-vs-solid line style) is in scope for v0.5 under decision (a) above. However, **an adopted child with both a biological parent union and an adoptive parent union drawn in the same pedigree is out of scope** until the current one-parent-union invariant is deliberately redesigned and audited. `childToUnionMap` (CLAUDE.md non-negotiable #2, enforced in the builder and CHECK 7 of `graphIntegrity.js`) permits a child in **at most one** parent union — decision (a) does not, and cannot, relax that. Nothing in this spec should be read as implying that a single `ParentChildRelationship` structure can safely represent both biological and adoptive parentage for the same child; that is a distinct, larger data-model change and is explicitly not planned here.

## 6. Twins, triplets (multiple gestation)

**[V2]** New top-level collection, parallel to `parentChildRelationships`:

```js
MultipleGestation {
  id: string,
  unionId: string,           // must match the children's shared parent union
  childIds: string[],        // 2 for twins, 3 for triplets
  zygosity: 'monozygotic' | 'dizygotic' | 'unknown',
}
```

Why a new collection rather than a field on `Individual`: zygosity is a property of the *group*, not any one individual (an MZ pair's zygosity isn't well-modeled as a per-child field without duplicating the same value on both children and risking one getting edited independently — a known bug class). A separate collection keyed by group is the same pattern `parentChildRelationships` already uses for the analogous "this ID belongs to that group" problem.

Validation additions to `graphIntegrity.js` **[V2]**:
- `MULTI_GESTATION_MISSING_CHILD` (error) — a `childIds` entry not present in individuals.
- `MULTI_GESTATION_UNION_MISMATCH` (error) — a listed child is not actually a child of `unionId` per `parentChildRelationships`.
- `MULTI_GESTATION_SIZE` (warning) — `childIds.length` outside `[2,3]` (triplets is the stated ceiling; quadruplets+ deferred further).

Layout/render impact (deferred detail to implementation phase, noted here for completeness): standard PSTF notation ties twins to a shared point below the sibship rail with a short diagonal line to each twin, and MZ twins get an additional horizontal bar connecting their two diagonal lines. This requires new edge types (`twinTie`, `mzHorizontalBar`) in `pedigreeLayout.js`/`PedigreeCanvas.jsx` and adjacent-position constraints in the sibship x-position pass so twins are never separated by a non-twin sibling in the render order — this is layout-engine work and is explicitly why twins/triplets is v0.5, after the v0.4 union/status work, not bundled with it.

## 7. Termination of pregnancy (distinct from loss/stillbirth)

**[V2]** New boolean, parallel to existing `pregnancyLoss`/`stillbirth`:

```js
Individual.terminationOfPregnancy: boolean
```

Kept as a third independent boolean rather than extending `pregnancyLoss`/`stillbirth` into an enum, to satisfy CLAUDE.md non-negotiable rule #5 literally ("distinct clinical types with distinct symbols... do not conflate them") and to avoid a breaking rename of two fields already checked in multiple places (`pedigreeLayout.js` `symbolHalfFor`, `PedigreeCanvas.jsx` shape/cross logic, `validators.js`).

**Pregnancy-event safety notes (architecture review, [V2]):**

- **Mutual exclusion:** `pregnancyLoss`, `stillbirth`, and `terminationOfPregnancy` must not all be true together. At most one pregnancy-outcome type may be active for a given individual/pregnancy event — these are alternative outcomes of one event, not independently stackable flags. Add a `validators.js` check (e.g. `PREGNANCY_OUTCOME_CONFLICT`) that fails if more than one of the three is true on the same individual.
- **Gestational age:** miscarriage, stillbirth, and TOP are clinically incomplete without a gestational age. Add `Individual.gestationalAge: string | number | null`, rendered alongside the existing under-node annotation for any individual with an active pregnancy-outcome flag (e.g. "SAB 10hf", "TOP 18hf" per Turkish-language convention). This is additive and does not require a schema migration for existing sessions (`undefined` treated as not-specified).

## 8. Arbitrary branch expansion — data model implications

No new fields required; this is purely an editing-surface gap (see `PEDIGREE_COMPLEXITY_REQUIREMENTS.md` R7.1-7.3 and R3.4). One clarification worth recording: `buildCollateralBranch()` in the builder is parameterized over `(relative, index, config, gpUnionId)` and already generic enough to be called recursively for "cousins of cousins" — the missing piece is a recursion trigger (currently called exactly twice per side, not looped), which is an implementation detail for `PEDIGREE_NEXT_IMPLEMENTATION_PLAN.md`, not a data model change.

## 9. Summary of data model deltas by phase

| Field/Collection | Phase | Breaking? |
|---|---|---|
| `Individual.conditions[]` | v0.3 | No — additive, falls back to `affected`/`carrier` |
| `Union.status` new enum values (`ended_previous`, `unknown`) | v0.4 | No — additive enum values, old values unchanged |
| Multi-partner editing (no data model change) | v0.4 | No |
| `Individual.adoptedRelationship` | v0.5 | No — additive, defaults null/'biological' |
| `MultipleGestation[]` collection | v0.5 | No — additive, absent = no twins |
| `Individual.terminationOfPregnancy` | v0.5 | No — additive boolean |
