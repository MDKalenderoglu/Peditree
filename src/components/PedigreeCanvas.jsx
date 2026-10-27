/**
 * PedigreeCanvas.jsx
 *
 * Renders pedigree nodes and typed edges via D3/SVG.
 *
 * Edge types rendered:
 *   "union"               — thin gray horizontal line between partners
 *   "consanguineousUnion"  — double horizontal line
 *   "sibship"             — thin gray horizontal rail
 *   "parentChildDrop"     — vertical line (union center → sibship rail)
 *   "childStem"           — vertical line (sibship rail → child node)
 *   "divorceSlash"        — one diagonal slash at (x,y) (separated or divorced)
 *   "childlessDrop"       — short vertical from union center (no children)
 *   "childlessBar"        — horizontal bar at end of childlessDrop (inverted T)
 *   "childStem" (twin)    — diagonal from the group's point on the bus (twins)
 *   "twinBar"             — bar between monozygotic twins' lines
 *   "twinUnknown"         — "?" between twins' lines (zygosity unknown)
 *
 * Node shapes:
 *   male      → square
 *   female    → circle
 *   unknown   → diamond
 *   pregnancyLoss / termination / ectopic → small triangle (TOP slashed, ECT below)
 *   stillbirth → full-size symbol, slash, "SB" below; ongoingPregnancy → "P" inside
 */

import { useEffect, useRef, useState, useCallback, forwardRef } from 'react';
import * as d3 from 'd3';
import { fillFor, REGION_ANGLES } from '../graph/conditionKey';
import { computePedigreeIds } from '../utils/pedigreeNumbering';
import { annotationAge, pregnancyLine } from '../utils/annotations';
import { isSmallSymbol, isPregnancy, pregnancyKind, PREGNANCY_LABEL, GENETIC_TESTED, TESTED_TEXT, geneticLines } from '../graph/model';
import { packLines } from '../utils/textWrap';
import { keyGrid } from '../utils/keyGrid';

const EDGE_COLOR = '#64748b';
const NODE_STROKE = '#1e293b';
const NODE_FILL = '#ffffff';
const NODE_SIZE = 40;
const HALF = NODE_SIZE / 2;
const LOSS_SIZE = 14; // smaller triangle for pregnancy loss
const GENETIC_ROW = 11; // one line of a genetic test result under a symbol

const JUMP_R = 5;

/**
 * SVG path for one connector segment. A horizontal segment carrying
 * `bridges` (x positions where a line of ANOTHER family crosses it — set by
 * the PCL router) gets a small arc at each crossing: the standard
 * "line jump" that shows the two lines are not connected.
 */
function connectorPath(x1, y1, x2, y2, bridges) {
  if (y1 !== y2 || !Array.isArray(bridges) || bridges.length === 0) {
    return `M${x1},${y1}L${x2},${y2}`;
  }
  const xa = Math.min(x1, x2), xb = Math.max(x1, x2);
  let d = `M${xa},${y1}`;
  for (const bx of bridges) {
    if (bx - JUMP_R <= xa || bx + JUMP_R >= xb) continue;
    d += `L${bx - JUMP_R},${y1}A${JUMP_R},${JUMP_R} 0 0 1 ${bx + JUMP_R},${y1}`;
  }
  return `${d}L${xb},${y1}`;
}

