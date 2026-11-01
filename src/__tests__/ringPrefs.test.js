/**
 * ringPrefs.test.js — the clinician's own ring menu (clinician request
 * 2026-11-01): rows and Durum choices shown or hidden and in their order,
 * kept per device; a hidden choice stays in the ring under "Diğer…".
 */
import { describe, it, expect } from 'vitest';
import { normalizeRing, moveInRing, toggleInRing, DEFAULT_RING, RING_STATUS } from '../utils/ringPrefs';

describe('ring preferences', () => {
  it('the default shows everything in the usual order', () => {
    expect(normalizeRing(DEFAULT_RING)).toEqual({
      rows: ['pregnancy', 'adopted', 'group'],
      status: ['affected', 'carrier', 'deceased', 'proband', 'consultand'],
      hidden: [],
    });
  });

  it('a stored preference from another version: unknown ids dropped, duplicates once, new choices at the end', () => {
    const r = normalizeRing({ rows: ['group', 'nonsense', 'group'], status: ['proband'], hidden: ['loss', 'loss', 'x'] });
    expect(r.rows).toEqual(['group', 'pregnancy', 'adopted']);
    expect(r.status).toEqual(['proband', ...RING_STATUS.map(s => s.id).filter(id => id !== 'proband')]);
    expect(r.hidden).toEqual(['loss']);
    expect(normalizeRing('garbage')).toEqual(normalizeRing(DEFAULT_RING));
  });

  it('moving and hiding', () => {
    let r = normalizeRing(DEFAULT_RING);
    r = moveInRing(r, 'status', 'proband', -1);
    expect(r.status.slice(2, 4)).toEqual(['proband', 'deceased']);
    expect(moveInRing(r, 'rows', 'pregnancy', -1)).toBe(r); // already first
    r = toggleInRing(toggleInRing(r, 'consultand'), 'stillbirth');
    expect(r.hidden).toEqual(['consultand', 'stillbirth']);
    expect(toggleInRing(r, 'consultand').hidden).toEqual(['stillbirth']);
  });

  // moved to screen.test.js: Ayarlar → Halka menü (the ring menu)
});
