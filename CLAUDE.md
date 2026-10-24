# CLAUDE.md — Clinical Pedigree Application

## Project Purpose

Turkish-language, clinical-grade pedigree drawing tool for genetic counseling. Produces structurally valid pedigree graphs per ACMG/NSGC nomenclature standards. Not a family tree app — clinical correctness of the graph model takes priority over visual polish. A clinician must never misread who is whose child, sibling, partner, or consanguineous relative.

Living documentation (source of truth for status, decisions, risks): `docs/PEDITREE_*.md` — audit report, clinical requirements, layout architecture, stress test matrix, UX review, data model. Root-level `PEDIGREE_*.md` files are historical.

---

## Stack

React 19 + Vite · D3.js (SVG) · Zustand · Vitest (node env) · UUID

---

## Core Domain Model

Three collections form the graph:

```js
Individual   { id, sex, age, generation, relation, label, displayLabel,
               affected, carrier, deceased, proband, placeholder?,
               pregnancyLoss, stillbirth, notes, condition?, conditions?,
               ageAtDeath?, causeOfDeath? }

Union        { id, partners: [id, id], status, consanguineous, consanguinityDegree,
               consanguinityStatus, relationshipBackground }

ParentChildRelationship  { unionId, children: string[],      // BIOLOGICAL, ≤ 1 per child
                           birthOrderExplicit?, orderPolicy: 'byAge' | 'insertion' }

SocialParentLink         { childId, unionId, kind: 'adoptive' | 'foster' | 'step' | 'guardian' }

ParentChildRelationship.multiples?  [{ id, children (≥ 2, side by side), zygosity: 'monozygotic' | 'dizygotic' | 'unknown' }]
                         // twins / triplets — src/graph/multiples.js; drawn from one point of the sibship line
```

The persisted unit is the schema v2 document (`src/graph/document.js`): `{ schemaVersion: 2, graph: { individuals, unions, parentChildRelationships, socialParentLinks }, ids: { counters, retired }, wizardAnchorId, wizardMeta?, provenance }`. Clinical data lives on the person (no overlay). `placeholder: true` marks an "unspecified parent" created when a parent is deleted.

Birth order: `birthOrderExplicit: true` (user set "Doğum Sırası") is a hard rule for the layout; otherwise `orderPolicy: 'byAge'` sorts by known ages (oldest left) and `'insertion'` keeps stored order. Without explicit order, PCL may move a sibling who married into another drawn family to the end of the sibship, but never contradicts known ages — except (clinician decision 2026-10-23) a sibling in a consanguineous union, who may be drawn at the sibship end beside the partner even against known ages. An explicit order is never changed.

Consanguinity is derived from the drawing (`src/graph/kinship.js`, run in `finalize.js`): partners who share a drawn ancestor are consanguineous with the degree the structure shows, whichever panel drew the structure; a union declared consanguineous without shared ancestors stays `reported_unresolved`. The wizard view (`deriveWizardView`, derived from the graph relative to `wizardAnchorId`, which follows the proband via `ops.setProband`) backs the parents' consanguinity template in the couple card; the former left panel was removed 2026-10-24 — input is the ring menu on the drawing (`RadialAddMenu.jsx`) and the right panel. Every view must show the same graph — guards in `src/__tests__/panelSync.test.js`.

**ID scheme is deterministic and symbolic** — `mother`, `mat_gf`, `mat_uncle_0`, `sib_f_2`, `U_MAT_GP`. Do not switch to UUID for wizard-built nodes. The parser uses UUID; that is intentional and isolated. IDs are permanent (Faz 2b): once assigned, an ID never moves to another person and is never reused (`ids.retired`, `src/graph/ids.js`); a re-added person gets a new ID.

---

## Non-Negotiable Clinical and Graph Constraints

