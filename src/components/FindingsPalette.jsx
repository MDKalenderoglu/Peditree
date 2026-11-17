/**
 * FindingsPalette.jsx — a person's findings, quick enough to use while taking
 * the history (clinician request 2026-10-24): every finding of the pedigree
 * with its mark (its fill, as in the legend) and one click for
 * none / affected / carrier; a new finding with a suggested, changeable
 * fill; the mark of an existing finding can be changed for
 * everyone. Used in the ring menu and in the right panel.
 */
import { useId, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import CarrierBasisChoice from './CarrierBasis';
import { t } from '../i18n';
import DraftField from './DraftField';
import { FILLS, FILL_LABEL, suggestStyle, styleTaken, normLabel, KEY_FULL_MESSAGE } from '../graph/conditionKey';
import { useShownKey, shownEntry, movedOffBlack } from '../utils/shownKey';

const INK = '#1e293b';

/** A small symbol with one finding's mark, the way the drawing shows it: the whole symbol, a carrier the left half. */
export function FindingGlyph({ fill = 'solid', carrier = false, shape = 'square', size = 18 }) {
  const uid = useId().replace(/:/g, '');
  const s = 8;
  const pat = (id, rotate, inner) => (
    <pattern id={`${id}${uid}`} patternUnits="userSpaceOnUse" width="3" height="3" patternTransform={rotate ? `rotate(${rotate})` : undefined}>
      <rect width="3" height="3" fill="#fff" />{inner}
    </pattern>
  );
  const paint = {
    solid: INK, hatch: `url(#h${uid})`, dots: `url(#d${uid})`, horiz: `url(#x${uid})`,
    vert: `url(#v${uid})`, back: `url(#b${uid})`, checker: `url(#c${uid})`, grid: `url(#g${uid})`, bands: `url(#s${uid})`, zigzag: `url(#z${uid})`,
  }[fill] || INK;
  const outline = shape === 'circle'
    ? <circle r={s} />
    : <rect x={-s} y={-s} width={2 * s} height={2 * s} />;
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" aria-hidden="true">
      <defs>
        {pat('h', 45, <line x1="0" y1="0" x2="0" y2="3" stroke={INK} strokeWidth="1.2" />)}
        {pat('b', -45, <line x1="0" y1="0" x2="0" y2="3" stroke={INK} strokeWidth="1.2" />)}
        {pat('x', 0, <line x1="0" y1="1.5" x2="3" y2="1.5" stroke={INK} strokeWidth="1" />)}
        {pat('v', 0, <line x1="1.5" y1="0" x2="1.5" y2="3" stroke={INK} strokeWidth="1" />)}
        {pat('d', 0, <circle cx="1.5" cy="1.5" r="0.7" fill={INK} />)}
        {pat('c', 0, <><rect width="1.5" height="1.5" fill={INK} /><rect x="1.5" y="1.5" width="1.5" height="1.5" fill={INK} /></>)}
        {pat('g', 0, <><line x1="0" y1="0.4" x2="3" y2="0.4" stroke={INK} strokeWidth="0.8" /><line x1="0.4" y1="0" x2="0.4" y2="3" stroke={INK} strokeWidth="0.8" /></>)}
        {pat('s', 45, <rect width="1.6" height="3" fill={INK} />)}
        {pat('z', 0, <path d="M0,2.2L0.75,0.8L1.5,2.2L2.25,0.8L3,2.2" fill="none" stroke={INK} strokeWidth="0.7" />)}
        <clipPath id={`k${uid}`}>{outline}</clipPath>
      </defs>
      <g fill="#fff">{outline}</g>
      <g clipPath={`url(#k${uid})`}>
        {carrier
          ? <><rect x="-10" y="-10" width="10" height="20" fill={paint} /><path d="M0,-10V10" stroke={INK} strokeWidth="1" /></>
          : <rect x="-10" y="-10" width="20" height="20" fill={paint} />}
      </g>
      <g fill="none" stroke={INK} strokeWidth="1.4">{outline}</g>
    </svg>
  );
}

