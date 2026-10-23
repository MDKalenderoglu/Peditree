/**
 * v0_3a_1_round2.test.js — reviewer-requested compliance fixes:
 *   1. reported_unresolved consanguinity must still render as a DOUBLE
 *      union line (previously rendered as a single line).
 *   2. "Kardeş Yap" (make siblings) must not silently no-op when both
 *      individuals already have different existing parent unions — it
 *      must be blocked/deferred with a clear reason instead.
 *
 * Note on rendering-level coverage: this repo's vitest environment is
 * 'node', not 'jsdom' (no DOM/SVG render harness — see
 * PEDIGREE_NEXT_IMPLEMENTATION_PLAN.md's acknowledgment of the same
 * constraint for v0.3a). PedigreeCanvas.jsx cannot be executed and
 * inspected as live SVG here. Two things are done instead, deliberately:
 *   (a) layout-level tests confirm the DATA that drives rendering
 *       (edge.type, and that no ancestor/PCR structure is fabricated);
 *   (b) a source-level static check on PedigreeCanvas.jsx's own edge-draw
 *       code confirms the 'consanguineousUnionUnresolved' branch appends
 *       two <line> elements (a real double line), matching the
 *       'consanguineousUnion' branch's line count — so a future edit that
 *       silently collapses it back to one line fails this test immediately.
 * The "SVG export contains the double line" requirement is structural by
 * construction (exportUtils.js serializes the live <svg> DOM verbatim, with
 * no element filtering) and was additionally confirmed by manual browser
 * verification in the prior turn (consanguinity edges and the condition
 * legend both live inside the same <svg id="pedigree-svg"> node that
 * serializeSvg() serializes) — that manual check is not repeated here.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildPedigreeFromWizard } from '../builder/pedigreeBuilderFromWizard';
import { auditPedigreeGraph } from '../utils/graphIntegrity';
import { computePedigreeLayout } from '../utils/pedigreeLayout';
import { baseState } from './helpers';
import {
  usePedigreeStore,
  computeSiblingCreationPlan,
} from '../state/usePedigreeStore';

const __dirname = dirname(fileURLToPath(import.meta.url));

function assertZeroErrors(issues) {
  expect(issues.filter(i => i.severity === 'error')).toHaveLength(0);
}

describe('v0.3a.1 round 2 → v0.3a.3 — consanguinity renders as a plain solid black double line, no text, no color distinction', () => {
  const canvasSource = readFileSync(
    join(__dirname, '../components/PedigreeCanvas.jsx'),
    'utf-8'
  );

  // v0.3a.3: consanguineousUnion and consanguineousUnionUnresolved are now
  // a SINGLE shared case block (fall-through) — both edge types render
  // identically. Locate that shared block by its two case labels.
  function getSharedConsanguinityBlock(source) {
    const caseStart = source.indexOf("case 'consanguineousUnion':");
    expect(caseStart).toBeGreaterThan(-1);
    const secondLabelStart = source.indexOf("case 'consanguineousUnionUnresolved':", caseStart);
    expect(secondLabelStart).toBeGreaterThan(caseStart);
    // The two case labels must be adjacent (fall-through), with nothing but
    // whitespace/the label itself between them.
    const between = source.slice(caseStart + "case 'consanguineousUnion':".length, secondLabelStart);
    expect(between.trim()).toBe('');
    const nextCaseStart = source.indexOf("case '", secondLabelStart + 1);
    return source.slice(secondLabelStart, nextCaseStart === -1 ? undefined : nextCaseStart);
  }

  it('consanguineousUnion and consanguineousUnionUnresolved share the same rendering block (fall-through, no visual distinction)', () => {
    // Asserted via getSharedConsanguinityBlock's own internal expectations.
    expect(() => getSharedConsanguinityBlock(canvasSource)).not.toThrow();
  });

  it('the shared consanguinity block draws exactly two solid strokes (a double line)', () => {
    // v0.5 Faz 3: strokes are drawn through drawStroke() (a path, so a
    // crossing can carry a line-jump arc). The double line is two strokes
    // offset perpendicular to the segment — one pair per orientation branch.
    const block = getSharedConsanguinityBlock(canvasSource);
    const branches = block.split(/\belse\b/);
    expect(branches.length).toBe(2);
    for (const branch of branches) {
      expect((branch.match(/drawStroke\(g, edge/g) || []).length).toBe(2);
    }
  });

  it('the shared consanguinity block never uses stroke-dasharray (no dashed line)', () => {
    const block = getSharedConsanguinityBlock(canvasSource);
    expect(block).not.toMatch(/stroke-dasharray/);
  });

  it('the shared consanguinity block never uses the amber color or any non-standard edge color', () => {
    const block = getSharedConsanguinityBlock(canvasSource);
    expect(block).not.toContain('#d97706');
  });

  it('the shared consanguinity block never appends text (no canvas label of any kind)', () => {
    const block = getSharedConsanguinityBlock(canvasSource);
    expect(block).not.toMatch(/g\.append\('text'\)/);
    expect(block).not.toContain('Akrabalık bildirildi');
    expect(block).not.toContain('? akrabalık');
  });

  it('the plain "union" case (non-consanguinity backgrounds) never appends text either', () => {
    const caseStart = canvasSource.indexOf("case 'union':");
    const nextCaseStart = canvasSource.indexOf("case '", caseStart + 1);
    const block = canvasSource.slice(caseStart, nextCaseStart);
    expect(block).not.toMatch(/g\.append\('text'\)/);
    expect(block).not.toContain('köy');
    expect(block).not.toContain('bölge');
  });

  it('no relationship-line edge type (union/consanguineous/sibship/drop/stem/slash) ever appends text — generic scan of the whole edges.forEach switch', () => {
    const switchStart = canvasSource.indexOf('edges.forEach(edge => {');
    const switchEnd = canvasSource.indexOf('\n    });', switchStart);
    const wholeSwitch = canvasSource.slice(switchStart, switchEnd);
    // The only text this switch may ever produce is none at all — labels
    // like individual names/ages/notes are drawn in a completely separate
    // pass (nodeGroups.each(...), not edges.forEach), which this scan
    // deliberately excludes.
    expect(wholeSwitch).not.toMatch(/g\.append\('text'\)/);
  });
});

describe('v0.3a.1 round 2 — reported_unresolved does not fabricate ancestry', () => {
  it('a manually-marked union with no real shared ancestor stays reported_unresolved and adds no new individuals/unions', () => {
    const state = baseState();
    state.maternalRelatives.uncles = [
      { id: '_mu0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
    ];
    const beforeGraph = buildPedigreeFromWizard(state);
    const beforeIndCount = beforeGraph.individuals.length;
    const beforeUnionCount = beforeGraph.unions.length;

    state.consanguineousUnions = { U_MAT_UNCLE_0: true };
    const afterGraph = buildPedigreeFromWizard(state);
    const issues = auditPedigreeGraph(afterGraph);
    assertZeroErrors(issues);

    const union = afterGraph.unions.find(u => u.id === 'U_MAT_UNCLE_0');
    expect(union.consanguinityStatus).toBe('reported_unresolved');
    // No individual or union count change from merely flagging consanguinity —
    // confirms no shared-ancestor nodes were fabricated to "back" the claim.
    expect(afterGraph.individuals.length).toBe(beforeIndCount);
    expect(afterGraph.unions.length).toBe(beforeUnionCount);
  });

  it('reported_unresolved renders as edge type consanguineousUnionUnresolved (not a plain "union")', () => {
    const state = baseState();
    state.maternalRelatives.uncles = [
      { id: '_mu0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
    ];
    state.consanguineousUnions = { U_MAT_UNCLE_0: true };
    const graph = buildPedigreeFromWizard(state);
    const layout = computePedigreeLayout(graph);
    const edge = layout.edges.find(e => e.unionId === 'U_MAT_UNCLE_0');
    expect(edge.type).toBe('consanguineousUnionUnresolved');
    expect(edge.type).not.toBe('union');
  });
});

describe('v0.3a.1 round 2 — exportUtils.js does not filter/strip SVG content', () => {
  const exportSource = readFileSync(
    join(__dirname, '../utils/exportUtils.js'),
    'utf-8'
  );

  it('serializeSvg only adds xmlns attributes, never removes or filters elements', () => {
    const fnStart = exportSource.indexOf('function serializeSvg');
    const fnEnd = exportSource.indexOf('\n}', fnStart);
    const body = exportSource.slice(fnStart, fnEnd);
    // Whatever PedigreeCanvas.jsx renders into the live <svg> (double-line
    // consanguinity edges, the condition legend, etc.) reaches export
    // verbatim as long as this function contains no removal/filtering.
    expect(body).not.toMatch(/\.remove\(/);
    expect(body).not.toMatch(/querySelectorAll/);
    expect(body).toContain('XMLSerializer');
  });
});

describe('v0.3a.1 round 2 — computeSiblingCreationPlan ("Kardeş Yap" safety)', () => {
  beforeEach(() => { usePedigreeStore.getState().resetPedigree(); });

  it('allows creating siblings when neither individual has an existing parent union', () => {
    // Two directly-added spouses, married to DIFFERENT existing individuals
    // at the SAME generation (mother, father — both gen 2) — so the two new
    // spouse stubs are not partnered with each other, neither has a parent
    // union of their own, and they are generation-compatible.
    usePedigreeStore.getState().addSpouseTo('mother', 'male');
    let state = usePedigreeStore.getState();
    const spouse1 = state.lastCreated.spouseId;
    usePedigreeStore.getState().addSpouseTo('father', 'female');
    state = usePedigreeStore.getState();
    const spouse2 = state.lastCreated.spouseId;

    const plan = computeSiblingCreationPlan(state.pedigreeData, spouse1, spouse2);
    expect(plan.ok).toBe(true);
    expect(['attach', 'fabricate']).toContain(plan.action);
  });

  it('allows attaching one individual to the other\'s existing parent union', () => {
    // mother has a parent union (U_MAT_GP); a spouse newly added to father
    // has no parent union of its own — safe to attach into U_MAT_GP.
    usePedigreeStore.getState().addSpouseTo('father', 'female');
    const state = usePedigreeStore.getState();
    const newSpouseId = state.lastCreated.spouseId;
    const plan = computeSiblingCreationPlan(state.pedigreeData, 'mother', newSpouseId);
    expect(plan.ok).toBe(true);
    expect(plan.action).toBe('attach');
  });

  it('is a no-op (ok, but flagged) when the two are already siblings', () => {
    usePedigreeStore.getState().updateSiblingCount('male', 2);
    const state = usePedigreeStore.getState();
    const plan = computeSiblingCreationPlan(state.pedigreeData, 'sib_m_0', 'sib_m_1');
    expect(plan.ok).toBe(true);
    expect(plan.action).toBe('noop');
  });

  it('BLOCKS (does not silently no-op) two individuals who already have different existing parent unions', () => {
    // A maternal uncle (child of U_MAT_GP) and a paternal aunt (child of
    // U_PAT_GP) are not partnered with each other, and each already has a
    // distinct existing parent union — the case the builder cannot merge.
    usePedigreeStore.getState().updateRelativeCount('maternalRelatives', 'uncles', 1);
    usePedigreeStore.getState().updateRelativeCount('paternalRelatives', 'aunts', 1);
    const state = usePedigreeStore.getState();
    const plan = computeSiblingCreationPlan(state.pedigreeData, 'mat_uncle_0', 'pat_aunt_0');
    expect(plan.ok).toBe(false);
    expect(plan.reason).toMatch(/anne-babası ayrı ayrı çizili/);
  });

  it('blocks a self-pair', () => {
    const state = usePedigreeStore.getState();
    const plan = computeSiblingCreationPlan(state.pedigreeData, 'mother', 'mother');
    expect(plan.ok).toBe(false);
  });

  it('blocks when either individual is a pregnancy loss or stillbirth', () => {
    // Construct minimal pedigreeData by hand for this structural case.
    const pedigreeData = {
      individuals: [
        { id: 'a', pregnancyLoss: true },
        { id: 'b' },
      ],
      unions: [],
      parentChildRelationships: [],
    };
    const plan = computeSiblingCreationPlan(pedigreeData, 'a', 'b');
    expect(plan.ok).toBe(false);
  });

  it('blocks when either individual is the proband', () => {
    const state = usePedigreeStore.getState();
    const plan = computeSiblingCreationPlan(state.pedigreeData, 'proband', 'mat_gf');
    expect(plan.ok).toBe(false);
    expect(plan.reason).toMatch(/[Pp]roband/);
  });

  it('blocks two already-partnered individuals', () => {
    const state = usePedigreeStore.getState();
    const plan = computeSiblingCreationPlan(state.pedigreeData, 'mother', 'father');
    // mother/father are both partnered (U_PARENTS) — must not be ok
    // regardless of which specific reason fires first.
    expect(plan.ok).toBe(false);
  });

  it('blocks two individuals at different generations (would corrupt sibling-generation invariants)', () => {
    usePedigreeStore.getState().addSpouseTo('proband', 'female'); // generation 3
    let state = usePedigreeStore.getState();
    const spouse1 = state.lastCreated.spouseId;
    usePedigreeStore.getState().addSpouseTo('mat_gf', 'female'); // generation 1
    state = usePedigreeStore.getState();
    const spouse2 = state.lastCreated.spouseId;

    const plan = computeSiblingCreationPlan(state.pedigreeData, spouse1, spouse2);
    expect(plan.ok).toBe(false);
    expect(plan.reason).toMatch(/farklı kuşaklarda/);
  });

  it('addCustomConsanguinity itself remains a real biological link (builder-level fact)', () => {
    // The "make siblings" mechanism must create a real PCR link, not a
    // union consanguinity flag. This is a BUILDER fact, verified against the
    // builder directly — the store's v0.4 layout-safety net would roll back
    // this particular cross-pedigree fixture (correctly, as unreadable), so
    // it is not the right layer to assert the underlying data model.
    const state = baseState();
    state.graphEdits = [
      { type: 'addSpouse', targetId: 'mother', spouseId: 'de_sp_0', unionId: 'U_DE_0', spouseSex: 'male' },
      { type: 'addSpouse', targetId: 'father', spouseId: 'de_sp_1', unionId: 'U_DE_1', spouseSex: 'female' },
    ];
    state.customConsanguinity = [{ id: '_cc0', type: 'siblings', person1: 'de_sp_0', person2: 'de_sp_1' }];

    const graph = buildPedigreeFromWizard(state);
    const errors = auditPedigreeGraph(graph).filter(i => i.severity === 'error');
    expect(errors).toHaveLength(0);

    const spouse1Union = graph.parentChildRelationships.find(r => r.children.includes('de_sp_0'))?.unionId;
    const spouse2Union = graph.parentChildRelationships.find(r => r.children.includes('de_sp_1'))?.unionId;
    expect(spouse1Union).toBeDefined();
    expect(spouse1Union).toBe(spouse2Union);

    // Not merely a consanguinity flag on a union — no union directly
    // connects these two; the relationship lives in parentChildRelationships.
    expect(graph.unions.some(u => u.partners.includes('de_sp_0') && u.partners.includes('de_sp_1'))).toBe(false);
  });
});
