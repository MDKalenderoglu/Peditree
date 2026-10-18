/**
 * clinicalFixtures.js — hand-built clinical stress pedigrees, expressed
 * directly as graphs ({ individuals, unions, parentChildRelationships }) so
 * every layout engine can be measured on exactly the same family, independent
 * of the wizard/store. See docs/PEDITREE_STRESS_TEST_MATRIX.md for the
 * clinical rationale and expected behaviour of each fixture.
 *
 * Synthetic data only — no real patients.
 */

/** Tiny DSL: p(id, sex, generation, extra) / u(a, b, extra) / kids(unionId, [ids]). */
function makeBuilder() {
  const individuals = [];
  const unions = [];
  const parentChildRelationships = [];
  const p = (id, sex, generation, extra = {}) => {
    individuals.push({ id, sex, generation, label: id, ...extra });
    return id;
  };
  const u = (a, b, extra = {}) => {
    const id = extra.id || `U_${a}_${b}`;
    unions.push({
      id, partners: [a, b], status: 'together', consanguinityStatus: 'none',
      relationshipBackground: 'not_asked', ...extra,
    });
    return id;
  };
  const kids = (unionId, ids) => {
    parentChildRelationships.push({ unionId, children: ids });
  };
  const done = () => ({ individuals, unions, parentChildRelationships });
  return { p, u, kids, done };
}

const CONSANG = { consanguineous: true, consanguinityStatus: 'known_supported', relationshipBackground: 'consanguinity_structurally_supported' };

/** CS-01 — standard three-generation starter: proband, parents, both grandparent pairs. */
function cs01() {
  const { p, u, kids, done } = makeBuilder();
  p('mgf', 'male', 1); p('mgm', 'female', 1); p('pgf', 'male', 1); p('pgm', 'female', 1);
  p('mother', 'female', 2); p('father', 'male', 2); p('proband', 'male', 3, { proband: true });
  kids(u('mgf', 'mgm'), ['mother']);
  kids(u('pgf', 'pgm'), ['father']);
  kids(u('father', 'mother'), ['proband']);
  return done();
}

/** CS-02 — textbook autosomal-dominant pedigree (örnek/ Şekil 1 structure): 4 generations, 7-child sibship, in-laws. */
function cs02() {
  const { p, u, kids, done } = makeBuilder();
  p('I1', 'male', 1); p('I2', 'female', 1, { affected: true });
  const g2 = ['II1', 'II3', 'II4', 'II5', 'II7', 'II10', 'II12'];
  const sex2 = { II1: 'male', II3: 'female', II4: 'female', II5: 'male', II7: 'male', II10: 'female', II12: 'female' };
  g2.forEach(id => p(id, sex2[id], 2));
  kids(u('I1', 'I2'), g2);
  p('II2', 'male', 2); p('II6', 'female', 2); p('II8', 'female', 2); p('II9', 'male', 2); p('II11', 'male', 2);
  const uA = u('II2', 'II3'); const uB = u('II5', 'II6'); const uC = u('II7', 'II8'); const uD = u('II9', 'II10'); const uE = u('II11', 'II12');
  ['III1', 'III2', 'III3', 'III4', 'III5'].forEach((id, i) => p(id, i % 2 ? 'female' : 'male', 3)); kids(uA, ['III1', 'III2', 'III3', 'III4', 'III5']);
  ['III7', 'III9', 'III10'].forEach(id => p(id, 'female', 3)); kids(uB, ['III7', 'III9', 'III10']);
  ['III12', 'III14', 'III15'].forEach(id => p(id, 'female', 3)); kids(uC, ['III12', 'III14', 'III15']);
  ['III16', 'III17', 'III18', 'III19'].forEach((id, i) => p(id, i === 1 ? 'male' : 'female', 3)); kids(uD, ['III16', 'III17', 'III18', 'III19']);
  p('III20', 'unknown', 3); kids(uE, ['III20']);
  p('III6', 'male', 3); p('III8', 'male', 3); p('III11', 'male', 3); p('III13', 'male', 3);
  const u1 = u('III6', 'III7'); const u2 = u('III8', 'III9'); const u3 = u('III11', 'III12'); const u4 = u('III13', 'III14');
  ['IV1', 'IV2', 'IV3', 'IV4', 'IV5'].forEach((id, i) => p(id, i % 2 ? 'female' : 'male', 4, id === 'IV3' ? { proband: true } : {})); kids(u1, ['IV1', 'IV2', 'IV3', 'IV4', 'IV5']);
  ['IV6', 'IV7'].forEach((id, i) => p(id, i ? 'male' : 'female', 4)); kids(u2, ['IV6', 'IV7']);
  ['IV8', 'IV9', 'IV10'].forEach((id, i) => p(id, i ? 'female' : 'male', 4)); kids(u3, ['IV8', 'IV9', 'IV10']);
  ['IV11', 'IV12'].forEach((id, i) => p(id, i ? 'male' : 'female', 4)); kids(u4, ['IV11', 'IV12']);
  return done();
}

