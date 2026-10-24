/**
 * relationshipBackground.js
 *
 * v0.3a.2 — replaces the old binary "akraba evliliği" checkbox with an
 * explicit union-level field covering what a clinician can actually learn
 * from a family history interview:
 *
 *   not_asked                        — never asked / not yet recorded
 *   no_consanguinity_reported        — asked; family reports none
 *   consanguinity_reported           — family reports consanguinity
 *   consanguinity_structurally_supported — reported AND a real shared
 *                                          ancestor already exists in the
 *                                          graph (computed, never
 *                                          user-selected directly)
 *   same_village_or_same_origin      — shared geographic/community origin,
 *                                       explicitly NOT a claim of blood
 *                                       relationship
 *   unknown                          — asked, family doesn't know
 *
 * Rendering rule (see pedigreeLayout.js / PedigreeCanvas.jsx):
 *   - consanguinity_reported / consanguinity_structurally_supported: both
 *     render as a DOUBLE union line. They differ only in color/dash style,
 *     never in line count (a clinician-declared consanguineous union must
 *     always be visibly double-lined). NEITHER carries a "?" marker — a
 *     question mark reads as "we doubt this report," which is not the
 *     intended meaning (the intended meaning is "reported, not yet
 *     structurally confirmed in this graph").
 *   - same_village_or_same_origin: a normal SINGLE union line + a small
 *     neutral text note. Never rendered as a consanguinity double line —
 *     shared geographic origin is not a claim of blood relationship and
 *     must not visually imply one.
 *   - no_consanguinity_reported / unknown: normal single union line, with
 *     an optional small note for clarity.
 *   - not_asked: normal single union line, no note (the default,
 *     backward-compatible with every pre-existing union).
 *
 * No shared ancestor, cousin degree, or blood relationship is ever
 * fabricated by this module — `consanguinity_structurally_supported` is
 * only ever produced by the builder's existing ancestor-walk (see
 * pedigreeBuilderFromWizard.js), never assumed here.
 */

export const RELATIONSHIP_BACKGROUND = {
  NOT_ASKED: 'not_asked',
  NO_CONSANGUINITY_REPORTED: 'no_consanguinity_reported',
  CONSANGUINITY_REPORTED: 'consanguinity_reported',
  CONSANGUINITY_STRUCTURALLY_SUPPORTED: 'consanguinity_structurally_supported',
  SAME_VILLAGE_OR_SAME_ORIGIN: 'same_village_or_same_origin',
  UNKNOWN: 'unknown',
};

const VALID_VALUES = new Set(Object.values(RELATIONSHIP_BACKGROUND));

/**
 * User-selectable options for the union editor dropdown. Deliberately
 * excludes CONSANGUINITY_STRUCTURALLY_SUPPORTED — that state is computed
 * from CONSANGUINITY_REPORTED plus the graph's own shared-ancestor check,
 * never chosen directly by the clinician (mirrors how `consanguinityStatus`
 * already works: the user declares consanguinity, the system determines
 * whether it is structurally backed).
 */
export const RELATIONSHIP_BACKGROUND_OPTIONS = [
  { value: RELATIONSHIP_BACKGROUND.NOT_ASKED, label: 'Sorulmadı' },
  { value: RELATIONSHIP_BACKGROUND.NO_CONSANGUINITY_REPORTED, label: 'Akrabalık bildirilmedi (soruldu, yok)' },
  { value: RELATIONSHIP_BACKGROUND.CONSANGUINITY_REPORTED, label: 'Akrabalık bildirildi' },
  { value: RELATIONSHIP_BACKGROUND.SAME_VILLAGE_OR_SAME_ORIGIN, label: 'Aynı köy / aynı bölge (akrabalık değil)' },
  { value: RELATIONSHIP_BACKGROUND.UNKNOWN, label: 'Bilinmiyor' },
];

/**
 * Whether a value is one of the six valid relationshipBackground states.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidRelationshipBackground(value) {
  return VALID_VALUES.has(value);
}

/**
 * Resolve the *declared* relationship background for a union from wizard
 * state, preferring the new `unionRelationshipBackgrounds` map and falling
 * back to the legacy `consanguineousUnions` map (pre-v0.3a.2 sessions) for
 * backward compatibility — an old `consanguineousUnions[unionId] === true`
 * entry is treated as an explicit "consanguinity_reported" declaration.
 *
 * @param {object} state - wizardData
 * @param {string} unionId
 * @returns {string|null} a valid relationshipBackground value, or null if
 *   nothing was explicitly declared for this union via either mechanism
 */
export function resolveDeclaredRelationshipBackground(state, unionId) {
  const explicit = state?.unionRelationshipBackgrounds?.[unionId];
  if (explicit && isValidRelationshipBackground(explicit)) return explicit;

  const legacy = state?.consanguineousUnions?.[unionId];
  if (legacy === true) return RELATIONSHIP_BACKGROUND.CONSANGUINITY_REPORTED;

  return null;
}

/**
 * Map a union's final relationshipBackground to what pedigreeLayout.js
 * should draw: an edge type (reusing the existing 'union' /
 * 'consanguineousUnion' / 'consanguineousUnionUnresolved' types so
 * PedigreeCanvas.jsx's existing draw code needs no new case for the
 * non-consanguinity backgrounds).
 *
 * v0.3a.3: pedigree relationship lines never carry canvas text — a
 * consanguineous union is a standard solid black double line regardless of
 * whether it is structurally confirmed (`consanguinity_reported` and
 * `consanguinity_structurally_supported` render identically; the edge
 * *type* stays distinct internally for code/tests/side-panel metadata, but
 * PedigreeCanvas.jsx no longer visually distinguishes them). No note text
 * is produced for any background — same_village_or_same_origin,
 * no_consanguinity_reported, and unknown are all a plain single line with
 * no annotation on the canvas; that metadata is shown only in the
 * selected-union side panel (IndividualEditor.jsx).
 *
 * @param {string} relationshipBackground
 * @returns {{ edgeType: 'union'|'consanguineousUnion'|'consanguineousUnionUnresolved' }}
 */
export function relationshipBackgroundToEdgeInfo(relationshipBackground) {
  switch (relationshipBackground) {
    case RELATIONSHIP_BACKGROUND.CONSANGUINITY_STRUCTURALLY_SUPPORTED:
      return { edgeType: 'consanguineousUnion' };
    case RELATIONSHIP_BACKGROUND.CONSANGUINITY_REPORTED:
      return { edgeType: 'consanguineousUnionUnresolved' };
    case RELATIONSHIP_BACKGROUND.SAME_VILLAGE_OR_SAME_ORIGIN:
    case RELATIONSHIP_BACKGROUND.NO_CONSANGUINITY_REPORTED:
    case RELATIONSHIP_BACKGROUND.UNKNOWN:
    case RELATIONSHIP_BACKGROUND.NOT_ASKED:
    default:
      return { edgeType: 'union' };
  }
}
