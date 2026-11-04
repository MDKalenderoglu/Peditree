/**
 * ringPrefs.test.js — the clinician's own ring menu (clinician request
 * 2026-11-01): rows, Durum and Bilgiler choices shown or hidden and in their order,
 * kept per device; a hidden choice stays in the ring under "Diğer…".
 */
import { describe, it, expect } from 'vitest';
import { normalizeRing, moveInRing, toggleInRing, DEFAULT_RING, RING_STATUS } from '../utils/ringPrefs';

describe('ring preferences', () => {
  it('the default shows everything in the usual order, except the rare "Yardımcı üreme ile" and "Belirtisiz taşıyıcı" (under "Diğer…")', () => {
    expect(normalizeRing(DEFAULT_RING)).toEqual({
      rows: ['pregnancy', 'adopted', 'group', 'art'],
      status: ['affected', 'carrier', 'deceased', 'proband', 'consultand', 'presymptomatic'],
      info: ['age', 'genetic', 'note', 'name'],
      hidden: ['art', 'presymptomatic', 'name'],
    });
  });

  it('a preference saved before the row existed: the new row starts hidden; once shown it stays shown', () => {
    const old = normalizeRing({ rows: ['group', 'pregnancy', 'adopted'], status: ['proband'], hidden: ['loss'] });
    expect(old.hidden).toEqual(['loss', 'art', 'presymptomatic', 'name']);
    expect(normalizeRing(toggleInRing(old, 'art')).hidden).toEqual(['loss', 'presymptomatic', 'name']);
    // a preference that already knew the rows but not the new Durum choice
    const known = normalizeRing({ rows: ['pregnancy', 'adopted', 'group', 'art'], status: ['affected', 'carrier', 'deceased', 'proband', 'consultand'], hidden: [] });
    expect(known.hidden).toEqual(['presymptomatic', 'name']);
    // the Bilgiler band (2026-11-04): a preference from before it gets age, genetic, note shown, the name under "Diğer…"
    expect(known.info).toEqual(['age', 'genetic', 'note', 'name']);
    // once the name is shown it stays shown
    expect(normalizeRing(toggleInRing(normalizeRing(known), 'name')).hidden).toEqual(['presymptomatic']);
  });

  it('a stored preference from another version: unknown ids dropped, duplicates once, new choices at the end', () => {
    const r = normalizeRing({ rows: ['group', 'nonsense', 'group'], status: ['proband'], hidden: ['loss', 'loss', 'x'] });
    expect(r.rows).toEqual(['group', 'pregnancy', 'adopted', 'art']);
    expect(r.status).toEqual(['proband', ...RING_STATUS.map(s => s.id).filter(id => id !== 'proband')]);
    expect(r.hidden).toEqual(['loss', 'art', 'presymptomatic', 'name']);
    expect(normalizeRing({ info: ['note', 'bogus', 'note'] }).info).toEqual(['note', 'age', 'genetic', 'name']);
    expect(normalizeRing('garbage')).toEqual(normalizeRing(DEFAULT_RING));
  });

  it('moving and hiding', () => {
    let r = normalizeRing(DEFAULT_RING);
    r = moveInRing(r, 'status', 'proband', -1);
    expect(r.status.slice(2, 4)).toEqual(['proband', 'deceased']);
    expect(moveInRing(r, 'rows', 'pregnancy', -1)).toBe(r); // already first
    r = toggleInRing(toggleInRing(r, 'consultand'), 'stillbirth');
    expect(r.hidden).toEqual(['art', 'presymptomatic', 'name', 'consultand', 'stillbirth']);
    expect(toggleInRing(r, 'consultand').hidden).toEqual(['art', 'presymptomatic', 'name', 'stillbirth']);
    expect(moveInRing(r, 'info', 'note', -1).info).toEqual(['age', 'note', 'genetic', 'name']);
  });

  // moved to screen.test.js: Ayarlar → Halka menü (the ring menu)
});
