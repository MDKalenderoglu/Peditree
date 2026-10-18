# KI-2 düzenleme kararlılığı — test raporu (Aşama 1)

Tarih: 2026-10-18 · Dal: `stabilization/clinical-layout` · Taban (önce): commit `842958a` · Node v24.18.0 · macOS.
Bu rapor bağımsız denetim için yazıldı: yöntem, veri ve yeniden üretim komutları açıktır; olumsuz sonuçlar da
raporlanmıştır.

## 1. Yöntem

**Ölçülen şey:** klinisyenin gördüğü çizim — store'un `pedigreeData.nodes` koordinatları, her düzenlemeden önce ve
sonra. Koşum aracı `src/audit/stabilityHarness.js`; "önce" ve "sonra" **aynı araçla, aynı veriyle** ölçüldü.

**Popülasyonlar (deterministik):**

| ad | içerik |
|---|---|
| random-200x12 | 200 dizi × 12 rastgele editör işlemi (tohum `stab0…stab199`); 1582 uygulanan düzenleme |
| ki2-40x10 | 40 dizi × 10 işlem (tohum `ki2-0…ki2-39`); 262 uygulanan düzenleme — KI-2 kaydındaki 40 senaryo kümesi |
| targeted | 3 klinik senaryo × 4 düzenleme (eş+çocuk, çocuk, kardeş, kız kardeşe eş); 10 uygulanabilir |
| KI-3 fixture'ları | donmuş 263 / 387 / 474 kişilik pedigriler, her birine 2–3 düzenleme (PCL düzeyinde) |

Reddedilen/etkisiz işlemler ölçülmez. Rastgele modelin seçimleri store'a bağlıdır; iki koşumda da düzenleme sayıları
aynı çıktı (1582 / 262), yani popülasyonlar karşılaştırılabilir.

**Tanımlar:**
- *kayan kişi*: |Δx| veya |Δy| > 2 px.
- *ebeveyn çevrilmesi*: `mother`/`father` sol-sağ sırası değişti. Sınıflar: (a) *büyükanne-baba birliktelik
  düzenlemesi* — düzenleme, ebeveynlerden birinin ebeveyninin yer aldığı bir birlikteliği oluşturdu/kaldırdı/değiştirdi
  veya bir ebeveynin ebeveyn birliğini değiştirdi (amca/hala eklemek sayılmaz); (b) *okunabilirlik için* — store,
  bütün düzenleme-yerel yerleşimler taze yerleşimden daha fazla okunabilirlik sorunu taşıdığı için taze yerleşimi
  kullandı (`layoutInfo.level = 'full'`); (c) *gerekçesiz* — geri kalan her şey.
- *aralığı değişen sıra komşuları*: aynı satırda yan yana iki kişinin arası > 2 px değişti (yerel yeniden düzen;
  bütün olarak kayan bir blok yalnız kenarlarındaki aralıkları değiştirir).
- *okunabilirlik bedeli*: her düzenlemeden sonra çizilen yerleşim ile aynı grafiğin taze PCL yerleşimi karşılaştırılır
  (`readabilityMetrics`): merkezden kayık çift (> yarım slot), çizgi kesişimi (atlamalı), uzun eş çizgisi (> 3 slot),
  yana sarkan kardeşlik çizgisi (çiftin orta noktası çocuklarının aralığının dışında).
- *etkilenen blok* (targeted): düzenlenen kişi, yeni kişiler, düzenlenen kişinin kardeşliği, eşleri ve her yeni çocuğun
  ebeveynleri. *Dokunulmamış aile yeniden şekillendi*: tümü blok dışındaki bir çift veya 2+ kardeşlikte üyeler arası
  aralık > 2 px değişti.

**Önceki metriklerle fark (7,1 % ve 31/40):** %7,1, eski (v1) store'da `stab` tohumlarıyla 200×12 dizide 148/2072
çevrilme oranıydı. 31, v2 store'da `ki2-` tohumlarıyla 40×10 dizide her adımda **taze** `computePclLayout` ile mutlak
sayımdı (store çizimi değil). Bu rapordaki sayılar store çiziminde, iki ebeveynin de çizili olduğu geçişlere
(1495 / 244) oranlanır: önce %11,4 / %13,1. Taze yerleşim cırcırı (31) `knownIssues.test.js`'de aynen duruyor ve
"Yeniden Düzenle" ile tam geri dönüşün çizdiğini ölçer.

