/**
 * RadialAddMenu.jsx — a ring around the selected symbol (clinician request
 * 2026-10-24): top = parents, left = sibling, right = spouse, bottom = child.
 * Pointing at a sector opens its choices (symbols); a click adds the person.
 * The hole in the middle leaves the symbol itself visible and clickable.
 * The same store operations as the right panel; the store refuses (with a
 * reason) anything the graph rules do not allow.
 */
import { useRef, useState } from 'react';

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

// sector → angle range (degrees, screen: 0 = east, clockwise) and flyout side
const SECTORS = {
  top: { a0: -135, a1: -45, label: 'Ebeveyn' },
  right: { a0: -45, a1: 45, label: 'Eş' },
  bottom: { a0: 45, a1: 135, label: 'Çocuk' },
  left: { a0: 135, a1: 225, label: 'Kardeş' },
};

function sectorPath(a0, a1, r, R) {
  const p = (a, rad) => [rad * Math.cos((a * Math.PI) / 180), rad * Math.sin((a * Math.PI) / 180)];
  const gap = 2; // degrees between sectors
  const [b0, b1] = [a0 + gap, a1 - gap];
  const [x0, y0] = p(b0, R), [x1, y1] = p(b1, R), [x2, y2] = p(b1, r), [x3, y3] = p(b0, r);
  return `M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 0 0 ${x3},${y3} Z`;
}

export default function RadialAddMenu({ anchor, node, pedigreeData, onAddSibling, onAddChild, onAddSpouse, onAddParents, onAddTwin }) {
  const [active, setActive] = useState(null);
  const closeTimer = useRef(null);
  if (!node || node.placeholder || node.pregnancyLoss || node.stillbirth) return null;

  const pcrs = pedigreeData.parentChildRelationships || [];
  const unions = (pedigreeData.unions || []).filter(u => u.partners.includes(node.id));
  const hasParents = pcrs.some(r => r.children.includes(node.id));
  const sexKnown = node.sex === 'male' || node.sex === 'female';
  // children go to the most recent partnership; the right panel has every one
  const lastUnion = unions[unions.length - 1];

  const disabled = {
    top: hasParents ? 'Anne-baba zaten çizili.' : null,
    right: sexKnown ? null : 'Eş eklemek için önce cinsiyeti seçin (sağ panel).',
    bottom: !lastUnion && !sexKnown ? 'Çocuk eklemek için önce cinsiyeti seçin (sağ panel).' : null,
    left: null,
  };
  const choices = {
    top: [['Anne ve baba ekle', null, () => onAddParents(node.id, {})]],
    right: [[unions.length ? 'Başka bir eş ekle' : 'Eş ekle', node.sex === 'female' ? 'male' : 'female',
      () => onAddSpouse(node.id, node.sex === 'female' ? 'male' : 'female')]],
    left: [
      ...KINDS.map(([g, t, sex, extra]) => [`Kardeş: ${t}`, g, () => onAddSibling(node.id, sex, { ...extra, createParents: true })]),
      // a twin (zygosity set in the right panel); needs the parents drawn
      ...(hasParents && onAddTwin ? [['İkiz', null, () => onAddTwin(node.id, { sex: node.sex })]] : []),
    ],
    bottom: KINDS.map(([g, t, sex, extra]) => [`Çocuk: ${t}`, g,
      () => (lastUnion ? onAddChild(lastUnion.id, sex, null, extra) : onAddChild(null, sex, node.id, extra))]),
  };

  const r = Math.max(26, anchor.size / 2 + 8);
  const R = r + 40;
  const box = R + 2;
  const open = (k) => { clearTimeout(closeTimer.current); setActive(k); };
  const leave = () => { clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setActive(null), 180); };
  const flyoutStyle = (k) => ({
    top: { left: 0, top: -R - 8, transform: 'translate(-50%, -100%)' },
    bottom: { left: 0, top: R + 8, transform: 'translate(-50%, 0)' },
    left: { left: -R - 8, top: 0, transform: 'translate(-100%, -50%)' },
    right: { left: R + 8, top: 0, transform: 'translate(0, -50%)' },
  }[k]);

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
              onClick={() => (active === k ? setActive(null) : open(k))}
              role="button" aria-label={label} aria-disabled={!!disabled[k]}>
              <title>{disabled[k] || label}</title>
              <path d={sectorPath(a0, a1, r, R)} />
              <text x={tr * Math.cos(mid)} y={tr * Math.sin(mid)} textAnchor="middle" dominantBaseline="central">{label}</text>
            </g>
          );
        })}
      </svg>
      {active && (
        <div className="radial-flyout" style={flyoutStyle(active)} onMouseEnter={() => open(active)} onMouseLeave={leave}>
          {disabled[active] ? (
            <span className="radial-hint">{disabled[active]}</span>
          ) : choices[active].map(([title, glyph, run]) => (
            glyph
              ? <button key={title} className="quick-btn" title={title} aria-label={title} onClick={() => { run(); setActive(null); }}><Glyph kind={glyph} /></button>
              : <button key={title} className="quick-text" onClick={() => { run(); setActive(null); }}>{title}</button>
          ))}
        </div>
      )}
    </div>
  );
}
