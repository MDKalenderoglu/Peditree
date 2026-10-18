# Peditree — Bağımsız Teknik Denetim Raporu (Faz 0 + Faz 1)

Tarih: 2026-10-18 · Denetlenen commit: `f516a6d` (main) · Çalışma branch'i: `stabilization/clinical-layout`

Bu rapor eski plan/rapor dokümanlarındaki iddiaları **gerçek durum kabul etmez**. Her bulgu ya çalışan
koddan ölçülmüş (tanı testi / tarayıcı) ya da doğrudan kaynak koddan doğrulanmıştır. Tanı testleri geçici
dosyalarla çalıştırılıp silinmiştir; yeniden üretme adımları her bulgunun altında verilmiştir.

---

## 0. Faz 0 — Başlangıç durumu ve baseline

| Konu | Gerçek durum |
|---|---|
| Aktif klasör | `/Users/mdkalenderoglu/Desktop/MD_Kalenderoglu/MD/claude/Peditree` (görevde yazan `Desktop/MD/claude/Peditree` artık yok — klasör yeniden adlandırılmış) |
| Remote | `origin = github.com/MDKalenderoglu/Peditree` |
| main HEAD | `f516a6d` (= `origin/main`), çalışma ağacı temiz |
| Çalışma branch'i | `stabilization/clinical-layout` (main'den, değişiklik yok) |
| Node / npm | v24.18.0 / 11.16.0 |
| Gerçek bağımlılıklar | react 19.2.5, react-dom 19.2.5, d3 7.9.0, zustand 5.0.12, uuid 14.0.0, lucide-react 1.14.0; dev: vite 8.0.10, vitest 4.1.5, eslint 10.3.0 |
| Test ortamı | vitest `environment: 'node'` — DOM/tarayıcı testi yok |
| `hatalar/` | yok |
| `örnek/` | var (git-ignored): Bennett 2008'in Türkçe uyarlaması sembol tabloları (3 PNG), 2 örnek pedigri görüntüsü, Çitli & Ayaz 2016 PDF'i |

**Baseline ölçümleri (HEAD `f516a6d`):**

| Kontrol | Sonuç |
|---|---|
| `npm test` | 25 dosya, 478/478 geçti |
| `npm run build` | geçti (369 kB JS) |
| `npm run lint` | temiz |
| `node verify-generations.mjs` | 6/6 |
| Fuzz, varsayılan motor (recursive), seed 1 / 1000 | 0 hata (%0,0), named 6/6 |
| Fuzz, varsayılan, seed 12345 / 1000 | 0 hata (%0,0), named 6/6 |
| Fuzz, varsayılan, seed 7 / **5000** | 0 hata (%0,0) |
| Fuzz, legacy motor, seed 1 / 1000 | 471 hata (%47,1) |
| Fuzz, legacy, seed 12345 / 1000 | 443 hata (%44,3) |

**Tarihsel karşılaştırma:** Temmuz 2026 baseline'ı (eski v0.4 motoru) 752/1000 (%75,2) idi. Bugün legacy motor
%47,1, varsayılan motor %0. **Ancak bu "%0" yanıltıcıdır** — aşağıda (LY-3) gösterildiği gibi fuzz yalnızca 13
invariant'ı ölçer ve bu invariant'lar klinik okunabilirliği bozan en yaygın hata sınıflarını ölçmez. Named QA
senaryoları da yalnızca bu 13 invariant'a göre "geçer"; bağımsız ölçütle (merkezleme/kesişim) yeniden
değerlendirildiğinde geçmezler (bkz. §2).

---

## 1. Mevcut mimari (gerçek, koddan)

```
WizardPanel (sol, sayılar)  ─┐
IndividualEditor (sağ)       ├─► usePedigreeStore (Zustand)
Canvas tıklamaları           ─┘        │  tek gerçek kaynak = wizardData:
                                       │   • sihirbaz sayıları (kardeş sayısı, dayı sayısı …)
                                       │   • graphEdits[]       (ekleme talimatı günlüğü)
                                       │   • deletedIndividualIds[] (silme "mezar taşları")
                                       │   • manualEdits{id: alanlar} (sağ panel düzenlemeleri)
                                       │   • childOrders, customConsanguinity, probandId
                                       ▼
          her işlemde BAŞTAN: buildPedigreeFromWizard (1023 satır)
              → applyIndividualDeletions → auditPedigreeGraph → manuel düzenleme birleştirme
              → computePedigreeLayoutV2 → computeFamilyBlockLayout → recursiveIntervalPacker
              → validatePedigree → auditLayoutIntegrity
                                       ▼
          PedigreeCanvas (D3: her render'da tüm SVG silinip yeniden çizilir)
```

