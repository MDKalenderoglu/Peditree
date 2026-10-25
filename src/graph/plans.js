/**
 * plans.js — pure, read-only feasibility checks for relationship mutations
 * ("can this person be deleted / partnered / given parents / a sibling?").
 * Shared by the store (v1) and the graph operations (src/graph/ops.js).
 * Moved verbatim from usePedigreeStore.js (which re-exports them) so graph
 * code can use them without instantiating the store.
 */
import { isPregnancy } from './model';

/**
 * Pure, read-only check for whether `targetId` can be safely deleted via
 * direct graph edits, and (if so) the full transitive cascade of graphEdits
 * entries + individual IDs that removal must take with it.
 *
 * Only individuals that originated from a direct graph edit (an addSpouse's
 * `spouseId`, or an addChild's `childId`) can be deleted at all in v0.3a.1.
 * This app's wizard-driven core individuals (mother, father, siblings,
 * proband, collateral relatives, ...) are derived from wizard *counts*, not
 * freestanding graph nodes — there is no safe single-node "delete" for them
 * without the wizard/graph dependency inversion CLAUDE.md already flags as
 * future work. Attempting to delete one would either silently resurrect on
 * the next rebuild (the wizard count that produced it is unchanged) or
 * require mutating wizard counts as a side effect of "delete", which is a
 * confusing, easy-to-get-wrong UX this hotfix deliberately does not attempt.
 *
 * Exported for direct unit testing.
 *
 * @returns {{ ok: boolean, reason?: string, cascadeIndividualIds?: string[], cascadeUnionIds?: string[], cascadeEditIndices?: number[] }}
 */
export function computeDeletionPlan(wizardData, pedigreeData, targetId) {
  return computeDeletionPlanFor(pedigreeData, targetId);
}

export function computeDeletionPlanFor(pedigreeData, targetId) {
  const individuals = pedigreeData.individuals || [];
  const unions = pedigreeData.unions || [];
  const pcrs = pedigreeData.parentChildRelationships || [];

  const targetInd = individuals.find(i => i.id === targetId);
  if (!targetInd) {
    return { ok: false, reason: 'Birey grafikte bulunamadı.' };
  }

  // v0.3a.2: deletion is no longer restricted to direct-edit individuals —
  // per spec, the user must be able to correct any mistake they made,
  // including a wizard-derived individual, once they've explicitly selected
  // and confirmed it. The one deliberate remaining restriction is the
  // proband: rather than silently leaving the pedigree with zero probands
  // as a side effect of an unrelated delete, this blocks and asks the user
  // to reassign proband first — the safer of the two choices the spec
  // explicitly allows, and consistent with how setProband/clearProband
  // already treat "no proband" as an action the user takes deliberately,
  // not a side effect.
  if (targetInd.proband) {
    return {
      ok: false,
      reason: 'Proband silinemez. Önce başka bir bireyi proband olarak atayın, ardından tekrar deneyin.',
    };
  }
  if (targetInd.placeholder) {
    return {
      ok: false,
      reason: 'Belirtilmemiş ebeveyn ayrıca silinemez; diğer ebeveyni silerseniz bu birliktelik de kaldırılır.',
    };
  }

  // Preview data for the confirmation dialog: which unions this person is a
  // partner in, and which children are affected. Children are never
  // deleted; while a union still has children and another partner it is
  // kept with an "unspecified parent" placeholder in the deleted person's
  // slot, so the children stay linked to the surviving parent (v0.5 Faz 2a,
  // DM-4 — see graphDeletion.js).
  const affectedUnionIds = unions.filter(u => (u.partners || []).includes(targetId)).map(u => u.id);
  const affectedChildIds = [...new Set(
    pcrs
      .filter(rel => affectedUnionIds.includes(rel.unionId))
      .flatMap(rel => rel.children)
      .filter(cid => cid !== targetId)
  )];

  return {
    ok: true,
    targetId,
    affectedUnionIds,
    affectedChildIds,
  };
}

