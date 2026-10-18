# KI-8 — partnerin yerleşim tarafı: rapor

Tarih: 2026-10-19 · Dal: `stabilization/clinical-layout` · Taban: `7a9e5bf` (KI-2, bağımsız denetimle doğrulanmış) ·
Commit'ler: `64593d2` (ölçüm), `e672b23` (PCL + koruma güncellemeleri), `781607b` (testler) · Node v24.18.0.
Ölçümler: `reports/layout-stability-ki8-before.md` (aynı araç, taban yerleşim kodu) ve
`reports/layout-stability-ki8-after.md`. Yeniden üretim:

```bash
for f in src/layout/pcl/structure.js src/layout/pcl/ordering.js; do git show 7a9e5bf:$f > $f; done
npm run audit:layout-stability -- --label ki8-before
git checkout -- src/layout/pcl/structure.js src/layout/pcl/ordering.js
npm run audit:layout-stability -- --label ki8-after
```

(Son komutlar yalnız commit edilmiş bir ağaçta güvenlidir.)

## 1. Kök neden

**Kusur:** bir partnerlik çizgisi, iki partnerden birinin başka bir partnerinin üstünden geçiyor; çizgi o kişide
bitiyormuş gibi okunur (ör. annenin ikinci eşi anne ile baba arasında; ebeveynlerin çizgisi onun üstünden geçer).
Yeni ölçüt: `readabilityMetrics.lineOverOwnPartner`.

**Taraf nerede kararlaştırılıyor?** Sıralamadan önce, atom kurulurken (`structure.js`, taban satır 124–143):
"dışarıdan evlenen" eş kişinin yanına konur; ilk eş erkek-solda kuralına göre (kadının solu / erkeğin sağı),
sonraki eşler sırayla iki yana. Sıralama adımı yalnız kardeş sırası seçeneklerini (`arrangements`, doğum sırası
bilinmeyen kardeşlikler) değerlendirebiliyordu; eşin tarafı hiçbir zaman seçenek değildi. Sıralamadaki yumuşak
erkek-solda maliyeti (`ordering.js` `W_SIDE`) yalnız iki ayrı atomdaki partnerlere etki edebiliyordu.

**Kısıtlayan kurallar:** doğum sırası (açık "Doğum Sırası" veya bilinen yaşlar) kesin; atomun içi bitişik;
erkek-solda yumuşak gelenek. KI-8 senaryosunda açık doğum sırası baba tarafını sola koyuyor, annenin ikinci eşi
erkek-solda kuralıyla annenin soluna — babayla annenin arasına — düşüyordu (yeniden üretim:
`knownIssues.test.js` KI-8 ve `ki8PartnerSide.test.js` "the original case"; partnerlik çizgisi 254 px, ikinci eşin
üstünden).

**Aynı sınıftan iki yapısal kusur daha bulundu:**
1. Dışarıdan evlenen bir eşin kendi ikinci partneri (ör. dayının eşinin yeni eşi) atomun kişi listesine hiç
   girmiyordu; güvenlik ağı onu satırın sonuna ekliyordu (`index.js` "Safety net"). 263 kişilik fixture'da
   17 770 px'lik bir partnerlik çizgisi bundandı.
2. Kurucu (ebeveynsiz) gruplarda merkezin ötesindeki zincir (A–B–C–D…) veri sırasıyla ekleniyordu; çizgiler
   aradaki partnerlerin üstünden geçiyordu.

