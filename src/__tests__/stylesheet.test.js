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
    expect(css('app.css')).toMatch(/\.node-group \.condition-regions path \{\s*stroke: #ffffff;/);
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