## 2. Yeniden üretim

```bash
npm run audit:layout-stability -- --label after
```

"Önce" ölçümü: aynı koşum aracı, taban commit'in yerleşim motoru ve store'u ile.

```bash
for f in src/layout/pcl/index.js src/layout/pcl/ordering.js src/state/usePedigreeStore.js; do git show 842958a:$f > $f; done
npm run audit:layout-stability -- --label before
git checkout -- src/layout/pcl/index.js src/layout/pcl/ordering.js src/state/usePedigreeStore.js
```

(Son satır yalnızca commit edilmiş bir ağaçta güvenlidir; commit edilmemiş değişiklikleriniz varsa önce yedekleyin.)
Testler: `npx vitest run src/__tests__/ki2Stability.test.js` (cırcır tavanları bu rapordaki değerlerdir).

## 3. Sonuçlar

### 3.1 Rastgele düzenleme popülasyonları

| ölçüt | random-200x12 önce | sonra | ki2-40x10 önce | sonra |
|---|---|---|---|---|
| ebeveyn çevrilmesi / iki ebeveynli geçiş | 171 / 1495 (%11,4) | 14 / 1495 (%0,9) | 32 / 244 (%13,1) | 2 / 244 (%0,8) |
| — büyükanne-baba birliktelik düzenlemesi / okunabilirlik için / **gerekçesiz** | 6 / 0 / **165** | 4 / 10 / **0** | 2 / 0 / **30** | 2 / 0 / **0** |
| kayan kişi oranı (dikey) | %60,5 (%8,2) | %36,8 (%1,4) | %63,5 (%10,0) | %36,9 (%0,3) |
| aralığı değişen sıra komşuları | %20,7 | %19,2 | %20,6 | %19,6 |
| hiç kimsenin kaymadığı düzenlemeler | %11,4 | %14,2 | %11,5 | %16,8 |
| ortalama kayma ham / probanda hizalı | 77,9 / 60,6 px | 23,7 / 29,0 px | 83,1 / 62,3 px | 23,7 / 28,7 px |
| p90 en büyük kayma | 314 px | 147 px | 300 px | 111 px |
| yeniden yerleşim düzeyi | taze 1582 | yerel 1481, değişmedi 60, geniş 16, taze 25 | taze 262 | yerel 246, değişmedi 11, geniş 3, taze 2 |

### 3.2 Okunabilirlik bedeli (çizilen / aynı grafiğin taze yerleşimi; tüm düzenlemelerin toplamı)

| ölçüt | random-200x12 önce | sonra | ki2-40x10 önce | sonra |
|---|---|---|---|---|
| merkezden kayık çift | 144 / 144 | 92 / 144 | 18 / 18 | 5 / 18 |
| çizgi kesişimi | 120 / 120 | 75 / 120 | 8 / 8 | 2 / 8 |
| uzun eş çizgisi | 46 / 46 | 38 / 46 | 2 / 2 | 2 / 2 |
| yana sarkan kardeşlik çizgisi | 1801 / 1801 | **2318 / 1801** | 270 / 270 | **351 / 270** |
| tazeden kötü düzenleme (kayık / kesişim / uzun eş) | 0 / 0 / 0 | 6 / 6 / 4 | 0 / 0 / 0 | 0 / 0 / 0 |

