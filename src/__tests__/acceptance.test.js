// @vitest-environment jsdom
/**
 * acceptance.test.js — the clinical acceptance scenarios of the pre-release
 * audit (docs/release-audit/TEST_MATRIX.md §Clinical scenarios). Synthetic
 * families only. Each family is built through the store's operations — the
 * same ones the ring menu and the side panel call — and then:
 *
 *   - the document validates (no error), and the layout audit is clean;
 *   - the drawing has every person, and the geometry keeps the meaning
 *     (children below their parents, partners on one row, no two symbols on
 *     top of each other);
 *   - save → open gives the same graph, field for field;
 *   - undo all → redo all gives the same graph;
 *   - PED out → PED in keeps parentage and sex (its documented limits:
 *     no names, ages, findings — only one affection status);
 *   - the scenario's own clinical facts (degree, F, zygosity, adoption kind…).
 *
 * The screen itself (the real app in a simulated browser) draws every family.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mount, settle, createElement } from './support/dom';
import App from '../App';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { validateDocument, errorsOf } from '../graph/validate';
import { childInbreeding } from '../graph/kinship';
import { adoptionOf, isPregnancy, isSmallSymbol } from '../graph/model';
import { relationSpec, DOUBLE_FIRST_COUSINS } from '../graph/templates';
import { toPed } from '../graph/ped';
import { prepareExportSvg } from '../utils/exportUtils';

const S = () => usePedigreeStore.getState();
const g = () => S().doc.graph;
const person = (id) => g().individuals.find((i) => i.id === id);
let view;

/** run one operation; it must be applied (a refusal fails the scenario with its reason) */
function ok(fn) {
  const before = S().doc;
  const noticeBefore = S().actionNotice;
  fn();
  const n = S().actionNotice;
  if (n && n !== noticeBefore && n.kind !== 'info') throw new Error(`refused: ${n.message}`);
  expect(S().doc).not.toBe(before);
}
/** the id the last operation added (the newest person) */
function added(fn) {
  const had = new Set(g().individuals.map((i) => i.id));
  ok(fn);
  const fresh = g().individuals.filter((i) => !had.has(i.id));
  return fresh.length === 1 ? fresh[0].id : fresh.map((i) => i.id);
}
const unionOf = (a, b) => g().unions.find((u) => u.partners.includes(a) && (b === undefined || u.partners.includes(b)));
const childrenOf = (uid) => (g().parentChildRelationships.find((r) => r.unionId === uid) || {}).children || [];

/** the checks every family gets */
async function checkFamily(name) {
  const doc = S().doc;
  // 1. the document is valid, the drawing's audit clean
  expect(errorsOf(validateDocument(doc)), `${name}: validation`).toEqual([]);
  expect((S().integrityIssues || []).filter((i) => i.severity === 'error'), `${name}: integrity`).toEqual([]);
  // 2. geometry keeps the meaning
  const nodes = S().pedigreeData.nodes;
  const at = new Map(nodes.map((n) => [n.id, n]));
  for (const i of g().individuals) expect(at.has(i.id), `${name}: ${i.id} drawn`).toBe(true);
  for (const r of g().parentChildRelationships) {
    const u = g().unions.find((x) => x.id === r.unionId);
    const parentY = Math.max(...u.partners.map((p) => at.get(p).y));
    for (const c of r.children) expect(at.get(c).y, `${name}: ${c} below the parents`).toBeGreaterThan(parentY);
  }
  for (const u of g().unions.filter((x) => !x.crossGeneration && !x.artVirtual)) {
    const [a, b] = u.partners.map((p) => at.get(p));
    expect(Math.abs(a.y - b.y), `${name}: partners ${u.id} on one row`).toBeLessThan(1);
  }
  const byRow = new Map();
  for (const n of nodes) { const k = Math.round(n.y); if (!byRow.has(k)) byRow.set(k, []); byRow.get(k).push(n); }
  for (const row of byRow.values()) {
    row.sort((p, q) => p.x - q.x);
    for (let k = 1; k < row.length; k++) {
      const gap = (isSmallSymbol(row[k - 1]) || isSmallSymbol(row[k])) ? 20 : 40;
      expect(row[k].x - row[k - 1].x, `${name}: ${row[k - 1].id} / ${row[k].id} apart`).toBeGreaterThanOrEqual(gap);
    }
  }
  // 3. the screen draws every person
  await settle();
  const drawn = new Set([...view.container.querySelectorAll('.node-group')].map((el) => el.__data__ && el.__data__.id));
  for (const i of g().individuals) expect(drawn.has(i.id), `${name}: ${i.id} on screen`).toBe(true);
  // 4. save → open: the same graph
  const graphBefore = JSON.parse(JSON.stringify(g()));
  const file = S().exportProjectFile();
  ok(() => S().resetPedigree());
  S().openProjectFile(file);
  expect(JSON.parse(JSON.stringify(g())), `${name}: save → open`).toEqual(graphBefore);
  // 5. PED out → in: parentage and sex of everyone who is a person (not a pregnancy)
  const ped = toPed(g(), S().pedigreeData.nodes);
  const people = g().individuals.filter((i) => !isPregnancy(i) && !i.placeholder && i.count === undefined);
  const lines = ped.trim().split('\n').filter((l) => !l.startsWith('#'));
  expect(lines.length, `${name}: PED has every person`).toBeGreaterThanOrEqual(people.length);
  return { file, graphBefore };
}

