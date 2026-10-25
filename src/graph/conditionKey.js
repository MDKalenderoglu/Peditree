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

export const normLabel = (label) => String(label ?? '').trim().toLocaleLowerCase('tr');

export const REGIONS = ['q1', 'q2', 'q3', 'q4'];
export const REGION_LABEL = { q1: 'Sol üst', q2: 'Sağ üst', q3: 'Sağ alt', q4: 'Sol alt' };
export const FILLS = ['solid', 'hatch', 'dots', 'grey'];
export const FILL_LABEL = { solid: 'Siyah', hatch: 'Tarama', dots: 'Noktalı', grey: 'Gri' };
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
export const KEY_FULL_MESSAGE = '16 bulgu sınırına ulaşıldı: her bulgu sembolde kendine ait bir çeyrek ve dolguyla gösteriliyor ve boş işaret kalmadı. Yeni bulgu eklemek için benzer bulguları tek bir adda toplayın ya da gereksiz bir bulguyu kaldırın.';

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
    const leftFills = carried.length ? carried.map((c) => (keyEntry(key, c.label) || {}).fill).filter(Boolean) : ['solid'];
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
      const free = tries.find((t) => !styleTaken(key, t, e.label));
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
 * findings on the RIGHT side: one finding the whole right half, two the
 * upper and lower right quadrants; "affected" without a named finding fills
 * the right half (clinician decision 2026-10-25, replacing "half of the
 * finding's region"). A person-level carrier with findings has the classic
 * solid left half.
 */
export function fillFor(person, key = []) {
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
  const byKey = (a, b) => keyIndex(key, a.label) - keyIndex(key, b.label);
  const upperFirst = (m) => (m.region === 'q1' || m.region === 'q2' ? 0 : 1);
  if (carried.length || (person.carrier && affected.length)) {
    const parts = [];
    const left = carried.length ? [...carried].sort((a, b) => upperFirst(a) - upperFirst(b) || byKey(a, b))
      : [{ region: 'q1', fill: 'solid' }];
    const lstep = 180 / left.length;
    left.forEach((m, k) => parts.push({ region: m.region, fill: m.fill, carrier: true, a0: 270 - (k + 1) * lstep, a1: 270 - k * lstep }));
    const right = [...affected].sort((a, b) => upperFirst(a) - upperFirst(b) || byKey(a, b));
    if (right.length) {
      const rstep = 180 / right.length;
      right.forEach((m, k) => parts.push({ region: m.region, fill: m.fill, carrier: false, a0: 270 + k * rstep, a1: 270 + (k + 1) * rstep }));
    } else if (person.affected) {
      parts.push({ region: 'q2', fill: 'solid', carrier: false, a0: 270, a1: 450 });
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
