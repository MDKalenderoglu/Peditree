/**
 * templates.js — ready-made pedigrees for "Yeni" (clinician decisions
 * 2026-10-25, 2026-11-01): the proband's parents related by blood, through a
 * pair of siblings 1–3 generations above each parent (first, second and
 * third cousins and the once-removed ones), or double first cousins.
 *
 * A template says, for each parent, the path up to the relative who is the
 * sibling of the other parent's relative: e.g. father ['male'] = the
 * father's father, mother ['female', 'male'] = the mother's mother's father.
 * The builder adds the missing ancestors (ops.addParents) and makes the two
 * top relatives siblings (ops.makeSiblings, which draws their parents); the
 * consanguinity and its degree then follow from the drawing (finalize.js).
 */
import * as ops from './ops';
import { indexGraph } from './model';

const parentOf = (doc, id, sex) => {
  const idx = indexGraph(doc.graph);
  const u = idx.unionById.get(idx.bioParentUnion.get(id));
  return u ? u.partners.find((p) => idx.byId.get(p)?.sex === sex) : null;
};

function climb(doc, start, path) {
  let id = start;
  for (const sex of path) {
    let p = parentOf(doc, id, sex);
    if (!p) {
      const r = ops.addParents(doc, id, {});
      if (!r.ok) return { ok: false, reason: r.reason };
      doc = r.doc;
      p = parentOf(doc, id, sex);
    }
    id = p;
  }
  return { ok: true, doc, id };
}

/**
 * @param spec { pairs: [{ father: sexes[], mother: sexes[] }], older?: 'father' | 'mother' }
 *   older: once removed — that parent belongs to the generation above the
 *   other, so the parents' union is a cross-generation union (drawn on two
 *   rows, clinician decision 2026-10-24) before the ancestors are added
 */
export function buildTemplate(base, spec) {
  let doc = base;
  if (spec.older) {
    const r = ops.commit(doc, (d) => {
      const u = d.graph.unions.find((x) => x.partners.includes('father') && x.partners.includes('mother'));
      if (!u) ops.block('Anne-baba birlikteliği yok.');
      const [older, younger] = spec.older === 'father' ? ['father', 'mother'] : ['mother', 'father'];
      const by = (id) => d.graph.individuals.find((i) => i.id === id);
      u.crossGeneration = true;
      by(older).generation = by(younger).generation - 1;
    });
    if (!r.ok) return r;
    doc = r.doc;
  }
  for (const pair of spec.pairs) {
    const f = climb(doc, 'father', pair.father);
    if (!f.ok) return f;
    const m = climb(f.doc, 'mother', pair.mother);
    if (!m.ok) return m;
    const r = ops.makeSiblings(m.doc, f.id, m.id);
    if (!r.ok) return { ok: false, reason: r.reason };
    doc = r.doc;
  }
  return { ok: true, doc };
}

// ── the choices in "Yeni" (clinician decision 2026-11-01) ──
//
// The clinician says how many generations above each parent the two
// siblings stand (1 = a parent of the parent, 2 = a grandparent, 3 = a
// great-grandparent) and which relative it is on each side; the name of the
// relationship and its F follow. One pair of numbers covers first, second
// and third cousins and the once-removed ones; the parents may stand at most
// one generation apart (cross-generation partners, clinician 2026-10-24).

const SEXES = ['male', 'female'];
export const GENERATIONS_UP = [1, 2, 3];
export const canPair = (up) => Math.abs(up.father - up.mother) <= 1;

/** "babanın babasının annesi" — the parent ('baba' | 'anne') and the path up. */
export function pathName(root, path) {
  const words = [root === 'father' ? 'baba' : 'anne', ...path.map((s) => (s === 'male' ? 'babası' : 'annesi'))];
  return words.map((w, k) => {
    if (k === words.length - 1) return w;
    if (k === 0) return w === 'baba' ? 'babanın' : 'annenin';
    return w === 'babası' ? 'babasının' : 'annesinin';
  }).join(' ');
}

