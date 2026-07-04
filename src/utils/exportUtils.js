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
    throw new ExportError('Pedigri çizimi bulunamadı — export yapılamadı. Önce bir pedigri oluşturun.');
  }
  return el;
}

function serializeSvg(svg) {
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svg);

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

/**
 * Export the pedigree as an SVG file.
 * @param {SVGSVGElement} [svgElement] - the live svg node (preferred). Falls back to #pedigree-svg.
 * @throws {ExportError} if no svg element can be found.
 */
export function exportSVG(svgElement) {
  const svg = resolveSvgElement(svgElement);
  const source = serializeSvg(svg);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
  triggerDownload(url, 'pedigree.svg');
}

/**
 * Export the pedigree as a PNG file.
 * @param {SVGSVGElement} [svgElement] - the live svg node (preferred). Falls back to #pedigree-svg.
 * @returns {Promise<void>} resolves once the download has been triggered, rejects with ExportError on failure.
 */
export function exportPNG(svgElement) {
  return new Promise((resolve, reject) => {
    let svg;
    try {
      svg = resolveSvgElement(svgElement);
    } catch (err) {
      reject(err);
      return;
    }

    const source = serializeSvg(svg);
    const img = new Image();
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = function () {
      try {
        const rect = svg.getBoundingClientRect();
        const width = rect.width || svg.viewBox?.baseVal?.width || 800;
        const height = rect.height || svg.viewBox?.baseVal?.height || 600;

        const canvas = document.createElement('canvas');
        canvas.width = width * 2; // high res
        canvas.height = height * 2;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        const imgURI = canvas.toDataURL('image/png').replace('image/png', 'image/octet-stream');
        triggerDownload(imgURI, 'pedigree.png');
        resolve();
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
