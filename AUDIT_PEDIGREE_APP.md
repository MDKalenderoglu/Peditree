# Clinical + Technical Audit — Pedigree Drawing Application

Scope: full repository at HEAD (`f9e75f0`). Reviewed every file under `src/`, `public/`, root config, `verify-generations.mjs`, and `hatalar/claude_pedigree_hatalari.md` (a prior clinical bug report already on disk, in Turkish — its findings are corroborated below, not just repeated). `node_modules`/`dist` not present in this checkout; the test suite could not be executed in this sandbox (no `node`/`npm` on `PATH`) so test status is assessed statically, by reading `src/__tests__/pedigree.test.js` (2120 lines) and `verify-generations.mjs`.

No punches pulled below. Where a claim is falsifiable (a bug, a missing check, a dead file) it was verified by direct inspection or `grep`, not inferred.

---

## A. Executive verdict

**The current application is not a clinical-grade pedigree tool, and cannot become one by incremental UI polish.** It is a well-disciplined *pedigree drawing wizard* — the graph-integrity engineering (deterministic IDs, `auditPedigreeGraph`, BFS generation derivation, ordering reconciliation) is genuinely above the bar for a hobby project and should be preserved. But as a clinical instrument it is missing entire categories of required infrastructure, not just fields:

- **Zero persistence.** There is no save, no load, no localStorage, no backend. Refreshing the browser tab destroys the patient's pedigree. This alone disqualifies it from outpatient clinical use today.
- **Zero clinical annotation depth.** No genotype, no HPO terms, no gene/variant/zygosity, no diagnosis, no ACMG classification, no distinction between confirmed and reported family history. `condition` and `notes` are two free-text strings.
- **Zero interoperability.** Export is SVG/PNG only — and SVG/PNG export is currently *broken* (see C.10). No JSON save/reload, no PED, no FHIR.
- **A second, dead data model still in the tree.** `turkishPedigreeParser.js` + `TextInputPanel.jsx` + `JsonPanel.jsx` implement a parallel UUID-keyed individual schema that is never imported by `App.jsx`. It is not a work-in-progress feature, it is orphaned code that will mislead the next engineer (human or AI) into extending the wrong model.
- **Several of the project's own non-negotiable invariants (stated in `CLAUDE.md`) are not actually enforced in code** — most importantly, consanguinity degrees other than `first_cousin`/`double_first_cousin`/`second_cousin` render a double-line union with **no shared-ancestor nodes in the graph**, which `CLAUDE.md` itself defines as "a structural error."

**Verdict: targeted, disciplined refactor — not a full rebuild, and not a "just add features" extension either.** The graph model, audit layers, and ordering engine are worth keeping and building on. The individual data schema, persistence, export, and clinical annotation layers need to be designed properly (see `PEDIGREE_DATA_MODEL_PROPOSAL.md`) before any inheritance-reasoning or segregation-analysis feature is attempted — building reasoning on top of the current `Individual` shape would be building on sand. Full rationale in `PEDIGREE_ARCHITECTURE_DECISION.md`.

---

## B. Current architecture summary

**Stack:** React 19 + Vite 8, D3.js (raw SVG manipulation, not react-d3), Zustand 5 (single store), `uuid` (used only by the dead parser), plain JavaScript — no TypeScript, no runtime schema validation (no Zod/io-ts/PropTypes).

**Data flow (the live path, `App.jsx` → `WizardPanel`/`IndividualEditor`):**

```
WizardPanel (form inputs)
   → usePedigreeStore.updateWizardData / updateSiblingCount / addCustomConsanguinity / ...
   → wizardData (deep-cloned on every keystroke via JSON.parse(JSON.stringify))
   → generateDerivedData(wizardData, currentPedigreeData)
        → buildPedigreeFromWizard(wizardData)      [src/builder/pedigreeBuilderFromWizard.js]
             → computeGenerations(graph, 'proband', 3)   [src/utils/graphTraversal.js, BFS]
        → auditPedigreeGraph(newGraph)              [src/utils/graphIntegrity.js, detect-only]
        → mergeManualEdits (inline in the store)     [preserves displayLabel/affected/carrier/notes/condition/ageAtDeath/causeOfDeath across rebuilds]
        → computePedigreeLayout(newGraph)            [src/utils/pedigreeLayout.js → {nodes, edges}]
        → validatePedigree(combined)                 [src/utils/validators.js, Turkish-string warnings]
   → pedigreeData { individuals, unions, parentChildRelationships, nodes, edges }
   → PedigreeCanvas (D3 SVG render) + IndividualEditor (right panel) + warnings banner
```

Every wizard field change triggers a **full rebuild**: full graph reconstruction, full BFS generation pass, full layout recomputation, full validation. There is no incremental update path.

