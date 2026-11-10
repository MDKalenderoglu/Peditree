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
import { X, Globe, Palette, Paintbrush, CircleDot, PanelRight, FolderOpen, Shapes, Keyboard, Info, Minus, Plus } from 'lucide-react';
import { ProductInfo, CitationInfo, FeedbackInfo, LicenseInfo, KeyHelp } from './AboutParts';
import { useT, useLang, tk } from '../i18n';
import { useViewSettings, DRAWING_FONTS, LEGEND_SIZES, THEMES, RING_CLEAR } from '../utils/drawingStyle';
import { RingSection, PanelSection, Switch } from './RingSettings';
import SymbolGuide from './SymbolGuide';
import { PAPERS } from '../utils/paper';
import { CARRIER_MARKS } from '../graph/conditionKey';

const SECTIONS = [
  { id: 'language', label: tk('Dil'), Icon: Globe, intro: tk('Ekran ve çizim ayrı dillerde olabilir.') },
  { id: 'look', label: tk('Görünüm'), Icon: Paintbrush, intro: tk('Ekranın renkleri ve simidin saydamlığı; çizim ve dosyalar bundan etkilenmez.') },
  { id: 'drawing', label: tk('Çizim'), Icon: Palette, intro: tk('Sembollerin ve çizgilerin anlamı hiçbir seçenekte değişmez.') },
  { id: 'ring', label: tk('Halka menü'), Icon: CircleDot, intro: tk('Sık kullandığınız seçenekleri öne alabilirsiniz; gizlenen seçenekler halkada “Diğer…” altında yer alır.') },
  { id: 'panel', label: tk('Yan panel'), Icon: PanelRight, intro: tk('Gizlenen bölümler panelde “Diğer bilgiler” altında yer alır; bir kişide doldurulmuş bölüm her zaman görünür.') },
  { id: 'files', label: tk('Dosyalar'), Icon: FolderOpen, intro: null },
  // not settings but kept here (clinician requests 2026-11-04, 2026-11-05): what to look up once in a while
  { id: 'symbols', label: tk('Semboller'), Icon: Shapes, intro: tk('Çizimdeki sembollerin ve çizgilerin anlamı (NSGC 2022).'), info: true },
  { id: 'keys', label: tk('Klavye kısayolları'), Icon: Keyboard, intro: tk('Fareyle yapılan her işlem klavyeyle de yapılabilir.'), info: true },
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
      <Row title={t('Çizimin dili')} hint={t('Çizimin ve indirilen ya da yazdırılan dosyaların dili')}>
        <Segmented label={t('Çizimin dili')} value={drawing} onChange={(v) => setLang({ drawing: v })}
          options={[['same', t('Ekranla aynı')], ['tr', 'Türkçe', 'tr'], ['en', 'English', 'en']]} />
      </Row>
      <p className="set-note">{t('Girdiğiniz adlar, notlar ve bulgular çevrilmez.')}</p>
    </div>
  );
}

