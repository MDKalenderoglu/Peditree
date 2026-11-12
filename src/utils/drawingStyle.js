/**
 * drawingStyle.js — how the drawing looks, chosen by whoever is looking at
 * it (clinician request 2026-10-28): the standard drawing or a hand-drawn
 * one, and the typeface of the text on it. Kept per device (localStorage:
 * a viewing preference, never patient data); the pedigree file is unchanged.
 *
 * Meaning never changes (CLAUDE.md constraint 9, notation spec): the hand-drawn
 * look only redraws lines and outlines as if by pen (drawingStyleSvg.js).
 * Positions, fills, solid / dashed / double lines and "//" stay as they are;
 * parallel strokes bend alike, so a double line keeps its gap.
 *
 * Text: the layout reserves room for text by its number of characters
 * (pedigree numbers, notes, the key), measured for the standard typeface.
 * Every typeface therefore gets a size factor `k` that keeps its text no wider
 * than standard text, so a label never runs into a neighbour (notation R4).
 */
import { create } from 'zustand';
import { tk } from '../i18n';
import { PAPERS } from './paper';
import { CARRIER_MARKS } from '../graph/conditionKey';
import { setTextScale } from './symbolText';
import kalam400 from '@fontsource/kalam/files/kalam-latin-400-normal.woff2?url';
import kalam400x from '@fontsource/kalam/files/kalam-latin-ext-400-normal.woff2?url';
import kalam700 from '@fontsource/kalam/files/kalam-latin-700-normal.woff2?url';
import kalam700x from '@fontsource/kalam/files/kalam-latin-ext-700-normal.woff2?url';
import caveat400 from '@fontsource/caveat/files/caveat-latin-400-normal.woff2?url';
import caveat400x from '@fontsource/caveat/files/caveat-latin-ext-400-normal.woff2?url';
import caveat700 from '@fontsource/caveat/files/caveat-latin-700-normal.woff2?url';
import caveat700x from '@fontsource/caveat/files/caveat-latin-ext-700-normal.woff2?url';
import patrick400 from '@fontsource/patrick-hand/files/patrick-hand-latin-400-normal.woff2?url';
import patrick400x from '@fontsource/patrick-hand/files/patrick-hand-latin-ext-400-normal.woff2?url';
import serif400 from '@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff2?url';
import serif400x from '@fontsource/source-serif-4/files/source-serif-4-latin-ext-400-normal.woff2?url';
import serif700 from '@fontsource/source-serif-4/files/source-serif-4-latin-700-normal.woff2?url';
import serif700x from '@fontsource/source-serif-4/files/source-serif-4-latin-ext-700-normal.woff2?url';
import atk400 from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff2?url';
import atk400x from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-ext-400-normal.woff2?url';
import atk700 from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-700-normal.woff2?url';
import atk700x from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-ext-700-normal.woff2?url';

/** The typeface the drawing has always used (system sans). */
export const STANDARD_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// latin-ext carries ğ ş ı İ; latin carries ç ö ü
const LATIN_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

/**
 * The typefaces offered (clinician decision 2026-10-28: plain and handwritten).
 * k: size factor. Measured 2026-10-28 (macOS, regular and bold) on Turkish
 * pedigree text, width relative to the standard typeface: Atkinson 0.93,
 * Source Serif 1.00, Kalam 0.90, Patrick Hand 0.75, Caveat 0.72. k brings the
 * text up to the standard width (never wider), at most ×1.15 so the lines of
 * text under a symbol keep their spacing.
 */
export const DRAWING_FONTS = [
  { id: 'standard', label: tk('Standart'), group: 'plain', family: STANDARD_FAMILY, k: 1, files: null },
  { id: 'atkinson', label: 'Atkinson Hyperlegible', note: tk('I, l ve 1 karışmaz'), group: 'plain', name: 'Atkinson Hyperlegible Next',
    family: "'Atkinson Hyperlegible Next', sans-serif", k: 1.07, files: { 400: [atk400, atk400x], 700: [atk700, atk700x] } },
  { id: 'serif', label: 'Source Serif', note: tk('tırnaklı, rapor görünümü'), group: 'plain', name: 'Source Serif 4',
    family: "'Source Serif 4', Georgia, serif", k: 1, files: { 400: [serif400, serif400x], 700: [serif700, serif700x] } },
  { id: 'kalam', label: 'Kalam', note: tk('düzgün el yazısı'), group: 'hand', name: 'Kalam',
    family: "'Kalam', cursive", k: 1.1, files: { 400: [kalam400, kalam400x], 700: [kalam700, kalam700x] } },
  { id: 'patrick', label: 'Patrick Hand', note: tk('okunaklı el yazısı'), group: 'hand', name: 'Patrick Hand',
    family: "'Patrick Hand', cursive", k: 1.15, files: { 400: [patrick400, patrick400x] } },
  { id: 'caveat', label: 'Caveat', note: tk('hızlı kalem notu'), group: 'hand', name: 'Caveat',
    family: "'Caveat', cursive", k: 1.15, files: { 400: [caveat400, caveat400x], 700: [caveat700, caveat700x] } },
];

