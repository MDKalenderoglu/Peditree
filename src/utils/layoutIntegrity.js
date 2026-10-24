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
    if (p1 && p2 && !union.crossGeneration) {
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

  // ──────────────────────────────────────
  // 9. Sibship-bus overlap (v0.3a.4) — the "single global horizontal bus"
  //    ambiguity. Each union with children draws a horizontal sibship rail
  //    (see pedigreeLayout.js). When two DIFFERENT unions' rails land at the
  //    same Y with overlapping X ranges, a viewer cannot tell which child
  //    belongs to which parent couple — the exact defect seen in clinical
  //    QA where unrelated parent-child connectors merge into one long line.
  //
  //    Deliberately a WARNING, not an error: a wizard-built pedigree with
  //    many collateral branches can already exhibit this before any user
  //    action, and flagging it as an error would break legitimate existing
  //    pedigrees. The relationship-safety net (relationshipSafety.js)
  //    instead rolls back any mutation that *increases* the overlap count,
  //    so the user can never make readability worse — while the deeper fix
  //    (a per-union local bus / real hierarchical layout) is tracked in
  //    PEDIGREE_LAYOUT_ENGINE_REDESIGN_PLAN.md.
  // ──────────────────────────────────────
  {
    const RAIL_Y_TOLERANCE = 6;   // rails within this many px count as "same Y"
    const RAIL_X_MIN_OVERLAP = 20; // ignore incidental point/edge touches

    // Recompute each union's sibship rail from actual node positions,
    // mirroring pedigreeLayout.js's own dropY / min-max-X computation.
    const rails = [];
    for (const rel of parentChildRelationships) {
      const childNodes = rel.children.map(id => nodeById.get(id)).filter(Boolean);
      if (childNodes.length === 0) continue;
      const union = unions.find(u => u.id === rel.unionId);
      const partnerNodes = union
        ? union.partners.map(pid => nodeById.get(pid)).filter(Boolean)
        : [];
      if (partnerNodes.length === 0) continue;

      // the couple's line is on the lower partner's row (cross-generation)
      const unionY = Math.max(...partnerNodes.map(n => n.y));
      const childYs = childNodes.map(n => n.y).filter(v => typeof v === 'number');
      const childXs = childNodes.map(n => n.x).filter(v => typeof v === 'number');
      if (childYs.length === 0 || childXs.length === 0) continue;

      const railY = (unionY + Math.min(...childYs)) / 2;
      rails.push({
        unionId: rel.unionId,
        railY,
        minX: Math.min(...childXs),
        maxX: Math.max(...childXs),
      });
    }

    for (let a = 0; a < rails.length; a++) {
      for (let b = a + 1; b < rails.length; b++) {
        const ra = rails[a];
        const rb = rails[b];
        if (Math.abs(ra.railY - rb.railY) > RAIL_Y_TOLERANCE) continue;
        // X-interval overlap length.
        const overlap = Math.min(ra.maxX, rb.maxX) - Math.max(ra.minX, rb.minX);
        if (overlap > RAIL_X_MIN_OVERLAP) {
          issues.push({
            severity: 'warning',
            code: 'SIBSHIP_BUS_OVERLAP',
            message: `Unions '${ra.unionId}' and '${rb.unionId}' draw overlapping child-connector rails at the same height — which child belongs to which couple is visually ambiguous.`,
            ids: [ra.unionId, rb.unionId],
          });
        }
      }
    }
  }

  // ──────────────────────────────────────
  // 10. Connector edge passing through an unrelated node (v0.3a.4).
  //     A horizontal/vertical relationship connector that runs through a
  //     node's symbol bounding box (when that node is not one of the edge's
  //     own endpoints) is visually misleading — the line appears to touch a
  //     person it has no relationship with. Warning severity, same rationale
  //     as CHECK 9.
  // ──────────────────────────────────────
  {
    const NODE_BOX_HALF = 20; // symbol half-extent
    const EPS = 2;
    // Only structural relationship connectors — not the tiny childless/loss markers.
    const connectorTypes = new Set(['union', 'consanguineousUnion', 'consanguineousUnionUnresolved', 'sibship', 'parentChildDrop', 'childStem']);
    for (const edge of edges) {
      if (!connectorTypes.has(edge.type)) continue;
      if (typeof edge.x1 !== 'number' || typeof edge.y1 !== 'number' ||
          typeof edge.x2 !== 'number' || typeof edge.y2 !== 'number') continue;
      const horizontal = Math.abs(edge.y1 - edge.y2) < EPS;
      const vertical = Math.abs(edge.x1 - edge.x2) < EPS;
      if (!horizontal && !vertical) continue;

      for (const node of nodes) {
        if (typeof node.x !== 'number' || typeof node.y !== 'number') continue;
        // Skip the edge's own endpoints (a connector legitimately touches
        // the nodes it connects).
        const atEndpoint =
          (Math.abs(node.x - edge.x1) < NODE_BOX_HALF && Math.abs(node.y - edge.y1) < NODE_BOX_HALF) ||
          (Math.abs(node.x - edge.x2) < NODE_BOX_HALF && Math.abs(node.y - edge.y2) < NODE_BOX_HALF);
        if (atEndpoint) continue;

        let passesThrough;
        if (horizontal) {
          const loX = Math.min(edge.x1, edge.x2);
          const hiX = Math.max(edge.x1, edge.x2);
          passesThrough =
            Math.abs(node.y - edge.y1) < NODE_BOX_HALF &&
            node.x > loX + EPS && node.x < hiX - EPS;
        } else {
          const loY = Math.min(edge.y1, edge.y2);
          const hiY = Math.max(edge.y1, edge.y2);
          passesThrough =
            Math.abs(node.x - edge.x1) < NODE_BOX_HALF &&
            node.y > loY + EPS && node.y < hiY - EPS;
        }
        if (passesThrough) {
          issues.push({
            severity: 'warning',
            code: 'EDGE_THROUGH_NODE',
            message: `A ${edge.type} connector passes through individual '${node.id}', which it has no relationship with — visually misleading.`,
            ids: [node.id],
          });
        }
      }
    }
  }

  // ──────────────────────────────────────
  // 11. Unrelated node sitting inside a union's child footprint (v0.4.1).
  //     Even when a union's own sibship rail is perfectly local (CHECK 9
  //     passes) and no line literally crosses another node (CHECK 10
  //     passes), a wide sibship fan can still visually mislead if some
  //     OTHER same-generation individual — a sibling/aunt/uncle who is NOT
  //     a partner in that union and has no relationship to its children —
  //     happens to sit horizontally between the fan's leftmost and
  //     rightmost child. A viewer's eye reads "this person is roughly under
  //     the same spread as those kids" as a relationship cue, even though
  //     no line actually touches them. This is the exact illusion reported
  //     from clinical QA: a wide 6-child fan appeared to run underneath a
  //     childless aunt/uncle sitting one seat away from the true parents.
  //     Warning severity — pre-existing pedigrees may already exhibit this;
  //     the layout packer (layoutPacking.js) now reserves each union's full
  //     child footprint so new mutations cannot introduce it, and this
  //     check is the regression gate for that guarantee.
  // ──────────────────────────────────────
  {
    const NODE_HALF_X = 20;
    for (const rel of parentChildRelationships) {
      const childNodes = rel.children.map(id => nodeById.get(id)).filter(Boolean);
      if (childNodes.length === 0) continue;
      const union = unions.find(u => u.id === rel.unionId);
      if (!union) continue;
      const childXs = childNodes.map(n => n.x).filter(v => typeof v === 'number');
      if (childXs.length === 0) continue;
      const minX = Math.min(...childXs) + NODE_HALF_X;
      const maxX = Math.max(...childXs) - NODE_HALF_X;
      if (maxX <= minX) continue; // single child or no real interior span

      // Same generation as the parents (one above the children).
      const parentGen = childNodes[0].generation - 1;
      for (const node of nodes) {
        if (node.generation !== parentGen) continue;
        if (union.partners.includes(node.id)) continue;
        if (typeof node.x !== 'number') continue;
        if (node.x > minX && node.x < maxX) {
          issues.push({
            severity: 'warning',
            code: 'UNRELATED_NODE_IN_CHILD_FOOTPRINT',
            message: `Individual '${node.id}' sits horizontally inside union '${rel.unionId}''s child fan without being one of its partners — a viewer could mistake them for a parent.`,
            ids: [node.id, rel.unionId],
          });
        }
      }
    }
  }

  return issues;
}
