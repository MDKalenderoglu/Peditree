/**
 * layoutInvariants.js — v0.5 measurement infrastructure (Step 0).
 *
 * The executable specification of "clinically safe pedigree layout." Pure
 * detectors over a built pedigree ({individuals, unions,
 * parentChildRelationships, nodes, edges}) — one function per named
 * invariant from PEDIGREE_LAYOUT_INVARIANTS.md.
 *
 * IMPORTANT: this module is MEASUREMENT ONLY. It does not modify the layout
 * engine or any app behaviour; it is consumed by the layout-fuzz harness to
 * baseline how the current engine fails. Some invariants overlap
 * geometrically (a single bad layout can trip several); that is intentional
 * for coverage — each is reported independently.
 *
 * Every detector returns an array of
 *   { code, severity, message, ids, generation? }
 * and never throws on malformed input (returns [] instead), so the fuzz
 * harness can run thousands of cases without crashing.
 */

import { buildLayoutModel } from '../utils/layoutModel';
import { computePedigreeIds } from '../utils/pedigreeNumbering';

const NODE_HALF = 20;   // liveborn symbol half-extent (matches PedigreeCanvas HALF)
const LOSS_HALF = 14;   // pregnancy-loss / stillbirth symbol half-extent
const EPS = 2;
const VIEWBOX_PAD = 100; // must match PedigreeCanvas viewBox pad

export const INVARIANT_CODES = [
  'NODE_SYMBOL_OVERLAP',
  'UNION_LINE_THROUGH_NODE',
  'DESCENT_LINE_THROUGH_NODE',
  'CHILD_BUS_THROUGH_NODE',
  'EDGE_THROUGH_NON_OWNER_NODE',
  'UNRELATED_NODE_IN_CHILD_FOOTPRINT',
  'UNRELATED_FAMILY_BLOCK_OVERLAP',
  'SHARED_CHILD_BUS_BETWEEN_UNRELATED_UNIONS',
  'WRONG_PARENT_BUS_ATTACHMENT',
  'CROSS_BRANCH_UNION_COLLAPSES_ANCESTOR_BLOCKS',
  'EXPORT_VIEWBOX_CLIPS_CONTENT',
  'GENERATION_ORDER_BROKEN',
  'PEDIGREE_ID_ORDER_BROKEN',
];

const symbolHalf = (n) => (n && (n.pregnancyLoss || n.stillbirth)) ? LOSS_HALF : NODE_HALF;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Run every invariant against a built pedigree. Returns a flat list of
 * violations. Safe on any input.
 */
export function checkAllInvariants(pd) {
  const data = normalize(pd);
  if (!data) return [];
  const out = [];
  const push = (arr) => { for (const v of arr) out.push(v); };
  try { push(checkNodeSymbolOverlap(data)); } catch { /* measurement must not crash */ }
  try { push(checkEdgeThroughNode(data)); } catch { /* */ }
  try { push(checkUnrelatedNodeInFootprint(data)); } catch { /* */ }
  try { push(checkUnrelatedFamilyBlockOverlap(data)); } catch { /* */ }
  try { push(checkSharedChildBus(data)); } catch { /* */ }
  try { push(checkWrongParentBusAttachment(data)); } catch { /* */ }
  try { push(checkCrossBranchUnionCollapse(data)); } catch { /* */ }
  try { push(checkExportViewboxClips(data)); } catch { /* */ }
  try { push(checkGenerationOrder(data)); } catch { /* */ }
  try { push(checkPedigreeIdOrder(data)); } catch { /* */ }
  return out;
}

function normalize(pd) {
  if (!pd) return null;
  const individuals = pd.individuals || [];
  const unions = pd.unions || [];
  const parentChildRelationships = pd.parentChildRelationships || [];
  const nodes = pd.nodes || [];
  const edges = pd.edges || [];
  if (nodes.length === 0) return null;
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const unionById = new Map(unions.map(u => [u.id, u]));
  return { individuals, unions, parentChildRelationships, nodes, edges, nodeById, unionById, graph: { individuals, unions, parentChildRelationships } };
}

