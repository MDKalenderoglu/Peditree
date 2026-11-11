/**
 * kinTerm.js — what a person is to the proband, in the clinic's words
 * (clinician request 2026-11-11: in a wide pedigree the side panel said only
 * "Kadın, II-7"; it should say "Anneanne", "Amca", "1. derece kuzen (teyze
 * kızı)" so the reader finds who is who at a glance).
 *
 * Read from the drawn parentage (the parents a person is drawn under: the
 * biological couple, or the adoptive one for a child adopted in), never
 * stored. Blood relatives are named by the nearest common ancestor — how many
 * generations up from the proband (m) and from the person (n) — and by the
 * side (the proband's mother's or father's) and the sex of the people on the
 * way, as Turkish names them (amca/hala on the father's side, dayı/teyze on
 * the mother's). A partner of a relative is that relative's partner
 * ("Amcanın eşi"), the proband's partner's parents and siblings are named
 * through the partner ("Eşinin annesi"). Someone the drawing does not connect
 * gets no name (null). Turkish and English are built apart (Turkish
 * possessives do not translate word for word).
 */
import { currentLang } from '../i18n';

function parentage(graph) {
  const unionById = new Map(graph.unions.map((u) => [u.id, u]));
  const parents = new Map();
  for (const r of graph.parentChildRelationships || []) {
    const u = unionById.get(r.unionId);
    if (u) for (const c of r.children) parents.set(c, u.partners.slice());
  }
  // a child adopted in, with no biological parents drawn: the adoptive couple
  for (const l of graph.socialParentLinks || []) {
    if (parents.has(l.childId) || l.kind !== 'adoptive') continue;
    const u = unionById.get(l.unionId);
    if (u) parents.set(l.childId, u.partners.slice());
  }
  const partners = new Map();
  for (const u of graph.unions) {
    const [a, b] = u.partners || [];
    if (!a || !b) continue;
    if (!partners.has(a)) partners.set(a, []);
    if (!partners.has(b)) partners.set(b, []);
    partners.get(a).push(b);
    partners.get(b).push(a);
  }
  return { parents, partners };
}

/** ancestor → { depth, path: [the person, parent, grandparent …, ancestor] } (shortest, first found). */
function ancestors(parents, id) {
  const out = new Map();
  let frontier = [[id]];
  while (frontier.length) {
    const next = [];
    for (const path of frontier) {
      for (const p of parents.get(path[path.length - 1]) || []) {
        if (!p || out.has(p) || p === id) continue;
        const np = [...path, p];
        out.set(p, { depth: np.length - 1, path: np });
        next.push(np);
      }
    }
    frontier = next;
  }
  return out;
}

/**
 * The relationship of `id` to `probandId` as a description:
 * { kind: 'blood', m, n, half, path (proband → ancestor), down (person → ancestor) }
 * | { kind: 'partner', of: description of the relative } | { kind: 'inlaw', via: 'parent' | 'sibling' | 'child' }
 * | null.
 */
export function relationTo(graph, probandId, id) {
  if (!probandId || !id || probandId === id) return null;
  const byId = new Map(graph.individuals.map((i) => [i.id, i]));
  if (!byId.has(probandId) || !byId.has(id)) return null;
  const { parents, partners } = parentage(graph);
  const up = ancestors(parents, probandId);
  const blood = (who) => {
    const own = ancestors(parents, who);
    if (up.has(who)) return { kind: 'blood', m: up.get(who).depth, n: 0, half: false, path: up.get(who).path, down: [who] };
    if (own.has(probandId)) return { kind: 'blood', m: 0, n: own.get(probandId).depth, half: false, path: [probandId], down: own.get(probandId).path };
    let best = null;
    for (const [a, { depth: n, path: down }] of own) {
      if (!up.has(a)) continue;
      const m = up.get(a).depth;
      if (!best || m + n < best.m + best.n || (m + n === best.m + best.n && m < best.m)) best = { a, m, n, down, path: up.get(a).path };
    }
    if (!best) return null;
    // full relatives share both partners of the ancestral couple; half relatives one of them
    const commons = [...own.keys()].filter((a) => up.has(a) && up.get(a).depth === best.m && own.get(a).depth === best.n);
    const half = !commons.some((a) => a !== best.a && (partners.get(best.a) || []).includes(a));
    return { kind: 'blood', m: best.m, n: best.n, half, path: best.path, down: best.down };
  };
  const own = blood(id);
  if (own) return own;
  // a partner: of the proband, or of a blood relative
  const ps = partners.get(id) || [];
  if (ps.includes(probandId)) return { kind: 'partner', of: { kind: 'self' } };
  for (const p of ps) {
    const r = blood(p);
    if (r) return { kind: 'partner', of: r, ofId: p };
  }
  // the proband's partner's parents, siblings, children from another relationship
  for (const sp of partners.get(probandId) || []) {
    if ((parents.get(sp) || []).includes(id)) return { kind: 'inlaw', via: 'parent', spouse: sp };
    const spParents = parents.get(sp) || [];
    const myParents = parents.get(id) || [];
    if (spParents.length && spParents.some((x) => myParents.includes(x))) return { kind: 'inlaw', via: 'sibling', spouse: sp };
    if (myParents.includes(sp)) return { kind: 'inlaw', via: 'child', spouse: sp };
  }
  return null;
}

