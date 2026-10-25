import React from 'react';
import * as d3 from 'd3';
import { usePedigreeStore, needsLeaveWarning, flushAutosave } from './state/usePedigreeStore';
import { exportSVG, exportPNG, exportFileName } from './utils/exportUtils';
import { assessExportReadiness } from './utils/exportReadiness';
import { withStableIdsExcludingDismissed } from './utils/warningIds';
import { clinicalNotices } from './utils/clinicalNotices';
import { sanitizeAgeValue } from './utils/ageValidation';
import PedigreeCanvas from './components/PedigreeCanvas';
import IndividualEditor from './components/IndividualEditor';
import RadialAddMenu from './components/RadialAddMenu';
import { flushDrafts } from './utils/drafts';
import { Download, Image as ImageIcon, AlertTriangle, FilePlus2, Undo2, Redo2, Save, FolderOpen, LayoutGrid, Keyboard } from 'lucide-react';
import './styles/app.css';
import './styles/ui.css';

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
    addParentsTo, addSiblingTo,
    undo, redo, _history, _future,
    dismissedWarningIds, dismissWarning,
    actionNotice, dismissActionNotice, autosaveFailed,
    exportProjectFile, openProjectFile, relayout, doc, setPatientName,
  } = usePedigreeStore();
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
      setExportError(`Export engellendi (düzeltilmesi gereken kritik sorunlar var):\n${assessment.fatal.join('\n')}`);
      return null;
    }

    if (assessment.errors.length > 0) {
      const proceed = window.confirm(
        `Pedigride ciddi veri kalitesi sorunları var:\n\n${assessment.errors.join('\n')}\n\nYine de export etmek istiyor musunuz?`
      );
      if (!proceed) {
        setExportError(null);
        setExportNotice('Export iptal edildi.');
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
        ? `Export tamamlandı — dikkat edilmesi gerekenler:\n${assessment.warnings.join('\n')}`
        : null);
    } catch (err) {
      setExportNotice(null);
      setExportError(err.message || 'SVG export başarısız oldu.');
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
        ? `Export tamamlandı — dikkat edilmesi gerekenler:\n${assessment.warnings.join('\n')}`
        : null);
    } catch (err) {
      setExportNotice(null);
      setExportError(err.message || 'PNG export başarısız oldu.');
    }
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
    file.text().then(text => openProjectFile(text)).catch(() => openProjectFile(null));
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
  React.useEffect(() => { keyRef.current = { undo, redo, handleSaveProject, clearSelection, deleteIndividual, selectedNodes }; });
  React.useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const k = keyRef.current;
      if (!k) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 's') { e.preventDefault(); k.handleSaveProject(); return; }
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
      if (zoom) document.querySelector(`.zoom-controls button[aria-label="${zoom}"]`)?.click();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleNodeSelect = (id, opts) => {
    selectIndividual(id, opts);
  };

  return (
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
          <div className="toolbar-sep" />
          <div className="toolbar-group">
            <button className="ui-btn" onClick={handleNewPedigree} title="Kaydedilmiş pedigriyi sil ve yeniden başla"><FilePlus2 size={15} /> Yeni</button>
            <button className="ui-btn" onClick={() => fileInputRef.current && fileInputRef.current.click()} title="Proje dosyası aç (.peditree.json; eski biçim de açılır)"><FolderOpen size={15} /> Aç</button>
            <button className="ui-btn" onClick={handleSaveProject} title="Pedigriyi proje dosyası olarak kaydet (.peditree.json)"><Save size={15} /> Kaydet</button>
            <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleOpenProject} style={{ display: 'none' }} aria-label="Proje dosyası seç" />
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
          <button className="ui-btn ui-btn-icon ui-btn-ghost" aria-label="Klavye kısayolları"
            title={'Klavye kısayolları\nCmd/Ctrl+Z  geri al\nCmd/Ctrl+Shift+Z  yinele\nCmd/Ctrl+S  kaydet\nDelete  seçili kişiyi sil\nEsc  seçimi kapat\n+ / −  yakınlaştır / uzaklaştır\n0  sığdır\nCmd/Ctrl+tık  birden çok kişi seç'}>
            <Keyboard size={15} />
          </button>
          <div className="toolbar-group">
            <button className="ui-btn" onClick={handleExportSVG} title="SVG olarak indir"><Download size={15} /> SVG</button>
            <button className="ui-btn ui-btn-primary" onClick={handleExportPNG} title="PNG olarak indir"><ImageIcon size={15} /> PNG</button>
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
                <AlertTriangle size={16} /> İşlem uygulanmadı
              </h4>
              <button onClick={dismissActionNotice} title="Kapat" style={dismissBtnStyle}>×</button>
            </div>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.9rem', color: '#1e3a8a', whiteSpace: 'pre-line' }}>{actionNotice.message}</p>
          </div>
        )}

        {exportError && (
          <div className="warning-panel" style={{ borderColor: '#dc2626', background: '#fef2f2' }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '5px', color: '#dc2626' }}>
              <AlertTriangle size={16} /> Export Hatası
            </h4>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.9rem', color: '#991b1b', whiteSpace: 'pre-line' }}>{exportError}</p>
          </div>
        )}

        {exportNotice && (
          <div className="warning-panel" style={{ borderColor: '#d97706', background: '#fffbeb' }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '5px', color: '#b45309' }}>
              <AlertTriangle size={16} /> Export Uyarısı
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
          onNodeSelect={handleNodeSelect}
          onUnionSelect={selectUnion}
          conditionKey={pedigreeData.conditionKey || []}
          patientName={doc.patientName || ''}
          onEditText={(kind, target, value) => {
            const v = String(value);
            if (kind === 'patientName') setPatientName(v.trim());
            else if (kind === 'finding') renameFinding(target, v);
            else if (kind === 'note') updateIndividual(target, { notes: v });
            else if (kind === 'age') updateIndividual(target, { age: sanitizeAgeValue(v) });
            else if (kind === 'ageAtDeath') updateIndividual(target, { ageAtDeath: sanitizeAgeValue(v) });
            else updateIndividual(target, { [kind]: v }); // displayLabel, condition, causeOfDeath
          }}
          renderQuickBar={(anchor) => (
            <RadialAddMenu anchor={anchor} node={selectedNode} pedigreeData={pedigreeData}
              onAddSibling={addSiblingTo} onAddSpouse={addSpouseTo} onAddParents={addParentsTo} onAddTwin={addMultipleSibling}
              onUpdate={updateIndividual} onSetProband={setProband} onClearProband={clearProband}
              onAddFinding={addFinding} onSetFindingStatus={setFindingStatus} onSetFindingStyle={setFindingStyle}
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
  );
}

export default App;
