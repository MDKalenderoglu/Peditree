/**
 * clinicalBenchmark.js — Clinical Usability Benchmark (KI-1, Aşama A).
 *
 * Hand-built, deterministic families of the size a paediatric geneticist
 * actually draws (10–50 people, one 51–100), each with a clinical rationale,
 * clinical data (affected / carrier / deceased / ages → birth order) and a few
 * clinically meaningful edits ("a newborn sibling", "an affected cousin" …)
 * for the edit-stability measurement. Not random graphs: every relationship
 * is defined here. Synthetic data only — no real patients.
 *
 * Every case has a person 'proband' and a person 'mother'.
 * Measured by scripts/clinical-benchmark.runner.mjs.
 */

function builder() {
  const individuals = [];
  const unions = [];
  const parentChildRelationships = [];
  const socialParentLinks = [];
  /** p(id, sex, generation, age?, extra?) — age in years (null = unknown) */
  const p = (id, sex, generation, age = null, extra = {}) => {
    individuals.push({ id, sex, generation, label: id, ...(age !== null ? { age: String(age) } : {}), ...extra });
    return id;
  };
  const u = (a, b, extra = {}) => {
    const id = extra.id || `U_${a}_${b}`;
    unions.push({
      id, partners: [a, b], status: 'together', consanguineous: false, consanguinityStatus: 'none',
      relationshipBackground: 'not_asked', ...extra,
    });
    return id;
  };
  const kids = (unionId, ids) => { parentChildRelationships.push({ unionId, children: ids, orderPolicy: 'byAge' }); };
  const social = (childId, unionId, kind) => { socialParentLinks.push({ childId, unionId, kind }); };
  const done = () => ({ individuals, unions, parentChildRelationships, socialParentLinks });
  return { p, u, kids, social, done };
}

const consang = (degree) => ({ consanguineous: true, consanguinityDegree: degree, consanguinityStatus: 'known_supported', relationshipBackground: 'consanguinity_structurally_supported' });
const FIRST = consang('first_cousin');
const SECOND = consang('second_cousin');
const AFF = { affected: true };
const CAR = { carrier: true };
const DEC = { deceased: true };

/** CB-01 — routine three-generation family (14): affected boy, both grandparent pairs, an aunt's family, a miscarriage. */
function cb01() {
  const { p, u, kids, done } = builder();
  p('mgf', 'male', 1, 63); p('mgm', 'female', 1, 60); p('pgf', 'male', 1, 68, DEC); p('pgm', 'female', 1, 66);
  p('mother', 'female', 2, 34); p('mat_aunt', 'female', 2, 31); p('aunt_h', 'male', 2, 33);
  p('father', 'male', 2, 37); p('pat_uncle', 'male', 2, 40);
  kids(u('mgf', 'mgm'), ['mother', 'mat_aunt']);
  kids(u('pgf', 'pgm'), ['pat_uncle', 'father']);
  kids(u('father', 'mother'), [p('sister', 'female', 3, 9), p('proband', 'male', 3, 6, { proband: true, ...AFF }), p('loss1', 'unknown', 3, null, { pregnancyLoss: true }), p('brother', 'male', 3, 3)]);
  kids(u('aunt_h', 'mat_aunt'), [p('cousin', 'female', 3, 4)]);
  return done();
}

/** CB-02 — first-cousin parents (24): shared grandparents, autosomal recessive (two affected sibs, a stillbirth), collateral cousins. */
function cb02() {
  const { p, u, kids, done } = builder();
  p('A', 'male', 1, null, DEC); p('B', 'female', 1, null, DEC);
  p('X', 'male', 2, 70); p('wX', 'female', 2, 67); p('Y', 'female', 2, 66); p('hY', 'male', 2, 69); p('Z', 'male', 2, 62); p('wZ', 'female', 2, 60);
  kids(u('A', 'B'), ['X', 'Y', 'Z']);
  p('father', 'male', 3, 41); p('pat_uncle', 'male', 3, 44); p('uncle_w', 'female', 3, 42);
  kids(u('X', 'wX'), ['pat_uncle', 'father']);
  p('mother', 'female', 3, 37); p('mat_aunt', 'female', 3, 39); p('aunt_h', 'male', 3, 40);
  kids(u('hY', 'Y'), ['mat_aunt', 'mother']);
  p('zc', 'female', 3, 35); p('zc_h', 'male', 3, 36);
  kids(u('Z', 'wZ'), ['zc']);
  kids(u('father', 'mother', FIRST), [
    p('sib1', 'female', 4, 12, AFF), p('proband', 'male', 4, 8, { proband: true, ...AFF }),
    p('still1', 'unknown', 4, null, { stillbirth: true, deceased: true }), p('sib2', 'female', 4, 4)]);
  kids(u('pat_uncle', 'uncle_w'), [p('pc1', 'male', 4, 15), p('pc2', 'female', 4, 11)]);
  kids(u('aunt_h', 'mat_aunt'), [p('mc1', 'male', 4, 10)]);
  kids(u('zc_h', 'zc'), [p('zcc', 'female', 4, 6)]);
  return done();
}

