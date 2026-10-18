# Layout Engine Benchmark — clinical stress fixtures

Generated: 2026-10-18T05:26:18.141Z

## recursive — fully clean on 3/13 fixtures

| fixture | invariants | readability (violations) | off-centre / unions | max centre offset | long unions | max union span | crossings (unmarked / jumped) | stacked buses | width/person | ms |
|---|---|---|---|---|---|---|---|---|---|---|
| CS-01 Üç kuşak başlangıç | ✅ | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_T_JUNCTION (4) | 1/3 | 113 | 0 | 225 | 0 / 0 | 0 | 42.1 | 0.66 |
| CS-02 Ders kitabı OD pedigrisi (4 kuşak, 7 kardeş, gelin/damatlar) | ✅ | ✅ (0) | 0/10 | 35 | 0 | 70 | 0 / 0 | 0 | 63.7 | 0.31 |
| CS-03 Eşin ebeveynleri de çizili | ✅ | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_T_JUNCTION (8) | 2/5 | 136 | 1 | 272 | 0 / 0 | 0 | 48.2 | 0.11 |
| CS-04 Ebeveynler birinci kuzen | ✅ | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_CONNECTOR_CROSSING, FOREIGN_T_JUNCTION (7) | 1/4 | 228 | 1 | 456 | 2 / 0 | 0 | 48.9 | 0.1 |
| CS-05 Çift birinci kuzen evliliği | ✅ | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_CONNECTOR_CROSSING, FOREIGN_T_JUNCTION (22) | 3/5 | 242 | 3 | 484 | 3 / 0 | 1 | 53.8 | 0.11 |
| CS-06 Üç partner, yarım kardeşler | ✅ | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_T_JUNCTION (5) | 3/4 | 522 | 0 | 140 | 0 / 0 | 1 | 85.8 | 0.07 |
| CS-07 Harmanlanmış aile (iki tarafın önceki çocukları) | ✅ | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_T_JUNCTION (4) | 1/5 | 182 | 1 | 454 | 0 / 0 | 0 | 61.4 | 0.06 |
| CS-08 12 çocuklu kardeşlik, her biri evli ve çocuklu | ✅ | ✅ (0) | 0/13 | 35 | 0 | 70 | 0 / 0 | 0 | 52.7 | 0.16 |
| CS-09 Altı kuşak + her kuşakta yan dal | ✅ | ✅ (0) | 0/11 | 35 | 0 | 70 | 0 / 0 | 0 | 35.4 | 0.1 |
| CS-10 Tekrarlayan akraba evliliği (2. ve 4. kuşak) | ✅ | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_CONNECTOR_CROSSING, FOREIGN_T_JUNCTION (14) | 2/6 | 314 | 2 | 627 | 3 / 0 | 1 | 48 | 0.07 |
| CS-11 Berdel (karşılıklı evlilik) | ✅ | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_CONNECTOR_CROSSING, FOREIGN_T_JUNCTION (22) | 2/4 | 285 | 1 | 569 | 2 / 0 | 0 | 52.2 | 0.05 |
| CS-12 Pedigri çökmesi (iki akrabalık döngüsü) | ✅ | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_CONNECTOR_CROSSING, FOREIGN_T_JUNCTION (10) | 2/6 | 197 | 2 | 394 | 2 / 0 | 0 | 40.4 | 0.08 |
| CS-13 İki ebeveyn tarafından yarım kardeşler | ✅ | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_T_JUNCTION (3) | 3/3 | 280 | 1 | 559 | 0 / 0 | 1 | 82.4 | 0.04 |

## legacy — fully clean on 7/13 fixtures

