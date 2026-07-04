/**
 * validators.js
 *
 * Validates the pedigree graph for clinical correctness.
 */

export function validatePedigree(data) {
  const warnings = [];
  const { individuals, unions, parentChildRelationships } = data;

  const indById = {};
  individuals.forEach(i => { indById[i.id] = i; });

  const childToUnion = {};
  parentChildRelationships.forEach(rel => {
    rel.children.forEach(cid => {
      if (childToUnion[cid]) {
        warnings.push(`Hata: Birey "${cid}" birden fazla ebeveyn birliğine bağlı.`);
      }
      childToUnion[cid] = rel.unionId;
    });
  });

  // 1. Sibling-in-union detection
  unions.forEach(u => {
    const p1 = indById[u.partners[0]];
    const p2 = indById[u.partners[1]];
    if (!p1 || !p2) {
      warnings.push(`Hata: Union ${u.id} eksik partner referansı.`);
      return;
    }
    // Check if both partners are siblings (share a parent union)
    const p1Parent = childToUnion[p1.id];
    const p2Parent = childToUnion[p2.id];
    if (p1Parent && p2Parent && p1Parent === p2Parent) {
      // Both are children of the same union — they're siblings!
      // This is only valid for consanguineous unions
      if (!u.consanguineous) {
        warnings.push(`Hata: Union ${u.id} iki kardeşi (${p1.id}, ${p2.id}) eş olarak birleştiriyor!`);
      }
    }
    // Check if proband is in a union with a sibling
    if ((p1.relation === 'proband' && p2.relation === 'sibling') ||
        (p2.relation === 'proband' && p1.relation === 'sibling')) {
      warnings.push(`Hata: Proband bir kardeşiyle union'da! Union: ${u.id}`);
    }
  });

  // 2. Orphan check — gen 3+ individuals should be in some parent union
  individuals.forEach(ind => {
    if (ind.generation >= 3 && !childToUnion[ind.id]) {
      if (ind.relation === 'spouse_gen4' || ind.relation === 'spouse_mother' || ind.relation === 'spouse_father') return;
      warnings.push(`Uyarı: "${ind.label || ind.id}" herhangi bir ebeveyn birliğine bağlı değil.`);
    }
  });

  // 3. Spouse without children — only warn for truly disconnected spouses
  // Childless couples are a valid clinical pedigree convention (inverted-T marker).
  // Skip warnings for collateral relative unions (uncle/aunt unions) — they are
  // intentionally childless when the user enters zero children.
  unions.forEach(u => {
    const children = parentChildRelationships.find(r => r.unionId === u.id);
    if (!children || children.children.length === 0) {
      // Skip: nuclear family, all collateral relative unions (any level)
      if (u.id === 'U_PARENTS') return;
      // Collateral unions at any level (uncles, aunts, GP uncles, GP aunts)
      const collateralPrefixes = [
        'U_MAT_UNCLE', 'U_MAT_AUNT', 'U_PAT_UNCLE', 'U_PAT_AUNT',
        'U_GP_MAT_UNCLE', 'U_GP_MAT_AUNT', 'U_GP_PAT_UNCLE', 'U_GP_PAT_AUNT',
        'U_MOTHER_OTHER', 'U_FATHER_OTHER', 'U_GEN4', 'U_CC_',
      ];
      if (collateralPrefixes.some(prefix => u.id.startsWith(prefix))) return;

      const p1 = indById[u.partners[0]];
      const p2 = indById[u.partners[1]];
      const hasRelSpouse = [p1, p2].some(p => p && (p.relation || '').includes('spouse'));
      if (hasRelSpouse) {
        warnings.push(`Uyarı: Eş (${u.id}) herhangi bir ebeveyn birliğine bağlı değil.`);
      }
    }
  });

  // 4. Duplicate individual check
  const seenIds = new Set();
  individuals.forEach(ind => {
    if (seenIds.has(ind.id)) {
      warnings.push(`Hata: Duplicate birey: ${ind.id}`);
    }
    seenIds.add(ind.id);
  });

  // 5. Consanguinity warnings
  unions.forEach(u => {
    if (u.consanguineous) {
      if (!u.consanguinityDegree || u.consanguinityDegree === 'yok') {
        warnings.push('Uyarı: Akraba evliliği işaretli ancak derece seçilmemiş.');
      } else if (u.consanguinityDegree === 'unknown') {
        warnings.push('Bilgi: Akraba evliliği derecesi bilinmiyor — üst soy bağlantısı çizilmeyecek.');
      }
    }
    // Distinct from the degree-specific messages above: this fires whenever
    // the union's consanguinity could not be backed by a real shared-ancestor
    // structure, regardless of which degree/path was selected — including
    // supported degrees left at an unresolved path, and arbitrary unions
    // flagged consanguineous via the "mark as consanguineous" mechanism.
    if (u.consanguinityStatus === 'reported_unresolved') {
      warnings.push(
        `Uyarı: Union ${u.id} akraba evliliği olarak bildirildi ancak ortak ata yapısı grafikte kurulmadı — ` +
        `sadece bildirim (raporlanan/doğrulanmamış) olarak işaretlendi, çift çizgi çizilmeyecek.`
      );
    }
  });

  // 6. Node overlap detection (rough)
  const positions = {};
  const nodes = data.nodes || [];
  nodes.forEach(n => {
    const key = `${Math.round(n.x)},${Math.round(n.y)}`;
    if (positions[key]) {
      warnings.push(`Uyarı: Node çakışması: ${positions[key]} ve ${n.id} aynı pozisyonda.`);
    }
    positions[key] = n.id;
  });

  return warnings;
}
