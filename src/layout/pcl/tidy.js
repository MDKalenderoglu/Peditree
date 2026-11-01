/**
 * tidy.js — "Yeniden Düzenle": the drawing with the fewest bends (clinician
 * request 2026-10-25: no staircases where they can be avoided).
 *
 * Lays the pedigree out a few ways (index.js opts.straight) and keeps the
 * one with the fewest bends — a line of descent stepping sideways to an only
 * child, a sibship line hanging off to one side of its line of descent, a
 * partnership line routed over people, a crossing — among the layouts with
 * no invariant or readability violation. Pure and deterministic.
 */
import { computePclLayout } from './index';
import { layoutParentage } from './art';
import { checkAllInvariants } from '../../audit/layoutInvariants';
import { checkConnectorReadability } from '../../audit/connectorReadability';

const VARIANTS = [{}, { straight: 'founders' }, { straight: 'only' }, { straight: 'strong' }];

/** Bends a viewer has to follow; lower is tidier. */
export function bendScore(edges) {
  let bends = 0, lanes = 0, jumps = 0;
  const byUnion = new Map();
  for (const e of edges) {
    if (e.lane) lanes++;
    if (Array.isArray(e.bridges)) jumps += e.bridges.length;
    if (!e.unionId) continue;
    if (!byUnion.has(e.unionId)) byUnion.set(e.unionId, { drop: null, stems: [] });
    const u = byUnion.get(e.unionId);
    if (e.type === 'parentChildDrop') u.drop = e;
    if (e.type === 'childStem') u.stems.push(e);
  }
  for (const { drop, stems } of byUnion.values()) {
    if (!drop || !stems.length) continue;
    const xs = [...new Set(stems.map((s) => s.x1))];
    if (xs.length === 1) { if (Math.abs(drop.x1 - xs[0]) > 0.5) bends++; }
    else if (drop.x1 < Math.min(...xs) - 0.5 || drop.x1 > Math.max(...xs) + 0.5) bends++;
  }
  return bends + 2 * lanes + 3 * jumps;
}

/** The variant with the fewest bends among the clean ones (index.js opts.straight). */
function bestVariant(graph) {
  let best = null;
  for (const opts of VARIANTS) {
    const l = computePclLayout(graph, opts);
    // audited against the parentage the drawing shows (adopted-in children, carried children: art.js)
    const drawn = { ...layoutParentage(graph), nodes: l.nodes, edges: l.edges };
    const clean = checkAllInvariants(drawn).length === 0 && checkConnectorReadability(drawn).length === 0;
    const xs = l.nodes.map((n) => n.x);
    const width = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
    const score = bendScore(l.edges) + width / 1e5; // width only breaks ties
    const cand = { ...l, clean, score, variant: opts.straight || 'base' };
    if (!best || (cand.clean && !best.clean) || (cand.clean === best.clean && cand.score < best.score - 1e-9)) best = cand;
  }
  return best;
}

// Partner sides (clinician feedback 2026-11-01: lines of descent stepping
// sideways where they could run straight). Man-left is only a convention;
// where a line of descent passes through a woman, it often runs straight
// only with her partner on her other side. When the tidiest variant still
// bends, the partners of one couple at a time swap sides and every swap that
// leaves fewer bends is kept. A side the clinician chose (union.leftPartner)
// is never changed; large pedigrees skip this to keep "Konumlandır" quick.
const SIDE_SEARCH_MAX_PEOPLE = 60;
const SIDE_SEARCH_MAX_TRIES = 24;

export function computeTidyLayout(graph) {
  let best = bestVariant(graph);
  if (best.score < 1 || (graph.individuals || []).length > SIDE_SEARCH_MAX_PEOPLE) return best;
  let g = graph, tries = 0, improved = true;
  while (improved && best.score >= 1 && tries < SIDE_SEARCH_MAX_TRIES) {
    improved = false;
    for (const u of g.unions || []) {
      if (tries >= SIDE_SEARCH_MAX_TRIES || best.score < 1) break;
      if (u.leftPartner || u.crossGeneration || (u.partners || []).length !== 2) continue;
      const [a, b] = u.partners;
      const na = best.nodes.find((n) => n.id === a), nb = best.nodes.find((n) => n.id === b);
      if (!na || !nb || na.y !== nb.y) continue;
      const right = na.x > nb.x ? a : b;
      const trial = { ...g, unions: g.unions.map((x) => (x.id === u.id ? { ...x, leftPartner: right } : x)) };
      tries++;
      const cand = bestVariant(trial);
      if (cand.clean && (!best.clean || cand.score < best.score - 0.5)) {
        best = cand; g = trial; improved = true;
      }
    }
  }
  return best;
}
