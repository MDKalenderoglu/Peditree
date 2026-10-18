# Peditree dokümanları

Güncel durum için bu klasördeki PEDITREE_* dokümanları esas alınır. Kök dizindeki `PEDIGREE_*.md`, `AUDIT_PEDIGREE_APP.md`,
`KNOWN_LIMITATIONS.md` vb. tarihsel kayıttır; bazı ifadeleri artık güncel değildir (bkz. denetim raporu §2.8).

| Doküman | İçerik |
|---|---|
| [PEDITREE_AUDIT_REPORT.md](PEDITREE_AUDIT_REPORT.md) | Faz 0/1 denetimi: baseline, bulgular (P0–P3), kök nedenler, ürün kararları, uygulama planı |
| [PEDITREE_CLINICAL_REQUIREMENTS.md](PEDITREE_CLINICAL_REQUIREMENTS.md) | NSGC 2008/2022/2025'e göre semboller, çizgiler, ilişkiler; standart vs tercih |
| [PEDITREE_LAYOUT_ARCHITECTURE.md](PEDITREE_LAYOUT_ARCHITECTURE.md) | Yerleşim motoru kararı (PCL, Faz 3'ten beri varsayılan), alternatifler, kabul kriterleri, ölçülmüş sonuçlar ve kalan riskler |
| [PEDITREE_STRESS_TEST_MATRIX.md](PEDITREE_STRESS_TEST_MATRIX.md) | Normal, karmaşık ve adversarial senaryolar; test durumu |

Ölçüm komutları:

```bash
npm test
npm run audit:layout-fuzz -- --cases 1000
npm run audit:layout-benchmark
npm run audit:layout-fuzz -- --packer recursive   # eski motorlarla karşılaştırma (recursive | legacy | pcl)
```

Ekran görüntüleri: `screenshots/audit/` (Faz 1 baseline), `screenshots/faz3/` (recursive ↔ PCL karşılaştırması).