**Components:**
- `WizardPanel.jsx` (575 lines) — the only real data-entry surface. Accordion sections for proband, siblings, parents, consanguinity, maternal/paternal relatives, grandparent-level collaterals, great-grandparents, gen-4 descendants.
- `IndividualEditor.jsx` (263 lines) — right-panel editor for a selected node: display label, age, condition, deceased/age-at-death/cause-of-death, notes, affected/carrier/deceased checkboxes, plus "add spouse" / "add child" direct graph edits.
- `PedigreeCanvas.jsx` (334 lines) — D3-driven SVG renderer, typed edges, shape-by-sex, zoom/pan.
- `ChildOrderEditor.jsx` — up/down reordering UI, reusable per union.
- `TextInputPanel.jsx`, `JsonPanel.jsx` — **dead**, not rendered by `App.jsx` (verified: no import of either in `App.jsx`, and no other file imports `parseTurkishPedigree`).

**State management:** one Zustand store (`usePedigreeStore.js`, 465 lines) holding `wizardData` (UI/form shape) and the derived `pedigreeData` (graph + layout). No persistence middleware attached to Zustand (no `persist()`).

**Validation/integrity (three separate, non-overlapping layers, all detect-only):**
1. `graphIntegrity.js` — semantic graph checks (duplicate IDs, dangling union partners, self-partnered unions, multi-parented children, sibling/partner generation consistency, ordering-metadata consistency). Clean, deterministic, well-tested.
2. `layoutIntegrity.js` — post-layout geometry checks (missing/invalid node positions, duplicate coordinates, dangling union edges, Y-mismatch between partners/siblings). Exists but **is never called from the live app** — only referenced from `pedigree.test.js`. It runs in tests, not in the product.
3. `validators.js` — a grab-bag of Turkish-language string warnings (sibling-as-spouse, orphan individuals, unconsanguinity-degree-missing, raw node-overlap by rounded x/y). Mixed severities, all non-blocking, all rendered as plain `<li>` text in `App.jsx`.

**Layout/rendering:** `pedigreeLayout.js` (685 lines) is a hand-written, cursor-based, order-dependent x-position solver — not a graph layout algorithm (no Sugiyama, no constraint solver). It lays out maternal branch, then paternal branch, then centers nuclear children, then does an iterative "ancestor couples above their positioned children" pass, then two more ad-hoc post-passes for gen-4 and direct-edit unions, then a final "snap any orphaned node near a relative, else dump it at the right edge" fallback. `PedigreeCanvas.jsx` renders typed edges (`union`, `consanguineousUnion`, `sibship`, `parentChildDrop`, `childStem`, `divorceSlash`, `childlessDrop`/`childlessBar`) with D3, imperatively, inside a `useEffect`.

**Export:** `exportUtils.js` — `exportSVG()`/`exportPNG()`, both do `document.getElementById('pedigree-svg')`. **This ID does not exist anywhere in the codebase** (verified by grep across `src/`) — `PedigreeCanvas.jsx`'s `<svg>` element carries no `id` attribute. Both export buttons currently no-op silently. See C.10.

**Tests:** `src/__tests__/pedigree.test.js` (2120 lines, ~30 `describe` blocks) is a genuinely strong regression suite for the **builder and ordering logic** — 12 numbered pedigree-shape cases, structural invariants, ordering unit tests, migration/persistence-of-`childOrders`, direct graph edits, custom consanguinity. There is **no test coverage** for `pedigreeLayout.js` pixel/geometry output beyond what `layoutIntegrity.js` checks structurally, no test for `PedigreeCanvas.jsx` rendering, no test for `validators.js`, no test for the parser (which is dead anyway), and no test that would have caught the broken SVG export.

**Clinical rule files:** none. There is no `clinicalRules.js`, no inheritance-pattern module, no HPO/OMIM integration, no segregation-analysis code anywhere in the tree.

---

## C. Top 10 critical architectural problems

1. **No persistence layer.** No `localStorage`, no `IndexedDB`, no backend call, no file save/load (verified: zero hits for `localStorage`, `fetch`, `axios`, `indexedDB` in `src/`). A clinician who tabs away or the browser crashes loses the entire pedigree. For a clinical tool this is disqualifying on its own, ahead of every feature gap below.

2. **A second, orphaned data model lives in the repo and will confuse future work.** `turkishPedigreeParser.js` builds `individuals`/`unions`/`parentChildRelationships` with **UUID** IDs (via `uuid`), a different generation convention (proband anchored at 3 but grandparents never explicitly created — `dede` triggers a *warning*, not a node), and no consanguinity-path engine. `TextInputPanel.jsx` and `JsonPanel.jsx` are built to drive it. None of the three is imported by `App.jsx` or any live path. This is dead code wearing the clothes of a feature — the next person to touch "text input" will find a plausible-looking, tested-feeling module that is actually unreachable and semantically incompatible with the real builder's ID scheme.
   > **Status: quarantined in v0.2** — see `CHANGELOG_PEDIGREE_V0_2.md` §5 and `PEDIGREE_MODEL_BOUNDARY.md`. Moved to `src/experimental/` with explicit non-production headers; not deleted, not reconnected.

