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
| KI-2 | P1 | açık | Düzenleme sonrası çizimin ilgisiz kısımları yeniden düzenleniyor; ebeveynlerin sağ-sol sırası bazı düzenlemelerde değişiyor (40 rastgele düzenleme dizisinde 31 çevrilme) | Klinisyen düzenleme sonrası aileyi yeniden "bulmak" zorunda; yanlış kişiye işlem yapma riski | cırcır + hedef (eş+çocuk eklemek yalnızca ilgili aile bloğunu değiştirir) |
| KI-3 | P0 | **düzeltildi; orijinal grafikler yeniden üretilip donduruldu** (Aşama 0) | 263 / 387 / 474 kişilik rastgele işlem pedigrilerinde ayak izi ihlali (ebeveyn olmayan kişi bir kardeşlik çizgisinin üstünde) | Ebeveyn olmayan kişi ebeveyn gibi okunabilir | Sabit JSON fixture'ları `src/__tests__/regression/ki3/` + `ki3Regression.test.js` (bütünlük, semantik, geometri, bağlantı okunabilirliği, klinik okunabilirlik tavanı, determinizm, süre) |
| KI-4 | P2 | açık | Pedigri numarası ("III-5") sembolün tam üst ortasında; iniş çizgisi etiketin içinden geçiyor | Numara okunaklılığı düşer; ilişki anlamı değişmez | hedef (`it.fails`) |
| KI-5 | P0 | **düzeltildi** (bu adım) | Uyarılar kutusu tuvalin üstünde sabit; alt kuşaktaki sembolleri (yeni eklenen çocuk dahil) örtüyordu | Bir birey görünmez kalabilir | uyarılar tuvalin üstünde normal akışta (kaynak testi) + tarayıcıda ölçüm (çakışma 0 px) |
| KI-6 | P2 | **düzeltildi** (bu adım) | ~1100 px genişlikte araç çubuğu "Sıfırla" düğmesinin üstüne biniyordu | — | araç çubuğu satır kaydırır, tuvalin üstüne binmez |
| KI-7 | P1 | **düzeltildi** (bu adım) | Aileye dışarıdan katılan her eş ve her çocuksuz çift için "herhangi bir ebeveyn birliğine bağlı değil" uyarısı (iç ID ile) | Yanlış-pozitif uyarılar kullanıcıyı gerçek uyarıları yok saymaya alıştırır | `dataIntegrityRegressions.test.js` KI-7 (eski doğrulayıcıyla 2 test kırmızı) |
| KI-8 | P2 | açık | Bir kişinin "dışarıdan evlenen" ikinci eşi yapısal adımda hep aynı tarafa (erkek-solda kuralı) konuyor; diğer eşi başka bir aileden gelip o tarafta kalırsa (ör. açık doğum sırası babayı o tarafa zorlarsa) akraba evliliği çizgisi ikinci eşin üstünden şeritle geçiyor | Çizgi doğru ve atlamalı; okunması zorlaşır | hedef (`it.fails`) |
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

### KI-2 — Düzenleme kararlılığı (kullanıcı önceliği)
- **Gereksinim (2026-10-18, kullanıcı):** Bir kişiye eş veya çocuk eklendiğinde mümkün olduğunca **yalnızca ilgili aile
  bloğu** değişmeli; var olan yerleşim korunmalı. Çizim gereksiz yere yeniden düzenlenmemeli.
- **Bugün:** her düzenlemede yerleşim sıfırdan hesaplanıyor. "Erkek solda" eşitlik bozucu ebeveyn çevrilmelerini azalttı
  (%12,6 → %7,1) ama kaldırmadı; ortalama kayma 37,8 px.
- **Kök neden:** PCL önceki yerleşimi bilmiyor (`opts.previous` uygulamaya bağlı değil; yalnız koordinat çekimi var,
  sıralama çekimi yok). Kalıcı kimlikler olmadan "aynı kişi" eşleştirmesi de güvenilir değildi.
- **Plan (Faz 2b store geçişinin hemen ardından):** store önceki yerleşimi (sıralama + x) saklar; PCL, düzenlemenin
  dokunduğu aile bloğu dışındaki atomların göreli sırasını sabit kısıt olarak alır ve koordinatlara güçlü çekim uygular;
  yalnızca etkilenen blok ve gerektiğinde komşuları yeniden yerleştirilir. Tam yeniden yerleşim kullanıcı isteğiyle
  ("Yeniden düzenle") yapılır.
- **Çıkış ölçütü:** hedef testi geçer (eş + çocuk ekleme bloğun dışındaki kimseyi > 2 px kaydırmaz); rastgele
  düzenlemelerde ebeveyn çevrilmesi 0.

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
