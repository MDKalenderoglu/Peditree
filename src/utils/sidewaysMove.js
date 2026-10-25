/**
 * sidewaysMove.js — moving a person left or right in the drawing (Shift +
 * arrow keys, or dragging with the mouse, a finger or a pen; clinician
 * request 2026-10-25). Only moves that keep the drawing's guarantees:
 *   - the neighbour in that direction is the person's partner: the two swap
 *     sides (union.leftPartner, placement only);
 *   - the person has a sibling that way: the birth order changes (twins move
 *     as one unit, ops.moveChild);
 *   - otherwise nothing moves, with the reason.
 * Free placement is not offered: symbols could overlap and children would no
 * longer stand under their parents.
 */
import { nextPerson } from './keyboardNav';
import { ageInDays } from './age';
import { isPregnancy } from '../graph/model';

const unionOf = (data, a, b) => (data.unions || []).find((u) => u.partners.includes(a) && u.partners.includes(b));
const sibshipOf = (data, id) => (data.parentChildRelationships || []).find((r) => r.children.includes(id));

/**
 * @returns {{ kind: 'partner', unionId, leftPartner } | { kind: 'sibling', unionId, dir } | { kind: 'none', reason }}
 */
export function sidewaysMove(data, id, dir) {
  const neighbour = nextPerson(data, id, dir);
  const u = neighbour && unionOf(data, id, neighbour);
  if (u) return { kind: 'partner', unionId: u.id, leftPartner: dir === 'left' ? id : neighbour };
  const rel = sibshipOf(data, id);
  if (rel) {
    const k = rel.children.indexOf(id);
    if (dir === 'left' ? k > 0 : k < rel.children.length - 1) return { kind: 'sibling', unionId: rel.unionId, dir };
  }
  return { kind: 'none', reason: `Bu kişinin ${dir === 'left' ? 'solunda' : 'sağında'} yer değiştirebileceği bir eşi ya da kardeşi yok.` };
}

/** Dropped onto another person: swap with a partner, or take a sibling's place in the birth order. */
export function dropMove(data, id, targetId) {
  if (!targetId || targetId === id) return { kind: 'none', reason: null };
  const x = (pid) => (data.nodes || []).find((n) => n.id === pid)?.x ?? 0;
  const u = unionOf(data, id, targetId);
  if (u) return { kind: 'partner', unionId: u.id, leftPartner: x(id) > x(targetId) ? id : targetId };
  const rel = sibshipOf(data, id);
  if (rel && rel.children.includes(targetId)) {
    const from = rel.children.indexOf(id), to = rel.children.indexOf(targetId);
    return { kind: 'sibling', unionId: rel.unionId, dir: to < from ? 'left' : 'right', target: targetId };
  }
  return { kind: 'none', reason: 'Yalnızca eşiyle yer değiştirebilir ya da kardeşleri arasında taşınabilir.' };
}

/** The aged liveborn siblings out of age order (oldest left), for a warning. */
export function againstAges(data, unionId) {
  const rel = (data.parentChildRelationships || []).find((r) => r.unionId === unionId);
  if (!rel) return false;
  const byId = new Map((data.individuals || []).map((i) => [i.id, i]));
  let prev = Infinity;
  for (const c of rel.children) {
    const p = byId.get(c);
    if (!p || isPregnancy(p)) continue;
    const a = ageInDays(p.age);
    if (a === null) continue;
    if (a > prev) return true;
    prev = a;
  }
  return false;
}
