/**
 * QuickAddBar.jsx — one-click relatives under the selected symbol (like the
 * node widgets of CanRisk/pedigreejs): siblings and children by symbol,
 * a spouse, parents. The same store operations as the right panel; the
 * store refuses (with a reason) anything the graph rules do not allow.
 */
const S = 9; // icon half-size

function Glyph({ kind }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 };
  return (
    <svg width="18" height="18" viewBox="-10 -10 20 20" aria-hidden="true">
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

function Group({ label, onAdd, disabledReason }) {
  return (
    <div className="quick-group" title={disabledReason || undefined}>
      <span className="quick-label">{label}</span>
      {KINDS.map(([glyph, title, sex, extra]) => (
        <button key={glyph} className="quick-btn" disabled={!!disabledReason}
          title={`${label}: ${title}`} aria-label={`${label}: ${title}`} onClick={() => onAdd(sex, extra)}>
          <Glyph kind={glyph} />
        </button>
      ))}
    </div>
  );
}

export default function QuickAddBar({ node, pedigreeData, onAddSibling, onAddChild, onAddSpouse, onAddParents }) {
  if (!node || node.placeholder) return null;
  if (node.pregnancyLoss || node.stillbirth) return null;
  const pcrs = pedigreeData.parentChildRelationships || [];
  const unions = (pedigreeData.unions || []).filter(u => u.partners.includes(node.id));
  const hasParents = pcrs.some(r => r.children.includes(node.id));
  const sexKnown = node.sex === 'male' || node.sex === 'female';
  // children go to the most recent partnership; the right panel has every one
  const lastUnion = unions[unions.length - 1];
  const childReason = !lastUnion && !sexKnown ? 'Çocuk eklemek için önce cinsiyeti seçin (sağ panel).' : null;
  return (
    <>
      <Group label="Kardeş" onAdd={(sex, extra) => onAddSibling(node.id, sex, { ...extra, createParents: true })} />
      <span className="quick-sep" />
      <Group label="Çocuk" disabledReason={childReason}
        onAdd={(sex, extra) => (lastUnion ? onAddChild(lastUnion.id, sex, null, extra) : onAddChild(null, sex, node.id, extra))} />
      <span className="quick-sep" />
      <button className="quick-text" disabled={!sexKnown} title={sexKnown ? 'Eş ekle' : 'Eş eklemek için önce cinsiyeti seçin (sağ panel).'}
        onClick={() => onAddSpouse(node.id, node.sex === 'female' ? 'male' : 'female')}>{unions.length ? '+ Eş' : 'Eş'}</button>
      {!hasParents && (
        <button className="quick-text" onClick={() => onAddParents(node.id, {})} title="Anne ve baba ekle">Anne-baba</button>
      )}
    </>
  );
}