/** CB-03 — several consanguinity loops (34): parents' parents are first cousins on both sides, parents are double second cousins. */
function cb03() {
  const { p, u, kids, done } = builder();
  p('P1', 'male', 1, null, DEC); p('P2', 'female', 1, null, DEC);
  p('a', 'male', 2, null, DEC); p('wa', 'female', 2, null, DEC);
  p('b', 'female', 2, null, DEC); p('hb', 'male', 2, null, DEC);
  p('c', 'male', 2, 80); p('wc', 'female', 2, 78);
  kids(u('P1', 'P2'), ['a', 'b', 'c']);
  p('d', 'male', 3, 66); p('e', 'female', 3, 64); p('e_h', 'male', 3, 66);
  kids(u('a', 'wa'), ['d', 'e']);
  p('f', 'female', 3, 63); p('g', 'male', 3, 61);
  kids(u('hb', 'b'), ['f', 'g']);
  p('h', 'female', 3, 58); p('i', 'male', 3, 55); p('i_w', 'female', 3, 54);
  kids(u('c', 'wc'), ['h', 'i']);
  p('father', 'male', 4, 40); p('pat_aunt', 'female', 4, 43); p('pat_aunt_h', 'male', 4, 45);
  kids(u('d', 'f', FIRST), ['pat_aunt', 'father']);
  p('mother', 'female', 4, 36); p('mat_uncle', 'male', 4, 38, AFF); p('mat_uncle_w', 'female', 4, 37);
  kids(u('g', 'h', FIRST), ['mat_uncle', 'mother']);
  p('ec', 'male', 4, 39); kids(u('e_h', 'e'), ['ec']);
  p('ic', 'female', 4, 30); kids(u('i', 'i_w'), ['ic']);
  kids(u('father', 'mother', FIRST), [p('sib1', 'male', 5, 10), p('proband', 'female', 5, 7, { proband: true, ...AFF }), p('sib2', 'female', 5, 2, AFF)]);
  kids(u('pat_aunt_h', 'pat_aunt'), [p('pac1', 'male', 5, 18), p('pac2', 'male', 5, 15, AFF)]);
  kids(u('mat_uncle', 'mat_uncle_w'), [p('muc1', 'female', 5, 9)]);
  return done();
}

/** CB-04 — several partners and half-siblings (21): both parents had earlier partners, the maternal grandmother remarried; X-linked half-brother. */
function cb04() {
  const { p, u, kids, done } = builder();
  p('mgf', 'male', 1, null, DEC); p('mgm', 'female', 1, 70); p('mgm_h2', 'male', 1, 72);
  p('pgf', 'male', 1, 74); p('pgm', 'female', 1, 71);
  p('mother', 'female', 2, 39, CAR); p('half_aunt', 'female', 2, 33);
  kids(u('mgf', 'mgm', { status: 'deceased' }), ['mother']);
  kids(u('mgm_h2', 'mgm'), ['half_aunt']);
  p('father', 'male', 2, 42); p('pat_aunt', 'female', 2, 45);
  kids(u('pgf', 'pgm'), ['pat_aunt', 'father']);
  p('m_ex', 'male', 2, 41); p('f_ex', 'female', 2, 40);
  kids(u('m_ex', 'mother', { status: 'divorced' }), [p('mhs1', 'male', 3, 17, AFF), p('mhs2', 'female', 3, 15)]);
  kids(u('father', 'f_ex', { status: 'divorced' }), [p('fhs1', 'female', 3, 16)]);
  kids(u('father', 'mother'), [p('proband', 'male', 3, 6, { proband: true, ...AFF }), p('sib', 'female', 3, 3)]);
  p('half_aunt_h', 'male', 2, 35);
  kids(u('half_aunt_h', 'half_aunt'), [p('hac', 'male', 3, 5)]);
  return done();
}