// ── 1. NODE_SYMBOL_OVERLAP ─────────────────────────────────────
function checkNodeSymbolOverlap({ nodes }) {
  const out = [];
  const MIN = NODE_HALF * 2; // two liveborn symbols must be ≥ this apart on at least one axis
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (!finite(a.x) || !finite(a.y) || !finite(b.x) || !finite(b.y)) continue;
      const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
      const bothLoss = (a.pregnancyLoss || a.stillbirth) && (b.pregnancyLoss || b.stillbirth);
      const exact = dx < 10 && dy < 10;
      const overlap = dx < MIN && dy < MIN;
      if (exact || (overlap && !bothLoss)) {
        out.push({ code: 'NODE_SYMBOL_OVERLAP', severity: 'error',
          message: `Symbols '${a.id}' and '${b.id}' overlap (dx=${dx.toFixed(0)}, dy=${dy.toFixed(0)}).`,
          ids: [a.id, b.id], generation: a.generation });
      }
    }
  }
  return out;
}

// ── 2–5. *_THROUGH_NODE family ────────────────────────────────
// A structural connector segment that passes through a node's symbol box
// while that node is NOT one of the segment's endpoint owners.
function checkEdgeThroughNode({ edges, nodes }) {
  const out = [];
  const typeToCode = {
    union: 'UNION_LINE_THROUGH_NODE',
    consanguineousUnion: 'UNION_LINE_THROUGH_NODE',
    consanguineousUnionUnresolved: 'UNION_LINE_THROUGH_NODE',
    parentChildDrop: 'DESCENT_LINE_THROUGH_NODE',
    childStem: 'DESCENT_LINE_THROUGH_NODE',
    sibship: 'CHILD_BUS_THROUGH_NODE',
  };
  for (const edge of edges) {
    const code = typeToCode[edge.type];
    if (!code) continue;
    if (!finite(edge.x1) || !finite(edge.y1) || !finite(edge.x2) || !finite(edge.y2)) continue;
    const horizontal = Math.abs(edge.y1 - edge.y2) < EPS;
    const vertical = Math.abs(edge.x1 - edge.x2) < EPS;
    if (!horizontal && !vertical) continue;
    for (const node of nodes) {
      if (!finite(node.x) || !finite(node.y)) continue;
      const half = symbolHalf(node);
      const atEndpoint =
        (Math.abs(node.x - edge.x1) < half && Math.abs(node.y - edge.y1) < half) ||
        (Math.abs(node.x - edge.x2) < half && Math.abs(node.y - edge.y2) < half);
      if (atEndpoint) continue;
      let through;
      if (horizontal) {
        const lo = Math.min(edge.x1, edge.x2), hi = Math.max(edge.x1, edge.x2);
        through = Math.abs(node.y - edge.y1) < half && node.x > lo + EPS && node.x < hi - EPS;
      } else {
        const lo = Math.min(edge.y1, edge.y2), hi = Math.max(edge.y1, edge.y2);
        through = Math.abs(node.x - edge.x1) < half && node.y > lo + EPS && node.y < hi - EPS;
      }
      if (through) {
        out.push({ code, severity: 'error',
          message: `${edge.type} connector passes through non-owner individual '${node.id}'.`,
          ids: [node.id], generation: node.generation });
        // also record the umbrella code once
        out.push({ code: 'EDGE_THROUGH_NON_OWNER_NODE', severity: 'error',
          message: `A ${edge.type} connector passes through non-owner individual '${node.id}'.`,
          ids: [node.id], generation: node.generation });
      }
    }
  }
  return out;
}

// ── 6. UNRELATED_NODE_IN_CHILD_FOOTPRINT ──────────────────────
function checkUnrelatedNodeInFootprint({ nodes, unions, parentChildRelationships, nodeById }) {
  const out = [];
  for (const rel of parentChildRelationships) {
    const kids = rel.children.map(id => nodeById.get(id)).filter(Boolean);
    if (kids.length === 0) continue;
    const union = unions.find(u => u.id === rel.unionId);
    if (!union) continue;
    const xs = kids.map(k => k.x).filter(finite);
    if (xs.length === 0) continue;
    const minX = Math.min(...xs) + NODE_HALF;
    const maxX = Math.max(...xs) - NODE_HALF;
    if (maxX <= minX) continue;
    const parentGen = kids[0].generation - 1;
    for (const node of nodes) {
      if (node.generation !== parentGen || !finite(node.x)) continue;
      if (union.partners.includes(node.id)) continue;
      if (node.x > minX && node.x < maxX) {
        out.push({ code: 'UNRELATED_NODE_IN_CHILD_FOOTPRINT', severity: 'error',
          message: `Individual '${node.id}' sits inside union '${rel.unionId}''s child fan without being a partner.`,
          ids: [node.id, rel.unionId], generation: node.generation });
      }
    }
  }
  return out;
}

