/**
 * Lightweight local mirror of the store's isDirectEdit check (see
 * usePedigreeStore.js's computeDeletionPlan) — used only to decide the
 * button's enabled/disabled label here in the right-hand editor. The store
 * action re-validates independently regardless, so this is UI messaging
 * only, never the actual safety gate.
 */
function isDirectEditIndividual(graphEdits, id) {
  return (graphEdits || []).some(e =>
    (e.type === 'addSpouse' && e.spouseId === id) ||
    (e.type === 'addChild' && e.childId === id)
  );
}

/** Two individuals selected via Cmd/Ctrl-click — pair-level quick actions. */
function TwoPersonActions({ node, node2, pedigreeData, onCreateUnion, onMakeSiblings, onClearSelection }) {
  const unions = pedigreeData?.unions || [];
  const pcrs = pedigreeData?.parentChildRelationships || [];
  const alreadyPartnered = unions.some(u => u.partners.includes(node.id) && u.partners.includes(node2.id));

  const childToUnion = {};
  pcrs.forEach(rel => rel.children.forEach(cid => { childToUnion[cid] = rel.unionId; }));
  const alreadySiblings = childToUnion[node.id] && childToUnion[node.id] === childToUnion[node2.id];

  const label = (p) => p.displayLabel || p.label || p.id;

  return (
    <>
      <h3 style={{ marginBottom: '15px', color: '#1e293b', fontSize: '1rem' }}>İki Birey Seçili</h3>
      <div style={{
        marginBottom: '12px', padding: '10px', background: '#f5f3ff',
        border: '1px solid #ddd6fe', borderRadius: '6px', fontSize: '0.8rem', color: '#1e293b',
      }}>
        <div>{label(node)}</div>
        <div style={{ color: '#8b5cf6', fontSize: '0.7rem', margin: '2px 0' }}>+</div>
        <div>{label(node2)}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          className="btn"
          disabled={alreadyPartnered}
          onClick={() => onCreateUnion(node.id, node2.id)}
          style={{
            fontSize: '0.78rem', padding: '6px 10px', background: alreadyPartnered ? '#f1f5f9' : '#dbeafe',
            border: '1px solid ' + (alreadyPartnered ? '#cbd5e1' : '#93c5fd'), color: alreadyPartnered ? '#94a3b8' : '#1e40af',
          }}
          title={alreadyPartnered ? 'Bu iki birey zaten bir birlikte' : 'Bu iki bireyi eş olarak birleştir'}
        >
          Eş Yap (Union Oluştur)
        </button>

        {/* "Kardeş Yap" reuses the existing customConsanguinity mechanism
            (WizardPanel.jsx's "4b. Özel Akrabalık Bağları"), which already
            safely creates a shared parent union (or attaches to an existing
            one) — see pedigreeBuilderFromWizard.js stage 10a. Disabled when
            already siblings, or when either person is a pregnancy loss /
            stillbirth / already the proband (same filter the wizard's own
            picker applies), since those cases are not safely representable. */}
        <button
          className="btn"
          disabled={alreadySiblings || alreadyPartnered || node.pregnancyLoss || node.stillbirth || node2.pregnancyLoss || node2.stillbirth || node.proband || node2.proband}
          onClick={() => onMakeSiblings(node.id, node2.id)}
          style={{ fontSize: '0.78rem', padding: '6px 10px', background: '#fce7f3', border: '1px solid #f9a8d4', color: '#9d174d' }}
          title={alreadySiblings ? 'Zaten kardeşler' : alreadyPartnered ? 'Zaten eş — aynı anda kardeş olamaz' : 'Bu iki bireyi kardeş yap (ortak ebeveyn birliği oluşturulur/kullanılır)'}
        >
          Kardeş Yap
        </button>

        <button
          className="btn"
          onClick={onClearSelection}
          style={{ fontSize: '0.78rem', padding: '6px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1' }}
        >
          Seçimi Temizle
        </button>
      </div>
    </>
  );
}

