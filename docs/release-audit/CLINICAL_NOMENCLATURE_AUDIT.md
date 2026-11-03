# Clinical nomenclature audit

## Sources

- [B2008] Bennett RL et al. *Standardized human pedigree nomenclature: update and assessment of
  the recommendations of the NSGC.* J Genet Couns 2008;17:424–33, doi 10.1007/s10897-008-9169-9.
- [B2022] Bennett RL et al. *Practice resource-focused revision: standardized pedigree
  nomenclature update centered on sex and gender inclusivity.* J Genet Couns 2022;31:1238–48,
  doi 10.1002/jgc4.1621. Read for this audit: Box 1 and Figures 1–5, from the clinician's copy.
- [C2025] Steinhaus French S et al. Correction to [B2022]. J Genet Couns 2025, doi
  10.1002/jgc4.2020. It corrects the ECT slash and the assisted-reproduction Figure 5.
- Application decisions are logged in `docs/PEDITREE_CLINICAL_NOTATION_SPEC_V1.md` §8, each with
  its date. On 2026-11-02 the clinician set the principle: *follow the literature, so the paper
  need not justify deviations.*

## Status words

- **Conforms**: matches the source.
- **App decision**: a layout or presentation choice the source leaves open.
- **Deviation**: differs from the source; CLINICAL REVIEW REQUIRED.
- **Gap**: not implemented.

The "Test" column names the automated test that exercises the item.

## Matrix

| Item | Source rule | PediTree behaviour | Status | Test |
|---|---|---|---|---|
| Male / female / unknown | square / circle / diamond [B2008, B2022 Box 1] | `sex` → rect / circle / diamond | Conforms | `screen.test.js`, `acceptance` 1–12 |
| Gender identity vs sex assigned at birth | the symbol shows gender; AMAB / AFAB / UAAB written below; gender-diverse symbols [B2022 §4.1, Fig 1] | `sexAtBirth` AMAB / AFAB / UAAB written right under the symbol; the symbol is the gender (2026-11-02). Gender-diverse symbol variants beyond the diamond: not added | Conforms for the modifiers; diamond = unknown or non-binary | `screen.test.js` NSGC 2022 additions |
| Affected | filled symbol; several conditions = divided symbol plus key [B2022 Fig 2] | Full fill; several findings = quadrants with distinct fills, explained in the key | Conforms | `screen.test.js` "two findings…", `acceptance` 11 |
| Carrier | no dot; divided symbol with a fill defined in the key [B2022 §4.5] | Unnamed carrier: left half cross-hatched, key says "Carrier". Carrier of a named finding: half of that finding's fill | Conforms (dot removed 2026-11-02) | `screen.test.js` carrier test |
| Asymptomatic / presymptomatic carrier | vertical line in the symbol [B2022 Fig 2] | Vertical line, explained in the key; never with affected (2026-11-02) | Conforms | `screen.test.js` NSGC 2022 additions |
| Deceased | diagonal line; "d." with year or age [B2022 Box 1] | Diagonal line; "d.35", "d.3 ay" (EN "d.3 mo") | Conforms; age written without "y" (app decision 2026-10-25) | `acceptance`, `english.test.js` |
| Age line | age, can note b./d. year; order: age, evaluation results, pedigree number [B2022 Box 1 §5] | Age, then genetic-test lines, then label; the pedigree number sits at the symbol's upper corner (KI-4) | Conforms in order; number position is an app decision | `screen.test.js` |
| Proband | arrow + "P", always affected [B2022 Fig 2] | Arrow + "P"; "always affected" is **not enforced** (no-proband families and screening allowed, clinician 2026-11-01) | App decision, documented | `consultand.test.js` |
| Consultand | arrow without "P" [B2022 Fig 2] | Arrow without "P"; at most one; the same person as the proband → one arrow with "P" | Conforms | `screen.test.js` first test |
| Evaluation / test results | "E" eliminated; results listed below the symbol [B2022 §4.2] | "+" in the panel; the clinician's lines below the symbol; "tested" when no line is written | Conforms | `screen.test.js` genetic test |
| "Documented evaluation" asterisk | `*` [B2022 Fig 2] | Not available | Gap (minor) | — |
| Pregnancy (P) | diamond with P; LMP may be written below | Diamond with P, full size; LMP "SAT 03.05.2026" / "LMP …" below (2026-11-02) | Conforms | `acceptance` 8, `screen.test.js` |
| Spontaneous abortion (SAB) | small triangle [B2008, B2022 Fig 4] | Small triangle | Conforms | `acceptance` 8 |
| Termination (TOP) | small triangle with slash | Small triangle with slash, "TOP" below | Conforms | `acceptance` 8 |
| Ectopic (ECT) | triangle with slash and "ECT" [C2025 corrects B2022] | Slashed triangle, "ECT" below | Conforms (2026-11-02) | `screen.test.js` ECT |
| Stillbirth (SB) | full-size symbol, slash, "SB" + weeks | Full size, slash, "SB 28 hf" (EN "SB 28 wk") | Conforms | `acceptance` 8 |
| Pregnancy kinds kept apart | distinct types | Exactly one kind per pregnancy (`PREGNANCY_KIND_MULTIPLE`); no partner or children | Conforms | `acceptance` 8 |
| Relationship line | solid horizontal line [B2022 §4.2: stays solid] | Solid | Conforms | `screen.test.js` |
| Relationship ended | "a break in the relationship line" drawn as two short strokes "//" [B2022 Fig 3] | "//" on the visible line, beside the line of descent when there are children (2026-11-02) | Conforms | `screen.test.js` separated and divorced |
| Multiple partners | shown when relevant [B2022 Fig 3] | Any number; children belong to one union | Conforms | `acceptance` 6 |
| Consanguinity | double relationship line; degree stated if not obvious [B2022 Fig 3] | Double line. Degree and F are derived from drawn shared ancestors; a declared one without ancestors stays "reported" with a notice | Conforms; the degree text is in the panel, not above the line (app decision) | `acceptance` 3, 10; `screen.test.js` |
| Siblings in birth order | left to right, oldest first [B2022 Fig 3] | Explicit order or by age; losses keep their chronological place | Conforms | `pclLayout.test.js` |
| Twins MZ / DZ / unknown | apex; bar = MZ; "?" = unknown; no mark = DZ [B2022 Fig 3] | Same | Conforms | `acceptance` 7 |
| Triplets+ | one apex [B2022 Fig 3] | Same, up to any count | Conforms | `multiples.test.js` |
| No children by choice / infertility | one bar / two bars, reason below [B2022 Fig 3] | Same, reason below | Conforms | `screen.test.js` childless |
| Adoption (in / out / by relative) | brackets for every adoption; dashed line from adoptive parents, solid from biological [B2022 Fig 3] | Same; adopted-by-relative: solid line from the biological family, dashed from the relatives | Conforms | `acceptance` 5, `adoption.test.js` |
| Several individuals | number (or n) inside the symbol | Number or "n" inside; number and sex only | Conforms | `groups.test.js`, `acceptance` 12 |
| Assisted reproduction | D = donor, G = gestational carrier, surrogate D; no relationship line to the donor [C2025 Fig 5] | Same; donor beside the parent replaced; carried child under the carrier | Conforms (2026-11-01, per C2025) | `art.test.js`, `screen.test.js` ART |
| Key / legend | all clinical information needed to read the pedigree [B2022 Box 1 §3] | Name, proband's findings, every finding's fill, "Carrier" when used, numbered notes | Conforms | `screen.test.js` key |
| Clinical-pedigree header items | proband name, recorder, historian, date, indication, ancestry [B2022 Box 1 §4] | Only the patient's name and the print date | **Gap** (recorder, historian, indication, ancestry fields) | — |
| Same-sex / unknown-sex partners | allowed (Fig 5 shows same-sex couples with donor gametes) [B2022, C2025] | **Refused** (`UNION_PARTNER_SEX_CONFLICT`; product rule pending) | **Gap / deviation**, CLINICAL REVIEW REQUIRED | `dataIntegrityRegressions.test.js` |

