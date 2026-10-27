import React from 'react';
import * as d3 from 'd3';
import { usePedigreeStore, needsLeaveWarning, flushAutosave } from './state/usePedigreeStore';
import { exportSVG, exportPNG, exportFileName, pngBlob, shareFile, downloadBlob, prepareExportSvg } from './utils/exportUtils';
import { assessExportReadiness } from './utils/exportReadiness';
import { withStableIdsExcludingDismissed } from './utils/warningIds';
import { clinicalNotices } from './utils/clinicalNotices';
import PedigreeCanvas from './components/PedigreeCanvas';
import IndividualEditor from './components/IndividualEditor';
import RadialAddMenu from './components/RadialAddMenu';
import { flushDrafts } from './utils/drafts';
import { parseTypedDate, formatDate } from './utils/age';
import DraftField from './components/DraftField';
import { nextPerson, RING_KEYS } from './utils/keyboardNav';
import { toPed } from './graph/ped';
import { TEMPLATE_GROUPS } from './graph/templates';
import { withGeneticLine } from './graph/model';
import { Download, Image as ImageIcon, AlertTriangle, FilePlus2, Undo2, Redo2, Save, FolderOpen, LayoutGrid, Keyboard, CheckSquare, Share2, MoreHorizontal, Printer } from 'lucide-react';
import './styles/app.css';
import './styles/ui.css';

// written for a clinician who has never used the program (clinician request 2026-10-27)
const KEY_HELP = [
  ['Kişiler arasında gezinmek', [
    ['Tab', 'Sıradaki kişiye geçer.'],
    ['Enter veya Boşluk', 'Üzerinde durduğunuz kişiyi seçer; kişinin çevresinde düğmeler açılır.'],
    ['← →', 'Aynı kuşakta soldaki ya da sağdaki kişiye geçer.'],
    ['↑', 'Kişinin annesine ya da babasına geçer.'],
    ['↓', 'Kişinin çocuğuna geçer.'],
    ['Esc', 'Bir adım geri gider: önce açık paneli, sonra kişinin çevresindeki düğmeleri, en son seçimi kapatır. Çizimde boş bir yere tıklamak da aynısını yapar.'],
    ['Cmd veya Ctrl + tıklama', 'Birden çok kişiyi birlikte seçer (Mac’te Cmd, Windows’ta Ctrl). Tablette üstteki “Çoklu seçim” düğmesini kullanın.'],
  ]],
  ['Seçili kişi için (önce bir kişiye tıklayın)', [
    ['A', 'Annesini ve babasını ekler.'],
    ['E', 'Eşini ekler.'],
    ['K', 'Kardeş ekler: kız, erkek, düşük … seçenekleri açılır.'],
    ['C veya Ç', 'Çocuk ekler: kız, erkek, düşük … seçenekleri açılır.'],
    ['B', 'Bulgu (hastalık ya da özellik) ekler ya da değiştirir.'],
    ['D', 'Durumunu değiştirir: cinsiyet, hasta (etkilenmiş), taşıyıcı, vefat, proband.'],
    ['İ veya I', 'İkiz kardeş ekler.'],
    ['N', 'Kişi için not yazar.'],
    ['Shift + ← →', 'Kişiyi yana kaydırır: eşiyle yer değiştirir ya da kardeşlerinin arasında bir sıra kayar. Kişiyi fareyle sürükleyerek de yapılır.'],
    ['Delete', 'Kişiyi siler (önce sorar).'],
  ]],
  ['Genel', [
    ['Cmd/Ctrl + Z', 'Son işlemi geri alır. Shift ile birlikte: geri alınan işlemi yeniden yapar.'],
    ['Cmd/Ctrl + S', 'Pedigriyi bilgisayarınıza dosya olarak kaydeder.'],
    ['Cmd/Ctrl + P', 'Pedigriyi A4 sayfaya yazdırır.'],
    ['+  −  0', 'Yakınlaştırır, uzaklaştırır, tüm pedigriyi ekrana sığdırır.'],
  ]],
];

