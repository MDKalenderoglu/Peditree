/**
 * largePedigrees.js — deterministic generator of realistic large pedigrees
 * for layout performance and quality measurement. Synthetic only (no real
 * patient data).
 *
 * Shape, typical of an extended clinical pedigree from a population where
 * consanguinity is common:
 *   - one founder couple, descendants over several generations, sibships of
 *     1–6 in birth order;
 *   - most adults married to a married-in spouse (no parents drawn);
 *   - some spouses drawn with their own parents and siblings (in-law family);
 *   - a few second marriages (half-siblings);
 *   - a few consanguineous unions between first or second cousins, each a
 *     genuine loop through shared ancestors that exist in the graph.
 * Partners are always of opposite sex (current product rule).
 *
 * Contrast with the fuzz model (fuzzModel.js), which applies random editor
 * operations and produces adversarial shapes (30-child sibships, many
 * cross-branch marriages) that test robustness rather than typical use.
 */
import { makeRng, seedToInt } from './prng.js';

/**
 * @param {{ seed?: string|number, target?: number, loops?: number }} [opts]
 *   target: approximate number of individuals; loops: consanguineous unions
 * @returns {{ individuals: Array, unions: Array, parentChildRelationships: Array }}
 */
export function makeLargePedigree({ seed = 1, target = 100, loops = 3 } = {}) {
  const rng = makeRng(seedToInt(seed));
  const individuals = [];
  const unions = [];
  const pcrs = [];
  const indById = new Map();
  const parentsOf = new Map();   // child id → union id
  const married = new Set();
  let next = 1;

  const person = (sex, generation) => {
    const ind = { id: `L${next++}`, sex, generation, label: '' };
    individuals.push(ind);
    indById.set(ind.id, ind);
    return ind.id;
  };
  const other = (sex) => (sex === 'male' ? 'female' : 'male');
  const union = (a, b, extra = {}) => {
    const [m, f] = indById.get(a).sex === 'male' ? [a, b] : [b, a];
    const id = `U${unions.length + 1}`;
    unions.push({
      id, partners: [m, f], status: 'together', consanguinityStatus: 'none',
      relationshipBackground: 'not_asked', ...extra,
    });
    married.add(a); married.add(b);
    return id;
  };
  const children = (uid, generation, count) => {
    const kids = [];
    for (let k = 0; k < count; k++) {
      const c = person(rng.bool() ? 'male' : 'female', generation);
      parentsOf.set(c, uid);
      kids.push(c);
    }
    pcrs.push({ unionId: uid, children: kids });
    return kids;
  };
  const sibshipSize = () => 1 + rng.int(5) + (rng.bool(0.1) ? 1 : 0);

  // ── descent from one founder couple ──
  const f1 = person('male', 0);
  const f2 = person('female', 0);
  let frontier = [{ uid: union(f1, f2), generation: 0 }];
  const byGeneration = new Map();
  while (frontier.length && individuals.length < target) {
    const nextFrontier = [];
    for (const { uid, generation } of frontier) {
      if (individuals.length >= target) break;
      const kids = children(uid, generation + 1, sibshipSize());
      // at least one child of every sibship marries, so the family keeps
      // growing until it reaches the target size
      const mustMarry = kids[rng.int(kids.length)];
      for (const c of kids) {
        const g = generation + 1;
        if (!byGeneration.has(g)) byGeneration.set(g, []);
        byGeneration.get(g).push(c);
        if (individuals.length >= target || (c !== mustMarry && !rng.bool(0.6))) continue;
        const sex = indById.get(c).sex;
        const spouse = person(other(sex), g);
        if (rng.bool(0.15)) {
          // in-law family: the spouse's parents and one or two siblings
          const gp = union(person('male', g - 1), person('female', g - 1));
          const sibs = 1 + rng.int(2);
          const kidsOfGp = [spouse];
          for (let s = 0; s < sibs; s++) kidsOfGp.push(person(rng.bool() ? 'male' : 'female', g));
          // the spouse sits at a random birth position among their siblings
          const pos = rng.int(kidsOfGp.length);
          [kidsOfGp[0], kidsOfGp[pos]] = [kidsOfGp[pos], kidsOfGp[0]];
          kidsOfGp.forEach(k => parentsOf.set(k, gp));
          pcrs.push({ unionId: gp, children: kidsOfGp });
        }
        nextFrontier.push({ uid: union(c, spouse), generation: g });
        if (rng.bool(0.08)) {
          // second marriage → half-siblings
          const spouse2 = person(other(sex), g);
          const u2 = union(c, spouse2, { status: 'separated' });
          nextFrontier.push({ uid: u2, generation: g });
        }
      }
    }
    frontier = nextFrontier;
  }

  // ── consanguineous unions between cousins ──
  const grandUnions = (id) => {
    const pu = parentsOf.get(id);
    if (!pu) return new Set();
    const out = new Set();
    for (const p of unions.find(u => u.id === pu).partners) {
      const gpu = parentsOf.get(p);
      if (gpu) out.add(gpu);
    }
    return out;
  };
  const greatGrandUnions = (id) => {
    const pu = parentsOf.get(id);
    if (!pu) return new Set();
    const out = new Set();
    for (const p of unions.find(u => u.id === pu).partners) for (const g of grandUnions(p)) out.add(g);
    return out;
  };
  let made = 0;
  const gens = [...byGeneration.keys()].sort((a, b) => a - b);
  for (const g of gens.slice(1)) {
    const pool = byGeneration.get(g).filter(id => !married.has(id));
    for (let i = 0; i < pool.length && made < loops; i++) {
      for (let j = i + 1; j < pool.length && made < loops; j++) {
        const a = pool[i], b = pool[j];
        if (married.has(a) || married.has(b)) continue;
        if (indById.get(a).sex === indById.get(b).sex) continue;
        if (parentsOf.get(a) === parentsOf.get(b)) continue;
        const ga = grandUnions(a), gb = grandUnions(b);
        const first = [...ga].some(x => gb.has(x));
        const second = !first && [...greatGrandUnions(a)].some(x => greatGrandUnions(b).has(x));
        if (!first && !second) continue;
        const uid = union(a, b, {
          consanguineous: true, consanguinityStatus: 'known_supported',
          consanguinityDegree: first ? 'first_cousins' : 'second_cousins',
          relationshipBackground: 'consanguinity_structurally_supported',
        });
        children(uid, g + 1, 1 + rng.int(3));
        made++;
      }
    }
  }

  // ── proband: first child of the first consanguineous union, else the
  // first person of the deepest generation that has parents ──
  const consUnion = unions.find(u => u.consanguineous);
  const probandId = consUnion
    ? pcrs.find(r => r.unionId === consUnion.id).children[0]
    : [...parentsOf.keys()].sort((a, b) => indById.get(b).generation - indById.get(a).generation)[0];
  const proband = indById.get(probandId);
  proband.proband = true;
  proband.affected = true;

  return { individuals, unions, parentChildRelationships: pcrs };
}

/** Standard sizes used by the benchmark and the performance tests. */
export const LARGE_PEDIGREE_CASES = [
  { name: 'realistic-100', seed: 'large-100', target: 100, loops: 2 },
  { name: 'realistic-200', seed: 'large-200', target: 200, loops: 3 },
  { name: 'realistic-300', seed: 'large-300', target: 300, loops: 4 },
];
