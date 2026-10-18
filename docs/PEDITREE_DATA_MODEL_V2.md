# Peditree — Veri modeli değerlendirmesi ve graph-first şema v2 (Faz 2b)

Durum: **tasarım onaylı (kullanıcı, 2026-10-18), uygulama adım adım** · İlgili bulgular: DM-1, DM-6, DM-9, DM-10, EX-4,
UX-1 (`PEDITREE_AUDIT_REPORT.md`).

## 1. Mevcut model (v1) — gerçekte nasıl çalışıyor

Kalıcı ve tek "kaynak" `wizardData`'dır (`usePedigreeStore.js`, `persistence.js`, anahtar
`clinical_pedigree_app.session.v1`). Görünen grafik **her düzenlemede sıfırdan yeniden üretilir**:

```
wizardData ──buildPedigreeFromWizard──► şablon grafiği (sembolik, konumsal kimlikler)
   │                                     │ + graphEdits (sağ panel ekleme talimatları, sırayla tekrar oynatılır)
   │                                     │ + customConsanguinity ("kardeş yap" talimatları)
   │                                     │ + consanguineousUnions / unionRelationshipBackgrounds (birlik bayrakları)
   │                                     │ + childOrders (doğum sırası), probandId
   ├─ pruneStaleOverlays                 ▼
   ├─ deletedIndividualIds ──► applyIndividualDeletions (silinenler filtrelenir, yer tutucu ebeveyn)
   └─ manualEdits ───────────► mergeManualEdits (etiket, etkilenme, not, yaş, cinsiyet … kimliğe göre üstüne yazılır)
                                          ▼
                                 pedigreeData = layout(graph)
```

| Parça | Ne tutar | Kimlik anahtarı | Sorun |
|---|---|---|---|
| `proband`, `siblings`, `parents.*OtherUnions`, `*Relatives`, `*GPRelatives`, `greatGrandparents`, `gen4` | Sayılar ve listeler | **Konumsal** (`sib_m_2` = "üçüncü erkek kardeş", `mat_uncle_1_cf_0`) | Sayı azalıp artınca başka bir kişi aynı kimliği alır (DM-5); kimlik kişinin değil "yuvanın" kimliği |
| `graphEdits[]` | Sağ panel eklemeleri: `addSpouse`, `addChild`, `linkPartners`, `addParents` | `de_sp_N`, `de_ch_N`, `U_DE_N` (monoton, Faz 2a) | Hedef kimlik konumsal olduğu için talimat yanlış kişiye "yeniden bağlanabilir"; sıraya bağımlı tekrar oynatma; hedef yoksa sessizce atlanır |
| `customConsanguinity[]` | "Kardeş yap" | kişi kimlikleri + `seq` | Aynı |
| `deletedIndividualIds[]` | Silme mezar taşları (filtre) | kimlik | Silinen şablon kişisi "aslında" hâlâ üretiliyor, sonra filtreleniyor |
| `manualEdits{}` | Klinik alanlar | kimlik | Kişi değil yuva anahtarlı (Faz 2a budama ile yamalandı) |
| `childOrders{}` | Doğum sırası | birlik kimliği | Faz 3'te her kardeşliğe uygulanır hâle getirildi (DM-12) |
| `consanguineousUnions{}`, `unionRelationshipBackgrounds{}` | Birlik bayrakları | birlik kimliği | Konumsal birlik kimliği (`U_MAT_UNCLE_1`) |

**Kök sorun (DM-1):** ilişkiler tek bir yerde değil, beş ayrı yapının sıraya bağlı birleşiminden doğuyor. Sihirbaz ile
kişi paneli farklı yapılara yazıyor (DM-6/UX-1); kimlikler kişiye değil konuma ait; aynı kişinin ilişkisi bir talimat
hedefini kaybedince sessizce düşebiliyor. Faz 2a bu sınıfın bilinen yollarını (H1–H8) kapattı ama mimariyi değiştirmedi.

Ek eksikler: biyolojik/sosyal ebeveynlik ayrımı yok (bir çocuk = tek ebeveyn birliği), evlat edinme temsil edilemiyor
(DM-9); proje dosyası olarak kaydet/aç yok (EX-4); geri al/yinele `wizardData` anlık görüntüleriyle çalışıyor (doğru ama
her adımda tüm grafiği yeniden kuruyor).

## 2. Hedef model (v2)

### 2.1 İlke