**Yeni eş eklenince kardeşlik neden genişliyor?** Eş kardeşlik atomunun içine, kişinin yanına konur: atom bir slot
büyür. Kişi kardeşliğin ortasındaysa eş iki kardeş arasına girer, çocuk aralığı genişler, ebeveynler bu aralığın
üstünde ortalandığı için iki yandaki aileler itilir (KI-2'deki 74 → 80). Eş yalnız kardeşliğin **ucundaki** biri
için dışarıya konabilir; bu da yalnız çocuk aralığını değil, ebeveyn merkezini etkilemediği için sıralama maliyeti
bunu göremez (bkz. §6). **KI-8 bu genişlemeyi azaltmadı** (hedeflenmiş düzenlemeler 80 → 80).

**Taraf değişince ne etkilenir?** Çiftin çocukları çiftin orta noktasının altına gider (kardeşlik atomu yarım slot
kayar); çizgi sahipliği (`unionId`) değişmez; kişinin başka aileden partneri bitişik hâle gelir (şerit kalkar);
akraba evliliği çift çizgisi kısalır; sıralama maliyetindeki kesişimler buna göre yeniden hesaplanır. Tüm
değişmez ve bağlantı okunabilirliği denetimleri her durumda 0.

**KI-2 ile etkileşim:** kararlı sıralama (`orderLayersStable`) başlangıçta önceki çizime en yakın seçeneği alır
(ters çevrilen kişi çiftleri). Serbest atomlar her seçeneği alabilir; dokunulmamış atomlar artık **yalnız eş
tarafını** (aynı kardeş sırasıyla) değiştirebilir ve bunun için ters çevirme cezası öder — ceza artık atomun
içindeki kişileri de sayıyor. Bir şerit ya da kesişim kalkıyorsa değişir, salt tercih için değişmez.

## 2. Uygulanan algoritmik çözüm

`src/layout/pcl/structure.js`:
- Başka bir çizili aileden partneri olan ve dışarıdan evlenen eşi bulunan kişiler için ayna blok (eşler diğer
  tarafta) **alternatif yerleşim** olarak sıralama adımına verilir: her kardeş sırası için bu kişilerin her ayna
  kombinasyonu (en çok 4 kişi, atom başına en çok 64 seçenek). Seçim sıralama maliyetiyle yapılır (kesişim
  `W_CROSS`, şerit `W_LANE`, şerit altındaki kişiler, birlik uzunluğu, erkek-solda `W_SIDE`). Varsayılan ve
  eşitlik bozucu hâlâ erkek-solda; doğum sırasına dokunulmaz; `arrangementCore` her seçeneğin hangi kardeş sırasına
  ait olduğunu kaydeder.
- Eşin eşi, eşin dış tarafına konur (özyinelemeli blok).
- Kurucu grupları merkezden genişlik öncelikli kurulur; her üye bağlı olduğu partnerin yanına.

`src/layout/pcl/ordering.js` (yalnız KI-2 kararlı modu): dokunulmamış atomlar için yalnız taraf değişimi; atom içi
ters çevirme cezası.

Denenip bırakılanlar (veriyle): kardeşlik ucundaki ve kurucu çiftlerdeki herkes için de taraf seçeneği — sıralama
maliyeti fayda göremediği hâlde arama yolunu değiştirdi, 387'de uzun eş çizgisi 5 → 8 (üç partnerli bir kurucunun
aynası çocukları birbirinden uzaklaştırıp 1 600–1 900 px çizgiler üretti); hizalama maliyetini çocuk aralığına göre
hesaplamak — ölçülebilir etkisi yok.

## 3. Yeni veya değişen testler

