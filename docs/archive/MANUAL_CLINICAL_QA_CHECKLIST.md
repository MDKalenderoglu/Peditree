# Manual Clinical QA Checklist — Recursive Packer Cutover (v0.5, Step 4D)

## 1. QA Amacı

Adım 4C ile recursive disjoint-interval packer, `usePedigreeStore` üzerinden
uygulamanın kullandığı **default** layout motoru oldu
(`PEDITREE_PACKER=legacy` artık yalnızca açık bir fallback/debug seçeneği).
Otomatik fuzz baseline'ı (`npm run audit:layout-fuzz`) 1000 rastgele işlem
dizisinde %0 invariant hatası ölçtü, ama fuzz modeli yalnızca
`src/audit/layoutInvariants.js`'te kodlanmış invariant'ları kontrol eder —
gerçek bir genetik danışman ekranda gördüğünde "bu çizim klinik olarak
yanıltıcı mı, okunabilir mi" sorusunu otomatik olarak cevaplayamaz.

Bu belgenin amacı, cutover sonrası gerçek klinik pedigree senaryolarını
tarayıcıda elle inceleyip:

- Layout/readability/export correctness'ı manuel olarak doğrulamak,
- Fuzz'ın yakalayamayacağı türde (klinik anlam, sembol netliği, okuma sırası)
  regresyonları yakalamak,
- Bulunan sorunları önceliklendirip (P0-P3) sonraki adımlara net bir
  handoff sağlamaktır.

Bu adımda **layout engine, recursive packer, routing, placement algoritması
veya checker mantığı değiştirilmez** — yalnızca bu QA materyali üretilir.

---

## 2. Test Ortamı

```bash
npm install
npm run dev
npm test
npm run build
npm run lint
node verify-generations.mjs
```

`npm run dev` ile açılan tarayıcı önizlemesi üzerinden senaryo 3'teki her
madde manuel olarak kurulacak ve incelenecektir.

**Not:** Bu QA sürecinde push/fetch/remote doğrulama işlemi yapılmaz. Tüm
kontroller lokal `npm run dev` / `npm test` / `npm run build` üzerinden
yürütülür.

---

## 3. Manuel Test Matrisi

Her senaryo, wizard veya seçili-birey editörü (`addSpouseTo`, `addChildTo`,
`createUnionBetween`, vb.) üzerinden kurulur, ardından Bölüm 4'teki kontrol
alanları uygulanır ve Bölüm 9'daki tabloya sonuç girilir.

| # | Senaryo |
|---|---|
| 1 | Basit 3 kuşak pedigree |
| 2 | 5 kuşak pedigree |
| 3 | 6+ kuşak pedigree |
| 4 | Büyük sibship: aynı ebeveynden 8–12 çocuk |
| 5 | Büyük sibship + çocukların kendi eş/çocukları |
| 6 | Multiple partners: bir bireyin 2 partneri |
| 7 | Multiple partners: bir bireyin 3 partneri |
| 8 | Half-sibling yapısı |
| 9 | Cross-branch union |
| 10 | Cousin marriage / consanguinity |
| 11 | Consanguinity reported-unresolved |
| 12 | Probandın amca/hala/dayı/teyze kolu |
| 13 | Probandın kuzenleri ve kuzenlerin çocukları |
| 14 | Married-in spouse with own prior union |
| 15 | Married-in spouse with multiple unions |
| 16 | Unrelated family blocks |
| 17 | Multiple unrelated subfamilies |
| 18 | Deceased affected individual |
| 19 | Proband switching |
| 20 | Male/female/unknown sex symbol correctness |
| 21 | Miscarriage / stillbirth / termination sembolleri |
| 22 | Adoption varsa mevcut destek düzeyine göre kontrol |
| 23 | Twins/multiple gestation varsa mevcut destek düzeyine göre kontrol |
| 24 | SVG export |
| 25 | PNG export |
| 26 | PDF-ready export / print viewbox |
| 27 | Save/load roundtrip |
| 28 | Browser refresh persistence |
| 29 | Undo/rollback behavior, mevcutsa |
| 30 | Extreme stress: 5–6 kuşak + multiple partners + cousin branch |

---

## 4. Her Senaryo İçin Kontrol Alanları

Her senaryo için aşağıdaki checkbox listesi doldurulur:

