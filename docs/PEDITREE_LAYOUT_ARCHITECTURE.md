# Peditree — Yerleşim Motoru Mimari Kararı

Durum: **Uygulandı ve varsayılan yapıldı (Faz 3)** · Karar: Faz 1 · Tarih: 2026-10-18 · Ölçülmüş sonuçlar: §7

## 1. Problem (ölçülmüş)

Mevcut iki motor, 13 klinik stres fikstürü (`src/audit/clinicalFixtures.js`) üzerinde
`npm run audit:layout-benchmark` ile ölçüldü. "Temiz" = 13 yerleşim invariant'ı **ve** yeni bağlantı-sahipliği
okunabilirlik katmanı (`src/audit/connectorReadability.js`) ihlalsiz.

| Motor | Tamamen temiz fikstür | Güçlü olduğu yapı | Başarısız olduğu yapı |
|---|---|---|---|
| `recursive` (Faz 3 öncesi varsayılan) | **3/13** | Ağaçlar: ders kitabı pedigrisi (CS-02), 12 kardeş (CS-08), 6 kuşak (CS-09) | Her köprü/döngü: eşin ebeveynleri (CS-03), kuzen evliliği (CS-04/05/10/12), berdel (CS-11), çoklu partner (CS-06), yarım kardeş (CS-13); hatta 3 kuşaklık başlangıç (CS-01) |
| `legacy` | **7/13** | Akrabalık döngüleri (CS-04, CS-10, CS-12), başlangıç (CS-01) | Ders kitabı pedigrisi (CS-02), çift birinci kuzen (CS-05), berdel (CS-11), çoklu partner (CS-06), yarım kardeş (CS-13) |

Fuzz (1000 rastgele işlem dizisi, seed 1, varsayılan motor): 13-invariant katmanında **%0** hata, okunabilirlik
katmanında **%96,4** hata; vakaların %82'sinde ebeveyn çifti çocuklarının üstünde ortalanmıyor, %69,5'inde 3 slottan
uzun evlilik çizgisi var, 151 vakada başka ailenin çizgisiyle sessiz kesişim var.

**Kök neden (recursive):** her birliktelik tek bir "çapa" partnere asılı bir iniş ormanı kuruluyor ve kök aileler tek
boyutta sıralanıyor. İki partnerin de ebeveyni çizildiğinde (çok sık: eşin ailesi, kuzen evliliği, berdel) partnerler
farklı ağaçlara düşüyor ve aralarındaki mesafe yüzlerce–binlerce piksel oluyor; koridor çizgisi diğer ailelerin
çizgileriyle aynı hizaya düşüyor veya onları kesiyor. Ayrıca çapa partner doğrudan çocuk merkezine konup eş yana
kaydırıldığı için çift orta noktası sistematik olarak çocuklardan kayıyor.

**Kök neden (legacy):** kuşak başına barycenter yerleşimi döngüleri iyi topluyor ama alt ağaçlar ayrık aralıklar
olarak korunmadığı için çocuk yelpazeleri başka ebeveynlerin altına giriyor.

İki motorun güçlü yanları tamamlayıcıdır: **alt ağaçları ayrık bloklar olarak koru (recursive) + tüm grafikte
global sıralama ve merkezleme yap (legacy/barycenter)**. Bu tam olarak katmanlı (Sugiyama tipi) yerleşimin
kısıtlı bir sürümüdür.

## 2. Değerlendirilen seçenekler

Kaynak ve lisans ayrıntıları: araştırma raporu (Faz 1) — özet:

