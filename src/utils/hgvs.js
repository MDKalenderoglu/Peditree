/**
 * hgvs.js — a genetic test line written as the nomenclature writes it
 * (clinician request 2026-11-17: "fbn1" → "FBN1").
 *
 *   - a gene symbol in capitals (HGNC): "fbn1" → "FBN1", "cftr:c.…" → "CFTR:c.…",
 *     "C9orf72" kept as HGNC writes it;
 *   - a reference sequence in capitals: "nm_000138.5" → "NM_000138.5";
 *   - a variant (HGVS): the prefix small ("C." → "c."), nucleotides in capitals,
 *     del / dup / ins / inv small ("c.1234g>a" → "c.1234G>A"); a protein change
 *     with three-letter amino acids ("p.arg123ter" → "p.Arg123Ter").
 *
 * Only what is recognisably a gene, a reference or a variant changes; every
 * other word (het, hom, VUS, "sonuç bekleniyor", the clinician's own words)
 * stays as typed. A word without a digit (at most six letters) is taken for a gene only
 * when a variant, a reference, a zygosity or an exon follows it ("cftr het"), or when it is the
 * whole line; Turkish rules never apply (ASCII capitals: "pik3ca" → "PIK3CA").
 */

const BOUNDARY = /[\s:;,/()[\]]/;
// words that are never a gene, even short and alone on a line
const NOT_GENE = new Set([
  'het', 'hom', 'hemi', 'heterozigot', 'homozigot', 'hemizigot', 'heterozygous', 'homozygous', 'hemizygous',
  'vus', 'lp', 'normal', 'yok', 'var', 'test', 'gen', 'gene', 'not', 'note', 'wes', 'wgs', 'ces', 'panel',
  'exon', 'ekzon', 'intron', 'allel', 'allele', 'de', 'novo', 'mat', 'pat', 'cnv', 'snv', 'array', 'mlpa',
  'fish', 'pcr', 'ngs', 'sanger', 'kromozom', 'negatif', 'pozitif', 'yeni', 'eski', 'tek', 'iki', 'ana', 'baba',
  'anne', 'and', 'or', 've', 'veya', 'ile', 'yes', 'no', 'pos', 'neg', 'del', 'dup', 'ins', 'inv',
  'varyant', 'variant', 'sonuc', 'result', 'mutasyon', 'mutant', 'bulgu', 'tani', 'rapor', 'kopya', 'tekrar',
]);
// words with a digit that are not genes either: rsIDs, chromosomes, builds, exons, copies
const NOT_GENE_DIGIT = /^(rs\d+|chr\w*|hg\d+|grch\d+|ex(on)?\d+\w*|ekzon\d+\w*|e\d+|i\d+|intron\d+\w*|ivs\d+\w*|x\d+|n\d+)$/i;
// a zygosity, or an exon / deletion / duplication, after the word ("cftr het", "dmd ekzon 45-50 del")
const ZYGOSITY = /^(het|hom|hemi|heterozigot|homozigot|hemizigot|heterozygous|homozygous|hemizygous|ekzon|exon|intron|del|dup)\b/i;
const TRANSCRIPT = /^(n[mrcgp]|x[mrp]|ens[tgp])_?\d/i;
const VARIANT_AHEAD = /^[cgmnrp]\.\S*\d/i;

const AA3 = ['Ala', 'Arg', 'Asn', 'Asp', 'Cys', 'Gln', 'Glu', 'Gly', 'His', 'Ile', 'Leu', 'Lys', 'Met', 'Phe', 'Pro',
  'Ser', 'Thr', 'Trp', 'Tyr', 'Val', 'Ter', 'Sec', 'Pyl', 'Xaa'];
const AA3_MAP = new Map(AA3.map((a) => [a.toLowerCase(), a]));
const PROTEIN_PART = new RegExp(`(delins|del|dup|ins|ext|fs)|(${AA3.join('|')})|([a-z])`, 'gi');
const NUCLEIC_PART = /(delins|del|dup|ins|inv|con)|([a-z])/gi;

/** A gene symbol as HGNC writes it. */
function geneCase(word) {
  const orf = /^c(\d+|x|y)orf(\d+)$/i.exec(word);
  if (orf) return `C${orf[1].toUpperCase()}orf${orf[2]}`;
  return word.toUpperCase();
}

function looksLikeGene(word, after, wholeLine) {
  if (word.length < 2 || word.length > 12 || NOT_GENE.has(word.toLowerCase())) return false;
  if (/\d/.test(word)) return !NOT_GENE_DIGIT.test(word);
  if (word.length > 6 || !/^[a-z]+$/i.test(word)) return false;
  const rest = after.replace(/^\s*[:(]?\s*/, '');
  return wholeLine || VARIANT_AHEAD.test(rest) || TRANSCRIPT.test(rest) || (/^\s/.test(after) && ZYGOSITY.test(after.trim()));
}

/** The variant's own part after "c." / "p." … in the nomenclature's capitals. */
function variantBody(prefix, body) {
  if (prefix === 'p') {
    return body.replace(PROTEIN_PART, (m, kw, aa) => (kw ? kw.toLowerCase() : aa ? AA3_MAP.get(aa.toLowerCase()) : m.toUpperCase()));
  }
  if (prefix === 'r') return body.toLowerCase(); // RNA: small letters (HGVS)
  return body.replace(NUCLEIC_PART, (m, kw) => (kw ? kw.toLowerCase() : m.toUpperCase()));
}

/** One genetic test line as the nomenclature writes it (see above). */
export function formatGeneticLine(line) {
  const text = String(line ?? '');
  const trimmed = text.trim();
  // gene symbols: a word standing on its own, starting with a letter
  let out = text.replace(/[A-Za-z][A-Za-z0-9-]*/g, (word, at, s) => {
    const before = at > 0 ? s[at - 1] : '';
    const after = s.slice(at + word.length);
    if (before && !BOUNDARY.test(before)) return word;
    if (after && !BOUNDARY.test(after[0])) return word;
    return looksLikeGene(word, after, trimmed === word) ? geneCase(word) : word;
  });
  // reference sequences
  out = out.replace(/(^|[^A-Za-z0-9])((?:n[mrcgp]|x[mrp]|ens[tgp])_?\d+(?:\.\d+)?)/gi, (m, pre, id) => pre + id.toUpperCase());
  // variants: "c.…", "g.…", "m.…", "n.…", "r.…", "p.…" with a position
  out = out.replace(/(^|[\s:;,(])([cgmnrp])\.([^\s,;]*\d[^\s,;]*)/gi, (m, pre, p, body) => {
    const prefix = p.toLowerCase();
    return `${pre}${prefix}.${variantBody(prefix, body)}`;
  });
  return out;
}

/** Every line of a genetic note that is new (not in `old`) formatted; lines already there kept as they are. */
export function formatNewGeneticLines(note, old = '') {
  const kept = new Set(String(old ?? '').split('\n').map((s) => s.trim()).filter(Boolean));
  return String(note ?? '').split('\n').map((l) => (kept.has(l.trim()) ? l : formatGeneticLine(l))).join('\n');
}
