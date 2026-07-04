import React from 'react';
import * as d3 from 'd3';
import { usePedigreeStore } from './state/usePedigreeStore';
import { exportSVG, exportPNG } from './utils/exportUtils';
import { assessExportReadiness } from './utils/exportReadiness';
import PedigreeCanvas from './components/PedigreeCanvas';
import IndividualEditor from './components/IndividualEditor';
import WizardPanel from './components/WizardPanel';
import { Download, Image as ImageIcon, AlertTriangle, FilePlus2 } from 'lucide-react';
import './styles/app.css';

function App() {
  const {
    pedigreeData, warnings, integrityIssues, wizardData,
    updateIndividual, addSpouseTo, addChildTo, addChildToUnion, removeGraphEdit,
    setProband, clearProband, resetPedigree,
  } = usePedigreeStore();
  const [selectedNodeId, setSelectedNodeId] = React.useState(null);
  const [exportError, setExportError] = React.useState(null);
  const [exportNotice, setExportNotice] = React.useState(null);
  const svgRef = React.useRef(null);

  const selectedNode = pedigreeData.individuals.find(i => i.id === selectedNodeId);

  const errorIssues = (integrityIssues || []).filter(i => i.severity === 'error');
  const warningIssues = (integrityIssues || []).filter(i => i.severity === 'warning');

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
      resetPedigree();
      setSelectedNodeId(null);
      setExportError(null);
      setExportNotice(null);
    }
  };

  return (
    <>
      <WizardPanel />

      <div className="canvas-container">
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', gap: '8px' }}>
          <button className="btn" onClick={handleNewPedigree} style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="Kaydedilmiş pedigriyi sil ve yeniden başla">
            <FilePlus2 size={16} /> Yeni Pedigri
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

        {(warnings.length > 0 || errorIssues.length > 0 || warningIssues.length > 0) && (
          <div className="warning-panel">
            <h4 style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '5px' }}><AlertTriangle size={16} /> Uyarılar</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem' }}>
              {errorIssues.map((issue, i) => (
                <li key={`err-${i}`} style={{ color: '#dc2626', fontWeight: 600 }}>{issue.message}</li>
              ))}
              {warningIssues.map((issue, i) => (
                <li key={`warn-${i}`}>{issue.message}</li>
              ))}
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        <PedigreeCanvas
          ref={svgRef}
          nodes={pedigreeData.nodes || []}
          edges={pedigreeData.edges || []}
          selectedNodeId={selectedNodeId}
          onNodeSelect={setSelectedNodeId}
        />
      </div>

      <div className="panel editor-panel">
        <IndividualEditor
          node={selectedNode}
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