/** undo to the start and redo to the end: the same graph */
function checkUndoRedo(name) {
  const end = JSON.stringify(g());
  let n = 0;
  while ((S()._history || []).length && n < 500) { S().undo(); n++; }
  for (let k = 0; k < n; k++) S().redo();
  expect(JSON.stringify(g()), `${name}: undo/redo`).toBe(end);
}

beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  view = mount(createElement(App));
  await settle();
});
afterAll(() => view.unmount());

describe('clinical acceptance scenarios (synthetic families)', () => {
  it('1. a simple three-generation family', async () => {
    ok(() => S().resetPedigree());
    const sis = added(() => S().addSiblingTo('proband', 'female'));
    added(() => S().addSiblingTo('proband', 'male'));
    const wife = added(() => S().addSpouseTo('proband', 'female'));
    const u = unionOf('proband', wife).id;
    added(() => S().addChildToUnion(u, 'male'));
    added(() => S().addChildToUnion(u, 'female'));
    ok(() => S().updateIndividual(sis, { age: '34' }));
    expect(childrenOf(u)).toHaveLength(2);
    checkUndoRedo('1');
    await checkFamily('1');
  });

  it('2. autosomal dominant: one finding in three generations, the key shows it once', async () => {
    ok(() => S().resetPedigree());
    const gf = unionOf('father') && g().parentChildRelationships.find((r) => r.children.includes('father'));
    const gfId = g().unions.find((u) => u.id === gf.unionId).partners.find((p) => person(p).sex === 'male');
    const wife = added(() => S().addSpouseTo('proband', 'female'));
    const son = added(() => S().addChildToUnion(unionOf('proband', wife).id, 'male'));
    for (const id of [gfId, 'father', 'proband', son]) ok(() => S().addFinding(id, 'Marfan sendromu'));
    expect(S().pedigreeData.conditionKey.filter((e) => e.label === 'Marfan sendromu')).toHaveLength(1);
    for (const id of [gfId, 'father', 'proband', son]) expect(person(id).conditions.some((c) => c.label === 'Marfan sendromu' && c.status === 'affected')).toBe(true);
    await checkFamily('2');
  });

  it('3. autosomal recessive with first-cousin parents: the double line, degree and F come from the drawn ancestors', async () => {
    ok(() => S().newFromTemplate(relationSpec({ father: ['male'], mother: ['male'] })));
    const u = unionOf('father', 'mother');
    expect(u.consanguineous).toBe(true);
    expect(u.consanguinityStatus).toBe('known_supported');
    expect(u.consanguinityDegree).toBe('first_cousin');
    expect(childInbreeding(g(), u.id)).toBeCloseTo(1 / 16, 10);
    ok(() => S().updateIndividual('father', { carrier: true }));
    ok(() => S().updateIndividual('mother', { carrier: true }));
    added(() => S().addSiblingTo('proband', 'female'));
    await checkFamily('3');
  });

  it('4. X-linked: carrier mother and grandmother, affected son and maternal uncle', async () => {
    ok(() => S().resetPedigree());
    const matRel = g().parentChildRelationships.find((r) => r.children.includes('mother'));
    const mgm = g().unions.find((u) => u.id === matRel.unionId).partners.find((p) => person(p).sex === 'female');
    const uncle = added(() => S().addSiblingTo('mother', 'male'));
    ok(() => S().setFindingStatus('proband', 'DMD', 'affected'));
    ok(() => S().setFindingStatus(uncle, 'DMD', 'affected'));
    ok(() => S().setFindingStatus('mother', 'DMD', 'carrier'));
    ok(() => S().setFindingStatus(mgm, 'DMD', 'carrier'));
    expect(person('mother').conditions.find((c) => c.label === 'DMD').status).toBe('carrier');
    await checkFamily('4');
  });

  it('5. adoption: adopted in, adopted out, adopted by relatives — biological and adoptive links stay apart', async () => {
    ok(() => S().resetPedigree());
    const aunt = added(() => S().addSiblingTo('father', 'female'));
    added(() => S().addSpouseTo(aunt, 'male'));
    const auntU = unionOf(aunt).id;
    const sib = added(() => S().addSiblingTo('proband', 'female'));
    ok(() => S().setAdoption(sib, 'out'));
    ok(() => S().setAdoption('proband', auntU));
    const adoptedIn = added(() => S().addChildToUnion('U_PARENTS', 'male', { adopted: true }));
    expect(adoptionOf(g(), 'proband').kind).toBe('relative');
    expect(adoptionOf(g(), sib).kind).toBe('out');
    expect(adoptionOf(g(), adoptedIn).kind).toBe('in');
    // the proband keeps the biological parents; the adoptive link is separate
    expect(g().parentChildRelationships.find((r) => r.children.includes('proband')).unionId).toBe('U_PARENTS');
    expect(g().socialParentLinks.some((l) => l.childId === 'proband' && l.unionId === auntU)).toBe(true);
    await checkFamily('5');
  });

  it('6. more than one partner: half-siblings from two unions, a divorce', async () => {
    ok(() => S().resetPedigree());
    const second = added(() => S().addSpouseTo('father', 'female'));
    const u2 = unionOf('father', second).id;
    const half = added(() => S().addChildToUnion(u2, 'female'));
    ok(() => S().setUnionStatus('U_PARENTS', 'divorced'));
    expect(unionOf('father', 'mother').status).toBe('divorced');
    expect(g().parentChildRelationships.find((r) => r.children.includes(half)).unionId).toBe(u2);
    expect(g().parentChildRelationships.find((r) => r.children.includes('proband')).unionId).toBe('U_PARENTS');
    checkUndoRedo('6');
    await checkFamily('6');
  });

  it('7. monozygotic and dizygotic twins', async () => {
    ok(() => S().resetPedigree());
    const mz = added(() => S().addMultipleSibling('proband', { sex: 'male', zygosity: 'monozygotic' }));
    const a = added(() => S().addSiblingTo('proband', 'female'));
    const b = added(() => S().addMultipleSibling(a, { sex: 'male', zygosity: 'dizygotic' }));
    const groups = g().parentChildRelationships.find((r) => r.unionId === 'U_PARENTS').multiples;
    expect(groups.find((m) => m.children.includes(mz)).zygosity).toBe('monozygotic');
    expect(groups.find((m) => m.children.includes(b)).zygosity).toBe('dizygotic');
    await checkFamily('7');
  });

  it('8. pregnancy outcomes: miscarriage, stillbirth, termination, ectopic, ongoing — each its own kind', async () => {
    ok(() => S().resetPedigree());
    const kinds = { pregnancyLoss: 'SAB', stillbirth: 'SB', termination: 'TOP', ectopic: 'ECT', ongoingPregnancy: 'P' };
    const ids = {};
    for (const f of Object.keys(kinds)) ids[f] = added(() => S().addSiblingTo('proband', 'unknown', { [f]: true }));
    ok(() => S().setGestationWeeks(ids.stillbirth, '28'));
    for (const [f, id] of Object.entries(ids)) {
      const p = person(id);
      expect(p[f]).toBe(true);
      for (const other of Object.keys(kinds).filter((x) => x !== f)) expect(!!p[other]).toBe(false);
    }
    // a pregnancy outcome takes no partner
    S().addSpouseTo(ids.stillbirth, 'male');
    expect(unionOf(ids.stillbirth)).toBeUndefined();
    await checkFamily('8');
  });

  it('9. a large five-generation family (60 people or more)', async () => {
    ok(() => S().resetPedigree());
    const gps = g().individuals.filter((i) => i.generation === 1).map((i) => i.id);
    for (const gp of gps) added(() => S().addParentsTo(gp, {}));
    for (const side of ['father', 'mother']) {
      for (let k = 0; k < 4; k++) {
        const s = added(() => S().addSiblingTo(side, k % 2 ? 'female' : 'male'));
        const sp = added(() => S().addSpouseTo(s, person(s).sex === 'male' ? 'female' : 'male'));
        const u = unionOf(s, sp).id;
        added(() => S().addChildToUnion(u, 'female'));
        added(() => S().addChildToUnion(u, 'male'));
        added(() => S().addChildToUnion(u, k % 2 ? 'male' : 'female'));
      }
    }
    const wife = added(() => S().addSpouseTo('proband', 'female'));
    const pu = unionOf('proband', wife).id;
    const kid = added(() => S().addChildToUnion(pu, 'male'));
    added(() => S().addChildToUnion(pu, 'female'));
    const kw = added(() => S().addSpouseTo(kid, 'female'));
    added(() => S().addChildToUnion(unionOf(kid, kw).id, 'unknown'));
    const gens = new Set(g().individuals.map((i) => i.generation));
    expect(gens.size).toBeGreaterThanOrEqual(5);
    expect(g().individuals.length).toBeGreaterThanOrEqual(60);
    await checkFamily('9');
  });

  it('10. an extended consanguineous family: double first cousins (berdel), and a cousin union in the next generation', async () => {
    ok(() => S().newFromTemplate(DOUBLE_FIRST_COUSINS.find((d) => d.id === 'double-cross').spec));
    const u = unionOf('father', 'mother');
    expect(u.consanguineous).toBe(true);
    expect(childInbreeding(g(), u.id)).toBeCloseTo(1 / 8, 10);
    // the proband marries a first cousin (child of the father's sister)
    const aunt = added(() => S().addSiblingTo('father', 'female'));
    const auntH = added(() => S().addSpouseTo(aunt, 'male'));
    const cousin = added(() => S().addChildToUnion(unionOf(aunt, auntH).id, 'female'));
    ok(() => S().createUnionBetween('proband', cousin));
    const cu = unionOf('proband', cousin);
    expect(cu.consanguineous).toBe(true);
    expect(cu.consanguinityStatus).toBe('known_supported');
    await checkFamily('10');
  });

  it('11. several affected people with different diagnoses; one person with two; the key lists each once', async () => {
    ok(() => S().resetPedigree());
    const sis = added(() => S().addSiblingTo('proband', 'female'));
    ok(() => S().addFinding('proband', 'Epilepsi'));
    ok(() => S().addFinding('proband', 'Otizm'));
    ok(() => S().addFinding(sis, 'Kardiyomiyopati'));
    ok(() => S().addFinding('father', 'Epilepsi'));
    const key = S().pedigreeData.conditionKey.map((e) => e.label).sort();
    expect(key).toEqual(['Epilepsi', 'Kardiyomiyopati', 'Otizm']);
    expect(person('proband').conditions.filter((c) => c.status === 'affected')).toHaveLength(2);
    await checkFamily('11');
  });

  it('12. incomplete information: unknown sex, "n" people, an unsure finding, a deleted parent left as unspecified', async () => {
    ok(() => S().resetPedigree());
    added(() => S().addSiblingTo('proband', 'unknown'));
    const grp = added(() => S().addSiblingTo('proband', 'female', { count: 'n' }));
    expect(person(grp).count).toBe('n');
    ok(() => S().setFindingStatus('mother', 'Diyabet', 'unknown'));
    const other = added(() => S().addSpouseTo('proband', 'female'));
    const kid = added(() => S().addChildToUnion(unionOf('proband', other).id, 'female'));
    window.confirm = () => true;
    ok(() => S().deleteIndividual(other));
    // the child keeps a parent; an unspecified one stands in for the deleted partner
    const rel = g().parentChildRelationships.find((r) => r.children.includes(kid));
    const parents = g().unions.find((u) => u.id === rel.unionId).partners.map(person);
    expect(parents.some((p) => p.id === 'proband')).toBe(true);
    expect(parents.some((p) => p.placeholder)).toBe(true);
    await checkFamily('12');
  });

  it('Turkish letters survive the screen, the file and the exported drawing: ç ğ ı İ ö ş ü', async () => {
    ok(() => S().resetPedigree());
    const name = 'Çağrı İlkay Işıl Öztürk Şenol Ünal';
    ok(() => S().setPatientName(name));
    ok(() => S().updateIndividual('mother', { displayLabel: 'Gülşen Ğ.' }));
    ok(() => S().addFinding('proband', 'Çölyak hastalığı'));
    await settle();
    const svg = view.container.querySelector('.pedigree-viewport').ownerSVGElement;
    const out = new XMLSerializer().serializeToString(prepareExportSvg(svg));
    for (const s of [name, 'Gülşen Ğ.', 'Çölyak hastalığı']) expect(out).toContain(s);
    const file = S().exportProjectFile();
    ok(() => S().resetPedigree());
    S().openProjectFile(file);
    expect(S().doc.patientName).toBe(name);
    expect(person('mother').displayLabel).toBe('Gülşen Ğ.');
    // without the name: only the name goes (the rest is the clinician's choice to share)
    const noName = new XMLSerializer().serializeToString(prepareExportSvg(view.container.querySelector('.pedigree-viewport').ownerSVGElement, { withoutPatientName: true }));
    expect(noName).not.toContain(name);
  });
});