/** The screens' colour theme and how see-through the ring is (clinician request 2026-11-07). */
function LookSection() {
  const t = useT();
  const { view, setView } = useViewSettings();
  return (
    <div className="set-block">
      <Row title={t('Renk teması')} hint={t('Sıcaktan soğuğa')}>
        <Segmented label={t('Renk teması')} value={view.theme} onChange={(v) => setView({ theme: v })}
          options={THEMES.map((x) => [x.id, <><span className="theme-swatch" style={{ background: x.swatch }} aria-hidden="true" />{t(x.label)}</>])} />
      </Row>
      {/* the touch screen (clinician request 2026-11-10): on by itself on a phone; a tablet may choose it */}
      <Row title={t('Dokunmatik görünüm')} hint={t('Büyük, yazılı düğmeler')}
        more={t('Dokunmatik görünümde çizim bütün ekranı kaplar; bir kişiye dokunulduğunda alttan yazılı düğmeler açılır ve ayrıntılar bu paneli yukarı çekerek görülür. Otomatik seçildiğinde telefonda kendiliğinden açılır.')}>
        <Segmented label={t('Dokunmatik görünüm')} value={view.touchMode || 'auto'} onChange={(v) => setView({ touchMode: v })}
          options={[['auto', t('Otomatik')], ['on', t('Açık')], ['off', t('Kapalı')]]} />
      </Row>
      <Row title={t('Simidin saydamlığı')} hint={t('Arkadaki çizim ne kadar görünsün')}>
        <RingClear value={view.ringClear} onChange={(v) => setView({ ringClear: v })} />
      </Row>
      {/* how it looks, at once: parts of the ring over a small family drawn as in a pedigree
          (thin lines, the usual symbols; clinician 2026-11-07: the first lines looked crude) */}
      <div className="ring-preview" aria-hidden="true">
        <svg viewBox="0 0 320 88">
          <path className="rp-line" d="M148,22H172M160,22V44M70,44H250M70,44V58M130,44V58M190,44V58M250,44V58" />
          <rect className="rp-sym" x="132" y="14" width="16" height="16" />
          <circle className="rp-sym" cx="180" cy="22" r="8" />
          <circle className="rp-sym" cx="70" cy="66" r="8" />
          <rect className="rp-sym rp-on" x="122" y="58" width="16" height="16" />
          <circle className="rp-sym" cx="190" cy="66" r="8" />
          <rect className="rp-sym" x="242" y="58" width="16" height="16" />
        </svg>
        <span className="ring-preview-pill">{t('Kardeş')}</span>
        <span className="ring-preview-pill">{t('Durum')}</span>
      </div>
    </div>
  );
}

/** − and + one step at a time, or the slider; the value in % (clinician request 2026-11-07). */
function RingClear({ value, onChange }) {
  const t = useT();
  const step = (d) => onChange(Math.min(RING_CLEAR.max, Math.max(RING_CLEAR.min, value + d * RING_CLEAR.step)));
  return (
    <div className="ring-clear">
      <button className="ui-btn ui-btn-icon ui-btn-sm" onClick={() => step(-1)} disabled={value <= RING_CLEAR.min}
        aria-label={t('Daha az saydam')} title={t('Daha az saydam')}><Minus size={14} /></button>
      <input type="range" min={RING_CLEAR.min} max={RING_CLEAR.max} step={RING_CLEAR.step} value={value}
        aria-label={t('Simidin saydamlığı')} aria-valuetext={`%${value}`} onChange={(e) => onChange(Number(e.target.value))} />
      <button className="ui-btn ui-btn-icon ui-btn-sm" onClick={() => step(1)} disabled={value >= RING_CLEAR.max}
        aria-label={t('Daha saydam')} title={t('Daha saydam')}><Plus size={14} /></button>
      <output className="ring-clear-value">%{value}</output>
    </div>
  );
}

