/**
 * RadialAddMenu.jsx — a ring around the selected symbol (clinician requests
 * 2026-10-24). The ring adds relatives: top = parents, left = sibling,
 * right = spouse, bottom = child (pointing at a sector opens its choices, a
 * click adds). Four buttons on the diagonals work on the person while the
 * history is taken: findings (with their legend marks), status (affected,
 * carrier, deceased, proband), twins, note. The hole in the middle leaves the
 * symbol visible and clickable. The same store operations as the right
 * panel; the store refuses (with a reason) anything the graph rules forbid.
 */
import { Fragment, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Stethoscope, HeartPulse, Users, StickyNote } from 'lucide-react';
import FindingsPalette from './FindingsPalette';
import DraftField from './DraftField';
import { groupOf, multipleName } from '../graph/multiples';
import { isPregnancy, isGroup, adoptionOf } from '../graph/model';
import { computePedigreeIds } from '../utils/pedigreeNumbering';
import { parseGroupCount } from '../graph/ops';
import { useRingPrefs, RING_ROWS, RING_PREGNANCY } from '../utils/ringPrefs';

const S = 9; // glyph half-size

export function Glyph({ kind, label = '' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 };
  return (
    <svg width="20" height="20" viewBox="-10 -10 20 20" aria-hidden="true">
      {kind === 'male' && <rect x={-S + 1} y={-S + 1} width={2 * S - 2} height={2 * S - 2} {...common} />}
      {kind === 'female' && <circle r={S - 1} {...common} />}
      {kind === 'unknown' && <path d={`M0,${-S} L${S},0 L0,${S} L${-S},0 Z`} {...common} />}
      {(kind === 'loss' || kind === 'termination' || kind === 'ectopic') && <path d={`M0,${-S + 3} L${S - 2},${S - 3} L${-S + 2},${S - 3} Z`} {...common} />}
      {kind === 'termination' && <path d={`M${-S + 1},${S - 1} L${S - 1},${-S + 1}`} {...common} />}
      {kind === 'ectopic' && <text x="0" y={S + 1} fontSize="5.5" textAnchor="middle" fill="currentColor" stroke="none">ECT</text>}
      {kind.startsWith('adopted-') && (
        <>
          {kind === 'adopted-male' && <rect x={-S + 4} y={-S + 4} width={2 * S - 8} height={2 * S - 8} {...common} />}
          {kind === 'adopted-female' && <circle r={S - 4} {...common} />}
          {kind === 'adopted-unknown' && <path d={`M0,${-S + 3} L${S - 3},0 L0,${S - 3} L${-S + 3},0 Z`} {...common} />}
          <path d={`M${-S + 3},${-S} H${-S} V${S} H${-S + 3} M${S - 3},${-S} H${S} V${S} H${S - 3}`} {...common} />
        </>
      )}
      {kind.startsWith('group-') && (
        <>
          {kind === 'group-male' && <rect x={-S + 1} y={-S + 1} width={2 * S - 2} height={2 * S - 2} {...common} />}
          {kind === 'group-female' && <circle r={S - 1} {...common} />}
          {kind === 'group-unknown' && <path d={`M0,${-S} L${S},0 L0,${S} L${-S},0 Z`} {...common} />}
          <text x="0" y="3" fontSize={String(label).length > 1 ? 6.5 : 8} fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">{label}</text>
        </>
      )}
      {kind === 'stillbirth' && (
        <>
          <path d={`M0,${-S + 1} L${S - 1},0 L0,${S - 1} L${-S + 1},0 Z`} {...common} />
          <path d={`M${-S},${S} L${S},${-S}`} {...common} />
        </>
      )}
      {kind === 'ongoing' && (
        <>
          <path d={`M0,${-S + 1} L${S - 1},0 L0,${S - 1} L${-S + 1},0 Z`} {...common} />
          <text x="0" y="3" fontSize="8" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">P</text>
        </>
      )}
    </svg>
  );
}

