import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// development only: draw a family with every mark and list overlaps; the open
// family is put back afterwards (src/audit/markCollisions.js runMarkAudit)
if (import.meta.env.DEV) {
  window.__peditreeMarkAudit = async (opts) => {
    const [{ runMarkAudit }, { usePedigreeStore }] = await Promise.all([
      import('./audit/markCollisions.js'), import('./state/usePedigreeStore.js')])
    return runMarkAudit(usePedigreeStore, opts)
  }
  // the arrow on every person, as consultand and as proband (runArrowSweep)
  window.__peditreeArrowSweep = async (opts) => {
    const [{ runArrowSweep }, { usePedigreeStore }] = await Promise.all([
      import('./audit/markCollisions.js'), import('./state/usePedigreeStore.js')])
    return runArrowSweep(usePedigreeStore, opts)
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
