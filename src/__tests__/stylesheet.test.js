/**
 * stylesheet.test.js — rules the page's stylesheets must keep. The
 * simulated browser of screen.test.js does not apply CSS, so these check
 * that a rule is there, not how it looks; the look itself is checked in the
 * browser (CLAUDE.md workflow: visual check, mark audit).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = (f) => readFileSync(join(process.cwd(), 'src/styles', f), 'utf8');
const block = (f, sel) => { const s = css(f); const i = s.indexOf(`${sel} {`); return i < 0 ? '' : s.slice(i, s.indexOf('}', i)); };

describe('stylesheet rules', () => {
  it('two findings never read as one: the white gap between regions cannot be painted over; the hand-drawn divider stays dark', () => {
    // sectors without an outline of their own (a white edge broke the dividing lines where they cross, 2026-11-07)
    expect(css('app.css')).toMatch(/\.node-group \.condition-regions path \{\s*stroke: none;/);
    expect(css('app.css')).toMatch(/\.node-group \.condition-regions \.region-gap,\s*\.node-group \.condition-regions path\.region-gap-sketch \{\s*stroke: #ffffff;/);
    expect(css('app.css')).toMatch(/\.condition-regions path\.region-divider-sketch \{\s*stroke: #1e293b;/);
  });

  it('selection and keyboard focus reach the hand-drawn outline too', () => {
    expect(css('app.css')).toMatch(/\.node-selected > \.pedigree-shape-sketch/);
    expect(css('ui.css')).toMatch(/focus-visible > \.pedigree-shape-sketch/);
  });

  it('the ring: a Bilgiler part’s box stands beside the list (out of its flow), the list as narrow as its words', () => {
    expect(block('ui.css', '.ring-aside')).toMatch(/position: absolute;[^}]*left: calc\(100% \+ 12px\)/);
    expect(block('ui.css', '.radial-panel.ring-list-panel')).toMatch(/width: max-content/);
  });

  it('every pop-up opens the same soft way, only fading and growing (never moving what is placed inline), and not at all with reduced motion', () => {
    expect(css('ui.css')).toMatch(/@keyframes soft-in \{ from \{ opacity: 0; scale: 0\.97; \}/);
    expect(css('ui.css')).toMatch(/\.keys-popover, \.radial-flyout, \.radial-panel, \.ring-aside, \.relation-dialog \{ animation: soft-in/);
    expect(css('ui.css')).toMatch(/prefers-reduced-motion: reduce\) \{ \.keys-popover, \.radial-flyout, \.radial-panel, \.ring-aside, \.relation-dialog, \.relation-backdrop \{ animation: none; \}/);
  });

  it('the ring: its lists and findings are separate soft pills on no sheet of their own, every part as see-through as chosen; four colour themes beside Standart', () => {
    expect(block('ui.css', '.radial-panel.ring-list-panel, .radial-panel.findings-panel')).toMatch(/background: none; border: none; box-shadow: none/);
    expect(css('ui.css')).toMatch(/\.ring-list-panel \.ring-row > \.ring-choice \{[^}]*border-radius: 999px/);
    expect(css('ui.css')).toMatch(/\.findings-panel \.finding-row \{[^}]*border-radius: 999px/);
    expect(css('ui.css')).toMatch(/background: rgba\(255, 255, 255, var\(--ring-alpha\)\)/);
    expect(css('ui.css')).toMatch(/\.radial-sector path \{ fill: rgba\(255, 255, 255, var\(--ring-alpha\)\)/);
    for (const theme of ['amber', 'rose', 'teal', 'ice']) expect(css('ui.css')).toMatch(new RegExp(`:root\\[data-theme="${theme}"\\] \\{ --accent: #`));
  });

  it('the side panel takes the width dragged at its edge; panel and edge share one grid cell, placed explicitly (else the edge pushes the panel out of its column)', () => {
    expect(block('ui.css', '.app-shell.has-editor')).toMatch(/var\(--panel-w, 328px\)/);
    expect(block('ui.css', '.app-shell > .side-right')).toMatch(/grid-row: 2; grid-column: 2/);
    expect(block('ui.css', '.panel-resizer')).toMatch(/grid-row: 2; grid-column: 2;[^}]*cursor: col-resize/);
  });

  it('the side panel is seen when it opens (clinician report 2026-11-09: an assistant never noticed it, too pale): a tinted panel with a shadow over the drawing, a header in the accent colour, a short slide in (none with reduced motion)', () => {
    const edge = block('ui.css', '.app-shell > .side-right');
    expect(edge).toMatch(/position: relative; z-index: 5/);
    expect(edge).toMatch(/border-left: 1px solid var\(--accent-line\)/);
    expect(edge).toMatch(/box-shadow: -\d+px 0 \d+px/);
    expect(block('ui.css', '.editor-panel')).toMatch(/background: var\(--panel\)/);
    expect(css('ui.css')).toMatch(/--panel: color-mix\(in srgb, var\(--accent\) \d+%, var\(--sunken\)\)/);
    expect(block('ui.css', '.side-header')).toMatch(/border-top: 3px solid var\(--accent\)/);
    expect(block('ui.css', '.side-header')).toMatch(/var\(--accent-soft\)/);
    expect(css('ui.css')).toMatch(/\.app-shell\.has-editor > \.side-right \{ animation: panel-in /);
    expect(css('ui.css')).toMatch(/prefers-reduced-motion: reduce\) \{ \.app-shell\.has-editor > \.side-right \{ animation: none; \}/);
  });

  it('the top bar stands apart from the drawing (clinician report 2026-11-09: too pale): theme colour along its top, a tinted ground, its menus over the side panel and the ring', () => {
    const bar = css('ui.css').match(/\n\.toolbar \{[^}]*/)[0]; // the bar's own rule, not '.app-shell > .toolbar'
    expect(bar).toMatch(/border-top: 3px solid var\(--accent\)/);
    expect(bar).toMatch(/background: color-mix\(in srgb, var\(--accent\) \d+%, #ffffff\)/);
    expect(bar).toMatch(/border-bottom: 1px solid var\(--accent-line\)/);
    expect(bar).toMatch(/position: relative; z-index: 13;/);
    expect(block('ui.css', '.radial-menu')).toMatch(/z-index: 12;/);
  });

  it('the copy of the closing side panel lies over the drawing like the panel, and never takes a click', () => {
    const ghost = block('ui.css', '.panel-ghost');
    expect(ghost).toMatch(/position: fixed; z-index: 5;/);
    expect(ghost).toMatch(/pointer-events: none/);
    expect(ghost).toMatch(/box-shadow: -\d+px 0 \d+px/);
  });

  it('a tablet: the page never scrolls, bounces or reloads on a pull from the top; a double tap never zooms it; the page is as tall as the screen the browser leaves (clinician report 2026-11-09)', () => {
    const page = block('ui.css', 'html, body');
    expect(page).toMatch(/overflow: hidden/);
    expect(page).toMatch(/overscroll-behavior: none/);
    expect(page).toMatch(/text-size-adjust: 100%/);
    expect(block('ui.css', '.app-shell, .side, .settings-backdrop, .relation-backdrop, .keys-popover')).toMatch(/touch-action: manipulation/);
    expect(block('ui.css', '.side, .keys-popover, .canvas-notices')).toMatch(/overscroll-behavior: contain/);
    expect(block('ui.css', '.app-shell')).toMatch(/height: 100dvh/);
  });

  it('the transparency preview is a small family drawn like the drawing: thin grey lines, the usual symbols (clinician 2026-11-07)', () => {
    expect(block('ui.css', '.ring-preview .rp-line')).toMatch(/stroke: #64748b; stroke-width: 1\.2;/);
    expect(block('ui.css', '.ring-preview .rp-sym')).toMatch(/stroke-width: 1\.4; fill: var\(--paper\)/);
  });

  it('the pulse after an edit is an animation of the screen', () => {
    expect(css('ui.css')).toMatch(/@keyframes pedigree-pulse/);
  });

  it('settings: a switch that is off still shows its outline (3:1, WCAG 1.4.11); order arrows never hide until hover; motion respects reduced motion', () => {
    expect(block('ui.css', '.switch')).toMatch(/background: #8a939e/);
    expect(block('ui.css', '.set-move')).not.toMatch(/opacity/);
    expect(css('ui.css')).toMatch(/prefers-reduced-motion: reduce\) \{ \.settings-dialog \{ animation: none; \}/);
  });

  it('notices and the toolbar are in the page flow, never laid over the drawing; the toolbar wraps', () => {
    expect(block('app.css', '.warning-panel')).not.toMatch(/position:\s*absolute/);
    expect(block('app.css', '.canvas-toolbar')).toMatch(/flex-wrap:\s*wrap/);
    expect(block('app.css', '.canvas-toolbar')).not.toMatch(/position:\s*absolute/);
  });

  it('a word that gives way to its icon (folded, or İndir / Yazdır / Paylaş always) is hidden for the eye only, never display:none', () => {
    const rule = block('ui.css', '.toolbar .btn-label.folded, .toolbar .btn-label.icon-only');
    expect(rule).toMatch(/clip-path: inset\(50%\)/);
    expect(rule).not.toMatch(/display:\s*none/);
  });
});
