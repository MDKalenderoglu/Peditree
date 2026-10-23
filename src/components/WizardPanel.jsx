/**
 * WizardPanel.jsx — left panel: build the family by counts (the wizard is an
 * input adapter over the graph; every control calls the same store
 * operations as before). Redesign 2026-10-23: four groups instead of ten
 * numbered boxes, compact counters, plain Turkish, no internal ids. Editing
 * or deleting one person happens in the right panel.
 */
import { useState } from 'react';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { ChevronRight, User, Users, Heart, GitFork, Network, Link2, Layers, Baby } from 'lucide-react';
import ChildOrderEditor from './ChildOrderEditor';
import { sanitizeAgeValue } from '../utils/ageValidation';
import { RELATIONSHIP_BACKGROUND_OPTIONS } from '../utils/relationshipBackground';
import { computePedigreeIds } from '../utils/pedigreeNumbering';
import { deriveSiblingCounts } from '../utils/siblingCounts';

/* ── building blocks ── */

/** −  n  +  (no upper limit) */
function Counter({ value, onMinus, onPlus, label }) {
  return (
    <div className="counter" role="group" aria-label={label}>
      <button onClick={onMinus} disabled={value <= 0} aria-label={`${label} azalt`}>−</button>
      <span className="counter-val">{value}</span>
      <button onClick={onPlus} aria-label={`${label} artır`}>+</button>
    </div>
  );
}

/** A labelled counter whose value is set absolutely (onChange(n)). */
function Count({ label, value, onChange }) {
  return (
    <div className="count">
      <span className="count-label">{label}</span>
      <Counter label={label} value={value} onMinus={() => onChange(Math.max(0, value - 1))} onPlus={() => onChange(value + 1)} />
    </div>
  );
}

function Section({ id, icon: Icon, title, summary, openId, onToggle, children }) {
  const open = openId === id;
  return (
    <div className={`sec${open ? ' open' : ''}`}>
      <button className="sec-head" onClick={() => onToggle(open ? null : id)} aria-expanded={open}>
        <span className="sec-icon"><Icon size={15} /></span>
        <span className="sec-title">{title}</span>
        {summary && <span className="sec-summary">{summary}</span>}
        <ChevronRight size={15} className="sec-chevron" />
      </button>
      {open && <div className="sec-body">{children}</div>}
    </div>
  );
}

function AgeField({ label, value, onChange }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input type="number" min="0" className="input input-age" value={value ?? ''} placeholder="—"
        onChange={e => onChange(sanitizeAgeValue(e.target.value))} />
    </label>
  );
}

function SexSwitch({ value, onChange }) {
  const opts = [['male', 'Erkek'], ['female', 'Kadın'], ['unknown', 'Bilinmiyor']];
  return (
    <div className="segmented" role="radiogroup" aria-label="Cinsiyet">
      {opts.map(([v, t]) => (
        <button key={v} className={value === v ? 'on' : undefined} onClick={() => onChange(v)} role="radio" aria-checked={value === v}>{t}</button>
      ))}
    </div>
  );
}

const STATUS_OPTIONS = [['together', 'Birlikte'], ['divorced', 'Boşanmış/Ayrılmış'], ['unknown', 'Bilinmiyor']];
// an older 'separated' value is shown as the combined option
const shownStatus = (s) => (s === 'separated' ? 'divorced' : s);

// ── child-order items (real child ids, drawing order) ──
function childItems(pedigreeData, unionId, childIds, anchorId) {
  const byId = new Map((pedigreeData.individuals || []).map(i => [i.id, i]));
  const counters = {};
  const tag = (p) => {
    if (p.id === anchorId) return 'Proband';
    if (p.pregnancyLoss) return 'Düşük';
    if (p.stillbirth) return 'Ölü doğum';
    return p.sex === 'male' ? 'Erkek' : p.sex === 'female' ? 'Kız' : 'Bilinmeyen';
  };
  return (childIds || []).map(id => byId.get(id)).filter(Boolean).map(p => {
    const t = tag(p);
    counters[t] = (counters[t] || 0) + 1;
    const n = t === 'Proband' ? '' : ` ${counters[t]}`;
    return { token: p.id, label: `${t}${n}${p.age ? ` · ${p.age} yaş` : ''}` };
  });
}