// ── Turkish ─────────────────────────────────────────────────────────────

const VOWELS = 'aeıioöuü';
/** Turkish genitive of a phrase: "Amca" → "Amcanın", "Kızı" → "Kızının", "1. derece kuzen" → "1. derece kuzenin". */
export function genitiveTr(phrase) {
  const s = String(phrase);
  const lower = s.toLocaleLowerCase('tr');
  let v = null;
  for (let k = lower.length - 1; k >= 0; k--) if (VOWELS.includes(lower[k])) { v = lower[k]; break; }
  const suffix = v === 'a' || v === 'ı' ? 'ın' : v === 'o' || v === 'u' ? 'un' : v === 'ö' || v === 'ü' ? 'ün' : 'in';
  return s + (VOWELS.includes(lower[lower.length - 1]) ? 'n' : '') + suffix;
}
// third-person possessive of the words used after a genitive ("Annenin amcası")
const POSS_TR = {
  anne: 'annesi', baba: 'babası', amca: 'amcası', hala: 'halası', dayı: 'dayısı', teyze: 'teyzesi',
  kardeş: 'kardeşi', 'kız kardeş': 'kız kardeşi', 'erkek kardeş': 'erkek kardeşi', eş: 'eşi',
};

const sexOf = (graph, id) => (graph.individuals.find((i) => i.id === id) || {}).sex;
const word = (sex, male, female, other) => (sex === 'male' ? male : sex === 'female' ? female : other);

/** the sibling of a parent, named from that parent's side ("amca" … ), lower case */
const parentSiblingTr = (parentSex, sex) => (parentSex === 'male'
  ? word(sex, 'amca', 'hala', 'babanın kardeşi')
  : parentSex === 'female' ? word(sex, 'dayı', 'teyze', 'annenin kardeşi') : 'ebeveynin kardeşi');
const cap = (s) => (s ? s[0].toLocaleUpperCase('tr') + s.slice(1) : s);

