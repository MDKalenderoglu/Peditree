/**
 * markCollisions.js — do the marks drawn around symbols run into each other
 * or into lines? (clinician report 2026-11-01: the proband's arrow ran into
 * an adopted person's brackets, relationship lines through brackets.)
 *
 * Browser only: measures the drawing as rendered (text widths need a real
 * layout engine). `buildMarkFamily(store)` draws a family with every mark
 * next to every other — arrows (proband, consultand), brackets (adopted in,
 * out, by relatives), numbered symbols, pregnancies, twins, deceased,
 * genetic lines, ages, single and double relationship lines on both sides —
 * and `findMarkCollisions(svg)` lists every overlap. In development the app
 * exposes both as `window.__peditreeMarkAudit()` (main.jsx, through
 * `runMarkAudit`); run it after any change to symbols, marks or routing.
 * The open family, its undo history and the saved session are put back
 * exactly as they were afterwards (Codex audit 2026-11-01: the first
 * version replaced the clinician's family with the test family).
 */

const CLEAR = 2; // px a mark keeps from anything else
const STEP = 2;  // px between sampled points along a line

/** A family with every mark combination, built with the ordinary operations. */
export function buildMarkFamily(store) {
  const S = () => store.getState();
  const g = () => S().doc.graph;
  const sibsOf = (id) => g().parentChildRelationships.find((r) => r.children.includes(id)).children;
  const lastSib = (id) => sibsOf(id).at(-1);
  const unionOf = (id) => g().unions.find((u) => u.partners.includes(id)).id;
  const ok = (r, what) => { if (!r || !r.ok) throw new Error(`${what}: ${r && r.reason}`); return r; };

  S().resetPedigree();
  // the proband: arrow + P, adopted out (brackets), genetic lines, age
  ok(S().updateIndividual('proband', { age: '12', geneticTest: 'tested', geneticNote: 'TGFBR2 c.1609C>T het\nsonuç bekleniyor' }), 'proband');
  ok(S().setAdoption('proband', 'out'), 'proband out');
  // the mother: consultand (arrow, no P), adopted out, married (line into her brackets)
  ok(S().setConsultand('mother'), 'consultand');
  ok(S().setAdoption('mother', 'out'), 'mother out');
  // siblings: adopted in and married, a group, pregnancies, twins (one adopted out), deceased adopted out
  ok(S().addSiblingTo('proband', 'female', { adopted: true }), 'adopted sister');
  const sister = g().individuals.find((i) => g().socialParentLinks.some((l) => l.childId === i.id)).id;
  ok(S().addSpouseTo(sister, 'male'), 'sister spouse');
  ok(S().addSiblingTo('proband', 'male', { count: 3 }), 'group');
  ok(S().addSiblingTo('proband', 'unknown', { ectopic: true }), 'ECT');
  ok(S().addSiblingTo('proband', 'unknown', { ongoingPregnancy: true }), 'P');
  ok(S().addSiblingTo('proband', 'male'), 'twin a');
  const twinA = lastSib('proband');
  ok(S().addMultipleSibling(twinA, { sex: 'male', zygosity: 'monozygotic' }), 'twin b');
  ok(S().setAdoption(twinA, 'out'), 'twin out');
  ok(S().addSiblingTo('proband', 'female'), 'deceased sister');
  const dec = lastSib('proband');
  ok(S().updateIndividual(dec, { deceased: true, age: '3 ay' }), 'deceased');
  ok(S().setAdoption(dec, 'out'), 'deceased out');
  // the father's side: a brother adopted out, married to the mother's sister; declared consanguineous (double line)
  ok(S().addSiblingTo('father', 'male'), 'uncle');
  const uncle = lastSib('father');
  ok(S().setAdoption(uncle, 'out'), 'uncle out');
  ok(S().addSiblingTo('mother', 'female'), 'aunt');
  const aunt = lastSib('mother');
  ok(S().createUnionBetween(uncle, aunt), 'uncle-aunt');
  ok(S().setUnionRelationshipBackground(unionOf(uncle), 'consanguinity_reported'), 'consanguinity');
  // their child, adopted by the proband's parents' sister … by relatives: the uncle's couple adopts the sister's child
  ok(S().addChildTo(sister, 'female'), 'niece');
  const niece = g().parentChildRelationships.find((r) => r.unionId === unionOf(sister)).children[0];
  ok(S().setAdoption(niece, unionOf(uncle)), 'niece by relatives');
  // assisted reproduction: a sperm donor ("D") for the ongoing pregnancy, a gestational carrier ("G") for the deceased sister
  ok(S().addReproductiveLink(g().individuals.find((i) => i.ongoingPregnancy).id, 'sperm_donor'), 'sperm donor');
  ok(S().addReproductiveLink(dec, 'gestational_carrier'), 'gestational carrier');
  // NSGC 2022 additions (2026-11-02): sex at birth under a symbol with brackets and genetic lines, LMP under
  // the P, a presymptomatic carrier, an ended relationship ("//") beside brackets
  ok(S().updateIndividual('proband', { sexAtBirth: 'AFAB' }), 'sex at birth');
  const lmp = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  ok(S().updateIndividual(g().individuals.find((i) => i.ongoingPregnancy).id, { lmp }), 'LMP');
  ok(S().updateIndividual('father', { presymptomatic: true }), 'presymptomatic');
  ok(S().setUnionStatus(unionOf(sister), 'divorced'), 'divorce');
  S().clearSelection();
}

