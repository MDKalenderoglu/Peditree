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
import { useLayoutEffect, useRef, useState } from 'react';
import { Stethoscope, HeartPulse, Users, StickyNote } from 'lucide-react';
import FindingsPalette from './FindingsPalette';
import { groupOf, multipleName } from '../graph/multiples';

const S = 9; // glyph half-size

export function Glyph({ kind }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 };
  return (
    <svg width="20" height="20" viewBox="-10 -10 20 20" aria-hidden="true">
      {kind === 'male' && <rect x={-S + 1} y={-S + 1} width={2 * S - 2} height={2 * S - 2} {...common} />}
      {kind === 'female' && <circle r={S - 1} {...common} />}
      {kind === 'unknown' && <path d={`M0,${-S} L${S},0 L0,${S} L${-S},0 Z`} {...common} />}
      {kind === 'loss' && <path d={`M0,${-S + 3} L${S - 2},${S - 3} L${-S + 2},${S - 3} Z`} {...common} />}
      {kind === 'stillbirth' && (
        <>
          <rect x={-S + 3} y={-S + 3} width={2 * S - 6} height={2 * S - 6} {...common} />
          <path d={`M${-S + 3},${-S + 3} L${S - 3},${S - 3} M${-S + 3},${S - 3} L${S - 3},${-S + 3}`} {...common} />
        </>
      )}
    </svg>
  );
}

