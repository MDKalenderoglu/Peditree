/**
 * conditionKey.js — the pedigree's findings key (legend) and how each finding
 * marks a symbol (NSGC: a symbol divided into regions, each region one
 * finding, defined in the legend; clinician requests 2026-10-24).
 *
 * Model: graph.conditionKey = [{ id, label, region, fill }] — one entry per
 * finding that at least one person has (person.conditions[].label, matched
 * without case).
 *   region: 'q1' upper-left · 'q2' upper-right · 'q3' lower-right · 'q4' lower-left
 *   fill:   'solid' · 'hatch' · 'dots' · 'grey'
 * (region, fill) is the finding's signature — unique in the key. A new
 * finding gets the next free signature (four quadrants in solid first), the
 * clinician may choose another; it then keeps it while the pedigree is
 * edited. An entry nobody has any more is dropped. finalize.js keeps the key
 * in step after every operation.
 */
import { t, tk } from '../i18n';

export const normLabel = (label) => String(label ?? '').trim().toLocaleLowerCase('tr');

export const REGIONS = ['q1', 'q2', 'q3', 'q4'];
export const REGION_LABEL = { q1: tk('Sol üst'), q2: tk('Sağ üst'), q3: tk('Sağ alt'), q4: tk('Sol alt') };
export const FILLS = ['solid', 'hatch', 'dots', 'grey'];
export const FILL_LABEL = { solid: tk('Siyah'), hatch: tk('Tarama'), dots: tk('Noktalı'), grey: tk('Gri') };
/**
 * A carrier without a named finding (person.carrier): the left half in a
 * pattern of its own, never a finding's, explained in the key as
 * "Taşıyıcı" (NSGC 2022 §4.5: no carrier dot — a divided symbol, a fill
 * pattern defined in the legend; clinician decision 2026-11-02).
 */
export const CARRIER_FILL = 'cross';
/**
 * How the viewer wants that carrier drawn (Ayarlar → Çizim, a device
 * preference — the file never changes; clinician decisions 2026-11-04 and
 * 2026-11-16): 'split' the NSGC 2022 left half above, 'dot' the classic dot
 * in the middle (NSGC 2008, many textbooks), or 'half' the left half solid as
 * many publications draw a recessive carrier — each explained in the key. A
 * carried finding with a name keeps its own pattern in all: a dot cannot say
 * which. The solid half is drawn only where it cannot be read as something
 * else (classicHalfFree): never beside "affected" (the whole symbol would be
 * solid), never where a named carried finding is itself drawn solid.
 */
export const CARRIER_MARKS = [
  { id: 'split', label: tk('Bölünmüş (NSGC 2022)') },
  { id: 'dot', label: tk('Ortada nokta') },
  { id: 'half', label: tk('Yarısı siyah (klasik)') },
];

/**
 * How the drawing shows the key with the chosen carrier mark (the stored key
 * never changes). With 'half' a plain carrier's left half is solid, always
 * (clinician 2026-11-16: the carrier mark never changes; what else is drawn
 * changes instead), so solid is kept free where it would meet it:
 *  - a named finding drawn solid that someone carries (its half would look
 *    like the plain carrier's) or that a plain carrier also has (beside the
 *    solid half the whole symbol would be solid) is shown in another free
 *    signature, in the drawing and the key alike;
 *  - "affected" without a named finding beside a plain carrier fills the
 *    right half in affectedFill, explained in the key as "Etkilenmiş".
 * Fills a moved finding takes are kept apart from what stands beside it on
 * the same symbol. halfFree is false only when no signature is left for such
 * a finding (all 16 used): then plain carriers keep the NSGC 2022 hatching.
 */
