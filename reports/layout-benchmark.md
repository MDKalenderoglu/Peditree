# Layout Engine Benchmark — clinical stress fixtures

Generated: 2026-10-18T00:18:54.301Z

## recursive — fully clean on 3/13 fixtures

| fixture | invariants | readability (violations) | off-centre / unions | max centre offset | long unions | max union span | crossings | width/person | ms |
|---|---|---|---|---|---|---|---|---|---|
| CS-01 Üç kuşak başlangıç | ✅ | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_T_JUNCTION (4) | 1/3 | 113 | 0 | 225 | 0 | 42.1 | 0.63 |
| CS-02 Ders kitabı OD pedigrisi (4 kuşak, 7 kardeş, gelin/damatlar) | ✅ | ✅ (0) | 0/10 | 35 | 0 | 70 | 0 | 63.7 | 0.3 |
| CS-03 Eşin ebeveynleri de çizili | ✅ | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_T_JUNCTION (8) | 2/5 | 136 | 1 | 272 | 0 | 48.2 | 0.12 |
| CS-04 Ebeveynler birinci kuzen | ✅ | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_CONNECTOR_CROSSING, FOREIGN_T_JUNCTION (7) | 1/4 | 228 | 1 | 456 | 2 | 48.9 | 0.08 |
| CS-05 Çift birinci kuzen evliliği | ✅ | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_CONNECTOR_CROSSING, FOREIGN_T_JUNCTION (22) | 3/5 | 242 | 3 | 484 | 3 | 53.8 | 0.17 |
| CS-06 Üç partner, yarım kardeşler | ✅ | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_T_JUNCTION (5) | 3/4 | 522 | 0 | 140 | 0 | 85.8 | 0.07 |
| CS-07 Harmanlanmış aile (iki tarafın önceki çocukları) | ✅ | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_T_JUNCTION (4) | 1/5 | 182 | 1 | 454 | 0 | 61.4 | 0.07 |
| CS-08 12 çocuklu kardeşlik, her biri evli ve çocuklu | ✅ | ✅ (0) | 0/13 | 35 | 0 | 70 | 0 | 52.7 | 0.15 |
| CS-09 Altı kuşak + her kuşakta yan dal | ✅ | ✅ (0) | 0/11 | 35 | 0 | 70 | 0 | 35.4 | 0.11 |
| CS-10 Tekrarlayan akraba evliliği (2. ve 4. kuşak) | ✅ | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_CONNECTOR_CROSSING, FOREIGN_T_JUNCTION (14) | 2/6 | 314 | 2 | 627 | 3 | 48 | 0.08 |
| CS-11 Berdel (karşılıklı evlilik) | ✅ | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_CONNECTOR_CROSSING, FOREIGN_T_JUNCTION (22) | 2/4 | 285 | 1 | 569 | 2 | 52.2 | 0.07 |
| CS-12 Pedigri çökmesi (iki akrabalık döngüsü) | ✅ | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_CONNECTOR_CROSSING, FOREIGN_T_JUNCTION (10) | 2/6 | 197 | 2 | 394 | 2 | 40.4 | 0.06 |
| CS-13 İki ebeveyn tarafından yarım kardeşler | ✅ | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_T_JUNCTION (3) | 3/3 | 280 | 1 | 559 | 0 | 82.4 | 0.08 |

## legacy — fully clean on 7/13 fixtures

| fixture | invariants | readability (violations) | off-centre / unions | max centre offset | long unions | max union span | crossings | width/person | ms |
|---|---|---|---|---|---|---|---|---|---|
| CS-01 Üç kuşak başlangıç | ✅ | ✅ (0) | 0/3 | 40 | 0 | 70 | 0 | 25.7 | 0.34 |
| CS-02 Ders kitabı OD pedigrisi (4 kuşak, 7 kardeş, gelin/damatlar) | UNRELATED_NODE_IN_CHILD_FOOTPRINT | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_T_JUNCTION (16) | 5/10 | 465 | 0 | 70 | 0 | 56.4 | 0.21 |
| CS-03 Eşin ebeveynleri de çizili | ✅ | ✅ (0) | 0/5 | 40 | 0 | 70 | 0 | 18.1 | 0.07 |
| CS-04 Ebeveynler birinci kuzen | ✅ | ✅ (0) | 0/4 | 30 | 0 | 70 | 0 | 31.1 | 0.06 |
| CS-05 Çift birinci kuzen evliliği | CROSS_BRANCH_UNION_COLLAPSES_ANCESTOR_BLOCKS, EDGE_THROUGH_NON_OWNER_NODE, UNION_LINE_THROUGH_NODE | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_T_JUNCTION (5) | 3/5 | 163 | 1 | 325 | 0 | 35.4 | 0.05 |
| CS-06 Üç partner, yarım kardeşler | EDGE_THROUGH_NON_OWNER_NODE, UNION_LINE_THROUGH_NODE | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_T_JUNCTION (5) | 2/4 | 125 | 0 | 250 | 0 | 41.2 | 0.04 |
| CS-07 Harmanlanmış aile (iki tarafın önceki çocukları) | ✅ | FOREIGN_T_JUNCTION (4) | 2/5 | 90 | 0 | 155 | 0 | 27.7 | 0.04 |
| CS-08 12 çocuklu kardeşlik, her biri evli ve çocuklu | ✅ | ✅ (0) | 0/13 | 0 | 0 | 70 | 0 | 41.4 | 0.23 |
| CS-09 Altı kuşak + her kuşakta yan dal | ✅ | ✅ (0) | 0/11 | 20 | 0 | 70 | 0 | 23.6 | 0.1 |
| CS-10 Tekrarlayan akraba evliliği (2. ve 4. kuşak) | ✅ | ✅ (0) | 1/6 | 75 | 0 | 70 | 0 | 32.9 | 0.08 |
| CS-11 Berdel (karşılıklı evlilik) | CROSS_BRANCH_UNION_COLLAPSES_ANCESTOR_BLOCKS, EDGE_THROUGH_NON_OWNER_NODE, UNION_LINE_THROUGH_NODE | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_T_JUNCTION (5) | 2/4 | 155 | 1 | 310 | 0 | 36.7 | 0.04 |
| CS-12 Pedigri çökmesi (iki akrabalık döngüsü) | ✅ | ✅ (0) | 0/6 | 5 | 0 | 70 | 0 | 15.2 | 0.05 |
| CS-13 İki ebeveyn tarafından yarım kardeşler | EDGE_THROUGH_NON_OWNER_NODE, UNION_LINE_THROUGH_NODE | COLLINEAR_FOREIGN_CONNECTORS, FOREIGN_T_JUNCTION (2) | 0/3 | 45 | 0 | 135 | 0 | 33.8 | 0.02 |
