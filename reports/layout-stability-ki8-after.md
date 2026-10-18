# Layout stability (KI-2) — ki8-after

Commit: `781607b` · Node v24.18.0 · 2026-10-18T22:15:07.941Z · 28 s

Method: src/audit/stabilityHarness.js — store-level, raw coordinates of what the clinician sees; "moved" = |Δx| or |Δy| > 2 px; transitions = applied (not refused) edits. "Row neighbours whose gap changed" = two people side by side on a row whose distance changed by more than 2 px (local rearrangement; a block sliding as a whole only changes the gaps at its edges).

## Random edit populations

A parent flip "after a grandparent union edit" happened in an edit that created, removed or re-partnered a union with one of the parents’ parents in it, or changed a parent’s own parent union (e.g. a union between two grandparents, which can force the grandparent couples and so the parents to trade sides); adding an uncle or aunt does not count. "For readability": every edit-local layout had more readability problems (line crossings + off-centre couples + long partner lines) than the fresh layout the store used instead. Every other flip is "unexplained". Relayout level: n/a = no edit-local relayout (fresh layout after every edit).

| population | transitions | parent flips / transitions with both parents | flip rate | flips: after a grandparent union edit / for readability / unexplained | moved fraction (of which vertical) | row neighbours whose gap changed | edits with no movement | mean shift raw / x-aligned (px) | p90 / max of the largest shift per edit (px) | relayout level per edit |
|---|---|---|---|---|---|---|---|---|---|---|
| random-200x12 | 1582 | 9 / 1495 | 0.6 % | 4 / 5 / 0 | 36.5 % (1.0 %) | 19.1 % | 14.2 % | 21.2 / 26.7 | 133 / 1676 | local 1481, frozen 60, wide 25, full 16 |
| ki2-40x10 | 262 | 1 / 244 | 0.4 % | 1 / 0 / 0 | 36.3 % (0.3 %) | 19.2 % | 16.8 % | 16.5 / 21.8 | 107 / 334 | local 247, frozen 11, wide 3, full 1 |

### Readability cost of stability

After every edit, the drawing the store shows vs a fresh PCL layout of the same graph (summed over all edits; off-centre = couple more than half a slot from the centre of its children; crossings = line jumps; long partner line = partners more than 3 slots apart; side-hanging = the couple’s midpoint lies outside its children’s span, which every single child not exactly below its parents counts as).

| population | off-centre couples drawn / fresh | edits with more off-centre couples than fresh | line crossings drawn / fresh | edits with more crossings than fresh | long partner lines (> 3 slots) drawn / fresh | edits with more long partner lines than fresh | side-hanging sibship lines drawn / fresh | partnership line over another partner (KI-8) drawn / fresh |
|---|---|---|---|---|---|---|---|---|
| random-200x12 | 88 / 117 | 9 | 22 / 26 | 3 | 7 / 8 | 2 | 2331 / 1789 | 8 / 8 |
| ki2-40x10 | 4 / 6 | 0 | 0 / 0 | 0 | 0 / 0 | 0 | 353 / 269 | 0 / 0 |

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
| ki3-p3-263 | child to proband | local | 255 / 263 | 156.4 / 550 | 19 (19) | 43 (43) | 3 (3) | 27 (26) | 0 (0) | 0 / 0 | 61 (174) | yes (13) |
| ki3-p3-263 | sibling to proband | local | 257 / 263 | 287.5 / 474 | 18 (21) | 43 (72) | 4 (5) | 27 (28) | 0 (0) | 0 / 0 | 287 (174) | yes (13) |
| ki3-p3-263 | spouse to mother | full | 165 / 263 | 92.1 / 176 | 19 (19) | 43 (43) | 4 (4) | 26 (26) | 0 (0) | 0 / 0 | 284 (174) | yes (13) |
| ki3-p4-387 | child to proband | full | 371 / 387 | 755.7 / 12367 | 32 (32) | 127 (127) | 4 (4) | 43 (43) | 1 (1) | 0 / 0 | 1924 (1655) | yes (21) |
| ki3-p4-387 | sibling to proband | full | 347 / 387 | 43.6 / 206 | 32 (32) | 124 (124) | 4 (4) | 45 (45) | 1 (1) | 0 / 0 | 1597 (1655) | yes (21) |
| ki3-p4-387 | spouse to mother | local | 381 / 387 | 436.1 / 1047 | 34 (31) | 119 (123) | 4 (5) | 46 (44) | 1 (1) | 0 / 0 | 2250 (1655) | yes (21) |
| ki3-p5-474 | child to proband | local | 474 / 474 | 808.4 / 4089 | 45 (31) | 211 (367) | 10 (12) | 53 (49) | 0 (0) | 0 / 0 | 2945 (1447) | yes (29) |
| ki3-p5-474 | sibling to proband | local | 442 / 474 | 816.2 / 1807 | 36 (32) | 267 (327) | 9 (8) | 50 (48) | 0 (0) | 0 / 0 | 1773 (1447) | yes (29) |
| ki3-p5-474 | spouse to mother | local | 381 / 474 | 614.7 / 1343 | 37 (35) | 267 (326) | 9 (11) | 51 (52) | 0 (0) | 0 / 0 | 2021 (1447) | yes (29) |
