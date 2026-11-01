# Proposed Clinical-Grade Data Model

Companion to `AUDIT_PEDIGREE_APP.md` (§E, K) and `PEDIGREE_ARCHITECTURE_DECISION.md`. This proposal is **additive**: every field currently produced by `pedigreeBuilderFromWizard.js` stays; nothing here requires renaming or removing an existing field. The goal is that the current builder's output is already a valid (if minimal) instance of the types below, so migration is "add fields as they're populated," not "rewrite the builder."

TypeScript is used for precision even though the codebase is currently plain JS — per `CLAUDE.md`'s refactor rules, adopting these as JSDoc `@typedef`s or a runtime Zod schema is equally valid; the shapes are what matter, not the language.

---

## Design principles

1. **Every clinically asserted fact carries provenance.** Nothing is just `true`/`false` — anything a clinician asserts about a person (affected status, deceased, a genotype) records *how confident* and *from where* that assertion comes.
2. **Genotype is a first-class entity, not a string field on `Individual`.** A `Variant` is defined once and referenced by ID from every individual who was tested for it — this is what makes segregation analysis ("is this genotype pattern consistent with the pedigree topology") possible at all.
3. **The existing symbolic ID scheme is preserved for wizard-built nodes.** `CLAUDE.md` is explicit that this is intentional; nothing here proposes switching to UUIDs for the builder path.
4. **Backward-compatible:** the current `Individual` fields (`sex`, `age`, `generation`, `relation`, `label`, `displayLabel`, `affected`, `carrier`, `deceased`, `proband`, `pregnancyLoss`, `stillbirth`, `notes`, `condition`, `ageAtDeath`, `causeOfDeath`, `x`, `y`) all remain, unchanged in meaning.

---

## Core types

```typescript
type ID = string; // deterministic symbolic ID for wizard-built nodes (existing scheme), UUID acceptable for externally-imported records

type Sex = 'male' | 'female' | 'unknown';

/** Provenance/confidence attached to any clinically asserted fact. */
type Certainty = 'confirmed' | 'reported' | 'suspected' | 'unknown';

type Source =
  | 'clinical_exam'
  | 'lab_report'
  | 'medical_record'
  | 'family_history'   // secondhand, from patient/relative interview
  | 'imported'          // e.g. from an external FHIR/PED source
  | 'unknown';

/** A single provenance-tagged assertion — reused wherever a clinical fact needs a "how do we know this" answer. */
interface Assertion<T> {
  value: T;
  certainty: Certainty;
  source: Source;
  recordedAt?: string;   // ISO date
  recordedBy?: string;   // clinician identifier, free text acceptable initially
}
```

---

## Individual

```typescript
interface Individual {
  // ── Identity (existing fields, unchanged) ──
  id: ID;
  sex: Sex;
  age?: string;
  generation: number;
  relation: RelationType;      // see vocabulary below — replaces uncontrolled string enum
  label: string;
  displayLabel?: string;

  // ── Vital status (existing fields, unchanged) ──
  deceased: boolean;
  ageAtDeath?: string;
  causeOfDeath?: string;

  // ── Pregnancy outcome (existing fields, unchanged; see PregnancyOutcome below for the richer replacement) ──
  pregnancyLoss: boolean;
  stillbirth: boolean;
  pregnancyOutcome?: PregnancyOutcome;   // NEW — optional richer detail, booleans above remain authoritative for rendering

  // ── Proband ──
  proband: boolean;                      // existing; now enforced unique by graphIntegrity CHECK 11

  // ── Clinical status (existing booleans kept as fast-path render flags; new Assertion form added alongside) ──
  affected: boolean;                      // existing — kept for renderer compatibility
  affectedStatus?: Assertion<boolean>;    // NEW — provenance for the above
  carrier: boolean;                       // existing
  carrierStatus?: Assertion<boolean>;     // NEW

  // ── Free-text (existing, unchanged) ──
  condition?: string;   // kept for backward compat; superseded by `phenotypes` below going forward
  notes?: string;

  // ── NEW: structured clinical annotation ──
  phenotypes?: PhenotypeAnnotation[];
  genotypes?: GenotypeAnnotation[];
  clinicalNotes?: ClinicalNote[];         // structured replacement for the free-text `notes`, additive

  // ── NEW: relationship qualifiers ──
  adopted?: 'in' | 'out' | null;          // adoption status, absent = biological (default)
  twinGroupId?: ID | null;                // see TwinRelationship below

  // ── Layout (existing, unchanged — appended only by computePedigreeLayout) ──
  x?: number;
  y?: number;
}
```

