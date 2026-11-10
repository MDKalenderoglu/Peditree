/**
 * InfoFields.jsx — a person's "Bilgiler": the short name under the symbol,
 * the age, the genetic test with its result lines, and the note. One set of
 * fields for the side panel and for the ring's "Bilgiler" panel (clinician
 * request 2026-11-04: the ring's Bilgiler band opens each of them in a box
 * of its own), so both always show and write the same values. In the ring
 * the genetic result is free text (GeneticTextField) and the note is
 * `compact`: its explanation under the box.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import DraftField from './DraftField';
import { pendingDrafts } from '../utils/drafts';
import { AGE_EXAMPLE } from '../utils/age';
import { GENETIC_TESTED, geneticLines, withGeneticLine } from '../graph/model';
import { t } from '../i18n';

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

/**
 * "Ad ya da kısaltma": under the symbol; a long one is warned about. `where`
 * says so beside the label; the side panel says it once under both texts.
 */
export function NameField({ node, set, autoFocus = false, where = true }) {
  return (
    <label className="field-col">
      <span className="field-label">{t('Ad ya da kısaltma')}{where && <> <span className="field-where">{t('sembolün altında')}</span></>}</span>
      <DraftField key={`${node.id}-label`} type="text" className="input input-wide" value={node.displayLabel || ''} placeholder={t('Ayşe, A.Y., amca…')}
        onCommit={v => set({ displayLabel: v })} autoFocus={autoFocus} />
      {(node.displayLabel || '').length > 24 && (
        <span className="field-hint field-warn">{t('Uzun metinler çizimi kalabalıklaştırır; ayrıntılar aşağıdaki not alanına yazılabilir.')}</span>
      )}
    </label>
  );
}

/** The age; computed from the birth date when there is one. */
export function AgeField({ node, set, autoFocus = false }) {
  return (
    <label className="field">
      <span className="field-label">{t('Yaş')}</span>
      <DraftField key={`${node.id}-age`} type="text" className="input input-age" value={node.age || ''} placeholder={t('35, 3 ay…')}
        disabled={!!node.birthDate}
        title={node.birthDate ? t('Yaş, üst çubuktaki doğum tarihinden bugünün tarihine göre hesaplanmaktadır; değiştirmek için doğum tarihini düzeltin') : `${t('Yıl, ay ya da gün')} — ${t(AGE_EXAMPLE)}`}
        onCommit={v => set({ age: v.trim() })} autoFocus={autoFocus} />
    </label>
  );
}

/** "Not": in the numbered notes under the pedigree (`where` as in NameField). */
export function NoteField({ node, set, compact = false, autoFocus = false, where = true }) {
  return (
    <label className="field-col">
      <span className="field-label">{t('Not')}{where && <> <span className="field-where">{t('pedigrinin altında, numaralı')}</span></>}</span>
      <DraftField key={`${node.id}-note`} as="textarea" rows={2} className={`input input-wide${compact ? ' radial-note' : ''}`} value={node.notes || ''}
        placeholder={compact ? t('Bu kişiyle ilgili notunuz') : t('Öykü, muayene, tetkik…')}
        aria-describedby={compact ? 'radial-note-help' : undefined}
        onCommit={v => set({ notes: v })} autoFocus={autoFocus} />
      {/* what the box is for is said under it: a long placeholder is cut off (clinician 2026-11-03) */}
      {compact && <span id="radial-note-help" className="field-hint">{t('Not, pedigrinin altındaki “Notlar” bölümünde kişinin numarasıyla birlikte gösterilir. Yeni satır için Shift+Enter kullanılır.')}</span>}
    </label>
  );
}

/**
 * Genetic test (clinician decision 2026-10-27): "−" none, "+" done; what is
 * written goes under the symbol line by line, no "E" (NSGC 2022); what was
 * written for relatives is one tap away (clinician request 2026-10-25).
 */
