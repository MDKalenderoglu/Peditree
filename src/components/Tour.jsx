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
    text: tk('Bireyin cinsiyeti ve klinik durumu buradan işaretlenir: etkilenmiş, taşıyıcı, presemptomatik (henüz belirti göstermeyen) ya da vefat etmiş. Proband ve danışmaya gelen birey (danışan) da bu listeden belirlenir.'),
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
    target: (c) => ({ areas: [[drawnNode(c.ids.father), drawnNode(c.ids.mother)], [cardTitled('Bu çift')]] }), prepare: (c) => c.selectCouple(c.ids.mother, c.ids.father) },
  { id: 'kinship', icon: Link2, title: tk('Akrabalık ve Aynı köy'),
    text: tk('Eşler arasında kan bağı varsa Var seçilir ve çizgi çift çizgiye dönüşür. Anne ile babanın akrabalık derecesi seçildiğinde ortak atalar çizime kendiliğinden eklenir ve çocuklar için akrabalık katsayısı (F) hesaplanır. Aynı köy akrabalık sayılmaz; çizgi tek kalır, üzerine yalnızca bir not yazılır.'),
    target: (c) => ({ areas: [[drawnNode(c.ids.father), drawnNode(c.ids.mother)], [fieldCol('Akrabalık')]] }), prepare: (c) => c.selectCouple(c.ids.mother, c.ids.father) },
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
    // "Hata ve öneriler": its heading, its words, its three links and the note under them
    target: () => { const l = one('.settings-dialog .about-links'); return l ? [l.previousElementSibling && l.previousElementSibling.previousElementSibling, l.previousElementSibling, l, l.nextElementSibling] : null; },
    prepare: (c) => { c.clear(); c.openSettings('about'); } },
  { id: 'again', icon: CircleHelp, title: tk('Turu yeniden açmak'),
    text: tk('Tura istediğiniz zaman bu düğmeden yeniden ulaşabilirsiniz. İyi çalışmalar dileriz.'),
    target: () => one('.toolbar .tour-btn'), prepare: (c) => c.clear() },
];


/*
 * The touch screen's tour (clinician report 2026-11-10: on a phone the tour pointed at parts the phone does
 * not show and its cards covered the screen). Its own few steps, on what a phone shows: the drawing, the
 * bar below a person, "Ekle", the details, the couple, Menü, the patient, Kaydet.
 */
