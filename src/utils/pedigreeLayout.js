/**
 * pedigreeLayout.js
 *
 * Layout engine for clinical pedigree drawing.
 *
 * EDGE TYPES (semantic):
 *   "union"               — horizontal line connecting two partners
 *   "consanguineousUnion"  — double horizontal line for consanguineous union
 *   "sibship"             — horizontal sibship rail connecting children
 *   "parentChildDrop"     — vertical line from union center DOWN to sibship rail
 *   "childStem"           — vertical line from sibship rail DOWN to child node
 *   "divorceSlash"        — diagonal slash(es) on a union edge
 *   "childlessDrop"       — short vertical from union center (no children)
 *   "childlessBar"        — horizontal bar at end of childlessDrop (inverted T)
 *
 * These types are NEVER mixed. A sibship line is NEVER a union line.
 */

import { relationshipBackgroundToEdgeInfo } from './relationshipBackground';

export function computePedigreeLayout(data) {



  const { individuals, unions, parentChildRelationships } = data;
  if (!individuals || individuals.length === 0) return { nodes: [], edges: [] };

  // --- CONSTANTS ---
  const GEN_Y_SPACING = 150;
  const NODE_X_SPACING = 90;
  const SPOUSE_X_GAP = 70;
  const CLUSTER_GAP = 180;
  const NODE_HALF = 20; // half of node size (40/2)

  // --- INDEX ---
  const nodeById = {};
  individuals.forEach(ind => { nodeById[ind.id] = { ...ind }; });
  const symbolHalfFor = (id) => {
    const ind = nodeById[id];
    if (!ind) return NODE_HALF;

    if (ind.pregnancyLoss || ind.stillbirth) return 14;

    return NODE_HALF;
  };

  const childrenOf = (unionId) => {
    const rel = parentChildRelationships.find(r => r.unionId === unionId);
    return rel ? rel.children.filter(id => nodeById[id]) : [];
  };

  // --- GENERATION NORMALIZATION ---
  // Compute generation from parent-child edges, starting from known values
  // then shift so minimum generation = 0 (for y-coord calculation)
  const genValues = {};
  individuals.forEach(ind => { genValues[ind.id] = ind.generation; });

  const allGens = Object.values(genValues);
  const minGen = Math.min(...allGens);
  // Shift all generations so minGen becomes 0
  individuals.forEach(ind => {
    genValues[ind.id] = ind.generation - minGen;
  });

  // --- Y POSITIONS ---
  const yPos = {};
  individuals.forEach(ind => {
    yPos[ind.id] = 80 + genValues[ind.id] * GEN_Y_SPACING;
  });

  // =============================================
  // FAMILY CLUSTER LAYOUT
  // =============================================
  // Strategy:
  //   1. Identify nuclear family (U_PARENTS), maternal branch, paternal branch.
  //   2. Layout each branch as a cluster (left-to-right).
  //   3. Place nuclear family children centered between mother and father.
  //   4. Resolve spacing so clusters don't overlap.

  const xPos = {};
  const edges = [];

  // --- Classify unions by role ---
  const parentsUnion = unions.find(u => u.id === 'U_PARENTS');
  const matGPUnion = unions.find(u => u.id === 'U_MAT_GP');
  const patGPUnion = unions.find(u => u.id === 'U_PAT_GP');

  // Other mother/father unions
  const motherOtherUnions = unions.filter(u => u.id.startsWith('U_MOTHER_OTHER'));
  const fatherOtherUnions = unions.filter(u => u.id.startsWith('U_FATHER_OTHER'));

  // Relative unions (gen 2 — aunts/uncles, excluding GP-level)
  const matRelUnions = unions.filter(u =>
    (u.id.startsWith('U_MAT_UNCLE') || u.id.startsWith('U_MAT_AUNT')) &&
    !u.id.startsWith('U_GP_')
  );
  const patRelUnions = unions.filter(u =>
    (u.id.startsWith('U_PAT_UNCLE') || u.id.startsWith('U_PAT_AUNT')) &&
    !u.id.startsWith('U_GP_')
  );

  // GP-level relative unions (gen 1 — great-uncles/great-aunts)
  const gpMatRelUnions = unions.filter(u => u.id.startsWith('U_GP_MAT_UNCLE') || u.id.startsWith('U_GP_MAT_AUNT'));
  const gpPatRelUnions = unions.filter(u => u.id.startsWith('U_GP_PAT_UNCLE') || u.id.startsWith('U_GP_PAT_AUNT'));

  // Great-grandparent unions
  const ggpMatUnion = unions.find(u => u.id === 'U_GGP_mat');
  const ggpPatUnion = unions.find(u => u.id === 'U_GGP_pat');

  // Gen4 unions
  const gen4Unions = unions.filter(u => u.id.startsWith('U_GEN4'));

  // Direct edit unions (added from right-panel IndividualEditor)
  const directEditUnions = unions.filter(u => u.id.startsWith('U_DE_'));

  // --- LAYOUT HELPER: place a union and its children, returning width ---
  function layoutUnionCluster(unionId, startX) {
    const union = unions.find(u => u.id === unionId);
    if (!union) return startX;

    const children = childrenOf(unionId);
    const p1 = union.partners[0];
    const p2 = union.partners[1];

    if (children.length > 0) {
      const childWidth = (children.length - 1) * NODE_X_SPACING;
      const clusterWidth = Math.max(childWidth, SPOUSE_X_GAP);

      // Place children
      let cx = startX;
      children.forEach(cid => {
        xPos[cid] = cx;
        cx += NODE_X_SPACING;
      });

      // Partners centered above children
      const childCenter = startX + childWidth / 2;
      xPos[p1] = childCenter - SPOUSE_X_GAP / 2;
      xPos[p2] = childCenter + SPOUSE_X_GAP / 2;

      return startX + Math.max(clusterWidth, SPOUSE_X_GAP) + NODE_X_SPACING;
    } else {
      xPos[p1] = startX;
      xPos[p2] = startX + SPOUSE_X_GAP;
      return startX + SPOUSE_X_GAP + NODE_X_SPACING;
    }
  }

  // --- LAYOUT MATERNAL BRANCH ---
  let matBranchRight;
  {
    let cursor = 0;

    // Mother's other unions (to the left of mother)
    motherOtherUnions.forEach(u => {
      const children = childrenOf(u.id);
      const spouseId = u.partners.find(p => p !== 'mother');
      if (children.length > 0) {
        const cw = (children.length - 1) * NODE_X_SPACING;
        let cx = cursor;
        children.forEach(cid => { xPos[cid] = cx; cx += NODE_X_SPACING; });
        const center = cursor + cw / 2;
        xPos[spouseId] = center - SPOUSE_X_GAP / 2;
        // mother will be placed later to the right of this
        cursor = cx + NODE_X_SPACING / 2;
      } else {
        xPos[spouseId] = cursor;
        cursor += SPOUSE_X_GAP + NODE_X_SPACING / 2;
      }
    });

    // Maternal relatives (Dayı/Teyze and their families)
    const matRelChildren = matGPUnion ? childrenOf('U_MAT_GP').filter(id => id !== 'mother') : [];

    matRelChildren.forEach(relId => {
      // Find if this relative has a partner union
      const relUnion = matRelUnions.find(u => u.partners.includes(relId));
      if (relUnion) {
        cursor = layoutUnionCluster(relUnion.id, cursor);
      } else {
        xPos[relId] = cursor;
        cursor += NODE_X_SPACING;
      }
    });

    // Mother position
    xPos['mother'] = cursor;
    cursor += NODE_X_SPACING;

    matBranchRight = cursor;

    // Maternal grandparents centered above their children
    if (matGPUnion) {
      const allMatGen2 = childrenOf('U_MAT_GP');
      const placedGen2 = allMatGen2.filter(id => xPos[id] !== undefined);
      if (placedGen2.length > 0) {
        const minX = Math.min(...placedGen2.map(id => xPos[id]));
        const maxX = Math.max(...placedGen2.map(id => xPos[id]));
        const center = (minX + maxX) / 2;
        xPos['mat_gf'] = center - SPOUSE_X_GAP / 2;
        xPos['mat_gm'] = center + SPOUSE_X_GAP / 2;
      }
    }

    // GP-level maternal relatives (B.Dayı/B.Teyze — siblings of mat_gf)
    // These are gen 1 (same as grandparents), children of U_GGP_mat
    if (ggpMatUnion) {
      const ggpChildren = childrenOf('U_GGP_mat').filter(id => id !== 'mat_gf');
      let gpCursor = (xPos['mat_gf'] !== undefined ? xPos['mat_gf'] : cursor) - CLUSTER_GAP;

      // Layout GP relatives to the left of mat_gf
      const gpPositions = [];
      ggpChildren.forEach(relId => {
        const relUnion = gpMatRelUnions.find(u => u.partners.includes(relId));
        if (relUnion) {
          gpCursor = layoutUnionCluster(relUnion.id, gpCursor);
        } else {
          xPos[relId] = gpCursor;
          gpCursor += NODE_X_SPACING;
        }
        gpPositions.push(relId);
      });

      // If GP relatives pushed into negative territory or overlap with existing,
      // shift everything right to make room
      if (gpPositions.length > 0) {
        const gpMinX = Math.min(...gpPositions.map(id => xPos[id] || 0));
        const matGfX = xPos['mat_gf'] || 0;
        if (gpMinX > matGfX - CLUSTER_GAP) {
          // Need more space — shift mat_gf and everything right
          const needed = (gpCursor + CLUSTER_GAP / 2) - matGfX;
          if (needed > 0) {
            // Shift all non-GP-mat positions to the right
            const gpSet = new Set(gpPositions);
            // Also include children of GP unions
            gpMatRelUnions.forEach(u => {
              childrenOf(u.id).forEach(cid => gpSet.add(cid));
              u.partners.forEach(pid => gpSet.add(pid));
            });
            Object.keys(xPos).forEach(id => {
              if (!gpSet.has(id)) {
                xPos[id] += needed;
              }
            });
            matBranchRight += needed;
          }
        }
      }

      // Center great-grandparents above all their children (mat_gf + GP relatives)
      const allGGPChildren = childrenOf('U_GGP_mat');
      const placedGGP = allGGPChildren.filter(id => xPos[id] !== undefined);
      if (placedGGP.length > 0) {
        const minX = Math.min(...placedGGP.map(id => xPos[id]));
        const maxX = Math.max(...placedGGP.map(id => xPos[id]));
        const center = (minX + maxX) / 2;
        xPos[ggpMatUnion.partners[0]] = center - SPOUSE_X_GAP / 2;
        xPos[ggpMatUnion.partners[1]] = center + SPOUSE_X_GAP / 2;
      }
    }
  }

  // --- Nuclear family children width ---
  const nuclearChildren = parentsUnion ? childrenOf('U_PARENTS') : [];
  const nuclearWidth = Math.max(0, (nuclearChildren.length - 1) * NODE_X_SPACING);

  // --- Father position: to the right of mother with enough space for nuclear children ---
  const motherX = xPos['mother'] || 0;
  const fatherMinX = Math.max(
    motherX + Math.max(SPOUSE_X_GAP, nuclearWidth + SPOUSE_X_GAP),
    matBranchRight + CLUSTER_GAP
  );

  // --- LAYOUT PATERNAL BRANCH ---
  {
    let cursor = fatherMinX;

    // Father position
    xPos['father'] = cursor;
    cursor += NODE_X_SPACING;

    // Father's other unions (to the right of father)
    fatherOtherUnions.forEach(u => {
      const children = childrenOf(u.id);
      const spouseId = u.partners.find(p => p !== 'father');
      if (children.length > 0) {
        const cw = (children.length - 1) * NODE_X_SPACING;
        let cx = cursor;
        children.forEach(cid => { xPos[cid] = cx; cx += NODE_X_SPACING; });
        const center = cursor + cw / 2;
        xPos[spouseId] = center + SPOUSE_X_GAP / 2;
        cursor = Math.max(cx, xPos[spouseId]) + NODE_X_SPACING / 2;
      } else {
        xPos[spouseId] = cursor;
        cursor += SPOUSE_X_GAP + NODE_X_SPACING / 2;
      }
    });

    // Paternal relatives (Amca/Hala and their families)
    const patRelChildren = patGPUnion ? childrenOf('U_PAT_GP').filter(id => id !== 'father') : [];

    patRelChildren.forEach(relId => {
      const relUnion = patRelUnions.find(u => u.partners.includes(relId));
      if (relUnion) {
        cursor = layoutUnionCluster(relUnion.id, cursor);
      } else {
        xPos[relId] = cursor;
        cursor += NODE_X_SPACING;
      }
    });

    // Paternal grandparents centered above their children
    if (patGPUnion) {
      const allPatGen2 = childrenOf('U_PAT_GP');
      const placedGen2 = allPatGen2.filter(id => xPos[id] !== undefined);
      if (placedGen2.length > 0) {
        const minX = Math.min(...placedGen2.map(id => xPos[id]));
        const maxX = Math.max(...placedGen2.map(id => xPos[id]));
        const center = (minX + maxX) / 2;
        xPos['pat_gf'] = center - SPOUSE_X_GAP / 2;
        xPos['pat_gm'] = center + SPOUSE_X_GAP / 2;
      }
    }

    // GP-level paternal relatives (B.Amca/B.Hala — siblings of pat_gf)
    if (ggpPatUnion) {
      const ggpChildren = childrenOf('U_GGP_pat').filter(id => id !== 'pat_gf');
      let gpCursor = cursor; // place to the right of paternal branch

      ggpChildren.forEach(relId => {
        const relUnion = gpPatRelUnions.find(u => u.partners.includes(relId));
        if (relUnion) {
          gpCursor = layoutUnionCluster(relUnion.id, gpCursor);
        } else {
          xPos[relId] = gpCursor;
          gpCursor += NODE_X_SPACING;
        }
      });

      // Center great-grandparents above all their children (pat_gf + GP relatives)
      const allGGPChildren = childrenOf('U_GGP_pat');
      const placedGGP = allGGPChildren.filter(id => xPos[id] !== undefined);
      if (placedGGP.length > 0) {
        const minX = Math.min(...placedGGP.map(id => xPos[id]));
        const maxX = Math.max(...placedGGP.map(id => xPos[id]));
        const center = (minX + maxX) / 2;
        xPos[ggpPatUnion.partners[0]] = center - SPOUSE_X_GAP / 2;
        xPos[ggpPatUnion.partners[1]] = center + SPOUSE_X_GAP / 2;
      }
    }
  }

  // --- Nuclear children centered between mother and father ---
  if (nuclearChildren.length > 0) {
    const nucCenter = ((xPos['mother'] || 0) + (xPos['father'] || 0)) / 2;
    let cx = nucCenter - nuclearWidth / 2;
    nuclearChildren.forEach(cid => {
      xPos[cid] = cx;
      cx += NODE_X_SPACING;
    });
  }

  // --- Ancestor couples (data-driven) ---
  // Iteratively place all unions whose partners are unpositioned but have
  // at least one positioned child. Handles U_GG, U_GG_1, U_GG_2,
  // U_GG_MAT, U_GG_PAT, U_GGG, and any future ancestor unions.
  // Sorts deepest-first so multi-level ancestry chains resolve correctly.
  {
    const positioned = new Set(Object.keys(xPos));
    // Exclude unions already handled by the three-branch layout
    const handledUnionIds = new Set();
    if (parentsUnion) handledUnionIds.add(parentsUnion.id);
    if (matGPUnion) handledUnionIds.add(matGPUnion.id);
    if (patGPUnion) handledUnionIds.add(patGPUnion.id);
    motherOtherUnions.forEach(u => handledUnionIds.add(u.id));
    fatherOtherUnions.forEach(u => handledUnionIds.add(u.id));
    matRelUnions.forEach(u => handledUnionIds.add(u.id));
    patRelUnions.forEach(u => handledUnionIds.add(u.id));
    gpMatRelUnions.forEach(u => handledUnionIds.add(u.id));
    gpPatRelUnions.forEach(u => handledUnionIds.add(u.id));
    if (ggpMatUnion) handledUnionIds.add(ggpMatUnion.id);
    if (ggpPatUnion) handledUnionIds.add(ggpPatUnion.id);
    gen4Unions.forEach(u => handledUnionIds.add(u.id));
    directEditUnions.forEach(u => handledUnionIds.add(u.id));

    let changed = true;
    while (changed) {
      changed = false;

      // Collect candidate unions: both partners unpositioned, at least one child positioned
      const candidates = unions.filter(u => {
        if (handledUnionIds.has(u.id)) return false;
        const p1 = u.partners[0];
        const p2 = u.partners[1];
        if (positioned.has(p1) || positioned.has(p2)) return false;
        const children = childrenOf(u.id);
        return children.some(cid => positioned.has(cid));
      });

      // Sort by generation descending (deepest ancestors first) so that
      // multi-level chains (e.g. U_GGG above U_GG_MAT) resolve bottom-up
      candidates.sort((a, b) => {
        const genA = genValues[a.partners[0]] ?? 0;
        const genB = genValues[b.partners[0]] ?? 0;
        return genB - genA; // higher normalised gen = deeper in tree = process first
      });

      for (const u of candidates) {
        const children = childrenOf(u.id);
        const positionedChildren = children.filter(cid => positioned.has(cid));
        if (positionedChildren.length === 0) continue;

        const childXs = positionedChildren.map(cid => xPos[cid]);
        const center = (Math.min(...childXs) + Math.max(...childXs)) / 2;
        let p1X = center - SPOUSE_X_GAP / 2;
        let p2X = center + SPOUSE_X_GAP / 2;

        // Collision avoidance: shift right if overlapping already-positioned nodes at same Y
        const coupleY = yPos[u.partners[0]];
        const sameYIds = Object.keys(xPos).filter(id =>
          yPos[id] === coupleY && positioned.has(id)
        );
        for (const id of sameYIds) {
          const existX = xPos[id];
          // Check if either partner position collides (within NODE_X_SPACING)
          if (Math.abs(existX - p1X) < NODE_X_SPACING || Math.abs(existX - p2X) < NODE_X_SPACING) {
            const shift = NODE_X_SPACING;
            p1X = Math.max(p1X, existX + shift);
            p2X = p1X + SPOUSE_X_GAP;
          }
        }

        xPos[u.partners[0]] = p1X;
        xPos[u.partners[1]] = p2X;
        positioned.add(u.partners[0]);
        positioned.add(u.partners[1]);
        handledUnionIds.add(u.id);
        changed = true;
      }
    }
  }

  // --- Gen 4 descendants post-pass ---
  gen4Unions.forEach(u => {
    const p1 = u.partners[0];
    const p2 = u.partners[1];
    // One partner already has position, the other (spouse) doesn't
    const mainP = xPos[p1] !== undefined ? p1 : p2;
    const spouseP = mainP === p1 ? p2 : p1;
    const children = childrenOf(u.id);
    const childWidth = Math.max(0, (children.length - 1) * NODE_X_SPACING);

    // Shift everything to the right of mainP to make room
    const shiftAmount = Math.max(SPOUSE_X_GAP + NODE_X_SPACING, childWidth + NODE_X_SPACING);
    const mainX = xPos[mainP];
    Object.keys(xPos).forEach(id => {
      if (xPos[id] > mainX && id !== mainP) {
        xPos[id] += shiftAmount;
      }
    });

    xPos[spouseP] = mainX + SPOUSE_X_GAP;
    const cx = (mainX + xPos[spouseP]) / 2;
    let childX = cx - childWidth / 2;
    children.forEach(cid => {
      xPos[cid] = childX;
      childX += NODE_X_SPACING;
    });
  });

  // --- Direct edit unions post-pass ---
  // Similar to gen4: one partner has a position (the wizard-built individual),
  // the other (direct-edit spouse) needs to be placed next to it.
  directEditUnions.forEach(u => {
    const p1 = u.partners[0];
    const p2 = u.partners[1];
    const mainP = xPos[p1] !== undefined ? p1 : (xPos[p2] !== undefined ? p2 : null);
    if (!mainP) return; // neither partner positioned — skip
    const spouseP = mainP === p1 ? p2 : p1;
    const children = childrenOf(u.id);
    const childWidth = Math.max(0, (children.length - 1) * NODE_X_SPACING);

    // Shift everything to the right of mainP to make room
    const shiftAmount = Math.max(SPOUSE_X_GAP + NODE_X_SPACING, childWidth + NODE_X_SPACING);
    const mainX = xPos[mainP];
    Object.keys(xPos).forEach(id => {
      if (xPos[id] > mainX && id !== mainP) {
        xPos[id] += shiftAmount;
      }
    });

    if (xPos[spouseP] === undefined) {
      xPos[spouseP] = mainX + SPOUSE_X_GAP;
    }
    if (children.length > 0) {
      const cx = (xPos[mainP] + xPos[spouseP]) / 2;
      let childX = cx - childWidth / 2;
      children.forEach(cid => {
        xPos[cid] = childX;
        childX += NODE_X_SPACING;
      });
    }
  });

  // --- Fallback: position any unpositioned nodes near their connections ---
  // This prevents "floating" nodes at (0,0) that break edge rendering.
  individuals.forEach(ind => {
    if (xPos[ind.id] !== undefined) return;

    // Try to position near a partner
    const partnerUnion = unions.find(u => u.partners.includes(ind.id));
    if (partnerUnion) {
      const partnerId = partnerUnion.partners.find(p => p !== ind.id);
      if (xPos[partnerId] !== undefined) {
        xPos[ind.id] = xPos[partnerId] + SPOUSE_X_GAP;
        return;
      }
    }

    // Try to position near a parent union
    const parentRel = parentChildRelationships.find(r => r.children.includes(ind.id));
    if (parentRel) {
      const parentUnion = unions.find(u => u.id === parentRel.unionId);
      if (parentUnion) {
        const p1X = xPos[parentUnion.partners[0]];
        const p2X = xPos[parentUnion.partners[1]];
        if (p1X !== undefined && p2X !== undefined) {
          xPos[ind.id] = (p1X + p2X) / 2;
          return;
        }
      }
    }

    // Last resort: place at right edge
    const maxX = Math.max(80, ...Object.values(xPos).filter(v => v !== undefined));
    xPos[ind.id] = maxX + NODE_X_SPACING;
  });

  // --- Shift all to ensure minimum x = 80 ---
  const allXValues = Object.values(xPos);
  if (allXValues.length > 0) {
    const globalMinX = Math.min(...allXValues);
    if (globalMinX < 80) {
      const shift = 80 - globalMinX;
      Object.keys(xPos).forEach(id => { xPos[id] += shift; });
    }
  }

  // =============================================
  // EDGE GENERATION (typed!)
  // =============================================
  unions.forEach(u => {
    const p1 = u.partners[0];
    const p2 = u.partners[1];
    if (xPos[p1] === undefined || xPos[p2] === undefined) return;

    const leftId = xPos[p1] <= xPos[p2] ? p1 : p2;
    const rightId = leftId === p1 ? p2 : p1;
    const leftX = xPos[leftId];
    const rightX = xPos[rightId];
    const unionY = yPos[leftId];

    // --- UNION LINE ---
    // v0.3a.2: rendering keys off the explicit `relationshipBackground`
    // field (see relationshipBackground.js), not consanguinityStatus
    // directly — every union is guaranteed to have a relationshipBackground
    // by the end of pedigreeBuilderFromWizard.js's stage 10b. Both
    // consanguinity states render a DOUBLE union line (a clinician-declared
    // consanguineous union must always be visibly double-lined, per
    // pedigree nomenclature) — they differ only in style: a union whose
    // shared-ancestor path was actually built gets the standard solid black
    // double line; a union merely declared consanguineous with no backing
    // structure gets an amber dashed double line instead (see
    // PedigreeCanvas.jsx) — no "?" marker, since a question mark reads as
    // doubt about the clinician's report rather than "not yet structurally
    // confirmed." Non-consanguinity backgrounds (same village/origin, no
    // consanguinity reported, unknown) render as a normal single union line
    // with an optional neutral note — same_village_or_same_origin in
    // particular must NEVER render as a double line, since it is explicitly
    // not a claim of blood relationship.
    const { edgeType, noteText } = relationshipBackgroundToEdgeInfo(u.relationshipBackground);
    edges.push({
      type: edgeType,
      x1: leftX + NODE_HALF,
      y1: unionY,
      x2: rightX - NODE_HALF,
      y2: unionY,
      unionId: u.id,
      relationshipBackground: u.relationshipBackground,
      noteText,
    });

    // --- DIVORCE/SEPARATION SLASH ---
    if (u.status === 'divorced' || u.status === 'separated') {
      const cx = (leftX + rightX) / 2;
      edges.push({
        type: 'divorceSlash',
        x: cx,
        y: unionY,
        status: u.status,
      });
    }

    // --- CHILDLESS COUPLE MARKER ---
    // Standard pedigree symbol: short vertical drop from union center,
    // ending in a small horizontal bar (inverted T).
    const children = childrenOf(u.id);
    if (children.length === 0) {
      const unionCenterX = (leftX + rightX) / 2;
      const dropLen = 25; // short drop
      const barHalf = 12; // half-width of horizontal bar
      edges.push({
        type: 'childlessDrop',
        x1: unionCenterX, y1: unionY,
        x2: unionCenterX, y2: unionY + dropLen,
      });
      edges.push({
        type: 'childlessBar',
        x1: unionCenterX - barHalf, y1: unionY + dropLen,
        x2: unionCenterX + barHalf, y2: unionY + dropLen,
      });
    }

    // --- PARENT-CHILD EDGES ---
    if (children.length > 0) {
      const unionCenterX = (leftX + rightX) / 2;

      // Compute dropY dynamically: midpoint between parent Y and closest child Y
      const childYs = children.map(cid => yPos[cid]).filter(v => v !== undefined);
      const closestChildY = childYs.length > 0 ? Math.min(...childYs) : unionY + GEN_Y_SPACING;
      const dropY = (unionY + closestChildY) / 2;

      // Sibship horizontal rail
      const childXPositions = children.map(cid => xPos[cid]).filter(v => v !== undefined);
      if (childXPositions.length > 0) {
        const minCX = Math.min(...childXPositions);
        const maxCX = Math.max(...childXPositions);

        // Vertical drop from union center to sibship rail
        edges.push({
          type: 'parentChildDrop',
          x1: unionCenterX, y1: unionY,
          x2: unionCenterX, y2: dropY,
        });

        // Connect drop point to sibship rail if union center is outside child range
        // This creates the horizontal "elbow" connecting the vertical drop to the rail
        if (unionCenterX < minCX) {
          edges.push({
            type: 'sibship',
            x1: unionCenterX, y1: dropY,
            x2: maxCX, y2: dropY,
          });
        } else if (unionCenterX > maxCX) {
          edges.push({
            type: 'sibship',
            x1: minCX, y1: dropY,
            x2: unionCenterX, y2: dropY,
          });
        } else if (maxCX > minCX) {
          // Normal case: union center within child range
          edges.push({
            type: 'sibship',
            x1: minCX, y1: dropY,
            x2: maxCX, y2: dropY,
          });
        }

        // Vertical stems from sibship rail to each child
        children.forEach(cid => {
          if (xPos[cid] !== undefined && yPos[cid] !== undefined) {
            edges.push({
              type: 'childStem',
              x1: xPos[cid], y1: dropY,
              x2: xPos[cid], y2: yPos[cid] - symbolHalfFor(cid),
            });
          }
        });
      }
    }
  });

  // =============================================
  // BUILD NODES
  // =============================================
  const nodes = individuals.map(ind => ({
    ...ind,
    x: xPos[ind.id] || 0,
    y: yPos[ind.id] || 0,
  }));

  return { nodes, edges };
}