/**
 * Pure, read-only check for whether two individuals can safely become
 * partners via a new union (v0.3a.1 multi-select "make partners" action).
 * Exported for direct unit testing.
 *
 * @returns {{ ok: boolean, reason?: string, requiresConsanguineousFlag?: boolean, crossGeneration?: boolean }}
 */
export function computeUnionCreationPlan(pedigreeData, id1, id2) {
  const individuals = pedigreeData.individuals || [];
  const unions = pedigreeData.unions || [];
  const pcrs = pedigreeData.parentChildRelationships || [];

  if (!id1 || !id2 || id1 === id2) {
    return { ok: false, reason: 'Aynı birey kendisiyle birleştirilemez.' };
  }
  const ind1 = individuals.find(i => i.id === id1);
  const ind2 = individuals.find(i => i.id === id2);
  if (!ind1 || !ind2) {
    return { ok: false, reason: 'Bireylerden biri grafikte bulunamadı.' };
  }
  if (isPregnancy(ind1) || isPregnancy(ind2)) {
    return { ok: false, reason: 'Düşük/ölü doğum kaydı bir bireyle eş yapılamaz.' };
  }

  // v0.5 Step 5A: a union/eş ilişkisi yalnızca kadın+erkek (karşı cinsiyet)
  // arasında kurulabilir. Cinsiyeti "bilinmiyor" olan bir birey union'a
  // sessizce sokulmaz — açık bir red (explicit validation failure) döner,
  // ta ki birey için cinsiyet netleştirilene kadar. Bu, aynı-cinsiyet
  // ve belirsiz-cinsiyet union'ların manuel QA'da tespit edilen klinik
  // olarak yanıltıcı çizimlerini (P0) önler.
  if (ind1.sex === 'unknown' || ind2.sex === 'unknown') {
    return {
      ok: false,
      reason: 'Cinsiyeti belirtilmemiş (bilinmiyor) bir birey doğrudan eş/union ilişkisine ' +
        'sokulamaz — önce ilgili bireyin cinsiyeti netleştirilmeli.',
    };
  }
  if (ind1.sex === ind2.sex) {
    return {
      ok: false,
      reason: 'Bu iki birey aynı cinsiyette olduğu için eş/union oluşturulamaz — union yalnızca ' +
        'kadın+erkek çiftler arasında kurulabilir.',
    };
  }

  // v0.5 Step 5A: explicit parent-child union block. Doğrudan ebeveyn-çocuk
  // ilişkisi olan iki birey (biri diğerinin ebeveyn birliğinde partner)
  // hiçbir koşulda eş/union yapılamaz. Bu, cross-generation kontrolünün
  // (aşağıda) örtük olarak yakaladığı durumu da açıkça ve kendi mesajıyla
  // ifade eder.
  const isParentOf = (parentId, childId) => pcrs.some(rel =>
    rel.children.includes(childId) &&
    unions.find(u => u.id === rel.unionId)?.partners.includes(parentId)
  );
  if (isParentOf(id1, id2) || isParentOf(id2, id1)) {
    return {
      ok: false,
      reason: 'Doğrudan ebeveyn-çocuk ilişkisi olan bireyler eş/union yapılamaz.',
    };
  }

  // Partners from different generations (e.g. uncle and niece) are allowed
  // (clinician decision 2026-10-24): each stays on their own generation row
  // and the relationship line steps down between the rows. For now one
  // generation apart at most — further apart the line would have to cross
  // the rows in between. Never between an ancestor and a descendant.
  let crossGeneration = false;
  if (typeof ind1.generation === 'number' && typeof ind2.generation === 'number' &&
      ind1.generation !== ind2.generation) {
    if (Math.abs(ind1.generation - ind2.generation) > 1) {
      return { ok: false, reason: 'Şimdilik en fazla bir kuşak farklı iki kişi eş yapılabilir.' };
    }
    const ancestors = (id) => {
      const out = new Set();
      const stack = [id];
      while (stack.length) {
        const cur = stack.pop();
        const rel = pcrs.find(r => r.children.includes(cur));
        const u = rel && unions.find(x => x.id === rel.unionId);
        for (const p of (u ? u.partners : [])) if (!out.has(p)) { out.add(p); stack.push(p); }
      }
      return out;
    };
    if (ancestors(id1).has(id2) || ancestors(id2).has(id1)) {
      return { ok: false, reason: 'Bu iki kişi arasında doğrudan soy bağı var (dede–torun gibi); eş yapılamaz.' };
    }
    crossGeneration = true;
  }

  const alreadyPartnered = unions.some(u => u.partners.includes(id1) && u.partners.includes(id2));
  if (alreadyPartnered) {
    return { ok: false, reason: 'Bu iki kişi zaten eş.' };
  }

  const childToUnion = {};
  pcrs.forEach(rel => rel.children.forEach(cid => { childToUnion[cid] = rel.unionId; }));
  const sameParentUnion = childToUnion[id1] && childToUnion[id1] === childToUnion[id2];
  if (sameParentUnion) {
    return {
      ok: false,
      reason: 'Bu iki birey aynı ebeveyn birliğinin çocukları (kardeş) — akraba evliliği olarak ' +
        'işaretlenmeden eş yapılamaz.',
      requiresConsanguineousFlag: true,
    };
  }

  return crossGeneration ? { ok: true, crossGeneration } : { ok: true };
}

