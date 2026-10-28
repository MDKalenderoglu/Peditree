/**
 * exportUtils.test.js — SVG/PNG export must fail loudly, never silently (v0.2).
 *
 * This closes the exact regression the audit found: exportSVG/exportPNG used
 * to look up `document.getElementById('pedigree-svg')`, which had drifted
 * out of sync with the rendered markup, and silently no-op when not found.
 *
 * The vitest environment here is 'node' (see vite.config.js), so there is no
 * real DOM. The "no element available" tests below need no DOM at all — that
 * is the point: resolveSvgElement must throw before it ever touches the DOM.
 * The "happy path" test installs a minimal `document`/`XMLSerializer` stub
 * sufficient for exportSVG's actual code path (createElement/appendChild/
 * click/removeChild + XMLSerializer.serializeToString), rather than a full
 * DOM environment.
 *
 * Run: npm test
 */

import { describe, it, expect, afterEach } from 'vitest';
import { exportSVG, exportPNG, ExportError } from '../utils/exportUtils';

afterEach(() => {
  delete globalThis.document;
  delete globalThis.XMLSerializer;
});

describe('exportUtils.js (v0.2)', () => {
  it('exportSVG throws an explicit ExportError when no svg element is available (no ref, no #pedigree-svg)', () => {
    expect(() => exportSVG(null)).toThrow(ExportError);
    expect(() => exportSVG(undefined)).toThrow(/Pedigri çizimi bulunamadı/);
  });

  it('exportPNG rejects with an explicit ExportError when no svg element is available', async () => {
    await expect(exportPNG(null)).rejects.toBeInstanceOf(ExportError);
    await expect(exportPNG(undefined)).rejects.toThrow(/Pedigri çizimi bulunamadı/);
  });

  it('exportSVG succeeds and triggers a download when a real svg element is passed', () => {
    // Minimal stand-ins for the browser APIs exportSVG's happy path touches.
    const createdElements = [];
    let clickedHref = null;
    globalThis.document = {
      createElement: (tag) => {
        createdElements.push(tag);
        const el = { style: {} };
        el.click = () => { clickedHref = el.href; };
        return el;
      },
      body: { appendChild: () => {}, removeChild: () => {} },
    };
    globalThis.XMLSerializer = function () {
      this.serializeToString = () => '<svg><rect /></svg>';
    };

    const fakeSvgElement = {}; // exportSVG never inspects the element itself, only serializes it
    expect(() => exportSVG(fakeSvgElement)).not.toThrow();
    expect(createdElements).toContain('a');
    expect(clickedHref).toMatch(/^data:image\/svg\+xml/);
  });

  it('exportSVG falls back to document.getElementById("pedigree-svg") when no element is passed', () => {
    const fakeSvgElement = { id: 'pedigree-svg' };
    globalThis.XMLSerializer = function () {
      this.serializeToString = () => '<svg></svg>';
    };
    let requestedId = null;
    globalThis.document = {
      getElementById: (id) => { requestedId = id; return fakeSvgElement; },
      createElement: () => ({ style: {}, click() {} }),
      body: { appendChild: () => {}, removeChild: () => {} },
    };

    expect(() => exportSVG()).not.toThrow();
    expect(requestedId).toBe('pedigree-svg');
  });
});

describe('the export copy carries no selection (print shows it inside the page)', () => {
  it('selection and dragging classes are removed from the copy, not from the screen', async () => {
    const { prepareExportSvg } = await import('../utils/exportUtils');
    const classList = (names) => {
      const set = new Set(names);
      return { remove: (...n) => n.forEach(x => set.delete(x)), has: (x) => set.has(x), get size() { return set.size; } };
    };
    const groups = [classList(['node-group', 'node-selected']), classList(['node-group', 'node-selected-secondary', 'drop-target']), classList(['node-group', 'dragging'])];
    const nodes = groups.map(classList => ({ classList }));
    const clone = {
      setAttribute() {}, removeAttribute() {}, getAttribute: () => null, querySelector: () => null,
      querySelectorAll: (sel) => (sel === '.node-group' ? nodes : []),
    };
    const svg = { cloneNode: () => clone, getAttribute: () => null };
    prepareExportSvg(svg);
    for (const g of groups) {
      expect(['node-selected', 'node-selected-secondary', 'dragging', 'drop-target'].some(c => g.has(c))).toBe(false);
      expect(g.has('node-group')).toBe(true);
    }
  });
});