function DrawingSection() {
  const t = useT();
  const { view, setView } = useViewSettings();
  return (
    <>
      <div className="set-block">
        <Row title={t('Çizimin görünümü')} more={t('El çizimi görünümünde çizgiler ve semboller kalemle çizilmiş gibi hafifçe dalgalı görünür.')}>
          <Segmented label={t('Çizimin görünümü')} value={view.drawStyle} onChange={(v) => setView({ drawStyle: v })}
            options={[['standard', t('Standart')], ['hand', t('El çizimi')]]} />
        </Row>
        {/* clinician request 2026-11-03: squared or dotted paper, like other tools */}
        <Row title={t('Sayfa zemini')} hint={t('Yalnız ekranda')} more={t('Yalnızca ekranda görünür ve çizimle birlikte kayıp büyür; indirilen ve yazdırılan çizimin zemini düz kalır.')}>
          <Segmented label={t('Sayfa zemini')} value={view.paper} onChange={(v) => setView({ paper: v })}
            options={PAPERS.map((p) => [p.id, <><span className="paper-swatch" data-paper={p.id} aria-hidden="true" />{t(p.label)}</>])} />
        </Row>
        {/* clinician decision 2026-11-04: the NSGC 2022 half or the classic dot, chosen by the viewer */}
        <Row title={t('Taşıyıcı gösterimi')} hint={t('Adı girilmemiş taşıyıcı için')} more={t('Adı girilmemiş taşıyıcılık için geçerlidir. NSGC 2022 nokta gösterimini artık önermemektedir; seçilen gösterim çizimin açıklamasında belirtilir.')}>
          <Segmented label={t('Taşıyıcı gösterimi')} value={view.carrierMark} onChange={(v) => setView({ carrierMark: v })}
            options={CARRIER_MARKS.map((m) => [m.id, <><span className="carrier-swatch" data-mark={m.id} aria-hidden="true" />{t(m.label)}</>])} />
        </Row>
        {/* every text of the drawing (clinician request 2026-11-05) */}
        <Row title={t('Yazı boyutu')} hint={t('Çizimdeki bütün yazılar')} more={t('Sembollerin altındaki yazıları, pedigri numaralarını, hasta adını, açıklamayı ve notları kapsar; indirilen ve yazdırılan çizimde de geçerlidir. Yazı büyüdükçe kişiler arasındaki mesafe biraz artar, semboller aynı boyutta kalır.')}>
          <Segmented label={t('Yazı boyutu')} value={view.legendSize} onChange={(v) => setView({ legendSize: v })}
            options={LEGEND_SIZES.map((z) => [z.id, t(z.label)])} />
        </Row>
        <Row title={t('İndirilen resmin görünümü')} hint={t('İndirme, paylaşma ve yazdırma')}>
          <Segmented label={t('İndirilen resmin görünümü')} value={view.exportAs} onChange={(v) => setView({ exportAs: v })}
            options={[['screen', t('Ekrandaki gibi')], ['standard', t('Her zaman standart')]]} />
        </Row>
      </div>
      {/* clinician decision 2026-11-10 (NSGC 2022 records same-sex relationships): off unless chosen */}
      <div className="set-block">
        <Row title={t('Aynı cinsiyetten eşler')} hint={t('İki kadın ya da iki erkek eş olabilir')}
          more={t('İki kadın ya da iki erkek eş olarak eklenebilir. Bu çiftlerin biyolojik çocukları donörle (sperm donörü; yumurta donörü ya da taşıyıcı anne) ya da evlat edinilmiş olarak eklenir. Eşlerin doğumda atanan cinsiyetleri farklıysa (AMAB / AFAB) çocuk doğrudan eklenebilir.')}>
          <Switch checked={!!view.sameSexPartners} label={t('Aynı cinsiyetten eşler')} onChange={(v) => setView({ sameSexPartners: v })} />
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
          <span className="set-row-text"><span className="set-row-title">{t('El yazısında numaralar düz')}</span><span className="set-row-hint">{t('Pedigri numaraları (I-1, II-3) el çizimi görünümünde de düz yazıyla gösterilsin')}</span></span>
          <Switch checked={!!view.plainNumbers} label={t('Pedigri numaraları (I-1, II-3) el çizimi görünümünde de düz yazıyla gösterilsin')} onChange={(v) => setView({ plainNumbers: v })} />
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
          <span className="set-row-hint">{t('“Aç” düğmesine basıldığında hangi dosyaların açılabileceğini açıklayan pencere gösterilsin')}</span>
        </span>
        <Switch checked={!!view.openHelp} label={t('“Aç” düğmesine basıldığında hangi dosyaların açılabileceğini açıklayan pencere gösterilsin')} onChange={(v) => setView({ openHelp: v })} />
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

const BODY = { language: LanguageSection, look: LookSection, drawing: DrawingSection, ring: RingSection, panel: PanelSection, files: FilesSection, symbols: SymbolGuide, keys: KeyHelp, about: AboutSection };

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
      {!current.info && <p className="settings-foot" title={t('Bu ayarlar yalnızca bu cihazda saklanır ve pedigri dosyasını değiştirmez; dosyayı açan başka bir kişi çizimi kendi ayarlarıyla görür.')}>{t('Yalnızca bu cihazda saklanır; pedigri dosyasını değiştirmez.')}</p>}
    </div>
  );
}
