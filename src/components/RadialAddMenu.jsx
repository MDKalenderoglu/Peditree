/**
 * RadialAddMenu.jsx — a ring around the selected symbol (clinician requests
 * 2026-10-24). The ring adds relatives: top = parents, left = sibling,
 * right = spouse, bottom = child (pointing at a sector opens its choices, a
 * click adds). Four buttons on the diagonals, each with its name, work on the
 * person while the history is taken: findings (with their legend marks),
 * status (affected, carrier, deceased, proband), twins, Bilgiler. Their
 * choices open as a plain list beside the button, every word upright
 * (clinician request 2026-11-05: the rainbow bands looked raw and covered the
 * family). The hole in the middle leaves the symbol visible and clickable. The same store operations as the right
 * panel; the store refuses (with a reason) anything the graph rules forbid.
 */
import { Fragment, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Stethoscope, HeartPulse, Users, StickyNote, Check } from 'lucide-react';
import FindingsPalette from './FindingsPalette';
import { NameField, AgeField, NoteField, GeneticTextField } from './InfoFields';
import { groupOf, multipleName } from '../graph/multiples';
import { isPregnancy, isGroup, adoptionOf, ART_DONOR_RELATION, geneticLines, sameReproductiveSex } from '../graph/model';
import { shownAge } from '../utils/age';
import { computePedigreeIds } from '../utils/pedigreeNumbering';
import { parseGroupCount } from '../graph/ops';
import { useRingPrefs, RING_ROWS, RING_PREGNANCY, RING_INFO } from '../utils/ringPrefs';
import { t, tk } from '../i18n';
import { RING_T } from '../utils/ringGeometry';

const S = 9; // glyph half-size

export function Glyph({ kind, label = '' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 };
  return (
    <svg width="20" height="20" viewBox="-10 -10 20 20" aria-hidden="true">
      {kind === 'male' && <rect x={-S + 1} y={-S + 1} width={2 * S - 2} height={2 * S - 2} {...common} />}
      {kind === 'female' && <circle r={S - 1} {...common} />}
      {kind === 'unknown' && <path d={`M0,${-S} L${S},0 L0,${S} L${-S},0 Z`} {...common} />}
      {(kind === 'loss' || kind === 'termination' || kind === 'ectopic') && <path d={`M0,${-S + 3} L${S - 2},${S - 3} L${-S + 2},${S - 3} Z`} {...common} />}
      {(kind === 'termination' || kind === 'ectopic') && <path d={`M${-S + 1},${S - 1} L${S - 1},${-S + 1}`} {...common} />}
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
const ART_WORD = { sperm_donor: tk('sperm donörü'), egg_donor: tk('yumurta donörü'), gestational_carrier: tk('gestasyonel taşıyıcı'), surrogate: tk('taşıyıcı anne') };

const KINDS = [
  ['male', tk('Erkek'), 'male', {}, 1],
  ['female', tk('Kız'), 'female', {}, 1],
  ['unknown', tk('Cinsiyeti bilinmeyen'), 'unknown', {}, 1],
  ['loss', tk('Düşük'), 'unknown', { pregnancyLoss: true }, 2],
  ['stillbirth', tk('Ölü doğum (SB)'), 'unknown', { stillbirth: true }, 2],
  ['ongoing', tk('Devam eden gebelik (P)'), 'unknown', { ongoingPregnancy: true }, 2],
  ['termination', tk('Sonlandırma (TOP)'), 'unknown', { termination: true }, 2],
  ['ectopic', tk('Dış gebelik (ECT)'), 'unknown', { ectopic: true }, 2],
];

// ring sectors (degrees, screen: 0 = east, clockwise)
const SECTORS = {
  top: { a0: -135, a1: -45, label: tk('Ebeveyn') },
  right: { a0: -45, a1: 45, label: tk('Eş') },
  bottom: { a0: 45, a1: 135, label: tk('Çocuk') },
  left: { a0: 135, a1: 225, label: tk('Kardeş') },
};
// buttons on the diagonals
const SATELLITES = [
  { key: 'findings', angle: -45, label: tk('Bulgu'), Icon: Stethoscope },
  { key: 'status', angle: -135, label: tk('Durum'), Icon: HeartPulse },
  { key: 'twins', angle: 135, label: tk('İkiz'), Icon: Users },
  // a person's Bilgiler as in the side panel (clinician request 2026-11-04); a group's note only
  { key: 'note', angle: 45, label: tk('Bilgiler'), Icon: StickyNote },
];

/** Enter / Space on an SVG "button" acts as a click (keyboard use). */
const pressKey = (e, fn) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); fn(); }
};
/**
 * How far to move the span [a, b] to lie within [lo, hi] (screen px, with a
 * margin). One that cannot fit keeps its start (left / top) in view.
 */
