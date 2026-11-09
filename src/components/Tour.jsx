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
import { Shapes, CircleDot, UserPlus, HeartPulse, Stethoscope, Users, ListChecks, PanelRight, IdCard, ArrowLeftRight, Link2, CalendarDays, Save, FolderOpen, FilePlus2, LayoutGrid, Printer, CheckSquare, SlidersHorizontal, Info, CircleHelp } from 'lucide-react';
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

// the ring's parts, by the names they show (the sectors add a relative, the buttons on the diagonals edit the person)
const sector = (name) => one(`.radial-menu .radial-sector[aria-label="${tNow(name)}"]`);
const sat = (name) => one(`.radial-menu .radial-sat[aria-label="${tNow(name)}"]`);
const fieldCol = (label) => {
  const l = all('.editor-panel .field-label').find((x) => x.textContent.trim() === tNow(label));
  return l ? l.closest('.field-col') || l : null;
};
/**
 * The ring as the step wants it: one sector's list or one button's panel open, everything else closed.
 * A click at a time (each one toggles); done once the ring is as wanted.
 */
const ringAs = ({ sector: want = null, sat: wantSat = null } = {}) => () => {
  if (!one('.radial-menu')) return false;
  for (const el of all('.radial-menu .radial-sector.on')) if (el !== (want && sector(want))) { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return false; }
  for (const el of all('.radial-menu .radial-sat.on')) if (el !== (wantSat && sat(wantSat))) { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return false; }
  const target = want ? sector(want) : wantSat ? sat(wantSat) : null;
  if (target && !target.classList.contains('on')) { target.dispatchEvent(new MouseEvent('click', { bubbles: true })); return false; }
  return true;
};

/*
 * The steps (clinician 2026-11-10: plain, careful language for a clinician who has not drawn a pedigree
 * in an application before; the ring and the side panel in detail, the couple line, the related-family
 * templates, Hakkında before the end). A step: { id, icon, title, text, target(ctx), prepare(ctx),
 * act?() — run until it returns true, after the screen has caught up with prepare (opens a part of the ring) }.
 */
