# CLAUDE.md — Clinical Pedigree Application

## Project Purpose

Turkish- and English-language, clinical-grade pedigree drawing tool for genetic counseling. Produces structurally valid pedigree graphs per ACMG/NSGC nomenclature standards. Not a family tree app — clinical correctness of the graph model takes priority over visual polish. A clinician must never misread who is whose child, sibling, partner, or consanguineous relative.

Living documentation (source of truth for status, decisions, risks): `docs/PEDITREE_*.md` — audit report, clinical requirements, layout architecture, stress test matrix, UX review, data model. The early `PEDIGREE_*.md` notes in `docs/archive/` are historical.

---

## Stack

React 19 + Vite · D3.js (SVG) · Zustand · Vitest (node env) · UUID

## Languages (Turkish / English)

`src/i18n/` (clinician decisions 2026-11-02): the Turkish text stays in the code and is the key; `t('…', { name })` gives it in the screens' language from `en.js` (NSGC 2022 English terms), `td = tFor(lang)` in the drawing's language, `tk('…')` marks a text kept in a list and translated where it is shown. The first opening follows the browser (Turkish browser → Turkish, any other → English); Settings chooses the screens' language and, apart, the drawing's (also exports, print, file names) — a device preference in localStorage, never in the pedigree file. **Stored data never depends on the language**: labels the program writes stay Turkish (`model.DEFAULT_LABELS`, shown through `shownLabel`), ages are stored "3 ay" / "12 gün" (shown "3 mo" / "12 d" by `age.shownAge`, English input read too); what the clinician types is never translated. A new text: write it in Turkish inside `t()`, add the English to `en.js`; `node scripts/i18n-missing.mjs` lists what is missing. Guards: `english.test.js` (dictionary complete with the same placeholders; every screen, panel, ring part and the drawing in English read for Turkish; storage identical in both languages); tests start in Turkish (`support/lang.js`).

---

## Core Domain Model

Three collections form the graph:

```js
Individual   { id, sex, age, generation, relation, label, displayLabel,
               affected, carrier, deceased, proband, placeholder?,
               pregnancyLoss, stillbirth, ongoingPregnancy?, termination?, ectopic?, gestationWeeks?,
               notes, condition?, conditions?,
               ageAtDeath?, causeOfDeath?, birthDate?, geneticTest?, geneticNote?, count?, consultand?, adoptedOut?,
               presymptomatic?, sexAtBirth?, lmp? }
                         // NSGC 2022 additions (clinician 2026-11-02): presymptomatic = vertical line through the symbol, in the key,
                         // never with affected (affected clears it); sexAtBirth 'AMAB'|'AFAB'|'UAAB' under the symbol (the symbol is gender);
                         // lmp 'YYYY-MM-DD' of an ongoing pregnancy, "SAT/LMP …" under the P; an ended union is drawn "//"
                         // The side panel's optional parts follow Ayarlar → Yan panel (utils/panelPrefs.js; hidden parts under
                         // "Diğer bilgiler…", a filled part always shows), like the ring (utils/ringPrefs.js, rare choices under "Diğer…")
                         // adoptedOut: adopted out (brackets, solid line from the drawn parents); adoption by a drawn couple is a
                         // socialParentLink 'adoptive' ('in' without, 'relative' with biological parents) — model.adoptionOf, ops.setAdoption
                         // consultand: the person who came for counselling — arrow without "P", at most one, never a
                         // pregnancy / placeholder / group (ops.setConsultand; clinician 2026-11-01); top bar = model.subjectOf
                         // count: several people in one symbol, the number inside (2–99) or 'n' (NSGC; clinician 2026-11-01):
                         // number and sex only — no finding/mark/partner/children/proband (validate.js GROUP_*); "Tek tek ayır" = ops.splitGroup, "Tek sembolde birleştir" (siblings chosen together) = ops.mergeIntoGroup
                         // geneticTest: 'tested' ("+"; absent = "−"); geneticNote: the clinician's lines (one per variant / result),
                         // drawn one under another below the symbol, no "E" prefix (NSGC 2022); old positive/negative/vus open as a line;
                         // conditions[].onsetAge: diagnosis age (shown in the notes)
                         // age / ageAtDeath: "35" (years), "2,5", "3 ay", "12 gün" — src/utils/age.js,
                         // compared in days; birthDate 'YYYY-MM-DD' (the proband's, top bar) sets the age as of today

Union        { id, partners: [id, id], status, consanguineous, consanguinityDegree,
               consanguinityStatus, relationshipBackground, leftPartner?, childless?, childlessReason? }
                         // childless: 'by_choice' (one bar) | 'infertile' (two bars), drawn while there are no children
                         // leftPartner: the partner the clinician moved to the left (placement only;
                         // structure.js / ordering.js keep it) — src/utils/sidewaysMove.js

ParentChildRelationship  { unionId, children: string[],      // BIOLOGICAL, ≤ 1 per child
                           birthOrderExplicit?, orderPolicy: 'byAge' | 'insertion' }

SocialParentLink         { childId, unionId, kind: 'adoptive' | 'foster' | 'step' | 'guardian' }

ReproductiveLink         { childId, personId, role: 'sperm_donor' | 'egg_donor' | 'gestational_carrier' | 'surrogate' }
                         // assisted reproduction (NSGC 2022 Fig. 5 as corrected 2025; clinician 2026-11-01): the drawn parents stay
                         // the couple; kinship / F / PED use the genetic parents (indexGraph.geneticParents: a sperm donor in the
                         // father's place, an egg donor or surrogate in the mother's); one sperm source, one egg source, one carrier
                         // per child; a donor added here (relation 'art_donor') has no parents or partner — notes and findings only

ParentChildRelationship.multiples?  [{ id, children (≥ 2, side by side), zygosity: 'monozygotic' | 'dizygotic' | 'unknown' }]
                         // twins / triplets — src/graph/multiples.js; drawn from one point of the sibship line
```

