/**
 * clinicalBenchmarkMetrics.js — measurements for the Clinical Usability
 * Benchmark (src/audit/clinicalBenchmark.js). Pure functions on a graph and
 * a layout; the runner (scripts/clinical-benchmark.runner.mjs) writes the
 * report. Every number is defined here once, so baseline and later runs are
 * measured the same way.
 */
import { createDocument } from '../graph/document';
import { finalizeGraph } from '../graph/finalize';
import { validateDocument, errorsOf } from '../graph/validate';
import { displayParentage } from '../graph/model';
import { auditPedigreeGraph } from '../utils/graphIntegrity';
import { validatePedigree } from '../utils/validators';
import { checkAllInvariants } from './layoutInvariants';
import { checkConnectorReadability, readabilityMetrics } from './connectorReadability';

const MOVE_PX = 2;
const SLOT = 90;
const NODE = 40;            // symbol size in the renderer (PedigreeCanvas NODE_SIZE)
const SMALLEST_TEXT_PX = 9; // smallest label in the renderer (risk / notes markers)
const LABEL_TEXT_PX = 10;   // pedigree numbers ("II-3")
const CANVAS_PAD = 100;     // PedigreeCanvas viewBox padding
const A4_MM = { w: 277, h: 190 }; // A4 landscape, 10 mm margins
const SCREEN_PX = { w: 1200, h: 700 }; // a typical canvas area on a laptop
const PT_PER_MM = 72 / 25.4;

/** The benchmark case as a finalized v2 document (birth order by age, generations). */
export function caseDocument(c) {
  const g = c.build();
  finalizeGraph(g);
  return createDocument(g);
}

/** Do the partners of every consanguineous union share an ancestor drawn in the graph? */
function unsupportedConsanguinity(graph) {
  const parentsOf = new Map();
  for (const r of graph.parentChildRelationships) {
    const u = graph.unions.find((x) => x.id === r.unionId);
    if (u) for (const c of r.children) parentsOf.set(c, u.partners);
  }
  const ancestors = (id) => {
    const out = new Set();
    const stack = [...(parentsOf.get(id) || [])];
    while (stack.length) {
      const a = stack.pop();
      if (out.has(a)) continue;
      out.add(a);
      stack.push(...(parentsOf.get(a) || []));
    }
    return out;
  };
  return graph.unions.filter((u) => u.consanguineous).filter((u) => {
    const [a, b] = u.partners;
    const A = ancestors(a);
    return ![...ancestors(b)].some((x) => A.has(x));
  }).map((u) => u.id);
}

/** Child stems whose owner union is not the child's drawn parent union; children without a stem. */
function ownership(drawnGraph, edges) {
  const parentUnion = new Map();
  for (const r of drawnGraph.parentChildRelationships) for (const c of r.children) parentUnion.set(c, r.unionId);
  const stems = edges.filter((e) => e.type === 'childStem');
  const wrong = stems.filter((e) => parentUnion.get(e.childId) !== e.unionId).map((e) => e.childId);
  const withStem = new Set(stems.map((e) => e.childId));
  const missing = [...parentUnion.keys()].filter((c) => !withStem.has(c));
  return { wrongOwner: wrong, missingStem: missing };
}

/**
 * Birth order. A violation contradicts what is known: an explicit order
 * ("Doğum Sırası") or two siblings with known ages drawn younger-left. A
 * sibship with unknown ages drawn in a different order than stored is
 * allowed (PCL may move a sibling who married into another drawn family to
 * the end) and only counted as "reordered".
 */
function birthOrder(drawnGraph, nodes) {
  const x = new Map(nodes.map((n) => [n.id, n.x]));
  const person = new Map(drawnGraph.individuals.map((i) => [i.id, i]));
  const age = (id) => { const a = parseInt((person.get(id) || {}).age, 10); return Number.isFinite(a) ? a : null; };
  const violations = [], reordered = [];
  for (const r of drawnGraph.parentChildRelationships) {
    const kids = r.children.filter((c) => x.has(c));
    const drawn = kids.slice().sort((a, b) => x.get(a) - x.get(b));
    if (drawn.join('|') === kids.join('|')) continue;
    const ageClash = drawn.some((a, i) => drawn.slice(i + 1).some((b) => age(a) !== null && age(b) !== null && age(a) < age(b)));
    (r.birthOrderExplicit || ageClash ? violations : reordered).push(r.unionId);
  }
  return { violations, reordered };
}
const birthOrderViolations = (g, nodes) => birthOrder(g, nodes).violations;

function centring(drawnGraph, nodes) {
  const x = new Map(nodes.map((n) => [n.id, n.x]));
  const offs = [];
  const worst = [];
  let sideHangOver5 = 0;
  for (const u of drawnGraph.unions) {
    const r = drawnGraph.parentChildRelationships.find((p) => p.unionId === u.id);
    const ks = ((r && r.children) || []).map((c) => x.get(c)).filter(Number.isFinite);
    if (!ks.length || !u.partners.every((p) => Number.isFinite(x.get(p)))) continue;
    const mid = (x.get(u.partners[0]) + x.get(u.partners[1])) / 2;
    const lo = Math.min(...ks), hi = Math.max(...ks);
    offs.push(Math.abs(mid - (lo + hi) / 2));
    if (Math.abs(mid - (lo + hi) / 2) > SLOT / 2) worst.push(`${u.id} ${Math.round(Math.abs(mid - (lo + hi) / 2))}px`);
    if (mid < lo - 5 || mid > hi + 5) sideHangOver5++;
  }
  const mean = offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : 0;
  return {
    couplesWithChildren: offs.length,
    meanOffsetPx: +mean.toFixed(1),
    offsetUnder10: offs.filter((o) => o < 10).length,
    offset10to45: offs.filter((o) => o >= 10 && o <= SLOT / 2).length,
    offsetOver45: offs.filter((o) => o > SLOT / 2).length,
    sideHangOver5,
    offCentreCouples: worst,
  };
}

