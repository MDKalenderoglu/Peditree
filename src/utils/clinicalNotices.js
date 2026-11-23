/**
 * clinicalNotices.js — turns validation output into what a clinician should
 * read: plain Turkish, pedigree numbers instead of internal ids, no purely
 * informational lines, no duplicates. Display only — the underlying issues
 * (and the export gate that uses them) are untouched.
 */
import { computePedigreeIds } from './pedigreeNumbering';
import { t, tk, shownLabel } from '../i18n';

/** The issue codes rewritten for the clinician (BY_CODE below). */
export const rewrittenCodes = () => Object.keys(BY_CODE);

// what a clinician can do about a drawing that came out wrong, and about data that should never occur
const ARRANGE = tk('Üst çubuktaki Konumlandır ile çizimi yeniden düzenlemeyi deneyin; düzelmezse dosyayı kaydedip Geri bildirim ile bildirin.');
const REPORT = tk('Bu durum normalde oluşmamalıdır; dosyayı kaydedip Geri bildirim ile bildirin.');
const drawing = (text) => (c) => `${t(text, c)} ${t(ARRANGE)}`;
const data = (c) => `${t('Pedigri verisinde bir tutarsızlık bulundu ({who}).', c)} ${t(REPORT)}`;

/**
 * Rewrite rules for issue codes whose raw message is technical: every code the
 * graph and layout audits write in English (graphIntegrity.js,
 * layoutIntegrity.js) has one, so none reaches the clinician as a developer's
 * note (2026-11-23: "…draw overlapping child-connector rails…" was shown).
 * c = { pair, pair2, who } — the couples and people the issue names.
 */
const BY_CODE = {
  // layout (layoutIntegrity.js)
  SIBSHIP_BUS_OVERLAP: drawing('{pair} ile {pair2} çiftlerinin çocuklarını gösteren çizgiler aynı yükseklikte üst üste biniyor; hangi çocuğun hangi çifte ait olduğu karışabilir.'),
  UNRELATED_NODE_IN_CHILD_FOOTPRINT: drawing('{who}, {pair} çiftinin çocuklarını gösteren çizginin tam üstünde duruyor; bu çocukların anne ya da babası sanılabilir.'),
  EDGE_THROUGH_NODE: drawing('Bir çizgi {who} sembolünün içinden geçiyor; bu kişiyle ilgisi olmayan bir bağ gibi okunabilir.'),
  PARTNER_Y_MISMATCH: drawing('{pair} çiftinin eşleri aynı satıra çizilemedi.'),
  SIBLING_Y_MISMATCH: drawing('{pair} çiftinin çocukları aynı satıra çizilemedi.'),
  DUPLICATE_NODE_POSITION: drawing('{who} aynı yere çizildi; semboller üst üste biniyor.'),
  MISSING_LAYOUT_NODE: drawing('{who} çizimde gösterilemedi.'),
  INVALID_NODE_POSITION: drawing('{who} çizimde bir yere yerleştirilemedi.'),
  UNION_EDGE_DANGLING: drawing('{pair} çiftinin eş çizgisi bir uca bağlanamadı.'),
  EDGE_INVALID_COORDINATE: drawing('Çizimdeki bir çizgi yerleştirilemedi.'),
  NO_PARENT_CHILD_EDGES: drawing('Çizimde anne-babayı çocuklara bağlayan çizgiler çizilemedi.'),
  // graph (graphIntegrity.js)
  CHILD_MULTI_UNION: (c) => t('{who}, birden fazla anne-baba çiftinin çocuğu olarak kayıtlı; bir kişinin yalnızca bir biyolojik anne-babası olabilir. Fazla bağı kaldırın; evlat edinme ya da üvey ebeveynlik kişinin panelindeki Evlat edinme bölümüyle ayrıca gösterilir.', c),
  SIBLING_GENERATION_INCONSISTENT: (c) => `${t('{pair} çiftinin çocukları farklı kuşaklarda görünüyor.', c)} ${t(REPORT)}`,
  PARTNER_GENERATION_INCONSISTENT: (c) => t('{pair} çiftinin eşleri farklı kuşaklarda görünüyor. Farklı kuşaktan bir evlilikse (örneğin dayı–yeğen) bunun için eşler arasındaki çizgi kullanılır; değilse kişilerin anne-babalarını kontrol edin.', c),
  DUPLICATE_INDIVIDUAL_ID: data, DUPLICATE_UNION_ID: data, UNION_PARTNER_MISSING: data, UNION_SELF_PARTNER: data,
  PCR_MISSING_UNION: data, PCR_MISSING_CHILD: data, ORDERING_ORPHAN_UNION: data, ORDERING_STALE_TOKEN: data,
  ORDERING_MISSING_CHILD: data, CONDITION_ID_UNLABELED: data,
  CONSANGUINITY_UNRESOLVED: ({ pair }) => t('{pair}: akraba evliliği işaretli, ancak ortak atalar çizimde yer almıyor. Çift çizgi gösterilmektedir; ortak ataları çizmek için eşler arasındaki çizgiye tıklayıp akrabalık derecesini ve yolunu seçin.', { pair }),
  CONSANGUINITY_STATUS_MISSING: ({ pair }) => t('{pair}: akraba evliliği bilgisi eksik.', { pair }),
  // a soft note (clinician decision 2026-11-01): no proband is normal in carrier screening or prenatal counselling
  PROBAND_MISSING: () => t('Proband işaretlenmemiş. Ailenin incelenmesine yol açan etkilenmiş bir kişi varsa Durum → Proband ile işaretleyin; böyle bir kişi yoksa (örneğin taşıyıcılık taramasında) bu not kapatılabilir.'),
};

