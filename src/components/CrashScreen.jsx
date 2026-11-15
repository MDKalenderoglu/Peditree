/**
 * CrashScreen — what the page shows when drawing it fails (security audit 2026-11-15, runs 1 and 2:
 * a file with a field of an unexpected type made the drawing throw, React took the whole page down,
 * and the clinician was left with a blank page and no way back). The files that did this are now
 * refused when opened; this is the net for any case still unknown. The page is replaced by a short
 * notice with three ways out: go back one step (the pedigree before the last change, e.g. the one
 * open before a file replaced it), download the pedigree as it is, or start a new one. Nothing is
 * lost silently: the pedigree stays in the tab until the clinician chooses.
 */
import React from 'react';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { serializeDocument } from '../graph/persistenceV2';
import { exportFileName, downloadBlob } from '../utils/exportUtils';
import { t } from '../i18n';

export default class CrashScreen extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('[PediTree] The drawing could not be shown:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const S = () => usePedigreeStore.getState();
    const canUndo = (S()._history || []).length > 0;
    const again = () => this.setState({ failed: false });
    const name = (() => { try { return typeof S().doc.patientName === 'string' ? S().doc.patientName : ''; } catch { return ''; } })();
    return (
      <div className="crash-screen" role="alert">
        <div className="warning-panel crash-card" data-tone="error">
          <h1 className="notice-title">{t('Pedigri gösterilemedi')}</h1>
          <p className="notice-text">{t('Çizim sırasında beklenmeyen bir hata oluştu. Pedigri bu sekmede duruyor; aşağıdan bir önceki adıma dönebilir, olduğu gibi indirebilir ya da yeni bir pedigri başlatabilirsiniz.')}</p>
          <div className="crash-actions">
            {canUndo && (
              <button type="button" className="ui-btn ui-btn-primary" onClick={() => { S().undo(); again(); }}>{t('Bir önceki adıma dön')}</button>
            )}
            <button type="button" className="ui-btn" onClick={() => {
              const text = serializeDocument(S().doc);
              downloadBlob(new Blob([text], { type: 'application/json' }), exportFileName(name, 'peditree.json'));
            }}>{t('Pedigriyi indir')}</button>
            <button type="button" className="ui-btn" onClick={() => { S().resetPedigree(); again(); }}>{t('Yeni pedigri başlat')}</button>
          </div>
        </div>
      </div>
    );
  }
}
