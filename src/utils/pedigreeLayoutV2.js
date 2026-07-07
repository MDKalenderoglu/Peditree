/**
 * pedigreeLayoutV2.js — v0.4 clinical layout engine, Phase 3.
 *
 * The full new layout engine: consumes the graph, computes positions via the
 * family-block packer (layoutPacking.js / layoutModel.js), and emits the SAME
 * typed edge primitives the existing renderer (PedigreeCanvas.jsx) already
 * understands — so it is a drop-in replacement for computePedigreeLayout()'s
 * `{ nodes, edges }` contract. The only thing that changes versus the old
 * engine is the geometry: each union draws a LOCAL child-connector bus over
 * its own contiguous children, which structurally cannot overlap another
 * union's bus (the fix for the "single global horizontal bus" collapse).
 *
 * Edge types emitted (unchanged contract):
 *   union / consanguineousUnion / consanguineousUnionUnresolved
 *   sibship, parentChildDrop, childStem
 *   childlessDrop, childlessBar, divorceSlash
 *
 * Per PEDIGREE_LAYOUT_ENGINE_REDESIGN_PLAN.md this is developed alongside the
 * old engine and validated against the layout audit before cutover (Phase 4).
 */

import { computeFamilyBlockLayout, recursivePackerEnabled } from './layoutPacking';
import { relationshipBackgroundToEdgeInfo } from './relationshipBackground';

const NODE_HALF = 20;
const LOSS_HALF = 14;
// v0.5 Step 2b: a union whose two partners ended up far apart in the FINAL
// placement (a genuine cross-branch/convergent-marriage case, or the known
// multi-union-anchor hard case — see recursiveIntervalPacker.js) is routed
// through a clear corridor lane instead of a straight line, so it never runs
// through an intervening node — ownership-aware ROUTE REPAIR, not more node
// placement. Gated by the same recursivePackerEnabled() as node placement
// (Step 4C cutover: recursive is now default; PEDITREE_PACKER=legacy keeps
// the old engine's placement AND routing both off, together).
const ROUTE_LOCAL_THRESHOLD = 120; // partners closer than this: plain straight line (unchanged)
const ROUTE_CORRIDOR_OFFSET = 40;  // corridor sits just above the generation row, clear of all symbol boxes