const childIdsOf = (pedigreeData, unionId) =>
  ((pedigreeData.parentChildRelationships || []).find(r => r.unionId === unionId) || {}).children || [];

const KIDS = [['male', 'Erkek'], ['female', 'Kız'], ['unknown', 'Bilinmeyen'], ['pregnancyLoss', 'Düşük'], ['stillbirth', 'Ölü doğum']];
const kidTotal = (c) => KIDS.reduce((n, [k]) => n + (c[k] || 0), 0);
const kidSummary = (c) => {
  const parts = [];
  if (c.male) parts.push(`${c.male}E`);
  if (c.female) parts.push(`${c.female}K`);
  if (c.unknown) parts.push(`${c.unknown}B`);
  const loss = (c.pregnancyLoss || 0) + (c.stillbirth || 0) + (c.deceased || 0);
  if (loss) parts.push(`${loss} kayıp`);
  return parts.join(' · ');
};

/* ── custom sibling link (two people → siblings) ── */
function SiblingLinker({ individuals, onAdd, nameOf }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const ids = individuals.map(i => i.id);
  if (p1 && !ids.includes(p1)) setP1('');
  if (p2 && !ids.includes(p2)) setP2('');
  const options = individuals
    .filter(i => !i.pregnancyLoss && !i.stillbirth && !i.proband)
    .map(i => ({ id: i.id, label: nameOf(i.id), generation: i.generation }));
  const g1 = options.find(o => o.id === p1)?.generation;
  const p2Options = p1 ? options.filter(o => o.id !== p1 && o.generation === g1) : options;
  return (
    <div className="field-col">
      <div className="field-hint">Şablonda olmayan bir kardeşlik: iki kişiyi seçin, ortak ebeveynleri otomatik oluşturulur.</div>
      <select className="select input-wide" value={p1} onChange={e => { setP1(e.target.value); setP2(''); }} aria-label="Birinci kişi">
        <option value="">Birinci kişi…</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <select className="select input-wide" value={p2} onChange={e => setP2(e.target.value)} aria-label="İkinci kişi">
        <option value="">{p1 && p2Options.length === 0 ? 'Aynı kuşakta kimse yok' : 'İkinci kişi…'}</option>
        {p2Options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <button className="ui-btn ui-btn-sm" disabled={!p1 || !p2 || p1 === p2}
        onClick={() => { onAdd(p1, p2); setP1(''); setP2(''); }}>Kardeş yap</button>
    </div>
  );
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
    openSectionId, setOpenSection,
  } = usePedigreeStore();

  const pids = computePedigreeIds(pedigreeData.nodes || []);
  const nameOf = (id) => {
    const p = (pedigreeData.individuals || []).find(i => i.id === id);
    const pid = pids.get(id)?.displayId;
    const label = p?.displayLabel || p?.label;
    return pid ? (label ? `${pid} · ${label}` : pid) : (label || 'birey');
  };
  const sec = { openId: openSectionId, onToggle: setOpenSection };

  /* extra partners of a parent */
  const otherUnions = (parentType) => {
    const list = wd.parents[parentType === 'mother' ? 'motherOtherUnions' : 'fatherOtherUnions'];
    return (
      <>
        {list.map((u, idx) => (
          <div className="sub" key={u.id}>
            <div className="sub-head">
              <span>{parentType === 'mother' ? 'Annenin' : 'Babanın'} diğer eşi {list.length > 1 ? idx + 1 : ''}</span>
              <button className="ui-btn ui-btn-sm ui-btn-ghost" onClick={() => removeOtherUnion(parentType, idx)}>Kaldır</button>
            </div>
            <label className="field-col">
              <span className="field-label">İlişki</span>
              <select className="select input-wide" value={shownStatus(u.status)} onChange={e => updateOtherUnion(parentType, idx, 'status', e.target.value)}>
                {STATUS_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
            <div className="counts">
              {KIDS.map(([k, t]) => <Count key={k} label={t} value={u.children[k] || 0} onChange={v => updateOtherUnion(parentType, idx, k, v)} />)}
            </div>
            {kidTotal(u.children) >= 2 && u.unionId && (
              <ChildOrderEditor items={childItems(pedigreeData, u.unionId, u.childIds)} getOrder={() => getChildOrder(u.unionId)}
                setOrder={(order) => setChildOrder(u.unionId, order)} label="Çocukların sırası" />
            )}
          </div>
        ))}
        <button className="ui-btn ui-btn-sm" onClick={() => addOtherUnion(parentType)}>
          + {parentType === 'mother' ? 'Annenin' : 'Babanın'} başka bir eşi
        </button>
      </>
    );
  };

  /* uncles / aunts of one side (or of a grandparent) */
  const relatives = (id, icon, title, side, uncleLabel, auntLabel) => {
    const rel = wd[side] || { uncles: [], aunts: [] };
    const uncles = rel.uncles || [], aunts = rel.aunts || [];
    const summary = [uncles.length && `${uncles.length} ${uncleLabel}`, aunts.length && `${aunts.length} ${auntLabel}`].filter(Boolean).join(' · ') || 'yok';
    const people = (type, label) => (rel[type] || []).map((r, idx) => (
      <div className="sub" key={r.id}>
        <div className="sub-head">
          <span>{label} {idx + 1} — çocukları</span>
          <span className="muted small">{kidSummary(r.children)}</span>
        </div>
        <div className="counts">
          {KIDS.map(([k, t]) => <Count key={k} label={t} value={r.children[k] || 0} onChange={v => updateRelativeChildren(side, type, idx, k, v)} />)}
        </div>
        {kidTotal(r.children) >= 2 && r.unionId && (
          <ChildOrderEditor items={childItems(pedigreeData, r.unionId, r.childIds)} getOrder={() => getChildOrder(r.unionId)}
            setOrder={(order) => setChildOrder(r.unionId, order)} label="Çocukların sırası" />
        )}
      </div>
    ));
    return (
      <Section id={id} icon={icon} title={title} summary={summary} {...sec}>
        <div className="counts">
          <Count label={uncleLabel} value={uncles.length} onChange={v => updateRelativeCount(side, 'uncles', v)} />
          <Count label={auntLabel} value={aunts.length} onChange={v => updateRelativeCount(side, 'aunts', v)} />
        </div>
        {people('uncles', uncleLabel)}
        {people('aunts', auntLabel)}
      </Section>
    );
  };

  // proband's sibship
  const sc = deriveSiblingCounts(pedigreeData);
  const parentsUnionId = wd.parents.unionId;
  const probandItems = parentsUnionId ? childItems(pedigreeData, parentsUnionId, childIdsOf(pedigreeData, parentsUnionId), wd.proband.id) : [];
  const sibSummary = kidSummary({ male: sc.male, female: sc.female, unknown: sc.unknown, pregnancyLoss: sc.pregnancyLoss, deceased: sc.deceased }) || 'yok';
  const sibAges = [
    ...wd.siblings.male.map((s, i) => ['male', i, `Erkek kardeş ${i + 1}`, s]),
    ...wd.siblings.female.map((s, i) => ['female', i, `Kız kardeş ${i + 1}`, s]),
    ...wd.siblings.unknown.map((s, i) => ['unknown', i, `Kardeş ${i + 1}`, s]),
  ];
  const sexWord = { male: 'erkek', female: 'kadın', unknown: 'cinsiyet bilinmiyor' }[wd.proband.sex];
  const ggCount = Object.values(wd.greatGrandparents || {}).filter(Boolean).length;
  const consSummary = wd.parents.consanguineous
    ? ({ first_cousin: '1. kuzen', second_cousin: '2. kuzen', unknown: 'derece bilinmiyor' }[wd.parents.consanguinityDegree] || 'var')
    : 'yok';

  return (
    <aside className="side side-left wizard-panel">
      <div className="side-header">
        <div className="brand">
          <span className="brand-name">Peditree</span>
          <span className="brand-sub">Klinik pedigri</span>
        </div>
      </div>

      <div className="side-body">
        <div className="group-label">Çekirdek aile</div>

        <Section id="proband" icon={User} title="Proband" summary={`${sexWord}${wd.proband.age ? `, ${wd.proband.age} yaş` : ''}`} {...sec}>
          <div className="field-col">
            <span className="field-label">Cinsiyet</span>
            <SexSwitch value={wd.proband.sex} onChange={v => updateWizardData('proband', 'sex', v)} />
          </div>
          <AgeField label="Yaş" value={wd.proband.age} onChange={v => updateWizardData('proband', 'age', v)} />
        </Section>

        <Section id="siblings" icon={Users} title="Kardeşler" summary={sibSummary} {...sec}>
          <div className="counts">
            <div className="count"><span className="count-label">Erkek</span>
              <Counter label="Erkek kardeş" value={sc.male} onMinus={() => removeLastSibling('male')} onPlus={() => addSiblingOfCategory('male')} /></div>
            <div className="count"><span className="count-label">Kız</span>
              <Counter label="Kız kardeş" value={sc.female} onMinus={() => removeLastSibling('female')} onPlus={() => addSiblingOfCategory('female')} /></div>
            <div className="count"><span className="count-label">Bilinmeyen</span>
              <Counter label="Cinsiyeti bilinmeyen kardeş" value={sc.unknown} onMinus={() => removeLastSibling('unknown')} onPlus={() => addSiblingOfCategory('unknown')} /></div>
            <div className="count"><span className="count-label">Düşük</span>
              <Counter label="Düşük" value={sc.pregnancyLoss} onMinus={() => removeLastSibling('pregnancyLoss')} onPlus={() => addSiblingOfCategory('pregnancyLoss')} /></div>
            <div className="count"><span className="count-label">Ölü doğum</span>
              <Counter label="Ölü doğum" value={sc.deceased} onMinus={() => removeLastSibling('deceased')} onPlus={() => addSiblingOfCategory('deceased')} /></div>
          </div>
          {sibAges.length > 0 && (
            <div className="field-col">
              <div className="order-title">Yaşlar</div>
              {sibAges.map(([type, i, label, s]) => (
                <AgeField key={s.id} label={label} value={s.age} onChange={v => updateSiblingAge(type, i, v)} />
              ))}
            </div>
          )}
          {probandItems.length >= 2 && parentsUnionId && (
            <ChildOrderEditor items={probandItems} getOrder={() => getChildOrder(parentsUnionId)}
              setOrder={(order) => setChildOrder(parentsUnionId, order)} label="Doğum sırası" />
          )}
        </Section>

        <Section id="parents" icon={Heart} title="Anne ve baba"
          summary={[wd.parents.motherExists && 'anne', wd.parents.fatherExists && 'baba'].filter(Boolean).join(' · ') || 'yok'} {...sec}>
          <label className="check"><input type="checkbox" checked={wd.parents.motherExists}
            onChange={e => updateWizardData('parents', 'motherExists', e.target.checked)} /> Anne çizilsin</label>
          {wd.parents.motherExists && (
            <>
              <AgeField label="Annenin yaşı" value={wd.parents.motherAge} onChange={v => updateWizardData('parents', 'motherAge', v)} />
              {otherUnions('mother')}
            </>
          )}
          <div className="divider" />
          <label className="check"><input type="checkbox" checked={wd.parents.fatherExists}
            onChange={e => updateWizardData('parents', 'fatherExists', e.target.checked)} /> Baba çizilsin</label>
          {wd.parents.fatherExists && (
            <>
              <AgeField label="Babanın yaşı" value={wd.parents.fatherAge} onChange={v => updateWizardData('parents', 'fatherAge', v)} />
              {otherUnions('father')}
            </>
          )}
          <div className="divider" />
          <label className="field-col">
            <span className="field-label">Anne-baba ilişkisi</span>
            <select className="select input-wide" value={shownStatus(wd.parents.relationshipStatus)} onChange={e => updateWizardData('parents', 'relationshipStatus', e.target.value)}>
              {STATUS_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </label>
        </Section>

        <div className="group-label">Akrabalar</div>
        {relatives('maternalRelatives', GitFork, 'Anne tarafı', 'maternalRelatives', 'Dayı', 'Teyze')}
        {relatives('paternalRelatives', GitFork, 'Baba tarafı', 'paternalRelatives', 'Amca', 'Hala')}
        {relatives('maternalGPRelatives', Network, 'Anneanne / dede kardeşleri', 'maternalGPRelatives', 'Büyük dayı', 'Büyük teyze')}
        {relatives('paternalGPRelatives', Network, 'Babaanne / dede kardeşleri', 'paternalGPRelatives', 'Büyük amca', 'Büyük hala')}
        <Section id="greatGrandparents" icon={Layers} title="Büyük dede ve nineler" summary={ggCount ? `${ggCount} çift` : 'yok'} {...sec}>
          <div className="field-hint">Ebeveynleri çizilecek büyükanne / büyükbabayı seçin.</div>
          {[
            ['mat_gf', 'Anne tarafı dedenin ebeveynleri'],
            ['mat_gm', 'Anneannenin ebeveynleri'],
            ['pat_gf', 'Baba tarafı dedenin ebeveynleri'],
            ['pat_gm', 'Babaannenin ebeveynleri'],
          ].map(([key, label]) => (
            <label className="check" key={key}>
              <input type="checkbox" checked={!!(wd.greatGrandparents || {})[key]} onChange={e => toggleGreatGrandparents(key, e.target.checked)} />
              {label}
            </label>
          ))}
        </Section>

        <div className="group-label">Akrabalık</div>
        <Section id="consanguinity" icon={Link2} title="Akraba evliliği (anne-baba)" summary={consSummary} {...sec}>
          <label className="check"><input type="checkbox" checked={wd.parents.consanguineous}
            onChange={e => updateWizardData('parents', 'consanguineous', e.target.checked)} /> Anne ve baba akraba</label>
          {wd.parents.consanguineous && (
            <>
              <label className="field-col">
                <span className="field-label">Derece</span>
                <select className="select input-wide" value={wd.parents.consanguinityDegree} onChange={e => updateWizardData('parents', 'consanguinityDegree', e.target.value)}>
                  <option value="unknown">Bilinmiyor</option>
                  <option value="first_cousin">1. derece kuzen</option>
                  <option value="second_cousin">2. derece kuzen</option>
                  <option value="first_cousin_once_removed">1. kuzenin çocuğu (bir kuşak fark)</option>
                  <option value="second_cousin_once_removed">2. kuzenin çocuğu (bir kuşak fark)</option>
                  <option value="double_first_cousin">Çift 1. derece kuzen</option>
                  <option value="multiple_relationship">Birden fazla akrabalık yolu</option>
                  <option value="other">Diğer</option>
                </select>
              </label>
              {wd.parents.consanguinityDegree === 'first_cousin' && (
                <label className="field-col">
                  <span className="field-label">Ortak atalar kimin üzerinden?</span>
                  <select className="select input-wide" value={wd.parents.consanguinityPath} onChange={e => updateWizardData('parents', 'consanguinityPath', e.target.value)}>
                    <option value="unknown">Bilinmiyor</option>
                    <option value="mothers_paternal_is_fathers_paternal">Annenin babası ile babanın babası kardeş</option>
                    <option value="mothers_maternal_is_fathers_maternal">Annenin annesi ile babanın annesi kardeş</option>
                    <option value="cross_cousin_1">Annenin annesi ile babanın babası kardeş</option>
                    <option value="cross_cousin_2">Annenin babası ile babanın annesi kardeş</option>
                  </select>
                </label>
              )}
              {(wd.parents.consanguinityDegree === 'unknown' || (wd.parents.consanguinityDegree === 'first_cousin' && wd.parents.consanguinityPath === 'unknown')) && (
                <div className="field-hint">Ortak atalar seçilmediği için yalnızca çift çizgi çizilir; ortak atalar gösterilmez.</div>
              )}
            </>
          )}
        </Section>

        <div className="group-label">Gelişmiş</div>
        <Section id="customConsanguinity" icon={Link2} title="Ek akrabalık bağları"
          summary={(wd.customConsanguinity || []).length ? `${wd.customConsanguinity.length} bağ` : ''} {...sec}>
          {(wd.customConsanguinity || []).map((link, idx) => (
            <div className="field" key={link.id}>
              <span className="field-label">{nameOf(link.person1)} ↔ {nameOf(link.person2)}</span>
              <button className="ui-btn ui-btn-sm ui-btn-ghost" onClick={() => removeCustomConsanguinity(idx)} aria-label="Bağı kaldır">Kaldır</button>
            </div>
          ))}
          <SiblingLinker individuals={pedigreeData?.individuals || []} onAdd={(a, b) => addCustomConsanguinity(a, b)} nameOf={nameOf} />
          {pedigreeData?.unions?.length > 0 && (
            <div className="field-col">
              <div className="divider" />
              <div className="order-title">Çiftlerin akrabalık geçmişi</div>
              {pedigreeData.unions.map(u => (
                <label className="field-col" key={u.id}>
                  <span className="field-hint">{nameOf(u.partners[0])} — {nameOf(u.partners[1])}</span>
                  <select className="select input-wide" value={u.relationshipBackground || 'not_asked'}
                    disabled={u.id === wd.parents.unionId && wd.parents.consanguineous}
                    onChange={e => setUnionRelationshipBackground(u.id, e.target.value)}>
                    {RELATIONSHIP_BACKGROUND_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
          )}
        </Section>

        <Section id="gen4" icon={Baby} title="Probandın / kardeşlerin çocukları" summary={wd.gen4.length ? `${wd.gen4.length} aile` : ''} {...sec}>
          {wd.gen4.map((g, idx) => (
            <div className="sub" key={g.id}>
              <div className="sub-head">
                <span>Aile {idx + 1}</span>
                <button className="ui-btn ui-btn-sm ui-btn-ghost" onClick={() => removeGen4(idx)}>Kaldır</button>
              </div>
              <label className="field-col">
                <span className="field-label">Kimin çocukları?</span>
                <select className="select input-wide" value={g.targetPath} disabled={(g.male || 0) + (g.female || 0) + (g.unknown || 0) > 0}
                  onChange={e => updateGen4(idx, 'targetPath', e.target.value)}>
                  <option value={wd.proband.id}>Proband</option>
                  {wd.siblings.male.map((sib, i) => <option key={sib.id} value={sib.id}>Erkek kardeş {i + 1}</option>)}
                  {wd.siblings.female.map((sib, i) => <option key={sib.id} value={sib.id}>Kız kardeş {i + 1}</option>)}
                  {wd.siblings.unknown.map((sib, i) => <option key={sib.id} value={sib.id}>Kardeş {i + 1}</option>)}
                </select>
              </label>
              <div className="counts">
                <Count label="Erkek" value={g.male || 0} onChange={v => updateGen4(idx, 'male', v)} />
                <Count label="Kız" value={g.female || 0} onChange={v => updateGen4(idx, 'female', v)} />
                <Count label="Bilinmeyen" value={g.unknown || 0} onChange={v => updateGen4(idx, 'unknown', v)} />
              </div>
              {(g.male || 0) + (g.female || 0) + (g.unknown || 0) >= 2 && g.unionId && (
                <ChildOrderEditor items={childItems(pedigreeData, g.unionId, g.childIds)} getOrder={() => getChildOrder(g.unionId)}
                  setOrder={(order) => setChildOrder(g.unionId, order)} label="Çocukların sırası" />
              )}
            </div>
          ))}
          <button className="ui-btn ui-btn-sm" onClick={() => addGen4(wd.proband.id)}>+ Çocuk ailesi ekle</button>
        </Section>
      </div>
    </aside>
  );
}
