/**
 * multiples.js — twins, triplets and higher multiple births (clinician
 * request 2026-10-24; NSGC: siblings of one pregnancy hang from a single
 * point of the sibship line; monozygotic = a bar between their lines,
 * zygosity unknown = "?", dizygotic / trizygotic = no mark).
 *
 * Model: on the biological parent–child relationship,
 *   rel.multiples = [{ id, children: [childId, …] (≥ 2), zygosity }]
 *   zygosity: 'monozygotic' | 'dizygotic' | 'unknown'
 * (three or more dizygotic = polyzygotic, e.g. trizygotic triplets).
 * A child is in at most one group; the members of a group always stand next
 * to each other in the sibship (finalize.js keeps that after every
 * operation).
 */
import { commit, block, draftAddPerson, draftAddChild } from './ops';
import { indexGraph } from './model';
import { allocateId } from './ids';

export const ZYGOSITY = ['monozygotic', 'dizygotic', 'unknown'];
export const ZYGOSITY_LABEL = { monozygotic: 'Tek yumurta (monozigotik)', dizygotic: 'Çift yumurta (dizigotik)', unknown: 'Zigositesi bilinmiyor' };

/** Zygosity in words for a group of n (three dizygotic = trizygotic). */
export function zygosityLabel(zygosity, n) {
  if (zygosity === 'monozygotic') return 'Tek yumurta (monozigotik)';
  if (zygosity === 'dizygotic') return n === 2 ? 'Çift yumurta (dizigotik)' : n === 3 ? 'Trizigotik' : 'Polizigotik';
  return 'Zigositesi bilinmiyor';
}

/** Turkish name of a group: ikiz / üçüz / dördüz … */
export function multipleName(n) {
  return ({ 2: 'İkiz', 3: 'Üçüz', 4: 'Dördüz', 5: 'Beşiz' })[n] || `${n}'li çoğul gebelik`;
}

/** The group a child belongs to, with its relationship, or null. */
export function groupOf(graph, childId) {
  for (const rel of graph.parentChildRelationships) {
    const g = (rel.multiples || []).find((m) => m.children.includes(childId));
    if (g) return { rel, group: g };
  }
  return null;
}

/**
 * Keep groups valid (in place): members must be children of the relationship,
 * a child in one group only, groups of fewer than two dissolve, members stand
 * together (at the place of the first member in the current order).
 */
export function normalizeMultiples(graph) {
  for (const rel of graph.parentChildRelationships) {
    if (!Array.isArray(rel.multiples) || !rel.multiples.length) { delete rel.multiples; continue; }
    const kids = new Set(rel.children);
    const taken = new Set();
    rel.multiples = rel.multiples
      .map((m) => ({ ...m, children: m.children.filter((c) => kids.has(c) && !taken.has(c) && (taken.add(c), true)) }))
      .filter((m) => m.children.length >= 2)
      .map((m) => ({ ...m, zygosity: ZYGOSITY.includes(m.zygosity) ? m.zygosity : 'unknown' }));
    if (!rel.multiples.length) { delete rel.multiples; continue; }
    // members together, in their current relative order
    let order = rel.children.slice();
    for (const m of rel.multiples) {
      const members = order.filter((c) => m.children.includes(c));
      const at = order.indexOf(members[0]);
      const rest = order.filter((c) => !m.children.includes(c));
      const before = order.slice(0, at).filter((c) => !m.children.includes(c)).length;
      order = [...rest.slice(0, before), ...members, ...rest.slice(before)];
      m.children = members;
    }
    rel.children = order;
  }
  return graph;
}

function nextGroupId(d) {
  const used = new Set(d.graph.parentChildRelationships.flatMap((r) => (r.multiples || []).map((m) => m.id)));
  let n = 1;
  while (used.has(`M${n}`)) n++;
  return `M${n}`;
}

