# Peditree dokümanları

Güncel durum için bu klasördeki PEDITREE_* dokümanları esas alınır. [`archive/`](archive/) klasöründeki `PEDIGREE_*.md`, `AUDIT_PEDIGREE_APP.md`,
`KNOWN_LIMITATIONS.md` vb. tarihsel kayıttır; bazı ifadeleri artık güncel değildir (bkz. denetim raporu §2.8).

| Doküman | İçerik |
|---|---|
| [PEDITREE_AUDIT_REPORT.md](PEDITREE_AUDIT_REPORT.md) | Faz 0/1 denetimi: baseline, bulgular (P0–P3), kök nedenler, ürün kararları, uygulama planı |
| [PEDITREE_CLINICAL_REQUIREMENTS.md](PEDITREE_CLINICAL_REQUIREMENTS.md) | NSGC 2008/2022/2025'e göre semboller, çizgiler, ilişkiler; standart vs tercih |
| [PEDITREE_LAYOUT_ARCHITECTURE.md](PEDITREE_LAYOUT_ARCHITECTURE.md) | Yerleşim motoru kararı (PCL, Faz 3'ten beri varsayılan), alternatifler, kabul kriterleri, ölçülmüş sonuçlar ve kalan riskler |
| [PEDITREE_STRESS_TEST_MATRIX.md](PEDITREE_STRESS_TEST_MATRIX.md) | Normal, karmaşık ve adversarial senaryolar; test durumu |
| [PEDITREE_KNOWN_ISSUES.md](PEDITREE_KNOWN_ISSUES.md) | Açık/kapatılmış sorun kayıtları (KI-…), öncelik, koruma testleri, çıkış ölçütleri |
| [PEDITREE_UX_REVIEW.md](PEDITREE_UX_REVIEW.md) | Kalıcı UX gereksinimleri (akıllı ilişki görselleştirmesi, düzenleme kararlılığı) ve kabul kriterleri |
| [PEDITREE_DATA_MODEL_V2.md](PEDITREE_DATA_MODEL_V2.md) | Faz 2b: mevcut veri modelinin değerlendirmesi, graph-first şema v2, göç ve kalıcı kimlikler |
| [PEDITREE_COMPARISON_NOTES.md](PEDITREE_COMPARISON_NOTES.md) | Diğer pedigri araçları: tablet desteği ve makaledeki karşılaştırma tablosu için notlar (2026-11-03) |
| [paper/PEDITREE_PAPER_OUTLINE.md](paper/PEDITREE_PAPER_OUTLINE.md) | Makale taslak planı: dergi seçenekleri, bölümler ve kanıtları, kullanılabilirlik çalışması tasarımı, karşılaştırma tablosu (2026-11-14) |
| [release-audit/](release-audit/RELEASE_AUDIT.md) | Yayın öncesi denetim (2026-11-02): bulgular, NSGC uyum matrisi, güvenlik ve gizlilik, test matrisi, yayın listesi; karar NO-GO (kanıt ve onay eksikleri) |

Ölçüm komutları:

```bash
npm test
npm run audit:layout-fuzz -- --cases 1000
npm run audit:layout-benchmark
npm run audit:layout-fuzz -- --packer recursive   # eski motorlarla karşılaştırma (recursive | legacy | pcl)
```

Ekran görüntüleri: `screenshots/audit/` (Faz 1 baseline), `screenshots/faz3/` (recursive ↔ PCL karşılaştırması).
