/**
 * routing.js — PCL step 4: standard pedigree connectors from positions.
 *
 * Every emitted segment carries `unionId` (its owner), so readability checks,
 * highlighting and tests can reason about which family a line belongs to.
 *
 *   - Partners adjacent on their row: a straight relationship line between
 *     the symbols (NSGC standard).
 *   - Partners with people between them: a "relationship lane" above the row,
 *     between the symbols' tops and the row's sibship buses. It leaves each
 *     partner from the SIDE facing the other partner (a short stub, then a
 *     riser) — never from the top centre, where the partner's own descent line
 *     arrives — so it can never read as a continuation of that line. When that
 *     side is already used (an adjacent partner's line, or another lane), the
 *     riser starts from the top of the symbol, offset from the centre. Lanes
 *     on one row that overlap get different heights.
 *   - Line of descent from the relationship line (straight: anywhere on the
 *     line, preferably its midpoint; lane: inside a free gap between people)
 *     down to the family's own sibship bus. The exact x keeps a clearance from
 *     every other family's vertical line, so two families' lines never run
 *     together. Buses of one row that would overlap get different heights.
 *   - Any remaining crossing between lines of different families is marked
 *     with a line jump (`bridges` on the horizontal segment), which the
 *     renderer draws as a small arc: the two lines visibly do not connect.
 */
import { relationshipBackgroundToEdgeInfo } from '../../utils/relationshipBackground';

const NODE_HALF = 20;
const LOSS_HALF = 14;
const STUB = 8;
const TOP_RISER = 10;                  // first top-riser offset from the symbol centre
const TOP_RISER_STEP = 7;
// Vertical band above a row, measured from that row's y (see planBands):
//   … parent symbol and its annotations (they end 62 px below the parent row)
//   sibship buses: default −80; extra levels 20 px apart upwards
//   relationship lanes of this row: −46, −58, −70 … (12 px apart)
// (Stacked lines closer than this read as one thick line at the usual
// fit-to-screen zoom of ~0.5.)
//   −38 … −28  pedigree id label above the symbol; −20 symbol top
// When a row needs more levels than fit in the default 160 px row spacing,
// planBands() makes that gap taller instead of letting lines collide.
const SNAP_ONLY_CHILD = 12;   // px

export const BAND = {
  LANE_FIRST: 46, LANE_STEP: 12,
  BUS_DEFAULT: 80, BUS_STEP: 20, BUS_CLEAR_ABOVE_LANES: 18,
  PARENT_ANNOTATION: 62, CLEAR_BELOW_ANNOTATION: 8,
};
const SEP = 8;                         // horizontal clearance between parallel lanes / buses
const CLEAR = 8;                       // min distance between a descent line and a foreign vertical

const halfOf = (ind) => (ind && (ind.pregnancyLoss || ind.stillbirth)) ? LOSS_HALF : NODE_HALF;

function assignLevels(items, levels) {
  // greedy interval colouring, deterministic (items pre-sorted by x)
  const used = levels.map(() => []);
  for (const it of items) {
    let chosen = levels.length - 1;
    for (let l = 0; l < levels.length; l++) {
      if (used[l].every(([a, b]) => it.x2 + SEP <= a || it.x1 >= b + SEP)) { chosen = l; break; }
    }
    used[chosen].push([it.x1, it.x2]);
    it.level = levels[chosen];
  }
}

function levelCount(intervals) {
  const items = intervals.map(([x1, x2]) => ({ x1, x2 })).sort((p, q) => (p.x1 - q.x1) || (p.x2 - q.x2));
  const many = Array.from({ length: Math.max(1, items.length) }, (_, k) => k);
  assignLevels(items, many);
  return items.reduce((m, it) => Math.max(m, it.level + 1), 1);
}

/**
 * How many lane / bus levels each row needs, from tentative extents (lanes
 * span their partners; buses span the children and the parents' midpoint).
 * Used to make a crowded gap between two rows taller before routing.
 */
