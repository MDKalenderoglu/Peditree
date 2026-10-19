# Klinik Kullanılabilirlik Benchmark'ı — Aşama A (KI-1 öncesi taban)

Tarih: 2026-10-19 · Dal: `stabilization/clinical-layout` · Taban kod: `b2efcaa` (KI-2 + KI-8) · motor: PCL.
**Bu aşamada yerleşim algoritması değiştirilmedi.**

## Amaç

Ürün hedefi (kullanıcı, 2026-10-19): çocuk genetik uzmanının klinik değerlendirmede ihtiyaç duyduğu pedigrinin hızlı,
doğru, standartlara uygun ve okunabilir çizilmesi. Kalite önceliği: 10–20 kişilik rutin, 21–50 kişilik karmaşık,
gerektiğinde 51–100 kişilik geniş aileler. 263/387/474 kişilik stres fixture'ları güvenlik testi olarak kalır; birincil
optimizasyon hedefi değildir.

## Vakalar (`src/audit/clinicalBenchmark.js`)

Elle tanımlı, deterministik; her ilişki koddadır. Klinik veri: etkilenmiş / taşıyıcı / ölü, yaşlar (doğum sırası
bunlardan), düşük ve ölü doğum, boşanma, akraba evliliği derecesi. Gerçek hasta verisi yoktur.

| vaka | kişi / kuşak | klinik içerik | düzenlemeler (kararlılık) |
|---|---|---|---|
| CB-01 | 14 / 3 | rutin üç kuşak: etkilenmiş erkek çocuk, düşük, iki büyükanne-baba çifti, teyze ailesi | yenidoğan kardeş; teyzeye ikinci çocuk |
| CB-02 | 24 / 4 | birinci derece kuzen ebeveynler, ortak büyükanne-baba; OR, iki etkilenmiş kardeş, ölü doğum | yenidoğan kardeş; amcaya üçüncü çocuk |
| CB-03 | 30 / 5 | birden fazla döngü: ebeveynlerin ebeveynleri iki tarafta da birinci kuzen, ebeveynler kuzen | yenidoğan kardeş; dayı çocuğuna eş |
| CB-04 | 18 / 3 | iki ebeveynin de önceki eşinden çocukları, anneannenin ikinci evliliği; X-bağlı yarım kardeş | yenidoğan kardeş; üvey teyzeye ikinci çocuk |
| CB-05 | 25 / 4 | X-bağlı: büyük dayı, dayı, teyze oğlu, proband etkilenmiş; taşıyıcılar | yenidoğan kardeş; teyze kızına eş + çocuk |
| CB-06 | 40 / 6 | üç kuşakta birinci kuzen evliliği, ebeveynler ikinci kuzen | yenidoğan kardeş; halanın çocuğuna eş |
| CB-07 | 14 / 3 | evlat edinilmiş proband (sosyal bağ, kesikli iniş), biyolojik kız kardeş, üvey oğul | yenidoğan biyolojik kardeş; teyzeye üçüncü çocuk |
| CB-08 | 66 / 4 | geniş kırsal aile: yedişer kardeş + ebeveyn, hepsi evli ve çocuklu; bir kuzen evliliği | yenidoğan kardeş; dayıya üçüncü çocuk |

## Yeniden üretim

```bash
npm run audit:clinical-benchmark -- --label baseline
```

Rapor: `reports/clinical-benchmark-baseline.{md,json}` (ölçüm tanımları `src/audit/clinicalBenchmarkMetrics.js`).
Gerçek SVG çıktıları: `reports/clinical-benchmark/baseline/CB-0x.svg` — uygulamanın kendi çizicisi ve dışa aktarımı
(`prepareExportSvg`) ile, tarayıcıda her vaka `openProjectFile` ile açılarak üretildi. Galeri:
`reports/clinical-benchmark/index.html` (Aşama C'de `?labels=baseline,after` ile yan yana).
Güvenlik kapısı: `src/__tests__/clinicalBenchmark.test.js`.

## Taban sonuçları

### Güvenli olan (8 vakanın hepsinde)

- Grafik ve akrabalık semantiği: belge hatası 0, bütünlük hatası 0, ortak atası olmayan akraba evliliği 0, uygulamanın
  uyarı panelinde Hata/Uyarı 0.
- Bağlantı sahipliği: yanlış ebeveyn birliğinden inen çocuk çizgisi 0, çizgisi olmayan çocuk 0; geometri değişmezi
  ihlali 0; atlamasız kesişim / sahte birleşme / üst üste çizgi ihlali 0.
- Doğum sırası: açık sıra veya bilinen yaşla çelişen kardeşlik 0 (yaşı bilinmeyen kardeşlerin izinli yeniden
  sıralanması: CB-03'te 1, CB-05'te 2).
- Partnerin üstünden geçen partnerlik çizgisi (KI-8) 0.
- Süre: açılış yerleşimi ≤ 4 ms, düzenleme ≤ 6 ms. Ebeveyn çevrilmesi 0.

### Okunabilirlik (açılış çizimi)

| vaka | çocuklu çift | > 45 px kayık çift | ort. / maks. kayma (px) | uzun eş çizgisi (en uzun) | kesişim (atlamalı) | A4'te en küçük metin (pt) |
|---|---|---|---|---|---|---|
| CB-01 | 4 | 0 | 1,4 / 3 | 0 | 0 | 9,3 |
| CB-02 | 8 | 2 | 16,7 / 57 | 1 (603 px) | 1 | 5,8 |
| CB-03 | 11 | 3 | 18,8 / 48 | 2 (596 px) | 2 | 5,5 |
| CB-04 | 7 | **4** | **45 / 68** | 0 | 0 | 7,9 |
| CB-05 | 7 | 0 | 1 / 3 | 0 | 0 | 6,7 |
| CB-06 | 14 | 3 | 21,9 / 78 | 2 (621 px) | 2 | **4,4** |
| CB-07 | 5 | 0 | 15,1 / 38 | 0 | 0 | 9,3 |
| CB-08 | 18 | 4 | 38,1 / **215** | 1 (**1903 px**) | **9** | **1,9** |

Kayık çiftler: CB-02 ebeveynler ve teyze çifti (57); CB-03 ebeveynler (48) ve iki kollateral çift; CB-04 anneannenin iki
birliği (66, 68) ve iki eski evlilik (55, 53); CB-06 ebeveynler (77), amca çifti (78); CB-08 kuzen evliliğine katılan iki
aile (215, 215), ebeveynler (74).

### Yeni birey ekleme sonrası kararlılık

"Yenidoğan kardeş" eklemek: CB-02'de 24 kişinin 24'ü, CB-03'te 28/30, CB-06'da 40/40 (en büyük kayma 145 px), CB-08'de
43/66 kişi kayıyor; blok dışındakilerin neredeyse tamamı. Kollateral ailedeki eklemeler (teyzeye / amcaya çocuk) yerel
kalıyor (2/10, 2/19). Hiçbir düzenlemede ebeveyn çevrilmesi, doğum sırası ihlali veya bağlantı ihlali yok.

## Görsel incelemede belirlenen klinik kullanılabilirlik sorunları

Öncelik: klinik okumayı en çok zorlayandan başlayarak.

1. **Akraba evliliğinde ayrık düşen eşler (CB-02, CB-03, CB-06 iki kez).** Bilinen yaşlar iki kuzeni kardeşliklerinin
   karşı uçlarına koyduğunda çift bitişik olamıyor; çift çizgi 350–600 px'lik bir şeritle başka kişilerin (çoğunlukla
   eşin kardeşi ve onun eşi) üstünden geçiyor. Probandın ebeveynleri çocuklarının üstünde 48–77 px kayık. Şeridin
   anneye inen ucu, annenin kendi iniş çizgisine çok yakın paralel duruyor (CB-02). Klinik olarak doğru ve atlamalı,
   ama okunması en zor yer burası ve **en sık klinik senaryo** (birinci derece kuzen evliliği).
