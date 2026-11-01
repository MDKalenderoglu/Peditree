# Pedigree Model Boundary

This document exists so no future developer (human or AI) mistakes the experimental code described below for a second production pathway. There is exactly **one** canonical pedigree data model in this application. Everything else is quarantined.

> **Note (Peditree clean-repo migration):** `src/experimental/` (the dead Turkish-text parser + its UI) is **not carried into this repository**. It was never imported by production code (see "Non-production / experimental model" below) and was excluded as unnecessary clutter when this clean repo was created from the original working repo. The section below is kept as historical record of *why* that code was dead and unsafe, and as the migration plan if free-text pedigree entry is revived from scratch. If you need the actual old source for reference, it lives in the original repository's history, not here.

## Canonical model (production)

**Entry point:** `App.jsx` → `WizardPanel.jsx` / `IndividualEditor.jsx` → `usePedigreeStore.js`

**Build pipeline:**
```
wizardData (usePedigreeStore.js state)
  → buildPedigreeFromWizard()      src/builder/pedigreeBuilderFromWizard.js
  → computeGenerations()            src/utils/graphTraversal.js
  → auditPedigreeGraph()             src/utils/graphIntegrity.js
  → computePedigreeLayout()          src/utils/pedigreeLayout.js
  → validatePedigree()                src/utils/validators.js
  → { individuals, unions, parentChildRelationships, nodes, edges }
```

**ID scheme:** deterministic, symbolic strings assigned by the builder — `'mother'`, `'father'`, `'mat_gf'`, `'sib_m_0'`, `'mat_uncle_0'`, `'U_PARENTS'`, etc. `CLAUDE.md` is explicit that this is intentional for wizard-built nodes and must not be switched to UUIDs.

**Persistence:** `wizardData` (plus a `manualEdits` overlay for right-panel edits and a `probandId` pointer) is saved to `localStorage` under the versioned key `clinical_pedigree_app.session.v1` — see `src/utils/persistence.js`. This is the only persisted state; `pedigreeData` (the graph + layout) is always re-derived from it, never persisted directly.

**Rendering:** `PedigreeCanvas.jsx` — a pure function of `{ nodes, edges }` produced by the pipeline above.

**This is the only pedigree model that production code — `App.jsx`, `usePedigreeStore.js`, and everything it imports — ever constructs or reads.**

## Non-production / experimental model (quarantined)

Located in `src/experimental/`:

- `turkishPedigreeParser.js` — a free-text Turkish-language pedigree parser. Builds `individuals`/`unions`/`parentChildRelationships` arrays that look structurally similar to the canonical model but are **not compatible** with it:
  - IDs are random UUIDs (`uuid` package), not the deterministic symbolic scheme above.
  - Generation numbers, relation values, and consanguinity handling follow different, looser conventions than the builder (e.g. ambiguous relative mentions become string warnings like `"Belirsiz ifade algılandı: 'dede'"` rather than resolved graph nodes).
  - It has no consanguinity-path engine, no `computeGenerations` BFS pass, no `consanguinityStatus` field (see the consanguinity fix in this release) — its output would fail several of `graphIntegrity.js`'s checks if run through it, and would not have the resolved/unresolved consanguinity distinction the canonical model now enforces.
- `TextInputPanel.jsx` — the intended UI for the parser above. Its `onParse` prop has no caller anywhere in `App.jsx`.
- `JsonPanel.jsx` — a debug view expecting the *parser's* output shape, not `usePedigreeStore`'s `pedigreeData`.

**None of these three files are imported by `App.jsx` or by anything `App.jsx` transitively imports.** They were previously left in `src/parser/` and `src/components/` — the same directories as production code — with no marking distinguishing them. That was the risk this document and the move to `src/experimental/` closes.

## Why dual models are unsafe

- **Silent incompatibility.** Two ID schemes existing in the same codebase means any future code that generically walks "the individuals array" cannot assume a shared ID convention unless it knows which model produced the array. A merge, an import feature, or a well-intentioned refactor that generalizes over "pedigree data" without checking this would produce corrupt or unresolvable graphs.
- **False sense of an existing feature.** Before this change, a developer (or an AI assistant) asked "does this app support typing a pedigree as text?" would find a plausible-looking, seemingly functional `TextInputPanel` + parser and reasonably conclude yes — when in fact it was unreachable dead code, disconnected from every integrity/audit/layout guarantee the production pipeline provides.
- **Divergent correctness guarantees.** The canonical model has real invariants enforced on it: `auditPedigreeGraph`'s 13 checks (including the proband-count and consanguinity-status checks added in this release), `computeGenerations`'s BFS derivation, ordering reconciliation. The experimental parser has none of these. Code built against "the pedigree data model" without specifying which one risks silently assuming guarantees the experimental path never provided.

## Future migration path, if free-text/NLP input is revived

Do not resurrect `turkishPedigreeParser.js` by wiring `TextInputPanel.jsx` back into `App.jsx` as-is. If this feature is revived:

1. **Rewrite the parser to emit the canonical ID scheme**, or better, to emit an intermediate structured representation (detected relatives, counts, ages, consanguinity mentions) that is fed into `buildPedigreeFromWizard()`'s `wizardData` shape rather than constructing a graph directly. This reuses every existing guarantee (audit, BFS generation, ordering, consanguinity-status resolution) instead of re-deriving them for a second pipeline.
2. **Do not let the parser assign `consanguineous: true` or `proband: true` directly.** Both are now single-source-of-truth fields (`consanguinityStatus` resolution in the builder; `probandId` in `usePedigreeStore.js`) — a text parser should produce wizard-shaped *intent* (e.g. "user said parents are first cousins" → `wizardData.parents.consanguineous = true; consanguinityDegree = 'first_cousin'`) and let the existing pipeline resolve it, not bypass that resolution.
3. **Delete `JsonPanel.jsx` and `TextInputPanel.jsx` in their current form** rather than reconnecting them; rebuild the UI against the real `usePedigreeStore` state shape from scratch, since the current versions assume the experimental parser's output shape.
4. Add the revived feature's own test coverage modeled on `src/__tests__/pedigree.test.js`'s existing pattern (build → audit → assert zero errors) before considering it production-ready.
