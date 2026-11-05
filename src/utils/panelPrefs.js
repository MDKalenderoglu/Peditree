/**
 * panelPrefs.js — the clinician's own side panel (clinician request
 * 2026-11-02: "rarely seen cases should not make the screen crowded"). Each
 * optional part of a person's panel can be hidden; a hidden part waits under
 * "Diğer bilgiler…" at the foot of the panel, and a part that already holds
 * something for this person is shown anyway — nothing entered is ever out of
 * sight. Label, age, the couple cards and deleting always show.
 *
 * A preference, not patient data: kept per device (localStorage), like the
 * ring menu (ringPrefs.js).
 */
import { create } from 'zustand';
import { tk } from '../i18n';

export const PANEL_PARTS = [
  { id: 'genetic', label: tk('Genetik test') },
  { id: 'adoption', label: tk('Evlat edinme') },
  { id: 'birthOrder', label: tk('Doğum sırası') },
  { id: 'lmp', label: tk('Son adet tarihi (süren gebelikte)') },
  { id: 'repro', label: tk('Yardımcı üreme') },
  { id: 'sexAtBirth', label: tk('Doğumda atanan cinsiyet (AMAB / AFAB / UAAB)') },
  { id: 'recordsReviewed', label: tk('Kayıtlarla doğrulandı (*)') },
];
/** rare in the clinic: hidden until the clinician brings them forward — also for a preference stored before they existed */
const HIDDEN_AT_FIRST = ['repro', 'sexAtBirth', 'recordsReviewed'];
const KNOWN = new Set(PANEL_PARTS.map((p) => p.id));
const PANEL_KEY = 'peditree.panel.v1';

export const DEFAULT_PANEL = { hidden: [...HIDDEN_AT_FIRST], seen: PANEL_PARTS.map((p) => p.id) };

export function normalizePanel(v) {
  const o = v && typeof v === 'object' ? v : {};
  const seen = Array.isArray(o.seen) ? o.seen : [];
  const unseen = HIDDEN_AT_FIRST.filter((id) => !seen.includes(id));
  return {
    hidden: [...new Set([...(Array.isArray(o.hidden) ? o.hidden : []), ...unseen].filter((id) => KNOWN.has(id)))],
    seen: PANEL_PARTS.map((p) => p.id),
  };
}

export const togglePanelPart = (panel, id) => ({
  ...panel,
  hidden: panel.hidden.includes(id) ? panel.hidden.filter((x) => x !== id) : [...panel.hidden, id],
});

function readPanel() {
  try {
    const raw = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(PANEL_KEY) : null;
    return normalizePanel(raw ? JSON.parse(raw) : DEFAULT_PANEL);
  } catch {
    return normalizePanel(DEFAULT_PANEL);
  }
}

export const usePanelPrefs = create((set) => ({
  panel: readPanel(),
  setPanel: (next) => {
    const panel = normalizePanel(next);
    try { window.localStorage.setItem(PANEL_KEY, JSON.stringify(panel)); } catch { /* private window: kept for this page only */ }
    set({ panel });
  },
}));

/**
 * The panel's one tip (where the ring's buttons are) is said once on this
 * device; "Anladım" puts it away (clinician 2026-11-05: the panel was too
 * wordy). A preference, kept like the others.
 */
const TIP_KEY = 'peditree.panelTip.v1';
function readTipSeen() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage && window.localStorage.getItem(TIP_KEY) === '1';
  } catch {
    return false;
  }
}
export const usePanelTip = create((set) => ({
  seen: readTipSeen(),
  dismiss: () => {
    try { window.localStorage.setItem(TIP_KEY, '1'); } catch { /* private window: for this page only */ }
    set({ seen: true });
  },
}));