The persisted unit is the schema v2 document (`src/graph/document.js`): `{ schemaVersion: 2, graph: { individuals, unions, parentChildRelationships, socialParentLinks }, ids: { counters, retired }, wizardAnchorId, wizardMeta?, provenance }`. Clinical data lives on the person (no overlay). `placeholder: true` marks an "unspecified parent" created when a parent is deleted. Autosave is session-only (`sessionStorage`, clinician decision 2026-10-25): it survives a reload, nothing is kept once the tab closes (leaving with changes not downloaded asks first — `needsLeaveWarning`; a failed autosave is shown on the page); never write patient data to `localStorage` or any server — the clinician downloads what they keep, or shares the PNG through the device's share sheet ("Paylaş", optionally without the patient's name; nothing is sent unless they choose a target). PED files (`src/graph/ped.js`) go out ("İndir" menu; pedigree numbers as ids, never the name) and come in ("Aç"); they carry only parentage, sex and one affection status.

Birth order: `birthOrderExplicit: true` (user set "Doğum Sırası") is a hard rule for the layout; otherwise `orderPolicy: 'byAge'` sorts by known ages (oldest left; the aged are sorted among the places they hold, the unaged keep theirs — `finalize.ageOrder`; pregnancy losses and stillbirths keep their chronological place, never moved to the end — clinician decision 2026-10-25) and `'insertion'` keeps stored order. Entering or changing an age re-sorts that sibship at once (clinician request 2026-10-25, `ops.commit` → `followAges`): an `'insertion'` group becomes `'byAge'`; in an explicit order the aged siblings are sorted among their places and everyone else stays where the clinician put them (the latest action wins; it stays explicit). Without explicit order, PCL may move a sibling who married into another drawn family to the end of the sibship, but never contradicts known ages — except (clinician decision 2026-10-23) a sibling in a consanguineous union, who may be drawn at the sibship end beside the partner even against known ages. Apart from an age entry, an explicit order is never changed.