export function computePedigreeLayoutV2(data) {
  const individuals = data.individuals || [];
  const unions = data.unions || [];
  const parentChildRelationships = data.parentChildRelationships || [];

  if (individuals.length === 0) return { nodes: [], edges: [] };

  const { xPos, yPos } = computeFamilyBlockLayout(data);

  const symbolHalfFor = (ind) => (ind && (ind.pregnancyLoss || ind.stillbirth)) ? LOSS_HALF : NODE_HALF;
  const indById = new Map(individuals.map(i => [i.id, i]));
  const childrenOf = (unionId) => {
    const rel = parentChildRelationships.find(r => r.unionId === unionId);
    return rel ? rel.children.filter(c => indById.has(c)) : [];
  };

  const edges = [];

  for (const u of unions) {
    const [p1, p2] = u.partners;
    if (xPos[p1] === undefined || xPos[p2] === undefined) continue;

    const leftId = xPos[p1] <= xPos[p2] ? p1 : p2;
    const rightId = leftId === p1 ? p2 : p1;
    const leftX = xPos[leftId];
    const rightX = xPos[rightId];
    const unionY = yPos[leftId];
    const unionCenterX = (leftX + rightX) / 2;

    // --- Union line (type carries the consanguinity distinction; the
    //     renderer draws the double line for the consanguineous types). ---
    const { edgeType } = relationshipBackgroundToEdgeInfo(u.relationshipBackground);
    const span = rightX - leftX;
    if (recursivePackerEnabled() && span > ROUTE_LOCAL_THRESHOLD) {
      // Ownership-aware route repair (Step 2b): the two partners ended up
      // far apart in the final placement — never draw a straight line
      // through whatever sits between them. Route via a clear corridor
      // lane instead: escape up from each partner, travel the corridor,
      // enter down at the other side. The union's own midpoint (where
      // children still hang from, unchanged below) gets a short stub into
      // the same corridor so it stays visually connected to the route.
      const corridorY = unionY - ROUTE_CORRIDOR_OFFSET;
      edges.push({ type: edgeType, x1: leftX, y1: unionY - NODE_HALF, x2: leftX, y2: corridorY, unionId: u.id, relationshipBackground: u.relationshipBackground });
      edges.push({ type: edgeType, x1: leftX, y1: corridorY, x2: rightX, y2: corridorY, unionId: u.id, relationshipBackground: u.relationshipBackground });
      edges.push({ type: edgeType, x1: rightX, y1: corridorY, x2: rightX, y2: unionY - NODE_HALF, unionId: u.id, relationshipBackground: u.relationshipBackground });
      edges.push({ type: edgeType, x1: unionCenterX, y1: unionY, x2: unionCenterX, y2: corridorY, unionId: u.id, relationshipBackground: u.relationshipBackground });
    } else {
      edges.push({
        type: edgeType,
        x1: leftX + NODE_HALF, y1: unionY,
        x2: rightX - NODE_HALF, y2: unionY,
        unionId: u.id,
        relationshipBackground: u.relationshipBackground,
      });
    }

    // --- Divorce / separation slash ---
    if (u.status === 'divorced' || u.status === 'separated') {
      edges.push({ type: 'divorceSlash', x: unionCenterX, y: unionY, status: u.status });
    }

    const children = childrenOf(u.id);

    if (children.length === 0) {
      // Childless couple marker (inverted T).
      const dropLen = 25;
      const barHalf = 12;
      edges.push({ type: 'childlessDrop', x1: unionCenterX, y1: unionY, x2: unionCenterX, y2: unionY + dropLen });
      edges.push({ type: 'childlessBar', x1: unionCenterX - barHalf, y1: unionY + dropLen, x2: unionCenterX + barHalf, y2: unionY + dropLen });
      continue;
    }

    // --- Parent → children (LOCAL bus over this union's own children only) ---
    const childXs = children.map(c => xPos[c]).filter(v => v !== undefined);
    const childYs = children.map(c => yPos[c]).filter(v => v !== undefined);
    if (childXs.length === 0) continue;

    const minCX = Math.min(...childXs);
    const maxCX = Math.max(...childXs);
    const closestChildY = childYs.length ? Math.min(...childYs) : unionY + 150;
    const dropY = (unionY + closestChildY) / 2;

    // Vertical drop from union center down to the sibship rail.
    edges.push({ type: 'parentChildDrop', x1: unionCenterX, y1: unionY, x2: unionCenterX, y2: dropY });

    // Sibship rail — spans exactly this union's children (plus the drop point
    // if the union center sits outside the child range, to keep the elbow
    // connected). Never spans another union's children.
    const railMinX = Math.min(minCX, unionCenterX);
    const railMaxX = Math.max(maxCX, unionCenterX);
    if (railMaxX > railMinX) {
      edges.push({ type: 'sibship', x1: railMinX, y1: dropY, x2: railMaxX, y2: dropY });
    }

    // Vertical stem from the rail down to each child.
    for (const cid of children) {
      if (xPos[cid] === undefined || yPos[cid] === undefined) continue;
      edges.push({
        type: 'childStem',
        x1: xPos[cid], y1: dropY,
        x2: xPos[cid], y2: yPos[cid] - symbolHalfFor(indById.get(cid)),
      });
    }
  }

  const nodes = individuals.map(ind => ({
    ...ind,
    x: xPos[ind.id] ?? 0,
    y: yPos[ind.id] ?? 0,
  }));

  return { nodes, edges };
}
