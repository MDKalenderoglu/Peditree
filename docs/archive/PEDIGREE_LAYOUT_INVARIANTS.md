# Pedigree Layout Invariants

The executable specification of a **clinically safe** pedigree layout. Every
invariant below must hold for ANY pedigree the app can produce, from any
sequence of user operations. These are the acceptance criteria the layout
engine is measured against by the fuzz harness (`npm run audit:layout-fuzz`),
implemented as pure detectors in `src/audit/layoutInvariants.js`.

A pedigree that violates any of these can cause a clinical geneticist to
**misread who is related to whom** — the single failure the app must never
produce (see `PEDIGREE_LAYOUT_ENGINE_REDESIGN_PLAN.md` and the project goal).

Status column: **rollback-triggering** = a mutation that introduces this
should be blocked/rolled back by the store safety net rather than committed.

| # | Invariant | Rollback-triggering |
|---|---|---|
| 1 | NODE_SYMBOL_OVERLAP | yes |
| 2 | UNION_LINE_THROUGH_NODE | yes |
| 3 | DESCENT_LINE_THROUGH_NODE | yes |
| 4 | CHILD_BUS_THROUGH_NODE | yes |
| 5 | EDGE_THROUGH_NON_OWNER_NODE (umbrella of 2–4) | yes |
| 6 | UNRELATED_NODE_IN_CHILD_FOOTPRINT | yes |
| 7 | UNRELATED_FAMILY_BLOCK_OVERLAP | yes |
| 8 | SHARED_CHILD_BUS_BETWEEN_UNRELATED_UNIONS | yes |
| 9 | WRONG_PARENT_BUS_ATTACHMENT | yes |
| 10 | CROSS_BRANCH_UNION_COLLAPSES_ANCESTOR_BLOCKS | yes |
| 11 | EXPORT_VIEWBOX_CLIPS_CONTENT | no (export-time, warn) |
| 12 | GENERATION_ORDER_BROKEN | yes |
| 13 | PEDIGREE_ID_ORDER_BROKEN | no (numbering, warn) |

Symbol geometry: liveborn half-extent = 20px, pregnancy-loss/stillbirth
half-extent = 14px, generation row spacing = 150px, spouse gap = 70px,
sibling slot = 90px, export viewBox padding = 100px.

---

## 1. NODE_SYMBOL_OVERLAP
- **Clinical meaning:** two distinct individuals are drawn on top of / touching each other.
- **Why misleading:** a reader cannot tell there are two people, or which symbol/state belongs to whom.
- **Measurement:** for every pair of liveborn nodes, `|dx| < 40 AND |dy| < 40` (both symbols half-width apart) → overlap. Any pair within 10px on both axes → overlap regardless of type.
- **Sample error:** `Symbols 'mat_gm' and 'pat_gf' overlap (dx=20, dy=0).`

## 2. UNION_LINE_THROUGH_NODE
- **Clinical meaning:** a partnership (marriage) line runs through a person who is not one of the two partners.
- **Why misleading:** implies that intervening person is part of the union.
- **Measurement:** for each `union`/`consanguineousUnion` edge (horizontal), any node whose box the segment crosses that is not at either endpoint.
- **Sample error:** `union connector passes through non-owner individual 'sib_m_2'.`

## 3. DESCENT_LINE_THROUGH_NODE
- **Clinical meaning:** a parent→child vertical connector (`parentChildDrop`/`childStem`) passes through an unrelated person.
- **Why misleading:** implies a parentage link to that person.
- **Measurement:** vertical descent segment crosses a non-endpoint node box.
- **Sample error:** `childStem connector passes through non-owner individual 'mother'.`

## 4. CHILD_BUS_THROUGH_NODE
- **Clinical meaning:** a sibship rail (`sibship`) runs through a person who is not a child on that rail.
- **Why misleading:** implies that person is a sibling in the group.
- **Measurement:** horizontal sibship segment crosses a non-endpoint node box.
- **Sample error:** `sibship connector passes through non-owner individual 'father'.`

## 5. EDGE_THROUGH_NON_OWNER_NODE
- Umbrella recorded whenever any of 2–4 fires — the general clinical-safety statement "no line segment may pass through or visually attach to a non-owner individual." Reported alongside the specific code.

## 6. UNRELATED_NODE_IN_CHILD_FOOTPRINT
- **Clinical meaning:** a same-generation individual who is NOT a partner of a union sits horizontally inside that union's child-fan span.
- **Why misleading:** the eye reads "this person is over the same children" as a parenthood cue even with no line touching them (the exact defect reported from QA where a wide sibship appeared to run under an aunt/uncle).
- **Measurement:** for each union with children, span = `[min(childX)+20, max(childX)-20]`; any parent-generation node not in `union.partners` with `x` inside the span.
- **Sample error:** `Individual 'mat_uncle_0' sits inside union 'U_PARENTS''s child fan without being a partner.`

