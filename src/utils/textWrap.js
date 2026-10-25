/**
 * textWrap.js — wrap text made of several segments (e.g. the editable parts
 * of a note) into lines of at most `max` characters, so the key and the
 * notes on the drawing and in SVG / PNG never cut a word off (audit
 * 2026-10-25: labels were cut at 50, notes at 100 characters).
 *
 * Lines break between words; a word longer than a line is split. Each piece
 * keeps its segment, so a line can be drawn as tspans that stay editable.
 *
 * @param {Array<{ text: string }>} segs
 * @param {number} max
 * @returns {Array<Array<{ seg, text: string }>>} lines of pieces
 */
export function packLines(segs, max) {
  const lines = [[]];
  let len = 0;
  const line = () => lines[lines.length - 1];
  const newLine = () => { lines.push([]); len = 0; };
  const put = (seg, text) => {
    const l = line();
    const last = l[l.length - 1];
    if (last && last.seg === seg) last.text += text;
    else l.push({ seg, text });
    len += text.length;
  };
  for (const seg of segs) {
    for (let w of String(seg.text ?? '').split(/(\s+)/).filter(Boolean)) {
      if (/^\s+$/.test(w)) {
        if (len > 0 && len + 1 <= max) put(seg, ' ');
        else if (len > 0) newLine();
        continue;
      }
      if (len + w.length > max && len > 0) {
        // drop the space the line ended with
        const l = line(), last = l[l.length - 1];
        if (last && last.text.endsWith(' ')) { last.text = last.text.slice(0, -1); len--; if (!last.text) l.pop(); }
        newLine();
      }
      while (w.length > max) { put(seg, w.slice(0, max)); w = w.slice(max); newLine(); }
      if (w) put(seg, w);
    }
  }
  return lines.filter((l) => l.length);
}
