/**
 * tourSample.js — the small family the guided tour works on (Tour.jsx; clinician request 2026-11-09:
 * the tour runs on a sample family, never on the patient's drawing). The usual starter (proband,
 * parents, grandparents on both sides) and an older sister, so the tour can show a sibship's birth
 * order and an age. Built with the ordinary graph operations, so it is as valid as anything drawn.
 */
import * as ops from './ops';

/** `starter` is a fresh starter document (usePedigreeStore.starterDocument). Returns { doc, ids }. */
export function buildTourSample(starter) {
  let doc = starter;
  const step = (r) => {
    if (!r.ok) throw new Error(`tour sample: ${r.reason}`);
    doc = r.doc;
  };
  const before = new Set(doc.graph.individuals.map((i) => i.id));
  step(ops.addSibling(doc, 'proband', { sex: 'female' }));
  const sister = doc.graph.individuals.find((i) => !before.has(i.id)).id;
  step(ops.updatePerson(doc, sister, { age: '12' }));
  step(ops.updatePerson(doc, 'proband', { age: '8' }));
  return { doc, ids: { proband: 'proband', sister, mother: 'mother', father: 'father' } };
}
