# Peditree Klinik Pedigri Notasyon Şartnamesi — Sürüm 1 (taslak)

Tarih: 2026-10-19 · Dal: `stabilization/clinical-layout` · İncelenen kod: `076710b`
Durum: **taslak — klinik onay bekliyor.** Bu belge kod değiştirmez; yalnız kuralları, mevcut durumu ve onay
gerektiren kararları kayda geçirir.

## 0. Durum etiketleri

| etiket | anlamı |
|---|---|
| **ONAYLI** | Kullanıcı (klinisyen) tarafından onaylanmış kural (2026-10-19). Üretim davranışı buna uymak zorundadır. |
| **STANDART ÖZETİ — DOĞRULAMA BEKLİYOR** | NSGC kuralının bu belgedeki özeti. Orijinal yayınla karşılaştırılıp kullanıcı onaylayana kadar bağlayıcı değildir. |
| **KARAR GEREKLİ** | Klinik tercih; kullanıcı kararı olmadan uygulanmaz. |

## 1. Temel ilke (ONAYLI)

> Peditree'nin PCL yerleşim motoru, klinik sembollerin ve bağlantıların anlamını değiştiremez. Algoritma yalnızca
> yerleşim, koordinat ve klinik gösterimle uyumlu bağlantı yönlendirmesi yapabilir.

Sorumluluk ayrımı:

| katman | karar verdiği | karar veremediği |
|---|---|---|
| Grafik modeli (`src/graph/*`) | kim kimin biyolojik / sosyal çocuğu, partneri; klinik veriler | — |
| Çizici (`PedigreeCanvas.jsx`) | bir modelin hangi sembol ve çizgi türüyle gösterileceği (bu şartnameye göre) | ilişkinin kendisi |
| Yerleşim (`src/layout/pcl/*`) | x/y koordinatları, sıra (doğum sırası kuralları içinde), çizgi yolları, atlamalar | sembol, çizgi türü (düz/kesikli/çift), ilişki |

Her bağlantı çizgisi sahibini taşır (`unionId`, çocuk çizgisinde `childId`); yerleşim bu sahipliği değiştiremez.

## 2. Onaylı kurallar

| no | kural | mevcut uygunluk | kanıt |
|---|---|---|---|
| R1 | Biyolojik ebeveyn–çocuk ilişkisi **düz** iniş çizgisiyle gösterilir. | **Uygun.** Biyolojik bağ (`parentChildRelationships`) her zaman düz çizilir. | `PedigreeCanvas.jsx` `drawStroke` (kesikli yalnız `descentKind` varsa); `src/layout/pcl/index.js` `markSocialDescent` |
| R2 | Evlat edinen ebeveyn–çocuk ilişkisi **kesikli** iniş çizgisiyle gösterilir. | **Uygun** (evlat edinme için). Not: koruyucu aile / üvey / vasi bağları da şu an kesikli çiziliyor — bu, onaylı kuralın ötesinde (bkz. K4). | CB-07 `III-3`: kesikli çocuk çizgisi |
| R3 | Evlat edinilmiş bireyin sembolü uygun **köşeli parantez** notasyonuyla gösterilir. | **Uygun (2026-10-23).** İçeri evlat edinilen çocuğun sembolü köşeli parantez içinde. | `reports/notation-audit/CB-07-III-3-adoption.svg` |
| R4 | Pedigri numaraları ve diğer etiketler bağlantı çizgileriyle **çakışmaz**. | **Uygun (2026-10-23).** Numara sembolün sol üst köşesinde (çizgi geçiyorsa sağ üst); 21 fixture'da çizgi / sembol / etiket çakışması 0. Önceki durum §5'te. | 21 klinik fixture'da ölçüldü |
| R5 | Hiçbir çizgi yanlış ebeveynlik, partnerlik veya kardeşlik ilişkisi **ima edemez**. | **Büyük ölçüde uygun.** Sahiplik / değişmez / bağlantı okunabilirliği ihlali 0; kalan riskler §4.6, §4.7 ve K2'de. | `clinicalBenchmark.test.js`, `ki8PartnerSide.test.js`, `connectorReadability` |
| R6 | Yerleşim optimizasyonu klinik ilişki **anlamını değiştiremez**. | **Uygun (mimari).** Yerleşim yalnız sıra ve koordinat üretir; doğum sırası kesin kural; KI-8 alternatifleri yalnız eşin tarafını değiştirir. | `structure.js`, `layoutInvariants`, `ki2Stability.test.js` |