- **Veri modeli:** `Individual`, `Union {partners[2]}`, `ParentChildRelationship {unionId, children[]}`. Bir çocuk
  en fazla bir ebeveyn birliğine bağlanabilir.
- **Kimlikler (ID):** sihirbaz kaynaklı bireylerde konum/indeks tabanlı (`sib_m_0`, `mat_uncle_2`,
  `hsib_mat_m_1_0`, `gen4_sp_0`); doğrudan eklemelerde `de_sp_${graphEdits.length}` gibi **dizi uzunluğundan**
  türetilmiş.
- **Kalıcılık:** yalnızca `localStorage` (tek oturum, `.v1` anahtarı), 300 ms debounce. Proje dosyası kaydet/aç yok.
- **Yerleşim:** "recursive disjoint-interval packer" — birliklerden (union) oluşan bir iniş ormanı; her union tek bir
  "çapa" (bloodline) partnere asılır, kök aileler soldan sağa dizilir; uzak eşler "koridor" çizgisiyle bağlanır.
- **Dışa aktarma:** canlı SVG DOM'u olduğu gibi serileştirilir (SVG, PNG). PDF yok.

### Kök mimari sorun (birçok tarihsel hatanın ortak nedeni)

**Grafik, gerçek kaynak değil; konum-tabanlı kimliklerle yeniden oynatılan bir talimat günlüğünden her seferinde
yeniden türetiliyor.** Kişinin kimliği "kaçıncı kardeş / kaçıncı dayı / kaçıncı düzenleme" bilgisine bağlı. Bu
nedenle silme, yeniden ekleme, sayı değiştirme ve düzenleme silme işlemleri kimlikleri kaydırır, çakıştırır veya
mezar taşı olarak kilitler; klinik bilgi (etkilenmişlik, etiket, yaş) yanlış kişiye geçebilir veya kaybolur.
Tarihsel hata envanterindeki #8, #10, #11, #13 ve #14 bu kök nedenle tutarlıdır. `CLAUDE.md`'nin "Graph model
is source of truth … wizard is an input adapter" hedefi henüz uygulanmamıştır.

---

## 2. Bulgular

Önem dereceleri: **P0** klinik olarak yanlış/belirsiz ilişki, veri kaybı, bozuk dışa aktarma · **P1** karmaşık
pedigri oluşturmayı engelleyen işlevsel hata · **P2** performans/belirgin kullanım sorunu · **P3** görsel/ikincil.

### 2.1 Veri modeli ve durum yönetimi (DM)