export function estimateLevelNeeds(S, rows, xPos) {
  const rowIndex = new Map();
  for (const [, ids] of rows) ids.forEach((id, k) => rowIndex.set(id, k));
  const lanes = new Map(), buses = new Map();
  for (const u of S.unions) {
    const [a, b] = u.partners || [];
    if (xPos[a] === undefined || xPos[b] === undefined) continue;
    const ga = S.indById.get(a).generation;
    if (ga !== S.indById.get(b).generation) continue;
    const ia = rowIndex.get(a), ib = rowIndex.get(b);
    if (Math.abs(ia - ib) > 1) {
      if (!lanes.has(ga)) lanes.set(ga, []);
      lanes.get(ga).push([Math.min(xPos[a], xPos[b]), Math.max(xPos[a], xPos[b])]);
    }
    const kids = (S.childrenOf.get(u.id) || []).filter(c => xPos[c] !== undefined);
    if (!kids.length) continue;
    const g = S.indById.get(kids[0]).generation;
    const mid = (xPos[a] + xPos[b]) / 2;
    const xs = kids.map(c => xPos[c]);
    if (!buses.has(g)) buses.set(g, []);
    buses.get(g).push([Math.min(mid, ...xs), Math.max(mid, ...xs)]);
  }
  const out = new Map();
  for (const g of rows.keys()) {
    out.set(g, {
      lanes: lanes.has(g) ? levelCount(lanes.get(g)) : 0,
      buses: buses.has(g) ? levelCount(buses.get(g)) : 0,
    });
  }
  return out;
}

/** Per-row band plan: lane / bus level offsets and the gap needed above the row. */
export function planBands(needs, minGap) {
  const plans = new Map();
  for (const [g, need] of needs) {
    const laneCount = Math.max(1, need.lanes) + 1;   // one spare level
    const busCount = Math.max(1, need.buses) + 1;
    const laneLevels = Array.from({ length: laneCount }, (_, i) => -(BAND.LANE_FIRST + BAND.LANE_STEP * i));
    const busBase = Math.max(BAND.BUS_DEFAULT, BAND.LANE_FIRST + BAND.LANE_STEP * (Math.max(1, need.lanes) - 1) + BAND.BUS_CLEAR_ABOVE_LANES);
    const busLevels = Array.from({ length: busCount }, (_, i) => -(busBase + BAND.BUS_STEP * i));
    const busTop = busBase + BAND.BUS_STEP * (Math.max(1, need.buses) - 1);
    const gap = Math.max(minGap, busTop + BAND.PARENT_ANNOTATION + BAND.CLEAR_BELOW_ANNOTATION);
    plans.set(g, { laneLevels, busLevels, gap });
  }
  return plans;
}

/** Point in [lo, hi] closest to `pref` that keeps CLEAR from every x in `avoid`; null if none. */
function clearPoint(lo, hi, pref, avoid) {
  if (hi < lo) return null;
  const ok = (x) => x >= lo - 1e-9 && x <= hi + 1e-9 && avoid.every(a => Math.abs(a - x) >= CLEAR);
  const candidates = [Math.min(hi, Math.max(lo, pref)), lo, hi];
  for (const a of avoid) candidates.push(a - CLEAR - 2, a + CLEAR + 2);
  let best = null;
  for (const c of candidates) {
    if (!ok(c)) continue;
    const better = best === null
      || Math.abs(c - pref) < Math.abs(best - pref)
      || (Math.abs(c - pref) === Math.abs(best - pref) && c < best);
    if (better) best = c;
  }
  return best;
}