## 3. Kaynak standart ve doğrulama durumu

Bu belgedeki standart özetleri aşağıdaki kaynaklara dayanır. **Bu oturumda orijinal makalelerin tam metnine
erişilemedi** (PMC'deki 1995 metni taranmış PDF; 2008 ve 2022 yayınları açık erişimde değil). Bu nedenle §4'teki her
"Standart" satırı **doğrulama bekliyor** olarak işaretlidir.

1. Bennett RL ve ark. *Recommendations for standardized human pedigree nomenclature.* Am J Hum Genet.
   1995;56(3):745–752. PMID 7887430 (ayrıca J Genet Couns 1995).
2. Bennett RL, French KS, Resta RG, Doyle DL. *Standardized human pedigree nomenclature: update and assessment of the
   recommendations of the NSGC.* J Genet Couns. 2008;17(5):424–433. https://doi.org/10.1007/s10897-008-9169-9
3. Bennett RL, French KS, Resta RG, Austin J. *Practice resource-focused revision: Standardized pedigree nomenclature
   update centered on sex and gender inclusivity.* J Genet Couns. 2022;31(6):1238–1248.
   https://doi.org/10.1002/jgc4.1621 — özetinde açıkça: cinsiyet/toplumsal cinsiyet gösteriminin netleştirilmesi ve
   **taşıyıcılık gösteriminin değiştirilmesi** önerilir. Taşıyıcılıkla ilgili her kural bu yayına karşı doğrulanmalıdır.
4. Türkçe özet: Çitli Ş, Ayaz A. *Pedigri Çizimi ve Pedigri Analizinde Temel Prensipler.* Tıbbi Genetik Derneği, 2016
   (NSGC 2008 özeti) — `örnek/2018117135147.pdf`. Önceki bir oturumda görsel olarak okunmuş ve
   `PEDIGREE_CLINICAL_SYMBOL_REFERENCE_NOTES.md` dosyasına kaydedilmiş; bu oturumda PDF yeniden görselleştirilemedi
   (ortamda PDF çizici yok).

## 4. Mevcut uygulamanın denetimi

Her başlıkta: (1) standart kuralı, (2) mevcut davranış, (3) uygunluk, (4) eksik/hatalı nokta, (5) önerilen düzeltme,
(6) kabul testleri, (7) klinik onay gereksinimi. Önerilen düzeltmelerin hiçbiri uygulanmadı.

### 4.1 Erkek, kadın, bilinmeyen cinsiyet

1. **Standart (doğrulama bekliyor):** erkek kare, kadın daire, bilinmeyen / belirtilmemiş elmas [1,2]. 2022 revizyonu
   sembollerin cinsiyet kimliğini, doğumda atanan cinsiyetin sembol altında ayrıca belirtilebileceğini ve
   toplumsal cinsiyet çeşitliliği için kapsayıcı kullanımı netleştirir [3].
2. **Mevcut:** `sex: male|female|unknown` → kare / daire / elmas (`PedigreeCanvas.jsx`).
3. **Uygunluk:** temel üç sembol için uygun; 2022 kapsamındaki ayrım (kimlik / atanan cinsiyet) modelde yok.
4. **Eksik:** cinsiyet kimliği ile doğumda atanan cinsiyetin ayrımı; partner kuralı (karşı cins zorunluluğu) 2022
   önerileriyle birlikte değerlendirilmeli (CLAUDE.md kuralı 8, ürün kararı bekliyor).
5. **Öneri:** 2022 yayını doğrulandıktan sonra ayrı bir model kararı.
6. **Test:** otomatik — her `sex` değeri için doğru SVG şekli (rect / circle / elmas path); görsel — sembol tablosu.
7. **Onay:** gerekli (K8).

### 4.2 Etkilenmiş, taşıyıcı, vefat etmiş

1. **Standart (doğrulama bekliyor):** etkilenmiş = dolu sembol; birden fazla durum = bölmeli dolgu + lejant; vefat =
   sembolün dışına taşan çapraz çizgi, altında "d." ve yaş; taşıyıcı (hastalık beklenmez) = ortada nokta;
   asemptomatik/presemptomatik = ayrı gösterim [1,2]. **2022 revizyonu taşıyıcılık gösterimini değiştirir** [3].
2. **Mevcut:** `affected` → tam dolgu; `carrier` → **sol yarı dolu** desen (`carrier-half`); `conditions[]` →
   yalnız tam dolgu + "Durum / Tanı Kayıtları" lejantı (bölmeli dolgu yok); vefat → 4 px dışa taşan çapraz çizgi; yaş
   yalnız `ageAtDeath` varsa "d.X".
3. **Uygunluk:** etkilenmiş ve vefat uygun; **taşıyıcı uygun değil** (kodun kendi yorumu da "carrier-dot correction"
   işinin bekletildiğini söylüyor); çoklu fenotip eksik.
4. **Eksik/hatalı:** yarım dolgu, bazı kaynaklarda presemptomatik taşıyıcıya ayrılmış bir görünümdür; kaynaklar arasında
   çelişki var (repo notu yarım dolgu, NSGC 2008 bilgisi dikey çizgi) — doğrulanmadan seçilemez. Etkilenmiş ve vefat
   etmiş bireyde koyu çizgi koyu dolgunun üstünde yalnız köşelerde görünüyor
   (`reports/notation-audit/CB-05-II-3-affected-deceased.svg`).
5. **Öneri:** 2022 yayını doğrulanınca taşıyıcı / presemptomatik / çoklu fenotip gösterimini birlikte belirleyin
   (taslak: `docs/notation/mockups/03-carrier-phenotypes.svg`); vefat çizgisinin dolgu üstünde görünürlüğü için
   `09-deceased-affected.svg`.
6. **Test:** otomatik — `carrier` / `affected` / çok durumlu bireyde beklenen dolgu deseni ve lejant girdisi; vefat
   çizgisinin sembol sınırını aştığı; görsel — her kombinasyon için sembol tablosu.
7. **Onay:** gerekli (K5, K9).

### 4.3 Proband

1. **Standart (doğrulama bekliyor):** proband = sol altta ok + "P"; danışmanlık için başvuran (danışan, consultand) =
   yalnız ok [1,2]; Türkçe özette iki ayrı satır [4].
2. **Mevcut:** `proband: true` → sol alt ok, "P" yok; danışan kavramı modelde yok.
3. **Uygunluk:** kısmen; mevcut çizim standarttaki **danışan** görünümüne denk düşüyor.
4. **Eksik:** "P" etiketi; ayrı danışan alanı (`PEDIGREE_V0_3A_1_DEFERRED_NOTES.md` §2'de zaten bekleyen iş).
5. **Öneri:** oka "P" eklenmesi; ayrı `consultand` alanı (model önce, sonra çizici).
6. **Test:** otomatik — proband'da ok + "P" metni, danışanda yalnız ok, tam olarak bir proband (doğrulama kuralı 6);
   görsel — sol alt köşede ok ve etiketin başka çizgiyle çakışmaması.
7. **Onay:** gerekli (K10).

### 4.4 Biyolojik ve evlat edinen ebeveynlik

1. **Standart (doğrulama bekliyor):** evlat edinilen birey köşeli parantez içinde; içeri evlat edinilmişse evlat edinen
   ebeveynlerden kesikli çizgi; dışarı evlat verilmişse biyolojik ebeveynlerden düz çizgi; akraba tarafından evlat
   edinmede iki aileye bağlantı [1,2,4].
2. **Mevcut:** yalnız sosyal bağı olan çocuk sosyal ebeveynlerin altında, kesikli iniş çizgisiyle (`displayParentage`,
   `descentKind`); köşeli parantez yok; "dışarı evlat verilmiş" ve "biyolojik + evlat edinen aile birlikte" gösterimi
   yok (çocuk en fazla bir biyolojik birliğe bağlı, sosyal bağ yalnız biyolojik bağ yoksa çizilir).
3. **Uygunluk:** R1 ve R2 uygun; **R3 uygun değil**; iki aileli gösterim yok.
4. **Eksik:** köşeli parantez (R3); dışarı evlat verme; iki aileli gösterim (CLAUDE.md kuralı 2 ile etkileşim:
   biyolojik bağ tek kalır, sosyal bağ ayrı tür — bu model izin verir, çizici henüz çizmez).
5. **Öneri:** köşeli parantez (R3, onaylı; uygulama ayrı dilimde); iki aileli gösterim için K3 kararı.
6. **Test:** otomatik — sosyal bağlı her çocukta parantez; biyolojik çizginin düz, evlat edinme çizgisinin kesikli
   olduğu; parantezin hiçbir çizgiyle ve etiketle çakışmadığı; görsel — CB-07 önce/sonra.
7. **Onay:** R3 onaylı; iki aileli gösterim ve dışarı evlat verme için gerekli (K3).

### 4.5 Üvey ve sosyal ebeveynlik

1. **Standart (doğrulama bekliyor):** NSGC'de evlat edinme dışında üvey / koruyucu aile / vasi için ayrı bir sembol
   bulunduğunu bu oturumda doğrulayamadım; üvey ilişkiler genellikle partnerlik çizgisiyle ifade edilir.
2. **Mevcut:** model `socialParentLinks.kind ∈ {adoptive, foster, step, guardian}`; çizimde tür ayrımı yok — yalnız
   sosyal bağı olan her çocuk kesikli çizgiyle; biyolojik bağı da olan üvey çocukta sosyal bağ çizilmez (CB-07 üvey
   oğul yalnız biyolojik ebeveynlerinin altında).
3. **Uygunluk:** belirsiz; evlat edinme dışındaki türler onaylı kuralın kapsamında değil.
4. **Eksik:** koruyucu / vasi / üvey için türün okunabilir olması; kesikli çizginin evlat edinme dışındaki kullanımı
   onaylı değil.
5. **Öneri:** K4 kararı (taslak `08-step-social.svg`).
6. **Test:** karar sonrası tanımlanacak.
7. **Onay:** gerekli (K4).

### 4.6 Akraba evliliği

1. **Standart (doğrulama bekliyor):** partnerler arasında çift ilişki çizgisi; derece pedigriden anlaşılmıyorsa çizginin
   üstünde belirtilebilir [1,2].
2. **Mevcut:** `consanguineous` birlik her zaman siyah çift çizgi (bildirilmiş ama yapısal desteği olmayan da);
   ortak ata grafikte olmalı (CLAUDE.md kuralı 4); derece metni çizilmiyor; eşler bitişik değilse çift çizgi şeritle
   başka kişilerin üstünden, atlamalarla geçiyor.
3. **Uygunluk:** çift çizgi uygun; okunabilirlik sorunu var.
4. **Eksik/risk:** bilinen doğum sırası kuzenleri uzak uçlara koyunca 350–600 px'lik çift çizgi şeritleri ve ebeveynlerin
   çocuklarının üstünde kayık durması (CB-02, CB-03, CB-06); CB-08'de kuzenleri bitişik tutmak için iniş çizgileri
   atlamalarla kesişiyor. Derece metni (gerekirse) yok.
5. **Öneri:** K1 ve K2 kararları (taslak `07-consanguinity-routing.svg`).
6. **Test:** otomatik — çift çizginin yalnız `consanguineous` birlikte; her akraba evliliğinde ortak atanın grafikte
   olduğu (mevcut); çift çizginin hiçbir sembolün içinden geçmediği (mevcut değişmez); görsel — benchmark
   CB-02/03/06/08.
7. **Onay:** gerekli (K1, K2).

### 4.7 Boşanma, ayrılık, çoklu partnerlik

1. **Standart (doğrulama bekliyor):** sona ermiş ilişki ilişki çizgisinde kesme işaretiyle; çoklu partner ayrı ilişki
   çizgileriyle, gerekirse sırayla numaralandırılarak [1,2].
2. **Mevcut:** `status: separated` → tek eğik çizgi, `divorced` → çift eğik çizgi; `together` → işaretsiz. Çoklu
   partner ayrı çizgilerle; numaralandırma yok. KI-8 sonrası partnerlik çizgisi başka partnerin üstünden geçmiyor
   (kaçınılmaz durumlar hariç: 3+ partner, iki kız kardeşle evlilik).
3. **Uygunluk:** büyük ölçüde uygun; tek/çift kesme ayrımının standarttaki karşılığı doğrulanmalı.
4. **Eksik:** partner sırası numarası; ilişkisi sona eren birlik için "vefat eden eş" durumu modelde serbest metin
   (`status` doğrulanmıyor).
5. **Öneri:** `status` değer kümesinin doğrulanması; kaçınılmaz "partnerin üstünden çizgi" için K2 kapsamında politika.
6. **Test:** otomatik — her `status` için beklenen kesme sayısı; `lineOverOwnPartner` (mevcut ölçüt); görsel — CB-04
   (`reports/notation-audit/CB-04-II-4-divorce.svg`).
7. **Onay:** tek/çift kesme anlamı ve numaralandırma için gerekli (K2 içinde).

### 4.8 Düşük, ölü doğum, gebelik sonlandırılması

1. **Standart (doğrulama bekliyor):** spontan abortus = küçük üçgen; gebelik sonlandırılması = çapraz çizgili küçük
   üçgen; ölü doğum = cinsiyet sembolü + çapraz çizgi + "SB" ve gebelik haftası; ektopik = "ECT"; gebelik haftası /
   bulgu sembol altında [1,2,4]. CLAUDE.md kuralı 5: düşük, ölü doğum ve sonlandırma ayrı tür ve ayrı semboldür.
2. **Mevcut:** `pregnancyLoss` → küçük boş üçgen; `stillbirth` → **küçük (14 px) sembol + tam X**; sonlandırma ve
   ektopik modelde yok; gebelik haftası alanı yok.
3. **Uygunluk:** düşük uygun; **ölü doğum uygun değil**; **sonlandırma eksik** (kural 5 modelde karşılanmıyor).
4. **Kanıt:** `reports/notation-audit/CB-02-IV-6-stillbirth.svg` (cinsiyeti bilinmeyen ölü doğum iki üst üste elmas
   ve X gibi görünüyor).
5. **Öneri:** model önce (sonlandırma türü, gebelik haftası), sonra çizici; ölü doğum standart görünümü (taslak
   `04-pregnancy-outcomes.svg`).
6. **Test:** otomatik — üç türün üç farklı SVG gösterimi; gebelik haftası metninin sembol altında ve çizgiyle
   çakışmadan; görsel — sembol tablosu.
7. **Onay:** gerekli (K11).

### 4.9 İkizler

1. **Standart (doğrulama bekliyor):** ikizlerin çocuk çizgileri kardeşlik çizgisindeki tek noktadan ayrılır;
   monozigotikte aralarında yatay çubuk, dizigotikte çubuk yok, zigositesi bilinmeyende "?" [1,2,4].
2. **Mevcut:** modelde ve çizicide **yok**.
3. **Uygunluk:** eksik.
4. **Eksik:** model alanı (çoklu gebelik), çizici, yerleşimde ikizlerin bitişik tutulması (doğum sırası içinde).
5. **Öneri:** model önce (taslak `06-twins.svg`).
6. **Test:** otomatik — ikiz grubunun tek bir dallanma noktası; MZ'de çubuk; ikizlerin bitişikliği; görsel — tablo.
7. **Onay:** gerekli (K12).

### 4.10 Pedigri numaraları ve klinik etiketler

1. **Standart (doğrulama bekliyor):** kuşaklar Roma rakamıyla, bireyler kuşak içinde soldan sağa Arap rakamıyla
   numaralandırılır [1,2]; etiketlerin yeri standartta ayrıntılandırılmamış — okunurluk esas (R4 onaylı).
2. **Mevcut:** her sembolün üstünde ortada "II-3" biçiminde birleşik numara (10 px); altında yaş (11 px), etiket,
   durum, not anahtarı; kuşak rakamı sol kenarda ayrıca yok.
3. **Uygunluk:** numaralandırma mantığı uygun; **R4 uygun değil** (§5).
4. **Eksik:** numara–çizgi çakışması (her iniş çizgisi olan bireyde); sol kenarda kuşak numaraları yok (birleşik "II-3"
   bunu karşılayabilir — tercih).
5. **Öneri:** numaranın iniş çizgisinden uzağa alınması (taslak `01-pedigree-number-placement.svg`, K13).
6. **Test:** otomatik — her metin kutusunun hiçbir bağlantı segmentiyle kesişmediği (§5'teki ölçüm testleştirilir);
   görsel — benchmark galerisi.
7. **Onay:** R4 onaylı; yerleşim seçeneği için gerekli (K13).

## 5. Görev 3 — CB-07 evlat edinme örneği ve etiket / çizgi çakışmaları

**Neden kesikli çizgi doğru:** CB-07'de proband yalnız sosyal (evlat edinme) bağıyla ailede; `displayParentage`
onu evlat edinen ebeveynlerin altına koyuyor, `markSocialDescent` çocuk çizgisine `descentKind = 'adoptive'` veriyor,
çizici bunu kesikli çiziyor (R1, R2).

**Çakışmanın kök nedeni:** pedigri numarası sembolün **üstünde ve ortada** çiziliyor (`PedigreeCanvas.jsx`, metin
`y = -(sz + 8)`, `text-anchor: middle`). Çocuk çizgisi ise sembolün **üst ortasında** bitiyor (`routing.js`,
`childStem`: `x = xPos[c]`, `y2 = yPos[c] − yarım sembol`). İki öğe aynı x'te üst üste düşüyor; kesikli de olsa düz de
olsa çizgi numaranın içinden geçiyor (KI-4 olarak kayıtlı).

**Köşeli parantezin eksik olma nedeni:** çizici sosyal bağ türünü yalnız çizgi stili için kullanıyor; sembol
çiziminde (`nodeGroups.each`) sosyal bağa bakan bir dal yok. Model bilgisi var (`socialParentLinks`), çizim yok.

**Diğer fixture'lardaki ölçüm** (canlı uygulamada, tarayıcının metin kutuları `getBBox` ile, tüm bağlantı
segmentlerine karşı; 2026-10-19):

| vaka | numara sayısı | çizgiyle kesişen numara | sembol altı etiket kesişimi |
|---|---|---|---|
| CB-01 … CB-08 | 14 / 24 / 30 / 18 / 25 / 40 / 14 / 66 | 9 / 16 / 21 / 10 / 17 / 27 / 8 / 48 | 0 |
| CS-01 … CS-13 | 7 / 46 / 13 / 14 / 14 / 13 / 13 / 50 / 28 / 19 / 12 / 15 / 8 | 3 / 35 / 7 / 10 / 10 / 8 / 7 / 36 / 16 / 14 / 8 / 10 / 4 | 0 |

Kesişen numara sayısı, her vakada **çizilmiş ebeveyni olan kişi sayısına eşit** — yani sorun rastlantısal değil,
sistematik. Sembol altındaki yaş / etiket / not anahtarı hiçbir vakada çizgiyle kesişmiyor. CB-07'de kesikli
çizgiyle kesişen tek numara `III-3` (proband).

**Gerçek SVG kesitleri** (uygulamanın kendi dışa aktarımından, yalnız görüntü kutusu daraltılarak):

| dosya | gösterdiği |
|---|---|
| `reports/notation-audit/CB-07-III-3-adoption.svg` | kesikli evlat edinme çizgisi `III-3` içinden geçiyor; köşeli parantez yok |
| `reports/notation-audit/CB-02-IV-4-proband.svg` | düz çizgi proband numarasının içinden; ok "P"siz |
| `reports/notation-audit/CB-02-IV-6-stillbirth.svg` | ölü doğum: küçük elmas + X |
| `reports/notation-audit/CB-05-II-5-carrier.svg` | taşıyıcı: yarım dolgu |
| `reports/notation-audit/CB-05-II-3-affected-deceased.svg` | etkilenmiş + vefat: çizgi dolgu üstünde yalnız köşelerde |
| `reports/notation-audit/CB-04-II-4-divorce.svg` | boşanma çift kesme, taşıyıcı anne |

## 6. Onay gerektiren kararlar

Taslak SVG'ler `docs/notation/mockups/` altında (`python3 docs/notation/generate_mockups.py` ile üretilir). Hepsi
"taslak — klinik onay bekliyor" damgalı; hiçbiri üretimde değil.

| no | konu | standart (doğrulama bekliyor) | mevcut | seçenekler (taslak) |
|---|---|---|---|---|
| K1 | **Bilinen doğum sırasının görsel olarak değiştirilmesi** | doğum sırası soldan sağa, "mümkün olduğunda" [1,2] | kesin kural; hiç değiştirilmez | (a) kesin kural kalır; (b) yalnız akraba evliliğindeki eşleri bitişik tutmak için esnetilir ve sıra yaş/numarayla okunur (`07`) |
| K2 | **Karmaşık akraba evliliklerinde çizgi yönlendirme** | çift çizgi; yönlendirme kuralı yok | şerit + atlama; CB-08'de iniş çizgisi kesişimi seçilebiliyor | (a) çift çizgi şeridi her zaman iniş çizgisi kesişiminden önce; (b) mevcut maliyet dengesi; (c) derece metni çizgi üstünde |
| K3 | **Biyolojik ve evlat edinen ailelerin birlikte gösterimi** | akraba tarafından evlat edinmede iki bağ; dışarı evlat verme [1,2,4] | yalnız sosyal bağı olan çocuk sosyal ailenin altında | (a) yalnız içeri evlat edinme (mevcut + parantez); (b) dışarı evlat verme eklenir; (c) iki ailede birden (`02` D) |
| K4 | **Üvey ve sosyal ebeveynlik notasyonu** | evlat edinme dışı tür için standart sembol doğrulanamadı | her sosyal tür kesikli | (a) kesikli yalnız evlat edinme, diğerleri yalnız partnerlik çizgisiyle; (b) kesikli + tür etiketi; (c) mevcut (`08`) |
| K5 | **Taşıyıcılık ve çoklu fenotip** | 2022 revizyonu taşıyıcılık gösterimini değiştirir [3]; çoklu durum bölmeli dolgu + lejant | taşıyıcı yarım dolgu; çoklu durum yalnız tam dolgu | (a) ortada nokta; (b) dikey çizgi (presemptomatik); (c) bölmeli dolgu + zorunlu lejant (`03`) — 2022 metniyle doğrulama şart |
| K6 | **Karmaşık yardımcı üreme ilişkileri** (donör, taşıyıcı anne, embriyo) | 1995/2008 ART bölümü [1,2]; 2025 yazışması embriyo evlat edinme ve gestasyonel taşıyıcıyı tartışıyor (PMID 40114454) | modelde yok | önce model kapsamı kararı; taslak üretilmedi (standart metni doğrulanmadan çizmek yanıltıcı olur) |
| K7 | **Çok sayfalı pedigri çıktısı** | standart kural yok | tek SVG/PNG; 40 kişide en küçük metin 4,4 pt, 66 kişide 1,9 pt (A4) | (a) tek sayfa + minimum metin eşiği; (b) çok sayfa (bağlantı işaretleriyle); (c) probanda odaklı kısmi görünüm |
| K8 | Cinsiyet kimliği / atanan cinsiyet (2022) | [3] | yalnız `sex` | 2022 metni doğrulanınca |
| K9 | Vefat + etkilenmiş görünürlüğü | çapraz çizgi sembolü aşar | koyu çizgi koyu dolguda kayboluyor | (a) mevcut; (b) dolgu içinde açık renkli çizgi (`09`) |
| K10 | Proband "P" ve danışan | ok + P; danışan yalnız ok [1,2,4] | ok, P yok; danışan yok | (`05`) |
| K11 | Gebelik sonuçları | SAB / TOP / SB / ECT ayrı [1,2,4] | SAB var; SB farklı; TOP, ECT yok | (`04`) |
| K12 | İkizler | MZ / DZ / bilinmeyen [1,2,4] | yok | (`06`) |
| K13 | Pedigri numarasının yeri (R4'ün uygulanışı) | yer belirtilmemiş | üst orta (çizgiyle çakışıyor) | sol üst / sağ üst / sembol altı (`01`) |

## 7. Kabul testleri planı (henüz yazılmadı)

Onay sonrası her kural için:

- **Otomatik (Vitest):** çizici çıktısı üzerinde sembol türü / dolgu / çizgi stili / metin kutusu–segment kesişimi;
  model düzeyinde tür ayrımı (SAB / TOP / SB). Etiket çakışması için §5'teki ölçüm tarayıcı dışında
  çalıştırılabilecek bir metin kutusu tahminiyle testleştirilir (ya da tarayıcı testi altyapısı kararı).
- **Görsel:** `reports/clinical-benchmark/index.html` galerisi (önce/sonra) + her kural için bir sembol tablosu SVG'si,
  klinisyen tarafından imzalanan onay kaydı.
- **Gerileme:** `clinicalBenchmark.test.js`, `ki8PartnerSide.test.js`, `ki2Stability.test.js`, KI-3 fixture'ları.

## 8. Onay kaydı

| tarih | kural / karar | karar | onaylayan |
|---|---|---|---|
| 2026-10-19 | R1–R6 ve temel ilke | onaylandı | kullanıcı (klinisyen) |
| 2026-10-23 | K1 — bilinen doğum sırası | akraba evliliğindeki eş, partnerinin yanında durmak için kardeşliğinin ucuna (yaşa aykırı da olsa) çizilebilir; kullanıcının açıkça girdiği doğum sırası değişmez | kullanıcı (klinisyen) |
| 2026-10-23 | K5 — taşıyıcı | yarım dolgu korunur (mevcut gösterim) | kullanıcı (klinisyen) |
| 2026-10-23 | K10 — proband | proband okuna "P" eklenir (uygulandı); ayrı danışan alanı bekliyor | kullanıcı (klinisyen) |
| 2026-10-23 | §4.7 — ayrılık / boşanma | ikisi de ilişki çizgisinde **tek eğik çizgi** (uygulandı) | kullanıcı (klinisyen) |
| 2026-10-23 | §4.6 — akraba evliliği yapıdan | çizimde ortak atası olan çift (üst kuşaklar birleşiyorsa) **otomatik olarak akraba evliliği** sayılır ve çift çizgiyle çizilir; derece ortak atalardan hesaplanır (`src/graph/kinship.js`, `finalize.js`); aile "akrabalık yok" dese de çizim belirleyicidir (uygulandı) | kullanıcı (klinisyen) |
| | K2–K4, K6–K9, K11–K13 | bekliyor | |
| | §4 "Standart" özetleri (orijinal yayına karşı) | bekliyor | |