export const TOUR_STEPS = [
  { id: 'welcome', title: tk('PediTree’ye hoş geldiniz'),
    text: tk('Bu tur, uygulamanın bölümlerini örnek bir aile üzerinde sırayla tanıtır. Turu istediğiniz an kapatabilirsiniz; kendi çiziminiz olduğu gibi korunur.'),
    target: () => null, prepare: (c) => c.clear() },
  { id: 'drawing', icon: Shapes, title: tk('Çizim alanı'),
    text: tk('Pedigri NSGC gösterimiyle çizilir: kare erkeği, daire kadını, içi dolu sembol etkilenmiş bireyi gösterir. Ok ve P harfi probandı belirtir. Bir bireyle ilgili her işlem, sembolüne tıklanarak başlar.'),
    target: (c) => drawnNode(c.ids.proband), prepare: (c) => c.clear() },
  { id: 'ring', icon: CircleDot, title: tk('Simit menüsü'),
    text: tk('Bir bireyi seçtiğinizde sembolünün çevresinde bu menü açılır. Halkanın dört bölümü seçili bireye akraba ekler: üstte Ebeveyn, sağda Eş, altta Çocuk, solda Kardeş. Köşelerdeki dört düğme ise bireyin kendi bilgilerini düzenler.'),
    target: () => one('.radial-menu .radial-ring'), prepare: (c) => c.select(c.ids.proband), act: ringAs() },
  { id: 'ring-add', icon: UserPlus, title: tk('Akraba eklemek'),
    text: tk('Halkanın bir bölümüne tıklandığında eklenecek kişinin cinsiyeti sorulur. Kardeş ve Çocuk bölümlerinden ayrıca gebelik sonuçları (düşük, ölü doğum, sonlandırma, süren gebelik), evlat edinilmiş ya da yardımcı üreme ile doğmuş bir çocuk ve tek sembolde gösterilen birden çok kişi eklenebilir.'),
    target: () => [sector('Kardeş'), one('.radial-menu .radial-flyout')], prepare: (c) => c.select(c.ids.proband), act: ringAs({ sector: 'Kardeş' }) },
  { id: 'ring-status', icon: HeartPulse, title: tk('Durum'),
    text: tk('Bireyin cinsiyeti ve klinik durumu buradan işaretlenir: etkilenmiş, taşıyıcı, belirtisiz taşıyıcı ya da vefat etmiş. Proband ve danışmaya gelen birey (danışan) da bu listeden belirlenir.'),
    target: () => [sat('Durum'), one('.radial-menu .radial-panel')], prepare: (c) => c.select(c.ids.proband), act: ringAs({ sat: 'Durum' }) },
  { id: 'ring-findings', icon: Stethoscope, title: tk('Bulgu'),
    text: tk('Ailede birden fazla hastalık ya da bulgu söz konusuysa her biri adıyla eklenir. Sembol bulgu sayısı kadar bölüme ayrılır; her bölümün anlamı çizimin altındaki açıklamada yer alır. Tanı yaşı da buraya yazılabilir.'),
    target: () => [sat('Bulgu'), one('.radial-menu .radial-panel')], prepare: (c) => c.select(c.ids.proband), act: ringAs({ sat: 'Bulgu' }) },
  { id: 'ring-twins-info', icon: Users, title: tk('İkiz ve Bilgiler'),
    text: tk('İkiz, seçili bireye tek ya da çift yumurta ikizi ekler. Bilgiler, ad, yaş, genetik test sonucu ve notu simidi kapatmadan girmenizi sağlar; aynı alanlar yan panelde de bulunur.'),
    target: () => [sat('İkiz'), sat('Bilgiler')], prepare: (c) => c.select(c.ids.proband), act: ringAs() },
  { id: 'panel', icon: PanelRight, title: tk('Yan panel'),
    text: tk('Seçili bireyin bütün bilgileri sağdaki panelde toplanır. Simitteki işlemlerin yanı sıra genetik test, evlat edinme, yardımcı üreme ve ölüm bilgileri gibi ayrıntılı alanlar da buradadır. Panel kenarından sürüklenerek genişletilir; × ya da Esc ile kapanır.'),
    target: () => one('.app-shell.has-editor > .side-right'), prepare: (c) => c.select(c.ids.proband), act: ringAs() },
  { id: 'info', icon: IdCard, title: tk('Ad, not ve yaş'),
    text: tk('Ad ya da kısaltma sembolün altına yazılır; not ise pedigrinin altında bireyin numarasıyla listelenir. Yaş yıl olarak (35) ya da ay ve gün olarak (3 ay, 12 gün) girilebilir. Yaş girildiğinde kardeşler büyükten küçüğe kendiliğinden sıralanır.'),
    target: () => cardTitled('Bilgiler'), prepare: (c) => c.select(c.ids.proband) },
  { id: 'more', icon: ListChecks, title: tk('Diğer bilgiler'),
    text: tk('Daha seyrek kullanılan alanlar bu başlığın altında durur; bir alan doluysa her zaman görünür. Hangi alanların panelde sürekli açık kalacağını Ayarlar’daki Yan panel bölümünden seçebilirsiniz.'),
    target: () => one('.editor-panel .more-parts'), prepare: (c) => c.select(c.ids.proband) },
  { id: 'order', icon: ArrowLeftRight, title: tk('Doğum sırası'),
    text: tk('Kardeşler soldan sağa doğum sırasıyla çizilir. Sırayı değiştirmek için Sola ve Sağa düğmelerini ya da klavyede Shift ile ok tuşlarını kullanabilir, sembolü sürükleyip kardeşinin yanına da bırakabilirsiniz.'),
    target: () => cardTitled('Doğum sırası'), prepare: (c) => c.select(c.ids.proband) },
  { id: 'couple', icon: Link2, title: tk('Eşler arasındaki çizgi'),
    text: tk('İki eşi birleştiren çizgiye tıklandığında panelde çiftin kartı açılır. İlişkinin sürdüğü ya da sona erdiği, çocuksuzluk (isteğe bağlı ya da infertilite) burada işaretlenir; çifte yeni çocuk da buradan eklenir.'),
    target: () => cardTitled('Bu çift'), prepare: (c) => c.selectCouple(c.ids.mother, c.ids.father) },
  { id: 'kinship', icon: Link2, title: tk('Akrabalık ve Aynı köy'),
    text: tk('Eşler arasında kan bağı varsa Var seçilir ve çizgi çift çizgiye dönüşür. Anne ile babanın akrabalık derecesi seçildiğinde ortak atalar çizime kendiliğinden eklenir ve çocuklar için akrabalık katsayısı (F) hesaplanır. Aynı köy akrabalık sayılmaz; çizgi tek kalır, üzerine yalnızca bir not yazılır.'),
    target: () => fieldCol('Akrabalık'), prepare: (c) => c.selectCouple(c.ids.mother, c.ids.father) },
  { id: 'patient', icon: CalendarDays, title: tk('Hasta adı ve doğum tarihi'),
    text: tk('Hasta adı çizimin başlığında ve kaydedilen dosyaların adında yer alır. Probandın doğum tarihi kısaltılarak da yazılabilir (3.5.25); yaşı bugünün tarihine göre hesaplanır.'),
    target: () => [one('.toolbar .patient-name'), one('.toolbar .toolbar-field')], prepare: (c) => c.clear() },
  { id: 'new', icon: FilePlus2, title: tk('Yeni pedigri'),
    text: tk('Yeni, proband ile anne ve babasından oluşan boş bir aileyle başlar. Akraba evliliği seçeneği ise ebeveynleri akraba olan bir aileyi hazır olarak kurar.'),
    target: () => [one('.toolbar [data-overflow="new"]'), one('.toolbar [data-popup="new"] .keys-popover')], prepare: (c) => { c.clear(); c.openNew(); } },
  { id: 'relation', icon: FilePlus2, title: tk('Akraba evliliği taslakları'),
    text: tk('Bu pencerede akrabalık adıyla seçilir: birinci, ikinci ve üçüncü derece kuzenler, bir kuşak ayrık kuzenler, çift birinci derece kuzenler ve berdel. Akrabalığın hangi taraftan geldiği (amca, hala, dayı ya da teyze çocukları) belirtilir; aile kurulmadan önce önizlemesi ve akrabalık katsayısı (F) gösterilir.'),
    target: () => one('.relation-dialog'), prepare: (c) => { c.clear(); c.openRelation(); } },
  { id: 'open', icon: FolderOpen, title: tk('Kayıtlı bir dosyayı açmak'),
    text: tk('Aç, daha önce PediTree dosyası olarak kaydettiğiniz bir pedigriyi bütün bilgileriyle geri getirir. PED dosyaları da açılabilir; bu dosyalar yalnızca aile bağlarını ve etkilenme durumunu taşır.'),
    target: () => one('.toolbar [data-overflow="open"]'), prepare: (c) => c.clear() },
  { id: 'save', icon: Save, title: tk('Kaydetmek'),
    text: tk('Çizim yalnızca bu sekmede tutulur ve sekme kapandığında silinir. Kaydet menüsünden çizimi resim olarak (PNG, PDF ya da SVG) alabilir ya da sonra açıp düzenlemeye devam etmek için PediTree dosyası olarak saklayabilirsiniz. Resim rapora ve hasta dosyasına eklenir; PediTree dosyası yalnızca PediTree’de açılır.'),
    target: () => [one('.toolbar [data-popup="download"] > button'), one('.toolbar .download-popover')], prepare: (c) => { c.clear(); c.openSave(); } },
  { id: 'arrange', icon: LayoutGrid, title: tk('Geri al ve Konumlandır'),
    text: tk('Geri al ve Yinele her değişikliği adım adım geri getirir (Cmd/Ctrl + Z). Konumlandır, bireyleri çizimde yeniden yerleştirerek düzeni sadeleştirir; akrabalık ilişkileri değişmez ve bu işlem de geri alınabilir.'),
    target: () => [one(`.toolbar button[aria-label="${tNow('Geri al')}"]`), one(`.toolbar button[aria-label="${tNow('Yinele')}"]`), one('.toolbar [data-overflow="relayout"]')], prepare: (c) => c.clear() },
  { id: 'out', icon: Printer, title: tk('Yazdır ve Paylaş'),
    text: tk('Yazdır, çizimi tarihiyle birlikte tek bir A4 sayfaya yerleştirir. Paylaş, pedigrinin resmini cihazınızın paylaşım seçenekleriyle (e-posta, mesajlaşma uygulamaları) gönderir ve hasta adını resimden çıkarma seçeneği sunar.'),
    target: () => [one('.toolbar [data-overflow="print"]'), one('.toolbar [data-overflow="share"]')], prepare: (c) => c.clear() },
  { id: 'multi', icon: CheckSquare, title: tk('Birden çok bireyi düzenlemek'),
    text: tk('Aynı değişikliği birden çok bireye uygulamak için (örneğin hepsini taşıyıcı olarak işaretlemek) Shift ya da Cmd/Ctrl tuşu basılıyken sembollere tıklayın. Dokunmatik ekranda üst çubuktaki Çoklu seçim düğmesi kullanılır. Panel, değişikliği seçilen bireylerin tümüne uygular.'),
    target: (c) => (c.coarse ? one('.toolbar [data-overflow="multi"]') : null), prepare: (c) => c.clear() },
  { id: 'settings', icon: SlidersHorizontal, title: tk('Ayarlar'),
    text: tk('Ekranın ve çizimin dili ayrı ayrı seçilebilir. Görünüm ve Çizim bölümleri renkleri, taşıyıcı gösterimini ve yazı boyutunu belirler. Halka menü ve Yan panel bölümlerinde sık kullandığınız seçenekleri öne alabilirsiniz. Semboller bölümü her sembolün anlamını açıklar.'),
    target: () => one('.settings-dialog .settings-nav'), prepare: (c) => { c.clear(); c.openSettings('language'); } },
  { id: 'about', icon: Info, title: tk('Hakkında ve geri bildirim'),
    text: tk('Bu bölümde sürüm bilgisi, atıf metni ve lisans yer alır. Bir hata ya da öneri bildirmek için Hata bildir, Öneri paylaş ya da E-posta bağlantılarını kullanabilirsiniz. Bildirime hastayı tanıtan bir bilgi ya da ekran görüntüsü eklemeyin.'),
    target: () => { const l = one('.settings-dialog .about-links'); return l ? [l.previousElementSibling, l, l.nextElementSibling] : null; },
    prepare: (c) => { c.clear(); c.openSettings('about'); } },
  { id: 'again', icon: CircleHelp, title: tk('Turu yeniden açmak'),
    text: tk('Tura istediğiniz zaman bu düğmeden dönebilirsiniz. İyi çalışmalar.'),
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
  // nowhere beside it (a window nearly as large as the screen): in the corner where it covers least of it
  const corners = [[view.w - w - EDGE, view.h - h - EDGE], [EDGE, view.h - h - EDGE], [view.w - w - EDGE, EDGE], [EDGE, EDGE]];
  const covered = ([x, y]) => Math.max(0, Math.min(x + w, rect.right) - Math.max(x, rect.left)) * Math.max(0, Math.min(y + h, rect.bottom) - Math.max(y, rect.top));
  const [left, top] = corners.reduce((best, c) => (covered(c) < covered(best) ? c : best));
  return { left, top, side: null, arrow: 0 };
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
    c.closeAll();
    if (step.prepare) step.prepare(c);
  }, [step]);

  // the page knows the tour runs (a window the tour opens does not dim the page a second time)
  useEffect(() => {
    document.body.classList.add('touring');
    return () => document.body.classList.remove('touring');
  }, []);

  // the lit area follows what moves (the panel sliding in, the ring opening, a resized window)
  useEffect(() => {
    let prev = '';
    let seen = '';
    let scrolled = false;
    let acted = !step.act;
    const tick = () => {
      // the step opens its part of the ring, one click per tick, once the ring is there
      if (!acted) acted = step.act();
      // a part further down the side panel (or a window) is scrolled into view, once
      if (!scrolled) {
        const found = step.target(ctxRef.current);
        const first = (Array.isArray(found) ? found : [found]).find(Boolean);
        const box = first && first.closest && (first.closest('.side') || first.closest('.settings-pane'));
        if (box) {
          scrolled = true;
          const r = first.getBoundingClientRect();
          const b = box.getBoundingClientRect();
          // below the panel's sticky header
          if (r.top < b.top || r.bottom > b.bottom) box.scrollTop += r.top - b.top - Math.max(box.classList.contains('side') ? 90 : 24, (b.height - r.height) / 3);
        }
      }
      // the lit area moves once what it points at has come to rest (a window still opening, a panel
      // still sliding in or scrolling): following every frame of that made the glide restart and
      // speed up (clinician report 2026-11-10, from step 7 to 8)
      const a = aim(step, ctxRef.current);
      const key = JSON.stringify(a);
      const settled = key === seen;
      seen = key;
      if (settled && key !== prev) { prev = key; setAimed(a); }
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
    let over = false;
    const ease = (x) => 1 - (1 - x) ** 3;
    // the clock is read here, not taken from the frame (some browsers time frames from another origin)
    const run = () => {
      if (over) return;
      const k = ease(Math.max(0, Math.min(1, (performance.now() - t0) / GLIDE)));
      const mix = (p) => from[p] + (to[p] - from[p]) * k;
      const left = mix('left'); const top = mix('top'); const right = mix('right'); const bottom = mix('bottom');
      put({ left, top, right, bottom, width: right - left, height: bottom - top });
      if (k < 1) frame = window.requestAnimationFrame(run);
    };
    frame = window.requestAnimationFrame(run);
    // a background window gets no frames: the lit area is in place anyway once the glide's time is up
    const late = window.setTimeout(() => { over = true; put(to); }, GLIDE + 80);
    return () => { over = true; window.cancelAnimationFrame(frame); window.clearTimeout(late); };
  }, [aimed.rect]);

  useEffect(() => { if (nextRef.current) nextRef.current.focus({ preventScroll: true }); }, [at]);

  const finish = useCallback(() => { ctxRef.current.closeAll(); onClose(); }, [onClose]);
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
