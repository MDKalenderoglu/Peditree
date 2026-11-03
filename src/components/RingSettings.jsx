/**
 * RingSettings.jsx — the two "make it yours" sections of Ayarlar (clinician
 * requests 2026-11-01 and 2026-11-02): the ring menu (which rows and choices
 * it shows, in what order; ringPrefs.js) and the side panel (which optional
 * parts show; panelPrefs.js). Nothing hidden is lost: it waits under
 * "Diğer…" in the ring and "Diğer bilgiler…" in the panel. The four
 * directions, the sex choices and the corner buttons do not change.
 */
import { ArrowUp, ArrowDown, Check, Plus } from 'lucide-react';
import { useT } from '../i18n';
import { useRingPrefs, RING_ROWS, RING_PREGNANCY, RING_STATUS, DEFAULT_RING, moveInRing, toggleInRing } from '../utils/ringPrefs';
import { usePanelPrefs, PANEL_PARTS, DEFAULT_PANEL, togglePanelPart } from '../utils/panelPrefs';

/** An on/off switch (a checkbox for assistive technology). */
export function Switch({ checked, onChange, label }) {
  return <input type="checkbox" role="switch" className="switch" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />;
}

function OrderedRows({ list, items, ring, setRing, children }) {
  const t = useT();
  const byId = new Map(items.map((x) => [x.id, x]));
  return (
    <ol className="set-list">
      {ring[list].map((id, k) => {
        const name = t(byId.get(id).label);
        const shown = !ring.hidden.includes(id);
        return (
          <li key={id} className={shown ? undefined : 'off'}>
            <div className="set-list-row">
              <label className="set-list-label">
                <Switch checked={shown} label={name} onChange={() => setRing(toggleInRing(ring, id))} />
                <span className="set-list-name">{name}</span>
              </label>
              <span className="set-move">
                <button className="ui-btn ui-btn-ghost ui-btn-icon" disabled={k === 0} aria-label={t('{label}: yukarı', { label: name })} title={t('Yukarı')}
                  onClick={() => setRing(moveInRing(ring, list, id, -1))}><ArrowUp size={14} /></button>
                <button className="ui-btn ui-btn-ghost ui-btn-icon" disabled={k === ring[list].length - 1} aria-label={t('{label}: aşağı', { label: name })} title={t('Aşağı')}
                  onClick={() => setRing(moveInRing(ring, list, id, 1))}><ArrowDown size={14} /></button>
              </span>
            </div>
            {children && children(id)}
          </li>
        );
      })}
    </ol>
  );
}

export function RingSection() {
  const { ring, setRing } = useRingPrefs();
  const t = useT();
  const changed = JSON.stringify(ring) !== JSON.stringify(DEFAULT_RING);
  return (
    <>
      <div className="set-block">
        <div className="set-block-title">{t('Kardeş ve Çocuk eklerken açılan satırlar')}</div>
        <OrderedRows list="rows" items={RING_ROWS} ring={ring} setRing={setRing}>
          {(id) => id === 'pregnancy' && !ring.hidden.includes('pregnancy') && (
            <div className="chip-row" role="group" aria-label={t('Gebelik')}>
              {RING_PREGNANCY.map((x) => {
                const on = !ring.hidden.includes(x.id);
                return (
                  <button key={x.id} className={`chip${on ? ' on' : ''}`} role="checkbox" aria-checked={on}
                    onClick={() => setRing(toggleInRing(ring, x.id))}>
                    {/* on / off by a mark too, never by colour alone */}
                    <span className="chip-mark" aria-hidden="true">{on ? <Check size={12} strokeWidth={3} /> : <Plus size={12} strokeWidth={2.5} />}</span>
                    {t(x.label)}
                  </button>
                );
              })}
            </div>
          )}
        </OrderedRows>
      </div>
      <div className="set-block">
        <div className="set-block-title">{t('Durum düğmesindeki seçenekler')}</div>
        <OrderedRows list="status" items={RING_STATUS} ring={ring} setRing={setRing} />
      </div>
      <button className="ui-btn ui-btn-sm set-reset" disabled={!changed} onClick={() => setRing(DEFAULT_RING)}>{t('Varsayılana dön')}</button>
    </>
  );
}

export function PanelSection() {
  const { panel, setPanel } = usePanelPrefs();
  const t = useT();
  const changed = JSON.stringify(panel.hidden.slice().sort()) !== JSON.stringify(DEFAULT_PANEL.hidden.slice().sort());
  return (
    <>
      <div className="set-block">
        {PANEL_PARTS.map((x) => {
          const shown = !panel.hidden.includes(x.id);
          return (
            <label key={x.id} className={`set-row set-row-switch${shown ? '' : ' off'}`}>
              <span className="set-row-text"><span className="set-row-title">{t(x.label)}</span></span>
              <Switch checked={shown} label={t(x.label)} onChange={() => setPanel(togglePanelPart(panel, x.id))} />
            </label>
          );
        })}
      </div>
      <button className="ui-btn ui-btn-sm set-reset" disabled={!changed} onClick={() => setPanel(DEFAULT_PANEL)}>{t('Varsayılana dön')}</button>
    </>
  );
}
