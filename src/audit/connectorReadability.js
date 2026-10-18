/**
 * connectorReadability.js — connector-ownership readability detectors.
 *
 * The 13 invariants in layoutInvariants.js prove that no connector passes
 * THROUGH a symbol and that no two families' child buses are merged. They do
 * not measure the failure clinical QA actually reported: a line of one family
 * visually touching, crossing or running along a line of another family, so a
 * reader cannot tell which couple a child belongs to or who is married to whom.
 * A layout can pass all 13 invariants and still be clinically ambiguous (see
 * docs/PEDITREE_AUDIT_REPORT.md, LY-2/LY-3).
 *
 * Every structural connector carries the id of the union that owns it
 * (`unionId`, set by pedigreeLayoutV2). Two segments with different owners
 * must never:
 *   - FOREIGN_CONNECTOR_CROSSING  cross at an interior point without an
 *                                 explicit line-jump marker (`bridges`);
 *   - COLLINEAR_FOREIGN_CONNECTORS run along each other (same row/column,
 *                                 overlapping extent) — they read as one line;
 *   - FOREIGN_T_JUNCTION          meet end-to-segment, which reads as an
 *                                 attachment (a child hanging from the wrong
 *                                 line, a union line ending on a bus).
 *
 * readabilityMetrics() reports softer quality measures (couple centring,
 * union line length, crossings, width) used to compare layout engines.
 *
 * Measurement only: pure, never throws, never mutates its input.
 */

const STRUCTURAL = new Set([
  'union', 'consanguineousUnion', 'consanguineousUnionUnresolved',
  'parentChildDrop', 'sibship', 'childStem',
]);
const TOL_COLLINEAR = 4;   // px: two parallel lines closer than this read as one
const TOL_TOUCH = 3;       // px: an endpoint this close to a line reads as attached
const MIN_OVERLAP = 2;     // px of shared extent before collinearity counts
const SLOT = 90;           // one sibling slot (matches the packers)

export const READABILITY_CODES = [
  'FOREIGN_CONNECTOR_CROSSING',
  'COLLINEAR_FOREIGN_CONNECTORS',
  'FOREIGN_T_JUNCTION',
];

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Axis-aligned structural segments with an owner key. */
function collectSegments(edges) {
  const segs = [];
  (edges || []).forEach((e, i) => {
    if (!STRUCTURAL.has(e.type)) return;
    if (![e.x1, e.y1, e.x2, e.y2].every(finite)) return;
    const horizontal = Math.abs(e.y1 - e.y2) < 0.5;
    const vertical = Math.abs(e.x1 - e.x2) < 0.5;
    if (!horizontal && !vertical) return;
    if (horizontal && Math.abs(e.x1 - e.x2) < 0.5) return; // zero-length
    segs.push({
      i, type: e.type, owner: e.unionId ?? `?${i}`, horizontal,
      x1: Math.min(e.x1, e.x2), x2: Math.max(e.x1, e.x2),
      y1: Math.min(e.y1, e.y2), y2: Math.max(e.y1, e.y2),
      bridges: Array.isArray(e.bridges) ? e.bridges : [],
    });
  });
  return segs;
}

function crosses(h, v) {
  return v.x1 > h.x1 + 1 && v.x1 < h.x2 - 1 && h.y1 > v.y1 + 1 && h.y1 < v.y2 - 1;
}

function bridged(h, v) {
  return h.bridges.some(bx => Math.abs(bx - v.x1) <= 2) || v.bridges.some(by => Math.abs(by - h.y1) <= 2);
}

function overlap(a1, a2, b1, b2) {
  return Math.min(a2, b2) - Math.max(a1, b1);
}

/** Endpoint p touches segment s (interior or end), excluding exact shared endpoints at a symbol. */
function touches(p, s) {
  if (s.horizontal) {
    return Math.abs(p.y - s.y1) <= TOL_TOUCH && p.x >= s.x1 - TOL_TOUCH && p.x <= s.x2 + TOL_TOUCH;
  }
  return Math.abs(p.x - s.x1) <= TOL_TOUCH && p.y >= s.y1 - TOL_TOUCH && p.y <= s.y2 + TOL_TOUCH;
}

function endpoints(s) {
  return s.horizontal
    ? [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y1 }]
    : [{ x: s.x1, y: s.y1 }, { x: s.x1, y: s.y2 }];
}

/**
 * Hard readability violations. Each returned item mirrors layoutInvariants'
 * shape: { code, severity, message, ids }.
 */