// [glyph, title, sex, extra]
const KINDS = [
  ['male', 'Erkek', 'male', {}],
  ['female', 'Kız', 'female', {}],
  ['unknown', 'Cinsiyeti bilinmeyen', 'unknown', {}],
  ['loss', 'Düşük', 'unknown', { pregnancyLoss: true }],
  ['stillbirth', 'Ölü doğum', 'unknown', { stillbirth: true }],
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

/** One button of a rainbow band: an annular segment with a (two-line) label. */
function ArcButton({ a0, a1, r, R, label, on, disabled, onClick, title }) {
  const mid = ((a0 + a1) / 2) * Math.PI / 180;
  const tr = (r + R) / 2;
  const lines = String(label).split('\n');
  // text runs along the band (like a rainbow), never upside down
  let rot = (a0 + a1) / 2 + 90;
  while (rot > 90) rot -= 180;
  while (rot <= -90) rot += 180;
  const cx = tr * Math.cos(mid), cy = tr * Math.sin(mid);
  return (
    <g className={`radial-arc${on ? ' on' : ''}${disabled ? ' off' : ''}`} role="button" aria-label={label.replace('\n', ' ')}
      aria-pressed={!!on} onClick={disabled ? undefined : onClick}>
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
  onUpdate, onSetProband, onClearProband, onAddFinding, onSetFindingStatus, onSetFindingStyle,
}) {
  const [active, setActive] = useState(null);   // sector under the pointer
  const [panel, setPanel] = useState(null);     // satellite panel (stays open)
  const closeTimer = useRef(null);
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
  if (!node || node.placeholder) return null;
  const isLoss = node.pregnancyLoss || node.stillbirth;

  const pcrs = pedigreeData.parentChildRelationships || [];
  const unions = (pedigreeData.unions || []).filter(u => u.partners.includes(node.id));
  const hasParents = pcrs.some(r => r.children.includes(node.id));
  const sexKnown = node.sex === 'male' || node.sex === 'female';
  // children go to the most recent partnership; the right panel has every one
  const lastUnion = unions[unions.length - 1];
  const twinGroup = groupOf(pedigreeData, node.id);

  const disabled = {
    top: isLoss ? 'Düşük / ölü doğuma ebeveyn eklenmez.' : hasParents ? 'Anne-baba zaten çizili.' : null,
    right: isLoss ? 'Düşük / ölü doğuma eş eklenmez.' : sexKnown ? null : 'Eş eklemek için önce cinsiyeti seçin (Durum).',
    bottom: isLoss ? 'Düşük / ölü doğuma çocuk eklenmez.' : !lastUnion && !sexKnown ? 'Çocuk eklemek için önce cinsiyeti seçin.' : null,
    left: isLoss ? 'Düşük / ölü doğuma kardeş buradan eklenmez.' : null,
  };
  // one click: parents = a mother and a father; spouse = the opposite sex
  // (clinician decision 2026-10-24) — no choices to open
  const direct = {
    top: () => onAddParents(node.id, {}),
    right: () => onAddSpouse(node.id, node.sex === 'female' ? 'male' : 'female'),
  };
  const choices = {
    left: KINDS.map(([g, t, sex, extra]) => [`Kardeş: ${t}`, g, () => onAddSibling(node.id, sex, { ...extra, createParents: true })]),
    bottom: KINDS.map(([g, t, sex, extra]) => [`Çocuk: ${t}`, g,
      () => (lastUnion ? onAddChild(lastUnion.id, sex, null, extra) : onAddChild(null, sex, node.id, extra))]),
  };

  const r = Math.max(24, anchor.size / 2 + 8);
  const R = r + 34;
  const box = R + 2;
  const sat = R + 20; // satellite distance from the centre
  const open = (k) => { clearTimeout(closeTimer.current); setActive(direct[k] && !disabled[k] ? null : k); if (!direct[k]) setPanel(null); };
  const leave = () => { clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setActive(null), 200); };
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
  const band = (centre, items, r1, r2, per) => {
    const start = centre - (items.length * per) / 2;
    return items.map((it, k) => <ArcButton key={it.label} a0={start + k * per} a1={start + (k + 1) * per} r={r1} R={r2} {...it} />);
  };
  const arcs = {
    status: () => {
      const inner = isLoss ? [] : [['male', 'Erkek'], ['female', 'Kadın'], ['unknown', 'Bilinmiyor']].map(([v, t]) => ({
        label: t, on: (node.sex || 'unknown') === v, onClick: () => onUpdate(node.id, { sex: v }),
      }));
      const outer = [
        { label: 'Etkilenmiş', on: !!node.affected, onClick: () => onUpdate(node.id, { affected: !node.affected }), title: 'Bulgu belirtmeden etkilenmiş (tam dolgu)' },
        { label: 'Taşıyıcı', on: !!node.carrier, onClick: () => onUpdate(node.id, { carrier: !node.carrier }) },
        ...(isLoss ? [] : [{ label: 'Vefat', on: !!node.deceased, onClick: () => onUpdate(node.id, { deceased: !node.deceased }) }]),
        { label: 'Proband', on: !!node.proband, onClick: () => (node.proband ? onClearProband() : onSetProband(node.id)) },
      ];
      return [...band(-135, inner, R + 38, R + 70, 40), ...band(-135, outer, R + 74, R + 110, 36)];
    },
    twins: () => band(135, [['monozygotic', 'Tek\nyumurta'], ['dizygotic', 'Çift\nyumurta'], ['unknown', 'Bilinmiyor']].map(([z, t]) => ({
      label: t, title: `${twinGroup ? `${multipleName(twinGroup.group.children.length + 1)} yap` : 'İkizini ekle'}: ${t.replace('\n', ' ')}`,
      on: twinGroup?.group.zygosity === z,
      onClick: () => { onAddTwin(node.id, { sex: node.sex, zygosity: z }); setPanel(null); },
    })), R + 38, R + 76, 40),
  };
  const twinsUsable = hasParents && !isLoss && !!onAddTwin;
  const arcPanel = panel === 'status' || (panel === 'twins' && twinsUsable);
  const outerBox = R + 114;

  const panels = {
    findings: (
      <FindingsPalette node={node} conditionKey={pedigreeData.conditionKey || []} compact
        onSetStatus={onSetFindingStatus} onAdd={onAddFinding} onSetStyle={onSetFindingStyle} />
    ),
    twins: !hasParents || isLoss || !onAddTwin ? (
      <span className="radial-hint">İkiz eklemek için anne ve baba çizili olmalı.</span>
    ) : (
      <div className="radial-panel-col">
        <span className="radial-hint">{twinGroup ? `${multipleName(twinGroup.group.children.length + 1)} yap — bir kardeş daha:` : 'İkizini ekle:'}</span>
        <div className="btn-row">
          {[['monozygotic', 'Tek yumurta'], ['dizygotic', 'Çift yumurta'], ['unknown', 'Bilinmiyor']].map(([z, t]) => (
            <button key={z} className="ui-btn ui-btn-sm" onClick={() => onAddTwin(node.id, { sex: node.sex, zygosity: z })}>{t}</button>
          ))}
        </div>
      </div>
    ),
    note: (
      <textarea className="input radial-note" value={node.notes || ''} placeholder="Klinik not"
        onChange={e => onUpdate(node.id, { notes: e.target.value })} autoFocus />
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
              onMouseEnter={() => open(k)} onMouseLeave={leave}
              onClick={() => {
                if (direct[k]) { if (!disabled[k]) direct[k](); else open(k); return; }
                if (active === k) setActive(null); else open(k);
              }}
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
            onClick={() => { setActive(null); setPanel(panel === s.key ? null : s.key); }}>
            <Icon size={15} />
          </button>
        );
      })}
      {active && (
        <div className="radial-flyout" ref={popRef} style={{ ...flyoutStyle(active), translate: `${nudge.x}px ${nudge.y}px` }} onMouseEnter={() => open(active)} onMouseLeave={leave}>
          {disabled[active] ? (
            <span className="radial-hint">{disabled[active]}</span>
          ) : choices[active].map(([title, glyph, run]) => (
            glyph
              ? <button key={title} className="quick-btn" title={title} aria-label={title} onClick={() => { run(); setActive(null); }}><Glyph kind={glyph} /></button>
              : <button key={title} className="quick-text" onClick={() => { run(); setActive(null); }}>{title}</button>
          ))}
        </div>
      )}
      {arcPanel && (
        <svg className="radial-ring radial-arcs" width={2 * outerBox} height={2 * outerBox}
          viewBox={`${-outerBox} ${-outerBox} ${2 * outerBox} ${2 * outerBox}`} style={{ left: -outerBox, top: -outerBox }}>
          {arcs[panel]()}
        </svg>
      )}
      {panel && !arcPanel && (
        <div className="radial-panel" ref={popRef} style={{ ...panelStyle(SATELLITES.find(s => s.key === panel)), translate: `${nudge.x}px ${nudge.y}px` }}>
          <div className="radial-panel-title">{SATELLITES.find(s => s.key === panel).label}</div>
          {panels[panel]}
        </div>
      )}
    </div>
  );
}
