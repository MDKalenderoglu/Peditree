# v0.3a.4 — Deferred Items (Notes Only)

Status: planning note. v0.3a.4 focused on the user's stated #1 priority — layout correctness and unsafe-mutation blocking — plus the concrete workflow fixes (cross-generation spouse block, 4-person cap removal, internal-ID cleanup). The items below were requested in the v0.3a.4 brief but deliberately deferred this pass to keep the slice focused and honest; each is recorded here with its rationale and the safe path forward.

---

## 1. Pregnancy outcomes (SAB / TOP / ECT / current pregnancy) from the selected-person editor

**Not implemented this pass.** Today, spontaneous abortion (`pregnancyLoss`) and stillbirth (`stillbirth`) exist as individual fields and render as symbols, but they can only be created through the wizard's sibling/collateral child-count steppers, not added as a child of a *selected* union from the right editor. TOP (termination) and ECT (ectopic) are not modelled at all, and there is no gestational-age field.

**Why deferred:** this is additive symbol/model work (new fields + new symbols + a union-target picker when the selected individual has multiple unions), and the `örnek/` reference shows TOP/ECT/stillbirth each need distinct notation plus gestational-age annotation. Bundling it with the layout-stabilization work this pass would have diluted both. It is also lower-risk to add *after* the layout engine is trustworthy (new pregnancy symbols still route through ordinary union→child edges, so they will benefit from the layout rewrite rather than fighting the current engine).

**Safe path (v0.4/v0.5):** add `Individual.terminationOfPregnancy` + `Individual.ectopic` booleans (mutually exclusive with the existing loss/stillbirth flags — add a `validators.js` check), a `gestationalAge` field (non-negative, reuse `sanitizeAgeValue`), a selected-union "add pregnancy outcome" affordance with an explicit union picker when >1 union exists, and the corresponding symbols (single-slash stillbirth + "SB" + weeks; SAB triangle; TOP triangle-with-slash; ECT diagonal double-slash "ECT") per the reference table already documented in `PEDIGREE_CLINICAL_SYMBOL_REFERENCE_NOTES.md`.

## 2. Adoption

**Not implemented this pass; no model exists yet.** Confirmed by re-reading the builder and store — there is no `adoptedRelationship` / PCR `type` field.

**Why deferred:** the reference (`PEDIGREE_CLINICAL_SYMBOL_REFERENCE_NOTES.md` §5, `PEDIGREE_RELATIONSHIP_MODEL_SPEC.md` §5) shows three cases — adopted-in, adopted-out, and "by relative." Simple in/out adoption (brackets + dashed line, one parent union) is representable and safe; the "by relative" case requires a child connected to **two** parent unions simultaneously, which directly conflicts with the `childToUnionMap` single-parent-union invariant (CLAUDE.md non-negotiable #2). Implementing a half-model now risks a data shape that implies the invariant can be violated.

**Safe path (v0.5):** add `parentChildRelationship`-adjacent per-child adoption status (`biological | adopted_in | adopted_out | unknown`) driving a dashed-vs-solid `childStem` stroke + bracket marker for simple in/out adoption ONLY. "By relative" (dual parent sets) stays out of scope until the one-parent-union invariant is deliberately redesigned and audited — do not fake it by relaxing the invariant. This matches the decision already recorded in `PEDIGREE_V0_3A_1_DEFERRED_NOTES.md` §3.

## 3. Multiple-condition UI clarity + legend

**Partially present, not re-worked this pass.** The `conditions[]` model, per-condition status, the repeatable conditions editor, and the auto-legend all exist (v0.3a). The v0.3a.4 brief asks to make the `Affected` (generic solid fill) vs `Conditions[]` (named phenotypes for the legend) distinction *clinically clearer* in the editor.

**Why deferred:** this is UI-copy/layout polish, lower risk and lower priority than the layout-correctness work that was the user's explicit focus. The functional independence is already correct and tested (affected ⟂ conditions ⟂ proband).

**Safe path (small, any slice):** add a one-line helper caption under each control in `IndividualEditor.jsx` — "Etkilenmiş: genel dolgu" vs "Durumlar: adlandırılmış tanılar (lejantta gösterilir)" — and group them visually. Partitioned fills (v0.3b) remain gated behind the layout-engine fix, as the brief itself states.

## 4. Full layout-engine rewrite

Deferred with a dedicated plan: see `PEDIGREE_LAYOUT_ENGINE_REDESIGN_PLAN.md`. v0.3a.4 shipped the detection + rollback safety net so the user cannot create a collapsed pedigree through relationship actions, while the real hierarchical-layout rewrite is scheduled as v0.4a–v0.4c.