function bloodTr(graph, r, id) {
  const { m, n, half, path, down } = r;
  const sex = sexOf(graph, id);
  const parentSex = path.length > 1 ? sexOf(graph, path[1]) : null; // the proband's parent on the way
  const sideTr = parentSex === 'female' ? 'anne tarafı' : parentSex === 'male' ? 'baba tarafı' : null;
  const halfTag = half ? ' (yarım)' : '';
  if (n === 0) {
    if (m === 1) return word(sex, 'Baba', 'Anne', 'Ebeveyn');
    if (m === 2) {
      if (parentSex === 'female') return word(sex, 'Dede (anne tarafı)', 'Anneanne', 'Büyük ebeveyn (anne tarafı)');
      if (parentSex === 'male') return word(sex, 'Dede (baba tarafı)', 'Babaanne', 'Büyük ebeveyn (baba tarafı)');
      return word(sex, 'Dede', 'Büyükanne', 'Büyük ebeveyn');
    }
    if (m === 3) {
      const gp = bloodTr(graph, { m: 2, n: 0, half: false, path: path.slice(0, 3), down: [path[2]] }, path[2]);
      const base = gp.replace(/ \(.*\)$/, '');
      return `${genitiveTr(base)} ${word(sex, 'babası', 'annesi', 'ebeveyni')}${sideTr ? ` (${sideTr})` : ''}`;
    }
    return `Ata (${m - 1} kuşak yukarıda${sideTr ? `, ${sideTr}` : ''})`;
  }
  if (m === 0) {
    if (n === 1) return word(sex, 'Oğlu', 'Kızı', 'Çocuğu');
    if (n === 2) return 'Torunu';
    if (n === 3) return 'Torununun çocuğu';
    return `Torunu (${n - 1}. kuşak)`;
  }
  if (m === 1 && n === 1) {
    if (half) {
      const shared = path[1];
      const via = sexOf(graph, shared) === 'female' ? 'Anne bir' : sexOf(graph, shared) === 'male' ? 'Baba bir' : 'Yarım';
      return `${via} ${word(sex, 'erkek kardeş', 'kız kardeş', 'kardeş')}`;
    }
    return word(sex, 'Erkek kardeş', 'Kız kardeş', 'Kardeş');
  }
  if (m === 1 && n === 2) return `${word(sex, 'Yeğen (erkek)', 'Yeğen (kız)', 'Yeğen')}${halfTag}`;
  if (m === 1 && n === 3) return `Yeğenin çocuğu${halfTag}`;
  if (m === 2 && n === 1) return cap(parentSiblingTr(parentSex, sex)) + halfTag;
  if (m === 3 && n === 1) {
    // the parent's parent's sibling, named from the parent: "Annenin amcası"
    const gpSex = sexOf(graph, path[2]);
    const rel = parentSiblingTr(gpSex, sex);
    const of = parentSex === 'female' ? 'Annenin' : parentSex === 'male' ? 'Babanın' : 'Ebeveynin';
    return `${of} ${POSS_TR[rel] || `${rel}`}${halfTag}`;
  }
  if (m === n) {
    const deg = m - 1;
    if (m === 2) {
      // the cousin's parent: the proband's parent's sibling — "amca kızı", "teyze oğlu"
      const auntUncle = parentSiblingTr(parentSex, sexOf(graph, down[1]));
      const child = word(sex, 'oğlu', 'kızı', 'çocuğu');
      const simple = ['amca', 'hala', 'dayı', 'teyze'].includes(auntUncle);
      return `1. derece kuzen (${simple ? `${auntUncle} ${child}` : sideTr || 'kuzen'})${halfTag}`;
    }
    return `${deg}. derece kuzen${sideTr ? ` (${sideTr})` : ''}${halfTag}`;
  }
  if (n === m + 1) return `${m - 1}. derece kuzenin çocuğu${sideTr ? ` (${sideTr})` : ''}${halfTag}`;
  if (m === n + 1) {
    const of = parentSex === 'female' ? 'Annenin' : parentSex === 'male' ? 'Babanın' : 'Ebeveynin';
    return `${of} ${n - 1}. derece kuzeni${halfTag}`;
  }
  return `Kan bağı olan akraba${sideTr ? ` (${sideTr})` : ''}`;
}

function termTr(graph, r, id) {
  if (r.kind === 'blood') return bloodTr(graph, r, id);
  if (r.kind === 'partner') {
    if (r.of.kind === 'self') return 'Eşi';
    const rel = bloodTr(graph, r.of, r.ofId);
    const m = /^(.*?)( \(.*\))$/.exec(rel);
    return m ? `${genitiveTr(m[1])} eşi${m[2]}` : `${genitiveTr(rel)} eşi`;
  }
  const sex = sexOf(graph, id);
  if (r.via === 'parent') return `Eşinin ${word(sex, 'babası', 'annesi', 'ebeveyni')}`;
  if (r.via === 'sibling') return `Eşinin ${word(sex, 'erkek kardeşi', 'kız kardeşi', 'kardeşi')}`;
  return `Eşinin ${word(sex, 'oğlu', 'kızı', 'çocuğu')}`;
}

// ── English (NSGC terms) ────────────────────────────────────────────────