2. **Kuzenleri bitişik tutmak için iniş çizgilerinin kesişmesi (CB-08).** İki kardeşin çocukları yer değiştirmiş; iki
   ailenin iniş çizgileri atlamalarla kesişiyor ("kim kimin çocuğu?" diye izlemek gerekiyor). Alternatif olan çift
   çizgi şeridi yerine sıralama maliyeti kesişimi seçmiş.
3. **Birden fazla partnerli ailede merkezleme (CB-04, 18 kişi).** 7 çiftin 4'ü yarım slottan fazla kayık; ortalama kayma
   45 px. Rutin ölçekte en kötü merkezleme bu vakada.
4. **Yenidoğan kardeş tüm çizimi kaydırıyor (KI-2, klinik ölçekte).** Probandın kardeşliği genişleyince iki yandaki
   aileler ve büyükanne-babalar kayıyor.
5. **Baskı (A4 tek sayfa) okunabilirliği.** 40 kişide en küçük metin 4,4 pt, numaralar 4,9 pt (öneri ≥ 6 pt); 66 kişide
   sembol 3 mm, numaralar 2,2 pt — tek A4 sayfada okunamaz (çizim 3650 × 690 px, en-boy oranı 5:1). 24–30 kişide sınırda
   (5,5–5,8 pt).
6. **Pedigri numarası iniş çizgisinin içinde (KI-4).** Her sembolde çizgi "III-1" etiketinin ortasından geçiyor; SVG ve
   ekranda görünür.
7. **Evlat edinme notasyonu eksik (CB-07).** Kesikli iniş var; NSGC köşeli parantezleri ve üvey bağın gösterimi yok
   (Faz 4).
8. Yana sarkan kardeşlik çizgisi: rutin vakalarda 0–5; tek çocuğun ebeveyn orta noktasının tam altında olmaması.

## KI-1 için ilk gözlem (Aşama B'de doğrulanacak)

- Sorun 1 ve 2 yapısaldır: doğum sırası kesin kural olduğu için çift ya bitişik olamaz ya da iniş çizgileri kesişir.
  Bunlar yalnız sıralama ↔ koordinat uyumsuzluğundan değil, **kural önceliğinden** kaynaklanıyor. Karar gereken soru:
  akraba evliliğinde eşleri bitişik tutmak için doğum sırasının esnetilmesine (ve sıranın başka biçimde, ör. numara
  ile gösterilmesine) izin var mı, yoksa şerit kalacak ama daha okunur mu çizilecek?
- Sorun 3 ve ebeveynlerin kayık durması (sorun 1'in ikinci yarısı) KI-1 hipoteziyle uyumlu: sıralama maliyeti
  hizalamayı slot olarak sayıyor, koordinat adımı gerçek pikselde başka sonuç üretiyor. Aşama B bunu ölçecek.

## Kullanıcı kararı gereken sorular

1. Akraba evliliğinde eşleri bitişik tutmak için doğum sırası esnetilebilir mi? (NSGC'de doğum sırası "mümkün olduğunda"
   soldan sağa; uygulamada şu an kesin kural.)
2. Sıra korunamıyorsa tercih: çift çizgi şeridi mi (başka kişilerin üstünden geçen), iniş çizgilerinin kesişmesi mi?
3. 50+ kişilik ailelerde baskı: tek sayfaya sığdırma mı, çok sayfa / odaklı (probanda yakın kollar) görünüm mü?