// ── 7. UNRELATED_FAMILY_BLOCK_OVERLAP ─────────────────────────
// Two root-union subtrees that share NO marriage between them must occupy
// disjoint x-bands. Overlap ⇒ two independent families collapsed together.
function checkUnrelatedFamilyBlockOverlap(data) {
  const out = [];
  const model = buildLayoutModel(data.graph);
  const roots = model.rootUnions || [];
  const blocks = roots.map(uid => ({ uid, nodeIds: descendantNodeIds(uid, model), }))
    .map(b => ({ ...b, bbox: xBBox(b.nodeIds, data.nodeById) }))
    .filter(b => b.bbox);

  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const A = blocks[i], B = blocks[j];
      if (marriageConnects(A.nodeIds, B.nodeIds, data.unions)) continue; // related ⇒ allowed to touch
      const overlap = Math.min(A.bbox.maxX, B.bbox.maxX) - Math.max(A.bbox.minX, B.bbox.minX);
      if (overlap > NODE_HALF) {
        out.push({ code: 'UNRELATED_FAMILY_BLOCK_OVERLAP', severity: 'error',
          message: `Unrelated family blocks (roots '${A.uid}' & '${B.uid}') overlap in x by ${overlap.toFixed(0)}px.`,
          ids: [A.uid, B.uid] });
      }
    }
  }
  return out;
}

function descendantNodeIds(rootUnionId, model) {
  const ids = new Set();
  const stack = [rootUnionId];
  const seen = new Set();
  while (stack.length) {
    const uid = stack.pop();
    if (seen.has(uid)) continue;
    seen.add(uid);
    const union = model.unionById.get(uid);
    if (union) union.partners.forEach(p => ids.add(p));
    (model.childIdsOfUnion.get(uid) || []).forEach(c => ids.add(c));
    (model.childUnionsOf.get(uid) || []).forEach(v => stack.push(v));
  }
  return ids;
}

function xBBox(nodeIds, nodeById) {
  const xs = [];
  for (const id of nodeIds) {
    const n = nodeById.get(id);
    if (n && finite(n.x)) xs.push(n.x);
  }
  if (xs.length === 0) return null;
  return { minX: Math.min(...xs), maxX: Math.max(...xs) };
}

function marriageConnects(setA, setB, unions) {
  for (const u of unions) {
    const [p1, p2] = u.partners;
    if ((setA.has(p1) && setB.has(p2)) || (setA.has(p2) && setB.has(p1))) return true;
  }
  return false;
}

// ── 8. SHARED_CHILD_BUS_BETWEEN_UNRELATED_UNIONS ──────────────
function unionRails({ parentChildRelationships, unions, nodeById }) {
  const rails = [];
  for (const rel of parentChildRelationships) {
    const kids = rel.children.map(id => nodeById.get(id)).filter(Boolean);
    if (kids.length === 0) continue;
    const union = unions.find(u => u.id === rel.unionId);
    const partners = union ? union.partners.map(p => nodeById.get(p)).filter(Boolean) : [];
    if (partners.length === 0) continue;
    const unionY = partners[0].y;
    const childYs = kids.map(k => k.y).filter(finite);
    const childXs = kids.map(k => k.x).filter(finite);
    if (childYs.length === 0 || childXs.length === 0) continue;
    rails.push({ unionId: rel.unionId, railY: (unionY + Math.min(...childYs)) / 2,
      minX: Math.min(...childXs), maxX: Math.max(...childXs), childIds: rel.children });
  }
  return rails;
}

