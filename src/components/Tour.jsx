/**
 * Tour.jsx — the guided tour (clinician request 2026-11-09: an assistant in the clinic could not find
 * the ring's parts, the side panel, birth order, consanguinity, "Aynı köy", saving, downloading or the
 * settings). "İleri, İleri": each step lights up one part of the screen, an arrow points at it and a
 * card says what it is for. It runs on a sample family (usePedigreeStore.startTour) and gives back
 * what was open, untouched (endTour). While it runs the page takes no click and no key but the
 * tour's own: the tour itself opens the ring, the panel and the settings it talks about.
 *
 * A step: { id, title, text, target(ctx) → element | element[] | null (the card in the middle),
 * prepare(ctx) }. A part of the top bar that went into "Diğer" (⋯) on a narrow screen is shown there.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Shapes, CircleDot, ListChecks, PanelRight, IdCard, ArrowLeftRight, Link2, CalendarDays, Save, FolderOpen, LayoutGrid, Download, CheckSquare, SlidersHorizontal, CircleHelp } from 'lucide-react';
import { useT, tk, t as tNow } from '../i18n';

const PAD = 6;      // the lit area round the part
const GAP = 14;     // between the lit area and the card (the arrow's room)
const EDGE = 12;    // the card keeps off the window's edge

const all = (sel) => [...document.querySelectorAll(sel)];
const one = (sel) => document.querySelector(sel);
const drawnNode = (id) => all('.node-group').find((el) => el.__data__ && el.__data__.id === id) || null;
const cardTitled = (title) => all('.editor-panel .card').find((c) => {
  const head = c.querySelector('.card-title');
  return head && head.textContent.trim().startsWith(tNow(title));
}) || null;
const cardWithField = (label) => all('.editor-panel .card').find((c) => [...c.querySelectorAll('.field-label')].some((l) => l.textContent.trim() === tNow(label))) || null;

export const TOUR_STEPS = [
  { id: 'welcome', title: tk('PediTree’ye hoş geldiniz'),
    text: tk('Bu kısa tur, PediTree’yi örnek bir aile üzerinde adım adım gösterir. Hasta çiziminize dokunulmaz; tur bitince kaldığınız yere dönersiniz.'),
    target: () => null, prepare: (c) => c.clear() },
  { id: 'drawing', icon: Shapes, title: tk('Çizim'),
    text: tk('Kare erkek, daire kadındır; içi dolu sembol hastalığı gösterir. Oklu ve yanında P yazan kişi probanddır. Bir kişiyle çalışmak için sembolüne dokunun.'),
    target: (c) => drawnNode(c.ids.proband), prepare: (c) => c.clear() },
  { id: 'ring', icon: CircleDot, title: tk('Kişinin simidi'),
    text: tk('Seçtiğiniz kişinin çevresinde açılır. Ebeveyn, Kardeş, Eş ve Çocuk o kişiye yeni bir akraba ekler: dokunun, açılan listeden cinsiyeti seçin.'),
    target: () => one('.radial-menu .radial-ring'), prepare: (c) => c.select(c.ids.proband) },
  { id: 'ring-more', icon: ListChecks, title: tk('Durum, Bulgu, İkiz, Bilgiler'),
    text: tk('Durum: hasta, taşıyıcı, ölmüş, gebelik sonucu… Bulgu: hastalığı adıyla ekler, sembolde ayrı bir bölge olur. İkiz: ikiz ya da üçüz ekler. Bilgiler: ad, yaş, not. Kullanmadığınız seçenekleri Ayarlar → Halka menü’den gizleyebilirsiniz.'),
    target: () => all('.radial-menu > .radial-sat'), prepare: (c) => c.select(c.ids.proband) },
  { id: 'panel', icon: PanelRight, title: tk('Yan panel'),
    text: tk('Bir kişiyi seçince sağda açılır; o kişinin bütün bilgileri buradadır. Kenarından sürükleyerek genişletebilirsiniz. Kapatmak için × ya da Esc.'),
    target: () => one('.app-shell.has-editor > .side-right'), prepare: (c) => c.select(c.ids.proband) },
  { id: 'info', icon: IdCard, title: tk('Ad ve yaş'),
    text: tk('Adı ya da kısaltmayı yazın; sembolün altında görünür. Yaşı yıl olarak (35) ya da “3 ay”, “12 gün” diye yazın. Yaş girince kardeşler kendiliğinden büyükten küçüğe dizilir.'),
    target: () => cardTitled('Bilgiler'), prepare: (c) => c.select(c.ids.proband) },
  { id: 'order', icon: ArrowLeftRight, title: tk('Kardeşlerin sırası'),
    text: tk('Sola / Sağa ile kişinin kardeşleri arasındaki yerini değiştirin. Klavyede Shift + ← / →; fareyle kişiyi sürükleyip kardeşinin yanına bırakmak da olur. Bir kişiyi eşinin öbür yanına almak da böyledir.'),
    target: () => cardTitled('Doğum sırası'), prepare: (c) => c.select(c.ids.proband) },
  { id: 'partner', icon: Link2, title: tk('Eşler ve akrabalık'),
    text: tk('Eşin kartında ilişki (birlikte, boşanmış) ve akrabalık seçilir. “Var”: eşler arası çift çizgi; dereceyi seçince ortak atalar çizime kendiliğinden eklenir. “Aynı köy”: akrabalık sayılmaz, çizgi tek kalır, üstüne yazı çıkar.'),
    target: () => cardWithField('Akrabalık'), prepare: (c) => c.select(c.ids.father) },
  { id: 'patient', icon: CalendarDays, title: tk('Hasta adı ve doğum tarihi'),
    text: tk('Hastanın adı çizimin başlığına ve dosya adına yazılır. Probandın doğum tarihini kısa yazabilirsiniz (3.5.25); yaşı bugüne göre kendiliğinden hesaplanır.'),
    target: () => [one('.toolbar .patient-name'), one('.toolbar .toolbar-field')], prepare: (c) => c.clear() },
  { id: 'save', icon: Save, title: tk('Kaydet — mutlaka'),
    text: tk('Çizim yalnızca bu sekmede tutulur; sekme kapanınca silinir. “Kaydet” pedigriyi bilgisayarınıza dosya olarak indirir (.peditree.json); sonra “Aç” ile kaldığınız yerden devam edersiniz.'),
    target: () => one('.toolbar .ui-btn-primary'), prepare: (c) => c.clear() },
  { id: 'file', icon: FolderOpen, title: tk('Yeni ve Aç'),
    text: tk('Yeni: boş bir aile ya da hazır bir akraba evliliği (kuzen evliliği, berdel). Aç: kaydettiğiniz dosyayı ya da bir PED dosyasını açar.'),
    target: () => [one('.toolbar [data-overflow="new"]'), one('.toolbar [data-overflow="open"]')], prepare: (c) => c.clear() },
  { id: 'arrange', icon: LayoutGrid, title: tk('Geri al ve Konumlandır'),
    text: tk('Geri al / Yinele her adımı geri getirir (Cmd/Ctrl + Z). Konumlandır kişileri çizimde baştan, en düzgün haliyle yerleştirir; kimin kiminle akraba olduğu değişmez.'),
    target: () => [one(`.toolbar button[aria-label="${tNow('Geri al')}"]`), one(`.toolbar button[aria-label="${tNow('Yinele')}"]`), one('.toolbar [data-overflow="relayout"]')], prepare: (c) => c.clear() },
  { id: 'out', icon: Download, title: tk('İndir, Yazdır, Paylaş'),
    text: tk('İndir: çizimi resim (PNG), SVG, PDF ya da PED olarak indirir. Yazdır: kâğıda. Paylaş: resmi tabletin ya da telefonun paylaşım menüsüyle gönderir; isterseniz hasta adı olmadan.'),
    target: () => [one('.toolbar [data-popup="download"] > button'), one('.toolbar [data-overflow="print"]'), one('.toolbar [data-overflow="share"]')], prepare: (c) => c.clear() },
  { id: 'multi', icon: CheckSquare, title: tk('Birden çok kişi'),
    text: tk('Birkaç kişiyi birlikte değiştirmek için (ör. hepsini taşıyıcı yapmak): fareyle Shift ya da Cmd/Ctrl basılıyken kişilere tıklayın; dokunmatik ekranda üstteki “Çoklu seçim”i açın. Panel seçilenlerin hepsine birden uygular.'),
    target: (c) => (c.coarse ? one('.toolbar [data-overflow="multi"]') : null), prepare: (c) => c.clear() },
  { id: 'settings', icon: SlidersHorizontal, title: tk('Ayarlar'),
    text: tk('Dil (ekran ve çizim ayrı ayrı), Görünüm (renkler), Çizim (taşıyıcı gösterimi, yazı boyutu), Halka menü ve Yan panel (sık kullandıklarınızı öne alın), Semboller (her sembolün anlamı) ve Klavye kısayolları.'),
    target: () => one('.settings-dialog .settings-nav'), prepare: (c) => { c.clear(); c.openSettings('language'); } },
  { id: 'again', icon: CircleHelp, title: tk('Turu yeniden görmek için'),
    text: tk('Bu düğmeye dokunun. İyi çalışmalar!'),
    target: () => one('.toolbar .tour-btn'), prepare: (c) => c.clear() },
];

const visible = (el) => {
  if (!el || !el.isConnected || el.closest('.overflowed')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0;
};

/** The lit area for a step: the parts' joint box; a part that went into "Diğer" is shown there. */
function aim(step, ctx) {
  const found = step.target(ctx);
  const list = (Array.isArray(found) ? found : [found]).filter(Boolean);
  if (!list.length) return { rect: null, folded: false };
  let shown = list.filter(visible);
  let folded = false;
  if (shown.length < list.length) {
    const more = one('.toolbar .toolbar-more > button');
    if (visible(more)) { shown = [...shown, more]; folded = true; }
  }
  if (!shown.length) return { rect: null, folded: false };
  const rs = shown.map((e) => e.getBoundingClientRect());
  const left = Math.min(...rs.map((r) => r.left)) - PAD;
  const top = Math.min(...rs.map((r) => r.top)) - PAD;
  const right = Math.max(...rs.map((r) => r.right)) + PAD;
  const bottom = Math.max(...rs.map((r) => r.bottom)) + PAD;
  return { rect: { left, top, right, bottom, width: right - left, height: bottom - top }, folded };
}

