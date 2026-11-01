/**
 * art.js — assisted reproduction in the layout (NSGC 2022 Figure 5 as
 * corrected in 2025; model.js REPRO_ROLES; clinician decisions 2026-11-01).
 *
 * The donor or carrier stands on the parents' row beside the parent they
 * stand in for (a sperm donor beside the father, an egg donor or a carrier
 * beside the mother), with no relationship line between them. For the layout a
 * donor or carrier added for this (no family of their own) is tied to her
 * by an invisible bond — a union marked `artVirtual` that the ordering and
 * the solver treat like a partner beside her and the router never draws. A
 * relative who donates or carries stays with their own family.
 *
 * A child carried by a gestational carrier or surrogate stands directly
 * under her: for the layout it hangs from a carrier bond, held under the
 * carrier (index.js), and its lines are drawn by `artEdges` — down from the
 * carrier, and a diagonal from the parents' line. A donor's line is a
 * diagonal into the top of the child's line of descent.
 */
import { CARRIER_ROLES, ART_DONOR_RELATION, displayParentage } from '../../graph/model';

export const isArtUnion = (u) => !!(u && u.artVirtual);

/**
 * The parentage the drawing shows, for the layout audits: adopted-in
 * children under their adoptive parents (model.js displayParentage), a
 * carried child under her carrier, donors and carriers beside the parents
 * (withArt). Audit the drawing against this, never the bare document.
 */
export function layoutParentage(graph) {
  return withArt(displayParentage(graph).graph, graph.reproductiveLinks || []).graph;
}

const JOIN_ABOVE = 12; // px above the child's symbol where the diagonals meet its line
const BESIDE = 10;     // px beside the child's own line where a routed line enters its symbol

/**
 * The layout graph with the invisible bonds and carried children moved under
 * their carrier. Returns { graph, art } — art: { donors: [{childId, personId,
 * unionId}], carried: Map childId → { carrier, unionId } }, or null.
 */
export function withArt(graph, links = []) {
  if (!links.length) return { graph, art: null };
  const byId = new Map((graph.individuals || []).map((i) => [i.id, i]));
  const pcrs = (graph.parentChildRelationships || []).map((r) => ({ ...r, children: [...r.children] }));
  const hasParents = new Set(pcrs.flatMap((r) => r.children));
  const unions = [...(graph.unions || [])];
  const bond = new Map(); // `${anchor}|${person}` → virtual union id
  const outermost = new Map(); // anchor → the last person tied on her outer side (a second one ties to the first)
  const donors = [];
  const carried = new Map();
  // the child's own parents, from the parentage as given (a carried child is moved under her
  // carrier below; a second link of the same child must still find its parents)
  const parentsOf = new Map();
  for (const r of pcrs) for (const c of r.children) parentsOf.set(c, r.unionId);
  for (const l of links) {
    const rel = pcrs.find((r) => r.unionId === parentsOf.get(l.childId));
    const couple = rel && unions.find((u) => u.id === rel.unionId);
    const person = byId.get(l.personId);
    if (!couple || !person) continue;
    // each stands beside the parent they stand in for: a sperm donor beside the father, an egg donor or
    // a carrier beside the mother — their lines then come from both sides and do not cross
    const wanted = l.role === 'sperm_donor' ? 'male' : 'female';
    const anchor = couple.partners.find((p) => byId.get(p)?.sex === wanted) || couple.partners[0];
    // only a donor or carrier with no family of their own is tied beside her
    let vid = null;
    if (person.relation === ART_DONOR_RELATION && !hasParents.has(l.personId) && anchor !== l.personId) {
      const key = `${anchor}|${l.personId}`;
      if (!bond.has(key)) {
        // a second donor or carrier stands beyond the first, never between the couple
        const to = outermost.get(anchor) || anchor;
        vid = `__art__${bond.size}`;
        bond.set(key, vid);
        outermost.set(anchor, l.personId);
        unions.push({ id: vid, partners: [to, l.personId], artVirtual: true, artAnchor: anchor, status: 'together', consanguineous: false, consanguinityStatus: 'none', relationshipBackground: 'not_asked' });
      } else vid = bond.get(key);
    }
    if (CARRIER_ROLES.includes(l.role)) {
      // with a bond the child stands under her; a relative carrier stays with her family and the child with its parents
      carried.set(l.childId, { carrier: l.personId, unionId: couple.id, under: !!vid, bond: vid });
      if (vid) {
        unions.find((u) => u.id === vid).artCarrier = l.personId;
        rel.children = rel.children.filter((c) => c !== l.childId);
        let own = pcrs.find((r) => r.unionId === vid);
        if (!own) { own = { unionId: vid, children: [], orderPolicy: 'insertion', multiples: [] }; pcrs.push(own); }
        own.children.push(l.childId);
        // twins carried together stay a twin group under her
        for (const m of rel.multiples || []) {
          if (m.children.includes(l.childId) && !own.multiples.some((x) => x.id === m.id)) own.multiples.push(m);
        }
      }
    }
    if (!CARRIER_ROLES.includes(l.role) || l.role === 'surrogate') donors.push({ childId: l.childId, personId: l.personId, unionId: couple.id, role: l.role, near: !!vid });
  }
  const parentsOfChild = new Map(links.map((l) => [l.childId, (unions.find((u) => u.id === parentsOf.get(l.childId))?.partners) || []]));
  return {
    graph: { ...graph, unions, parentChildRelationships: pcrs.filter((r) => r.children.length || !r.unionId.startsWith('__art__')) },
    art: { donors, carried, parentsOf: parentsOfChild },
  };
}