export function GeneticField({ node, set, individuals = [] }) {
  const tested = node.geneticTest === GENETIC_TESTED;
  const gLines = geneticLines(node);
  const setGeneticLine = (k, text) => set({ geneticNote: withGeneticLine(node.geneticNote, k, text) });
  const familyNotes = [...new Set(individuals.filter(i => i.id !== node.id).flatMap(geneticLines))]
    .filter(line => !gLines.includes(line)).slice(0, 6);
  return (
    <div className="field-col">
      <div className="field">
        <span className="field-label">{t('Genetik test')}</span>
        <div className="segmented" role="radiogroup" aria-label={t('Genetik test')}>
          {[['', '−', t('Genetik test yapılmadı')], [GENETIC_TESTED, '+', t('Genetik test yapıldı')]].map(([v, sign, title]) => (
            <button key={v} role="radio" aria-checked={(node.geneticTest || '') === v} className={`seg-sign${(node.geneticTest || '') === v ? ' on' : ''}`}
              title={title} aria-label={title}
              onClick={() => {
                if ((node.geneticTest || '') === v) return;
                if (!v && gLines.length && !window.confirm(t('Genetik test “−” olarak işaretlenirse girilen {n} satır da silinir. Devam edilsin mi?\n\nBu işlem “Geri al” (Cmd/Ctrl+Z) ile geri alınabilir.', { n: gLines.length }))) return;
                set({ geneticTest: v });
              }}>{sign}</button>
          ))}
        </div>
      </div>
      {/* − and + say what they mean on their own (title); the lines' rule once there are lines to write */}
      {tested && (
        <span className="field-hint">{t('Her satır sembolün altında ayrı bir satır olarak gösterilir. Hiçbir sonuç girilmezse sembolün altında “test yapıldı” yazar.')}</span>
      )}
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
            placeholder={gLines.length ? t('Bir varyant / sonuç daha (Enter)') : t('Varyant ya da sonuç (örneğin FBN1 c.1585C>T het)')}
            onAdd={t => setGeneticLine(Infinity, t)} />
        </div>
      )}
      {familyNotes.length > 0 && (
        <div className="suggest-row">
          <span className="field-hint">{t('Ailede girilen:')}</span>
          {familyNotes.map(line => (
            <button key={line} className="suggest-chip" title={t('Bu kişiye de ekle')} onClick={() => setGeneticLine(Infinity, line)}>{line}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The genetic result as free text (the ring; clinician request 2026-11-04:
 * no "−" / "+", just write it): each line goes under the symbol; a line
 * written marks the test done (the data's own rule, model.js); a test done
 * whose result is pending is one button (clinician requests 2026-11-06, 2026-11-07). Deleting the last line keeps the
 * mark ("test yapıldı" under the symbol) and says so, with a button to take
 * it away — a fact the clinician entered is never dropped unasked.
 */
export function GeneticTextField({ node, set, individuals = [] }) {
  const tested = node.geneticTest === GENETIC_TESTED;
  const gLines = geneticLines(node);
  // a line written marks the test done (model.js: a note implies the test)
  const setLine = (k, text) => set({ geneticNote: withGeneticLine(node.geneticNote, k, text) });
  const familyNotes = [...new Set(individuals.filter(i => i.id !== node.id).flatMap(geneticLines))]
    .filter(line => !gLines.includes(line)).slice(0, 6);
  return (
    <div className="field-col">
      <div className="genetic-lines">
        {gLines.map((line, k) => (
          <div key={`${node.id}-gl-${k}`} className="genetic-line">
            <DraftField type="text" className="input input-wide" value={line} aria-label={t('Genetik sonuç {n}', { n: k + 1 })}
              onCommit={v => setLine(k, v)} />
            <button className="ui-btn ui-btn-ghost ui-btn-icon" title={t('Bu satırı sil')} aria-label={t('Genetik sonuç {n} sil', { n: k + 1 })}
              onClick={() => setLine(k, '')}><X size={14} /></button>
          </div>
        ))}
        <AddLineField key={`${node.id}-gadd`} type="text" className="input input-wide" autoFocus
          aria-label={t('Varyant ya da sonuç ekle')} aria-describedby="radial-genetic-help"
          placeholder={gLines.length ? t('Bir satır daha (Enter)') : t('örneğin FBN1:c.1585C>T het')}
          onAdd={text => setLine(Infinity, text)} />
      </div>
      <span id="radial-genetic-help" className="field-hint">{t('Varyant ya da sonuç; her satır sembolün altında gösterilir. Kaydetmek için Enter tuşuna basın.')}</span>
      {tested && !gLines.length && (
        <span className="field-hint">
          {t('Sembolün altında “test yapıldı” yazmaktadır.')}{' '}
          <button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => set({ geneticTest: '' })}>{t('Kaldır')}</button>
        </span>
      )}
      {/* a test done whose result has not come yet: one tap writes "sonuç bekleniyor" as its line, in the
          clinician's language like a line they type (clinician requests 2026-11-06, 2026-11-07) */}
      {!gLines.length && (
        <button className="ui-btn ui-btn-sm" onClick={() => setLine(Infinity, t('sonuç bekleniyor'))}
          title={t('Testin yapıldığını işaretler; sembolün altında “sonuç bekleniyor” yazar. Sonuç geldiğinde bu satırı güncelleyin.')}>{t('Test sonucu bekleniyor')}</button>
      )}
      {familyNotes.length > 0 && (
        <div className="suggest-row">
          <span className="field-hint">{t('Ailede girilen:')}</span>
          {familyNotes.map(line => (
            <button key={line} className="suggest-chip" title={t('Bu kişiye de ekle')} onClick={() => setLine(Infinity, line)}>{line}</button>
          ))}
        </div>
      )}
    </div>
  );
}
