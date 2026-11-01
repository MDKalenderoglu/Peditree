# Pedigree Core Stabilization v0.2

Targeted refactor per the audit verdict (`PEDIGREE_ARCHITECTURE_DECISION.md`): extend the existing graph/builder/audit core, do not rebuild. No HPO, genotype, ACMG, or inheritance-reasoning features were added in this slice — this release is exclusively about the five stabilization items below.

---

## Verification & follow-up pass (node/npm now available)

The initial v0.2 pass above was implemented in a sandbox without `node`/`npm`, so its tests were written but never executed and several blockers were explicitly left open. This follow-up pass ran in an environment with `node` v24 / `npm` 11 available and closed every one of those blockers. See `KNOWN_LIMITATIONS.md` for the authoritative, current list of what remains open — the "Known limitations" section below is left as-is for historical record of what was true after the *first* pass.

**Commands run, exact results:**
- `npm install` — up to date, no changes needed.
- `npm test` — **153 passed (153)** before any follow-up changes; **168 passed (168)** after (13 new tests added: 3 for the consanguinity guessed-path fix, 13 for the new export-readiness module — see below for the exact breakdown).
- `npm run build` — succeeded throughout (`vite build`, ~90ms, no errors).
- `npm run lint` — **initially 27 errors**, all fixed (see below); clean (0 errors) after.
- `node verify-generations.mjs` — **initially hung indefinitely** (see fix below); after the fix, **all 6 cases pass** with 0 integrity errors.

**What was fixed:**