const ORD = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth'];
const ord = (k) => ORD[k] || `${k}th`;
const parentSiblingEn = (parentSex, sex) => `${parentSex === 'male' ? 'paternal ' : parentSex === 'female' ? 'maternal ' : ''}${word(sex, 'uncle', 'aunt', 'aunt/uncle')}`;
const capEn = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function bloodEn(graph, r, id) {
  const { m, n, half, path, down } = r;
  const sex = sexOf(graph, id);
  const parentSex = path.length > 1 ? sexOf(graph, path[1]) : null;
  const side = parentSex === 'female' ? 'maternal' : parentSex === 'male' ? 'paternal' : null;
  const halfTag = half ? ' (half)' : '';
  if (n === 0) {
    if (m === 1) return word(sex, 'Father', 'Mother', 'Parent');
    const greats = 'great-'.repeat(Math.max(0, m - 2));
    return capEn(`${side ? `${side} ` : ''}${greats}${word(sex, 'grandfather', 'grandmother', 'grandparent')}`);
  }
  if (m === 0) {
    if (n === 1) return word(sex, 'Son', 'Daughter', 'Child');
    return capEn(`${'great-'.repeat(n - 2)}grandchild`);
  }
  if (m === 1 && n === 1) {
    if (half) {
      const shared = sexOf(graph, path[1]);
      return `${word(sex, 'Half-brother', 'Half-sister', 'Half-sibling')}${shared === 'female' ? ' (same mother)' : shared === 'male' ? ' (same father)' : ''}`;
    }
    return word(sex, 'Brother', 'Sister', 'Sibling');
  }
  if (m === 1 && n === 2) return word(sex, 'Nephew', 'Niece', 'Niece/nephew') + halfTag;
  if (m === 1 && n === 3) return `Grand-${word(sex, 'nephew', 'niece', 'niece/nephew')}${halfTag}`;
  if (m === 2 && n === 1) return capEn(parentSiblingEn(parentSex, sex)) + halfTag;
  if (m === 3 && n === 1) {
    const of = parentSex === 'female' ? 'Mother’s' : parentSex === 'male' ? 'Father’s' : 'Parent’s';
    return `${of} ${parentSiblingEn(sexOf(graph, path[2]), sex)}${halfTag}`;
  }
  if (m === n) {
    if (m === 2) {
      const via = parentSiblingEn(parentSex, sexOf(graph, down[1]));
      return `First cousin (${via}’s ${word(sex, 'son', 'daughter', 'child')})${halfTag}`;
    }
    return `${ord(m - 1)} cousin${side ? ` (${side})` : ''}${halfTag}`;
  }
  if (n === m + 1) return `${ord(m - 1)} cousin once removed (cousin’s child${side ? `, ${side}` : ''})${halfTag}`;
  if (m === n + 1) {
    const of = parentSex === 'female' ? 'Mother’s' : parentSex === 'male' ? 'Father’s' : 'Parent’s';
    return `${of} ${ord(n - 1).toLowerCase()} cousin${halfTag}`;
  }
  return `Blood relative${side ? ` (${side})` : ''}`;
}

function termEn(graph, r, id) {
  if (r.kind === 'blood') return bloodEn(graph, r, id);
  if (r.kind === 'partner') return r.of.kind === 'self' ? 'Partner' : `${bloodEn(graph, r.of, r.ofId)}’s partner`;
  const sex = sexOf(graph, id);
  if (r.via === 'parent') return `Partner’s ${word(sex, 'father', 'mother', 'parent')}`;
  if (r.via === 'sibling') return `Partner’s ${word(sex, 'brother', 'sister', 'sibling')}`;
  return `Partner’s ${word(sex, 'son', 'daughter', 'child')}`;
}

/** The person the names are given from: the proband, else the consultand. */
export function kinAnchor(graph) {
  const inds = graph.individuals || [];
  return (inds.find((i) => i.proband) || inds.find((i) => i.consultand) || {}).id || null;
}

/** What `id` is to the proband, in `lang` (default: the interface's); null when the drawing does not say. */
export function kinTerm(graph, id, lang = currentLang()) {
  const anchor = kinAnchor(graph);
  const r = relationTo(graph, anchor, id);
  if (!r) return null;
  return lang === 'en' ? termEn(graph, r, id) : termTr(graph, r, id);
}
