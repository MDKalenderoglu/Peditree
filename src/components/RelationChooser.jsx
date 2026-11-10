/**
 * RelationChooser.jsx — "Yeni" → a family whose parents are related by
 * blood, in a window of its own (clinician decisions 2026-11-01): the
 * relationship by its name, the side by the clinic's words ("amca
 * çocukları", "babanın halasının kızı"), and the family drawn by the layout
 * engine — the drawing that opens. Double first cousins: "berdel" or two
 * pairs of siblings.
 */
import { useMemo, useState } from 'react';
import { t, tk, currentLang } from '../i18n';
import { X } from 'lucide-react';
import { starterDocument } from '../state/usePedigreeStore';
import { computeTidyLayout } from '../layout/pcl/tidy';
import { buildTemplate, DOUBLE_FIRST_COUSINS, pathsOf, relationInfo, relationSpec, relativeName, siblingIds } from '../graph/templates';

// the relationships in the order of the list; the farther ones fold away
const RELATIONS = [
  { id: 'c1', name: tk('1. derece kuzen'), up: { father: 1, mother: 1 } },
  { id: 'c2', name: tk('2. derece kuzen'), up: { father: 2, mother: 2 } },
  { id: 'c3', name: tk('3. derece kuzen'), up: { father: 3, mother: 3 } },
  { id: 'r1m', name: tk('Anne, babanın kuzeninin kızı'), up: { father: 1, mother: 2 } },
  { id: 'r1f', name: tk('Baba, annenin kuzeninin oğlu'), up: { father: 2, mother: 1 } },
  { id: 'double', name: tk('Çift 1. derece kuzen'), double: true },
  { id: 'r2m', name: tk('Anne, babanın 2. derece kuzeninin kızı'), up: { father: 2, mother: 3 }, far: true },
  { id: 'r2f', name: tk('Baba, annenin 2. derece kuzeninin oğlu'), up: { father: 3, mother: 2 }, far: true },
];
// first cousins by the clinic's words: which grandparent on each side
const FIRST_COUSINS = [
  { name: tk('Amca çocukları'), paths: { father: ['male'], mother: ['male'] } },
  { name: tk('Teyze çocukları'), paths: { father: ['female'], mother: ['female'] } },
  { name: tk('Anne, babanın halasının kızı'), paths: { father: ['male'], mother: ['female'] } },
  { name: tk('Anne, babanın dayısının kızı'), paths: { father: ['female'], mother: ['male'] } },
];
const fraction = (F) => `1/${Math.round(1 / F)}`;
const allMale = (up) => ({ father: Array(up.father).fill('male'), mother: Array(up.mother).fill('male') });
const who = (path) => { const { main, way } = relativeName(path); return `${main.toLocaleLowerCase(currentLang())}${way ? ` (${way})` : ''}`; };
const sameWay = (a, b) => a.father.join() === b.father.join() && a.mother.join() === b.mother.join();

