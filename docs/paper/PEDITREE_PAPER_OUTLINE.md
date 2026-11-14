# PediTree makalesi: taslak plan ve karşılaştırma tablosu

Başlangıç: 2026-11-14. Çalışma belgesidir: makalenin bölümleri, her bölümün dayandığı kanıt (depodaki dosya
ya da komut), şekiller, kullanılabilirlik çalışmasının tasarımı ve diğer araçlarla karşılaştırma tablosu.

- Makale İngilizce yazılacak; bölüm başlıkları bu yüzden İngilizce.
- Notlar Türkçe.
- **[doğrula]** ile işaretli her bilgi göndermeden önce kaynağından tekrar kontrol edilmeli.

---

## 1. Makale türü ve dergi

**Tür:** yazılım / uygulama makalesi ("software article", "application note"), küçük bir klinisyen
kullanılabilirlik değerlendirmesiyle.

| Seçenek | Uzunluk | Ne ister | Uygunluk |
|---|---|---|---|
| *Journal of Genetic Counseling* (NSGC) | Özgün makale | Klinik kullanım, değerlendirme verisi | Okur kitlesi tam hedef; gösterim standardı burada yayımlandı. Kullanılabilirlik verisi şart |
| *BMC Medical Informatics and Decision Making* — Software | Uzun | Açık depo, lisans, kullanılabilirlik/değerlendirme | Klinik bilişim; açık erişim (ücretli) |
| *JMIR Formative Research* | Orta | Erken aşama değerlendirme (SUS, görev süreleri) | Küçük örneklemli kullanılabilirlik çalışmasına uygun |
| *Bioinformatics* — Application Note | ~2 sayfa | Çalışan araç, açık kaynak, yenilik | Hızlı; pedigreejs ve HaploForge burada. Klinik değerlendirme gerekmez |
| *Journal of Open Source Software* (JOSS) | Çok kısa | Açık depo, test, belge; kod incelemesi | Hızlı, ücretsiz; yazılımın kendisi incelenir. Ayrı bir klinik makaleyle birlikte olabilir |

**Öneri:** kullanılabilirlik çalışması yapılabiliyorsa *J Genet Couns* ya da *BMC Med Inform Decis Mak*.
Yapılamazsa ya da beklerken *Bioinformatics* application note veya JOSS.

Her derginin yazım kuralları (kelime sınırı, yapay zekâ beyanı, veri/kod paylaşımı) göndermeden önce
kendi sayfasından okunmalı **[doğrula]**.

---

## 2. Başlık seçenekleri

- *PediTree: a serverless, bilingual web application for standardized clinical pedigree drawing with
  structure-derived consanguinity*
- *Drawing consanguineous pedigrees correctly: an open-source clinical pedigree tool following the NSGC 2022
  nomenclature*

---

## 3. Abstract iskeleti (yapılandırılmış, ~250 kelime)

- **Background:** Pedigri genetik danışmanın temel aracı. Akraba evliliğinin sık olduğu toplumlarda
  (Türkiye: oran **[kaynak gerekli]**) çok döngülü pedigriler elle ve mevcut araçlarla zor çiziliyor. Ayrıca
  hasta verisinin sunucuya gitmesi bir engel.
- **Methods:**
  - graf tabanlı veri modeli; her işlemden sonra yapısal ve anlamsal doğrulama;
  - kısıt tabanlı katmanlı yerleşim (PCL);
  - akrabalığın yapıdan türetilmesi (derece, F);
  - NSGC 2022 gösterimi ve 2025 düzeltmesi;
  - tarayıcıda, sunucusuz çalışma;
  - Türkçe ve İngilizce arayüz.
- **Results:**
  - otomatik doğrulama: test sayısı, fuzz, klinik fixture'lar;
  - karşılaştırma tablosu;
  - kullanılabilirlik: n, SUS, görev süresi, yapısal hata.
- **Conclusions:** ücretsiz, açık kaynaklı, sunucusuz bir klinik araç; sınırlılıklar (tıbbi cihaz değil).

---

## 4. Bölümler ve dayandıkları kanıt

