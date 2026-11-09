// @vitest-environment jsdom
/**
 * sameSexPartners.test.js — same-sex partners (clinician decision 2026-11-10; NSGC 2022 §4.4 records
 * same-sex relationships with the usual relationship line). Ayarlar → Çizim → "Aynı cinsiyetten eşler"
 * lets the operations make such a couple; the data itself is valid on every device. A biological child of
 * two partners of the same reproductive sex comes with a donor — a sperm donor for two women, an egg donor
 * or a surrogate for two men — or is added as adopted; partners whose sex assigned at birth differs
 * (AMAB / AFAB) can be the biological parents themselves. The real operations, the store, and the real app
 * in a simulated browser (the ring).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { mount, settle, createElement } from './support/dom';
import App from '../App';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { useViewSettings } from '../utils/drawingStyle';
import * as ops from '../graph/ops';
import { validateDocument } from '../graph/validate';
import { indexGraph } from '../graph/model';
import { childInbreeding } from '../graph/kinship';

const S = () => usePedigreeStore.getState();
const allow = (on) => useViewSettings.getState().setView({ sameSexPartners: on });
const errors = (doc) => validateDocument(doc).filter((i) => i.severity === 'error').map((i) => i.code);

let view;
beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  view = mount(createElement(App));
  await settle();
});
afterAll(() => { view.unmount(); allow(false); });
beforeEach(async () => { await settle(() => { allow(false); S().resetPedigree(); }); });

/** the starter family's proband (a man) with a male partner, made through the operations */
const twoMen = () => {
  const r = ops.addPartner(S().doc, 'proband', { sex: 'male', allowSameSex: true });
  expect(r.ok).toBe(true);
  return { doc: r.doc, unionId: r.created.unionId, partner: r.created.spouseId };
};
/** the proband's mother with a female partner (the father's union stays) */
const twoWomen = () => {
  const r = ops.addPartner(S().doc, 'mother', { sex: 'female', allowSameSex: true });
  expect(r.ok).toBe(true);
  return { doc: r.doc, unionId: r.created.unionId, partner: r.created.spouseId };
};

describe('the operations: only when allowed', () => {
  it('without the setting: no same-sex partner, no same-sex couple made of two people, no sex change that makes one', () => {
    expect(ops.addPartner(S().doc, 'proband', { sex: 'male' }).ok).toBe(false);
    const sib = ops.addSibling(S().doc, 'proband', { sex: 'male' });
    const brother = sib.created && (sib.created.siblingId || sib.created.childId);
    const cousin = ops.addPartner(sib.doc, brother, { sex: 'female' });
    expect(ops.linkPartners(cousin.doc, 'proband', cousin.created.spouseId).ok).toBe(true); // a woman: always
    const withWife = ops.addPartner(S().doc, 'proband', { sex: 'female' });
    expect(withWife.ok).toBe(true);
    expect(ops.updatePerson(withWife.doc, withWife.created.spouseId, { sex: 'male' }).ok).toBe(false);
    expect(ops.updatePerson(withWife.doc, withWife.created.spouseId, { sex: 'male' }, { allowSameSex: true }).ok).toBe(true);
    // two men already drawn: made partners only when allowed
    expect(ops.linkPartners(sib.doc, 'proband', 'father').ok).toBe(false); // (a parent: never)
    const man = ops.addPartner(cousin.doc, cousin.created.spouseId, { sex: 'male' }); // the brother's wife's second partner
    expect(ops.linkPartners(man.doc, 'proband', man.created.spouseId).ok).toBe(false);
    expect(ops.linkPartners(man.doc, 'proband', man.created.spouseId, { allowSameSex: true }).ok).toBe(true);
  });

  it('with it: the couple is made, and it is valid data — no error, so a file with one opens on any device', () => {
    const { doc } = twoMen();
    expect(errors(doc)).toEqual([]);
    const { doc: d2 } = twoWomen();
    expect(errors(d2)).toEqual([]);
  });

  it('the store follows Ayarlar: off refuses, on allows', async () => {
    await settle(() => S().addSpouseTo('proband', 'male'));
    expect(S().doc.graph.unions.some((u) => u.partners.includes('proband'))).toBe(false);
    await settle(() => { allow(true); S().addSpouseTo('proband', 'male'); });
    const u = S().doc.graph.unions.find((x) => x.partners.includes('proband'));
    expect(S().doc.graph.individuals.find((i) => i.id === u.partners.find((p) => p !== 'proband')).sex).toBe('male');
  });
});