export function displayStyles(people = [], key = [], carrierMark = 'split') {
  if (carrierMark !== 'half') return { key, halfFree: true, affectedFill: 'solid' };
  const conds = (p) => (Array.isArray(p.conditions) ? p.conditions : []).filter((c) => c && c.label);
  const out = key.map((e) => ({ ...e }));
  const entry = (label) => keyEntry(out, label);
  const plainCarriers = people.filter((p) => p.carrier && !conds(p).some((c) => c.status === 'carrier'));
  const move = new Set();
  for (const p of people) {
    for (const c of conds(p)) {
      const e = entry(c.label);
      if (!e || e.fill !== 'solid') continue;
      if (c.status === 'carrier' || (c.status === 'affected' && plainCarriers.includes(p))) move.add(normLabel(e.label));
    }
  }
  // fills that must not be next to a finding: what the same people have on the other side of their symbol
  const beside = (label) => {
    const n = normLabel(label);
    const fills = new Set(['solid']);
    for (const p of people) {
      const cs = conds(p);
      const mine = cs.find((c) => normLabel(c.label) === n);
      if (!mine) continue;
      for (const c of cs) {
        if (c === mine || c.status === mine.status) continue;
        const f = entry(c.label)?.fill;
        if (f) fills.add(f);
      }
    }
    return fills;
  };
  const taken = new Set(out.filter(validStyle).map(signature));
  let halfFree = true;
  for (const e of out) {
    if (!move.has(normLabel(e.label))) continue;
    const avoid = beside(e.label);
    const fills = FILLS.filter((f) => !avoid.has(f));
    let sig = null;
    for (const f of fills) { if (!taken.has(`${e.region}|${f}`)) { sig = { region: e.region, fill: f }; break; } }
    if (!sig) for (const f of fills) { const r = REGIONS.find((q) => !taken.has(`${q}|${f}`)); if (r) { sig = { region: r, fill: f }; break; } }
    if (!sig) { halfFree = false; continue; }
    taken.delete(signature(e));
    e.region = sig.region;
    e.fill = sig.fill;
    taken.add(signature(e));
  }
  if (!halfFree) return { key, halfFree: false, affectedFill: 'solid' };
  // "affected" beside a plain carrier: a pattern no finding uses if there is one
  const used = new Set(out.map((e) => e.fill));
  const affectedFill = ['hatch', 'dots', 'grey'].find((f) => !used.has(f)) || 'hatch';
  return { key: out, halfFree: true, affectedFill };
}
// angles (degrees, screen: 0 = east, clockwise)
export const REGION_ANGLES = { q1: [180, 270], q2: [270, 360], q3: [0, 90], q4: [90, 180] };

const personLabels = (p) => (Array.isArray(p.conditions) ? p.conditions : [])
  .map((c) => (c && typeof c.label === 'string' ? c.label.trim() : ''))
  .filter(Boolean);

const signature = (e) => `${e.region}|${e.fill}`;
const validStyle = (e) => REGIONS.includes(e.region) && FILLS.includes(e.fill);

// 4 quadrants × 4 fills: when all are used no new finding can be drawn apart
// from the others; adding one is refused with this message (clinician
// decision 2026-10-25: an explicit warning, the clinician simplifies)
export const KEY_CAPACITY = REGIONS.length * FILLS.length;
export const KEY_FULL_MESSAGE = tk('16 bulgu sınırına ulaşıldı: her bulgu sembolde kendine ait bir çeyrek ve dolguyla gösterildiğinden kullanılabilecek işaret kalmadı. Yeni bir bulgu eklemek için benzer bulgular tek bir ad altında toplanabilir ya da gereksiz bir bulgu kaldırılabilir.');

export function keyFull(key = []) {
  return new Set(key.filter(validStyle).map(signature)).size >= KEY_CAPACITY;
}

/** The next free (region, fill): quadrants in solid first, then the other fills; null when all are used. */
export function suggestStyle(key = []) {
  const taken = new Set(key.filter(validStyle).map(signature));
  for (const fill of FILLS) for (const region of REGIONS) if (!taken.has(`${region}|${fill}`)) return { region, fill };
  return null;
}

export function styleTaken(key, { region, fill }, exceptLabel) {
  return (key || []).some((e) => validStyle(e) && e.region === region && e.fill === fill && normLabel(e.label) !== normLabel(exceptLabel));
}

// only for a file from elsewhere with more than 16 findings (the editor refuses
// a 17th): it is still drawn, sharing the first signature
const FALLBACK_STYLE = { region: 'q1', fill: 'solid' };

