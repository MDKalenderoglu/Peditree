# Pedigree Visual Encoding Spec

Status: planning document. No code changes in this pass.
Grounds itself in the current renderer, `src/components/PedigreeCanvas.jsx` (SVG/D3), and layout output from `src/utils/pedigreeLayout.js`.

## 1. What exists today (baseline)

From `PedigreeCanvas.jsx`:

| Element | Current encoding |
|---|---|
| Sex | male = square, female = circle, unknown = diamond |
| Affected | full solid fill (`fill = NODE_STROKE`, i.e. black) |
| Carrier | left/right half fill via `url(#carrier-half)` pattern (vertical split, left half black / right half white) |
| Deceased | diagonal slash through the symbol (45°, drawn *outside* the symbol bounds at `sz+4`) |
| Pregnancy loss | small filled or hollow triangle, `LOSS_SIZE = 14` |
| Stillbirth | small shape + full X cross through it |
| Proband | small arrow annotation at lower-left, independent of fill |
| Selection | blue stroke override (`#3b82f6`), UI-only, not a clinical symbol |
| Condition | free-text italic line under the node (not a fill) |
| Notes | numbered bracket reference `[n]` under the node, keyed into a bottom-left legend |

**Key conflict to resolve:** the issue asks for "half fill" and "quarter fill" to represent *multiple conditions*. But half-fill is already claimed by the **carrier** state in this codebase, per standard pedigree nomenclature (Bennett et al., PSTF 2008 update) where carrier status is conventionally shown as a **small filled dot centered inside an otherwise-unfilled symbol**, not a half-shaded shape. The current `carrier-half` implementation is a simplification that will collide with the new multi-condition half/quarter fill if left as-is.

**Design decision:** migrate carrier rendering from half-fill to a **centered dot** (small filled circle, ~20% of node radius, centered in an unfilled or partially-filled symbol). This frees up half/quarter-fill *exclusively* for multi-condition encoding and matches the standard more closely. This is a breaking visual change for `carrier: true` individuals and must be called out explicitly in the v0.3 PR description (see `PEDIGREE_NEXT_IMPLEMENTATION_PLAN.md`).

## 2. Multi-condition fill strategy

### 2.1 Condition registry

A pedigree-level list, not per-individual:

```js
ConditionRegistry: [
  { id: 'cond_1', label: 'Nörogelişimsel bozukluk', patternIndex: 0 },
  { id: 'cond_2', label: 'Kanser', patternIndex: 1 },
]
```

`patternIndex` selects from a fixed palette of fill textures (not colors — see §2.4 on why texture over color). The registry is derived automatically from the union of all `individual.conditions[].label` the first time a label is seen, in insertion order, so the user never manually manages a separate registry UI in v1 — it is a computed index, persisted only so pattern assignment is stable across a session (re-deriving fresh on every render would reassign pattern 0 to whichever condition happens to be filtered first, which is not stable if conditions are removed).

### 2.2 Per-individual conditions

```js
Individual.conditions: [
  { conditionId: 'cond_1', status: 'affected' },  // or 'carrier', 'unknown'
]
```

Distinct from `affected`/`carrier` booleans, which remain as backward-compatible "at least one condition, unspecified which" flags (§4 covers interaction).

### 2.3 Fill geometry by condition count

Applies inside the existing node shape (square/circle/diamond) — the *outline* shape continues to encode sex, unaffected by this spec.

| Count | Geometry | Rule |
|---|---|---|
| 0 | No fill (white/`NODE_FILL`) | unaffected, no conditions |
| 1 | Full fill | single condition's pattern fills 100% of the shape |
| 2 | Half fill (vertical split) | left half = condition A pattern, right half = condition B pattern |
| 3 | Third fill OR forced quarter (see below) | PSTF-style: three conditions split as three unequal wedges is non-standard for square/rect shapes; simplest consistent rule for this app: treat 3 conditions as a quarter layout with the 4th quadrant left blank |
| 4 | Quarter fill (2x2 grid) | top-left/top-right/bottom-left/bottom-right, one condition per quadrant, assigned in the order they appear in `individual.conditions` |
| 5+ | Cap at 4 drawn quadrants + numbered legend overflow marker | **[V2, stretch]** — draw the 4 most clinically relevant (first 4 in array) and append a small `+n` superscript-style tag referencing the legend for the rest, rather than inventing finer geometric subdivisions that become illegible at `NODE_SIZE = 40` |

