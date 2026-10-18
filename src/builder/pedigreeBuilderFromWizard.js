/**
 * pedigreeBuilderFromWizard.js
 * 
 * Builds a pedigree graph from wizard state.
 * 
 * CRITICAL RULES:
 * 1. A union connects exactly two PARTNERS. Never siblings.
 * 2. Siblings share a parent union — they appear in parentChildRelationships.children.
 * 3. No individual is ever duplicated. Same ID = same node.
 * 4. Consanguinity paths re-use existing mother/father nodes as children of
 *    the appropriate grandparent union WITHOUT creating duplicate nodes.
 */

import { computeGenerations } from '../utils/graphTraversal';
import { applyChildOrder, reconcileOrder } from '../utils/childOrdering';

export function buildPedigreeFromWizard(state) {
  const individuals = [];
  const unions = [];
  const parentChildRelationships = [];
  const idSet = new Set();
  const childToUnionMap = new Map(); // childId → unionId (enforces single-parent)

  // --- Helpers ---
  const addInd = (props) => {
    const id = props.id;
    if (idSet.has(id)) return id; // never duplicate
    idSet.add(id);
    individuals.push({
      sex: 'unknown',
      age: '',
      generation: 3,
      relation: '',
      label: '',
      displayLabel: '',
      affected: false,
      carrier: false,
      deceased: false,
      proband: false,
      pregnancyLoss: false,
      stillbirth: false,
      notes: '',
      ...props,
    });
    return id;
  };

  const addUnion = (id, partner1, partner2, opts = {}) => {
    unions.push({
      id,
      partners: [partner1, partner2],
      consanguineous: opts.consanguineous || false,
      consanguinityDegree: opts.consanguinityDegree || null,
      // consanguinityStatus is the authoritative field for RENDERING and
      // integrity auditing (see graphIntegrity.js CHECK 12/13 and
      // pedigreeLayout.js edge-type selection). `consanguineous` above is
      // kept as "the user declared this union consanguineous" and is NOT
      // sufficient on its own to justify drawing a full double cousin-marriage
      // line — CLAUDE.md's non-negotiable rule #4 requires shared-ancestor
      // nodes to actually exist in the graph for that.
      //   'known_supported'    — shared-ancestor path was actually built
      //   'reported_unresolved' — user declared consanguinity, no ancestor
      //                           path is modeled for it
      //   'none'                — not declared consanguineous
      //   'pending'             — internal-only transient state, must never
      //                           survive to the returned graph (see the
      //                           finalization pass after the consanguinity
      //                           path engine, and CHECK 13)
      consanguinityStatus: opts.consanguinityStatus || 'none',
      status: opts.status || 'together',
      // v0.3a.2 — explicit relationship-background field (see
      // relationshipBackground.js). Left unset (null) here; a final pass
      // near the end of the build (after all consanguinity mechanisms have
      // run) fills in a coherent value for every union, whether or not it
      // was explicitly declared via state.unionRelationshipBackgrounds.
      relationshipBackground: opts.relationshipBackground || null,
    });
    return id;
  };

  /**
   * Walk upward from `id` via childToUnionMap → union.partners, collecting
   * every ancestor individual ID reachable in the graph as currently built.
   * Used only to detect *real, already-modeled* shared ancestry (v0.3a.1
   * consanguinity fix) — never to invent one. If two individuals' ancestor
   * sets intersect, a shared-ancestor path genuinely exists in the graph
   * already (per CLAUDE.md non-negotiable rule #4), regardless of which
   * builder stage created it (template consanguinity, the "make siblings"
   * custom-consanguinity mechanism, or a direct graph edit).
   */
  const collectAncestors = (id) => {
    const ancestors = new Set();
    const stack = [id];
    const visited = new Set();
    while (stack.length > 0) {
      const current = stack.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      const unionId = childToUnionMap.get(current);
      if (!unionId) continue;
      const union = unions.find(u => u.id === unionId);
      if (!union) continue;
      for (const p of union.partners) {
        if (!ancestors.has(p)) {
          ancestors.add(p);
          stack.push(p);
        }
      }
    }
    return ancestors;
  };

  const addChild = (unionId, childId) => {
    // GUARD: prevent child from being attached to multiple unions
    const existingUnion = childToUnionMap.get(childId);
    if (existingUnion && existingUnion !== unionId) {
      console.warn(`[PedigreeBuilder] Child '${childId}' already in union '${existingUnion}', skipping attach to '${unionId}'`);
      return;
    }
    childToUnionMap.set(childId, unionId);

    let rel = parentChildRelationships.find(r => r.unionId === unionId);
    if (!rel) {
      rel = { unionId, children: [] };
      parentChildRelationships.push(rel);
    }
    if (!rel.children.includes(childId)) {
      rel.children.push(childId);
    }
  };

  // ========================================
  // 1. MOTHER & FATHER (fixed IDs)
  // ========================================
  let motherId = null;
  let fatherId = null;

  if (state.parents.motherExists) {
    motherId = 'mother';
    addInd({ id: 'mother', sex: 'female', generation: 2, relation: 'mother', label: 'Anne', age: state.parents.motherAge });
  }
  if (state.parents.fatherExists) {
    fatherId = 'father';
    addInd({ id: 'father', sex: 'male', generation: 2, relation: 'father', label: 'Baba', age: state.parents.fatherAge });
  }

  // ========================================
  // 2. PARENTS UNION (U_PARENTS)
  // ========================================
  let parentsUnionId = null;
  if (motherId && fatherId) {
    parentsUnionId = 'U_PARENTS';
    const isParentsConsang = state.parents.consanguineous === true;

    addUnion('U_PARENTS', motherId, fatherId, {
      consanguineous: isParentsConsang,
      consanguinityDegree: isParentsConsang ? state.parents.consanguinityDegree : null,
      consanguinityPath: isParentsConsang ? state.parents.consanguinityPath || null : null,
      // 'pending' when declared — finalized to 'known_supported' by the
      // consanguinity path engine (stage 7) if it actually builds shared
      // ancestors, or to 'reported_unresolved' otherwise (see the
      // finalization block right after stage 7).
      consanguinityStatus: isParentsConsang ? 'pending' : 'none',
      status: state.parents.relationshipStatus,
    });
  }

  // ========================================
  // 3. PROBAND + FULL SIBLINGS (sorted by age)
  // ========================================
  const allFullSiblings = [];

  // Proband
  // NOTE: `proband: true` is NOT set here. Proband assignment is centralized
  // in stage 10d (PROBAND ASSIGNMENT) below, which is the single place that
  // decides — via state.probandId — which one individual in the whole graph
  // carries the flag. This node keeps the fixed id 'proband' as the wizard's
  // structural anchor (BFS/layout anchor, gen4 dropdown target, etc.)
  // regardless of who the clinical index case is ultimately marked as.
  allFullSiblings.push({
    id: 'proband',
    sex: state.proband.sex,
    age: state.proband.age,
    generation: 3,
    relation: 'proband',
    label: 'Proband',
    _order: 0,
  });

  let orderCounter = 1;
  state.siblings.male.forEach((s, idx) => {
    allFullSiblings.push({
      id: `sib_m_${idx}`,
      sex: 'male', generation: 3, relation: 'sibling',
      label: 'Erkek Kardeş', age: s.age, _order: orderCounter++,
    });
  });
  state.siblings.female.forEach((s, idx) => {
    allFullSiblings.push({
      id: `sib_f_${idx}`,
      sex: 'female', generation: 3, relation: 'sibling',
      label: 'Kız Kardeş', age: s.age, _order: orderCounter++,
    });
  });
  state.siblings.unknown.forEach((s, idx) => {
    allFullSiblings.push({
      id: `sib_u_${idx}`,
      sex: 'unknown', generation: 3, relation: 'sibling',
      label: 'Kardeş', age: s.age, _order: orderCounter++,
    });
  });
  for (let i = 0; i < state.siblings.pregnancyLoss; i++) {
    allFullSiblings.push({
      id: `sib_loss_${i}`,
      sex: 'unknown', pregnancyLoss: true, generation: 3,
      relation: 'sibling', label: 'Düşük', _order: orderCounter++,
    });
  }
  for (let i = 0; i < state.siblings.deceased; i++) {
    allFullSiblings.push({
      id: `sib_still_${i}`,
      sex: 'unknown', deceased: true, stillbirth: true, generation: 3,
      relation: 'sibling', label: 'Ölü Doğum', _order: orderCounter++,
    });
  }

  // Sort: uses persistent childOrders['U_PARENTS'] if present,
  // otherwise falls back to default deterministic order.
  // The shared applyChildOrder() handles reconciliation for all child groups.
  const childOrders = state.childOrders || {};
  const getChildOrder = (unionId) => childOrders[unionId] || null;

  const sortedFullSiblings = applyChildOrder(
    allFullSiblings,
    getChildOrder('U_PARENTS'),
    'proband',
  );

  sortedFullSiblings.forEach(sib => {
    addInd(sib);
    if (parentsUnionId) addChild(parentsUnionId, sib.id);
  });

  // ========================================
  // 4. MOTHER OTHER UNIONS (half-siblings)
  // ========================================
  if (motherId) {
    state.parents.motherOtherUnions.forEach((u, i) => {
      const spouseId = `mother_spouse_${i}`;
      const unionId = `U_MOTHER_OTHER_${i}`;
      addInd({ id: spouseId, sex: 'male', generation: 2, relation: 'spouse_mother', label: `Anne Eşi ${i + 1}` });
      addUnion(unionId, motherId, spouseId, { status: u.status });

      // Collect half-sibling children, then apply ordering
      const hSibChildren = [];
      for (let c = 0; c < u.children.male; c++) {
        const cid = `hsib_mat_m_${i}_${c}`;
        hSibChildren.push({ id: cid, sex: 'male', generation: 3, relation: 'half_sibling_maternal' });
      }
      for (let c = 0; c < u.children.female; c++) {
        const cid = `hsib_mat_f_${i}_${c}`;
        hSibChildren.push({ id: cid, sex: 'female', generation: 3, relation: 'half_sibling_maternal' });
      }
      for (let c = 0; c < u.children.unknown; c++) {
        const cid = `hsib_mat_u_${i}_${c}`;
        hSibChildren.push({ id: cid, sex: 'unknown', generation: 3, relation: 'half_sibling_maternal' });
      }

      const orderedHSibs = applyChildOrder(hSibChildren, getChildOrder(unionId), null);
      orderedHSibs.forEach(child => {
        addInd(child);
        addChild(unionId, child.id);
      });
    });
  }

  // ========================================
  // 5. FATHER OTHER UNIONS (half-siblings)
  // ========================================
  if (fatherId) {
    state.parents.fatherOtherUnions.forEach((u, i) => {
      const spouseId = `father_spouse_${i}`;
      const unionId = `U_FATHER_OTHER_${i}`;
      addInd({ id: spouseId, sex: 'female', generation: 2, relation: 'spouse_father', label: `Baba Eşi ${i + 1}` });
      addUnion(unionId, fatherId, spouseId, { status: u.status });

      // Collect half-sibling children, then apply ordering
      const hSibChildren = [];
      for (let c = 0; c < u.children.male; c++) {
        const cid = `hsib_pat_m_${i}_${c}`;
        hSibChildren.push({ id: cid, sex: 'male', generation: 3, relation: 'half_sibling_paternal' });
      }
      for (let c = 0; c < u.children.female; c++) {
        const cid = `hsib_pat_f_${i}_${c}`;
        hSibChildren.push({ id: cid, sex: 'female', generation: 3, relation: 'half_sibling_paternal' });
      }
      for (let c = 0; c < u.children.unknown; c++) {
        const cid = `hsib_pat_u_${i}_${c}`;
        hSibChildren.push({ id: cid, sex: 'unknown', generation: 3, relation: 'half_sibling_paternal' });
      }

      const orderedHSibs = applyChildOrder(hSibChildren, getChildOrder(unionId), null);
      orderedHSibs.forEach(child => {
        addInd(child);
        addChild(unionId, child.id);
      });
    });
  }

  // ========================================
  // 6. GRANDPARENTS
  // ========================================
  let maternalGPUnionId = null;
  let paternalGPUnionId = null;

  const needMatGP = state.parents.motherExists ||
    state.maternalRelatives.uncles.length > 0 ||
    state.maternalRelatives.aunts.length > 0;

  const needPatGP = state.parents.fatherExists ||
    state.paternalRelatives.uncles.length > 0 ||
    state.paternalRelatives.aunts.length > 0;

  if (needMatGP) {
    addInd({ id: 'mat_gf', sex: 'male', generation: 1, relation: 'maternal_gf', label: 'Dede (Anne)' });
    addInd({ id: 'mat_gm', sex: 'female', generation: 1, relation: 'maternal_gm', label: 'Anneanne' });
    maternalGPUnionId = 'U_MAT_GP';
    addUnion('U_MAT_GP', 'mat_gf', 'mat_gm');
    if (motherId) addChild('U_MAT_GP', motherId);
  }

  if (needPatGP) {
    addInd({ id: 'pat_gf', sex: 'male', generation: 1, relation: 'paternal_gf', label: 'Dede (Baba)' });
    addInd({ id: 'pat_gm', sex: 'female', generation: 1, relation: 'paternal_gm', label: 'Babaanne' });
    paternalGPUnionId = 'U_PAT_GP';
    addUnion('U_PAT_GP', 'pat_gf', 'pat_gm');
    if (fatherId) addChild('U_PAT_GP', fatherId);
  }

  // ========================================
  // 7. CONSANGUINITY PATH ENGINE
  // ========================================
  // RULE: We NEVER duplicate mother or father.
  // Instead we make the appropriate grandparent a child of a great-grandparent union.
  // For first-cousin: two grandparents are siblings (share a great-grandparent union).
  if (state.parents.consanguineous && maternalGPUnionId && paternalGPUnionId) {
    const degree = state.parents.consanguinityDegree;

    // Default lineage shape per degree, used ONLY for degrees where the
    // builder implements exactly one possible ancestor structure (no real
    // choice to make — second_cousin and double_first_cousin have no
    // "which grandparent pair" ambiguity in this app's model).
    const DEGREE_TO_DEFAULT_PATH = {
      second_cousin: 'second_cousin_simple',
      first_cousin_once_removed: 'first_cousin_removed',
      double_first_cousin: 'double_first_cousin',
    };

    // `first_cousin` is different: the wizard's own "Akrabalık Yolu" dropdown
    // offers 4 mutually-exclusive lineage paths (which specific grandparent
    // pair is the sibling pair) — a real, per-case choice, not a template
    // default. Silently assuming one of them when the user explicitly left
    // it at "Bilinmiyor" would fabricate a specific ancestry claim nobody
    // made. So first_cousin requires an EXPLICIT non-'unknown' path to
    // resolve; left unknown, it falls through to 'reported_unresolved' via
    // the finalization step below, same as any other unmodeled case —
    // no ancestor nodes are created, matching the existing UI hint text
    // ("Yol bilinmediginden ust soy baglantisi cizilmeyecek").
    const explicitPath = state.parents.consanguinityPath;
    const userConfirmedPath = (explicitPath && explicitPath !== 'unknown') ? explicitPath : null;
    const effectivePath = userConfirmedPath
      || (degree === 'first_cousin' ? null : DEGREE_TO_DEFAULT_PATH[degree] || null);

    if (effectivePath && degree === 'first_cousin') {
      let sib1 = null; // a maternal grandparent
      let sib2 = null; // a paternal grandparent

      if (effectivePath === 'mothers_paternal_is_fathers_paternal') {
        sib1 = 'mat_gf'; sib2 = 'pat_gf';
      } else if (effectivePath === 'mothers_maternal_is_fathers_maternal') {
        sib1 = 'mat_gm'; sib2 = 'pat_gm';
      } else if (effectivePath === 'cross_cousin_1') {
        sib1 = 'mat_gm'; sib2 = 'pat_gf';
      } else if (effectivePath === 'cross_cousin_2') {
        sib1 = 'mat_gf'; sib2 = 'pat_gm';
      }

      if (sib1 && sib2) {
        addInd({ id: 'ggf', sex: 'male', generation: 0, relation: 'ggf', label: 'Büyük Dede' });
        addInd({ id: 'ggm', sex: 'female', generation: 0, relation: 'ggm', label: 'Büyük Anne' });
        addUnion('U_GG', 'ggf', 'ggm');
        addChild('U_GG', sib1);
        addChild('U_GG', sib2);
        markParentsConsanguinityResolved();
      }
    } else if (effectivePath && degree === 'double_first_cousin') {
      // Both pairs of grandparents are siblings
      addInd({ id: 'ggf_1', sex: 'male', generation: 0, relation: 'ggf', label: 'Büyük Dede 1' });
      addInd({ id: 'ggm_1', sex: 'female', generation: 0, relation: 'ggm', label: 'Büyük Anne 1' });
      addUnion('U_GG_1', 'ggf_1', 'ggm_1');
      addChild('U_GG_1', 'mat_gf');
      addChild('U_GG_1', 'pat_gf');

      addInd({ id: 'ggf_2', sex: 'male', generation: 0, relation: 'ggf', label: 'Büyük Dede 2' });
      addInd({ id: 'ggm_2', sex: 'female', generation: 0, relation: 'ggm', label: 'Büyük Anne 2' });
      addUnion('U_GG_2', 'ggf_2', 'ggm_2');
      addChild('U_GG_2', 'mat_gm');
      addChild('U_GG_2', 'pat_gm');
      markParentsConsanguinityResolved();
    } else if (effectivePath && degree === 'second_cousin') {
      // Great-grandparents are siblings — add great-great-grandparents
      addInd({ id: 'ggf_mat', sex: 'male', generation: 0, relation: 'ggf', label: 'B.Dede (Anne)' });
      addInd({ id: 'ggm_mat', sex: 'female', generation: 0, relation: 'ggm', label: 'B.Anne (Anne)' });
      addUnion('U_GG_MAT', 'ggf_mat', 'ggm_mat');
      addChild('U_GG_MAT', 'mat_gf');

      addInd({ id: 'ggf_pat', sex: 'male', generation: 0, relation: 'ggf', label: 'B.Dede (Baba)' });
      addInd({ id: 'ggm_pat', sex: 'female', generation: 0, relation: 'ggm', label: 'B.Anne (Baba)' });
      addUnion('U_GG_PAT', 'ggf_pat', 'ggm_pat');
      addChild('U_GG_PAT', 'pat_gf');

      // Shared great-great-grandparents
      addInd({ id: 'gggf', sex: 'male', generation: -1, relation: 'gggf', label: 'Ata Dede' });
      addInd({ id: 'gggm', sex: 'female', generation: -1, relation: 'gggm', label: 'Ata Anne' });
      addUnion('U_GGG', 'gggf', 'gggm');
      addChild('U_GGG', 'ggf_mat');
      addChild('U_GGG', 'ggf_pat');
      markParentsConsanguinityResolved();
    }
    // For other degrees (first_cousin_once_removed, second_cousin_once_removed,
    // multiple_relationship, other, or an unresolved 'unknown' path) no shared
    // ancestor structure is built here. U_PARENTS.consanguinityStatus is
    // finalized to 'reported_unresolved' below — it must NOT render as a
    // fully-modeled cousin marriage (CLAUDE.md non-negotiable rule #4).
  }

  // Finalize U_PARENTS consanguinity status: anything still 'pending' at this
  // point was declared consanguineous but never got a shared-ancestor path
  // built for it above (unsupported degree, unresolved path, or missing
  // grandparent unions). Runs unconditionally, independent of the `if` above,
  // so it also covers those edge cases.
  {
    const parentsUnionForStatus = unions.find(u => u.id === 'U_PARENTS');
    if (parentsUnionForStatus && parentsUnionForStatus.consanguinityStatus === 'pending') {
      parentsUnionForStatus.consanguinityStatus = 'reported_unresolved';
    }
  }

  function markParentsConsanguinityResolved() {
    const u = unions.find(x => x.id === 'U_PARENTS');
    if (u) u.consanguinityStatus = 'known_supported';
  }

  // ========================================
  // SHARED HELPER: buildCollateralBranch
  // ========================================
  // Builds one relative (uncle or aunt) + spouse + children.
  // Replaces 4 identical loops (mat_uncle, mat_aunt, pat_uncle, pat_aunt).
  //
  // Parameters:
  //   relative    — wizard data object { id, children: { male, female, unknown, pregnancyLoss, stillbirth } }
  //   index       — ordinal index within this role (0, 1, 2…)
  //   config      — { side, role, sex, relation, label, spouseSex, spouseRelation, unionPrefix }
  //   gpUnionId   — grandparent union to attach this relative as a child
  //
  const buildCollateralBranch = (relative, index, config, gpUnionId) => {
    const relId = `${config.side}_${config.role}_${index}`;
    addInd({
      id: relId,
      sex: config.sex,
      generation: 2,
      relation: config.relation,
      label: `${config.label} ${index + 1}`,
    });
    addChild(gpUnionId, relId);

    const kids = relative.children || {};
    const totalKids =
      (kids.male || 0) + (kids.female || 0) + (kids.unknown || 0) +
      (kids.pregnancyLoss || 0) + (kids.stillbirth || 0);

    // v0.3a.3 fix: a maternal/paternal uncle/aunt (or great-uncle/aunt) is a
    // STANDALONE sibling individual by default — a spouse/union is only
    // created when the wizard was actually told this relative has children
    // (which structurally requires two parents). Previously this always
    // fabricated a spouse + union regardless of the requested child count,
    // making every added aunt/uncle appear married even when the user only
    // wanted to record a sibling. No union/spouse is shown unless the user
    // explicitly adds one (via children here, or a spouse/partner action
    // from the selected-person editor later).
    if (totalKids > 0) {
      const spouseId = `${relId}_sp`;
      addInd({
        id: spouseId,
        sex: config.spouseSex,
        generation: 2,
        relation: config.spouseRelation,
      });
      const unionId = `${config.unionPrefix}_${index}`;
      addUnion(unionId, relId, spouseId);
      // Collect all children, then apply ordering
      const cousinChildren = [];
      for (let c = 0; c < (kids.male || 0); c++) {
        cousinChildren.push({ id: `${relId}_cm_${c}`, sex: 'male', generation: 3, relation: 'kuzen' });
      }
      for (let c = 0; c < (kids.female || 0); c++) {
        cousinChildren.push({ id: `${relId}_cf_${c}`, sex: 'female', generation: 3, relation: 'kuzen' });
      }
      for (let c = 0; c < (kids.unknown || 0); c++) {
        cousinChildren.push({ id: `${relId}_cu_${c}`, sex: 'unknown', generation: 3, relation: 'kuzen' });
      }
      for (let c = 0; c < (kids.pregnancyLoss || 0); c++) {
        cousinChildren.push({
          id: `${relId}_loss_${c}`, sex: 'unknown', pregnancyLoss: true,
          generation: 3, relation: 'kuzen', label: 'Düşük',
        });
      }
      for (let c = 0; c < (kids.stillbirth || 0); c++) {
        cousinChildren.push({
          id: `${relId}_still_${c}`, sex: 'unknown', stillbirth: true, deceased: true,
          generation: 3, relation: 'kuzen', label: 'Ölü Doğum',
        });
      }

      const orderedCousins = applyChildOrder(cousinChildren, getChildOrder(unionId), null);
      orderedCousins.forEach(child => {
        addInd(child);
        addChild(unionId, child.id);
      });
    }
  };

  // ========================================
  // 8. MATERNAL RELATIVES (Dayı, Teyze)
  // ========================================
  if (maternalGPUnionId) {
    state.maternalRelatives.uncles.forEach((rel, i) => {
      buildCollateralBranch(rel, i, {
        side: 'mat', role: 'uncle', sex: 'male',
        relation: 'dayi', label: 'Dayı',
        spouseSex: 'female', spouseRelation: 'spouse_dayi',
        unionPrefix: 'U_MAT_UNCLE',
      }, maternalGPUnionId);
    });
    state.maternalRelatives.aunts.forEach((rel, i) => {
      buildCollateralBranch(rel, i, {
        side: 'mat', role: 'aunt', sex: 'female',
        relation: 'teyze', label: 'Teyze',
        spouseSex: 'male', spouseRelation: 'spouse_teyze',
        unionPrefix: 'U_MAT_AUNT',
      }, maternalGPUnionId);
    });
  }

  // ========================================
  // 9. PATERNAL RELATIVES (Amca, Hala)
  // ========================================
  if (paternalGPUnionId) {
    state.paternalRelatives.uncles.forEach((rel, i) => {
      buildCollateralBranch(rel, i, {
        side: 'pat', role: 'uncle', sex: 'male',
        relation: 'amca', label: 'Amca',
        spouseSex: 'female', spouseRelation: 'spouse_amca',
        unionPrefix: 'U_PAT_UNCLE',
      }, paternalGPUnionId);
    });
    state.paternalRelatives.aunts.forEach((rel, i) => {
      buildCollateralBranch(rel, i, {
        side: 'pat', role: 'aunt', sex: 'female',
        relation: 'hala', label: 'Hala',
        spouseSex: 'male', spouseRelation: 'spouse_hala',
        unionPrefix: 'U_PAT_AUNT',
      }, paternalGPUnionId);
    });
  }

  // ========================================
  // 9b. GRANDPARENT-LEVEL RELATIVES (Büyük Dayı/Amca/Teyze/Hala)
  // ========================================
  // Siblings of grandparents — attached to the relevant great-grandparent union.
  // These use gen 1 (same generation as grandparents) and their children at gen 2.

  const buildGPCollateral = (gpRelatives, side, gpUnionId) => {
    if (!gpRelatives || !gpUnionId) return;

    // We need a great-grandparent union to attach GP siblings to.
    // Create one if it doesn't exist yet.
    const ggpUnionId = `U_GGP_${side}`;
    const gpId = side === 'mat' ? 'mat_gf' : 'pat_gf'; // default: grandfather's parent
    const hasAny = (gpRelatives.uncles?.length > 0) || (gpRelatives.aunts?.length > 0);
    if (!hasAny) return;

    // Create great-grandparent couple if not already present
    const ggfId = `ggp_${side}_f`;
    const ggmId = `ggp_${side}_m`;
    if (!idSet.has(ggfId)) {
      const sideLabel = side === 'mat' ? 'Anne' : 'Baba';
      addInd({ id: ggfId, sex: 'male', generation: 0, relation: 'ggf', label: `B.Dede (${sideLabel})` });
      addInd({ id: ggmId, sex: 'female', generation: 0, relation: 'ggm', label: `B.Anne (${sideLabel})` });
      addUnion(ggpUnionId, ggfId, ggmId);
      // Attach the grandparent as child of this great-grandparent union
      addChild(ggpUnionId, gpId);
    }

    gpRelatives.uncles?.forEach((rel, i) => {
      buildCollateralBranch(rel, i, {
        side: `gp_${side}`, role: 'uncle', sex: 'male',
        relation: 'buyuk_dayi', label: side === 'mat' ? 'B.Dayı' : 'B.Amca',
        spouseSex: 'female', spouseRelation: 'spouse_gp_uncle',
        unionPrefix: `U_GP_${side.toUpperCase()}_UNCLE`,
      }, ggpUnionId);
    });

    gpRelatives.aunts?.forEach((rel, i) => {
      buildCollateralBranch(rel, i, {
        side: `gp_${side}`, role: 'aunt', sex: 'female',
        relation: 'buyuk_teyze', label: side === 'mat' ? 'B.Teyze' : 'B.Hala',
        spouseSex: 'male', spouseRelation: 'spouse_gp_aunt',
        unionPrefix: `U_GP_${side.toUpperCase()}_AUNT`,
      }, ggpUnionId);
    });
  };

  buildGPCollateral(state.maternalGPRelatives, 'mat', maternalGPUnionId);
  buildGPCollateral(state.paternalGPRelatives, 'pat', paternalGPUnionId);

  // ========================================
  // 9c. EXPLICIT GREAT-GRANDPARENTS
  // ========================================
  // User can toggle showing parents for each grandparent.
  // Creates great-grandparent unions if not already present from 9b or consanguinity.
  if (state.greatGrandparents) {
    const gpConfigs = [
      { key: 'mat_gf', gpId: 'mat_gf', side: 'mat', label: 'Dede (Anne)' },
      { key: 'mat_gm', gpId: 'mat_gm', side: 'mat', label: 'Anneanne' },
      { key: 'pat_gf', gpId: 'pat_gf', side: 'pat', label: 'Dede (Baba)' },
      { key: 'pat_gm', gpId: 'pat_gm', side: 'pat', label: 'Babaanne' },
    ];

    gpConfigs.forEach(({ key, gpId, label }) => {
      if (!state.greatGrandparents[key]) return;
      if (!idSet.has(gpId)) return; // grandparent doesn't exist

      // Check if this grandparent already has a parent union (from consanguinity or 9b)
      const existingParent = parentChildRelationships.find(
        r => r.children.includes(gpId)
      );
      if (existingParent) return; // already has parents

      const ggfId = `gg_${key}_f`;
      const ggmId = `gg_${key}_m`;
      const unionId = `U_GG_${key.toUpperCase()}`;

      addInd({ id: ggfId, sex: 'male', generation: 0, relation: 'ggf', label: `${label} Baba` });
      addInd({ id: ggmId, sex: 'female', generation: 0, relation: 'ggm', label: `${label} Anne` });
      addUnion(unionId, ggfId, ggmId);
      addChild(unionId, gpId);
    });
  }

  // ========================================
  // 10. GENERATION 4 DESCENDANTS
  // ========================================
  if (state.gen4) {
    state.gen4.forEach((g, idx) => {
      const targetId = g.targetPath === 'proband' ? 'proband' : g.targetPath;
      const target = individuals.find(i => i.id === targetId);
      if (!target) return;
      const totalKids = (g.male || 0) + (g.female || 0) + (g.unknown || 0);
      if (totalKids === 0) return;

      // Find if target already has a partner union
      let existingUnion = unions.find(u => u.partners.includes(targetId));
      let unionId;
      if (!existingUnion) {
        const spouseSex = target.sex === 'male' ? 'female' : (target.sex === 'female' ? 'male' : 'unknown');
        const spouseId = `gen4_sp_${idx}`;
        addInd({ id: spouseId, sex: spouseSex, generation: target.generation, relation: 'spouse_gen4' });
        unionId = `U_GEN4_${idx}`;
        addUnion(unionId, targetId, spouseId);
      } else {
        unionId = existingUnion.id;
      }

      const childGen = target.generation + 1;

      // Collect gen4 children, then apply ordering
      const gen4Children = [];
      for (let c = 0; c < (g.male || 0); c++) {
        gen4Children.push({ id: `gen4_${idx}_cm_${c}`, sex: 'male', generation: childGen, relation: 'gen4_child' });
      }
      for (let c = 0; c < (g.female || 0); c++) {
        gen4Children.push({ id: `gen4_${idx}_cf_${c}`, sex: 'female', generation: childGen, relation: 'gen4_child' });
      }
      for (let c = 0; c < (g.unknown || 0); c++) {
        gen4Children.push({ id: `gen4_${idx}_cu_${c}`, sex: 'unknown', generation: childGen, relation: 'gen4_child' });
      }

      const orderedGen4 = applyChildOrder(gen4Children, getChildOrder(unionId), null);
      orderedGen4.forEach(child => {
        addInd(child);
        addChild(unionId, child.id);
      });
    });
  }

  // ========================================
  // 10c. DIRECT GRAPH EDITS (right-panel additions)
  // ========================================
  // Process user-added individuals/unions from the IndividualEditor.
  // These are stored as persistent instructions in state.graphEdits[].
  // Each edit creates individuals/unions/PCRs that survive wizard rebuilds.
  if (state.graphEdits && state.graphEdits.length > 0) {
    state.graphEdits.forEach(edit => {
      if (edit.type === 'addSpouse') {
        // Create a spouse individual and a union with the target
        const target = individuals.find(i => i.id === edit.targetId);
        if (!target) return;
        if (idSet.has(edit.spouseId)) return; // already created

        addInd({
          id: edit.spouseId,
          sex: edit.spouseSex || 'unknown',
          generation: target.generation,
          relation: 'spouse_direct',
          label: edit.spouseSex === 'male' ? 'Es (E)' : edit.spouseSex === 'female' ? 'Es (K)' : 'Es',
        });
        addUnion(edit.unionId, edit.targetId, edit.spouseId);
      } else if (edit.type === 'addChild') {
        // Add a child to an existing union
        const union = unions.find(u => u.id === edit.unionId);
        if (!union) return;
        if (idSet.has(edit.childId)) return; // already created

        // Child generation = parent generation + 1
        const parent = individuals.find(i => i.id === union.partners[0]);
        const childGen = parent ? parent.generation + 1 : 3;

        addInd({
          id: edit.childId,
          sex: edit.sex || 'unknown',
          generation: childGen,
          relation: 'child_direct',
          label: edit.sex === 'male' ? 'Cocuk (E)' : edit.sex === 'female' ? 'Cocuk (K)' : 'Cocuk',
        });
        addChild(edit.unionId, edit.childId);
      } else if (edit.type === 'linkPartners') {
        // "Make partners" (v0.3a.1 multi-select action) — connects two
        // ALREADY-EXISTING individuals via a new union. Unlike addSpouse,
        // this never creates a new individual; both partners must already
        // be present in the graph (wizard-derived or a prior direct edit).
        // Store-side (usePedigreeStore.js's computeUnionCreationPlan)
        // already validates self-union, duplicate-union, and unconsented
        // sibling pairing before dispatching this edit — this is a
        // defensive re-check, not the primary gate.
        if (idSet.has(edit.unionId)) return; // already created
        const p1 = individuals.find(i => i.id === edit.person1);
        const p2 = individuals.find(i => i.id === edit.person2);
        if (!p1 || !p2 || edit.person1 === edit.person2) return;
        addUnion(edit.unionId, edit.person1, edit.person2, {
          status: edit.status || 'together',
        });
      } else if (edit.type === 'addParents') {
        // v0.3a.3 selected-person "add mother/father/both parents" action.
        // Creates a new parent union ABOVE an existing individual who
        // currently has none. Unlike addSpouse (same generation) or
        // addChild (+1 generation), this creates individuals at
        // target.generation - 1 and attaches the target as their child.
        //
        // A union always needs exactly two partners (CLAUDE.md non-negotiable
        // #3) — "add mother" or "add father" alone still creates a second,
        // explicitly-unspecified placeholder individual (sex: 'unknown',
        // labeled "Diğer Ebeveyn (belirtilmedi)") to complete the union,
        // rather than fabricating a named/gendered co-parent. This is a
        // structural requirement, not an unsupported clinical claim — the
        // placeholder is visibly marked as unspecified, never presented as
        // a confirmed second parent.
        const target = individuals.find(i => i.id === edit.targetId);
        if (!target) return;
        if (idSet.has(edit.parent1Id) || idSet.has(edit.parent2Id)) return; // already created
        if (childToUnionMap.has(edit.targetId)) return; // target already has a parent union — refuse to double-attach

        const parentGen = target.generation - 1;
        addInd({
          id: edit.parent1Id,
          sex: edit.parent1Sex,
          generation: parentGen,
          relation: 'added_parent',
          label: edit.parent1Sex === 'male' ? 'Baba' : edit.parent1Sex === 'female' ? 'Anne' : 'Ebeveyn',
        });
        addInd({
          id: edit.parent2Id,
          sex: edit.parent2Sex,
          generation: parentGen,
          relation: 'added_parent',
          label: edit.parent2IsPlaceholder ? 'Diğer Ebeveyn (belirtilmedi)' : (edit.parent2Sex === 'male' ? 'Baba' : 'Anne'),
        });
        addUnion(edit.unionId, edit.parent1Id, edit.parent2Id);
        addChild(edit.unionId, edit.targetId);
      }
    });
  }

  // ========================================
  // 10a (relocated). CUSTOM CONSANGUINITY LINKS ("make siblings")
  // ========================================
  // User-defined "these two individuals are siblings" — creates a shared
  // parent union for any two existing individuals in the graph. This
  // enables arbitrary consanguinity paths beyond the template system, and
  // (v0.3a.1) is also how the multi-select "Kardeş Yap" action works.
  //
  // v0.3a.1 fix: this stage used to run BEFORE 10c (direct graph edits),
  // which meant a "make siblings" link between two individuals who only
  // exist because of a direct graph edit (e.g. two spouse stubs added via
  // addSpouseTo) would silently do nothing — `individuals.find(...)` for
  // either person would fail since neither existed yet at that point in the
  // build, and the `if (!p1 || !p2) return;` guard bailed out with no
  // error. Relocated to run AFTER 10c so it can see every individual the
  // build has created so far, matching the same reasoning already applied
  // to stage 10b's relocation below.
  if (state.customConsanguinity && state.customConsanguinity.length > 0) {
    state.customConsanguinity.forEach((link, idx) => {
      if (link.type !== 'siblings') return;
      const p1 = individuals.find(i => i.id === link.person1);
      const p2 = individuals.find(i => i.id === link.person2);
      if (!p1 || !p2) return;

      // Check if they already share a parent union (from template consanguinity)
      const p1ParentUnion = parentChildRelationships.find(r => r.children.includes(link.person1));
      const p2ParentUnion = parentChildRelationships.find(r => r.children.includes(link.person2));
      if (p1ParentUnion && p2ParentUnion && p1ParentUnion.unionId === p2ParentUnion.unionId) {
        return; // Already siblings in the graph
      }

      // If person1 already has a parent union, add person2 to it (if not already in another)
      if (p1ParentUnion && !p2ParentUnion) {
        addChild(p1ParentUnion.unionId, link.person2);
        return;
      }
      if (p2ParentUnion && !p1ParentUnion) {
        addChild(p2ParentUnion.unionId, link.person1);
        return;
      }

      // Neither has parents, or both have different parents — create shared parents
      if (!p1ParentUnion && !p2ParentUnion) {
        const parentGen = Math.min(p1.generation, p2.generation) - 1;
        // v0.5 Faz 2a: links created from now on carry a stable `seq`, so the
        // fabricated parents keep their ids when an earlier link is removed
        // (positional `idx` is kept only for links saved before this field).
        const n = Number.isInteger(link.seq) ? link.seq : idx;
        const ggfId = `cc_${n}_f`;
        const ggmId = `cc_${n}_m`;
        const unionId = `U_CC_${n}`;
        addInd({ id: ggfId, sex: 'male', generation: parentGen, relation: 'cc_parent', label: `Ortak Baba ${idx + 1}` });
        addInd({ id: ggmId, sex: 'female', generation: parentGen, relation: 'cc_parent', label: `Ortak Anne ${idx + 1}` });
        addUnion(unionId, ggfId, ggmId);
        addChild(unionId, link.person1);
        addChild(unionId, link.person2);
      }
      // Both have different parent unions — this is the complex case.
      // We cannot merge existing parent unions (would break the
      // single-parent-union invariant, childToUnionMap) — this branch is a
      // deliberate no-op at the builder level. The v0.3a.1 UI-level "make
      // siblings" action (usePedigreeStore.js's computeSiblingCreationPlan)
      // detects this exact case ahead of time and blocks the action with an
      // explanation, rather than letting the user hit this silent no-op.
    });
  }

  // ========================================
  // 10b (relocated + extended v0.3a.2). RELATIONSHIP BACKGROUND / CONSANGUINITY
  // ========================================
  // Runs LAST among stage-10 sub-stages — after 10a (custom "make siblings"
  // links) and 10c (direct graph edits, including the "make partners"
  // linkPartners case above) — so shared ancestors created by either
  // mechanism are visible to the ancestor walk below, no matter which stage
  // introduced them.
  //
  // v0.3a.2: replaces the old binary "akraba evliliği" checkbox with the
  // full relationshipBackground model (see relationshipBackground.js) —
  // not_asked / no_consanguinity_reported / consanguinity_reported /
  // consanguinity_structurally_supported / same_village_or_same_origin /
  // unknown. `state.consanguineousUnions` (legacy, pre-v0.3a.2) is still
  // honored for backward compatibility with older saved sessions, but
  // `state.unionRelationshipBackgrounds` takes priority when both exist for
  // the same union.
  const ancestorPromotion = (union) => {
    if (union.consanguinityStatus === 'known_supported') return; // already resolved elsewhere
    // Detect genuine shared ancestry instead of assuming there is none —
    // this never fabricates anything: it only promotes to 'known_supported'
    // when an intersection is found among ancestor nodes that already exist.
    const [p1, p2] = union.partners;
    const p1Ancestors = collectAncestors(p1);
    const p2Ancestors = collectAncestors(p2);
    const sharesRealAncestor = [...p1Ancestors].some(a => p2Ancestors.has(a));
    union.consanguinityStatus = sharesRealAncestor ? 'known_supported' : 'reported_unresolved';
  };

  if (state.consanguineousUnions) {
    for (const [unionId, isConsang] of Object.entries(state.consanguineousUnions)) {
      if (!isConsang) continue;
      // New mechanism takes priority for this union — handled below instead.
      if (state.unionRelationshipBackgrounds && state.unionRelationshipBackgrounds[unionId]) continue;
      const union = unions.find(u => u.id === unionId);
      if (!union) continue;
      union.consanguineous = true;
      ancestorPromotion(union);
      union.relationshipBackground = union.consanguinityStatus === 'known_supported'
        ? 'consanguinity_structurally_supported'
        : 'consanguinity_reported';
    }
  }

  if (state.unionRelationshipBackgrounds) {
    for (const [unionId, declared] of Object.entries(state.unionRelationshipBackgrounds)) {
      const union = unions.find(u => u.id === unionId);
      if (!union) continue;
      if (declared === 'consanguinity_reported') {
        union.consanguineous = true;
        ancestorPromotion(union);
        // The clinician's *declaration* is "consanguinity_reported" either
        // way — consanguinity_structurally_supported is what the RENDERED
        // state becomes once a real shared ancestor is confirmed, per the
        // same known_supported/reported_unresolved distinction this app
        // has always drawn from consanguinityStatus.
        union.relationshipBackground = union.consanguinityStatus === 'known_supported'
          ? 'consanguinity_structurally_supported'
          : 'consanguinity_reported';
      } else {
        // no_consanguinity_reported / same_village_or_same_origin / unknown
        // / not_asked — none of these assert a blood relationship, so
        // `consanguineous`/`consanguinityStatus` are left at their existing
        // (default 'false'/'none') values. No ancestor structure is built
        // or inferred for any of these.
        union.relationshipBackground = declared;
      }
    }
  }

  // Final pass: every union gets a coherent relationshipBackground, even
  // ones never touched by either mechanism above — e.g. the template
  // first-cousin path (state.parents.consanguineous, stage 7) already sets
  // consanguineous/consanguinityStatus directly without going through
  // either map, and a plain non-consanguineous union has neither set at all.
  for (const union of unions) {
    if (union.relationshipBackground) continue; // already set above
    union.relationshipBackground = union.consanguineous
      ? (union.consanguinityStatus === 'known_supported' ? 'consanguinity_structurally_supported' : 'consanguinity_reported')
      : 'not_asked';
  }

  // ========================================
  // 10e. EXPLICIT BIRTH ORDER (every child group)
  // ========================================
  // The "Doğum Sırası" controls store an order for whichever sibship the
  // selected child belongs to (state.childOrders, keyed by union id). The
  // stages above apply it only to the groups they build themselves; the
  // grandparents' children and children added by direct graph edits kept
  // insertion order, so moving e.g. the father among his brothers silently
  // did nothing. Apply it uniformly here, and mark the group so the layout
  // treats its order as known (NSGC: siblings oldest→youngest, left→right).
  for (const rel of parentChildRelationships) {
    const manual = childOrders[rel.unionId];
    if (!Array.isArray(manual) || manual.length === 0) continue;
    rel.children = reconcileOrder(manual, rel.children);
    rel.birthOrderExplicit = true;
  }

  // ========================================
  // 10d. PROBAND ASSIGNMENT (single source of truth)
  // ========================================
  // Exactly one individual may carry `proband: true` at a time (or zero,
  // while a pedigree is mid-edit). This is the ONLY place that assigns the
  // flag — individual construction above never sets `proband: true` itself.
  //
  // `state.probandId` selects who holds it:
  //   - undefined  → default to the wizard's own 'proband' slot (backward
  //                  compatible with wizard states that predate this field)
  //   - a valid id → that individual becomes the proband, everyone else is
  //                  cleared (enforces the invariant even if upstream state
  //                  was somehow constructed with more than one true)
  //   - null       → explicit "no proband yet" editing state
  //   - a stale id  → nobody is marked; graphIntegrity's PROBAND_MISSING
  //                  check surfaces this rather than silently guessing
  {
    const requestedProbandId = state.probandId !== undefined ? state.probandId : 'proband';
    individuals.forEach(ind => { ind.proband = false; });
    if (requestedProbandId) {
      const target = individuals.find(ind => ind.id === requestedProbandId);
      if (target) target.proband = true;
    }
  }

  // ========================================
  // 11. DERIVE GENERATION FROM TOPOLOGY (BFS)
  // ========================================
  // Overwrites hardcoded generation literals with topology-derived values.
  // Anchor: proband at generation 3 (preserves current layout convention).
  // Unreachable nodes keep their constructor-assigned generation.
  computeGenerations({ individuals, unions, parentChildRelationships }, 'proband', 3);

  // ========================================
  // POST-BUILD VALIDATION
  // ========================================
  if (typeof process === 'undefined' || process.env?.NODE_ENV !== 'production') {
    // Check: no individual in multiple parentChildRelationships
    const childSeen = new Map();
    for (const rel of parentChildRelationships) {
      for (const cid of rel.children) {
        if (childSeen.has(cid)) {
          console.error(`[PedigreeValidation] Child '${cid}' in multiple unions: '${childSeen.get(cid)}' and '${rel.unionId}'`);
        }
        childSeen.set(cid, rel.unionId);
      }
    }
    // Check: no duplicate IDs
    const idCheck = new Set();
    for (const ind of individuals) {
      if (idCheck.has(ind.id)) {
        console.error(`[PedigreeValidation] Duplicate individual ID: '${ind.id}'`);
      }
      idCheck.add(ind.id);
    }
    // Check: proband count (authoritative enforcement is graphIntegrity.js
    // CHECK 12/13 — this is a cheap dev-console early warning)
    const probandCount = individuals.filter(ind => ind.proband).length;
    if (probandCount > 1) {
      console.error(`[PedigreeValidation] Multiple probands assigned: ${individuals.filter(ind => ind.proband).map(i => i.id).join(', ')}`);
    }
    // Check: no orphan unions (union has children entry if it should)
    for (const u of unions) {
      const rel = parentChildRelationships.find(r => r.unionId === u.id);
      // Childless unions are valid (standard pedigree convention).
      // Skip validation for known union types that may legitimately have no children.
      if (!rel) {
        // Only warn for unions that are expected to always have children (none currently).
        // All unions may now be childless (uncle/aunt couples, GP unions, etc.)
      }
    }
  }

  return { individuals, unions, parentChildRelationships };
}