/**
 * Pure, read-only check for whether two individuals can safely become
 * siblings via `addCustomConsanguinity` (v0.3a.1 "make siblings" action —
 * this store action name predates this hotfix and is legacy naming, but
 * the operation it performs is a genuine biological parent-child link, not
 * a consanguinity-flag shortcut; see the docblock on `addCustomConsanguinity`
 * below and `pedigreeBuilderFromWizard.js` stage 10a).
 *
 * Mirrors the exact cases `pedigreeBuilderFromWizard.js` stage 10a handles:
 *   - already siblings (same parent union)      → ok, no-op
 *   - exactly one has an existing parent union   → ok, attaches the other
 *   - neither has a parent union                 → ok, fabricates one shared
 *                                                    parent union (two new
 *                                                    "Ortak Baba/Anne" nodes)
 *   - BOTH already have DIFFERENT parent unions   → NOT SAFE. The builder
 *     cannot merge two existing parent unions without breaking the
 *     single-parent-union invariant (`childToUnionMap`), so stage 10a
 *     silently does nothing in this case today. Silently doing nothing is
 *     itself a hazard (the clinician clicks "Kardeş Yap," sees no error,
 *     and may believe it worked) — this plan surfaces that case as
 *     `ok: false` so the UI can disable/explain it instead of silently
 *     no-op'ing.
 *
 * Exported for direct unit testing.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
export function computeSiblingCreationPlan(pedigreeData, id1, id2) {
  const individuals = pedigreeData.individuals || [];
  const unions = pedigreeData.unions || [];
  const pcrs = pedigreeData.parentChildRelationships || [];

  if (!id1 || !id2 || id1 === id2) {
    return { ok: false, reason: 'Aynı birey kendisiyle kardeş yapılamaz.' };
  }
  const ind1 = individuals.find(i => i.id === id1);
  const ind2 = individuals.find(i => i.id === id2);
  if (!ind1 || !ind2) {
    return { ok: false, reason: 'Bireylerden biri grafikte bulunamadı.' };
  }
  if (isPregnancy(ind1) || isPregnancy(ind2)) {
    return { ok: false, reason: 'Düşük/ölü doğum kaydı bir bireyle kardeş bağı kurulamaz.' };
  }
  if (ind1.proband || ind2.proband) {
    return { ok: false, reason: 'Proband için bu yoldan kardeş bağı kurulamaz.' };
  }
  if (typeof ind1.generation === 'number' && typeof ind2.generation === 'number' && ind1.generation !== ind2.generation) {
    // Matches the same safeguard the former wizard's sibling linker
    // already applies when picking a sibling pair from the wizard — two
    // individuals at different generations cannot be full/half siblings,
    // and attaching them under one shared parent union produces a
    // SIBLING_GENERATION_INCONSISTENT / SIBLING_Y_MISMATCH graph-integrity
    // error. Block before the builder ever gets there.
    return {
      ok: false,
      reason: 'Kardeşler aynı kuşakta olur; bu iki kişi çizimde farklı kuşaklarda.',
    };
  }

  const alreadyPartnered = unions.some(u => u.partners.includes(id1) && u.partners.includes(id2));
  if (alreadyPartnered) {
    return { ok: false, reason: 'Bu iki kişi eş; aynı zamanda kardeş yapılamaz.' };
  }

  const childToUnion = {};
  pcrs.forEach(rel => rel.children.forEach(cid => { childToUnion[cid] = rel.unionId; }));
  const p1Union = childToUnion[id1];
  const p2Union = childToUnion[id2];

  if (p1Union && p2Union && p1Union === p2Union) {
    return { ok: true, action: 'noop', reason: 'Bu iki birey zaten kardeş.' };
  }
  if (p1Union && p2Union && p1Union !== p2Union) {
    // The unsafe case: the builder cannot merge two distinct existing
    // parent unions without violating childToUnionMap's single-parent
    // invariant — it would silently no-op today. Block explicitly instead.
    return {
      ok: false,
      reason: 'İkisinin de anne-babası ayrı ayrı çizili; bir kişinin tek biyolojik anne-babası olur. ' +
        'Kardeşlerse, birinin çizili anne-babasını silip sonra kardeş yapın.',
    };
  }

  // Exactly one has a parent union (attach the other), or neither has one
  // (fabricate a shared parent union) — both are the safe, already-handled
  // paths in pedigreeBuilderFromWizard.js stage 10a.
  return { ok: true, action: (p1Union || p2Union) ? 'attach' : 'fabricate' };
}

/**
 * Pure, read-only check for whether "add mother"/"add father"/"add both
 * parents" can safely apply to a given individual (v0.3a.3 selected-person
 * relative actions). Exported for direct unit testing.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
export function computeAddParentsPlan(pedigreeData, targetId) {
  const individuals = pedigreeData.individuals || [];
  const pcrs = pedigreeData.parentChildRelationships || [];

  const target = individuals.find(i => i.id === targetId);
  if (!target) {
    return { ok: false, reason: 'Birey grafikte bulunamadı.' };
  }
  if (isPregnancy(target)) {
    return { ok: false, reason: 'Düşük/ölü doğum kaydına ebeveyn eklenemez.' };
  }
  const alreadyHasParent = pcrs.some(rel => rel.children.includes(targetId));
  if (alreadyHasParent) {
    return { ok: false, reason: 'Bu bireyin zaten ebeveyni var — tekrar eklenemez (yinelenen ebeveyn oluşturulmaz).' };
  }
  return { ok: true };
}

/**
 * Pure, read-only check for whether "add sibling" can safely apply to a
 * given individual. A sibling can only be attached to an EXISTING parent
 * union — this deliberately never fabricates parents for the purpose of
 * adding a sibling (that would misrepresent the family structure); if the
 * target has no parent union yet, the caller must add parents first.
 * Exported for direct unit testing.
 *
 * @returns {{ ok: boolean, reason?: string, unionId?: string }}
 */
export function computeAddSiblingPlan(pedigreeData, targetId) {
  const individuals = pedigreeData.individuals || [];
  const pcrs = pedigreeData.parentChildRelationships || [];

  const target = individuals.find(i => i.id === targetId);
  if (!target) {
    return { ok: false, reason: 'Birey grafikte bulunamadı.' };
  }
  if (isPregnancy(target)) {
    return { ok: false, reason: 'Düşük/ölü doğum kaydına kardeş eklenemez.' };
  }
  const parentRel = pcrs.find(rel => rel.children.includes(targetId));
  if (!parentRel) {
    return {
      ok: false,
      reason: 'Bu bireyin ebeveyni yok — önce ebeveyn ekleyin, ardından kardeş eklenebilir.',
    };
  }
  return { ok: true, unionId: parentRel.unionId };
}

