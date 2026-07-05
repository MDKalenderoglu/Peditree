import React from 'react';
import * as d3 from 'd3';
import { usePedigreeStore } from './state/usePedigreeStore';
import { exportSVG, exportPNG } from './utils/exportUtils';
import { assessExportReadiness } from './utils/exportReadiness';
import { withStableIdsExcludingDismissed } from './utils/warningIds';
import PedigreeCanvas from './components/PedigreeCanvas';
import IndividualEditor from './components/IndividualEditor';
import WizardPanel from './components/WizardPanel';
import { Download, Image as ImageIcon, AlertTriangle, FilePlus2, Undo2, Redo2 } from 'lucide-react';
import './styles/app.css';

function App() {
  const {
    pedigreeData, warnings, integrityIssues, wizardData,
    updateIndividual, addSpouseTo, addChildTo, addChildToUnion, removeGraphEdit,
    setProband, clearProband, resetPedigree,
    selectedId, selectedId2, selectIndividual, clearSelection,
    deleteIndividual, createUnionBetween, addCustomConsanguinity,
    reorderChild, setUnionRelationshipBackground,
    addParentsTo, addSiblingTo,
    undo, redo, _history, _future,
    dismissedWarningIds, dismissWarning,
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

  const handleNodeSelect = (id, opts) => {
    selectIndividual(id, opts);
  };

  return (
    <>
      <WizardPanel />

      <div className="canvas-container">
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', gap: '8px' }}>
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
          <button className="btn btn-primary" onClick={handleExportSVG} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Download size={16} /> SVG
          </button>
          <button className="btn btn-primary" onClick={handleExportPNG} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ImageIcon size={16} /> PNG
          </button>
        </div>

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

        {(visibleErrorIssues.length > 0 || visibleWarningIssues.length > 0 || visibleWarnings.length > 0) && (
          <div className="warning-panel">
            <h4 style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '5px' }}><AlertTriangle size={16} /> Uyarılar</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem', listStyle: 'none' }}>
              {visibleErrorIssues.map(({ item, _warningId }) => (
                <li key={_warningId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ color: '#dc2626', fontWeight: 600 }}>{item.message}</span>
                  <button onClick={() => dismissWarning(_warningId)} title="Bu uyarıyı gizle" style={dismissBtnStyle}>×</button>
                </li>
              ))}
              {visibleWarningIssues.map(({ item, _warningId }) => (
                <li key={_warningId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                  <span>{item.message}</span>
                  <button onClick={() => dismissWarning(_warningId)} title="Bu uyarıyı gizle" style={dismissBtnStyle}>×</button>
                </li>
              ))}
              {visibleWarnings.map(({ item, _warningId }) => (
                <li key={_warningId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                  <span>{item}</span>
                  <button onClick={() => dismissWarning(_warningId)} title="Bu uyarıyı gizle" style={dismissBtnStyle}>×</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <PedigreeCanvas
          ref={svgRef}
          nodes={pedigreeData.nodes || []}
          edges={pedigreeData.edges || []}
          selectedNodeId={selectedId}
          selectedNodeId2={selectedId2}
          onNodeSelect={handleNodeSelect}
        />
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
          graphEdits={wizardData.graphEdits || []}
          onRemoveGraphEdit={removeGraphEdit}
          onDeleteIndividual={deleteIndividual}
          onCreateUnion={createUnionBetween}
          onMakeSiblings={addCustomConsanguinity}
          onClearSelection={clearSelection}
          onReorderChild={reorderChild}
          onSetUnionRelationshipBackground={setUnionRelationshipBackground}
          onAddParents={addParentsTo}
          onAddSibling={addSiblingTo}
        />

        <div style={{ marginTop: '30px', padding: '10px', background: '#f8fafc', borderRadius: '6px', fontSize: '11px', color: '#64748b', wordWrap: 'break-word' }}>
          <strong>Canlı Veri Özeti</strong>
          <pre style={{ overflow: 'auto', maxHeight: '300px' }}>
            {JSON.stringify({ individuals: pedigreeData.individuals, unions: pedigreeData.unions }, null, 2)}
          </pre>
        </div>
      </div>
    </>
  );
}

export default App;