/** Pie sector from the centre over [a0, a1] degrees (clipped to the symbol by the caller). */
function sectorPath(a0, a1, r) {
  const p = (a) => [r * Math.cos((a * Math.PI) / 180), r * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M0,0L${x0},${y0}A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1},${y1}Z`;
}

const FILL_PAINT = { solid: NODE_STROKE, grey: '#9ca3af', hatch: 'url(#fill-hatch)', dots: 'url(#fill-dots)' };

/** Patterns for findings drawn in a region (graph/conditionKey.js FILLS). */
function addFindingPatterns(defs) {
  const hatch = defs.append('pattern').attr('id', 'fill-hatch').attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 5).attr('height', 5).attr('patternTransform', 'rotate(45)');
  hatch.append('rect').attr('width', 5).attr('height', 5).attr('fill', NODE_FILL);
  hatch.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 5).attr('stroke', NODE_STROKE).attr('stroke-width', 1.6);
  const dots = defs.append('pattern').attr('id', 'fill-dots').attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 5).attr('height', 5);
  dots.append('rect').attr('width', 5).attr('height', 5).attr('fill', NODE_FILL);
  dots.append('circle').attr('cx', 2.5).attr('cy', 2.5).attr('r', 1.1).attr('fill', NODE_STROKE);
}

/**
 * Mark a symbol's regions (NSGC: one region per finding, defined in the
 * legend; graph/conditionKey.js): thin quadrant lines divide the symbol
 * (as in the clinic's reference sheet), each finding's sector in its fill,
 * clipped to the outline, with a white gap to its neighbours so two
 * findings never read as one (clinician feedback 2026-10-24); a carrier's
 * part is half of the region.
 */
function drawRegions(el, defs, clipId, outline, parts, sz) {
  const clip = defs.append('clipPath').attr('id', clipId);
  clip.node().appendChild(outline.node().cloneNode());
  const regions = el.append('g').attr('class', 'condition-regions').attr('clip-path', `url(#${clipId})`);
  const R = sz * 1.8;
  regions.append('line').attr('class', 'region-divider').attr('x1', 0).attr('y1', -R).attr('x2', 0).attr('y2', R)
    .attr('stroke', NODE_STROKE).attr('stroke-width', 1);
  regions.append('line').attr('class', 'region-divider').attr('x1', -R).attr('y1', 0).attr('x2', R).attr('y2', 0)
    .attr('stroke', NODE_STROKE).attr('stroke-width', 1);
  for (const p of parts) {
    regions.append('path').attr('class', p.carrier ? 'condition-carrier' : 'condition-region')
      .attr('d', sectorPath(p.a0, p.a1, R))
      .attr('fill', FILL_PAINT[p.fill] || NODE_STROKE).attr('stroke', NODE_FILL).attr('stroke-width', Math.max(1.2, sz * 0.12));
  }
  // outline on top, so the regions never thin the symbol's border
  el.node().appendChild(outline.node().cloneNode());
  el.select(':scope > :last-child').attr('fill', 'none').attr('class', 'pedigree-shape-outline');
}

/** One stroke of a connector, optionally offset (dx, dy) — used for double lines. */
function drawStroke(g, edge, dx = 0, dy = 0) {
  const path = g.append('path')
    .attr('d', connectorPath(edge.x1 + dx, edge.y1 + dy, edge.x2 + dx, edge.y2 + dy, edge.bridges))
    .attr('stroke', EDGE_COLOR).attr('stroke-width', 1.5).attr('fill', 'none');
  // NSGC: a line of descent to an adoptive/foster child is dashed (model:
  // graph.socialParentLinks, layout: edge.descentKind).
  if (edge.descentKind) path.attr('stroke-dasharray', '6 4');
  return path;
}

// SVG export needs a stable handle to the actual rendered <svg> node.
// We forward a ref out to the caller (App.jsx) instead of relying on
// document.getElementById, which silently returns null if the id ever
// drifts out of sync with exportUtils.js. The id is kept too, as a
// belt-and-suspenders fallback for exportUtils.js and for tests/tools
// that query the DOM directly.
const PedigreeCanvas = forwardRef(function PedigreeCanvas(
  { nodes, edges, selectedNodeId, selectedNodeId2, selectedIds = [], onNodeSelect, onUnionSelect, conditionKey = [], renderQuickBar, patientName = '', onEditText, multiSelect = false, focusTick = 0, onNodeDrop, onBackgroundClick },
  forwardedRef
) {
  const svgRef = useRef(null);
  const focusTickRef = useRef(0);
  const lastNodesRef = useRef(null);
  const boxRef = useRef(null);
  // where the quick-add bar sits: under the single selected person's symbol
  // Every text on the page can be corrected where it stands (clinician
  // request 2026-10-25): a click opens a field over it; the change goes to
  // its source (the person, the finding for everyone, the patient's name).
  const [editing, setEditing] = useState(null);
  const committed = useRef(false);
  const startEdit = useCallback((kind, target, value, el) => {
    if (!boxRef.current) return;
    const r = el.getBoundingClientRect(), b = boxRef.current.getBoundingClientRect();
    committed.current = false;
    setEditing({ kind, target, value: value ?? '', x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height });
  }, []);
  const finishEdit = (value) => {
    if (!editing || committed.current) return;
    committed.current = true;
    if (onEditText && value !== editing.value) onEditText(editing.kind, editing.target, value);
    setEditing(null);
  };

  // where the add menu sits: around the single selected person's symbol
  const [anchor, setAnchor] = useState(null);
  // Where the selected person was on screen before a redraw: a relayout
  // (adding relatives) must not carry the person the clinician is working on
  // to another part of the screen (clinician feedback 2026-10-25).
  const keepRef = useRef(null); // { id, cx, cy, spu } screen centre, px per drawing unit
  const measureSelected = () => {
    const svgEl = svgRef.current;
    const shape = svgEl && svgEl.querySelector('.node-selected .pedigree-shape');
    if (!shape) return null;
    const r = shape.getBoundingClientRect(), b = shape.getBBox(), s0 = svgEl.getBoundingClientRect();
    if (!b.width || !r.width) return null;
    return { cx: r.left + r.width / 2 - s0.left, cy: r.top + r.height / 2 - s0.top, spu: r.width / b.width };
  };
  const placeQuickBar = useCallback(() => {
    const shape = svgRef.current && svgRef.current.querySelector('.node-selected .pedigree-shape');
    if (!shape || !boxRef.current || selectedNodeId2 || selectedIds.length > 1) { setAnchor(null); return; }
    const r = shape.getBoundingClientRect(), box = boxRef.current.getBoundingClientRect();
    setAnchor({ x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top, size: Math.max(r.width, r.height), boxW: box.width, boxH: box.height });
  }, [selectedNodeId2, selectedIds.length]);

  const attachSvgRef = (node) => {
    svgRef.current = node;
    if (!forwardedRef) return;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else forwardedRef.current = node;
  };

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    // the selected person's place on screen, from the drawing about to go
    const before = selectedNodeId && keepRef.current && keepRef.current.id === selectedNodeId ? keepRef.current : null;
    // a person with the keyboard focus keeps it across the redraw
    const focusedId = svgRef.current.contains(document.activeElement) ? document.activeElement.getAttribute('data-node-id') : null;
    svg.selectAll('*').remove();
    const editable = (sel, kind, target, value) => sel.classed('editable', true).style('cursor', 'text')
      .on('click', (event) => { event.stopPropagation(); startEdit(kind, target, value, event.currentTarget); });

    if (nodes.length === 0) {
      // Draw a placeholder message
      svg.attr('viewBox', '0 0 800 400');
      svg.append('text')
        .attr('x', 400).attr('y', 200)
        .attr('text-anchor', 'middle')
        .attr('fill', '#94a3b8')
        .attr('font-size', '16px')
        .text('Yeni bir pedigri başlatmak için üstteki "Yeni" düğmesine basın.');
      return;
    }

    // --- Legends (inside the SVG so they are exported): findings key at the
    // top right (clinician choice 2026-10-24), clinical notes at the bottom ---
    // findings key: a row for each finding a relative is affected by (its
    // quadrant), and one for each finding someone carries ("… taşıyıcısı",
    // the left half — clinician decision 2026-10-25); the proband is drawn
    // fully filled, their findings stand in the first line
    const has = (status, entry) => nodes.some(n => (status === 'carrier' || !n.proband) && (n.conditions || []).some(c =>
      c && c.label && c.status === status
      && c.label.trim().toLocaleLowerCase('tr') === entry.label.trim().toLocaleLowerCase('tr')));
    const shownKey = [
      ...conditionKey.filter(e => has('affected', e)).map(e => ({ ...e, carrier: false, text: e.label })),
      ...conditionKey.filter(e => has('carrier', e)).map(e => ({ ...e, carrier: true, text: `${e.label} taşıyıcısı` })),
    ];
    const onsetsOf = (n) => (n.conditions || []).filter(c => c && c.label && c.onsetAge && (c.status === 'affected' || c.status === 'carrier'));
    const unsureOf = (n) => (n.conditions || []).filter(c => c && c.label && c.status === 'unknown');
    const bornWeek = (n) => (!isPregnancy(n) && n.gestationWeeks ? n.gestationWeeks : null);
    const notedNodes = nodes.filter(n => n.notes || n.condition || (n.deceased && n.causeOfDeath) || onsetsOf(n).length || unsureOf(n).length || bornWeek(n));
    // legends grow with a wide pedigree, so they read at the same size once
    // the drawing is fitted to the screen (clinician feedback 2026-10-24)
    const LK = Math.max(1.2, (d3.max(nodes, d => d.x) - d3.min(nodes, d => d.x) + 200) / 900);
    const KEY_ROW = 22 * LK, NOTE_ROW = 16 * LK, TITLE_ROW = 20 * LK;
    // long key and note text wraps onto more lines, never cut (audit
    // 2026-10-25); the blocks grow with the lines
    const KEY_LINE = 15 * LK, HEAD_LINE = 17 * LK, KEY_CHARS = 40;
    const keyLines = shownKey.map(e => packLines([{ text: e.text }], KEY_CHARS));
    const keyRowH = keyLines.map(l => KEY_ROW + (l.length - 1) * KEY_LINE);

    // --- ViewBox ---
    const pad = 100;
    const minX = d3.min(nodes, d => d.x) - pad;
    const maxX = d3.max(nodes, d => d.x) + pad;
    // v0.3a.3 — pedigree-standard visible IDs (I-1, II-3, ...). Purely
    // derived from the already-computed generation + x-position of every
    // node; recomputes automatically on every render, so a birth-order
    // reorder (which changes x) renumbers correctly with no extra wiring.
    const pedigreeIds = computePedigreeIds(nodes);
    const noteChars = Math.max(40, Math.floor((Math.max(600, maxX - minX) - 30) / (6.6 * LK)));
    const noteLines = notedNodes.map((n, i) => {
      // pedigree number plus the clinician's own label — never an internal id
      const pid = pedigreeIds.get(n.id)?.displayId || '—';
      const who = n.displayLabel ? `${pid} (${n.displayLabel})` : pid;
      const segs = [{ text: `[${i + 1}] ${who}: `, head: true }];
      const parts = [];
      if (n.condition) parts.push(['condition', n.condition, n.condition]);
      if (n.deceased && n.causeOfDeath) parts.push(['causeOfDeath', `Ölüm: ${n.causeOfDeath}`, n.causeOfDeath]);
      // the age a finding was diagnosed at (clinician decision 2026-10-25: here, not under the symbol)
      onsetsOf(n).forEach(c => parts.push(['onset', `${c.label}: tanı ${/^\d+(,\d+)?$/.test(c.onsetAge) ? `${c.onsetAge} yaş` : c.onsetAge}`, c.onsetAge, `${n.id}\u0001${c.label}`]));
      // a finding the clinician is unsure about, and the week a child was born in (clinician decisions 2026-10-25)
      unsureOf(n).forEach(c => parts.push(['unsure', `${c.label}: bilinmiyor`, null]));
      if (bornWeek(n)) parts.push(['gestationWeeks', `doğum: ${bornWeek(n)} hf`, bornWeek(n)]);
      if (n.notes) parts.push(['note', n.notes, n.notes]);
      parts.forEach(([kind, shown, value, target], k) => {
        if (k) segs.push({ text: ' | ' });
        segs.push({ text: shown, kind: kind === 'unsure' ? undefined : kind, target: target || n.id, value });
      });
      return packLines(segs, noteChars);
    });
    const notesBlock = noteLines.length ? TITLE_ROW + d3.sum(noteLines, l => l.length) * NOTE_ROW + 10 * LK : 0;
    // the key's first line (clinician request 2026-10-25): the patient's
    // name, the proband's own symbol, the proband's findings
    const probandNode = nodes.find(n => n.proband);
    const probandFindings = probandNode ? (probandNode.conditions || []).filter(c => c && c.label && c.status === 'affected').map(c => c.label.trim()) : [];
    const name = patientName.trim();
    const headLines = packLines(probandFindings.flatMap((label, k) => [
      ...(k ? [{ text: ', ' }] : []), { text: label, kind: 'finding', target: label, value: label },
    ]), KEY_CHARS);
    const headBlock = probandNode && (name || probandFindings.length) ? 30 * LK + Math.max(0, headLines.length - 1) * HEAD_LINE : 0;
    // the key's columns: [name] [symbol] [text]; the findings run side by
    // side under the proband's line, as many as the drawing's width allows
    // (clinician request 2026-10-27: one under another wasted the top)
    const KS = 8 * LK, KEY_GAP = 28 * LK;
    const lineLen = (l) => l.reduce((n, p) => n + p.text.length, 0);
    const textW = (lines) => Math.max(40, ...lines.map(l => lineLen(l) * 7.2 * LK));
    const nameW = headBlock && name ? name.length * 8.4 * LK + 12 * LK : 0;
    const entryW = keyLines.map(lines => 2 * KS + 12 * LK + textW(lines));
    const keyRight = minX + Math.max(600, maxX - minX) - 10 * LK; // the picture's right edge (vw below)
    const grid = keyGrid(entryW, keyRowH, keyRight - minX - 10 * LK - nameW, KEY_GAP);
    const keyBlock = shownKey.length ? grid.height + 14 * LK : 0;
    const minY = d3.min(nodes, d => d.y) - pad - headBlock - keyBlock;
    // how far the lines under a symbol reach (age, pregnancy, E, wrapped
    // note, label, older text, note number) — the same rules as below; the
    // frame and the notes start under the lowest one (second audit 2026-10-25:
    // a long note could leave the picture)
    // the genetic test lines under a symbol, each wrapped, never cut
    const geneticRows = (d) => {
      if (d.geneticTest !== GENETIC_TESTED) return [];
      const lines = geneticLines(d);
      if (!lines.length) return [{ text: TESTED_TEXT, k: 0, value: '', placeholder: true }];
      // ~20 characters fit between two siblings (100 apart), so a variant with
      // its zygosity ("TGFBR2 c.1609C>T het") stays on one line
      return lines.flatMap((line, k) => packLines([{ text: line }], d.proband ? 17 : 20)
        .map(part => ({ text: part.map(x => x.text).join(''), k, value: line })));
    };
    const annotationBottom = (d) => {
      const lines = [annotationAge(d), pregnancyLine(d), d.displayLabel, d.condition, notedNodes.includes(d)].filter(Boolean).length;
      return (isSmallSymbol(d) ? LOSS_SIZE : HALF) + 14 + lines * 13 + geneticRows(d).length * GENETIC_ROW;
    };
    const lowest = d3.max(nodes, d => d.y + annotationBottom(d));
    const legendTop = Math.max(d3.max(nodes, d => d.y) + 70, lowest + 18); // clear of the age / label lines
    const maxY = Math.max(d3.max(nodes, d => d.y) + pad, lowest + 20, legendTop + notesBlock + 10);
    const vw = Math.max(600, maxX - minX);
    const vh = Math.max(400, maxY - minY);
    svg.attr('viewBox', `${minX} ${minY} ${vw} ${vh}`)
       .attr('preserveAspectRatio', 'xMidYMid meet');

    // --- Defs ---
    const defs = svg.append('defs');
    // Carrier half-fill pattern
    const cp = defs.append('pattern')
      .attr('id', 'carrier-half')
      .attr('width', 1).attr('height', 1)
      .attr('patternContentUnits', 'objectBoundingBox');
    cp.append('rect').attr('x', 0).attr('y', 0).attr('width', 0.5).attr('height', 1).attr('fill', NODE_STROKE);
    cp.append('rect').attr('x', 0.5).attr('y', 0).attr('width', 0.5).attr('height', 1).attr('fill', NODE_FILL);
    addFindingPatterns(defs);

    // The zoom/pan transform is applied to this group only; export resets it
    // so the file always contains the whole pedigree (exportUtils.js).
    const g = svg.append('g').attr('class', 'pedigree-viewport');

    // =====================
    // DRAW EDGES
    // =====================
    edges.forEach(edge => {
      switch (edge.type) {
        case 'union':
          // v0.3a.3 fix: pedigree relationship lines never carry canvas
          // text. Non-consanguinity relationship backgrounds (same
          // village/origin, no consanguinity reported, unknown) are purely
          // a normal single line here — any metadata about them belongs in
          // the side panel (IndividualEditor.jsx), never
          // drawn on the connector itself. See relationshipBackground.js.
          drawStroke(g, edge);
          break;

        case 'consanguineousUnion':
        case 'consanguineousUnionUnresolved':
          // v0.3a.3 fix: consanguinity is a pedigree-standard structural
          // fact, not a UI design choice — a union the clinician reports as
          // consanguineous is ALWAYS drawn as a standard solid black double
          // line, whether or not the shared-ancestor path is also modeled
          // in the graph (consanguineousUnion vs. consanguineousUnionUnresolved
          // are kept as distinct edge *types* internally — see
          // pedigreeLayout.js / relationshipBackground.js — purely so the
          // known_supported/reported_unresolved distinction stays
          // queryable in code/tests/side-panel metadata; they are NO
          // LONGER visually distinguished on the canvas). No color, no
          // dash, no text, no "?" — a clinician's report is sufficient to
          // draw the line; this does not fabricate a shared ancestor or
          // cousin degree, it only draws the relationship the clinician
          // actually declared.
          // The two strokes are offset perpendicular to the segment, so a
          // vertical piece of a routed relationship line stays a visible
          // double line too.
          if (edge.x1 === edge.x2) { drawStroke(g, edge, -2, 0); drawStroke(g, edge, 2, 0); }
          else { drawStroke(g, edge, 0, -2); drawStroke(g, edge, 0, 2); }
          break;

        case 'sibship':
        case 'parentChildDrop':
        case 'childStem':
        case 'childlessDrop':
        case 'childlessBar':
          drawStroke(g, edge);
          break;

        case 'twinBar':
          drawStroke(g, edge);
          break;

        case 'divorceSlash': {
          // Separated and divorced: one slash on the relationship line
          // (clinician decision 2026-10-23, notation spec §4.7)
          const { x, y } = edge;
          g.append('line')
            .attr('class', 'relationship-ended')
            .attr('x1', x - 6).attr('y1', y + 8)
            .attr('x2', x + 6).attr('y2', y - 8)
            .attr('stroke', NODE_STROKE).attr('stroke-width', 2);
          break;
        }
        default:
          break;
      }
    });

    // Twin symbol, zygosity unknown: "?" between the twins' lines (NSGC; the
    // clinic's reference sheet). Part of the twin symbol, not text on a
    // relationship line — drawn apart from the connectors above.
    edges.filter(e => e.type === 'twinUnknown').forEach(e => {
      g.append('text')
        .attr('class', 'twin-unknown')
        .attr('x', e.x).attr('y', e.y).attr('text-anchor', 'middle')
        .attr('font-size', '11px').attr('font-weight', '600').attr('fill', NODE_STROKE)
        .text('?');
    });

    // No children (one bar) / infertile (two bars), NSGC; the reason below
    edges.filter(e => e.type === 'childless').forEach(e => {
      const m = g.append('g').attr('class', 'childless-mark');
      m.append('line').attr('x1', e.x).attr('y1', e.y).attr('x2', e.x).attr('y2', e.y + 24).attr('stroke', EDGE_COLOR).attr('stroke-width', 1.5);
      m.append('line').attr('x1', e.x - 11).attr('y1', e.y + 24).attr('x2', e.x + 11).attr('y2', e.y + 24).attr('stroke', EDGE_COLOR).attr('stroke-width', 1.5);
      if (e.kind === 'infertile') m.append('line').attr('x1', e.x - 11).attr('y1', e.y + 29).attr('x2', e.x + 11).attr('y2', e.y + 29).attr('stroke', EDGE_COLOR).attr('stroke-width', 1.5);
      if (e.reason) {
        editable(m.append('text').attr('x', e.x).attr('y', e.y + (e.kind === 'infertile' ? 43 : 38)).attr('text-anchor', 'middle')
          .attr('font-size', '10px').attr('fill', '#475569').text(e.reason), 'childlessReason', e.unionId, e.reason);
      }
    });

    // Relationship lines are clickable (selects the couple). Wide transparent
    // hit lines, screen only: export removes '.ui-only'.
    if (onUnionSelect) {
      edges.filter(e => e.unionId && ['union', 'consanguineousUnion', 'consanguineousUnionUnresolved'].includes(e.type))
        .forEach(edge => {
          g.append('path')
            .attr('class', 'ui-only union-hit')
            .attr('d', connectorPath(edge.x1, edge.y1, edge.x2, edge.y2, edge.bridges))
            .attr('stroke', 'transparent').attr('stroke-width', 12).attr('fill', 'none')
            .style('cursor', 'pointer').style('pointer-events', 'stroke')
            .on('click', (event) => { event.stopPropagation(); onUnionSelect(edge.unionId); })
            .append('title').text('İlişkiyi düzenle');
        });
    }

    // =====================
    // DRAW NODES
    // =====================
    // Adopted-in children (only a social, adoptive link): NSGC brackets
    // around the symbol (notation spec R3). Read from the layout's edges —
    // their line of descent is the dashed, adoptive one.
    // Pedigree-number corner: upper-left unless a connector crosses there
    // (e.g. a relationship line rising beside the symbol), then upper-right.
    const LABEL_CHAR_W = 6, LABEL_H = 11;
    const segments = edges.filter(e => [e.x1, e.y1, e.x2, e.y2].every(Number.isFinite));
    const boxFree = (x0, y0, w, h) => !segments.some(e => {
      const lo = Math.min(e.x1, e.x2) - 2, hi = Math.max(e.x1, e.x2) + 2;
      const top = Math.min(e.y1, e.y2) - 2, bot = Math.max(e.y1, e.y2) + 2;
      if (!(hi > x0 && lo < x0 + w && bot > y0 && top < y0 + h)) return false;
      if (e.x1 === e.x2 || e.y1 === e.y2) return true;
      // a diagonal (twins' lines): test points along it, not its bounding box
      for (let t = 0; t <= 1; t += 0.05) {
        const px = e.x1 + (e.x2 - e.x1) * t, py = e.y1 + (e.y2 - e.y1) * t;
        if (px > x0 - 2 && px < x0 + w + 2 && py > y0 - 2 && py < y0 + h + 2) return true;
      }
      return false;
    });
    // Pedigree numbers never overlap each other: placed left to right, each
    // takes the first corner free of connectors and of numbers placed before
    // (upper-left, upper-right, then a little higher) — clinician report
    // 2026-10-25: two neighbours' numbers were printed on top of each other.
    const labelAt = new Map();
    {
      const placed = [];
      const hitsPlaced = (b) => placed.some(q => b.x < q.x + q.w + 3 && q.x < b.x + b.w + 3 && b.y < q.y + q.h && q.y < b.y + b.h);
      for (const n of nodes.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x))) {
        const pid = pedigreeIds.get(n.id);
        if (!pid) continue;
        const nsz = isSmallSymbol(n) ? LOSS_SIZE : HALF;
        const gap = edges.some(e => e.type === 'childStem' && e.descentKind === 'adoptive' && e.childId === n.id) ? 12 : 6;
        const w = pid.displayId.length * LABEL_CHAR_W;
        const top = n.y - (nsz + 6) - LABEL_H + 2;
        const lift = LABEL_H + 3;
        const options = [
          { dx: -(nsz + gap), dy: -(nsz + 6), anchor: 'end', box: { x: n.x - (nsz + gap) - w, y: top, w, h: LABEL_H } },
          { dx: nsz + gap, dy: -(nsz + 6), anchor: 'start', box: { x: n.x + nsz + gap, y: top, w, h: LABEL_H } },
          { dx: -(nsz + gap), dy: -(nsz + 6) - lift, anchor: 'end', box: { x: n.x - (nsz + gap) - w, y: top - lift, w, h: LABEL_H } },
          { dx: nsz + gap, dy: -(nsz + 6) - lift, anchor: 'start', box: { x: n.x + nsz + gap, y: top - lift, w, h: LABEL_H } },
        ];
        const pick = options.find(o => boxFree(o.box.x, o.box.y, o.box.w, o.box.h) && !hitsPlaced(o.box))
          || options.find(o => !hitsPlaced(o.box)) || options[0];
        placed.push(pick.box);
        labelAt.set(n.id, pick);
      }
    }
    const adoptedIn = new Set(edges
      .filter(e => e.type === 'childStem' && e.descentKind === 'adoptive')
      .map(e => e.childId));

    const nodeGroups = g.selectAll('.node-group')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', d => {
        // Selection is expressed ONLY through these classes, styled by the
        // page stylesheet (app.css). It is never written onto the SVG shape
        // itself, so a selected person is not exported with a blue outline
        // (v0.5 Faz 2a, EX-1).
        let cls = 'node-group';
        if (d.id === selectedNodeId) cls += ' node-selected';
        else if (d.id === selectedNodeId2 || selectedIds.includes(d.id)) cls += ' node-selected-secondary';
        return cls;
      })
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .style('cursor', 'pointer')
      // keyboard: Tab reaches each person, Enter / Space selects (tablet
      // with a keyboard too; clinician request 2026-10-25)
      .attr('data-node-id', d => d.id)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', d => [
        pedigreeIds.get(d.id)?.displayId, d.displayLabel,
        pregnancyKind(d) ? PREGNANCY_LABEL[pregnancyKind(d)].toLocaleLowerCase('tr') : { male: 'erkek', female: 'kadın' }[d.sex] || 'cinsiyeti bilinmiyor',
        d.proband && 'proband', d.affected && 'etkilenmiş', d.carrier && 'taşıyıcı', d.deceased && 'vefat',
      ].filter(Boolean).join(', '))
      .on('click', (event, d) => {
        event.stopPropagation();
        // Cmd-click (Mac) or Ctrl-click (Windows/Linux), Shift-click, or a tap
        // in the multi-select mode (tablet) adds to the selection instead of
        // replacing it — see usePedigreeStore.js's selectIndividual(id, { additive }).
        onNodeSelect(d.id, { additive: event.metaKey || event.ctrlKey || event.shiftKey || multiSelect });
      })
      .on('keydown', (event, d) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        onNodeSelect(d.id, { additive: event.shiftKey || multiSelect });
      });

    // after an edit the drawing may rearrange: the person being worked on
    // pulses (blue) and anyone just added (green), so nobody is lost in a big
    // family (clinician request 2026-10-25); screen only, never exported
    const prevNodes = lastNodesRef.current;
    if (prevNodes && prevNodes !== nodes) {
      const before = new Set(prevNodes.map(n => n.id));
      nodeGroups.filter(d => d.id === selectedNodeId || !before.has(d.id))
        .insert('circle', ':first-child')
        .attr('class', d => `ui-only pulse-halo${d.id === selectedNodeId ? '' : ' pulse-new'}`)
        .attr('r', d => (isSmallSymbol(d) ? LOSS_SIZE : HALF) + 10);
    }
    lastNodesRef.current = nodes;

    // the selected person can be dragged left / right (mouse, finger, pen):
    // dropped on their partner they swap sides, on a sibling they take that
    // place in the birth order (sidewaysMove.js); any other person still pans
    // the drawing when touched
    if (onNodeDrop && selectedNodeId) {
      const rowOf = (n) => nodes.filter(o => o.id !== n.id && Math.abs(o.y - n.y) < 1);
      let target = null;
      nodeGroups.filter(d => d.id === selectedNodeId).call(d3.drag()
        .clickDistance(6)
        .on('drag', function (event, d) {
          d3.select(this).attr('transform', `translate(${event.x},${d.y})`).classed('dragging', true);
          const near = rowOf(d).reduce((best, o) => (!best || Math.abs(o.x - event.x) < Math.abs(best.x - event.x) ? o : best), null);
          target = near && Math.abs(near.x - event.x) < 45 ? near : null;
          nodeGroups.classed('drop-target', o => !!target && o.id === target.id);
        })
        .on('end', function (event, d) {
          nodeGroups.classed('drop-target', false);
          d3.select(this).attr('transform', `translate(${d.x},${d.y})`).classed('dragging', false);
          if (target && Math.abs(event.x - d.x) > 8) onNodeDrop(d.id, target.id);
          target = null;
        }));
    }

    nodeGroups.each(function (d, nodeIndex) {
      const el = d3.select(this);
      const isSmall = isSmallSymbol(d);
      const sz = isSmall ? LOSS_SIZE : HALF;

      // Pedigree-standard ID (e.g. "II-3"), shown just above the symbol —
      // this is the identifier a clinician should read, never the internal
      // graph ID (d.id, e.g. "mat_uncle_0"), which is not rendered anywhere
      // on canvas.
      // Placed at the upper-left corner, beside — never on — the line of
      // descent, which enters the symbol at its top centre (notation spec R4).
      const adopted = adoptedIn.has(d.id);
      const pedigreeId = pedigreeIds.get(d.id);
      if (pedigreeId) {
        // corner chosen above (labelAt): clear of connectors and other numbers
        const at = labelAt.get(d.id);
        el.append('text')
          .attr('x', at.dx).attr('y', at.dy).attr('text-anchor', at.anchor)
          .attr('font-size', '10px').attr('fill', '#64748b')
          .text(pedigreeId.displayId);
      }
      if (adopted) {
        const b = sz + 7;
        el.append('path')
          .attr('class', 'adoption-brackets')
          .attr('d', `M${-b + 6},${-b} L${-b},${-b} L${-b},${b} L${-b + 6},${b} M${b - 6},${-b} L${b},${-b} L${b},${b} L${b - 6},${b}`)
          .attr('fill', 'none').attr('stroke', NODE_STROKE).attr('stroke-width', 2);
      }

      let shape;

      if (isSmall) {
        // NSGC: a small upward-pointing triangle for a loss (SAB), a
        // termination (TOP, with a slash) and an ectopic pregnancy (ECT below)
        shape = el.append('path')
          .attr('d', `M0,${-sz} L${sz},${sz} L${-sz},${sz} Z`);
      } else if (d.sex === 'male') {
        shape = el.append('rect')
          .attr('x', -sz).attr('y', -sz)
          .attr('width', sz * 2).attr('height', sz * 2);
      } else if (d.sex === 'female') {
        shape = el.append('circle')
          .attr('cx', 0).attr('cy', 0).attr('r', sz);
      } else {
        // Unknown / diamond
        shape = el.append('path')
          .attr('d', `M0,${-sz} L${sz},0 L0,${sz} L${-sz},0 Z`);
      }

      // Fill
      // v0.3a: conditions[] is additive and render-conservative — no
      // partitioned/patterned fills yet (that's v0.3b), no carrier-dot
      // correction yet (that's v0.3c). A structured condition with
      // status: 'affected' renders the same solid fill as the legacy
      // `affected` boolean; carrier rendering is untouched.
      // Several conditions in the pedigree: each condition fills its own
      // region of the symbol, defined in the legend (graph/conditionKey.js).
      const filling = fillFor(d, conditionKey);
      let fill = NODE_FILL;
      if (filling.mode === 'full') fill = NODE_STROKE;
      else if (filling.mode === 'none' && d.carrier) fill = 'url(#carrier-half)';
      shape.attr('class', 'pedigree-shape')
        .attr('fill', fill).attr('stroke', NODE_STROKE).attr('stroke-width', 2);
      if (filling.mode === 'regions') drawRegions(el, defs, `regions-${nodeIndex}`, shape, filling.parts, sz);
      // carrier dot (NSGC) on the left half when the right half shows "affected"
      if (filling.carrierDot) el.append('circle').attr('class', 'carrier-dot').attr('cx', -sz * 0.5).attr('cy', 0).attr('r', Math.max(2.5, sz * 0.2)).attr('fill', NODE_STROKE);
      // Selection highlight (primary blue / secondary violet) comes from the
      // node-group classes above via app.css — see EX-1 note there.

      // Ongoing pregnancy: "P" inside the symbol (NSGC)
      if (d.ongoingPregnancy) {
        el.append('text').attr('class', 'pregnancy-p').attr('y', 5).attr('text-anchor', 'middle')
          .attr('font-size', '14px').attr('font-weight', '700').attr('fill', filling.mode === 'full' ? NODE_FILL : NODE_STROKE).text('P');
      }
      // Termination (TOP): a slash through the triangle (NSGC)
      if (d.termination) {
        el.append('line').attr('x1', -(sz + 3)).attr('y1', sz + 3).attr('x2', sz + 3).attr('y2', -(sz + 3)).attr('stroke', NODE_STROKE).attr('stroke-width', 2);
      }
      // A stillbirth is drawn at full size with the slash of a deceased person
      // and "SB" below (NSGC; clinician decision 2026-10-25)
      if (d.deceased && !isSmall && !d.ongoingPregnancy) {
        // Diagonal slash for deceased
        el.append('line')
          .attr('x1', -(sz + 4)).attr('y1', -(sz + 4))
          .attr('x2', sz + 4).attr('y2', sz + 4)
          .attr('stroke', NODE_STROKE).attr('stroke-width', 2);
      }

      // Proband arrow (lower-left)
      if (d.proband) {
        const arrOff = sz + 6;
        el.append('path')
          .attr('d', `M${-(arrOff + 14)},${arrOff + 14} L${-arrOff},${arrOff} M${-arrOff},${arrOff} L${-(arrOff + 10)},${arrOff} M${-arrOff},${arrOff} L${-arrOff},${arrOff + 10}`)
          .attr('fill', 'none')
          .attr('stroke', NODE_STROKE)
          .attr('stroke-width', 2);
        // NSGC: the proband's arrow carries "P" (an arrow alone marks a
        // consultand) — clinician decision K10, 2026-10-23
        el.append('text')
          .attr('class', 'proband-p')
          .attr('x', -(arrOff + 17)).attr('y', arrOff + 26).attr('text-anchor', 'end')
          .attr('font-size', '12px').attr('font-weight', '700').attr('fill', NODE_STROKE)
          .text('P');
      }

      // --- Annotations below node ---
      let lineY = sz + 14;
      const LINE_H = 13;
      // the proband's lines stand a little to the right, clear of the arrow at the lower left
      const ann = el.append('g').attr('class', 'annotations').attr('transform', d.proband ? 'translate(14,0)' : null);

      // Age, or "d." and the age at death (also without an age filled in)
      const ageLine = annotationAge(d);
      if (ageLine) {
        editable(ann.append('text')
          .attr('y', lineY).attr('text-anchor', 'middle')
          .attr('font-size', '11px').attr('fill', '#475569')
          .text(ageLine.text), ageLine.kind, d.id, ageLine.value);
        lineY += LINE_H;
      }

      // a pregnancy outcome: "SB 28 hf", "TOP 16 hf", "ECT", the week
      const pLine = pregnancyLine(d);
      if (pLine) {
        editable(ann.append('text')
          .attr('y', lineY).attr('text-anchor', 'middle')
          .attr('font-size', '11px').attr('fill', '#475569')
          .text(pLine), 'gestationWeeks', d.id, d.gestationWeeks || '');
        lineY += LINE_H;
      }

      // genetic test (clinician decision 2026-10-27): the clinician's lines one
      // under another, no "E" prefix (NSGC 2022); each line is edited where it stands
      geneticRows(d).forEach(row => {
        editable(ann.append('text')
          .attr('y', lineY - 1).attr('text-anchor', 'middle')
          .attr('font-size', '9px').attr('fill', row.placeholder ? '#64748b' : '#334155')
          .attr('font-style', row.placeholder ? 'italic' : null)
          .text(row.text), 'geneticLine', `${d.id}\u0001${row.k}`, row.value);
        lineY += GENETIC_ROW;
      });

      // Display label
      if (d.displayLabel) {
        editable(ann.append('text')
          .attr('y', lineY).attr('text-anchor', 'middle')
          .attr('font-size', '11px').attr('fill', '#475569')
          .text(d.displayLabel), 'displayLabel', d.id, d.displayLabel);
        lineY += LINE_H;
      }

      // Condition
      if (d.condition) {
        editable(ann.append('text')
          .attr('y', lineY).attr('text-anchor', 'middle')
          .attr('font-size', '10px').attr('fill', '#6366f1')
          .attr('font-style', 'italic')
          .text(d.condition.length > 15 ? d.condition.substring(0, 14) + '...' : d.condition), 'condition', d.id, d.condition);
        lineY += LINE_H;
      }

      // Numeric annotation key: the same numbering as the notes legend
      {
        const noteIdx = notedNodes.indexOf(d);
        if (noteIdx >= 0) {
          ann.append('text')
            .attr('y', lineY).attr('text-anchor', 'middle')
            .attr('font-size', '9px').attr('fill', '#ef4444')
            .attr('font-weight', '600')
            .text(`[${noteIdx + 1}]`);
        }
      }
    });

    // --- Key (NSGC legend), top right: the patient's line, then which mark
    //     is which finding ---
    if (headBlock || shownKey.length) {
      const keyG = svg.append('g').attr('class', 'condition-legend');
      const s = KS;
      // the findings start under the proband's symbol (clinician request 2026-10-25)
      const headW = headBlock ? 2 * s + 12 * LK + textW(headLines) : 0;
      const width = nameW + Math.max(headW, grid.width);
      const kx = Math.max(minX + 10, keyRight - width);
      const symX = kx + nameW;              // symbol column
      const textX = symX + 2 * s + 12 * LK; // text column
      let ky = minY + 10 * LK;
      if (headBlock) {
        if (name) {
          editable(keyG.append('text').attr('class', 'patient-header')
            .attr('x', kx).attr('y', ky + s + 5 * LK)
            .attr('font-size', `${15 * LK}px`).attr('font-weight', '700').attr('fill', '#0f172a')
            .text(name), 'patientName', null, name);
        }
        // the proband's symbol as drawn (sex shape, fully filled when affected)
        const cell = keyG.append('g').attr('class', 'legend-proband').attr('transform', `translate(${symX + s},${ky + s})`);
        const sex = probandNode.sex;
        const shape = sex === 'male'
          ? cell.append('rect').attr('x', -s).attr('y', -s).attr('width', 2 * s).attr('height', 2 * s)
          : sex === 'female'
            ? cell.append('circle').attr('r', s)
            : cell.append('path').attr('d', `M0,${-s} L${s},0 L0,${s} L${-s},0 Z`);
        const f = fillFor(probandNode, conditionKey);
        shape.attr('stroke', NODE_STROKE).attr('stroke-width', 1.5)
          .attr('fill', f.mode === 'full' ? NODE_STROKE : f.mode === 'none' && probandNode.carrier ? 'url(#carrier-half)' : NODE_FILL);
        if (f.mode === 'regions') drawRegions(cell, defs, 'legend-proband-regions', shape, f.parts, s);
        headLines.forEach((line, li) => {
          const t = keyG.append('text')
            .attr('x', textX).attr('y', ky + s + 5 * LK + li * HEAD_LINE)
            .attr('font-size', `${13 * LK}px`).attr('fill', '#1e293b');
          line.forEach(p => {
            const ts = t.append('tspan').text(p.text);
            if (p.seg.kind) editable(ts, p.seg.kind, p.seg.target, p.seg.value);
          });
        });
        ky += headBlock;
      }
      shownKey.forEach((entry, row) => {
        const ex = symX + grid.cells[row].x, ey = ky + grid.cells[row].y;
        const cell = keyG.append('g').attr('transform', `translate(${ex + s},${ey + s})`);
        const box = cell.append('rect').attr('x', -s).attr('y', -s).attr('width', 2 * s).attr('height', 2 * s)
          .attr('fill', NODE_FILL).attr('stroke', NODE_STROKE).attr('stroke-width', 1.5);
        const [a0, a1] = entry.carrier ? [90, 270] : (REGION_ANGLES[entry.region] || REGION_ANGLES.q1);
        drawRegions(cell, defs, `key-region-${row}`, box, [{ fill: entry.fill, a0, a1, carrier: entry.carrier }], s);
        keyLines[row].forEach((line, li) => {
          editable(keyG.append('text')
            .attr('x', ex + 2 * s + 12 * LK).attr('y', ey + s + 4.5 * LK + li * KEY_LINE)
            .attr('font-size', `${12.5 * LK}px`).attr('fill', '#334155')
            .text(line.map(p => p.text).join('')), 'finding', entry.label, entry.label);
        });
      });
    }
    const legendX = minX + 10;
    let legendY = legendTop;

    // --- Notes legend (each part editable where it stands) ---
    if (noteLines.length > 0) {
      const legendG = svg.append('g').attr('class', 'notes-legend');
      legendG.append('text')
        .attr('x', legendX).attr('y', legendY + 12 * LK)
        .attr('font-size', `${13 * LK}px`).attr('font-weight', '700').attr('fill', '#1e293b')
        .text('Notlar');
      legendY += TITLE_ROW;
      noteLines.forEach((lines) => {
        lines.forEach((line) => {
          const t = legendG.append('text')
            .attr('x', legendX).attr('y', legendY + 12 * LK)
            .attr('font-size', `${12 * LK}px`).attr('fill', '#475569');
          line.forEach(p => {
            const ts = t.append('tspan').text(p.text);
            if (p.seg.head) ts.attr('font-weight', '600');
            if (p.seg.kind) editable(ts, p.seg.kind, p.seg.target, p.seg.value);
          });
          legendY += NOTE_ROW;
        });
      });
    }

    // the arrow keys moved the selection: the focus follows it; otherwise a
    // focused person keeps the focus across the redraw
    const follow = focusTick !== focusTickRef.current && selectedNodeId;
    focusTickRef.current = focusTick;
    const focusOn = follow ? selectedNodeId : focusedId;
    if (focusOn) {
      const again = svgRef.current.querySelector(`[data-node-id="${CSS.escape(focusOn)}"]`);
      if (again) again.focus({ preventScroll: true });
    }

    // --- Zoom/Pan ---
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        placeQuickBar();
        const m = measureSelected();
        keepRef.current = m && selectedNodeId ? { id: selectedNodeId, ...m } : null;
      });
    svg.call(zoom);
    // a quick second tap on a tablet selects again; it must not zoom
    svg.on('dblclick.zoom', null);
    // a click on the empty drawing (people, lines and texts stop theirs; a
    // pan never ends in a click) — App steps back one level
    svg.on('click.background', () => onBackgroundClick && onBackgroundClick());
    // keep the clinician's zoom/pan across edits (it used to jump back after
    // every change); "Sığdır" resets it
    svg.call(zoom.transform, d3.zoomTransform(svg.node()));
    // same person still selected after a redraw: keep them where they were,
    // the same size — the rest of the drawing moves around them
    const now = before && measureSelected();
    if (before && now) {
      const t = d3.zoomTransform(svg.node());
      const k = t.k * (before.spu / now.spu);
      svg.call(zoom.transform, d3.zoomIdentity.translate(t.x, t.y).scale(k));
      const mid = measureSelected();
      if (mid) {
        const unit = mid.spu / k; // screen px per transform unit at this scale
        svg.call(zoom.transform, d3.zoomIdentity.translate(t.x + (before.cx - mid.cx) / unit, t.y + (before.cy - mid.cy) / unit).scale(k));
      }
    }
    placeQuickBar();
    {
      const m = measureSelected();
      keepRef.current = m && selectedNodeId ? { id: selectedNodeId, ...m } : null;
    }

    // Store for external reset
    svg.node().__zoom_ref = zoom;

  }, [nodes, edges, selectedNodeId, selectedNodeId2, selectedIds, onNodeSelect, onUnionSelect, conditionKey, placeQuickBar, patientName, startEdit, multiSelect, focusTick, onNodeDrop, onBackgroundClick]);

  // a menu around the selected person that needs more room slides the
  // drawing by (dx, dy) screen pixels (a narrow tablet screen)
  const panBy = useCallback((dx, dy) => {
    const el = svgRef.current;
    const zoom = el && el.__zoom_ref;
    if (!zoom) return;
    const k = d3.zoomTransform(el).k;
    const s = (el.getScreenCTM && el.getScreenCTM()?.a) || 1;
    d3.select(el).call(zoom.translateBy, dx / (s * k), dy / (s * k));
  }, []);

  const zoomBy = (k) => {
    const svg = d3.select(svgRef.current);
    const zoom = svg.node()?.__zoom_ref;
    if (zoom) svg.call(zoom.scaleBy, k); // no transition: quick clicks add up
  };
  // the viewBox already frames the whole pedigree: "fit" = identity transform
  const fitZoom = () => {
    const svg = d3.select(svgRef.current);
    const zoom = svg.node()?.__zoom_ref;
    if (zoom) svg.call(zoom.transform, d3.zoomIdentity);
  };
  return (
    <div ref={boxRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div className="zoom-controls" style={{ position: 'absolute', right: 12, bottom: 12, zIndex: 10 }}>
        <button onClick={() => zoomBy(1.25)} title="Yakınlaştır" aria-label="Yakınlaştır">+</button>
        <button onClick={() => zoomBy(0.8)} title="Uzaklaştır" aria-label="Uzaklaştır">−</button>
        <button onClick={fitZoom} title="Tüm pedigriyi ekrana sığdır (0)" aria-label="Sığdır">Sığdır</button>
      </div>
      <svg
        id="pedigree-svg"
        ref={attachSvgRef}
        width="100%"
        height="100%"
        style={{ cursor: 'grab' }}
      />
      {anchor && renderQuickBar && !editing && renderQuickBar(anchor, panBy)}
      {editing && (
        <input className="inline-edit" autoFocus defaultValue={editing.value}
          style={{ left: editing.x - 6, top: editing.y - 5, width: Math.max(editing.w + 60, 160), height: Math.max(editing.h + 10, 28) }}
          onKeyDown={e => {
            if (e.key === 'Enter') finishEdit(e.currentTarget.value);
            if (e.key === 'Escape') { committed.current = true; setEditing(null); }
          }}
          onBlur={e => finishEdit(e.currentTarget.value)} />
      )}
    </div>
  );
});

export default PedigreeCanvas;
