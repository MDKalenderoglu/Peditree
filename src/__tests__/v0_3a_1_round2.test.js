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

describe('v0.3a.1 round 2 — reported_unresolved still renders a double line', () => {
  const canvasSource = readFileSync(
    join(__dirname, '../components/PedigreeCanvas.jsx'),
    'utf-8'
  );

  function countLinesInCase(source, caseLabel) {
    const caseStart = source.indexOf(`case '${caseLabel}'`);
    expect(caseStart).toBeGreaterThan(-1);
    const nextCaseStart = source.indexOf("case '", caseStart + 1);
    const defaultStart = source.indexOf('default:', caseStart + 1);
    const blockEnd = nextCaseStart === -1
      ? defaultStart
      : (defaultStart === -1 ? nextCaseStart : Math.min(nextCaseStart, defaultStart));
    const block = source.slice(caseStart, blockEnd === -1 ? undefined : blockEnd);
    return (block.match(/g\.append\('line'\)/g) || []).length;
  }

  it('known_supported draws exactly two lines (the existing double-line case)', () => {
    expect(countLinesInCase(canvasSource, 'consanguineousUnion')).toBe(2);
  });

  it('reported_unresolved ALSO draws exactly two lines, not one', () => {
    // This is the core reviewer-flagged regression: this case previously
    // drew a single amber dashed line. It must draw two, matching
    // known_supported's line count, differing only in color/dash/marker.
    expect(countLinesInCase(canvasSource, 'consanguineousUnionUnresolved')).toBe(2);
  });

  it('reported_unresolved still carries a distinguishing neutral label, not a "?" (v0.3a.2 fix)', () => {
    const caseStart = canvasSource.indexOf("case 'consanguineousUnionUnresolved'");
    const nextCaseStart = canvasSource.indexOf("case '", caseStart + 1);
    const block = canvasSource.slice(caseStart, nextCaseStart);
    expect(block).toContain('Akrabalık bildirildi');
    expect(block).not.toContain('? akrabalık');
    expect(block).toContain('#d97706'); // amber — visually distinct from known_supported's default edge color
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
    const spouse1 = state.wizardData.graphEdits.find(e => e.type === 'addSpouse').spouseId;
    usePedigreeStore.getState().addSpouseTo('father', 'female');
    state = usePedigreeStore.getState();
    const spouse2 = state.wizardData.graphEdits.filter(e => e.type === 'addSpouse')[1].spouseId;

    const plan = computeSiblingCreationPlan(state.pedigreeData, spouse1, spouse2);
    expect(plan.ok).toBe(true);
    expect(['attach', 'fabricate']).toContain(plan.action);
  });

  it('allows attaching one individual to the other\'s existing parent union', () => {
    // mother has a parent union (U_MAT_GP); a spouse newly added to father
    // has no parent union of its own — safe to attach into U_MAT_GP.
    usePedigreeStore.getState().addSpouseTo('father', 'female');
    const state = usePedigreeStore.getState();
    const newSpouseId = state.wizardData.graphEdits.find(e => e.type === 'addSpouse').spouseId;
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
    expect(plan.reason).toMatch(/farklı ebeveyn birlikleri/);
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
    const spouse1 = state.wizardData.graphEdits.find(e => e.type === 'addSpouse').spouseId;
    usePedigreeStore.getState().addSpouseTo('mat_gf', 'female'); // generation 1
    state = usePedigreeStore.getState();
    const spouse2 = state.wizardData.graphEdits.filter(e => e.type === 'addSpouse')[1].spouseId;

    const plan = computeSiblingCreationPlan(state.pedigreeData, spouse1, spouse2);
    expect(plan.ok).toBe(false);
    expect(plan.reason).toMatch(/jenerasyon/);
  });

  it('addCustomConsanguinity itself remains a real biological link (integration sanity check)', () => {
    // Two same-generation individuals with no existing parent unions and no
    // relationship to each other — after addCustomConsanguinity, they must
    // be real PCR siblings, not just flagged via a union consanguinity field.
    usePedigreeStore.getState().addSpouseTo('mother', 'male'); // generation 2
    let state = usePedigreeStore.getState();
    const spouse1 = state.wizardData.graphEdits.find(e => e.type === 'addSpouse').spouseId;
    usePedigreeStore.getState().addSpouseTo('father', 'female'); // generation 2
    state = usePedigreeStore.getState();
    const spouse2 = state.wizardData.graphEdits.filter(e => e.type === 'addSpouse')[1].spouseId;

    const plan = computeSiblingCreationPlan(state.pedigreeData, spouse1, spouse2);
    expect(plan.ok).toBe(true);

    usePedigreeStore.getState().addCustomConsanguinity(spouse1, spouse2);
    state = usePedigreeStore.getState();
    const errors = (state.integrityIssues || []).filter(i => i.severity === 'error');
    expect(errors).toHaveLength(0);

    const pcrs = state.pedigreeData.parentChildRelationships;
    const spouse1Union = pcrs.find(r => r.children.includes(spouse1))?.unionId;
    const spouse2Union = pcrs.find(r => r.children.includes(spouse2))?.unionId;
    expect(spouse1Union).toBeDefined();
    expect(spouse1Union).toBe(spouse2Union);

    // Not merely a consanguinity flag on a union — no union at all connects
    // these two; the relationship lives in parentChildRelationships, the
    // same collection every other sibling group uses.
    const unions = state.pedigreeData.unions;
    expect(unions.some(u => u.partners.includes(spouse1) && u.partners.includes(spouse2))).toBe(false);
  });
});