1. Every individual has a globally unique ID — enforced by `validateGraphStructure`/`auditPedigreeGraph` on every graph operation (and `idSet` in the v1 builder used for migration). Never bypass it.
2. Each individual belongs to at most one **biological** parent union. `childToUnionMap` enforces this — never attach a child to two biological parent unions. Social parenthood (adoption, foster …) is a separate `socialParentLinks` entry; it never replaces or duplicates the biological link. A child with only a social link is drawn under the social parents with a dashed line of descent (`displayParentage`).
3. A union connects exactly two partners. Never siblings. Never self.
4. Consanguinity must reflect true shared ancestry: shared ancestor nodes must exist in the graph. A double line rendered without shared ancestor nodes is a structural error.
5. `pregnancyLoss` (spontaneous miscarriage), `stillbirth`, and termination of pregnancy are distinct clinical types with distinct symbols. Do not conflate them.
6. `proband: true` must be set on exactly one individual. Zero or multiple probands is a validation error. (Product decision pending: NSGC allows no proband / a consultand — see audit report §4.)
7. Integrity audit (`auditPedigreeGraph`) and semantic validation (`validatePedigree`) must pass after every graph mutation. Do not suppress their output.
8. Partners must be of opposite sex (current product rule, `UNION_PARTNER_SEX_CONFLICT`). Same-sex partnership and unknown-sex partners are pending clinician decisions — do not change the rule without the user. Cross-generation partners are allowed one generation apart, never ancestor–descendant (clinician 2026-10-24): `union.crossGeneration`, each partner on their own row, stepped relationship line through an invisible stand-in beside the lower partner (`src/layout/pcl/crossGeneration.js`); children one generation below the lower partner (`computeGenerations`).
9. Never let a colour, highlight or styling hide or compensate for a layout error. Standard notation (solid/dashed/double lines, "//") keeps its meaning in every view.
10. Clinical notation is governed by `docs/PEDITREE_CLINICAL_NOTATION_SPEC_V1.md`: the layout engine may only place and route, never change what a symbol or line means. Rules R1–R6 there are clinician-approved; every other symbol rule (marked "doğrulama bekliyor" / "karar gerekli") needs the clinician's approval before it is implemented.

---

## Generation

`generation` is topology-derived by `computeGenerations(graph, anchor, 3)` (`src/utils/graphTraversal.js`): in v2 it runs after EVERY graph operation (`src/graph/finalize.js`, over the drawn parentage incl. social-only children), anchored at `doc.wizardAnchorId`; the v1 builder (migration only) runs it at the end of `buildPedigreeFromWizard()`. A stored generation is kept only for people unreachable from the anchor. `GENERATION_INCONSISTENT`, `SIBLING_GENERATION_INCONSISTENT` and `PARTNER_GENERATION_INCONSISTENT` are enforced (the last skips `crossGeneration` unions). Run `node verify-generations.mjs` after any builder change — the generation snapshot must stay identical.

---

## Layout Engine (Faz 3 — done)

**Default engine: PCL (Pedigree-Constrained Layered layout), `src/layout/pcl/`.** Entry: `computePedigreeLayoutV2(data)` → `computePclLayout`. Contract to the renderer: `{ nodes, edges }`; every structural edge carries its owner `unionId`.

- `structure.js` — atoms (sibships in birth order + married-in spouses, their own married-in partners on their outer side; founder groups built outward from the centre); unknown birth order allows a sibling who (or whose descendant) married into another drawn family to sit at the sibship end facing it; a person with a partner in another drawn family gets mirrored spouse blocks as alternatives (KI-8; man-left is the default/tie-breaker); known ages / explicit order are never contradicted.
- `ordering.js` — family-tree DFS + data + mirror starts, barycentre sweeps, transposes, sifting; costs: descent crossings, lanes, people under lanes, union length, man-left tie-breaker (orientation stability).
- `qp.js` — separated QP (FISTA + exact per-row PAVA projection): symbols can never overlap.
- `index.js` — objective (couple over children, spouse gap, compactness, optional stability), footprint rule (nobody but the parents above a sibship line), adaptive row gaps.
- `routing.js` — NSGC connectors, relationship lanes, line jumps for unavoidable crossings.