3. **The individual schema is a bag of ad-hoc optional booleans with no runtime enforcement.** `Individual` has `affected`, `carrier`, `deceased`, `proband`, `pregnancyLoss`, `stillbirth` as independent, uncoordinated booleans (plus `condition`, `notes`, `ageAtDeath`, `causeOfDeath` bolted on later in `usePedigreeStore.js`'s merge step, not in the builder's `addInd` defaults — verified `addInd()` in `pedigreeBuilderFromWizard.js` does not initialize `condition`/`ageAtDeath`/`causeOfDeath`). No TypeScript interface, no Zod schema, nothing stops an invalid combination (e.g. `pregnancyLoss: true, affected: true` — clinically meaningless, structurally permitted) from being constructed and rendered.

4. **Full-rebuild-on-every-keystroke architecture will not scale.** `generateDerivedData()` reconstructs the entire graph, reruns full BFS, full layout, and full validation on every single field change (`updateSiblingAge`, every `Stepper` click, every checkbox). For the ~40-node pedigrees the wizard currently targets this is invisible; for the 5-generation-plus, multi-branch pedigrees `CLAUDE.md` explicitly requires supporting, this becomes a real, felt latency problem with no incremental-update path designed in.

5. **The layout engine is order-dependent, cursor-based, and already produces the exact collision/overlap bugs a prior clinical reviewer cataloged.** `hatalar/claude_pedigree_hatalari.md` (already in this repo, dated screenshots) documents: spouse nodes not connected to any union, spouse pairs landing on identical coordinates, "de-overlap" passes that don't run. Reading `pedigreeLayout.js` confirms *why*: positioning is done via sequential cursor advancement per branch with repeated ad-hoc "shift everything right by `needed`" repair blocks (see lines ~235–257, ~453–479, ~484–513) rather than a real constraint solver. This is architecturally the same class of bug recurring, not one-off mistakes — a real fix requires replacing the positioning strategy, not patching more shift blocks.

6. **`CLAUDE.md`'s own non-negotiable clinical invariant #4 is currently violated by working code.** "Consanguinity must reflect true shared ancestry: shared ancestor nodes must exist in the graph. A double line rendered without shared ancestor nodes is a structural error." In `pedigreeBuilderFromWizard.js` (stage 2, line ~99), `U_PARENTS.consanguineous` is set to `true` whenever `state.parents.consanguineous === true`, **independent of** whether the consanguinity-path engine (stage 7) actually created shared-ancestor nodes. The path engine only handles `first_cousin`, `double_first_cousin`, `second_cousin` with an explicit non-`unknown` path. For every other selectable option in the wizard's own dropdown — `first_cousin_once_removed`, `second_cousin_once_removed`, `multiple_relationship`, `other`, or `first_cousin` left at path `unknown` — the union renders a double line with **zero** shared-ancestor nodes in the graph. This is not a hypothetical edge case; it is reachable through the UI's own dropdown in one click.
   > **Status: fixed in v0.2** — see `CHANGELOG_PEDIGREE_V0_2.md` §4. A new `consanguinityStatus` field (`known_supported` / `reported_unresolved` / `none`) now gates the double-line rendering; unresolved reports render a distinct dashed marker instead. One related, narrower gap was found and *deliberately left open* — see that changelog's "Known limitations."

7. **No exactly-one-proband enforcement anywhere in code.** `CLAUDE.md` states this as non-negotiable rule #6. Grepping `validators.js` and `graphIntegrity.js` confirms **no check counts probands**. Today it can't be violated through the UI (the builder hardcodes exactly one `proband: true`, and `IndividualEditor.jsx` exposes no proband toggle), but `updateIndividual(id, updates)` in the store accepts arbitrary field updates with no guard — the invariant survives by accident of what the UI happens to expose, not by validation.
   > **Status: fixed in v0.2** — see `CHANGELOG_PEDIGREE_V0_2.md` §3. Proband assignment is now centralized (`probandId` + a single builder stage), `graphIntegrity.js` flags zero (warning) or multiple (error) probands, and `IndividualEditor.jsx` exposes a proband toggle that can move the flag between individuals.

8. **Duplicated ancestor/collateral-branch construction, only half-collapsed.** `buildCollateralBranch()` successfully unified the 4 uncle/aunt loops (a real, good refactor, per `CLAUDE.md`'s explicit ask). But `buildGPCollateral()`, the consanguinity-path engine (stage 7), and the explicit-great-grandparent stage (9c) each re-implement "create a couple, add as PCR parent of an existing node" with near-identical bodies (`addInd` × 2 + `addUnion` + `addChild`) and no shared `createAncestorCouple()` primitive. `CLAUDE.md` explicitly says "Do not add more duplicated loops" — this pattern has spread to a third and fourth location since that instruction was written.

9. **No undo/redo, no multi-patient/session concept.** Every mutation is immediately committed to the single in-memory `wizardData`. There is no way to correct a mis-click except manually reversing it field-by-field, and no way to hold more than one patient's pedigree at a time (compounded by problem #1 — there's nowhere to put a second one anyway).