| fixture | invariants | readability (violations) | off-centre / unions | max centre offset | long unions | max union span | crossings (unmarked / jumped) | stacked buses | width/person | ms |
|---|---|---|---|---|---|---|---|---|---|---|
| CS-01 Üç kuşak başlangıç | ✅ | ✅ (0) | 0/3 | 40 | 0 | 70 | 0 / 0 | 0 | 25.7 | 0.33 |
| CS-02 Ders kitabı OD pedigrisi (4 kuşak, 7 kardeş, gelin/damatlar) | UNRELATED_NODE_IN_CHILD_FOOTPRINT | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_T_JUNCTION (16) | 5/10 | 465 | 0 | 70 | 0 / 0 | 4 | 56.4 | 0.21 |
| CS-03 Eşin ebeveynleri de çizili | ✅ | ✅ (0) | 0/5 | 40 | 0 | 70 | 0 / 0 | 0 | 18.1 | 0.1 |
| CS-04 Ebeveynler birinci kuzen | ✅ | ✅ (0) | 0/4 | 30 | 0 | 70 | 0 / 0 | 0 | 31.1 | 0.07 |
| CS-05 Çift birinci kuzen evliliği | CROSS_BRANCH_UNION_COLLAPSES_ANCESTOR_BLOCKS, EDGE_THROUGH_NON_OWNER_NODE, UNION_LINE_THROUGH_NODE | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_T_JUNCTION (5) | 3/5 | 163 | 1 | 325 | 0 / 0 | 1 | 35.4 | 0.05 |
| CS-06 Üç partner, yarım kardeşler | EDGE_THROUGH_NON_OWNER_NODE, UNION_LINE_THROUGH_NODE | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_T_JUNCTION (5) | 2/4 | 125 | 0 | 250 | 0 / 0 | 1 | 41.2 | 0.04 |
| CS-07 Harmanlanmış aile (iki tarafın önceki çocukları) | ✅ | FOREIGN_T_JUNCTION (4) | 2/5 | 90 | 0 | 155 | 0 / 0 | 0 | 27.7 | 0.04 |
| CS-08 12 çocuklu kardeşlik, her biri evli ve çocuklu | ✅ | ✅ (0) | 0/13 | 0 | 0 | 70 | 0 / 0 | 0 | 41.4 | 0.12 |
| CS-09 Altı kuşak + her kuşakta yan dal | ✅ | ✅ (0) | 0/11 | 20 | 0 | 70 | 0 / 0 | 0 | 23.6 | 0.09 |
| CS-10 Tekrarlayan akraba evliliği (2. ve 4. kuşak) | ✅ | ✅ (0) | 1/6 | 75 | 0 | 70 | 0 / 0 | 0 | 32.9 | 0.09 |
| CS-11 Berdel (karşılıklı evlilik) | CROSS_BRANCH_UNION_COLLAPSES_ANCESTOR_BLOCKS, EDGE_THROUGH_NON_OWNER_NODE, UNION_LINE_THROUGH_NODE | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_T_JUNCTION (5) | 2/4 | 155 | 1 | 310 | 0 / 0 | 1 | 36.7 | 0.04 |
| CS-12 Pedigri çökmesi (iki akrabalık döngüsü) | ✅ | ✅ (0) | 0/6 | 5 | 0 | 70 | 0 / 0 | 0 | 15.2 | 0.05 |
| CS-13 İki ebeveyn tarafından yarım kardeşler | EDGE_THROUGH_NON_OWNER_NODE, UNION_LINE_THROUGH_NODE | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_T_JUNCTION (2) | 0/3 | 45 | 0 | 135 | 0 / 0 | 0 | 33.8 | 0.02 |

## pcl — fully clean on 13/13 fixtures

