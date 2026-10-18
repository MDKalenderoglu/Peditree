# Layout stability (KI-2) — ki8-before

Commit: `7a9e5bf (+ uncommitted src changes)` · Node v24.18.0 · 2026-10-18T22:04:03.172Z · 30 s

Method: src/audit/stabilityHarness.js — store-level, raw coordinates of what the clinician sees; "moved" = |Δx| or |Δy| > 2 px; transitions = applied (not refused) edits. "Row neighbours whose gap changed" = two people side by side on a row whose distance changed by more than 2 px (local rearrangement; a block sliding as a whole only changes the gaps at its edges).

## Random edit populations

A parent flip "after a grandparent union edit" happened in an edit that created, removed or re-partnered a union with one of the parents’ parents in it, or changed a parent’s own parent union (e.g. a union between two grandparents, which can force the grandparent couples and so the parents to trade sides); adding an uncle or aunt does not count. "For readability": every edit-local layout had more readability problems (line crossings + off-centre couples + long partner lines) than the fresh layout the store used instead. Every other flip is "unexplained". Relayout level: n/a = no edit-local relayout (fresh layout after every edit).

| population | transitions | parent flips / transitions with both parents | flip rate | flips: after a grandparent union edit / for readability / unexplained | moved fraction (of which vertical) | row neighbours whose gap changed | edits with no movement | mean shift raw / x-aligned (px) | p90 / max of the largest shift per edit (px) | relayout level per edit |
|---|---|---|---|---|---|---|---|---|---|---|
| random-200x12 | 1582 | 14 / 1495 | 0.9 % | 4 / 10 / 0 | 36.8 % (1.4 %) | 19.2 % | 14.2 % | 23.7 / 29 | 147 / 1676 | local 1481, frozen 60, full 25, wide 16 |
| ki2-40x10 | 262 | 2 / 244 | 0.8 % | 2 / 0 / 0 | 36.9 % (0.3 %) | 19.6 % | 16.8 % | 23.7 / 28.7 | 111 / 1845 | local 246, frozen 11, wide 3, full 2 |

### Readability cost of stability

After every edit, the drawing the store shows vs a fresh PCL layout of the same graph (summed over all edits; off-centre = couple more than half a slot from the centre of its children; crossings = line jumps; long partner line = partners more than 3 slots apart; side-hanging = the couple’s midpoint lies outside its children’s span, which every single child not exactly below its parents counts as).

| population | off-centre couples drawn / fresh | edits with more off-centre couples than fresh | line crossings drawn / fresh | edits with more crossings than fresh | long partner lines (> 3 slots) drawn / fresh | edits with more long partner lines than fresh | side-hanging sibship lines drawn / fresh | partnership line over another partner (KI-8) drawn / fresh |
|---|---|---|---|---|---|---|---|---|
| random-200x12 | 92 / 144 | 6 | 75 / 120 | 6 | 38 / 46 | 4 | 2318 / 1801 | 68 / 42 |
| ki2-40x10 | 5 / 18 | 0 | 2 / 8 | 0 | 2 / 2 | 0 | 351 / 270 | 9 / 2 |

## Targeted clinical edits

Affected block = edited person, new people, the edited person’s sibship (siblings may make room), their partners, and the parents of every new child. A family (couple, or sibship of 2+) counts as untouched when all its members are outside the block; it is reshaped when the spacing between its members changed by more than 2 px (moving as a unit does not count).

