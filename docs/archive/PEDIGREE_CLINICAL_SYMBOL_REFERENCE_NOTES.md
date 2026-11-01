# Pedigree Clinical Symbol Reference Notes

Status: reference notes only. No implementation obligations beyond what's already shipped.

Source: `/Users/mdkalenderoglu/Downloads/2018117135147.pdf` — "Pedigri Çizimi ve Pedigri Analizinde Temel Prensipler" (Dr. Şenol Çitli & Dr. Akif Ayaz, Tıbbi Genetik Derneği, 2016), an 8-page Turkish-language summary of the NSGC PSTF 2008 standardized pedigree nomenclature (Bennett, French, Resta & Doyle, *J Genet Counsel* 2008;17:424–433 — the same standard this codebase's existing comments already cite).

**Extraction note:** this environment has no `pdftotext`/`pdftoppm` (poppler-utils), which the `Read` tool needs for direct PDF rendering. Content below was recovered via a workaround — macOS `qlmanage -t` for page thumbnails (visual symbol table, pages 2–3) and Python `pypdf` for text extraction (all 8 pages) — not a first-attempt success. Flagging this so the review basis is clear: this is a real reading of the actual document, not a generic recollection of the PSTF standard from training knowledge, but it did require non-obvious tooling to get there.

---

## 1. Proband vs. consultand — the document draws these as TWO DISTINCT rows

Page 2, "Tablo 1" (Table 1):
- **"Genetik danışmanlık için başvuran birey"** (individual presenting for genetic counseling — i.e. the *consultand*): plain (unaffected-style) outline shape + arrow only. No "P" label.
- **"Proband"**: shape (affected-filled in the example shown) + arrow + a small **"P"** label next to the arrow.

**Current codebase status:** `PedigreeCanvas.jsx` draws only the proband arrow (`if (d.proband) ...`), unconditionally, with no "P" label, and has no separate consultand concept or flag at all. This confirms the gap already flagged in `PEDIGREE_V0_3A_1_DEFERRED_NOTES.md` §2 — the document makes explicit that proband and consultand are two different rows in the standard, not one. Still deferred (a new `Individual.consultand` field + a labeled "P" marker is v0.4/v0.5 work, not touched in this pass) — restated here with a firmer citation.

## 2. Pregnancy-outcome symbols — richer than what's currently modeled

Page 2, second table, "Terme ulaşmayan gebelikler" (pregnancies not reaching term):

| Term (Turkish, as printed) | Symbol shape | Affected column | Unaffected column |
|---|---|---|---|
| Spontan abortus (SAB) | small triangle | filled triangle, gestational week + condition text (e.g. "17 wks female cystic hygroma") | hollow triangle, gestational week only (e.g. "< 10 wks") |
| Gebeliğin sonlandırılması (TOP) | small triangle | filled triangle + week + karyotype (e.g. "18 wks, 47,XY,+18") | hollow triangle with an **X marked through it** — visually distinct from SAB's plain hollow triangle |
| Ektopik Gebelik (ECT) | **not a triangle at all** — a short diagonal double-slash mark labeled "ECT" | (single symbol shown, no affected/unaffected split in the source) | — |

Separately, "Ölü doğum" (stillbirth, page 2 first table): shape with a **diagonal slash** (not a full X) + "SB" label + gestational week (e.g. "SB 28 wk").

**Current codebase status:** `PedigreeCanvas.jsx` currently draws stillbirth as "small shape + full X cross," which does not match the document's single-diagonal-slash convention, and has no ECT (ectopic pregnancy) symbol or gestational-age annotation on any pregnancy-outcome symbol at all. This is consistent with, and sharpens, the gap already flagged in the earlier architecture review (gestational age annotation missing) and in `PEDIGREE_V0_3A_1_DEFERRED_NOTES.md`. Not implemented in this pass — noted for whichever future slice tackles pregnancy-outcome symbols, so that slice corrects the stillbirth cross to a single slash and adds ECT + gestational-age text rather than reinventing from memory.

## 3. Consanguinity — confirms the double-line standard exactly as implemented

Page 3, "Akrabalık" row: a square and circle connected by a plain **double horizontal line**, no further annotation shown in the reference example.

**Current codebase status:** matches — `consanguineousUnion` (known_supported) already renders as a double line. The v0.3a.2 relationshipBackground work in this same pass extended this correctly: `consanguinity_reported` (not yet structurally confirmed) also renders as a double line (amber/dashed, distinguishable from the resolved black double line), which is consistent with the document's principle that consanguinity is fundamentally a double-line relationship — the document's own single reference example doesn't need to show an "unresolved" variant since it's illustrating the confirmed case, but nothing in it contradicts also double-lining the reported-but-unconfirmed case with a distinct style.

## 4. Multiple pregnancy (twins/triplets) — confirms the tie-bar + zygosity model

Page 3, "Çoklu Gebelik" row — four columns:
- **Monozigotik** (MZ twins): two children's drop-lines meet at a shared apex point below the sibship rail, AND a **horizontal bar connects the two diagonal lines** partway down.
- **Dizigotik** (DZ twins): same shared-apex triangle shape, but **no horizontal bar**.
- **Zigositesi Bilinmeyen** (zygosity unknown): shared apex with a **"?" at the apex point itself** (not on the connecting bar).
- **Trizigotik** (triplets): same pattern extended to three children.

**Current codebase status:** no `MultipleGestation`/twin model exists yet (confirmed absent in this session's builder/store review). This matches the deferred status already recorded in `PEDIGREE_RELATIONSHIP_MODEL_SPEC.md` §6 and `PEDIGREE_V0_3A_1_DEFERRED_NOTES.md` §4 — still v0.5, not touched here. The document confirms the specific visual mechanism (shared apex + optional tie-bar) that spec already anticipated correctly.

## 5. Adoption — three distinct sub-cases, not just one

Page 3, "Evlat edinme" row — three side-by-side diagrams:
- **"in"** (adopted in): child shown in **brackets**, dashed line to the adoptive parent union.
- **"out"** (adopted out): child shown in brackets, solid line to the biological parent union (the child is drawn as having left that union — brackets mark the adoption fact regardless of direction).
- **"by relative"**: child in brackets, with **both** a solid line to one parent union and a dashed line to a different (relative) union — i.e., the one case in the standard that explicitly draws a child connected to two parent-figures at once.

**Current codebase status:** confirms the concern already raised in `PEDIGREE_RELATIONSHIP_MODEL_SPEC.md` §5 and `PEDIGREE_V0_3A_1_DEFERRED_NOTES.md` §3 — the "by relative" case is precisely the scenario that requires a child connected to two parent-unions simultaneously, which conflicts with this codebase's `childToUnionMap` single-parent-union invariant (CLAUDE.md non-negotiable #2). The document doesn't resolve that tension; it just confirms the clinical case exists. Reaffirms the existing decision: simple in/out adoption (one parent union, dashed-vs-solid line, a bracket marker) is a defensible v0.5 target; "by relative" (two simultaneous parent unions) remains explicitly out of scope until the one-parent-union invariant is deliberately redesigned and audited — do not implement it by quietly relaxing that invariant.

## 6. Carrier — confirms the centered-dot design already chosen for v0.3c

Page 3, second table, "Taşıyıcı (kalıtım biçimine bakılmaksızın hastalık yok)" (carrier, disease-free regardless of inheritance pattern): a **small filled dot centered inside an otherwise-unfilled shape**.

A second, distinct row — "Asemptomatik/presemptomatik taşıyıcı" (asymptomatic/presymptomatic carrier — currently unaffected but may show symptoms later): a **half-shaded shape** (vertical split, left half filled).

**Important nomenclature note for future v0.3b/v0.3c work:** the half-fill pattern in the actual PSTF standard is reserved specifically for *presymptomatic carrier* status — it is not a generic "2 conditions" partition slot. The v0.3a/v0.3b condition-encoding plan (`PEDIGREE_VISUAL_ENCODING_SPEC.md`) that assigns half-fill to "2 simultaneous conditions" is a deliberate simplification for this app's purposes (multi-disease marking, not a distinct standard-nomenclature meaning), not a literal reproduction of the standard's own half-fill semantics. This is worth flagging explicitly before v0.3b implements partitioned fills, since a clinician trained on the PSTF standard could misread this app's half-fill-for-2-conditions as "presymptomatic carrier" if the legend isn't unambiguous. Not a blocker, just a labeling-clarity risk to keep in mind — the mandatory-legend rule already established (`PEDIGREE_VISUAL_ENCODING_SPEC.md` §2.5) is the right mitigation, provided the legend explicitly disambiguates "multiple conditions" fills from carrier status.

**Current codebase status:** carrier centered-dot is designed (per the architecture-review pass earlier this session) but explicitly deferred as its own isolated v0.3c slice, not implemented in v0.3a/v0.3a.1/v0.3a.2. This document confirms that design choice was correct and should proceed unchanged when v0.3c is scheduled.

## 7. Multiple simultaneous conditions

Page 2, "Birden fazla hastalıkla etkilenmiş birey" (individual affected by more than one disease): shown as a **quarter/partitioned fill** (hatched left portion + solid right portion for the square example; a half-shaded + additional segment for the circle example) — consistent with, and directly supporting, the partitioned-fill approach already planned in `PEDIGREE_VISUAL_ENCODING_SPEC.md` for v0.3b (not implemented in this pass, per the explicit exclusion list).

## 8. Evaluation / study-result annotations (not modeled, likely out of scope)

Page 3's third table shows several annotation conventions this app does not model and which are arguably closer to genetic-test-result tracking than pure pedigree drawing: "Değerlendirme" (evaluation, `*` + footnote), "E+"/"E−" (positive/negative evaluation), "Eu" (uninformative study). These look adjacent to the genotype/counseling-report territory this project's CLAUDE.md explicitly excludes (HPO, genotype import, ACMG, counseling generation) — noted here only so a future contributor doesn't mistake them for missing pedigree-drawing symbols. Recommend continuing to treat these as out of scope.

## 9. Not reviewed / not relevant to symbol drawing

Pages 1 and 4–8 of the document cover general background (page 1), Mendelian inheritance-pattern teaching content for autosomal dominant/recessive, X-linked, and mitochondrial inheritance (pages 4–7, with example pedigree figures), and a references list (page 8). None of this is symbol-drawing reference material, and per CLAUDE.md / this task's explicit exclusions, none of it (inheritance-pattern prediction, counseling content) should be implemented in this application regardless.
