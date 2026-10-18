/**
 * ordering.js — PCL step 2: left-to-right order of atoms in every generation.
 *
 * Constrained layer sweeps (Sugiyama-style barycentre ordering where whole
 * atoms move and their inner birth order never changes), followed by an
 * adjacent-swap ("transpose") local search. The objective counts what makes
 * a pedigree hard to read:
 *   - crossings between family descent lines of adjacent generations
 *     (each sibship atom is one edge from its parents' union midpoint);
 *   - people standing between two partners (their union line cannot be a
 *     short straight line and must be routed around / over them);
 *   - union length (keeps in-law families next to the person they married into).
 * Unrelated families (connected components) are ordered independently and
 * placed side by side. Deterministic: stable sorts, ties broken by atom id.
 */

// Weights (relative). A family-descent crossing makes two sibship buses
// overlap — the hardest thing to read — so it costs more than routing an
// existing relationship lane over a few more people. Under a lane, a person
// who has parents (a descent stem) adds a bridged crossing; a founder or
// married-in spouse (no stem) adds only length.
const W_CROSS = 10;
const W_ALIGN = 0.5;       // per slot of horizontal descent offset (sibship
                           // centre vs. its parents' union midpoint)
const W_LANE = 8;          // partners not adjacent at all
const W_UNDER_STEM = 4;    // each person with a descent stem under the lane
const W_UNDER_FREE = 0.5;  // each person without a stem under the lane
const W_SPAN = 0.25;       // adjacent partners: keep in-law families close
const W_SIDE = 1.5;        // a couple drawn woman-left-of-man (soft NSGC
                           // convention: man on the left). Mirror-image orders
                           // otherwise cost the same and the drawing could flip
                           // left/right after an unrelated edit; this keeps the
                           // orientation fixed (father left ⇒ paternal side left).
const W_LANE_SPAN = 1.5;   // per slot of a relationship lane: a line running
                           // across much of the drawing is hard to follow
const SWEEPS = 8;
const MAX_STARTS = 8;
const MAX_SIFT_PASSES = 4;
const MAX_TRANSPOSE_PASSES = 12;

function rowSequence(S, order, gen) {
  const seq = [];
  for (const aid of order.get(gen) || []) seq.push(...S.atoms[aid].persons);
  return seq;
}

function positionsFor(S, order) {
  // person -> fractional slot index; atoms separated by an extra half slot
  const pos = new Map();
  for (const gen of S.gens) {
    let k = 0;
    for (const aid of order.get(gen) || []) {
      for (const p of S.atoms[aid].persons) { pos.set(p, k); k += 1; }
      k += 0.5;
    }
  }
  return pos;
}

function atomCentre(S, aid, pos) {
  const ps = S.atoms[aid].persons;
  return (pos.get(ps[0]) + pos.get(ps[ps.length - 1])) / 2;
}

function unionMid(S, uid, pos) {
  const [a, b] = S.unionById.get(uid).partners;
  return (pos.get(a) + pos.get(b)) / 2;
}

/** Ordering cost (lower is better). */
export function orderingCost(S, order) {
  const pos = positionsFor(S, order);
  let cost = 0;
  for (const gen of S.gens) {
    const edges = [];
    for (const aid of order.get(gen) || []) {
      const atom = S.atoms[aid];
      if (atom.kind !== 'sib') continue;
      const [a, b] = S.unionById.get(atom.unionId).partners;
      if (!pos.has(a) || !pos.has(b)) continue;
      edges.push([unionMid(S, atom.unionId, pos), atomCentre(S, aid, pos)]);
    }
    for (const [top, bottom] of edges) cost += W_ALIGN * Math.abs(top - bottom);
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        if ((edges[i][0] - edges[j][0]) * (edges[i][1] - edges[j][1]) < 0) cost += W_CROSS;
      }
    }
  }
  const seqs = new Map(S.gens.map(g => [g, rowSequence(S, order, g)]));
  const idxIn = new Map();
  for (const [, seq] of seqs) seq.forEach((id, k) => idxIn.set(id, k));
  for (const u of S.unions) {
    const [a, b] = u.partners || [];
    if (!pos.has(a) || !pos.has(b)) continue;
    const ga = S.indById.get(a).generation, gb = S.indById.get(b).generation;
    if (ga !== gb) continue;
    const span = Math.abs(pos.get(a) - pos.get(b));
    const lo = Math.min(idxIn.get(a), idxIn.get(b)), hi = Math.max(idxIn.get(a), idxIn.get(b));
    if (hi - lo > 1) {
      cost += W_LANE + W_LANE_SPAN * span;
      const seq = seqs.get(ga);
      for (let k = lo + 1; k < hi; k++) cost += S.parentUnion.has(seq[k]) ? W_UNDER_STEM : W_UNDER_FREE;
    } else {
      cost += W_SPAN * span;
    }
    cost += sideCost(S, a, b, pos);
  }
  return cost;
}