/** Make these siblings one multiple birth (joining an existing group of any of them). */
export function setMultipleBirth(doc, childIds, zygosity = 'unknown') {
  return commit(doc, (d) => {
    if (!ZYGOSITY.includes(zygosity)) block(`Bilinmeyen zigosite: ${zygosity}`);
    const idx = indexGraph(d.graph);
    const uids = new Set(childIds.map((c) => idx.bioParentUnion.get(c)));
    if (childIds.length < 2 || uids.size !== 1 || uids.has(undefined)) block('İkiz/üçüz yalnızca aynı anne-babanın çocukları arasında olabilir.');
    if (childIds.some((c) => idx.byId.get(c)?.placeholder)) block('Belirtilmemiş ebeveyn ikiz yapılamaz.');
    const rel = d.graph.parentChildRelationships.find((r) => r.unionId === [...uids][0]);
    rel.multiples = rel.multiples || [];
    const existing = rel.multiples.filter((m) => m.children.some((c) => childIds.includes(c)));
    const members = [...new Set([...existing.flatMap((m) => m.children), ...childIds])];
    rel.multiples = rel.multiples.filter((m) => !existing.includes(m));
    const id = existing[0]?.id || nextGroupId(d);
    rel.multiples.push({ id, children: rel.children.filter((c) => members.includes(c)), zygosity });
    return { created: { groupId: id } };
  });
}

/** Add a new child to `personId`'s sibship as their twin (or the next one of the group). */
export function addMultipleSibling(doc, personId, { sex = 'unknown', zygosity } = {}) {
  return commit(doc, (d) => {
    const idx = indexGraph(d.graph);
    const uid = idx.bioParentUnion.get(personId);
    if (!uid) block('İkiz eklemek için önce anne ve baba çizili olmalı.');
    const person = idx.byId.get(personId);
    const rel = d.graph.parentChildRelationships.find((r) => r.unionId === uid);
    const r = allocateId(d.ids, d.graph, 'twin_');
    d.ids = r.ids;
    const ownGroup = (rel.multiples || []).find((m) => m.children.includes(personId));
    const z = zygosity || ownGroup?.zygosity || 'unknown';
    // monozygotic twins share their sex
    const childSex = z === 'monozygotic' && (person.sex === 'male' || person.sex === 'female') ? person.sex : sex;
    draftAddPerson(d, { id: r.id, sex: childSex, generation: person.generation, relation: 'twin', label: 'İkiz', age: person.age || '' });
    draftAddChild(d, uid, r.id, { orderPolicy: rel.orderPolicy || 'byAge' });
    // stand right after the group (or the person)
    const kids = rel.children.filter((c) => c !== r.id);
    const lastMember = ownGroup ? Math.max(...ownGroup.children.map((c) => kids.indexOf(c))) : kids.indexOf(personId);
    kids.splice(lastMember + 1, 0, r.id);
    rel.children = kids;
    rel.multiples = (rel.multiples || []).filter((m) => m !== ownGroup);
    rel.multiples.push({ id: ownGroup?.id || nextGroupId(d), children: [...(ownGroup ? ownGroup.children : [personId]), r.id], zygosity: z });
    return { created: { childId: r.id } };
  });
}

export function setMultipleZygosity(doc, personId, zygosity) {
  return commit(doc, (d) => {
    if (!ZYGOSITY.includes(zygosity)) block(`Bilinmeyen zigosite: ${zygosity}`);
    const found = groupOf(d.graph, personId);
    if (!found) block('Bu kişi bir ikiz/üçüz grubunda değil.');
    found.group.zygosity = zygosity;
  });
}

/** Take a person out of their group (a group of two dissolves). */
export function leaveMultipleBirth(doc, personId) {
  return commit(doc, (d) => {
    const found = groupOf(d.graph, personId);
    if (!found) return;
    found.group.children = found.group.children.filter((c) => c !== personId);
  });
}

/** Warnings: monozygotic members of different sex (rare; worth a check). */
export function multiplesWarnings(graph) {
  const out = [];
  const byId = new Map(graph.individuals.map((i) => [i.id, i]));
  for (const rel of graph.parentChildRelationships) {
    for (const m of rel.multiples || []) {
      if (m.zygosity !== 'monozygotic') continue;
      const sexes = new Set(m.children.map((c) => byId.get(c)?.sex).filter((s) => s === 'male' || s === 'female'));
      if (sexes.size > 1) {
        out.push({ severity: 'warning', code: 'MONOZYGOTIC_SEX_DIFFERS', message: 'Tek yumurta ikizleri olarak işaretli kişilerin cinsiyeti farklı; kontrol edin.', ids: m.children });
      }
    }
  }
  return out;
}
