/**
 * FindingsPalette.jsx — a person's findings, quick enough to use while taking
 * the history (clinician request 2026-10-24): every finding of the pedigree
 * with its mark (region + fill, as in the legend) and one click for
 * none / affected / carrier; a new finding with a suggested, changeable
 * region and fill; the mark of an existing finding can be changed for
 * everyone. Used in the ring menu and in the right panel.
 */
import { useId, useState } from 'react';
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
          <button key={r} className={`style-opt${value.region === r ? ' on' : ''}`} title={REGION_LABEL[r]} aria-label={REGION_LABEL[r]}
            disabled={isTaken({ region: r, fill: value.fill })} onClick={() => onChange({ ...value, region: r })}>
            <FindingGlyph region={r} fill="solid" />
          </button>
        ))}
      </div>
      <div className="style-row">
        {FILLS.map(f => (
          <button key={f} className={`style-opt${value.fill === f ? ' on' : ''}`} title={FILL_LABEL[f]} aria-label={FILL_LABEL[f]}
            disabled={isTaken({ region: value.region, fill: f })} onClick={() => onChange({ ...value, fill: f })}>
            <FindingGlyph region={value.region} fill={f} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FindingsPalette({ node, conditionKey = [], onSetStatus, onAdd, onSetStyle, compact = false }) {
  const [draft, setDraft] = useState('');
  const [style, setStyle] = useState(null);
  const [editing, setEditing] = useState(null);
  const shape = node.sex === 'female' ? 'circle' : 'square';
  const conds = Array.isArray(node.conditions) ? node.conditions : [];
  const stateOf = (label) => {
    const c = conds.find(x => normLabel(x.label) === normLabel(label));
    return !c ? 'none' : c.status === 'affected' ? 'affected' : c.status === 'carrier' ? 'carrier' : 'none';
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
                <button className="finding-glyph" title="Bölge ve dolguyu değiştir (herkes için)"
                  onClick={() => setEditing(editing === e.id ? null : e.id)}>
                  <FindingGlyph region={e.region} fill={e.fill} shape={shape} carrier={st === 'carrier'} />
                </button>
                <span className="finding-name" title={e.label}>{e.label}</span>
                <div className="segmented finding-state" role="radiogroup" aria-label={e.label}>
                  {[['none', 'Yok'], ['affected', 'Var'], ['carrier', 'Taşıyıcı']].map(([v, t]) => (
                    <button key={v} className={st === v ? 'on' : undefined} role="radio" aria-checked={st === v}
                      onClick={() => onSetStatus(node.id, e.label, v)}>{t}</button>
                  ))}
                </div>
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
          <input type="text" className="input" value={draft} placeholder="Yeni bulgu, örn. miyop"
            onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} />
          <button className="ui-btn ui-btn-sm ui-btn-primary" disabled={!draft.trim()} onClick={add}>Ekle</button>
        </div>
        {draft.trim() && (
          <StylePicker value={suggested} isTaken={(st2) => styleTaken(conditionKey, st2)} onChange={setStyle} />
        )}
        </>
      ) : (
        <div className="field-hint finding-limit" role="alert">{KEY_FULL_MESSAGE}</div>
      )}
    </div>
  );
}
