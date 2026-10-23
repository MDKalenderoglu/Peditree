import { useState } from 'react';
import { usePedigreeStore, computeDeletionPlan } from '../state/usePedigreeStore';
import { ChevronDown, ChevronRight, Trash2, X } from 'lucide-react';
import ChildOrderEditor from './ChildOrderEditor';
import { sanitizeAgeValue } from '../utils/ageValidation';
import { RELATIONSHIP_BACKGROUND_OPTIONS } from '../utils/relationshipBackground';
import { computePedigreeIds } from '../utils/pedigreeNumbering';
import { deriveSiblingCounts } from '../utils/siblingCounts';

/**
 * Left-panel selected-person identity + quick-action card (v0.3a.1).
 * The left panel used to stay generic/unrelated to canvas selection — this
 * surfaces who is selected and offers the one destructive action (delete)
 * right where the user is already looking, instead of requiring them to
 * find it buried in the right-hand editor.
 */
function SelectedPersonCard({ wizardData, pedigreeData, selectedId, selectedId2, onDeleteIndividual, onClearSelection }) {
  if (!selectedId && !selectedId2) return null;

  const ind = pedigreeData.individuals.find(i => i.id === selectedId);
  const ind2 = selectedId2 ? pedigreeData.individuals.find(i => i.id === selectedId2) : null;
  if (!ind && !ind2) return null;

  // v0.3a.4: show clinician-facing pedigree IDs (II-3) and human labels,
  // never internal graph IDs (mat_uncle_0, U_PARENTS) in this card or its
  // delete confirmation.
  const pedigreeIds = computePedigreeIds(pedigreeData.nodes || []);
  const displayNameFor = (id) => {
    const person = pedigreeData.individuals.find(i => i.id === id);
    const pid = pedigreeIds.get(id)?.displayId;
    const label = person?.displayLabel || person?.label;
    if (pid && label) return `${pid} (${label})`;
    return pid || label || 'birey';
  };

  const renderIdentity = (person) => {
    if (!person) return null;
    const flags = [];
    if (person.proband) flags.push('Proband');
    if (person.affected) flags.push('Etkilenmiş');
    if (person.carrier) flags.push('Taşıyıcı');
    if (person.deceased) flags.push('Ölü');
    if (person.pregnancyLoss) flags.push('Düşük/Kayıp');
    if (person.stillbirth) flags.push('Ölü Doğum');
    const pid = pedigreeIds.get(person.id)?.displayId;
    return (
      <div style={{ fontSize: '0.78rem', color: '#1e293b', lineHeight: 1.5 }}>
        <strong>{pid || person.displayLabel || person.label}</strong>
        {person.displayLabel || person.label ? <span style={{ color: '#64748b' }}> — {person.displayLabel || person.label}</span> : null}
        {' '}({person.sex === 'male' ? 'Erkek' : person.sex === 'female' ? 'Kadın' : 'Bilinmiyor'})
        {flags.length > 0 && (
          <div style={{ marginTop: '2px', color: '#64748b' }}>{flags.join(' · ')}</div>
        )}
      </div>
    );
  };

  const plan = ind ? computeDeletionPlan(wizardData, pedigreeData, ind.id) : null;

  return (
    <div style={{
      marginBottom: '14px', padding: '10px', background: '#eef2ff',
      border: '1px solid #c7d2fe', borderRadius: '6px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
        <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#3730a3' }}>Seçili Kişi</span>
        <button
          onClick={onClearSelection}
          title="Seçimi temizle"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6366f1', display: 'flex' }}
        >
          <X size={14} />
        </button>
      </div>

      {renderIdentity(ind)}
      {ind2 && (
        <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #c7d2fe' }}>
          <div style={{ fontSize: '0.68rem', color: '#6366f1', marginBottom: '2px' }}>+ 2. seçim:</div>
          {renderIdentity(ind2)}
        </div>
      )}

      {ind && !ind2 && (
        <div style={{ marginTop: '8px' }}>
          <button
            onClick={() => {
              if (!plan.ok) {
                window.alert(plan.reason);
                return;
              }
              // v0.3a.2 — preview exactly what this deletion affects before
              // confirming: the person themselves, any partner union(s)
              // (removed entirely), and any children affected (they are
              // NOT deleted — they lose the link to the removed union and
              // become parent-less, same as any other orphaned individual).
              const parts = [`"${displayNameFor(ind.id)}" silinsin mi?`];
              // v0.3a.4: describe unions by count (union IDs are internal
              // and meaningless to a clinician), and children by their
              // pedigree IDs.
              if (plan.affectedUnionIds.length > 0) {
                parts.push(`\n\n${plan.affectedUnionIds.length} eş birliği tamamen kaldırılacak.`);
              }
              if (plan.affectedChildIds.length > 0) {
                parts.push(`\nEtkilenen çocuk(lar): ${plan.affectedChildIds.map(displayNameFor).join(', ')} (silinmeyecek, sadece bu ebeveyn bağlantısı kaldırılacak).`);
              }
              if (window.confirm(parts.join(''))) {
                onDeleteIndividual(ind.id);
              }
            }}
            className="btn"
            style={{
              display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem',
              padding: '4px 8px', background: plan.ok ? '#fee2e2' : '#f1f5f9',
              border: plan.ok ? '1px solid #fca5a5' : '1px solid #cbd5e1',
              color: plan.ok ? '#dc2626' : '#94a3b8',
            }}
            title={plan.ok ? 'Bu bireyi sil' : plan.reason}
          >
            <Trash2 size={12} /> Seçili Bireyi Sil
          </button>
          {!plan.ok && (
            <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '3px' }}>{plan.reason}</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Custom consanguinity person picker ── */
function CustomConsanguinityAdder({ individuals, onAdd, nameOf }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');

  // v0.3a.2 reset-audit fix: this local selection used to survive a full
  // pedigree reset (or a deletion of the selected individual) since this
  // component never unmounts — the dropdown would silently show a blank
  // value once the referenced individual disappeared, but the stale ID
  // stayed in local state and could resurface confusingly if a
  // newly-created individual happened to reuse it. Clear both slots
  // whenever either no longer refers to a real individual in the current
  // graph, so stale selection never survives a reset or a deletion.
  const individualIds = individuals.map(i => i.id);
  if (p1 && !individualIds.includes(p1)) setP1('');
  if (p2 && !individualIds.includes(p2)) setP2('');

  const handleAdd = () => {
    if (p1 && p2 && p1 !== p2) {
      onAdd(p1, p2);
      setP1('');
      setP2('');
    }
  };

  // Filter: no pregnancy losses/stillbirths, no proband
  const options = individuals
    .filter(i => !i.pregnancyLoss && !i.stillbirth && !i.proband)
    .map(i => ({ id: i.id, label: nameOf(i.id), generation: i.generation }));

  // When p1 is selected, filter p2 to same generation only
  const p1Ind = options.find(o => o.id === p1);
  const p2Options = p1
    ? options.filter(o => o.id !== p1 && o.generation === p1Ind?.generation)
    : options;

  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '6px' }}>
      <div style={{ flex: 1, minWidth: '80px' }}>
        <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Kişi 1</div>
        <select value={p1} onChange={e => { setP1(e.target.value); setP2(''); }}
          className="form-input" style={{ fontSize: '0.72rem', padding: '2px' }}>
          <option value="">Seç...</option>
          {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      <div style={{ flex: 1, minWidth: '80px' }}>
        <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Kişi 2 {p1 && p2Options.length === 0 && <span style={{color:'#ef4444'}}>(aynı kuşak yok)</span>}</div>
        <select value={p2} onChange={e => setP2(e.target.value)}
          className="form-input" style={{ fontSize: '0.72rem', padding: '2px' }}>
          <option value="">Seç...</option>
          {p2Options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      <button onClick={handleAdd} disabled={!p1 || !p2 || p1 === p2}
        className="btn btn-primary"
        style={{ padding: '3px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
        + Kardeş Yap
      </button>
    </div>
  );
}

/* ── Reusable compact stepper ── */
const Stepper = ({ label, value, onChange, min = 0, max = Infinity }) => (
  <div className="form-group-row">
    <span className="form-label">{label}</span>
    <div className="stepper">
      <button className="stepper-btn" onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <div className="stepper-val">{value}</div>
      <button className="stepper-btn" onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  </div>
);

/**
 * v0.4.1 — unlike the generic Stepper above, this one does NOT compute
 * "new absolute count" from its own displayed value: the Kardesler counts
 * are derived from the built graph (deriveSiblingCounts), which can be
 * larger than any single underlying wizard array's length (a sibling added
 * via the selected-person editor lives in `graphEdits`, not `siblings.*`).
 * +/- must always add or remove exactly one, regardless of which mechanism
 * produced the individual being removed — see removeLastSibling's docblock
 * in usePedigreeStore.js.
 */
const SiblingStepper = ({ label, value, onIncrement, onDecrement, max = Infinity }) => (
  <div className="form-group-row">
    <span className="form-label">{label}</span>
    <div className="stepper">
      <button className="stepper-btn" onClick={onDecrement} disabled={value <= 0}>−</button>
      <div className="stepper-val">{value}</div>
      <button className="stepper-btn" onClick={onIncrement} disabled={value >= max}>+</button>
    </div>
  </div>
);

/**
 * v0.3a.2 — lightweight progressive-disclosure grouping. Purely a visual
 * divider between existing Accordion sections (no restructuring of the
 * underlying sections/state) so the left panel reads as a small number of
 * clear layers instead of one flat list of ~10 equally-weighted sections.
 */
const LayerHeader = ({ label }) => (
  <div style={{
    marginTop: '16px', marginBottom: '6px', paddingBottom: '3px',
    borderBottom: '2px solid #c7d2fe', fontSize: '0.68rem', fontWeight: 700,
    color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.03em',
  }}>
    {label}
  </div>
);

/**
 * v0.3a.3 — true single-open accordion. `open` and `onToggle` are lifted
 * to the store's `openSectionId`/`setOpenSection` (see usePedigreeStore.js)
 * rather than local per-instance state, so opening any one section
 * automatically closes every other one — there is only ever one
 * `openSectionId` in the whole panel.
 */
const Accordion = ({ id, title, summary, open, onToggle, children }) => {
  return (
    <div className="wizard-section">
      <div className="wizard-section-header" onClick={() => onToggle(id)}>
        <div>
          <div>{title}</div>
          {summary && <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 'normal', marginTop: '2px' }}>{summary}</div>}
        </div>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </div>
      {open && <div className="wizard-section-content">{children}</div>}
    </div>
  );
};

// ── Child-order items ──
// v2 (graph-first): items are the REAL child ids of a union, in the order
// the graph draws them, labelled for the clinician. Ids are permanent, so a
// label like "E 2" is only a position hint, never an identity.
function childItems(pedigreeData, unionId, childIds, anchorId) {
  const byId = new Map((pedigreeData.individuals || []).map(i => [i.id, i]));
  const counters = {};
  const tag = (p) => {
    if (p.id === anchorId) return 'Proband';
    if (p.pregnancyLoss) return 'Düşük';
    if (p.stillbirth) return 'Ölü D.';
    return p.sex === 'male' ? 'E' : p.sex === 'female' ? 'K' : 'Bil.';
  };
  return (childIds || []).map(id => byId.get(id)).filter(Boolean).map(p => {
    const t = tag(p);
    counters[t] = (counters[t] || 0) + 1;
    const n = t === 'Proband' ? '' : ` ${counters[t]}`;
    return { token: p.id, label: `${t}${n}${p.age ? ` (${p.age})` : ''}` };
  });
}

function childIdsOf(pedigreeData, unionId) {
  return ((pedigreeData.parentChildRelationships || []).find(r => r.unionId === unionId) || {}).children || [];
}

export default function WizardPanel() {
  const {
    wizardData: wd,
    updateWizardData,
    updateSiblingAge,
    addSiblingOfCategory, removeLastSibling,
    updateRelativeCount, updateRelativeChildren,
    addOtherUnion, updateOtherUnion, removeOtherUnion,
    addGen4, updateGen4, removeGen4,
    getChildOrder, setChildOrder,
    toggleGreatGrandparents,
    addCustomConsanguinity, removeCustomConsanguinity,
    setUnionRelationshipBackground,
    pedigreeData,
    selectedId, selectedId2, deleteIndividual, clearSelection,
    openSectionId, setOpenSection,
  } = usePedigreeStore();

  // Clinician-facing name for a person (pedigree id + label), never the internal id.
  const pedigreeIdsForNames = computePedigreeIds(pedigreeData.nodes || []);
  const nameOf = (id) => {
    const p = (pedigreeData.individuals || []).find(i => i.id === id);
    const pid = pedigreeIdsForNames.get(id)?.displayId;
    const label = p?.displayLabel || p?.label;
    return pid ? (label ? `${pid} (${label})` : pid) : (label || 'birey');
  };

  /* ── Other-union mini-panel ── */
  const renderOtherUnions = (parentType) => {
    const key = parentType === 'mother' ? 'motherOtherUnions' : 'fatherOtherUnions';
    const list = wd.parents[key];
    return (
      <div style={{ marginTop: '6px', padding: '8px', background: '#f8fafc', borderRadius: '5px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>Ek Partner ({list.length})</span>
          <button className="btn btn-primary" onClick={() => addOtherUnion(parentType)} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>+ Ekle</button>
        </div>
        {list.map((u, idx) => {
          const unionId = u.unionId;
          const hSibItems = childItems(pedigreeData, unionId, u.childIds);
          const totalKids = (u.children.male || 0) + (u.children.female || 0) + (u.children.unknown || 0) + (u.children.pregnancyLoss || 0) + (u.children.stillbirth || 0);

          return (
            <div key={u.id} style={{ border: '1px solid #e2e8f0', padding: '8px', borderRadius: '4px', marginBottom: '6px', background: '#fff' }}>
              <div className="form-group-row" style={{ marginBottom: '6px' }}>
                <span className="form-label" style={{ fontSize: '0.75rem' }}>Durum</span>
                <select value={u.status === 'separated' ? 'divorced' : u.status} onChange={e => updateOtherUnion(parentType, idx, 'status', e.target.value)} className="form-input" style={{ width: '150px', fontSize: '0.8rem' }}>
                  <option value="together">Birlikte</option>
                  <option value="divorced">Boşanmış/Ayrılmış</option>
                  <option value="unknown">Bilinmiyor</option>
                </select>
              </div>
              <Stepper label="Erkek" value={u.children.male} onChange={v => updateOtherUnion(parentType, idx, 'male', v)} />
              <Stepper label="Kız" value={u.children.female} onChange={v => updateOtherUnion(parentType, idx, 'female', v)} />
              <Stepper label="Bil." value={u.children.unknown} onChange={v => updateOtherUnion(parentType, idx, 'unknown', v)} />
              <Stepper label="Düşük" value={u.children.pregnancyLoss || 0} onChange={v => updateOtherUnion(parentType, idx, 'pregnancyLoss', v)} />
              <Stepper label="Ölü Doğum" value={u.children.stillbirth || 0} onChange={v => updateOtherUnion(parentType, idx, 'stillbirth', v)} />
              {totalKids >= 2 && unionId && (
                <ChildOrderEditor
                  unionId={unionId}
                  items={hSibItems}
                  getOrder={() => getChildOrder(unionId)}
                  setOrder={(order) => setChildOrder(unionId, order)}
                  label="Çocuk Sırası"
                />
              )}
              <button onClick={() => removeOtherUnion(parentType, idx)} style={{ marginTop: '6px', width: '100%', padding: '3px', fontSize: '0.7rem', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '3px', cursor: 'pointer' }}>Kaldır</button>
            </div>
          );
        })}
      </div>
    );
  };

  /* ── Relative section (maternal or paternal, parent or GP level) ── */
  const renderRelatives = (side, title, uncleLabel, auntLabel) => {
    const uncleKey = 'uncles';
    const auntKey = 'aunts';
    const relatives = wd[side] || { uncles: [], aunts: [] };
    const uncles = relatives[uncleKey] || [];
    const aunts = relatives[auntKey] || [];
    const summary = `${uncles.length} ${uncleLabel}, ${aunts.length} ${auntLabel}`;

    return (
      <Accordion id={side} title={title} summary={summary} open={openSectionId === side} onToggle={setOpenSection}>
        {/* No count caps (clinician request 2026-10-23): clinical sibships
            can be large; the layout, not a stepper limit, guards readability. */}
        <Stepper label={`${uncleLabel} Sayısı`} value={uncles.length} onChange={v => updateRelativeCount(side, uncleKey, v)} />
        {uncles.map((rel, idx) => {
          const unionId = rel.unionId;
          const cousinItems = childItems(pedigreeData, unionId, rel.childIds);
          const totalKids = (rel.children.male || 0) + (rel.children.female || 0) +
            (rel.children.unknown || 0) + (rel.children.pregnancyLoss || 0) + (rel.children.stillbirth || 0);

          return (
            <div key={rel.id} style={{ padding: '6px', background: '#f8fafc', borderRadius: '4px', marginTop: '4px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '4px' }}>{uncleLabel} {idx + 1} Cocuklari</div>
              <Stepper label="E" value={rel.children.male} onChange={v => updateRelativeChildren(side, uncleKey, idx, 'male', v)} />
              <Stepper label="K" value={rel.children.female} onChange={v => updateRelativeChildren(side, uncleKey, idx, 'female', v)} />
              <Stepper label="B" value={rel.children.unknown} onChange={v => updateRelativeChildren(side, uncleKey, idx, 'unknown', v)} />
              <Stepper label="Düşük" value={rel.children.pregnancyLoss || 0} onChange={v => updateRelativeChildren(side, uncleKey, idx, 'pregnancyLoss', v)} />
              <Stepper label="Ölü Doğum" value={rel.children.stillbirth || 0} onChange={v => updateRelativeChildren(side, uncleKey, idx, 'stillbirth', v)} />
              {totalKids >= 2 && unionId && (
                <ChildOrderEditor
                  unionId={unionId}
                  items={cousinItems}
                  getOrder={() => getChildOrder(unionId)}
                  setOrder={(order) => setChildOrder(unionId, order)}
                  label="Çocuk Sırası"
                />
              )}
            </div>
          );
        })}

        <div style={{ marginTop: '10px' }}>
          <Stepper label={`${auntLabel} Sayısı`} value={aunts.length} onChange={v => updateRelativeCount(side, auntKey, v)} />
          {aunts.map((rel, idx) => {
            const unionId = rel.unionId;
            const cousinItems = childItems(pedigreeData, unionId, rel.childIds);
            const totalKids = (rel.children.male || 0) + (rel.children.female || 0) +
              (rel.children.unknown || 0) + (rel.children.pregnancyLoss || 0) + (rel.children.stillbirth || 0);

            return (
              <div key={rel.id} style={{ padding: '6px', background: '#f8fafc', borderRadius: '4px', marginTop: '4px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '4px' }}>{auntLabel} {idx + 1} Cocuklari</div>
                <Stepper label="E" value={rel.children.male} onChange={v => updateRelativeChildren(side, auntKey, idx, 'male', v)} />
                <Stepper label="K" value={rel.children.female} onChange={v => updateRelativeChildren(side, auntKey, idx, 'female', v)} />
                <Stepper label="B" value={rel.children.unknown} onChange={v => updateRelativeChildren(side, auntKey, idx, 'unknown', v)} />
                <Stepper label="Düşük" value={rel.children.pregnancyLoss || 0} onChange={v => updateRelativeChildren(side, auntKey, idx, 'pregnancyLoss', v)} />
                <Stepper label="Ölü Doğum" value={rel.children.stillbirth || 0} onChange={v => updateRelativeChildren(side, auntKey, idx, 'stillbirth', v)} />
                {totalKids >= 2 && unionId && (
                  <ChildOrderEditor
                    unionId={unionId}
                    items={cousinItems}
                    getOrder={() => getChildOrder(unionId)}
                    setOrder={(order) => setChildOrder(unionId, order)}
                    label="Çocuk Sırası"
                  />
                )}
              </div>
            );
          })}
        </div>
      </Accordion>
    );
  };

  // Proband's sibship (real ids, drawing order) for ChildOrderEditor
  const parentsUnionId = wd.parents.unionId;
  const probandItems = parentsUnionId ? childItems(pedigreeData, parentsUnionId, childIdsOf(pedigreeData, parentsUnionId), wd.proband.id) : [];
  const totalProbandSibs = probandItems.length; // includes proband

  return (
    <div className="panel wizard-panel">
      <h2 style={{ marginBottom: '12px', color: '#1e293b', fontSize: '1.1rem' }}>Klinik Pedigri</h2>

      <SelectedPersonCard
        wizardData={wd}
        pedigreeData={pedigreeData}
        selectedId={selectedId}
        selectedId2={selectedId2}
        onDeleteIndividual={deleteIndividual}
        onClearSelection={clearSelection}
      />

      <LayerHeader label="Temel Bilgiler" />
      {/* ── 1. PROBAND ── */}
      <Accordion id="proband" title="1. Proband" open={openSectionId === 'proband'} onToggle={setOpenSection}>
        <div className="form-group-row">
          <span className="form-label">Cinsiyet</span>
          <select value={wd.proband.sex} onChange={e => updateWizardData('proband', 'sex', e.target.value)} className="form-input">
            <option value="male">Erkek</option>
            <option value="female">Kadın</option>
            <option value="unknown">Bilinmiyor</option>
          </select>
        </div>
        <div className="form-group-row">
          <span className="form-label">Yaş</span>
          <input type="number" min="0" value={wd.proband.age} onChange={e => updateWizardData('proband', 'age', sanitizeAgeValue(e.target.value))} className="form-input" placeholder="..." style={{ width: '70px' }} />
        </div>
      </Accordion>

      {/* ── 2. KARDESLER ──
          v0.4.1: counts are derived from the built graph (pedigreeData), not
          from wd.siblings.*.length alone — a sibling added from the selected-
          person editor lives in wd.graphEdits, a separate mechanism the old
          length-based counters couldn't see. See deriveSiblingCounts /
          removeLastSibling for why. */}
      {(() => {
        const sc = deriveSiblingCounts(pedigreeData);
        return (
          <Accordion id="siblings" title="2. Kardeşler" summary={`${sc.male}E ${sc.female}K ${sc.unknown}B`} open={openSectionId === 'siblings'} onToggle={setOpenSection}>
            <SiblingStepper label="Erkek Kardeş" value={sc.male} onIncrement={() => addSiblingOfCategory('male')} onDecrement={() => removeLastSibling('male')} />
            {wd.siblings.male.map((s, i) => (
              <div key={s.id} className="form-group-row" style={{ paddingLeft: 14 }}>
                <span className="form-label" style={{ fontSize: '0.72rem' }}>E.K. {i + 1} Yas:</span>
                <input type="number" min="0" value={s.age} onChange={e => updateSiblingAge('male', i, sanitizeAgeValue(e.target.value))} className="form-input" style={{ width: '55px', padding: '3px' }} placeholder="..." />
              </div>
            ))}

            <SiblingStepper label="Kız Kardeş" value={sc.female} onIncrement={() => addSiblingOfCategory('female')} onDecrement={() => removeLastSibling('female')} />
            {wd.siblings.female.map((s, i) => (
              <div key={s.id} className="form-group-row" style={{ paddingLeft: 14 }}>
                <span className="form-label" style={{ fontSize: '0.72rem' }}>K.K. {i + 1} Yas:</span>
                <input type="number" min="0" value={s.age} onChange={e => updateSiblingAge('female', i, sanitizeAgeValue(e.target.value))} className="form-input" style={{ width: '55px', padding: '3px' }} placeholder="..." />
              </div>
            ))}

            <SiblingStepper label="Bilinmeyen" value={sc.unknown} onIncrement={() => addSiblingOfCategory('unknown')} onDecrement={() => removeLastSibling('unknown')} />
            {wd.siblings.unknown.map((s, i) => (
              <div key={s.id} className="form-group-row" style={{ paddingLeft: 14 }}>
                <span className="form-label" style={{ fontSize: '0.72rem' }}>B. {i + 1} Yas:</span>
                <input type="number" min="0" value={s.age} onChange={e => updateSiblingAge('unknown', i, sanitizeAgeValue(e.target.value))} className="form-input" style={{ width: '55px', padding: '3px' }} placeholder="..." />
              </div>
            ))}

            <SiblingStepper label="Düşük/Kayıp" value={sc.pregnancyLoss} onIncrement={() => addSiblingOfCategory('pregnancyLoss')} onDecrement={() => removeLastSibling('pregnancyLoss')} />
            <SiblingStepper label="Ölü Doğum" value={sc.deceased} onIncrement={() => addSiblingOfCategory('deceased')} onDecrement={() => removeLastSibling('deceased')} />

            {totalProbandSibs >= 2 && parentsUnionId && (
              <ChildOrderEditor
                unionId={parentsUnionId}
                items={probandItems}
                getOrder={() => getChildOrder(parentsUnionId)}
                setOrder={(order) => setChildOrder(parentsUnionId, order)}
                label="Kardeş Sırası"
              />
            )}
          </Accordion>
        );
      })()}

      <LayerHeader label="Ebeveynler ve Akrabalık" />
      {/* ── 3. ANNE-BABA ── */}
      <Accordion id="parents" title="3. Anne - Baba" open={openSectionId === 'parents'} onToggle={setOpenSection}>
        <label className="checkbox-label"><input type="checkbox" checked={wd.parents.motherExists} onChange={e => updateWizardData('parents', 'motherExists', e.target.checked)} /> Anne Var</label>
        {wd.parents.motherExists && (
          <div style={{ marginLeft: 16 }}>
            <div className="form-group-row"><span className="form-label">Yaş:</span><input type="number" min="0" value={wd.parents.motherAge} onChange={e => updateWizardData('parents', 'motherAge', sanitizeAgeValue(e.target.value))} className="form-input" style={{ width: '70px' }} placeholder="..." /></div>
            {renderOtherUnions('mother')}
          </div>
        )}
        <div style={{ margin: '8px 0', borderTop: '1px solid #e2e8f0' }} />
        <label className="checkbox-label"><input type="checkbox" checked={wd.parents.fatherExists} onChange={e => updateWizardData('parents', 'fatherExists', e.target.checked)} /> Baba Var</label>
        {wd.parents.fatherExists && (
          <div style={{ marginLeft: 16 }}>
            <div className="form-group-row"><span className="form-label">Yaş:</span><input type="number" min="0" value={wd.parents.fatherAge} onChange={e => updateWizardData('parents', 'fatherAge', sanitizeAgeValue(e.target.value))} className="form-input" style={{ width: '70px' }} placeholder="..." /></div>
            {renderOtherUnions('father')}
          </div>
        )}
        <div style={{ margin: '8px 0', borderTop: '1px solid #e2e8f0' }} />
        <div className="form-group-row">
          <span className="form-label">İlişki Durumu</span>
          <select value={wd.parents.relationshipStatus === 'separated' ? 'divorced' : wd.parents.relationshipStatus} onChange={e => updateWizardData('parents', 'relationshipStatus', e.target.value)} className="form-input" style={{ fontSize: '0.8rem' }}>
            <option value="together">Birlikte</option>
            <option value="divorced">Boşanmış/Ayrılmış</option>
            <option value="unknown">Bilinmiyor</option>
          </select>
        </div>
      </Accordion>

      {/* ── 4. AKRABALIK ── */}
      <Accordion id="consanguinity" title="4. Akrabalık" summary={wd.parents.consanguineous ? wd.parents.consanguinityDegree : 'Yok'} open={openSectionId === 'consanguinity'} onToggle={setOpenSection}>
        <label className="checkbox-label"><input type="checkbox" checked={wd.parents.consanguineous} onChange={e => updateWizardData('parents', 'consanguineous', e.target.checked)} /> Akraba Evliliği Var</label>

        {wd.parents.consanguineous && (
          <div style={{ marginLeft: 16, marginTop: 8 }}>
            <div className="form-group">
              <label className="form-label">Derece</label>
              <select value={wd.parents.consanguinityDegree} onChange={e => updateWizardData('parents', 'consanguinityDegree', e.target.value)} className="form-input">
                <option value="unknown">Bilinmiyor</option>
                <option value="first_cousin">1. Kuzen</option>
                <option value="second_cousin">2. Kuzen</option>
                <option value="first_cousin_once_removed">1. Kuzen - bir kez uzaklaştırılmış</option>
                <option value="second_cousin_once_removed">2. Kuzen - bir kez uzaklaştırılmış</option>
                <option value="double_first_cousin">Çift 1. kuzen</option>
                <option value="multiple_relationship">Birden fazla akrabalık hattı</option>
                <option value="other">Diğer</option>
              </select>
            </div>

            {wd.parents.consanguinityDegree === 'first_cousin' && (
              <div className="form-group" style={{ marginTop: 8 }}>
                <label className="form-label">Akrabalık Yolu</label>
                <select value={wd.parents.consanguinityPath} onChange={e => updateWizardData('parents', 'consanguinityPath', e.target.value)} className="form-input" style={{ fontSize: '0.8rem' }}>
                  <option value="unknown">Bilinmiyor</option>
                  <optgroup label="Paralel kuzen">
                    <option value="mothers_paternal_is_fathers_paternal">Dede (Anne) - Dede (Baba) kardeş</option>
                    <option value="mothers_maternal_is_fathers_maternal">Anneanne - Babaanne kardeş</option>
                  </optgroup>
                  <optgroup label="Çapraz kuzen">
                    <option value="cross_cousin_1">Anneanne - Dede (Baba) kardeş</option>
                    <option value="cross_cousin_2">Dede (Anne) - Babaanne kardeş</option>
                  </optgroup>
                </select>
                {wd.parents.consanguinityPath === 'unknown' && (
                  <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: 4 }}>* Yol bilinmediğinden üst soy bağlantısı çizilmeyecek.</div>
                )}
              </div>
            )}
          </div>
        )}
      </Accordion>

      {/* ── 4b. CUSTOM CONSANGUINITY ── */}
      <Accordion id="customConsanguinity" title="4b. Özel Akrabalık Bağları"
        summary={`${(wd.customConsanguinity || []).length} bağlantı`}
        open={openSectionId === 'customConsanguinity'} onToggle={setOpenSection}>
        <div style={{ fontSize: '0.75rem', color: '#475569', marginBottom: '8px' }}>
          Şablonda olmayan akrabalık bağlarını tanımlayın. İki birey seçip "kardeş" olarak işaretleyin — ortak ebeveyn otomatik oluşturulur.
        </div>

        {(wd.customConsanguinity || []).map((link, idx) => (
          <div key={link.id} style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '4px 6px', background: '#f8fafc', borderRadius: '4px',
            marginBottom: '4px', fontSize: '0.75rem',
          }}>
            <span style={{ flex: 1 }}>{nameOf(link.person1)} ↔ {nameOf(link.person2)}</span>
            <button onClick={() => removeCustomConsanguinity(idx)}
              style={{ padding: '1px 6px', fontSize: '0.65rem', background: '#fee2e2',
                color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '3px', cursor: 'pointer' }}>
              X
            </button>
          </div>
        ))}

        <CustomConsanguinityAdder
          individuals={pedigreeData?.individuals || []}
          onAdd={(p1, p2) => addCustomConsanguinity(p1, p2)}
          nameOf={nameOf}
        />

        {/* Union relationship background (v0.3a.2) — replaces the old
            single consanguinity checkbox with the full model: not asked /
            no consanguinity reported / consanguinity reported / same
            village-origin / unknown. See relationshipBackground.js. */}
        {pedigreeData?.unions?.length > 0 && (
          <div style={{ marginTop: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
              Birliklerin Akrabalık / İlişki Geçmişi
            </div>
            {pedigreeData.unions.map(u => (
              <div key={u.id} style={{ marginBottom: '6px' }}>
                <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{nameOf(u.partners[0])} — {nameOf(u.partners[1])}</div>
                <select
                  value={u.relationshipBackground || 'not_asked'}
                  disabled={u.id === wd.parents.unionId && wd.parents.consanguineous}
                  onChange={e => setUnionRelationshipBackground(u.id, e.target.value)}
                  className="form-input"
                  style={{ fontSize: '0.7rem', padding: '3px' }}
                >
                  {RELATIONSHIP_BACKGROUND_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </Accordion>

      <LayerHeader label="Genişletilmiş Aile" />
      {/* ── 5-6. MATERNAL / PATERNAL ── */}
      {renderRelatives('maternalRelatives', '5. Anne Tarafı', 'Dayı', 'Teyze')}
      {renderRelatives('paternalRelatives', '6. Baba Tarafı', 'Amca', 'Hala')}

      {/* ── 7-8. GRANDPARENT SIBLINGS ── */}
      {renderRelatives('maternalGPRelatives', '7. Dede/Nine Kardeşler (Anne)', 'B.Dayı', 'B.Teyze')}
      {renderRelatives('paternalGPRelatives', '8. Dede/Nine Kardeşler (Baba)', 'B.Amca', 'B.Hala')}

      {/* ── 9. GREAT-GRANDPARENTS ── */}
      <Accordion id="greatGrandparents" title="9. Üst Jenerasyon (B.Dede/B.Anne)"
        summary={Object.values(wd.greatGrandparents || {}).filter(Boolean).length > 0
          ? `${Object.values(wd.greatGrandparents || {}).filter(Boolean).length} gösteriliyor`
          : 'Yok'}
        open={openSectionId === 'greatGrandparents'} onToggle={setOpenSection}>
        <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '8px' }}>
          Her dedenin/ninenin ebeveynlerini göstermek için işaretleyin:
        </div>
        {[
          { key: 'mat_gf', label: 'Dede (Anne) Ebeveynleri' },
          { key: 'mat_gm', label: 'Anneanne Ebeveynleri' },
          { key: 'pat_gf', label: 'Dede (Baba) Ebeveynleri' },
          { key: 'pat_gm', label: 'Babaanne Ebeveynleri' },
        ].map(({ key, label }) => (
          <label key={key} className="checkbox-label" style={{ marginBottom: '4px', fontSize: '0.8rem' }}>
            <input
              type="checkbox"
              checked={!!(wd.greatGrandparents || {})[key]}
              onChange={e => toggleGreatGrandparents(key, e.target.checked)}
            />
            {label}
          </label>
        ))}
      </Accordion>

      <LayerHeader label="İleri Seçenekler" />
      {/* ── 10. GEN 4 / ILERI ── */}
      <Accordion id="gen4" title="10. İleri Akrabalar (4. Jen.)" summary={`${wd.gen4.length} kayıt`} open={openSectionId === 'gen4'} onToggle={setOpenSection}>
        {wd.gen4.map((g, idx) => {
          const unionId = g.unionId;
          const totalKids = (g.male || 0) + (g.female || 0) + (g.unknown || 0);
          const gen4Items = childItems(pedigreeData, unionId, g.childIds);

          return (
            <div key={g.id} style={{ border: '1px solid #e2e8f0', padding: '8px', borderRadius: '4px', marginBottom: '6px', background: '#f8fafc' }}>
              <div className="form-group" style={{ marginBottom: 6 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Kimin çocuğu?</label>
                <select value={g.targetPath} onChange={e => updateGen4(idx, 'targetPath', e.target.value)} disabled={totalKids > 0} className="form-input" style={{ fontSize: '0.8rem' }}>
                  <option value={wd.proband.id}>Proband</option>
                  {wd.siblings.male.map((sib, i) => <option key={sib.id} value={sib.id}>E. Kardeş {i + 1}</option>)}
                  {wd.siblings.female.map((sib, i) => <option key={sib.id} value={sib.id}>K. Kardeş {i + 1}</option>)}
                  {wd.siblings.unknown.map((sib, i) => <option key={sib.id} value={sib.id}>Kardeş {i + 1}</option>)}
                </select>
              </div>
              <Stepper label="Erkek" value={g.male} onChange={v => updateGen4(idx, 'male', v)} />
              <Stepper label="Kız" value={g.female} onChange={v => updateGen4(idx, 'female', v)} />
              <Stepper label="Bil." value={g.unknown} onChange={v => updateGen4(idx, 'unknown', v)} />
              {totalKids >= 2 && unionId && (
                <ChildOrderEditor
                  unionId={unionId}
                  items={gen4Items}
                  getOrder={() => getChildOrder(unionId)}
                  setOrder={(order) => setChildOrder(unionId, order)}
                  label="Çocuk Sırası"
                />
              )}
              <button onClick={() => removeGen4(idx)} style={{ marginTop: 6, width: '100%', padding: '3px', fontSize: '0.7rem', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '3px', cursor: 'pointer' }}>Kaldır</button>
            </div>
          );
        })}
        <button className="btn btn-primary" onClick={() => addGen4(wd.proband.id)} style={{ fontSize: '0.8rem', padding: '6px 10px', width: '100%' }}>+ 4. Kuşak Ekle</button>
      </Accordion>
    </div>
  );
}
