/**
 * pdf.test.js — "İndir → PDF" (clinician decision 2026-10-30): a valid
 * one-page A4 PDF, the drawing stored without loss, no patient data in it
 * beyond the drawing itself.
 */
import { describe, it, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pageLayout, pdfBlob, rgbaToRgb, A4, MARGIN, DPI } from '../utils/pdf';

const bytesOf = async (blob) => Buffer.from(await blob.arrayBuffer());

describe('PDF page', () => {
  it('a wide drawing goes landscape, a tall one portrait, centred within 10 mm margins', () => {
    const wide = pageLayout(1600, 700);
    expect(wide.landscape).toBe(true);
    expect([wide.W, wide.H]).toEqual([A4.h, A4.w]);
    const tall = pageLayout(500, 1400);
    expect(tall.landscape).toBe(false);
    for (const p of [wide, tall]) {
      expect(p.x).toBeGreaterThanOrEqual(MARGIN - 1e-9);
      expect(p.x + p.dw).toBeLessThanOrEqual(p.W - MARGIN + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(MARGIN);
      expect(p.y + p.dh).toBeLessThanOrEqual(p.H - MARGIN + 1e-9);
      expect(Math.abs((p.x - MARGIN) - (p.W - MARGIN - p.x - p.dw))).toBeLessThan(1e-6); // centred
    }
  });

  it('300 dpi on paper; a small family keeps its drawn size', () => {
    const p = pageLayout(1600, 700);
    expect(p.pixelScale).toBeCloseTo((p.dw / 1600) * DPI / 72, 9);
    const small = pageLayout(300, 200);
    expect(small.dw).toBe(300);
    expect(small.pixelScale).toBeCloseTo(DPI / 72, 9);
  });
});

describe('PDF file', () => {
  const W = 7, H = 3;
  const rgba = new Uint8ClampedArray(W * H * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 37) % 256));

  it('is a valid PDF: header, objects at the offsets the xref gives, one A4 page', async () => {
    const page = pageLayout(700, 300);
    const buf = await bytesOf(await pdfBlob({ width: W, height: H, rgb: rgbaToRgb(rgba) }, page, 'PediTree \xb7 30.10.2026'));
    const text = buf.toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    const startxref = Number(text.match(/startxref\n(\d+)/)[1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const offsets = [...text.slice(startxref).matchAll(/(\d{10}) 00000 n /g)].map(m => Number(m[1]));
    expect(offsets).toHaveLength(7);
    offsets.forEach((o, i) => expect(text.slice(o).startsWith(`${i + 1} 0 obj\n`)).toBe(true));
    expect(text).toMatch(/\/Count 1/);
    expect(text).toMatch(new RegExp(`/MediaBox \\[0 0 ${page.W.toFixed(2).replace(/0+$/, '')}`));
  });

  it('the drawing comes back pixel for pixel (lossless)', async () => {
    const buf = await bytesOf(await pdfBlob({ width: W, height: H, rgb: rgbaToRgb(rgba) }, pageLayout(700, 300)));
    const text = buf.toString('latin1');
    const dict = text.match(/\/Subtype \/Image \/Width (\d+) \/Height (\d+) .*?\/Length (\d+) >>\nstream\n/);
    expect([Number(dict[1]), Number(dict[2])]).toEqual([W, H]);
    const start = dict.index + dict[0].length;
    const pixels = inflateSync(buf.subarray(start, start + Number(dict[3])));
    expect(Buffer.compare(pixels, Buffer.from(rgbaToRgb(rgba)))).toBe(0);
  });

  it('the foot line is the only text; no patient name or title in the metadata', async () => {
    const buf = await bytesOf(await pdfBlob({ width: W, height: H, rgb: rgbaToRgb(rgba) }, pageLayout(700, 300), 'PediTree \xb7 30.10.2026'));
    const text = buf.toString('latin1');
    expect(text).toContain('(PediTree \xb7 30.10.2026) Tj');
    expect(text).not.toMatch(/\/Title|\/Author|\/Subject/);
  });

  it('İndir offers it', () => {
    const app = readFileSync(join(process.cwd(), 'src/App.jsx'), 'utf8');
    expect(app).toMatch(/handleExportPDF\(\); \}\}>/);
    expect(app).toMatch(/exportFileName\(doc\.patientName, 'pdf'\)/);
  });
});