function sideCost(S, a, b, pos) {
  const sa = S.indById.get(a).sex, sb = S.indById.get(b).sex;
  if (sa === 'male' && sb === 'female') return pos.get(a) > pos.get(b) ? W_SIDE : 0;
  if (sa === 'female' && sb === 'male') return pos.get(b) > pos.get(a) ? W_SIDE : 0;
  return 0;
}

function sortLayer(order, gen, keyOf) {
  const ids = order.get(gen) || [];
  const keyed = ids.map((aid, idx) => ({ aid, idx, key: keyOf(aid, idx) }));
  keyed.sort((p, q) => (p.key - q.key) || (p.idx - q.idx) || (p.aid - q.aid));
  order.set(gen, keyed.map(k => k.aid));
}

function cloneOrder(order) {
  return new Map([...order].map(([g, ids]) => [g, ids.slice()]));
}

/**
 * Incremental evaluator of orderingCost for one component. Moving atoms
 * within row g only changes the descent edges into g and into g+1 and the
 * relationship lines on row g, so local search re-evaluates just those
 * (`rowLocal`) instead of the whole drawing. total() equals orderingCost().
 */
class CostModel {
  constructor(S, gens, order) {
    this.S = S;
    this.gens = gens;
    this.order = order;
    this.pos = new Map();
    this.idx = new Map();
    this.seq = new Map();
    const inComp = new Set();
    for (const g of gens) for (const aid of order.get(g) || []) for (const p of S.atoms[aid].persons) inComp.add(p);
    this.edgesInto = new Map(gens.map(g => [g, []]));
    for (const g of gens) {
      for (const aid of order.get(g) || []) {
        const atom = S.atoms[aid];
        if (atom.kind !== 'sib') continue;
        const [a, b] = S.unionById.get(atom.unionId).partners;
        if (inComp.has(a) && inComp.has(b)) this.edgesInto.get(g).push({ aid, uid: atom.unionId });
      }
    }
    this.unionsIn = new Map(gens.map(g => [g, []]));
    for (const u of S.unions) {
      const [a, b] = u.partners || [];
      if (!inComp.has(a) || !inComp.has(b)) continue;
      const ga = S.indById.get(a).generation;
      if (ga !== S.indById.get(b).generation || !this.unionsIn.has(ga)) continue;
      this.unionsIn.get(ga).push(u);
    }
    for (const g of gens) this.layoutRow(g);
  }

  setOrder(order) {
    this.order = order;
    for (const g of this.gens) this.layoutRow(g);
  }

  layoutRow(g) {
    let k = 0;
    const seq = [];
    for (const aid of this.order.get(g) || []) {
      for (const p of this.S.atoms[aid].persons) {
        this.pos.set(p, k);
        this.idx.set(p, seq.length);
        seq.push(p);
        k += 1;
      }
      k += 0.5;
    }
    this.seq.set(g, seq);
  }