/**
 * The lines of assisted reproduction, after routing: a carried child's line
 * down from the carrier and the parents' diagonal to it; each donor's
 * diagonal into the top of the child's line. Solid (NSGC: a biological
 * relationship that may affect the fetus).
 */
export function artEdges(art, edges, xPos, yPos, halfOf) {
  if (!art) return [];
  const out = [];
  const joinOf = (childId) => [xPos[childId], yPos[childId] - halfOf(childId) - JOIN_ABOVE];
  const coupleLine = (unionId) => edges.filter((e) => e.unionId === unionId && e.y1 === e.y2 && !e.artKind
    && ['union', 'consanguineousUnion', 'consanguineousUnionUnresolved'].includes(e.type))
    .sort((p, q) => Math.abs(q.x2 - q.x1) - Math.abs(p.x2 - p.x1))[0];
  // a relative standing in their own family: down, across above the child's row, and into the child's line
  // (a long diagonal would cross the drawing)
  const routed = (common, personId, childId) => {
    const [jx, jy] = joinOf(childId);
    const stem = edges.find((e) => e.type === 'childStem' && e.childId === childId);
    const levelY = Math.min(jy, stem ? Math.min(stem.y1, stem.y2) : jy) - JOIN_ABOVE;
    const sx = xPos[personId], sy = yPos[personId] + halfOf(personId);
    // into the top of the child's symbol beside its own line, on the side the line comes from
    const ex = jx + (sx < jx ? -1 : 1) * BESIDE;
    out.push({ ...common, x1: sx, y1: sy, x2: sx, y2: levelY });
    out.push({ ...common, x1: sx, y1: levelY, x2: ex, y2: levelY });
    out.push({ ...common, x1: ex, y1: levelY, x2: ex, y2: yPos[childId] - halfOf(childId) });
  };
  // a straight line only where it touches no symbol (brackets and marks included): in a crowded
  // drawing a long diagonal would run through people (mark audit 2026-11-01)
  const CLEARANCE = 10;
  const touches = (x1, y1, x2, y2, skip) => Object.keys(xPos).some((id) => {
    if (skip.includes(id) || xPos[id] === undefined || yPos[id] === undefined) return false;
    const r = halfOf(id) + CLEARANCE, cx = xPos[id], cy = yPos[id];
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / len2));
    return Math.abs(x1 + t * dx - cx) < r && Math.abs(y1 + t * dy - cy) < r;
  });
  const parentsDone = new Set();
  for (const [childId, { carrier, unionId, under, bond }] of art.carried) {
    if (xPos[childId] === undefined || xPos[carrier] === undefined) continue;
    const common = { type: 'reproLine', unionId, childId, personId: carrier };
    if (!under) { routed({ ...common, artKind: 'carrier' }, carrier, childId); continue; }
    // the line down from the carrier is the router's (her bond's line of descent, routing.js);
    // the parents: from the middle of their line to where hers meets the children's line
    if (parentsDone.has(bond)) continue;
    parentsDone.add(bond);
    const drop = edges.find((e) => e.type === 'parentChildDrop' && e.unionId === bond);
    const line = coupleLine(unionId);
    if (!drop || !line) continue;
    const x0 = (line.x1 + line.x2) / 2, y0 = line.y1;
    const tx = drop.x2, ty = Math.max(drop.y1, drop.y2);
    const parentsOfChild = (art.parentsOf && art.parentsOf.get(childId)) || [];
    if (!touches(x0, y0, tx, ty, [...parentsOfChild, carrier, childId])) {
      out.push({ ...common, artKind: 'parents', x1: x0, y1: y0, x2: tx, y2: ty });
      continue;
    }
    // down beside the couple's own line of descent, across between the rows, into her line
    const sx = x0 + (tx > x0 ? 1 : -1) * BESIDE, level = ty - JOIN_ABOVE;
    out.push({ ...common, artKind: 'parents', x1: x0, y1: y0, x2: sx, y2: y0 + BESIDE });
    out.push({ ...common, artKind: 'parents', x1: sx, y1: y0 + BESIDE, x2: sx, y2: level });
    out.push({ ...common, artKind: 'parents', x1: sx, y1: level, x2: tx, y2: level });
  }
  // where a donor's line joins the child's line of descent: for a carried child the end of the
  // carrier's line, for twins the point their lines split from, otherwise just above the child
  const targetOf = (childId) => {
    const c = art.carried.get(childId);
    const drop = c && c.under && edges.find((e) => e.type === 'parentChildDrop' && e.unionId === c.bond);
    if (drop) return [drop.x2, Math.max(drop.y1, drop.y2)];
    const stem = edges.find((e) => e.type === 'childStem' && e.childId === childId);
    if (stem && stem.twin) return [stem.x1, stem.y1];
    return joinOf(childId);
  };
  const drawnTo = new Set();
  for (const d of art.donors) {
    if (xPos[d.childId] === undefined || xPos[d.personId] === undefined) continue;
    // a surrogate carries: her line is the carrier's line already
    if (d.role === 'surrogate' && art.carried.get(d.childId)?.carrier === d.personId) continue;
    const common = { type: 'reproLine', artKind: 'donor', unionId: d.unionId, childId: d.childId, personId: d.personId };
    const [jx, jy] = targetOf(d.childId);
    const key = `${d.personId}|${jx}|${jy}`;
    if (drawnTo.has(key)) continue; // twins: one line to their common point
    drawnTo.add(key);
    const sx = xPos[d.personId], dy0 = yPos[d.personId] + halfOf(d.personId);
    if (!d.near || touches(sx, dy0, jx, jy, [d.personId, d.childId, ...((art.parentsOf && art.parentsOf.get(d.childId)) || [])])) {
      const shared = art.carried.get(d.childId)?.under || edges.some((e) => e.type === 'childStem' && e.childId === d.childId && e.twin);
      if (!shared) { routed(common, d.personId, d.childId); continue; }
      // a carried child or twins: down, across between the rows, and into the point their line starts from
      const level = jy - JOIN_ABOVE;
      out.push({ ...common, x1: sx, y1: dy0, x2: sx, y2: level });
      out.push({ ...common, x1: sx, y1: level, x2: jx, y2: level });
      if (!art.carried.get(d.childId)?.under) out.push({ ...common, x1: jx, y1: level, x2: jx, y2: jy });
      continue;
    }
    out.push({ ...common, x1: xPos[d.personId], y1: yPos[d.personId] + halfOf(d.personId), x2: jx, y2: jy });
  }
  return out;
}