**Grafik tek doğruluk kaynağıdır.** Kalıcı belge doğrudan grafiği saklar. Sihirbaz ve kişi paneli aynı grafiğe aynı
graf işlemleriyle (`src/graph/ops.js`) yazar. Sihirbazdaki sayılar grafikten **türetilir** (gösterim), sayı değiştirmek bir
graf işlemi üretir.

### 2.2 Belge (schemaVersion 2)

```js
{
  schemaVersion: 2,
  savedAt, createdAt,
  graph: {
    individuals: [Individual],                 // kimlik kalıcı; tüm klinik alanlar kişinin üstünde
    unions: [Union],                           // { id, partners:[a,b], status, consanguineous, consanguinityStatus,
                                               //   consanguinityDegree, consanguinityPath, relationshipBackground }
    parentChildRelationships: [                // BİYOLOJİK ebeveynlik (çocuk başına en çok bir)
      { unionId, children: [id], birthOrderExplicit?, orderPolicy: 'byAge' | 'insertion' }
    ],
    socialParentLinks: [                       // SOSYAL ebeveynlik (evlat edinen, koruyucu, üvey…); çocuk başına çok olabilir
      { unionId, childId, kind: 'adoptive' | 'foster' | 'step' | 'guardian' }
    ],
  },
  ids: { counters: { [önek]: sonKullanılan }, retired: [id] },  // kalıcı kimlik ayırıcı: hiçbir kimlik yeniden kullanılmaz
  wizardAnchorId: 'proband',                   // sihirbazın "göreli" çalıştığı kişi (v1'deki sabit proband yuvası)
  provenance: { migratedFrom?: 1, migratedAt?, v1Snapshot? }  // göç denetimi için v1 verisinin tam kopyası
}
```

- **Kalıcı kimlik:** mevcut sembolik kimlikler göçte aynen korunur; yeni kişiler rol önekli sembolik kimlik alır
  (`sib_m_`, `mat_uncle_`, `de_ch_` …) ama sonek ayırıcıdan gelir ve **emekli kimlikler hiçbir zaman yeniden
  verilmez** (`ids.retired`). Kişinin rolü/konumu değişse de kimliği değişmez.
- **Klinik alanlar kişinin kendisinde** (etiket, etkilenme, taşıyıcılık, not, yaş, cinsiyet, durumlar). `manualEdits`
  katmanı yok.