export const fontById = (id) => DRAWING_FONTS.find(f => f.id === id) || DRAWING_FONTS[0];

// openHelp: "Aç" first explains which files it opens (clinician decision 2026-10-30; "Bir daha gösterme" turns it off)
// textSize: the size of every text of the drawing, in % (80–160; clinician 2026-11-11: a slider as in
// professional applications, formerly four words, legendSize) — under the symbols, the pedigree numbers, the patient's
// name, the key and the notes (clinician requests 2026-10-30, 2026-11-05); the layout gives larger text more room
// paper: the page under the drawing on screen (paper.js; clinician request 2026-11-03)
// carrierMark: a carrier without a named finding, half (NSGC 2022) or dot (conditionKey.js CARRIER_MARKS; 2026-11-04)
// theme: the screens' accent colour, warm to cool (THEMES); ringClear: how see-through the ring's parts are, in %
// (RING_CLEAR); panelWidth: the side panel's width in px, dragged at its edge, 0 = the usual width (PANEL_WIDTH)
// (clinician requests 2026-11-07) — the look of the screen only, never the drawing or a file;
// tourOffer: the first opening offers the guided tour, until it is started or put off (2026-11-09)
// touchMode: the touch screen for a phone ('auto': on a phone; 'on' / 'off'; clinician request 2026-11-10)
// sameSexPartners: same-sex partners may be made (clinician decision 2026-11-10; off unless chosen)
export const DEFAULT_VIEW = { drawStyle: 'standard', fontId: 'standard', plainNumbers: true, exportAs: 'screen', openHelp: true, textSize: 100, paper: 'plain', carrierMark: 'split', theme: 'indigo', mode: 'system', ringClear: 5, panelWidth: 0, tourOffer: true, sameSexPartners: false, touchMode: 'auto' };

/**
 * Day or night (clinician 2026-11-11: users found the screen too white): 'system' follows the device.
 * At night the screens are dark and the drawing lies on dimmed paper, its ink unchanged; a file, a
 * picture and a print are always black on white.
 */
export const MODES = [
  { id: 'system', label: tk('Cihazla aynı') },
  { id: 'light', label: tk('Gündüz') },
  { id: 'dark', label: tk('Gece') },
];
/** The mode the screen shows now: 'light' or 'dark'. */
export const shownMode = (view, prefersDark) => (view.mode === 'dark' || (view.mode !== 'light' && prefersDark) ? 'dark' : 'light');

/**
 * Colour themes, the warm ones first, then the cool ones, each named for the colour it is (clinician
 * 2026-11-11: "Deniz" looked green; six themes, warm and cool, without saying so on the screen).
 * Çivit (indigo) is the usual one (ui.css :root[data-theme]).
 */
export const THEMES = [
  { id: 'terracotta', label: tk('Kiremit'), swatch: '#a8471f' },
  { id: 'amber', label: tk('Kehribar'), swatch: '#9a5b13' },
  { id: 'rose', label: tk('Gül'), swatch: '#a8324f' },
  { id: 'indigo', label: tk('Çivit'), swatch: '#4f46a5' },
  { id: 'ice', label: tk('Okyanus'), swatch: '#2f5d8c' },
  { id: 'teal', label: tk('Yeşim'), swatch: '#0f6e6a' },
];
/**
 * How much of the drawing shows through the ring's parts, in %: 0 (none) to 60, in steps of 5
 * (clinician request 2026-11-07: no words, more levels, one step at a time, seen while it is set).
 */
export const RING_CLEAR = { min: 0, max: 100, step: 5 }; // up to wholly clear (clinician 2026-11-11)
const OLD_RING_ALPHA = { solid: 0, low: 10, mid: 30, high: 45 }; // the four words of the first version
const clearOf = (o) => {
  if (Number.isFinite(o.ringClear)) {
    const v = Math.round(o.ringClear / RING_CLEAR.step) * RING_CLEAR.step;
    return Math.min(RING_CLEAR.max, Math.max(RING_CLEAR.min, v));
  }
  return o.ringAlpha in OLD_RING_ALPHA ? OLD_RING_ALPHA[o.ringAlpha] : DEFAULT_VIEW.ringClear;
};
export const ringAlphaOf = (view) => 1 - clearOf(view) / 100;
/** The side panel's width: dragged between these; 0 keeps the usual width (ui.css). */
export const PANEL_WIDTH = { min: 280, max: 560 };
const panelWidthOf = (o) => (Number.isFinite(o.panelWidth) && o.panelWidth > 0
  ? Math.min(PANEL_WIDTH.max, Math.max(PANEL_WIDTH.min, Math.round(o.panelWidth))) : 0);

/**
 * Text sizes. The key and notes lie outside the family; the text under the
 * symbols gets the room it needs from the layout (symbolText.setTextScale),
 * so any size is safe. The symbols keep their size.
 */
