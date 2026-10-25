/**
 * exportUtils.js
 *
 * SVG/PNG export for the rendered pedigree.
 *
 * Both functions accept the live <svg> DOM element directly (passed by the
 * caller via a React ref — see App.jsx / PedigreeCanvas.jsx). This is the
 * primary path. A document.getElementById('pedigree-svg') fallback is kept
 * for callers that don't have a ref handy (e.g. ad-hoc console/debug use),
 * since PedigreeCanvas.jsx still sets that id on the element.
 *
 * Previously these functions looked up the svg purely by id, and the id
 * had drifted out of the rendered markup — export silently did nothing.
 * That failure mode is why this now throws instead of returning early:
 * a missing svg is surfaced to the caller, not swallowed.
 */

export class ExportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExportError';
  }
}

function resolveSvgElement(svgElement) {
  const el = svgElement || (typeof document !== 'undefined' ? document.getElementById('pedigree-svg') : null);
  if (!el) {
    throw new ExportError('Pedigri çizimi bulunamadı — dışa aktarılamadı. Önce bir pedigri oluşturun.');
  }
  return el;
}

/**
 * Read the svg's viewBox as numbers, or null if absent/unparseable.
 */
function readViewBox(svg) {
  const raw = svg && typeof svg.getAttribute === 'function' ? svg.getAttribute('viewBox') : null;
  if (!raw) return null;
  const [x, y, width, height] = raw.split(/[\s,]+/).map(Number);
  return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0 ? { x, y, width, height } : null;
}

/**
 * v0.5 Faz 2a (EX-1/EX-2): export a canonical copy of the drawing, never the
 * live on-screen state. The live <svg> carries the current zoom/pan transform
 * (which could crop the pedigree), a responsive `width="100%"` (no intrinsic
 * size) and a light-grey screen background. Selection highlighting is page
 * CSS only (app.css), so it is not part of the serialized markup at all.
 *
 * Falls back to the element itself when it cannot be cloned (non-DOM stubs).
 */
export function prepareExportSvg(svg, { withoutPatientName = false } = {}) {
  if (!svg || typeof svg.cloneNode !== 'function') return svg;
  const clone = svg.cloneNode(true);
  // keyboard / screen-reader helpers of the screen are not part of the file
  clone.querySelectorAll?.('[data-node-id]').forEach((n) => {
    ['data-node-id', 'tabindex', 'role', 'aria-label'].forEach((a) => n.removeAttribute(a));
  });
  // sharing without the patient's name (labels and notes stay as they are)
  if (withoutPatientName) clone.querySelectorAll?.('.patient-header').forEach((n) => n.remove());
  const vb = readViewBox(svg);
  if (vb) {
    clone.setAttribute('width', String(Math.ceil(vb.width)));
    clone.setAttribute('height', String(Math.ceil(vb.height)));
  }
  clone.removeAttribute('style');
  clone.removeAttribute('id');
  // click targets and other screen-only helpers are not part of the drawing
  clone.querySelectorAll?.('.ui-only').forEach((n) => n.remove());
  const viewport = clone.querySelector('.pedigree-viewport');
  if (viewport) viewport.removeAttribute('transform');
  if (vb && clone.ownerDocument) {
    const bg = clone.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', String(vb.x));
    bg.setAttribute('y', String(vb.y));
    bg.setAttribute('width', String(vb.width));
    bg.setAttribute('height', String(vb.height));
    bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);
  }
  return clone;
}

function serializeSvg(svg, opts) {
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(prepareExportSvg(svg, opts));

  // Add name spaces.
  if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
    source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!source.match(/^<svg[^>]+"http:\/\/www\.w3\.org\/1999\/xlink"/)) {
    source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  }

  // Add xml declaration
  return '<?xml version="1.0" standalone="no"?>\r\n' + source;
}

function triggerDownload(href, filename) {
  const downloadLink = document.createElement('a');
  downloadLink.href = href;
  downloadLink.download = filename;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}

/** File name for a download: pedigri-<patient>-<date>.<ext> (Turkish letters kept readable). */
export function exportFileName(patientName, ext, date = new Date()) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u' };
  const slug = String(patientName || '').trim().toLocaleLowerCase('tr')
    .replace(/[çğıiöşü]/g, (ch) => map[ch] || ch)
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `pedigri${slug ? `-${slug}` : ''}-${date.toISOString().slice(0, 10)}.${ext}`;
}

/**
 * Export the pedigree as an SVG file.
 * @param {SVGSVGElement} [svgElement] - the live svg node (preferred). Falls back to #pedigree-svg.
 * @throws {ExportError} if no svg element can be found.
 */
export function exportSVG(svgElement, filename = 'pedigree.svg') {
  const svg = resolveSvgElement(svgElement);
  const source = serializeSvg(svg);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
  triggerDownload(url, filename);
}

/**
 * The pedigree as a PNG image (Blob), 2× for print quality — for download
 * and for sharing. `withoutPatientName` leaves the patient's name out.
 * @returns {Promise<Blob>} rejects with ExportError on failure
 */
export function pngBlob(svgElement, opts = {}) {
  return new Promise((resolve, reject) => {
    let svg;
    try {
      svg = resolveSvgElement(svgElement);
    } catch (err) {
      reject(err);
      return;
    }

    const source = serializeSvg(svg, opts);
    const img = new Image();
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = function () {
      try {
        // Size from the drawing itself (viewBox), not from the on-screen panel,
        // so a large pedigree is not shrunk to the window width (EX-2). Scale
        // 2× for print quality, capped below common browser canvas limits.
        const vb = readViewBox(svg);
        const width = vb ? vb.width : 800;
        const height = vb ? vb.height : 600;
        const MAX_SIDE = 16000;
        const scale = Math.max(0.25, Math.min(2, MAX_SIDE / Math.max(width, height)));

        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(width * scale);
        canvas.height = Math.ceil(height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new ExportError('PNG oluşturulamadı.'))), 'image/png');
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(new ExportError(`PNG oluşturulamadı: ${err.message}`));
      }
    };

    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new ExportError('PNG oluşturulamadı — SVG görüntüye dönüştürülemedi.'));
    };

    img.src = url;
  });
}

/**
 * Export the pedigree as a PNG file.
 * @param {SVGSVGElement} [svgElement] - the live svg node (preferred). Falls back to #pedigree-svg.
 * @returns {Promise<void>} resolves once the download has been triggered, rejects with ExportError on failure.
 */
export async function exportPNG(svgElement, filename = 'pedigree.png') {
  const blob = await pngBlob(svgElement);
  downloadBlob(blob, filename);
}

/** Save a Blob as a file. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Hand a file to the device's share sheet (WhatsApp, Gmail, …). Returns
 * 'shared', 'cancelled', or 'unsupported' (the browser cannot share files:
 * the caller downloads it instead).
 */
export async function shareFile(file, title = 'Pedigri') {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (!nav || !nav.share || !nav.canShare || !nav.canShare({ files: [file] })) return 'unsupported';
  try {
    await nav.share({ files: [file], title });
    return 'shared';
  } catch (err) {
    if (err && err.name === 'AbortError') return 'cancelled';
    throw new ExportError(`Paylaşılamadı: ${err.message}`);
  }
}
