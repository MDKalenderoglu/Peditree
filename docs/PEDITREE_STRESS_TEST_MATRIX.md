# Peditree — Stres Test Matrisi

Her senaryonun klinik gerekçesi, beklenen davranışı, testin nerede çalıştığı ve bugünkü durumu.
Durum sütunu son ölçüme göredir (`npm run audit:layout-benchmark`, `npm run audit:layout-fuzz`; 2026-10-18, Faz 3).
Varsayılan motor Faz 3'ten beri **PCL**; `recursive` ve `legacy` geri dönüş olarak ölçülmeye devam ediyor.

Lejant: ✅ geçiyor · ❌ başarısız · ⏳ fikstür/test henüz yok (planlı) · 🚫 model desteklemiyor (önce veri modeli)

## Ölçüm katmanları

| Katman | Ne ölçer | Araç |
|---|---|---|
| Anlamsal | Grafik bütünlüğü, veri kaybı, yanlış kişiye veri aktarımı | `auditPedigreeGraph`, `dataIntegrityRegressions.test.js` |
| Geometrik — invariant | 13 kural (çakışma, düğüm içinden geçen çizgi, ortak kardeş çizgisi …) | `src/audit/layoutInvariants.js` |
| Geometrik — okunabilirlik | Farklı ailelerin çizgilerinin kesişmesi, üst üste binmesi, birbirine "değmesi"; merkezleme, çizgi uzunluğu | `src/audit/connectorReadability.js` |
| Görsel / klinik | Gerçek tarayıcıda çizim, ekran görüntüsü, dışa aktarma | şimdilik uygulama içi tarayıcı ile manuel kanıt (`docs/screenshots/`); otomatik E2E Faz 6 |

## A. Çok kuşaklı ve geniş aileler

| ID | Senaryo | Beklenen | Nerede | recursive | legacy | **pcl** |
|---|---|---|---|---|---|---|
| CS-01 | 3 kuşak başlangıç | Ebeveynler çocuk üstünde ortalı, büyükanne-büyükbabalar kendi çocuklarının üstünde, kırık çizgi yok | fikstür | ❌ (koridor çizgisi annenin iniş çizgisiyle üst üste) | ✅ | ✅ |
| CS-02 | Ders kitabı OD pedigrisi (4 kuşak, 7 kardeş, gelin/damatlar) | Kitaptaki gibi temiz | fikstür | ✅ | ❌ | ✅ |
| CS-08 | 12 çocuklu kardeşlik, her biri evli + 2 çocuk | Yelpazeler ayrık, çiftler ortalı | fikstür | ✅ | ✅ | ✅ |
| CS-09 | 6 kuşak + her kuşakta yan dal | Temiz | fikstür | ✅ | ✅ | ✅ |
| A-5 | 8 ve 10 kuşak | Temiz, satırlar tutarlı | ⏳ | | |  |
| A-6 | Her iki tarafta 5+ hala/amca/dayı/teyze, farklı çocuk sayıları | Dallar ayrık, köprü çizgisi kısa | ⏳ (fuzz kısmen kapsıyor) | | | ✅ (gerçekçi büyük pedigriler, §G) |
| A-7 | Tek ebeveyni bilinen birey | İniş tek ebeveynden | kısmi (yer tutucu) | | |  |
| A-8 | Dalların ileri kuşakta yeniden birleşmesi | bkz. B | | | |  |

## B. Akraba evliliği ve pedigri çökmesi

| ID | Senaryo | Beklenen | Nerede | recursive | legacy | **pcl** |
|---|---|---|---|---|---|---|
| CS-04 | Ebeveynler birinci kuzen | Çift çizgi kısa, ortak atalar yukarıda | fikstür | ❌ | ✅ | ✅ |
| CS-05 | Çift birinci kuzen | Kesişim yok ya da atlamalı | fikstür | ❌ | ❌ | ✅ |
| CS-10 | Tekrarlayan akraba evliliği (2. ve 4. kuşak) | Temiz | fikstür | ❌ | ✅ | ✅ |
| CS-12 | Pedigri çökmesi (iki döngü) | Temiz veya belgelenmiş kaçınılmaz kesişim (atlamalı) | fikstür | ❌ | ✅ | ✅ |
| B-5 | İkinci/üçüncü kuzen evliliği | Derece etiketi çift çizginin üstünde | ⏳ | | |  |
| B-6 | Aynı kişiye birden çok akrabalık yolu | Tüm yollar gösterilebilir | ⏳ | | |  |
| B-7 | Avunküler (farklı kuşak) birliktelik | **Ürün kararı bekliyor** | 🚫 | | |  |