/** CS-03 — proband married; the spouse's parents are also drawn (both partners have lineage). */
function cs03() {
  const g = cs01();
  const { p, u, kids, done } = makeBuilder();
  p('sp_f', 'male', 2); p('sp_m', 'female', 2); p('spouse', 'female', 3); p('spouse_sis', 'female', 3);
  kids(u('sp_f', 'sp_m'), ['spouse', 'spouse_sis']);
  kids(u('proband', 'spouse'), [p('child1', 'female', 4), p('child2', 'male', 4)]);
  const extra = done();
  return merge(g, extra);
}

/** CS-04 — proband's parents are first cousins (shared grandparents → one consanguinity loop). */
function cs04() {
  const { p, u, kids, done } = makeBuilder();
  p('ggf', 'male', 0); p('ggm', 'female', 0);
  p('gA', 'male', 1); p('gA_w', 'female', 1); p('gB', 'female', 1); p('gB_h', 'male', 1); p('gC', 'male', 1);
  kids(u('ggf', 'ggm'), ['gA', 'gB', 'gC']);
  p('father', 'male', 2); p('aunt', 'female', 2);
  kids(u('gA', 'gA_w'), ['father', 'aunt']);
  p('mother', 'female', 2); p('uncle', 'male', 2);
  kids(u('gB_h', 'gB'), ['uncle', 'mother']);
  kids(u('father', 'mother', CONSANG), [p('sib1', 'female', 3), p('proband', 'male', 3, { proband: true, affected: true }), p('sib2', 'male', 3)]);
  return done();
}

/** CS-05 — double first cousins: two brothers marry two sisters; their children marry. */
function cs05() {
  const { p, u, kids, done } = makeBuilder();
  p('A_gf', 'male', 0); p('A_gm', 'female', 0); p('B_gf', 'male', 0); p('B_gm', 'female', 0);
  p('a1', 'male', 1); p('a2', 'male', 1); kids(u('A_gf', 'A_gm'), ['a1', 'a2']);
  p('b1', 'female', 1); p('b2', 'female', 1); kids(u('B_gf', 'B_gm'), ['b1', 'b2']);
  const u1 = u('a1', 'b1'); const u2 = u('a2', 'b2');
  kids(u1, [p('c1', 'male', 2), p('c1b', 'female', 2)]);
  kids(u2, [p('c2', 'female', 2), p('c2b', 'male', 2)]);
  kids(u('c1', 'c2', CONSANG), [p('proband', 'female', 3, { proband: true, affected: true }), p('sib', 'male', 3)]);
  return done();
}

/** CS-06 — one man with three partners, children with each (maternal half-sibs). */
function cs06() {
  const { p, u, kids, done } = makeBuilder();
  p('gf', 'male', 1); p('gm', 'female', 1);
  p('man', 'male', 2); p('man_sis', 'female', 2); kids(u('gf', 'gm'), ['man_sis', 'man']);
  p('w1', 'female', 2); p('w2', 'female', 2); p('w3', 'female', 2);
  kids(u('man', 'w1', { status: 'divorced' }), [p('k1a', 'male', 3), p('k1b', 'female', 3)]);
  kids(u('man', 'w2', { status: 'divorced' }), [p('k2a', 'female', 3)]);
  kids(u('man', 'w3'), [p('k3a', 'male', 3, { proband: true }), p('k3b', 'male', 3), p('k3c', 'female', 3)]);
  return done();
}