  edgeCost(childGen) {
    const list = this.edgesInto.get(childGen);
    if (!list || !list.length) return 0;
    const S = this.S, pos = this.pos;
    const tops = new Array(list.length), bottoms = new Array(list.length);
    let cost = 0;
    for (let i = 0; i < list.length; i++) {
      const [a, b] = S.unionById.get(list[i].uid).partners;
      tops[i] = (pos.get(a) + pos.get(b)) / 2;
      const ps = S.atoms[list[i].aid].persons;
      bottoms[i] = (pos.get(ps[0]) + pos.get(ps[ps.length - 1])) / 2;
      cost += W_ALIGN * Math.abs(tops[i] - bottoms[i]);
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if ((tops[i] - tops[j]) * (bottoms[i] - bottoms[j]) < 0) cost += W_CROSS;
      }
    }
    return cost;
  }

  unionCost(g) {
    const S = this.S, pos = this.pos, idx = this.idx;
    const seq = this.seq.get(g);
    let cost = 0;
    for (const u of this.unionsIn.get(g) || []) {
      const [a, b] = u.partners;
      const span = Math.abs(pos.get(a) - pos.get(b));
      const lo = Math.min(idx.get(a), idx.get(b)), hi = Math.max(idx.get(a), idx.get(b));
      if (hi - lo > 1) {
        cost += W_LANE + W_LANE_SPAN * span;
        for (let k = lo + 1; k < hi; k++) cost += S.parentUnion.has(seq[k]) ? W_UNDER_STEM : W_UNDER_FREE;
      } else {
        cost += W_SPAN * span;
      }
      cost += sideCost(S, a, b, pos);
    }
    return cost;
  }

  rowLocal(g) {
    return this.edgeCost(g) + this.edgeCost(g + 1) + this.unionCost(g);
  }

  total() {
    let c = 0;
    for (const g of this.gens) c += this.edgeCost(g) + this.unionCost(g);
    return c;
  }
}

/**
 * Order the atoms of one connected component.
 *
 * Barycentre sweeps are symmetric: they keep whatever left/right orientation
 * they start with (maternal side left or right, a collateral branch on one
 * side or the other). Because birth order inside an atom never flips, the
 * mirrored orientation is a genuinely different drawing — e.g. it decides
 * which partner's siblings a relationship lane has to pass over. So the
 * search is restarted from the data order, its full mirror, and partial
 * mirrors (rows up to each generation flipped), and the cheapest result wins.
 */
function orderComponent(S, atomIds, opts = {}) {
  const gens = [...new Set(atomIds.map(a => S.atoms[a].gen))].sort((a, b) => a - b);
  const flexible = atomIds.filter(a => (S.atoms[a].arrangements || []).length > 1);
  const base = new Map(gens.map(g => [g, atomIds.filter(a => S.atoms[a].gen === g).sort((a, b) => a - b)]));
  const tree = familyTreeOrder(S, atomIds, gens);
  const starts = [{ tree: false, flipUpTo: null }];
  if (gens.length > 0) starts.push({ tree: false, flipUpTo: gens[gens.length - 1] });
  for (const g of gens.slice(0, -1)) starts.push({ tree: false, flipUpTo: g });
  let best = null;
  const all = [{ tree: true, flipUpTo: null }, { tree: true, flipUpTo: gens[gens.length - 1] }, ...starts.slice(0, MAX_STARTS)];
  for (const st of all) {
    const from = st.tree ? tree : base;
    const init = new Map([...from].map(([g, ids]) => [g, st.flipUpTo !== null && g <= st.flipUpTo ? ids.slice().reverse() : ids.slice()]));
    for (const a of flexible) S.atoms[a].persons = S.atoms[a].arrangements[0];
    const r = searchFrom(S, gens, init, flexible, { keepInitial: st.tree });
    if (opts.debug) opts.debug.push({ flipUpTo: st.flipUpTo, cost: r.cost });
    if (best === null || r.cost < best.cost - 1e-9) best = r;
  }
  for (const a of flexible) S.atoms[a].persons = best.arrangement.get(a);
  return best;
}

/**
 * Depth-first family-tree order: each sibship followed by its members'
 * descendants, and the family a member married into (the spouse's sibship
 * and, if they are founders, the spouse's parents) placed right after the
 * member's own sibship. For a pedigree without loops this is the tidy-tree
 * order a person would draw; it is used as an extra starting point because
 * barycentre sweeps from the data order tend to strand in-law founders at
 * the end of their row.
 */