10. **SVG/PNG export is currently non-functional.** `exportSVG()` and `exportPNG()` (`src/utils/exportUtils.js`) both call `document.getElementById('pedigree-svg')`. The `<svg>` element rendered by `PedigreeCanvas.jsx` has no `id` attribute at all (verified: no `id=` in that file, no `pedigree-svg` string anywhere except in `exportUtils.js` itself). Both functions therefore hit `if (!svg) return;` and silently do nothing when the user clicks "SVG" or "PNG" in the toolbar. This is a live, present-day, one-line-diagnosable break, not a design gap — flagged here because it means the app's *only* export path is currently dead.
   > **Status: fixed in v0.2** — see `CHANGELOG_PEDIGREE_V0_2.md` §1. Export is now ref-based with an explicit thrown/rejected error on failure instead of a silent no-op.

---

## D. Top 10 clinical-pedigree correctness issues

Evaluated against standard pedigree nomenclature (Bennett et al. / PedigreeStandardization Task Force conventions, as `CLAUDE.md` invokes "ACMG/NSGC nomenclature standards"):

1. **Termination of pregnancy has no representation, distinct or otherwise.** `CLAUDE.md` itself lists `pregnancyLoss`, `stillbirth`, and termination as three distinct required clinical types. The model has exactly two booleans (`pregnancyLoss`, `stillbirth`); there is no third state anywhere in builder, renderer, or store. A clinician entering an elective termination has no correct way to record it — they must misuse "pregnancy loss," which is a different clinical fact (spontaneous vs. induced) with different genetic-counseling implications.

2. **No twin relationship of any kind.** No field, no builder path, no renderer support for monozygotic/dizygotic twin bracketing (the standard diagonal line connecting twin symbols to a shared point on the sibship line). Twin pregnancies are common in real pedigrees and their zygosity materially affects genetic risk interpretation (MZ twins are essentially one data point for recurrence risk purposes) — this is a real, not cosmetic, correctness gap.

3. **No adoption representation.** No field for adopted-in/adopted-out status, no dashed-line convention, nothing. Standard pedigree nomenclature has specific conventions here (brackets around the symbol) because adoption changes what "biological relative" means for risk calculation — currently indistinguishable from a biological child.

4. **Consanguinity double-lines can be rendered without backing shared-ancestor structure** (see C.6 above — repeated here because it is specifically a *clinical* correctness failure: a genetic counselor reading the printed pedigree sees a consanguinity loop with no way to verify or trace the actual shared ancestor, because none exists in the data).

5. **No exactly-one-proband enforcement** (see C.7 — also a clinical-safety issue: a pedigree with an ambiguous or duplicated index case can silently misdirect which individual segregation analysis is anchored to, once such analysis is built).

6. **Sibling ordering conflates birth order with clinical outcome category**, exactly as the prior review (`hatalar` item 7) already flagged and as `defaultChildOrder()` in `childOrdering.js` still implements: the default sort key is `stillbirth > pregnancyLoss > liveborn-by-age`, i.e. outcome category *is* the primary sort dimension, not true birth order. A family with a stillbirth between two liveborn children will not render in true chronological birth order by default — the current code makes outcome-category the dominant axis, then age only within the liveborn bucket. This is a modeling choice masquerading as a display default and will misrepresent birth sequence in mixed-outcome sibships unless a clinician manually overrides via `ChildOrderEditor` every time.

7. **"Custom consanguinity" (`customConsanguinity: [{ type: 'siblings', person1, person2 }]`) performs no biological plausibility check.** The UI (`CustomConsanguinityAdder` in `WizardPanel.jsx`) restricts the second-person dropdown to the same `generation` value as the first — but generation equality is not the same as "these two people could plausibly be full/half siblings." The prior clinical review (`hatalar` item 3) already caught this producing a nonsensical `mat_gm ↔ pat_gf` "sibling" declaration (maternal grandmother declared sibling of paternal grandfather) purely because they shared a generation number. Nothing in `pedigreeBuilderFromWizard.js` stage 10a validates sex-appropriateness, existing-union conflicts beyond the single check for "already in the same union," or clinical sanity of the declared relationship.

8. **Half-sibling counts are entered per-parent, in two independent form panels, with no shared union view.** `motherOtherUnions`/`fatherOtherUnions` are separate arrays in `wizardData.parents`, edited by two structurally-duplicated `renderOtherUnions('mother'/'father')` blocks — exactly the failure mode the prior clinical review (`hatalar` item 5) flagged ("children defined independently under mother and father panels risks duplicate/desynced sibling sets"). The current code doesn't literally duplicate a sibling set (each half-sibling union is genuinely separate), but the *architectural* smell the reviewer flagged — no single union-centric editing surface — is still present and is exactly what will cause a real desync the moment cross-referencing (e.g., "this half-sibling is also related on the other side") is needed.

9. **`affected`/`carrier` are booleans with no zygosity, no certainty, and no distinction between "confirmed by testing" and "reported by family history."** Standard genetic pedigrees must distinguish a lab-confirmed affected status from a self-reported one — this is a patient-safety-relevant omission once the tool is used to reason about inheritance (see section H).

