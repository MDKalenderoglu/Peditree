# Layout Fuzz — Baseline Report

Generated: 2026-07-06T20:07:31.680Z

Config: seed=`1`, cases=1000, maxOpsPerCase=14

## Result

- cases run: **1000**
- cases passed: **248**
- cases failed: **752**
- failure rate: **75.2%**

## Failure types by count

| invariant | failing cases |
|---|---|
| NODE_SYMBOL_OVERLAP | 290 |
| UNRELATED_FAMILY_BLOCK_OVERLAP | 284 |
| UNRELATED_NODE_IN_CHILD_FOOTPRINT | 183 |
| EDGE_THROUGH_NON_OWNER_NODE | 130 |
| UNION_LINE_THROUGH_NODE | 130 |
| WRONG_PARENT_BUS_ATTACHMENT | 20 |
| CROSS_BRANCH_UNION_COLLAPSES_ANCESTOR_BLOCKS | 17 |
| SHARED_CHILD_BUS_BETWEEN_UNRELATED_UNIONS | 13 |

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

| caseSeed | failAtStep | ops | codes |
|---|---|---|---|
| 2856050349 | 10 | 11 | UNRELATED_FAMILY_BLOCK_OVERLAP |
| 140661886 | 2 | 3 | NODE_SYMBOL_OVERLAP |
| 1288782296 | 0 | 1 | NODE_SYMBOL_OVERLAP |
| 588892009 | 13 | 14 | UNRELATED_NODE_IN_CHILD_FOOTPRINT |
| 2168487226 | 9 | 10 | NODE_SYMBOL_OVERLAP |
| 3317131924 | 3 | 4 | UNRELATED_FAMILY_BLOCK_OVERLAP |
| 3154108453 | 2 | 3 | NODE_SYMBOL_OVERLAP |
| 438724598 | 10 | 11 | UNRELATED_FAMILY_BLOCK_OVERLAP |
| 4167998855 | 0 | 1 | NODE_SYMBOL_OVERLAP |
| 1586828112 | 4 | 5 | UNRELATED_FAMILY_BLOCK_OVERLAP |

## Top minimal repros (after shrinking)

### repro 1 — NODE_SYMBOL_OVERLAP (1 ops, caseSeed 1288782296)
```json
[{"op":"deleteIndividual","id":"father"}]
```

### repro 2 — EDGE_THROUGH_NON_OWNER_NODE+UNION_LINE_THROUGH_NODE (1 ops, caseSeed 1793374714)
```json
[{"op":"addSpouse","target":"pat_gf","sex":"female"}]
```

### repro 3 — EDGE_THROUGH_NON_OWNER_NODE+UNION_LINE_THROUGH_NODE+UNRELATED_FAMILY_BLOCK_OVERLAP (1 ops, caseSeed 4117796537)
```json
[{"op":"addSpouse","target":"mat_gm","sex":"female"}]
```

### repro 4 — UNRELATED_FAMILY_BLOCK_OVERLAP (2 ops, caseSeed 3035574093)
```json
[{"op":"addRelativeBranch","side":"maternalRelatives","type":"uncles","male":1,"female":1},{"op":"deleteIndividual","id":"mat_gm"}]
```

### repro 5 — UNRELATED_NODE_IN_CHILD_FOOTPRINT (2 ops, caseSeed 4288284983)
```json
[{"op":"addRelativeBranch","side":"paternalRelatives","type":"uncles","male":2,"female":2},{"op":"addRelativeBranch","side":"maternalRelatives","type":"uncles","male":0,"female":0}]
```

### repro 6 — NODE_SYMBOL_OVERLAP+UNRELATED_FAMILY_BLOCK_OVERLAP (2 ops, caseSeed 709087886)
```json
[{"op":"addParents","target":"pat_gf"},{"op":"addSpouse","target":"pat_gm","sex":"female"}]
```

### repro 7 — EDGE_THROUGH_NON_OWNER_NODE+NODE_SYMBOL_OVERLAP+UNION_LINE_THROUGH_NODE (2 ops, caseSeed 499115965)
```json
[{"op":"addSpouse","target":"father","sex":"female"},{"op":"addSpouse","target":"de_sp_0","sex":"male"}]
```

### repro 8 — EDGE_THROUGH_NON_OWNER_NODE+NODE_SYMBOL_OVERLAP+UNION_LINE_THROUGH_NODE+UNRELATED_FAMILY_BLOCK_OVERLAP (1 ops, caseSeed 1498476092)
```json
[{"op":"deleteIndividual","id":"father"}]
```

### repro 9 — UNRELATED_FAMILY_BLOCK_OVERLAP+UNRELATED_NODE_IN_CHILD_FOOTPRINT (2 ops, caseSeed 3851146147)
```json
[{"op":"addSpouse","target":"mother","sex":"female"},{"op":"addRelativeBranch","side":"paternalRelatives","type":"aunts","male":0,"female":3}]
```

### repro 10 — CROSS_BRANCH_UNION_COLLAPSES_ANCESTOR_BLOCKS+EDGE_THROUGH_NON_OWNER_NODE+UNION_LINE_THROUGH_NODE+UNRELATED_FAMILY_BLOCK_OVERLAP (1 ops, caseSeed 833510177)
```json
[{"op":"addSpouse","target":"mat_gm","sex":"male"}]
```

## Named QA scenarios

| scenario | result | codes |
|---|---|---|
| upper-generation-child-add-overlap | ✅ pass | — |
| parent-sibling-branch-collapse | ✅ pass | — |
| large-sibship-near-aunt-uncle | ✅ pass | — |
| distant-same-generation-union-collapse | ✅ pass | — |
| right-panel-sibling-state-derived-case | ✅ pass | — |
| export-negative-x-viewbox | ✅ pass | — |
