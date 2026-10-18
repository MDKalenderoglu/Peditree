import { computeSiblingCreationPlan, computeUnionCreationPlan } from '../state/usePedigreeStore';
import { sanitizeAgeValue } from '../utils/ageValidation';
import { RELATIONSHIP_BACKGROUND_OPTIONS } from '../utils/relationshipBackground';
import { computePedigreeIds } from '../utils/pedigreeNumbering';

/** Two individuals selected via Cmd/Ctrl-click — pair-level quick actions. */
function TwoPersonActions({ node, node2, pedigreeData, onCreateUnion, onMakeSiblings, onClearSelection }) {
  // Authoritative safety check for "make partners" — blocks self/duplicate,
  // pregnancy-loss, unconsented-sibling, and (v0.3a.4) cross-generation
  // pairings, with a clear reason. The store re-validates independently.
  const unionPlan = computeUnionCreationPlan(pedigreeData, node.id, node2.id);

  // Authoritative safety check for "make siblings" — see
  // usePedigreeStore.js's computeSiblingCreationPlan docblock. In
  // particular this correctly blocks (rather than silently no-op'ing) the
  // case where both individuals already have different existing parent
  // unions, which the builder cannot safely merge.
  const siblingPlan = computeSiblingCreationPlan(pedigreeData, node.id, node2.id);

  // v0.3a.4: pedigree ID + optional label, never the internal graph id.
  const pedigreeIds = computePedigreeIds(pedigreeData?.nodes || []);
  const label = (p) => {
    const pid = pedigreeIds.get(p.id)?.displayId;
    const human = p.displayLabel || p.label;
    return pid ? (human ? `${pid} — ${human}` : pid) : (human || 'birey');
  };

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
          disabled={!unionPlan.ok}
          onClick={() => onCreateUnion(node.id, node2.id)}
          style={{
            fontSize: '0.78rem', padding: '6px 10px', background: unionPlan.ok ? '#dbeafe' : '#f1f5f9',
            border: '1px solid ' + (unionPlan.ok ? '#93c5fd' : '#cbd5e1'), color: unionPlan.ok ? '#1e40af' : '#94a3b8',
          }}
          title={unionPlan.ok ? 'Bu iki bireyi eş olarak birleştir' : unionPlan.reason}
        >
          Eş Yap (Union Oluştur)
        </button>
        {!unionPlan.ok && (
          <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '-4px' }}>{unionPlan.reason}</div>
        )}

        {/* "Kardeş Yap" creates a genuine biological parent-child structure
            (attaches to an existing parent union, or fabricates a new
            shared one) via pedigreeBuilderFromWizard.js stage 10a — it is
            NOT a consanguinity-flag shortcut. Gated by
            computeSiblingCreationPlan, which blocks (rather than silently
            no-op'ing) the one case the builder cannot safely handle: both
            individuals already have different existing parent unions. */}
        <button
          className="btn"
          disabled={!siblingPlan.ok || siblingPlan.action === 'noop'}
          onClick={() => onMakeSiblings(node.id, node2.id)}
          style={{ fontSize: '0.78rem', padding: '6px 10px', background: '#fce7f3', border: '1px solid #f9a8d4', color: '#9d174d' }}
          title={!siblingPlan.ok ? siblingPlan.reason : siblingPlan.action === 'noop' ? siblingPlan.reason : 'Bu iki bireyi kardeş yap (ortak ebeveyn birliği oluşturulur/kullanılır)'}
        >
          Kardeş Yap
        </button>
        {(!siblingPlan.ok || siblingPlan.action === 'noop') && (
          <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '-4px' }}>{siblingPlan.reason}</div>
        )}

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
  onDeleteIndividual, onCreateUnion, onMakeSiblings,
  onClearSelection, onReorderChild, onSetUnionRelationshipBackground,
  onAddParents, onAddSibling,
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

  // Pedigree-standard display ID (e.g. "II-3") — see pedigreeNumbering.js.
  const pedigreeIds = computePedigreeIds(pedigreeData?.nodes || []);
  const pedigreeId = pedigreeIds.get(node.id);
  // v0.3a.4: clinician-facing name for any individual id — pedigree ID
  // plus optional human label, never the internal graph id.
  const displayNameFor = (id) => {
    const person = pedigreeData?.individuals?.find(i => i.id === id);
    const pid = pedigreeIds.get(id)?.displayId;
    const label = person?.displayLabel || person?.label;
    return pid ? (label ? `${pid} (${label})` : pid) : (label || 'birey');
  };

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

      {/* Identity header — v0.3a.3: the pedigree-standard ID (e.g. "II-3")
          is the primary identifier shown to the clinician, matching what's
          drawn on canvas. The internal graph ID (e.g. "mat_uncle_0") is
          kept only as a small secondary technical detail, not the
          headline identity — a full scrub of internal IDs from every
          corner of the UI (delete-confirmation previews, direct-edit
          lists) was not completed in this pass; see the final report. */}
      <div style={{
        marginBottom: '12px', padding: '10px', background: '#f8fafc',
        borderRadius: '6px', fontSize: '0.8rem', lineHeight: '1.5',
      }}>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
          {pedigreeId ? pedigreeId.displayId : '—'}
        </div>
        {node.placeholder ? (
          <div style={{ color: '#64748b' }}>
            Belirtilmemiş ebeveyn — bu kişi silinen ya da bilinmeyen diğer ebeveynin yerini tutar.
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <strong>Cinsiyet:</strong>
            {/* v0.5 Faz 2a (DM-8): sex is editable for every individual (it
                used to be read-only outside the wizard's proband field, so an
                individual added as "unknown" could never be corrected — and
                therefore never receive a partner). The store refuses a change
                that would contradict an existing partnership and explains why. */}
            <select
              value={node.sex || 'unknown'}
              onChange={e => onUpdate(node.id, { sex: e.target.value })}
              className="form-input"
              style={{ fontSize: '0.78rem', padding: '2px 4px', width: 'auto' }}
              aria-label="Cinsiyet"
            >
              <option value="male">Erkek</option>
              <option value="female">Kadın</option>
              <option value="unknown">Bilinmiyor</option>
            </select>
          </div>
        )}
        <div><strong>Jenerasyon:</strong> {node.generation}</div>
        {node.relation && <div><strong>Iliski:</strong> {node.relation}</div>}
        <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '4px' }}>Teknik ID: {node.id}</div>
      </div>

      {/* ── Graph editing buttons ── */}
      {!isLoss && !node.placeholder && (
        <div style={{
          marginBottom: '12px', padding: '10px', background: '#eff6ff',
          borderRadius: '6px', border: '1px solid #bfdbfe',
        }}>
          <div style={{ fontSize: '0.78rem', fontWeight: '600', marginBottom: '8px', color: '#1e40af' }}>
            Pedigriye Ekle
          </div>

          {/* v0.3a.3 — add parent(s) / add sibling for the selected
              individual. "Add parents" only shown when the target has no
              parent union yet (never overwrites/duplicates an existing
              one); "add sibling" only shown when they DO have a parent
              union (never fabricates parents just to attach a sibling). */}
          {onAddParents && !ownParentRel && (
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '3px' }}>Ebeveyn Ekle</div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                <button
                  className="btn"
                  style={{ fontSize: '0.7rem', padding: '3px 8px', background: '#fce7f3', border: '1px solid #f9a8d4' }}
                  onClick={() => onAddParents(node.id, { onlyMother: true })}
                  title="Anne ekle (diğer ebeveyn belirtilmedi olarak eklenir)"
                >+ Anne</button>
                <button
                  className="btn"
                  style={{ fontSize: '0.7rem', padding: '3px 8px', background: '#dbeafe', border: '1px solid #93c5fd' }}
                  onClick={() => onAddParents(node.id, { onlyFather: true })}
                  title="Baba ekle (diğer ebeveyn belirtilmedi olarak eklenir)"
                >+ Baba</button>
                <button
                  className="btn"
                  style={{ fontSize: '0.7rem', padding: '3px 8px', background: '#f1f5f9', border: '1px solid #cbd5e1' }}
                  onClick={() => onAddParents(node.id, {})}
                >+ Her İkisi (Anne + Baba)</button>
              </div>
            </div>
          )}

          {onAddSibling && ownParentRel && (
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '3px' }}>Kardeş Ekle</div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                <button
                  className="btn"
                  style={{ fontSize: '0.68rem', padding: '2px 6px', background: '#dbeafe', border: '1px solid #93c5fd' }}
                  onClick={() => onAddSibling(node.id, 'male')}
                >+ Erkek Kardeş</button>
                <button
                  className="btn"
                  style={{ fontSize: '0.68rem', padding: '2px 6px', background: '#fce7f3', border: '1px solid #f9a8d4' }}
                  onClick={() => onAddSibling(node.id, 'female')}
                >+ Kız Kardeş</button>
                <button
                  className="btn"
                  style={{ fontSize: '0.68rem', padding: '2px 6px', background: '#f1f5f9', border: '1px solid #cbd5e1' }}
                  onClick={() => onAddSibling(node.id, 'unknown')}
                >+ Bil. Kardeş</button>
              </div>
            </div>
          )}

          {/* Add spouse — v0.5 Step 5A: a union is only ever kadın+erkek
              (opposite-sex). Only the button for the sex opposite the
              target is offered, so the UI never offers an option that
              onAddSpouse (usePedigreeStore.js's addSpouseTo) would itself
              reject. If the target's own sex is unknown, no spouse can be
              added until that is specified — a union cannot include an
              unknown-sex partner. */}
          {!hasUnion && (
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '3px' }}>Es Ekle</div>
              {node.sex === 'unknown' ? (
                <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                  Eş eklemek için önce bu bireyin cinsiyeti belirtilmeli (union yalnızca kadın+erkek arasında kurulabilir).
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '4px' }}>
                  {node.sex === 'female' && (
                    <button
                      className="btn"
                      style={{ fontSize: '0.7rem', padding: '3px 8px', background: '#dbeafe', border: '1px solid #93c5fd' }}
                      onClick={() => onAddSpouse(node.id, 'male')}
                    >♂ Erkek Es</button>
                  )}
                  {node.sex === 'male' && (
                    <button
                      className="btn"
                      style={{ fontSize: '0.7rem', padding: '3px 8px', background: '#fce7f3', border: '1px solid #f9a8d4' }}
                      onClick={() => onAddSpouse(node.id, 'female')}
                    >♀ Kadin Es</button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Show existing unions and add child buttons */}
          {existingUnions.map(u => {
            const partnerId = u.partners.find(p => p !== node.id);
            const children = pcrs.find(r => r.unionId === u.id)?.children || [];
            return (
              <div key={u.id} style={{
                marginBottom: '6px', padding: '6px', background: '#f0f9ff',
                borderRadius: '4px', border: '1px solid #e0f2fe',
              }}>
                <div style={{ fontSize: '0.68rem', color: '#475569', marginBottom: '4px' }}>
                  Birlik: {displayNameFor(node.id)} + {displayNameFor(partnerId)}
                  {children.length > 0 && <span> ({children.length} cocuk)</span>}
                </div>
                {onSetUnionRelationshipBackground && (
                  <div style={{ marginBottom: '4px' }}>
                    <div style={{ fontSize: '0.68rem', color: '#475569', marginBottom: '2px' }}>Akrabalık / İlişki Geçmişi</div>
                    <select
                      value={u.relationshipBackground || 'not_asked'}
                      onChange={e => onSetUnionRelationshipBackground(u.id, e.target.value)}
                      className="form-input"
                      style={{ fontSize: '0.7rem', padding: '3px' }}
                    >
                      {RELATIONSHIP_BACKGROUND_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {/* v0.3a.3: consanguinity always renders as the same
                        standard solid black double line on the canvas —
                        this note is metadata for the clinician's own
                        record-keeping only, never a description of a
                        canvas-visible difference. */}
                    {(u.relationshipBackground === 'consanguinity_reported' || u.relationshipBackground === 'consanguinity_structurally_supported') && (
                      <div style={{ fontSize: '0.65rem', marginTop: '2px', color: '#475569' }}>
                        Çizim: standart siyah çift çizgi.{' '}
                        {u.relationshipBackground === 'consanguinity_structurally_supported'
                          ? 'Ortak ata grafikte modellendi.'
                          : 'Ortak ata grafikte henüz modellenmedi (bildirim yeterli, çizgi değişmez).'}
                      </div>
                    )}
                  </div>
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

        {/* Age — v0.3a.2: negative values are clamped to 0, never stored. */}
        {!isLoss && (
          <div className="form-group">
            <label className="form-label">Yas</label>
            <input
              type="number"
              min="0"
              value={node.age || ''}
              onChange={e => onUpdate(node.id, { age: sanitizeAgeValue(e.target.value) })}
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

        {/* Age at death — only shown when deceased. Negative values clamped to 0. */}
        {!!node.deceased && !isLoss && (
          <div className="form-group">
            <label className="form-label">Olum Yasi</label>
            <input
              type="number"
              min="0"
              value={node.ageAtDeath || ''}
              onChange={e => onUpdate(node.id, { ageAtDeath: sanitizeAgeValue(e.target.value) })}
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

        {/* Delete selected individual (v0.3a.1, generalized v0.3a.2) — any
            individual can now be deleted, regardless of whether they came
            from the wizard or a direct edit (a "delete anyone" overlay —
            see graphDeletion.js — filters them out post-build rather than
            mutating wizard counts). The only remaining restriction is the
            proband: deleting them is blocked, asking the user to reassign
            proband first, rather than silently leaving zero probands as a
            side effect. The store's deleteIndividual re-validates
            independently regardless of what this button shows. */}
        {onDeleteIndividual && !node.placeholder && (
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
            {!node.proband ? (
              <button
                onClick={() => {
                  if (window.confirm(`"${displayNameFor(node.id)}" silinsin mi?\n\nÇocukları silinmez ve diğer ebeveynle bağlı kalır; silinen kişinin yerinde "belirtilmemiş ebeveyn" gösterilir. Çocuğu olmayan birliktelikleri kaldırılır.\n\nBu işlem "Geri Al" ile geri alınabilir.`)) {
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
                Proband silinemez — önce başka bir bireyi proband yapın.
              </div>
            )}
          </div>
        )}
      </div>

    </>
  );
}
