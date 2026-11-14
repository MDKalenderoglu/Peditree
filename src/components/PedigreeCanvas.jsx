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
 *   pregnancyLoss / termination / ectopic → small triangle (TOP and ECT slashed, "ECT" below)
 *   stillbirth → full-size symbol, slash, "SB" below; ongoingPregnancy → "P" inside
 */

import { useEffect, useRef, useState, useCallback, forwardRef } from 'react';
import * as d3 from 'd3';
import { fillFor, REGION_ANGLES, CARRIER_FILL } from '../graph/conditionKey';
import { computePedigreeIds } from '../utils/pedigreeNumbering';
import { applyDrawingStyle } from '../utils/drawingStyleSvg';
import { paintPaper } from '../utils/paper';
import { STANDARD_FAMILY } from '../utils/drawingStyle';
import { annotationAge, pregnancyLine, lmpLine } from '../utils/annotations';
import { BRACKET_OUT } from '../layout/pcl/routing';
import { isSmallSymbol, pregnancyKind, PREGNANCY_LABEL, TESTED_TEXT, isGroup, groupText, subjectOf } from '../graph/model';
import { packLines } from '../utils/textWrap';
import { filled, onsetsOf, unsureOf, bornWeek, hasNoteNumber, geneticRows as geneticRowsOf, lineNoteText, LINE_NOTE_SIZE, TEXT, textScale, ARROW_DROP } from '../utils/symbolText';
import { keyGrid } from '../utils/keyGrid';
import { nameCase } from '../utils/nameCase';
import { chainOf, offsetPolyline } from '../utils/doubleLine';
import { t, tFor, currentLang } from '../i18n';
import { shownAge, formatDate } from '../utils/age';

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

const FILL_PAINT = { solid: NODE_STROKE, grey: '#9ca3af', hatch: 'url(#fill-hatch)', dots: 'url(#fill-dots)', cross: 'url(#fill-cross)' };

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
  // a carrier without a named finding (conditionKey.js CARRIER_FILL): cross-hatching, no finding's pattern
  const cross = defs.append('pattern').attr('id', 'fill-cross').attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 5).attr('height', 5).attr('patternTransform', 'rotate(45)');
  cross.append('rect').attr('width', 5).attr('height', 5).attr('fill', NODE_FILL);
  cross.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 5).attr('stroke', NODE_STROKE).attr('stroke-width', 1.2);
  cross.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 5).attr('y2', 0).attr('stroke', NODE_STROKE).attr('stroke-width', 1.2);
}

/**
 * Mark a symbol's regions (NSGC: one region per finding, defined in the
 * legend; graph/conditionKey.js): thin quadrant lines divide the symbol
 * (as in the clinic's reference sheet), each finding's sector in its fill,
 * clipped to the outline; where two findings meet, a white gap keeps them
 * apart so they never read as one (clinician feedback 2026-10-24); a
 * carrier's part is half of the region. The dividing lines are drawn whole
 * over the sectors: a white edge around every sector broke them where they
 * cross (clinician report 2026-11-07).
 */
function drawRegions(el, defs, clipId, outline, parts, sz) {
  const clip = defs.append('clipPath').attr('id', clipId);
  clip.node().appendChild(outline.node().cloneNode());
  const regions = el.append('g').attr('class', 'condition-regions').attr('clip-path', `url(#${clipId})`);
  const R = sz * 1.8;
  for (const p of parts) {
    regions.append('path').attr('class', p.carrier ? 'condition-carrier' : 'condition-region')
      .attr('d', sectorPath(p.a0, p.a1, R))
      .attr('fill', FILL_PAINT[p.fill] || NODE_STROKE).attr('stroke', 'none');
  }
  regions.append('line').attr('class', 'region-divider').attr('x1', 0).attr('y1', -R).attr('x2', 0).attr('y2', R)
    .attr('stroke', NODE_STROKE).attr('stroke-width', 1);
  // a symbol in halves (a carrier, one finding beside it) has no quarters: a line
  // across an empty half would read as a mark (clinician report 2026-11-04)
  if (parts.some(p => p.a1 - p.a0 < 180)) {
    regions.append('line').attr('class', 'region-divider').attr('x1', -R).attr('y1', 0).attr('x2', R).attr('y2', 0)
      .attr('stroke', NODE_STROKE).attr('stroke-width', 1);
  }
  // the white gap where two findings meet: from the dividing lines' edge outwards, so the cross stays whole
  const norm = (a) => ((Math.round(a * 1000) / 1000) % 360 + 360) % 360;
  const meets = [...new Set(parts.flatMap(p => parts.filter(q => q !== p && norm(q.a0) === norm(p.a1)).map(() => norm(p.a1))))];
  for (const a of meets) {
    const [c, s] = [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180)];
    regions.append('line').attr('class', 'region-gap')
      .attr('x1', c * 0.5).attr('y1', s * 0.5).attr('x2', c * R).attr('y2', s * R)
      .attr('stroke', NODE_FILL).attr('stroke-width', Math.max(1.2, sz * 0.12));
  }
  // outline on top, so the regions never thin the symbol's border
  el.node().appendChild(outline.node().cloneNode());
  el.select(':scope > :last-child').attr('fill', 'none').attr('class', 'pedigree-shape-outline');
}

/**
 * The classic carrier dot (Ayarlar: "Ortada nokta"; conditionKey.js
 * CARRIER_MARKS): dark on an empty symbol, white on a filled one, with a
 * white ring where findings' regions meet in the middle. y: lower in a
 * symbol with a letter inside (P, D, G; the letter then moves up) or in a triangle.
 */