/** Where the card stands beside the lit area: below, above, left or right, whichever fits first. */
const RADIUS = 10;   // the lit area's corners
const GLIDE = 320;   // ms: the lit area glides from one part to the next

const still = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A rounded hole in the dimmed page (even-odd: the window minus the lit area). */
function scrimPath(r, w, h) {
  const k = Math.max(0, Math.min(RADIUS, r.width / 2, r.height / 2));
  const { left: x, top: y, right: X, bottom: Y } = r;
  return `M0 0H${w}V${h}H0Z M${x + k} ${y}H${X - k}Q${X} ${y} ${X} ${y + k}V${Y - k}Q${X} ${Y} ${X - k} ${Y}H${x + k}Q${x} ${Y} ${x} ${Y - k}V${y + k}Q${x} ${y} ${x + k} ${y}Z`;
}

/**
 * A small family — a couple, a daughter and the proband with his arrow — that draws itself line by line:
 * the picture of the welcome card and of the first opening's offer.
 */
export function TourFamily({ className = '' }) {
  return (
    <svg className={`tour-family ${className}`} viewBox="0 0 132 80" aria-hidden="true">
      <rect className="tf-line tf-1" x="23" y="5" width="18" height="18" pathLength="1" />
      <circle className="tf-line tf-1" cx="100" cy="14" r="9" pathLength="1" />
      <path className="tf-line tf-2" d="M41 14H91" pathLength="1" />
      <path className="tf-line tf-3" d="M66 14V34" pathLength="1" />
      <path className="tf-line tf-4" d="M41 34H91V43M41 34V43" pathLength="1" />
      <circle className="tf-line tf-5" cx="41" cy="52" r="9" pathLength="1" />
      <rect className="tf-line tf-5 tf-proband" x="82" y="43" width="18" height="18" pathLength="1" />
      <path className="tf-line tf-6" d="M66 76L79 64M79 64H72.5M79 64V70.5" pathLength="1" />
    </svg>
  );
}

