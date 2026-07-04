/**
 * verify-generations.mjs
 *
 * Post-change verification for the computeGenerations BFS slice.
 * Runs 6 representative wizard configurations through the builder + audit pipeline.
 * Reports generation assignments and integrity issues for each.
 *
 * Usage: node verify-generations.mjs
 */

// Use Vite's SSR module loader so extensionless imports resolve correctly
import { createServer } from 'vite';
const vite = await createServer({ server: { middlewareMode: true }, logLevel: 'silent' });
const { buildPedigreeFromWizard } = await vite.ssrLoadModule('./src/builder/pedigreeBuilderFromWizard.js');
const { auditPedigreeGraph } = await vite.ssrLoadModule('./src/utils/graphIntegrity.js');

// ── Base wizard state (reused by all cases) ──
function baseState() {
  return {
    proband: { sex: 'male', age: '30' },
    siblings: { male: [], female: [], unknown: [], pregnancyLoss: 0, deceased: 0 },
    parents: {
      motherExists: true, motherAge: '55',
      fatherExists: true, fatherAge: '58',
      consanguineous: false,
      consanguinityDegree: 'yok',
      consanguinityPath: 'unknown',
      relationshipStatus: 'together',
      motherOtherUnions: [],
      fatherOtherUnions: [],
    },
    maternalRelatives: { uncles: [], aunts: [] },
    paternalRelatives: { uncles: [], aunts: [] },
    gen4: [],
  };
}

// ── Expected generation values (what hardcoded builder produced before BFS) ──
const EXPECTED = {
  'Case 1: Standard 3-gen': {
    proband: 3, mother: 2, father: 2,
    mat_gf: 1, mat_gm: 1, pat_gf: 1, pat_gm: 1,
    sib_m_0: 3, sib_f_0: 3,
  },
  'Case 2: First-cousin consanguinity': {
    proband: 3, mother: 2, father: 2,
    mat_gf: 1, mat_gm: 1, pat_gf: 1, pat_gm: 1,
    ggf: 0, ggm: 0,
  },
  'Case 3: Double first-cousin': {
    proband: 3, mother: 2, father: 2,
    mat_gf: 1, mat_gm: 1, pat_gf: 1, pat_gm: 1,
    ggf_1: 0, ggm_1: 0, ggf_2: 0, ggm_2: 0,
  },
  'Case 4: Second-cousin': {
    proband: 3, mother: 2, father: 2,
    mat_gf: 1, mat_gm: 1, pat_gf: 1, pat_gm: 1,
    ggf_mat: 0, ggm_mat: 0, ggf_pat: 0, ggm_pat: 0,
    gggf: -1, gggm: -1,
  },
  'Case 5: Collateral branches': {
    proband: 3, mother: 2, father: 2,
    mat_gf: 1, mat_gm: 1, pat_gf: 1, pat_gm: 1,
    mat_uncle_0: 2, mat_uncle_0_sp: 2,
    mat_uncle_0_cm_0: 3, mat_uncle_0_cf_0: 3,
    pat_aunt_0: 2, pat_aunt_0_sp: 2,
    pat_aunt_0_cm_0: 3,
  },
  'Case 6: Gen4 descendant': {
    proband: 3, mother: 2, father: 2,
    mat_gf: 1, mat_gm: 1, pat_gf: 1, pat_gm: 1,
    gen4_sp_0: 3, gen4_0_cm_0: 4,
  },
};

// ── Case builders ──

function case1_standard3gen() {
  const s = baseState();
  s.siblings.male = [{ id: '_m0', age: '28' }];
  s.siblings.female = [{ id: '_f0', age: '25' }];
  return s;
}

function case2_firstCousin() {
  const s = baseState();
  s.parents.consanguineous = true;
  s.parents.consanguinityDegree = 'first_cousin';
  s.parents.consanguinityPath = 'mothers_paternal_is_fathers_paternal';
  return s;
}

function case3_doubleFirstCousin() {
  const s = baseState();
  s.parents.consanguineous = true;
  s.parents.consanguinityDegree = 'double_first_cousin';
  s.parents.consanguinityPath = 'double_first_cousin';
  return s;
}