function checkSharedChildBus(data) {
  const out = [];
  const rails = unionRails(data);
  const TOL = 6, MIN_OVERLAP = 20;
  for (let a = 0; a < rails.length; a++) {
    for (let b = a + 1; b < rails.length; b++) {
      const ra = rails[a], rb = rails[b];
      if (Math.abs(ra.railY - rb.railY) > TOL) continue;
      const overlap = Math.min(ra.maxX, rb.maxX) - Math.max(ra.minX, rb.minX);
      if (overlap > MIN_OVERLAP) {
        out.push({ code: 'SHARED_CHILD_BUS_BETWEEN_UNRELATED_UNIONS', severity: 'error',
          message: `Unions '${ra.unionId}' & '${rb.unionId}' share a child bus at y≈${ra.railY.toFixed(0)} (x-overlap ${overlap.toFixed(0)}px).`,
          ids: [ra.unionId, rb.unionId] });
      }
    }
  }
  return out;
}

// ── 9. WRONG_PARENT_BUS_ATTACHMENT ────────────────────────────
// A child sits at an x inside a DIFFERENT union's rail span at that rail's y
// — visually it appears to hang from the wrong couple's sibship bus.
function checkWrongParentBusAttachment(data) {
  const out = [];
  const rails = unionRails(data);
  for (const rail of rails) {
    for (const other of rails) {
      if (other.unionId === rail.unionId) continue;
      if (Math.abs(other.railY - rail.railY) > 6) continue;
      for (const childId of rail.childIds) {
        const c = data.nodeById.get(childId);
        if (!c || !finite(c.x)) continue;
        if (other.childIds.includes(childId)) continue;
        if (c.x > other.minX + EPS && c.x < other.maxX - EPS) {
          out.push({ code: 'WRONG_PARENT_BUS_ATTACHMENT', severity: 'error',
            message: `Child '${childId}' of union '${rail.unionId}' falls under union '${other.unionId}''s child bus.`,
            ids: [childId, rail.unionId, other.unionId], generation: c.generation });
        }
      }
    }
  }
  return out;
}

// ── 10. CROSS_BRANCH_UNION_COLLAPSES_ANCESTOR_BLOCKS ──────────
// A same-generation union whose partners are far apart AND whose horizontal
// union line passes over an intervening node.
function checkCrossBranchUnionCollapse(data) {
  const out = [];
  const FAR = 3 * 90; // > 3 node slots apart
  for (const edge of data.edges) {
    if (!(edge.type === 'union' || edge.type === 'consanguineousUnion' || edge.type === 'consanguineousUnionUnresolved')) continue;
    if (!finite(edge.x1) || !finite(edge.x2)) continue;
    const span = Math.abs(edge.x1 - edge.x2);
    if (span < FAR) continue;
    const lo = Math.min(edge.x1, edge.x2), hi = Math.max(edge.x1, edge.x2);
    let intervening = 0;
    for (const node of data.nodes) {
      if (!finite(node.x) || !finite(node.y)) continue;
      if (Math.abs(node.y - edge.y1) > NODE_HALF) continue;
      const atEnd = Math.abs(node.x - edge.x1) < NODE_HALF || Math.abs(node.x - edge.x2) < NODE_HALF;
      if (atEnd) continue;
      if (node.x > lo + EPS && node.x < hi - EPS) intervening++;
    }
    if (intervening > 0) {
      out.push({ code: 'CROSS_BRANCH_UNION_COLLAPSES_ANCESTOR_BLOCKS', severity: 'error',
        message: `Distant union '${edge.unionId}' (span ${span.toFixed(0)}px) runs over ${intervening} intervening node(s).`,
        ids: [edge.unionId] });
    }
  }
  return out;
}