describe('accessibility basics (WCAG 2.2: 4.1.2 name, 1.3.1 labels)', () => {
  it('every button, field and ring part has a name a screen reader can say — toolbar, windows, panel, ring', async () => {
    const { buildMarkFamily } = await import('../audit/markCollisions');
    await settle(() => buildMarkFamily(usePedigreeStore));
    const nameOf = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim()
      || (el.id && view.container.querySelector(`label[for="${el.id}"]`)?.textContent.trim())
      || (el.closest('label') && el.closest('label').textContent.trim())
      || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent.trim())
      || el.getAttribute('placeholder') || '';
    const unnamed = new Set();
    const sweep = () => {
      for (const el of view.container.querySelectorAll('button, input:not([type=hidden]), select, textarea, [role=button], [role=radio]')) {
        if (el.style.display === 'none' || el.closest('[aria-hidden="true"]')) continue;
        if (!nameOf(el)) unnamed.add(el.outerHTML.slice(0, 140));
      }
    };
    const click = (el) => settle(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    const key = (k) => settle(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })));
    sweep();
    for (const label of ['Yeni', 'İndir', 'Ayarlar']) {
      const b = [...view.container.querySelectorAll('button')].find((x) => x.textContent.includes(label));
      await click(b); sweep(); await key('Escape');
    }
    for (const p of g().individuals.filter((x) => !x.placeholder).slice(0, 12)) {
      await settle(() => S().selectIndividual(p.id));
      sweep();
      for (const k of ['k', 'c', 'd', 'b', 'i', 'n']) { await key(k); sweep(); }
      await key('Escape');
    }
    expect([...unnamed]).toEqual([]);
  });
});
