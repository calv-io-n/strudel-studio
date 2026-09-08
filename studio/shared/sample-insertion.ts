import { parser } from '@lezer/javascript';
import type { Asset } from './model';
/** End of the top-level statement (or comment) containing the caret, so an inserted phrase never splits an expression. */
export function statementEnd(code: string, cursor: number) {
  let at = Math.max(0, Math.min(cursor, code.length));
  for (let node = parser.parse(code).topNode.firstChild; node; node = node.nextSibling) if (node.from <= at && node.to >= at) { at = node.to; break; }
  return at;
}
/** Insert a separate phrase after the statement at the caret, retaining existing effect chains. */
export function sampleInsertion(code: string, cursor: number, asset: Asset, bpm: number) {
  const at = statementEnd(code, cursor);
  const key = `studio_${asset.id.replaceAll('-', '')}`;
  const duration = Math.max(.0001, (asset.duration ?? 240 / bpm) * bpm / 240);
  const offset = asset.recording?.offsetCycles ?? 0;
  const num = (value: number) => String(Number(value.toFixed(6)));
  const phrase = offset > 0 ? `timeCat([${num(offset)}, silence], [${num(duration)}, s("${key}")]).slow(${num(offset + duration)})` : `s("${key}").slow(${num(duration)})`;
  const label = (asset.label || asset.prompt || 'Sample').replace(/[\r\n\u2028\u2029]/g, ' ');
  return { from: at, insert: `\n// ${label} · one-shot sample, ${asset.duration ?? 'natural'} seconds\nsamples({ ${key}: [location.origin + '/api/samples/${asset.id}/audio'] })\n$: ${phrase}\n` };
}
