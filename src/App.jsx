import React from 'react';
import { createPortal } from 'react-dom';
import * as d3 from 'd3';
import { usePedigreeStore, needsLeaveWarning, flushAutosave } from './state/usePedigreeStore';
import { computePedigreeIds } from './utils/pedigreeNumbering';
import { exportSVG, exportPNG, exportPDF, exportFileName, pngBlob, shareFile, downloadBlob, prepareExportSvg } from './utils/exportUtils';
import { assessExportReadiness } from './utils/exportReadiness';
import { withStableIdsExcludingDismissed } from './utils/warningIds';
import { clinicalNotices } from './utils/clinicalNotices';
import PedigreeCanvas from './components/PedigreeCanvas';
import IndividualEditor from './components/IndividualEditor';
import RadialAddMenu from './components/RadialAddMenu';
import { flushDrafts } from './utils/drafts';
import { parseTypedDate, formatDate, typeDate } from './utils/age';
import DraftField from './components/DraftField';
import { nextPerson, ringKeysFor } from './utils/keyboardNav';
import { useT, useLang, t as tNow, tk, currentLang, drawingLangOf } from './i18n';
import { toPed } from './graph/ped';
import { mergeIntoGroup as checkMerge } from './graph/ops';
import SettingsDialog from './components/SettingsDialog';
import RelationChooser from './components/RelationChooser';
import Tour, { TourFamily } from './components/Tour';
import { withGeneticLine, subjectOf, adoptionOf, ancestorsOf, REPRO_LABEL, EGG_SOURCE, CARRIER_ROLES, ART_DONOR_RELATION, isPregnancy, sameReproductiveSex, ownGameteOf } from './graph/model';
import { clinicalNamer } from './utils/clinicalNotices';
import { useViewSettings, drawingSpec, exportSpec, embeddedFontCss, ringAlphaOf, shownMode, PANEL_WIDTH } from './utils/drawingStyle';
import { ProductInfo, LicenseInfo, CitationInfo, FeedbackInfo } from './components/AboutParts';
import { nameCase } from './utils/nameCase';
import { RELEASE_STAGE } from './utils/appInfo';
import { watchToolbar, overflowed } from './utils/toolbarFit';
import { Download, Image as ImageIcon, AlertTriangle, FilePlus2, Undo2, Redo2, Save, FolderOpen, Info, Quote, MessageSquareText, CheckSquare, Share2, Printer, SlidersHorizontal, ChevronDown, FileCode2, FileText, Table2, MoreHorizontal, Check, CircleHelp, UserRound, Maximize, Minimize, Menu as MenuIcon, X as XIcon } from 'lucide-react';
import './styles/app.css';
import './styles/ui.css';
// the clinician's logo (docs/brand/peditree-logo.webp): the tree, and the name in its own lettering
import logoMark from './assets/logo-mark.png';
import logoWordmark from './assets/logo-wordmark.png';
import { kinTerm } from './graph/kinTerm';
import TidyIcon from './components/TidyIcon';

/** The buttons that may wait in "Diğer" (⋯) on a narrow bar: icon and name (App runMore does what they do). */
const MORE = {
  cite: [Quote, tk('Atıf')], feedback: [MessageSquareText, tk('Geri bildirim')], print: [Printer, tk('Yazdır')],
  share: [Share2, tk('Paylaş')], multi: [CheckSquare, tk('Çoklu seçim')], relayout: [TidyIcon, tk('Konumlandır')],
  new: [FilePlus2, tk('Yeni')], open: [FolderOpen, tk('Aç')],
  // on a phone only (they come last; a tablet keeps them on the bar): clinician 2026-11-10
  tour: [CircleHelp, tk('Tanıtım turu')], redo: [Redo2, tk('Yinele')], settings: [SlidersHorizontal, tk('Ayarlar')],
  undo: [Undo2, tk('Geri al')], about: [Info, tk('PediTree hakkında')],
};
/** The touch mode's menu: everything the top bar holds on a computer, with its name, in this order. */
// Paylaş stands on the phone's bar itself (clinician request 2026-11-12)
const TOUCH_MENU = ['undo', 'redo', 'new', 'open', 'relayout', 'multi', 'print', 'settings', 'tour', 'cite', 'feedback', 'about'];
/**
 * The touch mode (clinician request 2026-11-10: on a phone the desktop screen, made smaller, could not be
 * used — the ring covered the drawing, the panel ate the page, icons said too little). Same pedigree, same
 * operations, same files; only the screen differs: a short top bar with a labelled menu, the drawing over
 * the whole screen, and a sheet with the person's labelled tiles (the ring's choices) that is drawn up for
 * the details and down to close. A phone in either orientation turns it on (Ayarlar → Görünüm can turn it
 * on for a tablet, or off).
 */
const PHONE = '(max-width: 600px), (max-height: 500px) and (pointer: coarse)';
function usePhone() {
  const query = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(PHONE).matches;
  const [phone, setPhone] = React.useState(query);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const m = window.matchMedia(PHONE);
    const on = () => setPhone(m.matches);
    if (m.addEventListener) m.addEventListener('change', on); else if (m.addListener) m.addListener(on);
    // the window may have changed between the first look and now (it opened narrow, or in the
    // background, and grew): look again, or a computer stays on the phone's screen (clinician report
    // 2026-11-11: "the screen turned into the phone's")
    on();
    return () => { if (m.removeEventListener) m.removeEventListener('change', on); else if (m.removeListener) m.removeListener(on); };
  }, []);
  return phone;
}
/** A finger or a pen (the multi-select switch is for touch screens). */
const coarsePointer = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

/**
 * The side panel (clinician report 2026-11-09: it opened with a soft slide but vanished at once).
 * When it closes, a still copy of what it showed slides out to the right over the drawing, which
 * already has its full width; the copy is only a picture (aria-hidden, inert, no ids, no clicks)
 * and is gone when the motion ends. The copy is taken just before React empties the panel
 * (getSnapshotBeforeUpdate). No motion with reduced motion or without the Web Animations API.
 */
const PANEL_OUT_MS = 220;
class SidePanel extends React.Component {
  constructor(props) { super(props); this.ref = React.createRef(); }
  getSnapshotBeforeUpdate(prev) {
    const el = this.ref.current;
    if (!prev.open || this.props.open || !el || typeof el.animate !== 'function') return null;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
    const rect = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    // typed values live in the fields, not in their attributes: carry them over
    const from = el.querySelectorAll('input, textarea, select');
    ghost.querySelectorAll('input, textarea, select').forEach((f, i) => {
      if (f.type === 'checkbox' || f.type === 'radio') f.checked = from[i].checked; else f.value = from[i].value;
    });
    ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    ghost.removeAttribute('id');
    ghost.classList.add('panel-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('inert', '');
    Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    return { ghost, scrollTop: el.scrollTop };
  }
  componentDidUpdate(prevProps, prevState, snap) {
    if (!snap) return;
    const { ghost, scrollTop } = snap;
    document.body.appendChild(ghost);
    ghost.scrollTop = scrollTop;
    const motion = ghost.animate(
      // a phone's sheet goes down, the side panel to the right
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: window.matchMedia && window.matchMedia(PHONE).matches ? 'translateY(40px)' : 'translateX(28px)' }],
      { duration: PANEL_OUT_MS, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
    );
    const done = () => ghost.remove();
    if (motion && motion.finished) motion.finished.then(done, done); else setTimeout(done, PANEL_OUT_MS);
  }
  render() { return <aside ref={this.ref} className={`side side-right editor-panel${this.props.full ? ' sheet-full' : ''}`}>{this.props.children}</aside>; }
}

