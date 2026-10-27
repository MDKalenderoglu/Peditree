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
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Stethoscope, HeartPulse, Users, StickyNote } from 'lucide-react';
import FindingsPalette from './FindingsPalette';
import DraftField from './DraftField';
import { groupOf, multipleName } from '../graph/multiples';
import { isPregnancy } from '../graph/model';

const S = 9; // glyph half-size

export function Glyph({ kind }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 };
  return (
    <svg width="20" height="20" viewBox="-10 -10 20 20" aria-hidden="true">
      {kind === 'male' && <rect x={-S + 1} y={-S + 1} width={2 * S - 2} height={2 * S - 2} {...common} />}
      {kind === 'female' && <circle r={S - 1} {...common} />}
      {kind === 'unknown' && <path d={`M0,${-S} L${S},0 L0,${S} L${-S},0 Z`} {...common} />}
      {(kind === 'loss' || kind === 'termination' || kind === 'ectopic') && <path d={`M0,${-S + 3} L${S - 2},${S - 3} L${-S + 2},${S - 3} Z`} {...common} />}
      {kind === 'termination' && <path d={`M${-S + 1},${S - 1} L${S - 1},${-S + 1}`} {...common} />}
      {kind === 'ectopic' && <text x="0" y={S + 1} fontSize="5.5" textAnchor="middle" fill="currentColor" stroke="none">ECT</text>}
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
    <g className={`radial-arc${on ? ' on' : ''}${disabled ? ' off' : ''}`} role="button" aria-label={label.replace('\n', ' ')}
      aria-pressed={!!on} tabIndex={disabled ? -1 : 0} onClick={disabled ? undefined : onClick}
      onKeyDown={disabled ? undefined : (e) => pressKey(e, onClick)}>
      <title>{title || label.replace('\n', ' ')}</title>
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
  onUpdate, onSetProband, onClearProband, onAddFinding, onSetFindingStatus, onSetFindingStyle, onSetFindingOnset,
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

  const pcrs = pedigreeData.parentChildRelationships || [];
  const unions = (pedigreeData.unions || []).filter(u => u.partners.includes(node.id));
  const hasParents = pcrs.some(r => r.children.includes(node.id));
  const sexKnown = node.sex === 'male' || node.sex === 'female';
  // children go to the most recent partnership; the right panel has every one
  const lastUnion = unions[unions.length - 1];
  const twinGroup = groupOf(pedigreeData, node.id);

  const disabled = {
    // a pregnancy outcome takes parents and siblings, never a partner or children (clinician 2026-10-25)
    top: hasParents ? 'Bu kişinin annesi ve babası zaten çizili.' : null,
    right: isLoss ? 'Düşüğe, ölü doğuma ya da süren gebeliğe eş eklenemez.' : sexKnown ? null : 'Eş eklemek için önce bu kişinin cinsiyetini seçin: Durum düğmesi → Erkek ya da Kadın.',
    bottom: isLoss ? 'Düşüğe, ölü doğuma ya da süren gebeliğe çocuk eklenemez.' : !lastUnion && !sexKnown ? 'Çocuk eklemek için önce bu kişinin cinsiyetini seçin: Durum düğmesi → Erkek ya da Kadın.' : null,
    left: null,
  };
  // one click: parents = a mother and a father; spouse = the opposite sex
  // (clinician decision 2026-10-24) — no choices to open
  const direct = {
    top: () => onAddParents(node.id, {}),
    right: () => onAddSpouse(node.id, node.sex === 'female' ? 'male' : 'female'),
  };
  const choices = {
    left: KINDS.map(([g, t, sex, extra, row]) => [`Kardeş: ${t}`, g, () => onAddSibling(node.id, sex, { ...extra, createParents: true }), row]),
    bottom: KINDS.map(([g, t, sex, extra, row]) => [`Çocuk: ${t}`, g,
      () => (lastUnion ? onAddChild(lastUnion.id, sex, null, extra) : onAddChild(null, sex, node.id, extra)), row]),
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
  const PANEL_W = 300;
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
      const outer = [
        { label: 'Etkilenmiş', on: !!node.affected, onClick: () => onUpdate(node.id, { affected: !node.affected }), title: 'Kişi hasta (etkilenmiş): sembolün içi tamamen dolar. Hastalığın adını yazmak için Bulgu düğmesini kullanın.' },
        { label: 'Taşıyıcı', on: !!node.carrier, onClick: () => onUpdate(node.id, { carrier: !node.carrier }), title: 'Kişi hasta değil ama hastalığa yol açan geni taşıyor' },
        ...(isLoss ? [] : [{ label: 'Vefat', on: !!node.deceased, onClick: () => onUpdate(node.id, { deceased: !node.deceased }), title: 'Kişi hayatta değil: sembolün üzerine çapraz çizgi çekilir' }]),
        { label: 'Proband', on: !!node.proband, onClick: () => (node.proband ? onClearProband() : onSetProband(node.id)), title: 'Ailede incelemeye yol açan ilk kişi: yanında ok ve P harfi çizilir' },
      ];
      return [...band(-135, inner, B1, 40), ...band(-135, outer, B2, 33)];
    },
    twins: () => band(135, [['monozygotic', 'Tek\nyumurta'], ['dizygotic', 'Çift\nyumurta'], ['unknown', 'Bilinmiyor']].map(([z, t]) => ({
      label: t, title: `${twinGroup ? `${multipleName(twinGroup.group.children.length + 1)} yap` : 'İkizini ekle'}: ${t.replace('\n', ' ')}`,
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
      {SATELLITES.map((s) => {
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
      {active && (
        <div className="radial-flyout" ref={popRef} style={{ ...flyoutStyle(active), translate: `${nudge.x}px ${nudge.y}px` }} onPointerEnter={(e) => isHover(e) && open(active)} onPointerLeave={(e) => isHover(e) && leave()}>
          {disabled[active] ? (
            <span className="radial-hint">{disabled[active]}</span>
          ) : [1, 2].map((row) => (
            <div key={row} className="flyout-row">
              {row === 2 && <span className="flyout-row-label">Gebelik</span>}
              {choices[active].filter((c) => (c[3] || 1) === row).map(([title, glyph, run]) => (
                glyph
                  ? <button key={title} className="quick-btn" title={title} aria-label={title} onClick={() => { run(); setActive(null); }}><Glyph kind={glyph} /></button>
                  : <button key={title} className="quick-text" onClick={() => { run(); setActive(null); }}>{title}</button>
              ))}
            </div>
          ))}
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
