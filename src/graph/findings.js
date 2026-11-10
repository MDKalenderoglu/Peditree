/**
 * findings.js — operations on a person's findings and on the findings key
 * (conditionKey.js). Each is one atomic graph operation (one undo step).
 *
 * A person's `affected` follows their findings when findings decide it:
 * an affected finding sets it (`affectedByFindings` remembers that a finding
 * did), and when no affected finding is left it is cleared again — only if a
 * finding had set it. An "affected" the clinician set by hand is never
 * cleared by findings (audit 2026-10-25: it used to be lost when a finding
 * was made carrier); a hand toggle takes over (ops.updatePerson).
 */
import { commit, block } from './ops';
import { normalizeAge } from '../utils/age';
import { normLabel, keyEntry, styleTaken, keyFull, KEY_FULL_MESSAGE, rightSideFindings, REGIONS, FILLS } from './conditionKey';
import { t } from '../i18n';

// 'unknown': the clinician is not sure (clinician decision 2026-10-25:
// written as unknown, never as "no", e.g. in a PED file)
const STATUSES = ['affected', 'carrier', 'unknown', 'none'];

function applyStatus(person, label, status) {
  const conds = Array.isArray(person.conditions) ? person.conditions : [];
  const rest = conds.filter((c) => normLabel(c.label) !== normLabel(label));
  const existing = conds.find((c) => normLabel(c.label) === normLabel(label));
  const next = status === 'none' ? rest : [...rest, { ...(existing || {}), label: existing ? existing.label : label.trim(), status }];
  person.conditions = next;
  const anyAffected = next.some((c) => c.status === 'affected');
  if (anyAffected) {
    if (!person.affected) person.affectedByFindings = true;
    person.affected = true;
  } else if (person.affectedByFindings) {
    delete person.affectedByFindings;
    person.affected = false;
  }
}

/** Set one finding of a person: 'affected' | 'carrier' | 'none' (removes it). */
export function setFindingStatus(doc, personId, label, status) {
  return commit(doc, (d) => {
    if (!STATUSES.includes(status)) block(`Bilinmeyen durum: ${status}`);
    if (!String(label || '').trim()) block(t('Bulgunun adı boş olamaz.'));
    const p = d.graph.individuals.find((i) => i.id === personId);
    if (!p) block(t('Kişi çizimde bulunamadı.'));
    if (status !== 'none' && !keyEntry(d.graph.conditionKey, label) && keyFull(d.graph.conditionKey)) block(t(KEY_FULL_MESSAGE));
    applyStatus(p, label, status);
  });
}

/**
 * A new (or existing) finding for a person, affected; `style` = { region,
 * fill } chosen by the clinician for a finding the key does not have yet.
 */
export function addFinding(doc, personId, label, style = null) {
  return commit(doc, (d) => {
    const name = String(label || '').trim();
    if (!name) block(t('Bulgunun adı boş olamaz.'));
    const p = d.graph.individuals.find((i) => i.id === personId);
    if (!p) block(t('Kişi çizimde bulunamadı.'));
    d.graph.conditionKey = d.graph.conditionKey || [];
    if (!keyEntry(d.graph.conditionKey, name) && keyFull(d.graph.conditionKey)) block(t(KEY_FULL_MESSAGE));
    if (style && !keyEntry(d.graph.conditionKey, name)) {
      if (!REGIONS.includes(style.region) || !FILLS.includes(style.fill)) block(t('Geçersiz bir bölge ya da dolgu seçildi.'));
      if (styleTaken(d.graph.conditionKey, style)) block(t('Bu bölge ve desen başka bir bulguyu göstermektedir; iki bulgunun karışmaması için başka bir bölge ya da desen seçin.'));
      const n = Math.max(0, ...d.graph.conditionKey.map((e) => Number(String(e.id).replace(/^k/, '')) || 0)) + 1;
      d.graph.conditionKey.push({ id: `k${n}`, label: name, region: style.region, fill: style.fill });
    }
    applyStatus(p, name, 'affected');
  });
}

/** Change how a finding is drawn (for everyone who has it). */
export function setFindingStyle(doc, label, style) {
  return commit(doc, (d) => {
    const e = keyEntry(d.graph.conditionKey, label);
    if (!e) block(t('Bu bulgu açıklamada yer almıyor.'));
    if (!REGIONS.includes(style.region) || !FILLS.includes(style.fill)) block(t('Geçersiz bir bölge ya da dolgu seçildi.'));
    if (styleTaken(d.graph.conditionKey, style, label)) block(t('Bu bölge ve desen başka bir bulguyu göstermektedir; iki bulgunun karışmaması için başka bir bölge ya da desen seçin.'));
    const beside = rightSideFindings(d.graph).get(normLabel(label));
    if (beside && !['q2', 'q3'].includes(style.region)) {
      block(t('Bu bulgu taşıyıcı bir kişide de bulunuyor; taşıyıcılık sembolün sol yarısında gösterildiğinden bulgunun sağ üst ya da sağ alt çeyrekte yer alması gerekir.'));
    }
    if (beside && beside.has(style.fill)) {
      block(t('Bu dolgu, aynı kişinin sol yarısındaki taşıyıcılık işaretiyle aynı olduğundan bulgu ayırt edilemez; başka bir dolgu seçin.'));
    }
    e.region = style.region;
    e.fill = style.fill;
  });
}

/**
 * Rename a finding for everyone who has it and in the key (an edit made on
 * the page's key reaches every person's findings — clinician request
 * 2026-10-25). Refused when another finding already has the new name.
 */
export function renameFinding(doc, oldLabel, newLabel) {
  return commit(doc, (d) => {
    const name = String(newLabel || '').trim();
    if (!name) block(t('Bulgunun adı boş olamaz.'));
    const e = keyEntry(d.graph.conditionKey, oldLabel);
    if (!e) block(t('Bu bulgu açıklamada yer almıyor.'));
    const clash = keyEntry(d.graph.conditionKey, name);
    if (clash && clash !== e) block(t('“{name}” adında başka bir bulgu zaten bulunuyor.', { name }));
    for (const p of d.graph.individuals) {
      if (!Array.isArray(p.conditions)) continue;
      p.conditions = p.conditions.map((c) => (normLabel(c.label) === normLabel(oldLabel) ? { ...c, label: name } : c));
    }
    e.label = name;
  });
}

/**
 * The age a finding was diagnosed at, for one person (clinician decision
 * 2026-10-25: shown in the notes, not under the symbol). '' removes it.
 */
export function setFindingOnset(doc, personId, label, onset) {
  return commit(doc, (d) => {
    const p = d.graph.individuals.find((i) => i.id === personId);
    if (!p) block(t('Kişi çizimde bulunamadı.'));
    const c = (p.conditions || []).find((x) => x && normLabel(x.label) === normLabel(label));
    if (!c) block(t('Bu kişide bu bulgu kayıtlı değil.'));
    // read like an age when it is one ("3AY" → "3 ay"); otherwise kept as written, free text such as
    // "çocuklukta" (clinician request 2026-11-07; it is only shown in the notes)
    const age = normalizeAge(onset);
    const text = String(onset || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const value = age || (age === null ? text : '');
    if (value) c.onsetAge = value; else delete c.onsetAge;
  });
}