const tile = (name) => all('.touch-sheet .dock-tile').find((b) => b.textContent.trim() === tNow(name)) || null;
const pressTile = (name) => () => {
  const b = tile(name);
  if (!b) return false;
  if (b.getAttribute('aria-expanded') !== 'true') b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return true;
};
export const TOUCH_STEPS = [
  TOUR_STEPS[0],
  { id: 't-drawing', icon: Shapes, title: tk('Çizim alanı'),
    text: tk('Kare erkeği, daire kadını, içi dolu sembol etkilenmiş bireyi gösterir; ok ve P harfi probandı belirtir. Bir kişiyle çalışmak için sembolüne dokunun; iki parmakla yakınlaştırıp uzaklaştırabilirsiniz.'),
    target: (c) => drawnNode(c.ids.proband), prepare: (c) => c.clear() },
  { id: 't-bar', icon: CircleDot, title: tk('Kişinin çubuğu'),
    text: tk('Bir kişiye dokunduğunuzda ekranın altında bu çubuk açılır. Ekle akraba ekler; Bulgu, Durum ve Bilgiler kişinin kendi bilgilerini düzenler.'),
    target: () => one('.touch-sheet'), prepare: (c) => c.select(c.ids.proband) },
  { id: 't-add', icon: UserPlus, title: tk('Akraba eklemek'),
    text: tk('Ekle’ye dokunduğunuzda Ebeveyn, Kardeş, Eş, Çocuk ve İkiz seçenekleri açılır. Seçtiğiniz akrabanın cinsiyeti ya da gebelik sonucu ardından yazılı düğmelerle sorulur.'),
    target: () => one('.touch-sheet'), prepare: (c) => c.select(c.ids.proband), act: pressTile('Ekle') },
  { id: 't-details', icon: PanelRight, title: tk('Ayrıntılar'),
    text: tk('Ayrıntılar’a dokunmak ya da çubuğu yukarı çekmek kişinin bütün bilgilerini açar: ad, yaş, not, genetik test, evlat edinme, doğum sırası. Aşağı çekince çubuğa dönülür, bir kez daha çekince kapanır.'),
    target: () => one('.touch-sheet'), prepare: (c) => { c.select(c.ids.proband); c.openDetails(); } },
  { id: 't-couple', icon: Link2, title: tk('Eşler arasındaki çizgi'),
    text: tk('İki eşi birleştiren çizgiye dokunduğunuzda çiftin bilgileri açılır: ilişkinin durumu, akrabalık ya da “Aynı köy”, çocuksuzluk; çifte çocuk da buradan eklenir.'),
    target: () => one('.touch-sheet'), prepare: (c) => c.selectCouple(c.ids.mother, c.ids.father) },
  { id: 't-menu', icon: ListChecks, title: tk('Menü'),
    text: tk('Geri al, Yinele, Yeni, Aç, Konumlandır, Yazdır, Paylaş, Ayarlar ve bu tur Menü’de yer alır.'),
    target: () => one('.toolbar .more-popover'), prepare: (c) => { c.clear(); c.openMenu(); } },
  { id: 't-patient', icon: CalendarDays, title: tk('Hasta adı ve doğum tarihi'),
    text: tk('Hasta adı çizimin başlığında ve kaydedilen dosyaların adında yer alır. Probandın doğum tarihi girildiğinde yaşı bugünün tarihine göre hesaplanır.'),
    target: () => one('.toolbar .patient-btn'), prepare: (c) => c.clear() },
  { id: 't-save', icon: Save, title: tk('Kaydetmek'),
    text: tk('Çizim yalnızca bu sekmede tutulur ve sekme kapandığında silinir. Kaydet menüsünden çizimi resim olarak alabilir ya da sonra açıp düzenlemek için PediTree dosyası olarak saklayabilirsiniz.'),
    target: () => one('.toolbar .download-popover'), prepare: (c) => { c.clear(); c.openSave(); } },
  { id: 't-again', icon: CircleHelp, title: tk('Turu yeniden açmak'),
    text: tk('Tura istediğiniz zaman Menü’deki Tanıtım turu ile yeniden ulaşabilirsiniz. İyi çalışmalar dileriz.'),
    target: () => one('.toolbar .touch-menu-btn'), prepare: (c) => c.clear() },
];

