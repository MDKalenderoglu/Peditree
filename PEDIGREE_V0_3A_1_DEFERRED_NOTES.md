# v0.3a.1 — Deferred Items (Notes Only, No Implementation)

Status: planning note. No code in this file's scope was implemented as part of v0.3a.1.

---

## 1. Free-text Turkish kinship/consanguinity parser (deferred)

**User need:** parse relationship descriptions like `probandın annesinin baba tarafından dedesinin amca oğlu` or `probandın babasının anne tarafından 2. derece kuzeni kardeşi` into a structural relationship in the graph.

**Not implemented in v0.3a.1, and no UI field was added for it either** — even a passive, non-destructive text field was judged out of scope for this hotfix slice, to keep the PR focused on the selected-person workflow and consanguinity-rendering fixes. This is a deliberate scope decision, not an oversight.

**Deferred architecture plan, for v0.4+:**

1. **Parsing stage is separate from graph mutation.** A parser module (`src/utils/kinshipParser.js`, pure, no store/DOM dependency) takes a free-text string + an anchor individual ID (usually the proband) and returns a *proposed relationship path* — a structured, human-readable sequence of graph operations (e.g. "add paternal grandfather → add grandfather's brother → mark as uncle-once-removed of proband"), not a mutated graph.
2. **Confirmation-based, never automatic.** The proposed path is rendered as a preview (a short list of the individuals/unions it would create, in the same style as the existing "Doğrudan Eklenenler" list in `IndividualEditor.jsx`) and the clinician must explicitly confirm before anything is written to `wizardData`. This mirrors the pattern already established by `IndividualEditor.jsx`'s destructive-action confirmations (delete) and the wizard's own consanguinity-degree pickers, which never silently assume a structure the user didn't explicitly select.
3. **No inference beyond what the text names.** The parser must not infer a consanguinity degree, shared ancestor, or additional relatives beyond what the input string explicitly describes. A path involving "2. derece kuzen" should require the same explicit shared-ancestor construction the wizard's own first/second-cousin template already uses (see `pedigreeBuilderFromWizard.js` stage 7) — never a `reported_unresolved` shortcut dressed up as parsed certainty.
4. **Turkish kinship term coverage is a lookup table, not a general NLP model.** Given the constrained vocabulary (anne/baba/dede/nine/amca/hala/dayı/teyze/kuzen + "taraf"/"derece" modifiers), a hand-maintained grammar/lookup table is more auditable and testable than a general-purpose parser, and keeps failure modes explicit ("bu ifade tanınmadı" / "not recognized") rather than silent misparses.
5. **Ambiguous or unparseable input must produce a clear "not understood" result, never a best-effort guess.** A wrong best-effort structural guess in a clinical pedigree is worse than a clear "couldn't parse this, please build it manually" message.
6. **Where the entry field would live:** a single free-text input in `IndividualEditor.jsx`, scoped to the selected individual, storing the raw text as a plain reported-relationship note (e.g. `Individual.reportedRelationshipNote: string`) until the parser exists — this note itself is safe to add in a later slice since it's inert (display-only, like the existing `notes` field) and doesn't touch the graph.

## 2. Consultand vs. proband distinction (note only)

The v0.3a.1 spec asked to preserve a separate `consultand` field if one already exists. **It does not exist in this codebase** — only `Individual.proband: true/false` exists today, and the arrow drawn in `PedigreeCanvas.jsx` is unconditionally tied to that one flag.

Per PSTF nomenclature, "proband" (index case, arrow + P) and "consultand" (person presenting for counseling, arrow only, may or may not be affected or even related by blood to the proband) are related but distinct concepts, and a pedigree can have a consultand who is not the proband (e.g. an unaffected parent seeking counseling about a affected child's diagnosis).

**No model change was made for this in v0.3a.1** — introducing `Individual.consultand` would touch the same arrow-rendering code path in `PedigreeCanvas.jsx` this hotfix already touches for unrelated reasons (proband-independent-of-loss-status), and CLAUDE.md's "one concern per slice" principle argues against bundling a new clinical field into this pass. **Documented here as a v0.4/v0.5 model need**: add `Individual.consultand: boolean`, independent of both `proband` and `affected` (same independence rule as R1.1-R1.4 in `PEDIGREE_COMPLEXITY_REQUIREMENTS.md`), with its own arrow-only marker distinguishable from the proband's arrow+P.

## 3. Adoption (note only)

No `adoptedRelationship` field exists in the current data model (confirmed by re-reading `src/builder/pedigreeBuilderFromWizard.js` and `src/state/usePedigreeStore.js` during this pass) — so there was no existing "simple adopted flag" to expose/edit in v0.3a.1. This remains exactly as scoped in `PEDIGREE_RELATIONSHIP_MODEL_SPEC.md` §5: a v0.5 item, and a union with both biological and adoptive parent sets drawn remains out of scope until the one-parent-union invariant (`childToUnionMap`, CLAUDE.md non-negotiable #2) is deliberately redesigned and audited.

## 4. Twin/triplet rendering (note only)

Not touched in v0.3a.1, per the task's absolute exclusions. Remains scoped to v0.5 per `PEDIGREE_RELATIONSHIP_MODEL_SPEC.md` §6 and `PEDIGREE_NEXT_IMPLEMENTATION_PLAN.md`.