| Seçenek | Artıları | Eksileri | Karar |
|---|---|---|---|
| Recursive packer'ı yamalamak | Mevcut kod, ağaçlarda iyi | Köprü/döngü sınıfı modelin kendisinden kaynaklanıyor; yamalar bir invariantı diğeriyle takas ediyor (bkz. `recursiveIntervalPacker.js` başındaki ölçüm notları) | ❌ |
| Legacy motor | Döngülerde iyi | Ders kitabı ağaçlarında bile yelpaze çakışması; fuzz %44–47 | ❌ (yalnızca fallback) |
| **elkjs** (EPL-2.0, ~467 KB gzip) | Olgun katmanlı yerleşim, Brandes–Köpf, ortogonal yönlendirme | "Partnerler aynı satırda bitişik" kısıtı yok; kuşak sabitleme (partitioning) katman garantisi vermiyor; Promise/worker tabanlı → senkron store hattı değişmeli; NSGC çizgilerini yine kendimiz çizmeliyiz | ❌ |
| **d3-dag** (MIT, ~46 KB gzip) | ILP çapraz azaltma, QP koordinat | Yalnızca DAG (aynı satır eş kenarları yok); kısıtlar LP'yi çözümsüz yapabilir; `quadprog` bağımlılığının GPL kökenli olma riski | ❌ (ileride çapraz-azaltma araç kutusu olarak düşünülebilir) |
| dagre | MIT, küçük | Pedigriye özgü kontrol yok | ❌ |
| Graphviz (wasm) | Çok olgun | Ağır; aynı satırda sıralama aile ağaçlarında kararsız | ❌ |
| pedigreejs tarzı ağaç | Klinik kullanımda | Ağaç tabanlı → aynı yapısal sınır; GPL-3 | ❌ (yalnızca tasarım referansı) |
| **Pedigriye özgü kısıtlı katmanlı yerleşim (ev yapımı)** | NSGC kurallarının tamamı üzerinde tam kontrol (doğum sırası, partner bitişikliği, ikiz, tek ebeveynden iniş, kuşak satırları), senkron, deterministik, küçük, lisans sorunu yok | En çok mühendislik emeği; çapraz azaltma ve yönlendirme kalitesi bizim sorumluluğumuzda | ✅ **Seçildi** |

Tasarım referansları (kod kopyalanmayacak): open-pedigree (LGPL-2.1, pedigriye özgü Sugiyama + çizgi seviyesi
optimizasyonu), kinship2 (GPL, karesel programlama ile merkezleme amacı), Tores & Barillot 2001 (okunabilirlik
kuralları → test kâhini), Madeline 2.0 (geri çekilme basamakları).

## 3. Seçilen mimari: PCL (Pedigree-Constrained Layered layout)

```
graph (individuals, unions, PCR)
  │ 1. Dönüşüm      kişi düğümleri + birliktelik düğümü + kardeş merkezi; yer tutucu partner → "tek ebeveynden iniş"
  │ 2. Katmanlar    kuşak = satır (computeGenerations, BFS)
  │ 3. Sıralama     DFS başlangıç sırası (alt ağaçlar bitişik) → kısıtlı blok barycenter/median taramaları + yer değiştirme
  │                 kısıtlar: kardeşler bitişik ve DOĞUM SIRASINDA (sert); partnerler bitişik (güçlü yumuşak);
  │                 evlenen kardeş eşine bakan uca; erkek-solda yalnızca eşitlik bozucu
  │ 4. Koordinatlar karesel amaç + sert minimum aralıklar (katman başına PAVA izdüşümlü projected gradient)
  │                 amaç: çift orta noktası = çocuk merkezi; partner aralığı = eş boşluğu; sıkılık;
  │                 isteğe bağlı kararlılık terimi (önceki konumlara çekim → küçük değişiklikte küçük hareket)
  │ 5. Yönlendirme  bitişik partner: düz çizgi; bitişik olmayan: ayrı kanal şeridinde basamaklı çizgi,
  │                 başka çizgilerle aynı hizaya düşmez; kaçınılmaz kesişimde çizgi atlaması (line jump);
  │                 iniş birliktelik ortasından; çakışacak kardeş çizgileri ayrı şeritlere
  │ 6. Doğrulama    invariantlar + okunabilirlik; ihlal → sınırlı yerel arama (alternatif sıralama);
  │                 hâlâ ihlal → geri çekilme basamakları (kanal şeridi → atlama → isteğe bağlı, görünür,
  │                 NSGC dışı "kişiyi tekrar göster" seçeneği — yalnızca kullanıcı onayıyla)
  ▼
{ nodes, edges }  (renderer sözleşmesi değişmez; her bağlantı çizgisi sahibini (unionId) taşır)
```