describe('their children: a donor, adoption, or partners whose sex at birth differs', () => {
  it('two women: a plain biological child is refused; with a sperm donor, adopted, or a pregnancy loss it is added', () => {
    const { doc, unionId } = twoWomen();
    const plain = ops.addChild(doc, unionId, { sex: 'female' });
    expect(plain.ok).toBe(false);
    expect(plain.reason || JSON.stringify(plain)).toMatch(/sperm donörü gerekir/);
    expect(ops.addChild(doc, unionId, { sex: 'female', reproRole: 'sperm_donor' }).ok).toBe(true);
    expect(ops.addChild(doc, unionId, { sex: 'female', reproRole: 'egg_donor' }).ok).toBe(false);
    expect(ops.addChild(doc, unionId, { sex: 'male', adopted: true }).ok).toBe(true);
    expect(ops.addChild(doc, unionId, { sex: 'unknown', pregnancyLoss: true }).ok).toBe(true);
  });

  it('two men: an egg donor or a surrogate; a gestational carrier alone gives no egg', () => {
    const { doc, unionId } = twoMen();
    expect(ops.addChild(doc, unionId, { sex: 'male' }).ok).toBe(false);
    expect(ops.addChild(doc, unionId, { sex: 'male', reproRole: 'egg_donor' }).ok).toBe(true);
    expect(ops.addChild(doc, unionId, { sex: 'male', reproRole: 'surrogate' }).ok).toBe(true);
    expect(ops.addChild(doc, unionId, { sex: 'male', reproRole: 'gestational_carrier' }).ok).toBe(false);
  });

  it('a donor-conceived child keeps its donor: taking the donor away is refused', () => {
    const { doc, unionId } = twoWomen();
    const r = ops.addChild(doc, unionId, { sex: 'female', reproRole: 'sperm_donor' });
    expect(ops.removeReproductiveLink(r.doc, r.created.childId, r.created.personId).ok).toBe(false);
  });

  it('two women, one assigned male at birth (AMAB): their child is added directly (NSGC 2022: the symbol is gender, AMAB under it)', () => {
    const { doc, unionId, partner } = twoWomen();
    const amab = ops.updatePerson(doc, partner, { sexAtBirth: 'AMAB' });
    expect(amab.ok).toBe(true);
    expect(ops.addChild(amab.doc, unionId, { sex: 'female' }).ok).toBe(true);
  });

  it('kinship goes through the donor only: the partner whose own egg was used is not recorded, and the couple has no F of its own', () => {
    const { doc, unionId } = twoWomen();
    const r = ops.addChild(doc, unionId, { sex: 'female', reproRole: 'sperm_donor' });
    const idx = indexGraph(r.doc.graph);
    expect(idx.geneticParents(r.created.childId)).toEqual([r.created.personId, null]);
    expect(childInbreeding(r.doc.graph, unionId)).toBe(0);
  });
});

describe('the drawing', () => {
  it('two women with a donor-conceived child and an adopted one, two men with a child by a surrogate: drawn without a layout fault', async () => {
    await settle(() => {
      allow(true);
      S().addSpouseTo('mother', 'female');
    });
    const women = S().doc.graph.unions.find((u) => u.partners.includes('mother') && !u.partners.includes('father'));
    await settle(() => {
      S().addChildToUnion(women.id, 'female', { reproRole: 'sperm_donor' });
      S().addChildToUnion(women.id, 'male', { adopted: true });
      S().addSpouseTo('proband', 'male');
    });
    const men = S().doc.graph.unions.find((u) => u.partners.includes('proband'));
    await settle(() => S().addChildToUnion(men.id, 'female', { reproRole: 'surrogate' }));
    expect(S().doc.graph.reproductiveLinks.length).toBe(2);
    expect(S().doc.graph.socialParentLinks.length).toBe(1);
    expect((S().integrityIssues || []).filter((i) => i.severity === 'error')).toEqual([]);
    const nodes = S().pedigreeData.nodes;
    for (const p of S().doc.graph.individuals) expect(nodes.some((n) => n.id === p.id), p.id).toBe(true);
  });
});