/** CB-05 — affected people in different branches (29): X-linked recessive through the maternal line (great-uncle, uncle, cousin, proband); carriers marked. */
function cb05() {
  const { p, u, kids, done } = builder();
  p('ggf', 'male', 0, null, DEC); p('ggm', 'female', 0, null, { ...DEC, ...CAR });
  p('mgm', 'female', 1, 68, CAR); p('gg_uncle', 'male', 1, null, { ...AFF, ...DEC }); p('gg_aunt', 'female', 1, 70);
  kids(u('ggf', 'ggm'), ['gg_aunt', 'mgm', 'gg_uncle']);
  p('mgf', 'male', 1, 70); p('pgf', 'male', 1, 72); p('pgm', 'female', 1, 69);
  p('gg_aunt_h', 'male', 1, 72);
  p('mother', 'female', 2, 38, CAR); p('mat_uncle', 'male', 2, null, { ...AFF, ...DEC }); p('mat_aunt', 'female', 2, 41, CAR); p('mat_aunt_h', 'male', 2, 43);
  kids(u('mgf', 'mgm'), ['mat_aunt', 'mat_uncle', 'mother']);
  p('father', 'male', 2, 40); p('pat_uncle', 'male', 2, 37); p('pat_uncle_w', 'female', 2, 36);
  kids(u('pgf', 'pgm'), ['father', 'pat_uncle']);
  p('gac', 'female', 2, 45); kids(u('gg_aunt_h', 'gg_aunt'), ['gac']);
  kids(u('mat_aunt_h', 'mat_aunt'), [p('mac1', 'male', 3, 14, AFF), p('mac2', 'female', 3, 11), p('mac3', 'male', 3, 8)]);
  kids(u('father', 'mother'), [p('sister', 'female', 3, 10), p('proband', 'male', 3, 7, { proband: true, ...AFF }), p('brother', 'male', 3, 4)]);
  kids(u('pat_uncle', 'pat_uncle_w'), [p('puc1', 'female', 3, 9), p('puc2', 'male', 3, 6)]);
  return done();
}

/** CB-06 — recurrent consanguinity over several generations (46): an endogamous family with first-cousin marriages in three generations. */
function cb06() {
  const { p, u, kids, done } = builder();
  p('F1', 'male', 0, null, DEC); p('F2', 'female', 0, null, DEC);
  // generation 1: three siblings with spouses
  p('s1', 'male', 1, null, DEC); p('s1w', 'female', 1, null, DEC);
  p('s2', 'female', 1, null, DEC); p('s2h', 'male', 1, null, DEC);
  p('s3', 'male', 1, null, DEC); p('s3w', 'female', 1, null, DEC);
  kids(u('F1', 'F2'), ['s1', 's2', 's3']);
  // generation 2
  p('t1', 'male', 2, 78); p('t2', 'female', 2, 75); p('t2h', 'male', 2, 77);
  kids(u('s1', 's1w'), ['t1', 't2']);
  p('t3', 'female', 2, 74); p('t4', 'male', 2, 72); p('t4w', 'female', 2, 70);
  kids(u('s2h', 's2'), ['t3', 't4']);
  p('t5', 'female', 2, 69); p('t6', 'male', 2, 66);
  kids(u('s3', 's3w'), ['t5', 't6']);
  // generation 3: t1 × t3 first cousins; t6 × t5? (siblings — no); t4 × t5 first cousins
  p('pgf', 'male', 3, 56); p('pga', 'female', 3, 58); p('pga_h', 'male', 3, 60);
  kids(u('t1', 't3', FIRST), ['pga', 'pgf']);
  p('mgm', 'female', 3, 52); p('mgu', 'male', 3, 50, AFF); p('mgu_w', 'female', 3, 49);
  kids(u('t4', 't5', FIRST), ['mgm', 'mgu']);
  p('t2c', 'male', 3, 50); kids(u('t2h', 't2'), ['t2c']);
  p('t6w', 'female', 3, 60); p('t6c', 'female', 3, 40); kids(u('t6', 't6w'), ['t6c']);
  // generation 4: pgf's son × mgm's daughter are second cousins → parents' parents
  p('pgm', 'female', 3, 55); p('mgf', 'male', 3, 54);
  p('father', 'male', 4, 35); p('pat_uncle', 'male', 4, 33); p('pat_uncle_w', 'female', 4, 32);
  kids(u('pgf', 'pgm'), ['father', 'pat_uncle']);
  p('mother', 'female', 4, 31); p('mat_aunt', 'female', 4, 29, AFF);
  kids(u('mgf', 'mgm'), ['mother', 'mat_aunt']);
  p('pac', 'female', 4, 34); kids(u('pga_h', 'pga'), ['pac']);
  p('muc', 'male', 4, 26, AFF); kids(u('mgu', 'mgu_w'), ['muc']);
  // generation 5
  kids(u('father', 'mother', SECOND), [p('sib1', 'female', 5, 9), p('proband', 'male', 5, 6, { proband: true, ...AFF }), p('sib2', 'male', 5, 2), p('loss1', 'unknown', 5, null, { pregnancyLoss: true })]);
  kids(u('pat_uncle', 'pat_uncle_w'), [p('puc1', 'male', 5, 5), p('puc2', 'female', 5, 3)]);
  return done();
}