10. **`relation` field values are an uncontrolled, hardcoded string enum sprinkled across the builder** (`'mother'`, `'father'`, `'dayi'`, `'teyze'`, `'amca'`, `'hala'`, `'buyuk_dayi'`, `'kuzen'`, `'spouse_gen4'`, `'child_direct'`, ~25 distinct literal strings found across `pedigreeBuilderFromWizard.js`). There is no canonical relationship-type vocabulary and no mapping from these Turkish kinship terms to a standard/codeable relationship taxonomy (e.g., SNOMED "Family member" hierarchy, or even a clean internal enum) — this blocks any future FHIR `FamilyMemberHistory` export (see I) and blocks inheritance reasoning that needs to know "is this a first-degree, second-degree, or third-degree relative of the proband" as a computed, not string-matched, fact.

---

## E. Data model weaknesses

The graph is a genuine graph (individuals + unions + parent-child relationships as first-class arrays, not just visual nodes with x/y) — this is the strongest part of the codebase and should be preserved. `x`/`y` are appended only in the final `computePedigreeLayout()` step and are never treated as source of truth upstream; `graphIntegrity.js` runs on the pre-layout graph. Good separation.

But scored against the requested checklist:

| Concept | Present? | Notes |
|---|---|---|
| `Individual` | Partial | Present but untyped; missing genotype/phenotype/certainty/source fields (see F) |
| `Couple`/`Partnership` | Yes (`Union`) | Solid — exactly 2 partners enforced by `addUnion` signature and audited by CHECK 4 |
| `ParentChildRelationship` | Yes | Union-keyed, not per-child — correct modeling choice |
| `SiblingGroup` | Implicit only | Siblings are "children of the same PCR," never a first-class group — no place to hang sibship-level metadata (e.g., "these three share the same biological father, different mothers, confirmed by testing") |
| `PregnancyLoss` | Partial | Boolean flag on `Individual`, not a distinct entity — no gestational age, no karyotype, no recurrence-relevant detail |
| `TwinRelationship` | **Absent** | No field, no entity |
| `Consanguinity` | Partial | Boolean + degree string + path string on `Union` — no explicit link to the shared-ancestor node(s) it's claiming (see D.4/C.6) |
| `Proband` | Yes | Boolean on `Individual`, unenforced uniqueness (see C.7) |
| `PhenotypeAnnotation` | **Absent** | `condition` is one free-text string; no structured phenotype, no HPO |
| `GenotypeAnnotation` | **Absent** | Nothing — no gene, variant, zygosity, test result anywhere |
| `ClinicalNote` | Minimal | `notes` free-text string, no author/date/confidence/source |
| `ExportMetadata` | **Absent** | No pedigree-level metadata object at all — no creation date, no clinician, no patient/MRN reference, no schema version |

The model is closer to "true graph" than "visual nodes with positions" — that part is not the problem. The problem is the `Individual` node itself is clinically shallow, and there is no schema layer enforcing what it's allowed to contain. A full replacement schema is proposed in `PEDIGREE_DATA_MODEL_PROPOSAL.md`.

---

## F. Layout/rendering weaknesses

- **3-generation layouts are currently readable**; the existing test suite and `verify-generations.mjs` demonstrate correct generation assignment for the wizard's default shapes.
- **5-generation and deep-ancestor layouts are architecturally fragile.** The "ancestor couples" pass (`pedigreeLayout.js` lines ~373–451) is a `while (changed)` fixed-point loop over *all* unions with unpositioned partners and at least one positioned child — this is the closest thing to a real algorithm in the file, but it still only centers a couple over its children with a fixed `SPOUSE_X_GAP`, with one collision-avoidance check against same-Y nodes. It has no knowledge of total subtree width, so two ancestor branches converging on the same generation can still be pushed into visually confusing near-overlaps for wide sibships — the ad-hoc `needed` shift blocks earlier in the file exist precisely because this happens.
- **Large sibships break the "center over children" assumption.** `layoutUnionCluster()` and the nuclear-children centering step compute child width as `(children.length - 1) * NODE_X_SPACING` with no wrapping, no max-width, and no interaction with sibling clusters from adjacent branches — a sibship of 8+ (not unusual in real multi-generation pedigrees, especially with high-parity historical generations) will simply push horizontally into whatever is next to it; the "shift right" repair passes exist because this collision is a known, recurring failure mode, not a hypothetical one.
- **Consanguinity lines are drawn correctly at the rendering layer** (`consanguineousUnion` edge type = two parallel lines, correctly implemented in `PedigreeCanvas.jsx`) — the rendering primitive is fine. The problem is upstream: the double line is drawn whenever `union.consanguineous === true`, regardless of whether shared-ancestor nodes exist to justify it (C.6/D.4).
- **Multiple marriages (mother/father "other unions") are handled** as a distinct layout branch (`motherOtherUnions`/`fatherOtherUnions` placed to the left/right of the main couple) — functionally present, but doubles the already-duplicated per-parent logic (E.8/D.8).
- **Cousin marriages / consanguinity loops are only possible through the templated `first_cousin`/`double_first_cousin`/`second_cousin` paths or the unvalidated custom-consanguinity mechanism** — there is no general "these two arbitrary graph nodes actually share an ancestor N generations back, compute and draw the loop" capability. Anything outside the three hardcoded templates falls back to "flag the union as consanguineous, draw nothing structurally."
- **Visual rendering is well-separated from clinical data** — `PedigreeCanvas.jsx` is a pure function of `{nodes, edges}` with no independent state, which is good architecture and easy to swap later.
- **SVG/PNG export stability**: currently non-functional (C.10). Even when fixed, the export is a raw DOM serialization of whatever is currently zoomed/panned into view (`svg.getBoundingClientRect()` in `exportPNG()`), not a canonical "whole pedigree, fit to page" render — a clinician who has zoomed into one branch and clicks export will export that zoomed view, not the full pedigree. This needs a dedicated "reset viewBox to full bounds before serializing" step, which does not currently exist.

