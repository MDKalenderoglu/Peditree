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
import { computePedigreeIds } from '../utils/pedigreeNumbering';
import { degreeLabel } from '../graph/kinship';
import { groupOf, multipleName, zygosityLabel, ZYGOSITY } from '../graph/multiples';
import BulkEditor from './BulkEditor';
import DraftField from './DraftField';

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

const PATH_TEXT = {
  mothers_paternal_is_fathers_paternal: 'Annenin babası ile babanın babası kardeş',
  mothers_maternal_is_fathers_maternal: 'Annenin annesi ile babanın annesi kardeş',
  cross_cousin_1: 'Annenin annesi ile babanın babası kardeş',
  cross_cousin_2: 'Annenin babası ile babanın annesi kardeş',
};
const DEGREE_OPTIONS = [
  ['unknown', 'Bilinmiyor'], ['first_cousin', '1. derece kuzen'], ['second_cousin', '2. derece kuzen'],
  ['first_cousin_once_removed', '1. kuzenin çocuğu (bir kuşak fark)'], ['second_cousin_once_removed', '2. kuzenin çocuğu (bir kuşak fark)'],
  ['double_first_cousin', 'Çift 1. derece kuzen'], ['multiple_relationship', 'Birden fazla akrabalık yolu'], ['other', 'Diğer'],
];

/**
 * Consanguinity of a couple, three answers (clinician request 2026-10-25):
 * Var / Yok / Aynı köy (nothing chosen = not asked). When the drawing itself
 * shows shared ancestors, it decides (read-only). For the proband's parents,
 * "Var" offers degree and path, and the shared ancestors are drawn from the
 * choice (wizard template, wizardAdapter.js).
 */
