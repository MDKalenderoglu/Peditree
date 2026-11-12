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
    expect(css('ui.css')).toMatch(/\.keys-popover, \.radial-flyout, \.radial-panel, \.ring-aside \{ animation: soft-in var\(--t-pop\) var\(--ease\)/);
    expect(css('ui.css')).toMatch(/\.relation-dialog \{ animation: soft-in var\(--t-move\) var\(--ease\)/);
    expect(css('ui.css')).toMatch(/prefers-reduced-motion: reduce\) \{ \.keys-popover, \.radial-flyout, \.radial-panel, \.ring-aside, \.relation-dialog, \.relation-backdrop \{ animation: none; \}/);
  });

  it('the ring: its lists and findings are separate soft pills on no sheet of their own, every part as see-through as chosen; four colour themes beside Standart', () => {
    expect(block('ui.css', '.radial-panel.ring-list-panel, .radial-panel.findings-panel')).toMatch(/background: none; border: none; box-shadow: none/);
    expect(css('ui.css')).toMatch(/\.ring-list-panel \.ring-row > \.ring-choice \{[^}]*border-radius: 999px/);
    expect(css('ui.css')).toMatch(/\.findings-panel \.finding-row \{[^}]*border-radius: 999px/);
    expect(css("ui.css")).toMatch(/background: rgba\(var\(--ring-rgb\), var\(--ring-alpha\)\)/);
    expect(css("ui.css")).toMatch(/\.radial-sector path \{ fill: rgba\(var\(--ring-rgb\), var\(--ring-alpha\)\)/);
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

  it('the side panel draws the eye (clinician report 2026-11-11: pale headings, one block): framed cards apart, headings in the accent colour, the panel off the window’s edge', () => {
    expect(block('ui.css', '.card')).toMatch(/border: 1px solid var\(--line\)/);
    expect(block('ui.css', '.card')).toMatch(/box-shadow:/);
    expect(block('ui.css', '.editor-body')).toMatch(/gap: 1[4-9]px/);
    expect(block('ui.css', '.card-title')).toMatch(/font-size: 14px; font-weight: 700; color: var\(--accent-ink\)/);
    expect(css('ui.css')).toMatch(/\.card-title:not\(\.partner-title\)::before \{[^}]*background: var\(--accent\)/);
    expect(block('ui.css', '.app-shell:not(.touch) > .side-right.editor-panel')).toMatch(/margin: 10px 10px 10px 0;[^}]*border-radius: 16px/);
    expect(block('ui.css', '.person-kin')).toMatch(/font-weight: 700/);
  });

  it('a phone, third pass (clinician report 2026-11-11: coarse top bar, clumsy bottom bar): a slim bar with a tinted Kaydet, a floating, compact person bar', () => {
    const phone = css('ui.css').slice(css('ui.css').indexOf('/* a phone, third pass'));
    expect(phone).toMatch(/\.touch-menu-btn, \.toolbar\.touch-bar \.patient-btn, \.toolbar\.touch-bar \[data-popup="download"\] > button \{ height: 40px;/);
    expect(phone).toMatch(/\[data-popup="download"\] > button \{[^}]*background: var\(--surface\); color: var\(--accent-ink\)/);
    expect(phone).toMatch(/orientation: portrait\) \{\s*\.app-shell\.touch \.touch-sheet \{[^}]*left: 8px; right: 8px; bottom: max\(8px/);
    expect(phone).toMatch(/\.sheet-head \.sheet-close \{ flex: none; width: 40px; height: 34px; padding: 0;/);
    expect(phone).toMatch(/\.sheet-title \{ font: 700 14\.5px\/1\.3 var\(--font-ui\)/);
    // after the rules it overrides
    expect(css('ui.css').indexOf('/* a phone, third pass')).toBeGreaterThan(css('ui.css').indexOf('.app-shell.touch .touch-sheet {'));
  });

  it('night (clinician 2026-11-11: the screen too white): every token turns dark, the accent lightened as text, the drawing on dimmed paper with the symbols’ white turned to it', () => {
    const night = block('ui.css', ':root[data-mode="dark"]');
    for (const tok of ['--ink', '--surface', '--frame', '--panel', '--accent-ink', '--accent-soft', '--bar-base', '--ring-rgb']) expect(night).toContain(`${tok}:`);
    expect(night).toMatch(/--paper: #[c-e]/); // dimmed, still light: the drawing's ink reads as on a print
    expect(css('ui.css')).toMatch(/:root\[data-mode="dark"\] \.canvas-container svg \[fill="#ffffff"\] \{ fill: var\(--paper\); \}/);
    // nothing left light at night (clinician report 2026-11-11: a white row in the ring, an unseen logo)
    expect(css('ui.css')).toMatch(/\.ring-choice:hover \{ background: rgba\(var\(--ring-hover-rgb\), var\(--ring-alpha\)\); \}/);
    expect(night).toContain('--ring-hover-rgb:');
    expect(css('ui.css')).toMatch(/:root\[data-mode="dark"\] \.brand-wordmark \{ filter: brightness\(0\) invert/);
    expect(css('ui.css')).toMatch(/:root\[data-mode="dark"\] \.brand-mark, :root\[data-mode="dark"\] \.about-head img \{ background: #/);
    expect(css('ui.css')).toMatch(/:root\[data-mode="dark"\] \.warning-panel\[data-tone="info"\] \{ --tone: var\(--accent-ink\); \}/);
    // a see-through ring at night: its words in the drawing's dark ink; its off parts dark (Codex audit 2026-11-12)
    expect(css('ui.css')).toMatch(/:root\[data-mode="dark"\]\[data-ring-clear="high"\] \.radial-menu \{\s*--ink: #19283d/);
    expect(css('ui.css')).toMatch(/\.radial-sector\.off path \{ fill: rgba\(var\(--ring-off-rgb\), var\(--ring-alpha\)\); \}/);
    expect(night).toContain('--ring-off-rgb:');
    expect(css('ui.css')).toMatch(/@media print \{ :root \{ color-scheme: light; \} html, body \{ background: #ffffff !important; \} \}/);
    // after the colour themes, so it wins over their light tints
    expect(css('ui.css').indexOf(':root[data-mode="dark"] {')).toBeGreaterThan(css('ui.css').indexOf(':root[data-theme="ice"]'));
  });

  it('the top bar stands apart from the drawing (clinician report 2026-11-09: too pale): theme colour along its top, a tinted ground, its menus over the side panel and the ring', () => {
    const bar = css('ui.css').match(/\n\.toolbar \{[^}]*/)[0]; // the bar's own rule, not '.app-shell > .toolbar'
    expect(bar).toMatch(/border-top: 3px solid var\(--accent\)/);
    expect(bar).toMatch(/background: color-mix\(in srgb, var\(--accent\) \d+%, var\(--bar-base\)\)/);
    expect(bar).toMatch(/border-bottom: 1px solid var\(--accent-line\)/);
    expect(bar).toMatch(/position: relative; z-index: 13;/);
    expect(block('ui.css', '.radial-menu')).toMatch(/z-index: 12;/);
  });

  it('the patient name is a white field of its own on the tinted top bar, its hint readable (clinician report 2026-11-09: could not be seen)', () => {
    const name = block('ui.css', '.toolbar .patient-name');
    expect(name).toMatch(/background: var\(--surface\); border: 1px solid var\(--accent-line\)/);
    expect(block('ui.css', '.toolbar .patient-name::placeholder')).toMatch(/color: var\(--muted\)/);
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
  it('one motion for the whole interface (clinician 2026-11-10: the effects did not match one another): one curve, two durations, used by the panel, the windows, the pop-ups and the tour', () => {
    expect(css('ui.css')).toMatch(/--ease: cubic-bezier\(0\.2, 0\.8, 0\.2, 1\);\s*--t-pop: 0\.2s;\s*--t-move: 0\.3s;/);
    expect(css('ui.css')).toMatch(/\.side-right \{ animation: panel-in var\(--t-move\) var\(--ease\); \}/);
    expect(block('ui.css', '.settings-dialog')).toMatch(/animation: settings-in var\(--t-move\) var\(--ease\)/);
    expect(block('ui.css', '.settings-backdrop')).toMatch(/animation: soft-fade var\(--t-move\) var\(--ease\)/);
    // the settings window grows in place, like every other pop-up, and no longer slides up
    expect(css('ui.css')).toMatch(/@keyframes settings-in \{ from \{ opacity: 0; transform: scale\(0\.96\); \}/);
    expect(block('ui.css', '.tour-body')).toMatch(/animation: tour-in var\(--t-tour\) var\(--ease\)/);
    // the tour: card, words and light in one motion; the × above the words; a window it opens is there at once
    expect(css('ui.css')).toMatch(/--t-tour: 0\.42s;/);
    expect(block('ui.css', '.tour-close')).toMatch(/z-index: 2/);
    expect(css('ui.css')).toMatch(/body\.touring \.keys-popover, body\.touring \.radial-flyout, body\.touring \.radial-panel, body\.touring \.ring-aside \{ animation: none; \}/);
    // a window the tour opens does not dim the page a second time
    expect(css('ui.css')).toMatch(/body\.touring \.settings-backdrop, body\.touring \.relation-backdrop \{ background: transparent; \}/);
  });

  it('the guided tour has a look of its own (clinician 2026-11-10: "çok kaba ve düz"): a navy dim, a lit part with a white and indigo ring, a card that glides, a picture that draws itself; still with reduced motion', () => {
    expect(block('ui.css', '.tour-scrim')).toMatch(/background: rgba\(19, 30, 47, 0\.6\)/);
    expect(block('ui.css', '.tour-spot')).toMatch(/0 0 0 2px #ffffff, 0 0 0 4px var\(--accent\)/);
    expect(block('ui.css', '.tour-card')).toMatch(/transition: left var\(--t-tour\) var\(--ease\)/);
    expect(block('ui.css', '.tour-card')).not.toMatch(/border-top: 3px/);
    expect(block('ui.css', '.tour-hero')).toMatch(/var\(--ink\)/);
    expect(css('ui.css')).toMatch(/\.tour-family \.tf-line \{[^}]*stroke-dashoffset: 1;[^}]*animation: tf-draw/);
    expect(css('ui.css')).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.tour-card, \.tour-offer, \.tour-body, \.tour-spot::after \{ animation: none; transition: none; \}/);
  });
});