export const TEXT_SIZE = { min: 80, max: 160, step: 5 };
// the four words of the earlier version, as %
const OLD_LEGEND_SIZES = { small: 85, normal: 100, large: 120, xlarge: 145 };
function textSizeOf(o) {
  if (Number.isFinite(o.textSize)) {
    const v = Math.round(o.textSize / TEXT_SIZE.step) * TEXT_SIZE.step;
    return Math.min(TEXT_SIZE.max, Math.max(TEXT_SIZE.min, v));
  }
  return OLD_LEGEND_SIZES[o.legendSize] || 100;
}
const VIEW_KEY = 'peditree.view.v1';

function readView() {
  try {
    const raw = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(VIEW_KEY) : null;
    return raw ? normalizeView(JSON.parse(raw)) : { ...DEFAULT_VIEW };
  } catch {
    return { ...DEFAULT_VIEW };
  }
}

/** Only known values survive (a stored preference from another version). */
export function normalizeView(v) {
  const o = v && typeof v === 'object' ? v : {};
  return {
    drawStyle: o.drawStyle === 'hand' ? 'hand' : 'standard',
    fontId: DRAWING_FONTS.some(f => f.id === o.fontId) ? o.fontId : 'standard',
    plainNumbers: o.plainNumbers !== false,
    exportAs: o.exportAs === 'standard' ? 'standard' : 'screen',
    openHelp: o.openHelp !== false,
    textSize: textSizeOf(o),
    paper: PAPERS.some(p => p.id === o.paper) ? o.paper : 'plain',
    carrierMark: CARRIER_MARKS.some(m => m.id === o.carrierMark) ? o.carrierMark : 'split',
    theme: THEMES.some(x => x.id === o.theme) ? o.theme : 'indigo',
    mode: ['light', 'dark'].includes(o.mode) ? o.mode : 'system',
    ringClear: clearOf(o),
    panelWidth: panelWidthOf(o),
    tourOffer: o.tourOffer !== false,
    sameSexPartners: o.sameSexPartners === true,
    // 'always' since 2026-11-12: an 'on' stored before was chosen under the word "Açık", read as "light" beside day
    // and night, and kept computers on the phone screen (clinician report 2026-11-12) — it opens as 'auto'
    touchMode: ['always', 'off'].includes(o.touchMode) ? o.touchMode : 'auto',
  };
}

/** Choosing the hand-drawn look with the standard typeface also picks a handwritten one. */
export function applyViewChange(view, patch) {
  const next = normalizeView({ ...view, ...patch });
  if (patch.drawStyle === 'hand' && view.drawStyle !== 'hand' && !('fontId' in patch) && fontById(next.fontId).group !== 'hand') next.fontId = 'kalam';
  return next;
}

const scaleOf = (view) => textSizeOf(view) / 100;
const initialView = readView();
setTextScale(scaleOf(initialView));

export const useViewSettings = create((set, get) => ({
  view: initialView,
  setView: (patch) => {
    const view = applyViewChange(get().view, patch);
    setTextScale(scaleOf(view)); // before the drawing is laid out again (App)
    try { window.localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch { /* private window: kept for this page only */ }
    set({ view });
  },
}));

/**
 * What the renderer needs: the typeface of the text, the one of the pedigree
 * numbers (plain if asked, also under a handwritten typeface) and the waver.
 */
export function drawingSpec(view) {
  const font = fontById(view.fontId);
  const numbersPlain = font.group === 'hand' && view.plainNumbers;
  return {
    hand: view.drawStyle === 'hand',
    family: font.family,
    k: font.k,
    numberFamily: numbersPlain ? STANDARD_FAMILY : font.family,
    numberK: numbersPlain ? 1 : font.k,
    fontId: font.id,
    legendScale: scaleOf(view),
    paper: view.paper || 'plain', // the screen only: an export loses it
    carrierMark: view.carrierMark || 'split', // notation, not look: exports keep it
  };
}

/** The standard drawing (an export the clinician wants plain whatever the screen shows). */
export const STANDARD_SPEC = drawingSpec(DEFAULT_VIEW);

/**
 * The spec an export uses: what the screen shows, or always the standard
 * drawing — with the carrier drawn as on the screen either way (a choice of
 * notation the key explains, not of look).
 */
export const exportSpec = (view) => (view.exportAs === 'standard' ? { ...STANDARD_SPEC, carrierMark: drawingSpec(view).carrierMark } : drawingSpec(view));

/**
 * @font-face rules with the typeface inside (data: URLs), so an exported SVG
 * or PNG looks the same on any computer. Empty for the standard typeface.
 */
export async function embeddedFontCss(fontId) {
  const font = fontById(fontId);
  if (!font.files) return '';
  const toData = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`font ${url}: ${res.status}`); // the caller warns the clinician (App.jsx)
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return `data:font/woff2;base64,${btoa(bin)}`;
  };
  const rules = [];
  for (const [weight, [latin, ext]] of Object.entries(font.files)) {
    rules.push(`@font-face{font-family:'${font.name}';font-style:normal;font-weight:${weight};src:url(${await toData(ext)}) format('woff2');unicode-range:${LATIN_EXT}}`);
    rules.push(`@font-face{font-family:'${font.name}';font-style:normal;font-weight:${weight};src:url(${await toData(latin)}) format('woff2');unicode-range:${LATIN}}`);
  }
  return rules.join('\n');
}

