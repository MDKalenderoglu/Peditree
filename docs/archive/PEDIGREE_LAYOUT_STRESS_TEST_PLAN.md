# Pedigree Layout Stress Test Plan

Status: planning document. No code changes in this pass.
Purpose: define concrete fixtures that exercise `src/utils/pedigreeLayout.js` and `src/utils/layoutIntegrity.js` under conditions harder than the current test suite (`src/__tests__/pedigree.test.js`, using `src/__tests__/helpers.js`'s `baseState()`/`buildAndAudit()` pattern) covers today. These fixtures are prerequisites for the layout work in `PEDIGREE_COMPLEXITY_REQUIREMENTS.md` R6.x — measure first, then decide what (if anything) needs to change in the layout engine, per CLAUDE.md's "Do not replace the layout engine yet."

Each fixture below specifies: the wizard state shape (or the direct-graph-edit sequence, for cases the wizard can't express yet), what to assert, and which existing invariant it's testing against regression.

## Test harness note

Existing tests build via `buildPedigreeFromWizard(state)` then run `auditPedigreeGraph`, `computePedigreeLayout`, `auditLayoutIntegrity`, `validatePedigree` — see `buildFull()` in `pedigree.test.js`. All fixtures below should follow that same four-step pipeline so failures are attributable to the right layer (graph vs. layout vs. semantic validation).

A gap to flag up front: several fixtures below (cousin-of-cousin, arbitrary consanguinity loops) **cannot currently be expressed through wizard state alone** — they require either extending `state.customConsanguinity`/`state.graphEdits`, or calling the builder's internal `addInd`/`addUnion`/`addChild` helpers directly, which are not exported today. This is itself a finding: stress-testing arbitrary-topology pedigrees needs either (a) exporting a minimal direct-graph-construction API from the builder, or (b) constructing `{ individuals, unions, parentChildRelationships }` fixtures by hand and feeding them straight to `computePedigreeLayout`/`auditLayoutIntegrity`, bypassing the wizard entirely. Recommend (b) for layout-only stress tests (faster, more precise control over topology) and reserve wizard-state fixtures for tests that also need to exercise the builder.

---

## Fixture 1 — Five generations

**Shape:** proband (gen 3) → parents (gen 2) → grandparents (gen 1) → great-grandparents (gen 0), plus one `gen4` descendant branch (proband's child, gen 4).

**Wizard state:** `baseState()` + `state.greatGrandparents = { mat_gf: true, mat_gm: true, pat_gf: true, pat_gm: true }` + one `gen4` entry targeting `'proband'` with 1+ children.

**Assertions:**
- `computeGenerations` output spans exactly gens 0-4 with no gaps (CLAUDE.md's BFS anchor at proband=3 should place great-grandparents at 0 and gen4 children at 4).
- `layoutIntegrity.js` reports zero errors (no `MISSING_LAYOUT_NODE`, `INVALID_NODE_POSITION`, `DUPLICATE_NODE_POSITION`).
- Visual: all 4 great-grandparent-pair nodes are horizontally distinct (not collapsed to the same x from the ancestor-couple post-pass in `pedigreeLayout.js` centering both pairs on the same computed midpoint if maternal and paternal great-grandparent centers happen to coincide).

## Fixture 2 — Large sibship (10 full siblings)

**Wizard state:** `baseState()` + `state.siblings.male` populated to 5 entries + `state.siblings.female` to 5 entries (11 children total incl. proband).

**Assertions:**
- No two of the 11 children share an x position (`layoutIntegrity.js` CHECK 3, `DUPLICATE_NODE_POSITION`).
- Sibship rail width (`maxCX - minCX` for the `sibship` edge) does not exceed the space available before colliding with the maternal or paternal branch cluster to either side — this requires a **new** assertion not currently covered by `layoutIntegrity.js`: compute the x-extent of `U_PARENTS`' sibship rail and compare against the x-position of the nearest maternal/paternal collateral-branch node; flag if they overlap. This is the concrete instance of requirement R6.1/R6.5 (extend `layoutIntegrity.js` with overlap detection) — write this assertion once, then decide if the layout itself needs a gap-enforcement fix.

## Fixture 3 — Multiple marriages (3 partners for one individual)

**Not expressible via wizard state today** (see harness note). Construct directly:
```
individuals: father (gen2), mother (gen2, U_PARENTS partner),
             spouse2 (gen2), spouse3 (gen2)
unions: U_PARENTS(father,mother), U_OTHER_1(father,spouse2), U_OTHER_2(father,spouse3)
parentChildRelationships: children under each of the 3 unions
```
This directly exercises requirement R6.2 / R3.1 (multi-partner layout, not yet built). Expected outcome at today's code state: **likely failure** — `pedigreeLayout.js` has no generic "N spouse unions for one individual" pass; only the wizard's fixed `motherOtherUnions`/`fatherOtherUnions` (singular, pre-v0.4) and the gen4/direct-edit single-shift post-passes exist. Recording the expected failure mode now (each additional union's spouse likely lands at the same x as the first, per the direct-edit post-pass's `mainX`-relative placement not accounting for a pre-existing second union) is the acceptance baseline for the v0.4 fix.

## Fixture 4 — Cousin marriage (first-cousin consanguinity)

**Wizard state:** `baseState()` + `state.parents.consanguineous = true`, `state.parents.consanguinityDegree = 'first_cousin'`, `state.parents.consanguinityPath = 'mothers_paternal_is_fathers_paternal'` (one of the 4 explicit paths handled in builder stage 7).

**Assertions:**
- `consanguinityStatus` finalizes to `'known_supported'` on `U_PARENTS` (not `'reported_unresolved'`).
- Shared great-grandparent nodes (`ggf`, `ggm`) exist and both `mat_gf` and `pat_gf` (or the appropriate pair per path) are children of `U_GG`.
- `pedigreeLayout.js` renders a `consanguineousUnion` (double-line) edge type for `U_PARENTS`, not `union` or `consanguineousUnionUnresolved`.
- This fixture already exists in spirit in `pedigree.test.js` — this stress-test plan's addition is to also assert **no line-crossing** between the shared-ancestor double line and the two now-closer-together grandparent branches, since consanguinity necessarily pulls the maternal and paternal branches toward each other in x, which is exactly where the maternal/paternal branch-gap logic (`matBranchRight`, `fatherMinX` in `pedigreeLayout.js`) needs to hold up.

## Fixture 5 — Proband's cousins with their own families (2nd-generation collateral)

**Wizard state:** `baseState()` + `state.maternalRelatives.uncles = [{ children: { male: 1, female: 1 } }]` (one maternal uncle with 2 children = proband's cousins) + then a `gen4`-style extension targeting one of those cousin IDs (`mat_uncle_0_cm_0`) with their own child.

**Gap flagged:** `state.gen4[].targetPath` in the current builder only accepts `'proband'` or a path string matched against `individuals.find(i => i.id === targetId)` (stage 10, `pedigreeBuilderFromWizard.js`) — it should already work for a cousin ID since it does a generic `individuals.find`, but this is untested territory (existing tests only target gen4 off `'proband'`). This fixture's primary job is to confirm that assumption holds, i.e. requirement R7.1 ("verify addChildTo/gen4 work on cousin-branch individuals, not only wizard-anchored fixed-ID nodes").

**Assertions:**
- Cousin's child lands at `generation: 4` (one below the cousin's gen 3).
- No x-collision between this new gen4 branch and the sibship rail of the proband's own nuclear family, which sits at a similar x-range if the maternal uncle branch is laid out close to the mother.

## Fixture 6 — Twins and triplets

**Not yet buildable** — no `MultipleGestation` collection exists (see `PEDIGREE_RELATIONSHIP_MODEL_SPEC.md` §6). Placeholder fixture to write once that collection lands in v0.5: 2 children of one union flagged as MZ twins, 3 children of a different union flagged as unknown-zygosity triplets. Assertions to add at that time: twins/triplets render adjacent in the sibship order (no non-twin sibling between them), shared-point tie edges (`twinTie`) have valid finite coordinates per the existing `layoutIntegrity.js` CHECK 5 pattern (`EDGE_INVALID_COORDINATE`).

## Fixture 7 — Adoption

**Not yet buildable** — no `adoptedRelationship` field exists yet (v0.5). Placeholder: one child in a union flagged `adopted_in`, siblings in the same union `biological`, confirm the `childStem` edge for the adopted child renders dashed while siblings render solid, and confirm `layoutIntegrity.js`'s existing sibling-Y-match check (CHECK 8, `SIBLING_Y_MISMATCH`) still passes — adoption must not affect y-position, only line style.

## Fixture 8 — Multiple disease markings across the pedigree

**Wizard state:** `baseState()` + post-build `manualEdits` (or direct `updateIndividual` calls in a store-level test) assigning proband `conditions: [{conditionId:'c1',status:'affected'}]`, a sibling `conditions:[{conditionId:'c2',status:'affected'}]`, a maternal uncle `conditions:[{conditionId:'c2',status:'affected'}]` (shared condition, tests the condition-registry dedup from `PEDIGREE_RELATIONSHIP_MODEL_SPEC.md` §2), and one individual with 4 simultaneous conditions (tests quarter-fill geometry cap from `PEDIGREE_VISUAL_ENCODING_SPEC.md` §2.3).

**Assertions (once v0.3 lands):**
- Legend contains exactly 2 entries (`c1`, `c2`), not 3, despite `c2` appearing on two individuals.
- The 4-condition individual's node renders exactly 4 quadrant fills, no 5th overflow marker.
- This fixture does *not* touch `pedigreeLayout.js` at all (conditions are a render-only concern) — its purpose is regression coverage for the visual encoding spec, and it belongs in the v0.3 phase's own test file, not bundled with the layout stress tests above. Listed here only because the user's requested test plan explicitly calls for it alongside the layout fixtures.

---

## Fixture 9 — Half-siblings (shared partner, two unions)

**Not currently listed above; added per architecture review.** **Wizard state / direct construction:** `father` (gen2) in `U_PARENTS(father, mother)` with children under that union, plus a second union `U_OTHER(father, spouse2)` with its own children — the same structural shape as Fixture 3 (multiple marriages) but the assertion focus here is the half-sibling relationship itself, not the multi-partner layout mechanics.

**Assertions:**
- Children of `U_PARENTS` and children of `U_OTHER` are correctly identified as half-siblings (share exactly one parent), not full siblings — whatever validator or UI logic classifies sibling relationships must distinguish this case, not assume all children of unions sharing a partner are full siblings.
- `computeGenerations` places all children of both unions at the same generation (both are `father.generation + 1`), per the existing BFS downward rule — this should already hold structurally but is untested for the half-sibling case specifically.
- No `graphIntegrity.js` error is raised solely from a shared partner across two unions (this is valid, not a structural error).

## Fixture 10 — Pregnancy outcomes with gestational age, mutual exclusion

**Not currently listed above; added per architecture review.** **Wizard state / direct construction:** three individuals — one with `pregnancyLoss: true, gestationalAge: '10hf'`, one with `stillbirth: true, gestationalAge: '32hf'`, one with `terminationOfPregnancy: true, gestationalAge: '18hf'` — plus one deliberately-invalid individual with both `pregnancyLoss: true` and `stillbirth: true` set simultaneously.

**Assertions:**
- Each of the three valid individuals renders its distinct symbol (per `PEDIGREE_VISUAL_ENCODING_SPEC.md`) with the gestational age annotated under the node.
- `validators.js`'s new `PREGNANCY_OUTCOME_CONFLICT` check fires exactly once, on the deliberately-invalid individual, and does not false-positive on any of the three valid ones.
- Existing sessions with no `gestationalAge` field load without error (`undefined` treated as not-specified, no annotation rendered).

## Fixture 11 — Export parity for v0.3 visual changes

**Not currently listed above; added per architecture review.** Purpose: confirm that partitioned fills, the carrier centered dot, the condition legend, and the `{n}` overflow marker are not screen-only regressions — a fill or legend that renders correctly on-screen but is missing or malformed in exported SVG/PNG/PDF is a clinically unsafe export, since exported pedigrees are the artifact actually placed in a patient chart.

**Construction:** a pedigree fixture combining (a) one individual with 2 conditions (half fill), (b) one individual with 4 conditions (quarter fill), (c) one individual with 6 conditions (4 drawn + `{n}` overflow marker), (d) one carrier individual (centered dot).

**Assertions:**
- SVG export contains the same partitioned-fill geometry, pattern `<defs>`, carrier dot, and legend rows as the on-screen render — diff the exported SVG's relevant `<pattern>`/`<circle>`/`<path>`/`<text>` elements against the live DOM, not just a visual screenshot comparison.
- PNG export (rasterized from the SVG per `exportUtils.js`) visually contains the legend and all partitioned fills — this is the export path most likely to silently drop a DOM-only overlay legend.
- PDF export (if implemented via the same SVG pipeline) is checked identically; if PDF export uses a separate code path from SVG/PNG, that path must be verified independently, not assumed to inherit the SVG fix.
- The legend specifically must be present in every export format — an exported partitioned/patterned node with no legend fails this fixture outright, per the mandatory-legend rule in `PEDIGREE_VISUAL_ENCODING_SPEC.md` §2.5.

## Cross-cutting assertions to add regardless of fixture

These extend `layoutIntegrity.js` and are candidates for `[V1]` regardless of which specific feature phase triggers them first (Fixture 2's sibship-overlap need surfaces this earliest):

1. **Generic node-overlap-within-tolerance check** — today's CHECK 3 (`DUPLICATE_NODE_POSITION`) only catches *exact* coincidence. A "closer than `NODE_X_SPACING`" check between any two liveborn nodes at the same y would catch near-miss overlaps that duplicate-position misses.
2. **Cluster-gap check** — minimum x-gap between the rightmost node of one branch cluster and the leftmost node of the adjacent cluster at the same generation.
3. **Edge-crossing detector** (lower priority, more expensive to compute correctly for arbitrary edge types) — deferred until fixtures 3/4/5 above reveal whether crossing is actually observed in practice, rather than building it speculatively.
