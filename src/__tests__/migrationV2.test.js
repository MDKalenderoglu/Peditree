/**
 * migrationV2.test.js — schema 1 → 2 migration and v2 persistence
 * (docs/PEDITREE_DATA_MODEL_V2.md §2.4). Requirement: saved pedigrees move
 * to the new schema without losing any edit, and save → load → edit → save
 * keeps every semantic relationship.
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { useV1Store } from './support/v1Store';
import { migrateV1ToV2, semanticDiff } from '../graph/migrate';
import * as ops from '../graph/ops';
import {
  loadDocument, saveDocument, clearAllSessions, serializeDocument, parseProjectFile,
  STORAGE_KEY_V2, V1_BACKUP_KEY,
} from '../graph/persistenceV2';
import { STORAGE_KEY as V1_KEY } from '../utils/persistence';
import { makeRng, seedToInt } from '../audit/prng.js';
import { resetModel, chooseOp, applyOp, setFuzzStore } from '../audit/fuzzModel.js';

beforeAll(() => {
  ['log', 'table', 'warn', 'info'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {}));
});

// v1 sessions come from the frozen schema-1 store (test support)
const S = () => useV1Store.getState();
const shownGraph = () => ({
  individuals: S().pedigreeData.individuals,
  unions: S().pedigreeData.unions,
  parentChildRelationships: S().pedigreeData.parentChildRelationships,
  socialParentLinks: [],
});
const withoutPolicy = (g) => ({ ...g, parentChildRelationships: g.parentChildRelationships.map(({ orderPolicy, ...r }) => r) }); // eslint-disable-line no-unused-vars
const person = (doc, id) => doc.graph.individuals.find(i => i.id === id);

/** A v1 session that uses every v1 overlay mechanism, built through the v1 store. */
function richV1Session() {
  S().resetPedigree();
  S().updateSiblingCount('male', 2);
  S().updateSiblingCount('female', 1);
  S().updateRelativeCount('maternalRelatives', 'uncles', 1);
  S().updateRelativeChildren('maternalRelatives', 'uncles', 0, 'female', 2);
  S().updateRelativeCount('paternalRelatives', 'aunts', 1);
  S().updateIndividual('mother', { affected: true, displayLabel: 'Ayşe', notes: 'tip 2 DM', age: '52' });
  S().updateIndividual('sib_m_1', { carrier: true, conditions: [{ id: 'c1', label: 'Talasemi' }] });
  S().addSpouseTo('proband', 'female');
  const spouse = S().pedigreeData.unions.find(u => u.partners.includes('proband')).partners.find(p => p !== 'proband');
  S().addParentsTo(spouse, {});
  const pu = S().pedigreeData.unions.find(u => u.partners.includes('proband')).id;
  S().addChildToUnion(pu, 'male');
  S().addChildToUnion(pu, 'female');
  S().createUnionBetween('sib_m_0', 'mat_uncle_0_cf_0', { markConsanguineous: true });
  S().reorderChild('U_PAT_GP', 'father', 'right');
  S().deleteIndividual('sib_f_0');
  S().setUnionRelationshipBackground('U_PARENTS', 'same_village_or_same_origin');
  S().setProband('mother');
  return S().wizardData;
}

describe('migrateV1ToV2', () => {
  it('a v1 session using every overlay migrates to the graph the clinician saw', () => {
    const wd = richV1Session();
    const r = migrateV1ToV2(wd);
    expect(r.ok).toBe(true);
    expect(r.normalizations).toEqual([]);
    expect(semanticDiff(withoutPolicy(shownGraph()), withoutPolicy(r.doc.graph))).toEqual([]);

    const doc = r.doc;
    expect(person(doc, 'mother')).toMatchObject({ affected: true, displayLabel: 'Ayşe', notes: 'tip 2 DM', age: '52', proband: true });
    expect(person(doc, 'sib_m_1').conditions).toEqual([{ id: 'c1', label: 'Talasemi' }]);
    expect(person(doc, 'sib_f_0')).toBeUndefined();
    expect(doc.ids.retired).toContain('sib_f_0');
    expect(doc.graph.parentChildRelationships.find(x => x.unionId === 'U_PAT_GP').birthOrderExplicit).toBe(true);
    expect(doc.graph.unions.find(u => u.id === 'U_PARENTS').relationshipBackground).toBe('same_village_or_same_origin');
    const link = doc.graph.unions.find(u => u.partners.includes('sib_m_0') && u.partners.includes('mat_uncle_0_cf_0'));
    expect(link.consanguinityStatus).toBe('known_supported');
    expect(doc.provenance.migratedFrom).toBe(1);
    expect(doc.provenance.v1Snapshot.manualEdits.mother.displayLabel).toBe('Ayşe');
  });

  it('the proband sibship is age-ordered; groups v1 never sorted keep their order', () => {
    const r = migrateV1ToV2(richV1Session());
    const pol = Object.fromEntries(r.doc.graph.parentChildRelationships.map(x => [x.unionId, x.orderPolicy]));
    expect(pol.U_PARENTS).toBe('byAge');
    expect(pol.U_MAT_UNCLE_0).toBe('byAge');
    expect(pol.U_MAT_GP).toBe('insertion');
  });

  it('new ids continue after v1 ids and never reuse deleted ones', () => {
    const wd = richV1Session();
    const r = migrateV1ToV2(wd);
    const add = ops.addPartner(r.doc, 'sib_m_1', { sex: 'female' });
    expect(add.ok).toBe(true);
    const n = Number(add.created.spouseId.match(/\d+$/)[0]);
    expect(n).toBeGreaterThanOrEqual(wd.editSeq);
    const sib = ops.addSibling(add.doc, 'proband', { sex: 'female' });
    expect(sib.ok).toBe(true);
    expect(sib.doc.graph.individuals.some(i => i.id === 'sib_f_0')).toBe(false);
  });

  it('random v1 editing sessions migrate with no normalization and no loss', () => {
    const prev = process.env.PEDITREE_PACKER;
    process.env.PEDITREE_PACKER = 'legacy'; // fast v1 rebuilds while generating states
    setFuzzStore(useV1Store);
    try {
      let checked = 0;
      for (let c = 0; c < 120; c++) {
        const rng = makeRng(seedToInt('mig-v2-' + c));
        resetModel();
        for (let s = 0; s < 14; s++) {
          let op = null;
          for (let k = 0; k < 6 && !op; k++) op = chooseOp(rng);
          if (op) applyOp(op);
        }
        const r = migrateV1ToV2(S().wizardData);
        expect(r.ok).toBe(true);
        expect(r.normalizations).toEqual([]);
        // Only known v1 data loss may differ (DM-13: v1 drops clinical
        // edits made on an "unspecified parent" placeholder on reload).
        const diffs = semanticDiff(withoutPolicy(shownGraph()), withoutPolicy(r.doc.graph))
          .filter(d => !/^kişi \S+__unspecified:/.test(d));
        expect(diffs).toEqual([]);
        checked++;
      }
      expect(checked).toBe(120);
    } finally {
      setFuzzStore(null);
      if (prev === undefined) delete process.env.PEDITREE_PACKER; else process.env.PEDITREE_PACKER = prev;
    }
  }, 120000);
});