Fuzz (1000'er vaka, uç durum ölçüleri store çiziminden): tohum 1 → kayık çift 127/6682, yana sarkan 804 vaka, uzun eş
78 vaka; tohum 12345 → 126/6699, 796, 67. Taban rapordaki (`reports/layout-fuzz-baseline.md`, taze yerleşim):
186/6699, 625, 70. Değişmez ve okunabilirlik ihlali her iki tohumda %0.

### 3.3 Hedeflenmiş klinik düzenlemeler (blok dışında kayan / blok dışı; dokunulmamış aile yeniden şekillendi)

| senaryo | düzenleme | önce | sonra |
|---|---|---|---|
| başlangıç | probanda çocuk | 0/6; 0/3 | 0/6; 0/3 |
| başlangıç | probanda kardeş | 0/4; 0/2 | 0/4; 0/2 |
| kardeşlik + akrabalar | ilk erkek kardeşe eş + çocuk | 10/15; 2/9 | **13/15**; 2/9 |
| kardeşlik + akrabalar | probanda çocuk | 0/14; 0/9 | 0/14; 0/9 |
| kardeşlik + akrabalar | probanda kardeş | 8/12; 0/6 | **12/12**; 0/6 |
| kardeşlik + akrabalar | ilk kız kardeşe eş | 10/15; 2/9 | **13/15**; 2/9 |
| akraba evliliği | ilk erkek kardeşe eş + çocuk | 12/15; 3/10 | 11/15; 3/10 |
| akraba evliliği | probanda çocuk | 12/15; 3/10 | 11/15; 3/10 |
| akraba evliliği | probanda kardeş | 10/13; 1/7 | 9/13; 1/7 |
| akraba evliliği | ilk kız kardeşe eş | 12/15; 3/10 | 11/15; 3/10 |
| **toplam** | | **74; 14** | **80; 14** |

Tüm hedeflenmiş düzenlemelerde: ebeveyn çevrilmesi yok, kardeş sırası değişimi 0, geri al ve yinele birebir, kaydet →
aç 0 px (önce ve sonra).

**Yorum:** blok dışında kayan kişi sayısı bu 10 düzenlemede **iyileşmedi** (74 → 80). Ortada genişleyen bir kardeşlik,
ebeveynler ortalı kaldıkça iki yandaki aileleri yarım genişlik kadar iter. Taze yerleşim çizimi her seferinde sol
kenara hizaladığı için genişlemeyi tek yana yığar ve bazen daha az kişi kayar. Sonrasında kayma büyüklüğü küçük ve
aileler bütün olarak kayıyor. Sıkı kardeşlik hedefi (`knownIssues.test.js`, `it.fails`) hâlâ başarısız.

### 3.4 Büyük aileler (KI-3 fixture'ları, PCL düzeyi; önceki çizim = taze yerleşim)

| fixture | düzenleme | düzey | kayan / kişi | kayık çift (taze) | kesişim (taze) | süre |
|---|---|---|---|---|---|---|
| 263 | probanda çocuk | taze (okunabilirlik) | 169 / 263 | 23 (23) | 123 (123) | 0,40 s |
| 263 | probanda kardeş | geniş | 260 / 263 | 21 (23) | 118 (124) | 0,10 s |
| 263 | anneye eş | yerel | 235 / 263 | 23 (22) | 122 (121) | 0,06 s |
| 387 | üçü de | taze (okunabilirlik) | 372–376 / 387 | = taze | = taze | 1,8–2,2 s |
| 474 | probanda çocuk | yerel (her yerleşim sorun ekliyor) | 474 / 474 | **52 (34)** | 276 (390) | 2,8 s |
| 474 | probanda kardeş | taze (okunabilirlik) | 471 / 474 | 34 (34) | 388 (388) | 1,8 s |
| 474 | anneye eş | yerel (her yerleşim sorun ekliyor) | 469 / 474 | **43 (34)** | 330 (394) | 2,4 s |

Tümünde değişmez ihlali 0, bağlantı okunabilirliği ihlali 0. Yeniden açılış (değişmemiş grafik) birebir: 12 / 23 /
33 ms. Yoğun büyük pedigrilerde ortada bir genişleme hemen herkesi kaydırır; düzenleme-yerel çözüm burada sık sık
okunabilirlik korumasına takılıp taze yerleşime bırakıyor.

## 4. Testler

- `src/__tests__/ki2Stability.test.js` — 30 test, hepsi geçiyor: popülasyon cırcırları (gerekçesiz çevrilme = 0
  hedefi; çevrilme, kayma, yerel yeniden düzen, okunabilirlik toplamları ≤ taze, tazeden kötü düzenleme sayısı, yana
  sarkma tavanı), hedeflenmiş düzenlemeler (çevrilme yok, sıra korunur, geri al/yinele birebir, kaydet/aç 0 px, blok
  dışı kayma tavanı), değişmeyen kişiler (öznitelik düzenlemesi koordinat değiştirmez), proje dosyası ve "Yeniden
  Düzenle", PCL düzeyi (değişmeyen grafik birebir, etkilenen küme), KI-3 fixture'ları (temiz çizim, okunabilirlik
  güvencesi, süre tavanı). Mutasyon denetimi: store'da düzenleme-yerel yerleşim kapatılınca 6 test kırmızı.
