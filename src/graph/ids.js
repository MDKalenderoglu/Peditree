/**
 * ids.js — permanent identifiers (schema v2).
 *
 * An id belongs to one person (or union) forever: it never changes when the
 * person's role or position changes, and once a person is removed the id is
 * retired and never handed out again. New ids keep the readable symbolic
 * style (`sib_m_3`, `mat_uncle_2_cf_0`, `de_ch_7`) — only the numeric suffix
 * comes from the allocator.
 *
 * `ids` state: { counters: { [prefix]: lastUsedNumber }, retired: string[] }
 */

const EDIT_PREFIX_RE = /^(?:de_sp|de_ch|de_par|U_DE|U_DE_PARENTS|U_DE_LINK|cc|U_CC)_(\d+)/;

export function emptyIds() {
  return { counters: {}, retired: [] };
}

function allIdsOf(graph) {
  return [
    ...graph.individuals.map((i) => i.id),
    ...graph.unions.map((u) => u.id),
  ];
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Next free `${prefix}${n}` (optionally followed by `suffix`): larger than any
 * number ever used with this prefix — live, retired or remembered in the
 * counter. Pure: returns the id and the updated `ids` state.
 */
export function allocateId(ids, graph, prefix, suffix = '') {
  const re = new RegExp(`^${escapeRe(prefix)}(\\d+)`);
  let max = ids.counters[prefix] ?? -1;
  for (const id of [...allIdsOf(graph), ...ids.retired]) {
    const m = id.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  const n = max + 1;
  return { id: `${prefix}${n}${suffix}`, n, ids: { ...ids, counters: { ...ids.counters, [prefix]: n } } };
}

/**
 * One shared number for the ids a single editor action creates together
 * (`de_sp_N` + `U_DE_N`, `de_par_N_1` + `de_par_N_2` + `U_DE_PARENTS_N`) —
 * the v1 convention, kept so old and new ids read the same way.
 */
export function allocateEditNumber(ids, graph) {
  let max = ids.counters.edit ?? -1;
  for (const id of [...allIdsOf(graph), ...ids.retired]) {
    const m = id.match(EDIT_PREFIX_RE);
    if (m) max = Math.max(max, Number(m[1]));
  }
  const n = max + 1;
  return { n, ids: { ...ids, counters: { ...ids.counters, edit: n } } };
}

export function retire(ids, removedIds) {
  const retired = new Set(ids.retired);
  for (const id of removedIds) retired.add(id);
  return { ...ids, retired: [...retired].sort() };
}