## Rules that must not be broken: verified

Each was checked by an automated test that ran in this audit:

- Who is whose child, sibling or partner never changes on save, open, undo, redo or PED round
  trip (`acceptance` 1–12, `dataIntegrityRegressions.test.js`).
- Biological and adoptive links stay apart (`acceptance` 5).
- Consanguinity comes only from drawn shared ancestors (`acceptance` 3, 10; `kinshipCoefficient.test.js`).
- Proband and consultand persist across edits and files (`consultand.test.js`).
- Generations follow the topology (`node verify-generations.mjs`: 6/6 cases).
- The key matches the symbols used (`screen.test.js` key tests).

## Validation rules that may reject clinically valid families

The audit brief asks for these to be checked. Both are flagged; neither was changed:

- Same-sex couples and unknown-sex partners are refused. [B2022]/[C2025] show same-sex couples.
  This is a documented pending clinician decision (CLAUDE.md rule 8).
- Partners must be at most one generation apart (clinician 2026-10-24). This rarely matters
  clinically.

## Recommendations for the clinician

All require approval before implementation (notation spec rule 10):

1. ~~Relationship ended: change to "//"~~ — done 2026-11-02.
2. Decide on G-1 (gender identity with AMAB/AFAB/UAAB) and same-sex partners. Until then, state
   in Help / About that these are not supported.
3. ~~Presymptomatic carrier~~ — done 2026-11-02. The "documented evaluation" asterisk: still open.
4. English drawings: consider "35 y" / "d. 35 y" as in B2022 Fig 2. Turkish stays "35" by the
   2026-10-25 decision.
5. Optional header fields for clinical pedigrees: recorder, historian, date, indication.