// [glyph, title, sex, extra, row] — row 1 people, row 2 pregnancy outcomes
// (NSGC; clinician decision 2026-10-25: the ring stays, the choices get a second row)
const KINDS = [
  ['male', 'Erkek', 'male', {}, 1],
  ['female', 'Kız', 'female', {}, 1],
  ['unknown', 'Cinsiyeti bilinmeyen', 'unknown', {}, 1],
  ['loss', 'Düşük', 'unknown', { pregnancyLoss: true }, 2],
  ['stillbirth', 'Ölü doğum (SB)', 'unknown', { stillbirth: true }, 2],
  ['ongoing', 'Devam eden gebelik (P)', 'unknown', { ongoingPregnancy: true }, 2],
  ['termination', 'Sonlandırma (TOP)', 'unknown', { termination: true }, 2],
  ['ectopic', 'Dış gebelik (ECT)', 'unknown', { ectopic: true }, 2],
];

// ring sectors (degrees, screen: 0 = east, clockwise)
const SECTORS = {
  top: { a0: -135, a1: -45, label: 'Ebeveyn' },
  right: { a0: -45, a1: 45, label: 'Eş' },
  bottom: { a0: 45, a1: 135, label: 'Çocuk' },
  left: { a0: 135, a1: 225, label: 'Kardeş' },
};
// buttons on the diagonals
const SATELLITES = [
  { key: 'findings', angle: -45, label: 'Bulgu', Icon: Stethoscope },
  { key: 'status', angle: -135, label: 'Durum', Icon: HeartPulse },
  { key: 'twins', angle: 135, label: 'İkiz', Icon: Users },
  { key: 'note', angle: 45, label: 'Not', Icon: StickyNote },
];

/** Enter / Space on an SVG "button" acts as a click (keyboard use). */
const pressKey = (e, fn) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); fn(); }
};
/**
 * Hover opens menus for a mouse or a hovering pen only: a finger's tap
 * fires "enter" and then "click", which would open and close at once.
 */
const isHover = (e) => e.pointerType !== 'touch';

/** One button of a rainbow band: an annular segment with a (two-line) label. */
function ArcButton({ a0, a1, r, R, label, on, disabled, onClick, title, flip = 0 }) {
  const mid = ((a0 + a1) / 2) * Math.PI / 180;
  const tr = (r + R) / 2;
  const lines = String(label).split('\n');
  // text runs along the band (like a rainbow); the whole band reads one way
  // (`flip` is chosen per band, so no label turns round on its own)
  const rot = (a0 + a1) / 2 + 90 + flip;
  const cx = tr * Math.cos(mid), cy = tr * Math.sin(mid);
  return (
    <g className={`radial-arc${on ? ' on' : ''}${disabled ? ' off' : ''}`} role="button" aria-label={label.replace(/\n/g, ' ')}
      aria-pressed={!!on} tabIndex={disabled ? -1 : 0} onClick={disabled ? undefined : onClick}
      onKeyDown={disabled ? undefined : (e) => pressKey(e, onClick)}>
      <title>{title || label.replace(/\n/g, ' ')}</title>
      <path d={sectorPath(a0, a1, r, R, 1.5)} />
      <text x={cx} y={cy - (lines.length - 1) * 5.5} textAnchor="middle" dominantBaseline="central" transform={`rotate(${rot} ${cx} ${cy})`}>
        {lines.map((t, k) => <tspan key={k} x={cx} dy={k ? 11 : 0}>{t}</tspan>)}
      </text>
    </g>
  );
}

function sectorPath(a0, a1, r, R, gapDeg = 3) {
  const p = (a, rad) => [rad * Math.cos((a * Math.PI) / 180), rad * Math.sin((a * Math.PI) / 180)];
  const [b0, b1] = [a0 + gapDeg, a1 - gapDeg]; // degrees between sectors
  const [x0, y0] = p(b0, R), [x1, y1] = p(b1, R), [x2, y2] = p(b1, r), [x3, y3] = p(b0, r);
  return `M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 0 0 ${x3},${y3} Z`;
}

