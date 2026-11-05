/**
 * SettingsDialog.jsx — Ayarlar as a window of its own (clinician request
 * 2026-11-03: the settings looked crude; they should be clear and pleasant).
 * Sections on the left — language, the drawing, the ring menu, the side
 * panel, files; the keyboard help and About — and the chosen section on the right, each setting as one
 * row: what it is and what it does on the left, the control on the right.
 * Every choice is a preference of this device (localStorage); the pedigree
 * file never changes. Short words on the screen, the longer explanation in a
 * row's tooltip (clinician 2026-11-05: "minimal, premium, clear").
 */
import { useEffect, useRef, useState } from 'react';
import { X, Globe, Palette, CircleDot, PanelRight, FolderOpen, Keyboard, Info } from 'lucide-react';
import { ProductInfo, CitationInfo, FeedbackInfo, LicenseInfo, KeyHelp } from './AboutParts';
import { useT, useLang, tk } from '../i18n';
import { useViewSettings, DRAWING_FONTS, LEGEND_SIZES } from '../utils/drawingStyle';
import { RingSection, PanelSection, Switch } from './RingSettings';
import { PAPERS } from '../utils/paper';
import { CARRIER_MARKS } from '../graph/conditionKey';

const SECTIONS = [
  { id: 'language', label: tk('Dil'), Icon: Globe, intro: tk('Ekran ve çizim ayrı dillerde olabilir.') },
  { id: 'drawing', label: tk('Çizim'), Icon: Palette, intro: tk('Sembollerin ve çizgilerin anlamı hiçbir seçenekte değişmez.') },
  { id: 'ring', label: tk('Halka menü'), Icon: CircleDot, intro: tk('Sık kullandıklarınızı öne alın. Gizlenenler halkada “Diğer…” altında durur.') },
  { id: 'panel', label: tk('Yan panel'), Icon: PanelRight, intro: tk('Gizlenenler panelde “Diğer bilgiler” altında durur; bir kişide dolu olan her zaman görünür.') },
  { id: 'files', label: tk('Dosyalar'), Icon: FolderOpen, intro: null },
  // not settings but kept here (clinician request 2026-11-04): what to look up once in a while
  { id: 'keys', label: tk('Klavye kısayolları'), Icon: Keyboard, intro: tk('Fareyle yaptığınız her şeyi klavyeyle de yapabilirsiniz.'), info: true },
  { id: 'about', label: tk('Hakkında'), Icon: Info, intro: null, info: true },
];