export default function RelationChooser({ onStart, onClose }) {
  const [relId, setRelId] = useState('c1');
  const [showFar, setShowFar] = useState(false);
  // the father's line on both sides to start with: amca çocukları, the most frequent
  const [paths, setPaths] = useState(allMale({ father: 1, mother: 1 }));
  const [doubleId, setDoubleId] = useState(DOUBLE_FIRST_COUSINS[0].id);
  const rel = RELATIONS.find((r) => r.id === relId);
  const double = DOUBLE_FIRST_COUSINS.find((d) => d.id === doubleId);

  const choose = (r) => { setRelId(r.id); if (!r.double) setPaths(allMale(r.up)); };
  const spec = rel.double ? double.spec : relationSpec(paths);
  const info = rel.double ? { F: 1 / 8 } : relationInfo(rel.up, paths);
  const summary = rel.double
    ? `${t(double.label)}: ${t(double.sub).toLocaleLowerCase(currentLang())}.`
    : rel.up.father === 1 && rel.up.mother === 1
      ? `${t(FIRST_COUSINS.find((c) => sameWay(c.paths, paths)).name)}.`
      : t('Babanın {a} ile annenin {b} kardeş.', { a: who(paths.father), b: who(paths.mother) });

  const row = (r) => (
    <button key={r.id} role="radio" aria-checked={relId === r.id} className={`relation-row-item${relId === r.id ? ' on' : ''}`} onClick={() => choose(r)}>
      <span>{t(r.name)}</span>
      <small>F {fraction(r.double ? 1 / 8 : relationInfo(r.up).F)}</small>
    </button>
  );
  const side = (key, label) => (
    <label className="relation-side">
      <span>{label}</span>
      <select value={paths[key].join()} onChange={(e) => setPaths((p) => ({ ...p, [key]: e.target.value.split(',') }))}>
        {pathsOf(rel.up[key]).map((path) => {
          const { main, way } = relativeName(path);
          return <option key={path.join()} value={path.join()}>{way ? `${main} (${way})` : main}</option>;
        })}
      </select>
    </label>
  );

  return (
    <div className="relation-dialog" role="dialog" aria-modal="true" aria-labelledby="relation-title" data-popup="relation">
      <div className="relation-head">
        {/* the name it has in the Yeni menu (clinician 2026-11-05: shorter, clearer) */}
        <h2 id="relation-title">{t('Akraba evliliği')}</h2>
        <button className="ui-btn ui-btn-ghost ui-btn-icon" onClick={onClose} aria-label={t('Kapat')} title={t('Kapat')}><X size={18} /></button>
      </div>
      <div className="relation-body">
        <div className="relation-left">
          <div className="relation-label" id="relation-q">{t('Anne ile baba nasıl akraba?')}</div>
          <div className="relation-list" role="radiogroup" aria-labelledby="relation-q">
            {RELATIONS.filter((r) => !r.far).map(row)}
            {(showFar || rel.far) ? RELATIONS.filter((r) => r.far).map(row) : (
              <button className="relation-row-item relation-more" onClick={() => setShowFar(true)}>{t('Daha uzak akrabalıklar…')}</button>
            )}
          </div>

          <div className="relation-label">{rel.double ? t('Nasıl?') : t('Hangi taraftan?')}</div>
          {rel.double ? (
            <div className="relation-pills" role="radiogroup" aria-label={t('Çift 1. derece kuzen')}>
              {DOUBLE_FIRST_COUSINS.map((d) => (
                <button key={d.id} role="radio" aria-checked={doubleId === d.id} className={doubleId === d.id ? 'on' : undefined} onClick={() => setDoubleId(d.id)}>{t(d.label)}</button>
              ))}
            </div>
          ) : rel.up.father === 1 && rel.up.mother === 1 ? (
            <div className="relation-pills" role="radiogroup" aria-label={t('Hangi taraftan?')}>
              {FIRST_COUSINS.map((c) => (
                <button key={c.name} role="radio" aria-checked={sameWay(c.paths, paths)} className={sameWay(c.paths, paths) ? 'on' : undefined} onClick={() => setPaths(c.paths)}>{t(c.name)}</button>
              ))}
            </div>
          ) : (
            <div className="relation-sides">
              <p className="relation-hint">{t('Kardeş olan büyükanne ya da büyükbabalar; bilinmiyorsa seçim olduğu gibi bırakılabilir.')}</p>
              {side('father', t('Babanın'))}
              {side('mother', t('Annenin'))}
            </div>
          )}
        </div>

        <div className="relation-right">
          <FamilyPreview spec={spec} />
          <p className="relation-legend"><span className="relation-swatch" aria-hidden="true" />{t('Kardeş olan büyükler')}</p>
          <p className="relation-summary">{summary} {t('Çocuklarında akrabalık katsayısı F = {f}.', { f: fraction(info.F) })}</p>
        </div>
      </div>
      <div className="relation-foot">
        <button className="ui-btn" onClick={onClose}>{t('Vazgeç')}</button>
        <button className="ui-btn ui-btn-primary" onClick={() => onStart(spec)}>{t('Bu aileyle başla')}</button>
      </div>
    </div>
  );
}

const S = 44; // symbol size in the preview (drawing units; people stand about 100 apart)

/** The family as it will open, drawn small; the siblings marked. */
function FamilyPreview({ spec }) {
  const key = JSON.stringify(spec);
  const drawn = useMemo(() => {
    const parsed = JSON.parse(key);
    const r = buildTemplate(starterDocument(), parsed);
    if (!r.ok) return null;
    const tidy = computeTidyLayout(r.doc.graph);
    return { nodes: tidy.nodes, edges: tidy.edges, marked: new Set(siblingIds(r.doc, parsed)) };
  }, [key]);
  if (!drawn) return null;
  const xs = drawn.nodes.map((n) => n.x), ys = drawn.nodes.map((n) => n.y);
  const x0 = Math.min(...xs) - S, y0 = Math.min(...ys) - S;
  const w = Math.max(...xs) - x0 + S, h = Math.max(...ys) - y0 + S + 20;
  const proband = drawn.nodes.find((n) => n.proband);
  return (
    <svg className="relation-preview" viewBox={`${x0} ${y0} ${w} ${h}`} role="img" aria-label={t('Açılacak ailenin küçük çizimi')}>
      {drawn.edges.map((e, i) => {
        const dbl = e.type === 'consanguineousUnion' || e.type === 'consanguineousUnionUnresolved';
        const [dx, dy] = e.x1 === e.x2 ? [4, 0] : [0, 4];
        return dbl
          ? <g key={i}><line x1={e.x1 - dx} y1={e.y1 - dy} x2={e.x2 - dx} y2={e.y2 - dy} /><line x1={e.x1 + dx} y1={e.y1 + dy} x2={e.x2 + dx} y2={e.y2 + dy} /></g>
          : <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />;
      })}
      {drawn.nodes.map((n) => {
        const cls = drawn.marked.has(n.id) ? 'marked' : undefined;
        return n.sex === 'female'
          ? <circle key={n.id} className={cls} cx={n.x} cy={n.y} r={S / 2} />
          : <rect key={n.id} className={cls} x={n.x - S / 2} y={n.y - S / 2} width={S} height={S} />;
      })}
      {proband && <path className="relation-arrow" d={`M${proband.x - S * 1.4} ${proband.y + S * 1.2} L${proband.x - S * 0.65} ${proband.y + S * 0.45} m-14 0 h14 v14`} />}
    </svg>
  );
}
