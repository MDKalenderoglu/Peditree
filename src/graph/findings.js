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
import { CARRIER_BASES, GENETIC_TESTED } from './model';
import { normLabel, keyEntry, styleTaken, keyFull, KEY_FULL_MESSAGE, FILLS } from './conditionKey';
import { t } from '../i18n';

// 'unknown': the clinician is not sure (clinician decision 2026-10-25:
// written as unknown, never as "no", e.g. in a PED file)
const STATUSES = ['affected', 'carrier', 'unknown', 'none'];

function applyStatus(person, label, status, basis) {
  const conds = Array.isArray(person.conditions) ? person.conditions : [];
  const rest = conds.filter((c) => normLabel(c.label) !== normLabel(label));
  const existing = conds.find((c) => normLabel(c.label) === normLabel(label));
  const entry = { ...(existing || {}), label: existing ? existing.label : label.trim(), status };
  // a carrier's basis (model.js CARRIER_BASES) belongs to the carrier status only
  if (status === 'carrier' && basis) entry.basis = basis;
  if (status !== 'carrier') delete entry.basis;
  if (status === 'carrier' && basis === 'test' && !person.geneticTest) person.geneticTest = GENETIC_TESTED;
  const next = status === 'none' ? rest : [...rest, entry];
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

/**
 * Set one finding of a person: 'affected' | 'carrier' | 'unknown' | 'none'
 * (removes it). `basis`: what a carrier status rests on (model.js
 * CARRIER_BASES; clinician decision 2026-11-17).
 */
export function setFindingStatus(doc, personId, label, status, basis) {
  return commit(doc, (d) => {
    if (!STATUSES.includes(status)) block(`Bilinmeyen durum: ${status}`);
    if (basis && (status !== 'carrier' || !CARRIER_BASES.includes(basis))) block(t('Taşıyıcılığın dayanağı genetik test, pedigriden zorunlu ya da beyana dayalı olarak seçilmelidir.'));
    if (!String(label || '').trim()) block(t('Bulgunun adı boş olamaz.'));
    const p = d.graph.individuals.find((i) => i.id === personId);
    if (!p) block(t('Kişi çizimde bulunamadı.'));
    if (status !== 'none' && !keyEntry(d.graph.conditionKey, label) && keyFull(d.graph.conditionKey)) block(t(KEY_FULL_MESSAGE));
    applyStatus(p, label, status, basis);
  });
}

/**
 * A new (or existing) finding for a person, affected; `style` = { fill }
 * chosen by the clinician for a finding the key does not have yet.
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
      if (!FILLS.includes(style.fill)) block(t('Geçersiz bir desen seçildi.'));
      if (styleTaken(d.graph.conditionKey, style)) block(t('Bu desen başka bir bulguyu göstermektedir; iki bulgunun karışmaması için başka bir desen seçin.'));
      const n = Math.max(0, ...d.graph.conditionKey.map((e) => Number(String(e.id).replace(/^k/, '')) || 0)) + 1;
      d.graph.conditionKey.push({ id: `k${n}`, label: name, fill: style.fill });
    }
    applyStatus(p, name, 'affected');
  });
}

/** Change how a finding is drawn (for everyone who has it). */
export function setFindingStyle(doc, label, style) {
  return commit(doc, (d) => {
    const e = keyEntry(d.graph.conditionKey, label);
    if (!e) block(t('Bu bulgu açıklamada yer almıyor.'));
    if (!style || !FILLS.includes(style.fill)) block(t('Geçersiz bir desen seçildi.'));
    if (styleTaken(d.graph.conditionKey, style, label)) block(t('Bu desen başka bir bulguyu göstermektedir; iki bulgunun karışmaması için başka bir desen seçin.'));
    delete e.region;
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
 * Remove a finding from the pedigree: from everyone who has it (as affected,
 * carrier or unknown) and from the key (clinician request 2026-11-17: "Yok"
 * removes it from one person only; a finding no longer wanted must go at
 * once). One undo step brings it back.
 */
export function removeFinding(doc, label) {
  return commit(doc, (d) => {
    const e = keyEntry(d.graph.conditionKey, label);
    const had = d.graph.individuals.filter((p) => Array.isArray(p.conditions) && p.conditions.some((c) => c && normLabel(c.label) === normLabel(label)));
    if (!e && !had.length) block(t('Bu bulgu açıklamada yer almıyor.'));
    for (const p of had) applyStatus(p, label, 'none');
    d.graph.conditionKey = (d.graph.conditionKey || []).filter((x) => normLabel(x.label) !== normLabel(label));
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