/**
 * @param {{ errorIssues, warningIssues, warnings }} sources — each an array
 *   of { item, _warningId } (withStableIdsExcludingDismissed output)
 * @param {{ nodes, individuals, unions }} pedigreeData
 * @returns {Array<{ text, level: 'error'|'warning', ids: string[] }>}
 */
/**
 * People and couples named the way the clinician reads them: pedigree
 * numbers (II-1), never internal ids. Also used for the export messages.
 * @returns {{ nameOf, unionName, plain }}
 */
export function clinicalNamer(pedigreeData) {
  const pids = computePedigreeIds(pedigreeData.nodes || []);
  const person = new Map((pedigreeData.individuals || []).map((i) => [i.id, i]));
  const nameOf = (id) => pids.get(id)?.displayId || person.get(id)?.displayLabel || shownLabel(person.get(id)?.label) || t('bir kişi');
  const unionName = (uid) => {
    const u = (pedigreeData.unions || []).find((x) => x.id === uid);
    return u ? t('{a} ile {b}', { a: nameOf(u.partners[0]), b: nameOf(u.partners[1]) }) : t('bir çift');
  };
  const knownIds = [...person.keys(), ...(pedigreeData.unions || []).map((u) => u.id)].sort((a, b) => b.length - a.length);
  const plain = (text) => {
    let out = String(text)
      .replace(/^(Uyarı|Hata|Warning|Error):\s*/, '')
      .replace(/\s*\((reported_unresolved|known_supported|[a-z]+_[a-z_]+)\)/g, '')
      .replace(/Union\s+'?([A-Za-z0-9_]+)'?/g, (_, uid) => unionName(uid))
      .replace(/"([A-Za-z0-9_]+)"|'([A-Za-z0-9_]+)'/g, (m, a, b) => (person.has(a || b) ? nameOf(a || b) : m));
    // bare ids only when they look like ids (an underscore or a digit): a word
    // such as "proband" or "mother" in a sentence is not a person's id
    for (const id of knownIds.filter((x) => /[_\d]/.test(x))) {
      if (!out.includes(id)) continue;
      const name = person.has(id) ? nameOf(id) : unionName(id);
      out = out.replace(new RegExp(`\\b${id}\\b`, 'g'), name);
    }
    return out;
  };
  return { nameOf, unionName, plain };
}

export function clinicalNotices({ errorIssues = [], warningIssues = [], warnings = [] }, pedigreeData) {
  const { nameOf, unionName, plain } = clinicalNamer(pedigreeData);
  const out = [];
  const seen = new Map();
  const push = (text, level, id) => {
    if (seen.has(text)) { seen.get(text).ids.push(id); return; }
    const n = { text, level, ids: [id] };
    seen.set(text, n);
    out.push(n);
  };
  const unionIds = new Set((pedigreeData.unions || []).map((u) => u.id));
  const personIds = new Set((pedigreeData.individuals || []).map((i) => i.id));
  const fromIssue = ({ item, _warningId }, level) => {
    const rule = BY_CODE[item.code];
    const ids = item.ids || [];
    const uids = ids.filter((x) => unionIds.has(x));
    const people = [...new Set(ids.filter((x) => personIds.has(x)))].map(nameOf);
    const c = {
      pair: uids[0] ? unionName(uids[0]) : t('Bir çift'),
      pair2: uids[1] ? unionName(uids[1]) : t('bir çift'),
      who: people.length ? people.join(', ') : t('bir kişi'),
    };
    push(rule ? rule(c) : plain(item.message), level, _warningId);
  };
  errorIssues.forEach((x) => fromIssue(x, 'error'));
  warningIssues.forEach((x) => fromIssue(x, 'warning'));
  for (const { item, _warningId } of warnings) {
    const text = String(item);
    if (/^(Bilgi|Note):/.test(text)) continue; // informational: nothing for the clinician to do
    // the degree-missing line says the same as CONSANGUINITY_UNRESOLVED
    if (/derece seçilmemiş|no degree chosen/.test(text) && warningIssues.some((w) => w.item.code === 'CONSANGUINITY_UNRESOLVED')) continue;
    push(plain(text), /^(Hata|Error):/.test(text) ? 'error' : 'warning', _warningId);
  }
  return out;
}
