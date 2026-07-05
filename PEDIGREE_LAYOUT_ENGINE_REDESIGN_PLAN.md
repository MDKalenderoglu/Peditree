# Pedigree Layout Engine Redesign Plan

Status: planning document (v0.3a.4). No layout-engine rewrite was performed in this slice — the rewrite is deliberately deferred, and this document records why, what the root cause is, and the phased path to fix it. What v0.3a.4 *did* ship is the safety net that prevents the user from making the problem worse (detection + rollback), buying time to do the rewrite properly.

---

## 1. The problem (observed in clinical QA)

Screenshots of complex pedigrees (upper-generation parent pairs + several collateral branches + multiple children) show relationship connectors collapsing into one ambiguous horizontal corridor:

- long shared horizontal lines spanning unrelated couples;
- union lines visually merging with child-connector lines;
- upper-generation parent pairs all funnelling into the same visual corridor;
- a viewer cannot tell which child belongs to which parent couple.

This is clinically unacceptable — a pedigree whose relationships are ambiguous is worse than no pedigree.

## 2. Root cause

`src/utils/pedigreeLayout.js` is a hand-rolled, role-clustered layout (maternal branch / paternal branch / nuclear post-pass / gen4 post-pass / direct-edit post-pass). It has two structural weaknesses that combine to produce the collapse:

1. **Per-union sibship rails are computed independently, with no global de-confliction.** For each union with children it draws a horizontal "sibship rail" at `dropY = (unionY + closestChildY) / 2` spanning `min(childX) .. max(childX)` (see the `PARENT-CHILD EDGES` block). Two unions whose parents sit at the same generation and whose children sit at the same generation get **the same `dropY`**. If their child X-ranges also overlap, the two rails render on top of each other — one long line that appears to belong to both couples. There is no pass that detects this and nudges one rail to a distinct Y or separates the X-ranges.

2. **X-positions are assigned per-branch, not globally packed.** Children are positioned relative to their own branch cluster. When upper generations and collateral branches are added, a union's children can end up spread across a very wide X-range (because each child is anchored near its own spouse/sub-branch), making that union's rail span the entire chart width and guaranteeing overlap with every other rail at the same height.

`generation` is already a BFS-derived, topology-correct property (`computeGenerations` in `graphTraversal.js`), so the *vertical* placement is sound. The defect is entirely in **horizontal packing + rail de-confliction**, i.e. the classic problem that a Sugiyama / Reingold–Tilford-style layered layout solves.

CLAUDE.md explicitly gates the layout-engine replacement ("Do not replace the layout engine yet") behind the generation-derivation work, which is now complete — so a rewrite is *permitted*, but it is a multi-day effort and must not be bundled with unrelated feature work.

## 3. What v0.3a.4 shipped instead (the safety net)

Rather than a risky partial rewrite, v0.3a.4 made the collapse **detectable and non-worsenable**:

- **`layoutIntegrity.js` CHECK 9 `SIBSHIP_BUS_OVERLAP`** — recomputes each union's rail (Y + X-range) from actual node positions and flags any two distinct unions whose rails share a Y (within tolerance) and overlap in X. Warning severity (a wizard-built pedigree can already exhibit this before any user action, so it must not hard-fail existing pedigrees).
- **`layoutIntegrity.js` CHECK 10 `EDGE_THROUGH_NODE`** — flags a horizontal/vertical connector that runs through an unrelated individual's symbol box.
- **`relationshipSafety.js` `introducesNewLayoutAmbiguity` / `assessRelationshipMutation`** — every relationship-creating action (`createUnionBetween`, `addParentsTo`, `addSiblingTo`, `addCustomConsanguinity`) builds a trial graph, runs both audits, and **rolls back** if the mutation *increases* the ambiguity count (or introduces a new structural error). The user can therefore never make readability worse through these actions, even though pre-existing overlaps aren't auto-fixed.
- **Cross-generation partnering is blocked** at the plan level (`computeUnionCreationPlan`), removing the single largest source of tangled corridors.

This is the "measure first, block regressions, then rewrite" discipline: the audit is the acceptance harness the rewrite will be validated against.

## 4. Target architecture for the rewrite

Replace the role-clustered post-pass layout with a proper layered (Sugiyama-style) pass:

1. **Layer assignment** — already done: `ind.generation` (BFS-derived) is the layer index. Keep it.
2. **Union contraction** — treat each union + its sibship as a composite node so partners stay adjacent and children hang beneath their own couple.
3. **Ordering within a layer** — order nodes within each generation to minimise edge crossings (barycentre / median heuristic across a few sweeps), keeping partners adjacent and siblings contiguous.
4. **X-coordinate assignment** — pack each layer left-to-right with a global minimum-separation constraint, then align each union's children to be centred under (and only under) that union's center. Each union gets its **own local sibship bus** whose X-range is bounded to its own children — never spanning unrelated couples.
5. **Rail de-confliction** — if two rails would still collide (rare after proper packing), offset one vertically by a small delta. The `SIBSHIP_BUS_OVERLAP` audit becomes the regression gate: after the rewrite it should report zero overlaps on all representative fixtures.

Libraries worth evaluating before hand-rolling: `d3-dag` (Sugiyama for DAGs) and `elkjs` (ELK layered). A pedigree is not a pure DAG (unions are hyperedges; consanguinity creates cycles), so a thin adapter is needed either way — but the ordering/packing math is exactly what these provide.

## 5. Phasing

- **v0.4a** — introduce the layered engine behind a feature flag, running in parallel with the current engine; validate that `SIBSHIP_BUS_OVERLAP` / `EDGE_THROUGH_NODE` report zero on the existing test-matrix pedigrees and on the QA fixtures that currently collapse. Do not remove the old engine yet.
- **v0.4b** — cut over once the layered engine passes every `pedigree.test.js` / `exportReadiness` / layout-audit fixture with zero new overlaps, and manual QA on the screenshots that motivated this doc shows readable output.
- **v0.4c** — retire the old post-pass code paths (`directEditUnions` shift passes, gen4 post-pass, etc.) that the layered engine subsumes.

**Precondition (from CLAUDE.md):** re-confirm `computeGenerations` produces identical values for every existing pedigree shape before and after the cutover — twins/adoption/new node types added in later slices go through ordinary PCR/union edges, but this must be verified, not assumed.

**Acceptance criteria (fixed in advance):**
- zero `SIBSHIP_BUS_OVERLAP` and zero `EDGE_THROUGH_NODE` on: 5 generations; 10-sibling sibship; 5+ aunts/uncles per side; first-cousin consanguinity; upper-generation parent additions; multiple partners.
- no regression on `pedigree.test.js`, `exportReadiness.test.js`, `exportUtils.test.js`, `persistence.test.js`, `layoutAudit.test.js`.
- the QA screenshots in `örnek/` (upper-generation + collateral) render with each couple's children clearly under that couple.

## 6. Explicitly NOT in this plan

Per CLAUDE.md and project scope: no HPO / genotype / ACMG / inheritance prediction / counseling generation. This is a pure graph-drawing correctness effort.
