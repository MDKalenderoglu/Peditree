/**
 * hostileFiles.test.js — "Aç" with a broken or hostile file (security review
 * 2026-11-01): it is refused with a reason or opened harmlessly; the open
 * pedigree is never left broken, and nothing outside the drawing changes.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { usePedigreeStore } from '../state/usePedigreeStore';
import { parseProjectFile, serializeDocument } from '../graph/persistenceV2';
import { fromPed } from '../graph/ped';

beforeAll(() => { ['log', 'warn', 'table', 'info', 'error'].forEach(k => vi.spyOn(console, k).mockImplementation(() => {})); });
const S = () => usePedigreeStore.getState();
const fileOf = () => JSON.parse(serializeDocument(S().doc));

describe('a hostile project file', () => {
  it('is refused, not thrown, when it is not a pedigree', () => {
    for (const text of ['', 'null', '[]', '42', '"x"', '{', '{"schemaVersion":2}', '{"schemaVersion":2,"graph":null}', '['.repeat(100000)]) {
      const r = parseProjectFile(text);
      expect(r.ok).toBe(false);
      expect(typeof r.reason).toBe('string');
    }
  });

  it('cannot change Object.prototype (__proto__ keys)', () => {
    S().resetPedigree();
    const text = serializeDocument(S().doc).replace(/^\{/, '{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}},');
    S().openProjectFile(text);
    const withPerson = fileOf();
    withPerson.graph.individuals[0] = { ...withPerson.graph.individuals[0], __proto__: { polluted: 1 } };
    S().openProjectFile(JSON.stringify(withPerson).replace('"id"', '"__proto__":{"polluted":1},"id"'));
    expect({}.polluted).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();
  });

  it('a person who is their own ancestor is refused; the open pedigree stays', () => {
    S().resetPedigree();
    const before = S().doc;
    const f = fileOf();
    // a grandparent is also a child of the proband's parents: a loop of descent
    const pcl = (child) => f.graph.parentChildRelationships.find(p => p.children.includes(child));
    const parent = f.graph.unions.find(u => u.id === pcl('proband').unionId).partners[0];
    const grand = f.graph.unions.find(u => u.id === pcl(parent).unionId).partners[0];
    pcl('proband').children.push(grand);
    const r = S().openProjectFile(JSON.stringify(f));
    expect(r.ok).toBe(false);
    expect(parseProjectFile(JSON.stringify(f)).reason).toMatch(/kendi atası/);
    expect(S().doc).toBe(before);
  });

  it('two people with one id, or a child of two biological couples, are refused', () => {
    S().resetPedigree();
    const dup = fileOf();
    dup.graph.individuals.push({ ...dup.graph.individuals[0] });
    expect(parseProjectFile(JSON.stringify(dup)).ok).toBe(false);
    const twoParents = fileOf();
    const other = twoParents.graph.parentChildRelationships.find(p => !p.children.includes('proband'));
    other.children.push('proband');
    expect(parseProjectFile(JSON.stringify(twoParents)).ok).toBe(false);
  });

  it('a file over 20 MB is refused before it is read', () => {
    expect(parseProjectFile(' '.repeat(20 * 1024 * 1024 + 1)).ok).toBe(false);
  });

  it('script-like text stays text: names and notes are drawn with .text(), never as HTML', () => {
    S().resetPedigree();
    const f = fileOf();
    const evil = '<img src=x onerror=alert(1)><script>alert(1)</script>';
    f.patientName = evil;
    f.graph.individuals[0].displayLabel = evil;
    f.graph.individuals[0].notes = evil;
    const r = S().openProjectFile(JSON.stringify(f));
    expect(r.ok).toBe(true);
    expect(S().doc.graph.individuals[0].notes).toBe(evil); // kept as the clinician's text
    const sources = ['src/components/PedigreeCanvas.jsx', 'src/App.jsx', 'src/components/IndividualEditor.jsx', 'src/utils/exportUtils.js', 'src/utils/drawingStyleSvg.js']
      .map(p => readFileSync(join(process.cwd(), p), 'utf8')).join('\n');
    expect(sources).not.toMatch(/\.html\(|innerHTML|dangerouslySetInnerHTML|insertAdjacentHTML|document\.write/);
  });
});

describe('a hostile PED file', () => {
  it('is refused, not thrown, when it is broken', () => {
    for (const text of ['', '\n\n', 'a b', 'F 1 2 3 4 5\n', 'F 1 0 0 9 1', 'F 1 0 0 1 1\nF 1 0 0 2 1']) {
      const r = fromPed(text);
      expect(typeof r.ok).toBe('boolean');
      if (!r.ok) expect(typeof r.reason).toBe('string');
    }
  });

  it('a person who is their own ancestor is refused', () => {
    const text = ['F A B C 1 1', 'F B A C 1 1', 'F C 0 0 2 1'].join('\n');
    expect(fromPed(text)).toMatchObject({ ok: false, reason: expect.stringMatching(/kendi atası/) });
  });

  it('cannot change Object.prototype through its ids', () => {
    fromPed(['F __proto__ 0 0 1 1', 'F constructor 0 0 2 1', 'F x __proto__ constructor 1 2'].join('\n'));
    expect({}.polluted).toBeUndefined();
    expect(Object.prototype.toString).toBe(Object.prototype.toString);
    expect(typeof {}.constructor).toBe('function');
  });
});
