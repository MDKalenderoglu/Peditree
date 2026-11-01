# Architecture Decision: Extend, Refactor, or Rebuild?

Companion to `AUDIT_PEDIGREE_APP.md`. That document is the evidence; this is the ruling.

## Decision

**Refactor and extend the existing graph/builder/audit core. Do not rebuild from zero. Do redesign the `Individual`/annotation schema, persistence, and export as a deliberate, additive slice of work before any inheritance-reasoning feature is attempted.**

This is not a split-the-difference hedge — it is two different verdicts for two different parts of the codebase, because they are not at the same maturity level.

## What earns "extend," and why

| Component | Verdict | Reasoning |
|---|---|---|
| Graph model shape (`individuals[]`/`unions[]`/`parentChildRelationships[]`) | **Keep** | Correct fundamental choice — a real graph, not visual nodes with positions bolted on. Rebuilding this from scratch would reproduce the same shape with more ceremony, not a better one. |
| `computeGenerations` (BFS generation derivation) | **Keep** | Exactly the right approach per `CLAUDE.md`'s own stated priority, already implemented, already tested against 6 representative shapes (`verify-generations.mjs`). Directly reusable as the foundation for the relationship-degree function inheritance reasoning needs (see audit §J). |
| `auditPedigreeGraph` (semantic integrity) | **Keep, extend** | Detect-only, pure, well-factored, easy to add checks to (already has 10 checks; adding an 11th "exactly one proband" check is a 5-line diff in the established pattern). |
| `childOrdering.js` (ordering/reconciliation) | **Keep** | Generation-agnostic, union-scoped, has real reconciliation semantics (prune stale/preserve order/append new) and real test coverage. This is not something to rebuild; it's a small, correct library. |
| `layoutIntegrity.js` | **Keep, wire in** | Exists, works, is simply disconnected from the live app (only called from tests). Connecting it is a config change, not a rewrite. |
| D3/SVG rendering approach in `PedigreeCanvas.jsx` | **Keep** | Correctly separated from data (pure function of `{nodes, edges}`), typed edges are a sound rendering model. Swapping D3 for something else would not fix any problem identified in the audit. |
| `Individual` schema (booleans: `affected`/`carrier`/`deceased`/`pregnancyLoss`/`stillbirth`, plus loose strings `condition`/`notes`) | **Redesign** | Not because it's badly engineered, but because it is *categorically insufficient* for the stated goal (genotype, HPO, ACMG, certainty, segregation analysis). This isn't a bug to fix; it's a missing layer to design. See `PEDIGREE_DATA_MODEL_PROPOSAL.md`. |
| Persistence | **Build (does not exist)** | Not a refactor target because there's nothing to refactor — zero persistence exists today. This is new work, and it's the highest-leverage new work available. |
| Export (`exportUtils.js`) | **Fix, then rebuild the pipeline** | The immediate bug (dead DOM ID) is a one-line fix. The *pipeline* — "serialize whatever's currently zoomed" — needs to become "render the canonical full pedigree to a target format," which is closer to new work than a patch. |
| `pedigreeLayout.js` (positioning algorithm) | **Refactor, not rebuild, but with real algorithmic change** | The cursor-based, order-dependent, "shift everything right" repair-pass strategy is the direct cause of the overlap/collision bugs already documented by a prior reviewer (`hatalar/claude_pedigree_hatalari.md`). It should be replaced with a proper subtree-width-aware placement pass (classic tree-layout: compute each branch's required width bottom-up, then assign x-positions top-down) — but the *inputs and outputs* of this function (`{individuals, unions, parentChildRelationships} → {nodes, edges}`) are exactly right and should not change. This is "rewrite the function body, keep the contract," which is a refactor, not a rebuild of the app. |
| `turkishPedigreeParser.js` / `TextInputPanel.jsx` / `JsonPanel.jsx` | **Delete or deliberately relaunch** | Dead code with an incompatible ID scheme (UUID vs. the live builder's deterministic symbolic IDs). Keeping it half-present is worse than either choosing to finish it as a real feature (in which case it needs to be rewritten to emit the *same* deterministic ID scheme as `pedigreeBuilderFromWizard.js`, not its own) or removing it outright. |

## Why not a full rebuild

A full rebuild throws away:
- A tested BFS generation-derivation pass that already handles 6+ real pedigree shapes correctly.
- A tested ordering-reconciliation system with real edge-case coverage (count changes, stale tokens, anchor preservation).
- A working detect-only integrity audit layer with 10 checks and a clean extension pattern.
- ~2,120 lines of passing regression tests exercising builder correctness across 12 pedigree shapes plus structural invariants.

None of that is clinical-domain-specific boilerplate that a rebuild would trivially regenerate — it's accumulated correctness against real edge cases (reorder-then-count-increase, reorder-then-count-decrease, mixed sibling types, custom-consanguinity-plus-template coexistence). Rebuilding means re-discovering every one of those edge cases from scratch, most likely by re-introducing the exact bugs the current test suite now prevents.

## Why not "just add features" on top of the current state

The audit identifies gaps that are not fixable by additive feature work on the current schema:
- You cannot bolt genotype/zygosity onto a model with no `Variant` entity and no per-individual test-result concept without redesigning `Individual`.
- You cannot fix the consanguinity-without-shared-ancestry violation (audit C.6/D.4) without either constraining the wizard's own dropdown or redesigning how `union.consanguineous` is set — a pure feature addition would leave the existing violation in place while building new features next to it.
- You cannot add real interoperability (PED, FHIR) on top of an uncontrolled `relation` string enum (audit D.10) — the vocabulary needs to be cleaned up first, which is a refactor of existing code, not new code alongside it.
- The layout collision bugs are not going to stop appearing as more branch types are added on top of the current cursor-based algorithm — every previous branch type (maternal, paternal, GP-level, gen4, direct-edit) added its own post-hoc "shift right" patch to the same file; adding a sixth branch type without fixing the underlying strategy guarantees a sixth patch and a sixth class of overlap bug.

## Sequencing implication

This decision directly drives the roadmap in `PEDIGREE_4_WEEK_ROADMAP.md`: fix what's broken and enforce what's already specified (week 1), redesign the data model additively (week 2), build persistence/export properly (week 3), and only then start on reasoning-adjacent groundwork (week 4) — because reasoning code written against the current `Individual` shape would itself become throwaway work once the schema changes, compounding cost rather than saving time.
