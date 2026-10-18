# Peditree — Klinik Gereksinimler ve Gösterim Standardı

Bu doküman Peditree'nin desteklemesi gereken aile ilişkilerini, sembolleri ve çizgi anlamlarını, kaynağıyla
birlikte tanımlar. **Standart** ile **geliştirici/klinik tercih** her satırda ayrılmıştır.

## Kaynaklar

| Kısaltma | Kaynak | Erişim / doğrulama |
|---|---|---|
| **08** | Bennett RL, French KS, Resta RG, Doyle DL. Standardized human pedigree nomenclature: update and assessment of the recommendations of the NSGC. *J Genet Couns* 2008;17:424–433. doi:10.1007/s10897-008-9169-9 | Üçüncü taraf kopyası (araştırma ajanı) + `örnek/` klasöründeki Türkçe uyarlama tabloları (Çitli & Ayaz, TGD 2016) |
| **22** | Bennett RL, French KS, Resta RG, Austin J. Practice resource-focused revision: Standardized pedigree nomenclature update centered on sex and gender inclusivity. *J Genet Couns* 2022;31:1238–1248. doi:10.1002/jgc4.1621 | NSGC'nin barındırdığı tam metin PDF; aşağıdaki alıntılar bu metinden **doğrudan** çıkarıldı |
| **25** | Steinhaus French K ve ark. Correction to the 2022 focused revision. *J Genet Couns* 2025. doi:10.1002/jgc4.2020 | PMC11926493 (açık erişim); metin doğrulandı, şekil detayları araştırma ajanı raporundan |

22'den doğrudan doğrulanan ifadeler:
- Şekil 3: *"A break in a relationship line indicates the relationship no longer exists."* (`//`)
- §4.5: *"we recommend that the dot no longer be used to indicate carrier status. Instead, we recommend that the symbol be divided … a unique fill pattern in each subsection … explained in the legend."*
- §4.4: *"The 2008 recommendations include affirming practices such as the inclusion of nonbiological children adopted into a family and the recording of same-sex relationships."*
- §4.2: ilişki çizgisinin kesikliye çevrilmesi tartışılmış, **düz çizgi korunmuş**; akraba evliliğinde **düz çift çizgi** genetik ilişkiyi gösterir.
- Şekil 2: Proband *"(Always affected with condition)"*; Consultand *"(Shade, if affected)"*.
- Şekil 3: *"No children by choice or reason unknown. Indicate reason if known."* / *"Infertility (indicate reason if known)"*; ikizlerde *"In the absence of a "?" or a connecting line, assumed to be dizygotic"*; evlat edinmede *"Brackets used for all adoptions. Adoptive and biological parents denoted by dashed and solid lines of descent, respectively."*; kardeşler *"left to right in birth order (oldest to youngest)"*.

---

## 1. Bireyler ve semboller

| Kavram | Standart gösterim | Kaynak | Peditree bugün | Hedef |
|---|---|---|---|---|
| Erkek / kadın / bilinmeyen | Kare / daire / karo | 08, 22 | ✅ | korunur |
| Cinsiyet kimliği ≠ doğumda atanan cinsiyet | Kimlik sembolü + altında AMAB/AFAB/UAAB | 22, 25 | ❌ | Faz 2b (model alanı) |
| Etkilenmiş | Dolu sembol, lejantta tanımlı | 08, 22 | ✅ (lejant yalnız `conditions[]` için) | lejant her durumda |
| Birden fazla durum | Bölünmüş sembol, her bölme ayrı desen, lejant | 08, 22 | ❌ | Faz 4 |
| Taşıyıcı | **22: nokta artık önerilmiyor**; bölünmüş sembol + desen + lejant | 22 §4.5 | Yarım dolu, lejantsız (RN-2) | Bölme deseni + zorunlu lejant girişi |
| Asemptomatik/presemptomatik taşıyıcı | Ortadan dikey çizgi | 08, 22 | ❌ | Faz 4 |
| Ölmüş | Sembolü aşan eğik çizgi; altında "d." + yaş | 08, 22 | ✅ (çizgi) | "d." etiketi doğrulanacak |
| Proband | Sol altta ok **+ "P"**; **her zaman etkilenmiş** | 08, 22 | Ok var, **P yok** (RN-1) | "P" eklenir; etkilenmemiş proband için uyarı |
| Consultand | Ok, **P yok**; birden fazla olabilir | 08, 22 | ❌ (kavram yok) | Faz 2b alanı |
| Aile öyküsü bilinmiyor | Sembolün üstünde "?" | 08, 25 | ❌ | Faz 4 |
| Birden çok birey | Sembol içinde sayı veya "n" | 08, 22 | ❌ | Faz 4 |
| Değerlendirme yapılmış | Sağ altta yıldız (*) | 08, 22 | ❌ | kapsam içi ama düşük öncelik |