Neden bu sırayla: (3) çapraz/bitişiklik sorunlarını, (4) merkezleme sorununu, (5) "bu çizgi kime ait" sorununu
çözer. Her aşama ayrı test edilebilir ve ayrı ölçülür.

## 4. Kabul kriterleri (Faz 3 sonunda — ölçülebilir)

| Ölçüt | Hedef |
|---|---|
| 13 yerleşim invariant'ı (fuzz, seed 1 ve 12345, 1000'er vaka) | %0 |
| Okunabilirlik: `COLLINEAR_FOREIGN_CONNECTORS`, `FOREIGN_T_JUNCTION` | %0 |
| Okunabilirlik: `FOREIGN_CONNECTOR_CROSSING` (atlamasız kesişim) | %0 (kalan kesişimler yalnızca atlamalı) |
| Klinik fikstürler | 13/13 tamamen temiz |
| Merkezleme | Çocuklu birlikteliklerin ≥%95'inde çift orta noktası çocuk merkezinden ≤ yarım slot |
| Uzun evlilik çizgisi (>3 slot) | Yalnızca topolojik olarak kaçınılmaz durumlarda; fikstür bazında belgelenir |
| Kararlılık | Tek bir kardeş/eş ekleme işleminde dokunulmayan dallardaki ortalama yatay kayma ≤ 1 slot |
| Determinizm | Aynı grafik → bit düzeyinde aynı koordinatlar |
| Performans | 100 kişi < 100 ms, 300 kişi < 500 ms yerleşim (Node, M serisi) |
| Regresyon | Mevcut tüm testler, `verify-generations`, dışa aktarma testleri |

## 5. Geçiş planı

1. ✅ PCL, `PEDITREE_PACKER=pcl` bayrağı arkasında geliştirildi.
2. ✅ Benchmark (`audit:layout-benchmark`) ve fuzz her iki katmanda karşılaştırıldı (§7).
3. ✅ **Varsayılan PCL yapıldı** (`selectedPacker()`, `src/utils/layoutPacking.js`). `PEDITREE_PACKER=recursive`
   veya `legacy` (ya da tarayıcıda `globalThis.__PEDITREE_PACKER__`) eski motorlara döner. Karar gerekçesi: PCL tüm
   doğruluk ve okunabilirlik ölçütlerinde diğer iki motordan kesin olarak iyi; karşılanamayan iki ölçüt (büyük
   pedigrilerde merkezleme, 300 kişide 500 ms iç hedefi) diğer motorlarda da karşılanmıyor veya ürün bütçesi içinde.
4. Eski motorlar, PCL en az bir sürüm boyunca doğrulanmadan silinmez.

## 6. Bilinen sınırlar (dürüstçe)

- Çapraz sayısını en aza indirme genel olarak NP-zordur; PCL sezgisel + sınırlı arama kullanır, her grafikte optimum
  garantisi vermez. Garanti edilen: sessiz/belirsiz kesişim olmaması (atlama ile işaretlenir) ve sembol çakışmaması.
- Birden çok iç içe akrabalık döngüsünde (pedigri çökmesi) tüm partnerleri aynı anda bitişik tutmak topolojik
  olarak imkânsız olabilir (Tores & Barillot "mükemmel çizilemez" sınıfı); bu durumda kanal şeridi + atlama kullanılır.
- Farklı kuşaktan partnerler NSGC'de tanımlı değil; desteklenirse gösterim geliştirici tercihi olarak belgelenir.

## 7. Faz 3 sonuçları (ölçülmüş, 2026-10-18)

Açık riskler ve koruma testleri ayrıca `PEDITREE_KNOWN_ISSUES.md`'de (KI-1 … KI-7) izlenir.

### 7.1 Uygulanan yapı (`src/layout/pcl/`)