function RelationshipChoice({ u, onSetBackground, parentsCons }) {
  const isParents = parentsCons && parentsCons.parents.unionId === u.id;
  const parents = isParents ? parentsCons.parents : null;
  const kin = parents ? parents.kinship : null;
  const drawn = isParents ? kin && !kin.fromTemplate : u.consanguinityStatus === 'known_supported';
  if (drawn) {
    const nameOf = parentsCons ? parentsCons.nameOf : (x) => x;
    return (
      <div className="field-col">
        <span className="field-label">Akrabalık: var</span>
        <span className="field-hint">
          Çizime göre: {degreeLabel(isParents ? kin.degree : u.consanguinityDegree) || 'akraba'}
          {isParents && PATH_TEXT[parents.consanguinityPath] ? ` — ${PATH_TEXT[parents.consanguinityPath]}` : ''}.
        </span>
        {isParents && <span className="field-hint">Ortak atalar: {kin.ancestors.map(nameOf).join(', ')}</span>}
      </div>
    );
  }
  const value = u.consanguineous ? 'yes' : u.relationshipBackground === 'no_consanguinity_reported' ? 'no'
    : u.relationshipBackground === 'same_village_or_same_origin' ? 'village' : null;
  const BACKGROUND = { yes: 'consanguinity_reported', no: 'no_consanguinity_reported', village: 'same_village_or_same_origin' };
  const choose = (v) => {
    const next = v === value ? null : v;
    if (isParents) {
      if (next === 'yes') { parentsCons.onSet('consanguineous', true); return; }
      if (u.consanguineous) parentsCons.onSet('consanguineous', false);
    }
    onSetBackground(u.id, next ? BACKGROUND[next] : 'not_asked');
  };
  return (
    <div className="field-col">
      <span className="field-label">Akrabalık</span>
      <div className="segmented" role="radiogroup" aria-label="Akrabalık">
        {[['yes', 'Var'], ['no', 'Yok'], ['village', 'Aynı köy']].map(([v, t]) => (
          <button key={v} className={value === v ? 'on' : undefined} role="radio" aria-checked={value === v} onClick={() => choose(v)}>{t}</button>
        ))}
      </div>
      {value === 'village' && <span className="field-hint">Aynı köy / bölge: akrabalık değildir, tek çizgi kalır.</span>}
      {isParents && value === 'yes' && (
        <>
          <select className="select input-wide" value={parents.consanguinityDegree} aria-label="Akrabalık derecesi"
            onChange={e => parentsCons.onSet('consanguinityDegree', e.target.value)}>
            {DEGREE_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
          {parents.consanguinityDegree === 'first_cousin' && (
            <select className="select input-wide" value={parents.consanguinityPath} aria-label="Ortak atalar kimin üzerinden"
              onChange={e => parentsCons.onSet('consanguinityPath', e.target.value)}>
              <option value="unknown">Ortak atalar kimin üzerinden? (bilinmiyor)</option>
              {Object.entries(PATH_TEXT).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          )}
          {kin
            ? <span className="field-hint">Ortak atalar çizildi: {kin.ancestors.map(parentsCons.nameOf).join(', ')}</span>
            : <span className="field-hint">Derece (1. kuzende yol da) seçilince ortak atalar otomatik çizilir; seçilmezse yalnız çift çizgi.</span>}
        </>
      )}
      {!isParents && value === 'yes' && <span className="field-hint">Ortak atalar çizimde yok; çift çizgi bildirime dayanır.</span>}
    </div>
  );
}

/** One partnership: status (divorce/separation), consanguinity, children (couple card). */
function UnionControls({ u, pcrs, onAddChild, onSetUnionStatus, onSetUnionRelationshipBackground, parentsCons, withChildren = true }) {
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
      {onSetUnionRelationshipBackground && (
        <RelationshipChoice u={u} onSetBackground={onSetUnionRelationshipBackground} parentsCons={parentsCons} />
      )}
      {withChildren && (
        <div className="field-col">
          <span className="field-label">Çocuk ekle{children.length > 0 ? ` (şu an ${children.length})` : ''}</span>
          <AddButtons onAdd={(sex, extra) => onAddChild(u.id, sex, null, extra)} />
        </div>
      )}
    </>
  );
}

/** Twins / multiple births of this person: zygosity, one more, leave the group. */
function MultiplesCard({ node, pedigreeData, displayNameFor, onAddMultiple, onSetZygosity, onLeaveMultiple }) {
  const found = groupOf(pedigreeData, node.id);
  const hasParents = (pedigreeData.parentChildRelationships || []).some(r => r.children.includes(node.id));
  if (!hasParents || !onAddMultiple) return null;
  const sexes = [['male', 'Erkek'], ['female', 'Kız'], ['unknown', 'Bilinmeyen']];
  // a new twin is added from the ring (İkiz); here only an existing group
  if (!found) return null;
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
function TwoPersonActions({ node, node2, pedigreeData, onCreateUnion, onMakeSiblings, onClearSelection, unionProps, onSetMultipleBirth, bulk }) {
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
        {bulk}
        <div className="field-hint">İpucu: Cmd/Ctrl ile tıklayarak birden çok kişi seçilir; bir ilişki çizgisine tıklamak o çifti seçer.</div>
      </div>
    </>
  );
}

export default function IndividualEditor({
  node, node2, pedigreeData, onUpdate, onAddChild,
  onDeleteIndividual, onCreateUnion, onMakeSiblings,
  onClearSelection, onReorderChild, onSetUnionRelationshipBackground, onSetUnionStatus,
  onSetMultipleBirth, onAddMultiple, onSetZygosity, onLeaveMultiple,
  wizardParents, onSetParentsField,
  selectedNodes = [], onUpdateMany, onSetFindingStatusMany, onAddFindingMany,
}) {
  const ids = computePedigreeIds(pedigreeData?.nodes || []);
  const nameOfId = (id) => {
    const p = pedigreeData?.individuals?.find(i => i.id === id);
    const pid = ids.get(id)?.displayId;
    const label = p?.displayLabel || p?.label;
    return pid ? (label ? `${pid} (${label})` : pid) : (label || 'birey');
  };
  const parentsCons = wizardParents && onSetParentsField ? { parents: wizardParents, onSet: onSetParentsField, nameOf: nameOfId } : null;
  const bulk = onUpdateMany && selectedNodes.length >= 2 ? (
    <BulkEditor nodes={selectedNodes} conditionKey={pedigreeData?.conditionKey || []}
      onUpdateMany={onUpdateMany} onSetFindingStatusMany={onSetFindingStatusMany} onAddFindingMany={onAddFindingMany} />
  ) : null;
  if (selectedNodes.length >= 3) {
    return (
      <>
        <Header title={`${selectedNodes.length} kişi seçili`} sub={selectedNodes.map(n => ids.get(n.id)?.displayId || '—').join(', ')} onClose={onClearSelection} />
        <div className="editor-body">
          {bulk}
          <div className="field-hint">Cmd/Ctrl ile tıklayarak kişi ekleyip çıkarabilirsiniz.</div>
        </div>
      </>
    );
  }
  if (node && node2) {
    return (
      <TwoPersonActions node={node} node2={node2} pedigreeData={pedigreeData}
        onCreateUnion={onCreateUnion} onMakeSiblings={onMakeSiblings} onClearSelection={onClearSelection}
        unionProps={{ onAddChild, onSetUnionStatus, onSetUnionRelationshipBackground, parentsCons }} onSetMultipleBirth={onSetMultipleBirth}
        bulk={bulk} />
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
          <div className="field-hint editor-tip">Eklemek, bulgu, durum, ikiz ve not için sembolün etrafındaki halkayı kullanın.</div>
        )}

        {!node.placeholder && (
          <div className="card">
            <div className="card-title">Bilgiler</div>
            <label className="field-col">
              <span className="field-label">Etiket (çizimde görünür)</span>
              <DraftField key={`${node.id}-label`} type="text" className="input input-wide" value={node.displayLabel || ''} placeholder="Boşsa gösterilmez"
                onCommit={v => set({ displayLabel: v })} />
            </label>
            {!isLoss && (
              <label className="field">
                <span className="field-label">Yaş</span>
                <DraftField key={`${node.id}-age`} type="number" min="0" className="input input-age" value={node.age || ''} placeholder="—"
                  onCommit={v => set({ age: sanitizeAgeValue(v) })} />
              </label>
            )}
            {!!node.deceased && !isLoss && (
              <>
                <label className="field">
                  <span className="field-label">Ölüm yaşı</span>
                  <DraftField key={`${node.id}-death-age`} type="number" min="0" className="input input-age" value={node.ageAtDeath || ''} placeholder="—"
                    onCommit={v => set({ ageAtDeath: sanitizeAgeValue(v) })} />
                </label>
                <label className="field-col">
                  <span className="field-label">Ölüm nedeni</span>
                  <DraftField key={`${node.id}-cause`} type="text" className="input input-wide" value={node.causeOfDeath || ''}
                    onCommit={v => set({ causeOfDeath: v })} />
                </label>
              </>
            )}
            {node.condition && (
              // older free-text field: still shown under the symbol, editable/clearable here
              <label className="field-col">
                <span className="field-label">Sembol altı yazı</span>
                <DraftField key={`${node.id}-condition`} type="text" className="input input-wide" value={node.condition || ''}
                  onCommit={v => set({ condition: v })} />
              </label>
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
            <UnionControls u={u} pcrs={pcrs} onSetUnionStatus={onSetUnionStatus} withChildren={false}
              onSetUnionRelationshipBackground={onSetUnionRelationshipBackground} parentsCons={parentsCons} />
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
