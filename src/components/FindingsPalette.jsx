/**
 * FindingsPalette.jsx — a person's findings, quick enough to use while taking
 * the history (clinician request 2026-10-24): every finding of the pedigree
 * with its mark (region + fill, as in the legend) and one click for
 * none / affected / carrier; a new finding with a suggested, changeable
 * region and fill; the mark of an existing finding can be changed for
 * everyone. Used in the ring menu and in the right panel.
 */
import { useId, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { t } from '../i18n';
import DraftField from './DraftField';
import { REGIONS, REGION_LABEL, FILLS, FILL_LABEL, REGION_ANGLES, suggestStyle, styleTaken, normLabel, KEY_FULL_MESSAGE } from '../graph/conditionKey';

const INK = '#1e293b';

/** A small symbol with one finding's mark, the way the drawing shows it. */
export function FindingGlyph({ region = 'q1', fill = 'solid', carrier = false, shape = 'square', size = 18 }) {
  const uid = useId().replace(/:/g, '');
  const s = 8;
  // a carrier is drawn on the left half (clinician decision 2026-10-25)
  const [a0, a1] = carrier ? [90, 270] : (REGION_ANGLES[region] || REGION_ANGLES.q1);
  const p = (a) => [14 * Math.cos((a * Math.PI) / 180), 14 * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  const paint = { solid: INK, grey: '#9ca3af', hatch: `url(#h${uid})`, dots: `url(#d${uid})` }[fill] || INK;
  const outline = shape === 'circle'
    ? <circle r={s} />
    : <rect x={-s} y={-s} width={2 * s} height={2 * s} />;
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" aria-hidden="true">
      <defs>
        <pattern id={`h${uid}`} patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(45)">
          <rect width="3" height="3" fill="#fff" /><line x1="0" y1="0" x2="0" y2="3" stroke={INK} strokeWidth="1.2" />
        </pattern>
        <pattern id={`d${uid}`} patternUnits="userSpaceOnUse" width="3" height="3">
          <rect width="3" height="3" fill="#fff" /><circle cx="1.5" cy="1.5" r="0.7" fill={INK} />
        </pattern>
        <clipPath id={`c${uid}`}>{outline}</clipPath>
      </defs>
      <g fill="#fff">{outline}</g>
      <g clipPath={`url(#c${uid})`}>
        <path d="M0,-14V14M-14,0H14" stroke={INK} strokeWidth="0.7" />
        <path d={`M0,0L${x0},${y0}A14,14 0 0 1 ${x1},${y1}Z`} fill={paint} stroke="#fff" strokeWidth="1" />
      </g>
      <g fill="none" stroke={INK} strokeWidth="1.4">{outline}</g>
    </svg>
  );
}

export function StylePicker({ value, onChange, isTaken }) {
  return (
    <div className="style-picker">
      <div className="style-row">
        {REGIONS.map(r => (
          <button key={r} className={`style-opt${value.region === r ? ' on' : ''}`} title={t(REGION_LABEL[r])} aria-label={t(REGION_LABEL[r])}
            disabled={isTaken({ region: r, fill: value.fill })} onClick={() => onChange({ ...value, region: r })}>
            <FindingGlyph region={r} fill="solid" />
          </button>
        ))}
      </div>
      <div className="style-row">
        {FILLS.map(f => (
          <button key={f} className={`style-opt${value.fill === f ? ' on' : ''}`} title={t(FILL_LABEL[f])} aria-label={t(FILL_LABEL[f])}
            disabled={isTaken({ region: value.region, fill: f })} onClick={() => onChange({ ...value, fill: f })}>
            <FindingGlyph region={value.region} fill={f} />
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
      <button className="finding-name finding-name-btn" title={t('Adı düzeltmek için tıklayın (bu bulgusu olan herkeste ve açıklamada düzelir)')}
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

export default function FindingsPalette({ node, conditionKey = [], onSetStatus, onAdd, onSetStyle, onSetOnset, onRename, compact = false }) {
  const [draft, setDraft] = useState('');
  const [style, setStyle] = useState(null);
  const [editing, setEditing] = useState(null);
  const shape = node.sex === 'female' ? 'circle' : 'square';
  const conds = Array.isArray(node.conditions) ? node.conditions : [];
  const stateOf = (label) => {
    const c = conds.find(x => normLabel(x.label) === normLabel(label));
    return !c ? 'none' : ['affected', 'carrier', 'unknown'].includes(c.status) ? c.status : 'none';
  };
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
            return (
              <div key={e.id} className="finding-row">
                <button className="finding-glyph" title={t('Bu bulgunun sembolde gösterildiği yeri ve deseni değiştir (bu bulgusu olan herkeste değişir)')}
                  onClick={() => setEditing(editing === e.id ? null : e.id)}>
                  <FindingGlyph region={e.region} fill={e.fill} shape={shape} carrier={st === 'carrier'} />
                </button>
                <FindingName key={e.label} label={e.label} onRename={onRename} />
                <div className="segmented finding-state" role="radiogroup" aria-label={e.label}>
                  {[['none', t('Yok')], ['affected', t('Var')], ['carrier', t('Taşıyıcı')], ['unknown', '?']].map(([v, label]) => (
                    <button key={v} className={st === v ? 'on' : undefined} role="radio" aria-checked={st === v}
                      title={{ none: t('Bu kişide bu bulgu yok'), affected: t('Bu kişide bu bulgu var (hasta)'), carrier: t('Bu kişi hasta değil, taşıyıcı'), unknown: t('Bilinmiyor: bu kişide olup olmadığından emin değilim') }[v]} aria-label={v === 'unknown' ? t('Bilinmiyor') : undefined}
                      onClick={() => onSetStatus(node.id, e.label, v)}>{label}</button>
                  ))}
                </div>
                {/* the age it was diagnosed at (shown in the notes; clinician decision 2026-10-25) */}
                {onSetOnset && (st === 'affected' || st === 'carrier') && (
                  <label className="finding-onset">
                    <span>{t('Tanı yaşı')}</span>
                    <DraftField key={`${node.id}-${e.id}-onset`} type="text" className="input input-age" placeholder={t('12, 3 ay')} aria-label={t('Tanı yaşı')}
                      value={(conds.find(x => normLabel(x.label) === normLabel(e.label)) || {}).onsetAge || ''}
                      onCommit={v => onSetOnset(node.id, e.label, v.trim())} />
                  </label>
                )}
                {editing === e.id && (
                  <StylePicker value={{ region: e.region, fill: e.fill }}
                    isTaken={(st2) => styleTaken(conditionKey, st2, e.label)}
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
          <FindingGlyph region={suggested.region} fill={suggested.fill} shape={shape} />
          <input type="text" className="input" value={draft} placeholder={t('Yeni bulgu, ör. miyop')} aria-label={t('Yeni bulgunun adı')}
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