### RelationType (replaces the ~25 hardcoded strings in the builder)

```typescript
type RelationType =
  | 'proband' | 'mother' | 'father' | 'sibling'
  | 'half_sibling_maternal' | 'half_sibling_paternal'
  | 'maternal_gf' | 'maternal_gm' | 'paternal_gf' | 'paternal_gm'
  | 'maternal_uncle' | 'maternal_aunt' | 'paternal_uncle' | 'paternal_aunt'
  | 'spouse' | 'cousin' | 'child' | 'ancestor' | 'other';
```

This directly resolves audit finding D.10: a controlled vocabulary is a precondition for any FHIR `FamilyMemberHistory.relationship` coding-system mapping, and for a computed relationship-degree function (needed for inheritance reasoning, audit §J). The existing Turkish display labels (`Dayı`, `Teyze`, `Amca`, `Hala`, etc.) move to `label`/`displayLabel`, which is exactly what they already are — this is a rename of what `relation` is allowed to contain, not a new field.

---

## PregnancyOutcome (structured replacement path for pregnancyLoss/stillbirth booleans)

```typescript
interface PregnancyOutcome {
  type: 'live_birth' | 'spontaneous_loss' | 'stillbirth' | 'termination' | 'ectopic';
  gestationalAgeWeeks?: number;
  karyotype?: string;         // e.g. "46,XY", "trisomy 21" — free text acceptable initially
  recordedAt?: string;
}
```

This is the direct fix for audit finding D.1 (no representation for termination of pregnancy) — a third, distinct type alongside the two the app already has, plus room for the gestational/karyotype detail that miscarriage-recurrence counseling actually needs. `pregnancyLoss`/`stillbirth` booleans stay as the fast render-path flags derived from `type`; nothing downstream (renderer, layout) needs to change to adopt this incrementally.

---

## TwinRelationship (currently absent entirely — audit D.2)

```typescript
interface TwinRelationship {
  id: ID;
  memberIds: [ID, ID, ...ID[]];              // supports twins, triplets, etc.
  zygosity: 'monozygotic' | 'dizygotic' | 'unknown';
}
```

Referenced from each member `Individual.twinGroupId`. Rendering support (the standard diagonal line from a shared point on the sibship rail to each twin symbol, solid for MZ / open for DZ) is a `PedigreeCanvas.jsx` addition once this exists — it does not require any change to the graph/builder/layout contract beyond adding this one array to the top-level graph object, parallel to `unions`/`parentChildRelationships`.

---

## Union (mostly unchanged; consanguinity gets a required backing reference)

```typescript
interface Union {
  id: ID;
  partners: [ID, ID];               // existing — exactly two, enforced by CHECK 4
  status: 'together' | 'separated' | 'divorced' | 'unknown';

  consanguineous: boolean;          // existing
  consanguinityDegree?: string;     // existing
  consanguinityPath?: ConsanguinityPath;   // NEW — replaces the current loose string with a structured, verifiable reference
}

/**
 * Direct fix for audit C.6/D.4: a union may only be flagged `consanguineous: true`
 * if it is backed by an actual traceable shared-ancestor structure. If the path is
 * unresolved, the union must use `status: 'declared_unverified'`, not `consanguineous: true`,
 * so the renderer can draw a visually distinct marker instead of a standard double line.
 */
type ConsanguinityPath =
  | { status: 'resolved'; sharedAncestorUnionIds: ID[]; degree: string }
  | { status: 'declared_unverified'; degree?: string };  // "consanguinity was declared but no ancestry path exists in the graph"
```

---

## ParentChildRelationship (unchanged)

No changes proposed — the union-keyed `{ unionId, children: ID[] }` shape is correct and should not become per-child (see audit §E, "correct modeling choice").

---

## SiblingGroup (currently implicit only — audit §E)

```typescript
interface SiblingGroup {
  unionId: ID;                 // 1:1 with ParentChildRelationship.unionId
  note?: string;               // e.g. "confirmed same biological father for all three, per maternal report"
  certainty?: Certainty;
}
```