1. **27 pre-existing ESLint errors**, none of them behavioral bugs — all mechanical:
   - Unused `React` default imports in `ChildOrderEditor.jsx`, `IndividualEditor.jsx`, `PedigreeCanvas.jsx`, `WizardPanel.jsx`, `src/experimental/JsonPanel.jsx`, `src/experimental/TextInputPanel.jsx` (this project's JSX compiles via the automatic runtime, so the default import was never actually referenced in any of these files — pre-existing since before v0.2, not introduced by it).
   - `src/__tests__/helpers.js` used `require()` inside an ESM ("type": "module") project — converted to top-level `import`s. (This file's `buildAndAudit` export is not currently imported by any test; fixed anyway since it's cheap and was a real latent break waiting to happen if ever invoked.)
   - Two unnecessary regex escapes (`\:`) in `exportUtils.js`.
   - An unused destructured `_proband` variable introduced by the v0.2 proband work in `usePedigreeStore.js` — replaced with an explicit `delete rest.proband`.
   - An unused `side` parameter in `pedigreeBuilderFromWizard.js`'s `buildGPCollateral` great-grandparent config loop.
   - `process` referenced (typeof-guarded) in `pedigreeBuilderFromWizard.js`'s dev-only post-build validation, but not declared as a known global for ESLint — added `process: 'readonly'` to `eslint.config.js`'s globals (no runtime behavior change; this reference was always typeof-guarded and never actually touched `process.env` in a context where `process` might not exist).
   - Several genuinely dead local variables/functions in `pedigreeLayout.js` (`partnerUnionsOf`, `parentUnionOf` — defined, never called) and `turkishPedigreeParser.js` (`motherId`/`fatherId` initialized to `null` then immediately overwritten before any read — a "useless assignment," not a used-then-discarded value).
   - Six locations in `pedigree.test.js` destructuring `graph`/`layoutIssues` from `buildFull(state)` without using them in that specific test body.
2. **`verify-generations.mjs` hung forever on a passing run.** It calls Vite's `createServer()` for SSR module loading but never closed it — the open dev-server handle kept the Node process alive indefinitely. Fixed with `await vite.close()` before `process.exit()`.
3. **`layoutIntegrity.js` wired into the live app** (previously only ever called from tests). `usePedigreeStore.js`'s `generateDerivedData()` now also runs `auditLayoutIntegrity(layout, newGraph)`, tags every issue with `source: 'graph'` or `source: 'layout'`, and merges both into the same `integrityIssues` the UI already renders — no new UI surface needed, no blocking of edits (layout issues are informational, same as graph issues were).
4. **Severity-tiered export gating** (`src/utils/exportReadiness.js`, new pure module): classifies the current `integrityIssues` plus a few export-specific checks into `fatal` / `error` / `warning`.
   - **Fatal (blocks export):** no svg element available; individuals exist but layout produced zero nodes (corrupted state); any `layoutIntegrity` error (a rendered node/edge that doesn't correctly reflect the data); a fixed allowlist of graph-structural error codes (`DUPLICATE_INDIVIDUAL_ID`, `DUPLICATE_UNION_ID`, `UNION_PARTNER_MISSING`, `UNION_SELF_PARTNER`, `PCR_MISSING_UNION`, `PCR_MISSING_CHILD`, `CHILD_MULTI_UNION`); `PROBAND_MULTIPLE` specifically (multiple probands surviving normalization).
   - **Error (blocks until `window.confirm()`):** any other `severity: 'error'` graph issue not on the fatal allowlist (currently: `SIBLING_GENERATION_INCONSISTENT`, `PARTNER_GENERATION_INCONSISTENT`, `CONSANGUINITY_STATUS_MISSING` — data-quality problems that don't corrupt the rendering itself).
   - **Warning (export proceeds, shown in a new amber "Export Uyarısı" banner):** `PROBAND_MISSING`, `CONSANGUINITY_UNRESOLVED`, any existing `layoutIntegrity`/`graphIntegrity` warning, plus three new checks that didn't exist anywhere before: an unsupported `sex` symbol value, unknown sex specifically on the proband or an affected individual, and a non-identity zoom/pan transform (which means SVG/PNG export — still serializing whatever's on screen — may clip part of the pedigree).
   - `App.jsx` wires this into both `handleExportSVG` and `handleExportPNG` via a shared `gateExport()` helper; a red "Export Hatası" banner is used only for true blocks/thrown errors, a separate amber "Export Uyarısı" banner for non-blocking warnings — these were previously conflated into one banner in the initial v0.2 pass.
5. **Fixed the previously-documented "guessed lineage" consanguinity gap.** Previously: for `first_cousin`, `second_cousin`, and `double_first_cousin`, leaving "Akrabalık Yolu" at "Bilinmiyor" (unknown) still silently resolved to a hardcoded default path and built real ancestor nodes marked `known_supported`, as if the user had confirmed a specific lineage. Root-caused: only `first_cousin` actually has per-case ambiguity in this app's model — the wizard's own dropdown offers 4 distinct, mutually-exclusive lineage paths for it. `second_cousin` and `double_first_cousin` have exactly one modeled ancestor structure each; there is no ambiguity for the app to "guess" for those two, so their existing default-path behavior was already correct. Fix: `first_cousin` now requires an explicit, user-chosen, non-`unknown` path to resolve to `known_supported`; left unconfirmed, it now correctly resolves to `reported_unresolved` with **no fabricated ancestor nodes**, same as any other unmodeled consanguinity report — and the existing (previously inaccurate) UI hint text ("Yol bilinmediginden ust soy baglantisi cizilmeyecek") is now actually true. `second_cousin`/`double_first_cousin` behavior is unchanged.

**Verified live in a running dev server (not just unit tests):** cleared `localStorage` and confirmed a clean default pedigree loads; unchecked the proband, exported SVG, and confirmed export proceeded with a visible amber "Export Uyarısı" banner reading "Pedigride proband (index vaka) işaretlenmemiş" (warning tier — allowed, not blocked); selected consanguinity degree "1. Kuzen" with "Akrabalık Yolu" left at "Bilinmiyor" and confirmed via the live data readout that `consanguinityStatus` was `reported_unresolved` with no `ggf`/`ggm` individuals created, and the canvas rendered the dashed amber "? akrabalık" marker, not a double line; then explicitly selected a path and confirmed it correctly flipped to `known_supported` with real `ggf`/`ggm` ancestor nodes and the canvas rendered the true double line — both the fix and the non-regression path confirmed in the browser, not just asserted by unit tests.

**Files changed in this follow-up pass** (in addition to the files listed in the original v0.2 section below): `src/utils/pedigreeLayout.js`, `src/utils/exportUtils.js`, `src/state/usePedigreeStore.js`, `src/builder/pedigreeBuilderFromWizard.js`, `eslint.config.js`, `src/__tests__/helpers.js`, `src/components/ChildOrderEditor.jsx`, `src/components/IndividualEditor.jsx`, `src/components/PedigreeCanvas.jsx`, `src/components/WizardPanel.jsx`, `src/experimental/JsonPanel.jsx`, `src/experimental/TextInputPanel.jsx`, `src/experimental/turkishPedigreeParser.js`, `src/App.jsx`, `verify-generations.mjs`, `src/__tests__/pedigree.test.js` (additional test blocks) — plus new files `src/utils/exportReadiness.js`, `src/__tests__/exportReadiness.test.js`, `KNOWN_LIMITATIONS.md`.

---

## 1. Fixed broken SVG/PNG export

**What changed:**
- `PedigreeCanvas.jsx` now uses `React.forwardRef` and forwards its `<svg>` node to the caller, in addition to keeping `id="pedigree-svg"` on the element as a fallback.
- `App.jsx` holds a `useRef` for the canvas and passes the live element directly to `exportSVG(svgRef.current)` / `exportPNG(svgRef.current)`.
- `exportUtils.js` was rewritten: both functions now accept an svg element argument (preferred) and fall back to `document.getElementById('pedigree-svg')`. If no element can be resolved, they **throw/reject an `ExportError`** with a clinician-readable message instead of silently returning.
- `exportPNG` now returns a `Promise` so an image-load failure during PNG rasterization is also surfaced as a rejection, not swallowed.
- `App.jsx` wraps both export calls in try/catch and renders a visible red "Export Hatası" banner on failure.

**Why clinically needed:** the previous implementation looked up an element `id` that did not exist anywhere in the rendered markup — both export buttons silently did nothing. A clinician clicking "SVG" or "PNG" to attach a pedigree to a report had no way to know the export never happened. This is the kind of failure that must never be silent in a clinical tool.

**Files:** `src/components/PedigreeCanvas.jsx`, `src/utils/exportUtils.js`, `src/App.jsx`

**Verified:** manually in a live browser preview (dev server) — SVG and PNG export both triggered a real download with no console errors and no error banner; `src/__tests__/exportUtils.test.js` (new) covers the "no element available → explicit ExportError" path (both throw and reject forms) and a happy-path SVG export with minimal DOM stubs, since the vitest environment for this project is `node` (no real DOM).

---

## 2. Versioned localStorage persistence

**What changed:**
- New `src/utils/persistence.js`: `saveSession`, `loadSession`, `clearSession` against the versioned key `clinical_pedigree_app.session.v1` (`SCHEMA_VERSION = 1`). All three functions are defensive — `saveSession` never throws (a `localStorage.setItem` failure, e.g. quota or private-browsing restrictions, is caught and logged); `loadSession` returns `null` (never throws) for missing data, invalid JSON, an unrelated JSON shape, or a schema-version mismatch.
- `usePedigreeStore.js`: the store now bootstraps from `loadSession()` on startup (`bootstrapState()`), merging any loaded data over a fresh default state (`mergeWithDefaults()`) so a save from an older shape doesn't crash the builder on a missing field. If the restored data fails to build (throws inside `buildPedigreeFromWizard`), the saved session is cleared and the app starts clean instead of crashing.
- A `usePedigreeStore.subscribe` autosave persists `wizardData` (debounced 300ms) after every mutation.
- Manual right-panel edits (`displayLabel`, `affected`, `carrier`, `deceased`, `notes`, `condition`, `ageAtDeath`, `causeOfDeath`) are now also written into a new `wizardData.manualEdits` overlay, keyed by individual id — previously these lived only in the in-memory `pedigreeData` snapshot and did not survive a reload. `generateDerivedData`'s merge step now prefers the in-memory snapshot but falls back to `manualEdits` on first load.
- `App.jsx` adds a **"Yeni Pedigri"** (New pedigree) button that confirms, then calls a new `resetPedigree()` store action, which clears the saved session and resets to a clean wizard state.

**Why clinically needed:** the app had zero persistence — a page refresh or accidental tab close destroyed the entire pedigree being built during a clinic visit. This was the single highest-leverage fix identified in the audit.

**Files:** `src/utils/persistence.js` (new), `src/state/usePedigreeStore.js`, `src/App.jsx`

**Verified:** manually in a live browser preview — built a pedigree (added a sibling, moved the proband flag), reloaded the page, confirmed the sibling and the proband assignment both survived; injected `{this is not valid json!!!` directly into the storage key and reloaded — app did not crash, logged `[persistence] Saved pedigree session is not valid JSON — ignoring and starting clean.`, and rendered the default clean pedigree; clicked "Yeni Pedigri" and confirmed it reset to the default 7-individual skeleton and re-saved a clean session. Automated coverage in `src/__tests__/persistence.test.js` (new) — round-trip save/load, invalid JSON, unrelated JSON shape, schema-version mismatch, and a `setItem`-throws case, using an in-memory `localStorage` mock (the vitest environment is `node`, no real `window`/`localStorage`).

---

## 3. Exactly-one-proband invariant

**What changed:**
- `pedigreeBuilderFromWizard.js`: the hardcoded `proband: true` on the wizard's `'proband'` individual was removed from its construction. A new stage **10d (PROBAND ASSIGNMENT)** runs after all individuals/graph edits are built and is now the single place that ever sets `proband: true` — driven by `state.probandId` (`undefined` → defaults to the `'proband'` slot for backward compatibility; a specific id → that individual becomes proband and everyone else is cleared; `null` → explicit zero-proband editing state; a stale/nonexistent id → nobody is marked, left for `graphIntegrity` to flag rather than guessed).
- `usePedigreeStore.js`: new `probandId` field in wizard state (default `'proband'`), new `setProband(id)` / `clearProband()` actions (both trigger a full rebuild through stage 10d, so the invariant is enforced by construction). `updateIndividual` special-cases a `proband` field in its `updates` argument and routes it through the same `probandId` mechanism instead of direct mutation, as defense in depth for any future caller (the current UI does not call `updateIndividual` with a `proband` field — see below).
- `IndividualEditor.jsx`: added a **"Proband (Index Vaka)"** checkbox in the clinical-marking section, wired directly to the new `onSetProband`/`onClearProband` props — checking it moves the flag to the selected individual; unchecking it clears to the zero-proband state.
- `graphIntegrity.js`: two new checks. **CHECK 11 (`PROBAND_MISSING`)** — zero probands, `severity: 'warning'` (a valid mid-edit state). **CHECK 11 (`PROBAND_MULTIPLE`)** — more than one proband, `severity: 'error'` (should never occur through the builder's own pipeline; this is defense in depth against malformed/imported data).
- `App.jsx` now surfaces `integrityIssues` (both severities) in the existing warnings banner — previously these were computed but had no visible surface in the live app at all (only in the dead `TextInputPanel` debug view).

**Why clinically needed:** an ambiguous or duplicated index case can silently misdirect any future segregation/inheritance reasoning anchored to "the proband." There was no code anywhere enforcing this invariant; it held only because the current UI never exposed a way to break it.

**Files:** `src/builder/pedigreeBuilderFromWizard.js`, `src/state/usePedigreeStore.js`, `src/components/IndividualEditor.jsx`, `src/components/App.jsx`, `src/utils/graphIntegrity.js`

**Verified:** manually in a live browser preview — added a sibling, checked its "Proband (Index Vaka)" box, confirmed via the live data readout that exactly one individual (`sib_m_0`) had `proband: true` and the default `proband` slot had `proband: false`; confirmed this survived a reload. Automated coverage added to `src/__tests__/pedigree.test.js` under **"Proband invariant (v0.2)"**: default assignment, moving `probandId` to an existing individual, `probandId: null` (zero-proband, warning not error), a stale `probandId` (zero probands, no crash), and a hand-constructed two-proband graph fed directly into `auditPedigreeGraph` to confirm `PROBAND_MULTIPLE` fires as an error.

---

## 4. Consanguinity status: known_supported vs. reported_unresolved

**What changed:**
- `Union` objects now carry a `consanguinityStatus` field (`'none' | 'pending' | 'known_supported' | 'reported_unresolved'`), authoritative for rendering and auditing. The existing `consanguineous` boolean is **unchanged in meaning** ("the user declared this union consanguineous") and every existing test assertion against it still passes — `consanguinityStatus` is the new, additional field that decides what gets drawn.
- `pedigreeBuilderFromWizard.js`: `U_PARENTS` starts at `consanguinityStatus: 'pending'` when declared consanguineous. The consanguinity path engine (stage 7) promotes it to `'known_supported'` only in the three branches that actually build shared-ancestor nodes (`first_cousin` with a resolved path, `double_first_cousin`, `second_cousin`). A finalization step immediately after stage 7 downgrades anything still `'pending'` to `'reported_unresolved'` — this covers unsupported degrees (`first_cousin_once_removed`, `second_cousin_once_removed`, `multiple_relationship`, `other`) and an unresolved `'unknown'` path on an otherwise-supported degree. The "mark any union as consanguineous" mechanism (stage 10b, used for arbitrary unions like an uncle's marriage) now always sets `'reported_unresolved'` — it never builds ancestor structure, so it can never legitimately be `'known_supported'`.
- `pedigreeLayout.js`: edge-type selection now reads `consanguinityStatus` instead of the raw `consanguineous` flag — only `'known_supported'` produces the `consanguineousUnion` (double-line) edge type. `'reported_unresolved'` produces a new `consanguineousUnionUnresolved` edge type.
- `PedigreeCanvas.jsx`: renders `consanguineousUnionUnresolved` as a single amber dashed line with a small "? akrabalık" label — visually distinct from the true double line, so it can never be mistaken for a structurally confirmed cousin marriage.
- `graphIntegrity.js`: **CHECK 12 (`CONSANGUINITY_UNRESOLVED`)** — `severity: 'warning'` — fires for any union with `consanguinityStatus === 'reported_unresolved'`. This is an expected, non-broken state. **CHECK 13 (`CONSANGUINITY_STATUS_MISSING`)** — `severity: 'error'` — fires if `consanguineous === true` but the status is neither `'known_supported'` nor `'reported_unresolved'` (i.e. still `'pending'` or absent). This app's own builder always resolves one or the other; seeing anything else means the graph didn't go through that pipeline (malformed/imported data) and is a distinct, more serious signal than CHECK 12.
- `validators.js`: added a new Turkish-language warning specifically for `reported_unresolved` unions, additive alongside the pre-existing degree-specific messages (which are unchanged, so existing test assertions on those exact strings still pass).

**Why clinically needed:** this was the direct fix for the violation of `CLAUDE.md`'s non-negotiable rule #4 ("a double line rendered without shared ancestor nodes is a structural error"). Previously, selecting any consanguinity degree other than the three templated ones — or leaving the path unresolved, or flagging an arbitrary collateral union as consanguineous — rendered a full double line with zero backing structure in the graph. A genetic counselor reading the printed pedigree had no way to know the claimed shared ancestor didn't actually exist in the data.

**Files:** `src/builder/pedigreeBuilderFromWizard.js`, `src/utils/graphIntegrity.js`, `src/utils/pedigreeLayout.js`, `src/components/PedigreeCanvas.jsx`, `src/utils/validators.js`

**Verified:** manually in a live browser preview — checked "Akraba Evliliği Var" with degree left unselected, confirmed the union rendered as a single dashed amber line with a "? akrabalık" label (not a double line) and three consistent warning messages appeared; then selected "1. Kuzen" (first_cousin), confirmed `consanguinityStatus: 'known_supported'` in the live data readout with no unresolved warning. Automated coverage added to `src/__tests__/pedigree.test.js` under **"Consanguinity status (v0.2)"**: resolved first-cousin (known_supported, renders double line), `degree: 'unknown'` (reported_unresolved, renders the new unresolved edge type, not the double line), an untemplated degree (`first_cousin_once_removed`), an arbitrary flagged union (uncle's marriage) never becoming known_supported, and a hand-constructed `consanguineous: true` + `consanguinityStatus: 'pending'` union fed into `auditPedigreeGraph` to confirm `CONSANGUINITY_STATUS_MISSING` fires as an error.

---

## 5. Quarantined the dead second data model

**What changed:**
- Moved `src/parser/turkishPedigreeParser.js` → `src/experimental/turkishPedigreeParser.js`, `src/components/TextInputPanel.jsx` → `src/experimental/TextInputPanel.jsx`, `src/components/JsonPanel.jsx` → `src/experimental/JsonPanel.jsx` (via `git mv`, preserving history).
- Added a prominent `⚠ EXPERIMENTAL — NOT PART OF THE PRODUCTION MODEL/UI ⚠` header comment to each of the three files, explaining specifically why (UUID-keyed graph incompatible with the canonical deterministic-symbolic-ID scheme; not imported by `App.jsx`; consuming/producing an incompatible shape).
- Added `PEDIGREE_MODEL_BOUNDARY.md` at the repo root: documents the canonical model and its build pipeline, the experimental model and exactly why it's incompatible, why a dual model is unsafe, and a concrete future migration path if free-text pedigree entry is revived (rewrite the parser to feed `wizardData` into the existing `buildPedigreeFromWizard()` pipeline rather than constructing a second graph directly).

**Why clinically needed:** two structurally-similar but ID-incompatible pedigree graphs existing in the same codebase, in the same directories as production code, with no distinguishing marker, is a standing risk that a future change (by a person or an AI assistant) generalizes over "the pedigree data" without knowing which model produced it — or worse, that someone reconnects the seemingly-functional dead UI without realizing it bypasses every integrity/audit guarantee (including the proband and consanguinity-status invariants added in this same release) that the production pipeline provides.

**Files:** `src/experimental/turkishPedigreeParser.js`, `src/experimental/TextInputPanel.jsx`, `src/experimental/JsonPanel.jsx` (all moved from `src/parser/` and `src/components/`), `PEDIGREE_MODEL_BOUNDARY.md` (new)

**Verified:** confirmed via `grep -rln` across `src/` before the move that none of the three files were imported by `App.jsx` or anything it transitively imports (the only references found were the files importing each other and the store, all one-directional and dead); confirmed via `git status` after the move that the moves were tracked as renames, not delete+add.

---

## Files modified in this release

```
src/components/PedigreeCanvas.jsx        (export ref, consanguinity edge rendering)
src/utils/exportUtils.js                  (rewritten: element-based, explicit errors)
src/App.jsx                               (export ref/error handling, New Pedigree, integrity banner, proband props)
src/utils/persistence.js                  (new)
src/state/usePedigreeStore.js             (persistence bootstrap/autosave, probandId, manualEdits, new actions)
src/components/IndividualEditor.jsx       (proband checkbox)
src/builder/pedigreeBuilderFromWizard.js  (proband stage 10d, consanguinityStatus resolution)
src/utils/graphIntegrity.js               (CHECK 11 proband, CHECK 12/13 consanguinity status)
src/utils/pedigreeLayout.js               (consanguinityStatus-driven edge type)
src/utils/validators.js                   (reported_unresolved warning)
src/experimental/turkishPedigreeParser.js (moved + quarantine header)
src/experimental/TextInputPanel.jsx       (moved + quarantine header)
src/experimental/JsonPanel.jsx            (moved + quarantine header)
src/__tests__/pedigree.test.js            (proband + consanguinity status test blocks)
src/__tests__/persistence.test.js         (new)
src/__tests__/exportUtils.test.js         (new)
PEDIGREE_MODEL_BOUNDARY.md                (new)
CHANGELOG_PEDIGREE_V0_2.md                (new, this file)
```

## Tests / verification performed

> **Superseded — see "Verification & follow-up pass" above.** The note directly below was accurate for the *initial* v0.2 pass (no `node`/`npm` available); the follow-up pass had both and ran everything.

- **Could not run `npm test` / `vitest` in this sandbox** — no `node`/`npm` on `PATH` in the agent's shell. All new/updated automated tests (`pedigree.test.js` additions, `persistence.test.js`, `exportUtils.test.js`) were written against the existing test patterns and manually traced against the implementation for correctness, but have **not been executed by a test runner in this session**. Running `npm test` is the immediate next step before merging.
- **All manual verification was performed against a real, running dev server** via the project's browser-preview tooling (which does have its own runtime, separate from the agent's shell) — every scenario described as "Verified" above was actually exercised in a live browser, not just reasoned about: pedigree construction, sibling addition, proband transfer between individuals, full page reload with persistence, corrupt-localStorage recovery, "Yeni Pedigri" reset, SVG export, PNG export, and both the resolved and unresolved consanguinity rendering paths.
- No regressions were observed in any manually-exercised path; the pre-existing default 3-generation pedigree, grandparent-level rendering, and integrity/warning pipeline all continued to function as before.

## Known limitations (do not overclaim)

> **Superseded — see `KNOWN_LIMITATIONS.md` for the current, authoritative list.** The section below is left as written for the *initial* v0.2 pass; most of it was closed in the follow-up pass documented above. In short: the test suite has now been executed (168 passing), the consanguinity guessed-path gap is fixed, and export gating now exists. What's still genuinely open: `manualEdits` pruning, PNG's happy-path test coverage, and export still not auto-resetting the view before serializing (now mitigated with a warning, not eliminated) — see `KNOWN_LIMITATIONS.md`.

- **This release does not make the app clinical-grade.** No annotation schema (genotype/phenotype/HPO/ACMG), no inheritance reasoning, no segregation analysis — all deliberately out of scope per the task brief.
- **The test suite was not executed by an automated runner in this session.** `npm test` must be run before treating the new/updated tests as a passing gate, not just a written one.
- **A pre-existing, related-but-distinct consanguinity gap was found and deliberately left unfixed in this release:** for the three templated degrees (`first_cousin`, `second_cousin`, `double_first_cousin`), if the user leaves "Akrabalık Yolu" (consanguinity path) at "Bilinmiyor" (unknown), the builder still silently falls back to a hardcoded default lineage path (e.g. assumes the two paternal grandfathers are the sibling pair) and marks the result `known_supported` — because real ancestor nodes with a genuine sibling relationship *are* built, this is technically correct under this release's `known_supported`/`reported_unresolved` distinction, but it means the app is guessing *which* grandparent pair is related when the user explicitly said they don't know. This is a legitimate follow-up (the fix would be: only resolve to `known_supported` when the user has explicitly chosen a path, and treat degree-known-but-path-unknown as its own `reported_unresolved` case) but was out of scope for this release, since it wasn't one of the five required tasks and changing it risks altering behavior several existing tests depend on.
- **`manualEdits` in wizard state is not pruned.** If an individual is removed from the pedigree (e.g. a stepper count decrease) its stray `manualEdits[id]` entry is harmless but persists indefinitely in a long editing session. Not a correctness issue, just unbounded (slow) growth — worth a follow-up cleanup pass.
- **PNG export's happy path is not covered by an automated test** (only its "no element" failure path is) — full canvas/Image rasterization isn't practically mockable without a real DOM environment (this project's vitest environment is `node`, and no jsdom/happy-dom dependency exists to add without running `npm install`, which wasn't possible in this sandbox). The manual browser verification above is the coverage for that path in this release.
- **Export still serializes whatever is currently zoomed/panned into view**, not a canonical full-bounds render — this was a separate audit finding (not one of the five required tasks here) and remains unfixed.
