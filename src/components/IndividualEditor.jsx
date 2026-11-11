/**
 * IndividualEditor.jsx — right panel: the selected person (or a selected
 * pair). Redesign 2026-10-23: header with the pedigree number, then cards
 * (clinical status, add to the family, partnerships, birth order, notes);
 * the same store operations as before. The store re-validates every action
 * independently of what this panel offers.
 */
import { useState } from 'react';
import { X, Trash2, ArrowLeft, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { computeSiblingCreationPlan, computeUnionCreationPlan } from '../state/usePedigreeStore';
import { AGE_EXAMPLE, shownAge } from '../utils/age';
import { computePedigreeIds } from '../utils/pedigreeNumbering';
import { degreeLabel, kinshipOf, kinshipCoefficient, childInbreeding, formatCoefficient, cousinMarriageName } from '../graph/kinship';
import { groupOf, multipleName, zygosityLabel, ZYGOSITY } from '../graph/multiples';
import BulkEditor from './BulkEditor';
import { isPregnancy, pregnancyKind, PREGNANCY_LABEL, geneticLines, isGroup } from '../graph/model';
import { parseGroupCount } from '../graph/ops';
import DraftField from './DraftField';
import { NameField, AgeField, NoteField, GeneticField } from './InfoFields';
import { usePanelPrefs, usePanelTip, PANEL_PARTS } from '../utils/panelPrefs';
import { formatDate } from '../utils/age';
import { t, tk, currentLang, shownLabel } from '../i18n';
import { useViewSettings } from '../utils/drawingStyle';
import { kinTerm } from '../graph/kinTerm';

const SEX_WORD = { male: tk('Erkek'), female: tk('Kadın'), unknown: tk('Cinsiyet bilinmiyor') };
// several people in one symbol (clinician decisions 2026-11-01)
const GROUP_WORD = { male: tk('erkek'), female: tk('kadın'), unknown: tk('kişi (cinsiyetleri karışık ya da bilinmiyor)') };
// same options and wording as the wizard; an older 'separated' shows as the combined one
const STATUS_OPTIONS = [['together', tk('Birlikte')], ['divorced', tk('Boşanmış/Ayrılmış')], ['unknown', tk('Bilinmiyor')]];
// a narrow side panel (clinician report 2026-11-07: "Bilinmiyor" ran out of it): "Boşanmış/Ayrılmış"
// may go on two lines after its "/"
const breakAfterSlash = (text) => text.split('/').flatMap((part, i) => (i ? ['/', <wbr key={i} />, part] : [part]));

/**
 * The person's symbol in miniature, as drawn (sex, affected, deceased, a
 * pregnancy, a group's number): the panel says whom it is about at a glance.
 */
function PersonGlyph({ p, size = 30 }) {
  if (!p) return null;
  const ink = 'var(--ink)';
  const fill = p.affected ? ink : 'var(--surface)';
  const s = size, m = s / 2, r = s * 0.36;
  const shape = isPregnancy(p) ? <path d={`M${m} ${m - r} L${m + r} ${m + r * 0.8} L${m - r} ${m + r * 0.8} Z`} />
    : p.sex === 'male' ? <rect x={m - r} y={m - r} width={2 * r} height={2 * r} />
      : p.sex === 'female' ? <circle cx={m} cy={m} r={r} />
        : <path d={`M${m} ${m - r * 1.25} L${m + r * 1.25} ${m} L${m} ${m + r * 1.25} L${m - r * 1.25} ${m} Z`} />;
  return (
    <svg className="person-glyph" width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true">
      <g fill={fill} stroke={ink} strokeWidth="1.6">{shape}</g>
      {isGroup(p) && !p.affected && <text x={m} y={m + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={ink}>{p.count}</text>}
      {p.deceased && <line x1={2} y1={s - 2} x2={s - 2} y2={2} stroke={ink} strokeWidth="1.6" />}
    </svg>
  );
}

function Header({ title, kin, sub, chips, glyph, onClose }) {
  return (
    <div className="side-header">
      {glyph}
      <div className="side-header-text">
        <div className="person-id">{title}</div>
        {/* what the person is to the proband (clinician 2026-11-11: who is who in a wide pedigree) */}
        {kin && <div className="person-kin" title={t('Probanda göre akrabalığı')}>{kin}</div>}
        {chips && chips.length > 0
          ? <div className="person-chips">{chips.map(c => <span key={c} className="person-chip">{c}</span>)}</div>
          : sub && <div className="person-sub">{sub}</div>}
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
  ['first_cousin_once_removed', tk('Birinci derece kuzenin çocuğu (bir kuşak farkla)')], ['second_cousin_once_removed', tk('İkinci derece kuzenin çocuğu (bir kuşak farkla)')],
  ['double_first_cousin', tk('Çift 1. derece kuzen')], ['multiple_relationship', tk('Birden fazla akrabalık yolu')], ['other', tk('Diğer')],
];

/**
 * Consanguinity of a couple (clinician requests 2026-10-25, 2026-11-05):
 * Var / Aynı köy; nothing chosen = none reported ("Yok" said nothing more —
 * an older file's "no" shows as nothing chosen). "Aynı köy" is written on the
 * relationship line, in the clinician's own words if they change it. When the drawing itself
 * shows shared ancestors, it decides (read-only). For the proband's parents,
 * "Var" offers degree and path, and the shared ancestors are drawn from the
 * choice (wizard template, wizardAdapter.js).
 */
function RelationshipChoice({ u, onSetBackground, onSetLineNote, parentsCons, graph }) {
  const isParents = parentsCons && parentsCons.parents.unionId === u.id;
  const parents = isParents ? parentsCons.parents : null;
  const kin = parents ? parents.kinship : null;
  const drawn = isParents ? kin && !kin.fromTemplate : u.consanguinityStatus === 'known_supported';
  // informational, for counselling and homozygosity comparison (clinician request 2026-10-25)
  const cousinName = graph ? cousinMarriageName(graph, u.partners[0], u.partners[1]) : null;
  const F = graph ? childInbreeding(graph, u.id) : 0;
  const inbreeding = F > 0 && <span className="field-hint">{t('Bu çiftin çocuklarında beklenen akrabalık (inbreeding) katsayısı:')} <b>F = {formatCoefficient(F)}</b></span>;
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
  const value = u.consanguineous ? 'yes' : u.relationshipBackground === 'same_village_or_same_origin' ? 'village' : null;
  const BACKGROUND = { yes: 'consanguinity_reported', village: 'same_village_or_same_origin' };
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
        {[['yes', t('Var')], ['village', t('Aynı köy')]].map(([v, label]) => (
          <button key={v} className={value === v ? 'on' : undefined} role="radio" aria-checked={value === v} onClick={() => choose(v)}>{label}</button>
        ))}
      </div>
      {value === 'village' && (
        <>
          {onSetLineNote && (
            <DraftField key={`${u.id}-linenote`} type="text" className="input input-wide" value={u.lineNote || ''} maxLength={40}
              placeholder={t('Aynı köy')} aria-label={t('Çizginin üstündeki yazı')}
              title={t('Eşleri birleştiren çizginin üzerinde gösterilir (örneğin yakın köy, uzak akraba). Boş bırakılırsa “Aynı köy” yazılır.')}
              onCommit={v => onSetLineNote(u.id, v)} />
          )}
          <span className="field-hint">{t('Akrabalık sayılmaz; çizgi tek kalır ve üzerinde bu not gösterilir.')}</span>
        </>
      )}
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
            : <span className="field-hint">{t('Akrabalık derecesini seçin; birinci derece kuzenlerde ortak atanın hangi taraftan geldiğini de belirtin. Ortak atalar çizime kendiliğinden eklenir. Derece seçilmezse eşlerin arasına yalnızca çift çizgi çizilir.')}</span>}
          {kin && cousinName && <span className="field-hint">{t('Eşler {relation}.', { relation: cousinName })}</span>}
          {inbreeding}
        </>
      )}
      {!isParents && value === 'yes' && <span className="field-hint">{t('Ortak atalar çizimde yer almıyor; çift çizgi yalnızca ailenin beyanına dayanmaktadır.')}</span>}
    </div>
  );
}

