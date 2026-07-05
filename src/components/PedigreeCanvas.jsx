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
 *   "divorceSlash"        — 1 or 2 diagonal slashes at (x,y)
 *   "childlessDrop"       — short vertical from union center (no children)
 *   "childlessBar"        — horizontal bar at end of childlessDrop (inverted T)
 *
 * Node shapes:
 *   male      → square
 *   female    → circle
 *   unknown   → diamond
 *   pregnancyLoss → small triangle
 *   stillbirth → small shape + X cross
 */

import { useEffect, useRef, forwardRef } from 'react';
import * as d3 from 'd3';
import { buildConditionRegistry, hasAnyConditions, hasAffectedCondition } from '../utils/conditionRegistry';

const EDGE_COLOR = '#64748b';
const NODE_STROKE = '#1e293b';
const NODE_FILL = '#ffffff';
const NODE_SIZE = 40;
const HALF = NODE_SIZE / 2;
const LOSS_SIZE = 14; // smaller triangle for pregnancy loss

// SVG export needs a stable handle to the actual rendered <svg> node.
// We forward a ref out to the caller (App.jsx) instead of relying on
// document.getElementById, which silently returns null if the id ever
// drifts out of sync with exportUtils.js. The id is kept too, as a
// belt-and-suspenders fallback for exportUtils.js and for tests/tools
// that query the DOM directly.
const PedigreeCanvas = forwardRef(function PedigreeCanvas(
  { nodes, edges, selectedNodeId, selectedNodeId2, onNodeSelect },
  forwardedRef
) {
  const svgRef = useRef(null);

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

    // --- ViewBox ---
    const pad = 100;
    const minX = d3.min(nodes, d => d.x) - pad;
    const maxX = d3.max(nodes, d => d.x) + pad;
    const minY = d3.min(nodes, d => d.y) - pad;
    const maxY = d3.max(nodes, d => d.y) + pad;
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

    const g = svg.append('g');

    // =====================
    // DRAW EDGES
    // =====================
    edges.forEach(edge => {
      switch (edge.type) {
        case 'union':
          g.append('line')
            .attr('x1', edge.x1).attr('y1', edge.y1)
            .attr('x2', edge.x2).attr('y2', edge.y2)
            .attr('stroke', EDGE_COLOR).attr('stroke-width', 1.5).attr('fill', 'none');
          // v0.3a.2 — neutral relationship-background note (e.g. "Aynı köy /
          // aynı bölge", "Akrabalık bildirilmedi", "Akrabalık durumu
          // bilinmiyor"). Deliberately a plain single line with a small
          // gray label, never a double line or amber styling — none of
          // these backgrounds assert a blood relationship. See
          // relationshipBackground.js for the full state model.
          if (edge.noteText) {
            g.append('text')
              .attr('x', (edge.x1 + edge.x2) / 2)
              .attr('y', edge.y1 - 6)
              .attr('text-anchor', 'middle')
              .attr('font-size', '9px')
              .attr('fill', '#94a3b8')
              .text(edge.noteText);
          }
          break;

        case 'consanguineousUnion':
          // Double line — ONLY drawn when the shared-ancestor path was
          // actually built in the graph (consanguinityStatus === 'known_supported').
          g.append('line')
            .attr('x1', edge.x1).attr('y1', edge.y1 - 2)
            .attr('x2', edge.x2).attr('y2', edge.y2 - 2)
            .attr('stroke', EDGE_COLOR).attr('stroke-width', 1.5).attr('fill', 'none');
          g.append('line')
            .attr('x1', edge.x1).attr('y1', edge.y1 + 2)
            .attr('x2', edge.x2).attr('y2', edge.y2 + 2)
            .attr('stroke', EDGE_COLOR).attr('stroke-width', 1.5).attr('fill', 'none');
          break;

        case 'consanguineousUnionUnresolved':
          // v0.3a.2 fix: this must still render as a visibly DOUBLE union
          // line — per pedigree nomenclature, "consanguineous union" is
          // drawn as two parallel relationship lines regardless of whether
          // the exact degree/common ancestor has been resolved. A single
          // line reads as "not consanguineous" to a clinician scanning the
          // chart, which is the opposite of what was declared. The internal
          // known_supported vs. reported_unresolved distinction is
          // preserved — but ONLY via color/dash/label (amber, dashed),
          // never by dropping to a single line. The label reads "Akrabalık
          // bildirildi" (consanguinity reported), NOT a "?" — a question
          // mark reads as doubt about the clinician's own report, which is
          // not the intended meaning; the intended meaning is "reported,
          // not yet structurally confirmed in this graph." No shared
          // ancestor or cousin degree is fabricated by this rendering
          // choice: the double line here asserts "declared consanguineous,"
          // not "confirmed shared ancestor" — that confirmation is what
          // the solid-black consanguineousUnion case above communicates.
          g.append('line')
            .attr('x1', edge.x1).attr('y1', edge.y1 - 2)
            .attr('x2', edge.x2).attr('y2', edge.y2 - 2)
            .attr('stroke', '#d97706').attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '5,3').attr('fill', 'none');
          g.append('line')
            .attr('x1', edge.x1).attr('y1', edge.y1 + 2)
            .attr('x2', edge.x2).attr('y2', edge.y2 + 2)
            .attr('stroke', '#d97706').attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '5,3').attr('fill', 'none');
          g.append('text')
            .attr('x', (edge.x1 + edge.x2) / 2)
            .attr('y', edge.y1 - 8)
            .attr('text-anchor', 'middle')
            .attr('font-size', '11px')
            .attr('font-weight', '700')
            .attr('fill', '#d97706')
            .text('Akrabalık bildirildi');
          break;

        case 'sibship':
          g.append('line')
            .attr('x1', edge.x1).attr('y1', edge.y1)
            .attr('x2', edge.x2).attr('y2', edge.y2)
            .attr('stroke', EDGE_COLOR).attr('stroke-width', 1.5).attr('fill', 'none');
          break;

        case 'parentChildDrop':
        case 'childStem':
        case 'childlessDrop':
        case 'childlessBar':
          g.append('line')
            .attr('x1', edge.x1).attr('y1', edge.y1)
            .attr('x2', edge.x2).attr('y2', edge.y2)
            .attr('stroke', EDGE_COLOR).attr('stroke-width', 1.5).attr('fill', 'none');
          break;

        case 'divorceSlash': {
          const { x, y, status } = edge;
          // Single slash for separated, double for divorced
          g.append('line')
            .attr('x1', x - 6).attr('y1', y + 8)
            .attr('x2', x + 6).attr('y2', y - 8)
            .attr('stroke', NODE_STROKE).attr('stroke-width', 2);
          if (status === 'divorced') {
            g.append('line')
              .attr('x1', x - 2).attr('y1', y + 8)
              .attr('x2', x + 10).attr('y2', y - 8)
              .attr('stroke', NODE_STROKE).attr('stroke-width', 2);
          }
          break;
        }
        default:
          break;
      }
    });

    // =====================
    // DRAW NODES
    // =====================
    const nodeGroups = g.selectAll('.node-group')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', d => {
        let cls = 'node-group';
        if (d.id === selectedNodeId || d.id === selectedNodeId2) cls += ' node-selected';
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

    nodeGroups.each(function (d) {
      const el = d3.select(this);
      const isSmall = d.pregnancyLoss || d.stillbirth;
      const sz = isSmall ? LOSS_SIZE : HALF;

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
      let fill = NODE_FILL;
      if (d.affected || hasAffectedCondition(d)) fill = NODE_STROKE;
      else if (d.carrier) fill = 'url(#carrier-half)';
      shape.attr('fill', fill).attr('stroke', NODE_STROKE).attr('stroke-width', 2);

      // Selection highlight — primary (blue) vs. secondary Cmd/Ctrl-click
      // selection (violet), so a two-person selection is visually
      // distinguishable, not just "two blue nodes."
      if (d.id === selectedNodeId) {
        shape.attr('stroke', '#3b82f6').attr('stroke-width', 3);
      } else if (d.id === selectedNodeId2) {
        shape.attr('stroke', '#8b5cf6').attr('stroke-width', 3);
      }

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

      // Numeric annotation key (for notes legend)
      if (d.notes) {
        const noteIdx = nodes.filter(n => n.notes).indexOf(d);
        if (noteIdx >= 0) {
          el.append('text')
            .attr('y', lineY).attr('text-anchor', 'middle')
            .attr('font-size', '9px').attr('fill', '#ef4444')
            .attr('font-weight', '600')
            .text(`[${noteIdx + 1}]`);
        }
      }
    });

    // --- Clinical Notes Legend (bottom-left, outside zoom) ---
    const notedNodes = nodes.filter(n => n.notes || n.condition || (n.deceased && n.causeOfDeath));
    if (notedNodes.length > 0) {
      const legendG = svg.append('g')
        .attr('class', 'notes-legend');
      const legendX = minX + 10;
      let legendY = maxY - 10;

      // Build legend entries bottom-up
      const entries = [];
      notedNodes.forEach((n, i) => {
        const parts = [];
        if (n.condition) parts.push(n.condition);
        if (n.deceased && n.causeOfDeath) parts.push(`Olum: ${n.causeOfDeath}`);
        if (n.notes) parts.push(n.notes);
        const text = parts.join(' | ');
        const label = n.displayLabel || n.label || n.id;
        entries.push(`[${i + 1}] ${label}: ${text}`);
      });

      // Title
      legendG.append('text')
        .attr('x', legendX).attr('y', legendY - entries.length * 14 - 4)
        .attr('font-size', '11px').attr('font-weight', '700')
        .attr('fill', '#1e293b')
        .text('Klinik Notlar');

      entries.forEach((entry, i) => {
        legendG.append('text')
          .attr('x', legendX).attr('y', legendY - (entries.length - 1 - i) * 14)
          .attr('font-size', '10px').attr('fill', '#475569')
          .text(entry.length > 80 ? entry.substring(0, 79) + '...' : entry);
      });
    }

    // --- Condition Legend (top-left, inside the same <svg> so it is
    //     captured by SVG/PNG export like the notes legend below — never an
    //     HTML-only overlay). v0.3a: solid grayscale swatches only, no
    //     per-condition patterns (those are v0.3b). Triggers strictly on the
    //     structured `conditions[]` field so pre-existing sessions that only
    //     use the legacy free-text `condition` field don't gain a second,
    //     redundant legend. ---
    if (hasAnyConditions(nodes)) {
      const structuredNodes = nodes.filter(n => Array.isArray(n.conditions) && n.conditions.length > 0);
      const conditionRegistry = buildConditionRegistry(structuredNodes);
      if (conditionRegistry.length > 0) {
        const condLegendG = svg.append('g').attr('class', 'condition-legend');
        const legendX = minX + 10;
        let legendY = minY + 24;

        condLegendG.append('text')
          .attr('x', legendX).attr('y', legendY)
          .attr('font-size', '11px').attr('font-weight', '700')
          .attr('fill', '#1e293b')
          .text('Durum / Tanı Kayıtları');
        legendY += 16;

        conditionRegistry.forEach(entry => {
          condLegendG.append('rect')
            .attr('x', legendX).attr('y', legendY - 9)
            .attr('width', 10).attr('height', 10)
            .attr('fill', NODE_STROKE).attr('stroke', NODE_STROKE);
          condLegendG.append('text')
            .attr('x', legendX + 16).attr('y', legendY)
            .attr('font-size', '10px').attr('fill', '#475569')
            .text(entry.label.length > 40 ? entry.label.substring(0, 39) + '...' : entry.label);
          legendY += 14;
        });
      }
    }

    // --- Zoom/Pan ---
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => { g.attr('transform', event.transform); });
    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomIdentity);

    // Store for external reset
    svg.node().__zoom_ref = zoom;

  }, [nodes, edges, selectedNodeId, selectedNodeId2, onNodeSelect]);

  const resetZoom = () => {
    const svg = d3.select(svgRef.current);
    const zoom = svg.node()?.__zoom_ref;
    if (zoom) svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity);
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <button
        onClick={resetZoom}
        style={{
          position: 'absolute', left: 10, top: 10, zIndex: 10,
          background: '#fff', border: '1px solid #e2e8f0',
          borderRadius: '4px', padding: '6px 10px', cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)', fontSize: '0.85rem',
        }}
      >
        Sıfırla
      </button>
      <svg
        id="pedigree-svg"
        ref={attachSvgRef}
        width="100%"
        height="100%"
        style={{ cursor: 'grab', background: '#f8fafc' }}
        onClick={() => onNodeSelect(null)}
      />
    </div>
  );
});

export default PedigreeCanvas;
