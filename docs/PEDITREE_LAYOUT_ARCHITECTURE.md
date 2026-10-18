# Peditree — Yerleşim Motoru Mimari Kararı

Durum: **Karar verildi (Faz 1)** · Uygulama: Faz 3 · Tarih: 2026-10-18

## 1. Problem (ölçülmüş)

Mevcut iki motor, 13 klinik stres fikstürü (`src/audit/clinicalFixtures.js`) üzerinde
`npm run audit:layout-benchmark` ile ölçüldü. "Temiz" = 13 yerleşim invariant'ı **ve** yeni bağlantı-sahipliği
okunabilirlik katmanı (`src/audit/connectorReadability.js`) ihlalsiz.

| Motor | Tamamen temiz fikstür | Güçlü olduğu yapı | Başarısız olduğu yapı |
|---|---|---|---|
| `recursive` (varsayılan) | **3/13** | Ağaçlar: ders kitabı pedigrisi (CS-02), 12 kardeş (CS-08), 6 kuşak (CS-09) | Her köprü/döngü: eşin ebeveynleri (CS-03), kuzen evliliği (CS-04/05/10/12), berdel (CS-11), çoklu partner (CS-06), yarım kardeş (CS-13); hatta 3 kuşaklık başlangıç (CS-01) |
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

1. PCL, `PEDITREE_PACKER=pcl` bayrağı arkasında geliştirilir; mevcut varsayılan değişmez.
2. Benchmark (`audit:layout-benchmark`) ve fuzz her iki katmanda karşılaştırılır.
3. Kabul kriterleri sağlanınca varsayılan PCL yapılır; `recursive` ve `legacy` geri dönüş olarak kalır.
4. Eski motorlar, PCL en az bir sürüm boyunca doğrulanmadan silinmez.

## 6. Bilinen sınırlar (dürüstçe)

- Çapraz sayısını en aza indirme genel olarak NP-zordur; PCL sezgisel + sınırlı arama kullanır, her grafikte optimum
  garantisi vermez. Garanti edilen: sessiz/belirsiz kesişim olmaması (atlama ile işaretlenir) ve sembol çakışmaması.
- Birden çok iç içe akrabalık döngüsünde (pedigri çökmesi) tüm partnerleri aynı anda bitişik tutmak topolojik
  olarak imkânsız olabilir (Tores & Barillot "mükemmel çizilemez" sınıfı); bu durumda kanal şeridi + atlama kullanılır.
- Farklı kuşaktan partnerler NSGC'de tanımlı değil; desteklenirse gösterim geliştirici tercihi olarak belgelenir.
