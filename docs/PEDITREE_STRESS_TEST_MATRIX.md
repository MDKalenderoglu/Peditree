# Peditree — Stres Test Matrisi

Her senaryonun klinik gerekçesi, beklenen davranışı, testin nerede çalıştığı ve bugünkü durumu.
Durum sütunu son ölçüme göredir (`npm run audit:layout-benchmark`, `npm run audit:layout-fuzz`).

Lejant: ✅ geçiyor · ❌ başarısız · ⏳ fikstür/test henüz yok (planlı) · 🚫 model desteklemiyor (önce veri modeli)

## Ölçüm katmanları

| Katman | Ne ölçer | Araç |
|---|---|---|
| Anlamsal | Grafik bütünlüğü, veri kaybı, yanlış kişiye veri aktarımı | `auditPedigreeGraph`, `dataIntegrityRegressions.test.js` |
| Geometrik — invariant | 13 kural (çakışma, düğüm içinden geçen çizgi, ortak kardeş çizgisi …) | `src/audit/layoutInvariants.js` |
| Geometrik — okunabilirlik | Farklı ailelerin çizgilerinin kesişmesi, üst üste binmesi, birbirine "değmesi"; merkezleme, çizgi uzunluğu | `src/audit/connectorReadability.js` |
| Görsel / klinik | Gerçek tarayıcıda çizim, ekran görüntüsü, dışa aktarma | şimdilik uygulama içi tarayıcı ile manuel kanıt (`docs/screenshots/`); otomatik E2E Faz 6 |

## A. Çok kuşaklı ve geniş aileler

| ID | Senaryo | Beklenen | Nerede | recursive | legacy |
|---|---|---|---|---|---|
| CS-01 | 3 kuşak başlangıç | Ebeveynler çocuk üstünde ortalı, büyükanne-büyükbabalar kendi çocuklarının üstünde, kırık çizgi yok | fikstür | ❌ (koridor çizgisi annenin iniş çizgisiyle üst üste) | ✅ |
| CS-02 | Ders kitabı OD pedigrisi (4 kuşak, 7 kardeş, gelin/damatlar) | Kitaptaki gibi temiz | fikstür | ✅ | ❌ |
| CS-08 | 12 çocuklu kardeşlik, her biri evli + 2 çocuk | Yelpazeler ayrık, çiftler ortalı | fikstür | ✅ | ✅ |
| CS-09 | 6 kuşak + her kuşakta yan dal | Temiz | fikstür | ✅ | ✅ |
| A-5 | 8 ve 10 kuşak | Temiz, satırlar tutarlı | ⏳ | | |
| A-6 | Her iki tarafta 5+ hala/amca/dayı/teyze, farklı çocuk sayıları | Dallar ayrık, köprü çizgisi kısa | ⏳ (fuzz kısmen kapsıyor) | | |
| A-7 | Tek ebeveyni bilinen birey | İniş tek ebeveynden | kısmi (yer tutucu) | | |
| A-8 | Dalların ileri kuşakta yeniden birleşmesi | bkz. B | | | |

## B. Akraba evliliği ve pedigri çökmesi

| ID | Senaryo | Beklenen | Nerede | recursive | legacy |
|---|---|---|---|---|---|
| CS-04 | Ebeveynler birinci kuzen | Çift çizgi kısa, ortak atalar yukarıda | fikstür | ❌ | ✅ |
| CS-05 | Çift birinci kuzen | Kesişim yok ya da atlamalı | fikstür | ❌ | ❌ |
| CS-10 | Tekrarlayan akraba evliliği (2. ve 4. kuşak) | Temiz | fikstür | ❌ | ✅ |
| CS-12 | Pedigri çökmesi (iki döngü) | Temiz veya belgelenmiş kaçınılmaz kesişim (atlamalı) | fikstür | ❌ | ✅ |
| B-5 | İkinci/üçüncü kuzen evliliği | Derece etiketi çift çizginin üstünde | ⏳ | | |
| B-6 | Aynı kişiye birden çok akrabalık yolu | Tüm yollar gösterilebilir | ⏳ | | |
| B-7 | Avunküler (farklı kuşak) birliktelik | **Ürün kararı bekliyor** | 🚫 | | |

## C. Çoklu partner ve karmaşık ebeveynlik

| ID | Senaryo | Beklenen | Nerede | recursive | legacy |
|---|---|---|---|---|---|
| CS-06 | Üç partner, yarım kardeşler | Kişi ortada, partnerler iki yanda, her çiftin çocukları kendi altında | fikstür | ❌ | ❌ |
| CS-07 | Harmanlanmış aile (iki tarafın önceki çocukları) | Temiz | fikstür | ❌ | ❌ |
| CS-11 | Berdel (karşılıklı evlilik) | Kesişim en az, kalan atlamalı | fikstür | ❌ | ❌ |
| CS-13 | İki ebeveyn tarafından yarım kardeşler | Temiz | fikstür | ❌ | ❌ |
| C-5 | Evlat edinme (içeri/dışarı/akraba tarafından) | Köşeli parantez, kesikli/düz iniş | 🚫 (Faz 2b) | | |
| C-6 | Donör gamet, gestasyonel taşıyıcı | D / G gösterimi | 🚫 (Faz 2b) | | |
| C-7 | Genetik ve sosyal ebeveynlik ayrımı | Tipli ebeveyn bağı | 🚫 (Faz 2b) | | |

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

## F. Adversarial

| ID | Senaryo | Durum |
|---|---|---|
| F-1 | Uzun çapraz bağlantılar (A1: 33 kişilik gerçekçi aile — eşin ebeveynleri + kuzen evliliği) | ❌ recursive: 7 sessiz kesişim (ekran görüntüsü `docs/screenshots/audit/A1-…`) |
| F-2 | Aynı dala tekrar tekrar ekleme (251 kişilik fuzz pedigrisi) | ❌ recursive: 6 500 px uzak eşler, 21 000 px genişlik |
| F-3 | Çok sayıda partner + yeniden birleşen soy hatları | ⏳ |

## Bilinen kapsam boşlukları

- Gerçek tarayıcıda otomatik E2E ve ekran görüntüsü regresyonu yok (Faz 6; Playwright kurulumu ayrıca onaylanacak).
- Fuzz üreticisi henüz geri al/yinele, kaydet/yükle ve düzenleme silme işlemlerini üretmiyor (E-8).
- 🚫 satırları veri modeli genişletilmeden (Faz 2b) test edilemez.