const boxOf = (el) => {
  const r = el.getBoundingClientRect();
  return { x1: r.left, y1: r.top, x2: r.right, y2: r.bottom };
};
const overlaps = (a, b) => Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > -CLEAR && Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) > -CLEAR;
const inside = (p, b, c = CLEAR) => p.x > b.x1 - c && p.x < b.x2 + c && p.y > b.y1 - c && p.y < b.y2 + c;
// a connector as points along it, in screen coordinates (any shape: polylines, line jumps)
function samples(el) {
  const m = el.getScreenCTM();
  const pts = [];
  if (el.tagName === 'line') {
    const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((a) => +el.getAttribute(a));
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / STEP));
    for (let k = 0; k <= n; k++) pts.push(new DOMPoint(x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n).matrixTransform(m));
    return pts;
  }
  const len = el.getTotalLength();
  for (let s = 0; s <= len; s += STEP) { const q = el.getPointAtLength(s); pts.push(new DOMPoint(q.x, q.y).matrixTransform(m)); }
  return pts;
}

/**
 * Every overlap between marks (arrows, "P", brackets, pedigree numbers,
 * text under symbols) and anything else drawn. Lines touching their own
 * symbol, and a line of descent entering between a person's brackets, are
 * not overlaps. Returns [{ what, with, person }].
 */
export function findMarkCollisions(svg) {
  const viewport = svg.querySelector('.pedigree-viewport');
  const out = [];
  const items = [];
  // connectors: the viewport's own lines (not those inside a person's group)
  const lines = [];
  for (const el of viewport.querySelectorAll('path, line')) {
    if (el.closest('.node-group') || el.closest('.ui-only') || el.classList.contains('ui-only') || el.getAttribute('stroke-opacity') === '0') continue;
    if (el.closest('.condition-legend, .notes-legend')) continue;
    lines.push(samples(el));
  }
  for (const node of viewport.querySelectorAll('.node-group')) {
    const person = node.querySelector('.pedigree-number')?.textContent || '?';
    const shape = node.querySelector('.pedigree-shape');
    const own = shape ? boxOf(shape) : null;
    const brackets = node.querySelector('.adoption-brackets');
    if (brackets) {
      const b = boxOf(brackets);
      const w = Math.min(8, (b.x2 - b.x1) / 4);
      items.push({ kind: 'bracket', person, own, box: { x1: b.x1, y1: b.y1, x2: b.x1 + w, y2: b.y2 } });
      items.push({ kind: 'bracket', person, own, box: { x1: b.x2 - w, y1: b.y1, x2: b.x2, y2: b.y2 } });
    }
    const arrow = node.querySelector('.proband-arrow');
    if (arrow) items.push({ kind: 'arrow', person, own, box: boxOf(arrow) });
    const p = node.querySelector('.proband-p');
    if (p) items.push({ kind: 'P', person, own, box: boxOf(p) });
    const letter = node.querySelector('.repro-mark');
    if (letter) items.push({ kind: 'letter', person, own, box: boxOf(letter) });
    const num = node.querySelector('.pedigree-number');
    if (num) items.push({ kind: 'number', person, own, box: boxOf(num) });
    for (const t of node.querySelectorAll('.annotations text')) {
      if (t.textContent.trim()) items.push({ kind: 'text', person, own, box: boxOf(t) });
    }
  }
  // a mark against a line
  for (const a of items) {
    // a line may end at a bracket (a relationship line meets it), never run into it
    if (lines.some((pts) => pts.some((p) => inside(p, a.box, a.kind === 'bracket' ? 0 : CLEAR)))) out.push({ what: a.kind, with: 'line', person: a.person });
  }
  // a mark against another mark (the parts of one mark kind of one person are laid out together)
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (a.person === b.person && a.kind === b.kind) continue;
      if (!overlaps(a.box, b.box)) continue;
      out.push({ what: a.kind, with: `${b.kind}${b.person !== a.person ? ` (${b.person})` : ''}`, person: a.person });
    }
  }
  return out;
}

const SESSION_KEYS = ['clinical_pedigree_app.session.v2', 'clinical_pedigree_app.session.v1', 'clinical_pedigree_app.session.v1.backup'];

/**
 * Draw the mark family, measure it, and restore whatever was open before —
 * the store's whole state (document, undo / redo, selection) and the
 * session's saved copies — even when building or measuring fails.
 * `measure` (default: the rendered drawing) returns the collisions.
 */
export async function runMarkAudit(store, { measure, storage, settle = 400 } = {}) {
  const ss = storage !== undefined ? storage : (typeof window !== 'undefined' ? window.sessionStorage : null);
  const before = store.getState();
  const saved = ss ? SESSION_KEYS.map((k) => [k, ss.getItem(k)]) : [];
  try {
    buildMarkFamily(store);
    if (settle) await new Promise((r) => setTimeout(r, settle));
    return measure ? measure() : findMarkCollisions(document.querySelector('.pedigree-viewport').ownerSVGElement);
  } finally {
    store.setState(before, true);
    if (ss) for (const [k, v] of saved) { if (v === null) ss.removeItem(k); else ss.setItem(k, v); }
  }
}
