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

import { computeFamilyBlockLayout } from './layoutPacking';
import { relationshipBackgroundToEdgeInfo } from './relationshipBackground';

const NODE_HALF = 20;
const LOSS_HALF = 14;

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
    edges.push({
      type: edgeType,
      x1: leftX + NODE_HALF, y1: unionY,
      x2: rightX - NODE_HALF, y2: unionY,
      unionId: u.id,
      relationshipBackground: u.relationshipBackground,
    });

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
