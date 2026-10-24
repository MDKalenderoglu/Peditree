/**
 * IndividualEditor.jsx — right panel: the selected person (or a selected
 * pair). Redesign 2026-10-23: header with the pedigree number, then cards
 * (clinical status, add to the family, partnerships, birth order, notes);
 * the same store operations as before. The store re-validates every action
 * independently of what this panel offers.
 */
import { useState } from 'react';
import { X, Trash2, ArrowLeft, ArrowRight } from 'lucide-react';
import { computeSiblingCreationPlan, computeUnionCreationPlan } from '../state/usePedigreeStore';
import { sanitizeAgeValue } from '../utils/ageValidation';
import { RELATIONSHIP_BACKGROUND_OPTIONS } from '../utils/relationshipBackground';
import { computePedigreeIds } from '../utils/pedigreeNumbering';
import { degreeLabel } from '../graph/kinship';
import { groupOf, multipleName, zygosityLabel, ZYGOSITY } from '../graph/multiples';
import FindingsPalette from './FindingsPalette';

const SEX_WORD = { male: 'Erkek', female: 'Kadın', unknown: 'Cinsiyet bilinmiyor' };
// same options and wording as the wizard; an older 'separated' shows as the combined one
const STATUS_OPTIONS = [['together', 'Birlikte'], ['divorced', 'Boşanmış/Ayrılmış'], ['unknown', 'Bilinmiyor']];

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

// what can be added under a couple or beside a sibling: [label, sex, extra]
const KIN_KINDS = [
  ['Erkek', 'male', {}], ['Kız', 'female', {}], ['Bilinmeyen', 'unknown', {}],
  ['Düşük', 'unknown', { pregnancyLoss: true }], ['Ölü doğum', 'unknown', { stillbirth: true }],
];

function AddButtons({ onAdd, title }) {
  return (
    <div className="add-grid">
      {KIN_KINDS.map(([t, sex, extra]) => (
        <button key={t} className="ui-btn ui-btn-sm" onClick={() => onAdd(sex, extra)} title={title}>{t}</button>
      ))}
    </div>
  );
}