/** One partnership: status (divorce/separation), consanguinity, children (couple card). */
function UnionControls({ u, pcrs, onAddChild, onSetUnionStatus, onSetUnionRelationshipBackground, onSetLineNote, parentsCons, withChildren = true, graph, onSetChildlessness }) {
  const children = pcrs.find(r => r.unionId === u.id)?.children || [];
  return (
    <>
      {/* the choices side by side, like Akrabalık (clinician request 2026-11-05: a list hid them) */}
      {onSetUnionStatus && (() => {
        const status = u.status === 'separated' ? 'divorced' : (u.status || 'together');
        return (
          <div className="field-col">
            <span className="field-label">{t('İlişki')}</span>
            <div className="segmented" role="radiogroup" aria-label={t('İlişki')}>
              {STATUS_OPTIONS.map(([v, label]) => (
                <button key={v} role="radio" aria-checked={status === v} className={status === v ? 'on' : undefined}
                  onClick={() => { if (status !== v) onSetUnionStatus(u.id, v); }}>{breakAfterSlash(t(label))}</button>
              ))}
            </div>
          </div>
        );
      })()}
      {onSetUnionRelationshipBackground && (
        <RelationshipChoice u={u} onSetBackground={onSetUnionRelationshipBackground} onSetLineNote={onSetLineNote} parentsCons={parentsCons} graph={graph} />
      )}
      {/* NSGC: no children by choice / reason unknown (one bar) or infertile (two bars), shown while they have none */}
      {/* nothing chosen = not marked; a second tap on the chosen one takes it back, like Akrabalık */}
      {onSetChildlessness && children.length === 0 && (
        <div className="field-col">
          <span className="field-label">{t('Çocukları yok')}</span>
          <div className="segmented" role="radiogroup" aria-label={t('Çocukları yok')}>
            {[['by_choice', t('Çocuksuz'), t('Tek kısa çizgi: kendi isteğiyle çocuksuz ya da nedeni bilinmiyor')], ['infertile', t('İnfertil'), t('Çift kısa çizgi: kısırlık (infertilite)')]].map(([v, label, title]) => (
              <button key={v} role="radio" aria-checked={u.childless === v} className={u.childless === v ? 'on' : undefined} title={title}
                onClick={() => onSetChildlessness(u.id, u.childless === v ? null : v)}>{label}</button>
            ))}
          </div>
          {u.childless && (
            <>
              <DraftField key={`${u.id}-childless`} type="text" className="input input-wide" value={u.childlessReason || ''}
                placeholder={t('Nedeni (isteğe bağlı; örneğin azospermi)')} onCommit={v => onSetChildlessness(u.id, undefined, v)} />
              <span className="field-hint">{u.childless === 'infertile' ? t('Çizimde çift kısa çizgi: kısırlık (infertilite).') : t('Çizimde tek kısa çizgi: kendi isteğiyle çocuksuz ya da nedeni bilinmiyor.')}</span>
            </>
          )}
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
          disabled={kind === 'in'} title={kind === 'in' ? t('Bu kişinin biyolojik ebeveynleri çizimde yer almıyor; önce ebeveynleri ekleyin') : undefined}
          onClick={() => onSet(null)}>{t('Yok')}</button>
        <button role="radio" aria-checked={kind === 'out'} className={kind === 'out' ? 'on' : undefined}
          disabled={!hasParents} title={!hasParents ? t('Önce biyolojik ebeveynleri ekleyin') : t('Kişi evlat verildiyse ve evlat edinen aile çizimde yoksa “Evlat verildi” seçilir; aile çizimdeyse (örneğin teyze ve eşi) listeden seçilir.')}
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
      {/* what the drawing shows, once something is chosen; the choices explain themselves (title) */}
      {kind !== 'none' && (
        <span className="field-hint">
          {kind === 'out' ? t('Evlat verildi: sembol köşeli parantez içinde gösterilir ve biyolojik ailesine düz çizgiyle bağlanır. Evlat edinen aile çizimde yer almaz.')
            : kind === 'relative' ? t('Evlat edinildi; biyolojik ve evlat edinen ailesi çizimde yer alır. Biyolojik ailesine düz, evlat edinen ailesine kesikli çizgiyle bağlanır.')
            : t('Evlat edinildi: evlat edinen ailesinin altında, kesikli çizgiyle gösterilir.')}
        </span>
      )}
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
  ['sperm_donor', tk('Sperm donörü'), tk('Çocuğun genetik babası; çizimde D harfiyle gösterilir ve çiftle arasında ilişki çizgisi bulunmaz')],
  ['egg_donor', tk('Yumurta donörü'), tk('Çocuğun genetik annesi; çizimde D harfiyle gösterilir')],
  ['gestational_carrier', tk('Gestasyonel taşıyıcı (G)'), tk('Gebeliği taşır, ancak yumurtası kullanılmaz; çocuk onun altında çizilir')],
  ['surrogate', tk('Taşıyıcı anne (D)'), tk('Hem yumurtasını verir hem de gebeliği taşır; çocuk onun altında çizilir')],
];
function ReproCard({ info, onAdd, onRemove, onSetOwn }) {
  const [who, setWho] = useState('');
  if (!info) return null;
  const { links, canHave, candidates, roleOf, own } = info;
  return (
    <div className="card">
      <div className="card-title">{t('Yardımcı üreme')}</div>
      {roleOf.length > 0 && (
        <span className="field-hint">{roleOf.map(r => t('{child} için {role}', { child: r.childName, role: t(r.label).toLocaleLowerCase(currentLang()) })).join('; ')}. {t('Aile öyküsü not ve bulgu olarak girilebilir.')}</span>
      )}
      {canHave ? (
        <>
          {/* a same-sex couple's child: whose own egg or sperm (clinician 2026-11-10); a second tap takes it back */}
          {own && onSetOwn && (
            <div className="field-col">
              <span className="field-label">{own.gamete === 'egg' ? t('Yumurta kimin?') : t('Sperm kimin?')}</span>
              <div className="segmented" role="radiogroup" aria-label={own.gamete === 'egg' ? t('Yumurta kimin?') : t('Sperm kimin?')}>
                {own.partners.map(p => (
                  <button key={p.id} role="radio" aria-checked={own.current === p.id} className={own.current === p.id ? 'on' : undefined}
                    onClick={() => onSetOwn(own.current === p.id ? null : p.id)}>{p.name}</button>
                ))}
              </div>
              <span className="field-hint">{own.current ? t('Akrabalık ve akrabalık katsayısı bu eş ve donör üzerinden hesaplanır.') : t('Seçim yapılmazsa bilinmiyor kabul edilir ve akrabalık yalnızca donör üzerinden hesaplanır.')}</span>
            </div>
          )}
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
          <span className="field-hint">{t('Donörün ve taşıyıcının ailesi çizilmez; aile öyküleri kendi not ve bulgu alanlarına yazılabilir. Akrabalık katsayısı genetik ebeveynlere göre hesaplanır.')}</span>
        </>
      ) : roleOf.length === 0 && (
        <span className="field-hint">{t('Yardımcı üreme bilgisi girmek için önce bu kişinin anne ve babası (ya da tek ebeveyni) eklenmelidir.')}</span>
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
      <span className="field-hint">{t('Ortak gen oranı (ortak atalardan kalıtılan aynı genlerin beklenen oranı):')} <b>{formatCoefficient(2 * phi)}</b></span>
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
          ? t('Seçili kardeşler tek bir {shape} olarak çizilir ve içine {count} yazılır. Gerektiğinde “Tek tek ayır” ile yeniden ayrılabilirler.', { shape: t(GROUP_SHAPE[made.sex || 'unknown']), count: made.count })
          : check.reason}
      </span>
      <button className="ui-btn" disabled={!made} onClick={() => onMerge(ids)}>{t('Birleştir')}</button>
    </div>
  );
}

function TwoPersonActions({ node, node2, pedigreeData, onCreateUnion, onMakeSiblings, onClearSelection, unionProps, onSetMultipleBirth, bulk, merge }) {
  // Authoritative safety checks (self/duplicate, pregnancy loss, siblings,
  // cross-generation; two different parent unions cannot be merged).
  const allowSameSex = useViewSettings((st) => !!st.view.sameSexPartners);
  const unionPlan = computeUnionCreationPlan(pedigreeData, node.id, node2.id, { allowSameSex });
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
            <span className="field-hint">{t('Kişilerden biri zaten bir ikiz grubundaysa diğeri de bu gruba katılır ve üçüz olarak gösterilirler.')}</span>
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
        <div className="field-hint">{t('İpucu: Cmd (Mac) ya da Ctrl (Windows) tuşu basılıyken kişilere tıklanarak birden çok kişi seçilebilir. İki eşi birleştiren çizgiye tıklandığında o çift seçilir.')}</div>
      </div>
    </>
  );
}

export default function IndividualEditor({
  node, node2, pedigreeData, onUpdate, onAddChild,
  onDeleteIndividual, onCreateUnion, onMakeSiblings,
  onClearSelection, onReorderChild, onSetUnionRelationshipBackground, onSetLineNote, onSetUnionStatus, onSetChildlessness,
  onSetPregnancyKind, onSetGestationWeeks,
  onSetMultipleBirth, onAddMultiple, onSetZygosity, onLeaveMultiple,
  onSetGroupCount, onSplitGroup, mergeCheck, onMergeGroup, adoptionInfo, onSetAdoption, reproInfo, onAddRepro, onRemoveRepro, onSetOwnGamete,
  wizardParents, onSetParentsField,
  selectedNodes = [], onUpdateMany, onSetFindingStatusMany, onAddFindingMany,
}) {
  const { panel } = usePanelPrefs();
  const tip = usePanelTip();
  const [moreFor, setMoreFor] = useState(null); // the person whose "Diğer bilgiler…" is open
  const [whyNotFor, setWhyNotFor] = useState(null); // the proband whose "Kişiyi sil" was tapped
  // closed again whenever the selection changes (also deselecting and selecting the same person)
  const [shownFor, setShownFor] = useState(node ? node.id : null);
  if (shownFor !== (node ? node.id : null)) { setShownFor(node ? node.id : null); setMoreFor(null); setWhyNotFor(null); }
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
          <div className="field-hint">{t('Seçime kişi eklemek ya da seçimden çıkarmak için Cmd (Mac) ya da Ctrl (Windows) tuşu basılıyken o kişiye tıklayın.')}</div>
        </div>
      </>
    );
  }
  if (node && node2) {
    return (
      <TwoPersonActions node={node} node2={node2} pedigreeData={pedigreeData}
        onCreateUnion={onCreateUnion} onMakeSiblings={onMakeSiblings} onClearSelection={onClearSelection}
        unionProps={{ onAddChild, onSetUnionStatus, onSetUnionRelationshipBackground, onSetLineNote, parentsCons, onSetChildlessness }} onSetMultipleBirth={onSetMultipleBirth}
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
  // what the drawing says about the person, as small labels under the number
  const chips = node.placeholder ? [t('Belirtilmemiş ebeveyn')]
    : [kind, node.age ? t('{age} yaş', { age: shownAge(node.age) }) : null, node.proband ? t('Proband') : null,
      node.consultand ? t('Danışan') : null, node.deceased && !isLoss ? t('Vefat') : null].filter(Boolean);
  const set = (patch) => onUpdate(node.id, patch);
  const gLines = geneticLines(node);
  // the clinician's own panel (Ayarlar → Yan panel; clinician request 2026-11-02): a hidden
  // part waits under "Diğer bilgiler…"; a part that holds something for this person shows anyway
  const person = !node.placeholder && !group;
  const applies = {
    genetic: person, adoption: person && !isLoss, sexAtBirth: person && !isLoss, recordsReviewed: person && !isLoss,
    birthOrder: !!onReorderChild && !!siblingOrder && siblingOrder.length > 1,
    lmp: !!node.ongoingPregnancy, repro: person && !!onAddRepro,
  };
  const holds = {
    genetic: !!node.geneticTest || gLines.length > 0, adoption: !!(adoptionInfo && adoptionInfo.current),
    sexAtBirth: !!node.sexAtBirth, recordsReviewed: !!node.recordsReviewed, birthOrder: !!ownParentRel?.birthOrderExplicit, lmp: !!node.lmp,
    repro: !!(reproInfo && (reproInfo.links.length || reproInfo.roleOf.length || reproInfo.own)),
  };
  const moreOpen = moreFor === node.id;
  const tucked = PANEL_PARTS.filter(x => applies[x.id] && !holds[x.id] && panel.hidden.includes(x.id));
  const shows = (id) => applies[id] && (holds[id] || moreOpen || !panel.hidden.includes(id));

  return (
    <>
      <Header title={pedigreeId || '—'} kin={!node.placeholder && pedigreeData ? kinTerm(pedigreeData, node.id) : null} chips={chips} glyph={<PersonGlyph p={node} />} onClose={onClearSelection} />
      <div className="editor-body">
        {node.placeholder && (
          <div className="field-hint">{t('Bu boş sembol, silinmiş ya da bilinmeyen bir ebeveynin yerini tutar; çocukların ebeveyn bağının korunması için çizilir.')}</div>
        )}

        {/* said once on this device, then out of the way (clinician 2026-11-05: the panel was too wordy) */}
        {!node.placeholder && !tip.seen && (
          <div className="editor-tip">
            <span className="field-hint">{t('Akraba eklemek ya da bulgu, durum, ikiz ve not girmek için çizimde bu kişinin çevresindeki düğmeleri kullanabilirsiniz. Düğmeler görünmüyorsa kişinin sembolüne yeniden tıklayın.')}</span>
            <button className="ui-btn ui-btn-sm ui-btn-ghost" onClick={tip.dismiss}>{t('Anladım')}</button>
          </div>
        )}

        {/* several people in one symbol: the number, the sex, "Tek tek ayır" (clinician decisions 2026-11-01) */}
        {group && (
          <div className="card">
            <div className="card-title">{t('Birden çok kişi')}</div>
            <div className="field-hint">{t('Bu sembol birden çok kişiyi gösterir ve kişi sayısı sembolün içine yazılır. Bulgu, eş, çocuk ya da proband bilgisi girilecekse kişiler “Tek tek ayır” ile ayrı ayrı çizilmelidir.')}</div>
            <label className="field">
              <span className="field-label">{t('Kişi sayısı')}</span>
              <DraftField key={`${node.id}-count`} type="text" className="input input-age" value={String(node.count)} placeholder={t('3 ya da n')}
                title={t('2 ile 99 arasında bir sayı; bilinmiyorsa n. 1 yazıldığında sembol tek kişiyi gösterir.')}
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
            {shows('lmp') && (
              <label className="field">
                <span className="field-label">{t('Son adet tarihi')}</span>
                <DraftField key={`${node.id}-lmp`} type="text" inputMode="numeric" className="input birth-date" value={formatDate(node.lmp)} placeholder={t('gg.aa.yyyy')}
                  title={t('Süren gebelikte son adet tarihi; çizimde P harfinin altında gösterilir. Tarih kısaltılarak da yazılabilir (3.5.26).')}
                  onCommit={v => set({ lmp: v.trim() })} />
              </label>
            )}
            {node.ongoingPregnancy && (
              <button className="ui-btn" onClick={() => onSetPregnancyKind(node.id, '')}>{t('Bebek doğdu: gebelik yerine kişi olarak gösterilsin')}</button>
            )}
          </div>
        )}

        {!node.placeholder && !group && (
          <div className="card">
            <div className="card-title">{t('Bilgiler')}</div>
            {/* two free texts, each saying where it goes (clinician question 2026-11-03): a short name
                under the symbol, and a note in the numbered Notes under the pedigree */}
            <NameField node={node} set={set} where={false} />
            <NoteField node={node} set={set} where={false} />
            <span className="field-hint card-foot">{t('Ad sembolün altında, not ise pedigrinin altında kişinin numarasıyla birlikte gösterilir.')}</span>
            {!isLoss && <AgeField node={node} set={set} />}
            {shows('recordsReviewed') && (
              <label className="check">
                <input type="checkbox" checked={!!node.recordsReviewed} onChange={e => set({ recordsReviewed: e.target.checked })} />
                {t('Kayıtlarla doğrulandı (*)')}
                <span className="field-hint">{t('Bulgular tıbbi kayıt, epikriz ya da test raporu incelenerek doğrulandıysa işaretleyin; sembolün sağ alt köşesinde yıldız (*) gösterilir (NSGC 2022). Yalnızca aileden edinilen bilgi işaretlenmez.')}</span>
              </label>
            )}
            {shows('sexAtBirth') && (
              <div className="field-col">
                <span className="field-label">{t('Doğumda atanan cinsiyet')}</span>
                <div className="segmented" role="radiogroup" aria-label={t('Doğumda atanan cinsiyet')}>
                  {[['', '—'], ['AMAB', 'AMAB'], ['AFAB', 'AFAB'], ['UAAB', 'UAAB']].map(([v, label]) => (
                    <button key={v} role="radio" aria-checked={(node.sexAtBirth || '') === v} className={(node.sexAtBirth || '') === v ? 'on' : undefined}
                      onClick={() => set({ sexAtBirth: v })}>{label}</button>
                  ))}
                </div>
                <span className="field-hint">{t('Sembol kişinin cinsiyet kimliğini gösterir. Doğumda atanan cinsiyet farklıysa burada seçilir ve sembolün altına yazılır (AMAB: doğumda erkek olarak atanmış, AFAB: doğumda kadın olarak atanmış, UAAB: doğumda atanmamış; NSGC 2022).')}</span>
              </div>
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
            {shows('genetic') && <GeneticField node={node} set={set} individuals={pedigreeData?.individuals || []} />}
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

        {shows('adoption') && (
          <AdoptionCard info={adoptionInfo} onSet={to => onSetAdoption(node.id, to)} />
        )}

        {shows('repro') && (
          <ReproCard key={node.id} info={reproInfo} onAdd={(role, opts) => onAddRepro(node.id, role, opts)} onRemove={pid => onRemoveRepro(node.id, pid)}
            onSetOwn={onSetOwnGamete && ((pid) => onSetOwnGamete(node.id, pid))} />
        )}

        {!node.placeholder && !group && (
          <MultiplesCard node={node} pedigreeData={pedigreeData} displayNameFor={displayNameFor}
            onAddMultiple={onAddMultiple} onSetZygosity={onSetZygosity} onLeaveMultiple={onLeaveMultiple} />
        )}

        {!isLoss && !node.placeholder && existingUnions.map(u => {
          const partnerId = u.partners.find(p => p !== node.id);
          const partner = pedigreeData?.individuals?.find(i => i.id === partnerId);
          // the number and the name the clinician wrote; never the program's own label ("Es (K)")
          const partnerName = [pedigreeIds.get(partnerId)?.displayId, partner?.displayLabel].filter(Boolean).join(' ');
          return (
          <div className="card" key={u.id}>
            <div className="card-title partner-title"><PersonGlyph p={partner} size={20} />{t('Eş')}{partnerName ? <> <span className="partner-name">{partnerName}</span></> : null}</div>
            <UnionControls u={u} pcrs={pcrs} onSetUnionStatus={onSetUnionStatus} withChildren={false} graph={pedigreeData}
              onSetUnionRelationshipBackground={onSetUnionRelationshipBackground} onSetLineNote={onSetLineNote} parentsCons={parentsCons} onSetChildlessness={onSetChildlessness} />
          </div>
          );
        })}

        {/* moves this child within its own sibship only, never to another union */}
        {shows('birthOrder') && (
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

        {/* the parts hidden in Ayarlar → Yan panel, one tap away */}
        {(tucked.length > 0 || moreOpen) && (
          <button className="list-row more-parts" aria-expanded={moreOpen} onClick={() => setMoreFor(moreOpen ? null : node.id)}
            title={moreOpen ? undefined : tucked.map(x => t(x.label)).join(', ')}>
            <span>{moreOpen ? t('Daha az') : t('Diğer bilgiler ({n})', { n: tucked.length })}</span>
            {moreOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          </button>
        )}

        {/* anyone but the proband can be deleted; children stay with the other parent. The
            proband's reason is said when it is asked for, not all the time */}
        {onDeleteIndividual && !node.placeholder && (
          <button className="list-row list-row-danger" aria-describedby={whyNotFor === node.id ? 'delete-why' : undefined} onClick={() => {
              if (node.proband) { setWhyNotFor(node.id); return; }
              if (window.confirm(t('“{name}” silinsin mi?\n\nKişinin çocukları silinmez; diğer ebeveynlerine bağlı kalır ve silinen kişinin yerinde boş bir “belirtilmemiş ebeveyn” sembolü gösterilir. Kişinin çocuğu olmayan eş ilişkileri de kaldırılır.\n\nSilme işlemi “Geri al” ile geri alınabilir.', { name: displayNameFor(node.id) }))) {
                onDeleteIndividual(node.id);
              }
            }}>
              <Trash2 size={15} aria-hidden="true" /> <span>{t('Kişiyi sil')}</span>
          </button>
        )}
        {whyNotFor === node.id && node.proband && (
          <div id="delete-why" className="field-hint" role="status">{t('Proband silinemez. Silmeden önce başka bir kişinin proband olarak işaretlenmesi gerekir (Durum → Proband).')}</div>
        )}
      </div>
    </>
  );
}