Optional, additive — a place to attach sibship-level qualifiers that don't belong to any one child (e.g., "all full siblings, confirmed by maternal testimony" vs. "paternity of the youngest is uncertain").

---

## PhenotypeAnnotation (currently absent — audit E, K)

```typescript
interface PhenotypeAnnotation {
  id: ID;
  hpoId?: string;               // e.g. "HP:0001250" (seizures) — optional, free-text `label` always required
  label: string;                // human-readable phenotype description
  onsetAge?: string;
  certainty: Certainty;
  source: Source;
  notes?: string;
}
```

## GenotypeAnnotation (currently absent — audit E, J, K)

```typescript
interface Variant {
  id: ID;
  gene: string;                 // HGNC symbol, e.g. "CFTR"
  hgvsC?: string;                // c. notation
  hgvsP?: string;                // p. notation
  acmgClassification?: 'pathogenic' | 'likely_pathogenic' | 'VUS' | 'likely_benign' | 'benign' | 'not_classified';
}

interface GenotypeAnnotation {
  id: ID;
  variantId: ID;                 // references Variant.id — same variant referenced across multiple individuals
  zygosity: 'homozygous' | 'heterozygous' | 'hemizygous' | 'wild_type' | 'not_tested';
  testMethod?: string;           // e.g. "targeted sequencing", "karyotype", "exome"
  testDate?: string;
  certainty: Certainty;
  source: Source;
}
```

`Variant` is a top-level collection (parallel to `individuals`/`unions`), referenced by ID from each `GenotypeAnnotation` — this is the specific structural requirement identified in audit §K ("a way to recognize these three people were tested for the *same* variant") and is what makes segregation-consistency checking implementable at all.

## ClinicalNote (structured alternative to the free-text `notes` string)

```typescript
interface ClinicalNote {
  id: ID;
  text: string;
  certainty?: Certainty;
  source?: Source;
  recordedAt?: string;
  recordedBy?: string;
}
```

---

## Top-level graph / pedigree document

```typescript
interface PedigreeDocument {
  schemaVersion: string;          // e.g. "1.0" — absent today; required for any future migration
  metadata: ExportMetadata;       // NEW — currently absent entirely (audit §E)

  individuals: Individual[];
  unions: Union[];
  parentChildRelationships: ParentChildRelationship[];
  siblingGroups?: SiblingGroup[];       // NEW, optional
  twinRelationships?: TwinRelationship[]; // NEW, optional
  variants?: Variant[];                  // NEW, optional — populated once genotype data exists

  // Derived, not stored (existing behavior, unchanged):
  // nodes, edges — produced by computePedigreeLayout(), never persisted as source of truth.
}

interface ExportMetadata {
  createdAt: string;
  updatedAt: string;
  clinicianId?: string;
  patientReference?: string;     // MRN or equivalent — deliberately NOT the patient's name, to keep the pedigree file itself lower-sensitivity
  institution?: string;
  notes?: string;
}
```

`schemaVersion` and `metadata` cost almost nothing to add now and prevent a much more painful migration later once real pedigree files exist in the wild (once persistence — audit L.2 — ships, files will exist that need to remain loadable after the schema changes again).

---

## Migration path (concrete, not hypothetical)

1. Add `schemaVersion: "1.0"` and `metadata` to the top-level document produced by `usePedigreeStore.js` — no builder changes needed, this wraps the existing output.
2. Add the `RelationType` enum and update `pedigreeBuilderFromWizard.js`'s ~25 literal `relation:` strings to use it — pure rename, verified by the existing test suite's assertions on `relation` values (grep shows the tests check specific relation strings; the enum should be a superset, chosen to not break those assertions).
3. Add `ConsanguinityPath` and change the single line in `pedigreeBuilderFromWizard.js` (stage 2, `isParentsConsang`) that currently sets `consanguineous: true` unconditionally — this is also the fix for audit finding C.6, so it should happen together with this schema change, not separately.
4. Add `PregnancyOutcome`, `TwinRelationship`, `PhenotypeAnnotation`, `GenotypeAnnotation`, `Variant`, `ClinicalNote` as opt-in fields/collections — zero impact on existing code paths until the UI to populate them is built (roadmap week 2).
5. Only after step 4 lands: begin the relationship-degree function and any inheritance-reasoning groundwork (audit §J), now that there is real data for it to operate on.
