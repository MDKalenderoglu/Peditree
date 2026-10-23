/**
 * IndividualEditor.jsx — right panel: the selected person (or a selected
 * pair). Redesign 2026-10-23: header with the pedigree number, then cards
 * (clinical status, add to the family, partnerships, birth order, notes);
 * the same store operations as before. The store re-validates every action
 * independently of what this panel offers.
 */
import { X, Trash2, ArrowLeft, ArrowRight } from 'lucide-react';
import { computeSiblingCreationPlan, computeUnionCreationPlan } from '../state/usePedigreeStore';
import { sanitizeAgeValue } from '../utils/ageValidation';
import { RELATIONSHIP_BACKGROUND_OPTIONS } from '../utils/relationshipBackground';
import { computePedigreeIds } from '../utils/pedigreeNumbering';

const SEX_WORD = { male: 'Erkek', female: 'Kadın', unknown: 'Cinsiyet bilinmiyor' };

function Header({ title, sub, onClose }) {
  return (
    <div className="side-header">
      <div>
        <div className="person-id">{title}</div>
        {sub && <div className="person-sub">{sub}</div>}
      </div>
      {onClose && (
        <button className="ui-btn ui-btn-ghost ui-btn-icon" onClick={onClose} aria-label="Seçimi kapat" title="Seçimi kapat">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

/** Two individuals selected via Cmd/Ctrl-click — pair-level quick actions. */
function TwoPersonActions({ node, node2, pedigreeData, onCreateUnion, onMakeSiblings, onClearSelection }) {
  // Authoritative safety checks (self/duplicate, pregnancy loss, siblings,
  // cross-generation; two different parent unions cannot be merged).
  const unionPlan = computeUnionCreationPlan(pedigreeData, node.id, node2.id);
  const siblingPlan = computeSiblingCreationPlan(pedigreeData, node.id, node2.id);
  const siblingBlocked = !siblingPlan.ok || siblingPlan.action === 'noop';

  const pedigreeIds = computePedigreeIds(pedigreeData?.nodes || []);
  const label = (p) => {
    const pid = pedigreeIds.get(p.id)?.displayId;
    const human = p.displayLabel || p.label;
    return pid ? (human ? `${pid} — ${human}` : pid) : (human || 'birey');
  };

  return (
    <>
      <Header title="İki kişi seçili" sub={`${label(node)}  +  ${label(node2)}`} onClose={onClearSelection} />
      <div className="editor-body">
        <div className="card">
          <div className="card-title">Bu iki kişiyi</div>
          <button className="ui-btn ui-btn-primary" disabled={!unionPlan.ok} onClick={() => onCreateUnion(node.id, node2.id)}>
            Eş yap
          </button>
          {!unionPlan.ok && <div className="field-hint">{unionPlan.reason}</div>}
          {/* creates a real biological parent union (existing or new), not a flag */}
          <button className="ui-btn" disabled={siblingBlocked} onClick={() => onMakeSiblings(node.id, node2.id)}>
            Kardeş yap
          </button>
          {siblingBlocked && <div className="field-hint">{siblingPlan.reason}</div>}
        </div>
        <div className="field-hint">İpucu: Cmd/Ctrl ile tıklayarak iki kişi seçilir.</div>
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
  if (node && node2) {
    return (
      <TwoPersonActions node={node} node2={node2} pedigreeData={pedigreeData}
        onCreateUnion={onCreateUnion} onMakeSiblings={onMakeSiblings} onClearSelection={onClearSelection} />
    );
  }
  if (!node) return null;

  const isLoss = node.pregnancyLoss || node.stillbirth;
  const pedigreeIds = computePedigreeIds(pedigreeData?.nodes || []);
  const pedigreeId = pedigreeIds.get(node.id)?.displayId;
  const displayNameFor = (id) => {
    const person = pedigreeData?.individuals?.find(i => i.id === id);
    const pid = pedigreeIds.get(id)?.displayId;
    const label = person?.displayLabel || person?.label;
    return pid ? (label ? `${pid} (${label})` : pid) : (label || 'birey');
  };

  const unions = pedigreeData?.unions || [];
  const existingUnions = unions.filter(u => u.partners.includes(node.id));
  const hasUnion = existingUnions.length > 0;
  const pcrs = pedigreeData?.parentChildRelationships || [];
  const ownParentRel = pcrs.find(r => r.children.includes(node.id));
  const siblingOrder = ownParentRel ? ownParentRel.children : null;
  const ownIndexInOrder = siblingOrder ? siblingOrder.indexOf(node.id) : -1;

  const kind = node.pregnancyLoss ? 'Düşük' : node.stillbirth ? 'Ölü doğum' : SEX_WORD[node.sex || 'unknown'];
  const sub = [kind, node.age ? `${node.age} yaş` : null, node.proband ? 'proband' : null].filter(Boolean).join(' · ');
  const set = (patch) => onUpdate(node.id, patch);
  const setCondition = (idx, patch) => set({ conditions: (node.conditions || []).map((c, i) => (i === idx ? { ...c, ...patch } : c)) });

  return (
    <>
      <Header title={pedigreeId || '—'} sub={node.placeholder ? 'Belirtilmemiş ebeveyn' : sub} onClose={onClearSelection} />
      <div className="editor-body">
        {node.placeholder && (
          <div className="field-hint">Bu kişi silinen ya da bilinmeyen diğer ebeveynin yerini tutar.</div>
        )}

        {!node.placeholder && (
          <div className="card">
            <div className="card-title">Kişi</div>
            {/* sex is editable for everyone; the store refuses a change that
                would contradict an existing partnership and says why */}
            <div className="segmented" role="radiogroup" aria-label="Cinsiyet">
              {[['male', 'Erkek'], ['female', 'Kadın'], ['unknown', 'Bilinmiyor']].map(([v, t]) => (
                <button key={v} className={(node.sex || 'unknown') === v ? 'on' : undefined} role="radio"
                  aria-checked={(node.sex || 'unknown') === v} onClick={() => set({ sex: v })}>{t}</button>
              ))}
            </div>
            <label className="field-col">
              <span className="field-label">Etiket (çizimde görünür)</span>
              <input type="text" className="input input-wide" value={node.displayLabel || ''} placeholder="Boşsa gösterilmez"
                onChange={e => set({ displayLabel: e.target.value })} />
            </label>
            {!isLoss && (
              <label className="field">
                <span className="field-label">Yaş</span>
                <input type="number" min="0" className="input input-age" value={node.age || ''} placeholder="—"
                  onChange={e => set({ age: sanitizeAgeValue(e.target.value) })} />
              </label>
            )}
          </div>
        )}

        <div className="card">
          <div className="card-title">Klinik durum</div>
          {/* proband is a single-holder flag; marking it never touches affected */}
          <div className="chips">
            <button className={`chip${node.affected ? ' on' : ''}`} aria-pressed={!!node.affected} onClick={() => set({ affected: !node.affected })}>Etkilenmiş</button>
            <button className={`chip${node.carrier ? ' on' : ''}`} aria-pressed={!!node.carrier} onClick={() => set({ carrier: !node.carrier })}>Taşıyıcı</button>
            {!isLoss && (
              <button className={`chip${node.deceased ? ' on' : ''}`} aria-pressed={!!node.deceased} onClick={() => set({ deceased: !node.deceased })}>Vefat</button>
            )}
            <button className={`chip${node.proband ? ' on' : ''}`} aria-pressed={!!node.proband}
              onClick={() => (node.proband ? onClearProband() : onSetProband(node.id))}>Proband</button>
          </div>
          {!isLoss && (
            <label className="field-col">
              <span className="field-label">Tanı</span>
              <input type="text" className="input input-wide" value={node.condition || ''} placeholder="örn. epilepsi"
                onChange={e => set({ condition: e.target.value })} />
            </label>
          )}
          {!!node.deceased && !isLoss && (
            <>
              <label className="field">
                <span className="field-label">Ölüm yaşı</span>
                <input type="number" min="0" className="input input-age" value={node.ageAtDeath || ''} placeholder="—"
                  onChange={e => set({ ageAtDeath: sanitizeAgeValue(e.target.value) })} />
              </label>
              <label className="field-col">
                <span className="field-label">Ölüm nedeni</span>
                <input type="text" className="input input-wide" value={node.causeOfDeath || ''}
                  onChange={e => set({ causeOfDeath: e.target.value })} />
              </label>
            </>
          )}
          {!isLoss && (
            <div className="field-col">
              {(node.conditions || []).length > 0 && <span className="field-label">Diğer tanılar</span>}
              {(node.conditions || []).map((cond, idx) => (
                <div key={idx} className="btn-row" style={{ flexWrap: 'nowrap' }}>
                  <input type="text" className="input" style={{ flex: 1, minWidth: 0 }} value={cond.label || ''} placeholder="Tanı"
                    onChange={e => setCondition(idx, { label: e.target.value })} />
                  <select className="select" value={cond.status || 'unknown'} onChange={e => setCondition(idx, { status: e.target.value })}>
                    <option value="affected">Etkilenmiş</option>
                    <option value="carrier">Taşıyıcı</option>
                    <option value="unknown">Bilinmiyor</option>
                  </select>
                  <button className="ui-btn ui-btn-ghost ui-btn-icon" aria-label="Tanıyı kaldır"
                    onClick={() => set({ conditions: (node.conditions || []).filter((_, i) => i !== idx) })}><X size={14} /></button>
                </div>
              ))}
              <div>
                <button className="ui-btn ui-btn-sm" onClick={() => set({ conditions: [...(node.conditions || []), { label: '', status: 'unknown' }] })}>
                  + Tanı ekle
                </button>
              </div>
            </div>
          )}
        </div>

        {!isLoss && !node.placeholder && (
          <div className="card">
            <div className="card-title">Aileye ekle</div>
            {/* parents only when there is no parent union (never duplicates);
                siblings only when there is one (never fabricates parents) */}
            {onAddParents && !ownParentRel && (
              <div className="field-col">
                <span className="field-label">Ebeveyn</span>
                <div className="add-grid">
                  <button className="ui-btn ui-btn-sm" onClick={() => onAddParents(node.id, { onlyMother: true })} title="Diğer ebeveyn belirtilmemiş olarak eklenir">Anne</button>
                  <button className="ui-btn ui-btn-sm" onClick={() => onAddParents(node.id, { onlyFather: true })} title="Diğer ebeveyn belirtilmemiş olarak eklenir">Baba</button>
                  <button className="ui-btn ui-btn-sm" onClick={() => onAddParents(node.id, {})}>İkisi</button>
                </div>
              </div>
            )}
            {onAddSibling && ownParentRel && (
              <div className="field-col">
                <span className="field-label">Kardeş</span>
                <div className="add-grid">
                  <button className="ui-btn ui-btn-sm" onClick={() => onAddSibling(node.id, 'male')}>Erkek</button>
                  <button className="ui-btn ui-btn-sm" onClick={() => onAddSibling(node.id, 'female')}>Kız</button>
                  <button className="ui-btn ui-btn-sm" onClick={() => onAddSibling(node.id, 'unknown')}>Bilinmeyen</button>
                </div>
              </div>
            )}
            {/* a union is woman + man only: offer the opposite sex, nothing for unknown */}
            {!hasUnion && (
              <div className="field-col">
                <span className="field-label">Eş ve çocuk</span>
                {node.sex === 'unknown' ? (
                  <div className="field-hint">Eş ya da çocuk eklemek için önce cinsiyeti seçin.</div>
                ) : (
                  <div className="add-grid">
                    <button className="ui-btn ui-btn-sm" onClick={() => onAddSpouse(node.id, node.sex === 'female' ? 'male' : 'female')}>Eş</button>
                    <button className="ui-btn ui-btn-sm" onClick={() => onAddChild(null, 'male', node.id)} title="Eş otomatik eklenir">Oğul</button>
                    <button className="ui-btn ui-btn-sm" onClick={() => onAddChild(null, 'female', node.id)} title="Eş otomatik eklenir">Kız</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!isLoss && !node.placeholder && existingUnions.map(u => {
          const partnerId = u.partners.find(p => p !== node.id);
          const children = pcrs.find(r => r.unionId === u.id)?.children || [];
          return (
            <div className="card" key={u.id}>
              <div className="card-title">Eş: {displayNameFor(partnerId)}</div>
              <div className="field-col">
                <span className="field-label">Çocuk ekle{children.length > 0 ? ` (şu an ${children.length})` : ''}</span>
                <div className="add-grid">
                  <button className="ui-btn ui-btn-sm" onClick={() => onAddChild(u.id, 'male')}>Oğul</button>
                  <button className="ui-btn ui-btn-sm" onClick={() => onAddChild(u.id, 'female')}>Kız</button>
                  <button className="ui-btn ui-btn-sm" onClick={() => onAddChild(u.id, 'unknown')}>Bilinmeyen</button>
                </div>
              </div>
              {onSetUnionRelationshipBackground && (
                <label className="field-col">
                  <span className="field-label">Akrabalık geçmişi</span>
                  <select className="select input-wide" value={u.relationshipBackground || 'not_asked'}
                    onChange={e => onSetUnionRelationshipBackground(u.id, e.target.value)}>
                    {RELATIONSHIP_BACKGROUND_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                  {/* metadata only: consanguinity is always the standard double line */}
                  {u.relationshipBackground === 'consanguinity_reported' && (
                    <span className="field-hint">Ortak atalar çizimde yok; çift çizgi bildirime dayanır.</span>
                  )}
                </label>
              )}
            </div>
          );
        })}

        {/* moves this child within its own sibship only, never to another union */}
        {onReorderChild && siblingOrder && siblingOrder.length > 1 && (
          <div className="card">
            <div className="card-title">Doğum sırası</div>
            <div className="btn-row">
              <button className="ui-btn ui-btn-sm" disabled={ownIndexInOrder <= 0}
                onClick={() => onReorderChild(ownParentRel.unionId, node.id, 'left')}><ArrowLeft size={14} /> Sola</button>
              <span className="muted small" style={{ alignSelf: 'center' }}>{ownIndexInOrder + 1}. / {siblingOrder.length}</span>
              <button className="ui-btn ui-btn-sm" disabled={ownIndexInOrder === -1 || ownIndexInOrder >= siblingOrder.length - 1}
                onClick={() => onReorderChild(ownParentRel.unionId, node.id, 'right')}>Sağa <ArrowRight size={14} /></button>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-title">Not</div>
          <textarea className="input input-wide" value={node.notes || ''} placeholder="Klinik notlar"
            onChange={e => set({ notes: e.target.value })} />
        </div>

        {/* anyone but the proband can be deleted; children stay with the other parent */}
        {onDeleteIndividual && !node.placeholder && (
          node.proband ? (
            <div className="field-hint">Proband silinemez — önce başka bir kişiyi proband yapın.</div>
          ) : (
            <button className="ui-btn ui-btn-danger" onClick={() => {
              if (window.confirm(`"${displayNameFor(node.id)}" silinsin mi?\n\nÇocukları silinmez ve diğer ebeveynle bağlı kalır; silinen kişinin yerinde "belirtilmemiş ebeveyn" gösterilir. Çocuğu olmayan birliktelikleri kaldırılır.\n\nBu işlem "Geri Al" ile geri alınabilir.`)) {
                onDeleteIndividual(node.id);
              }
            }}>
              <Trash2 size={14} /> Kişiyi sil
            </button>
          )
        )}
      </div>
    </>
  );
}