- [ ] Individuals overlap yok
- [ ] Family blocks overlap yok
- [ ] Couple line doğru
- [ ] Sibling bus doğru
- [ ] Parent-child connector doğru
- [ ] Cross-branch connector okunabilir
- [ ] Consanguinity line misleading değil
- [ ] Proband arrow doğru
- [ ] Affected/deceased/proband sembol ayrımı doğru
- [ ] Generation alignment doğru
- [ ] Left-to-right birth/order mantığı korunuyor
- [ ] Export clipping yok
- [ ] SVG/PNG export okunabilir
- [ ] Save/load sonrası layout bozulmuyor
- [ ] Console error yok
- [ ] Klinik olarak yanıltıcı çizim yok

---

## 5. Hata Sınıflandırması

```text
P0 = klinik olarak yanıltıcı / yanlış ilişki gösteriyor
P1 = layout overlap / export clipping / okunamaz çizim
P2 = connector karmaşası ama ilişki anlaşılabilir
P3 = kozmetik / spacing / küçük hizalama
```

---

## 6. Kabul Kriterleri

- P0 kabul edilemez.
- P1 kabul edilemez.
- P2 en fazla sınırlı ve raporlanabilir.
- P3 v1 öncesi polish backlog'a alınabilir.
- Export clipping sıfır olmalı.
- Save/load roundtrip bozmamalı.
- Default packer recursive kalmalı.
- Legacy sadece fallback/debug için kalmalı.

---

## 7. Regression Komutları

```bash
npm test
npm run build
npm run lint
node verify-generations.mjs
git diff --check
npm run audit:layout-fuzz -- --cases 1000
npm run audit:layout-fuzz -- --seed 12345 --cases 1000
npm run audit:layout-fuzz -- --cases 1000 --packer legacy
npm run audit:layout-fuzz -- --seed 12345 --cases 1000 --packer legacy
```

---

## 8. Known Deferred Issues

```text
married-in partner placement overwrite architectural debt
```

Bu **4D'de düzeltilmeyecek**. Ayrı adım:

```text
Adım 5A — married-in partner placement overwrite architectural debt
```

Manuel QA sırasında senaryo 14/15 (married-in spouse with own prior
union / with multiple unions) bu bilinen borçla örtüşen bir sorun ortaya
çıkarırsa, bulgu P0-P3 arası uygun şekilde sınıflandırılıp Bölüm 9'a
kaydedilir ve Adım 5A'ya referans olarak bırakılır — bu adımda düzeltme
yapılmaz.

---

## 9. Manuel QA Sonuç Tablosu

| Scenario ID | Scenario | Status | Severity | Notes | Screenshot/export taken? | Follow-up issue |
|---|---|---|---|---|---|---|
| 1 | Basit 3 kuşak pedigree | | | | | |
| 2 | 5 kuşak pedigree | | | | | |
| 3 | 6+ kuşak pedigree | | | | | |
| 4 | Büyük sibship: 8–12 çocuk | | | | | |
| 5 | Büyük sibship + çocukların eş/çocukları | | | | | |
| 6 | Multiple partners: 2 partner | | | | | |
| 7 | Multiple partners: 3 partner | | | | | |
| 8 | Half-sibling yapısı | | | | | |
| 9 | Cross-branch union | | | | | |
| 10 | Cousin marriage / consanguinity | | | | | |
| 11 | Consanguinity reported-unresolved | | | | | |
| 12 | Amca/hala/dayı/teyze kolu | | | | | |
| 13 | Kuzenler ve kuzen çocukları | | | | | |
| 14 | Married-in spouse with own prior union | | | | | |
| 15 | Married-in spouse with multiple unions | | | | | |
| 16 | Unrelated family blocks | | | | | |
| 17 | Multiple unrelated subfamilies | | | | | |
| 18 | Deceased affected individual | | | | | |
| 19 | Proband switching | | | | | |
| 20 | Sex symbol correctness | | | | | |
| 21 | Miscarriage/stillbirth/termination sembolleri | | | | | |
| 22 | Adoption (mevcut destek düzeyi) | | | | | |
| 23 | Twins/multiple gestation (mevcut destek düzeyi) | | | | | |
| 24 | SVG export | | | | | |
| 25 | PNG export | | | | | |
| 26 | PDF-ready export / print viewbox | | | | | |
| 27 | Save/load roundtrip | | | | | |
| 28 | Browser refresh persistence | | | | | |
| 29 | Undo/rollback behavior | | | | | |
| 30 | Extreme stress senaryosu | | | | | |

`Status`: Pass / Fail / Blocked. `Severity`: P0–P3 (yalnızca Fail için).

---

## 10. Sonraki Adım Önerisi

After manual QA, proceed to Adım 5A only if QA does not reveal a
higher-priority P0/P1 blocker.