/** "Diğer" (⋯): the buttons the bar had no room for, in their order; a choice does what the button does. */
function MoreMenu({ items, multiSelect, onPick }) {
  const t = useT();
  return (
    <div className="keys-popover share-popover more-popover" role="menu" aria-label={t('Diğer')}>
      {items.filter((id) => MORE[id] && (id !== 'multi' || coarsePointer())).map((id) => {
        const [Icon, label] = MORE[id];
        return (
          <button key={id} className="download-item" role="menuitem" onClick={() => onPick(id)}>
            <Icon size={18} /><span><b>{t(label)}</b></span>
            {id === 'multi' && multiSelect && <Check size={16} className="more-on" aria-label={t('açık')} />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The whole screen for the drawing, as F11 does on a computer (clinician request 2026-11-12): the browser's
 * own full screen where it allows one (Android, a tablet, a computer). An iPhone's browser allows it to no
 * page; there the app opened from the home screen ("Ana Ekrana Ekle", manifest display: standalone) has no
 * browser bars — `standalone` then, and nothing to offer.
 */
function useFullScreen() {
  const doc = typeof document !== 'undefined' ? document : null;
  const el = doc && doc.documentElement;
  const can = !!(doc && el && ((doc.fullscreenEnabled && el.requestFullscreen) || (doc.webkitFullscreenEnabled && el.webkitRequestFullscreen)));
  const current = () => !!(doc && (doc.fullscreenElement || doc.webkitFullscreenElement));
  const [on, setOn] = React.useState(current);
  React.useEffect(() => {
    if (!doc) return undefined;
    const sync = () => setOn(current());
    doc.addEventListener('fullscreenchange', sync);
    doc.addEventListener('webkitfullscreenchange', sync);
    return () => { doc.removeEventListener('fullscreenchange', sync); doc.removeEventListener('webkitfullscreenchange', sync); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const standalone = typeof window !== 'undefined' && (window.navigator.standalone === true
    || (!!window.matchMedia && window.matchMedia('(display-mode: standalone)').matches));
  const toggle = () => {
    try {
      if (current()) (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
      else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    } catch { /* refused: the page stays as it is */ }
  };
  return { can, on, standalone, toggle };
}

/**
 * The touch mode's sheet (clinician request 2026-11-10): over the lower part of the screen in portrait, a
 * column at the right in landscape. Its handle is drawn: up opens the person's details, down closes them,
 * and down again closes the sheet (the person is let go); a tap on the handle does the same one step.
 */
function TouchSheet({ full, canDock, onFull, onClose, title, children }) {
  const t = useT();
  const drag = React.useRef(null);
  const swallow = React.useRef(false); // the click a drag ends with is not a tap on what it ended on
  const [pull, setPull] = React.useState(0); // how far the sheet follows the finger, in px (down is +)
  const step = (dir) => {
    if (dir < 0) { if (canDock && !full) onFull(true); }
    else if (full && canDock) onFull(false);
    else onClose();
  };
  // where a finger may take the sheet up or down (clinician request 2026-11-12: "a tap opens it, drawn up it
  // opens, drawn down it closes"): its handle and head; docked, also its tiles; never a field being typed in,
  // nor the details' scrolling list
  const grabbable = (el) => {
    if (!el || !el.closest) return false;
    if (el.closest('input, textarea, select, [contenteditable="true"]')) return false;
    if (el.closest('.sheet-grip, .sheet-head, .side-header')) return true;
    return canDock && !full && !!el.closest('.dock-tiles, .dock-add');
  };
  const down = (e) => {
    if (!grabbable(e.target)) return;
    drag.current = { y: e.clientY, id: e.pointerId, moved: false, head: !e.target.closest('button') || !!e.target.closest('.sheet-grip') };
    if (e.currentTarget.setPointerCapture && e.pointerId !== undefined) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
    }
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > 8) d.moved = true;
    if (d.moved) setPull(Math.max(-120, Math.min(260, dy)));
  };
  const up = (e) => {
    const d = drag.current;
    drag.current = null;
    setPull(0);
    if (!d) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) <= 8) {
      // a tap on the handle or on the head's words: one step (docked: open; open: back to the tiles)
      if (d.head) step(full && canDock ? 1 : -1);
      return;
    }
    swallow.current = true;
    if (dy < -40) step(-1);
    else if (dy > 40) step(1);
  };
  const cancel = () => { drag.current = null; setPull(0); };
  // how much of the screen the docked sheet covers, as --touch-sheet-h: the drawing's zoom and Sığdır stand
  // just above it, in reach while people are added (clinician request 2026-11-12)
  const sheetRef = React.useRef(null);
  React.useLayoutEffect(() => {
    const el = sheetRef.current, shell = el && el.closest('.app-shell');
    if (!el || !shell) return undefined;
    const set = () => shell.style.setProperty('--touch-sheet-h', `${Math.max(0, Math.round(window.innerHeight - el.getBoundingClientRect().top))}px`);
    set();
    window.addEventListener('resize', set);
    // the sheet slides in: measured again once it stands still
    el.addEventListener('animationend', set);
    el.addEventListener('transitionend', set);
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(set);
    if (watch) watch.observe(el);
    return () => {
      window.removeEventListener('resize', set); el.removeEventListener('animationend', set); el.removeEventListener('transitionend', set);
      if (watch) watch.disconnect();
      shell.style.removeProperty('--touch-sheet-h');
    };
  }, [full]);
  return (
    <section ref={sheetRef} className={`touch-sheet${full ? ' sheet-full' : ''}`} aria-label={title || t('Kişi')}
      style={pull ? { transform: `translateY(${pull}px)`, transition: 'none' } : undefined}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
      onClickCapture={(e) => { if (swallow.current) { swallow.current = false; e.stopPropagation(); e.preventDefault(); } }}>
      <div className="sheet-grip" role="button" tabIndex={0} aria-label={full && canDock ? t('Ayrıntıları kapat') : full ? t('Kapat') : t('Ayrıntıları aç')}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); step(full && canDock ? 1 : -1); } }}>
        <span aria-hidden="true" />
      </div>
      {/* one slim line: who it is and how to close (the bar below holds the actions); a tap on it opens the details */}
      {canDock && !full && (
        <div className="sheet-head">
          <b className="sheet-title">{title}</b>
          <button className="ui-btn ui-btn-icon sheet-close" onClick={onClose} aria-label={t('Kapat')}><XIcon size={18} /></button>
        </div>
      )}
      <div className="sheet-body">{children}</div>
    </section>
  );
}

/**
 * The edge between the drawing and the side panel: drag it to make the panel wider or narrower
 * (clinician request 2026-11-07), or use ← / → with the keyboard; a double click brings back the usual
 * width. The width is a preference of this device (drawingStyle.js panelWidth).
 */
function PanelResizer({ shellRef, width, onChange }) {
  const t = useT();
  const usual = () => (shellRef.current ? shellRef.current.querySelector('.side-right')?.getBoundingClientRect().width : 0) || 328;
  const clamp = (w) => Math.min(PANEL_WIDTH.max, Math.max(PANEL_WIDTH.min, Math.round(w)));
  const drag = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    if (handle.setPointerCapture && e.pointerId !== undefined) handle.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const right = shellRef.current ? shellRef.current.getBoundingClientRect().right : window.innerWidth;
      onChange(clamp(right - ev.clientX));
    };
    const stop = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', stop); handle.removeEventListener('pointercancel', stop); };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  };
  return (
    <div className="panel-resizer" role="separator" aria-orientation="vertical" tabIndex={0}
      aria-label={t('Yan panelin genişliği')} title={t('Paneli sürükleyerek genişletebilir ya da daraltabilirsiniz; çift tıklandığında ilk genişliğine döner')}
      aria-valuemin={PANEL_WIDTH.min} aria-valuemax={PANEL_WIDTH.max} aria-valuenow={width || undefined}
      onPointerDown={drag} onDoubleClick={() => onChange(0)}
      onKeyDown={(e) => {
        // the arrows size the panel here; they do not also move the selection (keyboardNav)
        if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); onChange(clamp((width || usual()) + 16)); }
        if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); onChange(clamp((width || usual()) - 16)); }
      }} />
  );
}