/** One partnership: children, status (divorce/separation), consanguinity. */
function UnionControls({ u, pcrs, onAddChild, onSetUnionStatus, onSetUnionRelationshipBackground }) {
  const children = pcrs.find(r => r.unionId === u.id)?.children || [];
  return (
    <>
      {onSetUnionStatus && (
        <label className="field">
          <span className="field-label">İlişki</span>
          <select className="select" value={u.status === 'separated' ? 'divorced' : (u.status || 'together')}
            onChange={e => onSetUnionStatus(u.id, e.target.value)}>
            {STATUS_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
      )}
      <div className="field-col">
        <span className="field-label">Çocuk ekle{children.length > 0 ? ` (şu an ${children.length})` : ''}</span>
        <AddButtons onAdd={(sex, extra) => onAddChild(u.id, sex, null, extra)} />
      </div>
      {u.consanguinityStatus === 'known_supported' ? (
        // drawn shared ancestors decide it (finalize.js); nothing to choose here
        <div className="field-col">
          <span className="field-label">Akraba evliliği</span>
          <span className="field-hint">Çizime göre: {degreeLabel(u.consanguinityDegree) || 'akraba'} — ortak atalar çizimde.</span>
        </div>
      ) : onSetUnionRelationshipBackground && (
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
    </>
  );
}

/** Twins / multiple births of this person: zygosity, one more, leave the group. */
function MultiplesCard({ node, pedigreeData, displayNameFor, onAddMultiple, onSetZygosity, onLeaveMultiple }) {
  const [z, setZ] = useState('unknown');
  const found = groupOf(pedigreeData, node.id);
  const hasParents = (pedigreeData.parentChildRelationships || []).some(r => r.children.includes(node.id));
  if (!hasParents || !onAddMultiple) return null;
  const sexes = [['male', 'Erkek'], ['female', 'Kız'], ['unknown', 'Bilinmeyen']];
  if (!found) {
    return (
      <div className="card">
        <div className="card-title">İkiz / üçüz</div>
        <label className="field">
          <span className="field-label">Zigosite</span>
          <select className="select" value={z} onChange={e => setZ(e.target.value)}>
            {ZYGOSITY.map(v => <option key={v} value={v}>{zygosityLabel(v, 2)}</option>)}
          </select>
        </label>
        <div className="field-col">
          <span className="field-label">İkizini ekle</span>
          {z === 'monozygotic' ? (
            <button className="ui-btn ui-btn-sm" onClick={() => onAddMultiple(node.id, { zygosity: z })}>İkizini ekle (aynı cinsiyet)</button>
          ) : (
            <div className="add-grid">
              {sexes.map(([v, t]) => <button key={v} className="ui-btn ui-btn-sm" onClick={() => onAddMultiple(node.id, { sex: v, zygosity: z })}>{t}</button>)}
            </div>
          )}
        </div>
        <span className="field-hint">Var olan bir kardeşle ikiz yapmak için ikisini Cmd/Ctrl ile seçin.</span>
      </div>
    );
  }
  const { group } = found;
  const n = group.children.length;
  return (
    <div className="card">
      <div className="card-title">{multipleName(n)}</div>
      <span className="field-hint">{group.children.map(displayNameFor).join(', ')}</span>
      <label className="field-col">
        <span className="field-label">Zigosite</span>
        <select className="select input-wide" value={group.zygosity} onChange={e => onSetZygosity(node.id, e.target.value)}>
          {ZYGOSITY.map(v => <option key={v} value={v}>{zygosityLabel(v, n)}</option>)}
        </select>
      </label>
      <div className="field-col">
        <span className="field-label">{multipleName(n + 1)} yap: bir kardeş daha</span>
        {group.zygosity === 'monozygotic' ? (
          <button className="ui-btn ui-btn-sm" onClick={() => onAddMultiple(node.id, {})}>Ekle (aynı cinsiyet)</button>
        ) : (
          <div className="add-grid">
            {sexes.map(([v, t]) => <button key={v} className="ui-btn ui-btn-sm" onClick={() => onAddMultiple(node.id, { sex: v })}>{t}</button>)}
          </div>
        )}
      </div>
      <button className="ui-btn ui-btn-sm ui-btn-ghost" onClick={() => onLeaveMultiple(node.id)}>Bu kişiyi gruptan çıkar</button>
    </div>
  );
}

/**
 * Two individuals selected (Cmd/Ctrl-click, or a click on their relationship
 * line): an existing couple gets its relationship card, others the pair actions.
 */
function TwoPersonActions({ node, node2, pedigreeData, onCreateUnion, onMakeSiblings, onClearSelection, unionProps, onSetMultipleBirth }) {
  // Authoritative safety checks (self/duplicate, pregnancy loss, siblings,
  // cross-generation; two different parent unions cannot be merged).
  const unionPlan = computeUnionCreationPlan(pedigreeData, node.id, node2.id);
  const siblingPlan = computeSiblingCreationPlan(pedigreeData, node.id, node2.id);
  const siblingBlocked = !siblingPlan.ok || siblingPlan.action === 'noop';
  const couple = (pedigreeData.unions || []).find(u => u.partners.includes(node.id) && u.partners.includes(node2.id));
  const parentRel = (id) => (pedigreeData.parentChildRelationships || []).find(r => r.children.includes(id));
  const siblings = !!parentRel(node.id) && parentRel(node.id) === parentRel(node2.id)
    && !node.placeholder && !node2.placeholder;

  const pedigreeIds = computePedigreeIds(pedigreeData?.nodes || []);
  const label = (p) => {
    const pid = pedigreeIds.get(p.id)?.displayId;
    const human = p.displayLabel || p.label;
    return pid ? (human ? `${pid} — ${human}` : pid) : (human || 'birey');
  };

  return (
    <>
      <Header title={couple ? 'İlişki' : 'İki kişi seçili'} sub={`${label(node)}  +  ${label(node2)}`} onClose={onClearSelection} />
      <div className="editor-body">
        {couple && (
          <div className="card">
            <div className="card-title">Bu çift</div>
            <UnionControls u={couple} pcrs={pedigreeData.parentChildRelationships || []} {...unionProps} />
          </div>
        )}
        {siblings && onSetMultipleBirth && (
          <div className="card">
            <div className="card-title">İkiz yap</div>
            <div className="btn-row">
              {ZYGOSITY.map(v => (
                <button key={v} className="ui-btn ui-btn-sm" onClick={() => onSetMultipleBirth([node.id, node2.id], v)}>
                  {{ monozygotic: 'Tek yumurta', dizygotic: 'Çift yumurta', unknown: 'Bilinmiyor' }[v]}
                </button>
              ))}
            </div>
            <span className="field-hint">Biri zaten ikizse diğeri gruba katılır (üçüz olur).</span>
          </div>
        )}
        {!couple && (
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
        )}
        <div className="field-hint">İpucu: Cmd/Ctrl ile tıklayarak iki kişi seçilir; bir ilişki çizgisine tıklamak o çifti seçer.</div>
      </div>
    </>
  );
}

export default function IndividualEditor({
  node, node2, pedigreeData, onUpdate, onAddSpouse, onAddChild, onSetProband, onClearProband,
  onDeleteIndividual, onCreateUnion, onMakeSiblings,
  onClearSelection, onReorderChild, onSetUnionRelationshipBackground, onSetUnionStatus,
  onAddParents, onAddSibling,
  onSetMultipleBirth, onAddMultiple, onSetZygosity, onLeaveMultiple,
  onAddFinding, onSetFindingStatus, onSetFindingStyle,
}) {
  if (node && node2) {
    return (
      <TwoPersonActions node={node} node2={node2} pedigreeData={pedigreeData}
        onCreateUnion={onCreateUnion} onMakeSiblings={onMakeSiblings} onClearSelection={onClearSelection}
        unionProps={{ onAddChild, onSetUnionStatus, onSetUnionRelationshipBackground }} onSetMultipleBirth={onSetMultipleBirth} />
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
          {!isLoss && onAddFinding && (
            <div className="field-col">
              <span className="field-label">Bulgular / tanılar</span>
              <FindingsPalette node={node} conditionKey={pedigreeData?.conditionKey || []}
                onSetStatus={onSetFindingStatus} onAdd={onAddFinding} onSetStyle={onSetFindingStyle} />
            </div>
          )}
          {!isLoss && node.condition && (
            // older free-text field: still shown under the symbol, editable/clearable here
            <label className="field-col">
              <span className="field-label">Sembol altı yazı</span>
              <input type="text" className="input input-wide" value={node.condition || ''}
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
        </div>

        {!isLoss && !node.placeholder && (
          <div className="card">
            <div className="card-title">Aileye ekle</div>
            {/* parents only when there is no parent union (never duplicates);
                siblings only when there is one (never fabricates parents) */}
            {onAddParents && !ownParentRel && (
              <button className="ui-btn ui-btn-sm" onClick={() => onAddParents(node.id, {})}>Anne ve baba ekle</button>
            )}
            {onAddSibling && ownParentRel && (
              <div className="field-col">
                <span className="field-label">Kardeş</span>
                <AddButtons onAdd={(sex, extra) => onAddSibling(node.id, sex, extra)} />
              </div>
            )}
            {/* a union is woman + man only: offer the opposite sex, nothing for unknown */}
            {!hasUnion && (
              <div className="field-col">
                <span className="field-label">Eş ve çocuk</span>
                {node.sex === 'unknown' ? (
                  <div className="field-hint">Eş ya da çocuk eklemek için önce cinsiyeti seçin.</div>
                ) : (
                  <>
                    <button className="ui-btn ui-btn-sm" onClick={() => onAddSpouse(node.id, node.sex === 'female' ? 'male' : 'female')}>Eş ekle</button>
                    <span className="field-hint">Çocuk ekle (eş otomatik eklenir):</span>
                    <AddButtons onAdd={(sex, extra) => onAddChild(null, sex, node.id, extra)} />
                  </>
                )}
              </div>
            )}
            {hasUnion && (node.sex === 'male' || node.sex === 'female') && (
              <button className="ui-btn ui-btn-sm" onClick={() => onAddSpouse(node.id, node.sex === 'female' ? 'male' : 'female')}>
                Başka bir eş ekle
              </button>
            )}
          </div>
        )}

        {!node.placeholder && (
          <MultiplesCard node={node} pedigreeData={pedigreeData} displayNameFor={displayNameFor}
            onAddMultiple={onAddMultiple} onSetZygosity={onSetZygosity} onLeaveMultiple={onLeaveMultiple} />
        )}

        {!isLoss && !node.placeholder && existingUnions.map(u => (
          <div className="card" key={u.id}>
            <div className="card-title">Eş: {displayNameFor(u.partners.find(p => p !== node.id))}</div>
            <UnionControls u={u} pcrs={pcrs} onAddChild={onAddChild} onSetUnionStatus={onSetUnionStatus}
              onSetUnionRelationshipBackground={onSetUnionRelationshipBackground} />
          </div>
        ))}

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
