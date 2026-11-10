/**
 * validators.js
 *
 * Validates the pedigree graph for clinical correctness.
 */
import { t } from '../i18n';

export function validatePedigree(data) {
  const warnings = [];
  const { individuals, unions, parentChildRelationships } = data;

  const indById = {};
  individuals.forEach(i => { indById[i.id] = i; });

  const childToUnion = {};
  parentChildRelationships.forEach(rel => {
    rel.children.forEach(cid => {
      if (childToUnion[cid]) {
        warnings.push(t('Hata: “{cid}” birden fazla anne–baba çiftine bağlanmış.', { cid }));
      }
      childToUnion[cid] = rel.unionId;
    });
  });

  // 1. Sibling-in-union detection
  unions.forEach(u => {
    const p1 = indById[u.partners[0]];
    const p2 = indById[u.partners[1]];
    if (!p1 || !p2) {
      warnings.push(t('Hata: Bir çiftin ({id}) eşlerinden biri eksik.', { id: u.id }));
      return;
    }
    // Check if both partners are siblings (share a parent union)
    const p1Parent = childToUnion[p1.id];
    const p2Parent = childToUnion[p2.id];
    if (p1Parent && p2Parent && p1Parent === p2Parent) {
      // Both are children of the same union — they're siblings!
      // This is only valid for consanguineous unions
      if (!u.consanguineous) {
        warnings.push(t('Hata: Bir çift kaydı ({id}) iki kardeşi ({id1}, {id2}) eş olarak bağlıyor.', { id: u.id, id1: p1.id, id2: p2.id }));
      }
    }
    // Check if proband is in a union with a sibling
    if ((p1.relation === 'proband' && p2.relation === 'sibling') ||
        (p2.relation === 'proband' && p1.relation === 'sibling')) {
      warnings.push(t('Hata: Proband bir kardeşiyle eş olarak bağlanmış ({id}).', { id: u.id }));
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
      warnings.push(t('Uyarı: “{v0}” ne bir anne–baba çiftine ne de bir eşe bağlı.', { v0: ind.displayLabel || ind.label || ind.id }));
    }
  });

  // 4. Duplicate individual check
  const seenIds = new Set();
  individuals.forEach(ind => {
    if (seenIds.has(ind.id)) {
      warnings.push(t('Hata: Aynı kimlik iki kez kullanılmış: {id}', { id: ind.id }));
    }
    seenIds.add(ind.id);
  });

  // 5. Consanguinity warnings
  unions.forEach(u => {
    if (u.consanguineous) {
      if (!u.consanguinityDegree || u.consanguinityDegree === 'yok') {
        warnings.push(t('Uyarı: Akraba evliliği işaretli, ancak akrabalık derecesi seçilmemiş.'));
      } else if (u.consanguinityDegree === 'unknown' && u.consanguinityStatus !== 'known_supported') {
        warnings.push(t('Bilgi: Akrabalık derecesi bilinmediğinden ortak atalara giden bağlantı çizilmeyecek.'));
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
        t('Bilgi: Bir çift ({id}) akraba evliliği olarak bildirildi, ancak derece ve ortak ata bilgisi çizimde yer almıyor. Bu durum çizimi etkilemez; standart çift çizgi gösterilmektedir. Yalnızca bu bilgi kayıtta eksiktir.', { id: u.id })
      );
    }
  });

  // 6. Node overlap detection (rough)
  const positions = {};
  const nodes = data.nodes || [];
  nodes.forEach(n => {
    const key = `${Math.round(n.x)},${Math.round(n.y)}`;
    if (positions[key]) {
      warnings.push(t('Uyarı: {v0} ve {id} çizimde aynı konumda; semboller üst üste biniyor.', { v0: positions[key], id: n.id }));
    }
    positions[key] = n.id;
  });

  return warnings;
}