---

## G. UI/UX weaknesses (outpatient clinical genetics use)

- **Clicks-to-build assessment:** building a basic 3-generation pedigree (proband + siblings + parents + both grandparent pairs) requires opening and configuring at minimum 4 accordion sections, each with multiple stepper clicks and text inputs — workable for a template case, but every additional relative (uncle, aunt, half-sibling) requires opening a nested per-relative sub-block and setting 3–5 child-count steppers each. There is no "quick add" or keyboard-driven flow; everything is mouse-driven accordion/stepper interaction. In a time-boxed outpatient visit (10–15 minutes), this is workable for simple pedigrees, slow for anything with several collateral branches.
- **Marking affected/deceased/carrier/proband is fast once a node is selected** (three checkboxes in `IndividualEditor.jsx`) — this part of the UX is fine. But **there is no bulk/keyboard-driven way to do this** (no "click node, press A for affected" shortcut) — every marking is a canvas click + panel checkbox click round-trip.
- **No question-based/conversational pedigree builder.** The wizard is a fixed accordion form, not an adaptive interview flow ("Does the patient have siblings? Are the parents related?"). Given the Turkish free-text parser (`turkishPedigreeParser.js`) was clearly an attempt at exactly this and is now dead code, this direction was explored and abandoned rather than never attempted — worth knowing before re-investing here.
- **No keyboard shortcuts anywhere** — not for node selection, not for common markings, not for undo (there is no undo).
- **No templates** ("typical AR pedigree," "typical AD 3-gen pedigree") to start from — every pedigree is built from an empty wizard state each time.
- **Correcting mistakes is manual and non-obvious**: there's no undo; reducing a stepper count deletes the *last-indexed* wizard-level slot, which (per the ordering/reconciliation code) is handled correctly at the data layer, but a clinician has no visual "are you sure" or preview before a count-decrease silently drops a specific child.
- **The "direct graph edit" affordance (add spouse/add child from the right panel) is a genuinely good, fast UX idea** — it's the one part of this UI that resembles direct manipulation instead of form-filling. It's currently only reachable per-selected-node, with no equivalent quick-add for parents/grandparents of an arbitrary node (i.e., you can add a spouse or child to any node, but not a parent) — an asymmetry worth fixing, since "add missing parent" is a very common real correction.

---

## H. Safety and ambiguity risks