export function routeConnectors(S, rows, xPos, yPos, plans) {
  const edges = [];
  const planOf = (g) => (plans && plans.get(g)) || planBands(new Map([[g, { lanes: 2, buses: 3 }]]), 160).get(g);
  const rowIndex = new Map();
  for (const [, ids] of rows) ids.forEach((id, k) => rowIndex.set(id, k));
  const rowOf = (id) => rows.get(S.indById.get(id).generation) || [];
  const hasKids = (uid) => (S.childrenOf.get(uid) || []).some(c => xPos[c] !== undefined);
  const unionBetween = (p, q) => S.unions.find(u => u.partners.includes(p) && u.partners.includes(q));

  // Verticals already committed (owner, x, y range) — descent lines keep clear of them.
  const verticals = [];

  // ── relationship lines ──
  const unionGeom = new Map(); // uid -> { y, prefX, lo, hi }
  const lanesByRow = new Map();
  for (const u of S.unions) {
    const [a, b] = u.partners || [];
    if (xPos[a] === undefined || xPos[b] === undefined) continue;
    const { edgeType } = relationshipBackgroundToEdgeInfo(u.relationshipBackground);
    const [l, r] = xPos[a] <= xPos[b] ? [a, b] : [b, a];
    const yl = yPos[l], yr = yPos[r];
    if (yl !== yr) {
      // Cross-generation partnership: not creatable through the UI today
      // (docs/PEDITREE_CLINICAL_REQUIREMENTS.md §4). Drawn as an explicit
      // elbow so it is at least never mistaken for a same-row union.
      const midY = (yl + yr) / 2;
      edges.push({ type: edgeType, x1: xPos[l], y1: yl, x2: xPos[l], y2: midY, unionId: u.id, relationshipBackground: u.relationshipBackground, crossGeneration: true });
      edges.push({ type: edgeType, x1: xPos[l], y1: midY, x2: xPos[r], y2: midY, unionId: u.id, relationshipBackground: u.relationshipBackground, crossGeneration: true });
      edges.push({ type: edgeType, x1: xPos[r], y1: midY, x2: xPos[r], y2: yr, unionId: u.id, relationshipBackground: u.relationshipBackground, crossGeneration: true });
      const m = (xPos[l] + xPos[r]) / 2;
      unionGeom.set(u.id, { y: midY, prefX: m, lo: m, hi: m });
      continue;
    }
    const y = yl;
    const row = rowOf(l);
    const between = row.slice(rowIndex.get(l) + 1, rowIndex.get(r));
    if (between.length === 0) {
      const x1 = xPos[l] + halfOf(S.indById.get(l));
      const x2 = xPos[r] - halfOf(S.indById.get(r));
      edges.push({ type: edgeType, x1, y1: y, x2, y2: y, unionId: u.id, relationshipBackground: u.relationshipBackground });
      unionGeom.set(u.id, { y, prefX: (xPos[l] + xPos[r]) / 2, lo: x1 + 6, hi: x2 - 6 });
    } else {
      const g = S.indById.get(l).generation;
      if (!lanesByRow.has(g)) lanesByRow.set(g, []);
      lanesByRow.get(g).push({ u, l, r, y, between, edgeType, x1: xPos[l], x2: xPos[r] });
    }
  }

  // Lanes: heights per row, then geometry.
  const sideUsed = new Set();   // `${person}|${dir}` — side stub taken
  const topRisers = new Map();  // `${person}|${dir}` → top risers already used
  for (const [g, lanes] of lanesByRow) {
    lanes.sort((p, q) => (p.x1 - q.x1) || (p.x2 - q.x2) || (p.u.id < q.u.id ? -1 : 1));
    assignLevels(lanes, planOf(g).laneLevels);
    for (const lane of lanes) {
      const { u, l, r, y, between, edgeType } = lane;
      const laneY = y + lane.level;
      const common = { type: edgeType, unionId: u.id, relationshipBackground: u.relationshipBackground };
      const attach = (p, dir) => {
        // dir = +1: the other partner is to the right; −1: to the left
        const key = `${p}|${dir}`;
        const neighbour = rowOf(p)[rowIndex.get(p) + dir];
        const sideTaken = sideUsed.has(key) || (neighbour !== undefined && S.isPartners(p, neighbour));
        const h = halfOf(S.indById.get(p));
        if (!sideTaken) {
          sideUsed.add(key);
          const sx = xPos[p] + dir * (h + STUB);
          edges.push({ ...common, x1: xPos[p] + dir * h, y1: y, x2: sx, y2: y });
          edges.push({ ...common, x1: sx, y1: y, x2: sx, y2: laneY });
          verticals.push({ owner: u.id, x: sx, y1: laneY, y2: y });
          return sx;
        }
        const k = topRisers.get(key) || 0;
        topRisers.set(key, k + 1);
        const tx = xPos[p] + dir * (TOP_RISER + k * TOP_RISER_STEP);
        edges.push({ ...common, x1: tx, y1: y - h, x2: tx, y2: laneY });
        verticals.push({ owner: u.id, x: tx, y1: laneY, y2: y - h });
        return tx;
      };
      const lx = attach(l, +1);
      const rx = attach(r, -1);
      edges.push({ ...common, x1: lx, y1: laneY, x2: rx, y2: laneY, lane: true });

      // Where the line of descent may leave the lane: a free gap between two
      // consecutive people (never through a symbol). A gap between partners
      // who have children is usable only away from their own descent line.
      const mid = (xPos[l] + xPos[r]) / 2;
      const seq = [l, ...between, r];
      let best = null;
      for (let k = 0; k + 1 < seq.length; k++) {
        const p = seq[k], q = seq[k + 1];
        const lo = Math.max(xPos[p] + halfOf(S.indById.get(p)) + 6, lx + 4);
        const hi = Math.min(xPos[q] - halfOf(S.indById.get(q)) - 6, rx - 4);
        if (hi <= lo) continue;
        const pu = S.isPartners(p, q) ? unionBetween(p, q) : null;
        const avoid = pu && hasKids(pu.id) ? [(xPos[p] + xPos[q]) / 2] : [];
        const cx = clearPoint(lo, hi, mid, avoid);
        if (cx === null) continue;
        if (best === null || Math.abs(cx - mid) < Math.abs(best.x - mid)) best = { x: cx, lo, hi };
      }
      if (!best) {
        // No free gap at all (e.g. four people married around in a ring):
        // descend just inside a lane end, beside its own riser.
        const x = lx + Math.sign(rx - lx) * (CLEAR + 2);
        best = { x, lo: x, hi: x };
      }
      unionGeom.set(u.id, { y: laneY, prefX: best.x, lo: best.lo, hi: best.hi });
    }
  }

  // Ended relationship marker on the relationship line.
  for (const u of S.unions) {
    const geom = unionGeom.get(u.id);
    if (!geom) continue;
    if (u.status === 'divorced' || u.status === 'separated') {
      edges.push({ type: 'divorceSlash', x: geom.prefX, y: geom.y, status: u.status, unionId: u.id });
    }
  }

  // ── lines of descent, sibship buses, stems ──
  const buses = [];
  for (const u of S.unions) {
    const geom = unionGeom.get(u.id);
    const kids = (S.childrenOf.get(u.id) || []).filter(c => xPos[c] !== undefined);
    if (!geom || !kids.length) continue;
    const childY = Math.min(...kids.map(c => yPos[c]));
    const xs = kids.map(c => xPos[c]);
    // An only child a few px off the couple's midpoint (solver tolerance)
    // gets a straight line of descent instead of a tiny jog, as long as the
    // drop still starts on the couple's own line.
    const only = xs.length === 1 && xs[0] >= geom.lo && xs[0] <= geom.hi && Math.abs(xs[0] - geom.prefX) <= SNAP_ONLY_CHILD;
    const pref = only ? xs[0] : geom.prefX;
    buses.push({ u, geom, kids, childY, kidMin: Math.min(...xs), kidMax: Math.max(...xs), dropX: pref, pref });
  }
  const layoutBuses = () => {
    const byRow = new Map();
    for (const b of buses) {
      b.x1 = Math.min(b.kidMin, b.dropX);
      b.x2 = Math.max(b.kidMax, b.dropX);
      if (!byRow.has(b.childY)) byRow.set(b.childY, []);
      byRow.get(b.childY).push(b);
    }
    for (const [childY, list] of byRow) {
      list.sort((p, q) => (p.x1 - q.x1) || (p.x2 - q.x2) || (p.u.id < q.u.id ? -1 : 1));
      const g = S.indById.get(list[0].kids[0]).generation;
      assignLevels(list, planOf(g).busLevels);
      for (const b of list) b.busY = childY + b.level;
    }
  };
  layoutBuses();

  // Clearance: a descent line must not run along another family's vertical
  // line (a stem, another descent line, a lane riser) over a shared height.
  const overlapsY = (a1, a2, b1, b2) => Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2)) > 0;
  for (let pass = 0; pass < 3; pass++) {
    const stems = buses.flatMap(b => b.kids.map(c => ({ owner: b.u.id, x: xPos[c], y1: b.busY, y2: yPos[c] })));
    let moved = false;
    for (const b of buses) {
      const avoid = [
        ...[...verticals, ...stems].filter(v => v.owner !== b.u.id && overlapsY(v.y1, v.y2, b.geom.y, b.busY)).map(v => v.x),
        ...buses.filter(o => o !== b && overlapsY(o.geom.y, o.busY, b.geom.y, b.busY)).map(o => o.dropX),
      ];
      if (avoid.every(a => Math.abs(a - b.dropX) >= CLEAR)) continue;
      const x = clearPoint(b.geom.lo, b.geom.hi, b.pref, avoid);
      if (x !== null && x !== b.dropX) { b.dropX = x; moved = true; }
    }
    if (!moved) break;
    layoutBuses();
  }

  for (const b of buses) {
    const { u, geom, kids, busY } = b;
    edges.push({ type: 'parentChildDrop', x1: b.dropX, y1: geom.y, x2: b.dropX, y2: busY, unionId: u.id });
    if (b.x2 > b.x1) edges.push({ type: 'sibship', x1: b.x1, y1: busY, x2: b.x2, y2: busY, unionId: u.id });
    for (const c of kids) {
      edges.push({ type: 'childStem', x1: xPos[c], y1: busY, x2: xPos[c], y2: yPos[c] - halfOf(S.indById.get(c)), unionId: u.id, childId: c });
    }
  }

  addLineJumps(edges);
  return edges;
}