Consanguinity is derived from the drawing (`src/graph/kinship.js`, run in `finalize.js`): partners who share a drawn ancestor are consanguineous with the degree the structure shows, whichever panel drew the structure; a union declared consanguineous without shared ancestors stays `reported_unresolved`; one the drawing alone made consanguineous (`union.consanguinityFromStructure`) loses it again when the shared ancestors are removed (a declaration clears the marker). The wizard view (`deriveWizardView`, derived from the graph relative to `wizardAnchorId`, which follows the proband via `ops.setProband`) backs the parents' consanguinity template in the couple card; the former left panel was removed 2026-10-24 — input is the ring menu on the drawing (`RadialAddMenu.jsx`) and the right panel. Every view must show the same graph — guards in `src/__tests__/panelSync.test.js`. "Yeni" also builds a family whose parents are related by blood (`src/components/RelationChooser.jsx`, a window of its own, clinician decisions 2026-11-01): the relationship by name (1st–3rd cousins, the once-removed pairs, double first cousins incl. "berdel"), the side by the clinic's words (amca / teyze çocukları …; default the father's line on both sides), F, and a preview drawn by the layout engine. `src/graph/templates.js` builds it with the ordinary graph operations; `templates.test.js` checks every one of the 164 combinations is valid, has the right degree (incl. `third_cousin`) and F, and draws without breaking a rule.

**ID scheme is deterministic and symbolic** — `mother`, `mat_gf`, `mat_uncle_0`, `sib_f_2`, `U_MAT_GP`. Do not switch to UUID for wizard-built nodes. The parser uses UUID; that is intentional and isolated. IDs are permanent (Faz 2b): once assigned, an ID never moves to another person and is never reused (`ids.retired`, `src/graph/ids.js`); a re-added person gets a new ID.

---

## Non-Negotiable Clinical and Graph Constraints

1. Every individual has a globally unique ID — enforced by `validateGraphStructure`/`auditPedigreeGraph` on every graph operation (and `idSet` in the v1 builder used for migration). Never bypass it.
2. Each individual belongs to at most one **biological** parent union. `childToUnionMap` enforces this — never attach a child to two biological parent unions. Social parenthood (adoption, foster …) is a separate `socialParentLinks` entry; it never replaces or duplicates the biological link. A child with only a social link is drawn under the social parents with a dashed line of descent (`displayParentage`).
3. A union connects exactly two partners. Never siblings — not with a consanguinity flag either (`SIBLING_PARTNERS` in `validate.js`, refused in files too). Never self. A pregnancy outcome is never a partner or a parent (the operations refuse it; an older file that has one opens with the warning `PREGNANCY_PARTNER`).
4. Consanguinity must reflect true shared ancestry. Derived consanguinity (`known_supported`, degree, F) comes only from shared ancestor nodes in the graph — never invented. A consanguinity the clinician declares without drawn shared ancestors is still drawn as a double line (a clinician's report is enough; v0.3a.3) but stays `reported_unresolved`, with a notice asking for the shared ancestors; it never gets a degree or F of its own.
5. `pregnancyLoss` (spontaneous miscarriage, SAB), `stillbirth` (SB), `ongoingPregnancy` (P), `termination` (TOP) and `ectopic` (ECT) are distinct clinical types with distinct symbols (NSGC; `model.js` `isPregnancy` / `pregnancyKind` / `isSmallSymbol`). Do not conflate them. SAB/TOP/ECT are small triangles; SB and P are full size.
6. `proband: true` is set on at most one individual: more than one is an error; none is allowed (clinician 2026-11-01 — carrier screening, prenatal counselling) and shown as a soft, dismissible note (`PROBAND_MISSING`). `consultand: true` likewise at most one (`CONSULTAND_MULTIPLE`).
7. Integrity audit (`auditPedigreeGraph`) and semantic validation (`validatePedigree`) must pass after every graph mutation. Do not suppress their output.
8. Partners must be of opposite sex (current product rule, `UNION_PARTNER_SEX_CONFLICT`). The operations refuse a partner of unknown sex and a partner's sex being changed to unknown; validation flags only same-sex couples, so a file with an unknown-sex partner still opens. Same-sex partnership and unknown-sex partners are pending clinician decisions — do not change the rule without the user. Cross-generation partners are allowed one generation apart, never ancestor–descendant (clinician 2026-10-24): `union.crossGeneration`, each partner on their own row, stepped relationship line through an invisible stand-in beside the lower partner (`src/layout/pcl/crossGeneration.js`); children one generation below the lower partner (`computeGenerations`).
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
- `art.js` — assisted reproduction: donors / carriers beside the parent they stand in for (invisible `artVirtual` bonds), a carried child under its carrier, D/G lines (straight only where no symbol is touched). `layoutParentage(graph)` is the parentage the drawing shows; every layout audit (store, tidy, incremental) reads it, never the bare document.

Fallback engines are kept (do not delete until PCL has been validated for at least one release): `PEDITREE_PACKER=recursive` (`recursiveIntervalPacker.js`) and `PEDITREE_PACKER=legacy` (`pedigreeLayout.js` / legacy `layoutPacking`). `globalThis.__PEDITREE_PACKER__` overrides in the browser.

Layout gates (must hold after any layout or builder change):
- `npm run audit:layout-benchmark` — PCL fully clean on 13/13 clinical fixtures; realistic large pedigrees 0 invariant / 0 readability violations.
- `npm run audit:layout-fuzz -- --seed 1` and `--seed 12345` — 0 % invariant and 0 % readability failures for the default engine.
- `src/__tests__/pclLayout.test.js` — fixtures, determinism, birth order, time budgets (100 people < 500 ms, 300 < 2 s), orientation stability.

Known PCL limitations (tracked in `docs/PEDITREE_KNOWN_ISSUES.md` with guard tests; never silently accept regressions): KI-1 couple centring on 200–300-person pedigrees; KI-2 partly fixed (edit-local relayout; a widening sibship still pushes neighbouring families, dense large pedigrees often fall back to a fresh layout — `docs/PEDITREE_KI2_STABILITY_REPORT.md`); KI-4 fixed (pedigree number at the symbol's upper corner, off the line of descent); KI-8 fixed (married-in partners may stand on either side; nested partners and founder chains beside their partner — `docs/PEDITREE_KI8_REPORT.md`; residual: 3+ partners, a man married to two sisters); KI-10 layout of the 387/474-person stress graphs takes 1.7–2.8 s. KI-3 (footprint violations on the stress graphs) is fixed and guarded by frozen JSON fixtures (`src/__tests__/regression/ki3/`, `ki3Regression.test.js`; regenerate only with `npm run audit:freeze-ki3`).

---

## Current Architectural Priority

**Done (Aşama 1, awaiting user review): KI-2 edit-local layout stability.** The store passes the previous drawing to `src/layout/pcl/incremental.js` (`computeStableLayout`: levels local → wide → full; a level is accepted only with 0 invariant / readability violations and no more crossings, off-centre couples or long partner lines than the previous drawing). PCL `opts.stability`: stable ordering from previous positions, pins + IRLS, anchoring (the previous drawing is at rest; only terms the edit changed move people), couple terms scaled in local mode. Undo/redo restore the drawn view; project files and autosave carry `layoutHints`; toolbar "Konumlandır" (formerly "Yeniden Düzenle") = fresh layout, undoable. Measure with `npm run audit:layout-stability -- --label <name>`; guards in `src/__tests__/ki2Stability.test.js`. **Done (awaiting review): KI-8** — spouse-side alternatives as atom arrangements (`structure.js` `sideVariants`, `arrangementCore`), chosen by the ordering cost; KI-2 stable mode may switch an untouched atom's spouse side only; metric `readabilityMetrics.lineOverOwnPartner`; guards `ki8PartnerSide.test.js`. Four ratchet ceilings were raised as recorded trade-offs (see the report). **Next (after review): KI-1** — needs a coordinate-aware ordering cost or subtree block moves first (report §7), not just weights. Faz 4–5 visualization requirements (common-ancestor paths, selectable lineages, colour view, adoption notation) are documented in `docs/PEDITREE_UX_REVIEW.md` and stay out of these slices.

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
7. **Marks check:** after any change to symbols, marks or routing, run `await window.__peditreeMarkAudit()` in the dev preview (`src/audit/markCollisions.js` `runMarkAudit`: a family with every mark — arrows, brackets, numbered symbols, pregnancies, twins, text, single and double lines — measured as rendered; the open family, undo history and session are restored afterwards); it must return `[]`, and look at the drawing too. It does not check line–line crossings, fills, the legend, exports, print or narrow windows.
8. **Tests exercise behaviour.** A rule lives in the data (`ops.js` / `validate.js` / file and session loading), never only in a menu, and its test calls the operation, opens a file, or draws the real app in a simulated browser and reads the screen (`src/__tests__/screen.test.js`, jsdom via `support/dom.js`: clicks, keys, the ring, the panel, downloads) — a regex on the source code is not a test of behaviour. Only stylesheet rules (`stylesheet.test.js`), config files (`deployment`, `about`) and the project-wide no-`innerHTML` rule are checked as text. A new screen test must fail when the behaviour is broken on purpose (mutation check). Each fix: reproduce, show the test fails on the old code, then fix.
