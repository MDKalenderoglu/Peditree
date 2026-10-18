# Layout Fuzz — Baseline Report

Generated: 2026-10-18T07:32:18.644Z

Config: seed=`12345`, cases=1000, maxOpsPerCase=14

## Result

- cases run: **1000**
- cases passed: **1000**
- cases failed: **0**
- failure rate: **0.0%**

## Failure types by count

_none_

## Implemented vs TODO invariants

Implemented (checked every case):
- NODE_SYMBOL_OVERLAP
- UNION_LINE_THROUGH_NODE
- DESCENT_LINE_THROUGH_NODE
- CHILD_BUS_THROUGH_NODE
- EDGE_THROUGH_NON_OWNER_NODE
- UNRELATED_NODE_IN_CHILD_FOOTPRINT
- UNRELATED_FAMILY_BLOCK_OVERLAP
- SHARED_CHILD_BUS_BETWEEN_UNRELATED_UNIONS
- WRONG_PARENT_BUS_ATTACHMENT
- CROSS_BRANCH_UNION_COLLAPSES_ANCESTOR_BLOCKS
- EXPORT_VIEWBOX_CLIPS_CONTENT
- GENERATION_ORDER_BROKEN
- PEDIGREE_ID_ORDER_BROKEN

TODO invariants (declared in spec, not yet auto-checked): _none — all 13 spec invariants implemented._

## Top 10 failing case seeds

_none_

## Top minimal repros (after shrinking)

_none_
## Readability tier (connector ownership — connectorReadability.js)

Reported separately from the 13-invariant tier above so historical baselines stay comparable.

- cases failing readability: **0/1000** (0.0%)
- end-state metrics: off-centre couple in 85 cases (186/6699 couples with children = 2.8%), side-hanging bus in 625, long union line (>3 slots) in 70, foreign crossings in 0 cases (0 total)

## Named QA scenarios

| scenario | invariant tier | readability tier | codes |
|---|---|---|---|
| upper-generation-child-add-overlap | ✅ pass | ✅ pass | — |
| parent-sibling-branch-collapse | ✅ pass | ✅ pass | — |
| large-sibship-near-aunt-uncle | ✅ pass | ✅ pass | — |
| distant-same-generation-union-collapse | ✅ pass | ✅ pass | — |
| right-panel-sibling-state-derived-case | ✅ pass | ✅ pass | — |
| export-negative-x-viewbox | ✅ pass | ✅ pass | — |
