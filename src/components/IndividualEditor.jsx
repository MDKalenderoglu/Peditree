/**
 * IndividualEditor.jsx — right panel: the selected person (or a selected
 * pair). Redesign 2026-10-23: header with the pedigree number, then cards
 * (clinical status, add to the family, partnerships, birth order, notes);
 * the same store operations as before. The store re-validates every action
 * independently of what this panel offers.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, Trash2, ArrowLeft, ArrowRight } from 'lucide-react';
import { computeSiblingCreationPlan, computeUnionCreationPlan } from '../state/usePedigreeStore';
import { AGE_EXAMPLE, shownAge } from '../utils/age';
import { computePedigreeIds } from '../utils/pedigreeNumbering';
import { degreeLabel, kinshipOf, kinshipCoefficient, childInbreeding, formatCoefficient, cousinMarriageName } from '../graph/kinship';
import { groupOf, multipleName, zygosityLabel, ZYGOSITY } from '../graph/multiples';
import BulkEditor from './BulkEditor';
import { isPregnancy, pregnancyKind, PREGNANCY_LABEL, GENETIC_TESTED, geneticLines, withGeneticLine, isGroup } from '../graph/model';
import { parseGroupCount } from '../graph/ops';
import DraftField from './DraftField';
import { pendingDrafts } from '../utils/drafts';
import { t, tk, currentLang, shownLabel } from '../i18n';

const SEX_WORD = { male: tk('Erkek'), female: tk('Kadın'), unknown: tk('Cinsiyet bilinmiyor') };
// several people in one symbol (clinician decisions 2026-11-01)
const GROUP_WORD = { male: tk('erkek'), female: tk('kadın'), unknown: tk('kişi (cinsiyetleri karışık ya da bilinmiyor)') };
// same options and wording as the wizard; an older 'separated' shows as the combined one
const STATUS_OPTIONS = [['together', tk('Birlikte')], ['divorced', tk('Boşanmış/Ayrılmış')], ['unknown', tk('Bilinmiyor')]];

/**
 * A box that adds one line: Enter (or leaving the box) writes it and the box
 * empties for the next one, keeping the focus (several variants in a row).
 * Never written mid-word; a half-typed line is written when the person
 * changes or the page is left.
 */
function AddLineField({ onAdd, ...rest }) {
  const [text, setText] = useState('');
  const latest = useRef({ text, onAdd });
  // the newest onAdd for a write after this render (refs are not written while rendering)
  useLayoutEffect(() => { latest.current.onAdd = onAdd; });
  const flush = useRef(() => {
    const t = latest.current.text.trim();
    pendingDrafts.delete(flush.current);
    if (t) latest.current.onAdd(t);
  });
  useEffect(() => () => flush.current(), []);
  const add = () => { flush.current(); setText(''); latest.current.text = ''; };
  return (
    <input {...rest} value={text}
      onChange={(e) => { setText(e.target.value); latest.current.text = e.target.value; if (e.target.value.trim()) pendingDrafts.add(flush.current); else pendingDrafts.delete(flush.current); }}
      onBlur={add}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
  );
}