/** Size of the drawing and what it means on paper and on screen. */
function legibility(nodes) {
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  const w = Math.max(600, Math.max(...xs) - Math.min(...xs) + 2 * CANVAS_PAD);
  const h = Math.max(400, Math.max(...ys) - Math.min(...ys) + 2 * CANVAS_PAD);
  const mmPerPx = Math.min(A4_MM.w / w, A4_MM.h / h);
  const screen = Math.min(SCREEN_PX.w / w, SCREEN_PX.h / h);
  return {
    widthPx: Math.round(w), heightPx: Math.round(h),
    a4SymbolMm: +(NODE * mmPerPx).toFixed(1),
    a4LabelPt: +(LABEL_TEXT_PX * mmPerPx * PT_PER_MM).toFixed(1),
    a4SmallestTextPt: +(SMALLEST_TEXT_PX * mmPerPx * PT_PER_MM).toFixed(1),
    screenSymbolPx: +(NODE * screen).toFixed(1),
    screenLabelPx: +(LABEL_TEXT_PX * screen).toFixed(1),
  };
}

/** Static quality of the drawing a clinician sees when the pedigree is opened. */
export function measureDrawing(doc, layout) {
  const drawnGraph = displayParentage(doc.graph).graph;
  const pd = { ...drawnGraph, ...layout };
  const m = readabilityMetrics(pd);
  return {
    people: doc.graph.individuals.length,
    generations: new Set(doc.graph.individuals.map((i) => i.generation)).size,
    semantics: {
      documentErrors: errorsOf(validateDocument(doc)).map((e) => e.code),
      integrityErrors: auditPedigreeGraph(doc.graph).filter((i) => i.severity === 'error').map((i) => i.code),
      unsupportedConsanguinity: unsupportedConsanguinity(doc.graph),
      // the warnings panel the clinician sees ("Hata" / "Uyarı"; "Bilgi" excluded)
      appWarnings: validatePedigree({ ...doc.graph, ...layout }).filter((w) => !/^Bilgi/.test(w)),
    },
    geometry: {
      invariants: checkAllInvariants(pd).map((v) => v.code),
      connectorViolations: checkConnectorReadability(pd).map((v) => v.code),
      ...ownership(drawnGraph, layout.edges),
    },
    birthOrderViolations: birthOrderViolations(drawnGraph, layout.nodes),
    siblingsReordered: birthOrder(drawnGraph, layout.nodes).reordered,
    centring: { offCenter: m.offCenter, maxCentreOffset: m.maxCentreOffset, ...centring(drawnGraph, layout.nodes) },
    lines: {
      longUnions: m.longUnions, maxUnionSpan: m.maxUnionSpan, sideHang: m.sideHang,
      crossings: m.bridgedCrossings, unmarkedCrossings: m.crossings, stackedBuses: m.stackedBuses,
      lineOverOwnPartner: m.lineOverOwnPartner,
    },
    legibility: legibility(layout.nodes),
  };
}

/**
 * Edit stability: the case's fresh drawing is the previous drawing; the edit
 * is applied and drawn edit-locally. "Edit block" = people the graph diff
 * marks affected (incremental.affectedPeople), their sibships and partners;
 * everyone else is outside.
 */
export function measureEdit(doc, prev, edit, { ops, computeStableLayout, affectedPeople }) {
  const r = edit(ops, doc);
  if (!r.ok) return { refused: r.reason };
  const t0 = performance.now();
  const L = computeStableLayout(r.doc.graph, { prevGraph: doc.graph, prevNodes: prev.nodes, prevEdges: prev.edges });
  const ms = Math.round(performance.now() - t0);
  const g = r.doc.graph;
  const block = new Set(affectedPeople(doc.graph, g));
  for (const id of [...block]) {
    const rel = g.parentChildRelationships.find((x) => x.children.includes(id));
    if (rel) rel.children.forEach((c) => block.add(c));
    for (const u of g.unions) if (u.partners.includes(id)) u.partners.forEach((p) => block.add(p));
  }
  const px = new Map(prev.nodes.map((n) => [n.id, n]));
  const shift = (n) => Math.max(Math.abs(n.x - px.get(n.id).x), Math.abs(n.y - px.get(n.id).y));
  const common = L.nodes.filter((n) => px.has(n.id));
  const outside = common.filter((n) => !block.has(n.id));
  const X = (nodes, id) => (nodes.find((n) => n.id === id) || {}).x;
  const flip = ['mother', 'father'].every((p) => X(prev.nodes, p) !== undefined && X(L.nodes, p) !== undefined)
    && Math.sign(X(prev.nodes, 'mother') - X(prev.nodes, 'father')) !== Math.sign(X(L.nodes, 'mother') - X(L.nodes, 'father'));
  const orderBefore = birthOrderViolations(displayParentage(doc.graph).graph, prev.nodes).length;
  const after = measureDrawing(r.doc, L);
  return {
    level: L.meta.stability.level, ms,
    moved: common.filter((n) => shift(n) > MOVE_PX).length, people: common.length,
    movedOutsideBlock: outside.filter((n) => shift(n) > MOVE_PX).length, outsideBlock: outside.length,
    maxShiftPx: Math.round(Math.max(0, ...common.map(shift))),
    parentFlip: flip,
    birthOrderViolationsAdded: after.birthOrderViolations.length - orderBefore,
    violationsAfter: after.geometry.invariants.length + after.geometry.connectorViolations.length + after.geometry.wrongOwner.length,
    offCenterAfter: after.centring.offCenter, sideHangAfter: after.lines.sideHang,
  };
}