function case4_secondCousin() {
  const s = baseState();
  s.parents.consanguineous = true;
  s.parents.consanguinityDegree = 'second_cousin';
  s.parents.consanguinityPath = 'second_cousin_simple';
  return s;
}

function case5_collateralBranches() {
  const s = baseState();
  s.maternalRelatives.uncles = [
    { id: '_mu0', children: { male: 1, female: 1, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
  ];
  s.paternalRelatives.aunts = [
    { id: '_pa0', children: { male: 1, female: 0, unknown: 0, pregnancyLoss: 0, stillbirth: 0 } },
  ];
  return s;
}

function case6_gen4() {
  const s = baseState();
  s.gen4 = [{ id: '_g4_0', targetPath: 'proband', male: 1, female: 0, unknown: 0 }];
  return s;
}

// ── Runner ──

const cases = [
  ['Case 1: Standard 3-gen', case1_standard3gen],
  ['Case 2: First-cousin consanguinity', case2_firstCousin],
  ['Case 3: Double first-cousin', case3_doubleFirstCousin],
  ['Case 4: Second-cousin', case4_secondCousin],
  ['Case 5: Collateral branches', case5_collateralBranches],
  ['Case 6: Gen4 descendant', case6_gen4],
];

let allPassed = true;

for (const [name, buildFn] of cases) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${name}`);
  console.log('═'.repeat(60));

  const state = buildFn();
  const graph = buildPedigreeFromWizard(state);
  const issues = auditPedigreeGraph(graph);

  // Report all generation values
  const genMap = {};
  for (const ind of graph.individuals) {
    genMap[ind.id] = ind.generation;
  }
  console.log('\n  Generation values:');
  for (const ind of graph.individuals) {
    console.log(`    ${ind.id.padEnd(20)} gen=${ind.generation}`);
  }

  // Check against expected
  const expected = EXPECTED[name];
  let genOk = true;
  for (const [id, expectedGen] of Object.entries(expected)) {
    const actual = genMap[id];
    if (actual === undefined) {
      console.log(`  ✗ MISSING: ${id} (expected gen=${expectedGen})`);
      genOk = false;
    } else if (actual !== expectedGen) {
      console.log(`  ✗ MISMATCH: ${id} expected gen=${expectedGen}, got gen=${actual}`);
      genOk = false;
    }
  }
  if (genOk) {
    console.log('\n  ✓ All expected generation values match');
  } else {
    allPassed = false;
  }

  // Report integrity issues
  const errors = issues.filter(i => i.severity === 'error');
  const check8 = issues.filter(i => i.code === 'SIBLING_GENERATION_INCONSISTENT');
  const check9 = issues.filter(i => i.code === 'PARTNER_GENERATION_INCONSISTENT');

  if (errors.length === 0) {
    console.log('  ✓ auditPedigreeGraph: 0 errors');
  } else {
    console.log(`  ✗ auditPedigreeGraph: ${errors.length} error(s):`);
    for (const e of errors) {
      console.log(`    [${e.code}] ${e.message}`);
    }
    allPassed = false;
  }

  if (check8.length === 0) {
    console.log('  ✓ CHECK 8 (SIBLING_GENERATION_INCONSISTENT): not fired');
  } else {
    console.log(`  ✗ CHECK 8 fired ${check8.length} time(s)`);
    allPassed = false;
  }

  if (check9.length === 0) {
    console.log('  ✓ CHECK 9 (PARTNER_GENERATION_INCONSISTENT): not fired');
  } else {
    console.log(`  ✗ CHECK 9 fired ${check9.length} time(s)`);
    allPassed = false;
  }
}

console.log(`\n${'═'.repeat(60)}`);
if (allPassed) {
  console.log('  ✓✓✓ ALL 6 CASES PASSED — no regressions detected');
} else {
  console.log('  ✗✗✗ FAILURES DETECTED — see above');
}
console.log('═'.repeat(60));

// The Vite dev server started above keeps the Node process alive
// indefinitely (middlewareMode still holds an open handle) — close it
// explicitly so this script actually exits instead of hanging forever
// on success.
await vite.close();
process.exit(allPassed ? 0 : 1);
