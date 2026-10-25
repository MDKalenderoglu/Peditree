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
import { normalizeAge, AGE_EXAMPLE } from '../utils/age';
import { normLabel, keyEntry, styleTaken, keyFull, KEY_FULL_MESSAGE, rightSideFindings, REGIONS, FILLS } from './conditionKey';

const STATUSES = ['affected', 'carrier', 'none'];

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
    if (!String(label || '').trim()) block('Bulgunun adı boş olamaz.');
    const p = d.graph.individuals.find((i) => i.id === personId);
    if (!p) block('Birey grafikte bulunamadı.');
    if (status !== 'none' && !keyEntry(d.graph.conditionKey, label) && keyFull(d.graph.conditionKey)) block(KEY_FULL_MESSAGE);
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
    if (!name) block('Bulgunun adı boş olamaz.');
    const p = d.graph.individuals.find((i) => i.id === personId);
    if (!p) block('Birey grafikte bulunamadı.');
    d.graph.conditionKey = d.graph.conditionKey || [];
    if (!keyEntry(d.graph.conditionKey, name) && keyFull(d.graph.conditionKey)) block(KEY_FULL_MESSAGE);
    if (style && !keyEntry(d.graph.conditionKey, name)) {
      if (!REGIONS.includes(style.region) || !FILLS.includes(style.fill)) block('Geçersiz bölge ya da dolgu.');
      if (styleTaken(d.graph.conditionKey, style)) block('Bu bölge ve dolgu başka bir bulguda kullanılıyor; başka bir seçim yapın.');
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
    if (!e) block('Bu bulgu açıklamada yok.');
    if (!REGIONS.includes(style.region) || !FILLS.includes(style.fill)) block('Geçersiz bölge ya da dolgu.');
    if (styleTaken(d.graph.conditionKey, style, label)) block('Bu bölge ve dolgu başka bir bulguda kullanılıyor; başka bir seçim yapın.');
    const beside = rightSideFindings(d.graph).get(normLabel(label));
    if (beside && !['q2', 'q3'].includes(style.region)) {
      block('Bu bulgu taşıyıcı bir kişide de var; taşıyıcılık sembolün sol yarısında çizildiği için bulgu sağ üst ya da sağ alt çeyrekte olmalı.');
    }
    if (beside && beside.has(style.fill)) {
      block('Bu dolgu, aynı kişinin sol yarısındaki taşıyıcılık işaretiyle aynı; bulgu ayırt edilemez. Başka bir dolgu seçin.');
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
    if (!name) block('Bulgunun adı boş olamaz.');
    const e = keyEntry(d.graph.conditionKey, oldLabel);
    if (!e) block('Bu bulgu açıklamada yok.');
    const clash = keyEntry(d.graph.conditionKey, name);
    if (clash && clash !== e) block(`"${name}" adında başka bir bulgu zaten var.`);
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
    if (!p) block('Birey grafikte bulunamadı.');
    const c = (p.conditions || []).find((x) => x && normLabel(x.label) === normLabel(label));
    if (!c) block('Bu kişide bu bulgu yok.');
    const age = normalizeAge(onset);
    if (age === null) block(`Tanı yaşı anlaşılamadı: "${onset}" (${AGE_EXAMPLE}).`);
    if (age) c.onsetAge = age; else delete c.onsetAge;
  });
}