/** Bring graph.conditionKey in step with the people's findings (in place). */
export function deriveConditionKey(graph) {
  const used = new Map(); // norm → first label seen
  for (const p of graph.individuals) {
    for (const label of personLabels(p)) if (!used.has(normLabel(label))) used.set(normLabel(label), label);
  }
  const key = [];
  for (const e of graph.conditionKey || []) {
    if (!used.has(normLabel(e.label))) continue;
    // an entry from before styles existed (or a clash) gets the next free signature
    key.push(validStyle(e) && !styleTaken(key, e) ? e : { ...e, ...(suggestStyle(key) || FALLBACK_STYLE) });
  }
  const have = new Set(key.map((e) => normLabel(e.label)));
  let n = Math.max(0, ...key.map((e) => Number(String(e.id).replace(/^k/, '')) || 0));
  for (const [norm, label] of used) {
    if (have.has(norm)) continue;
    key.push({ id: `k${++n}`, label, ...(suggestStyle(key) || FALLBACK_STYLE) });
    have.add(norm);
  }
  keepCarriersFindingsRight(graph, key);
  graph.conditionKey = key;
  return graph;
}

const RIGHT = ['q2', 'q3'];
const MIRROR = { q1: 'q2', q4: 'q3' };

/**
 * Findings a carrier also has, drawn on the right side (the left half shows
 * the carrier): label (normalised) → the fills of what that carrier's left
 * half shows (a person-level carrier: solid).
 */
export function rightSideFindings(graph, key = graph.conditionKey || []) {
  const out = new Map();
  for (const p of graph.individuals) {
    const conds = Array.isArray(p.conditions) ? p.conditions : [];
    const carried = conds.filter((c) => c && c.status === 'carrier' && c.label);
    if (!carried.length && !p.carrier) continue;
    const leftFills = carried.length ? carried.map((c) => (keyEntry(key, c.label) || {}).fill).filter(Boolean) : [CARRIER_FILL];
    for (const c of conds) {
      if (!c || c.status !== 'affected' || !c.label) continue;
      const n = normLabel(c.label);
      if (!out.has(n)) out.set(n, new Set());
      leftFills.forEach((f) => out.get(n).add(f));
    }
  }
  return out;
}

/**
 * Such a finding is moved, for everyone who has it, to a free signature on
 * the right side whose fill differs from the carrier half beside it — so
 * "carrier + finding" never reads as one solid symbol (clinician decision
 * 2026-10-25): the mirror quadrant first, other fills in the order hatch,
 * dots, grey. Left as it is when no such signature is free.
 */
