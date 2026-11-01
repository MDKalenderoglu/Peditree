/**
 * keys.js — the texts the code gives to the translation (`t('…')`,
 * `tNow('…')`, `tk('…')`), read from the source files; for the dictionary
 * test and for `node scripts/i18n-missing.mjs`. Node only (reads files).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CALL = /\b(?:t|tk|tNow|tr|td)\(\s*'((?:[^'\\]|\\.)*)'/g;
const unescape = (s) => s.replace(/\\(.)/g, (m, c) => ({ n: '\n', t: '\t' }[c] ?? c));

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' || f === 'i18n' ? [] : files(p);
    return /\.(js|jsx)$/.test(f) ? [p] : [];
  });
}

/** Map text → the files that use it. */
export function translationKeys(root = join(process.cwd(), 'src')) {
  const out = new Map();
  for (const f of files(root)) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(CALL)) {
      const k = unescape(m[1]);
      if (!out.has(k)) out.set(k, []);
      out.get(k).push(f.slice(root.length + 1));
    }
  }
  return out;
}