Fallback engines are kept (do not delete until PCL has been validated for at least one release): `PEDITREE_PACKER=recursive` (`recursiveIntervalPacker.js`) and `PEDITREE_PACKER=legacy` (`pedigreeLayout.js` / legacy `layoutPacking`). `globalThis.__PEDITREE_PACKER__` overrides in the browser.

Layout gates (must hold after any layout or builder change):
- `npm run audit:layout-benchmark` — PCL fully clean on 13/13 clinical fixtures; realistic large pedigrees 0 invariant / 0 readability violations.
- `npm run audit:layout-fuzz -- --seed 1` and `--seed 12345` — 0 % invariant and 0 % readability failures for the default engine.
- `src/__tests__/pclLayout.test.js` — fixtures, determinism, birth order, time budgets (100 people < 500 ms, 300 < 2 s), orientation stability.

Known PCL limitations (tracked in `docs/PEDITREE_KNOWN_ISSUES.md` with guard tests; never silently accept regressions): KI-1 couple centring on 200–300-person pedigrees; KI-2 partly fixed (edit-local relayout; a widening sibship still pushes neighbouring families, dense large pedigrees often fall back to a fresh layout — `docs/PEDITREE_KI2_STABILITY_REPORT.md`); KI-4 fixed (pedigree number at the symbol's upper corner, off the line of descent); KI-8 fixed (married-in partners may stand on either side; nested partners and founder chains beside their partner — `docs/PEDITREE_KI8_REPORT.md`; residual: 3+ partners, a man married to two sisters); KI-10 layout of the 387/474-person stress graphs takes 1.7–2.8 s. KI-3 (footprint violations on the stress graphs) is fixed and guarded by frozen JSON fixtures (`src/__tests__/regression/ki3/`, `ki3Regression.test.js`; regenerate only with `npm run audit:freeze-ki3`).

---

## Current Architectural Priority

**Done (Aşama 1, awaiting user review): KI-2 edit-local layout stability.** The store passes the previous drawing to `src/layout/pcl/incremental.js` (`computeStableLayout`: levels local → wide → full; a level is accepted only with 0 invariant / readability violations and no more crossings, off-centre couples or long partner lines than the previous drawing). PCL `opts.stability`: stable ordering from previous positions, pins + IRLS, anchoring (the previous drawing is at rest; only terms the edit changed move people), couple terms scaled in local mode. Undo/redo restore the drawn view; project files and autosave carry `layoutHints`; toolbar "Yeniden Düzenle" = fresh layout, undoable. Measure with `npm run audit:layout-stability -- --label <name>`; guards in `src/__tests__/ki2Stability.test.js`. **Done (awaiting review): KI-8** — spouse-side alternatives as atom arrangements (`structure.js` `sideVariants`, `arrangementCore`), chosen by the ordering cost; KI-2 stable mode may switch an untouched atom's spouse side only; metric `readabilityMetrics.lineOverOwnPartner`; guards `ki8PartnerSide.test.js`. Four ratchet ceilings were raised as recorded trade-offs (see the report). **Next (after review): KI-1** — needs a coordinate-aware ordering cost or subtree block moves first (report §7), not just weights. Faz 4–5 visualization requirements (common-ancestor paths, selectable lineages, colour view, adoption notation) are documented in `docs/PEDITREE_UX_REVIEW.md` and stay out of these slices.

**Done: Faz 2b — graph-first data model, permanent IDs, schema v2** (`docs/PEDITREE_DATA_MODEL_V2.md`). Steps 2b-1 … 2b-5 are done: the store holds only the v2 document; every mutation goes through `src/graph/ops.js` (editor) or `src/graph/wizardAdapter.js` (wizard), both built on the atomic `commit` (clone → mutate → finalize → validate; a new error refuses the whole operation). The v1 replay pipeline survives only in `src/graph/v1pipeline.js` for migration (and `src/__tests__/support/v1Store.js` for tests). Social parent links are in model, validation and layout (adopted-in child under social parents, dashed descent; editor UI and brackets in Faz 4).

- The pedigree graph is the single source of truth for relationships. The wizard and the person editor are input adapters that apply graph operations to the same graph.
- IDs never change when a person's position or role changes; never reused.
- One person may take part in several partnerships and parenthoods; biological and social parenthood are distinct link types.
- Saved v1 sessions (`wizardData` + `graphEdits` + `deletedIndividualIds` + `manualEdits` + `childOrders` …) migrate automatically to v2 with no loss: the migrated graph must equal the graph the user saw in v1.
- Save → load → edit → save preserves every semantic relationship; undo/redo is consistent.

After Faz 2b: layout stability (edit-local relayout using the previous layout), notation (Faz 4), UI/UX + smart relationship highlighting (Faz 5), release validation with E2E (Faz 6).

---

## Refactor Rules

- **Graph model is source of truth.** Do not add new state that duplicates relationships outside the graph.
- **Do not duplicate maternal/paternal logic.** The four relative-builder loops are collapsed into `buildCollateralBranch()`; keep it parameterised.
- **Do not hardcode new generation numbers** as a source of truth (see Generation).
- **Do not delete fallback layout engines** yet; do not weaken PCL gates, fuzz thresholds or exclude failing cases to make numbers look better.
- **One concern per slice.** Graph correctness work and layout work do not mix in the same change. Builder changes and UI changes do not mix. Commit per verified slice.
- **New clinical node types go in the model first**, then layout, then renderer — in that order. Never add a visual symbol without a corresponding model field.

---

## What Must Not Be Broken

| Invariant | Where enforced |
|---|---|
| No duplicate individual IDs | `idSet` in builder + CHECK 1 in `graphIntegrity.js` |
| No child in multiple biological parent unions | `childToUnionMap` in builder + CHECK 7 in `graphIntegrity.js` |
| No missing union partners | CHECK 3 in `graphIntegrity.js` |
| Opposite-sex partners | `UNION_PARTNER_SEX_CONFLICT` in `graphIntegrity.js` |
| Consanguinity shared ancestors exist in graph | Consanguinity path engine in builder, stage 7 |
| `auditPedigreeGraph` returns zero errors | Run after every change |
| Layout gates (see Layout Engine) | benchmark, fuzz, `pclLayout.test.js` |
| No silent data loss / misattribution on edits | `dataIntegrityRegressions.test.js` |
| Clinical data (displayLabel, affected, carrier, notes, age, sex, conditions) lives on the person and survives every edit, reload and save/open | v2 graph document; `migrationV2.test.js`, `dataIntegrityRegressions.test.js` |
| Saved v1 sessions migrate without loss; v1 data kept as backup | `migrateV1ToV2`, `persistenceV2.loadDocument`; `migrationV2.test.js` |
| Lowering a wizard count never removes a person with clinical data or extra relations | `wizardAdapter.js` (`untouched`); DM-5/DM-6 tests |
| Generation snapshot unchanged by builder changes | `node verify-generations.mjs` |
| SVG and PNG export render all nodes and edges, without selection styling | `exportUtils.test.js`, `EXPORT_VIEWBOX_CLIPS_CONTENT` |

---

## Preferred Workflow

1. **Read before writing.** Read the relevant module (store, builder, `src/layout/pcl/*`, validators) before proposing a change.
2. **Measure first.** Reproduce with a test or the audit tools before fixing; show real results, never claim untested success.
3. **After every graph change:** `npx vitest run`, `node verify-generations.mjs`, and for layout-affecting changes the benchmark + both fuzz seeds. Revert fuzz side effects in `src/__tests__/fixtures` after runs.
4. **Snapshot generation values** before builder changes and assert they are unchanged afterwards.
5. **Git:** work on `stabilization/clinical-layout`; never commit directly to `main`; the user pushes (GitHub Desktop) — do not push, fetch or rewrite history without explicit approval.
6. **Visual check:** for renderer/layout changes, verify in the browser preview (`peditree-dev`) and compare engines with `globalThis.__PEDITREE_PACKER__`.