function shiftInto(a, b, lo, hi, m = 8) {
  if (b - a > hi - lo - 2 * m) return lo + m - a;
  return a < lo + m ? lo + m - a : b > hi - m ? hi - m - b : 0;
}
/** The box around several screen boxes. */
const spanOf = (boxes) => ({
  left: Math.min(...boxes.map((b) => b.left)), right: Math.max(...boxes.map((b) => b.right)),
  top: Math.min(...boxes.map((b) => b.top)), bottom: Math.max(...boxes.map((b) => b.bottom)),
});
/**
 * Hover opens menus for a mouse only. A finger's or a pen's tap fires "enter",
 * then "click", then "leave" when it lifts, which would open and close the list
 * at once (clinician report 2026-11-09: with a pen on a tablet the lists would
 * not stay open).
 */
const isHover = (e) => e.pointerType === 'mouse';
// where each Bilgiler part goes, beside its box's title
const INFO_WHERE = { genetic: tk('sembolün altında'), note: tk('pedigrinin altında, numaralı'), name: tk('sembolün altında') };

/**
 * The choices of Durum, Bilgiler or İkiz: one short row each, a check on what
 * is on, the value already written at the right (Bilgiler), "Diğer…" last.
 * `aside`: what a row opens, beside the list at that row (a Bilgiler part's box;
 * clinician 2026-11-05: "beside it, like Bulgu, not below").
 */
