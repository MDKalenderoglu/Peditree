/**
 * SymbolGuide.jsx — Ayarlar → Semboller (clinician request 2026-11-05): every
 * symbol and line the drawing uses, drawn small the way the drawing draws it,
 * with its name and one line on what it means (NSGC 2022; notation spec
 * docs/PEDITREE_CLINICAL_NOTATION_SPEC_V1.md). Reference only: it changes nothing.
 */
import { useT, tk } from '../i18n';
import { useViewSettings } from '../utils/drawingStyle';

const INK = 'var(--ink)';
const line = { stroke: INK, strokeWidth: 1.6, fill: 'none' };
const shape = { stroke: INK, strokeWidth: 1.6, fill: '#fff' };
const R = 9; // half a symbol

const Square = ({ x = 22, y = 16, fill = '#fff', ...rest }) => <rect x={x - R} y={y - R} width={2 * R} height={2 * R} {...shape} fill={fill} {...rest} />;
const Circle = ({ x = 22, y = 16, fill = '#fff' }) => <circle cx={x} cy={y} r={R} {...shape} fill={fill} />;
const Diamond = ({ x = 22, y = 16 }) => <path d={`M${x},${y - R - 2}L${x + R + 2},${y}L${x},${y + R + 2}L${x - R - 2},${y}Z`} {...shape} />;
const Triangle = ({ x = 22, y = 18, s = 7 }) => <path d={`M${x},${y - s}L${x + s},${y + s * 0.8}L${x - s},${y + s * 0.8}Z`} {...shape} />;
const Letter = ({ x = 22, y = 16, children, size = 9 }) => <text x={x} y={y + size / 3} textAnchor="middle" fontSize={size} fontWeight="700" fill={INK}>{children}</text>;
// the arrow points at the symbol's lower left from below; the proband's P stands at its tail
const Arrow = () => <><path d="M10,32 L17,25" {...line} /><path d="M13,25 H17 V29" {...line} /></>;
const Couple = ({ children }) => <><Square x={8} y={14} /><Circle x={36} y={14} />{children}</>;