function drawCarrierDot(el, filling, sz, y = 0, r = Math.max(2.8, sz * 0.2)) {
  const dot = (cls, rr, ink) => el.append('circle').attr('class', cls).attr('cx', 0).attr('cy', y).attr('r', rr)
    .attr('fill', ink).style('stroke', 'none');
  if (filling.mode === 'regions') dot('carrier-dot-ring', r + 1.6, NODE_FILL);
  dot('carrier-dot', r, filling.mode === 'full' ? NODE_FILL : NODE_STROKE);
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
  { nodes, edges, selectedNodeId, selectedNodeId2, selectedIds = [], onNodeSelect, onUnionSelect, conditionKey = [], renderQuickBar, patientName = '', onEditText, multiSelect = false, focusTick = 0, onNodeDrop, onBackgroundClick, drawing = null, lang = 'tr', keepAbove = null },
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
    setEditing({ kind, target, value: value ?? '', mark: el.getAttribute('data-mark') || null, x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height });
  }, []);
  const finishEdit = (value) => {
    if (!editing || committed.current) return;
    committed.current = true;
    if (onEditText && value !== editing.value) onEditText(editing.kind, editing.target, value);
    setEditing(null);
  };

  // where the add menu sits: around the single selected person's symbol
  const [anchor, setAnchor] = useState(null);
  // the key is placed by the real width of its text: drawn again once a typeface has loaded
  const [fontsTick, setFontsTick] = useState(0);
  useEffect(() => {
    const fonts = typeof document !== 'undefined' && document.fonts;
    if (!fonts || !fonts.addEventListener) return undefined;
    const again = () => setFontsTick((n) => n + 1);
    fonts.addEventListener('loadingdone', again);
    return () => fonts.removeEventListener('loadingdone', again);
  }, []);
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
  // The side panel opens, closes or is dragged wider: the drawing's box changes width while the
  // window does not. The drawing then stays where it was on screen, the same size, instead of
  // shrinking and jumping to the middle (clinician report 2026-11-09, tablet: "the page gets mixed
  // up when the side panel opens"); the person being worked on is brought into view if the
  // narrower box would hide them. A turned tablet or a resized window fits the drawing as before.
  const placeRef = useRef(null); // { w, h, win, a, e, f }: the drawing's screen matrix, the box it was in
  const notePlace = useCallback(() => {
    const el = svgRef.current;
    const vp = el && el.querySelector('.pedigree-viewport');
    const m = vp && vp.getScreenCTM && vp.getScreenCTM();
    if (!m || !m.a) { placeRef.current = null; return; }
    const r = el.getBoundingClientRect();
    placeRef.current = { w: r.width, h: r.height, win: window.innerWidth, a: m.a, e: m.e - r.left, f: m.f - r.top };
  }, []);
  const holdPlace = useCallback((was) => {
    const el = svgRef.current;
    const zoom = el && el.__zoom_ref;
    if (!el || !was || !zoom || !el.getScreenCTM) return false;
    const r = el.getBoundingClientRect();
    if (Math.abs(r.width - was.w) < 1 || Math.abs(r.height - was.h) > 1 || window.innerWidth !== was.win) return false;
    const s = el.getScreenCTM(); // the box's own fit of the drawing (viewBox)
    if (!s || !s.a || !s.d) return false;
    const svg = d3.select(el);
    svg.call(zoom.transform, d3.zoomIdentity.translate((was.e + r.left - s.e) / s.a, (was.f + r.top - s.f) / s.d).scale(was.a / s.a));
    // the person being worked on stays in view, with room for the ring round them
    const shape = el.querySelector('.node-selected .pedigree-shape');
    const b = shape && shape.getBoundingClientRect();
    if (b && b.width) {
      const cx = b.left + b.width / 2 - r.left;
      const room = Math.min(150, r.width / 4);
      const dx = cx < room ? room - cx : cx > r.width - room ? r.width - room - cx : 0;
      if (dx) svg.call(zoom.translateBy, dx / (s.a * d3.zoomTransform(el).k), 0);
    }
    return true;
  }, []);
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
    // the drawing's place on screen and the box it was in (the side panel may have opened since)
    const placeBefore = placeRef.current;
    // a person with the keyboard focus keeps it across the redraw
    const focusedId = svgRef.current.contains(document.activeElement) ? document.activeElement.getAttribute('data-node-id') : null;
    svg.selectAll('*').remove();
    const editable = (sel, kind, target, value) => sel.classed('editable', true).style('cursor', 'text')
      .on('click', (event) => { event.stopPropagation(); startEdit(kind, target, value, event.currentTarget); });

    // the drawing's own words in the drawing's language (Settings: same as the screens, or apart);
    // the screen-only parts (titles, labels for screen readers) in the screens' language
    const td = tFor(lang);
    if (nodes.length === 0) {
      // Draw a placeholder message
      svg.attr('viewBox', '0 0 800 400');
      svg.append('text')
        .attr('x', 400).attr('y', 200)
        .attr('text-anchor', 'middle')
        .attr('fill', '#64748b')
        .attr('font-size', '16px')
        .text(t('Yeni bir pedigri başlatmak için üst çubuktaki “Yeni” düğmesini kullanın.'));
      return;
    }

    // --- Legends (inside the SVG so they are exported): findings key at the
    // top right (clinician choice 2026-10-24), clinical notes at the bottom ---
    // findings key: a row for each finding a relative is affected by (its
    // quadrant), and one for each finding someone carries ("… taşıyıcısı",
    // the left half — clinician decision 2026-10-25); the proband is drawn
    // fully filled, their findings stand in the first line (the proband, else
    // the consultand — clinician decision 2026-11-01)
    const headNode = subjectOf(nodes);
    const has = (status, entry) => nodes.some(n => (status === 'carrier' || n !== headNode) && (n.conditions || []).some(c =>
      c && c.label && c.status === status
      && c.label.trim().toLocaleLowerCase('tr') === entry.label.trim().toLocaleLowerCase('tr')));
    // a carrier without a named finding: its own pattern (NSGC 2022 §4.5) or the dot the
    // viewer chose (Ayarlar), explained in the key
    const carrierMark = (drawing && drawing.carrierMark) || 'split';
    const plainCarrier = nodes.some(n => {
      const f = n.carrier ? fillFor(n, conditionKey, carrierMark) : {};
      return f.dot || f.parts?.some(p => p.fill === CARRIER_FILL);
    });
    const shownKey = [
      ...conditionKey.filter(e => has('affected', e)).map(e => ({ ...e, carrier: false, text: e.label })),
      ...conditionKey.filter(e => has('carrier', e)).map(e => ({ ...e, carrier: true, text: td('{label} taşıyıcısı', { label: e.label }) })),
      ...(plainCarrier ? [{ label: null, region: 'q1', fill: CARRIER_FILL, carrier: true, dot: carrierMark === 'dot', text: td('Taşıyıcı') }] : []),
      // the vertical line is explained in the key too (NSGC 2022 Fig 2)
      ...(nodes.some(n => n.presymptomatic && !isSmallSymbol(n)) ? [{ label: null, presymptomatic: true, text: td('Presemptomatik (henüz belirti yok)') }] : []),
      ...(nodes.some(n => n.recordsReviewed) ? [{ label: null, recordsReviewed: true, text: td('Kayıtlarla doğrulandı (tıbbi kayıt ya da rapor görüldü)') }] : []),
    ];
    // a text of spaces only is nothing to read (symbolText.js): no [n] for it
    const notedNodes = nodes.filter(hasNoteNumber);
    // legends grow with a wide pedigree, so they read at the same size once
    // the drawing is fitted to the screen (clinician feedback 2026-10-24)
    const LK = Math.max(1.2, (d3.max(nodes, d => d.x) - d3.min(nodes, d => d.x) + 200) / 900)
      * ((drawing && drawing.legendScale) || 1); // the size the clinician chose (Ayarlar)
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
    // the picture is at least 600 wide: a narrower family stands in its middle, not at its left
    // (clinician report 2026-11-14: a new family on a phone or tablet stood at the left of the screen)
    const vw = Math.max(600, maxX - minX);
    const frameX = minX - (vw - (maxX - minX)) / 2;
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
      if (filled(n.condition)) parts.push(['condition', n.condition, n.condition]);
      if (n.deceased && filled(n.causeOfDeath)) parts.push(['causeOfDeath', td('Ölüm: {cause}', { cause: n.causeOfDeath }), n.causeOfDeath]);
      // the age a finding was diagnosed at (clinician decision 2026-10-25: here, not under the symbol)
      onsetsOf(n).forEach(c => parts.push(['onset', td('{finding}: tanı {age}', { finding: c.label, age: /^\d+(,\d+)?$/.test(c.onsetAge) ? td('{age} yaş', { age: shownAge(c.onsetAge, lang) }) : shownAge(c.onsetAge, lang) }), c.onsetAge, `${n.id}\u0001${c.label}`]));
      // a finding the clinician is unsure about, and the week a child was born in (clinician decisions 2026-10-25)
      unsureOf(n).forEach(c => parts.push(['unsure', td('{finding}: bilinmiyor', { finding: c.label }), null]));
      if (bornWeek(n)) parts.push(['gestationWeeks', td('doğum: {week} hf', { week: bornWeek(n) }), bornWeek(n)]);
      if (filled(n.notes)) parts.push(['note', n.notes, n.notes]);
      parts.forEach(([kind, shown, value, target], k) => {
        if (k) segs.push({ text: ' | ' });
        segs.push({ text: shown, kind: kind === 'unsure' ? undefined : kind, target: target || n.id, value });
      });
      return packLines(segs, noteChars);
    });
    const notesBlock = noteLines.length ? TITLE_ROW + d3.sum(noteLines, l => l.length) * NOTE_ROW + 10 * LK : 0;
    // the key's first line (clinician request 2026-10-25): the patient's
    // name, the proband's own symbol, the proband's findings
    const probandNode = headNode;
    const probandFindings = probandNode ? (probandNode.conditions || []).filter(c => c && c.label && c.status === 'affected').map(c => c.label.trim()) : [];
    // as names are written, also from an older file (clinician request 2026-10-30)
    const name = nameCase(patientName).trim();
    const headLines = packLines(probandFindings.flatMap((label, k) => [
      ...(k ? [{ text: ', ' }] : []), { text: label, kind: 'finding', target: label, value: label },
    ]), KEY_CHARS);
    const headBlock = probandNode && (name || probandFindings.length) ? 30 * LK + Math.max(0, headLines.length - 1) * HEAD_LINE : 0;
    // the key's columns: [name] [symbol] [text]; the findings run side by
    // side under the proband's line, as many as the drawing's width allows
    // (clinician request 2026-10-27: one under another wasted the top)
    const KS = 8 * LK, KEY_GAP = 28 * LK;
    // the text's real width in the drawing's typeface (clinician request
    // 2026-10-30: equal gaps between the key's entries; a width guessed from
    // the number of letters left them uneven)
    const look = drawing || { family: STANDARD_FAMILY, k: 1 };
    const probe = svg.append('text').attr('visibility', 'hidden').attr('font-family', look.family);
    const measure = (str, px, weight = null) => {
      probe.attr('font-size', `${px * look.k}px`).attr('font-weight', weight).text(str);
      const w = probe.node().getComputedTextLength ? probe.node().getComputedTextLength() : 0;
      return w > 0 ? w : str.length * px * 0.58 * look.k; // no layout engine (tests): an estimate
    };
    // the text's own width: a floor here left a wider gap after a short word ("OHA")
    const textW = (lines, px) => Math.max(0, ...lines.map(l => measure(l.map(p => p.text).join(''), px)));
    const nameW = headBlock && name ? measure(name, 15 * LK, '700') + 12 * LK : 0;
    const entryW = keyLines.map(lines => 2 * KS + 12 * LK + textW(lines, 12.5 * LK));
    const headTextW = headBlock ? textW(headLines, 13 * LK) : 0;
    probe.remove();
    const keyRight = frameX + vw - 10 * LK; // the picture's right edge
    const grid = keyGrid(entryW, keyRowH, keyRight - frameX - 10 * LK - nameW, KEY_GAP);
    const keyBlock = shownKey.length ? grid.height + 14 * LK : 0;
    const minY = d3.min(nodes, d => d.y) - pad - headBlock - keyBlock;
    // how far the lines under a symbol reach (age, pregnancy, E, wrapped
    // note, label, older text, note number) — the same rules as below; the
    // frame and the notes start under the lowest one (second audit 2026-10-25:
    // a long note could leave the picture)
    // the genetic test lines under a symbol, each wrapped, never cut
    const geneticRows = (d) => geneticRowsOf(d, td(TESTED_TEXT));
    // every text of the drawing at the size chosen in Ayarlar; the layout kept room for it (symbolText.js)
    const TS = textScale();
    const px = (n) => `${n * TS}px`;
    const annotationBottom = (d) => {
      const lines = [d.sexAtBirth, annotationAge(d, lang), pregnancyLine(d, lang), lmpLine(d, lang), d.displayLabel, d.condition, notedNodes.includes(d)].filter(Boolean).length;
      return (isSmallSymbol(d) ? LOSS_SIZE : HALF) + (14 + lines * 13 + geneticRows(d).length * GENETIC_ROW) * TS;
    };
    const lowest = d3.max(nodes, d => d.y + annotationBottom(d));
    const legendTop = Math.max(d3.max(nodes, d => d.y) + 70, lowest + 18); // clear of the age / label lines
    const maxY = Math.max(d3.max(nodes, d => d.y) + pad, lowest + 20, legendTop + notesBlock + 10);
    // likewise a short family stands in the middle of the picture's least height
    const vh = Math.max(400, maxY - minY);
    const frameY = minY - (vh - (maxY - minY)) / 2;
    svg.attr('viewBox', `${frameX} ${frameY} ${vw} ${vh}`)
       .attr('preserveAspectRatio', 'xMidYMid meet');

    // --- Defs ---
    const defs = svg.append('defs');
    addFindingPatterns(defs);

    // The zoom/pan transform is applied to this group only; export resets it
    // so the file always contains the whole pedigree (exportUtils.js).
    const g = svg.append('g').attr('class', 'pedigree-viewport');

    // =====================
    // DRAW EDGES
    // =====================
    // A double line's strokes lie 2 px above and below the relationship
    // line's level. A line leaving it downwards (line of descent, childless
    // mark) starts at the lower stroke, never in the gap between the two
    // (clinician feedback 2026-10-28).
    const DOUBLE_OFFSET = 2;
    const doubleLevels = edges.filter(e => (e.type === 'consanguineousUnion' || e.type === 'consanguineousUnionUnresolved') && e.y1 === e.y2);
    // only the line's own union counts (unionId; the fallback engines may leave it out)
    const sameUnion = (e, unionId) => !unionId || !e.unionId || e.unionId === unionId;
    const onDouble = (x, y, unionId) => doubleLevels.some(e => sameUnion(e, unionId) && Math.abs(e.y1 - y) < 0.5 && x >= Math.min(e.x1, e.x2) - 0.5 && x <= Math.max(e.x1, e.x2) + 0.5);
    const belowDouble = (x, y, unionId) => (onDouble(x, y, unionId) ? y + DOUBLE_OFFSET : y);
    // a couple's line of several segments (cross-generation) is drawn as one
    // double line whose corners meet, not as pairs of strokes per segment
    // (clinician feedback 2026-11-01)
    const doubleChains = new Map();
    for (const e of edges) {
      if ((e.type !== 'consanguineousUnion' && e.type !== 'consanguineousUnionUnresolved') || !e.unionId) continue;
      doubleChains.set(e.unionId, [...(doubleChains.get(e.unionId) || []), e]);
    }
    for (const [unionId, segs] of doubleChains) {
      const points = segs.length > 1 && !segs.some(e => e.bridges && e.bridges.length) ? chainOf(segs) : null;
      if (!points) { doubleChains.delete(unionId); continue; }
      for (const side of [-DOUBLE_OFFSET, DOUBLE_OFFSET]) {
        g.append('path').attr('d', offsetPolyline(points, side).map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(''))
          .attr('stroke', EDGE_COLOR).attr('stroke-width', 1.5).attr('fill', 'none').attr('stroke-linejoin', 'miter');
      }
    }
    edges.forEach(edge => {
      if (doubleChains.has(edge.unionId) && (edge.type === 'consanguineousUnion' || edge.type === 'consanguineousUnionUnresolved')) return;
      switch (edge.type) {
        case 'union':
          // A non-consanguinity relationship background is a normal single
          // line. The one text a line carries is "Aynı köy" (or the
          // clinician's words), drawn apart as a 'lineNote' mark (clinician
          // decision 2026-11-05). See relationshipBackground.js.
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
          if (edge.x1 === edge.x2) { drawStroke(g, edge, -DOUBLE_OFFSET, 0); drawStroke(g, edge, DOUBLE_OFFSET, 0); }
          else { drawStroke(g, edge, 0, -DOUBLE_OFFSET); drawStroke(g, edge, 0, DOUBLE_OFFSET); }
          break;

        case 'parentChildDrop':
        case 'childlessDrop':
          // from the relationship line down: from its lower stroke when it is double
          drawStroke(g, edge.y1 <= edge.y2
            ? { ...edge, y1: belowDouble(edge.x1, edge.y1, edge.unionId) }
            : { ...edge, y2: belowDouble(edge.x2, edge.y2, edge.unionId) });
          break;

        case 'sibship':
        case 'childStem':
        case 'childlessBar':
          drawStroke(g, edge);
          break;

        // adoption by relatives: dashed (descentKind), from the adoptive couple's lower stroke
        case 'adoptiveDescent':
          drawStroke(g, edge.y1 < edge.y2 && edge.x1 === edge.x2 ? { ...edge, y1: belowDouble(edge.x1, edge.y1, edge.unionId) } : edge);
          break;

        // assisted reproduction (NSGC 2022/2025 Figure 5): solid; the parents' diagonal leaves their line's lower stroke
        case 'reproLine':
          drawStroke(g, edge.artKind === 'parents' ? { ...edge, y1: belowDouble(edge.x1, edge.y1, edge.unionId) } : edge).classed('repro-line', true);
          break;

        case 'twinBar':
          drawStroke(g, edge);
          break;

        case 'divorceSlash': {
          // Separated and divorced: the relationship line broken by "//"
          // (NSGC 2022 Fig 3; clinician decision 2026-11-02, before: one slash)
          const { x, y } = edge;
          for (const dx of [-3.5, 3.5]) {
            g.append('line')
              .attr('class', 'relationship-ended')
              .attr('x1', x + dx - 5).attr('y1', y + 7)
              .attr('x2', x + dx + 5).attr('y2', y - 7)
              .attr('stroke', NODE_STROKE).attr('stroke-width', 2);
          }
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

    // No children (one bar) / infertile (two bars), NSGC; the reason below.
    // The stem reaches about half way to the next row; the bars are wide
    // enough to read as a mark, not a stub (clinician 2026-11-01).
    const CL = { stem: 44, half: 16, gap: 6 };
    edges.filter(e => e.type === 'childless').forEach(e => {
      const m = g.append('g').attr('class', 'childless-mark');
      const bar = (y) => m.append('line').attr('x1', e.x - CL.half).attr('y1', y).attr('x2', e.x + CL.half).attr('y2', y)
        .attr('stroke', EDGE_COLOR).attr('stroke-width', 1.5).attr('stroke-linecap', 'round');
      const end = e.y + CL.stem;
      m.append('line').attr('x1', e.x).attr('y1', belowDouble(e.x, e.y, e.unionId)).attr('x2', e.x).attr('y2', end).attr('stroke', EDGE_COLOR).attr('stroke-width', 1.5);
      bar(end);
      if (e.kind === 'infertile') bar(end + CL.gap);
      const textY = end + (e.kind === 'infertile' ? CL.gap : 0) + 14;
      if (e.reason) {
        editable(m.append('text').attr('x', e.x).attr('y', textY).attr('text-anchor', 'middle')
          .attr('font-size', px(10)).attr('fill', '#475569').attr('data-mark', e.kind).text(e.reason), 'childlessReason', e.unionId, e.reason);
      }
      // a click on the bars (or just under them) opens a box for the reason, where the reason is written
      // (clinician request 2026-11-12); screen only, never in a copy
      const hit = m.append('rect').attr('class', 'ui-only childless-hit')
        .attr('x', e.x - CL.half - 8).attr('y', end - 8).attr('width', 2 * CL.half + 16).attr('height', textY - end + 14)
        .attr('fill', 'transparent').attr('data-mark', e.kind).style('pointer-events', 'all');
      hit.append('title').text(t('Çocuksuzluğun sebebini yazmak için tıklayın'));
      editable(hit, 'childlessReason', e.unionId, e.reason || '');
    });

    // "Aynı köy" on a couple's line, or the clinician's own words (clinician request 2026-11-05):
    // just above the line, between the partners; a click corrects it where it stands
    edges.filter(e => e.type === 'lineNote').forEach(e => {
      const text = lineNoteText(e.note, lang);
      editable(g.append('text').attr('class', 'line-note').attr('x', e.x).attr('y', e.y - (e.raised ? 12 : 6) * Math.max(1, TS)).attr('text-anchor', 'middle')
        .attr('font-size', px(LINE_NOTE_SIZE)).attr('fill', '#475569').text(text), 'lineNote', e.unionId, text);
    });

    // Relationship lines are clickable (selects the couple). Wide transparent
    // hit lines, screen only: export removes '.ui-only'.
    if (onUnionSelect) {
      edges.filter(e => e.unionId && ['union', 'consanguineousUnion', 'consanguineousUnionUnresolved'].includes(e.type))
        .forEach(edge => {
          g.append('path')
            .attr('class', 'ui-only union-hit')
            .attr('data-union', edge.unionId)
            .attr('d', connectorPath(edge.x1, edge.y1, edge.x2, edge.y2, edge.bridges))
            .attr('stroke', 'transparent').attr('stroke-width', 12).attr('fill', 'none')
            .style('cursor', 'pointer').style('pointer-events', 'stroke')
            .on('click', (event) => { event.stopPropagation(); onUnionSelect(edge.unionId); })
            .append('title').text(t('İlişkiyi düzenle'));
        });
    }

    // =====================
    // DRAW NODES
    // =====================
    // Adopted people: NSGC brackets around the symbol (notation spec R3) —
    // adopted in or by relatives (a dashed, adoptive line of descent in the
    // layout's edges) and adopted out (adoptedOut, solid line from the
    // parents; clinician decisions 2026-11-01).
    const adoptedIn = new Set([
      ...edges.filter(e => e.descentKind === 'adoptive' && e.childId).map(e => e.childId),
      ...nodes.filter(n => n.adoptedOut).map(n => n.id),
    ]);
    // Pedigree-number corner: upper-left unless a connector crosses there
    // (e.g. a relationship line rising beside the symbol), then upper-right.
    const LABEL_CHAR_W = 6 * TS, LABEL_H = 11 * TS;
    const segments = edges.filter(e => [e.x1, e.y1, e.x2, e.y2].every(Number.isFinite));
    const boxFree = (x0, y0, w, h) => !segments.some(e => {
      const lo = Math.min(e.x1, e.x2) - 2, hi = Math.max(e.x1, e.x2) + 2;
      const top = Math.min(e.y1, e.y2) - 2, bot = Math.max(e.y1, e.y2) + 2;
      if (!(hi > x0 && lo < x0 + w && bot > y0 && top < y0 + h)) return false;
      if (e.x1 === e.x2 || e.y1 === e.y2) return true;
      // a diagonal (twins' lines, a donor's or carrier's line): test points along it, not its
      // bounding box, every 3 px — a long line sampled 20 times stepped over a number (2026-11-05)
      const steps = Math.max(20, Math.ceil(Math.hypot(e.x2 - e.x1, e.y2 - e.y1) / 3));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const px = e.x1 + (e.x2 - e.x1) * t, py = e.y1 + (e.y2 - e.y1) * t;
        // a little more room than for a straight line: the number's letters reach above its estimated box
        if (px > x0 - 4 && px < x0 + w + 4 && py > y0 - 4 && py < y0 + h + 4) return true;
      }
      return false;
    });
    // Pedigree numbers never overlap each other: placed left to right, each
    // takes the first corner free of connectors and of numbers placed before
    // (upper-left, upper-right, then a little higher) — clinician report
    // 2026-10-25: two neighbours' numbers were printed on top of each other.
    const labelAt = new Map();
    {
      // neighbours' brackets count as taken (clinician report 2026-11-01: a number on a bracket)
      const placed = nodes.filter(n => adoptedIn.has(n.id)).flatMap(n => {
        const b = (isSmallSymbol(n) ? LOSS_SIZE : HALF) + BRACKET_OUT;
        return [{ x: n.x - b - 1, y: n.y - b, w: 8, h: 2 * b }, { x: n.x + b - 7, y: n.y - b, w: 8, h: 2 * b }];
      });
      // the words on a "same village" line count as taken too
      for (const e of edges.filter(x => x.type === 'lineNote')) {
        const w = lineNoteText(e.note, lang).length * LINE_NOTE_SIZE * TS * TEXT.EM;
        const base = e.y - (e.raised ? 12 : 6) * Math.max(1, TS);
        placed.push({ x: e.x - w / 2, y: base - LINE_NOTE_SIZE * TS - 4, w, h: LINE_NOTE_SIZE * TS + 7 });
      }
      const hitsPlaced = (b) => placed.some(q => b.x < q.x + q.w + 3 && q.x < b.x + b.w + 3 && b.y < q.y + q.h && q.y < b.y + b.h);
      for (const n of nodes.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x))) {
        const pid = pedigreeIds.get(n.id);
        if (!pid) continue;
        const nsz = isSmallSymbol(n) ? LOSS_SIZE : HALF;
        const gap = adoptedIn.has(n.id) ? 12 : 6;
        const w = pid.displayId.length * LABEL_CHAR_W;
        const top = n.y - (nsz + 6) - LABEL_H + 2;
        const lift = LABEL_H + 3;
        const options = [
          { dx: -(nsz + gap), dy: -(nsz + 6), anchor: 'end', box: { x: n.x - (nsz + gap) - w, y: top, w, h: LABEL_H } },
          { dx: nsz + gap, dy: -(nsz + 6), anchor: 'start', box: { x: n.x + nsz + gap, y: top, w, h: LABEL_H } },
          { dx: -(nsz + gap), dy: -(nsz + 6) - lift, anchor: 'end', box: { x: n.x - (nsz + gap) - w, y: top - lift, w, h: LABEL_H } },
          { dx: nsz + gap, dy: -(nsz + 6) - lift, anchor: 'start', box: { x: n.x + nsz + gap, y: top - lift, w, h: LABEL_H } },
          // higher still, when two lines (a donor's and a carrier's) cross both corners
          { dx: -(nsz + gap), dy: -(nsz + 6) - 2 * lift, anchor: 'end', box: { x: n.x - (nsz + gap) - w, y: top - 2 * lift, w, h: LABEL_H } },
          { dx: nsz + gap, dy: -(nsz + 6) - 2 * lift, anchor: 'start', box: { x: n.x + nsz + gap, y: top - 2 * lift, w, h: LABEL_H } },
        ];
        const pick = options.find(o => boxFree(o.box.x, o.box.y, o.box.w, o.box.h) && !hitsPlaced(o.box))
          || options.find(o => !hitsPlaced(o.box)) || options[0];
        placed.push(pick.box);
        labelAt.set(n.id, pick);
      }
    }

    // The proband's / consultand's arrow points at the symbol from its lower left (NSGC). Where a line stands
    // there — the couple's line of descent or the bars of no children when the person is the right-hand
    // partner, a sibship line, a neighbour — it points from the lower right instead (clinician report
    // 2026-11-12: after the consultand changed, the arrow lay on the infertility bars). Placement only; the
    // arrow means the same on either side.
    const arrowRight = new Set();
    {
      const segs = [];
      for (const e of edges) {
        if ([e.x1, e.y1, e.x2, e.y2].every(Number.isFinite)) segs.push([e.x1, e.y1, e.x2, e.y2]);
        else if (e.type === 'childless') {
          const end = e.y + 44; // CL.stem: the bars' stem, the bar(s) under it
          segs.push([e.x, e.y, e.x, end + 6], [e.x - 16, end, e.x + 16, end], [e.x - 16, end + 6, e.x + 16, end + 6]);
        }
      }
      const inBox = (x, y, b) => x >= b.l && x <= b.r && y >= b.t && y <= b.b;
      const segHits = ([x1, y1, x2, y2], b) => {
        if (Math.max(x1, x2) < b.l || Math.min(x1, x2) > b.r || Math.max(y1, y2) < b.t || Math.min(y1, y2) > b.b) return false;
        for (let k = 0; k <= 24; k++) if (inBox(x1 + (x2 - x1) * k / 24, y1 + (y2 - y1) * k / 24, b)) return true;
        return false;
      };
      for (const n of nodes) {
        if (!(n.proband || n.consultand)) continue;
        const sz = isSmallSymbol(n) ? LOSS_SIZE : HALF;
        const off = adoptedIn.has(n.id) ? sz + BRACKET_OUT + 4 : sz + 6;
        const reach = n.proband ? 30 : 18; // the arrow, and "P" beyond its tail
        const side = (dir) => (dir < 0
          ? { l: n.x - off - reach, r: n.x - off + 3, t: n.y + off - 3, b: n.y + off + (n.proband ? 28 : 18) }
          : { l: n.x + off - 3, r: n.x + off + reach, t: n.y + off - 3, b: n.y + off + (n.proband ? 28 : 18) });
        const taken = (b) => segs.some((sg) => segHits(sg, b)) || nodes.some((m) => {
          if (m === n) return false;
          const h = (isSmallSymbol(m) ? LOSS_SIZE : HALF) + (adoptedIn.has(m.id) ? BRACKET_OUT : 0) + 2;
          return m.x + h >= b.l && m.x - h <= b.r && m.y + h >= b.t && m.y - h <= b.b;
        });
        if (taken(side(-1)) && !taken(side(1))) arrowRight.add(n.id);
      }
    }

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
        isGroup(d) ? `${d.count === 'n' ? t('sayısı bilinmeyen') : d.count} ${t({ male: 'erkek', female: 'kadın' }[d.sex] || 'kişi')}`
          : pregnancyKind(d) ? t(PREGNANCY_LABEL[pregnancyKind(d)]).toLocaleLowerCase(currentLang()) : t({ male: 'erkek', female: 'kadın' }[d.sex] || 'cinsiyeti bilinmiyor'),
        d.proband && 'proband', d.consultand && t('danışan'), d.reproMark === 'G' && t('gestasyonel taşıyıcı'), d.reproMark === 'D' && t('donör'), d.affected && t('etkilenmiş'), d.carrier && t('taşıyıcı'), d.presymptomatic && t('presemptomatik'), d.recordsReviewed && t('kayıtlarla doğrulandı'), d.sexAtBirth, d.deceased && t('vefat'),
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
        el.append('text').attr('class', 'pedigree-number')
          .attr('x', at.dx).attr('y', at.dy).attr('text-anchor', at.anchor)
          .attr('font-size', px(10)).attr('fill', '#64748b')
          .text(pedigreeId.displayId);
      }
      if (adopted) {
        const b = sz + BRACKET_OUT;
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
      const filling = fillFor(d, conditionKey, carrierMark);
      const dotBelow = filling.dot && !isSmall && (d.ongoingPregnancy || d.reproMark); // a letter inside moves up for it
      let fill = NODE_FILL;
      if (filling.mode === 'full') fill = NODE_STROKE;

      shape.attr('class', 'pedigree-shape')
        .attr('fill', fill).attr('stroke', NODE_STROKE).attr('stroke-width', 2);
      if (filling.mode === 'regions') drawRegions(el, defs, `regions-${nodeIndex}`, shape, filling.parts, sz);
      // Selection highlight (primary blue / secondary violet) comes from the
      // node-group classes above via app.css — see EX-1 note there.

      // Presymptomatic / asymptomatic carrier: a vertical line through the symbol
      // (NSGC 2022 Fig 2; clinician decision 2026-11-02)
      if (d.presymptomatic && !isSmall) {
        el.append('line').attr('class', 'presymptomatic-line')
          .attr('x1', 0).attr('y1', -sz).attr('x2', 0).attr('y2', sz)
          .attr('stroke', NODE_STROKE).attr('stroke-width', 2);
      }

      // the carrier's dot, when the viewer chose it: in the middle, below a letter inside the symbol
      if (filling.dot) {
        if (isSmall) drawCarrierDot(el, filling, sz, sz / 3);
        else if (dotBelow) drawCarrierDot(el, filling, sz, sz * 0.65, sz * 0.175);
        else drawCarrierDot(el, filling, sz);
      }

      // Records reviewed: an asterisk at the lower right, outside the brackets of an
      // adopted person (NSGC 2022 Fig 2 "documented evaluation"; clinician 2026-11-03)
      if (d.recordsReviewed) {
        const ax = (adopted ? sz + BRACKET_OUT + 2 : sz + 2);
        el.append('text').attr('class', 'records-reviewed')
          .attr('x', ax).attr('y', sz + 4).attr('text-anchor', 'start')
          .attr('font-size', '15px').attr('font-weight', '700').attr('fill', NODE_STROKE).text('*');
      }

      // Ongoing pregnancy: "P" inside the symbol (NSGC)
      if (d.ongoingPregnancy) {
        el.append('text').attr('class', 'pregnancy-p').attr('y', dotBelow ? 2 : 5).attr('text-anchor', 'middle')
          .attr('font-size', '14px').attr('font-weight', '700').attr('fill', filling.mode === 'full' ? NODE_FILL : NODE_STROKE).text('P');
      }
      // Several people in one symbol: their number, or "n", inside (NSGC;
      // clinician decisions 2026-11-01)
      // "D" (donor, surrogate) or "G" (gestational carrier) inside the symbol; white on a filled one
      if (d.reproMark) {
        el.append('text').attr('class', 'repro-mark').attr('y', dotBelow ? 3 : 6).attr('text-anchor', 'middle')
          .attr('font-size', '16px').attr('font-weight', '600')
          .attr('fill', filling.mode === 'full' ? NODE_FILL : NODE_STROKE).text(d.reproMark);
      }
      if (isGroup(d)) {
        el.append('text').attr('class', 'group-count').attr('y', 6).attr('text-anchor', 'middle')
          .attr('font-size', groupText(d).length > 1 ? '15px' : '18px').attr('font-weight', '600').attr('fill', NODE_STROKE).text(groupText(d));
      }
      // Termination (TOP) and ectopic pregnancy (ECT): a slash through the triangle (NSGC 2008; for
      // ECT restored by the 2025 correction, Steinhaus French et al., doi:10.1002/jgc4.2020 — "ECT" below tells them apart)
      if (d.termination || d.ectopic) {
        el.append('line').attr('x1', -(sz + 3)).attr('y1', sz + 3).attr('x2', sz + 3).attr('y2', -(sz + 3)).attr('stroke', NODE_STROKE).attr('stroke-width', 2);
      }
      // A stillbirth is drawn at full size with the slash of a deceased person
      // and "SB" below (NSGC; clinician decision 2026-10-25)
      if (d.deceased && !isSmall && !d.ongoingPregnancy) {
        // Diagonal slash for deceased: from the lower left to the upper right, as NSGC and the
        // textbooks draw it (clinician 2026-11-11: no difference from the international standard);
        // it stops at the corner where a proband's or consultand's arrow points
        const low = (d.proband || d.consultand) && !arrowRight.has(d.id) ? 0 : 4;
        el.append('line').attr('class', 'deceased-slash')
          .attr('x1', -(sz + low)).attr('y1', sz + low)
          .attr('x2', sz + 4).attr('y2', -(sz + 4))
          .attr('stroke', NODE_STROKE).attr('stroke-width', 2);
      }

      // Proband / consultand arrow (lower-left); "P" only for the proband
      if (d.proband || d.consultand) {
        // outside an adopted person's brackets (clinician report 2026-11-01)
        const arrOff = adopted ? sz + BRACKET_OUT + 4 : sz + 6;
        const m = arrowRight.has(d.id) ? -1 : 1; // from the lower right where the lower left is taken
        el.append('path').attr('class', `proband-arrow${m < 0 ? ' arrow-right' : ''}`)
          .attr('d', `M${-m * (arrOff + 14)},${arrOff + 14} L${-m * arrOff},${arrOff} M${-m * arrOff},${arrOff} L${-m * (arrOff + 10)},${arrOff} M${-m * arrOff},${arrOff} L${-m * arrOff},${arrOff + 10}`)
          .attr('fill', 'none')
          .attr('stroke', NODE_STROKE)
          .attr('stroke-width', 2);
        // NSGC: the proband's arrow carries "P"; an arrow alone marks the
        // consultand — clinician decisions K10, 2026-10-23 and 2026-11-01
        if (d.proband) el.append('text')
          .attr('class', 'proband-p')
          .attr('x', -m * (arrOff + 17)).attr('y', arrOff + 26).attr('text-anchor', m < 0 ? 'start' : 'end')
          .attr('font-size', '12px').attr('font-weight', '700').attr('fill', NODE_STROKE)
          .text('P');
      }

      // --- Annotations below node ---
      // below an adopted person's brackets
      let lineY = (adopted ? sz + BRACKET_OUT + 2 : sz) + 14 * TS;
      const LINE_H = 13 * TS;
      // the proband's lines stand a little to the right, clear of the arrow at the lower left
      const ann = el.append('g').attr('class', 'annotations').attr('transform', d.proband || d.consultand ? `translate(${arrowRight.has(d.id) ? -14 : 14},0)` : null);

      // Sex assigned at birth right under the symbol, when stated (NSGC 2022 Box 1, Fig 1)
      if (d.sexAtBirth) {
        ann.append('text').attr('class', 'sex-at-birth')
          .attr('y', lineY).attr('text-anchor', 'middle')
          .attr('font-size', px(11)).attr('fill', '#475569')
          .text(d.sexAtBirth);
        lineY += LINE_H;
      }

      // Age, or "d." and the age at death (also without an age filled in)
      const ageLine = annotationAge(d, lang);
      if (ageLine) {
        editable(ann.append('text')
          .attr('y', lineY).attr('text-anchor', 'middle')
          .attr('font-size', px(11)).attr('fill', '#475569')
          .text(ageLine.text), ageLine.kind, d.id, ageLine.value);
        lineY += LINE_H;
      }

      // a pregnancy outcome: "SB 28 hf", "TOP 16 hf", "ECT", the week
      const pLine = pregnancyLine(d, lang);
      if (pLine) {
        editable(ann.append('text')
          .attr('y', lineY).attr('text-anchor', 'middle')
          .attr('font-size', px(11)).attr('fill', '#475569')
          .text(pLine), 'gestationWeeks', d.id, d.gestationWeeks || '');
        lineY += LINE_H;
      }
      // an ongoing pregnancy's last menstrual period (NSGC: "LMP" under the P)
      const lLine = lmpLine(d, lang);
      if (lLine) {
        editable(ann.append('text').attr('class', 'lmp-line')
          .attr('y', lineY).attr('text-anchor', 'middle')
          .attr('font-size', px(11)).attr('fill', '#475569')
          .text(lLine), 'lmp', d.id, formatDate(d.lmp));
        lineY += LINE_H;
      }

      // genetic test (clinician decision 2026-10-27): the clinician's lines one
      // under another, no "E" prefix (NSGC 2022); each line is edited where it stands
      geneticRows(d).forEach(row => {
        editable(ann.append('text')
          .attr('y', lineY - 1).attr('text-anchor', 'middle')
          .attr('font-size', px(9)).attr('fill', row.placeholder ? '#64748b' : '#334155')
          .attr('font-style', row.placeholder ? 'italic' : null)
          .text(row.text), 'geneticLine', `${d.id}\u0001${row.k}`, row.value);
        lineY += GENETIC_ROW * TS;
      });

      // Display label
      if (d.displayLabel) {
        editable(ann.append('text')
          .attr('y', lineY).attr('text-anchor', 'middle')
          .attr('font-size', px(11)).attr('fill', '#475569')
          .text(d.displayLabel), 'displayLabel', d.id, d.displayLabel);
        lineY += LINE_H;
      }

      // Condition
      if (d.condition) {
        editable(ann.append('text')
          .attr('y', lineY).attr('text-anchor', 'middle')
          .attr('font-size', px(10)).attr('fill', '#4f46e5')
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
            .attr('font-size', px(9)).attr('fill', '#b91c1c') // 6.5:1 on white (WCAG AA; audit 2026-11-02)
            .attr('font-weight', '600')
            .text(`[${noteIdx + 1}]`);
        }
      }

      // the first line so wide that, moved aside, it still reaches the arrow (the LMP under a pregnancy, a
      // long label): the lines start below the arrow — the layout kept the room (symbolText belowArrow)
      if (d.proband || d.consultand) {
        const first = ann.select('text').node();
        if (first && typeof first.getBBox === 'function') {
          const b = first.getBBox();
          const tipOff = adopted ? sz + BRACKET_OUT + 4 : sz + 6;
          const right = arrowRight.has(d.id);
          const sx = right ? -14 : 14;
          const reaches = right ? b.x + b.width + sx > tipOff - 3 : b.x + sx < -tipOff + 3;
          const clear = tipOff + 14 + 4; // below the arrow's tail, with a little air
          if (b.width && reaches && b.y < clear) {
            const dy = Math.min(ARROW_DROP * TS, clear - b.y);
            ann.attr('transform', `translate(${sx},${dy})`);
          }
        }
      }
    });

    // --- Key (NSGC legend), top right: the patient's line, then which mark
    //     is which finding ---
    if (headBlock || shownKey.length) {
      const keyG = svg.append('g').attr('class', 'condition-legend');
      const s = KS;
      // the findings start under the proband's symbol (clinician request 2026-10-25)
      const headW = headBlock ? 2 * s + 12 * LK + headTextW : 0;
      const width = nameW + Math.max(headW, grid.width);
      const kx = Math.max(frameX + 10, keyRight - width);
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
        const f = fillFor(probandNode, conditionKey, carrierMark);
        shape.attr('stroke', NODE_STROKE).attr('stroke-width', 1.5)
          .attr('fill', f.mode === 'full' ? NODE_STROKE : NODE_FILL);
        if (f.mode === 'regions') drawRegions(cell, defs, 'legend-proband-regions', shape, f.parts, s);
        if (f.dot) drawCarrierDot(cell, f, s);
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
        if (entry.recordsReviewed) {
          cell.append('text').attr('class', 'records-reviewed').attr('x', s + 1).attr('y', s + 3)
            .attr('font-size', `${12 * LK}px`).attr('font-weight', '700').attr('fill', NODE_STROKE).text('*');
        } else if (entry.presymptomatic) {
          cell.append('line').attr('class', 'presymptomatic-line').attr('x1', 0).attr('y1', -s).attr('x2', 0).attr('y2', s)
            .attr('stroke', NODE_STROKE).attr('stroke-width', 1.5);
        } else if (entry.dot) {
          drawCarrierDot(cell, { mode: 'none' }, s);
        } else {
          const [a0, a1] = entry.carrier ? [90, 270] : (REGION_ANGLES[entry.region] || REGION_ANGLES.q1);
          drawRegions(cell, defs, `key-region-${row}`, box, [{ fill: entry.fill, a0, a1, carrier: entry.carrier }], s);
        }
        keyLines[row].forEach((line, li) => {
          const t = keyG.append('text')
            .attr('x', ex + 2 * s + 12 * LK).attr('y', ey + s + 4.5 * LK + li * KEY_LINE)
            .attr('font-size', `${12.5 * LK}px`).attr('fill', '#334155')
            .text(line.map(p => p.text).join(''));
          if (entry.label) editable(t, 'finding', entry.label, entry.label); // "Taşıyıcı" is not a finding's name
        });
      });
    }
    const legendX = frameX + 10;
    let legendY = legendTop;

    // --- Notes legend (each part editable where it stands) ---
    if (noteLines.length > 0) {
      const legendG = svg.append('g').attr('class', 'notes-legend');
      legendG.append('text')
        .attr('x', legendX).attr('y', legendY + 12 * LK)
        .attr('font-size', `${13 * LK}px`).attr('font-weight', '700').attr('fill', '#1e293b')
        .text(td('Notlar'));
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

    // the viewer's drawing style (standard / hand-drawn, typeface), drawingStyle.js
    applyDrawingStyle(svgRef.current, drawing);

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
        notePlace();
        paintPaper(svg.node(), drawing && drawing.paper); // squared / dotted paper moves with the drawing
        placeQuickBar();
        const m = measureSelected();
        keepRef.current = m && selectedNodeId ? { id: selectedNodeId, ...m } : null;
      });
    svg.call(zoom);
    // this drawing's zoom, for everything below and outside (the old one moved the drawing just removed)
    svg.node().__zoom_ref = zoom;
    // a quick second tap on a tablet selects again; it must not zoom
    svg.on('dblclick.zoom', null);
    // a click on the empty drawing (people, lines and texts stop theirs; a
    // pan never ends in a click) — App steps back one level
    svg.on('click.background', () => onBackgroundClick && onBackgroundClick());
    // a pen (Apple Pencil, a Windows or Android stylus; clinician report 2026-11-10): it reports a pixel or
    // two of movement in every tap, and the pan above cancels such a touch, so the click never came — the
    // ring did not open. A short, nearly still pen tap is turned into a click on what it touched; the
    // browser's own click, should one still come, is let through only once.
    const svgEl = svg.node();
    if (svgEl.__penTap) {
      svgEl.removeEventListener('pointerdown', svgEl.__penTap.down, true);
      svgEl.removeEventListener('pointerup', svgEl.__penTap.up, true);
      svgEl.removeEventListener('click', svgEl.__penTap.click, true);
    }
    let penDown = null;
    let penClickAt = -Infinity;
    const PEN_SLOP = 10;      // px a pen may wander in a tap
    const PEN_TAP_MS = 700;   // longer is a press, not a tap
    const penTap = {
      down: (e) => { penDown = e.pointerType === 'pen' ? { x: e.clientX, y: e.clientY, t: e.timeStamp, target: e.target } : null; },
      up: (e) => {
        const d = penDown;
        penDown = null;
        if (!d || e.pointerType !== 'pen') return;
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > PEN_SLOP || e.timeStamp - d.t > PEN_TAP_MS) return;
        penClickAt = performance.now();
        d.target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey }));
      },
      // the browser's own click right after a pen tap already turned into one: not a second time
      click: (e) => { if (e.isTrusted && performance.now() - penClickAt < 600) { penClickAt = -Infinity; e.stopPropagation(); e.preventDefault(); } },
    };
    svgEl.addEventListener('pointerdown', penTap.down, true);
    svgEl.addEventListener('pointerup', penTap.up, true);
    svgEl.addEventListener('click', penTap.click, true);
    svgEl.__penTap = penTap;
    // keep the clinician's zoom/pan across edits (it used to jump back after
    // every change); "Sığdır" resets it
    svg.call(zoom.transform, d3.zoomTransform(svg.node()));
    // the side panel opened or closed with this change: the drawing stays where it was
    holdPlace(placeBefore);
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
    paintPaper(svg.node(), drawing && drawing.paper);
    {
      const m = measureSelected();
      keepRef.current = m && selectedNodeId ? { id: selectedNodeId, ...m } : null;
    }


  }, [nodes, edges, selectedNodeId, selectedNodeId2, selectedIds, onNodeSelect, onUnionSelect, conditionKey, placeQuickBar, patientName, startEdit, multiSelect, focusTick, onNodeDrop, onBackgroundClick, drawing, fontsTick, lang, holdPlace, notePlace]);

  // the drawing area changes size (window, side panel): the drawing moves on
  // screen, and the paper with it
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(() => {
      // the side panel dragged wider or narrower: the drawing stays where it was
      if (!holdPlace(placeRef.current)) notePlace();
      paintPaper(el, drawing && drawing.paper);
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, [drawing, holdPlace, notePlace]);

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

  // a phone (clinician request 2026-11-10): the side panel is a sheet over the lower half of the screen.
  // The person just chosen is brought into the part of the drawing still in sight, with room for the
  // ring round them, so neither the person nor the ring hides under the sheet
  useEffect(() => {
    if (!keepAbove || !selectedNodeId) return undefined;
    const bring = () => {
      const el = svgRef.current;
      const shape = el && el.querySelector('.node-selected .pedigree-shape');
      const sheet = document.querySelector('.touch-sheet');
      if (!shape || !sheet) return;
      const r = shape.getBoundingClientRect();
      const full = el.getBoundingClientRect();
      const sh = sheet.getBoundingClientRect();
      // the sheet below (portrait) or at the right (landscape): the part of the drawing still in sight
      const side = sh.top <= full.top + 40;
      const box = { left: full.left, top: full.top, right: side ? Math.min(full.right, sh.left) : full.right, bottom: full.bottom };
      const top = box.top;
      const bottom = side ? box.bottom : Math.min(box.bottom, sh.top);
      if (!(bottom > top) || !r.width) return;
      const ROOM = 96; // the ring round the person
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dy = cy < top + ROOM || cy > bottom - ROOM ? (top + bottom) / 2 - cy : 0;
      const dx = cx < box.left + ROOM || cx > box.right - ROOM ? (box.left + box.right) / 2 - cx : 0;
      if (dx || dy) panBy(dx, dy);
    };
    // after the sheet has come up (its own motion) and the drawing has settled
    const late = setTimeout(bring, 320);
    return () => clearTimeout(late);
  }, [keepAbove, selectedNodeId, panBy]);

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
        <button onClick={() => zoomBy(1.25)} title={t('Yakınlaştır')} aria-label={t('Yakınlaştır')}>+</button>
        <button onClick={() => zoomBy(0.8)} title={t('Uzaklaştır')} aria-label={t('Uzaklaştır')}>−</button>
        <button onClick={fitZoom} title={t('Tüm pedigriyi ekrana sığdır (0)')} aria-label={t('Sığdır')}>{t('Sığdır')}</button>
      </div>
      <svg
        id="pedigree-svg"
        ref={attachSvgRef}
        width="100%"
        height="100%"
        style={{ cursor: 'grab' }}
      />
      {anchor && renderQuickBar && !editing && renderQuickBar(anchor, panBy)}
      {editing && (() => {
        const hint = editing.kind !== 'childlessReason' ? undefined
          : editing.mark === 'infertile' ? t('Sebep (örn. azospermi)') : t('Sebep (örn. tercih)');
        // as wide as what it holds (or its hint) needs, the ring's finding box's look (clinician 2026-11-12)
        const chars = Math.max(String(editing.value || '').length, hint ? hint.length : 0);
        const boxWidth = Math.min(Math.max(editing.w + 36, chars * 7.2 + 30, 120), 320);
        return (
        <input className="input inline-edit" autoFocus defaultValue={editing.value}
          placeholder={hint}
          aria-label={editing.kind === 'childlessReason' ? t('Çocuksuzluğun sebebi') : undefined}
          style={{ left: editing.x - 6, top: editing.y + (editing.h - 30) / 2, width: boxWidth }}
          onKeyDown={e => {
            if (e.key === 'Enter') finishEdit(e.currentTarget.value);
            if (e.key === 'Escape') { committed.current = true; setEditing(null); }
          }}
          onBlur={e => finishEdit(e.currentTarget.value)} />
        );
      })()}
    </div>
  );
});

export default PedigreeCanvas;