### 4.1 Introduction
- Pedigrinin klinik rolü; NSGC standartları:
  - Bennett ve ark. 2008, [DOI](https://doi.org/10.1007/s10897-008-9169-9) **[doğrula]**;
  - 2022 güncellemesi, [DOI](https://doi.org/10.1002/jgc4.1621);
  - 2025 düzeltmesi, [DOI](https://doi.org/10.1002/jgc4.2020).
- Akraba evliliği: Türkiye ve bölgedeki sıklık, otozomal resesif hastalık yükü **[kaynak gerekli: güncel
  Türkiye verisi, TNSA ya da derleme]**.
- Mevcut araçlar ve boşluk (Tablo 1, aşağıda §6):
  - araştırma odaklı ya da ticari olmaları;
  - sunucu gerektirmeleri;
  - Türkçe olmamaları;
  - akrabalık şablonlarının olmaması;
  - tablet/telefon desteğinin eski ya da hiç olmaması.
- Amaç cümlesi.

### 4.2 Implementation

| Alt başlık | Anlatılacak | Depodaki kaynak |
|---|---|---|
| Architecture | React + D3 (SVG), Zustand; tek kaynak: graf belgesi (şema v2) | `docs/PEDITREE_DATA_MODEL_V2.md`, `src/graph/document.js` |
| Graph model and integrity | Birey / birlik / biyolojik ve sosyal ebeveynlik / üreme bağı; kalıcı ID; her işlem atomik (`commit`: kopyala → değiştir → sonlandır → doğrula; yeni hata işlemi reddeder) | `src/graph/ops.js`, `validate.js`, `graphIntegrity.js` |
| Consanguinity | Ortak atadan türetilen derece ve F; ortak atası çizilmemiş bildirim "reported_unresolved" kalır, F almaz | `src/graph/kinship.js`, CLAUDE.md kısıt 4 |
| Templates | "Yeni" penceresinde akraba ebeveynli aile: 1.–3. kuzen, bir kuşak kaymalılar, çift kuzen (berdel dahil), taraf klinik diliyle (amca/hala/dayı/teyze çocukları); 164 kombinasyonun her biri doğru derece ve F ile, kural ihlalsiz çizilir | `src/graph/templates.js`, `templates.test.js` |
| Layout | PCL: atomlar → sıralama (çaprazlama maliyeti) → ayrık QP (semboller çakışamaz) → NSGC bağlantıları; düzenlemede yerel yeniden yerleşim (kararlılık) | `docs/PEDITREE_LAYOUT_ARCHITECTURE.md`, `src/layout/pcl/` |
| Notation | NSGC 2022 + 2025 düzeltmesi: gebelik türleri (SAB/TOP/ECT/SB/P), ikizler, evlat edinme, yardımlı üreme (D, G), presemptomatik, taşıyıcı, test sonucu satırları, "//" | `docs/PEDITREE_CLINICAL_NOTATION_SPEC_V1.md`, `docs/release-audit/CLINICAL_NOMENCLATURE_AUDIT.md` |
| Privacy | Sunucu yok; otomatik kayıt yalnızca oturum boyunca (sessionStorage); kalıcı kayıt klinisyenin indirdiği dosya; paylaşımda isimsiz seçenek | `docs/release-audit/SECURITY_PRIVACY_AUDIT.md` |
| Interoperability | PED içe/dışa (pedigri numarası kimlik olarak, isim asla); SVG/PNG, A4 baskı | `src/graph/ped.js` |
| Languages and devices | TR/EN, arayüz dili ve çizim dili ayrı; saklanan veri dilden bağımsız; dokunmatik mod (halka menü, alt sayfa), telefon ve tablet | `src/i18n/`, `english.test.js`, `phone.test.js` |
| Onboarding | Örnek aile üzerinde rehberli tur; hastanın çizimine dokunmaz | `src/components/Tour.jsx` |

### 4.3 Validation (otomatik, şimdiden var)
Her sayı göndermeden önceki son sürümde yeniden ölçülmeli. Komutlar ve şu anki değerler (2026-11-12):

| Ölçüm | Komut | Değer |
|---|---|---|
| Birim ve ekran testleri | `npx vitest run` | 1268 geçti, 2 beklenen başarısızlık |
| Klinik yerleşim fixture'ları | `npm run audit:layout-benchmark` | 13/13 tamamen temiz |
| Rastgele aileler (fuzz) | `npm run audit:layout-fuzz -- --seed 1` ve `--seed 12345` | %0 değişmez ihlali, %0 okunabilirlik ihlali |
| Kuşak tutarlılığı | `node verify-generations.mjs` | anlık görüntü değişmedi |
| İşaret çakışması | `window.__peditreeMarkAudit()`, `__peditreeArrowSweep()` | `[]` (1400, 720, 375 px) |
| Süre | `pclLayout.test.js` | 100 kişi < 500 ms, 300 kişi < 2 s |
| Klinik vakalar | `npm run audit:clinical-benchmark` | CB-01…CB-08 (14–66 kişi) |
| NSGC uyum matrisi | — | `docs/release-audit/CLINICAL_NOMENCLATURE_AUDIT.md` |

Makalede tablo olarak: "değişmez" (invariant) listesi ve her birinin nerede zorlandığı (CLAUDE.md "What Must Not
Be Broken" tablosundan sadeleştirilmiş).

### 4.4 Usability evaluation (yapılacak; §5)

### 4.5 Discussion
- Ne yeni:
  - akrabalığın yapıdan türetilmesi ve hazır şablonlar;
  - ölçülebilir yerleşim güvenceleri;
  - sunucusuz gizlilik;
  - iki dil;
  - mobil kullanım.
- Sınırlılıklar:
  - tıbbi cihaz değil;
  - KI-1: 200–300 kişide çiftlerin ortalanması;
  - 3+ eş;
  - büyük stres graflarında 1,7–2,8 s yerleşim süresi;
  - gerçek cihaz testinin sınırlı kalması;
  - küçük örneklem.
- Gelecek:
  - HPO terimleri;
  - risk modelleriyle bağlantı (BOADICEA/CanRisk biçimi);
  - FHIR.

### 4.6 Availability and requirements (yazılım dergilerinin istediği blok)
- Project name: PediTree.
- Home page: https://peditree.netlify.app.
- Source code: GitHub deposu (herkese açık yapılacak) + Zenodo DOI.
- Operating system: platformdan bağımsız (tarayıcı).
- Programming language: JavaScript.
- Licence: Apache-2.0 (`LICENSE`, `package.json`).
- Any restrictions to use by non-academics: yok.

### 4.7 Declarations
- **Yapay zekâ kullanımı:** geliştirmede ve yazımda hangi araçların, ne amaçla kullanıldığı açıkça yazılmalı.
  Yapay zekâ yazar olamaz; içerikten yazarlar sorumludur.
- **Etik:** kullanılabilirlik çalışması için kurulun görüşü ya da muafiyet yazısı (dergiler ister).
- **Veri:** gerçek hasta verisi kullanılmadı; vakalar kurgusal (`src/audit/clinicalBenchmark.js`).
- **Çıkar çatışması**, **finansman**.

---

## 5. Kullanılabilirlik çalışması (taslak tasarım)

- **Katılımcılar:**
  - 8–12 kişi: tıbbi genetik uzmanı/asistanı, pediatrist, genetik danışman;
  - PediTree'yi daha önce görmemiş olmalı.
- **Hazırlık:** yalnızca rehberli tur, başka yardım yok.
- **Görevler:** yazılı vaka öyküsünden pedigri çizmek.
  1. Rutin üç kuşak (CB-01 benzeri, ~14 kişi).
  2. Birinci kuzen ebeveynler, iki etkilenmiş kardeş, ölü doğum (CB-02 benzeri).
  3. Evlat edinilmiş proband ve üvey kardeş (CB-07 benzeri) ya da yardımlı üreme.
  - İsteğe bağlı: aynı vakalardan biri tablette ya da telefonda.
- **Ölçümler:**
  - görev süresi;
  - **yapısal hata**: çizilen pedigri PED/proje dosyası olarak alınır ve referans grafla otomatik
    karşılaştırılır (yanlış ebeveyn, eksik kişi, yanlış cinsiyet/durum, akrabalık derecesi). Bu, el ile
    puanlamadan daha nesnel ve makalenin güçlü bir yanı olur. Karşılaştırma betiği yazılmalı;
  - SUS (System Usability Scale); yorumu için Bangor ve ark. 2008,
    [DOI](https://doi.org/10.1080/10447310802205776) **[doğrula]**;
  - kısa açık uçlu görüşme.
- **Karşılaştırma (isteğe bağlı):** aynı vakaları kâğıtta ya da katılımcının alışık olduğu araçta çizmek,
  sıra dengelenerek (counterbalanced).
- **Analiz:** küçük örneklem için tanımlayıcı istatistik (medyan, IQR). Karşılaştırma yapılırsa eşleştirilmiş
  Wilcoxon.
- **Gizlilik:** vaka öyküleri kurgusal, gerçek hasta yok. Kayıt yalnızca süre, dosya ve anket.

---

## 6. Tablo 1: diğer araçlarla karşılaştırma (taslak)

İşaretler:
- ✓: var;
- ✗: yok;
- ~: kısmen;
- ?: belgelenmemiş ya da kontrol edilmedi.

Rakip araçlar için her hücre göndermeden önce aracın güncel sayfası ve yayınıyla doğrulanmalı **[doğrula]**.
Tablet bilgileri ve kaynaklar: `docs/PEDITREE_COMPARISON_NOTES.md`. Bir aracın belgelemediği özelliği "yok" diye
yazmamak gerekir; "?" ya da "belgelenmemiş" kalmalı.

| Özellik | PediTree | pedigreejs | QuickPed | Open Pedigree / PhenoTips | Proband (CHOP) | Progeny | CeGaT Designer |
|---|---|---|---|---|---|---|---|
| Kurulumsuz, tarayıcıda | ✓ | ✓ | ✓ | ✓ | ✗ (iPad uygulaması) | ~ (sunuculu) | ✗ (masaüstü) |
| Hasta verisi cihazda kalır, sunucu yok | ✓ | ? | ? (Shiny sunucusu) | ✗ (sunuculu kurulum) | ? | ✗ | ✓ |
| Açık kaynak (lisans) | ✓ Apache-2.0 | ✓ GPL-3 | ✓ (pedsuite) | ✓ LGPL / ticari | ✗ | ✗ | ✗ |
| Ücretsiz | ✓ | ✓ | ✓ | ~ | ✓ | ✗ | ✓ |
| NSGC 2022 (+2025 düzeltmesi) gösterimi | ✓ | ? | ? | ? | ✗ (2014, öncesi) | ? | ? |
| Akrabalığın yapıdan otomatik bulunması | ✓ derece | ? | ✓ | ✓ | ? | ? | ? |
| Akrabalı içerme katsayısı F / kinship | ✓ | ? | ✓ | ? | ? | ? | ? |
| Akraba evliliği şablonları | ✓ (164 kombinasyon, berdel) | ? | ~ (hazır pedigriler) | ? | ? | ? | ? |
| Yardımlı üreme (donör, taşıyıcı anne) | ✓ | ? | ? | ? | ? | ? | ? |
| İkiz türleri (MZ/DZ/bilinmeyen) | ✓ | ? | ? | ✓ | ? | ✓ | ? |
| Evlat edinme (içeri/dışarı) | ✓ | ? | ? | ✓ | ? | ✓ | ? |
| PED içe/dışa | ✓ | ~ | ✓ | ✓ | ? | ? | ? |
| Otomatik yerleşim, ölçülmüş güvencelerle | ✓ (fuzz, benchmark) | ~ (ağaç tabanlı) | ✓ (kinship2/pedtools) | ✓ | ✗ (elle) | ✓ | ? |
| Türkçe arayüz | ✓ (TR/EN) | ✗ | ✗ | ? | ✗ | ? | ✗ |
| Telefon / tablet | ✓ (gerçek cihaz testi sürüyor) | ? | ? | ? | ✓ iPad | ~ (eski iPad uygulaması) | ✗ |
| Güncel bakım (son 2 yıl) | ✓ | ? | ? | ? | ✗ (2017) | ? | ? |
| Hakemli yayın | — (bu makale) | Carver 2018 | Vigeland 2022 | ? | J Genet Couns 2018 | — | — |

**Doldurmak için yapılacaklar:**
- Her aracı açıp aynı kısa kontrol listesiyle denemek, tarih ve sürüm not etmek.
- Gerekirse tabloyu küçültmek: dergiler genelde 6–10 satırlık bir tablo ister. Ayırt edici satırları tutmak
  yeterli: sunucusuz, açık kaynak, NSGC 2022, akrabalık + F, şablonlar, Türkçe, mobil.

### Kaynaklar (PubMed'den)
- Carver T ve ark. 2018. pedigreejs: a web-based graphical pedigree editor. *Bioinformatics* 34(6):1069–1071.
  [DOI](https://doi.org/10.1093/bioinformatics/btx705)
- Vigeland MD. 2022. QuickPed: an online tool for drawing pedigrees and analysing relatedness. *BMC
  Bioinformatics* 23:220. [DOI](https://doi.org/10.1186/s12859-022-04759-y)
- Garcia-Giordano L ve ark. 2020. genoDraw. *AMIA Annu Symp Proc* 2019:457–466. PMC7153108 (DOI yok).
- Tekman M ve ark. 2017. HaploForge. *Bioinformatics* 33(24):3871–3877.
  [DOI](https://doi.org/10.1093/bioinformatics/btx510)
- Mancosu G ve ark. 2003. PedNavigator. *Bioinformatics* 19(5):669–670.
  [DOI](https://doi.org/10.1093/bioinformatics/btg050)
- Chen ve ark. 2026. *JCO Clin Cancer Inform* 10:e2500332 (pedigreejs kullanan uygulama).
  [DOI](https://doi.org/10.1200/CCI-25-00332)

---

## 7. Şekiller

1. **Genel görünüm:** gerçek olmayan bir aile; halka menü ve sağ panel açık.
2. **Mimari:** graf belgesi → işlem (`commit`) → sonlandırma (kuşak, akrabalık) → doğrulama → PCL yerleşim →
   SVG. Kutu-ok şeması.
3. **Akraba evliliği:**
   - "Yeni" penceresi (ilişki adı, taraf, F, önizleme);
   - ortaya çıkan pedigride çift çizgi ve derece.
4. **Gösterim sayfası:** işaret ailesinin çizimi (her sembol ve işaret; `buildMarkFamily`); NSGC 2022 terimleriyle
   etiketli.
5. **Cihazlar:** aynı aile bilgisayar, tablet ve telefonda.
6. **Kullanılabilirlik sonuçları:** görev süresi ve SUS dağılımı.

---

## 8. Göndermeden önce yapılacaklar

| # | İş | Durum |
|---|---|---|
| 1 | Gerçek cihaz turu (iPhone/iPad Safari, Chrome, Safari, Firefox) | sırada (kullanıcı) |
| 2 | 2–3 meslektaş yardımsız kullanır (ön deneme) | bekliyor |
| 3 | GitHub deposunu herkese açmak; README'de kurulum, test, lisans | bekliyor |
| 4 | Sürüm etiketi (ör. v1.0.0) ve Zenodo DOI | bekliyor |
| 5 | Kullanılabilirlik çalışması için kurul görüşü/muafiyet | bekliyor |
| 6 | Vaka öyküleri, referans graflar ve otomatik yapısal karşılaştırma betiği | yapılabilir (kod tarafı) |
| 7 | Tablo 1'deki her hücrenin doğrulanması | bekliyor |
| 8 | Türkiye akraba evliliği sıklığı için güncel kaynak | bekliyor |
| 9 | Sayıların son sürümde yeniden ölçülmesi (§4.3) | yazım sırasında |
| 10 | Dergi seçimi ve yazım kuralları | bekliyor |
| 11 | İsteğe bağlı: medRxiv ön baskı | — |
