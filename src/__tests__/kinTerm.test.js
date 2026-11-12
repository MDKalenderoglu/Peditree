/**
 * kinTerm.test.js — what each person is to the proband, in the clinic's words
 * (clinician request 2026-11-11): read from the drawing built with the real
 * operations, Turkish and English.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { kinTerm, genitiveTr } from '../graph/kinTerm';

beforeAll(() => { ['log', 'warn', 'table', 'info'].forEach((k) => vi.spyOn(console, k).mockImplementation(() => {})); });
beforeEach(() => S().resetPedigree());
const S = () => usePedigreeStore.getState();
const g = () => S().doc.graph;
const term = (id, lang = 'tr') => kinTerm(g(), id, lang);
const newest = (before) => g().individuals.map((i) => i.id).filter((id) => !before.includes(id));
const add = (fn) => { const before = g().individuals.map((i) => i.id); fn(); return newest(before); };

describe('Turkish names, from the proband', () => {
  it('parents and grandparents, by side', () => {
    expect(term('mother')).toBe('Anne');
    expect(term('father')).toBe('Baba');
    expect(term('mat_gm')).toBe('Anneanne');
    expect(term('pat_gm')).toBe('Babaanne');
    expect(term('mat_gf')).toBe('Dede (anne tarafı)');
    expect(term('pat_gf')).toBe('Dede (baba tarafı)');
    expect(term('proband')).toBe(null);
  });

  it('uncles and aunts: amca, hala on the father’s side; dayı, teyze on the mother’s', () => {
    S().updateRelativeCount('paternalRelatives', 'uncles', 1);
    S().updateRelativeCount('paternalRelatives', 'aunts', 1);
    S().updateRelativeCount('maternalRelatives', 'uncles', 1);
    S().updateRelativeCount('maternalRelatives', 'aunts', 1);
    const w = S().wizardData;
    expect(term(w.paternalRelatives.uncles[0].id)).toBe('Amca');
    expect(term(w.paternalRelatives.aunts[0].id)).toBe('Hala');
    expect(term(w.maternalRelatives.uncles[0].id)).toBe('Dayı');
    expect(term(w.maternalRelatives.aunts[0].id)).toBe('Teyze');
  });

  it('first cousins with their way (teyze kızı, amca oğlu), the degree for further cousins', () => {
    S().updateRelativeCount('maternalRelatives', 'aunts', 1);
    S().updateRelativeCount('paternalRelatives', 'uncles', 1);
    const aunt = S().wizardData.maternalRelatives.aunts[0].id;
    const uncle = S().wizardData.paternalRelatives.uncles[0].id;
    const [auntPartner] = add(() => S().addSpouseTo(aunt, 'male'));
    const uAunt = g().unions.find((u) => u.partners.includes(aunt) && u.partners.includes(auntPartner));
    const [girl] = add(() => S().addChildToUnion(uAunt.id, 'female'));
    const [unclePartner] = add(() => S().addSpouseTo(uncle, 'female'));
    const uUncle = g().unions.find((u) => u.partners.includes(uncle) && u.partners.includes(unclePartner));
    const [boy] = add(() => S().addChildToUnion(uUncle.id, 'male'));
    expect(term(girl)).toBe('1. derece kuzen (teyze kızı)');
    expect(term(boy)).toBe('1. derece kuzen (amca oğlu)');
    expect(term(auntPartner)).toBe('Teyzenin eşi');
    expect(term(unclePartner)).toBe('Amcanın eşi');
    // the cousin's child: once removed
    const [cp] = add(() => S().addSpouseTo(girl, 'male'));
    const uc = g().unions.find((u) => u.partners.includes(girl) && u.partners.includes(cp));
    const [cc] = add(() => S().addChildToUnion(uc.id, 'male'));
    expect(term(cc)).toBe('1. derece kuzenin çocuğu (anne tarafı)');
  });

  it('siblings, half siblings, nieces, children, grandchildren, the partner and the partner’s parents', () => {
    S().addSiblingOfCategory('female');
    const sister = S().wizardData.siblings.female[0].id;
    expect(term(sister)).toBe('Kız kardeş');
    const [sp] = add(() => S().addSpouseTo(sister, 'male'));
    const us = g().unions.find((u) => u.partners.includes(sister) && u.partners.includes(sp));
    const [niece] = add(() => S().addChildToUnion(us.id, 'female'));
    expect(term(niece)).toBe('Yeğen (kız)');
    expect(term(sp)).toBe('Kız kardeşin eşi');
    // the mother's other partner and their son: the proband's half brother
    const [step] = add(() => S().addSpouseTo('mother', 'male'));
    expect(term(step)).toBe('Annenin eşi');
    const um = g().unions.find((u) => u.partners.includes('mother') && u.partners.includes(step));
    const [half] = add(() => S().addChildToUnion(um.id, 'male'));
    expect(term(half)).toBe('Anne bir erkek kardeş');
    // the proband's own family
    const [wife] = add(() => S().addSpouseTo('proband', 'female'));
    expect(term(wife)).toBe('Eşi');
    const uw = g().unions.find((u) => u.partners.includes('proband') && u.partners.includes(wife));
    const [son] = add(() => S().addChildToUnion(uw.id, 'male'));
    expect(term(son)).toBe('Oğlu');
    const [dil] = add(() => S().addSpouseTo(son, 'female'));
    const ud = g().unions.find((u) => u.partners.includes(son) && u.partners.includes(dil));
    const [gc] = add(() => S().addChildToUnion(ud.id, 'female'));
    expect(term(gc)).toBe('Torunu');
    expect(term(dil)).toBe('Oğlunun eşi');
    const added = add(() => S().addParentsTo(wife));
    const mil = added.find((id) => g().individuals.find((i) => i.id === id).sex === 'female');
    expect(term(mil)).toBe('Eşinin annesi');
  });

  it('a great-uncle: named from the parent (Annenin amcası); great-grandparents', () => {
    S().updateRelativeCount('maternalGPRelatives', 'uncles', 1);
    const gu = S().wizardData.maternalGPRelatives.uncles[0].id;
    expect(term(gu)).toBe('Annenin amcası');
    const ggp = g().individuals.find((i) => i.sex === 'female' && (g().parentChildRelationships.find((r) => r.children.includes('mat_gf')) || { unionId: '' }).unionId
      && g().unions.find((u) => u.id === g().parentChildRelationships.find((r) => r.children.includes('mat_gf')).unionId).partners.includes(i.id));
    expect(term(ggp.id)).toBe('Dedenin annesi (anne tarafı)');
  });

  it('nobody to name without a proband or consultand; the consultand stands in for a missing proband', () => {
    S().addSiblingOfCategory('male');
    const brother = S().wizardData.siblings.male[0].id;
    const gr = JSON.parse(JSON.stringify(g()));
    gr.individuals.forEach((i) => { i.proband = false; });
    expect(kinTerm(gr, 'mother', 'tr')).toBe(null);
    gr.individuals.find((i) => i.id === brother).consultand = true;
    expect(kinTerm(gr, 'mat_gm', 'tr')).toBe('Anneanne');
    expect(kinTerm(gr, 'proband', 'tr')).toBe('Erkek kardeş');
  });

  it('the Turkish genitive follows vowel harmony', () => {
    expect(['Anne', 'Baba', 'Amca', 'Dayı', 'Kızı', 'Oğlu', 'Torunu', '1. derece kuzen', 'Kız kardeş', 'Dede'].map(genitiveTr))
      .toEqual(['Annenin', 'Babanın', 'Amcanın', 'Dayının', 'Kızının', 'Oğlunun', 'Torununun', '1. derece kuzenin', 'Kız kardeşin', 'Dedenin']);
  });
});

describe('assisted reproduction (Codex audit 2026-11-12)', () => {
  it('a brother conceived with a sperm donor is a half brother by the mother; the donor is named; the drawn father is not his genetic father', () => {
    S().addSiblingOfCategory('male');
    const brother = S().wizardData.siblings.male[0].id;
    const [donor] = add(() => S().addReproductiveLink(brother, 'sperm_donor'));
    expect(term(brother)).toBe('Anne bir erkek kardeş');
    expect(term(brother, 'en')).toBe('Half-brother (same mother)');
    expect(term(donor)).toBe('Sperm donörü (anne bir erkek kardeş için)');
    expect(term(donor, 'en')).toBe('Sperm donor (for the half-brother (same mother))');
    // the father is still the proband's own father
    expect(term('father')).toBe('Baba');
  });
  it('the proband conceived with a sperm donor: the drawn father is the father, not genetically related', () => {
    const [donor] = add(() => S().addReproductiveLink('proband', 'sperm_donor'));
    expect(term('father')).toBe('Baba (genetik bağ yok)');
    expect(term('father', 'en')).toBe('Father (not genetically related)');
    expect(term(donor)).toBe('Sperm donörü');
    expect(term('mother')).toBe('Anne');
  });
});

describe('English names', () => {
  it('NSGC terms', () => {
    S().updateRelativeCount('maternalRelatives', 'aunts', 1);
    S().addSiblingOfCategory('female');
    const aunt = S().wizardData.maternalRelatives.aunts[0].id;
    expect(term('mat_gm', 'en')).toBe('Maternal grandmother');
    expect(term('pat_gf', 'en')).toBe('Paternal grandfather');
    expect(term(aunt, 'en')).toBe('Maternal aunt');
    expect(term(S().wizardData.siblings.female[0].id, 'en')).toBe('Sister');
    const [p] = add(() => S().addSpouseTo(aunt, 'male'));
    const u = g().unions.find((x) => x.partners.includes(aunt) && x.partners.includes(p));
    const [c] = add(() => S().addChildToUnion(u.id, 'male'));
    expect(term(c, 'en')).toBe('First cousin (maternal aunt’s son)');
    expect(term(p, 'en')).toBe('Maternal aunt’s partner');
  });
});