export function StylePicker({ value, onChange, isTaken, note }) {
  return (
    <div className="style-picker">
      {note && <div className="field-hint style-picker-note">{note}</div>}
      <div className="style-row">
        {FILLS.map(f => (
          <button key={f} className={`style-opt${value.fill === f ? ' on' : ''}`} title={t(FILL_LABEL[f])} aria-label={t(FILL_LABEL[f])}
            disabled={isTaken({ fill: f })} onClick={() => onChange({ fill: f })}>
            <FindingGlyph fill={f} />
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A finding's name, corrected where it stands (clinician request 2026-11-03:
 * a typo noticed after Enter must still be fixable). A click opens it; Enter
 * or leaving the box saves, Escape keeps the old name. The name changes for
 * everyone with this finding and in the key (findings.renameFinding).
 */
function FindingName({ label, onRename }) {
  const [text, setText] = useState(null); // null: not being corrected
  const cancelled = useRef(false);
  if (!onRename) return <span className="finding-name" title={label}>{label}</span>;
  if (text === null) {
    return (
      <button className="finding-name finding-name-btn" title={t('Adı düzeltmek için tıklayın; değişiklik bu bulguya sahip herkese ve açıklamaya yansır')}
        aria-label={t('{label}: adı düzelt', { label })} onClick={() => { cancelled.current = false; setText(label); }}>
        <span className="finding-name-text">{label}</span><Pencil size={12} aria-hidden="true" />
      </button>
    );
  }
  const done = () => {
    const name = text.trim();
    setText(null);
    if (!cancelled.current && name && name !== label) onRename(label, name);
  };
  return (
    <input className="input finding-name-edit" value={text} autoFocus aria-label={t('Bulgunun adı')}
      onFocus={(e) => e.currentTarget.select()} onChange={(e) => setText(e.target.value)} onBlur={done}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') { e.stopPropagation(); cancelled.current = true; e.currentTarget.blur(); } // only the correction ends
      }} />
  );
}

export default function FindingsPalette({ node, conditionKey = [], people, onSetStatus, onAdd, onSetStyle, onSetOnset, onRename, onRemove, compact = false }) {
  const shownKey = useShownKey(conditionKey, people);
  const [draft, setDraft] = useState('');
  const [style, setStyle] = useState(null);
  const [editing, setEditing] = useState(null);
  // the finding whose removal from the whole pedigree is being asked about (clinician request 2026-11-17)
  const [removing, setRemoving] = useState(null);
  // "Taşıyıcı" for a finding: what it rests on is asked before it is set (clinician decision 2026-11-17)
  const [asking, setAsking] = useState(null);
  const holders = (label) => (people || []).filter((p) => Array.isArray(p.conditions) && p.conditions.some((c) => c && normLabel(c.label) === normLabel(label))).length;
  const shape = node.sex === 'female' ? 'circle' : 'square';
  const conds = Array.isArray(node.conditions) ? node.conditions : [];
  const stateOf = (label) => {
    const c = conds.find(x => normLabel(x.label) === normLabel(label));
    return !c ? 'none' : ['affected', 'carrier', 'unknown'].includes(c.status) ? c.status : 'none';
  };
  const basisOf = (label) => (conds.find(x => normLabel(x.label) === normLabel(label)) || {}).basis;
  const suggested = style || suggestStyle(conditionKey);
  const add = () => {
    if (!draft.trim()) return;
    onAdd(node.id, draft.trim(), suggested);
    setDraft('');
    setStyle(null);
  };
  return (
    <div className={`findings${compact ? ' findings-compact' : ''}`}>
      {conditionKey.length > 0 && (
        <div className="findings-list">
          {conditionKey.map(e => {
            const st = stateOf(e.label);
            const shown = shownEntry(shownKey, e);
            const reserved = movedOffBlack(e, shown);
            return (
              <div key={e.id} className="finding-row">
                <button className="finding-glyph" title={t('Bulgunun sembolde gösterildiği deseni değiştirir; değişiklik bu bulguya sahip herkese uygulanır')}
                  onClick={() => setEditing(editing === e.id ? null : e.id)}>
                  <FindingGlyph fill={shown.fill} shape={shape} carrier={st === 'carrier'} />
                </button>
                <FindingName key={e.label} label={e.label} onRename={onRename} />
                <div className="segmented finding-state" role="radiogroup" aria-label={e.label}>
                  {[['none', t('Yok')], ['affected', t('Var')], ['carrier', t('Taşıyıcı')], ['unknown', '?']].map(([v, label]) => (
                    <button key={v} className={st === v ? 'on' : undefined} role="radio" aria-checked={st === v}
                      title={{ none: t('Bu kişide bu bulgu yok'), affected: t('Bu kişide bu bulgu var (hasta)'), carrier: t('Bu kişi hasta değil, taşıyıcı'), unknown: t('Bilinmiyor: bulgunun bu kişide bulunup bulunmadığı bilinmiyor') }[v]} aria-label={v === 'unknown' ? t('Bilinmiyor') : undefined}
                      onClick={() => (v === 'carrier' ? setAsking(st === 'carrier' || asking === e.id ? null : e.id) : (setAsking(null), onSetStatus(node.id, e.label, v)))}>{label}</button>
                  ))}
                </div>
                {/* the age it was diagnosed at, free text right beside the finding (shown in the notes;
                    clinician decisions 2026-10-25, 2026-11-07) */}
                {onSetOnset && (st === 'affected' || st === 'carrier') && (
                  <label className="finding-onset" title={t('Tanı yaşı (örneğin 12, 3 ay ya da “çocuklukta”); notlarda gösterilir')}>
                    <DraftField key={`${node.id}-${e.id}-onset`} type="text" className="input input-age" placeholder={t('tanı yaşı')} aria-label={t('Tanı yaşı')}
                      value={(conds.find(x => normLabel(x.label) === normLabel(e.label)) || {}).onsetAge || ''}
                      onCommit={v => onSetOnset(node.id, e.label, v.trim())} />
                  </label>
                )}
                {(asking === e.id || (st === 'carrier' && !basisOf(e.label))) && (
                  <div className="finding-basis">
                    <CarrierBasisChoice value={st === 'carrier' ? basisOf(e.label) : undefined}
                      onPick={(b) => { setAsking(null); onSetStatus(node.id, e.label, 'carrier', b); }} />
                  </div>
                )}
                {onRemove && (
                  <button className="finding-remove" title={t('Bulguyu pedigriden siler: bu bulguya sahip herkesten ve açıklamadan kaldırılır')}
                    aria-label={t('{label}: bulguyu sil', { label: e.label })} onClick={() => setRemoving(removing === e.id ? null : e.id)}>
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )}
                {removing === e.id && (
                  <div className="finding-remove-ask" role="alertdialog" aria-label={t('{label}: bulguyu sil', { label: e.label })}>
                    <span>{t('“{label}” {n} kişiden ve açıklamadan silinecek.', { label: e.label, n: holders(e.label) })}</span>
                    <button className="ui-btn ui-btn-sm" onClick={() => setRemoving(null)}>{t('Vazgeç')}</button>
                    <button className="ui-btn ui-btn-sm ui-btn-danger-solid" onClick={() => { setRemoving(null); onRemove(e.label); }}>{t('Sil')}</button>
                  </div>
                )}
                {editing === e.id && (
                  <StylePicker value={{ fill: shown.fill }}
                    isTaken={(st2) => styleTaken(conditionKey, st2, e.label) || (reserved && st2.fill === 'solid')}
                    note={reserved ? t('Siyah, bu çizimde adı girilmemiş taşıyıcılık ya da etkilenmişlik için kullanıldığından bu bulgu çizimde bu desenle gösteriliyor.') : null}
                    onChange={(st2) => onSetStyle(e.label, st2)} />
                )}
              </div>
            );
          })}
        </div>
      )}
      {suggested ? (
        <>
        <div className="finding-new">
          <FindingGlyph fill={suggested.fill} shape={shape} />
          <input type="text" className="input" value={draft} placeholder={t('Yeni bulgu (örneğin miyopi)')} aria-label={t('Yeni bulgunun adı')}
            onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} />
          <button className="ui-btn ui-btn-sm ui-btn-primary" disabled={!draft.trim()} onClick={add}>{t('Ekle')}</button>
        </div>
        {draft.trim() && (
          <StylePicker value={suggested} isTaken={(st2) => styleTaken(conditionKey, st2)} onChange={setStyle} />
        )}
        </>
      ) : (
        <div className="field-hint finding-limit" role="alert">{t(KEY_FULL_MESSAGE)}</div>
      )}
    </div>
  );
}