| scenario | edit | people | moved outside block / outside | untouched families reshaped / untouched families | parent flip | sibling-order changes | undo exact (max px) | redo exact | save→load max px |
|---|---|---|---|---|---|---|---|---|---|
| starter | spouse+child to first male sibling | — | (not applicable) ||||||| 
| starter | child to the proband | 7 | 0 / 6 | 0 / 3 | no | 0 | yes (0) | yes | 0 |
| starter | sibling to the proband | 7 | 0 / 4 | 0 / 2 | no | 0 | yes (0) | yes | 0 |
| starter | spouse to the first female sibling | — | (not applicable) ||||||| 
| sibshipWithRelatives | spouse+child to first male sibling | 19 | 13 / 15 | 2 / 9 | no | 0 | yes (0) | yes | 0 |
| sibshipWithRelatives | child to the proband | 19 | 0 / 14 | 0 / 9 | no | 0 | yes (0) | yes | 0 |
| sibshipWithRelatives | sibling to the proband | 19 | 12 / 12 | 0 / 6 | no | 0 | yes (0) | yes | 0 |
| sibshipWithRelatives | spouse to the first female sibling | 19 | 13 / 15 | 2 / 9 | no | 0 | yes (0) | yes | 0 |
| consanguineousParents | spouse+child to first male sibling | 18 | 11 / 15 | 3 / 10 | no | 0 | yes (0) | yes | 0 |
| consanguineousParents | child to the proband | 18 | 11 / 15 | 3 / 10 | no | 0 | yes (0) | yes | 0 |
| consanguineousParents | sibling to the proband | 18 | 9 / 13 | 1 / 7 | no | 0 | yes (0) | yes | 0 |
| consanguineousParents | spouse to the first female sibling | 18 | 11 / 15 | 3 / 10 | no | 0 | yes (0) | yes | 0 |

## Large families (frozen KI-3 fixtures, PCL level)

Previous drawing = the fixture’s fresh layout; one edit, drawn edit-locally. Readability: drawn (fresh layout of the edited graph).

| fixture | edit | level | moved / people | mean / max shift (px) | off-centre | crossings | long partner lines | side-hanging | line over another partner | invariant / readability violations | time edit (fresh) ms | reopen exact (ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ki3-p3-263 | child to proband | full | 169 / 263 | 75.1 / 139 | 23 (23) | 123 (123) | 7 (7) | 27 (27) | 1 (1) | 0 / 0 | 358 (179) | yes (13) |
| ki3-p3-263 | sibling to proband | wide | 260 / 263 | 31.9 / 1104 | 21 (23) | 118 (124) | 5 (7) | 27 (27) | 1 (1) | 0 / 0 | 89 (179) | yes (13) |
| ki3-p3-263 | spouse to mother | local | 235 / 263 | 119.6 / 573 | 23 (22) | 122 (121) | 7 (6) | 28 (27) | 1 (1) | 0 / 0 | 60 (179) | yes (13) |
| ki3-p4-387 | child to proband | full | 376 / 387 | 763.9 / 12424 | 31 (31) | 136 (136) | 6 (6) | 42 (42) | 3 (3) | 0 / 0 | 1744 (1651) | yes (19) |
| ki3-p4-387 | sibling to proband | full | 372 / 387 | 44.1 / 475 | 32 (32) | 134 (134) | 6 (6) | 44 (44) | 3 (3) | 0 / 0 | 2101 (1651) | yes (19) |
| ki3-p4-387 | spouse to mother | full | 372 / 387 | 45.5 / 543 | 32 (32) | 133 (133) | 6 (6) | 44 (44) | 3 (3) | 0 / 0 | 2056 (1651) | yes (19) |
| ki3-p5-474 | child to proband | local | 474 / 474 | 1366.3 / 3551 | 52 (34) | 276 (390) | 10 (8) | 57 (50) | 1 (1) | 0 / 0 | 2737 (2369) | yes (29) |
| ki3-p5-474 | sibling to proband | full | 471 / 474 | 97 / 8087 | 34 (34) | 388 (388) | 8 (8) | 50 (50) | 1 (1) | 0 / 0 | 1753 (2369) | yes (29) |
| ki3-p5-474 | spouse to mother | local | 469 / 474 | 691.9 / 1671 | 43 (34) | 330 (394) | 9 (10) | 52 (50) | 2 (2) | 0 / 0 | 2318 (2369) | yes (29) |