function keepCarriersFindingsRight(graph, key) {
  const order = ['hatch', 'dots', 'grey', 'solid'];
  // a carried finding drawn in black beside a plain "affected" (a black right
  // half) takes another fill, for everyone who has it
  for (const p of graph.individuals) {
    const conds = Array.isArray(p.conditions) ? p.conditions : [];
    if (!p.affected || conds.some((c) => c && c.status === 'affected')) continue;
    for (const c of conds.filter((x) => x && x.status === 'carrier' && x.label)) {
      const e = key.find((x) => normLabel(x.label) === normLabel(c.label));
      if (!e || e.fill !== 'solid') continue;
      const tries = order.filter((f) => f !== 'solid').flatMap((fill) => [e.region, ...REGIONS.filter((r) => r !== e.region)].map((region) => ({ region, fill })));
      const free = tries.find((st) => !styleTaken(key, st, e.label));
      if (free) Object.assign(e, free);
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    const right = rightSideFindings(graph, key);
    // the other findings on the same carrier's right side: their fills too are avoided
    const companions = new Map();
    for (const p of graph.individuals) {
      const conds = Array.isArray(p.conditions) ? p.conditions : [];
      if (!p.carrier && !conds.some((c) => c && c.status === 'carrier')) continue;
      const aff = conds.filter((c) => c && c.status === 'affected' && c.label).map((c) => normLabel(c.label));
      for (const a of aff) {
        if (!companions.has(a)) companions.set(a, new Set());
        aff.filter((b) => b !== a).forEach((b) => companions.get(a).add(b));
      }
    }
    for (const e of key) {
      const n = normLabel(e.label);
      const beside = right.get(n);
      if (!beside) continue;
      const others = [...(companions.get(n) || [])].map((b) => key.find((x) => normLabel(x.label) === b)).filter(Boolean);
      const near = new Set(others.map((x) => x.fill));
      // two findings on one right side: upper and lower right, so every person shows them in the key's place
      const nearRegions = new Set(others.length === 1 ? others.map((x) => x.region) : []);
      if (RIGHT.includes(e.region) && !beside.has(e.fill) && !near.has(e.fill) && !nearRegions.has(e.region)) continue;
      const fills = [
        ...[e.fill, ...order].filter((f) => !beside.has(f) && !near.has(f)),
        ...[e.fill, ...order].filter((f) => !beside.has(f)),
      ].filter((f, k, a) => a.indexOf(f) === k);
      const regions = [MIRROR[e.region] || e.region, ...RIGHT].filter((r, k, a) => RIGHT.includes(r) && a.indexOf(r) === k)
        .sort((a, b) => nearRegions.has(a) - nearRegions.has(b));
      const tries = fills.flatMap((fill) => regions.map((region) => ({ region, fill })));
      const free = tries.find((st) => !styleTaken(key, st, e.label));
      if (free) Object.assign(e, free);
    }
  }
}

/** The key entry for a label, or undefined. */
export function keyEntry(key, label) {
  const n = normLabel(label);
  return (key || []).find((e) => normLabel(e.label) === n);
}

/** Index of the key entry for a label, or -1. */
export function keyIndex(key, label) {
  const n = normLabel(label);
  return (key || []).findIndex((e) => normLabel(e.label) === n);
}

/**
 * How a person's symbol is marked:
 *   { mode: 'none' }   — empty (a person-level carrier: classic half fill)
 *   { mode: 'full' }   — solid: affected with no finding named
 *   { mode: 'regions', parts: [{ region, fill, a0, a1, carrier }] }
 * Each finding the person is affected by fills its region. The proband with
 * findings is drawn fully filled — their findings are written beside the
 * symbol in the key; regions mark relatives (clinician decision 2026-10-25).
 * Two findings of one person sharing a region (more than four findings in
 * the pedigree) split that region between them.
 *
 * A carrier is drawn first, on the LEFT half of the symbol (the finding's
 * fill; several carried findings share it, upper to lower), and the person's
 * findings on the RIGHT side, each in its own quarter as the key shows it
 * (clinician 2026-11-16; one finding used to fill the whole right half);
 * "affected" without a named finding fills the right half (clinician
 * decision 2026-10-25). A carrier without a named finding has the left half in
 * CARRIER_FILL, also alone and also beside "affected" (NSGC 2022: no dot);
 * with carrierMark 'dot' it is drawn as the rest of the symbol plus
 * { dot: true } — a dot in the middle; with 'half' (key and styles from
 * displayStyles) the plain carrier's left half is solid, marked plain, and
 * "affected" without a name beside it takes styles.affectedFill (CARRIER_MARKS).
 */
export function fillFor(person, key = [], carrierMark = 'split', styles = {}) {
  if (carrierMark === 'half' && person.carrier) {
    // the classic solid half (key and styles from displayStyles): the plain carrier's half solid,
    // "affected" without a name beside it in styles.affectedFill
    const f = regionsFor(person, key);
    if (styles.halfFree === false || f.mode !== 'regions') return f;
    return {
      ...f,
      parts: f.parts.map((q) => (q.carrier && q.fill === CARRIER_FILL ? { ...q, fill: 'solid', plain: true }
        : q.unnamed ? { ...q, fill: styles.affectedFill || 'hatch', unnamedAffected: true } : q)),
    };
  }
  if (carrierMark !== 'dot' || !person.carrier) return regionsFor(person, key);
  // the dot: the rest of the symbol as for a non-carrier; a carried finding with a name keeps its half
  const f = regionsFor(person, key, false);
  return f.parts?.some((p) => p.carrier) ? f : { ...f, dot: true };
}

function regionsFor(person, key, plainCarrierHalf = !!person.carrier) {
  const conds = (Array.isArray(person.conditions) ? person.conditions : [])
    .filter((c) => c && c.label && (c.status === 'affected' || c.status === 'carrier'));
  const marks = [];
  for (const c of conds) {
    const e = keyEntry(key, c.label);
    if (!e || !validStyle(e) || marks.some((m) => m.label === e.label)) continue;
    marks.push({ label: e.label, region: e.region, fill: e.fill, carrier: c.status === 'carrier' });
  }
  const affected = marks.filter((m) => !m.carrier);
  const carried = marks.filter((m) => m.carrier);
  if (person.proband && affected.length) return { mode: 'full' };
  const plainCarrier = { region: 'q1', fill: CARRIER_FILL, carrier: true, a0: 90, a1: 270 };
  // a carrier without a named finding: the left half in its own pattern; beside it "affected"
  // without a name fills the right half (NSGC 2022 — it used to be the 2008 carrier dot)
  if (plainCarrierHalf && !affected.length && !carried.length) {
    return { mode: 'regions', parts: [plainCarrier, ...(person.affected ? [{ region: 'q2', fill: 'solid', carrier: false, unnamed: true, a0: 270, a1: 450 }] : [])] };
  }
  const byKey = (a, b) => keyIndex(key, a.label) - keyIndex(key, b.label);
  const upperFirst = (m) => (m.region === 'q1' || m.region === 'q2' ? 0 : 1);
  if (carried.length || (plainCarrierHalf && affected.length)) {
    const parts = [];
    const left = carried.length ? [...carried].sort((a, b) => upperFirst(a) - upperFirst(b) || byKey(a, b))
      : [{ region: 'q1', fill: CARRIER_FILL }];
    const lstep = 180 / left.length;
    left.forEach((m, k) => parts.push({ region: m.region, fill: m.fill, carrier: true, a0: 270 - (k + 1) * lstep, a1: 270 - k * lstep }));
    const right = [...affected].sort((a, b) => upperFirst(a) - upperFirst(b) || byKey(a, b));
    if (right.length) {
      // each finding in its own quarter, as the key shows it (clinician 2026-11-16: one finding filled the
      // whole right half while the key showed a quarter); one left of the line (no free signature) mirrored
      const RIGHT_ANGLES = { q2: [270, 360], q3: [360, 450] };
      for (const region of RIGHT) {
        const here = right.filter((m) => (RIGHT.includes(m.region) ? m.region : MIRROR[m.region]) === region);
        const [a0, a1] = RIGHT_ANGLES[region];
        const step = (a1 - a0) / (here.length || 1);
        here.forEach((m, k) => parts.push({ region, fill: m.fill, carrier: false, a0: a0 + step * k, a1: a0 + step * (k + 1) }));
      }
    } else if (person.affected) {
      parts.push({ region: 'q2', fill: 'solid', carrier: false, unnamed: true, a0: 270, a1: 450 });
    }
    return { mode: 'regions', parts };
  }
  if (affected.length) {
    const parts = [];
    for (const region of REGIONS) {
      const here = affected.filter((m) => m.region === region);
      const [a0, a1] = REGION_ANGLES[region];
      const step = (a1 - a0) / (here.length || 1);
      here.forEach((m, k) => parts.push({ region, fill: m.fill, carrier: false, a0: a0 + step * k, a1: a0 + step * (k + 1) }));
    }
    return { mode: 'regions', parts };
  }
  if (person.affected) return { mode: 'full' };
  return { mode: 'none' };
}

/**
 * A non-proband person whose carrier half and findings would be drawn in the
 * same fill cannot be read (left-half carrier, right-side findings): an error
 * — the operation that causes it is refused with the reason. Arises only
 * when no distinct signature is left (all 16 used).
 */
export function carrierFindingIssues(graph) {
  const key = graph.conditionKey || [];
  const issues = [];
  for (const p of graph.individuals) {
    if (p.proband) continue;
    const conds = Array.isArray(p.conditions) ? p.conditions : [];
    const fillOf = (c) => keyEntry(key, c.label)?.fill;
    const carried = conds.filter((c) => c && c.status === 'carrier' && c.label);
    if (!carried.length) continue;
    const affectedFills = conds.filter((c) => c && c.status === 'affected' && c.label).map(fillOf);
    const right = new Set(affectedFills.length ? affectedFills : p.affected ? ['solid'] : []);
    if (carried.map(fillOf).some((f) => right.has(f))) {
      issues.push({
        severity: 'error', code: 'CARRIER_FINDING_INDISTINCT', ids: [p.id],
        message: t('Bu kişinin taşıyıcılığı ile bulgusu aynı dolguyla çizileceğinden birbirinden ayırt edilemez ve kullanılabilecek başka işaret kalmadı. Benzer bulgular tek bir ad altında toplanabilir ya da biri kaldırılabilir.'),
      });
    }
  }
  return issues;
}
