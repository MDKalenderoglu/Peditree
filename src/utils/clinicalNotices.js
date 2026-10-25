/**
 * clinicalNotices.js — turns validation output into what a clinician should
 * read: plain Turkish, pedigree numbers instead of internal ids, no purely
 * informational lines, no duplicates. Display only — the underlying issues
 * (and the export gate that uses them) are untouched.
 */
import { computePedigreeIds } from './pedigreeNumbering';

/** Rewrite rules for issue codes whose raw message is technical. */
const BY_CODE = {
  CONSANGUINITY_UNRESOLVED: (pair) => `${pair}: akraba evliliği işaretli, ortak ataları çizimde yok. Çift çizgi gösteriliyor; ortak ataları çizmek için çiftin arasındaki çizgiye tıklayıp derece ve yolu seçin.`,
  CONSANGUINITY_STATUS_MISSING: (pair) => `${pair}: akraba evliliği bilgisi eksik.`,
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
  const nameOf = (id) => pids.get(id)?.displayId || person.get(id)?.displayLabel || person.get(id)?.label || 'bir kişi';
  const unionName = (uid) => {
    const u = (pedigreeData.unions || []).find((x) => x.id === uid);
    return u ? `${nameOf(u.partners[0])} ile ${nameOf(u.partners[1])}` : 'bir çift';
  };
  const knownIds = [...person.keys(), ...(pedigreeData.unions || []).map((u) => u.id)].sort((a, b) => b.length - a.length);
  const plain = (text) => {
    let t = String(text)
      .replace(/^(Uyarı|Hata):\s*/, '')
      .replace(/\s*\((reported_unresolved|known_supported|[a-z]+_[a-z_]+)\)/g, '')
      .replace(/Union\s+'?([A-Za-z0-9_]+)'?/g, (_, uid) => unionName(uid))
      .replace(/"([A-Za-z0-9_]+)"|'([A-Za-z0-9_]+)'/g, (m, a, b) => (person.has(a || b) ? nameOf(a || b) : m));
    // bare ids only when they look like ids (an underscore or a digit): a word
    // such as "proband" or "mother" in a sentence is not a person's id
    for (const id of knownIds.filter((x) => /[_\d]/.test(x))) {
      if (!t.includes(id)) continue;
      const name = person.has(id) ? nameOf(id) : unionName(id);
      t = t.replace(new RegExp(`\\b${id}\\b`, 'g'), name);
    }
    return t;
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
    push(rule ? rule(uid ? unionName(uid) : 'Bir çift') : plain(item.message), level, _warningId);
  };
  errorIssues.forEach((x) => fromIssue(x, 'error'));
  warningIssues.forEach((x) => fromIssue(x, 'warning'));
  for (const { item, _warningId } of warnings) {
    const text = String(item);
    if (/^Bilgi:/.test(text)) continue; // informational: nothing for the clinician to do
    // the degree-missing line says the same as CONSANGUINITY_UNRESOLVED
    if (/derece seçilmemiş/.test(text) && warningIssues.some((w) => w.item.code === 'CONSANGUINITY_UNRESOLVED')) continue;
    push(plain(text), /^Hata:/.test(text) ? 'error' : 'warning', _warningId);
  }
  return out;
}
