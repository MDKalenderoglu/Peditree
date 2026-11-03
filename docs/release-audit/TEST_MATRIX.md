# Test matrix

**Environment:** Apple M5 Pro, macOS 27; Node 24.18.0; Vitest 4.1.12, with jsdom 26 for screen
tests; Vite 8; Chromium in the Claude desktop preview for manual checks. 2026-11-02.

**Statuses:** PASS (ran and passed) · FAIL · BLOCKED · NOT TESTED · N/A. Only what actually ran is
marked PASS.

## Automated gates

| Check | Command | Result | Status |
|---|---|---|---|
| Unit + screen tests | `npx vitest run` | 72 files; 1046 passed, 2 expected-fail (documented known issues) | PASS |
| Lint | `npx eslint .` | 0 problems | PASS |
| Production build | `npm run build` | Built; JS 703 kB (222 kB gzip), CSS 42 kB; chunk-size warning only | PASS |
| Generation snapshot | `node verify-generations.mjs` | 6/6 cases, no regressions | PASS |
| Layout benchmark | `npm run audit:layout-benchmark` | PCL fully clean on 13/13 fixtures; realistic 100/200/300: 0 invariant / 0 readability violations | PASS |
| Layout fuzz, seed 1 | `npm run audit:layout-fuzz -- --seed 1` | 1000/1000; 0 % invariant, 0 % readability failures; 6/6 named scenarios | PASS |
| Layout fuzz, seed 12345 | `npm run audit:layout-fuzz -- --seed 12345` | 1000/1000; 0 % / 0 %; 6/6 named scenarios | PASS |
| Dependency audit (shipped) | `npm audit --omit=dev` | 0 vulnerabilities | PASS |
| Dependency audit (all) | `npm audit` | 6 moderate, dev tooling only (eslint → minimatch) | PASS with note (A-06) |
| Type check | — | No TypeScript in the project | N/A |
| Mark-collision audit, Turkish and English | `await window.__peditreeMarkAudit()` in the dev preview | `[]` | PASS |

`reports/` side effects of the audits were reverted (`git checkout -- reports/`).

## Clinical acceptance scenarios (`src/__tests__/acceptance.test.js`)

Each scenario is built through the store and then checked for:

- **Valid:** no validation errors, clean layout audit.
- **Geometry:** children below parents, partners on one row, symbols apart.
- **On screen:** every person drawn in the real app.
- **Save → open:** the graph is equal field for field.
- **PED:** every person exported.

Some scenarios also run a full undo/redo round trip.

| # | Scenario | Specific checks | Status |
|---|---|---|---|
| 1 | Simple three generations | Children of the proband's couple; undo/redo | PASS |
| 2 | Autosomal dominant in three generations | One key entry; four affected | PASS |
| 3 | Autosomal recessive, first-cousin parents | Consanguinity derived (`known_supported`, first cousin), F = 1/16; carrier parents | PASS |
| 4 | X-linked | Carrier mother and grandmother; affected son and maternal uncle | PASS |
| 5 | Adoption in / out / by relatives | Kinds in / out / relative; biological link kept; social link separate | PASS |
| 6 | Multiple partners, divorce | Half-sibling under the second union; divorced status; undo/redo | PASS |
| 7 | MZ and DZ twins | Zygosity stored per group | PASS |
| 8 | SAB, SB, TOP, ECT, P | One kind each; no partner for a pregnancy | PASS |
| 9 | Five generations, 60+ people | ≥ 5 generations, ≥ 60 people | PASS |
| 10 | Extended consanguinity (berdel + cousin union) | F = 1/8; second union derived consanguineous | PASS |
| 11 | Several diagnoses | Key = 3 entries; a person with two findings | PASS |
| 12 | Incomplete information | Unknown sex, "n" group, unsure finding, deleted partner → unspecified parent | PASS |
| — | Turkish letters ç ğ ı İ ö ş ü | In the exported SVG, the file round trip, and export without the name | PASS |
| — | Accessible names | Every button, field, radio and ring part named, across toolbar windows, panel and ring | PASS |

Mutation checks:

- Removing two fields on save made all 13 scenarios fail.
- Removing a button's name made the accessibility test fail.

## English interface (`src/__tests__/english.test.js`, 13 tests)

| Check | Status |
|---|---|
| Dictionary has every translated text, keeps placeholders, contains no Turkish letters | PASS |
| First language follows the browser; a choice is kept | PASS |
| Toolbar and windows, every person's panel, every ring part in English: no Turkish, nothing missing | PASS |
| The drawing in English (key, notes, ages, weeks); drawing language set apart in both directions | PASS |
| Notices re-worded on a language change; the drawing does not move | PASS |
| Keyboard letters follow the language | PASS |
| Storage identical in both languages (labels, ages) | PASS |

Mutation checks: 6 deliberate breaks. All caught after the word list was widened. One break had
survived at first, which is why the list was widened.

## Performance

Measured through the store in Node; median of the edits while the family was built.

| People | Full layout ("Arrange") | Edit, median / max | Save | Open | File |
|---|---|---|---|---|---|
| 10 | 3.6 ms | 1.4 / 3.4 ms | 0.1 ms | 1.0 ms | 7 kB |
| 20 | 5.4 ms | 1.0 / 2.1 ms | <0.1 ms | 0.9 ms | 14 kB |
| 50 | 18 ms | 1.6 / 4.7 ms | 0.1 ms | 1.3 ms | 28 kB |
| 100 | 62 ms | 2.2 / 7.4 ms | 0.1 ms | 2.1 ms | 51 kB |

The benchmark gives realistic-100: 36 ms; 200: 178 ms; 300: 600 ms. The budgets in
`pclLayout.test.js` (100 people < 500 ms, 300 < 2 s) pass. Not measured: browser paint time,
memory over long sessions, export time on a phone.

## Manual (Chromium, Claude desktop preview)

| Check | Status |
|---|---|
| English toolbar, drawing, side panel, ring status and twin arcs | PASS (visual) |
| Settings window in English at tablet width (768 px); toolbar wraps to two rows | PASS (visual) |
| Mark-collision audit in English | PASS (`[]`) |

## Not tested or blocked

| Area | Why | Status |
|---|---|---|
| Safari on macOS | The clinician has used the app in Safari throughout development (manual, informal, reported 2026-11-03) | PASS (manual, by the user) |
| Firefox; Safari on iPad | Playwright not installed (needs browser downloads); the app is not online yet for the iPad | NOT TESTED |
| Real screen readers (VoiceOver, NVDA) | Not available in this environment | NOT TESTED |
| Real printing, PDF on paper | No printer | NOT TESTED |
| Live deployment headers (CSP) | No deployment allowed in the audit | BLOCKED |
| Clinician usability (three-generation pedigree without help) | Needs people | NOT TESTED |
| Multiple tabs | By design each tab has its own session; not exercised | NOT TESTED |
| Storage quota exhaustion in a real browser | Covered in jsdom (`auditFixes.test.js` autosave failure notice), not in a real browser | PASS (simulated) |
