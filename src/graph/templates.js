/**
 * templates.js — ready-made pedigrees for "Yeni" (clinician decision
 * 2026-10-25): the proband's parents related by blood, every structure of
 * first cousins (4), second cousins (16), first cousins once removed (16)
 * and double first cousins (2).
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

// ── the catalogue ──

const SEXES = ['male', 'female'];

/** "babanın babasının annesi" — the parent ('baba' | 'anne') and the path up. */
export function pathName(root, path) {
  const words = [root === 'father' ? 'baba' : 'anne', ...path.map((s) => (s === 'male' ? 'babası' : 'annesi'))];
  return words.map((w, k) => {
    if (k === words.length - 1) return w;
    if (k === 0) return w === 'baba' ? 'babanın' : 'annenin';
    return w === 'babası' ? 'babasının' : 'annesinin';
  }).join(' ');
}

const COUSIN_NAME = { 'male|male': 'amca çocukları', 'female|female': 'teyze çocukları' };
const pairLabel = ({ father, mother }) => `${pathName('father', father)} ile ${pathName('mother', mother)} kardeş`;

function firstCousins() {
  return SEXES.flatMap((a) => SEXES.map((b) => {
    const pair = { father: [a], mother: [b] };
    const name = COUSIN_NAME[`${a}|${b}`] || 'hala–dayı çocukları';
    return { id: `first-${a[0]}${b[0]}`, label: `${name[0].toLocaleUpperCase('tr')}${name.slice(1)} — ${pairLabel(pair)}`, spec: { pairs: [pair] } };
  }));
}

function secondCousins() {
  const out = [];
  for (const a1 of SEXES) for (const a2 of SEXES) for (const b1 of SEXES) for (const b2 of SEXES) {
    const pair = { father: [a1, a2], mother: [b1, b2] };
    out.push({ id: `second-${a1[0]}${a2[0]}-${b1[0]}${b2[0]}`, label: `${pairLabel(pair)[0].toLocaleUpperCase('tr')}${pairLabel(pair).slice(1)}`, spec: { pairs: [pair] } });
  }
  return out;
}

function onceRemoved() {
  const out = [];
  for (const older of ['father', 'mother']) {
    for (const a of SEXES) for (const b1 of SEXES) for (const b2 of SEXES) {
      const pair = older === 'father' ? { father: [a], mother: [b1, b2] } : { father: [b1, b2], mother: [a] };
      const who = older === 'father' ? 'baba' : 'anne';
      out.push({ id: `once-${older[0]}-${a[0]}${b1[0]}${b2[0]}`, label: `${pairLabel(pair)[0].toLocaleUpperCase('tr')}${pairLabel(pair).slice(1)} (${who} bir kuşak yukarıda)`, spec: { older, pairs: [pair] } });
    }
  }
  return out;
}

export const TEMPLATE_GROUPS = [
  { id: 'first', label: '1. derece kuzen', items: firstCousins() },
  { id: 'second', label: '2. derece kuzen', items: secondCousins() },
  { id: 'once', label: '1. kuzenin çocuğu', items: onceRemoved() },
  {
    id: 'double', label: 'Çift 1. derece kuzen', items: [
      { id: 'double-same', label: 'İki erkek kardeş iki kız kardeşle evli (dedeler kardeş, anneanne ile babaanne kardeş)', spec: { pairs: [{ father: ['male'], mother: ['male'] }, { father: ['female'], mother: ['female'] }] } },
      { id: 'double-cross', label: 'Değişmeli evlilik (babanın babası ile annenin annesi kardeş, babanın annesi ile annenin babası kardeş)', spec: { pairs: [{ father: ['male'], mother: ['female'] }, { father: ['female'], mother: ['male'] }] } },
    ],
  },
];
