/**
 * clinicalNotices.js — turns validation output into what a clinician should
 * read: plain Turkish, pedigree numbers instead of internal ids, no purely
 * informational lines, no duplicates. Display only — the underlying issues
 * (and the export gate that uses them) are untouched.
 */
import { computePedigreeIds } from './pedigreeNumbering';
import { t, shownLabel } from '../i18n';

/** Rewrite rules for issue codes whose raw message is technical. */
const BY_CODE = {
  CONSANGUINITY_UNRESOLVED: (pair) => t('{pair}: akraba evliliği işaretli, ancak ortak atalar çizimde yer almıyor. Çift çizgi gösterilmektedir; ortak ataları çizmek için eşler arasındaki çizgiye tıklayıp akrabalık derecesini ve yolunu seçin.', { pair }),
  CONSANGUINITY_STATUS_MISSING: (pair) => t('{pair}: akraba evliliği bilgisi eksik.', { pair }),
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
  const { unionName, plain } = clinicalNamer(pedigreeData);
  const out = [];
  const seen = new Map();
  const push = (text, level, id) => {
    if (seen.has(text)) { seen.get(text).ids.push(id); return; }
    const n = { text, level, ids: [id] };
    seen.set(text, n);
    out.push(n);
  };
  const fromIssue = ({ item, _warningId }, level) => {
    const rule = BY_CODE[item.code];
    const uid = (item.ids || []).find((x) => (pedigreeData.unions || []).some((u) => u.id === x));
    push(rule ? rule(uid ? unionName(uid) : t('Bir çift')) : plain(item.message), level, _warningId);
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