// [drawing, name, meaning]; the drawing in a 44 × 34 box
const GROUPS = [
  [tk('Kişiler'), [
    [() => <Square />, tk('Erkek'), null],
    [() => <Circle />, tk('Kadın'), null],
    [() => <Diamond />, tk('Cinsiyeti bilinmeyen'), null],
    [() => <><Square /><Letter>3</Letter></>, tk('Birden çok kişi'), tk('İçindeki sayı kadar kişi; sayı bilinmiyorsa n')],
    [() => <><Square x={26} y={14} fill={INK} /><Arrow /><Letter x={5} y={28} size={9}>P</Letter></>, tk('Proband'), tk('Ailede incelemeye yol açan ilk etkilenmiş kişi')],
    [() => <><Square x={26} y={14} /><Arrow /></>, tk('Danışan'), tk('Danışmanlık için başvuran kişi (P yazmaz)')],
  ]],
  [tk('Durum'), [
    [() => <Square fill={INK} />, tk('Etkilenmiş'), tk('Hasta; birden çok bulgu sembolde ayrı bölgelerdir, açıklamada yazar')],
    [(carrier) => (carrier === 'dot'
      ? <><Square /><circle cx={22} cy={16} r={2.4} fill={INK} /></>
      : <><defs><pattern id="sg-hatch" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="3" stroke={INK} strokeWidth="1.1" /></pattern></defs>
        <Square /><path d="M13,7h9v18h-9z" fill="url(#sg-hatch)" stroke="none" /><path d="M22,7v18" {...line} /><Square fill="none" /></>), tk('Taşıyıcı'), tk('Hasta değil, hastalığa yol açan geni taşıyor (gösterimi Ayarlar → Çizim)')],
    [() => <><Square /><path d="M22,7v18" {...line} /></>, tk('Belirtisiz taşıyıcı'), tk('Şu an belirtisi yok, ileride çıkabilir')],
    [() => <><Square /><path d="M10,29L34,3" {...line} /></>, tk('Vefat'), tk('Altında ölüm yaşı: "ölüm 42 y"')],
    [() => <><Square /><path d="M16,4h-5v24h5M28,4h5v24h-5" {...line} /></>, tk('Evlat edinilmiş'), tk('Köşeli parantez içinde; evlat edinen aileden kesikli çizgi')],
    [() => <><Square /><Letter x={34} y={28} size={11}>*</Letter></>, tk('Kayıtlarla doğrulandı'), tk('Bulgu tıbbi kayıt ya da raporla görüldü')],
    // nothing inside the symbol: the result lines stand under it (drawn here as short lines of text)
    [() => <><Square y={11} /><path d="M12,26H32M15,31H29" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" /></>, tk('Genetik test'), tk('Sembolün altında sonuç satırları; satır yoksa "test yapıldı"')],
    [() => <><Square /><Letter>D</Letter></>, tk('Donör'), tk('Sperm ya da yumurta veren kişi')],
    [() => <><Circle /><Letter>G</Letter></>, tk('Gestasyonel taşıyıcı'), tk('Gebeliği taşıyan, yumurtası kullanılmayan kadın')],
  ]],
  [tk('Gebelik'), [
    [() => <><Diamond /><Letter>P</Letter></>, tk('Devam eden gebelik (P)'), tk('Altında son adet tarihi')],
    [() => <Triangle />, tk('Düşük'), tk('Kendiliğinden gebelik kaybı (SAB)')],
    [() => <><Triangle /><path d="M13,27L31,9" {...line} /></>, tk('Sonlandırma (TOP)'), tk('İsteğe bağlı gebelik sonlandırma')],
    [() => <><Triangle /><Letter y={32} size={6}>ECT</Letter></>, tk('Dış gebelik (ECT)'), null],
    [() => <><Diamond /><path d="M11,29L33,3" {...line} /></>, tk('Ölü doğum (SB)'), null],
  ]],
  [tk('Çizgiler'), [
    [() => <Couple><path d="M17,14H27" {...line} /></Couple>, tk('Eşler'), null],
    [() => <Couple><path d="M17,12H27M17,16H27" {...line} /></Couple>, tk('Akraba evliliği'), tk('Çift çizgi; derece ve F yan panelde')],
    [() => <Couple><path d="M17,14H27M19,19L23,9M22,19L26,9" {...line} /></Couple>, tk('Ayrılmış ya da boşanmış'), tk('Çizginin üstünde //')],
    [() => <Couple><path d="M17,14H27" {...line} /><text x={22} y={7} textAnchor="middle" fontSize="5.5" fill={INK}>{'…'}</text></Couple>, tk('Aynı köy'), tk('Akrabalık değil; çizgi tek kalır, üstünde yazar')],
    [() => <Couple><path d="M17,14H27M22,14V27M16,27H28" {...line} /></Couple>, tk('Çocuksuz çift'), tk('Kendi isteğiyle ya da nedeni bilinmiyor')],
    [() => <Couple><path d="M17,14H27M22,14V25M16,25H28M16,29H28" {...line} /></Couple>, tk('İnfertil'), tk('Kısırlık')],
    [() => <><path d="M8,4H36M22,4V10L12,26M22,10L32,26M15,21H29" {...line} /></>, tk('Tek yumurta ikiz'), null],
    [() => <><path d="M8,4H36M22,4V10L12,26M22,10L32,26" {...line} /></>, tk('Çift yumurta ikiz'), null],
    [() => <><path d="M8,4H36M22,4V10L12,26M22,10L32,26" {...line} /><Letter y={22} size={8}>?</Letter></>, tk('İkizliği bilinmiyor'), null],
    [() => <path d="M22,2V32" {...line} strokeDasharray="4 3" />, tk('Kesikli iniş çizgisi'), tk('Evlat edinen aileden gelen çocuk')],
  ]],
];

export default function SymbolGuide() {
  const t = useT();
  const carrier = useViewSettings((s) => s.view.carrierMark);
  return (
    <>
      {GROUPS.map(([title, rows]) => (
        <div key={title} className="set-block">
          <div className="set-block-title">{t(title)}</div>
          <ul className="symbol-guide">
            {rows.map(([draw, name, meaning]) => (
              <li key={name}>
                <svg className="symbol-guide-mark" width="44" height="34" viewBox="0 0 44 34" aria-hidden="true">
                  {draw(carrier)}
                </svg>
                <span className="symbol-guide-text">
                  <span className="set-row-title">{t(name)}</span>
                  {meaning && <span className="set-row-hint">{t(meaning)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