function Header({ title, sub, onClose }) {
  return (
    <div className="side-header">
      <div>
        <div className="person-id">{title}</div>
        {sub && <div className="person-sub">{sub}</div>}
      </div>
      {onClose && (
        <button className="ui-btn ui-btn-ghost ui-btn-icon" onClick={onClose} aria-label={t('Seçimi kapat')} title={t('Seçimi kapat')}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}

// what can be added under a couple or beside a sibling: [label, sex, extra]
const KIN_KINDS = [
  [tk('Erkek'), 'male', {}], [tk('Kız'), 'female', {}], [tk('Bilinmeyen'), 'unknown', {}],
  [tk('Düşük'), 'unknown', { pregnancyLoss: true }], [tk('Ölü doğum'), 'unknown', { stillbirth: true }],
  [tk('Gebelik (P)'), 'unknown', { ongoingPregnancy: true }], [tk('Sonlandırma'), 'unknown', { termination: true }], [tk('Dış gebelik'), 'unknown', { ectopic: true }],
];

function AddButtons({ onAdd, title }) {
  return (
    <div className="add-grid">
      {KIN_KINDS.map(([label, sex, extra]) => (
        <button key={label} className="ui-btn ui-btn-sm" onClick={() => onAdd(sex, extra)} title={title}>{t(label)}</button>
      ))}
    </div>
  );
}

const PATH_TEXT = {
  mothers_paternal_is_fathers_paternal: tk('Annenin babası ile babanın babası kardeş'),
  mothers_maternal_is_fathers_maternal: tk('Annenin annesi ile babanın annesi kardeş'),
  cross_cousin_1: tk('Annenin annesi ile babanın babası kardeş'),
  cross_cousin_2: tk('Annenin babası ile babanın annesi kardeş'),
};
const DEGREE_OPTIONS = [
  ['unknown', tk('Bilinmiyor')], ['first_cousin', tk('1. derece kuzen')], ['second_cousin', tk('2. derece kuzen')], ['third_cousin', tk('3. derece kuzen')],
  ['first_cousin_once_removed', tk('1. kuzenin çocuğu (bir kuşak fark)')], ['second_cousin_once_removed', tk('2. kuzenin çocuğu (bir kuşak fark)')],
  ['double_first_cousin', tk('Çift 1. derece kuzen')], ['multiple_relationship', tk('Birden fazla akrabalık yolu')], ['other', tk('Diğer')],
];

/**
 * Consanguinity of a couple, three answers (clinician request 2026-10-25):
 * Var / Yok / Aynı köy (nothing chosen = not asked). When the drawing itself
 * shows shared ancestors, it decides (read-only). For the proband's parents,
 * "Var" offers degree and path, and the shared ancestors are drawn from the
 * choice (wizard template, wizardAdapter.js).
 */
function RelationshipChoice({ u, onSetBackground, parentsCons, graph }) {
  const isParents = parentsCons && parentsCons.parents.unionId === u.id;
  const parents = isParents ? parentsCons.parents : null;
  const kin = parents ? parents.kinship : null;
  const drawn = isParents ? kin && !kin.fromTemplate : u.consanguinityStatus === 'known_supported';
  // informational, for counselling and homozygosity comparison (clinician request 2026-10-25)
  const cousinName = graph ? cousinMarriageName(graph, u.partners[0], u.partners[1]) : null;
  const F = graph ? childInbreeding(graph, u.id) : 0;
  const inbreeding = F > 0 && <span className="field-hint">{t('Bu çiftin çocuklarında akrabalık (inbreeding) katsayısı:')} <b>F = {formatCoefficient(F)}</b></span>;
  if (drawn) {
    const nameOf = parentsCons ? parentsCons.nameOf : (x) => x;
    return (
      <div className="field-col">
        <span className="field-label">{t('Akrabalık: var')}</span>
        <span className="field-hint">
          {t('Çizimden anlaşılan akrabalık:')} {degreeLabel(isParents ? kin.degree : u.consanguinityDegree) || t('akraba')}
          {cousinName ? ` (${cousinName})` : ''}
          {isParents && PATH_TEXT[parents.consanguinityPath] ? ` — ${t(PATH_TEXT[parents.consanguinityPath])}` : ''}.
        </span>
        {inbreeding}
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
      <span className="field-label">{t('Akrabalık')}</span>
      <div className="segmented" role="radiogroup" aria-label={t('Akrabalık')}>
        {[['yes', t('Var')], ['no', t('Yok')], ['village', t('Aynı köy')]].map(([v, label]) => (
          <button key={v} className={value === v ? 'on' : undefined} role="radio" aria-checked={value === v} onClick={() => choose(v)}>{label}</button>
        ))}
      </div>
      {value === 'village' && <span className="field-hint">{t('Aynı köyden ya da bölgeden olmak akrabalık sayılmaz; eşleri bağlayan çizgi tek kalır.')}</span>}
      {isParents && value === 'yes' && (
        <>
          <select className="select input-wide" value={parents.consanguinityDegree} aria-label={t('Akrabalık derecesi')}
            onChange={e => parentsCons.onSet('consanguinityDegree', e.target.value)}>
            {DEGREE_OPTIONS.map(([v, label]) => <option key={v} value={v}>{t(label)}</option>)}
          </select>
          {parents.consanguinityDegree === 'first_cousin' && (
            <select className="select input-wide" value={parents.consanguinityPath} aria-label={t('Ortak atalar kimin üzerinden')}
              onChange={e => parentsCons.onSet('consanguinityPath', e.target.value)}>
              <option value="unknown">{t('Ortak ata hangi taraftan? (bilinmiyor)')}</option>
              {Object.entries(PATH_TEXT).map(([v, label]) => <option key={v} value={v}>{t(label)}</option>)}
            </select>
          )}
          {kin
            ? <span className="field-hint">{t('Ortak atalar çizime eklendi: {names}', { names: kin.ancestors.map(parentsCons.nameOf).join(', ') })}</span>
            : <span className="field-hint">{t('Akrabalık derecesini seçin (1. kuzenlerde ortak atanın hangi taraftan olduğunu da). Ortak atalar çizime kendiliğinden eklenir. Seçmezseniz eşlerin arasına yalnızca çift çizgi çizilir.')}</span>}
          {kin && cousinName && <span className="field-hint">{t('Eşler {relation}.', { relation: cousinName })}</span>}
          {inbreeding}
        </>
      )}
      {!isParents && value === 'yes' && <span className="field-hint">{t('Ortak atalar çizimde yok; çift çizgi yalnızca ailenin söylediğine dayanıyor.')}</span>}
    </div>
  );
}

/** One partnership: status (divorce/separation), consanguinity, children (couple card). */
function UnionControls({ u, pcrs, onAddChild, onSetUnionStatus, onSetUnionRelationshipBackground, parentsCons, withChildren = true, graph, onSetChildlessness }) {
  const children = pcrs.find(r => r.unionId === u.id)?.children || [];
  return (
    <>
      {onSetUnionStatus && (
        <label className="field">
          <span className="field-label">{t('İlişki')}</span>
          <select className="select" value={u.status === 'separated' ? 'divorced' : (u.status || 'together')}
            onChange={e => onSetUnionStatus(u.id, e.target.value)}>
            {STATUS_OPTIONS.map(([v, label]) => <option key={v} value={v}>{t(label)}</option>)}
          </select>
        </label>
      )}
      {onSetUnionRelationshipBackground && (
        <RelationshipChoice u={u} onSetBackground={onSetUnionRelationshipBackground} parentsCons={parentsCons} graph={graph} />
      )}
      {/* NSGC: no children by choice / reason unknown (one bar) or infertile (two bars), shown while they have none */}
      {onSetChildlessness && children.length === 0 && (
        <div className="field-col">
          <span className="field-label">{t('Çocukları yok')}</span>
          <div className="segmented" role="radiogroup" aria-label={t('Çocukları yok')}>
            {[['', '—'], ['by_choice', t('Çocuksuz')], ['infertile', t('İnfertil')]].map(([v, label]) => (
              <button key={v} role="radio" aria-checked={(u.childless || '') === v} className={(u.childless || '') === v ? 'on' : undefined}
                onClick={() => onSetChildlessness(u.id, v || null)}>{label}</button>
            ))}
          </div>
          {u.childless && (
            <DraftField key={`${u.id}-childless`} type="text" className="input input-wide" value={u.childlessReason || ''}
              placeholder={t('Nedeni (isteğe bağlı), ör. azospermi')} onCommit={v => onSetChildlessness(u.id, undefined, v)} />
          )}
          <span className="field-hint">{u.childless === 'infertile' ? t('Çizimde çift kısa çizgi: kısırlık (infertilite).') : u.childless ? t('Çizimde tek kısa çizgi: kendi isteğiyle çocuksuz ya da nedeni bilinmiyor.') : t('Çiftin çocuğu yoksa nedenini seçin: “Çocuksuz” tek kısa çizgiyle, “İnfertil” çift kısa çizgiyle çizilir.')}</span>
        </div>
      )}
      {withChildren && (
        <div className="field-col">
          <span className="field-label">{children.length > 0 ? t('Çocuk ekle (şu an {n})', { n: children.length }) : t('Çocuk ekle')}</span>
          <AddButtons onAdd={(sex, extra) => onAddChild(u.id, sex, null, extra)} />
        </div>
      )}
    </>
  );
}

/** Twins / multiple births of this person: zygosity, one more, leave the group. */
/**
 * Adoption (model.js adoptionOf; clinician decisions 2026-11-01): none,
 * "evlat verildi" (adopted out: the adoptive family not drawn), or a drawn
 * couple as the adoptive family (adopted in, or by relatives).
 */
function AdoptionCard({ info, onSet }) {
  if (!info || !onSet) return null;
  const { current, couples, hasParents } = info;
  const kind = current ? current.kind : 'none';
  return (
    <div className="card">
      <div className="card-title">{t('Evlat edinme')}</div>
      <div className="segmented" role="radiogroup" aria-label={t('Evlat edinme')}>
        <button role="radio" aria-checked={kind === 'none'} className={kind === 'none' ? 'on' : undefined}
          disabled={kind === 'in'} title={kind === 'in' ? t('Bu kişinin biyolojik ebeveynleri çizili değil; önce onları ekleyin') : undefined}
          onClick={() => onSet(null)}>{t('Yok')}</button>
        <button role="radio" aria-checked={kind === 'out'} className={kind === 'out' ? 'on' : undefined}
          disabled={!hasParents} title={!hasParents ? t('Önce biyolojik ebeveynleri ekleyin') : undefined}
          onClick={() => onSet('out')}>{t('Evlat verildi')}</button>
      </div>
      <label className="field">
        <span className="field-label">{t('Evlat edinen aile (çizimde)')}</span>
        <select className="input" value={current && current.unionId ? current.unionId : ''}
          onChange={e => e.target.value && onSet(e.target.value)}>
          <option value="">{t('— seçin —')}</option>
          {couples.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <span className="field-hint">
        {kind === 'out' ? t('Evlat verildi: sembol köşeli parantez içinde, biyolojik ailesinden düz çizgi. Evlat edinen aile çizimde yok.')
          : kind === 'relative' ? t('Evlat edinildi; biyolojik ve evlat edinen ailesi çizimde: biyolojik ailesinden düz, evlat edinen aileden kesikli çizgi.')
          : kind === 'in' ? t('Evlat edinildi: evlat edinen ailesinin altında, kesikli çizgiyle.')
          : t('Evlat verildiyse ve evlat edinen aile çizimde yoksa “Evlat verildi”; aile çizimdeyse (ör. teyze ve eşi) listeden seçin.')}
      </span>
    </div>
  );
}

/**
 * Assisted reproduction (NSGC 2022/2025 Figure 5; clinician decisions
 * 2026-11-01): the child's donor(s) and the person carrying the pregnancy,
 * added as a new person or chosen from the drawing; on a donor's own panel,
 * whom they are a donor or carrier for.
 */
const REPRO_BUTTONS = [
  ['sperm_donor', tk('Sperm donörü'), tk('Çocuğun genetik babası; çizimde D, çiftle arasında ilişki çizgisi yok')],
  ['egg_donor', tk('Yumurta donörü'), tk('Çocuğun genetik annesi; çizimde D')],
  ['gestational_carrier', tk('Gestasyonel taşıyıcı (G)'), tk('Gebeliği taşır, yumurtası kullanılmaz; çocuk onun altında')],
  ['surrogate', tk('Taşıyıcı anne (D)'), tk('Yumurtasını verir ve gebeliği taşır; çocuk onun altında')],
];
function ReproCard({ info, onAdd, onRemove }) {
  const [who, setWho] = useState('');
  if (!info) return null;
  const { links, canHave, candidates, roleOf } = info;
  return (
    <div className="card">
      <div className="card-title">{t('Yardımcı üreme')}</div>
      {roleOf.length > 0 && (
        <span className="field-hint">{roleOf.map(r => t('{child} için {role}', { child: r.childName, role: t(r.label).toLocaleLowerCase(currentLang()) })).join('; ')}. {t('Aile öyküsünü not ve bulgu olarak girin.')}</span>
      )}
      {canHave ? (
        <>
          {links.map(l => (
            <div key={l.personId + l.role} className="btn-row">
              <span>{t(l.label)}: {l.name}</span>
              <button className="ui-btn ui-btn-sm" onClick={() => onRemove(l.personId)}>{t('Kaldır')}</button>
            </div>
          ))}
          <label className="field">
            <span className="field-label">{t('Kim?')}</span>
            <select className="input" value={who} onChange={e => setWho(e.target.value)}>
              <option value="">{t('Yeni kişi (çizime eklenir)')}</option>
              {candidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="btn-row btn-wrap">
            {REPRO_BUTTONS.map(([role, text, title]) => (
              <button key={role} className="ui-btn ui-btn-sm" title={t(title)} disabled={!!info.blocked[role]}
                onClick={() => onAdd(role, who ? { personId: who } : {})}>{t(text)}</button>
            ))}
          </div>
          <span className="field-hint">{t('Donörün ve taşıyıcının ailesi çizilmez; aile öyküsünü onların not ve bulgu alanına yazın. Akrabalık katsayısı genetik ebeveynlere göre hesaplanır.')}</span>
        </>
      ) : roleOf.length === 0 && (
        <span className="field-hint">{t('Yardımcı üreme işaretlemek için önce bu kişinin anne-babasını (ya da tek ebeveynini) ekleyin.')}</span>
      )}
    </div>
  );
}

function MultiplesCard({ node, pedigreeData, displayNameFor, onAddMultiple, onSetZygosity, onLeaveMultiple }) {
  const found = groupOf(pedigreeData, node.id);
  const hasParents = (pedigreeData.parentChildRelationships || []).some(r => r.children.includes(node.id));
  if (!hasParents || !onAddMultiple) return null;
  const sexes = [['male', t('Erkek')], ['female', t('Kız')], ['unknown', t('Bilinmeyen')]];
  // a new twin is added from the ring (İkiz); here only an existing group
  if (!found) return null;
  const { group } = found;
  const n = group.children.length;
  return (
    <div className="card">
      <div className="card-title">{multipleName(n)}</div>
      <span className="field-hint">{group.children.map(displayNameFor).join(', ')}</span>
      <label className="field-col">
        <span className="field-label">{t('Zigosite')}</span>
        <select className="select input-wide" value={group.zygosity} onChange={e => onSetZygosity(node.id, e.target.value)}>
          {ZYGOSITY.map(v => <option key={v} value={v}>{zygosityLabel(v, n)}</option>)}
        </select>
      </label>
      <div className="field-col">
        <span className="field-label">{t('{name} yap: bir kardeş daha', { name: multipleName(n + 1) })}</span>
        {group.zygosity === 'monozygotic' ? (
          <button className="ui-btn ui-btn-sm" onClick={() => onAddMultiple(node.id, {})}>{t('Ekle (aynı cinsiyet)')}</button>
        ) : (
          <div className="add-grid">
            {sexes.map(([v, label]) => <button key={v} className="ui-btn ui-btn-sm" onClick={() => onAddMultiple(node.id, { sex: v })}>{label}</button>)}
          </div>
        )}
      </div>
      <button className="ui-btn ui-btn-sm ui-btn-ghost" onClick={() => onLeaveMultiple(node.id)}>{t('Bu kişiyi gruptan çıkar')}</button>
    </div>
  );
}

/**
 * Two individuals selected (Cmd/Ctrl-click, or a click on their relationship
 * line): an existing couple gets its relationship card, others the pair actions.
 */
/**
 * How two selected people are related, and the share of genes they have in
 * common (r = 2φ for people who are not inbred) — informational.
 */
function PairKinship({ a, b, graph }) {
  if (!graph || a.placeholder || b.placeholder) return null;
  const phi = kinshipCoefficient(graph, a.id, b.id);
  if (!phi) return null;
  const pcrs = graph.parentChildRelationships || [];
  const unions = graph.unions || [];
  const parentsOf = (id) => unions.find((u) => u.id === (pcrs.find((r) => r.children.includes(id)) || {}).unionId)?.partners || [];
  const sameParents = pcrs.some((r) => r.children.includes(a.id) && r.children.includes(b.id));
  const kin = kinshipOf(graph, a.id, b.id);
  const what = parentsOf(b.id).includes(a.id) || parentsOf(a.id).includes(b.id) ? t('Ebeveyn – çocuk')
    : sameParents ? t('Kardeş')
      : kin ? `${degreeLabel(kin.degree)}${cousinMarriageName(graph, a.id, b.id) ? ` (${cousinMarriageName(graph, a.id, b.id)})` : ''}`
        : t('Akraba');
  return (
    <div className="card">
      <div className="card-title">{t('Akrabalık')}</div>
      <span className="field-hint">{what}</span>
      <span className="field-hint">{t('Ortak gen oranı (ortak atalardan gelen aynı genlerin beklenen oranı):')} <b>{formatCoefficient(2 * phi)}</b></span>
    </div>
  );
}

const GROUP_SHAPE = { male: tk('kare'), female: tk('daire'), unknown: tk('baklava') };

/** "Tek sembolde birleştir" — siblings chosen together become one numbered symbol (the reverse of "Tek tek ayır"). */
function MergeCard({ check, onMerge, ids }) {
  if (!check || !onMerge) return null;
  const made = check.ok ? check.doc.graph.individuals.find(i => i.id === check.created.groupId) : null;
  return (
    <div className="card">
      <div className="card-title">{t('Tek sembolde birleştir')}</div>
      <span className="field-hint">
        {made
          ? t('Seçili kardeşler tek bir {shape} olarak çizilir, içinde {count} yazar. Gerekirse “Tek tek ayır” ile yeniden ayrılır.', { shape: t(GROUP_SHAPE[made.sex || 'unknown']), count: made.count })
          : check.reason}
      </span>
      <button className="ui-btn" disabled={!made} onClick={() => onMerge(ids)}>{t('Birleştir')}</button>
    </div>
  );
}

function TwoPersonActions({ node, node2, pedigreeData, onCreateUnion, onMakeSiblings, onClearSelection, unionProps, onSetMultipleBirth, bulk, merge }) {
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
    const human = p.displayLabel || shownLabel(p.label);
    return pid ? (human ? `${pid} — ${human}` : pid) : (human || t('birey'));
  };

  return (
    <>
      <Header title={couple ? t('İlişki') : t('İki kişi seçili')} sub={`${label(node)}  +  ${label(node2)}`} onClose={onClearSelection} />
      <div className="editor-body">
        {couple && (
          <div className="card">
            <div className="card-title">{t('Bu çift')}</div>
            <UnionControls u={couple} pcrs={pedigreeData.parentChildRelationships || []} {...unionProps} graph={pedigreeData} />
          </div>
        )}
        {!couple && <PairKinship a={node} b={node2} graph={pedigreeData} />}
        {siblings && onSetMultipleBirth && (
          <div className="card">
            <div className="card-title">{t('İkiz yap')}</div>
            <div className="btn-row">
              {ZYGOSITY.map(v => (
                <button key={v} className="ui-btn ui-btn-sm" onClick={() => onSetMultipleBirth([node.id, node2.id], v)}>
                  {{ monozygotic: t('Tek yumurta'), dizygotic: t('Çift yumurta'), unknown: t('Bilinmiyor') }[v]}
                </button>
              ))}
            </div>
            <span className="field-hint">{t('Biri zaten ikizse diğeri de aynı gruba katılır ve üçüz olurlar.')}</span>
          </div>
        )}
        {siblings && merge}
        {!couple && (
        <div className="card">
          <div className="card-title">{t('Bu iki kişiyi')}</div>
          <button className="ui-btn ui-btn-primary" disabled={!unionPlan.ok} onClick={() => onCreateUnion(node.id, node2.id)}>
            {t('Eş yap')}
          </button>
          {!unionPlan.ok && <div className="field-hint">{unionPlan.reason}</div>}
          {/* creates a real biological parent union (existing or new), not a flag */}
          <button className="ui-btn" disabled={siblingBlocked} onClick={() => onMakeSiblings(node.id, node2.id)}>
            {t('Kardeş yap')}
          </button>
          {siblingBlocked && <div className="field-hint">{siblingPlan.reason}</div>}
        </div>
        )}
        {bulk}
        <div className="field-hint">{t('İpucu: Cmd (Mac) ya da Ctrl (Windows) tuşuna basılı tutup kişilere tıklarsanız birden çok kişi seçilir. İki eşi bağlayan çizgiye tıklarsanız o çift seçilir.')}</div>
      </div>
    </>
  );
}

export default function IndividualEditor({
  node, node2, pedigreeData, onUpdate, onAddChild,
  onDeleteIndividual, onCreateUnion, onMakeSiblings,
  onClearSelection, onReorderChild, onSetUnionRelationshipBackground, onSetUnionStatus, onSetChildlessness,
  onSetPregnancyKind, onSetGestationWeeks,
  onSetMultipleBirth, onAddMultiple, onSetZygosity, onLeaveMultiple,
  onSetGroupCount, onSplitGroup, mergeCheck, onMergeGroup, adoptionInfo, onSetAdoption, reproInfo, onAddRepro, onRemoveRepro,
  wizardParents, onSetParentsField,
  selectedNodes = [], onUpdateMany, onSetFindingStatusMany, onAddFindingMany,
}) {
  const ids = computePedigreeIds(pedigreeData?.nodes || []);
  const nameOfId = (id) => {
    const p = pedigreeData?.individuals?.find(i => i.id === id);
    const pid = ids.get(id)?.displayId;
    const label = p?.displayLabel || shownLabel(p?.label);
    return pid ? (label ? `${pid} (${label})` : pid) : (label || t('birey'));
  };
  const parentsCons = wizardParents && onSetParentsField ? { parents: wizardParents, onSet: onSetParentsField, nameOf: nameOfId } : null;
  const bulk = onUpdateMany && selectedNodes.length >= 2 ? (
    <BulkEditor nodes={selectedNodes} conditionKey={pedigreeData?.conditionKey || []}
      onUpdateMany={onUpdateMany} onSetFindingStatusMany={onSetFindingStatusMany} onAddFindingMany={onAddFindingMany} />
  ) : null;
  // the merge card only for children of the same parents
  const ownRel = (id) => (pedigreeData?.parentChildRelationships || []).find(r => r.children.includes(id));
  const sameSibship = selectedNodes.length >= 2 && !!ownRel(selectedNodes[0].id) && selectedNodes.every(n => ownRel(n.id) === ownRel(selectedNodes[0].id));
  const merge = sameSibship ? <MergeCard check={mergeCheck} onMerge={onMergeGroup} ids={selectedNodes.map(n => n.id)} /> : null;
  if (selectedNodes.length >= 3) {
    return (
      <>
        <Header title={t('{n} kişi seçili', { n: selectedNodes.length })} sub={selectedNodes.map(n => ids.get(n.id)?.displayId || '—').join(', ')} onClose={onClearSelection} />
        <div className="editor-body">
          {merge}
          {bulk}
          <div className="field-hint">{t('Seçime kişi eklemek ya da çıkarmak için Cmd (Mac) ya da Ctrl (Windows) tuşuna basılı tutup o kişiye tıklayın.')}</div>
        </div>
      </>
    );
  }
  if (node && node2) {
    return (
      <TwoPersonActions node={node} node2={node2} pedigreeData={pedigreeData}
        onCreateUnion={onCreateUnion} onMakeSiblings={onMakeSiblings} onClearSelection={onClearSelection}
        unionProps={{ onAddChild, onSetUnionStatus, onSetUnionRelationshipBackground, parentsCons, onSetChildlessness }} onSetMultipleBirth={onSetMultipleBirth}
        bulk={bulk} merge={merge} />
    );
  }
  if (!node) return null;

  const isLoss = isPregnancy(node);
  const group = isGroup(node);
  const pedigreeIds = computePedigreeIds(pedigreeData?.nodes || []);
  const pedigreeId = pedigreeIds.get(node.id)?.displayId;
  const displayNameFor = (id) => {
    const person = pedigreeData?.individuals?.find(i => i.id === id);
    const pid = pedigreeIds.get(id)?.displayId;
    const label = person?.displayLabel || shownLabel(person?.label);
    return pid ? (label ? `${pid} (${label})` : pid) : (label || t('birey'));
  };

  const unions = pedigreeData?.unions || [];
  const existingUnions = unions.filter(u => u.partners.includes(node.id));
  const pcrs = pedigreeData?.parentChildRelationships || [];
  const ownParentRel = pcrs.find(r => r.children.includes(node.id));
  const siblingOrder = ownParentRel ? ownParentRel.children : null;
  const ownIndexInOrder = siblingOrder ? siblingOrder.indexOf(node.id) : -1;

  const kind = group ? `${node.count === 'n' ? t('Sayısı bilinmeyen') : node.count} ${t(GROUP_WORD[node.sex || 'unknown'])}`
    : pregnancyKind(node) ? t(PREGNANCY_LABEL[pregnancyKind(node)]) : t(SEX_WORD[node.sex || 'unknown']);
  const sub = [kind, node.age ? t('{age} yaş', { age: shownAge(node.age) }) : null, node.proband ? 'proband' : null, node.consultand ? t('danışan') : null].filter(Boolean).join(' · ');
  const set = (patch) => onUpdate(node.id, patch);
  // genetic test: "+" done / "−" not; the clinician's lines, one per variant or result
  const tested = node.geneticTest === GENETIC_TESTED;
  const gLines = geneticLines(node);
  const setGeneticLine = (k, text) => set({ geneticNote: withGeneticLine(node.geneticNote, k, text) });
  const familyNotes = [...new Set((pedigreeData?.individuals || [])
    .filter(i => i.id !== node.id).flatMap(geneticLines))]
    .filter(line => !gLines.includes(line)).slice(0, 6);

  return (
    <>
      <Header title={pedigreeId || '—'} sub={node.placeholder ? t('Belirtilmemiş ebeveyn') : sub} onClose={onClearSelection} />
      <div className="editor-body">
        {node.placeholder && (
          <div className="field-hint">{t('Bu boş sembol, silinen ya da bilinmeyen bir ebeveynin yerini tutar; çocuklar ebeveynsiz kalmasın diye çizilir.')}</div>
        )}

        {!node.placeholder && (
          <div className="field-hint editor-tip">{t('Akraba eklemek, bulgu, durum, ikiz ya da not girmek için çizimde bu kişinin çevresindeki düğmeleri kullanın. Düğmeler görünmüyorsa kişinin sembolüne yeniden tıklayın.')}</div>
        )}

        {/* several people in one symbol: the number, the sex, "Tek tek ayır" (clinician decisions 2026-11-01) */}
        {group && (
          <div className="card">
            <div className="card-title">{t('Birden çok kişi')}</div>
            <div className="field-hint">{t('Bu sembol birden çok kişiyi gösteriyor; sayı sembolün içine yazılır. Bulgu, eş, çocuk ya da proband gerekiyorsa kişileri “Tek tek ayır” ile ayrı çizin.')}</div>
            <label className="field">
              <span className="field-label">{t('Kişi sayısı')}</span>
              <DraftField key={`${node.id}-count`} type="text" className="input input-age" value={String(node.count)} placeholder={t('3 ya da n')}
                title={t('2–99; bilinmiyorsa n. 1 yazarsanız tek kişi olur.')}
                onCommit={v => onSetGroupCount && onSetGroupCount(node.id, v.trim() === '1' ? 1 : (parseGroupCount(v) ?? v))} />
            </label>
            <div className="segmented" role="radiogroup" aria-label={t('Cinsiyet')}>
              {[['male', t('Erkek')], ['female', t('Kadın')], ['unknown', t('Karışık / bilinmiyor')]].map(([s, label]) => (
                <button key={s} role="radio" aria-checked={node.sex === s} className={node.sex === s ? 'on' : undefined} onClick={() => set({ sex: s })}>{label}</button>
              ))}
            </div>
            {onSplitGroup && (
              <button className="ui-btn" disabled={node.count === 'n'} title={node.count === 'n' ? t('Ayırmak için önce kişi sayısını yazın') : undefined}
                onClick={() => onSplitGroup(node.id)}>{node.count === 'n' ? t('Tek tek ayır') : t('Tek tek ayır ({n} kişi)', { n: node.count })}</button>
            )}
          </div>
        )}

        {/* a pregnancy outcome (NSGC; clinician decision 2026-10-25): its kind, the week, born */}
        {isLoss && (
          <div className="card">
            <div className="card-title">{t('Gebelik sonucu')}</div>
            <div className="segmented segmented-wrap" role="radiogroup" aria-label={t('Gebelik sonucu')}>
              {Object.entries(PREGNANCY_LABEL).map(([k, label]) => (
                <button key={k} role="radio" aria-checked={pregnancyKind(node) === k} className={pregnancyKind(node) === k ? 'on' : undefined}
                  onClick={() => onSetPregnancyKind(node.id, k)}>{t(label)}</button>
              ))}
            </div>
            <label className="field">
              <span className="field-label">{t('Gebelik haftası')}</span>
              <DraftField key={`${node.id}-weeks`} type="text" className="input input-age" value={node.gestationWeeks || ''} placeholder={t('hf')}
                onCommit={v => onSetGestationWeeks(node.id, v)} />
            </label>
            {node.ongoingPregnancy && (
              <button className="ui-btn" onClick={() => onSetPregnancyKind(node.id, '')}>{t('Bebek doğdu: gebelik yerine kişi olarak göster')}</button>
            )}
          </div>
        )}

        {!node.placeholder && !group && (
          <div className="card">
            <div className="card-title">{t('Bilgiler')}</div>
            <label className="field-col">
              <span className="field-label">{t('Etiket (çizimde görünür)')}</span>
              <DraftField key={`${node.id}-label`} type="text" className="input input-wide" value={node.displayLabel || ''} placeholder={t('ör. ad ya da kısaltma (boş bırakılabilir)')}
                onCommit={v => set({ displayLabel: v })} />
            </label>
            {!isLoss && (
              <label className="field">
                <span className="field-label">{t('Yaş')}</span>
                <DraftField key={`${node.id}-age`} type="text" className="input input-age" value={node.age || ''} placeholder={t('35, 3 ay…')}
                  disabled={!!node.birthDate}
                  title={node.birthDate ? t('Yaş, üstteki doğum tarihinden bugüne göre hesaplanıyor; değiştirmek için doğum tarihini düzeltin') : `${t('Yıl, ay ya da gün')} — ${t(AGE_EXAMPLE)}`}
                  onCommit={v => set({ age: v.trim() })} />
              </label>
            )}
            {!!node.deceased && !isLoss && (
              <>
                <label className="field">
                  <span className="field-label">{t('Ölüm yaşı')}</span>
                  <DraftField key={`${node.id}-death-age`} type="text" className="input input-age" value={node.ageAtDeath || ''} placeholder="—"
                    title={`${t('Yıl, ay ya da gün')} — ${t(AGE_EXAMPLE)}`} onCommit={v => set({ ageAtDeath: v.trim() })} />
                </label>
                <label className="field-col">
                  <span className="field-label">{t('Ölüm nedeni')}</span>
                  <DraftField key={`${node.id}-cause`} type="text" className="input input-wide" value={node.causeOfDeath || ''}
                    onCommit={v => set({ causeOfDeath: v })} />
                </label>
              </>
            )}
            {/* the week a child was born in (kept from a pregnancy; clinician decision 2026-10-25) */}
            {!isLoss && node.gestationWeeks && (
              <label className="field">
                <span className="field-label">{t('Doğum haftası')}</span>
                <DraftField key={`${node.id}-birthweek`} type="text" className="input input-age" value={node.gestationWeeks || ''} placeholder={t('hf')}
                  onCommit={v => onSetGestationWeeks(node.id, v)} />
              </label>
            )}
            {/* genetic test (clinician decision 2026-10-27): "−" none, "+" done; what
                is written goes under the symbol line by line, no "E" (NSGC 2022) */}
            <div className="field-col">
              <span className="field-label">{t('Genetik test')}</span>
              <div className="segmented" role="radiogroup" aria-label={t('Genetik test')}>
                {[['', '−', t('Genetik test yapılmadı')], [GENETIC_TESTED, '+', t('Genetik test yapıldı')]].map(([v, sign, title]) => (
                  <button key={v} role="radio" aria-checked={(node.geneticTest || '') === v} className={`seg-sign${(node.geneticTest || '') === v ? ' on' : ''}`}
                    title={title} aria-label={title}
                    onClick={() => {
                      if ((node.geneticTest || '') === v) return;
                      if (!v && gLines.length && !window.confirm(t('Genetik test "−" yapılırsa yazılan {n} satır da silinir. Devam edilsin mi?\n\n"Geri Al" (Cmd/Ctrl+Z) ile geri alınabilir.', { n: gLines.length }))) return;
                      set({ geneticTest: v });
                    }}>{sign}</button>
                ))}
              </div>
              <span className="field-hint">
                <b>−</b>{t(': genetik test yapılmadı.')} <b>+</b>{t(': genetik test yapıldı. "+" seçtiyseniz bulunan varyantı ya da sonucu (ör. "sonuç bekleniyor") aşağıya yazıp Enter\'a basabilirsiniz; yazmak zorunlu değil. Her satır pedigride sembolün altında ayrı bir satırda görünür. Hiçbir şey yazmazsanız sembolün altında "test yapıldı" yazar.')}
              </span>
              {tested && (
                <div className="genetic-lines">
                  {gLines.map((line, k) => (
                    <div key={`${node.id}-gl-${k}`} className="genetic-line">
                      <DraftField type="text" className="input input-wide" value={line} aria-label={t('Genetik sonuç {n}', { n: k + 1 })}
                        onCommit={v => setGeneticLine(k, v)} />
                      <button className="ui-btn ui-btn-ghost ui-btn-icon" title={t('Bu satırı sil')} aria-label={t('Genetik sonuç {n} sil', { n: k + 1 })}
                        onClick={() => setGeneticLine(k, '')}><X size={14} /></button>
                    </div>
                  ))}
                  <AddLineField key={`${node.id}-gadd`} type="text" className="input input-wide"
                    aria-label={t('Varyant ya da sonuç ekle')}
                    placeholder={gLines.length ? t('Bir varyant / sonuç daha (Enter)') : t('Varyant ya da sonuç, ör. FBN1 c.1585C>T het')}
                    onAdd={t => setGeneticLine(Infinity, t)} />
                </div>
              )}
              {/* what was written for relatives, one tap away (clinician request 2026-10-25) */}
              {familyNotes.length > 0 && (
                <div className="suggest-row">
                  <span className="field-hint">{t('Ailede girilen:')}</span>
                  {familyNotes.map(line => (
                    <button key={line} className="suggest-chip" title={t('Bu kişiye de ekle')} onClick={() => setGeneticLine(Infinity, line)}>{line}</button>
                  ))}
                </div>
              )}
            </div>
            {node.condition && (
              // older free-text field: still shown under the symbol, editable/clearable here
              <label className="field-col">
                <span className="field-label">{t('Sembolün altındaki yazı (eski kayıt)')}</span>
                <DraftField key={`${node.id}-condition`} type="text" className="input input-wide" value={node.condition || ''}
                  onCommit={v => set({ condition: v })} />
              </label>
            )}
          </div>
        )}

        {!node.placeholder && !group && !isLoss && (
          <AdoptionCard info={adoptionInfo} onSet={to => onSetAdoption(node.id, to)} />
        )}

        {!node.placeholder && !group && onAddRepro && (
          <ReproCard key={node.id} info={reproInfo} onAdd={(role, opts) => onAddRepro(node.id, role, opts)} onRemove={pid => onRemoveRepro(node.id, pid)} />
        )}

        {!node.placeholder && !group && (
          <MultiplesCard node={node} pedigreeData={pedigreeData} displayNameFor={displayNameFor}
            onAddMultiple={onAddMultiple} onSetZygosity={onSetZygosity} onLeaveMultiple={onLeaveMultiple} />
        )}

        {!isLoss && !node.placeholder && existingUnions.map(u => (
          <div className="card" key={u.id}>
            <div className="card-title">{t('Eş: {name}', { name: displayNameFor(u.partners.find(p => p !== node.id)) })}</div>
            <UnionControls u={u} pcrs={pcrs} onSetUnionStatus={onSetUnionStatus} withChildren={false} graph={pedigreeData}
              onSetUnionRelationshipBackground={onSetUnionRelationshipBackground} parentsCons={parentsCons} onSetChildlessness={onSetChildlessness} />
          </div>
        ))}

        {/* moves this child within its own sibship only, never to another union */}
        {onReorderChild && siblingOrder && siblingOrder.length > 1 && (
          <div className="card">
            <div className="card-title">{t('Doğum sırası')}</div>
            <div className="btn-row">
              <button className="ui-btn ui-btn-sm" disabled={ownIndexInOrder <= 0}
                onClick={() => onReorderChild(ownParentRel.unionId, node.id, 'left')}><ArrowLeft size={14} /> {t('Sola')}</button>
              <span className="muted small" style={{ alignSelf: 'center' }}>{ownIndexInOrder + 1}. / {siblingOrder.length}</span>
              <button className="ui-btn ui-btn-sm" disabled={ownIndexInOrder === -1 || ownIndexInOrder >= siblingOrder.length - 1}
                onClick={() => onReorderChild(ownParentRel.unionId, node.id, 'right')}>{t('Sağa')} <ArrowRight size={14} /></button>
            </div>
          </div>
        )}

        {/* anyone but the proband can be deleted; children stay with the other parent */}
        {onDeleteIndividual && !node.placeholder && (
          node.proband ? (
            <div className="field-hint">{t('Proband silinemez. Silmek için önce başka bir kişiyi proband yapın (Durum → Proband).')}</div>
          ) : (
            <button className="ui-btn ui-btn-danger" onClick={() => {
              if (window.confirm(t('"{name}" silinsin mi?\n\nÇocukları silinmez; diğer ebeveynlerine bağlı kalırlar ve silinen kişinin yerinde boş bir "belirtilmemiş ebeveyn" sembolü görünür. Bu kişinin çocuğu olmayan eş ilişkileri de kaldırılır.\n\nYanlışlıkla sildiyseniz "Geri Al" ile geri getirebilirsiniz.', { name: displayNameFor(node.id) }))) {
                onDeleteIndividual(node.id);
              }
            }}>
              <Trash2 size={14} /> {t('Kişiyi sil')}
            </button>
          )
        )}
      </div>
    </>
  );
}