## 2. Gebelik ve sonuçları

| Kavram | Standart | Kaynak | Bugün | Hedef |
|---|---|---|---|---|
| Süren gebelik | Sembol içinde "P"; altında gebelik haftası | 08, 22, 25 | ❌ | Faz 2b/4 |
| Spontan düşük (SAB) | Küçük üçgen; etkilenmişse dolu; altında hafta | 08, 22 | ✅ üçgen, hafta yok | hafta alanı |
| Gebelik sonlandırma (TOP) | Eğik çizgili üçgen | 08, 22 | ❌ | Faz 2b/4 |
| Ektopik (ECT) | Eğik çizgili üçgen + "ECT" | 08, 25 | ❌ | Faz 2b/4 |
| Ölü doğum (SB) | **Normal boy** sembol + eğik çizgi + "SB" + hafta | 08, 22, 25 | Küçük sembol + X (RN-3) | düzeltilir (Faz 4) |

`CLAUDE.md` kural 5 (bu türler karıştırılmaz) korunur; dört sonuç türü ayrı model değerleridir.

## 3. Çizgiler ve ilişkiler

| Kavram | Standart | Kaynak | Bugün | Hedef |
|---|---|---|---|---|
| Birliktelik çizgisi | Partnerler arasında düz yatay çizgi | 08, 22 | ✅ (yakın partnerlerde); uzak partnerlerde koridor çizgisi (LY-6) | Faz 3 |
| Sona ermiş ilişki | Çizgide **tek gösterim "//"** (ayrılık/boşanma ayrımı yok) | 08, 22 | Ayrılık = tek eğik, boşanma = çift eğik (**standart dışı**) | "//" tek gösterim; ayrılık/boşanma yalnız kayıt bilgisi |
| Akraba evliliği | Düz **çift** çizgi; derece çizimden belli değilse çizginin üstüne yazılır | 08, 22 | ✅ çift çizgi; derece etiketi yok | derece etiketi (Faz 4) |
| Çocuksuz (bilinçli / nedeni bilinmiyor) | Kısa dikey + **tek** çubuk; neden altına | 08, 22 | 5B'de kaldırıldı (artık yanlışlıkla çizilmiyor) | açık model alanıyla geri gelir |
| İnfertilite | Kısa dikey + **çift** çubuk; neden altına | 08, 22 | ❌ | açık model alanı |
| Kayıt edilmemiş çocuksuzluk | **İşaret gerekmez** | 22 Şekil 3 | ✅ (5B) | korunur |
| İniş çizgisi / kardeş çizgisi | Birliktelik çizgisinden kardeş çizgisine dikey, her çocuğa dikey | 08, 22 | ✅ | korunur, ama Faz 3'te birliktelik ortasından |
| Kardeş sırası | **Soldan sağa doğum sırası** (zorunlu) | 08, 22 | ✅ (model); yerleşim motoru korur | sert kısıt |
| Partneri gösterilmeyen çocuk | İniş çizgisi tek ebeveynden iner | 22/25 Şekil 3 örneği | Yer tutucu "belirtilmemiş ebeveyn" karosu çiziliyor | Faz 3: yer tutucu çizilmeden tek ebeveynden iniş |
| Çoklu partner | Örnekle: kişi ortada, partnerler iki yanda | 22/25 Şekil 3 | sabit ofsetle tek yana | Faz 3 |
| İkiz | Tek noktadan çapraz ayrılan çizgiler; MZ'de aradaki yatay çubuk; "?" = zigot bilinmiyor; işaretsiz = DZ (22) / "MZ değil" (25) | 08, 22, 25 | ❌ | Faz 2b + 3 |
| Evlat edinme | Köşeli parantez; evlat edinen ebeveynden **kesikli**, biyolojik ebeveynden **düz** iniş; çocuk iki ebeveyn setine bağlanabilir | 08, 22, 25 | ❌ (bir çocuk = tek ebeveyn birliği kuralı engelliyor) | Faz 2b (tipli ebeveyn bağları) |
| Yardımcı üreme | Donör "D", gestasyonel taşıyıcı "G" (25: "S" kaldırıldı) | 08, 22, 25 | ❌ | Faz 2b |
| Erkek partner solda | **Yumuşak** öneri ("if possible"), 22/25 şekillerinde yok | 08 | uygulanmıyor | eşitlikte tercih (Faz 3) |
| Kuşak / birey numarası | "I-1" biçimi; Romen rakamı kuşak + soldan sağa numara **gelenek** | 08 (örnek), 22 | Her sembolün üstünde | Romen rakamları sol kenarda + isteğe bağlı numaralar |