function familyTreeOrder(S, atomIds, gens) {
  const inComp = new Set(atomIds);
  const rows = new Map(gens.map(g => [g, []]));
  const placed = new Set();
  const place = (a) => {
    if (a === undefined || placed.has(a) || !inComp.has(a)) return false;
    placed.add(a);
    rows.get(S.atoms[a].gen).push(a);
    return true;
  };
  const visit = (a) => {
    if (!place(a)) return;
    const persons = S.atoms[a].persons;
    for (const p of persons) {
      for (const uid of S.partnerUnions.get(p) || []) {
        const q = S.partnerIn(uid, p);
        const qa = S.personAtom.get(q);
        if (qa === undefined || qa === a || placed.has(qa)) continue;
        const pu = S.parentUnion.get(q);
        if (pu) {
          const pa = S.personAtom.get(S.unionById.get(pu).partners[0]);
          if (pa !== undefined && S.atoms[pa].kind === 'founder') place(pa);
        }
        visit(qa);
      }
    }
    for (const p of persons) {
      for (const uid of S.partnerUnions.get(p) || []) {
        const kids = S.childrenOf.get(uid);
        if (kids && kids.length) visit(S.personAtom.get(kids[0]));
      }
    }
  };
  for (const g of gens) for (const a of atomIds.filter(x => S.atoms[x].gen === g).sort((x, y) => x - y)) visit(a);
  return rows;
}

