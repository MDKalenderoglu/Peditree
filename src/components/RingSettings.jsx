/**
 * RingSettings.jsx — Ayarlar → "Halka menü" (clinician request 2026-11-01):
 * which rows and choices the ring shows, and in what order. A hidden choice
 * stays in the ring under "Diğer…"; the four directions, the sex choices
 * and the corner buttons do not change (ringPrefs.js).
 */
import { ArrowUp, ArrowDown } from 'lucide-react';
import { useRingPrefs, RING_ROWS, RING_PREGNANCY, RING_STATUS, DEFAULT_RING, moveInRing, toggleInRing } from '../utils/ringPrefs';

function OrderedList({ list, items, ring, setRing, children }) {
  const byId = new Map(items.map((x) => [x.id, x]));
  return (
    <ol className="ring-list">
      {ring[list].map((id, k) => (
        <li key={id}>
          <label className="check">
            <input type="checkbox" checked={!ring.hidden.includes(id)} onChange={() => setRing(toggleInRing(ring, id))} />
            {byId.get(id).label}
          </label>
          <span className="ring-move">
            <button className="ui-btn ui-btn-ghost ui-btn-icon" disabled={k === 0} aria-label={`${byId.get(id).label}: yukarı`} title="Yukarı"
              onClick={() => setRing(moveInRing(ring, list, id, -1))}><ArrowUp size={14} /></button>
            <button className="ui-btn ui-btn-ghost ui-btn-icon" disabled={k === ring[list].length - 1} aria-label={`${byId.get(id).label}: aşağı`} title="Aşağı"
              onClick={() => setRing(moveInRing(ring, list, id, 1))}><ArrowDown size={14} /></button>
          </span>
          {children && children(id)}
        </li>
      ))}
    </ol>
  );
}

export default function RingSettings() {
  const { ring, setRing } = useRingPrefs();
  const changed = JSON.stringify(ring) !== JSON.stringify(DEFAULT_RING);
  return (
    <div className="settings-group">
      <div className="more-title">Halka menü</div>
      <p className="share-note">Kişinin çevresindeki halkada sık kullandıklarınızı öne alın, kullanmadıklarınızı gizleyin. Gizlenenler kaybolmaz: halkada “Diğer…” düğmesinin altında durur.</p>
      <span className="field-hint">Kardeş ve Çocuk eklerken açılan satırlar</span>
      <OrderedList list="rows" items={RING_ROWS} ring={ring} setRing={setRing}>
        {(id) => id === 'pregnancy' && !ring.hidden.includes('pregnancy') && (
          <div className="ring-sub">
            {RING_PREGNANCY.map((x) => (
              <label key={x.id} className="check">
                <input type="checkbox" checked={!ring.hidden.includes(x.id)} onChange={() => setRing(toggleInRing(ring, x.id))} />
                {x.label}
              </label>
            ))}
          </div>
        )}
      </OrderedList>
      <span className="field-hint">Durum düğmesindeki seçenekler</span>
      <OrderedList list="status" items={RING_STATUS} ring={ring} setRing={setRing} />
      <button className="ui-btn ui-btn-sm" disabled={!changed} onClick={() => setRing(DEFAULT_RING)}>Varsayılana dön</button>
    </div>
  );
}
