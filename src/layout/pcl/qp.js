/**
 * qp.js — horizontal coordinate assignment for the PCL layout engine.
 *
 * Solves   minimise  Σ w·(Σ c_i·x_i − d)²
 *          subject to x[L_k+1] − x[L_k] ≥ gap_k   for every layer L (fixed order)
 *
 * i.e. a convex quadratic objective with hard "minimum separation in a fixed
 * left-to-right order" constraints per generation row. The objective encodes
 * the clinical drawing goals (couple centred over its children, partners at
 * the spouse gap, compact sibships — see index.js); the constraints guarantee
 * that no two symbols ever overlap, whatever the objective prefers.
 *
 * Method: accelerated projected gradient (FISTA) with gradient-based adaptive
 * restart (O'Donoghue & Candès 2015). The projection onto one layer's
 * constraint set is exact and linear-time: substituting
 * z_k = x_k − Σ_{j<k} gap_j turns the separations into plain monotonicity,
 * which the Pool-Adjacent-Violators algorithm solves exactly. Deterministic:
 * fixed iteration order, no randomness.
 */

/**
 * Euclidean projection of `values` (one layer, in order) onto
 * { x : x[k+1] − x[k] ≥ gaps[k] }.
 */
export function projectLayer(values, gaps) {
  const n = values.length;
  const out = new Array(n);
  projectInto(values, gaps, n, out, new Float64Array(n), new Float64Array(n), new Int32Array(n));
  return out;
}

// In-place PAVA projection with caller-provided scratch buffers.
function projectInto(vals, gaps, n, out, offset, blockMean, blockSize) {
  if (n === 0) return;
  offset[0] = 0;
  for (let k = 1; k < n; k++) offset[k] = offset[k - 1] + gaps[k - 1];
  let nb = 0;
  for (let k = 0; k < n; k++) {
    let mean = vals[k] - offset[k];
    let size = 1;
    while (nb > 0 && blockMean[nb - 1] > mean) {
      nb--;
      mean = (blockMean[nb] * blockSize[nb] + mean * size) / (blockSize[nb] + size);
      size += blockSize[nb];
    }
    blockMean[nb] = mean;
    blockSize[nb] = size;
    nb++;
  }
  let k = 0;
  for (let b = 0; b < nb; b++) {
    for (let j = 0; j < blockSize[b]; j++, k++) out[k] = blockMean[b] + offset[k];
  }
}

/**
 * @param {number} n                      number of variables
 * @param {Array<{ids:number[], gaps:number[]}>} layers   ordered variable ids per layer + min gaps
 * @param {Array<{w:number, idx:number[], c:number[], d:number}>} terms   quadratic terms
 * @param {number[]} x0                    starting point (need not be feasible)
 * @param {{maxIter?:number, tol?:number}} [opts]
 * @returns {{ x:number[], iterations:number, converged:boolean }}
 */
export function solveSeparatedQP(n, layers, terms, x0, opts = {}) {
  const maxIter = opts.maxIter ?? 4000;
  const tol = opts.tol ?? 1e-3;

  // Gershgorin bound on the Hessian (Σ 2w c cᵀ) → safe step 1/L.
  const rowBound = new Float64Array(n);
  for (const t of terms) {
    let absSum = 0;
    for (const c of t.c) absSum += Math.abs(c);
    for (let j = 0; j < t.idx.length; j++) rowBound[t.idx[j]] += 2 * t.w * Math.abs(t.c[j]) * absSum;
  }
  let L = 0;
  for (let i = 0; i < n; i++) L = Math.max(L, rowBound[i]);
  if (L <= 0) L = 1;

  // Scratch buffers sized for the largest layer.
  let maxLayer = 0;
  for (const layer of layers) maxLayer = Math.max(maxLayer, layer.ids.length);
  const vals = new Float64Array(maxLayer);
  const outBuf = new Float64Array(maxLayer);
  const offset = new Float64Array(maxLayer);
  const blockMean = new Float64Array(maxLayer);
  const blockSize = new Int32Array(maxLayer);

  const projectAll = (v, out) => {
    out.set(v);
    for (const layer of layers) {
      const ids = layer.ids;
      const m = ids.length;
      for (let k = 0; k < m; k++) vals[k] = v[ids[k]];
      projectInto(vals, layer.gaps, m, outBuf, offset, blockMean, blockSize);
      for (let k = 0; k < m; k++) out[ids[k]] = outBuf[k];
    }
  };

  const g = new Float64Array(n);
  const gradient = (v) => {
    g.fill(0);
    for (const t of terms) {
      const idx = t.idx, c = t.c;
      let r = -t.d;
      for (let j = 0; j < idx.length; j++) r += c[j] * v[idx[j]];
      const s = 2 * t.w * r;
      for (let j = 0; j < idx.length; j++) g[idx[j]] += s * c[j];
    }
  };

  const x = new Float64Array(n);
  projectAll(Float64Array.from(x0), x);
  const y = Float64Array.from(x);
  const step = new Float64Array(n);
  const xNew = new Float64Array(n);
  let t = 1;
  let iterations = 0;
  let converged = false;
  for (; iterations < maxIter; iterations++) {
    gradient(y);
    for (let i = 0; i < n; i++) step[i] = y[i] - g[i] / L;
    projectAll(step, xNew);
    let maxDelta = 0;
    let restartTest = 0;
    for (let i = 0; i < n; i++) {
      const d = xNew[i] - x[i];
      if (Math.abs(d) > maxDelta) maxDelta = Math.abs(d);
      restartTest += (y[i] - xNew[i]) * d;
    }
    if (restartTest > 0) {
      // momentum is pointing uphill: restart acceleration from here
      t = 1;
      y.set(xNew);
    } else {
      const tNew = (1 + Math.sqrt(1 + 4 * t * t)) / 2;
      const momentum = (t - 1) / tNew;
      for (let i = 0; i < n; i++) y[i] = xNew[i] + momentum * (xNew[i] - x[i]);
      t = tNew;
    }
    x.set(xNew);
    if (maxDelta < tol) { converged = true; iterations++; break; }
  }
  return { x: Array.from(x), iterations, converged };
}
