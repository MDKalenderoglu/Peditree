/**
 * structure.js — PCL step 1: graph → generation rows made of "atoms".
 *
 * An atom is the unit the ordering step moves around; its internal order is
 * fixed:
 *   - sibship atom: the children of one union, in birth order (NSGC: siblings
 *     left→right oldest→youngest — a hard rule), with each child's married-in
 *     spouses (partners who have no parents in the graph) inserted beside them
 *     (Tores & Barillot rule c: married-in spouses may sit inside a sibship);
 *   - founder atom: people with no parents in the graph who are not married
 *     into a sibship (top-generation couples, a spouse's parents, isolated
 *     individuals), arranged as a couple / multi-partner group.
 *
 * Every individual belongs to exactly one atom. Partners who both have
 * parents (convergent / consanguineous / in-law marriages) live in two
 * different atoms; bringing them together is the ordering step's job.
 */

export function buildStructure(graph) {
  const individuals = graph.individuals || [];
  const unions = graph.unions || [];
  const pcrs = graph.parentChildRelationships || [];

  const indById = new Map(individuals.map(i => [i.id, i]));
  const dataIndex = new Map(individuals.map((i, k) => [i.id, k]));
  const unionById = new Map(unions.map(u => [u.id, u]));

  const parentUnion = new Map();
  const childrenOf = new Map();
  for (const rel of pcrs) {
    if (!unionById.has(rel.unionId)) continue;
    const kids = rel.children.filter(c => indById.has(c) && !parentUnion.has(c));
    kids.forEach(c => parentUnion.set(c, rel.unionId));
    if (kids.length) childrenOf.set(rel.unionId, [...(childrenOf.get(rel.unionId) || []), ...kids]);
  }

  const partnerUnions = new Map(individuals.map(i => [i.id, []]));
  for (const u of unions) {
    if (!u.partners || u.partners.length !== 2) continue;
    if (!indById.has(u.partners[0]) || !indById.has(u.partners[1])) continue;
    for (const p of u.partners) partnerUnions.get(p).push(u.id);
  }
  const partnerIn = (uid, id) => {
    const u = unionById.get(uid);
    return u.partners[0] === id ? u.partners[1] : u.partners[0];
  };
  const isPartners = (a, b) => (partnerUnions.get(a) || []).some(uid => partnerIn(uid, a) === b);

  // ── atoms ─────────────────────────────────────────────────────
  const atoms = [];
  const personAtom = new Map();
  const spousesOf = new Map(); // anchor person → married-in spouses attached beside them

  for (const u of unions) {
    const kids = childrenOf.get(u.id);
    if (!kids || !kids.length) continue;
    const atom = { id: atoms.length, kind: 'sib', unionId: u.id, core: kids.slice() };
    atoms.push(atom);
    kids.forEach(k => personAtom.set(k, atom.id));
  }

  // Attach married-in founders next to a partner who is already placed,
  // repeating until stable (a founder married to a married-in spouse attaches
  // in the second pass).
  const founders = individuals.filter(i => !parentUnion.has(i.id)).map(i => i.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of founders) {
      if (personAtom.has(f)) continue;
      // Only beside a partner on the same generation row; a cross-generation
      // partner (not creatable today) must not pull someone onto the wrong row.
      const genOf = (id) => (indById.get(id) || {}).generation;
      const anchor = (partnerUnions.get(f) || []).map(uid => partnerIn(uid, f))
        .find(p => personAtom.has(p) && genOf(p) === genOf(f));
      if (anchor === undefined) continue;
      if (!spousesOf.has(anchor)) spousesOf.set(anchor, []);
      spousesOf.get(anchor).push(f);
      personAtom.set(f, personAtom.get(anchor));
      changed = true;
    }
  }

  // Remaining founders form founder atoms by partnership among themselves.
  const remaining = founders.filter(f => !personAtom.has(f));
  const groupOf = new Map();
  const find = (a) => { while (groupOf.get(a) !== a) a = groupOf.get(a); return a; };
  remaining.forEach(f => groupOf.set(f, f));
  for (const u of unions) {
    const [a, b] = u.partners || [];
    if (groupOf.has(a) && groupOf.has(b)) {
      const ra = find(a), rb = find(b);
      if (ra !== rb) {
        const [keep, drop] = dataIndex.get(ra) < dataIndex.get(rb) ? [ra, rb] : [rb, ra];
        groupOf.set(drop, keep);
      }
    }
  }
  const groups = new Map();
  for (const f of remaining) {
    const r = find(f);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(f);
  }
  for (const members of groups.values()) {
    // centre = the member with most partners in the group (ties: data order)
    const degree = (m) => members.filter(o => o !== m && isPartners(m, o)).length;
    const centre = members.slice().sort((a, b) => (degree(b) - degree(a)) || (dataIndex.get(a) - dataIndex.get(b)))[0];
    const atom = { id: atoms.length, kind: 'founder', unionId: null, core: [centre] };
    atoms.push(atom);
    personAtom.set(centre, atom.id);
    for (const m of members) {
      if (m === centre) continue;
      personAtom.set(m, atom.id);
      if (isPartners(centre, m)) {
        if (!spousesOf.has(centre)) spousesOf.set(centre, []);
        spousesOf.get(centre).push(m);
      } else {
        atom.core.push(m); // chains beyond one centre: keep in data order
      }
    }
  }

  // ── person order inside each atom ────────────────────────────
  // Married-in spouses go beside their partner; first spouse on the side the
  // soft NSGC convention prefers (man left of woman), further spouses
  // alternate sides and move outward.
  const sexOf = (id) => (indById.get(id) || {}).sex;
  const blockOf = new Map();
  for (const atom of atoms) {
    for (const p of atom.core) {
      const sp = spousesOf.get(p) || [];
      const prefLeft = sexOf(p) === 'female';
      const left = [], right = [];
      sp.forEach((s, k) => {
        const goLeft = k % 2 === 0 ? prefLeft : !prefLeft;
        (goLeft ? left : right).push(s);
      });
      blockOf.set(p, [...left.reverse(), p, ...right]);
    }
    atom.persons = atom.core.flatMap(p => blockOf.get(p));
    atom.gen = (indById.get(atom.core[0]) || {}).generation ?? 0;
  }

  // ── sibships whose birth order is not known ──────────────────
  // NSGC draws siblings oldest→youngest when birth order is known: the user
  // set it ("Doğum Sırası", PCR.birthOrderExplicit) or every sibling has an
  // age. Otherwise the stored order is only insertion order (e.g. the father
  // is always stored first among his brothers), and the standard practice
  // (kinship2 "autohint") is to put a sibling who married into another
  // family at the end of the sibship facing that spouse, so the couple's
  // line stays short. Such atoms get alternative arrangements; the ordering
  // step picks one. An arrangement never contradicts known ages.
  const explicitOrder = new Set(pcrs.filter(r => r.birthOrderExplicit).map(r => r.unionId));
  const ageOf = (id) => {
    const ind = indById.get(id) || {};
    if (ind.pregnancyLoss || ind.stillbirth) return null;
    const a = parseInt(ind.age, 10);
    return Number.isFinite(a) ? a : null;
  };
  const agesConsistent = (core) => {
    let prev = Infinity;
    for (const p of core) {
      const a = ageOf(p);
      if (a === null) continue;
      if (a > prev) return false;
      prev = a;
    }
    return true;
  };
  const genOfId = (id) => (indById.get(id) || {}).generation;
  // A sibling "links" outward if they, or any descendant, married someone
  // from another drawn family (a partner in a different atom on their row).
  // Such a sibling at the end of the sibship lets that other family sit
  // beside this branch instead of across it.
  const directLink = (p) => (partnerUnions.get(p) || []).some(uid => {
    const q = partnerIn(uid, p);
    return personAtom.get(q) !== personAtom.get(p) && genOfId(q) === genOfId(p);
  });
  const linkMemo = new Map();
  const links = (p) => {
    if (linkMemo.has(p)) return linkMemo.get(p);
    linkMemo.set(p, false); // loop guard
    let r = directLink(p);
    if (!r) {
      for (const uid of partnerUnions.get(p) || []) {
        if ((childrenOf.get(uid) || []).some(c => links(c))) { r = true; break; }
      }
    }
    linkMemo.set(p, r);
    return r;
  };
  for (const atom of atoms) {
    atom.arrangements = [atom.persons];
    if (atom.kind !== 'sib' || atom.core.length < 2 || explicitOrder.has(atom.unionId)) continue;
    if (atom.core.every(p => ageOf(p) !== null || (indById.get(p) || {}).pregnancyLoss || (indById.get(p) || {}).stillbirth)) continue;
    const direct = atom.core.filter(directLink);
    const linking = [...direct, ...atom.core.filter(p => !direct.includes(p) && links(p))].slice(0, 2);
    if (!linking.length) continue;
    const without = (ids) => atom.core.filter(p => !ids.includes(p));
    const cores = [];
    for (const l of linking) {
      cores.push([l, ...without([l])], [...without([l]), l]);
    }
    if (linking.length === 2) {
      const [a, b] = linking;
      const rest = without([a, b]);
      // one at each end, or both together at one end (e.g. the mother next
      // to the father, and beside her the brother whose daughter married
      // into the father's family)
      cores.push([a, ...rest, b], [b, ...rest, a], [...rest, a, b], [...rest, b, a], [a, b, ...rest], [b, a, ...rest]);
    }
    const seen = new Set([atom.core.join('|')]);
    for (const core of cores) {
      const key = core.join('|');
      if (seen.has(key) || !agesConsistent(core)) continue;
      seen.add(key);
      atom.arrangements.push(core.flatMap(p => blockOf.get(p)));
    }
  }

  // ── connected components (unrelated families are laid out side by side) ──
  const comp = new Map();
  let compCount = 0;
  const neighbours = (id) => {
    const out = [];
    for (const uid of partnerUnions.get(id) || []) {
      out.push(partnerIn(uid, id));
      for (const c of childrenOf.get(uid) || []) out.push(c);
    }
    const pu = parentUnion.get(id);
    if (pu) out.push(...unionById.get(pu).partners, ...(childrenOf.get(pu) || []));
    return out;
  };
  for (const ind of individuals) {
    if (comp.has(ind.id)) continue;
    const stack = [ind.id];
    comp.set(ind.id, compCount);
    while (stack.length) {
      const cur = stack.pop();
      for (const nb of neighbours(cur)) {
        if (indById.has(nb) && !comp.has(nb)) { comp.set(nb, compCount); stack.push(nb); }
      }
    }
    compCount++;
  }
  atoms.forEach(a => { a.component = comp.get(a.persons[0]); });

  const gens = [...new Set(atoms.map(a => a.gen))].sort((a, b) => a - b);

  return {
    individuals, unions, indById, unionById, dataIndex,
    parentUnion, childrenOf, partnerUnions, partnerIn, isPartners,
    atoms, personAtom, gens, componentCount: compCount, componentOf: comp,
  };
}