| fixture | invariants | readability (violations) | off-centre / unions | max centre offset | long unions | max union span | crossings (unmarked / jumped) | stacked buses | width/person | ms |
|---|---|---|---|---|---|---|---|---|---|---|
| CS-01 Üç kuşak başlangıç | ✅ | ✅ (0) | 0/3 | 33 | 0 | 134 | 0 / 0 | 0 | 38.6 | 2.81 |
| CS-02 Ders kitabı OD pedigrisi (4 kuşak, 7 kardeş, gelin/damatlar) | ✅ | ✅ (0) | 0/10 | 10 | 0 | 84 | 0 / 0 | 0 | 49.4 | 3.93 |
| CS-03 Eşin ebeveynleri de çizili | ✅ | ✅ (0) | 0/5 | 35 | 0 | 131 | 0 / 0 | 0 | 37.9 | 1.6 |
| CS-04 Ebeveynler birinci kuzen | ✅ | ✅ (0) | 0/4 | 0 | 0 | 70 | 0 / 0 | 0 | 25.4 | 2.1 |
| CS-05 Çift birinci kuzen evliliği | ✅ | ✅ (0) | 0/5 | 34 | 1 | 477 | 0 / 2 | 0 | 34 | 1.67 |
| CS-06 Üç partner, yarım kardeşler | ✅ | ✅ (0) | 2/4 | 58 | 1 | 586 | 0 / 0 | 0 | 62.4 | 0.53 |
| CS-07 Harmanlanmış aile (iki tarafın önceki çocukları) | ✅ | ✅ (0) | 1/5 | 59 | 0 | 186 | 0 / 0 | 0 | 36.3 | 0.59 |
| CS-08 12 çocuklu kardeşlik, her biri evli ve çocuklu | ✅ | ✅ (0) | 0/13 | 1 | 0 | 72 | 0 / 0 | 0 | 52.6 | 2.41 |
| CS-09 Altı kuşak + her kuşakta yan dal | ✅ | ✅ (0) | 0/11 | 5 | 0 | 74 | 0 / 0 | 0 | 31.6 | 1.41 |
| CS-10 Tekrarlayan akraba evliliği (2. ve 4. kuşak) | ✅ | ✅ (0) | 0/6 | 3 | 0 | 75 | 0 / 0 | 0 | 24.8 | 2.14 |
| CS-11 Berdel (karşılıklı evlilik) | ✅ | ✅ (0) | 0/4 | 43 | 1 | 561 | 0 / 2 | 0 | 46.8 | 0.65 |
| CS-12 Pedigri çökmesi (iki akrabalık döngüsü) | ✅ | ✅ (0) | 0/6 | 5 | 0 | 77 | 0 / 0 | 0 | 19.7 | 1.03 |
| CS-13 İki ebeveyn tarafından yarım kardeşler | ✅ | ✅ (0) | 0/3 | 45 | 1 | 525 | 0 / 0 | 0 | 66.8 | 0.25 |

## Realistic large pedigrees (synthetic, src/audit/largePedigrees.js)

Median of 3 runs after a warm-up, in the vitest/node process. Product budgets: 100 people < 500 ms, 300 people < 2 s.

| engine | case | people | cousin loops | invariant violations | readability violations | off-centre / couples with children | max centre offset | crossings (unmarked / jumped) | width | ms |
|---|---|---|---|---|---|---|---|---|---|---|
| recursive | realistic-100 | 105 | 2 | ✅ 0 | 118 | 5/22 | 2704 | 46 / 0 | 7804 | 0.3 |
| recursive | realistic-200 | 208 | 3 | ✅ 0 | 553 | 11/45 | 4774 | 256 / 0 | 15700 | 0.5 |
| recursive | realistic-300 | 312 | 4 | ✅ 0 | 1007 | 18/68 | 8357 | 499 / 0 | 22271 | 0.6 |
| legacy | realistic-100 | 105 | 2 | 73 | 140 | 9/22 | 4820 | 0 / 0 | 5460 | 0.2 |
| legacy | realistic-200 | 208 | 3 | 369 | 998 | 34/45 | 7605 | 0 / 0 | 11130 | 0.4 |
| legacy | realistic-300 | 312 | 4 | 918 | 2746 | 52/68 | 16360 | 0 / 0 | 19000 | 0.5 |
| pcl | realistic-100 | 105 | 2 | ✅ 0 | ✅ 0 | 7/22 | 918 | 0 / 17 | 5310 | 32.4 |
| pcl | realistic-200 | 208 | 3 | ✅ 0 | ✅ 0 | 37/45 | 2800 | 0 / 77 | 10322 | 166.6 |
| pcl | realistic-300 | 312 | 4 | ✅ 0 | ✅ 0 | 50/68 | 2572 | 0 / 59 | 14765.5 | 533.8 |