function App() {
  const {
    pedigreeData, warnings, integrityIssues,
    updateIndividual, addSpouseTo, addChildTo, addChildToUnion,
    setProband, clearProband, resetPedigree,
    selectedId, selectedId2, selectedIds, selectIndividual, clearSelection, selectUnion,
    updateMany, setFindingStatusMany, addFindingMany,
    deleteIndividual, createUnionBetween, addCustomConsanguinity,
    reorderChild, setUnionRelationshipBackground, setUnionStatus,
    setMultipleBirth, addMultipleSibling, setMultipleZygosity, leaveMultipleBirth,
    addFinding, setFindingStatus, setFindingStyle, renameFinding, wizardData, updateWizardData,
    addParentsTo, addSiblingTo, moveSideways, dropOnto, setFindingOnset, setChildlessness, setPregnancyKind, setGestationWeeks,
    undo, redo, _history, _future,
    dismissedWarningIds, dismissWarning,
    actionNotice, dismissActionNotice, autosaveFailed,
    exportProjectFile, openProjectFile, importPedFile, relayout, doc, setPatientName, setProbandBirthDate, newFromTemplate,
  } = usePedigreeStore();
  const probandNode = doc.graph.individuals.find(i => i.proband);
  // tablet: taps add people to the selection while this is on (a mouse has Cmd/Ctrl/Shift-click)
  const [multiSelect, setMultiSelect] = React.useState(false);
  const [showKeys, setShowKeys] = React.useState(false);
  const [focusTick, setFocusTick] = React.useState(0);
  const ringRef = React.useRef(null);
  // the ring can be put away while the person stays selected (clinician
  // request 2026-10-27); selecting a person, the same one too, brings it back
  const [ringHidden, setRingHidden] = React.useState(false);
  React.useEffect(() => { setRingHidden(false); }, [selectedId]);
  const [exportError, setExportError] = React.useState(null);
  const [exportNotice, setExportNotice] = React.useState(null);
  const svgRef = React.useRef(null);

  const selectedNode = pedigreeData.individuals.find(i => i.id === selectedId);
  const selectedNode2 = pedigreeData.individuals.find(i => i.id === selectedId2);
  const selectedNodes = (selectedIds || []).map(id => pedigreeData.individuals.find(i => i.id === id)).filter(Boolean);

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
  const dismissBtnStyle = {
    background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8',
    fontSize: '1rem', lineHeight: 1, padding: '0 2px', flexShrink: 0,
  };

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
      setExportError(`Dışa aktarma yapılmadı (önce düzeltilmesi gereken sorunlar var):\n${assessment.fatal.join('\n')}`);
      return null;
    }

    if (assessment.errors.length > 0) {
      const proceed = window.confirm(
        `Pedigride ciddi veri kalitesi sorunları var:\n\n${assessment.errors.join('\n')}\n\nYine de dışa aktarmak istiyor musunuz?`
      );
      if (!proceed) {
        setExportError(null);
        setExportNotice('Dışa aktarma iptal edildi.');
        return null;
      }
    }

    return assessment;
  };

  const handleExportSVG = () => {
    const assessment = gateExport();
    if (!assessment) return;
    try {
      exportSVG(svgRef.current, exportFileName(doc.patientName, 'svg'));
      markDownloaded();
      setExportError(null);
      setExportNotice(assessment.warnings.length > 0
        ? `Dışa aktarıldı — dikkat edilmesi gerekenler:\n${assessment.warnings.join('\n')}`
        : null);
    } catch (err) {
      setExportNotice(null);
      setExportError(err.message || 'SVG dışa aktarılamadı.');
    }
  };

  const handleExportPNG = async () => {
    const assessment = gateExport();
    if (!assessment) return;
    try {
      await exportPNG(svgRef.current, exportFileName(doc.patientName, 'png'));
      markDownloaded();
      setExportError(null);
      setExportNotice(assessment.warnings.length > 0
        ? `Dışa aktarıldı — dikkat edilmesi gerekenler:\n${assessment.warnings.join('\n')}`
        : null);
    } catch (err) {
      setExportNotice(null);
      setExportError(err.message || 'PNG dışa aktarılamadı.');
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
      const noName = new File([await pngBlob(svgRef.current, { withoutPatientName: true })], exportFileName('', 'png'), { type: 'image/png' });
      const withName = name ? new File([await pngBlob(svgRef.current)], exportFileName(name, 'png'), { type: 'image/png' }) : null;
      setShare({ withName, noName, busy: false });
    } catch (err) {
      setShare(null);
      setExportError(err.message || 'Paylaşım için resim hazırlanamadı.');
    }
  };
  const doShare = async (file) => {
    try {
      const r = await shareFile(file, 'Pedigri');
      if (r === 'unsupported') {
        downloadBlob(file, file.name);
        setExportNotice('Bu tarayıcı doğrudan paylaşmayı desteklemiyor; resim indirildi. WhatsApp ya da Gmail’de ek olarak seçebilirsiniz.');
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
    const clone = prepareExportSvg(svgRef.current);
    clone.removeAttribute('width');
    clone.removeAttribute('height');
    clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const [, , w, h] = (svgRef.current.getAttribute('viewBox') || '0 0 4 3').split(/[\s,]+/).map(Number);
    const root = printRef.current;
    root.replaceChildren(clone);
    const foot = document.createElement('div');
    foot.className = 'print-foot';
    foot.textContent = `Peditree · ${new Date().toLocaleDateString('tr-TR')}`;
    root.appendChild(foot);
    let page = document.getElementById('print-page');
    if (!page) { page = document.createElement('style'); page.id = 'print-page'; document.head.appendChild(page); }
    page.textContent = `@page { size: A4 ${w >= h ? 'landscape' : 'portrait'}; margin: 10mm; }`;
    const done = () => { root.replaceChildren(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setMore(false);
  };

  // "Diğer": PED file and printing
  const [more, setMore] = React.useState(false);
  const [pedPhenotype, setPedPhenotype] = React.useState('affected');
  const handleExportPed = () => {
    flushDrafts();
    const st = usePedigreeStore.getState();
    const text = toPed(st.doc.graph, st.pedigreeData.nodes, { phenotype: pedPhenotype });
    // no patient name in the file, nor in its name (it goes to a lab)
    downloadBlob(new Blob([text], { type: 'text/plain' }), exportFileName('', 'ped'));
    setMore(false);
  };

  // "Yeni": the nuclear family, or a ready-made consanguinity template
  // (graph/templates.js; clinician decision 2026-10-25)
  const [newMenu, setNewMenu] = React.useState(false);
  const [tplGroup, setTplGroup] = React.useState(TEMPLATE_GROUPS[0].id);
  const handleNewPedigree = (spec = null) => {
    setNewMenu(false);
    if (window.confirm('Yeni pedigri başlatılsın mı?\n\nŞu anki pedigriyi “Kaydet” ile dosyaya kaydetmediyseniz kaybolur ve geri getirilemez.')) {
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
  const popupOpen = showKeys || newMenu || more || !!share;
  const popupClosedAt = React.useRef(-Infinity);
  React.useEffect(() => {
    if (!popupOpen) return;
    const close = (except) => {
      if (except !== 'keys') setShowKeys(false);
      if (except !== 'new') setNewMenu(false);
      if (except !== 'more') setMore(false);
      if (except !== 'share') setShare(null);
    };
    const onDown = (e) => {
      const inside = e.target.closest && e.target.closest('[data-popup]');
      close(inside ? inside.dataset.popup : null);
      popupClosedAt.current = performance.now();
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
    a.download = exportFileName(doc.patientName, 'peditree.json');
    markDownloaded();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const handleOpenProject = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    // asks whenever work would be replaced, also when only the patient's name was typed
    if (needsLeaveWarning(doc, downloadedDoc.current) && !window.confirm('Açık pedigrinin yerine dosyadaki pedigri yüklensin mi? (Geri Al ile dönebilirsiniz.)')) return;
    // a project file is JSON; anything else is read as a PED file
    file.text().then(text => (/\.(ped|fam|txt)$/i.test(file.name) || !text.trim().startsWith('{') ? importPedFile(text) : openProjectFile(text)))
      .catch(() => openProjectFile(null));
  };

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
        if (window.confirm('Seçili kişi silinsin mi?\n\nÇocukları silinmez; diğer ebeveynlerine bağlı kalırlar. Yanlışlıkla sildiyseniz "Geri Al" (Cmd/Ctrl+Z) ile geri getirebilirsiniz.')) k.deleteIndividual(only.id);
        return;
      }
      const zoom = { '+': 'Yakınlaştır', '=': 'Yakınlaştır', '-': 'Uzaklaştır', '0': 'Sığdır' }[e.key];
      if (zoom) { document.querySelector(`.zoom-controls button[aria-label="${zoom}"]`)?.click(); return; }
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
      const action = RING_KEYS[e.key.toLocaleLowerCase('tr')];
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
  const onBackgroundClick = React.useCallback(() => {
    if (performance.now() - popupClosedAt.current < 1000) return;
    stepBackRef.current();
  }, []);

  return (
    <>
    <div className={`app-shell${selectedNode || selectedNode2 ? ' has-editor' : ''}`}>

      <div className="canvas-container">
        {/* KI-5/KI-6: toolbar and notices sit in normal flow ABOVE the canvas —
            they can no longer cover pedigree symbols, and the toolbar wraps on
            narrow windows instead of overlapping the canvas controls. */}
        <div className="canvas-toolbar toolbar">
          <div className="brand toolbar-brand">
            <span className="brand-name">Peditree</span>
            <span className="brand-sub">Klinik pedigri</span>
          </div>
          <div className="toolbar-sep" />
          <input className="input patient-name" value={doc.patientName || ''} placeholder="Hasta adı soyadı"
            aria-label="Hasta adı soyadı" onChange={e => setPatientName(e.target.value)} />
          {/* optional: the proband's age follows it, as of today (clinician decision 2026-10-25) */}
          <label className="toolbar-field" title="Probandın doğum tarihi (isteğe bağlı). Yazarsanız probandın yaşı bugüne göre kendiliğinden hesaplanır. Kısa da yazabilirsiniz: 3.5.25">
            <span>Doğum</span>
            {/* typed the quick way: 3.5.25, 3/05/2025, 030525 … (clinician request 2026-10-25) */}
            <DraftField key={probandNode ? probandNode.id : 'none'} type="text" inputMode="numeric" className="input birth-date"
              value={formatDate(probandNode && probandNode.birthDate)} placeholder="gg.aa.yyyy" disabled={!probandNode}
              aria-label="Probandın doğum tarihi" onCommit={v => setProbandBirthDate(v.trim() ? (parseTypedDate(v) || v.trim()) : '')} />
          </label>
          <div className="toolbar-sep" />
          <div className="toolbar-group">
            <div className="keys-wrap" data-popup="new">
              <button className="ui-btn" onClick={() => setNewMenu(v => !v)} aria-expanded={newMenu} title="Yeni bir pedigri başlat: boş bir aileyle ya da hazır bir akraba evliliği şablonuyla"><FilePlus2 size={15} /> Yeni</button>
              {newMenu && (
                <div className="keys-popover share-popover new-popover" role="dialog" aria-label="Yeni pedigri">
                  <button className="ui-btn ui-btn-primary" onClick={() => handleNewPedigree(null)}>Proband, anne ve baba ile başla</button>
                  <div className="more-title">Ya da anne-babası akraba olan hazır bir aileyle başlayın:</div>
                  <div className="segmented segmented-wrap" role="tablist" aria-label="Akrabalık derecesi">
                    {TEMPLATE_GROUPS.map(g => (
                      <button key={g.id} role="tab" aria-selected={tplGroup === g.id} className={tplGroup === g.id ? 'on' : undefined}
                        onClick={() => setTplGroup(g.id)}>{g.label}</button>
                    ))}
                  </div>
                  <div className="template-list" role="list">
                    {TEMPLATE_GROUPS.find(g => g.id === tplGroup).items.map(i => (
                      <button key={i.id} className="template-item" role="listitem" onClick={() => handleNewPedigree(i.spec)}>{i.label}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button className="ui-btn" onClick={() => fileInputRef.current && fileInputRef.current.click()} title="Daha önce kaydettiğiniz bir pedigri dosyasını (.peditree.json) ya da bir PED dosyasını açar"><FolderOpen size={15} /> Aç</button>
            <button className="ui-btn" onClick={handleSaveProject} title="Pedigriyi bilgisayarınıza dosya olarak kaydeder (.peditree.json). Sonra “Aç” ile açıp kaldığınız yerden devam edebilirsiniz."><Save size={15} /> Kaydet</button>
            <input ref={fileInputRef} type="file" accept=".json,application/json,.ped,.fam,.txt,text/plain" onChange={handleOpenProject} style={{ display: 'none' }} aria-label="Proje ya da PED dosyası seç" />
          </div>
          <div className="toolbar-sep" />
          <div className="toolbar-group">
            <button className="ui-btn ui-btn-icon" onClick={handleUndo} disabled={!_history || _history.length === 0}
              title={_history && _history.length > 0 ? `Geri al (${_history.length} adım)` : 'Geri alınacak adım yok'} aria-label="Geri al"><Undo2 size={15} /></button>
            <button className="ui-btn ui-btn-icon" onClick={handleRedo} disabled={!_future || _future.length === 0}
              title={_future && _future.length > 0 ? `Yinele (${_future.length} adım)` : 'Yinelenecek adım yok'} aria-label="Yinele"><Redo2 size={15} /></button>
            <button className="ui-btn" onClick={relayout} title="Kişilerin çizimdeki yerlerini baştan hesaplar; kimin kiminle akraba olduğu değişmez. Geri alınabilir."><LayoutGrid size={15} /> Yeniden Düzenle</button>
          </div>
          <div className="toolbar-spacer" />
          <button className={`ui-btn touch-only${multiSelect ? ' ui-btn-primary' : ''}`} aria-pressed={multiSelect}
            onClick={() => setMultiSelect(v => !v)} title="Açıkken dokunduğunuz her kişi seçime eklenir; yeniden dokunursanız çıkarılır. Birden çok kişiyi birlikte değiştirmek için.">
            <CheckSquare size={15} /> Çoklu seçim
          </button>
          <div className="keys-wrap" data-popup="keys">
            <button className="ui-btn ui-btn-icon ui-btn-ghost" aria-label="Klavye kısayolları" aria-expanded={showKeys}
              title="Klavye kısayolları" onClick={() => setShowKeys(v => !v)}>
              <Keyboard size={15} />
            </button>
            {showKeys && (
              <div className="keys-popover" role="dialog" aria-label="Klavye kısayolları">
                <div className="keys-title">Klavye kısayolları</div>
                {KEY_HELP.map(([group, rows]) => (
                  <table key={group}>
                    <caption>{group}</caption>
                    <tbody>
                      {rows.map(([k, t]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{t}</td></tr>)}
                    </tbody>
                  </table>
                ))}
              </div>
            )}
          </div>
          <div className="toolbar-group">
            <button className="ui-btn" onClick={handleExportSVG} title="Çizimi SVG olarak indirir: büyütünce bozulmayan resim (yayın, Word, PowerPoint için)"><Download size={15} /> SVG</button>
            <button className="ui-btn ui-btn-primary" onClick={handleExportPNG} title="Çizimi PNG resmi olarak indirir"><ImageIcon size={15} /> PNG</button>
            <div className="keys-wrap" data-popup="share">
              <button className="ui-btn" onClick={openShare} aria-expanded={!!share} title="Pedigri resmini WhatsApp, Gmail gibi bir uygulamayla gönderir">
                <Share2 size={15} /> Paylaş
              </button>
              {share && (
                <div className="keys-popover share-popover" role="dialog" aria-label="Paylaş">
                  <p className="share-note">Dikkat: resim, seçeceğiniz uygulamayla bu cihazın dışına gönderilir ve hasta bilgilerini içerir.</p>
                  {share.busy ? <p className="share-note">Resim hazırlanıyor…</p> : (
                    <div className="share-actions">
                      {share.withName && (
                        <button className="ui-btn ui-btn-primary" onClick={() => doShare(share.withName)}>Adıyla paylaş</button>
                      )}
                      <button className={`ui-btn${share.withName ? '' : ' ui-btn-primary'}`} onClick={() => doShare(share.noName)}>
                        {share.withName ? 'Hasta adı olmadan' : 'Paylaş'}
                      </button>
                    </div>
                  )}
                  {share.withName && <p className="share-note">“Hasta adı olmadan” seçilirse yalnızca en üstteki hasta adı resimden çıkarılır. Sembollerin altındaki etiketler ve notlar resimde kalır.</p>}
                </div>
              )}
            </div>
            <div className="keys-wrap" data-popup="more">
              <button className="ui-btn ui-btn-icon" onClick={() => setMore(v => !v)} aria-expanded={more} aria-label="Diğer" title="Diğer: yazdırma ve PED dosyası">
                <MoreHorizontal size={15} />
              </button>
              {more && (
                <div className="keys-popover share-popover" role="dialog" aria-label="Diğer">
                  <button className="ui-btn" onClick={handlePrint}><Printer size={15} /> Yazdır (A4)</button>
                  <div className="more-title">PED dosyası</div>
                  <p className="share-note">PED, genetik analiz programlarının ve laboratuvarların okuduğu bir dosya türüdür. İçinde yalnızca her kişinin annesi, babası, cinsiyeti ve hasta olup olmadığı bulunur. Kişiler pedigri numarasıyla (ör. II-3) yazılır; hasta adı ne dosyaya ne dosyanın adına yazılır.</p>
                  <label className="field-col">
                    <span className="field-label">Dosyada kim “hasta” olarak yazılsın?</span>
                    <select className="select" value={pedPhenotype} onChange={e => setPedPhenotype(e.target.value)}>
                      <option value="affected">Durum’da “Etkilenmiş” işaretlenen kişiler</option>
                      {(pedigreeData.conditionKey || []).map(e => <option key={e.id} value={e.label}>“{e.label}” bulgusu olanlar</option>)}
                    </select>
                  </label>
                  <button className="ui-btn ui-btn-primary" onClick={handleExportPed}><Download size={15} /> PED indir</button>
                  <p className="share-note">Bir PED dosyasını açmak için üstteki “Aç” düğmesini kullanın.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="canvas-notices">
        {autosaveFailed && (
          <div className="warning-panel" role="alert" style={{ borderColor: '#dc2626', background: '#fef2f2' }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '5px', color: '#dc2626' }}>
              <AlertTriangle size={16} /> Otomatik kayıt yapılamıyor
            </h4>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.9rem', color: '#991b1b' }}>
              Tarayıcı depolaması dolu ya da kapalı. Sayfa yenilenirse son değişiklikler kaybolabilir; çalışmanızı “Kaydet” ile dosyaya indirin.
            </p>
          </div>
        )}
        {actionNotice && (
          <div className="warning-panel" role="status" style={{ borderColor: '#2563eb', background: '#eff6ff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '5px', color: '#1d4ed8' }}>
                <AlertTriangle size={16} /> {actionNotice.kind === 'info' ? 'Bilgi' : 'İşlem uygulanmadı'}
              </h4>
              <button onClick={dismissActionNotice} title="Kapat" style={dismissBtnStyle}>×</button>
            </div>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.9rem', color: '#1e3a8a', whiteSpace: 'pre-line' }}>{actionNotice.message}</p>
          </div>
        )}

        {exportError && (
          <div className="warning-panel" style={{ borderColor: '#dc2626', background: '#fef2f2' }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '5px', color: '#dc2626' }}>
              <AlertTriangle size={16} /> Dışa aktarma hatası
            </h4>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.9rem', color: '#991b1b', whiteSpace: 'pre-line' }}>{exportError}</p>
          </div>
        )}

        {exportNotice && (
          <div className="warning-panel" style={{ borderColor: '#d97706', background: '#fffbeb' }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '5px', color: '#b45309' }}>
              <AlertTriangle size={16} /> Dışa aktarma uyarısı
            </h4>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.9rem', color: '#92400e', whiteSpace: 'pre-line' }}>{exportNotice}</p>
          </div>
        )}

        {notices.length > 0 && (
          <div className={`notice-strip${notices.some(n => n.level === 'error') ? ' notice-strip-error' : ''}`}>
            <button className="notice-strip-toggle" onClick={() => setWarningsOpen(o => !o)} aria-expanded={warningsOpen}>
              <AlertTriangle size={14} />
              {notices.some(n => n.level === 'error') ? 'Düzeltilmesi gereken' : 'Uyarı'}: {notices.length}
              {!notices.some(n => n.level === 'error') && <span className="notice-strip-hint">{warningsOpen ? 'gizle' : 'göster'}</span>}
            </button>
            {(warningsOpen || notices.some(n => n.level === 'error')) && (
              <ul>
                {notices.map(n => (
                  <li key={n.ids[0]} className={n.level === 'error' ? 'notice-error' : undefined}>
                    <span>{n.text}</span>
                    <button onClick={() => n.ids.forEach(dismissWarning)} title="Bu notu gizle" style={dismissBtnStyle}>×</button>
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
          onUnionSelect={selectUnion}
          conditionKey={pedigreeData.conditionKey || []}
          patientName={doc.patientName || ''}
          onEditText={(kind, target, value) => {
            const v = String(value);
            if (kind === 'patientName') setPatientName(v.trim());
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
            else updateIndividual(target, { [kind]: v }); // displayLabel, condition, causeOfDeath
          }}
          renderQuickBar={(anchor, panBy) => ringHidden ? null : (
            <RadialAddMenu ref={ringRef} anchor={anchor} node={selectedNode} pedigreeData={pedigreeData} onNeedRoom={panBy}
              onAddSibling={addSiblingTo} onAddSpouse={addSpouseTo} onAddParents={addParentsTo} onAddTwin={addMultipleSibling}
              onUpdate={updateIndividual} onSetProband={setProband} onClearProband={clearProband}
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