Quadrant/half boundaries are drawn with a thin (`0.75px`) internal divider line in `NODE_STROKE` so adjacent same-pattern fills remain visually separable, matching how the existing carrier-half pattern already has an implicit boundary at x=0.5.

### 2.4 Pattern, not color, as the primary channel

Colors are avoided as the *primary* differentiator between conditions for two reasons specific to this app: (1) deceased/carrier/proband markers already use only black/white/one accent color (`#d97706` amber for unresolved consanguinity, `#ef4444` red for the notes-index tag) and introducing arbitrary per-condition hues risks visual collision with those existing semantic colors; (2) printed/exported pedigrees (`exportUtils.js` produces static SVG/PNG) must remain legible in grayscale for chart-in-paper-record use, which is a real clinical workflow constraint for this domain even though the app doesn't say so explicitly elsewhere in code — grayscale-safety is the more conservative default.

Fill pattern palette (SVG `<pattern>` defs, following the existing `carrier-half` def style in `PedigreeCanvas.jsx`):

| patternIndex | Pattern | SVG technique |
|---|---|---|
| 0 | Solid black | plain `fill: NODE_STROKE` |
| 1 | Diagonal hatch (45°) | `<pattern>` with repeated diagonal `<line>` |
| 2 | Cross-hatch | `<pattern>` with two perpendicular line sets |
| 3 | Dot/stipple | `<pattern>` with repeated small `<circle>` |
| 4+ | **[V2]** additional hatch angles/densities | only needed once >4 simultaneous conditions across a single pedigree is observed in practice |

A single subtle accent color per pattern (not per condition) may be layered *on top of* the grayscale pattern for on-screen use only, stripped for print/export — this is explicitly deferred to v0.4+ and not required for the v0.3 slice.

### 2.5 Legend requirements

- Renders automatically whenever `conditions.length > 0` for any individual in the graph (parallel to the existing "Klinik Notlar" legend trigger condition in `PedigreeCanvas.jsx` — reuse the same bottom-left legend area rather than adding a second competing legend box).
- One row per registry entry: pattern swatch (small filled square sample of the pattern) + condition label.
- If overflow (§2.3, 5+ conditions) triggers the `+n` marker, the legend must also list the overflowed conditions by the same numbered scheme used for the existing notes-index brackets, disambiguated by a different bracket style (e.g. `{n}` for conditions vs `[n]` for notes) so the two independent numbering schemes never look interchangeable.

## 3. Interaction between proband arrow, deceased slash, carrier dot, and multi-condition fill

These four are visually independent layers and must never be mutually exclusive:

1. **Fill** (innermost) — driven by `conditions` (§2), or legacy `affected`/`carrier` boolean fallback (§4).
2. **Carrier dot** (drawn on top of fill, centered) — independent boolean, can co-occur with a fill (e.g. affected by condition A *and* a carrier for a second, unrelated condition — draw both the quadrant fill and the centered dot).
3. **Deceased slash** (drawn outside the shape bounds, diagonal) — already independent in current code; unaffected by this spec.
4. **Proband arrow** (drawn outside the shape bounds, lower-left) — already independent in current code; unaffected by this spec.

Z-order (back to front): shape outline → condition fill/pattern → carrier dot → deceased slash / stillbirth cross → proband arrow → selection highlight. This matches the current code's append order in `PedigreeCanvas.jsx` (`shape` appended first, then stillbirth/deceased lines, then proband arrow) and should be preserved, only inserting the carrier-dot step where the half-fill logic currently sits.

## 4. Backward compatibility rules

- `affected: true`, `conditions: []` → render full solid fill (today's exact behavior, condition-registry-agnostic).
- `carrier: true` → render carrier dot (new geometry) instead of today's half-fill; this is the one intentional visual change in this spec and must be flagged as such in the v0.3 changelog.
- `condition: "some string"` (legacy single free-text field) with no `conditions` array → on first load, migrate into `conditions: [{ conditionId: <derived>, status: affected ? 'affected' : carrier ? 'carrier' : 'unknown' }]`, per `mergeManualEdits`-equivalent logic in `usePedigreeStore.js`'s `generateDerivedData`. The old free-text `condition` field itself is retained (not deleted) for its existing italic-text-under-node display and for the "Klinik Notlar" legend text — it becomes a label source, not a competing visual system.
- Sessions saved before this feature (`persistence.js`) must load without `conditions` present at all — treat `undefined` identically to `[]`.