export function placeCard(rect, card, view) {
  const { w, h } = card;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  if (!rect) return { left: (view.w - w) / 2, top: (view.h - h) / 2, side: null, arrow: 0 };
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  const across = () => clamp(cx - w / 2, EDGE, view.w - w - EDGE);
  const down = () => clamp(cy - h / 2, EDGE, view.h - h - EDGE);
  if (rect.bottom + GAP + h <= view.h - EDGE) { const left = across(); return { left, top: rect.bottom + GAP, side: 'below', arrow: clamp(cx - left, 18, w - 18) }; }
  if (rect.top - GAP - h >= EDGE) { const left = across(); return { left, top: rect.top - GAP - h, side: 'above', arrow: clamp(cx - left, 18, w - 18) }; }
  if (rect.left - GAP - w >= EDGE) { const top = down(); return { left: rect.left - GAP - w, top, side: 'left', arrow: clamp(cy - top, 18, h - 18) }; }
  if (rect.right + GAP + w <= view.w - EDGE) { const top = down(); return { left: rect.right + GAP, top, side: 'right', arrow: clamp(cy - top, 18, h - 18) }; }
  // nowhere beside it (a part as large as the window): over it, at the bottom
  const left = across();
  return { left, top: view.h - h - EDGE, side: null, arrow: 0 };
}