/** Mark every crossing between lines of different families with a jump on the horizontal line. */
const STRUCTURAL = new Set(['union', 'consanguineousUnion', 'consanguineousUnionUnresolved', 'parentChildDrop', 'sibship', 'childStem']);
function addLineJumps(edges) {
  const horiz = [], vert = [];
  for (const e of edges) {
    if (!STRUCTURAL.has(e.type) || e.x1 === undefined) continue;
    if (e.y1 === e.y2 && e.x1 !== e.x2) horiz.push(e);
    else if (e.x1 === e.x2 && e.y1 !== e.y2) vert.push(e);
  }
  for (const h of horiz) {
    const hx1 = Math.min(h.x1, h.x2), hx2 = Math.max(h.x1, h.x2);
    for (const v of vert) {
      if (v.unionId === h.unionId) continue;
      const vy1 = Math.min(v.y1, v.y2), vy2 = Math.max(v.y1, v.y2);
      if (v.x1 > hx1 + 1 && v.x1 < hx2 - 1 && h.y1 > vy1 + 1 && h.y1 < vy2 - 1) {
        if (!h.bridges) h.bridges = [];
        if (!h.bridges.includes(v.x1)) h.bridges.push(v.x1);
      }
    }
    if (h.bridges) h.bridges.sort((a, b) => a - b);
  }
}
