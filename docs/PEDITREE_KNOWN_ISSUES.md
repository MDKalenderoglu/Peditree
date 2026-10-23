# Peditree — Açık ve kapatılmış sorun kayıtları (regresyon kayıtları)

Faz 3 sonunda kalan riskler ve görsel QA'da bulunan sorunlar. Her kaydın bir **koruma testi** vardır
(`src/__tests__/knownIssues.test.js`):

- **düzeltildi** → sıradan test; geçmeye devam etmeli.
- **açık, cırcır (ratchet)** → bugünkü ölçüm tavan; değer kötüleşirse test kırmızı olur. İyileşince tavan düşürülür.
- **açık, hedef** → `it.fails` istenen davranışı yazar; bugün başarısız olması beklenir. Sorun çözülünce test
  "beklenmedik şekilde geçti" diye kırmızıya döner ve kayıt "düzeltildi"ye taşınır.

Öncelik: **P0** = klinik olarak yanıltıcı görüntü (yanlış ebeveynlik/kardeşlik/eşlik okunabilir veya bir birey
görünmez kalabilir) · P1 = güveni/kullanılabilirliği ciddi bozar · P2 = görsel/ergonomik.

| ID | Öncelik | Durum | Sorun | Klinik risk | Koruma |
|---|---|---|---|---|---|
| KI-1 | P1 | açık | 200–300 kişilik pedigrilerde çiftlerin çoğu çocuklarının merkezinden yarım slottan fazla kayık (105 kişi 7/22, 208 kişi 37/45, 312 kişi 50/68) | Kesişim/sahiplik ihlali yok (iniş çizgisi her zaman doğru çifte bağlı), ama uzun yatay çizgiler takibi zorlaştırır | cırcır + hedef (≥%95 ortalı) |
| KI-2 | P1 | **kısmen düzeltildi** (Aşama 1) — açık | Düzenleme sonrası çizimin ilgisiz kısımları yeniden düzenleniyordu; ebeveynlerin sağ-sol sırası değişiyordu. Artık düzenleme-yerel yeniden yerleşim: gerekçesiz ebeveyn çevrilmesi 165 → 0 (1582 düzenleme), ortalama kayma 77,9 → 23,7 px. Açık kalan: genişleyen bir kardeşlik komşu aileleri kaydırıyor (hedef test hâlâ başarısız); büyük yoğun pedigrilerde okunabilirlik koruması sık sık taze yerleşime geçiyor | Klinisyen düzenleme sonrası aileyi yeniden "bulmak" zorunda; yanlış kişiye işlem yapma riski | `ki2Stability.test.js` (7 ölçüt, cırcır) + `knownIssues.test.js` hedef (`it.fails`) |
| KI-3 | P0 | **düzeltildi; orijinal grafikler yeniden üretilip donduruldu** (Aşama 0) | 263 / 387 / 474 kişilik rastgele işlem pedigrilerinde ayak izi ihlali (ebeveyn olmayan kişi bir kardeşlik çizgisinin üstünde) | Ebeveyn olmayan kişi ebeveyn gibi okunabilir | Sabit JSON fixture'ları `src/__tests__/regression/ki3/` + `ki3Regression.test.js` (bütünlük, semantik, geometri, bağlantı okunabilirliği, klinik okunabilirlik tavanı, determinizm, süre) |
| KI-4 | P2 | **düzeltildi** (2026-10-23; numara sembolün üst köşesinde, 21 fixture'da çakışma 0) | Pedigri numarası ("III-5") sembolün tam üst ortasında; iniş çizgisi etiketin içinden geçiyor | Numara okunaklılığı düşer; ilişki anlamı değişmez | hedef (`it.fails`) |
| KI-5 | P0 | **düzeltildi** (bu adım) | Uyarılar kutusu tuvalin üstünde sabit; alt kuşaktaki sembolleri (yeni eklenen çocuk dahil) örtüyordu | Bir birey görünmez kalabilir | uyarılar tuvalin üstünde normal akışta (kaynak testi) + tarayıcıda ölçüm (çakışma 0 px) |
| KI-6 | P2 | **düzeltildi** (bu adım) | ~1100 px genişlikte araç çubuğu "Sıfırla" düğmesinin üstüne biniyordu | — | araç çubuğu satır kaydırır, tuvalin üstüne binmez |
| KI-7 | P1 | **düzeltildi** (bu adım) | Aileye dışarıdan katılan her eş ve her çocuksuz çift için "herhangi bir ebeveyn birliğine bağlı değil" uyarısı (iç ID ile) | Yanlış-pozitif uyarılar kullanıcıyı gerçek uyarıları yok saymaya alıştırır | `dataIntegrityRegressions.test.js` KI-7 (eski doğrulayıcıyla 2 test kırmızı) |
| KI-8 | P2 | **düzeltildi** (2026-10-19) | Dışarıdan evlenen eşin tarafı sıralamadan önce sabitti (erkek-solda); kişinin başka aileden partneri o tarafta kalınca partnerlik çizgisi eşin üstünden geçiyordu. Aynı sınıftan: eşin eşi satır sonuna ekleniyordu; kurucu zincirleri veri sırasıyla diziliyordu. Partnerin üstünden geçen çizgi (1582 düzenleme, store) 68 → 8; kalan 8 yapısal olarak kaçınılmaz (3+ partner, iki kız kardeşle evlilik) | Çizgi başka bir partnerde bitiyormuş gibi okunur | `knownIssues.test.js` (normal test) + `ki8PartnerSide.test.js` (25 test); ayrıntı `docs/PEDITREE_KI8_REPORT.md` |
| KI-9 | P1 | **düzeltildi** (Faz 2b) | "Klinik Notlar" lejantı etiketi olmayan kişiler için iç kimliği (`mat_uncle_0_cf_1`) yazıyordu; SVG/PNG dışa aktarmaya da giriyordu | Dışa aktarılan klinik belgede anlamsız kimlik | kaynak testi + tarayıcıda doğrulandı ("[1] IV-7: …") |
| KI-10 | P2 | açık | 387 / 474 kişilik stres grafiklerinde yerleşim 1,7 / 2,8 s sürüyor (ayak izi kuralı 281 / 301 çözücü turu gerektiriyor); 263 kişide 0,18 s | Çok yoğun ailede düzenleme sonrası belirgin bekleme | `ki3Regression.test.js` süre tavanı (3,5 / 5 s — regresyon tavanı, ürün hedefi değil) |

## Ayrıntılar

### KI-1 — Büyük pedigride merkezleme
- **Yeniden üretme:** `npm run audit:layout-benchmark` → "Realistic large pedigrees" tablosu (`src/audit/largePedigrees.js`).
- **Kök neden:** Sıralama aşamasında çok satırlı koordineli hamle gerektiren yerel minimumlar (bir kardeşlik ters
  çevrildiğinde altındaki alt ağacın birlikte kayması gerekir) ve kayınpeder/kayınvalide çiftlerinin bir kardeşliğin
  içine konamaması (yapısal kesişim veya uzun çizgi kaçınılmaz).
- **Çıkış ölçütü:** üç gerçekçi vakada çocuklu çiftlerin ≥%95'i yarım slot içinde; invariant/okunabilirlik %0 kalır.
- **Plan:** alt ağaç blok hamleleri; küçük bileşenlerde tam (ILP) çapraz azaltma; büyük pedigri için odak/daraltma görünümü (Faz 5).

### KI-2 — Düzenleme kararlılığı (kullanıcı önceliği) — kısmen düzeltildi (Aşama 1)
- **Gereksinim (2026-10-18, kullanıcı):** Bir kişiye eş veya çocuk eklendiğinde mümkün olduğunca **yalnızca ilgili aile
  bloğu** değişmeli; var olan yerleşim korunmalı. Çizim gereksiz yere yeniden düzenlenmemeli. Kararlılık yanlış veya
  yanıltıcı bir bağlantıyı korumak için katı kural olamaz.
- **Kök nedenler (bulunan ve düzeltilen):**
  1. Store her düzenlemede yerleşimi sıfırdan hesaplıyordu; PCL önceki yerleşimi bilmiyordu. → Store artık önceki
     çizimi (kalıcı kimliklerle) PCL'ye veriyor (`src/layout/pcl/incremental.js`).
  2. Taze yerleşim, simetrik çözümler arasında yönelimi rastgele seçiyor ve çizimi her seferinde sol kenara
     hizalıyordu. → Önceki sıralamadan başlayan kararlı sıralama (`orderLayersStable`, ters çevrilen her çift için
     ceza) ve mutlak koordinatlar.
  3. Önceki çizim, kararlı problemin dengesi değildi (taze çözümün ayak izi çarpanları ve çözücü toleransı): hiçbir
     şey değişmese bile herkes kayıyordu. → *Çapalama*: dokunulmayan kişiler arasındaki terimlerin önceki
     konumlardaki kuvveti iğne hedefleriyle sıfırlanıyor; yalnızca düzenlemenin değiştirdiği terimler kişileri
     hareket ettirebiliyor.
  4. Ağırlık yeniden ayarlama turları ayak izi kuralını yeniden bozabiliyordu. → Ayak izi her turdan sonra yeniden
     yerleştiriliyor.
- **Kararlılık okunabilirliğin önüne geçmez:** bir düzey (yerel → geniş → taze) ancak geometrik/bağlantı ihlali yoksa
  ve önceki çizimden daha fazla çizgi kesişimi, merkezden kayık çift veya uzun eş çizgisi içermiyorsa kabul edilir;
  hiçbiri uymazsa taze yerleşim de hesaplanır ve sorunu en az olan seçilir. Yerel modda çift şekli terimleri
  (merkezleme 1 : eş aralığı 0,5) en güçlü iğne kadar ağırdır.
- **Ölçüm (aynı yöntem, aynı veri; `reports/layout-stability-{before,after}.md`, ayrıntı
  `docs/PEDITREE_KI2_STABILITY_REPORT.md`):**

  | ölçüt (random-200x12, 1582 düzenleme) | önce | sonra |
  |---|---|---|
  | ebeveyn çevrilmesi (toplam / büyükanne-babaya birliktelik düzenlemesi / okunabilirlik için / gerekçesiz) | 171 / 6 / 0 / 165 | 14 / 4 / 10 / **0** |
  | kayan kişi oranı (> 2 px) | %60,5 | %36,8 |
  | ortalama kayma | 77,9 px | 23,7 px |
  | aralığı değişen sıra komşuları (yerel yeniden düzen) | %20,7 | %19,2 |
  | merkezden kayık çift / çizgi kesişimi / uzun eş çizgisi (çizilen; taze = 144 / 120 / 46) | 144 / 120 / 46 | 92 / 75 / 38 |
  | yana sarkan kardeşlik çizgisi (çizilen; taze = 1801) | 1801 | **2318** |

- **Açık kalanlar (dürüstçe):**
  - Hedef test (`it.fails`): bir kardeşe eş + çocuk eklemek kardeşliği iki slot genişletir; ebeveynler kardeşliğin
    üstünde ortalı kaldığı için komşu aileler (amca/hala aileleri) yer açmak üzere kayar. Hedeflenen 8 klinik
    düzenlemede blok dışında kayan kişi önce 74, sonra 80 — **iyileşme yok**; aileler artık bütün olarak kayıyor
    (iç aralığı değişen dokunulmamış aile önce 14, sonra 14). Sıkı paketlenmiş bir çizimde ortada genişleyen bir
    kardeşlik için bu hedef geometrik olarak, ebeveyn merkezlemesinden vazgeçmeden karşılanamaz.
  - Büyük yoğun pedigrilerde (KI-3 fixture'ları) okunabilirlik koruması sık sık taze yerleşime geçiyor (387 kişide 3
    düzenlemenin 3'ü); 474 kişide bir düzenleme daha az kesişimle ama tazeden daha fazla kayık çiftle yerel kalıyor.
    En kötü süre ~2,8 s (üç yerleşim hesaplanır; KI-10).
  - Yana sarkan kardeşlik çizgisi tazeden %29 fazla (çoğu, tam ebeveynlerinin altında olmayan tek çocuk).
  - Eş eklendiğinde KI-8 (eşin tarafı) nedeniyle kardeşler yer açmak zorunda kalabiliyor.
- **KI-8 sonrası (2026-10-19, `reports/layout-stability-ki8-{before,after}.md`):** gerekçesiz çevrilme 0; toplam
  çevrilme 14 → 9; ortalama kayma 23,7 → 21,2 px; kesişim 75 → 22; uzun eş çizgisi 38 → 7. Hedeflenmiş düzenlemelerde
  blok dışı hareket **80 → 80 (değişmedi)**; yana sarkma 2318 → 2331 (kötüleşti); tazeden fazla kayık çiftli
  düzenleme 6 → 9.
- **Kullanıcı kontrolü:** araç çubuğunda "Yeniden Düzenle" — tüm pedigriyi taze yerleştirir; geri alınabilir.
  Proje dosyası ve otomatik kayıt çizimi (`layoutHints`) saklar; açılışta çizim birebir geri gelir.

### KI-3 — Aşırı yoğun grafikte ayak izi ihlali (P0, düzeltildi)

**Aşama 0 (2026-10-18) — orijinal vakaların yeniden üretimi ve dondurulması:**
- Bulgu (Codex denetimiyle uyumlu): test paketindeki tohum tabanlı KI-3 testleri aslında 214 / 293 / 363 kişilik, *başka*
  aileleri sınıyordu. Neden: fuzz modelinin seçimleri store'a ve yerleşim motoruna bağlı (ilişki eylemleri yerleşim
  güvenlik kontrolünden geçer); store v2'ye geçince aynı tohum başka aile üretiyor.
- Orijinal koşullar birebir yeniden kuruldu: dondurulmuş şema-1 store (`src/__tests__/support/v1Store.js`), store içi
  motor `recursive` (PCL geçişinden önceki varsayılan), tohumlar p3 / p4 / p5, 220 / 320 / 400 işlem.
  `npm run audit:freeze-ki3` (`scripts/ki3-fixtures.runner.mjs`).
- **Yapısal imza orijinal kayıtla birebir aynı:** kişi 263 / 387 / 474, birliktelik 51 / 74 / 90, aileler arası evlilik
  8 / 9 / 13, kuşak 7 / 7 / 8 (p1/p2 de 66 / 126 ile eşleşiyor). Yeniden üretim deterministik (iki üretim aynı sha256).
- Orijinal hatanın bu grafiklerde yeniden görülmesi: `4e57a32` commit'indeki PCL → 3 / 13 / 7 ayak izi ihlali; güncel
  PCL → 0 / 0 / 0. (Faz 3 kaydındaki "2 / 12 / 7", commit edilmemiş ara bir sürümle ölçülmüştü; o sürüm yeniden
  oluşturulamaz.)
- **Sınır:** orijinal grafiklerin içerik özeti kaydedilmemişti; bayt düzeyinde özdeşlik kanıtlanamaz. Kanıtlanan: aynı
  üretici, aynı tohum, aynı store, aynı motor ve aynı yapısal imza.
- Testler artık tohumu değil JSON'u okur; fixture'ın sha256'sı testte doğrulanır (dosya değişirse test kırmızı).
- Ayrıca düzeltilen araç hatası: fuzz modeli `addRelativeBranch` / `addGen4` adımlarında seçilen store yerine
  uygulama store'unu çağırıyordu (`setFuzzStore` ile v1 store kullanıldığında bu adımların çocuk ekleme kısmı yanlış
  store'a gidiyordu; `migrationV2.test.js`'in rastgele v1 oturumları bu yüzden eksik kuzen içeriyordu).