export default function Tour({ ctx, onClose }) {
  const t = useT();
  const [at, setAt] = useState(0);
  const [aimed, setAimed] = useState({ rect: null, folded: false });
  const [lit, setLit] = useState(null); // the lit area as drawn: it glides towards aimed.rect
  const litRef = useRef(null);
  const [size, setSize] = useState({ w: 340, h: 200 });
  const cardRef = useRef(null);
  const nextRef = useRef(null);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const step = TOUR_STEPS[at];
  const last = at === TOUR_STEPS.length - 1;
  const welcome = step.id === 'welcome';

  // each step sets the screen up as it talks about it
  useLayoutEffect(() => {
    const c = ctxRef.current;
    c.closeSettings();
    if (step.prepare) step.prepare(c);
  }, [step]);

  // the lit area follows what moves (the panel sliding in, the ring opening, a resized window)
  useEffect(() => {
    let prev = '';
    let scrolled = false;
    const tick = () => {
      // a part further down the side panel is scrolled into view, once
      if (!scrolled) {
        const found = step.target(ctxRef.current);
        const first = (Array.isArray(found) ? found : [found]).find(Boolean);
        const box = first && first.closest && first.closest('.side');
        if (box) {
          scrolled = true;
          const r = first.getBoundingClientRect();
          const b = box.getBoundingClientRect();
          // below the sticky header
          if (r.top < b.top || r.bottom > b.bottom) box.scrollTop += r.top - b.top - Math.max(90, (b.height - r.height) / 3);
        }
      }
      const a = aim(step, ctxRef.current);
      const key = JSON.stringify(a);
      if (key !== prev) { prev = key; setAimed(a); }
      if (cardRef.current) {
        const r = cardRef.current.getBoundingClientRect();
        setSize((s) => (Math.abs(s.w - r.width) > 0.5 || Math.abs(s.h - r.height) > 0.5 ? { w: r.width, h: r.height } : s));
      }
    };
    tick();
    // a timer, not animation frames: it also runs when the window is in the background
    const timer = window.setInterval(tick, 60);
    return () => window.clearInterval(timer);
  }, [step]);

  // the lit area glides from the last part to the next (at once the first time, and with reduced motion)
  useEffect(() => {
    const to = aimed.rect;
    const from = litRef.current;
    const put = (r) => { litRef.current = r; setLit(r); };
    if (!to || !from || still() || typeof window.requestAnimationFrame !== 'function') { put(to); return undefined; }
    const t0 = performance.now();
    let frame = 0;
    const ease = (x) => 1 - (1 - x) ** 3;
    const run = (now) => {
      const k = ease(Math.min(1, (now - t0) / GLIDE));
      const mix = (p) => from[p] + (to[p] - from[p]) * k;
      const left = mix('left'); const top = mix('top'); const right = mix('right'); const bottom = mix('bottom');
      put({ left, top, right, bottom, width: right - left, height: bottom - top });
      if (k < 1) frame = window.requestAnimationFrame(run);
    };
    frame = window.requestAnimationFrame(run);
    // a background window gets no frames: the lit area is in place anyway once the glide's time is up
    const late = window.setTimeout(() => put(to), GLIDE + 80);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(late); };
  }, [aimed.rect]);

  useEffect(() => { if (nextRef.current) nextRef.current.focus({ preventScroll: true }); }, [at]);

  const finish = useCallback(() => { ctxRef.current.closeSettings(); onClose(); }, [onClose]);
  const go = useCallback((d) => setAt((i) => {
    const n = i + d;
    if (n >= TOUR_STEPS.length) { finish(); return i; }
    return Math.max(0, n);
  }), [finish]);

  // only the tour's own keys while it runs (the page's shortcuts would work on the sample family):
  // every key stops here; Enter or Space on a card button still presses it
  useEffect(() => {
    const onKey = (e) => {
      e.stopImmediatePropagation();
      const inCard = !!(cardRef.current && cardRef.current.contains(document.activeElement));
      if (e.key === 'Tab') {
        // the focus stays in the card
        const f = cardRef.current ? [...cardRef.current.querySelectorAll('button')] : [];
        if (f.length) {
          const i = f.indexOf(document.activeElement);
          f[e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i + 1) % f.length].focus();
        }
      } else if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if ((e.key === 'Enter' || e.key === ' ') && !inCard) go(1);
      else if (!(e.key === 'Enter' || e.key === ' ')) e.preventDefault(); // no shortcut of the page or the browser
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [go, finish]);

  const view = { w: window.innerWidth, h: window.innerHeight };
  // the card stands beside where the lit area is going, not where it is on the way
  const place = placeCard(aimed.rect, size, view);
  const r = lit;
  const titleId = `tour-title-${step.id}`;
  const Icon = step.icon;

  return (
    // data-popup: a tap on the card is "inside", so the page never swallows the click that closed a window
    <div className="tour" data-step={step.id} data-popup="tour">
      {/* the page takes no click while the tour runs */}
      <div className="tour-block" onPointerDown={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()} />
      {/* the page dims round the lit part: one layer with a rounded hole (an SVG layer was left unpainted
          by Chrome now and then once its shape changed; a clip on a plain layer is not) */}
      <div className="tour-scrim" style={r ? { clipPath: `path(evenodd, '${scrimPath(r, view.w, view.h)}')` } : undefined} aria-hidden="true" />
      {r && <div key={step.id} className="tour-spot" style={{ left: r.left, top: r.top, width: r.width, height: r.height }} aria-hidden="true" />}
      <div ref={cardRef} className={`tour-card${welcome ? ' tour-card-welcome' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}
        data-side={place.side || 'none'} style={{ left: place.left, top: place.top, '--arrow': `${place.arrow}px` }}>
        <div className="tour-track" aria-hidden="true">
          {TOUR_STEPS.map((s, i) => <span key={s.id} className={i < at ? 'done' : i === at ? 'now' : ''} />)}
        </div>
        <button className="tour-close" onClick={finish} aria-label={t('Turu bitir')} title={t('Turu bitir (Esc)')}>×</button>
        <div key={step.id} className="tour-body">
          {welcome ? <div className="tour-hero"><TourFamily /></div> : Icon && <span className="tour-icon" aria-hidden="true"><Icon size={18} strokeWidth={2} /></span>}
          <h3 id={titleId} className="tour-title">{t(step.title)}</h3>
          <p className="tour-text">{t(step.text)}</p>
          {aimed.folded && <p className="tour-note">{t('Ekran dar olduğu için bu düğme ⋯ Diğer menüsünde.')}</p>}
        </div>
        <div className="tour-foot">
          <span className="tour-count">{t('{n} / {all}', { n: at + 1, all: TOUR_STEPS.length })}</span>
          {!ctx.coarse && <span className="tour-keys" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd></span>}
          <span className="tour-actions">
            {at > 0 && <button className="tour-back" onClick={() => go(-1)}>{t('Geri')}</button>}
            <button ref={nextRef} className="ui-btn ui-btn-primary tour-next" onClick={() => go(1)}>{last ? t('Bitir') : t('İleri')}</button>
          </span>
        </div>
      </div>
    </div>
  );
}