## C. Çoklu partner ve karmaşık ebeveynlik

| ID | Senaryo | Beklenen | Nerede | recursive | legacy | **pcl** |
|---|---|---|---|---|---|---|
| CS-06 | Üç partner, yarım kardeşler | Kişi ortada, partnerler iki yanda, her çiftin çocukları kendi altında | fikstür | ❌ | ❌ | ✅ |
| CS-07 | Harmanlanmış aile (iki tarafın önceki çocukları) | Temiz | fikstür | ❌ | ❌ | ✅ |
| CS-11 | Berdel (karşılıklı evlilik) | Kesişim en az, kalan atlamalı | fikstür | ❌ | ❌ | ✅ |
| CS-13 | İki ebeveyn tarafından yarım kardeşler | Temiz | fikstür | ❌ | ❌ | ✅ |
| C-5 | Evlat edinme (içeri/dışarı/akraba tarafından) | Köşeli parantez, kesikli/düz iniş | 🚫 (Faz 2b) | | |  |
| C-6 | Donör gamet, gestasyonel taşıyıcı | D / G gösterimi | 🚫 (Faz 2b) | | |  |
| C-7 | Genetik ve sosyal ebeveynlik ayrımı | Tipli ebeveyn bağı | 🚫 (Faz 2b) | | |  |

## D. Gebelik ve özel durumlar

| ID | Senaryo | Beklenen | Nerede | Durum |
|---|---|---|---|---|
| D-1 | SAB, ölü doğum | Standart semboller + hafta | renderer | kısmi (ölü doğum standart dışı, hafta yok) |
| D-2 | TOP, ektopik, süren gebelik | Standart semboller | 🚫 | |
| D-3 | MZ / DZ / zigotu bilinmeyen ikiz, üçüz | Tek noktadan ayrılan çizgiler, MZ çubuğu | 🚫 | |
| D-4 | Çoğul gebelikte bir fetüs kaybı | | 🚫 | |
| D-5 | Proband + consultand | P'li ok / P'siz ok | kısmi (P yok, consultand yok) | |
| D-6 | Birden fazla durum | Bölünmüş sembol + lejant | kısmi (veri var, çizim yok) | |

## E. Dinamik düzenleme (işlem sırası)

Fuzz harness'ı gerçek store eylemleriyle rastgele işlem dizileri üretir; her adımdan sonra invariant ve okunabilirlik
ölçülür. Faz 2a regresyon testleri işlem-sırası kaynaklı veri kayıplarını sabitler.