function searchFrom(S, gens, init, flexible = [], opts = {}) {
  const order = init;
  const model = new CostModel(S, gens, order);
  // Sibships with unknown birth order: pick the cheapest arrangement, the
  // rest of the row held fixed (ties keep the current one).
  const flexByGen = new Map();
  for (const a of flexible) {
    const g = S.atoms[a].gen;
    if (!flexByGen.has(g)) flexByGen.set(g, []);
    flexByGen.get(g).push(a);
  }
  const arrange = () => {
    let gain = 0;
    for (const g of flexByGen.keys()) gain += arrangeRow(g);
    return gain;
  };
  function arrangeRow(g) {
    let gain = 0;
    {
      for (const a of flexByGen.get(g) || []) {
        const atom = S.atoms[a];
        const current = atom.persons;
        const before = model.rowLocal(g);
        let bestArr = current, bestHere = before;
        for (const arr of atom.arrangements) {
          if (arr === current) continue;
          atom.persons = arr;
          model.layoutRow(g);
          const c = model.rowLocal(g);
          if (c < bestHere - 1e-9) { bestHere = c; bestArr = arr; }
        }
        atom.persons = bestArr;
        model.layoutRow(g);
        gain += before - bestHere;
      }
    }
    return gain;
  }
  const pos = model.pos;
  const atomCentreNow = (aid) => atomCentre(S, aid, pos);

  for (const gen of opts.keepInitial ? [] : gens.slice(1)) {
    sortLayer(order, gen, (aid) => {
      const atom = S.atoms[aid];
      if (atom.kind === 'sib') {
        const [a, b] = S.unionById.get(atom.unionId).partners;
        if (pos.has(a) && pos.has(b)) return unionMid(S, atom.unionId, pos);
      }
      return Number.POSITIVE_INFINITY;
    });
    model.layoutRow(gen);
  }

  const partnerPull = (aid) => {
    let sum = 0, n = 0;
    for (const p of S.atoms[aid].persons) {
      for (const uid of S.partnerUnions.get(p) || []) {
        const q = S.partnerIn(uid, p);
        if (S.personAtom.get(q) === aid || !pos.has(q)) continue;
        if (S.indById.get(q).generation !== S.atoms[aid].gen) continue;
        sum += pos.get(q); n++;
      }
    }
    return n ? { mean: sum / n, n } : null;
  };

  const childPull = (aid) => {
    let sum = 0, n = 0;
    for (const p of S.atoms[aid].persons) {
      for (const uid of S.partnerUnions.get(p) || []) {
        const kids = S.childrenOf.get(uid);
        if (!kids || !kids.length) continue;
        const kidAtom = S.personAtom.get(kids[0]);
        if (kidAtom === undefined || !pos.has(kids[0])) continue;
        sum += atomCentreNow(kidAtom); n++;
      }
    }
    return n ? { mean: sum / n, n } : null;
  };

  const blend = (base, baseW, extra, extraW) => (extra ? (base * baseW + extra.mean * extraW * extra.n) / (baseW + extraW * extra.n) : base);

  // Sweeps also re-choose sibship arrangements row by row, so a flipped
  // sibship's descendants are re-sorted in the same sweep. The best-so-far
  // snapshot keeps the arrangements with the order.
  const arrangementNow = () => new Map(flexible.map(a => [a, S.atoms[a].persons]));
  let best = cloneOrder(order);
  let bestArrangement = arrangementNow();
  let bestCost = model.total();
  for (let it = 0; it < SWEEPS; it++) {
    // up: place each atom over its children (and towards its partners' atoms)
    for (const gen of gens.slice(0, -1).reverse()) {
      sortLayer(order, gen, (aid) => {
        const here = atomCentreNow(aid);
        const kids = childPull(aid);
        const base = kids ? kids.mean : here;
        return blend(base, kids ? kids.n : 1, partnerPull(aid), 0.75);
      });
      model.layoutRow(gen);
      arrangeRow(gen);
    }
    // down: place each sibship under its parents (and towards partners' atoms)
    for (const gen of gens.slice(1)) {
      sortLayer(order, gen, (aid) => {
        const atom = S.atoms[aid];
        let base = atomCentreNow(aid);
        let w = 1;
        if (atom.kind === 'sib') {
          const [a, b] = S.unionById.get(atom.unionId).partners;
          if (pos.has(a) && pos.has(b)) { base = unionMid(S, atom.unionId, pos); w = 2; }
        } else {
          const kids = childPull(aid);
          if (kids) { base = kids.mean; w = kids.n; }
        }
        return blend(base, w, partnerPull(aid), 0.75);
      });
      model.layoutRow(gen);
      arrangeRow(gen);
    }
    const c = model.total();
    if (c < bestCost - 1e-9) { bestCost = c; best = cloneOrder(order); bestArrangement = arrangementNow(); }
  }

  for (const [a, persons] of bestArrangement) S.atoms[a].persons = persons;
  model.setOrder(best);
  arrange();

  // Transpose: swap neighbouring atoms while it strictly lowers the cost.
  let improved = true;
  for (let pass = 0; improved && pass < MAX_TRANSPOSE_PASSES; pass++) {
    improved = false;
    if (arrange() > 1e-9) improved = true;
    for (const gen of gens) {
      const ids = best.get(gen);
      for (let i = 0; i + 1 < ids.length; i++) {
        const before = model.rowLocal(gen);
        [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]];
        model.layoutRow(gen);
        const after = model.rowLocal(gen);
        if (after < before - 1e-9) { bestCost += after - before; improved = true; }
        else { [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]]; model.layoutRow(gen); }
      }
    }
  }
  // Sifting (Matuszewski, Schönfeld & Molitor 1999): move each atom to the
  // cheapest position in its row, holding the rest fixed; repeat while it
  // helps. Escapes local optima that single neighbour swaps cannot.
  for (let pass = 0; pass < MAX_SIFT_PASSES; pass++) {
    let siftImproved = false;
    for (const gen of gens) {
      const row = best.get(gen);
      for (const aid of row.slice()) {
        const from = row.indexOf(aid);
        const before = model.rowLocal(gen);
        row.splice(from, 1);
        let bestPos = from;
        let bestHere = Infinity;
        for (let p = 0; p <= row.length; p++) {
          row.splice(p, 0, aid);
          model.layoutRow(gen);
          const c = model.rowLocal(gen);
          row.splice(p, 1);
          if (c < bestHere - 1e-9 || (Math.abs(c - bestHere) <= 1e-9 && p === from)) { bestHere = c; bestPos = p; }
        }
        row.splice(bestPos, 0, aid);
        model.layoutRow(gen);
        if (bestHere < before - 1e-9) { bestCost += bestHere - before; siftImproved = true; }
      }
    }
    if (arrange() > 1e-9) siftImproved = true;
    if (!siftImproved) break;
  }
  return {
    order: best, cost: model.total(),
    arrangement: new Map(flexible.map(a => [a, S.atoms[a].persons])),
  };
}