export function checkConnectorReadability(pd) {
  const out = [];
  try {
    const segs = collectSegments(pd && pd.edges);
    for (let a = 0; a < segs.length; a++) {
      for (let b = a + 1; b < segs.length; b++) {
        const s = segs[a], t = segs[b];
        if (s.owner === t.owner) continue;
        const ids = [s.owner, t.owner];
        if (s.horizontal !== t.horizontal) {
          const h = s.horizontal ? s : t, v = s.horizontal ? t : s;
          if (crosses(h, v)) {
            if (!bridged(h, v)) {
              out.push({ code: 'FOREIGN_CONNECTOR_CROSSING', severity: 'error', ids,
                message: `${h.type} of '${h.owner}' crosses ${v.type} of '${v.owner}' at (${Math.round(v.x1)}, ${Math.round(h.y1)}) without a line jump.` });
            }
            continue;
          }
        } else if (s.horizontal) {
          if (Math.abs(s.y1 - t.y1) <= TOL_COLLINEAR && overlap(s.x1, s.x2, t.x1, t.x2) > MIN_OVERLAP) {
            out.push({ code: 'COLLINEAR_FOREIGN_CONNECTORS', severity: 'error', ids,
              message: `${s.type} of '${s.owner}' runs along ${t.type} of '${t.owner}' at y≈${Math.round(s.y1)}.` });
            continue;
          }
        } else if (Math.abs(s.x1 - t.x1) <= TOL_COLLINEAR && overlap(s.y1, s.y2, t.y1, t.y2) > MIN_OVERLAP) {
          out.push({ code: 'COLLINEAR_FOREIGN_CONNECTORS', severity: 'error', ids,
            message: `${s.type} of '${s.owner}' runs along ${t.type} of '${t.owner}' at x≈${Math.round(s.x1)}.` });
          continue;
        }
        // End-to-line attachment illusions (checked both directions).
        const hit = endpoints(s).some(p => touches(p, t)) || endpoints(t).some(p => touches(p, s));
        if (hit) {
          out.push({ code: 'FOREIGN_T_JUNCTION', severity: 'error', ids,
            message: `${s.type} of '${s.owner}' and ${t.type} of '${t.owner}' meet as if connected.` });
        }
      }
    }
  } catch { /* measurement must not crash */ }
  return out;
}

/** Soft quality measures for comparing engines. */
export function readabilityMetrics(pd) {
  const m = {
    individuals: 0, unionsWithChildren: 0, offCenter: 0, maxCentreOffset: 0, sideHang: 0,
    longUnions: 0, maxUnionSpan: 0, crossings: 0, bridgedCrossings: 0, stackedBuses: 0,
    width: 0, widthPerIndividual: 0,
  };
  try {
    const nodes = (pd && pd.nodes) || [];
    m.individuals = nodes.length;
    const x = new Map(nodes.map(n => [n.id, n.x]));
    for (const u of (pd.unions || [])) {
      const [a, b] = u.partners || [];
      if (!finite(x.get(a)) || !finite(x.get(b))) continue;
      const span = Math.abs(x.get(a) - x.get(b));
      m.maxUnionSpan = Math.max(m.maxUnionSpan, span);
      if (span > 3 * SLOT) m.longUnions++;
      const rel = (pd.parentChildRelationships || []).find(r => r.unionId === u.id);
      const kids = ((rel && rel.children) || []).map(c => x.get(c)).filter(finite);
      if (kids.length === 0) continue;
      m.unionsWithChildren++;
      const mid = (x.get(a) + x.get(b)) / 2;
      const lo = Math.min(...kids), hi = Math.max(...kids);
      const off = Math.abs(mid - (lo + hi) / 2);
      m.maxCentreOffset = Math.max(m.maxCentreOffset, off);
      if (off > SLOT / 2) m.offCenter++;
      if (mid < lo - 1 || mid > hi + 1) m.sideHang++;
    }
    m.crossings = checkConnectorReadability(pd).filter(v => v.code === 'FOREIGN_CONNECTOR_CROSSING').length;
    // Crossings drawn with a line jump are unambiguous but still a cost the
    // layout should minimise; report them separately so a router that marks
    // every crossing cannot hide them.
    const edges = pd.edges || [];
    m.bridgedCrossings = edges.reduce((n, e) => n + (Array.isArray(e.bridges) ? e.bridges.length : 0), 0);
    // Two families' sibship buses at different heights over the same x range:
    // not a collision, but children of two couples interleave visually.
    const buses = edges.filter(e => e.type === 'sibship' && [e.x1, e.x2, e.y1].every(finite));
    for (let i = 0; i < buses.length; i++) {
      for (let j = i + 1; j < buses.length; j++) {
        const a = buses[i], b = buses[j];
        if (a.unionId === b.unionId || Math.abs(a.y1 - b.y1) > 40) continue;
        if (overlap(Math.min(a.x1, a.x2), Math.max(a.x1, a.x2), Math.min(b.x1, b.x2), Math.max(b.x1, b.x2)) > 0) m.stackedBuses++;
      }
    }
    const xs = nodes.map(n => n.x).filter(finite);
    m.width = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
    m.widthPerIndividual = m.individuals ? +(m.width / m.individuals).toFixed(1) : 0;
    m.maxCentreOffset = Math.round(m.maxCentreOffset);
    m.maxUnionSpan = Math.round(m.maxUnionSpan);
  } catch { /* measurement must not crash */ }
  return m;
}