- **Silme gerçek silmedir** (grafikten kaldırılır, kimlik emekliye ayrılır); çocuklar korunur ve diğer ebeveyne bağlı
  kalır (yer tutucu ebeveyn kuralı Faz 2a'daki gibi, ama artık grafiğin parçası).
- **Doğum sırası** PCR'de saklanır: `birthOrderExplicit` (kullanıcı verdi) > `orderPolicy:'byAge'` (yaşlardan türetilir,
  v1'in varsayılan sıralaması) > `'insertion'`.
- **Biyolojik ve sosyal ebeveynlik ayrı:** `parentChildRelationships` yalnız biyolojik (çocuk başına ≤ 1; mevcut tüm
  denetimler ve PCL bu anlamla çalışır). `socialParentLinks` ek ilişkidir; bir çocuğun hem biyolojik hem evlat edinen
  ailesi olabilir. Biyolojik ebeveyni çizilmemiş, yalnız sosyal ebeveyni olan çocuk yerleşimde sosyal ebeveynlerinin
  altına yerleşir. (Kesikli iniş çizgisi ve köşeli parantez gösterimi Faz 4.)
- **Akraba evliliği / yeniden birleşen dallar:** zaten graf yapısıdır (ortak atalar düğüm olarak vardır); v2'de
  talimat tekrarı olmadığı için bir dalın "sessizce düşmesi" mümkün değildir. `consanguinityStatus` her mutasyondan sonra
  ata kesişiminden yeniden türetilir (kural 4).

### 2.3 Değişmezler (her işlemden sonra denetlenir — `validateDocument`)

1. Kimlikler benzersiz; emekli kimlik grafikte yok.
2. Birlik tam iki farklı, var olan partner; aynı çift için ikinci birlik yok.
3. Çocuk başına ≤ 1 biyolojik ebeveyn birliği; çocuk kendi ebeveyn birliğinin partneri değil.
4. Atalık döngüsü yok (kişi kendi atası olamaz) — DM-10.
5. Sosyal bağ: birlik ve çocuk var; aynı çocuk–birlik çifti biyolojik bağla çakışmaz; tür sözlükte.
6. Mevcut `auditPedigreeGraph` (proband sayısı, kuşak tutarlılığı, karşı cins kuralı …) sıfır hata.
7. İşlem başarısızsa grafik **değişmez** ve Türkçe neden döner (geri alma yığınına bir şey eklenmez).

### 2.4 Göç (v1 → v2), veri kaybı olmadan

`migrateV1ToV2(wizardData)`:

1. v1 hattını **aynen** çalıştırır (`buildPedigreeFromWizard` + budama + silme katmanı + `manualEdits` birleştirme) →
   kullanıcının v1'de gördüğü grafik `G1`.
2. `doc.graph = G1` (kimlikler, birlik bayrakları, doğum sırası ve klinik alanlar dahil). v1'in yaşa göre sıraladığı
   kardeşlikler `orderPolicy:'byAge'`, diğerleri `'insertion'` alır.
3. Doğrudan düzenleme sayacı v1'in `editSeq` değerinden devam eder; v1'de silinmiş kimlikler `retired`.
4. `provenance.v1Snapshot` = v1 `wizardData`'nın tam kopyası (denetim/geri dönüş için).
5. Doğrulama: `deriveGraph(doc)` ile `G1` anlamsal olarak eşit olmalı (kişiler + klinik alanlar, birlikler + bayraklar,
   ebeveyn-çocuk bağları + sıra). Eşit değilse göç **reddedilir**, v1 verisi dokunulmadan kalır.

Depolama: v2 anahtarı `clinical_pedigree_app.session.v2`. Açılışta v2 varsa o yüklenir; yoksa v1 varsa göç edilir, v2
yazılır, v1 zarfı `…session.v1.backup` anahtarına taşınır (yeniden göç olmaz, veri kaybolmaz). "Yeni Pedigri" v2'yi ve
yedeği siler (kullanıcının açık silme isteği).

### 2.5 Geri al / yinele

Belge değişmez (immutable) güncellenir; geri alma yığını belge anlık görüntüleridir (en çok 50). Başarısız/engellenen
işlem yığına girmez; seçim ve uyarı gizleme yığına girmez (v1 ile aynı sözleşme).

### 2.6 Uygulama adımları

| Adım | İçerik | Doğrulama |
|---|---|---|
| 2b-1 | `src/graph/`: belge şeması, kimlik ayırıcı, `validateDocument`, saf graf işlemleri | birim testleri |
| 2b-2 | `migrateV1ToV2` + v2 kalıcılık zarfı + v1 yedeği | v1 fuzz durumları (binlerce) ve fikstürlerde `G1` ≡ v2 grafiği; kaydet→yükle→kaydet özdeşliği |
| 2b-3 | Store geçişi: belge kaynak; tüm eylemler graf işlemi; sihirbaz görünümü grafikten türetilir; geri al/yinele belgeyle | tüm mevcut davranış testleri (v1 iç yapısını okuyan testler grafik düzeyindeki eşdeğer iddialara taşınır), veri bütünlüğü, PCL kapıları |
| 2b-4 | Proje dosyası kaydet/aç (`.peditree.json`), v1 dosyası açılırsa göç | uçtan uca kaydet→aç→düzenle→kaydet testi |
| 2b-5 | Sosyal ebeveynlik bağları (model, doğrulama, yerleşim yapısı) | birim + yerleşim testleri |
| sonra | KI-2 düzenleme-yerel yerleşim (önceki yerleşimin korunması) — kalıcı kimliklere dayanır | `knownIssues` hedef testi |

## 3. Göç doğrulama sonuçları (2b-2, 2026-10-18)

- Zengin v1 oturumu (her v1 katmanı: el ile düzenlemeler, silme + yer tutucu, eş/ebeveyn/çocuk ekleme, akraba evliliği
  bağı, doğum sırası, ilişki geçmişi, proband değişikliği): göç edilen grafik v1'de görünen grafikle **anlamsal olarak
  aynı**; v2 türetme kuralları hiçbir şeyi değiştirmiyor.
- 120 (test paketinde) + 300 (ölçüm) rastgele v1 düzenleme oturumu (14 işlem, 16–34 kişi): göç hatası 0, v2
  normalizasyonu 0. Fark yalnızca DM-13 sınıfında (v1'in kendi veri kaybı; kaydedilmiş veride yok).
- Depolama: v1 oturumu ilk açılışta taşınır, v2 yazılır, v1 zarfı `…v1.backup` anahtarına aynen taşınır; tanınmayan
  veya bozuk kayıt hiçbir veriye dokunmadan bildirilir.
- Proje dosyası: kaydet → aç → düzenle → kaydet → aç döngüsünde ilişkiler, kimlikler ve kimlik sayaçları korunuyor;
  v1 dosyası açılırsa göç ediliyor; yabancı/bozuk dosya reddediliyor.
