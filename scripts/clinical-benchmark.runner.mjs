/**
 * clinical-benchmark.runner.mjs — measures every case of the Clinical
 * Usability Benchmark (src/audit/clinicalBenchmark.js) with the default
 * engine (PCL) and writes reports/clinical-benchmark-<label>.{json,md}.
 */
import { it, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { CLINICAL_BENCHMARK } from '../src/audit/clinicalBenchmark.js';
import { caseDocument, measureDrawing, measureEdit } from '../src/audit/clinicalBenchmarkMetrics.js';
import { computePclLayout } from '../src/layout/pcl/index.js';
import { computeStableLayout, affectedPeople } from '../src/layout/pcl/incremental.js';
import * as ops from '../src/graph/ops.js';

it('clinical usability benchmark', () => {
  ['log', 'warn', 'table', 'info'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {}));
  const label = process.env.BENCH_LABEL || 'current';
  const commit = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'unknown'; } })();
  const dirty = (() => { try { return execSync('git status --porcelain -- src').toString().trim() ? ' (+ uncommitted src changes)' : ''; } catch { return ''; } })();
  const cases = [];
  for (const c of CLINICAL_BENCHMARK) {
    const doc = caseDocument(c);
    const times = [];
    let layout = null;
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now();
      layout = computePclLayout(doc.graph);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const drawing = measureDrawing(doc, layout);
    const edits = c.edits.map(([name, run]) => ({ name, ...measureEdit(doc, layout, run, { ops, computeStableLayout, affectedPeople }) }));
    cases.push({ id: c.id, band: c.band, name: c.name, layoutMs: Math.round(times[2] * 10) / 10, ...drawing, edits });
  }
  const report = { label, commit: commit + dirty, node: process.version, generatedAt: new Date().toISOString(), engine: 'pcl', cases };
  mkdirSync(join(process.cwd(), 'reports'), { recursive: true });
  writeFileSync(join(process.cwd(), 'reports', `clinical-benchmark-${label}.json`), JSON.stringify(report, null, 2));

  const yes = (arr) => (arr.length ? `**${arr.length}** (${[...new Set(arr)].join(', ')})` : '0');
  const L = [`# Klinik Kullanılabilirlik Benchmark'ı — ${label}`, '',
    `Commit: \`${report.commit}\` · Node ${report.node} · ${report.generatedAt} · motor: PCL`, '',
    'Vakalar: `src/audit/clinicalBenchmark.js` (elle tanımlı, deterministik). Ölçümler: `src/audit/clinicalBenchmarkMetrics.js`.', '',
    '## 1. Semantik ve geometrik güvenlik', '',
    '| vaka | kişi / kuşak | belge hatası | bütünlük hatası | uyarı paneli (Hata/Uyarı) | ortak atasız akraba evliliği | geometri değişmezi | bağlantı ihlali | yanlış sahipli çocuk çizgisi | çizgisiz çocuk | doğum sırası ihlali (açık sıra / bilinen yaş) | izinli yeniden sıralama (yaş bilinmiyor / akraba evliliğindeki eş) |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const c of cases) {
    L.push(`| ${c.id} ${c.name} | ${c.people} / ${c.generations} | ${yes(c.semantics.documentErrors)} | ${yes(c.semantics.integrityErrors)} | ${yes(c.semantics.appWarnings)} | ${yes(c.semantics.unsupportedConsanguinity)} | ${yes(c.geometry.invariants)} | ${yes(c.geometry.connectorViolations)} | ${yes(c.geometry.wrongOwner)} | ${yes(c.geometry.missingStem)} | ${yes(c.birthOrderViolations)} | ${c.siblingsReordered.length ? c.siblingsReordered.length + ' (' + c.siblingsReordered.join(', ') + ')' : '0'} |`);
  }
  L.push('', '## 2. Okunabilirlik (açılışta görülen çizim)', '',
    'Merkezleme: çiftin orta noktası ile çocuklarının aralığının ortası arasındaki fark (px; bir kardeş slotu 90 px). Uzun eş çizgisi: > 3 slot. Yana sarkan: çiftin orta noktası çocuk aralığının dışında (> 1 px; parantezde > 5 px).', '',
    '| vaka | çocuklu çift | ortalı (< 10 px) / 10–45 px / > 45 px | ort. / maks. kayma (px) | yana sarkan (> 5 px) | uzun eş çizgisi (en uzun px) | kesişim (atlamalı / atlamasız) | üst üste kardeşlik çizgisi | başka partnerin üstünden çizgi |',
    '|---|---|---|---|---|---|---|---|---|');
  for (const c of cases) {
    const z = c.centring, l = c.lines;
    L.push(`| ${c.id} | ${z.couplesWithChildren} | ${z.offsetUnder10} / ${z.offset10to45} / ${z.offsetOver45} | ${z.meanOffsetPx} / ${z.maxCentreOffset} | ${l.sideHang} (${z.sideHangOver5}) | ${l.longUnions} (${l.maxUnionSpan}) | ${l.crossings} / ${l.unmarkedCrossings} | ${l.stackedBuses} | ${l.lineOverOwnPartner} |`);
  }
  L.push('', 'Yarım slottan (45 px) fazla kayık çiftler:', '');
  for (const c of cases) if (c.centring.offCentreCouples.length) L.push(`- ${c.id}: ${c.centring.offCentreCouples.join(', ')}`);
  L.push('', '## 3. Ekran ve baskı (PDF/SVG) okunabilirliği, süre', '',
    'A4 yatay (10 mm kenar boşluğu) sayfaya sığdırıldığında sembol boyu ve en küçük metin; 1200×700 px tuvalde sembol boyu. Eşik önerisi: sembol ≥ 4 mm, metin ≥ 6 pt; ekranda sembol ≥ 20 px.', '',
    '| vaka | çizim (px) | A4: sembol mm / numara pt / en küçük metin pt | ekran: sembol px / numara px | yerleşim süresi (ms, 5 ölçüm medyanı) |',
    '|---|---|---|---|---|');
  for (const c of cases) {
    const g = c.legibility;
    L.push(`| ${c.id} | ${g.widthPx} × ${g.heightPx} | ${g.a4SymbolMm} / ${g.a4LabelPt} / ${g.a4SmallestTextPt} | ${g.screenSymbolPx} / ${g.screenLabelPx} | ${c.layoutMs} |`);
  }
  L.push('', '## 4. Yeni birey eklendikten sonra kararlılık', '',
    'Önceki çizim = vakanın açılış çizimi; düzenleme düzenleme-yerel çizilir (KI-2). Düzenleme bloğu: grafik farkının etkilediği kişiler, kardeşlikleri ve partnerleri.', '',
    '| vaka | düzenleme | düzey | kayan / kişi | blok dışında kayan / blok dışı | maks. kayma (px) | ebeveyn çevrilmesi | eklenen doğum sırası ihlali | ihlal (sonra) | kayık çift / yana sarkan (sonra) | süre (ms) |',
    '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of cases) {
    for (const e of c.edits) {
      if (e.refused) { L.push(`| ${c.id} | ${e.name} | reddedildi: ${e.refused} ||||||||| `); continue; }
      L.push(`| ${c.id} | ${e.name} | ${e.level} | ${e.moved} / ${e.people} | ${e.movedOutsideBlock} / ${e.outsideBlock} | ${e.maxShiftPx} | ${e.parentFlip ? 'EVET' : 'hayır'} | ${e.birthOrderViolationsAdded} | ${e.violationsAfter} | ${e.offCenterAfter} / ${e.sideHangAfter} | ${e.ms} |`);
    }
  }
  writeFileSync(join(process.cwd(), 'reports', `clinical-benchmark-${label}.md`), L.join('\n') + '\n');
  console.info(L.join('\n'));
});