/**
 * @returns {{ order: Map<number, number[]>, cost: number, componentOrder: number[] }}
 *   order: generation → atom ids left to right (all components concatenated)
 */
export function orderLayers(S, opts = {}) {
  const byComp = new Map();
  for (const atom of S.atoms) {
    if (!byComp.has(atom.component)) byComp.set(atom.component, []);
    byComp.get(atom.component).push(atom.id);
  }
  const probandComp = (() => {
    const p = S.individuals.find(i => i.proband);
    return p ? S.componentOf.get(p.id) : null;
  })();
  const compOrder = [...byComp.keys()].sort((a, b) => {
    if (a === probandComp) return -1;
    if (b === probandComp) return 1;
    return (byComp.get(b).length - byComp.get(a).length) || (a - b);
  });

  const order = new Map(S.gens.map(g => [g, []]));
  let cost = 0;
  for (const c of compOrder) {
    const r = orderComponent(S, byComp.get(c), opts);
    cost += r.cost;
    for (const [g, ids] of r.order) order.get(g).push(...ids);
  }
  return { order, cost, componentOrder: compOrder };
}

// ── stable (edit-local) ordering — KI-2 ─────────────────────────────────
//
// After an edit, start from the order the clinician already sees (atoms
// keyed by their people's previous x) instead of a fresh search, and let
// only the atoms that contain affected people move ('local'), or every atom
// ('wide', previous order still preferred). Re-ordering a pre-existing atom
// costs W_INVERSION per pair drawn in a different left-right order than
// before — less than a descent crossing, so correctness still wins, but
// enough that ties and near-ties keep the drawing where it was.

const W_INVERSION = 3;

/**
 * @param {object} S  structure (buildStructure)
 * @param {{ prevX: Map<string, number>, freePersons: Set<string> | null }} stability
 *   freePersons null = 'wide' (every atom may move)
 */
