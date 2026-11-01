/**
 * ringPrefs.js — the clinician's own ring menu (clinician request
 * 2026-11-01: "the ring keeps growing; let each user keep what they use
 * most"). What can change: the rows under Kardeş / Çocuk (pregnancy,
 * adopted, several in one symbol) and which pregnancy kinds show, and the
 * choices of the Durum arc — shown or hidden, and their order. The four
 * directions, the sex choices and the corner buttons stay as they are.
 *
 * Nothing is ever lost: a hidden choice stays in the same ring under
 * "Diğer…". A preference, not patient data: kept per device (localStorage),
 * like the drawing's look (drawingStyle.js).
 */
import { create } from 'zustand';

export const RING_ROWS = [
  { id: 'pregnancy', label: 'Gebelik' },
  { id: 'adopted', label: 'Evlat edinilmiş' },
  { id: 'group', label: 'Birden çok' },
  // rare in the clinic (clinician 2026-11-02): under "Diğer…" until the clinician brings it forward
  { id: 'art', label: 'Yardımcı üreme ile' },
];
/** rows that start hidden — also for a stored preference made before they existed */
const HIDDEN_AT_FIRST = ['art'];
export const RING_PREGNANCY = [
  { id: 'loss', label: 'Düşük' },
  { id: 'stillbirth', label: 'Ölü doğum (SB)' },
  { id: 'ongoing', label: 'Devam eden gebelik (P)' },
  { id: 'termination', label: 'Sonlandırma (TOP)' },
  { id: 'ectopic', label: 'Dış gebelik (ECT)' },
];
export const RING_STATUS = [
  { id: 'affected', label: 'Etkilenmiş' },
  { id: 'carrier', label: 'Taşıyıcı' },
  { id: 'deceased', label: 'Vefat' },
  { id: 'proband', label: 'Proband' },
  { id: 'consultand', label: 'Danışan' },
];

export const DEFAULT_RING = {
  rows: RING_ROWS.map((r) => r.id),
  status: RING_STATUS.map((s) => s.id),
  hidden: [...HIDDEN_AT_FIRST],
};
const RING_KEY = 'peditree.ring.v1';
const KNOWN = new Set([...RING_ROWS, ...RING_PREGNANCY, ...RING_STATUS].map((x) => x.id));

/** Known ids only, every one once: a stored order keeps its place, new ones go to the end. */
const ordered = (stored, all) => {
  const ids = all.map((x) => x.id);
  const kept = (Array.isArray(stored) ? stored : []).filter((id, k, a) => ids.includes(id) && a.indexOf(id) === k);
  return [...kept, ...ids.filter((id) => !kept.includes(id))];
};

export function normalizeRing(v) {
  const o = v && typeof v === 'object' ? v : {};
  const storedRows = Array.isArray(o.rows) ? o.rows : [];
  // a row the stored preference has never seen starts hidden if it is one of those
  const unseen = HIDDEN_AT_FIRST.filter((id) => !storedRows.includes(id));
  return {
    rows: ordered(o.rows, RING_ROWS),
    status: ordered(o.status, RING_STATUS),
    hidden: [...new Set([...(Array.isArray(o.hidden) ? o.hidden : []), ...unseen].filter((id) => KNOWN.has(id)))],
  };
}

/** Move one id a step up (-1) or down (+1) in its list. */
export function moveInRing(ring, list, id, dir) {
  const a = [...ring[list]];
  const k = a.indexOf(id), j = k + dir;
  if (k < 0 || j < 0 || j >= a.length) return ring;
  [a[k], a[j]] = [a[j], a[k]];
  return { ...ring, [list]: a };
}

export function toggleInRing(ring, id) {
  const hidden = ring.hidden.includes(id) ? ring.hidden.filter((x) => x !== id) : [...ring.hidden, id];
  return { ...ring, hidden };
}

function readRing() {
  try {
    const raw = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(RING_KEY) : null;
    return raw ? normalizeRing(JSON.parse(raw)) : normalizeRing(DEFAULT_RING);
  } catch {
    return normalizeRing(DEFAULT_RING);
  }
}

export const useRingPrefs = create((set) => ({
  ring: readRing(),
  setRing: (next) => {
    const ring = normalizeRing(next);
    try { window.localStorage.setItem(RING_KEY, JSON.stringify(ring)); } catch { /* private window: kept for this page only */ }
    set({ ring });
  },
}));
