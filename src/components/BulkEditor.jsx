/**
 * BulkEditor.jsx — several people at once (clinician request 2026-10-24):
 * affected / carrier / deceased and findings for everyone selected, each
 * change one undo step. Shown when two or more people are selected
 * (Cmd/Ctrl-click).
 */
import { useState } from 'react';
import { FindingGlyph, StylePicker } from './FindingsPalette';
import { normLabel, suggestStyle, styleTaken, KEY_FULL_MESSAGE } from '../graph/conditionKey';

const findingState = (p, label) => {
  const c = (Array.isArray(p.conditions) ? p.conditions : []).find(x => normLabel(x.label) === normLabel(label));
  return !c ? 'none' : c.status === 'affected' ? 'affected' : c.status === 'carrier' ? 'carrier' : 'none';
};

export default function BulkEditor({ nodes, conditionKey = [], onUpdateMany, onSetFindingStatusMany, onAddFindingMany }) {
  const [draft, setDraft] = useState('');
  const [style, setStyle] = useState(null);
  const ids = nodes.map(n => n.id);
  const living = nodes.filter(n => !n.pregnancyLoss && !n.stillbirth);
  const flag = (key, list = nodes) => {
    const on = list.filter(n => !!n[key]).length;
    return on === 0 ? 'none' : on === list.length ? 'all' : 'some';
  };
  const toggle = (key, list = nodes) => onUpdateMany(list.map(n => n.id), { [key]: flag(key, list) !== 'all' });
  const chip = (key, label, list = nodes) => {
    const st = flag(key, list);
    return (
      <button key={key} className={`chip${st === 'all' ? ' on' : st === 'some' ? ' chip-carrier' : ''}`} aria-pressed={st === 'all'}
        title={st === 'some' ? 'Bazılarında var — tıklayınca hepsine' : undefined} onClick={() => toggle(key, list)} disabled={!list.length}>
        {label}{st === 'some' ? ' (bazıları)' : ''}
      </button>
    );
  };
  const suggested = style || suggestStyle(conditionKey);
  const add = () => {
    if (!draft.trim()) return;
    onAddFindingMany(ids, draft.trim(), suggested);
    setDraft('');
    setStyle(null);
  };
  return (
    <div className="card">
      <div className="card-title">Hepsine birden ({nodes.length} kişi)</div>
      <div className="chips">
        {chip('affected', 'Etkilenmiş')}
        {chip('carrier', 'Taşıyıcı')}
        {chip('deceased', 'Vefat', living)}
      </div>
      {conditionKey.length > 0 && (
        <div className="findings-list">
          {conditionKey.map(e => {
            const states = new Set(nodes.map(n => findingState(n, e.label)));
            const st = states.size === 1 ? [...states][0] : null;
            return (
              <div key={e.id} className="finding-row">
                <span className="finding-glyph"><FindingGlyph region={e.region} fill={e.fill} /></span>
                <span className="finding-name" title={e.label}>{e.label}{st === null ? ' · karışık' : ''}</span>
                <div className="segmented finding-state" role="radiogroup" aria-label={e.label}>
                  {[['none', 'Yok'], ['affected', 'Var'], ['carrier', 'Taşıyıcı']].map(([v, t]) => (
                    <button key={v} className={st === v ? 'on' : undefined} role="radio" aria-checked={st === v}
                      onClick={() => onSetFindingStatusMany(ids, e.label, v)}>{t}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {suggested ? (
        <>
        <div className="finding-new">
          <FindingGlyph region={suggested.region} fill={suggested.fill} />
          <input type="text" className="input" value={draft} placeholder="Yeni bulgu (hepsine)"
            onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} />
          <button className="ui-btn ui-btn-sm ui-btn-primary" disabled={!draft.trim()} onClick={add}>Ekle</button>
        </div>
        {draft.trim() && <StylePicker value={suggested} isTaken={(st2) => styleTaken(conditionKey, st2)} onChange={setStyle} />}
        </>
      ) : (
        <div className="field-hint finding-limit" role="alert">{KEY_FULL_MESSAGE}</div>
      )}
    </div>
  );
}
