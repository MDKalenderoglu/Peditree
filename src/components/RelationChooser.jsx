/**
 * RelationChooser.jsx — "Yeni" → a family whose parents are related by
 * blood (clinician decision 2026-11-01): how many generations above each
 * parent the two siblings stand, which relative on each side, the name and
 * F of the relationship, and the family drawn small by the layout engine —
 * the drawing that opens.
 */
import { useMemo, useState } from 'react';
import { starterDocument } from '../state/usePedigreeStore';
import { computeTidyLayout } from '../layout/pcl/tidy';
import {
  buildTemplate, canPair, DOUBLE_FIRST_COUSINS, GENERATIONS_UP, pathsOf, relationInfo, relationSpec, relativeName, siblingIds,
} from '../graph/templates';

const SIDES = [['father', 'Babanın'], ['mother', 'Annenin']];
const UP_LABEL = { 1: 'anne-babası', 2: 'büyükanne-büyükbabası', 3: 'bir üst kuşak' };
const DOUBLE_INFO = { name: 'Çift 1. derece kuzen', F: 1 / 8 };
const fraction = (F) => `1/${Math.round(1 / F)}`;

export default function RelationChooser({ onStart }) {
  const [kind, setKind] = useState('cousins');
  const [up, setUp] = useState({ father: 1, mother: 1 });
  // the father's line on both sides to start with: amca çocukları, the most frequent
  const [paths, setPaths] = useState({ father: ['male'], mother: ['male'] });
  const [doubleId, setDoubleId] = useState(DOUBLE_FIRST_COUSINS[0].id);

  const chooseUp = (side, n) => {
    setUp((u) => ({ ...u, [side]: n }));
    setPaths((p) => ({ ...p, [side]: Array(n).fill('male') }));
  };
  const double = DOUBLE_FIRST_COUSINS.find((d) => d.id === doubleId);
  const spec = kind === 'double' ? double.spec : relationSpec(paths);
  const info = kind === 'double' ? { ...DOUBLE_INFO, sentence: double.sub } : relationInfo(up, paths);

  return (
    <div className="relation-chooser">
      <div className="segmented" role="tablist" aria-label="Akrabalık türü">
        <button role="tab" aria-selected={kind === 'cousins'} className={kind === 'cousins' ? 'on' : undefined} onClick={() => setKind('cousins')}>Kuzen evliliği</button>
        <button role="tab" aria-selected={kind === 'double'} className={kind === 'double' ? 'on' : undefined} onClick={() => setKind('double')}>Çift 1. derece kuzen</button>
      </div>

      {kind === 'cousins' && SIDES.map(([side, Whose]) => (
        <div key={`${side}-up`} className="relation-row">
          <div className="relation-q">{Whose} kardeş olan büyüğü kaç kuşak yukarıda?</div>
          <div className="segmented" role="radiogroup" aria-label={`${Whose} kardeş olan büyüğü kaç kuşak yukarıda`}>
            {GENERATIONS_UP.map((n) => {
              const ok = canPair({ ...up, [side]: n });
              return (
                <button key={n} role="radio" aria-checked={up[side] === n} className={up[side] === n ? 'on' : undefined} disabled={!ok}
                  title={ok ? undefined : 'Anne ile baba en çok bir kuşak farklı olabilir'} onClick={() => chooseUp(side, n)}>
                  {n} <small>{UP_LABEL[n]}</small>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {kind === 'cousins' && SIDES.map(([side, Whose]) => (
        <div key={`${side}-who`} className="relation-row">
          <div className="relation-q">{Whose} hangi büyüğü?</div>
          <div className="relation-choices" role="radiogroup" aria-label={`${Whose} hangi büyüğü`}>
            {pathsOf(up[side]).map((path) => {
              const { main, way } = relativeName(path);
              const on = path.join() === paths[side].join();
              return (
                <button key={path.join()} role="radio" aria-checked={on} className={`relation-choice${on ? ' on' : ''}`}
                  onClick={() => setPaths((p) => ({ ...p, [side]: path }))}>
                  {main}{way && <small>{way}</small>}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {kind === 'double' && (
        <div className="relation-choices relation-choices-wide" role="radiogroup" aria-label="Çift 1. derece kuzen">
          {DOUBLE_FIRST_COUSINS.map((d) => (
            <button key={d.id} role="radio" aria-checked={doubleId === d.id} className={`relation-choice${doubleId === d.id ? ' on' : ''}`} onClick={() => setDoubleId(d.id)}>
              {d.label}<small>{d.sub}</small>
            </button>
          ))}
        </div>
      )}

      <div className="relation-result">
        <b>{info.name}</b>
        {kind === 'cousins' && <span>{info.sentence}</span>}
        <span>Çocuklarında akrabalık katsayısı F = {fraction(info.F)}</span>
      </div>
      <FamilyPreview spec={spec} />
      <button className="ui-btn ui-btn-primary" onClick={() => onStart(spec)}>Bu aileyle başla</button>
    </div>
  );
}

const S = 44; // symbol size in the preview (drawing units; people stand about 100 apart)

/** The family as it will open, drawn small; the two siblings marked. */
function FamilyPreview({ spec }) {
  const key = JSON.stringify(spec);
  const drawn = useMemo(() => {
    const r = buildTemplate(starterDocument(), JSON.parse(key));
    if (!r.ok) return null;
    const t = computeTidyLayout(r.doc.graph);
    return { nodes: t.nodes, edges: t.edges, marked: new Set(siblingIds(r.doc, JSON.parse(key))) };
  }, [key]);
  if (!drawn) return null;
  const xs = drawn.nodes.map((n) => n.x), ys = drawn.nodes.map((n) => n.y);
  const pad = S;
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  const w = Math.max(...xs) - x0 + pad, h = Math.max(...ys) - y0 + pad + 10;
  return (
    <svg className="relation-preview" viewBox={`${x0} ${y0} ${w} ${h}`} role="img" aria-label="Açılacak ailenin küçük çizimi; kardeş olan iki büyük renkli">
      {drawn.edges.map((e, i) => {
        const dbl = e.type === 'consanguineousUnion' || e.type === 'consanguineousUnionUnresolved';
        const [dx, dy] = e.x1 === e.x2 ? [3, 0] : [0, 3];
        return dbl
          ? <g key={i}><line x1={e.x1 - dx} y1={e.y1 - dy} x2={e.x2 - dx} y2={e.y2 - dy} /><line x1={e.x1 + dx} y1={e.y1 + dy} x2={e.x2 + dx} y2={e.y2 + dy} /></g>
          : <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />;
      })}
      {drawn.nodes.map((n) => {
        const cls = drawn.marked.has(n.id) ? 'marked' : n.proband ? 'proband' : undefined;
        return n.sex === 'female'
          ? <circle key={n.id} className={cls} cx={n.x} cy={n.y} r={S / 2} />
          : n.sex === 'male'
            ? <rect key={n.id} className={cls} x={n.x - S / 2} y={n.y - S / 2} width={S} height={S} />
            : <rect key={n.id} className={cls} x={n.x - S / 2.8} y={n.y - S / 2.8} width={S / 1.4} height={S / 1.4} transform={`rotate(45 ${n.x} ${n.y})`} />;
      })}
    </svg>
  );
}
