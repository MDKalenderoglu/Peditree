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

  // 2. Orphan check — a gen 3+ individual with neither parents nor a partner
  // is disconnected from the pedigree. Someone who married into the family
  // (a partner, no parents drawn) is a normal founder and is NOT warned
  // (KI-7: the old rule warned for every married-in spouse, and a childless
  // couple was flagged as a "spouse not connected" — both false positives
  // that train users to ignore warnings).
  const hasPartner = new Set();
  unions.forEach(u => (u.partners || []).forEach(p => hasPartner.add(p)));
  // a child linked only socially (adopted-in, foster) is connected too
  (data.socialParentLinks || []).forEach(l => { childToUnion[l.childId] = childToUnion[l.childId] || l.unionId; });
  individuals.forEach(ind => {
    if (ind.generation >= 3 && !childToUnion[ind.id] && !hasPartner.has(ind.id)) {
      warnings.push(`Uyarı: "${ind.displayLabel || ind.label || ind.id}" ne bir ebeveyn çiftine ne de bir eşe bağlı.`);
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
      } else if (u.consanguinityDegree === 'unknown' && u.consanguinityStatus !== 'known_supported') {
        warnings.push('Bilgi: Akraba evliliği derecesi bilinmiyor — üst soy bağlantısı çizilmeyecek.');
      }
    }
    // Distinct from the degree-specific messages above: this fires whenever
    // the union's consanguinity could not be backed by a real shared-ancestor
    // structure, regardless of which degree/path was selected — including
    // supported degrees left at an unresolved path, and arbitrary unions
    // flagged consanguineous via the "mark as consanguineous" mechanism.
    if (u.consanguinityStatus === 'reported_unresolved') {
      // v0.3a.3 fix: a clinician-declared consanguineous union always
      // renders as the SAME standard solid black double line on the
      // canvas, whether or not the shared-ancestor path is also modeled in
      // the graph — no color/dash/text distinction is drawn (pedigree
      // consanguinity notation is a structural fact, not a UI design
      // choice). This warning is purely informational side-panel metadata:
      // the degree/common ancestor has not yet been structurally modeled,
      // which does not change the drawn line at all.
      warnings.push(
        `Bilgi: Union ${u.id} akraba evliliği olarak bildirildi. Derece / ortak ata bilgisi ` +
        `grafikte henüz modellenmedi — bu, çizimi etkilemez (standart siyah çift çizgi zaten gösteriliyor); ` +
        `sadece bu bilgi kayıt amaçlı henüz eksik.`
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