- `src/__tests__/ki8PartnerSide.test.js` (yeni, 25 test): orijinal KI-8 (store ve "Yeniden Düzenle"), dul kalıp
  yeniden evlenen anne, iki eşli kardeş ve yarım kardeşler, dışarıdan evlenen eşin ikinci partneri, kurucu zinciri
  A–B–C–D–E, eş + çocuk alan geniş kardeşlik (doğum sırası korunur), farklı sırayla aynı aileye ulaşan düzenlemeler,
  13 klinik fixture (CS-06'daki üç partnerden biri kaçınılmaz), 263/387/474 stres pedigrileri. Taban yerleşim
  koduyla 25 testin **9'u başarısız** (testler kusuru yakalıyor); geri kalanlar regresyon korumasıdır.
- `knownIssues.test.js`: KI-8 `it.fails` hedefi gerçekten geçtiği için normal teste çevrildi ("fixed").
- `ki3Regression.test.js` ve `ki2Stability.test.js` tavanları yeniden ölçüldü — §4'te. **Yükseltilen tavanlar**
  (kayıtlı ödünleşim, yerinde açıklamalı): 263 `maxCentreOffset` 3399 → 4455, 474 `maxCentreOffset` 17881 → 17966,
  KI-2 rastgele "tazeden fazla kayık çiftli düzenleme" 6 → 9, yana sarkma 2318 → 2331 ve 351 → 353. Diğer bütün
  tavanlar düşürüldü. Bu yükseltmeleri kabul edip etmemek kullanıcının/denetimin kararıdır.
- Tüm paket: 667 geçti + 3 beklenen başarısız (KI-1, KI-2 sıkı hedef, KI-4). Lint, build, `verify-generations` 6/6,
  fuzz tohum 1 ve 12345 değişmez/okunabilirlik %0 / %0, benchmark PCL 13/13 temiz.

## 4. Önce / sonra (aynı araç, aynı veri)

### 4.1 Rastgele düzenlemeler (store çizimi)

| ölçüt | random-200x12 önce | sonra | ki2-40x10 önce | sonra |
|---|---|---|---|---|
| ebeveyn çevrilmesi (büyükanne-baba birliği / okunabilirlik / **gerekçesiz**) | 14 (4/10/**0**) | 9 (4/5/**0**) | 2 (2/0/**0**) | 1 (1/0/**0**) |
| kayan kişi oranı | %36,8 | %36,5 | %36,9 | %36,3 |
| aralığı değişen sıra komşuları | %19,2 | %19,2 | %19,6 | %19,2 |
| ortalama kayma ham / hizalı | 23,7 / 29,0 px | 21,2 / 26,7 px | 23,7 / 28,7 px | 16,5 / 21,8 px |
| en büyük kayma p90 / maks. | 147 / 1676 px | 133 / 1676 px | 111 / 1845 px | 107 / 334 px |
| yeniden yerleşim: yerel / değişmedi / geniş / taze | 1481/60/16/25 | 1481/60/25/16 | 246/11/3/2 | 247/11/3/1 |

### 4.2 Okunabilirlik (çizilen / aynı grafiğin taze yerleşimi; tüm düzenlemelerin toplamı)

| ölçüt | random önce | sonra | ki2 önce | sonra |
|---|---|---|---|---|
| partnerin üstünden geçen partnerlik çizgisi (KI-8) | 68 / 42 | **8 / 8** | 9 / 2 | **0 / 0** |
| çizgi kesişimi | 75 / 120 | **22 / 26** | 2 / 8 | 0 / 0 |
| uzun eş çizgisi (> 3 slot) | 38 / 46 | **7 / 8** | 2 / 2 | 0 / 0 |
| merkezden kayık çift | 92 / 144 | 88 / 117 | 5 / 18 | 4 / 6 |
| yana sarkan kardeşlik çizgisi | 2318 / 1801 | **2331** / 1789 | 351 / 270 | **353** / 269 |
| tazeden kötü düzenleme (kayık / kesişim / uzun eş) | 6 / 6 / 4 | **9** / 3 / 2 | 0 / 0 / 0 | 0 / 0 / 0 |

Yana sarkmanın dağılımı (yalnız teşhis için, iki popülasyon birlikte; ölçüt değiştirilmedi): ≤ 5 px 885 → 883,
5–45 px 1711 → 1730, > 45 px 73 → 71. Artış orta büyüklükteki (yarım slottan küçük) kaymalarda.
Fuzz uç durumları (store çizimi, 1000 vaka): uzun eş çizgisi tohum 1'de 78 → 32, 12345'te 67 → 30; kayık çift
127 → 137 (tohum 1, kötüleşme) ve 126 → 111 (12345); yana sarkma 804 → 800, 796 → 794.

### 4.3 Hedeflenmiş klinik düzenlemeler

Blok dışında kayan kişi: önce 80, sonra **80** (her düzenlemede aynı: 0, 0, 13, 0, 12, 13, 11, 11, 9, 11).
Dokunulmamış aile yeniden şekillendi 14 → 14. Ebeveyn çevrilmesi 0, kardeş sırası değişimi 0, geri al / yinele
birebir, kaydet → aç 0 px (önce ve sonra). **KI-8, KI-2'deki 74 → 80 regresyonunu azaltmadı.**

### 4.4 Sabit stres grafikleri

Taze yerleşim (`ki3Regression`): 263 → kesişim 123 → 43, uzun eş 7 → 3, en uzun eş çizgisi 17 770 → 1 841 px,
genişlik 25 697 → 18 132 px, kayık çift 23 → 19, maks. merkez kayması 3 399 → **4 455**; 387 → kesişim 133 → 123,
kayık çift 32 → 31, uzun eş 5 → 4, maks. kayma 13 048 → 12 890; 474 → kesişim 387 → 326, en uzun eş çizgisi
27 531 → 5 988 px, kayık çift 35 → 30, yana sarkma 51 → 47, maks. kayma 17 881 → **17 966**. Süre 474'te
2,9 → 1,7 s (taze).

Düzenleme-yerel (rapor tablosu "Large families"; parantez içi = düzenlenmiş grafiğin taze yerleşimi):

| fixture / düzenleme | düzey önce → sonra | kayık çift | kesişim | partnerin üstünden çizgi | süre |
|---|---|---|---|---|---|
| 263 çocuk | taze → yerel | 23 (23) → 19 (19) | 123 → 43 (43) | 1 → 0 | 358 → 61 ms |
| 263 kardeş | geniş → yerel | 21 (23) → 18 (21) | 118 → 43 (72) | 1 → 0 | 89 → 287 ms |
| 263 anneye eş | yerel → taze | 23 (22) → 19 (19) | 122 → 43 (43) | 1 → 0 | 60 → 284 ms |
| 387 çocuk | taze → taze | 31 → 32 (32) | 136 → 127 | 3 → 1 | 1,7 → 1,9 s |
| 387 kardeş | taze → taze | 32 → 32 | 134 → 124 | 3 → 1 | 2,1 → 1,6 s |
| 387 anneye eş | taze → yerel | 32 (32) → 34 (31) | 133 → 119 (123) | 3 → 1 | 2,1 → 2,3 s |
| 474 çocuk | yerel → yerel | 52 (34) → 45 (31) | 276 → 211 (367) | 1 → 0 | 2,7 → 2,9 s |
| 474 kardeş | taze → yerel | 34 (34) → 36 (32) | 388 → 267 (327) | 1 → 0 | 1,8 → 1,8 s |
| 474 anneye eş | yerel → yerel | 43 (34) → 37 (35) | 330 → 267 (326) | 2 → 0 | 2,3 → 2,0 s |

Tümünde değişmez / bağlantı okunabilirliği ihlali 0; yeniden açılış birebir (13 / 21 / 29 ms).

## 5. KI-2 üzerindeki etkiler

**Olumlu:** gerekçesiz çevrilme 0'da kaldı; toplam çevrilme 14 → 9 (KI-2 kümesi 2 → 1); taze yerleşime geçiş
25 → 16; ortalama kayma 23,7 → 21,2 px (KI-2 kümesi 23,7 → 16,5; en büyük kayma 1 845 → 334 px); kesişim 75 → 22,
uzun eş çizgisi 38 → 7, partnerin üstünden çizgi 68 → 8; büyük ailelerde 263 ve 474'te düzenlemeler daha sık
yerel kalıyor.
**Olumsuz:** yana sarkma +13 (KI-2 kümesi +2); "tazeden fazla kayık çiftli düzenleme" 6 → 9 (taze yerleşim de
iyileştiği için karşılaştırma sıkılaştı; mutlak kayık çift 92 → 88); 387'de anneye eş artık yerel ama tazeden 3
fazla kayık çiftle; 474 kayık çift hâlâ tazeden kötü (45/31, 36/32, 37/35).
**Değişmeyen:** hedeflenmiş düzenlemelerde blok dışı hareket 80; sıkı KI-2 hedefi hâlâ `it.fails`.

## 6. Kalan sorunlar

1. Ortada genişleyen kardeşlik komşu aileleri itiyor (KI-2, 80). Eşi kardeşlik ucunda dışarı koymak genişlemeyi
   tek yana alabilir ama sıralama maliyeti bunu ölçemiyor: maliyet birlik uzunluğunu ve hizalamayı slot olarak
   sayar, koordinat adımındaki ebeveyn merkezleme etkisini bilmez.
2. Kaçınılmaz kalan "partnerin üstünden çizgi" (random 8): üç veya daha fazla partnerli kişi; iki kız kardeşle
   evlenen erkek (kardeşler bitişik olduğu için birinin çizgisi diğerinin üstünden geçer). Bunlar şeritle (çizgiyi
   yukarıdan geçirme) veya klinik notasyon kararıyla çözülür — klinisyen kararı gerekir.
3. Yükseltilen iki maks. merkez kayması (263, 474): KI-1 sınıfı — bir çiftin çocuk kardeşliği çiftin altına
   yerleştirilmiyor (263'te `U_DE_47`: eskiden satır sonunda duran ve 17 770 px çizgi çeken ikinci eş artık eşinin
   yanında, tek çocuğu 4 445 px uzakta).
4. Yana sarkma (5–45 px bandı) tazeye göre fazla.
5. Süre: 474 kişide düzenleme 2,9 s'ye kadar (KI-10).

## 7. KI-1'e geçmeden önce yapılması gerekenler

1. **Kullanıcı / denetim kararı:** yükseltilen dört tavanın (263 ve 474 maks. merkez kayması, KI-2 kayık çift
   düzenleme sayısı, yana sarkma) kabulü.
2. **Koordinata duyarlı sıralama maliyeti:** sıralama, bir çiftin çocuk kardeşliğinin genişliğini ve ebeveyn
   merkezlemesinin sonucunu göremiyor (üç partnerli kurucu aynasında 1 600 px çizgiler; KI-1'in uzak çocuk
   kardeşlikleri). KI-1 için önce bu (veya alt ağaç blok hamleleri) gerekir; ağırlık ayarı tek başına yetmez.
3. Sıralamanın hizalama terimi atom merkezini (eşler dahil) kullanıyor, koordinat adımı yalnız çocuk aralığını —
   tutarsızlık; KI-8'de ölçülebilir etkisi yoktu, KI-1'de yeniden değerlendirilmeli.
4. KI-1 ölçüm seti: 474'te düzenleme-yerel kayık çift > taze (45/31) ve maks. kayma çiftleri
   (`U_PAT_UNCLE_3`, `U_DE_0`, `U_DE_47`) hedef vaka olarak dondurulmalı.
5. Kardeşlik genişlemesi (KI-2) için tek yana genişleme / uçtaki eşi dışa alma deneyi, koordinata duyarlı maliyet
   olmadan anlamlı ölçülemez.
6. Kalan "partnerin üstünden çizgi" vakaları için klinik notasyon kararı (üç+ partner, iki kardeşle evlilik).