/** CS-07 — blended family: both partners have children from previous relationships plus joint children. */
function cs07() {
  const { p, u, kids, done } = makeBuilder();
  p('him', 'male', 2); p('her', 'female', 2); p('his_ex', 'female', 2); p('her_ex', 'male', 2);
  kids(u('him', 'his_ex', { status: 'divorced' }), [p('his_k1', 'male', 3), p('his_k2', 'female', 3)]);
  kids(u('her_ex', 'her', { status: 'divorced' }), [p('her_k1', 'female', 3)]);
  kids(u('him', 'her'), [p('joint1', 'male', 3, { proband: true }), p('joint2', 'female', 3)]);
  p('him_f', 'male', 1); p('him_m', 'female', 1); kids(u('him_f', 'him_m'), ['him']);
  p('her_f', 'male', 1); p('her_m', 'female', 1); kids(u('her_f', 'her_m'), ['her']);
  return done();
}

/** CS-08 — 12-child sibship, every child married with two children. */
function cs08() {
  const { p, u, kids, done } = makeBuilder();
  p('gf', 'male', 1); p('gm', 'female', 1);
  const sibs = [];
  for (let i = 0; i < 12; i++) sibs.push(p(`s${i}`, i % 2 ? 'female' : 'male', 2, i === 5 ? { proband: true } : {}));
  kids(u('gf', 'gm'), sibs);
  sibs.forEach((s, i) => {
    const sp = p(`${s}_sp`, i % 2 ? 'male' : 'female', 2);
    const un = i % 2 ? u(sp, s) : u(s, sp);
    kids(un, [p(`${s}_c1`, 'male', 3), p(`${s}_c2`, 'female', 3)]);
  });
  return done();
}

/** CS-09 — six generations: direct line plus a collateral branch at every level. */
function cs09() {
  const { p, u, kids, done } = makeBuilder();
  let prevUnion = null;
  for (let g = 0; g < 6; g++) {
    const m = p(`m${g}`, 'male', g); const f = p(`f${g}`, 'female', g);
    if (prevUnion) {
      // m{g} is a child of the previous couple; a collateral sibling has their own family.
      const col = p(`col${g}`, g % 2 ? 'female' : 'male', g);
      kids(prevUnion, [m, col]);
      const colSp = p(`col${g}_sp`, g % 2 ? 'male' : 'female', g);
      const colU = u(col, colSp);
      kids(colU, [p(`col${g}_k`, 'female', g + 1)]);
    }
    prevUnion = u(m, f);
  }
  kids(prevUnion, [p('proband', 'male', 6, { proband: true })]);
  return done();
}

/** CS-10 — repeated consanguinity: first-cousin marriage in gen 2 AND again in gen 4. */
function cs10() {
  const g = cs04();
  const { p, u, kids, done } = makeBuilder();
  // proband (gen3) marries a first cousin: child of 'aunt' (father's sister)
  p('aunt_h', 'male', 2);
  const ua = u('aunt_h', 'aunt');
  p('cousin', 'female', 3);
  kids(ua, ['cousin', p('cousin2', 'male', 3)]);
  kids(u('proband', 'cousin', CONSANG), [p('child1', 'male', 4, { affected: true }), p('child2', 'female', 4)]);
  return merge(g, done());
}

/** CS-11 — exchange marriage (berdel): two siblings of family A marry two siblings of family B. */
function cs11() {
  const { p, u, kids, done } = makeBuilder();
  p('A_f', 'male', 1); p('A_m', 'female', 1); p('B_f', 'male', 1); p('B_m', 'female', 1);
  p('a_son', 'male', 2); p('a_dau', 'female', 2); kids(u('A_f', 'A_m'), ['a_son', 'a_dau']);
  p('b_son', 'male', 2); p('b_dau', 'female', 2); kids(u('B_f', 'B_m'), ['b_son', 'b_dau']);
  kids(u('a_son', 'b_dau'), [p('x1', 'male', 3, { proband: true }), p('x2', 'female', 3)]);
  kids(u('b_son', 'a_dau'), [p('y1', 'female', 3), p('y2', 'male', 3)]);
  return done();
}

