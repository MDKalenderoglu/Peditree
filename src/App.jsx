import React from 'react';
import { createPortal } from 'react-dom';
import * as d3 from 'd3';
import { usePedigreeStore, needsLeaveWarning, flushAutosave } from './state/usePedigreeStore';
import { exportSVG, exportPNG, exportPDF, exportFileName, pngBlob, shareFile, downloadBlob, prepareExportSvg } from './utils/exportUtils';
import { assessExportReadiness } from './utils/exportReadiness';
import { withStableIdsExcludingDismissed } from './utils/warningIds';
import { clinicalNotices } from './utils/clinicalNotices';
import PedigreeCanvas from './components/PedigreeCanvas';
import IndividualEditor from './components/IndividualEditor';
import RadialAddMenu from './components/RadialAddMenu';
import { flushDrafts } from './utils/drafts';
import { parseTypedDate, formatDate } from './utils/age';
import DraftField from './components/DraftField';
import { nextPerson, ringKeysFor, KEY_LETTERS } from './utils/keyboardNav';
import { useT, useLang, t as tNow, tk, currentLang, drawingLangOf } from './i18n';
import { toPed } from './graph/ped';
import { mergeIntoGroup as checkMerge } from './graph/ops';
import RingSettings, { PanelSettings } from './components/RingSettings';
import RelationChooser from './components/RelationChooser';
import { withGeneticLine, subjectOf, adoptionOf, ancestorsOf, REPRO_LABEL, EGG_SOURCE, CARRIER_ROLES, ART_DONOR_RELATION, isPregnancy } from './graph/model';
import { clinicalNamer } from './utils/clinicalNotices';
import { useViewSettings, drawingSpec, exportSpec, embeddedFontCss, DRAWING_FONTS, LEGEND_SIZES } from './utils/drawingStyle';
import { versionLine, citationText, REPOSITORY_URL, CONTACT_EMAIL, issueUrl } from './utils/appInfo';
import { nameCase } from './utils/nameCase';
import { Download, Image as ImageIcon, AlertTriangle, FilePlus2, Undo2, Redo2, Save, FolderOpen, LayoutGrid, Keyboard, CheckSquare, Share2, Printer, SlidersHorizontal, ChevronDown, FileCode2, FileText, Table2 } from 'lucide-react';
import './styles/app.css';
import './styles/ui.css';
// the clinician's logo (docs/brand/peditree-logo.webp): the tree, and the name in its own lettering
import logoMark from './assets/logo-mark.png';
import logoWordmark from './assets/logo-wordmark.png';

// written for a clinician who has never used the program (clinician request 2026-10-27)
const KEY_HELP = [
  [tk('Kişiler arasında gezinmek'), [
    ['Tab', tk('Sıradaki kişiye geçer.')],
    [{ text: tk('Enter veya Boşluk') }, tk('Üzerinde durduğunuz kişiyi seçer; kişinin çevresinde düğmeler açılır.')],
    ['← →', tk('Aynı kuşakta soldaki ya da sağdaki kişiye geçer.')],
    ['↑', tk('Kişinin annesine ya da babasına geçer.')],
    ['↓', tk('Kişinin çocuğuna geçer.')],
    ['Esc', tk('Bir adım geri gider: önce açık paneli, sonra kişinin çevresindeki düğmeleri, en son seçimi kapatır. Çizimde boş bir yere tıklamak da aynısını yapar.')],
    [{ text: tk('Cmd veya Ctrl + tıklama') }, tk('Birden çok kişiyi birlikte seçer (Mac’te Cmd, Windows’ta Ctrl). Tablette üstteki “Çoklu seçim” düğmesini kullanın.')],
  ]],
  [tk('Seçili kişi için (önce bir kişiye tıklayın)'), [
    // a letter of the interface's language (keyboardNav.js KEY_LETTERS)
    [{ action: 'parents' }, tk('Annesini ve babasını ekler.')],
    [{ action: 'spouse' }, tk('Eşini ekler.')],
    [{ action: 'left' }, tk('Kardeş ekler: kız, erkek, düşük … seçenekleri açılır.')],
    [{ action: 'bottom' }, tk('Çocuk ekler: kız, erkek, düşük … seçenekleri açılır.')],
    [{ action: 'findings' }, tk('Bulgu (hastalık ya da özellik) ekler ya da değiştirir.')],
    [{ action: 'status' }, tk('Durumunu değiştirir: cinsiyet, hasta (etkilenmiş), taşıyıcı, vefat, proband, danışan.')],
    [{ action: 'twins' }, tk('İkiz kardeş ekler.')],
    [{ action: 'note' }, tk('Kişi için not yazar.')],
    ['Shift + ← →', tk('Kişiyi yana kaydırır: eşiyle yer değiştirir ya da kardeşlerinin arasında bir sıra kayar. Kişiyi fareyle sürükleyerek de yapılır.')],
    ['Delete', tk('Kişiyi siler (önce sorar).')],
  ]],
  [tk('Genel'), [
    ['Cmd/Ctrl + Z', tk('Son işlemi geri alır. Shift ile birlikte: geri alınan işlemi yeniden yapar.')],
    ['Cmd/Ctrl + S', tk('Pedigriyi bilgisayarınıza dosya olarak kaydeder.')],
    ['Cmd/Ctrl + P', tk('Pedigriyi A4 sayfaya yazdırır.')],
    ['+  −  0', tk('Yakınlaştırır, uzaklaştırır, tüm pedigriyi ekrana sığdırır.')],
  ]],
];