export default function RadialAddMenu({
  anchor, node, pedigreeData, onAddSibling, onAddChild, onAddSpouse, onAddParents, onAddTwin,
  onUpdate, onSetProband, onClearProband, onSetConsultand, onClearConsultand, onAddFinding, onSetFindingStatus, onSetFindingStyle, onSetFindingOnset,
  onNeedRoom, ref,
}) {
  const [active, setActive] = useState(null);   // sector under the pointer
  const [panel, setPanel] = useState(null);     // satellite panel (stays open)
  const closeTimer = useRef(null);
  const panelTimer = useRef(null);
  const popRef = useRef(null);
  // a popup must stay inside the drawing area (never under the side panels):
  // shift it back by however much it sticks out
  const [nudge, setNudge] = useState({ x: 0, y: 0 });
  // several people in one symbol: the number typed before a shape is picked (clinician decisions 2026-11-01)
  const [groupCount, setGroupCount] = useState('3');
  // the clinician's ring (ringPrefs.js) and whether its hidden choices are shown for now
  const ring = useRingPrefs((st) => st.ring);
  // (for this person only: another person's ring starts without them)
  const [moreFor, setMoreFor] = useState(null);
  // which partner a child is from / what a new sibling is, for this person only
  const [choiceFor, setChoiceFor] = useState(null);
  // (read before the "no person" guard below: the person may be gone mid-render)
  const showMore = !!node && moreFor === node.id;
  const setShowMore = () => node && setMoreFor((v) => (v === node.id ? null : node.id));
  useLayoutEffect(() => {
    const el = popRef.current;
    if (!el) { setNudge({ x: 0, y: 0 }); return; }
    el.style.translate = '0px 0px';
    const r = el.getBoundingClientRect(), host = el.closest('.canvas-stage') || document.body;
    const h = host.getBoundingClientRect();
    const m = 8;
    const dx = r.left < h.left + m ? h.left + m - r.left : r.right > h.right - m ? h.right - m - r.right : 0;
    const dy = r.top < h.top + m ? h.top + m - r.top : r.bottom > h.bottom - m ? h.bottom - m - r.bottom : 0;
    el.style.translate = `${dx}px ${dy}px`;
    setNudge((old) => (old.x === dx && old.y === dy ? old : { x: dx, y: dy }));
  }, [active, panel, anchor.x, anchor.y]);
  // keyboard (App): a letter opens a sector's choices or a satellite's panel
  const kbOpen = useRef(false);
  const arcRef = useRef(null);
  useImperativeHandle(ref, () => ({
    open: (key) => {
      clearTimeout(closeTimer.current);
      clearTimeout(panelTimer.current);
      kbOpen.current = true;
      if (SECTORS[key]) { setPanel(null); setActive(key); } else { setActive(null); setPanel(key); }
    },
    // back to the bare ring; false when nothing was open
    back: () => {
      if (!active && !panel) return false;
      clearTimeout(closeTimer.current);
      clearTimeout(panelTimer.current);
      setActive(null);
      setPanel(null);
      return true;
    },
  }), [active, panel]);
  // the rainbow bands around the person must fit on screen: if they stick
  // out, the drawing slides by that much (a narrow tablet screen)
  useLayoutEffect(() => {
    const el = arcRef.current;
    if (!el || !onNeedRoom) return;
    const r = el.getBoundingClientRect(), host = el.closest('.canvas-stage');
    if (!host) return;
    const h = host.getBoundingClientRect(), m = 8;
    const dx = r.left < h.left + m ? h.left + m - r.left : r.right > h.right - m ? h.right - m - r.right : 0;
    const dy = r.top < h.top + m ? h.top + m - r.top : r.bottom > h.bottom - m ? h.bottom - m - r.bottom : 0;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) onNeedRoom(dx, dy);
  }, [panel, anchor.x, anchor.y, onNeedRoom]);
  // opened from the keyboard: its first control takes the focus (Tab moves on, Enter picks)
  useEffect(() => {
    if (!kbOpen.current) return;
    const root = popRef.current || arcRef.current;
    const first = root && root.querySelector('button:not(:disabled), [tabindex="0"], input, textarea');
    if (first) { first.focus(); kbOpen.current = false; }
  }, [active, panel]);
  if (!node || node.placeholder) return null;
  const isLoss = isPregnancy(node);
  // a symbol for several people takes parents, siblings and a note only (clinician decisions 2026-11-01)
  const group = isGroup(node);
  const GROUP_HINT = 'Bu sembol birden çok kişiyi gösteriyor; eş, çocuk ya da bulgu için önce sağdaki panelden “Tek tek ayır”.';

  const pcrs = pedigreeData.parentChildRelationships || [];
  const unions = (pedigreeData.unions || []).filter(u => u.partners.includes(node.id));
  const hasParents = pcrs.some(r => r.children.includes(node.id));
  const sexKnown = node.sex === 'male' || node.sex === 'female';
  // Codex audit 2026-11-01: with several partners the clinician names the
  // child's other parent (never the most recent one silently); for an
  // adopted-in person the clinician says what the new sibling is
  const ids = computePedigreeIds(pedigreeData.nodes || []);
  const nameOf = (id) => { const p = (pedigreeData.individuals || []).find(i => i.id === id); return [ids.get(id)?.displayId, p?.displayLabel].filter(Boolean).join(' ') || 'eşi'; };
  const pickedUnion = choiceFor && choiceFor.node === node.id ? unions.find(u => u.id === choiceFor.union) : null;
  const childUnion = unions.length === 1 ? unions[0] : pickedUnion || null;
  const childReady = unions.length <= 1 || !!childUnion;
  const addChildHere = (sex, extra) => (childUnion ? onAddChild(childUnion.id, sex, null, extra) : onAddChild(null, sex, node.id, extra));
  const adoption = adoptionOf(pedigreeData, node.id);
  const adoptedIn = adoption && adoption.kind === 'in';
  const sibKind = adoptedIn && choiceFor && choiceFor.node === node.id ? choiceFor.sibling : null;
  const siblingReady = !adoptedIn || !!sibKind;
  const addSiblingHere = (sex, extra) => {
    if (!adoptedIn) return onAddSibling(node.id, sex, { ...extra, createParents: true });
    if (sibKind === 'biological') return onAddSibling(node.id, sex, { ...extra, createParents: true, biologicalSibling: true });
    return onAddChild(adoption.unionId, sex, null, sibKind === 'adopted' ? { ...extra, adopted: true } : extra);
  };
  const ready = (sector) => (sector === 'bottom' ? childReady : sector === 'left' ? siblingReady : true);
  const twinGroup = groupOf(pedigreeData, node.id);

  const disabled = {
    // a pregnancy outcome takes parents and siblings, never a partner or children (clinician 2026-10-25)
    top: hasParents ? 'Bu kişinin annesi ve babası zaten çizili.' : null,
    right: group ? GROUP_HINT : isLoss ? 'Düşüğe, ölü doğuma ya da süren gebeliğe eş eklenemez.' : sexKnown ? null : 'Eş eklemek için önce bu kişinin cinsiyetini seçin: Durum düğmesi → Erkek ya da Kadın.',
    bottom: group ? GROUP_HINT : isLoss ? 'Düşüğe, ölü doğuma ya da süren gebeliğe çocuk eklenemez.' : !unions.length && !sexKnown ? 'Çocuk eklemek için önce bu kişinin cinsiyetini seçin: Durum düğmesi → Erkek ya da Kadın.' : null,
    left: null,
  };
  // one click: parents = a mother and a father; spouse = the opposite sex
  // (clinician decision 2026-10-24) — no choices to open
  const direct = {
    top: () => onAddParents(node.id, {}),
    right: () => onAddSpouse(node.id, node.sex === 'female' ? 'male' : 'female'),
  };
  const choices = {
    left: KINDS.map(([g, t, sex, extra, row]) => [`Kardeş: ${t}`, g, () => addSiblingHere(sex, extra), row]),
    bottom: KINDS.map(([g, t, sex, extra, row]) => [`Çocuk: ${t}`, g, () => addChildHere(sex, extra), row]),
  };

  // several people in one symbol, the number inside (NSGC; clinician decisions 2026-11-01)
  const addGroup = {
    left: (sex, count) => addSiblingHere(sex, { count }),
    bottom: (sex, count) => addChildHere(sex, { count }),
  };

  const addAdopted = {
    // an adopted-in person's adopted sibling: another child of the same adoptive couple
    left: (sex) => (adoptedIn ? onAddChild(adoption.unionId, sex, null, { adopted: true }) : onAddSibling(node.id, sex, { adopted: true, createParents: true })),
    bottom: (sex) => addChildHere(sex, { adopted: true }),
  };

  // the clinician's ring (Ayarlar → Halka menü, ringPrefs.js): rows and choices in their order;
  // hidden ones wait under "Diğer…" — never lost (clinician request 2026-11-01)
  const shown = (id) => showMore || !ring.hidden.includes(id);
  const pregnancyChoices = (sector) => (choices[sector] || []).filter((c) => (c[3] || 1) === 2 && shown(c[1]));
  const rowAvailable = (sector, id) => (id === 'pregnancy' ? (choices[sector] || []).some((c) => (c[3] || 1) === 2) : !!addGroup[sector]);
  const flyoutRows = (sector) => ring.rows.filter((id) => rowAvailable(sector, id) && shown(id) && (id !== 'pregnancy' || pregnancyChoices(sector).length));
  const flyoutHasHidden = (sector) => ring.hidden.some((id) => (RING_ROWS.some((x) => x.id === id) ? rowAvailable(sector, id)
    : RING_PREGNANCY.some((x) => x.id === id) && rowAvailable(sector, 'pregnancy')));
  const rowView = !active || !choices[active] ? {} : {
    pregnancy: (
      <div className="flyout-row">
        <span className="flyout-row-label">Gebelik</span>
        {pregnancyChoices(active).map(([title, glyph, run]) => (
          <button key={title} className="quick-btn" title={title} aria-label={title} onClick={() => { run(); setActive(null); }}><Glyph kind={glyph} /></button>
        ))}
      </div>
    ),
    // adopted in (NSGC brackets, dashed line from the adoptive parents; clinician decisions 2026-11-01)
    adopted: addGroup[active] && (
      <div className="flyout-row">
        <span className="flyout-row-label">Evlat edinilmiş</span>
        {[['male', 'erkek'], ['female', 'kız'], ['unknown', 'cinsiyeti bilinmeyen']].map(([sex, word]) => {
          const title = `${active === 'left' ? 'Kardeş' : 'Çocuk'}: evlat edinilmiş ${word} (köşeli parantez, kesikli iniş çizgisi)`;
          return (
            <button key={sex} className="quick-btn" title={title} aria-label={title}
              onClick={() => { addAdopted[active](sex); setActive(null); }}><Glyph kind={`adopted-${sex}`} /></button>
          );
        })}
      </div>
    ),
    group: addGroup[active] && (
      <div className="flyout-row">
        <span className="flyout-row-label">Birden çok</span>
        <input className="flyout-count" value={groupCount} inputMode="numeric" maxLength={2} aria-label="Kişi sayısı (bilinmiyorsa n)"
          title="Kişi sayısı: 2–99; bilinmiyorsa n" onChange={(e) => setGroupCount(e.target.value)} />
        {[['male', 'erkek'], ['female', 'kız'], ['unknown', 'cinsiyeti karışık ya da bilinmeyen']].map(([sex, word]) => {
          const count = parseGroupCount(groupCount);
          const title = `${active === 'left' ? 'Kardeş' : 'Çocuk'}: ${count ?? '?'} ${word} (tek sembol, içinde sayı)`;
          return (
            <button key={sex} className="quick-btn" title={count ? title : 'Önce 2–99 arası bir sayı ya da n yazın'} aria-label={title} disabled={!count}
              onClick={() => { addGroup[active](sex, count); setActive(null); }}><Glyph kind={`group-${sex}`} label={count ?? '?'} /></button>
          );
        })}
      </div>
    ),
  };

  const r = Math.max(24, anchor.size / 2 + 8);
  const R = r + 34;
  const box = R + 2;
  // satellite distance from the centre (bigger buttons on a touch screen)
  const coarse = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const sat = R + (coarse ? 27 : 20);
  const open = (k) => { clearTimeout(closeTimer.current); clearTimeout(panelTimer.current); setActive(direct[k] && !disabled[k] ? null : k); if (!direct[k]) setPanel(null); };
  // satellites open on hover (clinician request 2026-10-25); a panel stays
  // while the pointer is on it or a field inside it has the focus
  const openPanel = (key) => { clearTimeout(panelTimer.current); clearTimeout(closeTimer.current); setActive(null); setPanel(key); };
  const keepPanel = () => clearTimeout(panelTimer.current);
  const leavePanel = () => {
    clearTimeout(panelTimer.current);
    panelTimer.current = setTimeout(() => {
      const el = popRef.current;
      if (el && el.contains(document.activeElement)) return;
      setPanel(null);
    }, 300);
  };
  const leave = () => { clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setActive(null), 200); };
  const pressSector = (k) => {
    if (direct[k]) { if (!disabled[k]) direct[k](); else open(k); return; }
    if (active === k) setActive(null); else open(k);
  };
  const flyoutStyle = (k) => ({
    top: { left: 0, top: -R - 10, transform: 'translate(-50%, -100%)' },
    bottom: { left: 0, top: R + 10, transform: 'translate(-50%, 0)' },
    left: { left: -R - 10, top: 0, transform: 'translate(-100%, -50%)' },
    right: { left: R + 10, top: 0, transform: 'translate(0, -50%)' },
  }[k]);
  const satPos = (angle) => [sat * Math.cos((angle * Math.PI) / 180), sat * Math.sin((angle * Math.PI) / 180)];
  const PANEL_W = 340; // .radial-panel width in ui.css
  const panelStyle = (s) => {
    const [x, y] = satPos(s.angle);
    // open towards the side with room in the drawing area
    const roomRight = (anchor.boxW ?? Infinity) - (anchor.x + x + 22);
    const roomLeft = anchor.x + x - 22;
    const right = x > 0 ? roomRight >= PANEL_W || roomRight >= roomLeft : roomLeft < PANEL_W && roomRight > roomLeft;
    return right
      ? { left: x + 22, top: y, transform: 'translate(0, -50%)' }
      : { left: x - 22, top: y, transform: 'translate(-100%, -50%)' };
  };

  // rainbow bands around the ring for short choices (clinician request 2026-10-25)
  const T = R - r; // one thickness for the ring and every band
  const B1 = [R + 40, R + 40 + T], B2 = [R + 44 + T, R + 44 + 2 * T];
  const band = (centre, items, [r1, r2], per) => {
    const start = centre - (items.length * per) / 2;
    let base = centre + 90, norm = base;
    while (norm > 90) norm -= 180;
    while (norm <= -90) norm += 180;
    const flip = norm - base;
    return items.map((it, k) => <ArcButton key={it.label} a0={start + k * per} a1={start + (k + 1) * per} r={r1} R={r2} flip={flip} {...it} />);
  };
  const arcs = {
    status: () => {
      const inner = isLoss ? [] : [['male', 'Erkek'], ['female', 'Kadın'], ['unknown', 'Bilinmiyor']].map(([v, t]) => ({
        label: t, on: (node.sex || 'unknown') === v, onClick: () => onUpdate(node.id, { sex: v }),
      }));
      const byId = {
        affected: { label: 'Etkilenmiş', on: !!node.affected, onClick: () => onUpdate(node.id, { affected: !node.affected }), title: 'Kişi hasta (etkilenmiş): sembolün içi tamamen dolar. Hastalığın adını yazmak için Bulgu düğmesini kullanın.' },
        carrier: { label: 'Taşıyıcı', on: !!node.carrier, onClick: () => onUpdate(node.id, { carrier: !node.carrier }), title: 'Kişi hasta değil ama hastalığa yol açan geni taşıyor' },
        deceased: isLoss ? null : { label: 'Vefat', on: !!node.deceased, onClick: () => onUpdate(node.id, { deceased: !node.deceased }), title: 'Kişi hayatta değil: sembolün üzerine çapraz çizgi çekilir' },
        proband: { label: 'Proband', on: !!node.proband, onClick: () => (node.proband ? onClearProband() : onSetProband(node.id)), title: 'Ailede incelemeye yol açan ilk etkilenmiş kişi: yanında ok ve P harfi çizilir' },
        // the consultand (clinician decisions 2026-11-01): an arrow without "P"
        consultand: isLoss || !onSetConsultand ? null : { label: 'Danışan', on: !!node.consultand, onClick: () => (node.consultand ? onClearConsultand() : onSetConsultand(node.id)), title: 'Danışmanlık için başvuran kişi: yanında yalnız ok çizilir (P yok). Ailede bir danışan olur; proband ile aynı kişi olabilir.' },
      };
      // the clinician's order; hidden choices under "Diğer…" (Ayarlar → Halka menü)
      const available = ring.status.filter((id) => byId[id]);
      const hiddenHere = available.filter((id) => ring.hidden.includes(id));
      const outer = [
        ...available.filter((id) => showMore || !hiddenHere.includes(id)).map((id) => byId[id]),
        ...(hiddenHere.length ? [{ label: showMore ? 'Daha az' : 'Diğer…', on: false, onClick: () => setShowMore(), title: showMore ? 'Gizlediğiniz seçenekleri yeniden gizle' : 'Halka menüden gizlediğiniz seçenekler (Ayarlar → Halka menü)' }] : []),
      ];
      return [...band(-135, inner, B1, 40), ...band(-135, outer, B2, 33)];
    },
    twins: () => band(135, [['monozygotic', 'Tek\nyumurta'], ['dizygotic', 'Çift\nyumurta'], ['unknown', 'Bilinmiyor']].map(([z, t]) => ({
      label: t, title: `${twinGroup ? `${multipleName(twinGroup.group.children.length + 1)} yap` : 'İkizini ekle'}: ${t.replace(/\n/g, ' ')}`,
      on: twinGroup?.group.zygosity === z,
      onClick: () => { onAddTwin(node.id, { sex: node.sex, zygosity: z }); setPanel(null); },
    })), B1, 42),
  };
  const twinsUsable = hasParents && !isLoss && !!onAddTwin;
  const arcPanel = panel === 'status' || (panel === 'twins' && twinsUsable);
  const outerBox = B2[1] + 4;

  const panels = {
    findings: (
      <FindingsPalette node={node} conditionKey={pedigreeData.conditionKey || []} compact
        onSetStatus={onSetFindingStatus} onAdd={onAddFinding} onSetStyle={onSetFindingStyle} onSetOnset={onSetFindingOnset} />
    ),
    twins: !hasParents || isLoss || !onAddTwin ? (
      <span className="radial-hint">{isLoss ? 'Düşük, ölü doğum ya da süren gebelik kaydına buradan ikiz eklenemez.' : 'İkiz eklemek için önce bu kişinin anne ve babasını ekleyin (yukarıdaki Ebeveyn düğmesi).'}</span>
    ) : (
      <div className="radial-panel-col">
        <span className="radial-hint">{twinGroup ? `${multipleName(twinGroup.group.children.length + 1)} yap: aynı gruba bir kardeş daha ekleyin. Türü:` : 'Bu kişiye bir ikiz kardeş ekleyin. İkizlik türü:'}</span>
        <div className="btn-row">
          {[['monozygotic', 'Tek yumurta'], ['dizygotic', 'Çift yumurta'], ['unknown', 'Bilinmiyor']].map(([z, t]) => (
            <button key={z} className="ui-btn ui-btn-sm" onClick={() => onAddTwin(node.id, { sex: node.sex, zygosity: z })}>{t}</button>
          ))}
        </div>
      </div>
    ),
    note: (
      <DraftField key={`${node.id}-note`} as="textarea" className="input radial-note" value={node.notes || ''} placeholder="Bu kişiyle ilgili notunuz. Not, pedigrinin altındaki “Notlar” bölümünde çıkar. Alt satır için Shift+Enter."
        onCommit={v => onUpdate(node.id, { notes: v })} autoFocus />
    ),
  };

  return (
    <div className="radial-menu" style={{ left: anchor.x, top: anchor.y }} onClick={e => e.stopPropagation()}>
      <svg className="radial-ring" width={2 * box} height={2 * box} viewBox={`${-box} ${-box} ${2 * box} ${2 * box}`}
        style={{ left: -box, top: -box }}>
        {Object.entries(SECTORS).map(([k, { a0, a1, label }]) => {
          const mid = ((a0 + a1) / 2) * Math.PI / 180;
          const tr = (r + R) / 2;
          return (
            <g key={k} className={`radial-sector${active === k ? ' on' : ''}${disabled[k] ? ' off' : ''}`}
              onPointerEnter={(e) => isHover(e) && open(k)} onPointerLeave={(e) => isHover(e) && leave()}
              onClick={() => pressSector(k)} onKeyDown={(e) => pressKey(e, () => pressSector(k))} tabIndex={0}
              role="button" aria-label={label} aria-disabled={!!disabled[k]}>
              <title>{disabled[k] || (k === 'top' ? 'Anne ve baba ekle' : k === 'right' ? (unions.length ? 'Başka bir eş ekle' : 'Eş ekle') : label)}</title>
              <path d={sectorPath(a0, a1, r, R)} />
              <text x={tr * Math.cos(mid)} y={tr * Math.sin(mid)} textAnchor="middle" dominantBaseline="central">{label}</text>
            </g>
          );
        })}
      </svg>
      {SATELLITES.filter((s) => !group || s.key === 'note').map((s) => {
        const [x, y] = satPos(s.angle);
        const { Icon } = s;
        return (
          <button key={s.key} className={`radial-sat${panel === s.key ? ' on' : ''}`} style={{ left: x, top: y }}
            title={s.label} aria-label={s.label} aria-expanded={panel === s.key}
            onPointerEnter={(e) => isHover(e) && openPanel(s.key)} onPointerLeave={(e) => isHover(e) && leavePanel()}
            onClick={() => { setActive(null); setPanel(panel === s.key ? null : s.key); }}>
            <Icon size={15} />
          </button>
        );
      })}
      {/* a sector with neither choices nor a reason (it became a one-click
          action, e.g. after "Tek tek ayır") shows nothing */}
      {active && (choices[active] || disabled[active]) && (
        <div className="radial-flyout" ref={popRef} style={{ ...flyoutStyle(active), translate: `${nudge.x}px ${nudge.y}px` }} onPointerEnter={(e) => isHover(e) && open(active)} onPointerLeave={(e) => isHover(e) && leave()}>
          {disabled[active] ? (
            <span className="radial-hint">{disabled[active]}</span>
          ) : (
            <>
              {active === 'bottom' && unions.length > 1 && (
                <div className="flyout-row flyout-choose" role="radiogroup" aria-label="Çocuk hangi eşten?">
                  <span className="flyout-row-label">Hangi eşten?</span>
                  {unions.map((u) => {
                    const other = u.partners.find((p) => p !== node.id);
                    const on = childUnion && childUnion.id === u.id;
                    return <button key={u.id} role="radio" aria-checked={!!on} className={`quick-text${on ? ' on' : ''}`}
                      onClick={() => setChoiceFor({ node: node.id, union: u.id })}>{nameOf(other)} ile</button>;
                  })}
                </div>
              )}
              {active === 'left' && adoptedIn && (
                <div className="flyout-row flyout-choose" role="radiogroup" aria-label="Yeni kardeş ne?">
                  <span className="flyout-row-label">Yeni kardeş</span>
                  {[['family', 'Ailenin öz çocuğu', 'Evlat edinen anne-babanın kendi çocuğu'], ['adopted', 'Evlat edinilmiş', 'Aynı ailenin evlat edindiği başka bir çocuk'], ['biological', 'Biyolojik kardeşi', 'Bu kişinin biyolojik kardeşi: biyolojik anne-babası (bilinmiyor) da çizilir']].map(([k, t, title]) => (
                    <button key={k} role="radio" aria-checked={sibKind === k} className={`quick-text${sibKind === k ? ' on' : ''}`} title={title}
                      onClick={() => setChoiceFor({ node: node.id, sibling: k })}>{t}</button>
                  ))}
                </div>
              )}
              {!ready(active) ? (
                <span className="radial-hint">{active === 'bottom' ? 'Önce çocuğun hangi eşten olduğunu seçin.' : 'Önce yeni kardeşin ne olduğunu seçin.'}</span>
              ) : (<>
              {/* the sexes, then the rows in the clinician's order (Ayarlar → Halka menü; ringPrefs.js) */}
              <div className="flyout-row">
                {choices[active].filter((c) => (c[3] || 1) === 1).map(([title, glyph, run]) => (
                  <button key={title} className="quick-btn" title={title} aria-label={title} onClick={() => { run(); setActive(null); }}><Glyph kind={glyph} /></button>
                ))}
              </div>
              {flyoutRows(active).map((rowId) => rowView[rowId] && <Fragment key={rowId}>{rowView[rowId]}</Fragment>)}
              {flyoutHasHidden(active) && (
                <button className="flyout-more" onClick={() => setShowMore()} aria-expanded={showMore}>
                  {showMore ? 'Daha az' : 'Diğer…'}
                </button>
              )}
              </>)}
            </>
          )}
        </div>
      )}
      {arcPanel && (
        <svg ref={arcRef} className="radial-ring radial-arcs" width={2 * outerBox} height={2 * outerBox}
          viewBox={`${-outerBox} ${-outerBox} ${2 * outerBox} ${2 * outerBox}`} style={{ left: -outerBox, top: -outerBox }}>
          <g onPointerEnter={(e) => isHover(e) && keepPanel()} onPointerLeave={(e) => isHover(e) && leavePanel()}>{arcs[panel]()}</g>
        </svg>
      )}
      {panel && !arcPanel && (
        <div className="radial-panel" ref={popRef} style={{ ...panelStyle(SATELLITES.find(s => s.key === panel)), translate: `${nudge.x}px ${nudge.y}px` }}
          onPointerEnter={(e) => isHover(e) && keepPanel()} onPointerLeave={(e) => isHover(e) && leavePanel()}>
          <div className="radial-panel-title">{SATELLITES.find(s => s.key === panel).label}</div>
          {panels[panel]}
        </div>
      )}
    </div>
  );
}
