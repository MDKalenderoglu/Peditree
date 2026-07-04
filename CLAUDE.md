# CLAUDE.md — Clinical Pedigree Application

## Project Purpose

Turkish-language, clinical-grade pedigree drawing tool for genetic counseling. Produces structurally valid pedigree graphs per ACMG/NSGC nomenclature standards. Not a family tree app — clinical correctness of the graph model takes priority over visual polish.

---

## Stack

React 19 + Vite · D3.js (SVG) · Zustand · UUID

---

## Core Domain Model

Three collections form the graph:

```js
Individual   { id, sex, age, generation, relation, label, displayLabel,
               affected, carrier, deceased, proband,
               pregnancyLoss, stillbirth, notes, x?, y? }

Union        { id, partners: [id, id], consanguineous, consanguinityDegree,
               consanguinityPath, status }

ParentChildRelationship  { unionId, children: string[] }
```

**ID scheme is deterministic and symbolic** — `mother`, `mat_gf`, `mat_uncle_0`, `sib_f_2`, `U_MAT_GP`. Do not switch to UUID for wizard-built nodes. The parser uses UUID; that is intentional and isolated.

---

## Non-Negotiable Clinical and Graph Constraints

1. Every individual has a globally unique ID. `idSet` enforces this at build time — never bypass it.
2. Each individual belongs to at most one parent union. `childToUnionMap` enforces this — never attach a child to two unions.
3. A union connects exactly two partners. Never siblings. Never self.
4. Consanguinity must reflect true shared ancestry: shared ancestor nodes must exist in the graph. A double line rendered without shared ancestor nodes is a structural error.
5. `pregnancyLoss` (spontaneous miscarriage), `stillbirth`, and termination of pregnancy are distinct clinical types with distinct symbols. Do not conflate them.
6. `proband: true` must be set on exactly one individual. Zero or multiple probands is a validation error.
7. Integrity audit (`auditPedigreeGraph`) and semantic validation (`validatePedigree`) must pass after every graph mutation. Do not suppress their output.

---

## Multigenerational Expansion Requirement

The system must not be limited to the current ~5-generation wizard-driven depth. It must support:
- Expansion upward to earlier ancestors (beyond great-grandparents)
- Lateral expansion to collateral relatives on both sides
- Downward expansion to descendants of any individual in the graph, not only the proband
- Cousins' partners and their children

This means `generation` must eventually be a topology-derived property, not a hardcoded literal at each `addInd()` call site.

---

## Current Architectural Priority

**Active work: make `generation` a derived property computed by BFS from graph topology.**

The target function is `computeGenerations(graph, anchorId = 'proband', anchorGeneration = 3)` in a new file `src/utils/graphTraversal.js`. It is called once at the end of `buildPedigreeFromWizard()`, after all nodes and relationships are created, overwriting the hardcoded generation values with BFS-derived ones.

BFS rules:
- Upward through PCR → union.partners: parent gets `child.generation - 1`
- Downward through union.partners → PCR.children: child gets `parent.generation + 1`
- Lateral through union membership: co-partner gets same generation as partner (handles spouse stubs)
- Conflict (two paths disagree): emit `GENERATION_INCONSISTENT`, keep first-derived value
- Disconnected node (not reachable from proband): keep constructor-assigned generation

After this, add two checks to `graphIntegrity.js`:
- `SIBLING_GENERATION_INCONSISTENT`: all children in the same PCR must share one generation value
- `PARTNER_GENERATION_INCONSISTENT`: both partners in a union must share one generation value

---

## Refactor Rules

- **Graph model is source of truth.** The wizard is an input adapter. Future work inverts the current dependency so that graph operations (`addInd`, `addUnion`, `addChild`) are callable independently of the wizard.
- **Do not duplicate maternal/paternal logic.** The four relative-builder loops (maternal uncles, maternal aunts, paternal uncles, paternal aunts) are ~150 lines of copy-pasted code. They will eventually be collapsed into one parameterised `buildCollateralBranch()` function. Do not add more duplicated loops.
- **Do not hardcode new generation numbers.** After `computeGenerations` is implemented, new `addInd()` calls should omit `generation` or pass a placeholder — the BFS pass will assign the correct value.
- **Do not replace the layout engine yet.** `pedigreeLayout.js` reads `ind.generation` and produces correct Y positions. It does not need to change until the BFS-derived generation work is complete and the need for a Sugiyama-style layout is validated.
- **Do not add UI cleanup, new components, or i18n in the same slice as graph logic changes.** Keep graph correctness work isolated.

---

## What Must Not Be Broken

| Invariant | Where enforced |
|---|---|
| No duplicate individual IDs | `idSet` in builder + CHECK 1 in `graphIntegrity.js` |
| No child in multiple parent unions | `childToUnionMap` in builder + CHECK 7 in `graphIntegrity.js` |
| No missing union partners | CHECK 3 in `graphIntegrity.js` |
| Consanguinity shared ancestors exist in graph | Consanguinity path engine in builder, stages 7 |
| `auditPedigreeGraph` returns zero errors | Run after every change |
| Layout produces valid x/y for all nodes | Visual regression check after any builder or layout change |
| Manual edits (displayLabel, affected, carrier, notes) survive graph rebuild | `mergeManualEdits` in `usePedigreeStore.js` |
| SVG and PNG export render all nodes and edges | Check after any canvas or layout change |

---

## Preferred Workflow for Future Tasks

1. **Read before writing.** Read `pedigreeBuilderFromWizard.js`, `pedigreeLayout.js`, and the relevant validator before proposing any change.
2. **Audit first.** After any graph change, call `auditPedigreeGraph()` and confirm zero errors before touching the layout engine.
3. **One concern per slice.** Graph correctness work and layout work do not mix in the same change. Builder changes and UI changes do not mix.
4. **Snapshot generation values.** Before any builder change, record the `generation` field of every individual for a representative pedigree (first-cousin consanguinity + maternal/paternal relatives + gen4 child). Assert the snapshot is unchanged after the change.
5. **New clinical node types go in the builder first**, then layout, then renderer — in that order. Never add a visual symbol without a corresponding model field.
6. **Do not remove hardcoded `generation: N` literals from the builder** until `computeGenerations()` is implemented, tested, and confirmed to produce identical values for all existing pedigree shapes.