- Tüm paket: 641 geçti + 4 beklenen başarısız (`it.fails`: KI-1, KI-2 sıkı hedef, KI-4, KI-8 — hiçbiri normal teste
  çevrilmedi). Lint temiz, build başarılı, `verify-generations.mjs` 6/6, fuzz tohum 1 ve 12345 %0 / %0, benchmark
  taze yerleşim çıktısı zamanlama dışında birebir aynı (taze motor değişmedi).
- Tarayıcı: kardeş ekleme sonrası büyükanne-babalar ≤ 1 px; "Yeniden Düzenle" taze yerleşim çiziyor, geri al önceki
  çizimi birebir getiriyor; sayfa yenilemede çizim birebir.

## 5. Denenip bırakılan seçenekler (veriyle)

| seçenek | sonuç | neden bırakıldı |
|---|---|---|
| dokunulmamış çiftlerin merkezlemesini yumuşatmak | sınırlı kazanç | okunabilirliği kararlılığa feda eder |
| yalnız merkezleme ×48 | kayık çift 32/144 ama uzun eş çizgisi 84/46 (45 düzenlemede tazeden kötü) | eşler kendi ebeveynlerinin altına çekiliyordu |
| tüm tercihler ×48 | yana sarkan 2474/1801 | sıkılık terimleri de güçleniyordu |
| tüm tercihler ×8 | 4 gerekçesiz çevrilme | iğneler fazla baskın |
| merkezleme toleransı (15 px) | kayık çift 487/144 | kaymalar birikiyordu |
| ek "yeniden sırala" düzeyi | hiç seçilmedi | yerel arama tazeyle aynı çözüme ulaşamıyordu |
| şekil ağırlığı 48 | blok dışı kayma 89 → 81 ama kayık çift artışı | okunabilirlik önceliği |

Seçilen: çift şekli terimleri (merkezleme : eş aralığı = 1 : 0,5, PCL oranı) yerel modda en güçlü iğne kadar ağır;
çapalama; üç ölçütlü okunabilirlik koruması.

## 6. Kalan klinik ve teknik riskler

1. Genişleyen kardeşlik komşu aileleri kaydırır (hedeflenmiş düzenlemelerde iyileşme yok); sıkı hedef karşılanmadı.
2. Büyük yoğun pedigrilerde kararlılık sık sık taze yerleşime yol veriyor; 474 kişide iki düzenleme tazeden daha çok
   kayık çiftle (daha az kesişimle) kalıyor. En kötü süre ~2,8 s (KI-10).
3. Yana sarkan kardeşlik çizgisi tazeden %29 fazla (çoğu tam ebeveynlerinin altında olmayan tek çocuk).
4. Büyükanne-baba birliktelik düzenlemesi veya okunabilirlik için taze yerleşim ebeveynleri çevirebilir (14/1495);
   taze yerleşimin kendisi yönelimi korumaz ("Yeniden Düzenle" dahil).
5. Eş eklemede eşin yanı sabit (KI-8): kardeşler yer açmak zorunda kalabilir — Aşama 2.
6. Kararlı modda satırlar yukarı doğru büyüyebilir ve koordinatlar negatif olabilir; tuval ve dışa aktarım görüntü
   kutusunu çizimden hesapladığı için sorun yok, satır yüksekliği yalnız artar (silme sonrası boşluk "Yeniden
   Düzenle" ile kapanır).