/** CB-07 — adoption and social parenthood (16): an adopted-in proband under the adoptive parents (dashed descent), their biological daughter, a step-son. */
function cb07() {
  const { p, u, kids, social, done } = builder();
  p('mgf', 'male', 1, 65); p('mgm', 'female', 1, 63); p('pgf', 'male', 1, 67); p('pgm', 'female', 1, 66);
  p('mother', 'female', 2, 42); p('mat_aunt', 'female', 2, 39, AFF); p('father', 'male', 2, 44); p('f_ex', 'female', 2, 43);
  kids(u('mgf', 'mgm'), ['mother', 'mat_aunt']);
  kids(u('pgf', 'pgm'), ['father']);
  const parents = u('father', 'mother');
  kids(parents, [p('bio_daughter', 'female', 3, 8)]);
  p('proband', 'male', 3, 5, { proband: true, ...AFF });
  social('proband', parents, 'adoptive');
  const exU = u('father', 'f_ex', { status: 'divorced' });
  kids(exU, [p('step_son', 'male', 3, 15)]);
  social('step_son', parents, 'step');
  p('aunt_h', 'male', 2, 41);
  kids(u('aunt_h', 'mat_aunt'), [p('cousin1', 'male', 3, 12), p('cousin2', 'female', 3, 9, AFF)]);
  return done();
}

/** CB-08 — a wide rural family (78): eight-child sibships on both sides, every sibling married with children; one first-cousin marriage. */
function cb08() {
  const { p, u, kids, done } = builder();
  p('mgf', 'male', 1, 80); p('mgm', 'female', 1, 76); p('pgf', 'male', 1, null, DEC); p('pgm', 'female', 1, 79);
  const matSibs = [];
  for (let k = 0; k < 7; k++) {
    const sex = k % 2 ? 'female' : 'male';
    matSibs.push(p(`ms${k}`, sex, 2, 58 - 3 * k));
  }
  const patSibs = [];
  for (let k = 0; k < 7; k++) {
    const sex = k % 2 ? 'male' : 'female';
    patSibs.push(p(`ps${k}`, sex, 2, 60 - 3 * k));
  }
  p('mother', 'female', 2, 36); p('father', 'male', 2, 39);
  kids(u('mgf', 'mgm'), [...matSibs, 'mother']);
  kids(u('pgf', 'pgm'), [...patSibs, 'father']);
  const familyOf = (sib, sex, ages, tag) => {
    const sp = p(`${sib}_sp`, sex === 'male' ? 'female' : 'male', 2, ages[0] + 2);
    const ids = ages.slice(1).map((a, j) => p(`${sib}_c${j}`, j % 2 ? 'female' : 'male', 3, a, tag && j === 0 ? AFF : {}));
    kids(sex === 'male' ? u(sib, sp) : u(sp, sib), ids);
  };
  matSibs.forEach((s, k) => familyOf(s, k % 2 ? 'female' : 'male', [56 - 3 * k, 30 - 2 * k, 27 - 2 * k], k === 2));
  patSibs.forEach((s, k) => familyOf(s, k % 2 ? 'male' : 'female', [58 - 3 * k, 32 - 2 * k, 28 - 2 * k], false));
  // first-cousin marriage between ms0's son and ms1's daughter (both grandchildren of mgf/mgm), with a child
  kids(u('ms0_c0', 'ms1_c1', FIRST), [p('fc_child', 'male', 4, 3, AFF)]);
  kids(u('father', 'mother'), [p('sib1', 'female', 3, 12), p('proband', 'male', 3, 8, { proband: true, ...AFF }), p('sib2', 'male', 3, 5)]);
  return done();
}

