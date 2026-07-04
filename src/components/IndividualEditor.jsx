export default function IndividualEditor({ node, pedigreeData, onUpdate, onAddSpouse, onAddChild, onSetProband, onClearProband, graphEdits, onRemoveGraphEdit }) {
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

        {/* Clinical markers */}
        {!isLoss && (
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
            <label className="checkbox-label" style={{ marginTop: '4px' }}>
              <input type="checkbox" checked={!!node.deceased}
                onChange={e => onUpdate(node.id, { deceased: e.target.checked })} />
              Olu (Deceased)
            </label>
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