/** One setting: its name and a few words on it, the control beside it; `more` in the tooltip. */
function Row({ title, hint, more, children }) {
  return (
    <div className="set-row" title={more}>
      <div className="set-row-text">
        <div className="set-row-title">{title}</div>
        {hint && <div className="set-row-hint">{hint}</div>}
      </div>
      <div className="set-row-control">{children}</div>
    </div>
  );
}

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text, lang]) => (
        <button key={v} role="radio" lang={lang} aria-checked={value === v} className={value === v ? 'on' : undefined} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

function LanguageSection() {
  const t = useT();
  const { ui, drawing, setLang } = useLang();
  return (
    <div className="set-block">
      {/* each language by its own name (clinician decisions 2026-11-02) */}
      <Row title={t('Ekranın dili')}>
        <Segmented label={t('Ekranın dili')} value={ui} onChange={(v) => setLang({ ui: v })}
          options={[['tr', 'Türkçe', 'tr'], ['en', 'English', 'en']]} />
      </Row>
      <Row title={t('Çizimin dili')} hint={t('Çizimin, indirilen ve yazdırılan dosyaların dili')}>
        <Segmented label={t('Çizimin dili')} value={drawing} onChange={(v) => setLang({ drawing: v })}
          options={[['same', t('Ekranla aynı')], ['tr', 'Türkçe', 'tr'], ['en', 'English', 'en']]} />
      </Row>
      <p className="set-note">{t('Yazdığınız adlar, notlar ve bulgular çevrilmez.')}</p>
    </div>
  );
}

function DrawingSection() {
  const t = useT();
  const { view, setView } = useViewSettings();
  return (
    <>
      <div className="set-block">
        <Row title={t('Çizimin görünümü')} more={t('El çiziminde çizgiler ve semboller kalemle çizilmiş gibi hafifçe titrer.')}>
          <Segmented label={t('Çizimin görünümü')} value={view.drawStyle} onChange={(v) => setView({ drawStyle: v })}
            options={[['standard', t('Standart')], ['hand', t('El çizimi')]]} />
        </Row>
        {/* clinician request 2026-11-03: squared or dotted paper, like other tools */}
        <Row title={t('Sayfa zemini')} hint={t('Yalnız ekranda')} more={t('Yalnızca ekranda: çizimle birlikte kayar ve büyür. İndirilen ve yazdırılan çizim düz kalır.')}>
          <Segmented label={t('Sayfa zemini')} value={view.paper} onChange={(v) => setView({ paper: v })}
            options={PAPERS.map((p) => [p.id, <><span className="paper-swatch" data-paper={p.id} aria-hidden="true" />{t(p.label)}</>])} />
        </Row>
        {/* clinician decision 2026-11-04: the NSGC 2022 half or the classic dot, chosen by the viewer */}
        <Row title={t('Taşıyıcı gösterimi')} hint={t('Adı girilmemiş taşıyıcı için')} more={t('Adı girilmemiş taşıyıcı için. NSGC 2022 noktayı artık önermiyor. Anahtar seçileni açıklar.')}>
          <Segmented label={t('Taşıyıcı gösterimi')} value={view.carrierMark} onChange={(v) => setView({ carrierMark: v })}
            options={CARRIER_MARKS.map((m) => [m.id, <><span className="carrier-swatch" data-mark={m.id} aria-hidden="true" />{t(m.label)}</>])} />
        </Row>
        <Row title={t('Açıklama yazılarının boyutu')} hint={t('Hasta adı, açıklama ve notlar')} more={t('Hasta adı, bulgular açıklaması ve notlar; indirilen ve yazdırılan çizimde de. Sembollerin altındaki yazılar aynı boyutta kalır.')}>
          <Segmented label={t('Açıklama yazılarının boyutu')} value={view.legendSize} onChange={(v) => setView({ legendSize: v })}
            options={LEGEND_SIZES.map((z) => [z.id, t(z.label)])} />
        </Row>
        <Row title={t('İndirilen resmin görünümü')} hint={t('İndirme, paylaşma ve yazdırma')}>
          <Segmented label={t('İndirilen resmin görünümü')} value={view.exportAs} onChange={(v) => setView({ exportAs: v })}
            options={[['screen', t('Ekrandaki gibi')], ['standard', t('Her zaman standart')]]} />
        </Row>
      </div>
      <div className="set-block">
        <div className="set-block-title">{t('Çizimdeki yazıların yazı tipi')}</div>
        <div className="font-grid">
          {[['plain', tk('Düz yazı tipleri')], ['hand', tk('El yazısı tipleri')]].map(([group, title]) => (
            <div key={group} className="font-list" role="radiogroup" aria-label={t(title)}>
              <span className="set-row-hint">{t(title)}</span>
              {DRAWING_FONTS.filter((f) => f.group === group).map((f) => (
                <button key={f.id} role="radio" aria-checked={view.fontId === f.id} className={`font-option${view.fontId === f.id ? ' on' : ''}`}
                  onClick={() => setView({ fontId: f.id })}>
                  <span className="font-sample" style={{ fontFamily: f.family }}>{t('II-3 · 45 y · Ayşe Gül')}</span>
                  <span className="font-name">{f.id === 'standard' ? t(f.label) : f.label}{f.note ? ` — ${t(f.note)}` : ''}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <label className="set-row set-row-switch">
          <span className="set-row-text"><span className="set-row-title">{t('El yazısında numaralar düz')}</span><span className="set-row-hint">{t('Pedigri numaraları (I-1, II-3) el yazısında da düz yazılsın')}</span></span>
          <Switch checked={!!view.plainNumbers} label={t('Pedigri numaraları (I-1, II-3) el yazısında da düz yazılsın')} onChange={(v) => setView({ plainNumbers: v })} />
        </label>
      </div>
    </>
  );
}

function FilesSection() {
  const t = useT();
  const { view, setView } = useViewSettings();
  return (
    <div className="set-block">
      <label className="set-row set-row-switch">
        <span className="set-row-text">
          <span className="set-row-title">{t('“Aç” penceresi')}</span>
          <span className="set-row-hint">{t('“Aç”a basınca hangi dosyaların açılabildiğini anlatan pencere görünsün')}</span>
        </span>
        <Switch checked={!!view.openHelp} label={t('“Aç”a basınca hangi dosyaların açılabildiğini anlatan pencere görünsün')} onChange={(v) => setView({ openHelp: v })} />
      </label>
    </div>
  );
}

function AboutSection() {
  return (
    <div className="set-block about-text about-block">
      <ProductInfo />
      <CitationInfo />
      <FeedbackInfo />
      <LicenseInfo />
    </div>
  );
}

const BODY = { language: LanguageSection, drawing: DrawingSection, ring: RingSection, panel: PanelSection, files: FilesSection, keys: KeyHelp, about: AboutSection };

export default function SettingsDialog({ onClose, initial = 'language' }) {
  const t = useT();
  const [section, setSection] = useState(SECTIONS.some((s) => s.id === initial) ? initial : 'language');
  const tabRef = useRef(null);
  const boxRef = useRef(null);
  // focus starts on the section list and returns to where it was (the "Ayarlar" button) on closing
  useEffect(() => {
    const before = document.activeElement;
    if (tabRef.current) tabRef.current.focus();
    return () => { if (before && before.focus && document.contains(before)) before.focus(); };
  }, []);
  // a modal window keeps Tab inside it (WCAG 2.1.2 / 2.4.3)
  const keepFocus = (e) => {
    if (e.key !== 'Tab' || !boxRef.current) return;
    const items = [...boxRef.current.querySelectorAll('button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), [tabindex="0"]')];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  const current = SECTIONS.find((s) => s.id === section);
  const Body = BODY[section];
  const step = (dir) => {
    const k = SECTIONS.findIndex((s) => s.id === section);
    const next = SECTIONS[(k + dir + SECTIONS.length) % SECTIONS.length];
    setSection(next.id);
    requestAnimationFrame(() => document.getElementById(`set-tab-${next.id}`)?.focus());
  };
  return (
    <div className="settings-dialog" role="dialog" aria-modal="true" aria-label={t('Ayarlar')} data-popup="settings" ref={boxRef} onKeyDown={keepFocus}>
      <div className="settings-head">
        <h2>{t('Ayarlar')}</h2>
        <button className="ui-btn ui-btn-ghost ui-btn-icon" onClick={onClose} aria-label={t('Kapat')} title={t('Kapat')}><X size={18} /></button>
      </div>
      <div className="settings-main">
        <nav className="settings-nav" role="tablist" aria-orientation="vertical" aria-label={t('Ayarlar')}
          onKeyDown={(e) => {
            if (['ArrowDown', 'ArrowRight'].includes(e.key)) { e.preventDefault(); step(1); }
            if (['ArrowUp', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); step(-1); }
          }}>
          {SECTIONS.map(({ id, label, Icon }) => (
            <button key={id} id={`set-tab-${id}`} ref={id === section ? tabRef : undefined} role="tab" aria-selected={id === section}
              aria-controls="set-panel" tabIndex={id === section ? 0 : -1} className={id === section ? 'on' : undefined} onClick={() => setSection(id)}>
              <Icon size={17} aria-hidden="true" /> <span>{t(label)}</span>
            </button>
          ))}
        </nav>
        <section className="settings-pane" id="set-panel" role="tabpanel" aria-labelledby={`set-tab-${section}`}>
          <h3>{t(current.label)}</h3>
          {current.intro && <p className="set-intro">{t(current.intro)}</p>}
          <Body />
        </section>
      </div>
      {!current.info && <p className="settings-foot" title={t('Bu ayarlar yalnızca bu cihazda saklanır. Pedigri dosyası değişmez; dosyayı açan başka biri kendi ayarıyla görür.')}>{t('Yalnız bu cihazda saklanır; pedigri dosyası değişmez.')}</p>}
    </div>
  );
}
