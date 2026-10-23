import React from 'react';
import * as d3 from 'd3';
import { usePedigreeStore } from './state/usePedigreeStore';
import { exportSVG, exportPNG } from './utils/exportUtils';
import { assessExportReadiness } from './utils/exportReadiness';
import { withStableIdsExcludingDismissed } from './utils/warningIds';
import { clinicalNotices } from './utils/clinicalNotices';
import PedigreeCanvas from './components/PedigreeCanvas';
import IndividualEditor from './components/IndividualEditor';
import WizardPanel from './components/WizardPanel';
import { Download, Image as ImageIcon, AlertTriangle, FilePlus2, Undo2, Redo2, Save, FolderOpen, LayoutGrid } from 'lucide-react';
import './styles/app.css';

function App() {
  const {
    pedigreeData, warnings, integrityIssues,
    updateIndividual, addSpouseTo, addChildTo, addChildToUnion,
    setProband, clearProband, resetPedigree,
    selectedId, selectedId2, selectIndividual, clearSelection,
    deleteIndividual, createUnionBetween, addCustomConsanguinity,
    reorderChild, setUnionRelationshipBackground,
    addParentsTo, addSiblingTo,
    undo, redo, _history, _future,
    dismissedWarningIds, dismissWarning,
    actionNotice, dismissActionNotice,
    exportProjectFile, openProjectFile, relayout,
  } = usePedigreeStore();
  const [exportError, setExportError] = React.useState(null);
  const [exportNotice, setExportNotice] = React.useState(null);
  const svgRef = React.useRef(null);

  const selectedNode = pedigreeData.individuals.find(i => i.id === selectedId);
  const selectedNode2 = pedigreeData.individuals.find(i => i.id === selectedId2);

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
      exportSVG(svgRef.current);
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
      await exportPNG(svgRef.current);
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
    if (window.confirm('Yeni pedigri başlatılsın mı? Kaydedilmiş mevcut pedigri silinecek.')) {
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
    a.download = `pedigri-${new Date().toISOString().slice(0, 10)}.peditree.json`;
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
    file.text().then(text => openProjectFile(text));
  };

  const handleNodeSelect = (id, opts) => {
    selectIndividual(id, opts);
  };

  return (
    <>
      <WizardPanel />

      <div className="canvas-container">
        {/* KI-5/KI-6: toolbar and notices sit in normal flow ABOVE the canvas —
            they can no longer cover pedigree symbols, and the toolbar wraps on
            narrow windows instead of overlapping the canvas controls. */}
        <div className="canvas-toolbar">
          <button className="btn" onClick={handleNewPedigree} style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="Kaydedilmiş pedigriyi sil ve yeniden başla">
            <FilePlus2 size={16} /> Yeni Pedigri
          </button>
          <button
            className="btn"
            onClick={handleUndo}
            disabled={!_history || _history.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: (!_history || _history.length === 0) ? 0.5 : 1 }}
            title={_history && _history.length > 0 ? `Geri al (${_history.length} adım mevcut)` : 'Geri alınacak adım yok'}
          >
            <Undo2 size={16} /> Geri Al
          </button>
          <button
            className="btn"
            onClick={handleRedo}
            disabled={!_future || _future.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: (!_future || _future.length === 0) ? 0.5 : 1 }}
            title={_future && _future.length > 0 ? `Yinele (${_future.length} adım mevcut)` : 'Yinelenecek adım yok'}
          >
            <Redo2 size={16} /> Yinele
          </button>
          <button className="btn" onClick={relayout} style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="Çizimi baştan düzenle: düzenlemelerden sonra korunan yerleşim yerine tüm pedigriyi yeniden yerleştirir (geri alınabilir)">
            <LayoutGrid size={16} /> Yeniden Düzenle
          </button>
          <button className="btn" onClick={handleSaveProject} style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="Pedigriyi proje dosyası olarak kaydet (.peditree.json)">
            <Save size={16} /> Kaydet
          </button>
          <button className="btn" onClick={() => fileInputRef.current && fileInputRef.current.click()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="Proje dosyası aç (.peditree.json; eski biçim de açılır)">
            <FolderOpen size={16} /> Aç
          </button>
          <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleOpenProject} style={{ display: 'none' }} aria-label="Proje dosyası seç" />
          <button className="btn btn-primary" onClick={handleExportSVG} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Download size={16} /> SVG
          </button>
          <button className="btn btn-primary" onClick={handleExportPNG} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ImageIcon size={16} /> PNG
          </button>
        </div>

        <div className="canvas-notices">
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
          onNodeSelect={handleNodeSelect}
        />
        </div>
      </div>

      <div className="panel editor-panel">
        <IndividualEditor
          node={selectedNode}
          node2={selectedNode2}
          pedigreeData={pedigreeData}
          onUpdate={updateIndividual}
          onAddSpouse={addSpouseTo}
          onAddChild={(unionId, sex, targetId) => {
            if (unionId) {
              addChildToUnion(unionId, sex);
            } else if (targetId) {
              addChildTo(targetId, sex);
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
          onAddParents={addParentsTo}
          onAddSibling={addSiblingTo}
        />

        {/* v0.3a.4: the raw graph dump exposes internal IDs (mother, father,
            U_PARENTS, ...) which must NOT appear in normal clinical UI. It
            is now a collapsed developer/debug affordance — hidden by
            default, opened deliberately via the disclosure triangle. */}
        <details style={{ marginTop: '30px', padding: '10px', background: '#f8fafc', borderRadius: '6px', fontSize: '11px', color: '#94a3b8', wordWrap: 'break-word' }}>
          <summary style={{ cursor: 'pointer', color: '#94a3b8' }}>Geliştirici: ham grafik verisi (teknik ID’ler)</summary>
          <pre style={{ overflow: 'auto', maxHeight: '300px' }}>
            {JSON.stringify({ individuals: pedigreeData.individuals, unions: pedigreeData.unions }, null, 2)}
          </pre>
        </details>
      </div>
    </>
  );
}

export default App;