// ── 11. EXPORT_VIEWBOX_CLIPS_CONTENT ──────────────────────────
// Replicate PedigreeCanvas' viewBox (node-bbox + pad) and verify every drawn
// point (node symbol extents + edge endpoints) is inside it.
function checkExportViewboxClips({ nodes, edges }) {
  const xs = nodes.map(n => n.x).filter(finite);
  const ys = nodes.map(n => n.y).filter(finite);
  if (xs.length === 0 || ys.length === 0) return [];
  const vMinX = Math.min(...xs) - VIEWBOX_PAD, vMaxX = Math.max(...xs) + VIEWBOX_PAD;
  const vMinY = Math.min(...ys) - VIEWBOX_PAD, vMaxY = Math.max(...ys) + VIEWBOX_PAD;
  const out = [];
  const outside = (x, y) => x < vMinX || x > vMaxX || y < vMinY || y > vMaxY;
  for (const n of nodes) {
    if (!finite(n.x) || !finite(n.y)) continue;
    const h = symbolHalf(n);
    if (outside(n.x - h, n.y - h) || outside(n.x + h, n.y + h)) {
      out.push({ code: 'EXPORT_VIEWBOX_CLIPS_CONTENT', severity: 'error',
        message: `Node '${n.id}' symbol extends outside export viewBox.`, ids: [n.id] });
    }
  }
  for (const e of edges) {
    const pts = [];
    if (finite(e.x1) && finite(e.y1)) pts.push([e.x1, e.y1]);
    if (finite(e.x2) && finite(e.y2)) pts.push([e.x2, e.y2]);
    if (finite(e.x) && finite(e.y)) pts.push([e.x, e.y]);
    for (const [x, y] of pts) {
      if (outside(x, y)) {
        out.push({ code: 'EXPORT_VIEWBOX_CLIPS_CONTENT', severity: 'error',
          message: `A ${e.type} edge endpoint lies outside export viewBox.`, ids: e.unionId ? [e.unionId] : [] });
        break;
      }
    }
  }
  return out;
}

// ── 12. GENERATION_ORDER_BROKEN ───────────────────────────────
function checkGenerationOrder({ nodes }) {
  const out = [];
  const byGen = new Map();
  for (const n of nodes) {
    if (!finite(n.y) || typeof n.generation !== 'number') continue;
    if (!byGen.has(n.generation)) byGen.set(n.generation, []);
    byGen.get(n.generation).push(n);
  }
  // all same-gen share one y
  const genY = new Map();
  for (const [gen, arr] of byGen) {
    const y0 = arr[0].y;
    if (arr.some(n => Math.abs(n.y - y0) > EPS)) {
      out.push({ code: 'GENERATION_ORDER_BROKEN', severity: 'error',
        message: `Generation ${gen} nodes are not on one horizontal band.`, ids: arr.map(n => n.id), generation: gen });
    }
    genY.set(gen, y0);
  }
  // deeper generation ⇒ strictly greater y
  const gens = [...genY.keys()].sort((a, b) => a - b);
  for (let i = 1; i < gens.length; i++) {
    if (genY.get(gens[i]) <= genY.get(gens[i - 1])) {
      out.push({ code: 'GENERATION_ORDER_BROKEN', severity: 'error',
        message: `Generation ${gens[i]} is not below generation ${gens[i - 1]} (y ${genY.get(gens[i]).toFixed(0)} ≤ ${genY.get(gens[i - 1]).toFixed(0)}).`,
        ids: [], generation: gens[i] });
    }
  }
  return out;
}

// ── 13. PEDIGREE_ID_ORDER_BROKEN ──────────────────────────────
function checkPedigreeIdOrder({ nodes }) {
  const out = [];
  const ids = computePedigreeIds(nodes); // Map id -> { displayId, roman, index }
  const byGen = new Map();
  for (const n of nodes) {
    if (!finite(n.x)) continue;
    const info = ids.get(n.id);
    if (!info) continue;
    if (!byGen.has(n.generation)) byGen.set(n.generation, []);
    byGen.get(n.generation).push({ id: n.id, x: n.x, index: info.indexInGeneration });
  }
  for (const [gen, arr] of byGen) {
    const byX = [...arr].sort((a, b) => a.x - b.x);
    for (let i = 0; i < byX.length; i++) {
      if (byX[i].index !== i + 1) {
        out.push({ code: 'PEDIGREE_ID_ORDER_BROKEN', severity: 'error',
          message: `In generation ${gen}, left-to-right order does not match pedigree index numbering.`,
          ids: byX.map(b => b.id), generation: gen });
        break;
      }
    }
  }
  return out;
}