describe('v2 persistence', () => {
  let store;
  beforeEach(() => {
    store = new Map();
    globalThis.window = {
      localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
      },
    };
  });
  afterEach(() => { delete globalThis.window; });

  it('first start: the v1 session is migrated, saved as v2 and moved to a backup', () => {
    const wd = richV1Session();
    const v1Raw = JSON.stringify({ schemaVersion: 1, savedAt: '2026-10-01T00:00:00.000Z', wizardData: wd });
    store.set(V1_KEY, v1Raw);
    const first = loadDocument();
    expect(first.source).toBe('migrated-v1');
    expect(store.has(STORAGE_KEY_V2)).toBe(true);
    expect(store.get(V1_BACKUP_KEY)).toBe(v1Raw);
    expect(store.has(V1_KEY)).toBe(false);
    const second = loadDocument();
    expect(second.source).toBe('v2');
    expect(semanticDiff(second.doc.graph, first.doc.graph)).toEqual([]);
  });

  it('an unreadable v2 entry never crashes and never touches other data', () => {
    store.set(STORAGE_KEY_V2, '{nope');
    store.set(V1_BACKUP_KEY, 'keep');
    const r = loadDocument();
    expect(r.doc).toBe(null);
    expect(r.notice).toMatch(/okunamadı/);
    expect(store.get(V1_BACKUP_KEY)).toBe('keep');
  });

  it('a v1 session that cannot be migrated stays where it was', () => {
    store.set(V1_KEY, JSON.stringify({ schemaVersion: 1, wizardData: { foo: 1 } }));
    const r = loadDocument();
    expect(store.has(V1_KEY)).toBe(true);
    expect(r.doc).toBe(null);
    expect(r.notice).toMatch(/tanınmadı/);
    expect(store.has(STORAGE_KEY_V2)).toBe(false);
  });

  it('"new pedigree" clears every saved version', () => {
    store.set(STORAGE_KEY_V2, '{}'); store.set(V1_KEY, '{}'); store.set(V1_BACKUP_KEY, '{}');
    clearAllSessions();
    expect(store.size).toBe(0);
  });

  it('save → load → edit → save → load keeps every relationship (project file)', () => {
    const doc0 = migrateV1ToV2(richV1Session()).doc;
    const f1 = parseProjectFile(serializeDocument(doc0));
    expect(f1.ok).toBe(true);
    expect(semanticDiff(f1.doc.graph, doc0.graph)).toEqual([]);
    const edited = ops.addSibling(f1.doc, 'proband', { sex: 'male' });
    expect(edited.ok).toBe(true);
    const f2 = parseProjectFile(serializeDocument(edited.doc));
    expect(f2.ok).toBe(true);
    expect(semanticDiff(f2.doc.graph, edited.doc.graph)).toEqual([]);
    expect(f2.doc.ids).toEqual(edited.doc.ids);
    expect(saveDocument(f2.doc)).toBe(true);
    expect(semanticDiff(loadDocument().doc.graph, edited.doc.graph)).toEqual([]);
  });

  it('opening a v1 file migrates it; foreign or broken files are refused', () => {
    const wd = richV1Session();
    const r = parseProjectFile(JSON.stringify({ schemaVersion: 1, wizardData: wd }));
    expect(r.ok).toBe(true);
    expect(r.migrated).toBe(true);
    expect(parseProjectFile('{"hello":1}').ok).toBe(false);
    expect(parseProjectFile('not json').ok).toBe(false);
    const broken = JSON.parse(serializeDocument(r.doc));
    broken.graph.parentChildRelationships.push({ unionId: 'U_PARENTS', children: ['father'] });
    expect(parseProjectFile(JSON.stringify(broken)).ok).toBe(false);
  });
});