function ChoiceList({ items, label }) {
  return (
    <div className="ring-choices" role="group" aria-label={label}>
      {items.map((it) => (
        <div key={it.label} className="ring-row">
          <button className={`ring-choice${it.on ? ' on' : ''}${it.more ? ' ring-more' : ''}`} aria-label={it.label}
            aria-pressed={it.more ? undefined : !!it.on} title={it.title || it.label} onClick={it.onClick}>
            <span className="ring-check" aria-hidden="true">{it.on && <Check size={13} />}</span>
            <span className="ring-choice-label">{it.label}</span>
            {it.value && <span className="ring-choice-value">{it.value}</span>}
          </button>
          {it.aside}
        </div>
      ))}
    </div>
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
  onUpdate, onSetProband, onClearProband, onSetConsultand, onClearConsultand, onAddFinding, onSetFindingStatus, onSetFindingStyle, onSetFindingOnset, onRenameFinding,
  onNeedRoom, sameSex = false, ref,
}) {
  const [active, setActive] = useState(null);   // sector under the pointer
  const [panel, setPanel] = useState(null);     // satellite panel (stays open)
  // the part of Bilgiler whose box is open under its band (age, genetic, note, name)
  const [infoFor, setInfoFor] = useState(null); // { node, part }
  const closeTimer = useRef(null);
  const panelTimer = useRef(null);
  // the list the pointer opened on its way in: the click that follows (still on the
  // button) keeps it open instead of closing it; leaving the button forgets it
  const hoverOpened = useRef(null);
  const keptByHover = (key) => { const kept = hoverOpened.current === key; hoverOpened.current = null; return kept; };
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
  // the "Yardımcı üreme ile" row: which role the next child is added with
  const [artRole, setArtRole] = useState(null);
  // (read before the "no person" guard below: the person may be gone mid-render)
  const showMore = !!node && moreFor === node.id;
  const setShowMore = () => node && setMoreFor((v) => (v === node.id ? null : node.id));
  const menuRef = useRef(null);
  useLayoutEffect(() => {
    const el = popRef.current;
    if (!el) { setNudge({ x: 0, y: 0 }); return; }
    const fit = () => {
      el.style.translate = '0px 0px';
      // a Bilgiler part's box stands beside the list: both must be on screen
      const aside = el.querySelector('.ring-aside');
      const r = aside ? spanOf([el.getBoundingClientRect(), aside.getBoundingClientRect()]) : el.getBoundingClientRect();
      const host = el.closest('.canvas-stage') || document.body;
      const h = host.getBoundingClientRect();
      if (r.right - r.left <= 0 || !h.width) return; // nothing laid out (a test page)
      // first the drawing slides, so the popup stays beside the ring and the
      // person (clinician request 2026-11-03); only what still cannot fit moves the popup itself
      const ringEl = menuRef.current && menuRef.current.querySelector('.radial-ring');
      const u = ringEl ? spanOf([r, ringEl.getBoundingClientRect()]) : r;
      const px = u.right - u.left <= h.width - 16 ? shiftInto(u.left, u.right, h.left, h.right) : 0;
      const py = u.bottom - u.top <= h.height - 16 ? shiftInto(u.top, u.bottom, h.top, h.bottom) : 0;
      if (onNeedRoom && (Math.abs(px) > 1 || Math.abs(py) > 1)) onNeedRoom(px, py);
      const dx = shiftInto(r.left + px, r.right + px, h.left, h.right), dy = shiftInto(r.top + py, r.bottom + py, h.top, h.bottom);
      el.style.translate = `${dx}px ${dy}px`;
      setNudge((old) => (old.x === dx && old.y === dy ? old : { x: dx, y: dy }));
    };
    fit();
    // it grows after opening ("Diğer…", a choice that shows another row): fit it again
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [active, panel, infoFor, anchor.x, anchor.y, onNeedRoom]);
  // keyboard (App): a letter opens a sector's choices or a satellite's panel
  const kbOpen = useRef(false);
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
  // the ring, its buttons and the rainbow bands must be on screen whole: if
  // they stick out (a person at the edge of the page, a narrow tablet screen)
  // the drawing slides by that much (clinician request 2026-11-03)
  useLayoutEffect(() => {
    const root = menuRef.current;
    if (!root || !onNeedRoom) return;
    const host = root.closest('.canvas-stage');
    if (!host) return;
    const parts = [...root.querySelectorAll('.radial-ring, .radial-sat')].map((el) => el.getBoundingClientRect()).filter((b) => b.width);
    const h = host.getBoundingClientRect();
    if (!parts.length || !h.width) return;
    const u = spanOf(parts);
    const dx = shiftInto(u.left, u.right, h.left, h.right), dy = shiftInto(u.top, u.bottom, h.top, h.bottom);
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) onNeedRoom(dx, dy);
  }, [panel, node?.id, anchor.x, anchor.y, onNeedRoom]);
  // every word of the ring fits its part: measured, and made smaller when it
  // does not — by the same amount for all of the ring (or all of the bands),
  // so they stay even (a longer word in another language)
  useLayoutEffect(() => {
    const root = menuRef.current;
    if (!root) return;
    // each word carries the room it has (data-room, set where it is drawn)
    for (const svg of root.querySelectorAll('.radial-ring')) {
      svg.style.removeProperty('--fit');
      let k = 1;
      for (const text of svg.querySelectorAll('text[data-room]')) {
        const room = Number(text.getAttribute('data-room'));
        const parts = text.querySelectorAll('tspan').length ? [...text.querySelectorAll('tspan')] : [text];
        for (const p of parts) {
          const w = typeof p.getComputedTextLength === 'function' ? p.getComputedTextLength() : 0;
          if (w > room) k = Math.min(k, room / w);
        }
      }
      if (k < 1) svg.style.setProperty('--fit', String(Math.max(0.75, k)));
    }
  });
  // opened from the keyboard: its first control takes the focus (Tab moves on, Enter picks)
  useEffect(() => {
    if (!kbOpen.current) return;
    const root = popRef.current;
    const first = root && root.querySelector('button:not(:disabled), [tabindex="0"], input, textarea');
    if (first) { first.focus(); kbOpen.current = false; }
  }, [active, panel]);
  if (!node || node.placeholder) return null;
  const isLoss = isPregnancy(node);
  // a symbol for several people takes parents, siblings and a note only (clinician decisions 2026-11-01)
  const group = isGroup(node);
  const setInfo = (patch) => onUpdate(node.id, patch);
  const satLabel = (s) => (s.key === 'note' && group ? t('Not') : t(s.label));
  const infoPart = panel === 'note' && !group && infoFor && infoFor.node === node.id ? infoFor.part : null;
  const GROUP_HINT = t('Bu sembol birden çok kişiyi gösteriyor; eş, çocuk ya da bulgu için önce sağdaki panelden “Tek tek ayır”.');

  const pcrs = pedigreeData.parentChildRelationships || [];
  const unions = (pedigreeData.unions || []).filter(u => u.partners.includes(node.id));
  const hasParents = pcrs.some(r => r.children.includes(node.id));
  const sexKnown = node.sex === 'male' || node.sex === 'female';
  // Codex audit 2026-11-01: with several partners the clinician names the
  // child's other parent (never the most recent one silently); for an
  // adopted-in person the clinician says what the new sibling is
  const ids = computePedigreeIds(pedigreeData.nodes || []);
  const nameOf = (id) => { const p = (pedigreeData.individuals || []).find(i => i.id === id); return [ids.get(id)?.displayId, p?.displayLabel].filter(Boolean).join(' ') || t('eşi'); };
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
  // the couple a new child or sibling comes from, when both partners have the same reproductive sex
  // (clinician decision 2026-11-10): its biological child needs a donor (graph/validate.js
  // SAME_SEX_CHILD_DONOR) — 'female' or 'male', else null
  const personById = (id) => (pedigreeData.individuals || []).find((i) => i.id === id);
  const parentRel = pcrs.find((r) => r.children.includes(node.id));
  const coupleOf = (sector) => (sector === 'bottom' ? childUnion
    : sector === 'left' && !adoptedIn && parentRel ? (pedigreeData.unions || []).find((u) => u.id === parentRel.unionId) : null);
  const needsDonor = (sector) => { const u = coupleOf(sector); return u ? sameReproductiveSex(personById(u.partners[0]), personById(u.partners[1])) : null; };
  // the donor that gives what the couple lacks: a sperm donor for two women, an egg donor or a surrogate for two men
  const ART_FOR = { female: ['sperm_donor'], male: ['egg_donor', 'surrogate'] };

  // a donor or carrier added for assisted reproduction has no family of their own (clinician decision 2026-11-01)
  const DONOR_HINT = node.relation === ART_DONOR_RELATION ? t('Donör ya da taşıyıcının ailesi çizilmez; aile öyküsünü Not ve Bulgu ile girin.') : null;
  const disabled = DONOR_HINT ? { top: DONOR_HINT, right: DONOR_HINT, bottom: DONOR_HINT, left: DONOR_HINT } : {
    // a pregnancy outcome takes parents and siblings, never a partner or children (clinician 2026-10-25)
    top: hasParents ? t('Bu kişinin annesi ve babası zaten çizili.') : null,
    right: group ? GROUP_HINT : isLoss ? t('Düşüğe, ölü doğuma ya da süren gebeliğe eş eklenemez.') : sexKnown ? null : t('Eş eklemek için önce bu kişinin cinsiyetini seçin: Durum düğmesi → Erkek ya da Kadın.'),
    bottom: group ? GROUP_HINT : isLoss ? t('Düşüğe, ölü doğuma ya da süren gebeliğe çocuk eklenemez.') : !unions.length && !sexKnown ? t('Çocuk eklemek için önce bu kişinin cinsiyetini seçin: Durum düğmesi → Erkek ya da Kadın.') : null,
    left: null,
  };
  // one click: parents = a mother and a father; spouse = the opposite sex
  // (clinician decision 2026-10-24) — no choices to open; with same-sex partners allowed in Ayarlar
  // (clinician decision 2026-11-10) Eş asks for the partner's sex
  const direct = {
    top: () => onAddParents(node.id, {}),
    ...(sameSex ? {} : { right: () => onAddSpouse(node.id, node.sex === 'female' ? 'male' : 'female') }),
  };
  const choices = {
    ...(sameSex ? { right: [['male', tk('Erkek')], ['female', tk('Kadın')]].map(([sex, label]) => [`${t('Eş')}: ${t(label)}`, sex, () => onAddSpouse(node.id, sex), 1]) } : {}),
    left: KINDS.map(([g, label, sex, extra, row]) => [`${t('Kardeş')}: ${t(label)}`, g, () => addSiblingHere(sex, extra), row]),
    bottom: KINDS.map(([g, label, sex, extra, row]) => [`${t('Çocuk')}: ${t(label)}`, g, () => addChildHere(sex, extra), row]),
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
  const rowAvailable = (sector, id) => (id === 'pregnancy' ? (choices[sector] || []).some((c) => (c[3] || 1) === 2)
    : id === 'art' ? !!addGroup[sector] && !!onAddChild : !!addGroup[sector]);
  // a couple that needs a donor: no plain biological child, nor several in one symbol (always the art and adopted rows)
  const flyoutRows = (sector) => ring.rows.filter((id) => rowAvailable(sector, id) && (shown(id) || (needsDonor(sector) && (id === 'art' || id === 'adopted')))
    && (id !== 'pregnancy' || pregnancyChoices(sector).length) && !(needsDonor(sector) && id === 'group'));
  const flyoutHasHidden = (sector) => ring.hidden.some((id) => (RING_ROWS.some((x) => x.id === id) ? rowAvailable(sector, id)
    : RING_PREGNANCY.some((x) => x.id === id) && rowAvailable(sector, 'pregnancy')));
  const rowView = !active || !choices[active] ? {} : {
    pregnancy: (
      <div className="flyout-row">
        <span className="flyout-row-label">{t('Gebelik')}</span>
        {pregnancyChoices(active).map(([title, glyph, run]) => (
          <button key={title} className="quick-btn" title={title} aria-label={title} onClick={() => { run(); setActive(null); }}><Glyph kind={glyph} /></button>
        ))}
      </div>
    ),
    // adopted in (NSGC brackets, dashed line from the adoptive parents; clinician decisions 2026-11-01)
    adopted: addGroup[active] && (
      <div className="flyout-row">
        <span className="flyout-row-label">{t('Evlat edinilmiş')}</span>
        {[['male', t('erkek')], ['female', t('kız')], ['unknown', t('cinsiyeti bilinmeyen')]].map(([sex, word]) => {
          const title = t('{who}: evlat edinilmiş {what} (köşeli parantez, kesikli iniş çizgisi)', { who: active === 'left' ? t('Kardeş') : t('Çocuk'), what: word });
          return (
            <button key={sex} className="quick-btn" title={title} aria-label={title}
              onClick={() => { addAdopted[active](sex); setActive(null); }}><Glyph kind={`adopted-${sex}`} /></button>
          );
        })}
      </div>
    ),
    // a child conceived with assisted reproduction, its donor or carrier at once (clinician 2026-11-02)
    art: addGroup[active] && (
      <div className="flyout-row flyout-art">
        <span className="flyout-row-label">{t('Yardımcı üreme ile')}</span>
        <span className="flyout-choose" role="radiogroup" aria-label={t('Yardımcı üreme türü')}>
          {[['sperm_donor', t('Sperm donörü')], ['egg_donor', t('Yumurta donörü')], ['gestational_carrier', t('G taşıyıcı')], ['surrogate', t('Taşıyıcı anne')]].filter(([role]) => !needsDonor(active) || ART_FOR[needsDonor(active)].includes(role)).map(([role, text]) => (
            <button key={role} role="radio" aria-checked={artRole === role} className={`quick-text${artRole === role ? ' on' : ''}`}
              onClick={() => setArtRole(role)}>{text}</button>
          ))}
        </span>
        {[['male', t('erkek')], ['female', t('kız')], ['unknown', t('cinsiyeti bilinmeyen')], ['ongoing', t('devam eden gebelik')]].map(([kind, word]) => {
          const name = `${active === 'left' ? t('Kardeş') : t('Çocuk')}: ${word}, ${artRole ? t('{role} ile', { role: t(ART_WORD[artRole]) }) : t('yardımcı üreme ile')}`;
          const title = artRole ? name : t('Önce yardımcı üreme türünü seçin');
          const extra = { reproRole: artRole, ...(kind === 'ongoing' ? { ongoingPregnancy: true } : {}) };
          const roleOk = !!artRole && (!needsDonor(active) || ART_FOR[needsDonor(active)].includes(artRole));
          const sex = kind === 'ongoing' ? 'unknown' : kind;
          return (
            <button key={kind} className="quick-btn" title={title} aria-label={name} disabled={!roleOk}
              onClick={() => { (active === 'left' ? addSiblingHere : addChildHere)(sex, extra); setActive(null); }}><Glyph kind={kind} /></button>
          );
        })}
      </div>
    ),
    group: addGroup[active] && (
      <div className="flyout-row">
        <span className="flyout-row-label">{t('Birden çok')}</span>
        <input className="flyout-count" value={groupCount} inputMode="numeric" maxLength={2} aria-label={t('Kişi sayısı (bilinmiyorsa n)')}
          title={t('Kişi sayısı: 2–99; bilinmiyorsa n')} onChange={(e) => setGroupCount(e.target.value)} />
        {[['male', t('erkek')], ['female', t('kız')], ['unknown', t('cinsiyeti karışık ya da bilinmeyen')]].map(([sex, word]) => {
          const count = parseGroupCount(groupCount);
          const title = t('{who}: {count} {what} (tek sembol, içinde sayı)', { who: active === 'left' ? t('Kardeş') : t('Çocuk'), count: count ?? '?', what: word });
          return (
            <button key={sex} className="quick-btn" title={count ? title : t('Önce 2–99 arası bir sayı ya da n yazın')} aria-label={title} disabled={!count}
              onClick={() => { addGroup[active](sex, count); setActive(null); }}><Glyph kind={`group-${sex}`} label={count ?? '?'} /></button>
          );
        })}
      </div>
    ),
  };

  const r = Math.max(24, anchor.size / 2 + 8);
  const R = r + RING_T;
  const box = R + 2;
  // satellite distance from the centre (bigger buttons on a touch screen)
  const coarse = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const sat = R + (coarse ? 27 : 20);
  const open = (k, hover = false) => {
    clearTimeout(closeTimer.current); clearTimeout(panelTimer.current);
    if (hover && active !== k) hoverOpened.current = k;
    setActive(direct[k] && !disabled[k] ? null : k); if (!direct[k]) setPanel(null);
  };
  // satellites open on hover (clinician request 2026-10-25); a panel stays
  // while the pointer is on it or a field inside it has the focus
  const openPanel = (key) => {
    clearTimeout(panelTimer.current); clearTimeout(closeTimer.current);
    if (panel !== key) hoverOpened.current = key;
    setActive(null); setPanel(key);
  };
  const keepPanel = () => clearTimeout(panelTimer.current);
  const leavePanel = () => {
    hoverOpened.current = null;
    clearTimeout(panelTimer.current);
    panelTimer.current = setTimeout(() => {
      const el = popRef.current;
      if (el && el.contains(document.activeElement)) return;
      setPanel(null);
    }, 300);
  };
  const leave = () => { hoverOpened.current = null; clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setActive(null), 200); };
  const pressSector = (k) => {
    if (direct[k]) { if (!disabled[k]) direct[k](); else open(k); return; }
    if (active === k) { if (!keptByHover(k)) setActive(null); } else open(k);
  };
  const flyoutStyle = (k) => ({
    top: { left: 0, top: -R - 10, transform: 'translate(-50%, -100%)' },
    bottom: { left: 0, top: R + 10, transform: 'translate(-50%, 0)' },
    left: { left: -R - 10, top: 0, transform: 'translate(-100%, -50%)' },
    right: { left: R + 10, top: 0, transform: 'translate(0, -50%)' },
  }[k]);
  const satPos = (angle) => [sat * Math.cos((angle * Math.PI) / 180), sat * Math.sin((angle * Math.PI) / 180)];
  // a satellite's panel opens outwards from its button: above the top ones, below the bottom
  // ones, on its own side unless the drawing area has more room on the other (widths: ui.css)
  const opensRight = (s) => {
    const [x] = satPos(s.angle);
    // findings 340 px, a list 200 (a Bilgiler part's box opens on the same side: the drawing slides for it)
    const w = s.key === 'findings' ? 340 : 200;
    const roomRight = (anchor.boxW ?? Infinity) - (anchor.x + x);
    const roomLeft = anchor.x + x;
    return x > 0 ? roomRight >= w || roomRight >= roomLeft : roomLeft < w && roomRight > roomLeft;
  };
  const panelStyle = (s) => {
    const [x, y] = satPos(s.angle);
    const right = opensRight(s);
    const below = y > 0;
    return { left: right ? x - 16 : x + 16, top: below ? y + 22 : y - 22, transform: `translate(${right ? '0' : '-100%'}, ${below ? '0' : '-100%'})` };
  };

  // "Diğer…" / "Daha az": the choices hidden in Ayarlar → Halka menü, never lost
  const moreItem = (hiddenHere) => (hiddenHere.length ? [{ label: showMore ? t('Daha az') : t('Diğer…'), more: true, onClick: () => setShowMore(), title: showMore ? t('Gizlediğiniz seçenekleri yeniden gizle') : t('Halka menüden gizlediğiniz seçenekler (Ayarlar → Halka menü)') }] : []);
  const firstLine = (s) => String(s || '').split('\n').find((l) => l.trim()) || '';
  const infoItems = () => {
    const avail = ring.info.filter((id) => !(id === 'age' && isLoss));
    const hiddenHere = avail.filter((id) => ring.hidden.includes(id));
    // what is already written shows at the right of its row
    const value = { age: node.age ? shownAge(node.age) : '', genetic: geneticLines(node)[0] || '', note: firstLine(node.notes), name: node.displayLabel || '' };
    return [
      ...avail.filter((id) => showMore || !hiddenHere.includes(id)).map((id) => ({
        label: t(RING_INFO.find((x) => x.id === id).label), on: infoPart === id, value: value[id],
        onClick: () => setInfoFor(infoPart === id ? null : { node: node.id, part: id }),
        // the part's box beside its row, on the side the list opened to (away from the ring)
        aside: infoPart === id && infoBoxes[id] ? (
          <div className={`radial-info-box ring-aside${opensRight(SATELLITES.find((x) => x.key === 'note')) ? '' : ' ring-aside-left'}`}>
            {/* the part's name and where it goes; the field's own label is read aloud only */}
            <div className="radial-panel-title">{t(RING_INFO.find((x) => x.id === id).label)}
              {INFO_WHERE[id] && <span className="field-where">{t(INFO_WHERE[id])}</span>}</div>
            {infoBoxes[id]}
          </div>
        ) : null,
        title: { age: t('Yaşını yazın'), genetic: t('Genetik test sonucu: varyant ya da sonuç'), note: t('Pedigrinin altındaki numaralı notlara'), name: t('Sembolün altına ad ya da kısaltma') }[id],
      })),
      ...moreItem(hiddenHere),
    ];
  };
  const lists = {
    status: () => {
      const sexes = isLoss ? [] : [['male', t('Erkek')], ['female', t('Kadın')], ['unknown', t('Bilinmiyor')]];
      const byId = {
        affected: { label: t('Etkilenmiş'), on: !!node.affected, onClick: () => onUpdate(node.id, { affected: !node.affected }), title: t('Kişi hasta (etkilenmiş): sembolün içi tamamen dolar. Hastalığın adını yazmak için Bulgu düğmesini kullanın.') },
        carrier: { label: t('Taşıyıcı'), on: !!node.carrier, onClick: () => onUpdate(node.id, { carrier: !node.carrier }), title: t('Kişi hasta değil ama hastalığa yol açan geni taşıyor') },
        deceased: isLoss ? null : { label: t('Vefat'), on: !!node.deceased, onClick: () => onUpdate(node.id, { deceased: !node.deceased }), title: t('Kişi hayatta değil: sembolün üzerine çapraz çizgi çekilir') },
        proband: { label: t('Proband'), on: !!node.proband, onClick: () => (node.proband ? onClearProband() : onSetProband(node.id)), title: t('Ailede incelemeye yol açan ilk etkilenmiş kişi: yanında ok ve P harfi çizilir') },
        presymptomatic: isLoss ? null : { label: t('Presemptomatik'), on: !!node.presymptomatic, onClick: () => onUpdate(node.id, { presymptomatic: !node.presymptomatic }), title: t('Şu an belirtisi yok ama ileride belirti gösterebilir (çoğunlukla dominant hastalıklarda): sembolün ortasından dikey çizgi geçer, açıklamada yazılır') },
        // the consultand (clinician decisions 2026-11-01): an arrow without "P"
        consultand: isLoss || !onSetConsultand ? null : { label: t('Danışan'), on: !!node.consultand, onClick: () => (node.consultand ? onClearConsultand() : onSetConsultand(node.id)), title: t('Danışmanlık için başvuran kişi: yanında yalnız ok çizilir (P yok). Ailede bir danışan olur; proband ile aynı kişi olabilir.') },
      };
      // the clinician's order; hidden choices under "Diğer…" (Ayarlar → Halka menü)
      const available = ring.status.filter((id) => byId[id]);
      const hiddenHere = available.filter((id) => ring.hidden.includes(id));
      return (
        <>
          {sexes.length > 0 && (
            <div className="segmented ring-sex" role="radiogroup" aria-label={t('Cinsiyet')}>
              {sexes.map(([v, label]) => (
                <button key={v} role="radio" aria-checked={(node.sex || 'unknown') === v} aria-label={label} className={(node.sex || 'unknown') === v ? 'on' : undefined}
                  onClick={() => onUpdate(node.id, { sex: v })}>{label}</button>
              ))}
            </div>
          )}
          <ChoiceList label={t('Durum')} items={[...available.filter((id) => showMore || !hiddenHere.includes(id)).map((id) => byId[id]), ...moreItem(hiddenHere)]} />
        </>
      );
    },
    // Bilgiler (clinician request 2026-11-04): one choice per part; a part opens its own box under the list
    note: () => <ChoiceList label={t('Bilgiler')} items={infoItems()} />,
    // each row says in its tooltip what it adds ("İkizini ekle: …", "Üçüz yap: …")
    twins: () => (
      <>
        <ChoiceList label={t('İkiz')} items={[['monozygotic', t('Tek yumurta')], ['dizygotic', t('Çift yumurta')], ['unknown', t('Bilinmiyor')]].map(([z, label]) => ({
          label, title: `${twinGroup ? t('{name} yap', { name: multipleName(twinGroup.group.children.length + 1) }) : t('İkizini ekle')}: ${label}`,
          on: twinGroup?.group.zygosity === z,
          onClick: () => { onAddTwin(node.id, { sex: node.sex, zygosity: z }); setPanel(null); },
        }))} />
      </>
    ),
  };
  const twinsUsable = hasParents && !isLoss && !!onAddTwin;
  const listPanel = panel === 'status' || (panel === 'twins' && twinsUsable) || (panel === 'note' && !group);
  // İkiz with no parents drawn: only the reason, in a small box
  const hintOnly = panel === 'twins' && !twinsUsable;

  const panels = {
    findings: (
      <FindingsPalette node={node} conditionKey={pedigreeData.conditionKey || []} compact
        onSetStatus={onSetFindingStatus} onAdd={onAddFinding} onSetStyle={onSetFindingStyle} onSetOnset={onSetFindingOnset} onRename={onRenameFinding} />
    ),
    twins: (
      <span className="radial-hint">{isLoss ? t('Düşük, ölü doğum ya da süren gebelik kaydına buradan ikiz eklenemez.') : t('İkiz eklemek için önce bu kişinin anne ve babasını ekleyin (yukarıdaki Ebeveyn düğmesi).')}</span>
    ),
    // a symbol for several people: its note only (the others open from the Bilgiler band)
    note: <NoteField node={node} set={setInfo} compact />,
  };
  // the box of one Bilgiler part (the side panel's fields, InfoFields.jsx)
  const infoBoxes = {
    age: <AgeField node={node} set={setInfo} autoFocus />,
    genetic: <GeneticTextField node={node} set={setInfo} individuals={pedigreeData.individuals || []} />,
    note: <NoteField node={node} set={setInfo} compact autoFocus />,
    name: <NameField node={node} set={setInfo} autoFocus />,
  };

  return (
    <div className="radial-menu" ref={menuRef} style={{ left: anchor.x, top: anchor.y }} onClick={e => e.stopPropagation()}>
      <svg className="radial-ring" width={2 * box} height={2 * box} viewBox={`${-box} ${-box} ${2 * box} ${2 * box}`}
        style={{ left: -box, top: -box }}>
        {Object.entries(SECTORS).map(([k, { a0, a1, label }]) => {
          const mid = ((a0 + a1) / 2) * Math.PI / 180;
          const tr = (r + R) / 2;
          return (
            <g key={k} className={`radial-sector${active === k ? ' on' : ''}${disabled[k] ? ' off' : ''}`}
              onPointerEnter={(e) => isHover(e) && open(k, true)} onPointerLeave={(e) => isHover(e) && leave()}
              onClick={() => pressSector(k)} onKeyDown={(e) => pressKey(e, () => pressSector(k))} tabIndex={0}
              role="button" aria-label={t(label)} aria-disabled={!!disabled[k]}>
              <title>{disabled[k] || (k === 'top' ? t('Anne ve baba ekle') : k === 'right' ? (unions.length ? t('Başka bir eş ekle') : t('Eş ekle')) : t(label))}</title>
              <path d={sectorPath(a0, a1, r, R)} />
              {/* the room for the word: the ring's thickness at the sides; between the sector's
                  edges (at 45°) just inside the word's lower edge at the top and bottom */}
              <text x={tr * Math.cos(mid)} y={tr * Math.sin(mid)} textAnchor="middle" dominantBaseline="central"
                data-room={Math.round(k === 'left' || k === 'right' ? RING_T - 8 : 2 * (tr - 7) - 14)}>{t(label)}</text>
            </g>
          );
        })}
      </svg>
      {SATELLITES.filter((s) => !group || s.key === 'note').map((s) => {
        const [x, y] = satPos(s.angle);
        const { Icon } = s;
        // the icon on the diagonal, the name outwards (never over the ring)
        return (
          <button key={s.key} className={`radial-sat${x < 0 ? ' sat-left' : ''}${panel === s.key ? ' on' : ''}`} style={{ left: x, top: y }}
            aria-label={satLabel(s)} aria-expanded={panel === s.key}
            onPointerEnter={(e) => isHover(e) && openPanel(s.key)} onPointerLeave={(e) => isHover(e) && leavePanel()}
            onClick={() => { setActive(null); if (panel === s.key && keptByHover(s.key)) return; setPanel(panel === s.key ? null : s.key); }}>
            <Icon size={15} aria-hidden="true" /><span className="radial-sat-label">{satLabel(s)}</span>
          </button>
        );
      })}
      {/* a sector with neither choices nor a reason (it became a one-click
          action, e.g. after "Tek tek ayır") shows nothing */}
      {active && (choices[active] || disabled[active]) && (
        <div className="radial-flyout" ref={popRef} style={{ ...flyoutStyle(active), translate: `${nudge.x}px ${nudge.y}px`, maxWidth: anchor.boxW ? anchor.boxW - 16 : undefined }} onPointerEnter={(e) => isHover(e) && open(active)} onPointerLeave={(e) => isHover(e) && leave()}>
          {disabled[active] ? (
            <span className="radial-hint">{disabled[active]}</span>
          ) : (
            <>
              {active === 'bottom' && unions.length > 1 && (
                <div className="flyout-row flyout-choose" role="radiogroup" aria-label={t('Çocuk hangi eşten?')}>
                  <span className="flyout-row-label">{t('Hangi eşten?')}</span>
                  {unions.map((u) => {
                    const other = u.partners.find((p) => p !== node.id);
                    const on = childUnion && childUnion.id === u.id;
                    return <button key={u.id} role="radio" aria-checked={!!on} className={`quick-text${on ? ' on' : ''}`}
                      onClick={() => setChoiceFor({ node: node.id, union: u.id })}>{t('{name} ile', { name: nameOf(other) })}</button>;
                  })}
                </div>
              )}
              {active === 'left' && adoptedIn && (
                <div className="flyout-row flyout-choose" role="radiogroup" aria-label={t('Yeni kardeş ne?')}>
                  <span className="flyout-row-label">{t('Yeni kardeş')}</span>
                  {[['family', t('Ailenin öz çocuğu'), t('Evlat edinen anne-babanın kendi çocuğu')], ['adopted', t('Evlat edinilmiş'), t('Aynı ailenin evlat edindiği başka bir çocuk')], ['biological', t('Biyolojik kardeşi'), t('Bu kişinin biyolojik kardeşi: biyolojik anne-babası (bilinmiyor) da çizilir')]].map(([k, label, title]) => (
                    <button key={k} role="radio" aria-checked={sibKind === k} className={`quick-text${sibKind === k ? ' on' : ''}`} title={title}
                      onClick={() => setChoiceFor({ node: node.id, sibling: k })}>{label}</button>
                  ))}
                </div>
              )}
              {!ready(active) ? (
                <span className="radial-hint">{active === 'bottom' ? t('Önce çocuğun hangi eşten olduğunu seçin.') : t('Önce yeni kardeşin ne olduğunu seçin.')}</span>
              ) : (<>
              {/* the sexes, then the rows in the clinician's order (Ayarlar → Halka menü; ringPrefs.js) */}
              {needsDonor(active) ? (
                <span className="radial-hint">{needsDonor(active) === 'female'
                  ? t('İki kadın eşin çocuğu: aşağıdan sperm donörüyle ya da evlat edinilmiş olarak ekleyin.')
                  : t('İki erkek eşin çocuğu: aşağıdan yumurta donörü ya da taşıyıcı anneyle, ya da evlat edinilmiş olarak ekleyin.')}</span>
              ) : (
              <div className="flyout-row">
                {choices[active].filter((c) => (c[3] || 1) === 1).map(([title, glyph, run]) => (
                  <button key={title} className="quick-btn" title={title} aria-label={title} onClick={() => { run(); setActive(null); }}><Glyph kind={glyph} /></button>
                ))}
              </div>
              )}
              {flyoutRows(active).map((rowId) => rowView[rowId] && <Fragment key={rowId}>{rowView[rowId]}</Fragment>)}
              {flyoutHasHidden(active) && (
                <button className="flyout-more" onClick={() => setShowMore()} aria-expanded={showMore}>
                  {showMore ? t('Daha az') : t('Diğer…')}
                </button>
              )}
              </>)}
            </>
          )}
        </div>
      )}
      {panel && (
        <div className={`radial-panel${listPanel ? ' ring-list-panel' : hintOnly ? ' ring-hint-panel' : panel === 'findings' ? ' findings-panel' : ''}`} ref={popRef} style={{ ...panelStyle(SATELLITES.find(s => s.key === panel)), translate: `${nudge.x}px ${nudge.y}px` }}
          onPointerEnter={(e) => isHover(e) && keepPanel()} onPointerLeave={(e) => isHover(e) && leavePanel()}>
          {/* a list or the findings need no title: their button, named, stands right beside them */}
          {!listPanel && !hintOnly && panel !== 'findings' && <div className="radial-panel-title">{satLabel(SATELLITES.find(s => s.key === panel))}</div>}
          {listPanel ? lists[panel]() : panels[panel]}
        </div>
      )}
    </div>
  );
}