export function orderLayersStable(S, { prevX, freePersons }) {
  const atomKey = new Map();
  for (const atom of S.atoms) {
    const xs = atom.persons.filter((p) => prevX.has(p)).map((p) => prevX.get(p));
    if (xs.length) atomKey.set(atom.id, xs.reduce((a, b) => a + b, 0) / xs.length);
  }
  const isNew = (aid) => S.atoms[aid].persons.some((p) => !prevX.has(p));
  const isFree = (aid) => freePersons === null || isNew(aid) || S.atoms[aid].persons.some((p) => freePersons.has(p));

  // estimate for atoms without a previous position: parents, then partners, then children
  const estimate = (aid) => {
    const atom = S.atoms[aid];
    if (atomKey.has(aid) && !isNew(aid)) return atomKey.get(aid);
    const xs = [];
    if (atom.kind === 'sib') {
      for (const p of S.unionById.get(atom.unionId).partners) if (prevX.has(p)) xs.push(prevX.get(p));
    }
    if (!xs.length) {
      for (const p of atom.persons) {
        for (const uid of S.partnerUnions.get(p) || []) {
          const q = S.partnerIn(uid, p);
          if (prevX.has(q)) xs.push(prevX.get(q));
          for (const c of S.childrenOf.get(uid) || []) if (prevX.has(c)) xs.push(prevX.get(c));
        }
      }
    }
    if (!xs.length && atomKey.has(aid)) return atomKey.get(aid);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.POSITIVE_INFINITY;
  };

  // arrangement closest to the previous order of the atom's known people
  for (const atom of S.atoms) {
    if (!atom.arrangements || atom.arrangements.length < 2) continue;
    const inv = (arr) => {
      const xs = arr.filter((p) => prevX.has(p)).map((p) => prevX.get(p));
      let n = 0;
      for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) if (xs[i] > xs[j]) n++;
      return n;
    };
    let best = atom.arrangements[0], bestInv = inv(best);
    for (const arr of atom.arrangements) { const v = inv(arr); if (v < bestInv) { best = arr; bestInv = v; } }
    atom.persons = best;
  }

  const order = new Map(S.gens.map((g) => [g, []]));
  for (const atom of S.atoms) order.get(atom.gen).push(atom.id);
  for (const g of S.gens) {
    const keyed = order.get(g).map((aid) => ({ aid, key: estimate(aid) }));
    keyed.sort((a, b) => (a.key - b.key) || (a.aid - b.aid));
    order.set(g, keyed.map((k) => k.aid));
  }

  const model = new CostModel(S, S.gens, order);
  const inversions = (g) => {
    const ids = order.get(g).filter((aid) => atomKey.has(aid) && !isNew(aid));
    let n = 0;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (atomKey.get(ids[i]) > atomKey.get(ids[j])) n++;
    return n;
  };
  // people of one atom drawn in a different left-right order than before
  // (e.g. a spouse moved to the partner's other side)
  const innerInversions = (g) => {
    let n = 0;
    for (const aid of order.get(g)) {
      const xs = S.atoms[aid].persons.filter((p) => prevX.has(p)).map((p) => prevX.get(p));
      for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) if (xs[i] > xs[j]) n++;
    }
    return n;
  };
  const local = (g) => model.rowLocal(g) + W_INVERSION * (inversions(g) + innerInversions(g));

  // A free atom may take any arrangement. An untouched atom may only change
  // the side a married-in spouse stands on (KI-8), keeping its sibling order,
  // and pays the inversion penalty for it: a removed crossing or relationship
  // lane outweighs it, a mere preference does not.
  const flexByGen = new Map();
  for (const atom of S.atoms) {
    if (!atom.arrangements || atom.arrangements.length < 2) continue;
    if (!isFree(atom.id) && new Set(atom.arrangementCore || []).size === atom.arrangements.length) continue;
    if (!flexByGen.has(atom.gen)) flexByGen.set(atom.gen, []);
    flexByGen.get(atom.gen).push(atom.id);
  }
  const allowed = (atom, arr) => {
    if (isFree(atom.id) || !atom.arrangementCore) return true;
    const cur = atom.arrangements.indexOf(atom.persons);
    return cur >= 0 && atom.arrangementCore[atom.arrangements.indexOf(arr)] === atom.arrangementCore[cur];
  };
  const arrange = () => {
    let gain = 0;
    for (const [g, list] of flexByGen) {
      for (const aid of list) {
        const atom = S.atoms[aid];
        const current = atom.persons;
        const before = local(g);
        let bestArr = current, bestHere = before;
        for (const arr of atom.arrangements) {
          if (arr === current || !allowed(atom, arr)) continue;
          atom.persons = arr;
          model.layoutRow(g);
          const c = local(g);
          if (c < bestHere - 1e-9) { bestHere = c; bestArr = arr; }
        }
        atom.persons = bestArr;
        model.layoutRow(g);
        gain += before - bestHere;
      }
    }
    return gain;
  };

  for (let pass = 0; pass < MAX_SIFT_PASSES + 2; pass++) {
    let improved = arrange() > 1e-9;
    for (const g of S.gens) {
      const row = order.get(g);
      for (let i = 0; i + 1 < row.length; i++) {
        if (!isFree(row[i]) && !isFree(row[i + 1])) continue;
        const before = local(g);
        [row[i], row[i + 1]] = [row[i + 1], row[i]];
        model.layoutRow(g);
        if (local(g) < before - 1e-9) improved = true;
        else { [row[i], row[i + 1]] = [row[i + 1], row[i]]; model.layoutRow(g); }
      }
      for (const aid of row.slice()) {
        if (!isFree(aid)) continue;
        const from = row.indexOf(aid);
        const before = local(g);
        row.splice(from, 1);
        let bestPos = from, bestHere = Infinity;
        for (let p = 0; p <= row.length; p++) {
          row.splice(p, 0, aid);
          model.layoutRow(g);
          const c = local(g);
          row.splice(p, 1);
          if (c < bestHere - 1e-9 || (Math.abs(c - bestHere) <= 1e-9 && p === from)) { bestHere = c; bestPos = p; }
        }
        row.splice(bestPos, 0, aid);
        model.layoutRow(g);
        if (bestHere < before - 1e-9) improved = true;
      }
    }
    if (!improved) break;
  }
  return { order, cost: model.total() };
}
