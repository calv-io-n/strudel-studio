import { parser } from '@lezer/javascript';
import type { ChangeDesc } from '@codemirror/state';
import type { Tab } from './model';

export type Slider = { id: string; start: number; end: number; from: number; to: number; value: number; min: number; max: number; step: number; fingerprint: string; label: string };
const literal = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i;
export function scanSliders(code: string): Slider[] {
  const result: Slider[] = [];
  parser.parse(code).iterate({ enter(node) {
    if (node.name !== 'CallExpression') return;
    const callee = node.node.firstChild;
    const args = node.node.lastChild;
    if (!callee || code.slice(callee.from, callee.to) !== 'slider' || args?.name !== 'ArgList') return;
    const inside = code.slice(args.from + 1, args.to - 1);
    const pieces = inside.split(',').map((s) => s.trim());
    if (!pieces.length || pieces.length > 4 || pieces.some((p) => !literal.test(p))) return;
    const [value, min = 0, max = 1, step = (max - min) / 1000] = pieces.map(Number);
    if (![value, min, max, step].every(Number.isFinite) || min >= max || step <= 0) return;
    const from = args.from + 1 + inside.search(/\S/);
    const prefix = code.slice(Math.max(0, code.lastIndexOf('\n', node.from - 1) + 1), node.from).trim();
    result.push({ id: '', start: node.from, end: node.to, from, to: from + pieces[0].length, value, min, max, step,
      fingerprint: `slider(${pieces.slice(1).join(',')})`, label: prefix.match(/\.?([\w]+)\(\s*$/)?.[1] ?? 'slider' });
  } });
  return result;
}
export function reconcileSliders(code: string, previous: Slider[], changes?: ChangeDesc, anchors: Tab['anchors'] = []): Slider[] {
  const next = scanSliders(code);
  for (const slider of next) {
    const candidates = previous.filter((old) => {
      if (old.fingerprint !== slider.fingerprint) return false;
      if (!changes) return old.start === slider.start;
      let deleted = false;
      changes.iterChangedRanges((from, to) => { if (from <= old.start && to > old.start) deleted = true; });
      return !deleted && changes.mapPos(old.start, 1) === slider.start;
    });
    const saved = anchors.filter((a) => a.from === slider.from && a.fingerprint === slider.fingerprint);
    slider.id = candidates.length === 1 ? candidates[0].id : saved.length === 1 ? saved[0].id : crypto.randomUUID();
  }
  return next;
}
