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
import DraftField from './components/DraftField';
import { nextPerson, RING_KEYS } from './utils/keyboardNav';
import { toPed } from './graph/ped';
import { Download, Image as ImageIcon, AlertTriangle, FilePlus2, Undo2, Redo2, Save, FolderOpen, LayoutGrid, Keyboard, CheckSquare, Share2, MoreHorizontal, Printer } from 'lucide-react';
import './styles/app.css';
import './styles/ui.css';

const todayIso = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

const KEY_HELP = [
  ['Tab', 'çizimdeki kişiler arasında gez'],
  ['Enter / Boşluk', 'odaktaki kişiyi seç (simit açılır)'],
  ['← →', 'aynı satırdaki komşu kişi'],
  ['↑ ↓', 'ebeveyn / çocuk'],
  ['Shift + ← →', 'seçili kişiyi taşı: eşiyle yer değiştirir ya da kardeşler arasında kayar (sürükleyerek de olur)'],
  ['A', 'anne ve baba ekle'],
  ['E', 'eş ekle'],
  ['K', 'kardeş seçenekleri'],
  ['C / Ç', 'çocuk seçenekleri'],
  ['B', 'bulgular'],
  ['D', 'durum (cinsiyet, etkilenmiş, vefat …)'],
  ['İ / I', 'ikiz'],
  ['N', 'not'],
  ['Esc', 'seçimi kapat'],
  ['Delete', 'seçili kişiyi sil'],
  ['Cmd/Ctrl+Z', 'geri al (Shift ile: yinele)'],
  ['Cmd/Ctrl+S', 'kaydet'],
  ['Cmd/Ctrl+P', 'yazdır (A4)'],
  ['+ / − / 0', 'yakınlaştır / uzaklaştır / sığdır'],
  ['Cmd/Ctrl/Shift+tık', 'birden çok kişi seç (tablette: “Çoklu seçim”)'],
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
    exportProjectFile, openProjectFile, importPedFile, relayout, doc, setPatientName, setProbandBirthDate,
  } = usePedigreeStore();
  const probandNode = doc.graph.individuals.find(i => i.proband);
  // tablet: taps add people to the selection while this is on (a mouse has Cmd/Ctrl/Shift-click)
  const [multiSelect, setMultiSelect] = React.useState(false);
  const [showKeys, setShowKeys] = React.useState(false);
  const [focusTick, setFocusTick] = React.useState(0);
  const ringRef = React.useRef(null);
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
    const text = toPed(doc.graph, pedigreeData.nodes, { phenotype: pedPhenotype });
    downloadBlob(new Blob([text], { type: 'text/plain' }), exportFileName(doc.patientName, 'ped'));
    setMore(false);
  };

  const handleNewPedigree = () => {
    if (window.confirm('Yeni pedigri başlatılsın mı?\n\nŞu anki pedigriyi indirmediyseniz (Kaydet / SVG / PNG) kaybolur.')) {
      // resetPedigree() itself clears selection and the undo stack — see
      // usePedigreeStore.js. Only export-banner state (local to App.jsx) is
      // cleared here.
      resetPedigree();
      setExportError(null);
      setExportNotice(null);
    }
  };

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
    if (_history && _history.length > 0 && !window.confirm('Açık pedigrinin yerine dosyadaki pedigri yüklensin mi? (Geri Al ile dönebilirsiniz.)')) return;
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
    keyRef.current = { undo, redo, handleSaveProject, handlePrint, clearSelection, deleteIndividual, selectedNodes, pedigreeData, selectIndividual, addParentsTo, addSpouseTo, moveSideways };
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
      if (e.key === 'Escape') { k.clearSelection(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const [only] = k.selectedNodes;
        if (k.selectedNodes.length !== 1 || only.proband || only.placeholder) return;
        e.preventDefault();
        if (window.confirm('Seçili kişi silinsin mi?\n\nÇocukları silinmez ve diğer ebeveynle bağlı kalır. "Geri Al" (Cmd/Ctrl+Z) ile geri alınabilir.')) k.deleteIndividual(only.id);
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
      ringRef.current?.open(action); // its first control takes the focus
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleNodeSelect = (id, opts) => {
    selectIndividual(id, opts);
  };

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
          <label className="toolbar-field" title="Probandın doğum tarihi (isteğe bağlı): yaşı bugüne göre hesaplanır">
            <span>Doğum</span>
            <DraftField key={probandNode ? probandNode.id : 'none'} type="date" className="input birth-date"
              value={(probandNode && probandNode.birthDate) || ''} max={todayIso()} disabled={!probandNode}
              aria-label="Probandın doğum tarihi" onCommit={setProbandBirthDate} />
          </label>
          <div className="toolbar-sep" />
          <div className="toolbar-group">
            <button className="ui-btn" onClick={handleNewPedigree} title="Kaydedilmiş pedigriyi sil ve yeniden başla"><FilePlus2 size={15} /> Yeni</button>
            <button className="ui-btn" onClick={() => fileInputRef.current && fileInputRef.current.click()} title="Proje dosyası (.peditree.json) ya da PED dosyası aç"><FolderOpen size={15} /> Aç</button>
            <button className="ui-btn" onClick={handleSaveProject} title="Pedigriyi proje dosyası olarak kaydet (.peditree.json)"><Save size={15} /> Kaydet</button>
            <input ref={fileInputRef} type="file" accept=".json,application/json,.ped,.fam,.txt,text/plain" onChange={handleOpenProject} style={{ display: 'none' }} aria-label="Proje ya da PED dosyası seç" />
          </div>
          <div className="toolbar-sep" />
          <div className="toolbar-group">
            <button className="ui-btn ui-btn-icon" onClick={handleUndo} disabled={!_history || _history.length === 0}
              title={_history && _history.length > 0 ? `Geri al (${_history.length} adım)` : 'Geri alınacak adım yok'} aria-label="Geri al"><Undo2 size={15} /></button>
            <button className="ui-btn ui-btn-icon" onClick={handleRedo} disabled={!_future || _future.length === 0}
              title={_future && _future.length > 0 ? `Yinele (${_future.length} adım)` : 'Yinelenecek adım yok'} aria-label="Yinele"><Redo2 size={15} /></button>
            <button className="ui-btn" onClick={relayout} title="Çizimi baştan düzenle: tüm pedigriyi yeniden yerleştirir (geri alınabilir)"><LayoutGrid size={15} /> Yeniden Düzenle</button>
          </div>
          <div className="toolbar-spacer" />
          <button className={`ui-btn touch-only${multiSelect ? ' ui-btn-primary' : ''}`} aria-pressed={multiSelect}
            onClick={() => setMultiSelect(v => !v)} title="Açıkken her dokunuş kişiyi seçime ekler ya da çıkarır">
            <CheckSquare size={15} /> Çoklu seçim
          </button>
          <div className="keys-wrap">
            <button className="ui-btn ui-btn-icon ui-btn-ghost" aria-label="Klavye kısayolları" aria-expanded={showKeys}
              title="Klavye kısayolları" onClick={() => setShowKeys(v => !v)}>
              <Keyboard size={15} />
            </button>
            {showKeys && (
              <div className="keys-popover" role="dialog" aria-label="Klavye kısayolları">
                <table>
                  <tbody>
                    {KEY_HELP.map(([k, t]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{t}</td></tr>)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="toolbar-group">
            <button className="ui-btn" onClick={handleExportSVG} title="SVG olarak indir"><Download size={15} /> SVG</button>
            <button className="ui-btn ui-btn-primary" onClick={handleExportPNG} title="PNG olarak indir"><ImageIcon size={15} /> PNG</button>
            <div className="keys-wrap">
              <button className="ui-btn" onClick={openShare} aria-expanded={!!share} title="Resmi WhatsApp, Gmail … ile gönder">
                <Share2 size={15} /> Paylaş
              </button>
              {share && (
                <div className="keys-popover share-popover" role="dialog" aria-label="Paylaş">
                  <p className="share-note">Resim bu cihazdan çıkar ve hasta bilgileri içerir.</p>
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
                  {share.withName && <p className="share-note">“Hasta adı olmadan”: üstteki ad resimden çıkarılır; etiketler ve notlar olduğu gibi kalır.</p>}
                </div>
              )}
            </div>
            <div className="keys-wrap">
              <button className="ui-btn ui-btn-icon" onClick={() => setMore(v => !v)} aria-expanded={more} aria-label="Diğer" title="Diğer: yazdır, PED dosyası">
                <MoreHorizontal size={15} />
              </button>
              {more && (
                <div className="keys-popover share-popover" role="dialog" aria-label="Diğer">
                  <button className="ui-btn" onClick={handlePrint}><Printer size={15} /> Yazdır (A4)</button>
                  <div className="more-title">PED dosyası</div>
                  <p className="share-note">Analiz programları ve laboratuvarlar için: kişi, anne, baba, cinsiyet ve tek bir etkilenme durumu. Kimlik olarak pedigri numaraları yazılır; hasta adı yazılmaz.</p>
                  <label className="field-col">
                    <span className="field-label">Etkilenmiş sayılacak</span>
                    <select className="select" value={pedPhenotype} onChange={e => setPedPhenotype(e.target.value)}>
                      <option value="affected">“Etkilenmiş” işaretli kişiler</option>
                      {(pedigreeData.conditionKey || []).map(e => <option key={e.id} value={e.label}>{e.label}</option>)}
                    </select>
                  </label>
                  <button className="ui-btn ui-btn-primary" onClick={handleExportPed}><Download size={15} /> PED indir</button>
                  <p className="share-note">PED dosyası açmak için “Aç” düğmesini kullanın.</p>
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
              {notices.some(n => n.level === 'error') ? 'Düzeltilmesi gereken' : 'Not'}: {notices.length}
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
          onUnionSelect={selectUnion}
          conditionKey={pedigreeData.conditionKey || []}
          patientName={doc.patientName || ''}
          onEditText={(kind, target, value) => {
            const v = String(value);
            if (kind === 'patientName') setPatientName(v.trim());
            else if (kind === 'finding') renameFinding(target, v);
            else if (kind === 'note') updateIndividual(target, { notes: v });
            else if (kind === 'geneticTest') {
              const code = { 'E+': 'positive', 'E-': 'negative', 'E−': 'negative', 'E VUS': 'vus', VUS: 'vus', E: 'tested', '': '' }[v.trim().toUpperCase().replace(/\s+/g, ' ')];
              updateIndividual(target, { geneticTest: code === undefined ? v.trim() : code });
            }
            else if (kind === 'geneticNote') updateIndividual(target, { geneticNote: v.trim() });
            else if (kind === 'onset') { const [pid, label] = String(target).split('\u0001'); setFindingOnset(pid, label, v.trim()); }
            else if (kind === 'childlessReason') setChildlessness(target, undefined, v);
            else if (kind === 'gestationWeeks') setGestationWeeks(target, v.replace(/[^\d.,]/g, ''));
            else if (kind === 'age') updateIndividual(target, { age: v.trim() }); // read (or refused) in ops.updatePerson
            else if (kind === 'ageAtDeath') updateIndividual(target, { ageAtDeath: v.trim() });
            else updateIndividual(target, { [kind]: v }); // displayLabel, condition, causeOfDeath
          }}
          renderQuickBar={(anchor, panBy) => (
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