function App() {
  const {
    pedigreeData, warnings, integrityIssues,
    updateIndividual, addSpouseTo, addChildTo, addChildToUnion,
    setProband, clearProband, setConsultand, clearConsultand, setAdoption, addReproductiveLink, removeReproductiveLink, setOwnGamete, resetPedigree,
    selectedId, selectedId2, selectedIds, selectIndividual, clearSelection, selectUnion,
    updateMany, setFindingStatusMany, addFindingMany,
    deleteIndividual, createUnionBetween, addCustomConsanguinity,
    reorderChild, setUnionRelationshipBackground, setUnionStatus,
    setMultipleBirth, addMultipleSibling, setMultipleZygosity, leaveMultipleBirth, setGroupCount, splitGroup, mergeIntoGroup,
    addFinding, setFindingStatus, setFindingStyle, renameFinding, wizardData, updateWizardData,
    addParentsTo, addSiblingTo, moveSideways, dropOnto, setFindingOnset, setChildlessness, setLineNote, setPregnancyKind, setGestationWeeks,
    undo, redo, _history, _future,
    dismissedWarningIds, dismissWarning,
    actionNotice, dismissActionNotice, autosaveFailed,
    exportProjectFile, openProjectFile, importPedFile, relayout, doc, setPatientName, setProbandBirthDate, newFromTemplate,
  } = usePedigreeStore();
  const t = useT();
  const { ui: uiLang, drawing: drawingChoice } = useLang();
  const drawLang = drawingLangOf({ ui: uiLang, drawing: drawingChoice });
  // the page's language, for screen readers and the browser's spelling and hyphenation
  React.useEffect(() => { document.documentElement.lang = uiLang; }, [uiLang]);
  // The page itself never scrolls: everything lives in one screen. A phone's browser still shifts it up to
  // show a box being typed in (the patient's name) and could leave it there once the keyboard went away —
  // the top bar out of sight with no way back (clinician report 2026-11-12, iPhone). Whenever nothing is
  // being typed, the page is put back at its top.
  React.useEffect(() => {
    const typing = () => {
      const el = document.activeElement;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };
    const shifted = () => (window.scrollY || window.pageYOffset || 0) !== 0 || (window.scrollX || window.pageXOffset || 0) !== 0
      || document.documentElement.scrollTop !== 0 || document.body.scrollTop !== 0;
    // A phone's browser can also leave the page zoomed in (a pinch on the bar or the sheet, a double tap,
    // a box it zoomed into): the top bar out of sight, the sheet cut on both sides (clinician report
    // 2026-11-12, iPhone). The drawing has its own zoom; the page's is put back to 1 once nothing is typed
    // — a browser takes the zoom back when the page briefly forbids it.
    const zoomed = () => ((window.visualViewport && window.visualViewport.scale) || 1) > 1.01;
    const unzoom = () => {
      const meta = document.querySelector('meta[name="viewport"]');
      if (!meta || meta.dataset.resetting) return;
      const was = meta.getAttribute('content');
      meta.dataset.resetting = '1';
      meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
      setTimeout(() => { meta.setAttribute('content', was); delete meta.dataset.resetting; }, 400);
    };
    const back = () => {
      if (typing()) return;
      if (zoomed()) unzoom();
      if (!shifted()) return;
      try { window.scrollTo(0, 0); } catch { /* not in this browser */ }
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    // after a box loses focus, once the keyboard has gone
    const later = () => setTimeout(back, 120);
    window.addEventListener('scroll', back, { passive: true });
    document.addEventListener('focusout', later);
    const vv = window.visualViewport;
    if (vv) { vv.addEventListener('resize', later); vv.addEventListener('scroll', later); }
    return () => {
      window.removeEventListener('scroll', back);
      document.removeEventListener('focusout', later);
      if (vv) { vv.removeEventListener('resize', later); vv.removeEventListener('scroll', later); }
    };
  }, []);
  // notices already on screen are worded again in the new language
  const shownLang = React.useRef(uiLang);
  React.useEffect(() => {
    if (shownLang.current === uiLang) return;
    shownLang.current = uiLang;
    usePedigreeStore.getState().retell();
  }, [uiLang]);
  // the top bar's birth date: the proband's, else the consultand's (clinician decision 2026-11-01)
  const probandNode = subjectOf(doc.graph.individuals);
  // tablet: taps add people to the selection while this is on (a mouse has Cmd/Ctrl/Shift-click)
  const [multiSelect, setMultiSelect] = React.useState(false);
  // the top bar's "Atıf" and "Geri bildirim" windows (clinician request 2026-11-04)
  const [infoOpen, setInfoOpen] = React.useState(null); // 'cite' | 'feedback'
  // "Diğer" (⋯): the buttons the top bar had no room for (a tablet; toolbarFit.js)
  const [moreItems, setMoreItems] = React.useState(null);
  const [focusTick, setFocusTick] = React.useState(0);
  const ringRef = React.useRef(null);
  // the ring can be put away while the person stays selected (clinician
  // request 2026-10-27); selecting a person, the same one too, brings it back
  const [ringHidden, setRingHidden] = React.useState(false);
  // another selection brings it back (set while rendering, not in an effect: no extra render)
  const [ringFor, setRingFor] = React.useState(selectedId);
  if (ringFor !== selectedId) { setRingFor(selectedId); setRingHidden(false); }
  // how the drawing looks: chosen by whoever looks at it, kept on this device
  // (clinician request 2026-10-28; drawingStyle.js)
  const { view, setView } = useViewSettings();
  const drawing = React.useMemo(() => drawingSpec(view), [view]);
  // the screens' colour theme and the ring's see-through parts (Ayarlar → Görünüm; clinician 2026-11-07)
  React.useEffect(() => {
    const root = document.documentElement;
    if (view.theme && view.theme !== 'indigo') root.setAttribute('data-theme', view.theme); else root.removeAttribute('data-theme');
    root.style.setProperty('--ring-alpha', String(ringAlphaOf(view)));
    // mostly see-through: at night its words take the drawing's dark ink (ui.css)
    if (ringAlphaOf(view) < 0.5) root.setAttribute('data-ring-clear', 'high'); else root.removeAttribute('data-ring-clear');
  }, [view]);
  // day or night (clinician 2026-11-11): chosen, or the device's, followed while the page is open
  const colourMode = view.mode;
  React.useEffect(() => {
    const root = document.documentElement;
    const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const apply = () => root.setAttribute('data-mode', shownMode({ mode: colourMode }, !!(mq && mq.matches)));
    apply();
    if (!mq || colourMode !== 'system') return undefined;
    mq.addEventListener ? mq.addEventListener('change', apply) : mq.addListener(apply);
    return () => { mq.removeEventListener ? mq.removeEventListener('change', apply) : mq.removeListener(apply); };
  }, [colourMode]);
  // another text size: the layout gives the text its room again (symbolText.setTextScale; clinician 2026-11-05)
  const textSize = React.useRef(drawing.legendScale);
  React.useEffect(() => {
    if (textSize.current === drawing.legendScale) return;
    textSize.current = drawing.legendScale;
    usePedigreeStore.getState().refreshLayout();
  }, [drawing.legendScale]);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsAt, setSettingsAt] = React.useState('language'); // the section Ayarlar opens at
  const openSettings = (at = 'language') => { setSettingsAt(at); setSettingsOpen(true); };

  // the guided tour (Tour.jsx; clinician request 2026-11-09): on a sample family, the patient's
  // drawing kept aside and given back when it ends; offered once on the first opening
  const [tourIds, setTourIds] = React.useState(null);
  const startTour = () => {
    flushDrafts();
    setMoreItems(null); setDownloadOpen(false); setSettingsOpen(false); setInfoOpen(null); setNewMenu(false); setOpenHelp(false); setAboutOpen(false);
    setView({ tourOffer: false });
    setTourIds(usePedigreeStore.getState().startTour());
  };
  const endTour = () => { usePedigreeStore.getState().endTour(); setTourIds(null); };
  const phoneScreen = usePhone();
  const phone = view.touchMode === 'always' || (view.touchMode !== 'off' && phoneScreen); // the touch mode
  const touch = phone;
  // iPhone: a pinch outside the drawing zooms the whole page (it ignores touch-action there); the drawing's own
  // pinch works by touches and is untouched (clinician report 2026-11-12)
  React.useEffect(() => {
    if (!touch) return undefined;
    const stop = (e) => { if (!(e.target && e.target.closest && e.target.closest('#pedigree-svg'))) e.preventDefault(); };
    document.addEventListener('gesturestart', stop, { passive: false });
    return () => document.removeEventListener('gesturestart', stop);
  }, [touch]);
  const tourCtx = tourIds && {
    ids: tourIds,
    coarse: coarsePointer(),
    select: (id) => { usePedigreeStore.getState().selectIndividual(id); setRingHidden(false); },
    clear: () => usePedigreeStore.getState().clearSelection(),
    unionOf: (a, b) => (usePedigreeStore.getState().doc.graph.unions.find((x) => x.partners.includes(a) && x.partners.includes(b)) || {}).id,
    // the couple line: selecting it selects the couple (the pair panel: relationship, consanguinity, children)
    selectCouple: (a, b) => {
      const u = usePedigreeStore.getState().doc.graph.unions.find((x) => x.partners.includes(a) && x.partners.includes(b));
      if (u) usePedigreeStore.getState().selectUnion(u.id);
    },
    openSettings: (at) => openSettings(at),
    openNew: () => setNewMenu(true),
    openRelation: () => setRelationOpen(true),
    openSave: () => setDownloadOpen(true),
    // every window and menu a step opened, closed before the next step sets its screen up
    closeAll: () => { setSettingsOpen(false); setNewMenu(false); setRelationOpen(false); setDownloadOpen(false); setPedOpen(false); setMoreItems(null); setSheetFull(false); },
    // the touch screen's tour (Tour TOUCH_STEPS)
    touch,
    openDetails: () => setSheetFull(true),
    openMenu: () => setMoreItems(TOUCH_MENU),
  };
  const [openHelp, setOpenHelp] = React.useState(false); // "Aç"'s window: which files it opens
  // the logo: what PediTree is, its version and licence (the rest: Ayarlar → Hakkında)
  const [aboutOpen, setAboutOpen] = React.useState(false);
  // a phone: the patient's name and date of birth in a small window of their own (the bar has no room)
  const [patientOpen, setPatientOpen] = React.useState(false);
  const fullScreen = useFullScreen();
  const [fullHelp, setFullHelp] = React.useState(false);
  // a phone: the side panel's sheet at half height, or drawn up to the whole screen
  const [sheetFull, setSheetFull] = React.useState(false);
  // a phone's browser closes a tab left in the background more readily: unsaved work is easier to lose
  const [saveTipClosed, setSaveTipClosed] = React.useState(false);
  // an export in the style the clinician chose for exports, the typeface inside the file;
  // fontMissing: the typeface could not be put in (the file then shows a system typeface elsewhere)
  const exportOpts = async (extra = {}) => {
    const spec = exportSpec(view);
    let fontCss = '';
    let fontMissing = false;
    try { fontCss = await embeddedFontCss(spec.fontId); } catch { fontMissing = true; }
    return { ...extra, spec, fontCss, fontMissing, lang: drawLang };
  };
  const FONT_MISSING_TEXT = t('Seçilen yazı tipi dosyaya eklenemedi. Dosya başka bir bilgisayarda açıldığında yazılar o bilgisayarın yazı tipiyle görüntülenir.');
  const exportNoticeFor = (assessment, opts) => {
    const lines = [];
    if (assessment.warnings.length > 0) lines.push(`${t('Dışa aktarıldı — dikkat edilmesi gerekenler:')}\n${assessment.warnings.join('\n')}`);
    if (opts.fontMissing) lines.push(FONT_MISSING_TEXT);
    return lines.length ? lines.join('\n') : null;
  };
  const [exportError, setExportError] = React.useState(null);
  const [exportNotice, setExportNotice] = React.useState(null);
  const svgRef = React.useRef(null);
  // the top bar keeps to one row: words fold to icons as the window narrows (toolbarFit.js)
  const toolbarRef = React.useRef(null);
  const shellRef = React.useRef(null); // the page's grid: the side panel's edge is dragged against it
  // the touch sheet, open, starts a little under the top bar, however tall the bar is (a phone's notch adds to
  // it; clinician 2026-11-12: the open sheet touched the bar) — the bar's height as --touch-bar-h
  React.useLayoutEffect(() => {
    const bar = toolbarRef.current, shell = shellRef.current;
    if (!touch || !bar || !shell) return undefined;
    const set = () => shell.style.setProperty('--touch-bar-h', `${Math.round(bar.getBoundingClientRect().bottom)}px`);
    set();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const watch = new ResizeObserver(set);
    watch.observe(bar);
    return () => watch.disconnect();
  }, [touch]);
  React.useLayoutEffect(() => {
    return watchToolbar(toolbarRef.current);
  }, [uiLang]);

  const selectedNode = pedigreeData.individuals.find(i => i.id === selectedId);
  const selectedNode2 = pedigreeData.individuals.find(i => i.id === selectedId2);
  const selectedNodes = (selectedIds || []).map(id => pedigreeData.individuals.find(i => i.id === id)).filter(Boolean);
  // adoption card: the person's adoption and the couples that may adopt them
  // (not the own parents, their own couples or a descendant's)
  const adoptionInfo = React.useMemo(() => {
    if (!selectedId) return null;
    const g = doc.graph;
    const bioRel = g.parentChildRelationships.find(r => r.children.includes(selectedId));
    const { unionName } = clinicalNamer(pedigreeData);
    const couples = g.unions
      .filter(u => u.id !== bioRel?.unionId && !u.partners.includes(selectedId)
        && !u.partners.some(p => ancestorsOf(g, p).has(selectedId)))
      .map(u => ({ id: u.id, name: unionName(u.id) }));
    return { current: adoptionOf(g, selectedId), couples, hasParents: !!bioRel };
  }, [doc, selectedId, pedigreeData]);
  // assisted reproduction card: this child's donors / carrier, whom this person is a donor for, who could be one
  const reproInfo = React.useMemo(() => {
    if (!selectedId) return null;
    const g = doc.graph;
    const { nameOf } = clinicalNamer(pedigreeData);
    const links = (g.reproductiveLinks || []).filter(l => l.childId === selectedId);
    const parentsRel = g.parentChildRelationships.find(r => r.children.includes(selectedId));
    const parents = parentsRel ? (g.unions.find(u => u.id === parentsRel.unionId)?.partners || []) : [];
    const taken = (roles) => links.some(l => roles.includes(l.role));
    const me = g.individuals.find(i => i.id === selectedId);
    // two partners of the same reproductive sex: whose own egg (two women) or sperm (two men) — clinician 2026-11-10
    const both = parents.length === 2 && sameReproductiveSex(...parents.map(id => g.individuals.find(i => i.id === id)));
    return {
      own: both && !isPregnancy(me) ? { gamete: both === 'female' ? 'egg' : 'sperm', partners: parents.map(id => ({ id, name: nameOf(id) })), current: ownGameteOf(g, selectedId) } : null,
      links: links.map(l => ({ ...l, label: REPRO_LABEL[l.role], name: nameOf(l.personId) })),
      canHave: !!parentsRel && me?.relation !== ART_DONOR_RELATION,
      roleOf: (g.reproductiveLinks || []).filter(l => l.personId === selectedId).map(l => ({ label: REPRO_LABEL[l.role], childName: nameOf(l.childId) })),
      blocked: { sperm_donor: taken(['sperm_donor']), egg_donor: taken(EGG_SOURCE), gestational_carrier: taken(CARRIER_ROLES), surrogate: taken([...EGG_SOURCE, ...CARRIER_ROLES]) },
      candidates: g.individuals
        .filter(i => i.id !== selectedId && !parents.includes(i.id) && !i.placeholder && !isPregnancy(i) && i.count === undefined && (i.sex === 'male' || i.sex === 'female')
          && !ancestorsOf(g, i.id).has(selectedId))
        .map(i => ({ id: i.id, name: `${nameOf(i.id)} (${i.sex === 'male' ? t('erkek') : t('kadın')})` })),
    };
  }, [doc, selectedId, pedigreeData, t]);
  // siblings chosen together can become one numbered symbol; the operation itself says whether and why not
  const mergeCheck = React.useMemo(() => ((selectedIds || []).length >= 2 ? checkMerge(doc, selectedIds) : null), [doc, selectedIds]);

  const errorIssues = (integrityIssues || []).filter(i => i.severity === 'error');
  const warningIssues = (integrityIssues || []).filter(i => i.severity === 'warning');

  // v0.3a.2 — dismissible warnings. Dismissal is display-only: it filters
  // what's shown here, but never touches `integrityIssues` itself, so
  // gateExport() (below) still sees the real, undismissed state and blocks
  // export exactly as before — dismissing a warning cannot be used to
  // silently bypass an export-blocking condition.
  const visibleErrorIssues = withStableIdsExcludingDismissed(errorIssues, dismissedWarningIds);
  const visibleWarningIssues = withStableIdsExcludingDismissed(warningIssues, dismissedWarningIds);
  const visibleWarnings = withStableIdsExcludingDismissed(warnings, dismissedWarningIds);
  const notices = clinicalNotices({ errorIssues: visibleErrorIssues, warningIssues: visibleWarningIssues, warnings: visibleWarnings }, pedigreeData);

  /**
   * Severity-tiered export gate, run before both SVG and PNG export:
   *   fatal   → block, explain why, never touch exportSVG/exportPNG.
   *   error   → confirm() before proceeding; declining cancels the export.
   *   warning → proceed, but show what was flagged.
   * Returns null if the export should not proceed (fatal, or user declined
   * the error-tier confirmation).
   */
  const gateExport = () => {
    flushDrafts(); // a box still being typed in is part of the picture
    const zoomTransform = svgRef.current ? d3.zoomTransform(svgRef.current) : null;
    const assessment = assessExportReadiness({
      pedigreeData, integrityIssues, svgElement: svgRef.current, zoomTransform,
    });

    if (!assessment.canExport) {
      setExportNotice(null);
      setExportError(`${t('Çizim dışa aktarılamadı; önce aşağıdaki sorunların giderilmesi gerekiyor:')}\n${assessment.fatal.join('\n')}`);
      return null;
    }

    if (assessment.errors.length > 0) {
      const proceed = window.confirm(
        `${t('Pedigride ciddi veri kalitesi sorunları var:')}\n\n${assessment.errors.join('\n')}\n\n${t('Yine de dışa aktarmak istiyor musunuz?')}`
      );
      if (!proceed) {
        setExportError(null);
        setExportNotice(t('Dışa aktarma iptal edildi.'));
        return null;
      }
    }

    return assessment;
  };

  const handleExportSVG = async () => {
    const assessment = gateExport();
    if (!assessment) return;
    try {
      const opts = await exportOpts();
      exportSVG(svgRef.current, exportFileName(doc.patientName, 'svg', undefined, drawLang), opts);
      markDownloaded();
      setExportError(null);
      setExportNotice(exportNoticeFor(assessment, opts));
    } catch (err) {
      setExportNotice(null);
      setExportError(err.message || t('SVG dışa aktarılamadı.'));
    }
  };

  const handleExportPNG = async () => {
    const assessment = gateExport();
    if (!assessment) return;
    try {
      const opts = await exportOpts();
      await exportPNG(svgRef.current, exportFileName(doc.patientName, 'png', undefined, drawLang), opts);
      markDownloaded();
      setExportError(null);
      setExportNotice(exportNoticeFor(assessment, opts));
    } catch (err) {
      setExportNotice(null);
      setExportError(err.message || t('PNG dışa aktarılamadı.'));
    }
  };

  const handleExportPDF = async () => {
    const assessment = gateExport();
    if (!assessment) return;
    try {
      const opts = await exportOpts();
      await exportPDF(svgRef.current, exportFileName(doc.patientName, 'pdf', undefined, drawLang), opts);
      markDownloaded();
      setExportError(null);
      setExportNotice(exportNoticeFor(assessment, opts));
    } catch (err) {
      setExportNotice(null);
      setExportError(err.message || t('PDF dışa aktarılamadı.'));
    }
  };

  // Share (WhatsApp, Gmail … through the device's share sheet; clinician
  // request 2026-10-25). The images are made when the menu opens, so the
  // share itself still counts as the tap that asked for it (Safari).
  const [share, setShare] = React.useState(null); // null | { withName?: File, noName?: File, busy }
  const openShare = async () => {
    if (share) { setShare(null); return; }
    const assessment = gateExport();
    if (!assessment) return;
    setShare({ busy: true });
    try {
      const name = (doc.patientName || '').trim();
      const opts = await exportOpts();
      const noName = new File([await pngBlob(svgRef.current, { ...opts, withoutPatientName: true })], exportFileName('', 'png', undefined, drawLang), { type: 'image/png' });
      const withName = name ? new File([await pngBlob(svgRef.current, opts)], exportFileName(name, 'png', undefined, drawLang), { type: 'image/png' }) : null;
      setShare({ withName, noName, busy: false });
      if (opts.fontMissing) setExportNotice(FONT_MISSING_TEXT);
    } catch (err) {
      setShare(null);
      setExportError(err.message || t('Paylaşılacak resim hazırlanamadı.'));
    }
  };
  const doShare = async (file) => {
    try {
      const r = await shareFile(file, t('Pedigri'));
      if (r === 'unsupported') {
        downloadBlob(file, file.name);
        setExportNotice(t('Bu tarayıcı doğrudan paylaşımı desteklemediği için resim bilgisayarınıza indirildi. İndirilen dosyayı e-posta ya da mesaj uygulamasında ek olarak gönderebilirsiniz.'));
      }
      setShare(null);
    } catch (err) {
      setExportError(err.message);
    }
  };

  // Printing (clinician request 2026-10-25): one A4 page, landscape or
  // portrait by the drawing's shape; the same canonical copy as the export
  // (no selection, no zoom), the date at the foot.
  const printRef = React.useRef(null);
  const handlePrint = () => {
    const assessment = gateExport();
    if (!assessment || !svgRef.current || !printRef.current) return;
    const clone = prepareExportSvg(svgRef.current, { spec: exportSpec(view) });
    clone.removeAttribute('width');
    clone.removeAttribute('height');
    clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const [, , w, h] = (svgRef.current.getAttribute('viewBox') || '0 0 4 3').split(/[\s,]+/).map(Number);
    const root = printRef.current;
    root.replaceChildren(clone);
    const foot = document.createElement('div');
    foot.className = 'print-foot';
    foot.textContent = `PediTree · ${new Date().toLocaleDateString(drawLang === 'en' ? 'en-GB' : 'tr-TR')}`;
    root.appendChild(foot);
    let page = document.getElementById('print-page');
    if (!page) { page = document.createElement('style'); page.id = 'print-page'; document.head.appendChild(page); }
    page.textContent = `@page { size: A4 ${w >= h ? 'landscape' : 'portrait'}; margin: 10mm; }`;
    const done = () => { root.replaceChildren(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setDownloadOpen(false);
  };

  // "Kaydet" menu: the picture (PNG, PDF, SVG), the PediTree file, PED (clinician 2026-11-10: one place)
  const [downloadOpen, setDownloadOpen] = React.useState(false);
  const [pedPhenotype, setPedPhenotype] = React.useState('affected');
  // PED's one question shows when PED is chosen (clinician 2026-11-05: the menu said too much)
  const [pedOpen, setPedOpen] = React.useState(false);
  const handleExportPed = () => {
    flushDrafts();
    const st = usePedigreeStore.getState();
    const text = toPed(st.doc.graph, st.pedigreeData.nodes, { phenotype: pedPhenotype, familyId: drawLang === 'en' ? 'FAM1' : 'AILE1' });
    // no patient name in the file, nor in its name (it goes to a lab)
    downloadBlob(new Blob([text], { type: 'text/plain' }), exportFileName('', 'ped', undefined, drawLang));
    setDownloadOpen(false);
  };

  // "Yeni": the nuclear family, or a ready-made consanguinity template
  // (graph/templates.js; clinician decision 2026-10-25)
  const [newMenu, setNewMenu] = React.useState(false);
  // the related family opens in a window of its own (clinician request 2026-11-01)
  const [relationOpen, setRelationOpen] = React.useState(false);
  const handleNewPedigree = (spec = null) => {
    setNewMenu(false);
    setRelationOpen(false);
    if (window.confirm(t('Yeni bir pedigri başlatılsın mı?\n\nAçık olan pedigri “Kaydet” ile bir dosyaya kaydedilmediyse silinir ve geri getirilemez.'))) {
      // resetPedigree() / newFromTemplate() clear selection and the undo
      // stack — see usePedigreeStore.js. Only export-banner state (local to
      // App.jsx) is cleared here.
      if (spec === 'childless') usePedigreeStore.getState().newChildlessCouple('infertile');
      else if (spec) newFromTemplate(spec); else resetPedigree();
      setExportError(null);
      setExportNotice(null);
    }
  };

  // the toolbar's pop-up windows (Yeni, Paylaş, Diğer, keyboard help) close
  // on a click anywhere outside them, or Escape (clinician request 2026-10-27)
  const popupOpen = !!infoOpen || newMenu || relationOpen || downloadOpen || !!share || settingsOpen || aboutOpen || openHelp || !!moreItems || patientOpen || fullHelp;
  const popupClosedAt = React.useRef(-Infinity);
  // The tap that closes a pop-up window does only that (clinician request
  // 2026-10-27): the click that ends that same tap is stopped before it
  // reaches the drawing — on a person as well as on the empty canvas (found
  // by screen.test.js). Only that one click: a later click goes through.
  React.useEffect(() => {
    const onClick = (e) => {
      if (performance.now() - popupClosedAt.current > 1000) return;
      popupClosedAt.current = -Infinity;
      e.stopPropagation();
      e.preventDefault();
    };
    const onDown = () => { if (performance.now() - popupClosedAt.current > 50) popupClosedAt.current = -Infinity; };
    document.addEventListener('click', onClick, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => { document.removeEventListener('click', onClick, true); document.removeEventListener('pointerdown', onDown, true); };
  }, []);
  React.useEffect(() => {
    if (!popupOpen) return;
    const close = (except) => {
      if (except !== 'cite' && except !== 'feedback') setInfoOpen(null);
      if (except !== 'new') setNewMenu(false);
      if (except !== 'relation') setRelationOpen(false);
      if (except !== 'download') setDownloadOpen(false);
      if (except !== 'open') setOpenHelp(false);
      if (except !== 'share') setShare(null);
      if (except !== 'settings') setSettingsOpen(false);
      if (except !== 'about') setAboutOpen(false);
      if (except !== 'patient') setPatientOpen(false);
      if (except !== 'more') setMoreItems(null);
      if (except !== 'fullscreen') setFullHelp(false);
    };
    const onDown = (e) => {
      const inside = e.target.closest && e.target.closest('[data-popup]');
      close(inside ? inside.dataset.popup : null);
      // the click of this same tap, outside the window, does nothing else
      if (!inside) popupClosedAt.current = performance.now();
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation(); // Escape closes the window, not the selection
      close(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [popupOpen]);

  const handleUndo = () => {
    undo();
  };

  const handleRedo = () => {
    redo();
  };

  const [warningsOpen, setWarningsOpen] = React.useState(false); // notes collapsed; errors always shown
  const fileInputRef = React.useRef(null);

  // Project file (schema v2 document, .peditree.json) — Faz 2b.
  const handleSaveProject = () => {
    flushDrafts(); // what is still being typed goes into the file (second audit 2026-10-25)
    const blob = new Blob([exportProjectFile()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName(doc.patientName, 'peditree.json', undefined, drawLang);
    markDownloaded();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  // "Aç": explains first which files it opens, unless the clinician turned that off (openHelp: above)
  const chooseFile = () => { setOpenHelp(false); fileInputRef.current && fileInputRef.current.click(); };
  const handleOpenClick = () => { if (view.openHelp) setOpenHelp(v => !v); else chooseFile(); };
  // "Diğer" (⋯): each button the bar had no room for does what it does on the bar
  const runMore = (id) => {
    setMoreItems(null);
    if (id === 'cite' || id === 'feedback') setInfoOpen(id);
    else if (id === 'print') handlePrint();
    else if (id === 'share') openShare();
    else if (id === 'multi') setMultiSelect(v => !v);
    else if (id === 'relayout') relayout();
    else if (id === 'new') setNewMenu(true);
    else if (id === 'open') handleOpenClick();
    else if (id === 'tour') startTour();
    else if (id === 'redo') handleRedo();
    else if (id === 'settings') openSettings();
    else if (id === 'undo') handleUndo();
    else if (id === 'about') setAboutOpen(true);
  };
  const handleOpenProject = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    openFile(file);
  };
  // a file dropped on the drawing opens as "Aç" would
  const [dropping, setDropping] = React.useState(false);
  const dragHasFile = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
  const onFileDragOver = (e) => { if (!dragHasFile(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropping(true); };
  const onFileDragLeave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropping(false); };
  const onFileDrop = (e) => {
    if (!dragHasFile(e)) return;
    e.preventDefault();
    setDropping(false);
    openFile(e.dataTransfer.files && e.dataTransfer.files[0]);
  };
  function openFile(file) {
    if (!file) return;
    // asks whenever work would be replaced, also when only the patient's name was typed
    if (needsLeaveWarning(doc, downloadedDoc.current) && !window.confirm(t('Açık olan pedigrinin yerine dosyadaki pedigri yüklensin mi? Bu işlem “Geri al” ile geri alınabilir.'))) return;
    // a project file is JSON; anything else is read as a PED file
    file.text().then(text => (/\.(ped|fam|txt)$/i.test(file.name) || !text.trim().startsWith('{') ? importPedFile(text) : openProjectFile(text)))
      .catch(() => openProjectFile(null));
  }

  // Nothing is stored once the tab closes (session autosave, clinician
  // decision 2026-10-25): leaving with changes not downloaded asks first
  const downloadedDoc = React.useRef(null);
  const markDownloaded = () => { downloadedDoc.current = usePedigreeStore.getState().doc; };
  React.useEffect(() => {
    const onLeave = (e) => {
      flushDrafts();   // a box still being typed in
      flushAutosave(); // a reload keeps the very last edit
      // during the tour, the patient's drawing kept aside is what would be lost (startTour)
      const st = usePedigreeStore.getState();
      if (!needsLeaveWarning(st.tourBackup ? st.tourBackup.doc : st.doc, downloadedDoc.current)) return;
      e.preventDefault();
      e.returnValue = '';
    };
    // a tablet often leaves without "beforeunload": the tab goes to the background, or the
    // browser reloads or discards it; the last edit is written then (clinician report 2026-11-09)
    const onHide = () => { flushDrafts(); flushAutosave(); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') onHide(); };
    window.addEventListener('beforeunload', onLeave);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', onLeave);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Keyboard shortcuts (clinician request 2026-10-25); never while typing
  const keyRef = React.useRef(null);
  React.useEffect(() => {
    keyRef.current = { undo, redo, handleSaveProject, handlePrint, stepBack, deleteIndividual, selectedNodes, pedigreeData, selectIndividual, addParentsTo, addSpouseTo, moveSideways };
  });
  React.useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const k = keyRef.current;
      if (!k) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 's') { e.preventDefault(); k.handleSaveProject(); return; }
      if (mod && key === 'p') { e.preventDefault(); k.handlePrint(); return; }
      if (typing) { if (e.key === 'Escape') t.blur(); return; }
      if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) k.redo(); else k.undo(); return; }
      if (mod && key === 'y') { e.preventDefault(); k.redo(); return; }
      if (mod || e.altKey) return;
      if (e.key === 'Escape') { k.stepBack(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const [only] = k.selectedNodes;
        if (k.selectedNodes.length !== 1 || only.proband || only.placeholder) return;
        e.preventDefault();
        if (window.confirm(tNow('Seçili kişi silinsin mi?\n\nKişinin çocukları silinmez ve diğer ebeveynlerine bağlı kalır. Silme işlemi “Geri al” (Cmd/Ctrl+Z) ile geri alınabilir.'))) k.deleteIndividual(only.id);
        return;
      }
      const zoom = { '+': tk('Yakınlaştır'), '=': tk('Yakınlaştır'), '-': tk('Uzaklaştır'), '0': tk('Sığdır') }[e.key];
      if (zoom) { document.querySelector(`.zoom-controls button[aria-label="${tNow(zoom)}"]`)?.click(); return; }
      // one person selected: arrows move around the drawing, letters work the ring
      if (k.selectedNodes.length !== 1) return;
      const [me] = k.selectedNodes;
      const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
      if (dir && e.shiftKey && (dir === 'left' || dir === 'right')) {
        e.preventDefault();
        k.moveSideways(me.id, dir); // with the partner or among siblings
        setFocusTick((n) => n + 1);
        return;
      }
      if (dir) {
        e.preventDefault();
        const next = nextPerson(k.pedigreeData, me.id, dir);
        if (!next) return;
        k.selectIndividual(next);
        setFocusTick((n) => n + 1); // the drawing moves the focus to the new selection
        return;
      }
      const lang = currentLang();
      const action = ringKeysFor(lang)[e.key.toLocaleLowerCase(lang === 'tr' ? 'tr' : 'en')];
      if (!action || me.placeholder) return;
      e.preventDefault();
      if (action === 'parents') { k.addParentsTo(me.id, {}); return; }
      if (action === 'spouse') { k.addSpouseTo(me.id, me.sex === 'female' ? 'male' : 'female'); return; }
      // its first control takes the focus; a put-away ring comes back first
      if (ringRef.current) ringRef.current.open(action);
      else { setRingHidden(false); requestAnimationFrame(() => ringRef.current?.open(action)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleNodeSelect = (id, opts) => {
    setRingHidden(false);
    selectIndividual(id, opts);
  };

  // a tap on an empty part of the drawing (or Escape) steps back one level:
  // an open ring menu closes back to the ring, then the ring goes while the
  // person stays selected, then the selection goes (clinician request 2026-10-27)
  const ringShown = !!selectedNode && !selectedNode.placeholder && !selectedNode2 && (selectedIds || []).length <= 1 && !ringHidden;
  function stepBack() {
    if (ringShown && ringRef.current?.back()) return;
    if (ringShown) { setRingHidden(true); return; }
    clearSelection();
  }
  // one function for the drawing's lifetime, so a click handler never forces a redraw
  const stepBackRef = React.useRef(stepBack);
  stepBackRef.current = stepBack;
  // the tap that closed a pop-up window does only that
  const onBackgroundClick = React.useCallback(() => stepBackRef.current(), []);

  // the ring round the selected person, or (touch mode) its labelled tiles in the sheet
  // touch mode: one person chosen gets the tiles; two people, a couple or several go straight to the details
  const dockable = !!selectedNode && !selectedNode.placeholder && !selectedNode2 && (selectedIds || []).length <= 1;
  const touchTitle = selectedNode && !selectedNode2 ? [computePedigreeIds(pedigreeData.nodes || []).get(selectedNode.id)?.displayId,
    !selectedNode.placeholder && kinTerm(pedigreeData, selectedNode.id), selectedNode.displayLabel].filter(Boolean).join(' · ') : '';
  const ringOf = (anchor, panBy, dock) => (
            <RadialAddMenu ref={ringRef} anchor={anchor} node={selectedNode} pedigreeData={pedigreeData} onNeedRoom={panBy} dock={dock} onDetails={dock ? () => setSheetFull(true) : undefined}
              onAddSibling={addSiblingTo} onAddSpouse={addSpouseTo} onAddParents={addParentsTo} onAddTwin={addMultipleSibling}
              onUpdate={updateIndividual} onSetProband={setProband} onClearProband={clearProband} onSetConsultand={setConsultand} onClearConsultand={clearConsultand}
              onAddFinding={addFinding} onSetFindingStatus={setFindingStatus} onSetFindingStyle={setFindingStyle} onSetFindingOnset={setFindingOnset} onRenameFinding={renameFinding}
              onAddChild={(unionId, sex, targetId, extra) => (unionId ? addChildToUnion(unionId, sex, extra) : addChildTo(targetId, sex, extra))}
              onSetChildlessness={setChildlessness}
              sameSex={!!view.sameSexPartners} />
  );
  const editorEl = (
        <IndividualEditor
          node={selectedNode}
          node2={selectedNode2}
          pedigreeData={pedigreeData}
          onUpdate={updateIndividual}
          onAddSpouse={addSpouseTo}
          onAddChild={(unionId, sex, targetId, extra) => {
            if (unionId) {
              addChildToUnion(unionId, sex, extra);
            } else if (targetId) {
              addChildTo(targetId, sex, extra);
            }
          }}
          onSetProband={setProband}
          onClearProband={clearProband}
          onDeleteIndividual={deleteIndividual}
          onCreateUnion={createUnionBetween}
          onMakeSiblings={addCustomConsanguinity}
          onClearSelection={clearSelection}
          onReorderChild={reorderChild}
          onSetUnionRelationshipBackground={setUnionRelationshipBackground}
          onSetLineNote={setLineNote}
          onSetUnionStatus={setUnionStatus}
          onSetChildlessness={setChildlessness}
          onSetPregnancyKind={setPregnancyKind}
          onSetGestationWeeks={setGestationWeeks}
          onSetMultipleBirth={setMultipleBirth}
          onAddMultiple={addMultipleSibling}
          onSetZygosity={setMultipleZygosity}
          onLeaveMultiple={leaveMultipleBirth}
          onSetGroupCount={setGroupCount}
          onSplitGroup={splitGroup}
          mergeCheck={mergeCheck}
          adoptionInfo={adoptionInfo}
          onSetAdoption={setAdoption}
          reproInfo={reproInfo}
          onAddRepro={addReproductiveLink}
          onRemoveRepro={removeReproductiveLink}
          onSetOwnGamete={setOwnGamete}
          onMergeGroup={mergeIntoGroup}
          onAddFinding={addFinding}
          onSetFindingStatus={setFindingStatus}
          onSetFindingStyle={setFindingStyle}
          selectedNodes={selectedNodes}
          onUpdateMany={updateMany}
          onSetFindingStatusMany={setFindingStatusMany}
          onAddFindingMany={addFindingMany}
          wizardParents={wizardData.parents}
          onSetParentsField={(field, value) => updateWizardData('parents', field, value)}
          onAddParents={addParentsTo}
          onAddSibling={addSiblingTo}
        />
  );
  return (
    <>
    <div className={`app-shell${selectedNode || selectedNode2 ? ' has-editor' : ''}${touch ? ' touch' : ''}`} ref={shellRef}
      style={view.panelWidth ? { '--panel-w': `${view.panelWidth}px` } : undefined}>

      {/* KI-5/KI-6: toolbar and notices sit in normal flow ABOVE the canvas —
          they can no longer cover pedigree symbols, and the toolbar wraps on
          narrow windows instead of overlapping the canvas controls. The
          toolbar spans the person panel too, so selecting someone never
          changes its height (and never moves the drawing). */}
      <div className={`canvas-toolbar toolbar${touch ? ' touch-bar' : ''}`} ref={toolbarRef} data-fold="0">
        <div className="keys-wrap" data-popup="about">
          <button className="brand toolbar-brand brand-btn" onClick={() => setAboutOpen(v => !v)} aria-expanded={aboutOpen}
            aria-label={t('PediTree hakkında')} title={t('PediTree hakkında: sürüm, atıf, lisans')}>
            <img className="brand-mark" src={logoMark} alt="" width="40" height="40" />
            <span className="brand-text" data-fold-order="10">
              <img className="brand-wordmark" src={logoWordmark} alt="PediTree" height="20" />
              <span className="brand-sub" data-fold-order="1">{t('Klinik pedigri')}</span>
            </span>
            {/* a small badge, never folded (clinician decision 2026-11-07) */}
            {RELEASE_STAGE && <span className="beta-badge" title={t('Deneme sürümü: geri bildirimleriniz uygulamanın gelişmesine katkı sağlar')}>{t('Beta')}</span>}
          </button>
          {aboutOpen && (
            <div className="keys-popover share-popover about-popover about-text" role="dialog" aria-label={t('PediTree hakkında')}>
              <ProductInfo />
              <LicenseInfo />
              {/* the rest — citation, feedback, keyboard help — in Ayarlar (clinician request 2026-11-04) */}
              <button className="ui-btn" onClick={() => { setAboutOpen(false); openSettings('about'); }}><Info size={15} /> {t('Atıf, geri bildirim ve klavye kısayolları: Ayarlar')}</button>
            </div>
          )}
        </div>
        <div className="toolbar-sep" data-fold-order="10" />
        {phone ? (
          // a phone: the name and date of birth wait behind one button (clinician request 2026-11-10)
          <div className="keys-wrap" data-popup="patient">
            <button className="ui-btn ui-btn-icon patient-btn" onClick={() => setPatientOpen(v => !v)} aria-expanded={patientOpen}
              aria-label={t('Hasta bilgileri')} title={t('Hasta adı ve doğum tarihi')}><UserRound size={16} /><span className="patient-btn-name">{doc.patientName || t('Hasta')}</span></button>
            {patientOpen && (
              <div className="keys-popover share-popover patient-popover" role="dialog" aria-label={t('Hasta bilgileri')}>
                <div className="keys-title">{t('Hasta bilgileri')}</div>
        <input className="input patient-name" data-fold-order="9" value={doc.patientName || ''} placeholder={t('Hasta adı soyadı')}
                  aria-label={t('Hasta adı soyadı')} onChange={e => setPatientName(e.target.value)}
                  onBlur={e => setPatientName(nameCase(e.target.value).trim())} />
                {/* optional: the proband's age follows it, as of today (clinician decision 2026-10-25) */}
                <label className="toolbar-field" title={t('Probandın doğum tarihi; proband işaretlenmemişse danışanın doğum tarihi. İsteğe bağlıdır; girildiğinde yaş bugünün tarihine göre hesaplanır. Tarih kısaltılarak da yazılabilir (3.5.25).')}>
                  {/* the last thing to give way on a narrow tablet: the box keeps its name for screen readers and its tooltip */}
                  <span data-overflow-order="9">{t('Doğum')}</span>
                  {/* typed the quick way: 3.5.25, 3/05/2025, 030525 … (clinician request 2026-10-25) */}
                  <DraftField key={probandNode ? probandNode.id : 'none'} type="text" inputMode="numeric" className="input birth-date" format={typeDate}
                    value={formatDate(probandNode && probandNode.birthDate)} placeholder={t('gg.aa.yyyy')} disabled={!probandNode}
                    aria-label={t('Probandın ya da danışanın doğum tarihi')} onCommit={v => setProbandBirthDate(v.trim() ? (parseTypedDate(v) || v.trim()) : '')} />
                </label>
              </div>
            )}
          </div>
        ) : (<>
        <input className="input patient-name" data-fold-order="9" value={doc.patientName || ''} placeholder={t('Hasta adı soyadı')}
          aria-label={t('Hasta adı soyadı')} onChange={e => setPatientName(e.target.value)}
          onBlur={e => setPatientName(nameCase(e.target.value).trim())} />
        {/* optional: the proband's age follows it, as of today (clinician decision 2026-10-25) */}
        <label className="toolbar-field" title={t('Probandın doğum tarihi; proband işaretlenmemişse danışanın doğum tarihi. İsteğe bağlıdır; girildiğinde yaş bugünün tarihine göre hesaplanır. Tarih kısaltılarak da yazılabilir (3.5.25).')}>
          {/* the last thing to give way on a narrow tablet: the box keeps its name for screen readers and its tooltip */}
          <span data-overflow-order="9">{t('Doğum')}</span>
          {/* typed the quick way: 3.5.25, 3/05/2025, 030525 … (clinician request 2026-10-25) */}
          <DraftField key={probandNode ? probandNode.id : 'none'} type="text" inputMode="numeric" className="input birth-date" format={typeDate}
            value={formatDate(probandNode && probandNode.birthDate)} placeholder={t('gg.aa.yyyy')} disabled={!probandNode}
            aria-label={t('Probandın ya da danışanın doğum tarihi')} onCommit={v => setProbandBirthDate(v.trim() ? (parseTypedDate(v) || v.trim()) : '')} />
        </label>
        </>)}
        {phone && (
          // a phone: the two buttons used most while drawing, always in reach (clinician request 2026-11-12)
          // (Sığdır and the zoom stay on the drawing, clinician 2026-11-12); and the whole screen for the drawing
          <div className="touch-quick">
            <button className="ui-btn ui-btn-icon" onClick={relayout} aria-label={t('Konumlandır')} title={t('Konumlandır, kişileri çizimde yeniden yerleştirir. Akrabalık ilişkileri değişmez ve işlem geri alınabilir.')}><TidyIcon size={20} /></button>
            {!fullScreen.standalone && (
              <div className="keys-wrap" data-popup="fullscreen">
                <button className="ui-btn ui-btn-icon" aria-pressed={fullScreen.on}
                  onClick={() => (fullScreen.can ? fullScreen.toggle() : setFullHelp((v) => !v))}
                  aria-label={fullScreen.on ? t('Tam ekrandan çık') : t('Tam ekran')} title={fullScreen.on ? t('Tam ekrandan çık') : t('Tam ekran')}>
                  {fullScreen.on ? <Minimize size={20} /> : <Maximize size={20} />}</button>
                {fullHelp && (
                  <div className="keys-popover share-popover" role="dialog" aria-label={t('Tam ekran')}>
                    <div className="keys-title">{t('Tam ekran')}</div>
                    <p className="field-hint">{t('Bu telefonun tarayıcısı bir sayfanın tam ekran açılmasına izin vermiyor. Tarayıcının Paylaş düğmesinden “Ana Ekrana Ekle” seçildiğinde PediTree ana ekrandan tarayıcı çubukları olmadan, tam ekran açılır. Çizimler yine yalnız bu cihazda kalır.')}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div className="toolbar-sep" data-fold-order="10" />
        <div className="toolbar-group">
          <div className="keys-wrap" data-popup="new">
            <button className="ui-btn" data-overflow="new" data-overflow-order="5" onClick={() => setNewMenu(v => !v)} aria-expanded={newMenu} title={t('Boş bir aileyle ya da hazır bir akraba evliliği şablonuyla yeni bir pedigri başlatır')}><FilePlus2 size={15} /> <span className="btn-label" data-fold-order="8">{t('Yeni')}</span></button>
            {newMenu && (
              <div className="keys-popover share-popover new-popover" role="dialog" aria-label={t('Yeni pedigri')}>
                {/* two ways to start, each with a small pedigree of what opens (clinician request 2026-11-01) */}
                <button className="download-item" onClick={() => handleNewPedigree(null)}>
                  <svg className="new-icon" viewBox="0 0 40 32" aria-hidden="true"><rect x="3" y="3" width="10" height="10" /><circle cx="32" cy="8" r="5" /><path d="M13 8h14M20 8v13" /><rect x="15" y="21" width="10" height="10" /></svg>
                  <span><b>{t('Yeni aile')}</b><small>{t('Proband, anne ve baba')}</small></span>
                </button>
                {/* a couple who came without children: two bars (infertile) under their line, one bar from the
                    couple's panel or the ring if by choice (clinician request 2026-11-12) */}
                <button className="download-item" onClick={() => handleNewPedigree('childless')}>
                  <svg className="new-icon" viewBox="0 0 40 32" aria-hidden="true"><rect x="3" y="3" width="10" height="10" /><circle cx="32" cy="8" r="5" /><path d="M13 8h14M20 8v12M14 20h12M14 25h12" /></svg>
                  <span><b>{t('Çocuksuz / infertil çift')}</b><small>{t('Proband, eşi; çocukları yok')}</small></span>
                </button>
                <button className="download-item" onClick={() => { setNewMenu(false); setRelationOpen(true); }}>
                  <svg className="new-icon" viewBox="0 0 40 32" aria-hidden="true"><rect x="3" y="3" width="10" height="10" /><circle cx="32" cy="8" r="5" /><path d="M13 4.5h14M13 11.5h14M20 11.5v9.5" /><rect x="15" y="21" width="10" height="10" /></svg>
                  <span><b>{t('Akraba evliliği')}</b><small>{t('Kuzen evliliği, berdel…')}</small></span>
                </button>
              </div>
            )}
          </div>
          {/* on the page, not in the toolbar: a fixed window must not follow the toolbar's box */}
          {relationOpen && createPortal(
            <div className="relation-backdrop">
              <RelationChooser onStart={handleNewPedigree} onClose={() => setRelationOpen(false)} />
            </div>,
            document.body,
          )}
          <div className="keys-wrap" data-popup="open">
            <button className="ui-btn" data-overflow="open" data-overflow-order="6" onClick={handleOpenClick} aria-expanded={openHelp} title={t('Daha önce kaydettiğiniz bir pedigri dosyasını (.peditree.json) ya da bir PED dosyasını açar')}><FolderOpen size={15} /> <span className="btn-label" data-fold-order="7">{t('Aç')}</span></button>
            {openHelp && (
              <div className="keys-popover share-popover open-popover" role="dialog" aria-label={t('Dosya aç')}>
                <div className="keys-title">{t('Dosya aç')}</div>
                <div className="download-item-head"><Save size={18} /><span><b>{t('PediTree dosyası')}</b> (.peditree.json)<small>{t('Kaldığınız yerden, bütün bilgileriyle')}</small></span></div>
                <div className="download-item-head"><Table2 size={18} /><span><b>{t('PED dosyası')}</b> (.ped, .fam, .txt)<small>{t('Yalnızca aile bağları ve etkilenme durumu aktarılır; ad, yaş ve bulgular aktarılmaz')}</small></span></div>
                <button className="ui-btn ui-btn-primary" onClick={chooseFile}><FolderOpen size={15} /> {t('Dosya seç')}</button>
                <p className="share-note mouse-only">{t('Dosyayı çizimin üzerine bırakarak da açabilirsiniz.')}</p>
                <label className="check" title={t('Ayarlar’dan geri açabilirsiniz')}>
                  <input type="checkbox" checked={!view.openHelp} onChange={e => setView({ openHelp: !e.target.checked })} />
                  {t('Bir daha gösterme')}
                </label>
              </div>
            )}
          </div>
          {/* Kaydet: every way of keeping the drawing in one place, the picture first (clinician 2026-11-10: a
              first-time user who pressed Kaydet and got a .json file did not know what it was; the former
              İndir button beside it went unnoticed). Cmd/Ctrl+S still writes the PediTree file. */}
          <div className="keys-wrap" data-popup="download">
            <button className="ui-btn ui-btn-primary" onClick={() => { setPedOpen(false); setDownloadOpen(v => !v); }} aria-expanded={downloadOpen} aria-haspopup="dialog"
              aria-label={t('Kaydet')} title={t('Çizimi resim (PNG, PDF, SVG) ya da sonra açıp düzenlemek için PediTree dosyası olarak kaydeder')}>
              <Save size={15} /> <span className="save-word">{t('Kaydet')}</span> <ChevronDown className="save-chevron" size={14} />
            </button>
            {downloadOpen && (
              <div className="keys-popover share-popover download-popover" role="dialog" aria-label={t('Kaydet')}>
                <div className="download-group">{t('Resim olarak')}</div>
                <button className="download-item" title={t('Sunum, mesaj ve belgeler için')} onClick={() => { setDownloadOpen(false); handleExportPNG(); }}>
                  <ImageIcon size={18} /><span><b>PNG</b><small>{t('rapora, sunuma, mesaja eklemek için')}</small></span>
                </button>
                <button className="download-item" title={t('Tek bir A4 sayfası; yazdırılmaya ve hasta dosyasına eklenmeye uygundur')} onClick={() => { setDownloadOpen(false); handleExportPDF(); }}>
                  <FileText size={18} /><span><b>PDF</b><small>{t('A4 sayfa')}</small></span>
                </button>
                <button className="download-item" title={t('Büyütüldüğünde netliğini korur; yayınlar ile Word ve PowerPoint belgeleri için uygundur')} onClick={() => { setDownloadOpen(false); handleExportSVG(); }}>
                  <FileCode2 size={18} /><span><b>SVG</b><small>{t('büyütülebilir çizim')}</small></span>
                </button>
                <div className="download-group">{t('Sonra düzenlemek için')}</div>
                <button className="download-item" title={t('Pedigriyi bütün bilgileriyle bilgisayarınıza kaydeder (.peditree.json). Dosya daha sonra “Aç” ile açılarak çalışmaya kalınan yerden devam edilebilir.')} onClick={() => { setDownloadOpen(false); handleSaveProject(); }}>
                  <Save size={18} /><span><b>{t('PediTree dosyası')}</b><small>{t('daha sonra “Aç” ile açıp düzenlemek için')}</small></span>
                </button>
                <div className="download-group">{t('Analiz programları için')}</div>
                <button className="download-item" aria-expanded={pedOpen} onClick={() => setPedOpen(v => !v)}
                  title={t('Genetik analiz programları ve laboratuvarlar için hazırlanır. Dosyada yalnızca anne, baba, cinsiyet ve etkilenme durumu yer alır; kişiler pedigri numarasıyla (örneğin II-3) gösterilir, hasta adı yazılmaz.')}>
                  <Table2 size={18} /><span><b>PED</b><small>{t('kişiler numarayla geçer, ad yazılmaz')}</small></span>
                </button>
                {pedOpen && (
                  <div className="download-ped">
                    <label className="field-col">
                      <span className="field-label">{t('Dosyada hangi kişiler “etkilenmiş” olarak işaretlensin?')}</span>
                      <select className="select" value={pedPhenotype} onChange={e => setPedPhenotype(e.target.value)}>
                        <option value="affected">{t('Durum’da “Etkilenmiş” işaretlenen kişiler')}</option>
                        {(pedigreeData.conditionKey || []).map(e => <option key={e.id} value={e.label}>{t('“{label}” bulgusu olanlar', { label: e.label })}</option>)}
                      </select>
                    </label>
                    <button className="ui-btn ui-btn-primary" onClick={handleExportPed}><Download size={15} /> {t('PED indir')}</button>
                  </div>
                )}
              </div>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept=".json,application/json,.ped,.fam,.txt,text/plain" onChange={handleOpenProject} style={{ display: 'none' }} aria-label={t('Proje ya da PED dosyası seç')} />
        </div>
        <div className="toolbar-sep" data-fold-order="10" />
        <div className="toolbar-group">
          <button className="ui-btn ui-btn-icon" onClick={handleUndo} disabled={!_history || _history.length === 0}
            title={_history && _history.length > 0 ? t('Geri al ({n} adım)', { n: _history.length }) : t('Geri alınacak adım yok')} aria-label={t('Geri al')}><Undo2 size={15} /></button>
          <button className="ui-btn ui-btn-icon" data-overflow="redo" data-overflow-order="11" onClick={handleRedo} disabled={!_future || _future.length === 0}
            title={_future && _future.length > 0 ? t('Yinele ({n} adım)', { n: _future.length }) : t('Yinelenecek adım yok')} aria-label={t('Yinele')}><Redo2 size={15} /></button>
          <button className="ui-btn" data-overflow="relayout" data-overflow-order="8" onClick={relayout} title={t('Konumlandır, kişileri çizimde yeniden yerleştirir. Akrabalık ilişkileri değişmez ve işlem geri alınabilir.')}><TidyIcon size={15} /> <span className="btn-label" data-fold-order="4">{t('Konumlandır')}</span></button>
        </div>
        {/* the right end: it stays at the right edge, also when the toolbar takes two rows */}
        <div className="toolbar-end">
        <button className={`ui-btn touch-only${multiSelect ? ' ui-btn-primary' : ''}`} aria-pressed={multiSelect} data-overflow="multi" data-overflow-order="7"
          onClick={() => setMultiSelect(v => !v)} title={t('Açıkken dokunulan her kişi seçime eklenir, yeniden dokunulduğunda seçimden çıkarılır. Birden çok kişide aynı değişikliği yapmak için kullanılır.')}>
          <CheckSquare size={15} /> <span className="btn-label" data-fold-order="5">{t('Çoklu seçim')}</span>
        </button>
        {/* Yazdır, Paylaş: icons alone, their words for screen readers and in the tooltip (clinician 2026-11-05) */}
        <div className="toolbar-group">
          <button className="ui-btn" data-overflow="print" data-overflow-order="3" onClick={handlePrint} title={t('Çizimi tek bir A4 sayfaya yazdırır (Cmd/Ctrl+P)')}><Printer size={15} /> <span className="btn-label icon-only">{t('Yazdır')}</span></button>
          <div className="keys-wrap" data-popup="share">
            <button className="ui-btn" data-overflow="share" data-overflow-order="4" onClick={openShare} aria-expanded={!!share} title={t('Pedigrinin resmini cihazınızdaki bir uygulamayla (e-posta, mesajlaşma) gönderir')}>
              <Share2 size={15} /> <span className="btn-label icon-only">{t('Paylaş')}</span>
            </button>
            {share && (
              <div className="keys-popover share-popover" role="dialog" aria-label={t('Paylaş')}>
                <p className="share-note">{t('Resim, seçtiğiniz uygulama aracılığıyla bu cihazın dışına gönderilir ve hasta bilgilerini içerir.')}</p>
                {share.busy ? <p className="share-note">{t('Resim hazırlanıyor…')}</p> : (
                  <div className="share-actions">
                    {share.withName && (
                      <button className="ui-btn ui-btn-primary" onClick={() => doShare(share.withName)}>{t('Adıyla paylaş')}</button>
                    )}
                    <button className={`ui-btn${share.withName ? '' : ' ui-btn-primary'}`} onClick={() => doShare(share.noName)}>
                      {share.withName ? t('Hasta adı olmadan') : t('Paylaş')}
                    </button>
                  </div>
                )}
                {share.withName && <p className="share-note">{t('“Hasta adı olmadan” seçildiğinde yalnızca başlıktaki hasta adı resimden çıkarılır; sembollerin altındaki etiketler ve notlar resimde kalır.')}</p>}
              </div>
            )}
          </div>
        </div>
        <div className="toolbar-sep" data-fold-order="10" />
        {/* what people share and ask about most, one click away (clinician request 2026-11-04) */}
        <div className="toolbar-group">
          <div className="keys-wrap" data-popup="cite">
            <button className="ui-btn" data-overflow="cite" data-overflow-order="1" onClick={() => setInfoOpen(v => (v === 'cite' ? null : 'cite'))} aria-expanded={infoOpen === 'cite'}
              title={t('PediTree’ye nasıl atıf yapılır')}><Quote size={15} /> <span className="btn-label" data-fold-order="3">{t('Atıf')}</span></button>
            {infoOpen === 'cite' && (
              <div className="keys-popover share-popover info-popover about-text" role="dialog" aria-label={t('Atıf')}>
                <CitationInfo />
              </div>
            )}
          </div>
          <div className="keys-wrap" data-popup="feedback">
            <button className="ui-btn" data-overflow="feedback" data-overflow-order="2" onClick={() => setInfoOpen(v => (v === 'feedback' ? null : 'feedback'))} aria-expanded={infoOpen === 'feedback'}
              title={t('Hata bildirin ya da öneri paylaşın')}><MessageSquareText size={15} /> <span className="btn-label" data-fold-order="2">{t('Geri bildirim')}</span></button>
            {infoOpen === 'feedback' && (
              <div className="keys-popover share-popover info-popover about-text" role="dialog" aria-label={t('Hata ve öneriler')}>
                <FeedbackInfo />
              </div>
            )}
          </div>
        </div>
        <div className="toolbar-sep" data-fold-order="10" />
          {/* shown only while some buttons had no room on the bar (a tablet; clinician report 2026-11-09) */}
          <div className="keys-wrap toolbar-more" data-popup="more">
            {touch ? (
              <button className="ui-btn touch-menu-btn" onClick={() => setMoreItems(v => (v ? null : TOUCH_MENU))} aria-expanded={!!moreItems}
                aria-label={t('Menü')}><MenuIcon size={18} /> <span>{t('Menü')}</span></button>
            ) : (
              <button className="ui-btn ui-btn-icon" onClick={() => setMoreItems(v => (v ? null : overflowed(toolbarRef.current)))} aria-expanded={!!moreItems}
                aria-label={t('Diğer')} title={t('Üst çubuğa sığmayan düğmeler')}><MoreHorizontal size={16} /></button>
            )}
            {moreItems && <MoreMenu items={moreItems} multiSelect={multiSelect} onPick={runMore} />}
          </div>
          <button className="ui-btn ui-btn-icon tour-btn" data-overflow="tour" data-overflow-order="10" onClick={startTour} aria-label={t('Tanıtım turu')}
            title={t('Tanıtım turu: PediTree’yi örnek bir aile üzerinde adım adım tanıtır')}><CircleHelp size={16} /></button>
          <div className="keys-wrap" data-popup="settings">
            <button className="ui-btn" data-overflow="settings" data-overflow-order="12" onClick={() => (settingsOpen ? setSettingsOpen(false) : openSettings())} aria-expanded={settingsOpen}
              title={t('Ayarlar: dil, çizimin görünümü, yazı tipi, halka menü ve indirilen resimler')}>
              <SlidersHorizontal size={15} /> <span className="btn-label" data-fold-order="6">{t('Ayarlar')}</span>
            </button>
            {/* a window of its own, on the page (clinician request 2026-11-03) */}
            {settingsOpen && createPortal(
              <div className="settings-backdrop">
                <SettingsDialog key={settingsAt} initial={settingsAt} touch={touch} onClose={() => setSettingsOpen(false)} />
              </div>,
              document.body,
            )}
          </div>
        </div>
      </div>

      <div className={`canvas-container${dropping ? ' file-drop' : ''}`} onDragOver={onFileDragOver} onDragLeave={onFileDragLeave} onDrop={onFileDrop}>
        <div className="canvas-notices">
        {autosaveFailed && (
          <div className="warning-panel" data-tone="error" role="alert">
            <h4 className="notice-title">
              <AlertTriangle size={16} /> {t('Otomatik kayıt yapılamıyor')}
            </h4>
            <p className="notice-text">
              {t('Tarayıcının depolama alanı dolu ya da kapalı olduğundan son değişiklikler sayfa yenilendiğinde kaybolabilir. Çalışmanızı “Kaydet” ile bir dosyaya kaydetmeniz önerilir.')}
            </p>
          </div>
        )}
        {/* a slim line, not a box (clinician 2026-11-10: the reminder took a third of a phone's screen) */}
        {phone && !saveTipClosed && !tourIds && needsLeaveWarning(doc, downloadedDoc.current) && (
          <div className="save-tip" role="status" title={t('Telefon tarayıcıları arka planda kalan sekmeleri kapatabilir; bu durumda kaydedilmemiş çizim kaybolur. Çalışmanızı ara ara “Kaydet” ile kaydetmeniz önerilir.')}>
            <Save size={16} aria-hidden="true" />
            <span className="save-tip-text">{t('Kaydedilmemiş değişiklik var')}</span>
            <button className="ui-btn ui-btn-primary save-tip-go" onClick={() => setDownloadOpen(true)}>{t('Kaydet')}</button>
            <button className="notice-dismiss" onClick={() => setSaveTipClosed(true)} title={t('Kapat')} aria-label={t('Kapat')}>×</button>
          </div>
        )}
        {actionNotice && (
          <div className="warning-panel" data-tone="info" role="status">
            <div className="notice-head">
              <h4 className="notice-title">
                <AlertTriangle size={16} /> {actionNotice.kind === 'info' ? t('Bilgi') : t('İşlem uygulanmadı')}
              </h4>
              <button className="notice-dismiss" onClick={dismissActionNotice} title={t('Kapat')} aria-label={t('Kapat')}>×</button>
            </div>
            <p className="notice-text">{actionNotice.message}</p>
          </div>
        )}

        {exportError && (
          <div className="warning-panel" data-tone="error" role="alert">
            <div className="notice-head">
              <h4 className="notice-title">
                <AlertTriangle size={16} /> {t('Dışa aktarma hatası')}
              </h4>
              <button className="notice-dismiss" onClick={() => setExportError(null)} title={t('Kapat')} aria-label={t('Kapat')}>×</button>
            </div>
            <p className="notice-text">{exportError}</p>
          </div>
        )}

        {exportNotice && (
          <div className="warning-panel" data-tone="warn" role="status">
            <div className="notice-head">
              <h4 className="notice-title">
                <AlertTriangle size={16} /> {t('Dışa aktarma uyarısı')}
              </h4>
              <button className="notice-dismiss" onClick={() => setExportNotice(null)} title={t('Kapat')} aria-label={t('Kapat')}>×</button>
            </div>
            <p className="notice-text">{exportNotice}</p>
          </div>
        )}

        {notices.length > 0 && (
          <div className={`notice-strip${notices.some(n => n.level === 'error') ? ' notice-strip-error' : ''}`}>
            <button className="notice-strip-toggle" onClick={() => setWarningsOpen(o => !o)} aria-expanded={warningsOpen}>
              <AlertTriangle size={14} />
              {notices.some(n => n.level === 'error') ? t('Düzeltilmesi gereken') : t('Uyarı')}: {notices.length}
              {!notices.some(n => n.level === 'error') && <span className="notice-strip-hint">{warningsOpen ? t('gizle') : t('göster')}</span>}
            </button>
            {/* all of them away in one click, without opening the list (clinician request 2026-11-04);
                display only: an export still checks the real state (gateExport) */}
            <button className="notice-dismiss notice-dismiss-all" onClick={() => notices.forEach(n => n.ids.forEach(dismissWarning))}
              title={t('Bu notların hepsini gizle')} aria-label={t('Bu notların hepsini gizle')}>×</button>
            {(warningsOpen || notices.some(n => n.level === 'error')) && (
              <ul>
                {notices.map(n => (
                  <li key={n.ids[0]} className={n.level === 'error' ? 'notice-error' : undefined}>
                    <span>{n.text}</span>
                    <button className="notice-dismiss" onClick={() => n.ids.forEach(dismissWarning)} title={t('Bu notu gizle')} aria-label={t('Bu notu gizle')}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        </div>

        <div className="canvas-stage">
        <PedigreeCanvas
          ref={svgRef}
          nodes={pedigreeData.nodes || []}
          edges={pedigreeData.edges || []}
          selectedNodeId={selectedId}
          selectedNodeId2={selectedId2}
          keepAbove={touch && dockable && !sheetFull ? 'sheet' : null}
          selectedIds={selectedIds || []}
          multiSelect={multiSelect}
          onNodeDrop={dropOnto}
          focusTick={focusTick}
          onNodeSelect={handleNodeSelect}
          onBackgroundClick={onBackgroundClick}
          drawing={drawing}
          lang={drawLang}
          onUnionSelect={selectUnion}
          conditionKey={pedigreeData.conditionKey || []}
          patientName={doc.patientName || ''}
          onEditText={(kind, target, value) => {
            const v = String(value);
            if (kind === 'patientName') setPatientName(nameCase(v).trim());
            else if (kind === 'finding') renameFinding(target, v);
            else if (kind === 'note') updateIndividual(target, { notes: v });
            else if (kind === 'geneticLine') {
              // one line of a genetic test result, edited on the drawing (empty removes it)
              const [pid, k] = String(target).split('\u0001');
              const person = pedigreeData.individuals.find(i => i.id === pid);
              if (person) updateIndividual(pid, { geneticNote: withGeneticLine(person.geneticNote, Number(k), v) });
            }
            else if (kind === 'onset') { const [pid, label] = String(target).split('\u0001'); setFindingOnset(pid, label, v.trim()); }
            else if (kind === 'childlessReason') setChildlessness(target, undefined, v);
            else if (kind === 'lineNote') setLineNote(target, v);
            else if (kind === 'gestationWeeks') setGestationWeeks(target, v.replace(/[^\d.,]/g, ''));
            else if (kind === 'age') updateIndividual(target, { age: v.trim() }); // read (or refused) in ops.updatePerson
            else if (kind === 'ageAtDeath') updateIndividual(target, { ageAtDeath: v.trim() });
            else if (kind === 'lmp') updateIndividual(target, { lmp: v.trim() });
            else updateIndividual(target, { [kind]: v }); // displayLabel, condition, causeOfDeath
          }}
          renderQuickBar={(anchor, panBy) => (ringHidden || touch ? null : ringOf(anchor, panBy, false))}
        />
        </div>
      </div>

      {(selectedNode || selectedNode2) && !phone && (
        <PanelResizer shellRef={shellRef} width={view.panelWidth} onChange={(w) => setView({ panelWidth: w })} />
      )}
      {!touch && <SidePanel open={!!(selectedNode || selectedNode2)}>
        {editorEl}
      </SidePanel>}
      {touch && (selectedNode || selectedNode2) && (
        <TouchSheet full={sheetFull || !dockable} canDock={dockable} onFull={setSheetFull} onClose={() => { clearSelection(); setSheetFull(false); }}
          title={touchTitle}>
          {dockable && !sheetFull ? ringOf({ x: 0, y: 0 }, null, true) : editorEl}
        </TouchSheet>
      )}
    </div>
    {tourCtx && <Tour ctx={tourCtx} onClose={endTour} />}
    {/* the first opening on this device offers the tour, once; "?" in the top bar brings it back */}
    {view.tourOffer && !tourCtx && (
      <div className="tour-offer" role="dialog" aria-label={t('Tanıtım turu')}>
        <div className="tour-hero"><TourFamily /></div>
        <b>{t('PediTree’ye hoş geldiniz')}</b>
        <p>{t('PediTree’yi örnek bir aile üzerinde adım adım tanıtan kısa bir tur (yaklaşık iki dakika). Kendi çiziminiz değişmeden korunur.')}</p>
        <div className="btn-row">
          <button className="ui-btn ui-btn-primary" onClick={startTour}>{t('Turu başlat')}</button>
          <button className="ui-btn" onClick={() => setView({ tourOffer: false })} title={t('Tura istediğiniz zaman üst çubuktaki ? düğmesinden ulaşabilirsiniz')}>{t('Sonra')}</button>
        </div>
      </div>
    )}
    {/* what printing shows (A4): the drawing as exported, and the date */}
    <div id="print-root" ref={printRef} aria-hidden="true" />
    </>
  );
}

export default App;
