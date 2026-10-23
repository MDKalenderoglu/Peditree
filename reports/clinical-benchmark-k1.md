# Klinik Kullanılabilirlik Benchmark'ı — k1

Commit: `2f35650 (+ uncommitted src changes)` · Node v24.18.0 · 2026-10-23T18:23:17.203Z · motor: PCL

Vakalar: `src/audit/clinicalBenchmark.js` (elle tanımlı, deterministik). Ölçümler: `src/audit/clinicalBenchmarkMetrics.js`.

## 1. Semantik ve geometrik güvenlik

| vaka | kişi / kuşak | belge hatası | bütünlük hatası | uyarı paneli (Hata/Uyarı) | ortak atasız akraba evliliği | geometri değişmezi | bağlantı ihlali | yanlış sahipli çocuk çizgisi | çizgisiz çocuk | doğum sırası ihlali (açık sıra / bilinen yaş) | izinli yeniden sıralama (yaş bilinmiyor / akraba evliliğindeki eş) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CB-01 Rutin üç kuşak (etkilenmiş erkek çocuk, düşük) | 14 / 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| CB-02 Birinci derece kuzen evliliği (OR, iki etkilenmiş kardeş) | 24 / 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 (U_hY_Y) |
| CB-03 Birden fazla akraba evliliği döngüsü | 30 / 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 (U_P1_P2, U_a_wa, U_g_h) |
| CB-04 Birden fazla partner ve yarım kardeşler | 18 / 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| CB-05 Farklı kollarda etkilenmiş bireyler (X-bağlı) | 25 / 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 (U_ggf_ggm, U_mgf_mgm) |
| CB-06 Kuşaklar boyu tekrar eden akraba evliliği | 40 / 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 (U_s1_s1w, U_pgf_pgm) |
| CB-07 Evlat edinme ve sosyal ebeveynlik | 14 / 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| CB-08 Geniş kırsal aile (sekizer kardeş, bir kuzen evliliği) | 66 / 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 (U_ms0_ms0_sp, U_ms1_sp_ms1) |

## 2. Okunabilirlik (açılışta görülen çizim)

Merkezleme: çiftin orta noktası ile çocuklarının aralığının ortası arasındaki fark (px; bir kardeş slotu 90 px). Uzun eş çizgisi: > 3 slot. Yana sarkan: çiftin orta noktası çocuk aralığının dışında (> 1 px; parantezde > 5 px).

| vaka | çocuklu çift | ortalı (< 10 px) / 10–45 px / > 45 px | ort. / maks. kayma (px) | yana sarkan (> 5 px) | uzun eş çizgisi (en uzun px) | kesişim (atlamalı / atlamasız) | üst üste kardeşlik çizgisi | başka partnerin üstünden çizgi |
|---|---|---|---|---|---|---|---|---|
| CB-01 | 4 | 4 / 0 / 0 | 1.4 / 3 | 1 (0) | 0 (72) | 0 / 0 | 0 | 0 |
| CB-02 | 8 | 8 / 0 / 0 | 2.6 / 6 | 2 (1) | 0 (77) | 0 / 0 | 0 | 0 |
| CB-03 | 11 | 11 / 0 / 0 | 2 / 6 | 3 (0) | 0 (74) | 0 / 0 | 0 | 0 |
| CB-04 | 7 | 1 / 2 / 4 | 45 / 68 | 5 (4) | 0 (208) | 0 / 0 | 0 | 0 |
| CB-05 | 7 | 7 / 0 / 0 | 1 / 3 | 0 (0) | 0 (73) | 0 / 0 | 0 | 0 |
| CB-06 | 14 | 12 / 2 / 0 | 5.1 / 14 | 4 (2) | 0 (78) | 0 / 0 | 0 | 0 |
| CB-07 | 5 | 3 / 2 / 0 | 15.1 / 38 | 1 (1) | 0 (108) | 0 / 0 | 0 | 0 |
| CB-08 | 18 | 12 / 4 / 2 | 14.6 / 80 | 1 (1) | 1 (1903) | 7 / 0 | 0 | 0 |

Yarım slottan (45 px) fazla kayık çiftler:

- CB-04: U_mgf_mgm 66px, U_mgm_h2_mgm 68px, U_m_ex_mother 55px, U_father_f_ex 53px
- CB-08: U_ps6_sp_ps6 80px, U_father_mother 74px

## 3. Ekran ve baskı (PDF/SVG) okunabilirliği, süre

A4 yatay (10 mm kenar boşluğu) sayfaya sığdırıldığında sembol boyu ve en küçük metin; 1200×700 px tuvalde sembol boyu. Eşik önerisi: sembol ≥ 4 mm, metin ≥ 6 pt; ekranda sembol ≥ 20 px.