## 4. Standardın yanıt vermediği ya da yerel kararla çelişen noktalar

| Konu | Standart ne diyor | Peditree'de şu an | Karar sahibi |
|---|---|---|---|
| Aynı cinsiyetli partnerlik | 22: 2008 önerileri aynı cinsiyetli ilişkilerin kaydını içerir; özel gösterim yok, normal çizgi | Sizin talimatınızla (Türkiye klinik pratiği) **engelli** | **Klinisyen** (bkz. denetim raporu §4) |
| Cinsiyeti bilinmeyen partner | 22/25 şekillerinde karo partnerler normal çizgiyle | 5A ile engelli | Klinisyen |
| Farklı kuşaktan partnerler (ör. amca–yeğen) | **Ele alınmamış** | Kategorik engelli | Klinisyen; öneri: biyolojik olarak mümkünse uyarıyla izin, yerleşim motoru basamaklı çizgiyle çizer |
| "Tam olarak bir proband" | Proband tanımı gereği etkilenmiş; etkilenmemiş başvuran consultand'dır; proband hiç olmayabilir | `CLAUDE.md` kural 6: tam bir proband | Klinisyen (consultand alanı eklenince yeniden değerlendirilmeli) |

## 5. Okunabilirlik gereksinimleri (Peditree kuralları — Tores & Barillot 2001 ölçütleriyle uyumlu)

Standart çizim kurallarını tanımlar ama yerleşimi tanımlamaz. Peditree'nin kendi sert kuralları:

1. Semboller çakışmaz. (mevcut invariant)
2. Partnerler mümkünse bitişik; değilse birliktelik çizgisi başka hiçbir çizgiyle **aynı hizaya düşmez, ona değmez**
   ve kesişimler açıkça "atlama" (line jump) ile gösterilir. (yeni okunabilirlik katmanı)
3. Kardeşler bitişik ve doğum sırasında; evlenerek gelen eş kardeş grubunun içine/ucuna girebilir.
4. Ebeveyn çifti çocuklarının üstünde ortalanır; iniş çizgisi o çiftin kendi çizgisinin ortasından iner.
5. Her bağlantı çizgisinin bir sahibi (birliktelik) vardır; farklı sahiplerin çizgileri birbirine bağlıymış gibi
   görünmez (T-kesişim, üst üste binme, sessiz kesişim yasak).
6. Kuşaklar yatay satırlardır; daha eski kuşak üstte.
7. Dışa aktarma ekrandaki ilişkilerle birebir aynıdır; hiçbir kişi, çizgi veya lejant kırpılmaz; seçim vurgusu gibi
   arayüz durumları dosyaya geçmez.

## 6. Kapsam dışı

HPO tabanlı tanı, genotipten hastalık tahmini, ACMG/AMP sınıflandırması, otomatik kalıtım analizi, danışmanlık önerisi,
OMIM/ClinVar entegrasyonu, harici yapay zekâ servisleri, hasta yönetim modülleri. Klinik durum/etkilenmişlik/taşıyıcılık
yalnızca **çizim bilgisi** olarak tutulur; bunlardan otomatik tıbbi sonuç çıkarılmaz.