## 7. UNRELATED_FAMILY_BLOCK_OVERLAP
- **Clinical meaning:** two independent family trees (root-couple subtrees) that share no marriage occupy overlapping horizontal space.
- **Why misleading:** two unrelated families appear merged into one structure.
- **Measurement:** using the descent forest (`layoutModel.js`), each root union's full descendant node-set x-bbox; two roots with no marriage bridging them whose bboxes overlap by > 20px.
- **Note:** conservative heuristic — root subtrees connected by a marriage (e.g. maternal + paternal grandparents joined by the parents' union) are correctly treated as related and allowed to touch.
- **Sample error:** `Unrelated family blocks (roots 'U_MAT_GP' & 'U_PAT_GP') overlap in x by 90px.`

## 8. SHARED_CHILD_BUS_BETWEEN_UNRELATED_UNIONS
- **Clinical meaning:** two different couples' sibship rails sit at the same height with overlapping x — the "single global bus."
- **Why misleading:** cannot tell which child belongs to which couple.
- **Measurement:** per-union rail (y = midpoint of union-y and nearest child-y; x = child min..max); two rails within 6px in y and > 20px x-overlap.
- **Sample error:** `Unions 'U_PARENTS' & 'U_MAT_UNCLE_0' share a child bus at y≈305 (x-overlap 90px).`

## 9. WRONG_PARENT_BUS_ATTACHMENT
- **Clinical meaning:** a child sits under a different couple's sibship bus than its own.
- **Why misleading:** the child appears to belong to the wrong parents.
- **Measurement:** a child of union A whose x falls inside union B's rail span at the same rail y (A≠B, child not also B's child).
- **Sample error:** `Child 'sib_f_1' of union 'U_PARENTS' falls under union 'U_MAT_UNCLE_0''s child bus.`

## 10. CROSS_BRANCH_UNION_COLLAPSES_ANCESTOR_BLOCKS
- **Clinical meaning:** a union between two far-apart same-generation people is drawn as a long line that runs over intervening people.
- **Why misleading:** pulls unrelated ancestor blocks together / implies relationships with everyone the line crosses.
- **Measurement:** a union edge with horizontal span > 270px (3 slots) that has ≥1 non-endpoint node under its line.
- **Sample error:** `Distant union 'U_LINK_0' (span 540px) runs over 3 intervening node(s).`

## 11. EXPORT_VIEWBOX_CLIPS_CONTENT
- **Clinical meaning:** exported SVG/PNG cuts off part of the pedigree.
- **Why misleading:** a clinician receives an incomplete family history.
- **Measurement:** replicate the renderer's viewBox (node bbox ± 100px pad); any node symbol extent or edge endpoint outside it. Correctly accounts for negative x (viewBox uses actual min).
- **Sample error:** `Node 'mat_uncle_2' symbol extends outside export viewBox.`

## 12. GENERATION_ORDER_BROKEN
- **Clinical meaning:** generations are not cleanly stacked top→bottom, or a generation's members are not on one row.
- **Why misleading:** breaks the fundamental vertical = generation reading of a pedigree.
- **Measurement:** all nodes of one generation share one y (±2px); deeper generation has strictly greater y.
- **Sample error:** `Generation 3 is not below generation 2 (y 230 ≤ 230).`

## 13. PEDIGREE_ID_ORDER_BROKEN
- **Clinical meaning:** the I-1/II-2 numbering does not run left-to-right.
- **Why misleading:** the standard positional index no longer matches drawn position; references (“II-3”) point to the wrong person.
- **Measurement:** within each generation, nodes sorted by x must have `indexInGeneration` = 1,2,3… in that order.
- **Sample error:** `In generation 2, left-to-right order does not match pedigree index numbering.`

---

## Readability tier (connector ownership) — added 2026-10, Faz 1

The 13 invariants above prove that no connector passes *through* a symbol and that no two families share one child
bus. They do not catch the failure clinical QA actually reported: one family's line touching, running along or
crossing another family's line, so a reader cannot tell who is married to whom or which couple a child belongs to.
A layout can pass all 13 and still be ambiguous (measured: fuzz 0 % invariant failures vs 96.4 % readability failures
on the recursive packer, see `docs/PEDITREE_AUDIT_REPORT.md`). Since the Faz 3 cutover the default engine is PCL
(`src/layout/pcl`), measured at 0 % on both tiers (both fuzz seeds; `docs/PEDITREE_LAYOUT_ARCHITECTURE.md` §7).

Every structural connector now carries the id of its owning union (`unionId`). Implemented in
`src/audit/connectorReadability.js`, reported as a separate tier by `npm run audit:layout-fuzz` and
`npm run audit:layout-benchmark`:

| # | Code | Clinical meaning | Measurement |
|---|---|---|---|
| R1 | FOREIGN_CONNECTOR_CROSSING | A line of one family crosses a line of another without a visible line jump | horizontal × vertical segments of different owners intersect at an interior point and neither carries a `bridges` marker at that point |
| R2 | COLLINEAR_FOREIGN_CONNECTORS | Two families' lines run along each other and read as one line (e.g. a raised union line continuing a person's own descent stem) | parallel segments of different owners within 4 px and overlapping by > 2 px |
| R3 | FOREIGN_T_JUNCTION | A line of one family ends on a line of another family, which reads as an attachment | an endpoint of one segment lies within 3 px of a segment owned by a different union |

Soft metrics (`readabilityMetrics`): couples off-centre over their children (> ½ slot), side-hanging buses, union
lines longer than 3 slots, crossing count, width per individual. These are reported, not gated, and are the
comparison basis for layout engines (`docs/PEDITREE_LAYOUT_ARCHITECTURE.md` §4).