**Önceki kayıt:**
- **Kök neden:** Çarpanlar yönteminde ihlal edilmeye devam eden çiftin hedefi her turda yalnızca kalan ihlal kadar
  kayıyordu; birbirine karşı çalışan terimlerde 80 tur yetmiyordu.
- **Düzeltme:** sürekli ihlal edilen çiftin adımı sınırlı olarak büyür (en fazla 8×); üst sınır 400 tur. Tur yalnızca
  ihlal varken döner — normal pedigrilerde süre değişmedi.
- **Ölçüm:** 263 / 387 / 474 kişi → 0 / 0 / 0 ihlal; süre 0,18 / 1,7 / 2,5 s (474 kişilik stres grafiği 300 kişi
  bütçesinin dışında; kaydedildi).

### KI-4 — Pedigri numarası ve iniş çizgisi
- **Plan:** Faz 4 gösterim işi — numara sembolün sol üstüne (standart örneklerdeki gibi) ya da Romen rakamlı kuşak
  etiketi + satır içi numara düzenine.

### KI-5 / KI-6 / KI-7 — düzeltildi
- KI-5/6: araç çubuğu ve tüm bildirimler (`canvas-notices`) tuvalin üstünde normal akışta; tuval kalan alanı doldurur ve
  yeniden sığdırılır; uyarı listesi "Gizle/Göster" ile daraltılabilir, sayısı ve hata sayısı başlıkta görünür.
  Ekran görüntüsü: `docs/screenshots/faz3/KI-5-6-notices-above-canvas.jpg`.
- KI-7: `validators.js` — dışarıdan evlenen eş (eşi var, ebeveyni çizilmemiş) normal kurucu sayılır; çocuksuz çift
  geçerlidir (NSGC). Yalnız ne ebeveyni ne eşi olan kişi uyarılır; mesajda iç ID yerine görünen ad kullanılır.
