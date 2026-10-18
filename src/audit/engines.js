/**
 * engines.js — registry of layout engines the benchmark can compare on the
 * same graph. Each entry maps a graph to the renderer's { nodes, edges }.
 * Engines selected through PEDITREE_PACKER are switched per call (the flag is
 * read on every layout), and the previous value is always restored.
 */
import { computePedigreeLayoutV2 } from '../utils/pedigreeLayoutV2';

function withPacker(value, fn) {
  const prev = process.env.PEDITREE_PACKER;
  if (value === undefined) delete process.env.PEDITREE_PACKER; else process.env.PEDITREE_PACKER = value;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.PEDITREE_PACKER; else process.env.PEDITREE_PACKER = prev;
  }
}

export const ENGINES = {
  recursive: (graph) => withPacker('recursive', () => computePedigreeLayoutV2(graph)),
  legacy: (graph) => withPacker('legacy', () => computePedigreeLayoutV2(graph)),
};