export const CLINICAL_BENCHMARK = [
  {
    id: 'CB-01', band: '10–20', name: 'Rutin üç kuşak (etkilenmiş erkek çocuk, düşük)', build: cb01,
    edits: [['yenidoğan kardeş', (o, d) => o.addSibling(d, 'proband', { sex: 'female' })],
      ['teyzeye ikinci çocuk', (o, d) => o.addChild(d, 'U_aunt_h_mat_aunt', { sex: 'male' })]],
  },
  {
    id: 'CB-02', band: '21–50', name: 'Birinci derece kuzen evliliği (OR, iki etkilenmiş kardeş)', build: cb02,
    edits: [['yenidoğan kardeş', (o, d) => o.addSibling(d, 'proband', { sex: 'male' })],
      ['amcaya üçüncü çocuk', (o, d) => o.addChild(d, 'U_pat_uncle_uncle_w', { sex: 'male' })]],
  },
  {
    id: 'CB-03', band: '21–50', name: 'Birden fazla akraba evliliği döngüsü', build: cb03,
    edits: [['yenidoğan kardeş', (o, d) => o.addSibling(d, 'proband', { sex: 'female' })],
      ['dayı çocuğuna eş', (o, d) => o.addPartner(d, 'muc1', { sex: 'male' })]],
  },
  {
    id: 'CB-04', band: '21–50', name: 'Birden fazla partner ve yarım kardeşler', build: cb04,
    edits: [['yenidoğan kardeş', (o, d) => o.addSibling(d, 'proband', { sex: 'male' })],
      ['annenin üvey kardeşine ikinci çocuk', (o, d) => o.addChild(d, 'U_half_aunt_h_half_aunt', { sex: 'female' })]],
  },
  {
    id: 'CB-05', band: '21–50', name: 'Farklı kollarda etkilenmiş bireyler (X-bağlı)', build: cb05,
    edits: [['yenidoğan kardeş', (o, d) => o.addSibling(d, 'proband', { sex: 'male' })],
      ['teyze kızına eş + çocuk', (o, d) => {
        const r = o.addPartner(d, 'mac2', { sex: 'male' });
        return r.ok ? o.addChild(r.doc, r.created.unionId, { sex: 'male' }) : r;
      }]],
  },
  {
    id: 'CB-06', band: '21–50', name: 'Kuşaklar boyu tekrar eden akraba evliliği', build: cb06,
    edits: [['yenidoğan kardeş', (o, d) => o.addSibling(d, 'proband', { sex: 'female' })],
      ['halanın çocuğuna eş', (o, d) => o.addPartner(d, 'pac', { sex: 'male' })]],
  },
  {
    id: 'CB-07', band: '10–20', name: 'Evlat edinme ve sosyal ebeveynlik', build: cb07,
    edits: [['yenidoğan biyolojik kardeş', (o, d) => o.addChild(d, 'U_father_mother', { sex: 'female' })],
      ['teyzeye üçüncü çocuk', (o, d) => o.addChild(d, 'U_aunt_h_mat_aunt', { sex: 'male' })]],
  },
  {
    id: 'CB-08', band: '51–100', name: 'Geniş kırsal aile (sekizer kardeş, bir kuzen evliliği)', build: cb08,
    edits: [['yenidoğan kardeş', (o, d) => o.addSibling(d, 'proband', { sex: 'female' })],
      ['dayıya üçüncü çocuk', (o, d) => o.addChild(d, 'U_ms0_ms0_sp', { sex: 'female' })]],
  },
];
