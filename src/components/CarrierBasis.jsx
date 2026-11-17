/**
 * CarrierBasis.jsx — what a carrier status rests on, asked whenever carrier
 * status is entered (clinician decision 2026-11-17, after Bennett 2008 Fig. 4
 * and 2022 §4.5: carrier status comes from a result or a report, never from a
 * finding a relative happens to share). The stored values are model.js
 * CARRIER_BASES; the operations refuse any other.
 */
import { t } from '../i18n';
import { BASIS_CHOICES } from '../utils/carrierBasis';

/** The three choices; `value` the current one (none while being asked). */
export default function CarrierBasisChoice({ value, onPick, question = true }) {
  return (
    <div className="carrier-basis">
      {question && <span className="carrier-basis-q">{t('Taşıyıcılığın dayanağı nedir?')}</span>}
      <div className="segmented carrier-basis-options" role="radiogroup" aria-label={t('Taşıyıcılığın dayanağı')}>
        {BASIS_CHOICES.map(([v, label, title]) => (
          <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : undefined} title={t(title)}
            onClick={() => onPick(v)}>{t(label)}</button>
        ))}
      </div>
    </div>
  );
}
