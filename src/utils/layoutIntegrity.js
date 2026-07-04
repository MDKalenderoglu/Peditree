/**
 * layoutIntegrity.js
 *
 * Post-layout, detect-only auditor for pedigree geometry.
 * Reads the output of computePedigreeLayout() and reports issues.
 * Does NOT mutate the input — only reads and reports.
 *
 * This is separate from graphIntegrity.js (which validates the semantic graph model).
 * Layout integrity validates the visual/geometric properties of the rendered pedigree.
 *
 * @param {{ nodes: Array, edges: Array }} layout
 * @param {{ individuals: Array, unions: Array, parentChildRelationships: Array }} graph
 * @returns {Array<{ severity: 'error'|'warning', code: string, message: string, ids?: string[] }>}
 */
export function auditLayoutIntegrity(layout, graph) {
  const { nodes = [], edges = [] } = layout;
  const { individuals = [], unions = [], parentChildRelationships = [] } = graph;
  const issues = [];

  // Build lookup maps
  const nodeById = new Map();
  for (const node of nodes) {
    nodeById.set(node.id, node);
  }

  // ──────────────────────────────────────
  // 1. All individuals must have a layout node
  // ──────────────────────────────────────
  for (const ind of individuals) {
    if (!nodeById.has(ind.id)) {
      issues.push({
        severity: 'error',
        code: 'MISSING_LAYOUT_NODE',
        message: `Individual '${ind.id}' has no corresponding layout node`,
        ids: [ind.id],
      });
    }
  }

  // ──────────────────────────────────────
  // 2. All layout nodes must have finite x,y
  // ──────────────────────────────────────
  for (const node of nodes) {
    if (typeof node.x !== 'number' || typeof node.y !== 'number' ||
        !Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      issues.push({
        severity: 'error',
        code: 'INVALID_NODE_POSITION',
        message: `Node '${node.id}' has invalid position: x=${node.x}, y=${node.y}`,
        ids: [node.id],
      });
    }
  }

  // ──────────────────────────────────────
  // 3. Duplicate visible coordinates (liveborn only)
  // ──────────────────────────────────────
  // Two distinct liveborn individuals at the exact same (x,y) is a layout error.
  // Pregnancy losses and stillbirths are excluded (small symbols may overlap).
  {
    const posMap = new Map(); // "x,y" → node id
    for (const node of nodes) {
      if (node.pregnancyLoss || node.stillbirth) continue;
      if (typeof node.x !== 'number' || typeof node.y !== 'number') continue;

      const key = `${node.x},${node.y}`;
      if (posMap.has(key)) {
        issues.push({
          severity: 'error',
          code: 'DUPLICATE_NODE_POSITION',
          message: `Nodes '${posMap.get(key)}' and '${node.id}' share position (${node.x}, ${node.y})`,
          ids: [posMap.get(key), node.id],
        });
      } else {
        posMap.set(key, node.id);
      }
    }
  }

  // ──────────────────────────────────────
  // 4. Union edges must connect two nodes that exist
  // ──────────────────────────────────────
  for (const edge of edges) {
    if (edge.type === 'union' || edge.type === 'consanguineousUnion') {
      if (edge.unionId) {
        const union = unions.find(u => u.id === edge.unionId);
        if (union) {
          for (const pid of union.partners) {
            if (!nodeById.has(pid)) {
              issues.push({
                severity: 'error',
                code: 'UNION_EDGE_DANGLING',
                message: `Union edge '${edge.unionId}' references partner '${pid}' with no layout node`,
                ids: [edge.unionId, pid],
              });
            }
          }
        }
      }
    }
  }

  // ──────────────────────────────────────
  // 5. Edge endpoints must have finite coordinates
  // ──────────────────────────────────────
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const coords = [];
    if (edge.x1 !== undefined) coords.push(['x1', edge.x1]);
    if (edge.y1 !== undefined) coords.push(['y1', edge.y1]);
    if (edge.x2 !== undefined) coords.push(['x2', edge.x2]);
    if (edge.y2 !== undefined) coords.push(['y2', edge.y2]);
    if (edge.x !== undefined) coords.push(['x', edge.x]);
    if (edge.y !== undefined) coords.push(['y', edge.y]);

    for (const [name, val] of coords) {
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        issues.push({
          severity: 'error',
          code: 'EDGE_INVALID_COORDINATE',
          message: `Edge[${i}] (type='${edge.type}') has invalid ${name}=${val}`,
          ids: [],
        });
      }
    }
  }

  // ──────────────────────────────────────
  // 6. Every union with children must produce parent-child edges
  // ──────────────────────────────────────
  for (const rel of parentChildRelationships) {
    if (rel.children.length === 0) continue;

    // Check for parentChildDrop edge
    const hasDropEdge = edges.some(e =>
      e.type === 'parentChildDrop' || e.type === 'childStem'
    );
    // This is a weak check — we just verify at least some parent-child
    // edges exist when there are parent-child relationships.
    // A stronger check would verify per-union, but that requires the
    // layout to tag edges with union IDs (future improvement).
    if (!hasDropEdge && parentChildRelationships.some(r => r.children.length > 0)) {
      issues.push({
        severity: 'warning',
        code: 'NO_PARENT_CHILD_EDGES',
        message: `Graph has parent-child relationships but layout produced no parent-child edges`,
        ids: [],
      });
      break; // Only report once
    }
  }

  // ──────────────────────────────────────
  // 7. Partner spacing: partners in a union should be at the same Y
  // ──────────────────────────────────────
  for (const union of unions) {
    const p1 = nodeById.get(union.partners[0]);
    const p2 = nodeById.get(union.partners[1]);
    if (p1 && p2) {
      if (typeof p1.y === 'number' && typeof p2.y === 'number' && p1.y !== p2.y) {
        issues.push({
          severity: 'error',
          code: 'PARTNER_Y_MISMATCH',
          message: `Union '${union.id}' partners at different Y: '${p1.id}'=${p1.y}, '${p2.id}'=${p2.y}`,
          ids: [union.id, p1.id, p2.id],
        });
      }
    }
  }

  // ──────────────────────────────────────
  // 8. Siblings should share the same Y position
  // ──────────────────────────────────────
  for (const rel of parentChildRelationships) {
    if (rel.children.length < 2) continue;

    const childNodes = rel.children.map(id => nodeById.get(id)).filter(Boolean);
    if (childNodes.length < 2) continue;

    const firstY = childNodes[0].y;
    const mismatched = childNodes.filter(n => typeof n.y === 'number' && n.y !== firstY);
    if (mismatched.length > 0) {
      issues.push({
        severity: 'error',
        code: 'SIBLING_Y_MISMATCH',
        message: `Children of union '${rel.unionId}' have different Y positions: ${childNodes.map(n => `${n.id}=${n.y}`).join(', ')}`,
        ids: [rel.unionId, ...childNodes.map(n => n.id)],
      });
    }
  }

  return issues;
}