| vaka | çizim (px) | A4: sembol mm / numara pt / en küçük metin pt | ekran: sembol px / numara px | yerleşim süresi (ms, 5 ölçüm medyanı) |
|---|---|---|---|---|
| CB-01 | 670 × 520 | 14.6 / 10.4 / 9.3 | 53.8 / 13.5 | 1.1 |
| CB-02 | 1122 × 680 | 9.9 / 7 / 6.3 | 41.2 / 10.3 | 1.5 |
| CB-03 | 1097 × 840 | 9 / 6.4 / 5.8 | 33.3 / 8.3 | 2.5 |
| CB-04 | 897 × 520 | 12.4 / 8.8 / 7.9 | 53.5 / 13.4 | 1.1 |
| CB-05 | 1059 × 680 | 10.5 / 7.4 / 6.7 | 41.2 / 10.3 | 0.9 |
| CB-06 | 1346 × 1000 | 7.6 / 5.4 / 4.8 | 28 / 7 | 3 |
| CB-07 | 676 × 520 | 14.6 / 10.4 / 9.3 | 53.8 / 13.5 | 0.4 |
| CB-08 | 3599 × 680 | 3.1 / 2.2 / 2 | 13.3 / 3.3 | 4.4 |

## 4. Yeni birey eklendikten sonra kararlılık

Önceki çizim = vakanın açılış çizimi; düzenleme düzenleme-yerel çizilir (KI-2). Düzenleme bloğu: grafik farkının etkilediği kişiler, kardeşlikleri ve partnerleri.

| vaka | düzenleme | düzey | kayan / kişi | blok dışında kayan / blok dışı | maks. kayma (px) | ebeveyn çevrilmesi | eklenen doğum sırası ihlali | ihlal (sonra) | kayık çift / yana sarkan (sonra) | süre (ms) |
|---|---|---|---|---|---|---|---|---|---|---|
| CB-01 | yenidoğan kardeş | local | 12 / 14 | 6 / 6 | 58 | hayır | 0 | 0 | 0 / 1 | 3 |
| CB-01 | teyzeye ikinci çocuk | local | 4 / 14 | 2 / 10 | 52 | hayır | 0 | 0 | 0 / 0 | 1 |
| CB-02 | yenidoğan kardeş | local | 22 / 24 | 14 / 16 | 63 | hayır | 0 | 0 | 0 / 2 | 1 |
| CB-02 | amcaya üçüncü çocuk | local | 8 / 24 | 4 / 19 | 100 | hayır | 0 | 0 | 0 / 2 | 1 |
| CB-03 | yenidoğan kardeş | local | 30 / 30 | 23 / 23 | 61 | hayır | 0 | 0 | 0 / 3 | 1 |
| CB-03 | dayı çocuğuna eş | local | 21 / 30 | 20 / 29 | 66 | hayır | 0 | 0 | 0 / 3 | 2 |
| CB-04 | yenidoğan kardeş | local | 17 / 18 | 10 / 11 | 65 | hayır | 0 | 0 | 4 / 5 | 1 |
| CB-04 | annenin üvey kardeşine ikinci çocuk | local | 13 / 18 | 10 / 15 | 86 | hayır | 0 | 0 | 3 / 3 | 1 |
| CB-05 | yenidoğan kardeş | local | 18 / 25 | 12 / 17 | 97 | hayır | 0 | 0 | 0 / 1 | 2 |
| CB-05 | teyze kızına eş + çocuk | local | 18 / 25 | 15 / 22 | 68 | hayır | 0 | 0 | 0 / 1 | 2 |
| CB-06 | yenidoğan kardeş | local | 40 / 40 | 32 / 32 | 77 | hayır | 0 | 0 | 0 / 4 | 2 |
| CB-06 | halanın çocuğuna eş | local | 4 / 40 | 3 / 39 | 3 | hayır | 0 | 0 | 0 / 4 | 1 |
| CB-07 | yenidoğan biyolojik kardeş | wide | 14 / 14 | 9 / 9 | 57 | hayır | 0 | 0 | 1 / 2 | 1 |
| CB-07 | teyzeye üçüncü çocuk | local | 4 / 14 | 2 / 9 | 51 | hayır | 0 | 0 | 0 / 1 | 0 |
| CB-08 | yenidoğan kardeş | local | 31 / 66 | 20 / 47 | 165 | hayır | 0 | 0 | 2 / 1 | 5 |
| CB-08 | dayıya üçüncü çocuk | local | 5 / 66 | 2 / 55 | 100 | hayır | 0 | 0 | 2 / 1 | 3 |
