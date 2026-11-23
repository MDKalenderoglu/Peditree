/**
 * clinicalNoticesPlain.test.js — the warnings panel never shows a developer's
 * note (2026-11-23: "Unions 'I-1 ile I-2' and 'I-3 ile I-4' draw overlapping
 * child-connector rails at the same height …" was shown in the Turkish
 * screens). Broken families and broken drawings are fed to the real audits
 * (graphIntegrity.js, layoutIntegrity.js); every issue they raise reaches the
 * clinician in plain words, naming people by pedigree number, in the screens'
 * language, and saying what to do.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { auditPedigreeGraph } from '../utils/graphIntegrity';
import { auditLayoutIntegrity } from '../utils/layoutIntegrity';
import { clinicalNotices } from '../utils/clinicalNotices';
import { useLang } from '../i18n';

const person = (id, sex, generation, x, y) => ({ id, sex, generation, x, y, label: '', displayLabel: '' });
const U = (id, a, b) => ({ id, partners: [a, b], status: 'together', consanguineous: false, consanguinityStatus: 'none', relationshipBackground: 'not_asked' });

// two couples on one row whose children stand interleaved, a stranger over a sibship line, a
// line through someone, a person not drawn, two people on one place, partners on two rows
function brokenFamily() {
  const people = [
    person('f1', 'male', 1, 0, 0), person('m1', 'female', 1, 70, 0),
    person('f2', 'male', 1, 300, 0), person('m2', 'female', 1, 370, 0),
    person('stranger', 'female', 1, 160, 0),
    person('c1', 'male', 2, 0, 160), person('c2', 'female', 2, 200, 160),
    person('d1', 'male', 2, 100, 160), person('d2', 'female', 2, 400, 160),
    person('lost', 'male', 2, 600, 160), person('twin', 'male', 2, 400, 160),
    person('self', 'male', 1, 700, 0),
    person('h', 'male', 1, 1100, 0), person('w', 'female', 1, 1170, 0),
  ];
  const unions = [U('u1', 'f1', 'm1'), U('u2', 'f2', 'm2'), U('u3', 'self', 'self'), U('u4', 'c1', 'ghost'), U('u5', 'h', 'w')];
  const pcrs = [
    { unionId: 'u1', children: ['c1', 'c2', 'lost'] },
    { unionId: 'u2', children: ['d1', 'd2', 'c2'] }, // c2 under two couples
  ];
  const graph = { individuals: [...people, person('dup', 'male', 1, 900, 0), person('dup', 'male', 1, 950, 0)], unions, parentChildRelationships: pcrs, socialParentLinks: [] };
  const nodes = people.filter((p) => p.id !== 'lost').map((p) => ({ ...p }));
  nodes.find((n) => n.id === 'w').y = 40; // partners on two rows
  const edges = [
    { type: 'union', unionId: 'u1', x1: 0, y1: 0, x2: 70, y2: 0 },
    { type: 'union', unionId: 'u2', x1: 0, y1: 0, x2: 370, y2: 0 }, // runs through f1, m1, stranger
    { type: 'union', unionId: 'u4', x1: NaN, y1: 0, x2: 10, y2: 0 },
  ];
  return { graph, layout: { nodes, edges } };
}

const DEVELOPER = /\b(Union|Unions|Individual|union|partners|rails|child fan|layout node|parentChildRelationship|references|metadata|generation \d)\b|'[a-z]+\d*'/;

describe('the warnings panel speaks plainly', () => {
  afterEach(() => useLang.getState().setLang({ ui: 'tr', drawing: 'same' }));

  const noticesFor = () => {
    const { graph, layout } = brokenFamily();
    const issues = [...auditPedigreeGraph(graph), ...auditLayoutIntegrity(layout, graph)];
    const wrap = (sev) => issues.filter((i) => i.severity === sev).map((item, k) => ({ item, _warningId: `${sev}${k}` }));
    const notices = clinicalNotices({ errorIssues: wrap('error'), warningIssues: wrap('warning') }, { ...graph, nodes: layout.nodes });
    return { issues, notices };
  };

  it('every issue the audits raise on a broken family and drawing reads as plain Turkish, never a developer\'s note', () => {
    const { issues, notices } = noticesFor();
    const codes = new Set(issues.map((i) => i.code));
    // the broken family really raises the reported ones and more
    for (const c of ['SIBSHIP_BUS_OVERLAP', 'UNRELATED_NODE_IN_CHILD_FOOTPRINT', 'EDGE_THROUGH_NODE', 'MISSING_LAYOUT_NODE', 'DUPLICATE_NODE_POSITION', 'PARTNER_Y_MISMATCH', 'CHILD_MULTI_UNION', 'UNION_SELF_PARTNER', 'UNION_PARTNER_MISSING', 'DUPLICATE_INDIVIDUAL_ID']) {
      expect(codes, c).toContain(c);
    }
    expect(notices.length).toBeGreaterThan(5);
    for (const n of notices) expect(n.text, n.text).not.toMatch(DEVELOPER);
    const overlap = notices.find((n) => /üst üste biniyor; hangi çocuğun/.test(n.text));
    expect(overlap.text).toMatch(/Konumlandır/);
    expect(notices.some((n) => /çocuklarını gösteren çizginin tam üstünde duruyor/.test(n.text))).toBe(true);
  });

  it('in the English screens the same issues read as plain English', () => {
    useLang.getState().setLang({ ui: 'en', drawing: 'same' });
    const { notices } = noticesFor();
    for (const n of notices) {
      expect(n.text, n.text).not.toMatch(DEVELOPER);
      expect(n.text, n.text).not.toMatch(/[çğışöüÇĞİŞÖÜ]/);
    }
    expect(notices.some((n) => /run over each other at one height/.test(n.text))).toBe(true);
  });
});
