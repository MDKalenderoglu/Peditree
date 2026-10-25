/**
 * keyboardNav.js — moving the selection around the drawing with the arrow
 * keys (clinician request 2026-10-25): ← → the nearest person on the same
 * row, ↑ a parent (the nearer one), ↓ a child (the nearest); where there is
 * none, the nearest person on the row above / below.
 *
 * @param {{ nodes, unions, parentChildRelationships }} data — pedigreeData
 * @param {string} id — the selected person
 * @param {'left'|'right'|'up'|'down'} dir
 * @returns {string|null} the person to select, or null to stay
 */
export function nextPerson(data, id, dir) {
  const nodes = (data.nodes || []).filter((n) => !n.placeholder);
  const me = nodes.find((n) => n.id === id);
  if (!me) return null;
  const nearest = (list) => list.reduce((best, n) => (!best || Math.abs(n.x - me.x) < Math.abs(best.x - me.x) ? n : best), null);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (dir === 'left' || dir === 'right') {
    const row = nodes.filter((n) => n.id !== id && Math.abs(n.y - me.y) < 1 && (dir === 'left' ? n.x < me.x : n.x > me.x));
    return nearest(row)?.id ?? null;
  }
  const pcrs = data.parentChildRelationships || [];
  const unions = data.unions || [];
  const parentsOf = () => {
    const rel = pcrs.find((r) => r.children.includes(id));
    const u = rel && unions.find((x) => x.id === rel.unionId);
    return u ? u.partners : [];
  };
  const childrenOf = () => {
    const mine = new Set(unions.filter((u) => u.partners.includes(id)).map((u) => u.id));
    return pcrs.filter((r) => mine.has(r.unionId)).flatMap((r) => r.children);
  };
  const family = (dir === 'up' ? parentsOf() : childrenOf()).map((x) => byId.get(x)).filter(Boolean);
  if (family.length) return nearest(family).id;
  const rows = [...new Set(nodes.map((n) => n.y))].sort((a, b) => a - b);
  const k = rows.findIndex((y) => Math.abs(y - me.y) < 1);
  const y = rows[dir === 'up' ? k - 1 : k + 1];
  if (y === undefined) return null;
  return nearest(nodes.filter((n) => Math.abs(n.y - y) < 1))?.id ?? null;
}

/** Letters for one selected person: a sector or satellite of the ring, or an action. */
export const RING_KEYS = {
  a: 'parents', e: 'spouse',
  k: 'left', c: 'bottom', 'ç': 'bottom',
  b: 'findings', d: 'status', i: 'twins', 'ı': 'twins', n: 'note',
};