const visible = (el) => {
  if (!el || !el.isConnected || el.closest('.overflowed')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0;
};
// the boxes a part scrolls in: the lit area never reaches past what can be seen of them
const SCROLLERS = '.side, .settings-pane';
/** A step's parts as lit areas: one area, or several ({ areas: [[…], […]] }, e.g. the couple and its card). */
const areasOf = (found) => (found && found.areas ? found.areas : [Array.isArray(found) ? found : [found]]).map((a) => a.filter(Boolean)).filter((a) => a.length);

function boxOf(els) {
  const rs = els.map((e) => {
    const r = e.getBoundingClientRect();
    const sc = e.closest && e.closest(SCROLLERS);
    if (!sc) return r;
    const b = sc.getBoundingClientRect();
    return { left: Math.max(r.left, b.left), top: Math.max(r.top, b.top), right: Math.min(r.right, b.right), bottom: Math.min(r.bottom, b.bottom) };
  }).filter((r) => r.right > r.left && r.bottom > r.top);
  if (!rs.length) return null;
  const left = Math.min(...rs.map((r) => r.left)) - PAD;
  const top = Math.min(...rs.map((r) => r.top)) - PAD;
  const right = Math.max(...rs.map((r) => r.right)) + PAD;
  const bottom = Math.max(...rs.map((r) => r.bottom)) + PAD;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** The lit areas for a step; a part that went into "Diğer" is shown there. */
function aim(step, ctx) {
  let folded = false;
  const rects = areasOf(step.target(ctx)).map((list) => {
    let shown = list.filter(visible);
    if (shown.length < list.length) {
      const more = one('.toolbar .toolbar-more > button');
      if (visible(more)) { shown = [...shown, more]; folded = true; }
    }
    return shown.length ? boxOf(shown) : null;
  }).filter(Boolean);
  return { rects, folded };
}

/** A part further down a scrolling box (the side panel, a settings section) is brought into view, smoothly. */
function bringIntoView(step, ctx) {
  const areas = areasOf(step.target(ctx));
  if (!areas.length) return false; // not there yet (the panel still filling): try again on the next look
  for (const list of areas) {
    const box = list[0] && list[0].closest && list[0].closest(SCROLLERS);
    if (!box) continue;
    const rs = list.map((e) => e.getBoundingClientRect());
    const top = Math.min(...rs.map((r) => r.top));
    const bottom = Math.max(...rs.map((r) => r.bottom));
    const b = box.getBoundingClientRect();
    const head = box.classList.contains('side') ? 90 : 16; // below the panel's sticky header
    if (top >= b.top + head && bottom <= b.bottom - 8) continue;
    const by = top - b.top - Math.max(head, (b.height - (bottom - top)) / 3);
    scrollGently(box, Math.max(0, box.scrollTop + by));
  }
  return true;
}

/**
 * Scrolls a box in the tour's own motion. Not the browser's smooth scrolling: a page in the background
 * may never run it, and the part would stay out of sight; here the box is in place once the time is up.
 */
function scrollGently(box, to) {
  const from = box.scrollTop;
  if (still() || typeof window.requestAnimationFrame !== 'function' || Math.abs(to - from) < 2) { box.scrollTop = to; return; }
  const t0 = performance.now();
  let over = false;
  const run = () => {
    if (over) return;
    const k = Math.min(1, (performance.now() - t0) / GLIDE);
    box.scrollTop = from + (to - from) * (1 - (1 - k) ** 3);
    if (k < 1) window.requestAnimationFrame(run);
  };
  window.requestAnimationFrame(run);
  window.setTimeout(() => { over = true; box.scrollTop = to; }, GLIDE + 80);
}

const RADIUS = 10;   // the lit area's corners
const GLIDE = 420;   // ms: the lit area, the card and its words move from one step to the next together (ui.css --t-tour)

const still = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Rounded holes in the dimmed page (even-odd: the window minus the lit areas). */
function scrimPath(rects, w, h) {
  const hole = (r) => {
    const k = Math.max(0, Math.min(RADIUS, r.width / 2, r.height / 2));
    const { left: x, top: y, right: X, bottom: Y } = r;
    return ` M${x + k} ${y}H${X - k}Q${X} ${y} ${X} ${y + k}V${Y - k}Q${X} ${Y} ${X - k} ${Y}H${x + k}Q${x} ${Y} ${x} ${Y - k}V${y + k}Q${x} ${y} ${x + k} ${y}Z`;
  };
  return `M0 0H${w}V${h}H0Z${rects.map(hole).join('')}`;
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

/**
 * Where the card stands beside the first lit area: below, above, left or right, the first that fits on the
 * screen and covers none of the other lit areas (the couple's card in the panel, say).
 */
/** A phone: the card across the screen, at the top or the bottom, whichever covers less of what it shows. */
export function touchPlace(rects, card, view) {
  const top = 72;
  const bottom = view.h - card.h - 12;
  if (!rects.length) return { left: 8, top: Math.max(top, (view.h - card.h) / 2), side: null, arrow: 0 };
  const r = rects[0];
  const cover = (y) => Math.max(0, Math.min(y + card.h, r.bottom) - Math.max(y, r.top));
  return { left: 8, top: cover(top) <= cover(bottom) ? top : bottom, side: null, arrow: 0 };
}

export function placeCard(rect, card, view, others = []) {
  const { w, h } = card;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  if (!rect) return { left: (view.w - w) / 2, top: (view.h - h) / 2, side: null, arrow: 0 };
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  const across = () => clamp(cx - w / 2, EDGE, view.w - w - EDGE);
  const down = () => clamp(cy - h / 2, EDGE, view.h - h - EDGE);
  const area = (x, y, r) => Math.max(0, Math.min(x + w, r.right) - Math.max(x, r.left)) * Math.max(0, Math.min(y + h, r.bottom) - Math.max(y, r.top));
  const clear = (p) => others.every((o) => area(p.left, p.top, o) === 0);
  const sides = [
    () => rect.bottom + GAP + h <= view.h - EDGE && (() => { const left = across(); return { left, top: rect.bottom + GAP, side: 'below', arrow: clamp(cx - left, 18, w - 18) }; })(),
    () => rect.top - GAP - h >= EDGE && (() => { const left = across(); return { left, top: rect.top - GAP - h, side: 'above', arrow: clamp(cx - left, 18, w - 18) }; })(),
    () => rect.left - GAP - w >= EDGE && (() => { const top = down(); return { left: rect.left - GAP - w, top, side: 'left', arrow: clamp(cy - top, 18, h - 18) }; })(),
    () => rect.right + GAP + w <= view.w - EDGE && (() => { const top = down(); return { left: rect.right + GAP, top, side: 'right', arrow: clamp(cy - top, 18, h - 18) }; })(),
  ];
  for (const side of sides) { const p = side(); if (p && clear(p)) return p; }
  // nowhere beside it (a window nearly as large as the screen): in the corner where it covers least
  const corners = [[view.w - w - EDGE, view.h - h - EDGE], [EDGE, view.h - h - EDGE], [view.w - w - EDGE, EDGE], [EDGE, EDGE]];
  const covered = ([x, y]) => [rect, ...others].reduce((sum, r) => sum + area(x, y, r), 0);
  const [left, top] = corners.reduce((best, c) => (covered(c) < covered(best) ? c : best));
  return { left, top, side: null, arrow: 0 };
}

export default function Tour({ ctx, onClose }) {
  const t = useT();
  const STEPS = ctx.touch ? TOUCH_STEPS : TOUR_STEPS;
  // at: the step asked for (its screen is being set up); shown: the step on the card and its lit areas.
  // The card, its words and the light change together, once the asked step's screen has come to rest
  // (clinician 2026-11-10: the words came first and the light after; a window opened behind and the
  // light came later)
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState({ at: 0, rects: null, folded: false });
  const [lit, setLit] = useState([]); // the lit areas as drawn: they glide towards shown.rects
  const litRef = useRef([]);
  const [size, setSize] = useState({ w: 340, h: 200 });
  const cardRef = useRef(null);
  const nextRef = useRef(null);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const step = STEPS[at];
  const card = STEPS[shown.at];
  const last = shown.at === STEPS.length - 1;
  const welcome = card.id === 'welcome';
  const waiting = shown.at !== at || shown.rects === null;

  // each step sets the screen up as it talks about it
  useLayoutEffect(() => {
    const c = ctxRef.current;
    c.closeAll();
    if (step.prepare) step.prepare(c);
  }, [step]);

  // the page knows the tour runs (a window the tour opens does not dim the page a second time, nor
  // grow on its own: the tour shows it when it stands still)
  useEffect(() => {
    document.body.classList.add('touring');
    return () => document.body.classList.remove('touring');
  }, []);

  // the asked step's screen: its ring part opened, its part scrolled into view; once it stands still
  // (the same in two looks in a row) the card turns to it
  useEffect(() => {
    let seen = '';
    let done = '';
    let scrolled = false;
    let acted = !step.act;
    const tick = () => {
      if (!acted) acted = step.act();
      if (acted && !scrolled) scrolled = bringIntoView(step, ctxRef.current);
      const a = aim(step, ctxRef.current);
      const key = JSON.stringify(a);
      const settled = acted && key === seen;
      seen = key;
      if (settled && key !== done) { done = key; setShown({ at, ...a }); }
    };
    tick();
    // a timer, not animation frames: it also runs when the window is in the background
    const timer = window.setInterval(tick, 60);
    return () => window.clearInterval(timer);
  }, [step, at]);

  // the card's size for its place, measured before the screen is painted (its words just changed)
  useLayoutEffect(() => {
    if (!cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    setSize((s) => (Math.abs(s.w - r.width) > 0.5 || Math.abs(s.h - r.height) > 0.5 ? { w: r.width, h: r.height } : s));
  });

  // the lit areas glide from the last step's parts to the next (at once the first time, with reduced motion,
  // and when the number of areas changes)
  useEffect(() => {
    const to = shown.rects || [];
    const from = litRef.current;
    const put = (rs) => { litRef.current = rs; setLit(rs); };
    if (!to.length || from.length !== to.length || still() || typeof window.requestAnimationFrame !== 'function') { put(to); return undefined; }
    const t0 = performance.now();
    let frame = 0;
    let over = false;
    const ease = (x) => 1 - (1 - x) ** 3;
    // the clock is read here, not taken from the frame (some browsers time frames from another origin)
    const run = () => {
      if (over) return;
      const k = ease(Math.max(0, Math.min(1, (performance.now() - t0) / GLIDE)));
      put(to.map((r, i) => {
        const mix = (p) => from[i][p] + (r[p] - from[i][p]) * k;
        const left = mix('left'); const top = mix('top'); const right = mix('right'); const bottom = mix('bottom');
        return { left, top, right, bottom, width: right - left, height: bottom - top };
      }));
      if (k < 1) frame = window.requestAnimationFrame(run);
    };
    frame = window.requestAnimationFrame(run);
    // a background window gets no frames: the lit areas are in place anyway once the glide's time is up
    const late = window.setTimeout(() => { over = true; put(to); }, GLIDE + 80);
    return () => { over = true; window.cancelAnimationFrame(frame); window.clearTimeout(late); };
  }, [shown]);

  useEffect(() => { if (nextRef.current) nextRef.current.focus({ preventScroll: true }); }, [shown.at]);

  const finish = useCallback(() => { ctxRef.current.closeAll(); onClose(); }, [onClose]);
  const go = useCallback((d) => setAt((i) => {
    const n = i + d;
    if (n >= STEPS.length) { finish(); return i; }
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
  const rects = shown.rects || [];
  // the card stands beside where the light is going, not where it is on the way
  const place = ctx.touch ? touchPlace(rects, size, view) : placeCard(rects[0] || null, size, view, rects.slice(1));
  const titleId = `tour-title-${card.id}`;
  const Icon = card.icon;

  return (
    // data-popup: a tap on the card is "inside", so the page never swallows the click that closed a window
    <div className={`tour${ctx.touch ? ' touch' : ''}`} data-step={step.id} data-shown={card.id} data-popup="tour">
      {/* the page takes no click while the tour runs */}
      <div className="tour-block" onPointerDown={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()} />
      {/* the page dims round the lit parts: one layer with rounded holes (an SVG layer was left unpainted
          by Chrome now and then once its shape changed; a clip on a plain layer is not) */}
      <div className="tour-scrim" style={lit.length ? { clipPath: `path(evenodd, '${scrimPath(lit, view.w, view.h)}')` } : undefined} aria-hidden="true" />
      {lit.map((r, i) => <div key={`${card.id}-${i}`} className="tour-spot" style={{ left: r.left, top: r.top, width: r.width, height: r.height }} aria-hidden="true" />)}
      <div ref={cardRef} className={`tour-card${welcome ? ' tour-card-welcome' : ''}${waiting ? ' is-waiting' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}
        data-side={place.side || 'none'} style={{ left: place.left, top: place.top, '--arrow': `${place.arrow}px` }}>
        <div className="tour-track" aria-hidden="true">
          {STEPS.map((s, i) => <span key={s.id} className={i < shown.at ? 'done' : i === shown.at ? 'now' : ''} />)}
        </div>
        <div key={card.id} className="tour-body">
          {welcome ? <div className="tour-hero"><TourFamily /></div> : Icon && <span className="tour-icon" aria-hidden="true"><Icon size={18} strokeWidth={2} /></span>}
          <h3 id={titleId} className="tour-title">{t(card.title)}</h3>
          <p className="tour-text">{t(card.text)}</p>
          {shown.folded && <p className="tour-note">{t('Ekran dar olduğundan bu düğme ⋯ Diğer menüsünde yer alıyor.')}</p>}
        </div>
        {/* after the words, so it is painted over them and always takes its click (clinician 2026-11-10:
            the tour could not be left halfway — the words' box lay over the ×) */}
        <button className="tour-close" onClick={finish} aria-label={t('Turu bitir')} title={t('Turu bitir (Esc)')}>×</button>
        <div className="tour-foot">
          <span className="tour-count">{t('{n} / {all}', { n: shown.at + 1, all: STEPS.length })}</span>
          {!ctx.coarse && <span className="tour-keys" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd></span>}
          <span className="tour-actions">
            {shown.at > 0 && <button className="tour-back" onClick={() => go(-1)}>{t('Geri')}</button>}
            <button ref={nextRef} className="ui-btn ui-btn-primary tour-next" onClick={() => go(1)}>{last ? t('Bitir') : t('İleri')}</button>
          </span>
        </div>
      </div>
    </div>
  );
}