function App() {
  const {
    pedigreeData, warnings, integrityIssues,
    updateIndividual, addSpouseTo, addChildTo, addChildToUnion,
    setProband, clearProband, setConsultand, clearConsultand, setAdoption, addReproductiveLink, removeReproductiveLink, resetPedigree,
    selectedId, selectedId2, selectedIds, selectIndividual, clearSelection, selectUnion,
    updateMany, setFindingStatusMany, addFindingMany,
    deleteIndividual, createUnionBetween, addCustomConsanguinity,
    reorderChild, setUnionRelationshipBackground, setUnionStatus,
    setMultipleBirth, addMultipleSibling, setMultipleZygosity, leaveMultipleBirth, setGroupCount, splitGroup, mergeIntoGroup,
    addFinding, setFindingStatus, setFindingStyle, renameFinding, wizardData, updateWizardData,
    addParentsTo, addSiblingTo, moveSideways, dropOnto, setFindingOnset, setChildlessness, setPregnancyKind, setGestationWeeks,
    undo, redo, _history, _future,
    dismissedWarningIds, dismissWarning,
    actionNotice, dismissActionNotice, autosaveFailed,
    exportProjectFile, openProjectFile, importPedFile, relayout, doc, setPatientName, setProbandBirthDate, newFromTemplate,
  } = usePedigreeStore();
  const t = useT();
  const { ui: uiLang, drawing: drawingChoice, setLang } = useLang();
  const drawLang = drawingLangOf({ ui: uiLang, drawing: drawingChoice });
  // the page's language, for screen readers and the browser's spelling and hyphenation
  React.useEffect(() => { document.documentElement.lang = uiLang; }, [uiLang]);
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
  const [showKeys, setShowKeys] = React.useState(false);
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
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [openHelp, setOpenHelp] = React.useState(false); // "Aç"'s window: which files it opens
  // the logo: what PediTree is, its version, how to cite it, its licence
  const [aboutOpen, setAboutOpen] = React.useState(false);
  const [citeCopied, setCiteCopied] = React.useState(false);
  const copyCitation = async () => {
    try { await navigator.clipboard.writeText(citationText()); setCiteCopied(true); } catch { setCiteCopied(false); }
  };
  // an export in the style the clinician chose for exports, the typeface inside the file;
  // fontMissing: the typeface could not be put in (the file then shows a system typeface elsewhere)
  const exportOpts = async (extra = {}) => {
    const spec = exportSpec(view);
    let fontCss = '';
    let fontMissing = false;
    try { fontCss = await embeddedFontCss(spec.fontId); } catch { fontMissing = true; }
    return { ...extra, spec, fontCss, fontMissing, lang: drawLang };
  };
  const FONT_MISSING_TEXT = t('Seçtiğiniz yazı tipi dosyaya eklenemedi. Dosya başka bir bilgisayarda açılırsa yazılar o bilgisayarın yazı tipiyle görünür.');
  const exportNoticeFor = (assessment, opts) => {
    const lines = [];
    if (assessment.warnings.length > 0) lines.push(`${t('Dışa aktarıldı — dikkat edilmesi gerekenler:')}\n${assessment.warnings.join('\n')}`);
    if (opts.fontMissing) lines.push(FONT_MISSING_TEXT);
    return lines.length ? lines.join('\n') : null;
  };
  const [exportError, setExportError] = React.useState(null);
  const [exportNotice, setExportNotice] = React.useState(null);
  const svgRef = React.useRef(null);

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
    return {
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
      setExportError(`${t('Dışa aktarma yapılmadı (önce düzeltilmesi gereken sorunlar var):')}\n${assessment.fatal.join('\n')}`);
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
      setExportError(err.message || t('Paylaşım için resim hazırlanamadı.'));
    }
  };
  const doShare = async (file) => {
    try {
      const r = await shareFile(file, t('Pedigri'));
      if (r === 'unsupported') {
        downloadBlob(file, file.name);
        setExportNotice(t('Bu tarayıcı doğrudan paylaşmayı desteklemiyor; resim indirildi. WhatsApp ya da Gmail’de ek olarak seçebilirsiniz.'));
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

  // "İndir": files for other programs — PNG, SVG, PED (the PediTree file itself is "Kaydet")
  const [downloadOpen, setDownloadOpen] = React.useState(false);
  const [pedPhenotype, setPedPhenotype] = React.useState('affected');
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
    if (window.confirm(t('Yeni pedigri başlatılsın mı?\n\nŞu anki pedigriyi “Kaydet” ile dosyaya kaydetmediyseniz kaybolur ve geri getirilemez.'))) {
      // resetPedigree() / newFromTemplate() clear selection and the undo
      // stack — see usePedigreeStore.js. Only export-banner state (local to
      // App.jsx) is cleared here.
      if (spec) newFromTemplate(spec); else resetPedigree();
      setExportError(null);
      setExportNotice(null);
    }
  };

  // the toolbar's pop-up windows (Yeni, Paylaş, Diğer, keyboard help) close
  // on a click anywhere outside them, or Escape (clinician request 2026-10-27)
  const popupOpen = showKeys || newMenu || relationOpen || downloadOpen || !!share || settingsOpen || aboutOpen || openHelp;
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
      if (except !== 'keys') setShowKeys(false);
      if (except !== 'new') setNewMenu(false);
      if (except !== 'relation') setRelationOpen(false);
      if (except !== 'download') setDownloadOpen(false);
      if (except !== 'open') setOpenHelp(false);
      if (except !== 'share') setShare(null);
      if (except !== 'settings') setSettingsOpen(false);
      if (except !== 'about') { setAboutOpen(false); setCiteCopied(false); }
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
    if (needsLeaveWarning(doc, downloadedDoc.current) && !window.confirm(t('Açık pedigrinin yerine dosyadaki pedigri yüklensin mi? (Geri Al ile dönebilirsiniz.)'))) return;
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
      if (!needsLeaveWarning(usePedigreeStore.getState().doc, downloadedDoc.current)) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
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
        if (window.confirm(tNow('Seçili kişi silinsin mi?\n\nÇocukları silinmez; diğer ebeveynlerine bağlı kalırlar. Yanlışlıkla sildiyseniz "Geri Al" (Cmd/Ctrl+Z) ile geri getirebilirsiniz.'))) k.deleteIndividual(only.id);
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

  return (
    <>
    <div className={`app-shell${selectedNode || selectedNode2 ? ' has-editor' : ''}`}>

      {/* KI-5/KI-6: toolbar and notices sit in normal flow ABOVE the canvas —
          they can no longer cover pedigree symbols, and the toolbar wraps on
          narrow windows instead of overlapping the canvas controls. The
          toolbar spans the person panel too, so selecting someone never
          changes its height (and never moves the drawing). */}
      <div className="canvas-toolbar toolbar">
        <div className="keys-wrap" data-popup="about">
          <button className="brand toolbar-brand brand-btn" onClick={() => setAboutOpen(v => !v)} aria-expanded={aboutOpen}
            aria-label={t('PediTree hakkında')} title={t('PediTree hakkında: sürüm, atıf, lisans')}>
            <img className="brand-mark" src={logoMark} alt="" width="40" height="40" />
            <span className="brand-text">
              <img className="brand-wordmark" src={logoWordmark} alt="PediTree" height="20" />
              <span className="brand-sub">{t('Klinik pedigri')}</span>
            </span>
          </button>
          {aboutOpen && (
            <div className="keys-popover share-popover about-popover" role="dialog" aria-label={t('PediTree hakkında')}>
              <div className="about-head">
                <img src={logoMark} alt="" width="56" height="56" />
                <div>
                  <div className="keys-title">PediTree</div>
                  <div className="field-hint">{t('Genetik danışmanlık için pedigri çizimi')} · {versionLine()}</div>
                </div>
              </div>
              <p className="share-note">{t('PediTree bir çizim aracıdır, tıbbi cihaz değildir. Çizimi kullanmadan önce kontrol edin; tanı ve danışmanlık kararı klinik değerlendirmeye dayanır.')}</p>
              <p className="share-note">{t('Hasta bilgisi hiçbir sunucuya gönderilmez. Çalışma yalnızca bu sekmede tutulur; “Kaydet” ile indirdiğiniz dosyalar sizin cihazınızda kalır.')}</p>
              <div className="more-title">{t('Atıf')}</div>
              <p className="share-note">{t('PediTree ile çizdiğiniz pedigriler sizindir. Bir yayında, sunumda ya da eğitim materyalinde kullandıysanız şöyle atıf yapmanız rica edilir:')}</p>
              <p className="about-cite">{citationText()}</p>
              <button className="ui-btn" onClick={copyCitation}>{citeCopied ? t('Kopyalandı') : t('Atfı kopyala')}</button>
              <div className="more-title">{t('Hata ve öneriler')}</div>
              <p className="share-note">{t('Bir hata mı buldunuz, bir öneriniz ya da deneyiminiz mi var? GitHub’daki formu doldurun ya da e-posta gönderin.')}</p>
              <div className="about-links">
                <a className="ui-btn" href={issueUrl('hata-bildirimi')} target="_blank" rel="noreferrer">{t('Hata bildir')}</a>
                <a className="ui-btn" href={issueUrl('oneri')} target="_blank" rel="noreferrer">{t('Öneri paylaş')}</a>
                <a className="ui-btn" href={`mailto:${CONTACT_EMAIL}?subject=PediTree`}>{t('E-posta')}</a>
              </div>
              <p className="share-note">{CONTACT_EMAIL} · {t('Bildirime hasta adı, doğum tarihi ya da kimliği belli eden bir ekran görüntüsü eklemeyin.')}</p>
              <div className="more-title">{t('Lisans')}</div>
              <p className="share-note">{t('Kaynak kodu Apache 2.0 lisansıyla açıktır:')} <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">{REPOSITORY_URL.replace('https://', '')}</a>. {t('PediTree adı ve logosu lisansa dahil değildir.')}</p>
              <p className="share-note">© 2026 Muhammed Doğukan Kalenderoğlu</p>
              <button className="ui-btn mouse-only" onClick={() => { setAboutOpen(false); setShowKeys(true); }}><Keyboard size={15} /> {t('Klavye kısayolları')}</button>
            </div>
          )}
          {/* keyboard help: opened from this window (clinician decision 2026-10-30) */}
          <div data-popup="keys">
            {showKeys && (
              <div className="keys-popover keys-help-popover" role="dialog" aria-label={t('Klavye kısayolları')}>
                <div className="keys-title">{t('Klavye kısayolları')}</div>
                {KEY_HELP.map(([group, rows]) => (
                  <table key={group}>
                    <caption>{t(group)}</caption>
                    <tbody>
                      {rows.map(([k, text]) => {
                        const key = typeof k === 'string' ? k : k.action ? KEY_LETTERS[uiLang][k.action] : t(k.text);
                        return <tr key={key}><td><kbd>{key}</kbd></td><td>{t(text)}</td></tr>;
                      })}
                    </tbody>
                  </table>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="toolbar-sep" />
        <input className="input patient-name" value={doc.patientName || ''} placeholder={t('Hasta adı soyadı')}
          aria-label={t('Hasta adı soyadı')} onChange={e => setPatientName(e.target.value)}
          onBlur={e => setPatientName(nameCase(e.target.value).trim())} />
        {/* optional: the proband's age follows it, as of today (clinician decision 2026-10-25) */}
        <label className="toolbar-field" title={t('Probandın (proband yoksa danışanın) doğum tarihi (isteğe bağlı). Yazarsanız yaşı bugüne göre kendiliğinden hesaplanır. Kısa da yazabilirsiniz: 3.5.25')}>
          <span>{t('Doğum')}</span>
          {/* typed the quick way: 3.5.25, 3/05/2025, 030525 … (clinician request 2026-10-25) */}
          <DraftField key={probandNode ? probandNode.id : 'none'} type="text" inputMode="numeric" className="input birth-date"
            value={formatDate(probandNode && probandNode.birthDate)} placeholder={t('gg.aa.yyyy')} disabled={!probandNode}
            aria-label={t('Probandın ya da danışanın doğum tarihi')} onCommit={v => setProbandBirthDate(v.trim() ? (parseTypedDate(v) || v.trim()) : '')} />
        </label>
        <div className="toolbar-sep" />
        <div className="toolbar-group">
          <div className="keys-wrap" data-popup="new">
            <button className="ui-btn" onClick={() => setNewMenu(v => !v)} aria-expanded={newMenu} title={t('Yeni bir pedigri başlat: boş bir aileyle ya da hazır bir akraba evliliği şablonuyla')}><FilePlus2 size={15} /> {t('Yeni')}</button>
            {newMenu && (
              <div className="keys-popover share-popover new-popover" role="dialog" aria-label={t('Yeni pedigri')}>
                {/* two ways to start, each with a small pedigree of what opens (clinician request 2026-11-01) */}
                <button className="download-item" onClick={() => handleNewPedigree(null)}>
                  <svg className="new-icon" viewBox="0 0 40 32" aria-hidden="true"><rect x="3" y="3" width="10" height="10" /><circle cx="32" cy="8" r="5" /><path d="M13 8h14M20 8v13" /><rect x="15" y="21" width="10" height="10" /></svg>
                  <span><b>{t('Yeni aile')}</b><small>{t('Proband, anne ve babayla başlar; akrabaları çizim üzerinden eklersiniz.')}</small></span>
                </button>
                <button className="download-item" onClick={() => { setNewMenu(false); setRelationOpen(true); }}>
                  <svg className="new-icon" viewBox="0 0 40 32" aria-hidden="true"><rect x="3" y="3" width="10" height="10" /><circle cx="32" cy="8" r="5" /><path d="M13 5.5h14M13 10.5h14M20 10.5v10.5" /><rect x="15" y="21" width="10" height="10" /></svg>
                  <span><b>{t('Akraba evliliği')}</b><small>{t('Anne-babası akraba olan hazır bir aile: kuzen evliliği, berdel…')}</small></span>
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
            <button className="ui-btn" onClick={handleOpenClick} aria-expanded={openHelp} title={t('Daha önce kaydettiğiniz bir pedigri dosyasını (.peditree.json) ya da bir PED dosyasını açar')}><FolderOpen size={15} /> {t('Aç')}</button>
            {openHelp && (
              <div className="keys-popover share-popover open-popover" role="dialog" aria-label={t('Dosya aç')}>
                <div className="keys-title">{t('Dosya aç')}</div>
                <div className="download-item-head"><Save size={18} /><span><b>{t('PediTree dosyası')}</b> (.peditree.json)<small>{t('“Kaydet” ile indirdiğiniz dosya. Pedigri bütün bilgileriyle, kaldığınız yerden açılır.')}</small></span></div>
                <div className="download-item-head"><Table2 size={18} /><span><b>{t('PED dosyası')}</b> (.ped, .fam, .txt)<small>{t('Laboratuvarların ve genetik analiz programlarının dosyası. Yalnızca anne-baba, cinsiyet ve hasta olup olmadığı gelir; isim, yaş ve bulgular gelmez.')}</small></span></div>
                <p className="share-note mouse-only">{t('Dosyayı çizimin üzerine sürükleyip bırakarak da açabilirsiniz.')}</p>
                <button className="ui-btn ui-btn-primary" onClick={chooseFile}><FolderOpen size={15} /> {t('Dosya seç')}</button>
                <label className="check">
                  <input type="checkbox" checked={!view.openHelp} onChange={e => setView({ openHelp: !e.target.checked })} />
                  {t('Bunu bir daha gösterme (Ayarlar’dan geri açabilirsiniz)')}
                </label>
              </div>
            )}
          </div>
          <button className="ui-btn ui-btn-primary" onClick={handleSaveProject} title={t('Pedigriyi bilgisayarınıza dosya olarak kaydeder (.peditree.json). Sonra “Aç” ile açıp kaldığınız yerden devam edebilirsiniz.')}><Save size={15} /> {t('Kaydet')}</button>
          <input ref={fileInputRef} type="file" accept=".json,application/json,.ped,.fam,.txt,text/plain" onChange={handleOpenProject} style={{ display: 'none' }} aria-label={t('Proje ya da PED dosyası seç')} />
        </div>
        <div className="toolbar-sep" />
        <div className="toolbar-group">
          <button className="ui-btn ui-btn-icon" onClick={handleUndo} disabled={!_history || _history.length === 0}
            title={_history && _history.length > 0 ? t('Geri al ({n} adım)', { n: _history.length }) : t('Geri alınacak adım yok')} aria-label={t('Geri al')}><Undo2 size={15} /></button>
          <button className="ui-btn ui-btn-icon" onClick={handleRedo} disabled={!_future || _future.length === 0}
            title={_future && _future.length > 0 ? t('Yinele ({n} adım)', { n: _future.length }) : t('Yinelenecek adım yok')} aria-label={t('Yinele')}><Redo2 size={15} /></button>
          <button className="ui-btn" onClick={relayout} title={t('Konumlandır: kişileri çizimde baştan yerleştirir; kimin kiminle akraba olduğu değişmez. Geri alınabilir.')}><LayoutGrid size={15} /> {t('Konumlandır')}</button>
        </div>
        {/* the right end: it stays at the right edge, also when the toolbar takes two rows */}
        <div className="toolbar-end">
        <button className={`ui-btn touch-only${multiSelect ? ' ui-btn-primary' : ''}`} aria-pressed={multiSelect}
          onClick={() => setMultiSelect(v => !v)} title={t('Açıkken dokunduğunuz her kişi seçime eklenir; yeniden dokunursanız çıkarılır. Birden çok kişiyi birlikte değiştirmek için.')}>
          <CheckSquare size={15} /> {t('Çoklu seçim')}
        </button>
        <div className="toolbar-group">
          <div className="keys-wrap" data-popup="download">
            <button className="ui-btn" onClick={() => setDownloadOpen(v => !v)} aria-expanded={downloadOpen}
              title={t('Çizimi başka programlar için dosya olarak indirir: PNG, SVG, PDF ya da PED')}>
              <Download size={15} /> {t('İndir')} <ChevronDown size={14} />
            </button>
            {downloadOpen && (
              <div className="keys-popover share-popover download-popover" role="dialog" aria-label={t('İndir')}>
                <button className="download-item" onClick={() => { setDownloadOpen(false); handleExportPNG(); }}>
                  <ImageIcon size={18} /><span><b>PNG</b> {t('resim')}<small>{t('Sunum, mesaj ve belgeler için')}</small></span>
                </button>
                <button className="download-item" onClick={() => { setDownloadOpen(false); handleExportSVG(); }}>
                  <FileCode2 size={18} /><span><b>SVG</b> {t('çizim')}<small>{t('Büyütülünce bozulmaz; yayın, Word ve PowerPoint için')}</small></span>
                </button>
                <button className="download-item" onClick={() => { setDownloadOpen(false); handleExportPDF(); }}>
                  <FileText size={18} /><span><b>PDF</b> {t('belge')}<small>{t('Tek A4 sayfa; yazdırmaya ve hasta dosyasına eklemeye hazır')}</small></span>
                </button>
                <div className="download-ped">
                  <div className="download-item-head"><Table2 size={18} /><span><b>PED</b> {t('dosyası')}<small>{t('Genetik analiz programları ve laboratuvarlar için. Yalnızca anne, baba, cinsiyet ve hasta olup olmadığı yazılır; kişiler pedigri numarasıyla (ör. II-3) geçer, hasta adı yazılmaz.')}</small></span></div>
                  <label className="field-col">
                    <span className="field-label">{t('Dosyada kim “hasta” olarak yazılsın?')}</span>
                    <select className="select" value={pedPhenotype} onChange={e => setPedPhenotype(e.target.value)}>
                      <option value="affected">{t('Durum’da “Etkilenmiş” işaretlenen kişiler')}</option>
                      {(pedigreeData.conditionKey || []).map(e => <option key={e.id} value={e.label}>{t('“{label}” bulgusu olanlar', { label: e.label })}</option>)}
                    </select>
                  </label>
                  <button className="ui-btn" onClick={handleExportPed}><Download size={15} /> {t('PED indir')}</button>
                </div>
                <p className="share-note">{t('Pedigriyi sonra PediTree’de açıp düzenlemek için “Kaydet”i kullanın.')}</p>
              </div>
            )}
          </div>
          <button className="ui-btn" onClick={handlePrint} title={t('Çizimi tek bir A4 sayfaya yazdırır (Cmd/Ctrl+P)')}><Printer size={15} /> {t('Yazdır')}</button>
          <div className="keys-wrap" data-popup="share">
            <button className="ui-btn" onClick={openShare} aria-expanded={!!share} title={t('Pedigri resmini WhatsApp, Gmail gibi bir uygulamayla gönderir')}>
              <Share2 size={15} /> {t('Paylaş')}
            </button>
            {share && (
              <div className="keys-popover share-popover" role="dialog" aria-label={t('Paylaş')}>
                <p className="share-note">{t('Dikkat: resim, seçeceğiniz uygulamayla bu cihazın dışına gönderilir ve hasta bilgilerini içerir.')}</p>
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
                {share.withName && <p className="share-note">{t('“Hasta adı olmadan” seçilirse yalnızca en üstteki hasta adı resimden çıkarılır. Sembollerin altındaki etiketler ve notlar resimde kalır.')}</p>}
              </div>
            )}
          </div>
        </div>
        <div className="toolbar-sep" />
          <div className="keys-wrap" data-popup="settings">
            <button className="ui-btn" onClick={() => setSettingsOpen(v => !v)} aria-expanded={settingsOpen}
              title={t('Ayarlar: dil, çizimin görünümü, yazı tipi, halka menü ve indirilen resimler')}>
              <SlidersHorizontal size={15} /> {t('Ayarlar')}
            </button>
            {settingsOpen && (
              <div className="keys-popover share-popover settings-popover" role="dialog" aria-label={t('Ayarlar')}>
                <div className="keys-title">{t('Ayarlar')}</div>
                {/* languages (clinician decisions 2026-11-02): each language by its own name */}
                <div className="settings-group">
                  <div className="more-title">{t('Dil')}</div>
                  <div className="segmented" role="radiogroup" aria-label={t('Ekranın dili')}>
                    {[['tr', 'Türkçe'], ['en', 'English']].map(([v, label]) => (
                      <button key={v} role="radio" lang={v} aria-checked={uiLang === v} className={uiLang === v ? 'on' : undefined}
                        onClick={() => setLang({ ui: v })}>{label}</button>
                    ))}
                  </div>
                  <span className="field-hint">{t('Çizimin, indirilen ve yazdırılan dosyaların dili')}</span>
                  <div className="segmented" role="radiogroup" aria-label={t('Çizimin dili')}>
                    {[['same', t('Ekranla aynı')], ['tr', 'Türkçe'], ['en', 'English']].map(([v, label]) => (
                      <button key={v} role="radio" lang={v === 'same' ? undefined : v} aria-checked={drawingChoice === v} className={drawingChoice === v ? 'on' : undefined}
                        onClick={() => setLang({ drawing: v })}>{label}</button>
                    ))}
                  </div>
                  <p className="share-note">{t('Yazdığınız adlar, notlar ve bulgular çevrilmez; yalnızca programın kendi yazıları değişir.')}</p>
                </div>
                <div className="settings-group">
                  <div className="more-title">{t('Çizimin görünümü')}</div>
                  <div className="segmented" role="radiogroup" aria-label={t('Çizimin görünümü')}>
                    {[['standard', tk('Standart')], ['hand', tk('El çizimi')]].map(([v, label]) => (
                      <button key={v} role="radio" aria-checked={view.drawStyle === v} className={view.drawStyle === v ? 'on' : undefined}
                        onClick={() => setView({ drawStyle: v })}>{t(label)}</button>
                    ))}
                  </div>
                  <p className="share-note">{t('El çiziminde çizgiler ve semboller kalemle çizilmiş gibi hafifçe titrer. Sembollerin ve çizgilerin anlamı değişmez.')}</p>
                </div>
                <div className="settings-group">
                  <div className="more-title">{t('Çizimdeki yazıların yazı tipi')}</div>
                  {[['plain', tk('Düz yazı tipleri')], ['hand', tk('El yazısı tipleri')]].map(([group, title]) => (
                    <div key={group} className="font-list" role="radiogroup" aria-label={t(title)}>
                      <span className="field-hint">{t(title)}</span>
                      {DRAWING_FONTS.filter(f => f.group === group).map(f => (
                        <button key={f.id} role="radio" aria-checked={view.fontId === f.id} className={`font-option${view.fontId === f.id ? ' on' : ''}`}
                          onClick={() => setView({ fontId: f.id })}>
                          <span className="font-sample" style={{ fontFamily: f.family }}>{t('II-3 · 45 y · Ayşe Gül')}</span>
                          <span className="font-name">{f.id === 'standard' ? t(f.label) : f.label}{f.note ? ` — ${t(f.note)}` : ''}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                  <label className="check">
                    <input type="checkbox" checked={view.plainNumbers} onChange={e => setView({ plainNumbers: e.target.checked })} />
                    {t('Pedigri numaraları (I-1, II-3) el yazısında da düz yazılsın')}
                  </label>
                </div>
                <div className="settings-group">
                  <div className="more-title">{t('Hasta adı, bulgular açıklaması ve notların yazı boyutu')}</div>
                  <div className="segmented" role="radiogroup" aria-label={t('Açıklama yazılarının boyutu')}>
                    {LEGEND_SIZES.map(z => (
                      <button key={z.id} role="radio" aria-checked={view.legendSize === z.id} className={view.legendSize === z.id ? 'on' : undefined}
                        onClick={() => setView({ legendSize: z.id })}>{t(z.label)}</button>
                    ))}
                  </div>
                  <p className="share-note">{t('İndirilen ve yazdırılan çizimde de bu boyutta olur. Sembollerin altındaki yazılar aynı boyutta kalır.')}</p>
                </div>
                <div className="settings-group">
                  <div className="more-title">{t('İndirme, paylaşma ve yazdırma')}</div>
                  <div className="segmented" role="radiogroup" aria-label={t('İndirilen resmin görünümü')}>
                    {[['screen', tk('Ekrandaki gibi')], ['standard', tk('Her zaman standart')]].map(([v, label]) => (
                      <button key={v} role="radio" aria-checked={view.exportAs === v} className={view.exportAs === v ? 'on' : undefined}
                        onClick={() => setView({ exportAs: v })}>{t(label)}</button>
                    ))}
                  </div>
                </div>
                <RingSettings />
                <PanelSettings />
                <div className="settings-group">
                  <div className="more-title">{t('Dosya açma')}</div>
                  <label className="check">
                    <input type="checkbox" checked={view.openHelp} onChange={e => setView({ openHelp: e.target.checked })} />
                    {t('“Aç”a basınca hangi dosyaların açılabildiğini anlatan pencere görünsün')}
                  </label>
                </div>
                <p className="share-note">{t('Bu ayarlar yalnızca bu cihazda saklanır. Pedigri dosyası değişmez; dosyayı açan başka biri kendi ayarıyla görür.')}</p>
              </div>
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
              {t('Tarayıcı depolaması dolu ya da kapalı. Sayfa yenilenirse son değişiklikler kaybolabilir; çalışmanızı “Kaydet” ile dosyaya indirin.')}
            </p>
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
            <h4 className="notice-title">
              <AlertTriangle size={16} /> {t('Dışa aktarma hatası')}
            </h4>
            <p className="notice-text">{exportError}</p>
          </div>
        )}

        {exportNotice && (
          <div className="warning-panel" data-tone="warn" role="status">
            <h4 className="notice-title">
              <AlertTriangle size={16} /> {t('Dışa aktarma uyarısı')}
            </h4>
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
            else if (kind === 'gestationWeeks') setGestationWeeks(target, v.replace(/[^\d.,]/g, ''));
            else if (kind === 'age') updateIndividual(target, { age: v.trim() }); // read (or refused) in ops.updatePerson
            else if (kind === 'ageAtDeath') updateIndividual(target, { ageAtDeath: v.trim() });
            else if (kind === 'lmp') updateIndividual(target, { lmp: v.trim() });
            else updateIndividual(target, { [kind]: v }); // displayLabel, condition, causeOfDeath
          }}
          renderQuickBar={(anchor, panBy) => ringHidden ? null : (
            <RadialAddMenu ref={ringRef} anchor={anchor} node={selectedNode} pedigreeData={pedigreeData} onNeedRoom={panBy}
              onAddSibling={addSiblingTo} onAddSpouse={addSpouseTo} onAddParents={addParentsTo} onAddTwin={addMultipleSibling}
              onUpdate={updateIndividual} onSetProband={setProband} onClearProband={clearProband} onSetConsultand={setConsultand} onClearConsultand={clearConsultand}
              onAddFinding={addFinding} onSetFindingStatus={setFindingStatus} onSetFindingStyle={setFindingStyle} onSetFindingOnset={setFindingOnset}
              onAddChild={(unionId, sex, targetId, extra) => (unionId ? addChildToUnion(unionId, sex, extra) : addChildTo(targetId, sex, extra))} />
          )}
        />
        </div>
      </div>

      <aside className="side side-right editor-panel">
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
      </aside>
    </div>
    {/* what printing shows (A4): the drawing as exported, and the date */}
    <div id="print-root" ref={printRef} aria-hidden="true" />
    </>
  );
}

export default App;