| ID | Senaryo | Nerede | Durum |
|---|---|---|---|
| E-1 | Düzenleme sil → yeni eş ekle (kimlik çakışması) | `dataIntegrityRegressions.test.js` DM-2 | ✅ (Faz 2a) |
| E-2 | Sağ panel yaşı → yapısal değişiklik | DM-3 | ✅ (Faz 2a) |
| E-3 | Ebeveyn silme → çocuk diğer ebeveyne bağlı kalır | DM-4 | ✅ (Faz 2a) |
| E-4 | Sayı azalt-artır → eski kişinin verisi yeni kişiye geçmez | DM-5/6 | ✅ (Faz 2a) |
| E-5 | Cinsiyet değişikliği mevcut birlikteliği bozmaz | DM-7 | ✅ (Faz 2a) |
| E-6 | Görevde tanımlanan 12 adımlı akış (oluştur → sil → geri al → eş değiştir → akrabalık → kaydet/yeniden aç) | ⏳ (Faz 4 senaryo testi) | |
| E-7 | Aynı aileyi farklı işlem sıralarıyla kurup yapısal denklik | ⏳ (Faz 2b: kalıcı kimliklerle anlamlı) | |
| E-8 | Fuzz üreticisine geri al / yinele / kaydet-yükle / düzenleme silme / sayı azaltma ekleme | ⏳ (Faz 2a devamı) | |
| E-9 | "Doğum Sırası" ile babayı amcalar arasında taşıma (büyükanne-büyükbaba kardeşliği, doğrudan eklenen çocuklar) | `dataIntegrityRegressions.test.js` DM-12 | ✅ (Faz 3; önceden sessizce etkisizdi) |
| E-10 | Bir kardeşe eş + çocuk eklemek çizimi aynalamaz (editörde görüldü) | `pclLayout.test.js` | ✅ (Faz 3) |
| E-11 | Düzenleme kararlılığı (2 200 rastgele düzenleme, probanda göre hizalı) | ölçüm | ortalama kayma 37,8 px; %72,1 düzenlemede kimse > 1 slot kaymıyor; ebeveyn sol/sağ çevrilmesi %7,1 (açık risk) |

## F. Adversarial

| ID | Senaryo | Durum |
|---|---|---|
| F-1 | Uzun çapraz bağlantılar (A1: 33 kişilik gerçekçi aile — eşin ebeveynleri + kuzen evliliği) | ❌ recursive: 7 sessiz kesişim (`docs/screenshots/audit/A1-…`) · ✅ **pcl**: 0 ihlal, kuzen kardeşlikleri ebeveynlerinin altında, 1 atlamalı kesişim (eşin ebeveynleri halanın ailesinin üstünden — yapısal) (`docs/screenshots/faz3/F3-03-…`) |
| F-2 | Aynı dala tekrar tekrar ekleme (rastgele 60–400 işlem, 66–474 kişi) | ❌ recursive: binlerce px uzak eşler · **pcl**: 263 kişiye kadar 0 ihlal; 387 / 474 kişide 12 / 7 ayak izi ihlali (30 çocuklu kardeşlik, 9–13 aileler arası evlilik) — açık risk |
| F-3 | Çok sayıda partner + yeniden birleşen soy hatları | ⏳ |

## G. Gerçekçi büyük pedigriler (sentetik, `src/audit/largePedigrees.js`)

Kurucu çift + 1–6 kardeşlik, eşlerin çoğu dışarıdan, bazı eşlerin ebeveyn ve kardeşleri çizili, ikinci evlilikler,
birinci/ikinci kuzen evlilikleri (gerçek döngüler). Gerçek hasta verisi yok.

| Vaka | Kişi | Kuzen döngüsü | recursive | legacy | **pcl** | pcl merkezleme (kayık çift) | pcl atlama | pcl süre |
|---|---|---|---|---|---|---|---|---|
| realistic-100 | 105 | 2 | 0 inv / 118 okunabilirlik | 73 / 140 | **0 / 0** | 7/22 | 17 | ~28–32 ms |
| realistic-200 | 208 | 3 | 0 / 553 | 369 / 998 | **0 / 0** | 37/45 | 77 | ~150–165 ms |
| realistic-300 | 312 | 4 | 0 / 1007 | 918 / 2746 | **0 / 0** | 50/68 | 59 | ~455–535 ms |

Zaman bütçeleri (`pclLayout.test.js`): 100 kişi < 500 ms, 300 kişi < 2 s — geçiyor. Merkezleme büyük pedigride zayıf
(bkz. `PEDITREE_LAYOUT_ARCHITECTURE.md` §7.3).

## Bilinen kapsam boşlukları

- Gerçek tarayıcıda otomatik E2E ve ekran görüntüsü regresyonu yok (Faz 6; Playwright kurulumu ayrıca onaylanacak).
- Fuzz üreticisi henüz geri al/yinele, kaydet/yükle ve düzenleme silme işlemlerini üretmiyor (E-8).
- 🚫 satırları veri modeli genişletilmeden (Faz 2b) test edilemez.