/**
 * CS-12 — pedigree collapse with two consanguinity loops: the paternal
 * grandparents are first cousins (shared great-great-grandparents R), and the
 * parents are first cousins (mother's mother is the paternal grandfather's sister).
 */
function cs12() {
  const { p, u, kids, done } = makeBuilder();
  p('R_f', 'male', -1); p('R_m', 'female', -1);
  p('o1', 'male', 0); p('o2', 'female', 0); kids(u('R_f', 'R_m'), ['o1', 'o2']);
  p('o1_w', 'female', 0); p('o2_h', 'male', 0);
  p('pgf', 'male', 1); p('pgf_sis', 'female', 1); kids(u('o1', 'o1_w'), ['pgf', 'pgf_sis']);
  p('pgm', 'female', 1); kids(u('o2_h', 'o2'), ['pgm']);
  p('mgf', 'male', 1);
  p('father', 'male', 2); p('aunt', 'female', 2); kids(u('pgf', 'pgm', CONSANG), ['father', 'aunt']);
  p('mother', 'female', 2); kids(u('mgf', 'pgf_sis'), ['mother']);
  kids(u('father', 'mother', CONSANG), [p('proband', 'male', 3, { proband: true, affected: true }), p('sib', 'female', 3)]);
  return done();
}

/** CS-13 — half-siblings through BOTH parents (each parent has a child from an earlier union). */
function cs13() {
  const { p, u, kids, done } = makeBuilder();
  p('mum', 'female', 2); p('dad', 'male', 2); p('mum_ex', 'male', 2); p('dad_ex', 'female', 2);
  kids(u('mum_ex', 'mum', { status: 'separated' }), [p('mh1', 'female', 3)]);
  kids(u('dad', 'dad_ex', { status: 'divorced' }), [p('dh1', 'male', 3), p('dh2', 'male', 3)]);
  kids(u('dad', 'mum'), [p('proband', 'female', 3, { proband: true })]);
  return done();
}

function merge(a, b) {
  return {
    individuals: [...a.individuals, ...b.individuals],
    unions: [...a.unions, ...b.unions],
    parentChildRelationships: [...a.parentChildRelationships, ...b.parentChildRelationships],
  };
}

export const CLINICAL_FIXTURES = [
  { id: 'CS-01', name: 'Üç kuşak başlangıç', build: cs01 },
  { id: 'CS-02', name: 'Ders kitabı OD pedigrisi (4 kuşak, 7 kardeş, gelin/damatlar)', build: cs02 },
  { id: 'CS-03', name: 'Eşin ebeveynleri de çizili', build: cs03 },
  { id: 'CS-04', name: 'Ebeveynler birinci kuzen', build: cs04 },
  { id: 'CS-05', name: 'Çift birinci kuzen evliliği', build: cs05 },
  { id: 'CS-06', name: 'Üç partner, yarım kardeşler', build: cs06 },
  { id: 'CS-07', name: 'Harmanlanmış aile (iki tarafın önceki çocukları)', build: cs07 },
  { id: 'CS-08', name: '12 çocuklu kardeşlik, her biri evli ve çocuklu', build: cs08 },
  { id: 'CS-09', name: 'Altı kuşak + her kuşakta yan dal', build: cs09 },
  { id: 'CS-10', name: 'Tekrarlayan akraba evliliği (2. ve 4. kuşak)', build: cs10 },
  { id: 'CS-11', name: 'Berdel (karşılıklı evlilik)', build: cs11 },
  { id: 'CS-12', name: 'Pedigri çökmesi (iki akrabalık döngüsü)', build: cs12 },
  { id: 'CS-13', name: 'İki ebeveyn tarafından yarım kardeşler', build: cs13 },
];
