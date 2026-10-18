# Layout stability (KI-2) — before

Commit: `842958a (+ uncommitted src changes)` · Node v24.18.0 · 2026-10-18T11:54:06.850Z · 3 s

Method: src/audit/stabilityHarness.js — store-level, raw coordinates of what the clinician sees; "moved" = |Δx| or |Δy| > 2 px; transitions = applied (not refused) edits. "Row neighbours whose gap changed" = two people side by side on a row whose distance changed by more than 2 px (local rearrangement; a block sliding as a whole only changes the gaps at its edges).

## Random edit populations

A parent flip "after a grandparent union edit" happened in an edit that created, removed or re-partnered a union with one of the parents’ parents in it, or changed a parent’s own parent union (e.g. a union between two grandparents, which can force the grandparent couples and so the parents to trade sides); adding an uncle or aunt does not count. "For readability": every edit-local layout had more readability problems (line crossings + off-centre couples + long partner lines) than the fresh layout the store used instead. Every other flip is "unexplained". Relayout level: n/a = no edit-local relayout (fresh layout after every edit).

| population | transitions | parent flips / transitions with both parents | flip rate | flips: after a grandparent union edit / for readability / unexplained | moved fraction (of which vertical) | row neighbours whose gap changed | edits with no movement | mean shift raw / x-aligned (px) | p90 max shift (px) | relayout level per edit |
|---|---|---|---|---|---|---|---|---|---|---|
| random-200x12 | 1582 | 171 / 1495 | 11.4 % | 6 / 0 / 165 | 60.5 % (8.2 %) | 20.7 % | 11.4 % | 77.9 / 60.6 | 314 | n/a 1582 |
| ki2-40x10 | 262 | 32 / 244 | 13.1 % | 2 / 0 / 30 | 63.5 % (10.0 %) | 20.6 % | 11.5 % | 83.1 / 62.3 | 300 | n/a 262 |

### Readability cost of stability

After every edit, the drawing the store shows vs a fresh PCL layout of the same graph (summed over all edits; off-centre = couple more than half a slot from the centre of its children; crossings = line jumps; long partner line = partners more than 3 slots apart; side-hanging = the couple’s midpoint lies outside its children’s span, which every single child not exactly below its parents counts as).

| population | off-centre couples drawn / fresh | edits with more off-centre couples than fresh | line crossings drawn / fresh | edits with more crossings than fresh | long partner lines (> 3 slots) drawn / fresh | edits with more long partner lines than fresh | side-hanging sibship lines drawn / fresh |
|---|---|---|---|---|---|---|---|
| random-200x12 | 144 / 144 | 0 | 120 / 120 | 0 | 46 / 46 | 0 | 1801 / 1801 |
| ki2-40x10 | 18 / 18 | 0 | 8 / 8 | 0 | 2 / 2 | 0 | 270 / 270 |

## Targeted clinical edits

Affected block = edited person, new people, the edited person’s sibship (siblings may make room), their partners, and the parents of every new child. A family (couple, or sibship of 2+) counts as untouched when all its members are outside the block; it is reshaped when the spacing between its members changed by more than 2 px (moving as a unit does not count).

| scenario | edit | people | moved outside block / outside | untouched families reshaped / untouched families | parent flip | sibling-order changes | undo exact (max px) | redo exact | save→load max px |
|---|---|---|---|---|---|---|---|---|---|
| starter | spouse+child to first male sibling | — | (not applicable) ||||||| 
| starter | child to the proband | 7 | 0 / 6 | 0 / 3 | no | 0 | yes (0) | yes | 0 |
| starter | sibling to the proband | 7 | 0 / 4 | 0 / 2 | no | 0 | yes (0) | yes | 0 |
| starter | spouse to the first female sibling | — | (not applicable) ||||||| 
| sibshipWithRelatives | spouse+child to first male sibling | 19 | 10 / 15 | 2 / 9 | no | 0 | yes (0) | yes | 0 |
| sibshipWithRelatives | child to the proband | 19 | 0 / 14 | 0 / 9 | no | 0 | yes (0) | yes | 0 |
| sibshipWithRelatives | sibling to the proband | 19 | 8 / 12 | 0 / 6 | no | 0 | yes (0) | yes | 0 |
| sibshipWithRelatives | spouse to the first female sibling | 19 | 10 / 15 | 2 / 9 | no | 0 | yes (0) | yes | 0 |
| consanguineousParents | spouse+child to first male sibling | 18 | 12 / 15 | 3 / 10 | no | 0 | yes (0) | yes | 0 |
| consanguineousParents | child to the proband | 18 | 12 / 15 | 3 / 10 | no | 0 | yes (0) | yes | 0 |
| consanguineousParents | sibling to the proband | 18 | 10 / 13 | 1 / 7 | no | 0 | yes (0) | yes | 0 |
| consanguineousParents | spouse to the first female sibling | 18 | 12 / 15 | 3 / 10 | no | 0 | yes (0) | yes | 0 |