| ID | Önem | Bulgu | Kanıt |
|---|---|---|---|
| DM-1 | P0 | Grafik gerçek kaynak değil; konum-tabanlı ID'lerle yeniden oynatılan günlük (yukarıdaki kök sorun). DM-2…DM-6'nın ortak nedeni. | kod incelemesi |
| DM-2 | **P0** | Bir doğrudan düzenleme silindikten sonra yeni "eş ekle" var olan bir ID'yi yeniden üretir (`de_sp_${graphEdits.length}`); builder tekrar eden ID'yi **sessizce yok sayar** (`if (idSet.has(id)) return id`). Eş listede "eklendi" görünür ama çizilmez. | H1: proband'a eş ekle → kardeşe eş ekle → ilk düzenlemeyi sil → proband'a tekrar eş ekle ⇒ iki düzenleme de `de_sp_1`, proband'ın eşi yok |
| DM-3 | **P0** | Sağ panelden girilen **yaş**, herhangi bir sonraki yapısal işlemde kaybolur (birleştirme listesinde `age` ve `sex` yok). | H3: anneye yaş 52 gir → kardeş ekle ⇒ yaş `''` |
| DM-4 | **P0** | Bir ebeveyni silmek, çocuğun **diğer ebeveynle** bağını da siler (union tümden kaldırılır). Onay penceresi "çocuklar silinmez, sadece bu ebeveyn bağlantısı kaldırılır" der — gerçekte anne bağı da kopar. Bütünlük denetimi hata vermez. | H6: babayı sil ⇒ proband'ın ebeveyn birliği `null`, anne var ama bağsız |
| DM-5 | **P0** | Silinen kişinin klinik verisi (etkilenmiş, etiket) aynı konum-ID'sini alan **yeni** kişiye geçer. | H4: 3 dayı, `mat_uncle_2`'yi etkilenmiş+etiketli yap → sayıyı 2'ye indir → 3'e çıkar ⇒ yeni dayı etkilenmiş ve "Ahmet" etiketli |
| DM-6 | P1 | Sihirbaz kaynaklı silme bir mezar taşıdır: sayaç "2 kardeş" der, tuval 1 gösterir; kardeş yeniden eklenince **hiç görünmez**. | H2 |
| DM-7 | P0* | Union cinsiyet kuralı yalnızca oluşturma anında uygulanır; sihirbazdan proband cinsiyeti değiştirilince kadın+kadın union sessizce oluşur; bütünlük denetimi yok. (*kural ürün kararına bağlı, bkz. §4) | H7 |
| DM-8 | P1 | Proband dışındaki hiçbir bireyin cinsiyeti arayüzden değiştirilemez (sağ panel salt-okunur); mağazadaki yol da yeniden yapılanmada geri döner. 5A kuralıyla birleşince "Bil. Kardeş" olarak eklenen birey **asla eş/çocuk alamaz** (çıkmaz yol — 5A'nın yan etkisi). | H8 + kod |
| DM-9 | P1 | Eksik ilişki/özel durum türleri: evlat edinme, ikiz/çoğul gebelik, yardımcı üreme (donör/taşıyıcı), gebelik (P), TOP, ektopik, gebelik haftası, "n/5 birey" sembolü, açık "çocuksuz/infertil" alanı, consultand. "Bir çocuk = tek ebeveyn birliği" kuralı genetik/sosyal ebeveynlik ayrımını ve akraba tarafından evlat edinmeyi temsil edemez. | kod + örnek/ tabloları |
| DM-10 | P1 | Bütünlük denetimi boşlukları: atalık döngüsü (kişinin kendi atası olması), union cinsiyet tutarlılığı, ebeveyn-çocuk/kardeş union'ı `auditPedigreeGraph`'ta yok (yalnızca oluşturma planı veya uyarı metni). | `graphIntegrity.js` kod envanteri |
| DM-11 | P1* | Farklı kuşaktan eş oluşturma kategorik olarak engelli. Biyolojik olarak mümkün avunküler (amca/dayı–yeğen) birliktelikler temsil edilemez. (*kural ürün kararına bağlı) | `computeUnionCreationPlan` |

### 2.2 Yerleşim motoru (LY)

| ID | Önem | Bulgu | Kanıt |
|---|---|---|---|
| LY-1 | **P0** | Çiftler çocuklarının üstünde ortalanmıyor; çocuklar ebeveyn ortasının altında değil. Varsayılan açılışta proband ebeveyn ortasından 120 px solda. Kök neden: `placeOwnedUnions` çapa partneri doğrudan çocuk merkezine koyar, eşi bir yana kaydırır; çocuklar alt-ağaç sol kenarına yerleşir. | 300 fuzz vakasında: %81'inde en az bir çift yarım slottan fazla kayık, %94'ünde ebeveyn orta noktası çocuk aralığının **dışında** (kardeş çizgisi yana uzatılıyor) |
| LY-2 | **P0** | İki partnerin de grafikte ebeveyni varsa (eşin ebeveynleri eklendi, kuzen evliliği, çapraz dal birlikteliği) partnerler farklı kök alt-ağaçlara düşüp yüzlerce–binlerce piksel uzağa yerleşir; evlilik çizgisi başka ailelerin iniş çizgilerini **keserek** uzanır. Kök neden: "her union tek çapaya asılı iniş ormanı + doğrusal kök sırası" modeli, birden çok köprüyü aynı anda bitişik tutamaz. | Gerçekçi 33 kişilik aile (A1 ekran görüntüsü): 13 invariant'ın hepsi geçiyor, ama proband evlilik çizgisi 931 px ve 3 kuzenin iniş çizgisini kesiyor; kuzen evliliği çift çizgisi 635 px ve 4 iniş çizgisini kesiyor. 251 kişilik fuzz pedigrisinde bir hala ile eşi 6 521 px uzakta. |
| LY-3 | **P0** (süreç) | Invariant seti eksik: kesişim, merkezleme, eş çizgisi uzunluğu, "bu bağlantı kime ait" belirsizliği ölçülmüyor. Bu yüzden fuzz %0 verirken klinik çizim belirsiz — tarihsel #12'nin ("testler geçiyor, çizim yanlış") doğrudan nedeni. | §0 baseline vs LY-1/LY-2 |
| LY-4 | P1 | Genişlik patlaması ve sıkıştırma yok: 251 kişi → 21 010 px genişlik. Ormana bağlanamayan bireyler (ör. ebeveyn silinince yetim kalan çocuklar) satırın en sağına eklenir. | perf ölçümü + `computeRecursiveLayout` fallback |
| LY-5 | P1 | Kararlı artımlı yerleşim yok; her işlemde tüm koordinatlar baştan hesaplanır, küçük değişiklik tüm çizimi kaydırabilir. | kod |
| LY-6 | P2 | Koridor yönlendirme evlilik çizgisini kuşak satırının üstünden çizer ve orta noktaya kısa bir dikey "çentik" ekler — standartta olmayan bir gösterim; A1'de açıklamasız çentik olarak görünüyor. | kod + A1 |
| LY-7 | P1 | Çoklu partner standart dışı: partnerler sabit ofsetle bir yana dizilir, sıralama/iki yana yerleşim kuralı yok. | kod |
| LY-8 | — | Legacy motor (`pedigreeLayout.js`, legacy `layoutPacking`) yalnızca fallback; fuzz %44–47 hata. Yeni motor doğrulanmadan silinmeyecek. | baseline |

### 2.3 Sembol ve gösterim (RN) — Bennett 2008 / `örnek/` tablolarına göre

| ID | Önem | Bulgu |
|---|---|---|
| RN-1 | P1 | Proband okun yanında **"P" yok** — Bennett 2008'de bu çizim **consultand** sembolüdür; proband yanlış sembolle gösteriliyor. |
| RN-2 | P1 | Taşıyıcı yarım-dolu çiziliyor ve **lejantta tanımlanmıyor**. Bennett 2008 noktayı kullanıyordu; **Bennett 2022 §4.5 noktayı artık önermiyor** — sembol bölünür, her bölmeye desen verilir ve desen lejantta açıklanır. Yani yarım dolu biçim 2022'ye yakın, eksik olan zorunlu lejant girişi. Asemptomatik/presemptomatik taşıyıcı (dikey çizgi) yok. |
| RN-3 | P1 | Ölü doğum küçük sembol + X ile çiziliyor; standart: normal boy sembol + tek eğik çizgi + "SB" + gebelik haftası. |
| RN-4 | P2 | Lejantlar sabit 100 px kenar boşluğuna çiziliyor; çok girdide düğüm ve etiketlerle çakışabilir. |
| RN-5 | P3 | Solda Romen rakamlı kuşak etiketleri yok (her sembolün üstünde "II-3" var). |
| RN-6 | P2 | Etiket çakışma denetimi yok (yaş/etiket/tanı metinleri komşularla çakışabilir). |
| RN-7 | P1 | Akrabalık çift çizgisi koridorla uzun çizildiğinde başka ailelerin kardeş çizgileriyle aynı hizaya düşüyor; küçük ölçekte tek çizgiden ayırt edilemiyor (LY-2'ye bağlı). |
| RN-8 | P1 | Ayrılık tek eğik çizgi, boşanma çift eğik çizgi ile çiziliyor. Standart (08, 22 Şekil 3): *"A break in a relationship line indicates the relationship no longer exists"* — **tek gösterim "//"**; ayrılık/boşanma ayrımı standartta yok, yalnız kayıt bilgisi olmalı. |
| RN-9 | P2 | Partneri bilinmeyen/silinen ebeveyn bir "belirtilmemiş" karo sembolüyle çiziliyor. Standart örnekte (22/25 Şekil 3) partner gösterilmediğinde iniş çizgisi doğrudan tek ebeveynden iner. |
| RN-10 | P2 | Etkilenmemiş bir kişi proband yapılabiliyor; standart: proband her zaman etkilenmiştir, etkilenmemiş başvuran consultand'dır (consultand kavramı yok). |

### 2.4 Dışa aktarma ve kalıcılık (EX)

| ID | Önem | Bulgu | Kanıt |
|---|---|---|---|
| EX-1 | **P0** | Seçim vurgusu (mavi/mor kenar) SVG/PNG dosyasına **gömülüyor** — klinik çıktıda bir kişi anlamsız şekilde vurgulu. | tarayıcıda: proband seçiliyken serileştirilmiş SVG `#3b82f6` içeriyor |
| EX-2 | P1 | Dışa aktarma canlı zoom/pan dönüşümünü ve ekran boyutunu kullanıyor; PNG çözünürlüğü panel genişliğine bağlı, büyük pedigrilerde okunamaz. SVG `width="100%"` — bağımsız açıldığında doğal boyutu yok. | kod + tarayıcı |
| EX-3 | P1 | PDF/baskı çıktısı yok. | kod |
| EX-4 | P1 | Düzenlenebilir proje dosyası (kaydet/aç) yok; tek `localStorage` oturumu; tarayıcı verisi silinirse her şey gider. Şema sürümü uyuşmazsa veri **sessizce atılır** ("starting clean") — gelecekteki her şema değişikliği veri kaybı riski. | `persistence.js` |

### 2.5 Kullanıcı etkileşimi ve arayüz (UX)

| ID | Önem | Bulgu |
|---|---|---|
| UX-1 | P1 | İki paralel düzenleme modeli (sol: sayılar, sağ: kişi) ve aralarında senkron yok (DM-6). Tarihsel #10. |
| UX-2 | P2 | Her düzenlemede zoom/pan sıfırlanıyor (`svg.call(zoom.transform, d3.zoomIdentity)` her render'da). |
| UX-3 | P2 | Uyarılar iç ID gösteriyor ("Eş (U_DE_0) …"); ebeveyni gösterilmeyen her eş için yanlış-pozitif uyarı — kullanıcıyı uyarıları yok saymaya alıştırır. |
| UX-4 | P2 | Türkçe karakterleri olmayan etiketler ("Kardesler", "Es Ekle", "Kadin Es") ile düzgün Türkçe karışık. |
| UX-5 | P2 | Yalnızca 2 kişilik seçim; toplu silme yok; silme onay metni gerçeği yansıtmıyor (DM-4). |
| UX-6 | P2 | Ebeveyni olmayan (kurucu) bireye kardeş eklenemiyor; önce ebeveyn eklemek gerekiyor. |
| UX-7 | P2 | Doğum sırası yalnızca düğmelerle; model düzeyinde çalışıyor, sürükle-bırak yok; tek çocukta düğme görünmüyor. |
| UX-8 | P2 | "Yalnız anne/baba ekle" görünmez bir "belirtilmemiş" partner üretiyor; varsayılan çift ekleme değil. |

### 2.6 Performans ve işletim (PF)

| ID | Önem | Bulgu |
|---|---|---|
| PF-1 | P2 | Üretim kodunda her yeniden yapılanmada tüm grafik `console.log` + `console.table` ile yazdırılıyor (hasta verisi konsolda; performans). |
| PF-2 | — | Model+yerleşim hesaplaması hızlı: 251 kişilik pedigride işlem medyanı 0,3 ms, p95 1,6 ms (Node, M-serisi Mac). Darboğaz hesaplama değil; tarayıcıda tam DOM yeniden çizimi ayrıca ölçülecek. |

### 2.7 Test altyapısı (TS)

| ID | Önem | Bulgu |
|---|---|---|
| TS-1 | P0 (süreç) | Invariant seti okunabilirliği ölçmüyor (LY-3). |
| TS-2 | P1 | Fuzz üreticisinde geri al/yinele, kaydet/yeniden yükle, düzenleme silme, sihirbaz sayısı azaltma, cinsiyet değişikliği yok — bu yüzden DM-2…DM-8 fuzz'a hiç görünmedi. |
| TS-3 | P1 | Gerçek tarayıcı E2E testi ve ekran görüntüsü regresyonu yok (vitest `node`). |
| TS-4 | P2 | Bazı testler hatalı davranışı "beklenen" olarak kodlamıştı (ör. aynı cinsiyetli çifti geçerli birlik örneği olarak kullanan test, 5A'da düzeltildi). |

### 2.8 Doküman güncelliği

`KNOWN_LIMITATIONS.md` "undo/redo yok" der (var); `CLAUDE.md`'nin "aktif öncelik: BFS generation" bölümü tamamlanmış;
`PEDIGREE_MODEL_BOUNDARY.md` hattı hâlâ `pedigreeLayout.js` gösterir (uygulama V2 + recursive packer kullanır);
`PEDIGREE_CLINICAL_SYMBOL_REFERENCE_NOTES.md` presemptomatik taşıyıcıyı "yarım dolu" olarak tarif eder, `örnek/`
tablosunda dikey çizgidir. Bu dokümanlar tarihsel kayıt olarak bırakılmıştır; güncel durum için `docs/`
altındaki PEDITREE_* dokümanları esas alınmalıdır.

---

## 3. Tarihsel hata envanterinin bugünkü durumu

| # | Tarihsel problem | Bugün |
|---|---|---|
| 1 | Ayrı aile dalları görsel olarak birleşiyor | Node/blok çakışması olarak düzeldi; ama uzun evlilik çizgileri başka dalların iniş çizgilerini kesiyor (LY-2) |
| 2 | Kardeş çizgileri başka çiftlerin çocuklarıyla karışıyor | Ortak bus düzeldi; yana uzatılan bus'lar (LY-1) ve kesişimler (LY-2) yeni biçimi |
| 3 | Sonradan ebeveyn/kardeş eklemek üst kuşağı bozuyor | Sürüyor (LY-2, LY-5) |
| 4 | Maternal/paternal dallar üst üste | Çakışma düzeldi; ama dallar arası köprüler çok uzun (LY-2) |
| 5 | Uzak iki bireyi evlendirmek çizimi bozuyor | Sürüyor (LY-2: A1 kuzen evliliği) |
| 6 | Çok çocuklu ailelerde bağlantılar okunamaz | Kısmen; merkezleme sorunu (LY-1) |
| 7 | Eş eklemek başka bireylerin üzerine çizgi getiriyor | Düğüm üzerinden geçme düzeldi; kesişimler sürüyor (LY-2) |
| 8 | Silme sonrası semboller üst üste | Çakışma yok; ama silme ilişki kaybı (DM-4) ve yetim bireyleri en sağa atma (LY-4) |
| 9 | Kontrolsüz genişleme | Sürüyor (LY-4) |
| 10 | Sağ/sol panel senkronsuz | Sürüyor (DM-6, UX-1) |
| 11 | Ekleme/silme ilişkileri yer değiştiriyor | Sürüyor, daha ağır biçimde doğrulandı (DM-2, DM-5) |
| 12 | Testler geçiyor ama çizim yanlış | Sürüyor (LY-3, TS-1, TS-2) |
| 13 | Model/layout/UI uyumsuzluğu | Sürüyor (DM-1) |
| 14 | Kaydetme/silme/geri alma sorunları | Kısmen (DM-2, DM-3, DM-4, EX-4) |

---

## 4. Ürün kararı gerektiren noktalar (klinisyen onayı)

1. **Aynı cinsiyetli partnerlik.** Önceki talimatınızla (Türkiye klinik pratiği) şu an engelleniyor. Standart bu
   konuda açık: Bennett 2022 §4.4 *"The 2008 recommendations include … the recording of same-sex relationships"*;
   özel bir gösterim yoktur, normal birliktelik çizgisi kullanılır ve 2022/2025 şekillerinde aynı cinsiyetli çiftlerin
   gebelikleri normal iniş çizgisiyle gösterilir. Seçenekler: (a) engel sürsün (yerel tercih olarak belgelenir),
   (b) izin verilsin (standarda uygun), (c) ayarla seçilebilsin. Kararınıza kadar mevcut engel korunuyor; DM-7
   (sihirbaz/editör yolundan atlatma) her iki durumda da tutarlılık hatası olduğu için Faz 2a'da kapatıldı.
2. **Farklı kuşak arası birliktelik** (avunküler vb.). Biyolojik olarak mümkün; şu an kategorik engelli. Öneri:
   mantıksal döngüleri (kişinin kendi atasıyla) kesin engelle; biyolojik olarak mümkün olanlara açık uyarıyla izin
   ver, yerleşim motoru bunları çizebilsin.
3. **Cinsiyeti bilinmeyen partner.** 5A ile engellendi; bu, cinsiyeti kaydedilmemiş uzak bir akrabanın eşini
   girmeyi imkânsız kılıyor. Öneri: izin ver, ama sağ panelden cinsiyet düzenlenebilsin (DM-8).

4. **"Tam bir proband" kuralı** (`CLAUDE.md` #6) standarttan katı: proband tanımı gereği etkilenmiştir; etkilenmemiş
   başvuran kişi consultand'dır ve birden çok olabilir; taşıyıcı taraması gibi durumlarda proband hiç olmayabilir.
   Öneri: consultand alanı eklenirken bu kural "en fazla bir proband, proband etkilenmiş olmalı" biçiminde gevşetilsin.

---

## 5. Önceliklendirilmiş uygulama planı

Her faz kendi kabul kriteriyle kapanır; başarısızlıkta önceki faza dönülür. Ayrıntılı yerleşim kararı:
`PEDITREE_LAYOUT_ARCHITECTURE.md`; senaryolar: `PEDITREE_STRESS_TEST_MATRIX.md`; standart: `PEDITREE_CLINICAL_REQUIREMENTS.md`.

| Faz | İçerik | Çözdüğü bulgular | Kabul kriteri | Durum |
|---|---|---|---|---|
| 1 | Denetim, ölçüm altyapısı (okunabilirlik dedektörleri, klinik fikstürler, motor benchmark'ı), araştırma, mimari karar | LY-3, TS-1 (ölçüm) | dürüst baseline belgelendi | ✅ |
| 2a | Sessiz veri kaybı düzeltmeleri: monoton düzenleme kimliği, yaş/cinsiyet kalıcılığı, ebeveyn silmede diğer ebeveyn bağının korunması, konumsal kimlik yeniden kullanımında eski verinin budanması, cinsiyet düzenleme + çatışma koruması, aynı-cins bütünlük denetimi, engellenen işlemlerin Türkçe bildirimi, dışa aktarmada seçim vurgusu/zoom/boyut, konsola grafik dökümünün kaldırılması | DM-2…DM-8, EX-1, EX-2 (kısmen), PF-1, UX-5 (onay metni) | `dataIntegrityRegressions.test.js` + tüm testler yeşil | ✅ |
| 3 | **PCL yerleşim motoru** (bayrak arkasında): sıralama, karesel merkezleme, kanal şeritli yönlendirme + çizgi atlama, doğrulama döngüsü; ardından varsayılan yapma | LY-1, LY-2, LY-4, LY-5, LY-6, LY-7, RN-7, RN-9 | Mimari dokümanındaki §4 tablosu | sıradaki |
| 2b | Grafiğin gerçek kaynak olması (kararlı kimlikler, sihirbaz = giriş adaptörü), şema v2 + v1 göçü, proje dosyası kaydet/aç, tipli ebeveyn bağları (evlat edinme, ART), ikiz grupları, gebelik sonuçları (P/SAB/TOP/ECT/SB + hafta), consultand, çocuksuzluk/infertilite alanı | DM-1, DM-6 (kalıcı), DM-9, DM-10, EX-4, UX-1 | anlamsal denklik testleri (farklı işlem sıralarıyla aynı aile), kaydet→aç denkliği | planlı |
| 4 | Gösterim standardı: proband "P", consultand, taşıyıcı bölme + lejant, presemptomatik çizgi, ölü doğum, "//", derece etiketi, Romen rakamlı kuşaklar; PDF/baskı çıktısı; çoklu seçim/toplu silme; kurucuya kardeş ekleme; ilişki düzeltme akışları | RN-1…RN-6, RN-8, RN-10, EX-3, UX-5, UX-6, UX-8 | sembol kontrol listesi + E2E | planlı |
| 5 | Arayüz sadeleştirme, akıllı vurgulama/renk katmanı (ek gereksinim), zoom korunması, klavye kısayolları, performans | UX-2, UX-3, UX-4, UX-7 | görev senaryoları + süre ölçümü | planlı |
| 6 | Sürüm doğrulaması: E2E (Playwright — kurulum onayı alınacak), ekran görüntüsü regresyonu, büyük fuzz, dışa aktarma/geri yükleme | TS-3 | `PEDITREE_RELEASE_READINESS.md` | planlı |

**Sıra gerekçesi:** Faz 2a veri kaybını hemen durdurur (küçük, düşük riskli, mimariden bağımsız). Yerleşim motoru
grafiği yalnızca okur; nasıl saklandığından bağımsızdır, bu yüzden en büyük klinik okunabilirlik sorununu çözen Faz 3,
büyük ve riskli kalıcılık yeniden yapılanmasından (Faz 2b) önce yapılabilir. Faz 2b'de eklenecek yeni ilişki türleri
(ikiz, evlat edinme, tek ebeveynden iniş) PCL'nin dönüşüm aşamasına tasarım gereği yer açılarak planlanmıştır.
