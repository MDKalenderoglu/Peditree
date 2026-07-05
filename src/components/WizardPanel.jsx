import { useState } from 'react';
import { usePedigreeStore, computeDeletionPlan } from '../state/usePedigreeStore';
import { ChevronDown, ChevronRight, Trash2, X } from 'lucide-react';
import ChildOrderEditor from './ChildOrderEditor';
import { sanitizeAgeValue } from '../utils/ageValidation';
import { RELATIONSHIP_BACKGROUND_OPTIONS } from '../utils/relationshipBackground';

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

  const renderIdentity = (person) => {
    if (!person) return null;
    const flags = [];
    if (person.proband) flags.push('Proband');
    if (person.affected) flags.push('Etkilenmiş');
    if (person.carrier) flags.push('Taşıyıcı');
    if (person.deceased) flags.push('Ölü');
    if (person.pregnancyLoss) flags.push('Düşük/Kayıp');
    if (person.stillbirth) flags.push('Ölü Doğum');
    return (
      <div style={{ fontSize: '0.78rem', color: '#1e293b', lineHeight: 1.5 }}>
        <strong>{person.displayLabel || person.label || person.id}</strong>
        {' '}({person.sex === 'male' ? 'Erkek' : person.sex === 'female' ? 'Kadin' : 'Bilinmiyor'}
        {typeof person.generation === 'number' ? `, jen. ${person.generation}` : ''})
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
              const parts = [`"${ind.displayLabel || ind.label || ind.id}" silinsin mi?`];
              if (plan.affectedUnionIds.length > 0) {
                parts.push(`\n\nEtkilenen birlik(ler): ${plan.affectedUnionIds.join(', ')} (tamamen kaldırılacak).`);
              }
              if (plan.affectedChildIds.length > 0) {
                parts.push(`\nEtkilenen çocuk(lar): ${plan.affectedChildIds.join(', ')} (silinmeyecek, sadece bu ebeveyn bağlantısı kaldırılacak).`);
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
function CustomConsanguinityAdder({ individuals, onAdd }) {
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
    .map(i => ({ id: i.id, label: i.displayLabel || i.label || i.id, generation: i.generation }));

  // When p1 is selected, filter p2 to same generation only
  const p1Ind = options.find(o => o.id === p1);
  const p2Options = p1
    ? options.filter(o => o.id !== p1 && o.generation === p1Ind?.generation)
    : options;

  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '6px' }}>
      <div style={{ flex: 1, minWidth: '80px' }}>
        <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Kisi 1</div>
        <select value={p1} onChange={e => { setP1(e.target.value); setP2(''); }}
          className="form-input" style={{ fontSize: '0.72rem', padding: '2px' }}>
          <option value="">Sec...</option>
          {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      <div style={{ flex: 1, minWidth: '80px' }}>
        <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Kisi 2 {p1 && p2Options.length === 0 && <span style={{color:'#ef4444'}}>(ayni jenerasyon yok)</span>}</div>
        <select value={p2} onChange={e => setP2(e.target.value)}
          className="form-input" style={{ fontSize: '0.72rem', padding: '2px' }}>
          <option value="">Sec...</option>
          {p2Options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      <button onClick={handleAdd} disabled={!p1 || !p2 || p1 === p2}
        className="btn btn-primary"
        style={{ padding: '3px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
        + Kardes Yap
      </button>
    </div>
  );
}

/* ── Reusable compact stepper ── */
const Stepper = ({ label, value, onChange, min = 0, max = 10 }) => (
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

/* ── Accordion section ── */
const Accordion = ({ title, summary, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="wizard-section">
      <div className="wizard-section-header" onClick={() => setOpen(!open)}>
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

// ── Token builders ──
// Map wizard-level child descriptions to builder-level tokens for ordering.

function buildProbandSiblingItems(wd) {
  // Build items with age metadata so we can sort to match defaultChildOrder():
  // liveborn by age descending → pregnancy losses → stillbirths.
  // This prevents the "proband jumps to first" bug: when no explicit order
  // exists, the UI display order matches the builder's default order exactly.
  const liveborn = [];
  liveborn.push({ token: 'proband', label: `Proband (${wd.proband.age || '?'})`, age: parseInt(wd.proband.age) });
  wd.siblings.male.forEach((s, i) => {
    liveborn.push({ token: `sib_m_${i}`, label: `E. Kardes ${i + 1} (${s.age || '?'})`, age: parseInt(s.age) });
  });
  wd.siblings.female.forEach((s, i) => {
    liveborn.push({ token: `sib_f_${i}`, label: `K. Kardes ${i + 1} (${s.age || '?'})`, age: parseInt(s.age) });
  });
  wd.siblings.unknown.forEach((s, i) => {
    liveborn.push({ token: `sib_u_${i}`, label: `Bil. ${i + 1} (${s.age || '?'})`, age: parseInt(s.age) });
  });

  // Sort liveborn: age descending (aged first, then unaged in insertion order)
  liveborn.sort((a, b) => {
    const hasA = !isNaN(a.age);
    const hasB = !isNaN(b.age);
    if (hasA && hasB) return b.age - a.age;
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return 1;
    return 0; // preserve insertion order for unaged
  });

  const items = liveborn.map(({ token, label }) => ({ token, label }));

  // Pregnancy losses after liveborn
  for (let i = 0; i < (wd.siblings.pregnancyLoss || 0); i++) {
    items.push({ token: `sib_loss_${i}`, label: `Dusuk ${i + 1}` });
  }
  // Stillbirths last
  for (let i = 0; i < (wd.siblings.deceased || 0); i++) {
    items.push({ token: `sib_still_${i}`, label: `Olu Dogum ${i + 1}` });
  }
  return items;
}

function buildHalfSibItems(parentType, unionIndex, childCounts) {
  const prefix = parentType === 'mother' ? 'hsib_mat' : 'hsib_pat';
  const items = [];
  for (let c = 0; c < (childCounts.male || 0); c++) {
    items.push({ token: `${prefix}_m_${unionIndex}_${c}`, label: `E ${c + 1}` });
  }
  for (let c = 0; c < (childCounts.female || 0); c++) {
    items.push({ token: `${prefix}_f_${unionIndex}_${c}`, label: `K ${c + 1}` });
  }
  for (let c = 0; c < (childCounts.unknown || 0); c++) {
    items.push({ token: `${prefix}_u_${unionIndex}_${c}`, label: `Bil. ${c + 1}` });
  }
  return items;
}

function buildCousinItems(side, role, relIndex, childCounts) {
  const relId = `${side}_${role}_${relIndex}`;
  const items = [];
  for (let c = 0; c < (childCounts.male || 0); c++) {
    items.push({ token: `${relId}_cm_${c}`, label: `E ${c + 1}` });
  }
  for (let c = 0; c < (childCounts.female || 0); c++) {
    items.push({ token: `${relId}_cf_${c}`, label: `K ${c + 1}` });
  }
  for (let c = 0; c < (childCounts.unknown || 0); c++) {
    items.push({ token: `${relId}_cu_${c}`, label: `Bil. ${c + 1}` });
  }
  for (let c = 0; c < (childCounts.pregnancyLoss || 0); c++) {
    items.push({ token: `${relId}_loss_${c}`, label: `Dusuk ${c + 1}` });
  }
  for (let c = 0; c < (childCounts.stillbirth || 0); c++) {
    items.push({ token: `${relId}_still_${c}`, label: `Olu D. ${c + 1}` });
  }
  return items;
}

function buildGen4Items(gen4Index, childCounts) {
  const items = [];
  for (let c = 0; c < (childCounts.male || 0); c++) {
    items.push({ token: `gen4_${gen4Index}_cm_${c}`, label: `E ${c + 1}` });
  }
  for (let c = 0; c < (childCounts.female || 0); c++) {
    items.push({ token: `gen4_${gen4Index}_cf_${c}`, label: `K ${c + 1}` });
  }
  for (let c = 0; c < (childCounts.unknown || 0); c++) {
    items.push({ token: `gen4_${gen4Index}_cu_${c}`, label: `Bil. ${c + 1}` });
  }
  return items;
}

export default function WizardPanel() {
  const {
    wizardData: wd,
    updateWizardData,
    updateSiblingCount, updateSiblingAge,
    updateRelativeCount, updateRelativeChildren,
    addOtherUnion, updateOtherUnion, removeOtherUnion,
    addGen4, updateGen4, removeGen4,
    getChildOrder, setChildOrder,
    toggleGreatGrandparents,
    addCustomConsanguinity, removeCustomConsanguinity,
    setUnionRelationshipBackground,
    pedigreeData,
    selectedId, selectedId2, deleteIndividual, clearSelection,
  } = usePedigreeStore();

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
          const unionId = parentType === 'mother' ? `U_MOTHER_OTHER_${idx}` : `U_FATHER_OTHER_${idx}`;
          const hSibItems = buildHalfSibItems(parentType, idx, u.children);
          const totalKids = (u.children.male || 0) + (u.children.female || 0) + (u.children.unknown || 0);

          return (
            <div key={u.id} style={{ border: '1px solid #e2e8f0', padding: '8px', borderRadius: '4px', marginBottom: '6px', background: '#fff' }}>
              <div className="form-group-row" style={{ marginBottom: '6px' }}>
                <span className="form-label" style={{ fontSize: '0.75rem' }}>Durum</span>
                <select value={u.status} onChange={e => updateOtherUnion(parentType, idx, 'status', e.target.value)} className="form-input" style={{ width: '110px', fontSize: '0.8rem' }}>
                  <option value="together">Birlikte</option>
                  <option value="separated">Ayri</option>
                  <option value="divorced">Bosanmis</option>
                  <option value="unknown">Bilinmiyor</option>
                </select>
              </div>
              <Stepper label="Erkek" value={u.children.male} onChange={v => updateOtherUnion(parentType, idx, 'male', v)} />
              <Stepper label="Kiz" value={u.children.female} onChange={v => updateOtherUnion(parentType, idx, 'female', v)} />
              <Stepper label="Bil." value={u.children.unknown} onChange={v => updateOtherUnion(parentType, idx, 'unknown', v)} />
              {totalKids >= 2 && (
                <ChildOrderEditor
                  unionId={unionId}
                  items={hSibItems}
                  getOrder={() => getChildOrder(unionId)}
                  setOrder={(order) => setChildOrder(unionId, order)}
                  label="Cocuk Sirasi"
                />
              )}
              <button onClick={() => removeOtherUnion(parentType, idx)} style={{ marginTop: '6px', width: '100%', padding: '3px', fontSize: '0.7rem', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '3px', cursor: 'pointer' }}>Kaldir</button>
            </div>
          );
        })}
      </div>
    );
  };

  /* ── Relative section (maternal or paternal, parent or GP level) ── */
  const SIDE_CONFIG = {
    maternalRelatives:   { sideKey: 'mat',    unclePrefix: 'U_MAT_UNCLE',         auntPrefix: 'U_MAT_AUNT' },
    paternalRelatives:   { sideKey: 'pat',    unclePrefix: 'U_PAT_UNCLE',         auntPrefix: 'U_PAT_AUNT' },
    maternalGPRelatives: { sideKey: 'gp_mat', unclePrefix: 'U_GP_MAT_UNCLE',     auntPrefix: 'U_GP_MAT_AUNT' },
    paternalGPRelatives: { sideKey: 'gp_pat', unclePrefix: 'U_GP_PAT_UNCLE',     auntPrefix: 'U_GP_PAT_AUNT' },
  };

  const renderRelatives = (side, title, uncleLabel, auntLabel) => {
    const config = SIDE_CONFIG[side] || { sideKey: 'mat', unclePrefix: 'U_MAT_UNCLE', auntPrefix: 'U_MAT_AUNT' };
    const { sideKey, unclePrefix: uncleUnionPrefix, auntPrefix: auntUnionPrefix } = config;
    const uncleKey = 'uncles';
    const auntKey = 'aunts';
    const relatives = wd[side] || { uncles: [], aunts: [] };
    const uncles = relatives[uncleKey] || [];
    const aunts = relatives[auntKey] || [];
    const summary = `${uncles.length} ${uncleLabel}, ${aunts.length} ${auntLabel}`;

    return (
      <Accordion title={title} summary={summary}>
        <Stepper label={`${uncleLabel} Sayisi`} value={uncles.length} onChange={v => updateRelativeCount(side, uncleKey, v)} max={4} />
        {uncles.map((rel, idx) => {
          const unionId = `${uncleUnionPrefix}_${idx}`;
          const cousinItems = buildCousinItems(sideKey, 'uncle', idx, rel.children);
          const totalKids = (rel.children.male || 0) + (rel.children.female || 0) +
            (rel.children.unknown || 0) + (rel.children.pregnancyLoss || 0) + (rel.children.stillbirth || 0);

          return (
            <div key={rel.id} style={{ padding: '6px', background: '#f8fafc', borderRadius: '4px', marginTop: '4px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '4px' }}>{uncleLabel} {idx + 1} Cocuklari</div>
              <Stepper label="E" value={rel.children.male} onChange={v => updateRelativeChildren(side, uncleKey, idx, 'male', v)} max={6} />
              <Stepper label="K" value={rel.children.female} onChange={v => updateRelativeChildren(side, uncleKey, idx, 'female', v)} max={6} />
              <Stepper label="B" value={rel.children.unknown} onChange={v => updateRelativeChildren(side, uncleKey, idx, 'unknown', v)} max={6} />
              <Stepper label="Dusuk" value={rel.children.pregnancyLoss || 0} onChange={v => updateRelativeChildren(side, uncleKey, idx, 'pregnancyLoss', v)} max={6} />
              <Stepper label="Olu Dogum" value={rel.children.stillbirth || 0} onChange={v => updateRelativeChildren(side, uncleKey, idx, 'stillbirth', v)} max={6} />
              {totalKids >= 2 && (
                <ChildOrderEditor
                  unionId={unionId}
                  items={cousinItems}
                  getOrder={() => getChildOrder(unionId)}
                  setOrder={(order) => setChildOrder(unionId, order)}
                  label="Cocuk Sirasi"
                />
              )}
            </div>
          );
        })}

        <div style={{ marginTop: '10px' }}>
          <Stepper label={`${auntLabel} Sayisi`} value={aunts.length} onChange={v => updateRelativeCount(side, auntKey, v)} max={4} />
          {aunts.map((rel, idx) => {
            const unionId = `${auntUnionPrefix}_${idx}`;
            const cousinItems = buildCousinItems(sideKey, 'aunt', idx, rel.children);
            const totalKids = (rel.children.male || 0) + (rel.children.female || 0) +
              (rel.children.unknown || 0) + (rel.children.pregnancyLoss || 0) + (rel.children.stillbirth || 0);

            return (
              <div key={rel.id} style={{ padding: '6px', background: '#f8fafc', borderRadius: '4px', marginTop: '4px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '4px' }}>{auntLabel} {idx + 1} Cocuklari</div>
                <Stepper label="E" value={rel.children.male} onChange={v => updateRelativeChildren(side, auntKey, idx, 'male', v)} max={6} />
                <Stepper label="K" value={rel.children.female} onChange={v => updateRelativeChildren(side, auntKey, idx, 'female', v)} max={6} />
                <Stepper label="B" value={rel.children.unknown} onChange={v => updateRelativeChildren(side, auntKey, idx, 'unknown', v)} max={6} />
                <Stepper label="Dusuk" value={rel.children.pregnancyLoss || 0} onChange={v => updateRelativeChildren(side, auntKey, idx, 'pregnancyLoss', v)} max={6} />
                <Stepper label="Olu Dogum" value={rel.children.stillbirth || 0} onChange={v => updateRelativeChildren(side, auntKey, idx, 'stillbirth', v)} max={6} />
                {totalKids >= 2 && (
                  <ChildOrderEditor
                    unionId={unionId}
                    items={cousinItems}
                    getOrder={() => getChildOrder(unionId)}
                    setOrder={(order) => setChildOrder(unionId, order)}
                    label="Cocuk Sirasi"
                  />
                )}
              </div>
            );
          })}
        </div>
      </Accordion>
    );
  };

  // Build proband sibling items for ChildOrderEditor
  const probandItems = buildProbandSiblingItems(wd);
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
      <Accordion title="1. Proband" defaultOpen>
        <div className="form-group-row">
          <span className="form-label">Cinsiyet</span>
          <select value={wd.proband.sex} onChange={e => updateWizardData('proband', 'sex', e.target.value)} className="form-input">
            <option value="male">Erkek</option>
            <option value="female">Kadin</option>
            <option value="unknown">Bilinmiyor</option>
          </select>
        </div>
        <div className="form-group-row">
          <span className="form-label">Yas</span>
          <input type="number" min="0" value={wd.proband.age} onChange={e => updateWizardData('proband', 'age', sanitizeAgeValue(e.target.value))} className="form-input" placeholder="..." style={{ width: '70px' }} />
        </div>
      </Accordion>

      {/* ── 2. KARDESLER ── */}
      <Accordion title="2. Kardesler" summary={`${wd.siblings.male.length}E ${wd.siblings.female.length}K ${wd.siblings.unknown.length}B`} defaultOpen>
        <Stepper label="Erkek Kardes" value={wd.siblings.male.length} onChange={v => updateSiblingCount('male', v)} />
        {wd.siblings.male.map((s, i) => (
          <div key={s.id} className="form-group-row" style={{ paddingLeft: 14 }}>
            <span className="form-label" style={{ fontSize: '0.72rem' }}>E.K. {i + 1} Yas:</span>
            <input type="number" min="0" value={s.age} onChange={e => updateSiblingAge('male', i, sanitizeAgeValue(e.target.value))} className="form-input" style={{ width: '55px', padding: '3px' }} placeholder="..." />
          </div>
        ))}

        <Stepper label="Kiz Kardes" value={wd.siblings.female.length} onChange={v => updateSiblingCount('female', v)} />
        {wd.siblings.female.map((s, i) => (
          <div key={s.id} className="form-group-row" style={{ paddingLeft: 14 }}>
            <span className="form-label" style={{ fontSize: '0.72rem' }}>K.K. {i + 1} Yas:</span>
            <input type="number" min="0" value={s.age} onChange={e => updateSiblingAge('female', i, sanitizeAgeValue(e.target.value))} className="form-input" style={{ width: '55px', padding: '3px' }} placeholder="..." />
          </div>
        ))}

        <Stepper label="Bilinmeyen" value={wd.siblings.unknown.length} onChange={v => updateSiblingCount('unknown', v)} />
        {wd.siblings.unknown.map((s, i) => (
          <div key={s.id} className="form-group-row" style={{ paddingLeft: 14 }}>
            <span className="form-label" style={{ fontSize: '0.72rem' }}>B. {i + 1} Yas:</span>
            <input type="number" min="0" value={s.age} onChange={e => updateSiblingAge('unknown', i, sanitizeAgeValue(e.target.value))} className="form-input" style={{ width: '55px', padding: '3px' }} placeholder="..." />
          </div>
        ))}

        <Stepper label="Dusuk/Kayip" value={wd.siblings.pregnancyLoss} onChange={v => updateWizardData('siblings', 'pregnancyLoss', v)} />
        <Stepper label="Olu Dogum" value={wd.siblings.deceased} onChange={v => updateWizardData('siblings', 'deceased', v)} />

        {totalProbandSibs >= 2 && (
          <ChildOrderEditor
            unionId="U_PARENTS"
            items={probandItems}
            getOrder={() => getChildOrder('U_PARENTS')}
            setOrder={(order) => setChildOrder('U_PARENTS', order)}
            label="Kardes Sirasi"
          />
        )}
      </Accordion>

      <LayerHeader label="Ebeveynler ve Akrabalık" />
      {/* ── 3. ANNE-BABA ── */}
      <Accordion title="3. Anne - Baba">
        <label className="checkbox-label"><input type="checkbox" checked={wd.parents.motherExists} onChange={e => updateWizardData('parents', 'motherExists', e.target.checked)} /> Anne Var</label>
        {wd.parents.motherExists && (
          <div style={{ marginLeft: 16 }}>
            <div className="form-group-row"><span className="form-label">Yas:</span><input type="number" min="0" value={wd.parents.motherAge} onChange={e => updateWizardData('parents', 'motherAge', sanitizeAgeValue(e.target.value))} className="form-input" style={{ width: '70px' }} placeholder="..." /></div>
            {renderOtherUnions('mother')}
          </div>
        )}
        <div style={{ margin: '8px 0', borderTop: '1px solid #e2e8f0' }} />
        <label className="checkbox-label"><input type="checkbox" checked={wd.parents.fatherExists} onChange={e => updateWizardData('parents', 'fatherExists', e.target.checked)} /> Baba Var</label>
        {wd.parents.fatherExists && (
          <div style={{ marginLeft: 16 }}>
            <div className="form-group-row"><span className="form-label">Yas:</span><input type="number" min="0" value={wd.parents.fatherAge} onChange={e => updateWizardData('parents', 'fatherAge', sanitizeAgeValue(e.target.value))} className="form-input" style={{ width: '70px' }} placeholder="..." /></div>
            {renderOtherUnions('father')}
          </div>
        )}
        <div style={{ margin: '8px 0', borderTop: '1px solid #e2e8f0' }} />
        <div className="form-group-row">
          <span className="form-label">Iliski Durumu</span>
          <select value={wd.parents.relationshipStatus} onChange={e => updateWizardData('parents', 'relationshipStatus', e.target.value)} className="form-input" style={{ fontSize: '0.8rem' }}>
            <option value="together">Birlikte</option>
            <option value="separated">Ayri</option>
            <option value="divorced">Bosanmis</option>
            <option value="unknown">Bilinmiyor</option>
          </select>
        </div>
      </Accordion>

      {/* ── 4. AKRABALIK ── */}
      <Accordion title="4. Akrabalik" summary={wd.parents.consanguineous ? wd.parents.consanguinityDegree : 'Yok'}>
        <label className="checkbox-label"><input type="checkbox" checked={wd.parents.consanguineous} onChange={e => updateWizardData('parents', 'consanguineous', e.target.checked)} /> Akraba Evliligi Var</label>

        {wd.parents.consanguineous && (
          <div style={{ marginLeft: 16, marginTop: 8 }}>
            <div className="form-group">
              <label className="form-label">Derece</label>
              <select value={wd.parents.consanguinityDegree} onChange={e => updateWizardData('parents', 'consanguinityDegree', e.target.value)} className="form-input">
                <option value="unknown">Bilinmiyor</option>
                <option value="first_cousin">1. Kuzen</option>
                <option value="second_cousin">2. Kuzen</option>
                <option value="first_cousin_once_removed">1. Kuzen - bir kez uzaklastirilmis</option>
                <option value="second_cousin_once_removed">2. Kuzen - bir kez uzaklastirilmis</option>
                <option value="double_first_cousin">Cift 1. kuzen</option>
                <option value="multiple_relationship">Birden fazla akrabalik hatti</option>
                <option value="other">Diger</option>
              </select>
            </div>

            {wd.parents.consanguinityDegree === 'first_cousin' && (
              <div className="form-group" style={{ marginTop: 8 }}>
                <label className="form-label">Akrabalik Yolu</label>
                <select value={wd.parents.consanguinityPath} onChange={e => updateWizardData('parents', 'consanguinityPath', e.target.value)} className="form-input" style={{ fontSize: '0.8rem' }}>
                  <option value="unknown">Bilinmiyor</option>
                  <optgroup label="Parallel Cousin">
                    <option value="mothers_paternal_is_fathers_paternal">Dede (Anne) - Dede (Baba) kardes</option>
                    <option value="mothers_maternal_is_fathers_maternal">Anneanne - Babaanne kardes</option>
                  </optgroup>
                  <optgroup label="Cross Cousin">
                    <option value="cross_cousin_1">Anneanne - Dede (Baba) kardes</option>
                    <option value="cross_cousin_2">Dede (Anne) - Babaanne kardes</option>
                  </optgroup>
                </select>
                {wd.parents.consanguinityPath === 'unknown' && (
                  <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: 4 }}>* Yol bilinmediginden ust soy baglantisi cizilmeyecek.</div>
                )}
              </div>
            )}
          </div>
        )}
      </Accordion>

      {/* ── 4b. CUSTOM CONSANGUINITY ── */}
      <Accordion title="4b. Ozel Akrabalik Baglari"
        summary={`${(wd.customConsanguinity || []).length} baglanti`}>
        <div style={{ fontSize: '0.75rem', color: '#475569', marginBottom: '8px' }}>
          Sablonda olmayan akrabalik baglarini tanimlayin. Iki birey secip "kardes" olarak isaretleyin — ortak ebeveyn otomatik olusturulur.
        </div>

        {(wd.customConsanguinity || []).map((link, idx) => (
          <div key={link.id} style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '4px 6px', background: '#f8fafc', borderRadius: '4px',
            marginBottom: '4px', fontSize: '0.75rem',
          }}>
            <span style={{ flex: 1 }}>{link.person1} ↔ {link.person2}</span>
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
                <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{u.id} ({u.partners.join(' + ')})</div>
                <select
                  value={u.relationshipBackground || 'not_asked'}
                  disabled={u.id === 'U_PARENTS' && wd.parents.consanguineous}
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
      {renderRelatives('maternalRelatives', '5. Anne Tarafi', 'Dayi', 'Teyze')}
      {renderRelatives('paternalRelatives', '6. Baba Tarafi', 'Amca', 'Hala')}

      {/* ── 7-8. GRANDPARENT SIBLINGS ── */}
      {renderRelatives('maternalGPRelatives', '7. Dede/Nine Kardesler (Anne)', 'B.Dayi', 'B.Teyze')}
      {renderRelatives('paternalGPRelatives', '8. Dede/Nine Kardesler (Baba)', 'B.Amca', 'B.Hala')}

      {/* ── 9. GREAT-GRANDPARENTS ── */}
      <Accordion title="9. Ust Jenerasyon (B.Dede/B.Anne)"
        summary={Object.values(wd.greatGrandparents || {}).filter(Boolean).length > 0
          ? `${Object.values(wd.greatGrandparents || {}).filter(Boolean).length} gosteriliyor`
          : 'Yok'}>
        <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '8px' }}>
          Her dedenin/ninenin ebeveynlerini gostermek icin isaretleyin:
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
      <Accordion title="10. Ileri Akrabalar (4. Jen.)" summary={`${wd.gen4.length} kayit`}>
        {wd.gen4.map((g, idx) => {
          const unionId = `U_GEN4_${idx}`;
          const totalKids = (g.male || 0) + (g.female || 0) + (g.unknown || 0);
          const gen4Items = buildGen4Items(idx, g);

          return (
            <div key={g.id} style={{ border: '1px solid #e2e8f0', padding: '8px', borderRadius: '4px', marginBottom: '6px', background: '#f8fafc' }}>
              <div className="form-group" style={{ marginBottom: 6 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Kimin cocugu?</label>
                <select value={g.targetPath} onChange={e => updateGen4(idx, 'targetPath', e.target.value)} className="form-input" style={{ fontSize: '0.8rem' }}>
                  <option value="proband">Proband</option>
                  {wd.siblings.male.map((_, i) => <option key={`sm${i}`} value={`sib_m_${i}`}>E. Kardes {i + 1}</option>)}
                  {wd.siblings.female.map((_, i) => <option key={`sf${i}`} value={`sib_f_${i}`}>K. Kardes {i + 1}</option>)}
                </select>
              </div>
              <Stepper label="Erkek" value={g.male} onChange={v => updateGen4(idx, 'male', v)} />
              <Stepper label="Kiz" value={g.female} onChange={v => updateGen4(idx, 'female', v)} />
              <Stepper label="Bil." value={g.unknown} onChange={v => updateGen4(idx, 'unknown', v)} />
              {totalKids >= 2 && (
                <ChildOrderEditor
                  unionId={unionId}
                  items={gen4Items}
                  getOrder={() => getChildOrder(unionId)}
                  setOrder={(order) => setChildOrder(unionId, order)}
                  label="Cocuk Sirasi"
                />
              )}
              <button onClick={() => removeGen4(idx)} style={{ marginTop: 6, width: '100%', padding: '3px', fontSize: '0.7rem', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '3px', cursor: 'pointer' }}>Kaldir</button>
            </div>
          );
        })}
        <button className="btn btn-primary" onClick={() => addGen4('proband')} style={{ fontSize: '0.8rem', padding: '6px 10px', width: '100%' }}>+ Jenerasyon 4 Ekle</button>
      </Accordion>
    </div>
  );
}
