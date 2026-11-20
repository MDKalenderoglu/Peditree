/**
 * pngProject.js — the PediTree file carried inside a PNG (clinician request
 * 2026-11-20: a pedigree downloaded as PNG could not be opened again to be
 * edited). The project file is written into an iTXt chunk with the keyword
 * "peditree" just before IEND: the picture is unchanged, any viewer shows it,
 * and "Aç" reads the drawing back out of it.
 *
 * Only Kaydet → PNG carries it; a picture sent with "Paylaş" never does (it
 * may be sent without the patient's name — the data inside would hold it).
 * Messaging apps that recompress pictures drop the chunk; such a picture
 * opens as "not saved by PediTree".
 */
const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const KEYWORD = 'peditree';

let table = null;
function crc32(bytes) {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export const isPng = (bytes) => bytes && bytes.length > 8 && SIG.every((b, i) => bytes[i] === b);

const u32 = (bytes, at) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
function putU32(out, at, v) { out[at] = v >>> 24; out[at + 1] = (v >>> 16) & 0xff; out[at + 2] = (v >>> 8) & 0xff; out[at + 3] = v & 0xff; }

/** Each chunk: { type, start (of its length field), dataStart, length }. */
function chunks(bytes) {
  const out = [];
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = u32(bytes, at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    if (at + 12 + length > bytes.length) break;
    out.push({ type, start: at, dataStart: at + 8, length });
    at += 12 + length;
    if (type === 'IEND') break;
  }
  return out;
}

/** The PNG with `text` (the PediTree file) inside; one "peditree" chunk at most. */
export function embedProject(png, text) {
  const bytes = png instanceof Uint8Array ? png : new Uint8Array(png);
  if (!isPng(bytes)) throw new Error('not a PNG');
  const list = chunks(bytes);
  const iend = list.find((c) => c.type === 'IEND');
  if (!iend) throw new Error('PNG without IEND');
  // iTXt: keyword, 0, compression flag 0, method 0, language "", 0, translated keyword "", 0, UTF-8 text
  const head = new TextEncoder().encode(KEYWORD);
  const body = new TextEncoder().encode(text);
  const data = new Uint8Array(head.length + 5 + body.length);
  data.set(head, 0);
  data.set(body, head.length + 5);
  const chunk = new Uint8Array(12 + data.length);
  putU32(chunk, 0, data.length);
  chunk.set([105, 84, 88, 116], 4); // "iTXt"
  chunk.set(data, 8);
  putU32(chunk, 8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  // an earlier "peditree" chunk is left out (the picture saved again)
  const keep = list.filter((c) => c.type !== 'IEND' && !(c.type === 'iTXt' && keywordOf(bytes, c) === KEYWORD));
  const parts = [bytes.subarray(0, 8), ...keep.map((c) => bytes.subarray(c.start, c.dataStart + c.length + 4)), chunk, bytes.subarray(iend.start, iend.dataStart + 4)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

function keywordOf(bytes, c) {
  const end = bytes.indexOf(0, c.dataStart);
  if (end < 0 || end > c.dataStart + c.length) return null;
  return new TextDecoder().decode(bytes.subarray(c.dataStart, end));
}

/** The PediTree file inside a PNG, or null (not a PNG, or none in it, or a damaged one). */
export function readProject(png) {
  const bytes = png instanceof Uint8Array ? png : new Uint8Array(png);
  if (!isPng(bytes)) return null;
  for (const c of chunks(bytes)) {
    if (c.type !== 'iTXt' || keywordOf(bytes, c) !== KEYWORD) continue;
    if (crc32(bytes.subarray(c.start + 4, c.dataStart + c.length)) !== u32(bytes, c.dataStart + c.length)) return null;
    let p = c.dataStart + KEYWORD.length + 1;
    if (bytes[p] !== 0) return null; // compressed: never written by PediTree
    p += 2;
    p = bytes.indexOf(0, p) + 1; // language tag
    p = bytes.indexOf(0, p) + 1; // translated keyword
    if (p <= 0 || p > c.dataStart + c.length) return null;
    return new TextDecoder().decode(bytes.subarray(p, c.dataStart + c.length));
  }
  return null;
}
