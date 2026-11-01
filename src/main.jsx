import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// development only: draw a family with every mark and list overlaps (src/audit/markCollisions.js)
if (import.meta.env.DEV) {
  window.__peditreeMarkAudit = async () => {
    const [{ buildMarkFamily, findMarkCollisions }, { usePedigreeStore }] = await Promise.all([
      import('./audit/markCollisions.js'), import('./state/usePedigreeStore.js')])
    buildMarkFamily(usePedigreeStore)
    await new Promise((r) => setTimeout(r, 400))
    return findMarkCollisions(document.querySelector('svg.pedigree-svg') || document.querySelector('.pedigree-viewport').ownerSVGElement)
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
