# Layout stability (KI-2) — before

Commit: `cd77b59 (+ uncommitted src changes)` · Node v24.18.0 · 2026-10-18T11:11:26.936Z · 2 s

Method: src/audit/stabilityHarness.js — store-level, raw coordinates of what the clinician sees; "moved" = |Δx| > 2 px; transitions = applied (not refused) edits.

## Random edit populations

| population | transitions | parent flips / transitions with both parents | flip rate | moved fraction | edits with no movement | mean shift raw / aligned (px) | p90 max shift (px) |
|---|---|---|---|---|---|---|---|
| random-200x12 | 1582 | 171 / 1495 | 11.4 % | 55.3 % | 17.6 % | 68 / 60.6 | 314 |
| ki2-40x10 | 262 | 32 / 244 | 13.1 % | 56.9 % | 17.9 % | 70.7 / 62.3 | 300 |

## Targeted clinical edits

Affected block = edited person, their sibship (siblings must make room), their partners, new people.

| scenario | edit | people | moved outside block / outside | parent flip | sibling-order changes | undo exact (max px) | redo exact | save→load max px |
|---|---|---|---|---|---|---|---|---|
| starter | spouse+child to first male sibling | — | (not applicable) |||||| 
| starter | child to the proband | 7 | 0 / 6 | no | 0 | yes (0) | yes | 0 |
| starter | sibling to the proband | 7 | 0 / 6 | no | 0 | yes (0) | yes | 0 |
| starter | spouse to the first female sibling | — | (not applicable) |||||| 
| sibshipWithRelatives | spouse+child to first male sibling | 19 | 10 / 15 | no | 0 | yes (0) | yes | 0 |
| sibshipWithRelatives | child to the proband | 19 | 0 / 14 | no | 0 | yes (0) | yes | 0 |
| sibshipWithRelatives | sibling to the proband | 19 | 10 / 14 | no | 0 | yes (0) | yes | 0 |
| sibshipWithRelatives | spouse to the first female sibling | 19 | 10 / 15 | no | 0 | yes (0) | yes | 0 |
| consanguineousParents | spouse+child to first male sibling | 18 | 12 / 15 | no | 0 | yes (0) | yes | 0 |
| consanguineousParents | child to the proband | 18 | 12 / 15 | no | 0 | yes (0) | yes | 0 |
| consanguineousParents | sibling to the proband | 18 | 12 / 15 | no | 0 | yes (0) | yes | 0 |
| consanguineousParents | spouse to the first female sibling | 18 | 12 / 15 | no | 0 | yes (0) | yes | 0 |
