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
 *   pregnancyLoss → small triangle
 *   stillbirth → small shape + X cross
 */

import { useEffect, useRef, useState, useCallback, forwardRef } from 'react';
import * as d3 from 'd3';
import { fillFor, REGION_ANGLES } from '../graph/conditionKey';
import { computePedigreeIds } from '../utils/pedigreeNumbering';

const EDGE_COLOR = '#64748b';
const NODE_STROKE = '#1e293b';
const NODE_FILL = '#ffffff';
const NODE_SIZE = 40;
const HALF = NODE_SIZE / 2;
const LOSS_SIZE = 14; // smaller triangle for pregnancy loss

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
  { nodes, edges, selectedNodeId, selectedNodeId2, onNodeSelect, onUnionSelect, conditionKey = [], renderQuickBar },
  forwardedRef
) {
  const svgRef = useRef(null);
  const boxRef = useRef(null);
  // where the quick-add bar sits: under the single selected person's symbol
  // where the add menu sits: around the single selected person's symbol
  const [anchor, setAnchor] = useState(null);
  const placeQuickBar = useCallback(() => {
    const shape = svgRef.current && svgRef.current.querySelector('.node-selected .pedigree-shape');
    if (!shape || !boxRef.current || selectedNodeId2) { setAnchor(null); return; }
    const r = shape.getBoundingClientRect(), box = boxRef.current.getBoundingClientRect();
    setAnchor({ x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top, size: Math.max(r.width, r.height), boxW: box.width, boxH: box.height });
  }, [selectedNodeId2]);

  const attachSvgRef = (node) => {
    svgRef.current = node;
    if (!forwardedRef) return;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else forwardedRef.current = node;
  };

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    if (nodes.length === 0) {
      // Draw a placeholder message
      svg.attr('viewBox', '0 0 800 400');
      svg.append('text')
        .attr('x', 400).attr('y', 200)
        .attr('text-anchor', 'middle')
        .attr('fill', '#94a3b8')
        .attr('font-size', '16px')
        .text('Sol panelden veri girin — pedigri otomatik çizilir.');
      return;
    }

    // --- Legends (inside the SVG so they are exported): findings key at the
    // top right (clinician choice 2026-10-24), clinical notes at the bottom ---
    // findings key: only findings someone is affected by or carries
    const shownKey = conditionKey
      .map((entry, i) => ({ ...entry, i }))
      .filter(entry => nodes.some(n => (n.conditions || []).some(c =>
        c && c.label && (c.status === 'affected' || c.status === 'carrier')
        && c.label.trim().toLocaleLowerCase('tr') === entry.label.trim().toLocaleLowerCase('tr'))));
    const notedNodes = nodes.filter(n => n.notes || n.condition || (n.deceased && n.causeOfDeath));
    // legends grow with a wide pedigree, so they read at the same size once
    // the drawing is fitted to the screen (clinician feedback 2026-10-24)
    const LK = Math.max(1.2, (d3.max(nodes, d => d.x) - d3.min(nodes, d => d.x) + 200) / 900);
    const KEY_ROW = 22 * LK, NOTE_ROW = 16 * LK, TITLE_ROW = 20 * LK;
    const keyBlock = shownKey.length ? TITLE_ROW + shownKey.length * KEY_ROW + 14 * LK : 0;
    const notesBlock = notedNodes.length ? TITLE_ROW + notedNodes.length * NOTE_ROW + 10 * LK : 0;

    // --- ViewBox ---
    const pad = 100;
    const minX = d3.min(nodes, d => d.x) - pad;
    const maxX = d3.max(nodes, d => d.x) + pad;
    const minY = d3.min(nodes, d => d.y) - pad - keyBlock;
    const legendTop = d3.max(nodes, d => d.y) + 70; // clear of the age / label lines
    const maxY = Math.max(d3.max(nodes, d => d.y) + pad, legendTop + notesBlock + 10);
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
          // the side panel (IndividualEditor.jsx/WizardPanel.jsx), never
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
    // v0.3a.3 — pedigree-standard visible IDs (I-1, II-3, ...). Purely
    // derived from the already-computed generation + x-position of every
    // node; recomputes automatically on every render, so a birth-order
    // reorder (which changes x) renumbers correctly with no extra wiring.
    const pedigreeIds = computePedigreeIds(nodes);
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
      return hi > x0 && lo < x0 + w && bot > y0 && top < y0 + h;
    });
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
        else if (d.id === selectedNodeId2) cls += ' node-selected-secondary';
        return cls;
      })
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        // Cmd-click (Mac) or Ctrl-click (Windows/Linux) toggles a second
        // selection slot instead of replacing the whole selection — see
        // usePedigreeStore.js's selectIndividual(id, { additive }).
        onNodeSelect(d.id, { additive: event.metaKey || event.ctrlKey });
      });

    nodeGroups.each(function (d, nodeIndex) {
      const el = d3.select(this);
      const isSmall = d.pregnancyLoss || d.stillbirth;
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
        const gap = adopted ? 12 : 6; // clear of the brackets / deceased slash
        const w = pedigreeId.displayId.length * LABEL_CHAR_W;
        const top = d.y - (sz + 6) - LABEL_H + 2;
        const left = boxFree(d.x - (sz + gap) - w, top, w, LABEL_H);
        const right = !left && boxFree(d.x + sz + gap, top, w, LABEL_H);
        el.append('text')
          .attr('x', right ? sz + gap : -(sz + gap)).attr('y', -(sz + 6)).attr('text-anchor', right ? 'start' : 'end')
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

      if (d.pregnancyLoss && !d.stillbirth) {
        // Small upward-pointing triangle
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
      // Selection highlight (primary blue / secondary violet) comes from the
      // node-group classes above via app.css — see EX-1 note there.

      // Stillbirth cross (X)
      if (d.stillbirth) {
        el.append('line').attr('x1', -sz).attr('y1', -sz).attr('x2', sz).attr('y2', sz).attr('stroke', NODE_STROKE).attr('stroke-width', 2);
        el.append('line').attr('x1', -sz).attr('y1', sz).attr('x2', sz).attr('y2', -sz).attr('stroke', NODE_STROKE).attr('stroke-width', 2);
      } else if (d.deceased && !d.pregnancyLoss) {
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

      // Age (always shown for liveborn if set)
      if (d.age && !d.pregnancyLoss && !d.stillbirth) {
        el.append('text')
          .attr('y', lineY).attr('text-anchor', 'middle')
          .attr('font-size', '11px').attr('fill', '#475569')
          .text(d.deceased && d.ageAtDeath ? `d.${d.ageAtDeath}` : d.age);
        lineY += LINE_H;
      }

      // Display label
      if (d.displayLabel) {
        el.append('text')
          .attr('y', lineY).attr('text-anchor', 'middle')
          .attr('font-size', '11px').attr('fill', '#475569')
          .text(d.displayLabel);
        lineY += LINE_H;
      }

      // Condition
      if (d.condition) {
        el.append('text')
          .attr('y', lineY).attr('text-anchor', 'middle')
          .attr('font-size', '10px').attr('fill', '#6366f1')
          .attr('font-style', 'italic')
          .text(d.condition.length > 15 ? d.condition.substring(0, 14) + '...' : d.condition);
        lineY += LINE_H;
      }

      // Numeric annotation key: the same numbering as the notes legend
      {
        const noteIdx = notedNodes.indexOf(d);
        if (noteIdx >= 0) {
          el.append('text')
            .attr('y', lineY).attr('text-anchor', 'middle')
            .attr('font-size', '9px').attr('fill', '#ef4444')
            .attr('font-weight', '600')
            .text(`[${noteIdx + 1}]`);
        }
      }
    });

    // --- Findings key (NSGC legend), top right: which mark is which finding ---
    if (shownKey.length) {
      const keyG = svg.append('g').attr('class', 'condition-legend');
      const s = 8 * LK;
      const labelOf = (e) => (e.label.length > 50 ? e.label.substring(0, 49) + '…' : e.label);
      const width = 2 * s + 10 * LK + Math.max(60, ...shownKey.map(e => labelOf(e).length * 7.2)) * LK;
      const kx = Math.max(minX + 10, maxX - width - 10 * LK);
      let ky = minY + 10 * LK;
      keyG.append('text')
        .attr('x', kx).attr('y', ky + 12 * LK)
        .attr('font-size', `${13 * LK}px`).attr('font-weight', '700').attr('fill', '#1e293b')
        .text('Açıklama');
      ky += TITLE_ROW;
      shownKey.forEach((entry, row) => {
        const cell = keyG.append('g').attr('transform', `translate(${kx + s},${ky + s})`);
        const box = cell.append('rect').attr('x', -s).attr('y', -s).attr('width', 2 * s).attr('height', 2 * s)
          .attr('fill', NODE_FILL).attr('stroke', NODE_STROKE).attr('stroke-width', 1.5);
        const [a0, a1] = REGION_ANGLES[entry.region] || REGION_ANGLES.q1;
        drawRegions(cell, defs, `key-region-${row}`, box, [{ fill: entry.fill, a0, a1 }], s);
        keyG.append('text')
          .attr('x', kx + 2 * s + 10 * LK).attr('y', ky + s + 4.5 * LK)
          .attr('font-size', `${12.5 * LK}px`).attr('fill', '#334155')
          .text(labelOf(entry));
        ky += KEY_ROW;
      });
    }
    const legendX = minX + 10;
    let legendY = legendTop;

    // --- Clinical notes legend ---
    if (notedNodes.length > 0) {
      const legendG = svg.append('g').attr('class', 'notes-legend');
      legendG.append('text')
        .attr('x', legendX).attr('y', legendY + 12 * LK)
        .attr('font-size', `${13 * LK}px`).attr('font-weight', '700').attr('fill', '#1e293b')
        .text('Klinik Notlar');
      legendY += TITLE_ROW;
      notedNodes.forEach((n, i) => {
        const parts = [];
        if (n.condition) parts.push(n.condition);
        if (n.deceased && n.causeOfDeath) parts.push(`Ölüm: ${n.causeOfDeath}`);
        if (n.notes) parts.push(n.notes);
        // Clinician-facing identity: pedigree number (e.g. "IV-7") plus the
        // label when there is one — never the internal graph id.
        const pid = pedigreeIds.get(n.id)?.displayId;
        const name = n.displayLabel || n.label;
        const label = pid ? (name ? `${pid} (${name})` : pid) : (name || 'birey');
        const entry = `[${i + 1}] ${label}: ${parts.join(' | ')}`;
        legendG.append('text')
          .attr('x', legendX).attr('y', legendY + 12 * LK)
          .attr('font-size', `${12 * LK}px`).attr('fill', '#475569')
          .text(entry.length > 80 ? entry.substring(0, 79) + '...' : entry);
        legendY += NOTE_ROW;
      });
    }

    // --- Zoom/Pan ---
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => { g.attr('transform', event.transform); placeQuickBar(); });
    svg.call(zoom);
    // keep the clinician's zoom/pan across edits (it used to jump back after
    // every change); "Sığdır" resets it
    svg.call(zoom.transform, d3.zoomTransform(svg.node()));
    placeQuickBar();

    // Store for external reset
    svg.node().__zoom_ref = zoom;

  }, [nodes, edges, selectedNodeId, selectedNodeId2, onNodeSelect, onUnionSelect, conditionKey, placeQuickBar]);

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
        <button onClick={fitZoom} title="Tüm pedigriyi ekrana sığdır">Sığdır</button>
      </div>
      <svg
        id="pedigree-svg"
        ref={attachSvgRef}
        width="100%"
        height="100%"
        style={{ cursor: 'grab', background: '#f8fafc' }}
        onClick={() => onNodeSelect(null)}
      />
      {anchor && renderQuickBar && renderQuickBar(anchor)}
    </div>
  );
});

export default PedigreeCanvas;