describe('the ring in the real app', () => {
  const $ = (sel) => view.container.querySelector(sel);
  const $$ = (sel) => [...view.container.querySelectorAll(sel)];
  const drawn = (id) => $$('.node-group').find((el) => el.__data__ && el.__data__.id === id);
  const click = (el) => settle(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  const sector = (name) => $$('.radial-sector').find((el) => el.getAttribute('aria-label') === name);

  it('Eş adds the opposite sex at once without the setting; with it, Eş asks: Erkek or Kadın', async () => {
    await click(drawn('proband'));
    await click(sector('Eş'));
    const added = S().doc.graph.unions.find((u) => u.partners.includes('proband'));
    expect(S().doc.graph.individuals.find((i) => i.id === added.partners.find((p) => p !== 'proband')).sex).toBe('female');
    await settle(() => { S().resetPedigree(); allow(true); });
    await click(drawn('proband'));
    await click(sector('Eş'));
    const choices = [...$('.radial-flyout').querySelectorAll('.quick-btn')].map((b) => b.getAttribute('aria-label'));
    expect(choices).toEqual(['Eş: Erkek', 'Eş: Kadın']);
    expect(S().doc.graph.unions.some((u) => u.partners.includes('proband'))).toBe(false); // nothing added yet
    await click($('.radial-flyout').querySelector('[aria-label="Eş: Erkek"]'));
    const u = S().doc.graph.unions.find((x) => x.partners.includes('proband'));
    expect(S().doc.graph.individuals.find((i) => i.id === u.partners.find((p) => p !== 'proband')).sex).toBe('male');
  });

  it('Çocuk of two men: no plain child, only the egg donor or surrogate and adopted rows; the child comes with its donor', async () => {
    await settle(() => { allow(true); S().addSpouseTo('proband', 'male'); });
    await click(drawn('proband'));
    await click(sector('Çocuk'));
    const fly = $('.radial-flyout');
    expect(fly.textContent).toMatch(/İki erkek eşin çocuğu/);
    expect([...fly.querySelectorAll('.quick-btn')].some((b) => b.getAttribute('aria-label') === 'Çocuk: Erkek')).toBe(false);
    expect([...fly.querySelectorAll('.flyout-art .quick-text')].map((b) => b.textContent)).toEqual(['Yumurta donörü', 'Taşıyıcı anne']);
    expect(fly.textContent).toMatch(/Evlat edinilmiş/);
    await click([...fly.querySelectorAll('.flyout-art .quick-text')].find((b) => b.textContent === 'Taşıyıcı anne'));
    const boy = [...$('.radial-flyout').querySelectorAll('.flyout-art .quick-btn')].find((b) => /erkek/.test(b.getAttribute('aria-label')));
    await click(boy);
    const child = S().doc.graph.individuals.find((i) => i.relation === 'child_direct');
    expect(child).toBeTruthy();
    expect(S().doc.graph.reproductiveLinks.some((l) => l.childId === child.id && l.role === 'surrogate')).toBe(true);
  });

  it('Ayarlar → Çizim has the switch, off at first', async () => {
    await click([...view.container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Ayarlar' || b.textContent.trim() === 'Ayarlar'));
    const dialog = document.querySelector('.settings-dialog');
    await click([...dialog.querySelectorAll('[role="tab"]')].find((b) => b.textContent.includes('Çizim')));
    const row = [...dialog.querySelectorAll('.set-row')].find((r) => r.textContent.includes('Aynı cinsiyetten eşler'));
    const sw = row.querySelector('input[type="checkbox"], [role="switch"]');
    expect(sw.checked ?? sw.getAttribute('aria-checked') === 'true').toBe(false);
    await click(sw);
    expect(useViewSettings.getState().view.sameSexPartners).toBe(true);
    await settle(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  });
});
