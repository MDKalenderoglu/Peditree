/**
 * pdf.js — the drawing as a one-page A4 PDF (clinician decision 2026-10-30:
 * "İndir → PDF", ready to print or attach to a file).
 *
 * The page holds the drawing as an image at print resolution (300 dpi),
 * stored without loss (Flate), so it looks exactly as on screen — the chosen
 * typeface, the hand-drawn look, Turkish letters — on any computer. No
 * library: a PDF with one image is a few objects, written here.
 *
 * Landscape or portrait by the drawing's shape, 10 mm margins, the drawing
 * centred and as large as fits (a small family at its drawn size); "PediTree · date" at the foot, as on a print.
 * No patient data in the file's metadata.
 */

export const A4 = { w: 595.28, h: 841.89 }; // points
export const MARGIN = 28.35; // 10 mm
export const DPI = 300;
const FOOT = 14; // room for the foot line

/** Where the drawing goes on the page, and how many pixels it needs at DPI. */
export function pageLayout(drawingW, drawingH) {
  const landscape = drawingW >= drawingH;
  const W = landscape ? A4.h : A4.w;
  const H = landscape ? A4.w : A4.h;
  const boxW = W - 2 * MARGIN;
  const boxH = H - 2 * MARGIN - FOOT;
  // as large as fits, but a small family is not blown up (one drawing unit at most one point)
  const fit = Math.min(1, boxW / drawingW, boxH / drawingH);
  const dw = drawingW * fit;
  const dh = drawingH * fit;
  return {
    W, H, landscape, dw, dh,
    x: (W - dw) / 2,
    y: MARGIN + FOOT + (boxH - dh) / 2,
    // pixels per drawing unit for DPI on paper
    pixelScale: (fit * DPI) / 72,
  };
}

const enc = new TextEncoder();
const latin1 = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const fmt = (n) => (Math.round(n * 1000) / 1000).toString();

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** RGBA pixels (canvas ImageData) to RGB — the canvas is painted white first, so alpha is 255. */
export function rgbaToRgb(rgba) {
  const rgb = new Uint8Array((rgba.length / 4) * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i]; rgb[j + 1] = rgba[i + 1]; rgb[j + 2] = rgba[i + 2];
  }
  return rgb;
}

/**
 * The PDF file.
 * @param {{ width: number, height: number, rgb: Uint8Array }} image  the drawing's pixels
 * @param {ReturnType<typeof pageLayout>} page
 * @param {string} foot  the foot line (WinAnsi characters: "PediTree · 30.10.2026")
 * @returns {Promise<Blob>}
 */
export async function pdfBlob(image, page, foot = '') {
  const pixels = await deflate(image.rgb);
  const content = [
    'q', `${fmt(page.dw)} 0 0 ${fmt(page.dh)} ${fmt(page.x)} ${fmt(page.y)} cm`, '/Im1 Do', 'Q',
    foot ? `BT /F1 8 Tf 0.39 0.45 0.55 rg ${fmt(MARGIN)} ${fmt(MARGIN)} Td (${foot.replace(/[\\()]/g, '\\$&')}) Tj ET` : '',
  ].filter(Boolean).join('\n');
  const contentBytes = latin1(content);

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(page.W)} ${fmt(page.H)}] /Resources << /XObject << /Im1 4 0 R >> /Font << /F1 6 0 R >> >> /Contents 5 0 R >>`,
    { dict: `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${pixels.length} >>`, data: pixels },
    { dict: `<< /Length ${contentBytes.length} >>`, data: contentBytes },
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Producer (PediTree) >>',
  ];

  const chunks = [];
  let length = 0;
  const push = (bytes) => { chunks.push(bytes); length += bytes.length; };
  push(latin1('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'));
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(length);
    if (typeof o === 'string') {
      push(enc.encode(`${i + 1} 0 obj\n${o}\nendobj\n`));
    } else {
      push(enc.encode(`${i + 1} 0 obj\n${o.dict}\nstream\n`));
      push(o.data);
      push(enc.encode('\nendstream\nendobj\n'));
    }
  });
  const xref = length;
  push(enc.encode(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`));
  push(enc.encode(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return new Blob(chunks, { type: 'application/pdf' });
}