| Dosya | Görev |
|---|---|
| `structure.js` | Grafik → kuşak satırlarında "atom"lar: kardeşlik atomu (doğum sırası; dışarıdan evlenen eşler yanında) ve kurucu atomu. **Doğum sırası bilinmiyorsa** (kullanıcı "Doğum Sırası" ile sıra vermemiş, tüm kardeşlerin yaşı da yok) başka bir aileyle evlenen — ya da torunu evlenen — kardeş kardeşliğin bir ucuna (veya iki bağlantılı kardeş birlikte bir uca) alınabilir (kinship2 "autohint" uygulaması). Bilinen yaşlarla çelişen düzen üretilmez. |
| `ordering.js` | Atom sıralaması: aile-ağacı DFS başlangıcı + veri sırası + ayna başlangıçları; barycenter taramaları (taramada kardeşlik düzeni de seçilir), komşu yer değiştirme, sifting (Matuszewski ve ark. 1999). Maliyet: iniş çizgisi kesişimi, hizalama, şerit (bitişik olmayan partner), şerit altındaki kişiler, evlilik çizgisi uzunluğu ve **"erkek solda" eşitlik bozucu** (yönelimin düzenlemeler arasında aynalanmasını engeller). |
| `qp.js` | Ayrık karesel program: FISTA + uyarlamalı yeniden başlatma (O'Donoghue & Candès 2015), satır başına tam PAVA izdüşümü (sert minimum aralık → sembol çakışması imkânsız). |
| `index.js` | Amaç terimleri (çift ortası = çocuk merkezi, eş aralığı, sıkılık, isteğe bağlı kararlılık) + **ayak izi kuralı**: ebeveyn satırında, çiftin kendisi dışında kimse bir kardeşlik çizgisinin üstünde duramaz (invariant'tan sıkı: sınır en dıştaki çocukların merkezi). Çarpanlar yöntemiyle, cilalama sonrası yeniden kontrol, en çok 80 tur. **Satır aralığı uyarlamalı**: bir satırın üstünde gereken şerit/kardeş-çizgisi seviyesi sığmıyorsa o aralık büyütülür. |
| `routing.js` | NSGC bağlantıları, her parça sahibini (`unionId`) taşır: bitişik partner düz çizgi; bitişik olmayan partner ayrı şerit seviyesinde; iniş çizgisi başka ailenin dikeyiyle hizalanmaz; tek çocuk birkaç px kaymışsa iniş düz çizilir; kaçınılmaz kesişimde çizgi atlaması (`bridges`). Üst üste binen çizgi seviyeleri arası 20 px (kardeş çizgisi) / 12 px (şerit). |

### 7.2 Kabul kriterleri — sonuç

| Ölçüt | Hedef | Sonuç | |
|---|---|---|---|
| 13 invariant, fuzz seed 1 / 12345 (1000'er) | %0 | **%0 / %0** | ✅ |
| `COLLINEAR_FOREIGN_CONNECTORS`, `FOREIGN_T_JUNCTION` | %0 | **%0 / %0** | ✅ |
| Atlamasız kesişim | %0 | **0 kesişim** (tüm kesişimler atlamalı) | ✅ |
| Klinik fikstürler | 13/13 | **13/13** (recursive 3/13, legacy 7/13) | ✅ |
| Merkezleme (çocuklu çiftlerin ≥%95'i yarım slot içinde) | ≥%95 | fuzz: **%96,4 / %97,1** · gerçekçi büyük pedigri: 105 kişi %68, 208 kişi %18, 312 kişi %26 | ⚠️ fuzz ✅, büyük pedigri ❌ |
| Uzun evlilik çizgisi yalnızca kaçınılmazsa | belgelenir | Fikstürlerde yalnızca CS-05 (çift birinci kuzen), CS-06 (üç partner), CS-11 (berdel), CS-13 (iki taraftan yarım kardeş) — her birinde iki evlilikten biri topolojik olarak bitişik olamaz | ✅ |
| Kararlılık (tek düzenlemede ortalama yatay kayma ≤ 1 slot) | ≤ 90 px | ortalama **37,8 px** (recursive 41,9); düzenlemelerin %90,5'inde ortalama ≤ 1 slot, %72,1'inde hiç kimse 1 slottan fazla kaymıyor; p90 en büyük kayma 250 px | ✅ (ortalama) |
| Determinizm | aynı girdi → aynı çıktı | test ile doğrulandı | ✅ |
| Performans (Node, vitest süreci) | 100 kişi < 100 ms; 300 kişi < 500 ms | 105 kişi **~28–32 ms**; 312 kişi **~455–535 ms** (ürün bütçesi 300 kişi < 2 s) | ⚠️ 300 kişide iç hedefin sınırında, ürün bütçesi ✅ |
| Regresyon | tüm testler | **544/544**, `verify-generations` 6/6, lint, build | ✅ |

Ölçüm kaynakları: `reports/layout-benchmark.md` (fikstürler + gerçekçi büyük pedigriler, `src/audit/largePedigrees.js`),
`reports/layout-fuzz-baseline.md` (varsayılan motor = PCL, seed 12345), `src/__tests__/pclLayout.test.js`.
Görsel karşılaştırma: `docs/screenshots/faz3/` (recursive ↔ PCL; başlangıç, amcalar arasındaki baba, 33 kişilik
karmaşık pedigri, düzenleme öncesi/sonrası yönelim).

### 7.3 Kalan riskler (dürüstçe)

1. **Büyük gerçekçi pedigrilerde merkezleme zayıf** (200–300 kişide çiftlerin çoğu yarım slottan fazla kayık; en kötü
   kayma ~2,5–2,8 bin px) ve 59–80 çizgi atlaması var. Kök neden: çok satırlı koordineli hamleler gerektiren yerel
   minimumlar (ör. bir kardeşlik ters çevrildiğinde altındaki tüm alt ağacın birlikte kayması gerekir) ve kayınpeder
   ailelerinin kardeşliğin içine konamaması. Sert ihlal ve okunabilirlik ihlali yok; sorun "çizim uzun ve dolambaçlı".
   Olası sonraki adımlar: alt ağaç blok hamleleri, küçük bileşenlerde tam (ILP) çapraz azaltma, büyük pedigri için
   daraltma/odak görünümü (Faz 5).
2. **Yönelim çevrilmesi**: düzenlemelerin %7,1'inde ebeveynlerin sol/sağ sırası değişiyordu (taze yerleşim).
   Aşama 1 (KI-2) sonrası store çiziminde gerekçesiz çevrilme 0 (1582 düzenlemede 14 çevrilme; tümü büyükanne-baba
   birliktelik düzenlemesi veya okunabilirlik için taze yerleşime geçiş). Taze yerleşimin ("Yeniden Düzenle")
   kendisi yönelimi hâlâ korumaz.
3. ~~Rastgele işlemle üretilmiş aşırı yoğun grafiklerde ayak izi ihlali~~ — **düzeltildi** (KI-3): sürekli ihlal
   edilen çiftin çarpan adımı büyütüldü, üst sınır 400 tur; 263 / 387 / 474 kişi → 0 ihlal (474 kişide ~2,5 s).
4. ~~Kararlılık terimi uygulamaya bağlı değil~~ — **Aşama 1 (KI-2)**: store önceki çizimi veriyor; düzenleme-yerel
   yeniden yerleşim `src/layout/pcl/incremental.js` (düzeyler yerel → geniş → taze; okunabilirlik koruması),
   `computePclLayout(graph, { stability })` (kararlı sıralama, iğneler + IRLS, çapalama, şekil terimleri, satır
   yüksekliği çapası). Ölçüm: `reports/layout-stability-{before,after}.md`; açık kalanlar `PEDITREE_KNOWN_ISSUES.md`.
5. Renderer: pedigri numarası (ör. III-5) tam iniş çizgisinin sembole girdiği yerde; çizgi etiketin içinden geçiyor
   (Faz 4 sembol/etiket işi).
