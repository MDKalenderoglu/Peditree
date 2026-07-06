/**
 * namedScenarios.js — the manual-QA scenarios that motivated Step 0, encoded
 * as explicit operation sequences so they run deterministically through the
 * same fuzz harness (and are saved as regression fixtures when they fail).
 * These are the "known bad shapes" the clinician reported; recording whether
 * each currently fails is part of the baseline.
 */
export const NAMED_SCENARIOS = [
  {
    name: 'upper-generation-child-add-overlap',
    description: 'Add a sibling to each parent (collateral uncles/aunts), then a wide proband sibship — the footprint-encroachment case.',
    opSeq: [
      { op: 'addSibling', target: 'mother', sex: 'male' },
      { op: 'addSibling', target: 'father', sex: 'female' },
      { op: 'addSiblingCat', category: 'male' },
      { op: 'addSiblingCat', category: 'male' },
      { op: 'addSiblingCat', category: 'female' },
      { op: 'addSiblingCat', category: 'unknown' },
    ],
  },
  {
    name: 'parent-sibling-branch-collapse',
    description: 'Aunt/uncle branches WITH children on both sides plus a proband sibship — cousin branches must stay isolated.',
    opSeq: [
      { op: 'addRelativeBranch', side: 'maternalRelatives', type: 'uncles', male: 2, female: 0 },
      { op: 'addRelativeBranch', side: 'paternalRelatives', type: 'aunts', male: 0, female: 2 },
      { op: 'addSiblingCat', category: 'male' },
      { op: 'addSiblingCat', category: 'male' },
    ],
  },
  {
    name: 'large-sibship-near-aunt-uncle',
    description: 'Childless aunt + uncle immediately beside a large 6-child proband sibship.',
    opSeq: [
      { op: 'addRelativeBranch', side: 'maternalRelatives', type: 'uncles', male: 0, female: 0 },
      { op: 'addRelativeBranch', side: 'paternalRelatives', type: 'aunts', male: 0, female: 0 },
      { op: 'addSiblingCat', category: 'male' },
      { op: 'addSiblingCat', category: 'male' },
      { op: 'addSiblingCat', category: 'male' },
      { op: 'addSiblingCat', category: 'female' },
      { op: 'addSiblingCat', category: 'female' },
      { op: 'addSiblingCat', category: 'unknown' },
    ],
  },
  {
    name: 'distant-same-generation-union-collapse',
    description: 'A union between two far-apart same-generation collateral individuals (mat_uncle_0 × pat_uncle_0).',
    opSeq: [
      { op: 'addRelativeBranch', side: 'maternalRelatives', type: 'uncles', male: 0, female: 0 },
      { op: 'addRelativeBranch', side: 'paternalRelatives', type: 'uncles', male: 0, female: 0 },
      { op: 'createUnion', a: 'mat_uncle_0', b: 'pat_uncle_0' },
    ],
  },
  {
    name: 'right-panel-sibling-state-derived-case',
    description: 'Siblings added via the selected-person editor path (graphEdits origin) rather than the wizard arrays.',
    opSeq: [
      { op: 'addSibling', target: 'proband', sex: 'male' },
      { op: 'addSibling', target: 'proband', sex: 'female' },
      { op: 'addSibling', target: 'proband', sex: 'male' },
    ],
  },
  {
    name: 'export-negative-x-viewbox',
    description: 'Left-heavy collateral expansion that pushes coordinates negative, plus a wide sibship — export must not clip.',
    opSeq: [
      { op: 'addRelativeBranch', side: 'maternalRelatives', type: 'uncles', male: 1, female: 0 },
      { op: 'addRelativeBranch', side: 'maternalRelatives', type: 'uncles', male: 1, female: 0 },
      { op: 'addRelativeBranch', side: 'maternalRelatives', type: 'uncles', male: 1, female: 0 },
      { op: 'addSiblingCat', category: 'male' },
      { op: 'addSiblingCat', category: 'male' },
      { op: 'addSiblingCat', category: 'male' },
      { op: 'addSiblingCat', category: 'female' },
    ],
  },
];
