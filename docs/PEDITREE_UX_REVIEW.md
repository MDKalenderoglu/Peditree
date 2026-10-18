# Peditree — UX incelemesi ve kalıcı UX gereksinimleri

Durum: gereksinimler kayıtlı; uygulama Faz 5 (UX). Açık UX sorunları: `PEDITREE_KNOWN_ISSUES.md`,
`PEDITREE_AUDIT_REPORT.md` §2.5.

## UXR-1 — Akıllı ilişki görselleştirmesi (kalıcı ürün gereksinimi, 2026-10-18)

Peditree iki görünüm sunar:

1. **Standart klinik görünüm** — siyah-beyaz, NSGC gösterimi. Varsayılan; her zaman kullanılabilir; dışa aktarma
   varsayılanı.
2. **Akıllı renkli görünüm** — standart çizimin üstüne yardımcı katman. Kullanıcı açıp kapatabilir.

### Davranış

- **Birey seçimi:** seçili kişinin ebeveynlik (anne-baba çifti ve iniş çizgisi), partnerlik (evlilik/birliktelik
  çizgileri) ve çocuk bağlantıları (iniş çizgisi, kardeşlik çizgisi, çocuk dikeyleri) vurgulanır; diğer her şey
  soluklaşır ama kaybolmaz.
- **Akraba evliliği seçimi:** çift çizgili birliktelik seçildiğinde iki partnerden ortak atalara uzanan soy yolları
  vurgulanır; her yol ayrı izlenebilir; ortak ata(lar) işaretlenir; derece (ör. birinci kuzen) gösterilir.
- **Aile dalı renkleri:** farklı aile bağlantıları (ör. anne tarafı / baba tarafı / eşin ailesi) yardımcı renklerle
  ayrılabilir.

### Değişmez kurallar

- Kesikli çizgi, çift çizgi, "//" ve diğer standart gösterimlerin **anlamı hiçbir görünümde değişmez**; renk yalnızca
  ek bilgidir. Siyah-beyaz görünümde hiçbir bilgi kaybolmaz.
- Renkler **hatalı yerleşimi gizlemek için kullanılamaz**. Akıllı görünüm yalnızca doğru çizilmiş (invariant ve
  okunabilirlik denetimlerinden geçmiş) çizimin üstüne uygulanır; düzen motoru renkten bağımsız çalışır.
- Renk körlüğü: renk tek ayırt edici değildir (çizgi kalınlığı/desen/etiket ile desteklenir); seçilen palet
  deuteranopi/protanopi/tritanopi simülasyonunda ayırt edilebilir olmalı; kontrast WCAG AA.
- Vurgulama bağlantı sahipliğine dayanır (`edge.unionId`, `childId`): hangi çizginin kime ait olduğu modelden gelir,
  görsel tahminden değil.

### Kabul kriterleri (Faz 5)

| # | Kriter | Doğrulama |
|---|---|---|
| A1 | Görünüm geçişi (standart ↔ akıllı) düğmesi; varsayılan standart; tercih oturumda hatırlanır | E2E |
| A2 | Bir birey seçildiğinde vurgulanan çizgi kümesi = o kişinin ebeveyn birliği + partner birlikleri + çocuklarının iniş/kardeşlik/çocuk dikeyleri (sahiplik kimliklerinden hesaplanır); başka hiçbir çizgi vurgulanmaz | birim testi (sahiplik kümesi) + ekran görüntüsü |
| A3 | Akraba evliliği seçildiğinde her iki partnerden ortak ata(lar)a giden tüm yollar vurgulanır; yol hesabı grafikten (ortak atalar mevcut olmalı — kural 4); ortak ata yoksa vurgulama değil hata gösterilir | birim testi (yol bulma, döngülü pedigri CS-10/CS-12) |
| A4 | Akıllı görünüm açıkken ve kapalıyken düğüm konumları ve bağlantı geometrisi **birebir aynı** (renk katmanı yerleşimi değiştirmez) | otomatik test: iki görünümde `{nodes, edges}` eşitliği |
| A5 | Standart görünümün dışa aktarımı (SVG/PNG/PDF) renk içermez; renkli dışa aktarma ayrı, açık bir seçenektir ve lejant ekler | dışa aktarma testi |
| A6 | Kesikli/çift çizgi/"//" akıllı görünümde de aynı desende çizilir (yalnız renk/kalınlık değişebilir) | renderer testi |
| A7 | Renk körlüğü simülasyonunda (3 tip) dal renkleri ayırt edilebilir; renk tek ayırt edici değildir | manuel QA + kontrast ölçümü |
| A8 | Her iki görünümün ekran görüntüleri regresyon setinde (aynı pedigri, aynı yerleşim) karşılaştırılır | Faz 6 ekran görüntüsü regresyonu |
| A9 | Vurgulama 300 kişilik pedigride < 100 ms | performans testi |

## UXR-2 — Düzenleme kararlılığı (kalıcı gereksinim)

Bir kişiye eş veya çocuk eklemek, kişi silmek veya bilgi düzenlemek çizimin ilgisiz kısımlarını yeniden düzenlememeli;
yalnızca ilgili aile bloğu değişmeli. Ayrıntı ve çıkış ölçütü: `PEDITREE_KNOWN_ISSUES.md` KI-2.

## Görsel QA'da bulunan ve kapatılan UX sorunları

KI-5 (uyarı kutusu tuvali örtüyordu), KI-6 (araç çubuğu çakışması), KI-7 (dışarıdan gelen eşler için yanlış uyarı) —
`PEDITREE_KNOWN_ISSUES.md`.