/** Every path of `n` steps, the father's line first: [['male','male'], ['male','female'], …]. */
export function pathsOf(n) {
  return n === 0 ? [[]] : pathsOf(n - 1).flatMap((p) => SEXES.map((s) => [...p, s]));
}

/** "babasının annesi" — the path seen from the parent. */
const pathFromParent = (path) => path.map((s, k) => (k === path.length - 1
  ? (s === 'male' ? 'babası' : 'annesi')
  : (s === 'male' ? 'babasının' : 'annesinin'))).join(' ');
const KIN_WORD = { 'male,male': 'dedesi', 'male,female': 'babaannesi', 'female,male': 'dedesi', 'female,female': 'anneannesi' };

/** A relative as the button names it: the clinic's word and the path under it ("Babaannesi", "babasının annesi"). */
export function relativeName(path) {
  const way = pathFromParent(path);
  const word = KIN_WORD[path.join(',')];
  const main = word || way;
  return { main: main[0].toLocaleUpperCase('tr') + main.slice(1), way: word ? way : null };
}

const COUSIN_NAME = { 'male|male': 'amca çocukları', 'female|female': 'teyze çocukları' };
const OF_GENERATION = { 1: 'anne ya da babası', 2: 'büyükanne ya da büyükbabalarından biri', 3: 'büyükanne ya da büyükbabalarının anne ya da babası' };

/**
 * What the chosen numbers mean: the relationship's name, a sentence for the
 * clinician, and F of their child.
 * @param up { father: 1–3, mother: 1–3 }, at most one apart
 * @param paths { father: sexes[], mother: sexes[] } (first cousins: amca / teyze / hala–dayı)
 */
export function relationInfo(up, paths = null) {
  const lo = Math.min(up.father, up.mother);
  const F = 1 / 2 ** (up.father + up.mother + 2);
  if (up.father === up.mother) {
    const clinic = lo === 1 && paths ? COUSIN_NAME[`${paths.father[0]}|${paths.mother[0]}`] || 'hala–dayı çocukları' : null;
    return {
      name: `${lo}. derece kuzen${clinic ? ` (${clinic})` : ''}`,
      sentence: `Babanın ${OF_GENERATION[up.father]} ile annenin ${OF_GENERATION[up.mother]} kardeştir.`,
      F,
    };
  }
  const [younger, older] = up.father > up.mother ? ['Baba', 'annenin'] : ['Anne', 'babanın'];
  return {
    name: `${lo}. derece kuzenin çocuğu (bir kuşak fark)`,
    sentence: `${younger}, ${older} ${lo === 1 ? '' : `${lo}. derece `}kuzeninin ${younger === 'Anne' ? 'kızıdır' : 'oğludur'}; bir kuşak aşağıdadır.`,
    F,
  };
}

/** The template for buildTemplate: the two relatives are siblings; a parent with the shorter way up is a generation older. */
export function relationSpec(paths) {
  const spec = { pairs: [{ father: paths.father, mother: paths.mother }] };
  if (paths.father.length < paths.mother.length) spec.older = 'father';
  if (paths.mother.length < paths.father.length) spec.older = 'mother';
  return spec;
}

/** Double first cousins: two pairs of siblings, kept as the two ready-made families. */
export const DOUBLE_FIRST_COUSINS = [
  { id: 'double-same', label: 'Babaları kardeş, anneleri de kardeş', sub: 'Dedeler kardeş, anneanne ile babaanne kardeş', spec: { pairs: [{ father: ['male'], mother: ['male'] }, { father: ['female'], mother: ['female'] }] } },
  { id: 'double-cross', label: 'Berdel', sub: 'Babanın babası ile annenin annesi kardeş, babanın annesi ile annenin babası kardeş', spec: { pairs: [{ father: ['male'], mother: ['female'] }, { father: ['female'], mother: ['male'] }] } },
];

/** The relatives who were made siblings in a family built from `spec` (the preview marks them). */
export function siblingIds(doc, spec) {
  const up = (start, path) => path.reduce((id, sex) => id && parentOf(doc, id, sex), start);
  return spec.pairs.flatMap((pair) => [up('father', pair.father), up('mother', pair.mother)]).filter(Boolean);
}