export default function IndividualEditor({
  node, node2, pedigreeData, onUpdate, onAddSpouse, onAddChild, onSetProband, onClearProband,
  graphEdits, onRemoveGraphEdit, onDeleteIndividual, onCreateUnion, onMakeSiblings,
  onClearSelection, onReorderChild, onMarkUnionConsanguineous,
}) {
  // Two individuals selected (Cmd/Ctrl-click) — show the pair action panel
  // instead of the single-person editor, regardless of which one would
  // otherwise be "primary." Selecting a pair is a distinct workflow from
  // editing one person's fields.
  if (node && node2) {
    return (
      <TwoPersonActions
        node={node}
        node2={node2}
        pedigreeData={pedigreeData}
        onCreateUnion={onCreateUnion}
        onMakeSiblings={onMakeSiblings}
        onClearSelection={onClearSelection}
      />
    );
  }

  if (!node) {
    return (
      <>
        <h3 style={{ marginBottom: '15px', color: '#1e293b', fontSize: '1rem' }}>Birey Duzenle</h3>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Duzenlemek icin grafikten bir birey secin.</p>
      </>
    );
  }

  const isLoss = node.pregnancyLoss || node.stillbirth;

  // Check if this individual already has a union
  const unions = pedigreeData?.unions || [];
  const existingUnions = unions.filter(u => u.partners.includes(node.id));
  const hasUnion = existingUnions.length > 0;

  // Check if this individual is a child of any PCR (to determine if we can add parents)
  const pcrs = pedigreeData?.parentChildRelationships || [];

  // Reorder support: is this individual a child in some union's PCR?
  const ownParentRel = pcrs.find(r => r.children.includes(node.id));
  const siblingOrder = ownParentRel ? ownParentRel.children : null;
  const ownIndexInOrder = siblingOrder ? siblingOrder.indexOf(node.id) : -1;

  return (
    <>
      <h3 style={{ marginBottom: '15px', color: '#1e293b', fontSize: '1rem' }}>Birey Duzenle</h3>

      {/* Identity header */}
      <div style={{
        marginBottom: '12px', padding: '10px', background: '#f8fafc',
        borderRadius: '6px', fontSize: '0.8rem', lineHeight: '1.5',
      }}>
        <div><strong>ID:</strong> {node.id}</div>
        <div><strong>Cinsiyet:</strong> {node.sex === 'male' ? 'Erkek' : node.sex === 'female' ? 'Kadin' : 'Bilinmiyor'}</div>
        <div><strong>Jenerasyon:</strong> {node.generation}</div>
        {node.relation && <div><strong>Iliski:</strong> {node.relation}</div>}
      </div>

      {/* ── Graph editing buttons ── */}
      {!isLoss && (
        <div style={{
          marginBottom: '12px', padding: '10px', background: '#eff6ff',
          borderRadius: '6px', border: '1px solid #bfdbfe',
        }}>
          <div style={{ fontSize: '0.78rem', fontWeight: '600', marginBottom: '8px', color: '#1e40af' }}>
            Pedigriye Ekle
          </div>

          {/* Add spouse */}
          {!hasUnion && (
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '3px' }}>Es Ekle</div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  className="btn"
                  style={{ fontSize: '0.7rem', padding: '3px 8px', background: '#dbeafe', border: '1px solid #93c5fd' }}
                  onClick={() => onAddSpouse(node.id, 'male')}
                >♂ Erkek Es</button>
                <button
                  className="btn"
                  style={{ fontSize: '0.7rem', padding: '3px 8px', background: '#fce7f3', border: '1px solid #f9a8d4' }}
                  onClick={() => onAddSpouse(node.id, 'female')}
                >♀ Kadin Es</button>
              </div>
            </div>
          )}

          {/* Show existing unions and add child buttons */}
          {existingUnions.map(u => {
            const partnerId = u.partners.find(p => p !== node.id);
            const partner = pedigreeData?.individuals?.find(i => i.id === partnerId);
            const children = pcrs.find(r => r.unionId === u.id)?.children || [];
            return (
              <div key={u.id} style={{
                marginBottom: '6px', padding: '6px', background: '#f0f9ff',
                borderRadius: '4px', border: '1px solid #e0f2fe',
              }}>
                <div style={{ fontSize: '0.68rem', color: '#475569', marginBottom: '4px' }}>
                  Birlik: {node.displayLabel || node.label || node.id} + {partner?.displayLabel || partner?.label || partnerId}
                  {children.length > 0 && <span> ({children.length} cocuk)</span>}
                </div>
                {onMarkUnionConsanguineous && (
                  <label className="checkbox-label" style={{ fontSize: '0.68rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="checkbox"
                      checked={!!u.consanguineous}
                      onChange={e => onMarkUnionConsanguineous(u.id, e.target.checked)}
                    />
                    Akraba evliliği olarak işaretle
                    {u.consanguineous && (
                      <span style={{ color: u.consanguinityStatus === 'known_supported' ? '#166534' : '#b45309' }}>
                        {u.consanguinityStatus === 'known_supported' ? '(çift çizgi)' : '(ortak ata çözümlenmedi — belirsizlik işareti)'}
                      </span>
                    )}
                  </label>
                )}
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <button
                    className="btn"
                    style={{ fontSize: '0.68rem', padding: '2px 6px', background: '#dbeafe', border: '1px solid #93c5fd' }}
                    onClick={() => onAddChild(u.id, 'male')}
                  >+ Erkek Cocuk</button>
                  <button
                    className="btn"
                    style={{ fontSize: '0.68rem', padding: '2px 6px', background: '#fce7f3', border: '1px solid #f9a8d4' }}
                    onClick={() => onAddChild(u.id, 'female')}
                  >+ Kiz Cocuk</button>
                  <button
                    className="btn"
                    style={{ fontSize: '0.68rem', padding: '2px 6px', background: '#f1f5f9', border: '1px solid #cbd5e1' }}
                    onClick={() => onAddChild(u.id, 'unknown')}
                  >+ Bil. Cocuk</button>
                </div>
              </div>
            );
          })}

          {/* If no union yet, offer to add child (auto-creates spouse+union) */}
          {!hasUnion && (
            <div style={{ marginTop: '4px' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '3px' }}>
                Cocuk Ekle (es otomatik olusturulur)
              </div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                <button
                  className="btn"
                  style={{ fontSize: '0.68rem', padding: '2px 6px', background: '#dbeafe', border: '1px solid #93c5fd' }}
                  onClick={() => onAddChild(null, 'male', node.id)}
                >+ Erkek Cocuk</button>
                <button
                  className="btn"
                  style={{ fontSize: '0.68rem', padding: '2px 6px', background: '#fce7f3', border: '1px solid #f9a8d4' }}
                  onClick={() => onAddChild(null, 'female', node.id)}
                >+ Kiz Cocuk</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* Display label */}
        <div className="form-group">
          <label className="form-label">Gorunen Etiket</label>
          <input
            type="text"
            value={node.displayLabel || ''}
            onChange={e => onUpdate(node.id, { displayLabel: e.target.value })}
            className="form-input"
            placeholder="Bossa gizlenir"
          />
        </div>

        {/* Age */}
        {!isLoss && (
          <div className="form-group">
            <label className="form-label">Yas</label>
            <input
              type="number"
              value={node.age || ''}
              onChange={e => onUpdate(node.id, { age: e.target.value })}
              className="form-input"
              placeholder="Opsiyonel"
              style={{ width: '80px' }}
            />
          </div>
        )}

        {/* Disease / condition */}
        {!isLoss && (
          <div className="form-group">
            <label className="form-label">Hastalik / Tani</label>
            <input
              type="text"
              value={node.condition || ''}
              onChange={e => onUpdate(node.id, { condition: e.target.value })}
              className="form-input"
              placeholder="orn. epilepsi, astim..."
            />
          </div>
        )}

        {/* Age at death — only shown when deceased */}
        {!!node.deceased && !isLoss && (
          <div className="form-group">
            <label className="form-label">Olum Yasi</label>
            <input
              type="number"
              value={node.ageAtDeath || ''}
              onChange={e => onUpdate(node.id, { ageAtDeath: e.target.value })}
              className="form-input"
              placeholder="Opsiyonel"
              style={{ width: '80px' }}
            />
          </div>
        )}

        {/* Cause of death — only shown when deceased */}
        {!!node.deceased && !isLoss && (
          <div className="form-group">
            <label className="form-label">Olum Nedeni</label>
            <input
              type="text"
              value={node.causeOfDeath || ''}
              onChange={e => onUpdate(node.id, { causeOfDeath: e.target.value })}
              className="form-input"
              placeholder="Opsiyonel"
            />
          </div>
        )}

        {/* Conditions list (v0.3a — structured conditions, additive to the
            legacy free-text field above). No pattern/color pickers here —
            that's v0.3b/v0.3c; this slice is data + legend only. */}
        {!isLoss && (
          <div className="form-group">
            <label className="form-label">Durumlar / Tanılar (Conditions)</label>
            {(node.conditions || []).map((cond, idx) => (
              <div key={idx} style={{
                display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '4px',
              }}>
                <input
                  type="text"
                  value={cond.label || ''}
                  onChange={e => {
                    const next = (node.conditions || []).map((c, i) =>
                      i === idx ? { ...c, label: e.target.value } : c
                    );
                    onUpdate(node.id, { conditions: next });
                  }}
                  className="form-input"
                  placeholder="orn. Nörogelişimsel bozukluk"
                  style={{ flex: 1, fontSize: '0.8rem' }}
                />
                <select
                  value={cond.status || 'unknown'}
                  onChange={e => {
                    const next = (node.conditions || []).map((c, i) =>
                      i === idx ? { ...c, status: e.target.value } : c
                    );
                    onUpdate(node.id, { conditions: next });
                  }}
                  className="form-input"
                  style={{ fontSize: '0.75rem', width: 'auto' }}
                >
                  <option value="affected">Etkilenmiş</option>
                  <option value="carrier">Taşıyıcı</option>
                  <option value="unknown">Bilinmiyor</option>
                </select>
                <button
                  onClick={() => {
                    const next = (node.conditions || []).filter((_, i) => i !== idx);
                    onUpdate(node.id, { conditions: next });
                  }}
                  style={{
                    background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '3px',
                    fontSize: '0.7rem', padding: '3px 6px', cursor: 'pointer', color: '#dc2626',
                  }}
                >X</button>
              </div>
            ))}
            <button
              className="btn"
              style={{ fontSize: '0.72rem', padding: '3px 8px', background: '#f1f5f9', border: '1px solid #cbd5e1' }}
              onClick={() => {
                const next = [...(node.conditions || []), { label: '', status: 'unknown' }];
                onUpdate(node.id, { conditions: next });
              }}
            >+ Durum Ekle</button>
          </div>
        )}

        {/* Notes */}
        <div className="form-group">
          <label className="form-label">Not</label>
          <textarea
            value={node.notes || ''}
            onChange={e => onUpdate(node.id, { notes: e.target.value })}
            className="form-input"
            style={{ resize: 'vertical', minHeight: '50px' }}
            placeholder="Klinik notlar..."
          />
        </div>

        {/* Clinical markers — v0.3a.1 fix: this block used to be gated
            behind `!isLoss`, which hid the proband checkbox entirely for
            pregnancy-loss/stillbirth individuals. Proband/consultand status
            must be markable independently of deceased, prenatal, or
            pregnancy-event status (a miscarriage or stillbirth can itself
            be the index case referred for genetic counseling) — so this
            block is now always rendered. Marking proband never touches
            `affected` in either direction (see setProband/clearProband in
            usePedigreeStore.js and PEDIGREE_COMPLEXITY_REQUIREMENTS.md §1). */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: '600', marginBottom: '6px', color: '#475569' }}>
            Klinik Isaretleme
          </div>
          {/* Proband is a single-holder flag, not a free-form field — checking
              this box unsets it everywhere else in the graph; unchecking it
              leaves the pedigree with zero probands, a valid mid-edit state
              (see graphIntegrity.js PROBAND_MISSING/PROBAND_MULTIPLE). */}
          <label className="checkbox-label">
            <input type="checkbox" checked={!!node.proband}
              onChange={e => e.target.checked ? onSetProband(node.id) : onClearProband()} />
            Proband (Index Vaka)
          </label>
          <label className="checkbox-label" style={{ marginTop: '4px' }}>
            <input type="checkbox" checked={!!node.affected}
              onChange={e => onUpdate(node.id, { affected: e.target.checked })} />
            Etkilenmis (Affected)
          </label>
          <label className="checkbox-label" style={{ marginTop: '4px' }}>
            <input type="checkbox" checked={!!node.carrier}
              onChange={e => onUpdate(node.id, { carrier: e.target.checked })} />
            Tasiyici (Carrier)
          </label>
          {!isLoss && (
            <label className="checkbox-label" style={{ marginTop: '4px' }}>
              <input type="checkbox" checked={!!node.deceased}
                onChange={e => onUpdate(node.id, { deceased: e.target.checked })} />
              Olu (Deceased)
            </label>
          )}
        </div>

        {/* Birth-order reorder (v0.3a.1) — moves this child left/right
            within its own sibling group only; never changes which union it
            belongs to. See childOrdering.js's moveChildInOrder. */}
        {onReorderChild && siblingOrder && siblingOrder.length > 1 && (
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: '600', marginBottom: '6px', color: '#475569' }}>
              Doğum Sırası
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className="btn"
                disabled={ownIndexInOrder <= 0}
                onClick={() => onReorderChild(ownParentRel.unionId, node.id, 'left')}
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              >◀ Sola Taşı</button>
              <button
                className="btn"
                disabled={ownIndexInOrder === -1 || ownIndexInOrder >= siblingOrder.length - 1}
                onClick={() => onReorderChild(ownParentRel.unionId, node.id, 'right')}
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              >Sağa Taşı ▶</button>
            </div>
          </div>
        )}

        {/* Delete selected individual (v0.3a.1) — only ever safe for
            individuals added via a direct graph edit (spouse/child added
            through this same panel). Wizard-derived core individuals
            (mother, father, siblings, collateral relatives, ...) cannot be
            freely deleted without the wizard/graph dependency inversion
            CLAUDE.md flags as future work — attempting it here would either
            silently resurrect them on the next rebuild or require mutating
            wizard counts as a side effect, which this hotfix does not
            attempt. The store's deleteIndividual re-validates independently
            regardless of what this button shows. */}
        {onDeleteIndividual && (
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
            {isDirectEditIndividual(graphEdits, node.id) && !node.proband ? (
              <button
                onClick={() => {
                  if (window.confirm(`"${node.displayLabel || node.label || node.id}" silinsin mi? Bağlı doğrudan eklemeler (eş/çocuklar) de birlikte silinecek.`)) {
                    onDeleteIndividual(node.id);
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem',
                  padding: '5px 10px', background: '#fee2e2', border: '1px solid #fca5a5',
                  borderRadius: '4px', color: '#dc2626', cursor: 'pointer',
                }}
              >
                Seçili Bireyi Sil
              </button>
            ) : (
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                {node.proband
                  ? 'Proband silinemez — önce başka bir bireyi proband yapın.'
                  : 'Bu birey sihirbaz verisinden türetildi, doğrudan silinemez.'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Direct graph edits list */}
      {graphEdits && graphEdits.length > 0 && (
        <div style={{ marginTop: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
            Dogrudan Eklenenler ({graphEdits.length})
          </div>
          {graphEdits.map((edit, idx) => (
            <div key={idx} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: '0.68rem', color: '#64748b', padding: '2px 0',
            }}>
              <span>
                {edit.type === 'addSpouse' ? `Es: ${edit.spouseId} → ${edit.targetId}` :
                 edit.type === 'addChild' ? `Cocuk: ${edit.childId} → ${edit.unionId}` :
                 JSON.stringify(edit)}
              </span>
              <button
                onClick={() => onRemoveGraphEdit(idx)}
                style={{
                  background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '3px',
                  fontSize: '0.6rem', padding: '1px 4px', cursor: 'pointer', color: '#dc2626',
                }}
              >X</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
