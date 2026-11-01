# Known Limitations — Pedigree Drawer

Consolidated, current list of what this app does **not** do or does imperfectly, as of the v0.2 stabilization work (initial pass + verification/follow-up pass). This supersedes the "Known limitations" sections scattered across `CHANGELOG_PEDIGREE_V0_2.md` — that file's own limitations sections are kept for historical record of what was true *at each point in time*, but this file is the one to check for the current state.

Scope reminder: this app is a pedigree **drawer**, not a clinical reasoning tool. No HPO, genotype, ACMG classification, inheritance-pattern suggestion, or counseling logic exists, and none is in scope until a real annotation schema is designed (see `PEDIGREE_DATA_MODEL_PROPOSAL.md`). That is a deliberate scope boundary, not an oversight — it is not re-listed below as a "limitation" for that reason.

---

## Closed in the v0.2 verification/follow-up pass (previously open)

These were flagged as open blockers after the first v0.2 pass and are now resolved — listed here so it's clear they were checked, not just assumed fine:

- **Test suite was never actually executed.** Now run: 168 tests pass (`npm test`), `npm run build` succeeds, `npm run lint` is clean (0 errors), and `verify-generations.mjs` passes all 6 cases.
- **`layoutIntegrity.js` existed but was never wired into the live app.** Now called from `usePedigreeStore.js`'s `generateDerivedData()` and from `updateIndividual`'s direct-edit path; its issues are tagged `source: 'layout'` and merged into the same `integrityIssues` the UI already renders. Does not block editing — surfaced only.
- **No severity-tiered export gating.** Now implemented (`src/utils/exportReadiness.js` + `App.jsx`): `fatal` blocks export outright with an explanation, `error` requires an explicit `confirm()` before proceeding, `warning` allows export and shows what was flagged. See `CHANGELOG_PEDIGREE_V0_2.md` for the exact fatal/error/warning classification.
- **Templated consanguinity degrees silently guessed a lineage path when left unconfirmed.** Fixed: `first_cousin` (the only degree with genuine per-case path ambiguity in this app's model) now requires an explicit, user-chosen path to resolve to `known_supported`; left at "Bilinmiyor," it correctly falls to `reported_unresolved` with no fabricated ancestor nodes. `second_cousin`/`double_first_cousin` are unaffected (they have exactly one modeled lineage shape, not a guess among options, so their existing default-path behavior was already correct and stays as-is).
- **`verify-generations.mjs` hung indefinitely on success.** It created a Vite dev server (`createServer`) for SSR module loading but never closed it, so the Node process never exited on a passing run. Fixed with an explicit `await vite.close()` before `process.exit()`.
- **27 pre-existing ESLint errors** (mostly unused `React` imports left over from before the automatic JSX runtime, a `require()` in an ESM test helper, a couple of genuinely dead local variables, two unnecessary regex escapes). All fixed; `npm run lint` is clean. None of these were behavioral bugs — all mechanical.

---

## Still open

- **`manualEdits` in wizard state is never pruned.** If an individual is removed from the pedigree (e.g. a stepper count decrease), its `manualEdits[id]` entry is orphaned but harmless — it persists indefinitely in a long editing/localStorage session. Slow, unbounded growth, not a correctness bug. Worth a follow-up cleanup pass (e.g. prune on each rebuild against the current individual id set).
- **PNG export's happy path has no automated test.** Only its "no element available" failure path is unit-tested (`exportUtils.test.js`). Full canvas/Image rasterization isn't practically mockable without a real DOM environment, and this project's vitest environment is `node` (no jsdom/happy-dom dependency to add without an `npm install`, which was out of scope for a stabilization pass). Manually verified in a real browser instead (see `CHANGELOG_PEDIGREE_V0_2.md`).
- **Export still serializes whatever is currently zoomed/panned, not a canonical full-bounds render.** This is now *mitigated*, not eliminated: the new export-gating warning tier detects a non-identity zoom/pan transform and warns the user before exporting ("görünüm yakınlaştırılmış... export öncesi Sıfırla ile görünümü sıfırlamanız önerilir"), but export does not automatically reset the view first. A user can still dismiss the warning and export a clipped view intentionally or by habit.
- **No undo/redo.** Every wizard action is immediately committed and autosaved. Correcting a mistake means manually reversing it field-by-field. Not addressed in this stabilization pass (out of the five original v0.2 tasks and this follow-up's scope).
- **Single-session, single-pedigree model.** There is still no concept of multiple saved pedigrees/patients — "Yeni Pedigri" replaces the one saved session, it doesn't let you keep more than one. Persistence (v0.2) fixed *data loss on reload*, not *multi-patient workflow*.
- **The experimental/quarantined code in `src/experimental/` is unchanged** (no new dead code was introduced or removed in this follow-up pass; `PEDIGREE_MODEL_BOUNDARY.md` was not touched since the production/experimental boundary itself did not change).

---

## Not a bug, but worth knowing

- `CONSANGUINITY_STATUS_MISSING` and the two `SIBLING_GENERATION_INCONSISTENT`/`PARTNER_GENERATION_INCONSISTENT` checks are `severity: 'error'` in `graphIntegrity.js` but are treated as **error-tier (confirm-to-export)**, not fatal, in `exportReadiness.js` — they don't corrupt the rendered SVG the way a dangling reference or duplicate ID would, they flag a data-quality inconsistency. This is a deliberate distinction, not an oversight; see the comments in `src/utils/exportReadiness.js`.
- The fatal/error/warning export-gating tiers most heavily exercise codepaths that are **not reachable through the normal UI today** (e.g. `PROBAND_MULTIPLE`, `CHILD_MULTI_UNION`) — the builder's own construction logic prevents them by design. They exist as defense-in-depth against corrupted or externally-imported state (e.g. a future JSON-import feature, or a hand-edited localStorage value), and are covered by unit tests (`exportReadiness.test.js`) with hand-constructed issue objects rather than by driving the live UI into those states.