- **No confirmed-vs-reported distinction anywhere.** Every `affected`/`carrier`/`deceased`/`condition` entry is presented identically regardless of whether it came from direct clinical observation, lab confirmation, or the patient's secondhand recollection of a relative's history. In real genetic counseling this distinction is safety-critical — a "reported" affected status in a third-degree relative carries entirely different evidentiary weight than a lab-confirmed one, and conflating them risks over-confident risk communication once any inheritance reasoning is layered on top.
- **No uncertainty state for sex, relationship, or vital status.** `sex: 'unknown'` exists (rendered as a diamond, correct convention), but there is no equivalent "relationship uncertain" or "status unconfirmed" marker for anything else — an unknown-degree consanguinity (the wizard's own `unknown` path option) silently degrades to "draw nothing," with only a small red UI hint (`* Yol bilinmediginden ust soy baglantisi cizilmeyecek.`) and no persistent visual marker on the exported pedigree itself. A printed/exported pedigree gives no indication that a consanguinity loop was declared-but-unresolved.
- **The double-line-without-shared-ancestor bug (C.6/D.4) is itself a safety risk**, not just a structural nicety: a genetic counselor reading a printed pedigree with a consanguinity loop reasonably infers a specific, traceable shared-ancestor relationship. If the underlying graph has no such node, the visual claim is unfalsifiable from the data and could mislead risk counseling for autosomal recessive conditions specifically (consanguinity degree directly affects recurrence-risk calculations).
- **Validation is advisory-only, in all three layers, with no severity distinguishing clinically dangerous from cosmetic.** `warnings` in `App.jsx` is one undifferentiated `<ul>` — a duplicate-ID structural corruption and a "spouse union has no children" cosmetic note render identically. `hatalar` item 10 already flagged exactly this and proposed a warning/error/fatal severity split with export blocking on fatal — that proposal has not been implemented.
- **Export remains available regardless of integrity/validation state** (and is currently non-functional anyway, C.10) — there is no gate preventing a clinician from exporting/printing a pedigree that `auditPedigreeGraph` has flagged with structural errors.

**Proposed minimum safety labels/confirmation logic** (detailed further in the data-model proposal): every clinically asserted fact (`affected`, `deceased`, `carrier`, `condition`, consanguinity) should carry a `certainty: 'confirmed' | 'reported' | 'suspected'` and `source: 'clinical_exam' | 'lab_report' | 'family_history' | 'unknown'` field, rendered visibly (e.g., a dotted vs. solid outline convention, already standard in pedigree nomenclature for "by history" individuals) rather than stored invisibly in a free-text note.

---

## I. Export/interoperability gaps

| Format | Status | Notes |
|---|---|---|
| SVG | **Broken today** | Dead `id` reference, see C.10. Trivial one-line fix once identified, but currently non-functional. |
| PNG | **Broken today** | Same root cause as SVG; also exports whatever is currently zoomed/panned, not the full pedigree (F). |
| PDF | Absent | No PDF generation path exists. Feasible short-term via print-to-PDF of the fixed SVG export, or a proper server/headless-render pipeline for a real clinical report layout (patient header, legend, notes) — currently nothing resembling a "report" exists, only the raw canvas. |
| JSON (persistence) | Absent | No save/load of the `pedigreeData`/`wizardData` shape at all — see C.1. This is the single highest-leverage fix: the shape already exists in memory, it just needs to be written to/read from somewhere. |
| CSV (research table) | Absent | Would require flattening `individuals` to rows — straightforward once the schema is stabilized (see data model proposal), not currently attempted anywhere. |
| PED format | Absent | PED (`family, individual, father, mother, sex, phenotype`) is directly derivable from the current `Individual`/`Union`/`PCR` graph *for liveborn individuals with two identified parents* — this is actually one of the more feasible near-term additions given the graph is already correctly typed for it. Pregnancy losses, stillbirths, and individuals with only one identified parent need an explicit mapping decision (PED has no native "loss" encoding). |
| FHIR `FamilyMemberHistory` | Absent, and currently blocked | FHIR's `FamilyMemberHistory.relationship` expects a coded (SNOMED/v3-RoleCode) relationship, and `condition`/`note` map reasonably to `FamilyMemberHistory.condition`/`note`. But the current `relation` field is an uncontrolled string enum (D.10) with no mapping table to a coding system — this needs the relationship vocabulary cleaned up before FHIR export is realistic, not just a serializer written. |

---

## J. Requirements for inheritance reasoning

None of the following exist today; all are prerequisites before any inheritance-pattern suggestion feature should be attempted:

- **A computed, not string-matched, relationship-degree function** (`degreeOfRelationship(idA, idB) → { degree: 1|2|3|..., pathType: 'lineal'|'collateral', sharedAncestors: [...] }`), built on top of the existing graph traversal (which already has the adjacency maps needed — `graphTraversal.js`'s `childToUnion`/`unionToPartners`/`unionToChildren` are 80% of what's needed, just currently single-purposed for BFS generation assignment).
- **Structured genotype/phenotype data per individual** (see K and the data-model proposal) — you cannot reason about autosomal recessive vs. dominant patterns from a single boolean `affected` flag; you need affected-status *per generation*, cross-referenced with the pedigree topology.
- **Sex-linked reasoning requires reliable sex data on every individual in the transmission path** — currently `sex: 'unknown'` is common (any spouse stub not explicitly set) and there's no flag distinguishing "genuinely unknown" from "not yet entered," which matters for X-linked pattern suggestions (an unknown-sex obligate carrier path looks different from a confirmed-female one).
- **Explicit consanguinity-path data connected to real shared-ancestor nodes** (fix C.6 first) — recessive-pattern suspicion driven by consanguinity is currently unreliable because the flag can exist without backing structure.
- **De novo suspicion requires parental testing status**, which doesn't exist as a concept (no genotype/test-result field on `Individual` at all).
- **Gonadal mosaicism suspicion requires recurrence-in-sibship-despite-untested-parents reasoning** — needs the sibling-group-as-entity concept (currently absent, E) plus genotype fields.
- **"Testable relatives recommendation" requires knowing who in the graph is a first/second-degree relative of an affected individual and whether they've been tested** — needs both the relationship-degree function above and a genotype/test-status field.

**Bottom line for this section:** the graph topology work already done (BFS generation derivation, union/PCR structure) is a legitimate foundation for inheritance reasoning — better than starting from scratch — but zero of the genotype/phenotype/certainty data the reasoning needs to operate on exists yet. This is a data-model problem first, an algorithm problem second.

---

## K. Requirements for segregation analysis

To support even the example given ("affected proband homozygous, parents heterozygous, unaffected sibling wild-type, affected cousin untested"), the model needs, per individual, at minimum:

- `genotype: { gene, variant(s), zygosity: 'homozygous'|'heterozygous'|'hemizygous'|'wild_type'|'not_tested', testDate, methodology }` — **completely absent today.**
- A way to mark **"untested"** as distinct from **"wild-type"** — currently there is no genotype field at all, so this distinction doesn't exist even conceptually in the code.
- A **variant identity** shared across individuals (so the tool can recognize "these three people were tested for the *same* variant") — needs a `Variant` entity distinct from per-person genotype records, referenced by ID, not re-typed as a string per person.
- The relationship-degree function from J, to actually check "is this genotype pattern consistent with the pedigree topology" (e.g., flag a segregation *inconsistency* — an affected obligate-carrier position that's marked wild-type).

**Can the current model support this reasoning? No — not partially, not with a workaround.** There is no genotype concept anywhere in `Individual`, `Union`, or `ParentChildRelationship`, and no `Variant`/`GenotypeAnnotation` entity. This is the single largest structural gap relative to the stated long-term goal of a "Pediatric Genetics Operating System," and it should be the first schema addition, done properly (see `PEDIGREE_DATA_MODEL_PROPOSAL.md`), before any reasoning code is written.

---

## L. Required immediate fixes

Ordered by (safety impact × fix cost), cheapest/highest-impact first:

1. **Fix SVG/PNG export** — add `id="pedigree-svg"` to the `<svg>` in `PedigreeCanvas.jsx`. One line. Currently the app's only export path is dead.
2. **Add basic persistence** — at minimum, `localStorage` autosave/restore of `wizardData` (the `pedigreeData` graph is fully derived from it, so only `wizardData` needs to survive). This is the highest-impact single change available and does not require any schema redesign.
3. **Stop rendering a double consanguinity line when no shared-ancestor path exists** — either block the "Bilinmiyor"/non-templated degree selections from setting `union.consanguineous = true`, or render a distinct "consanguinity declared, ancestry not modeled" visual state instead of the standard double line. This is a direct fix to a stated non-negotiable invariant currently being violated.
4. **Delete or explicitly quarantine the dead parser/text-input/JSON-panel trio**, or finish wiring it in — but not leave it half-present. As-is it's a landmine for future work (human or AI-assisted) that greps for "how does text input work" and finds a plausible, unreachable answer.
5. **Add the exactly-one-proband guard** to `graphIntegrity.js` (trivial — same pattern as the existing duplicate-ID check) and to the `updateIndividual` store action, so the invariant is enforced rather than incidental.
6. **Split `warnings` into severity tiers** (warning/error/fatal) and gate export on fatal errors, per the prior clinical review's own recommendation (`hatalar` item 10) — the analysis was already done by a previous reviewer; only the implementation is missing.
7. **Wire `layoutIntegrity.js` into the live app**, not just the test suite — it already exists and already catches real geometry bugs; it is simply never called from `usePedigreeStore.js`.

---

## M. Suggested refactor/rebuild plan

Not a rebuild-from-zero. Keep: the graph model shape (`individuals`/`unions`/`parentChildRelationships` as parallel arrays), `computeGenerations` BFS, `auditPedigreeGraph`, the ordering/reconciliation engine (`childOrdering.js`), and the D3 rendering approach. Replace or substantially extend: the `Individual` schema, persistence, export, and validation-severity model.

See `PEDIGREE_4_WEEK_ROADMAP.md` for the week-by-week sequencing; the shape of the plan is:

1. **Stabilize what exists** (fixes in L) before adding anything new — an audit tool should not recommend building new features on top of a broken export button and an unenforced core invariant.
2. **Redesign the `Individual`/annotation schema** (data-model proposal) as an additive, backward-compatible extension of the current shape — every existing field stays, clinical annotation fields are added alongside, not instead.
3. **Add persistence and a real export pipeline** (JSON save/load first, since it's nearly free given the existing shape; PED second, since the graph already has what PED needs for the common case; PDF/report layout third).
4. **Only then** begin inheritance-reasoning/segregation-analysis work, and only on top of the new schema — not the current boolean-flag `Individual`.

---

## N. Final recommendation

Extend and refactor around the existing graph core; do not discard it, and do not bolt clinical reasoning onto the current `Individual` shape without redesigning it first. The engineering discipline already present (deterministic IDs, detect-only audit layers, BFS-derived generations, an ordering-reconciliation system with real test coverage) is worth more than it looks like from the UI, and re-deriving it from scratch would cost real time for no benefit. But calling this "clinical-grade" today would be inaccurate and, given the safety risks in section H, irresponsible. The path to clinical-grade runs through: fix the broken/violated things that already exist (L), then build the data model this tool has never had (K, and `PEDIGREE_DATA_MODEL_PROPOSAL.md`), then — and only then — build the reasoning features the long-term vision calls for.
