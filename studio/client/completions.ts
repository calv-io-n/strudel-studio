import { autocompletion, closeCompletion, acceptCompletion, startCompletion, snippetCompletion, type CompletionResult, type CompletionContext, type Completion } from '@codemirror/autocomplete';
import { Prec } from '@codemirror/state';
import { keymap, ViewPlugin } from '@codemirror/view';
import { parser } from '@lezer/javascript';
import type { Asset } from '../shared/model';

export const soundKey = (asset: Asset) => `studio_${asset.id.replaceAll('-', '')}`;
export const soundLabel = (asset: Asset) => asset.label || asset.prompt.slice(0, 80);
export type SoundEntry = { name: string; label: string };
const descriptions: Record<string, string> = {
  sbd: 'Synth kick', sine: 'Sine · smooth tone', triangle: 'Triangle · soft tone',
  sawtooth: 'Sawtooth · bright synth', square: 'Square · hollow synth',
  white: 'White noise', pink: 'Pink noise', brown: 'Brown noise', supersaw: 'Layered saw synth',
};
export function soundCatalog(names: string[], assets: Asset[]): SoundEntry[] {
  const entries = new Map(names.map(name => [name, { name, label: descriptions[name] || name }]));
  for (const asset of assets) entries.set(soundKey(asset), { name: soundKey(asset), label: soundLabel(asset) });
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Use the JavaScript tree to exclude comments and other strings, including while typing incomplete code.
export function soundToken(code: string, pos: number) {
  const node = parser.parse(code).resolveInner(pos, -1);
  if (node.name !== 'String' || node.parent?.name !== 'ArgList') return null;
  const call = node.parent.parent;
  if (call?.name !== 'CallExpression' || node.parent.firstChild?.nextSibling?.from !== node.from) return null;
  const callee = code.slice(call.from, node.parent.from).trim();
  if (!/(?:^|\.)\s*(?:s|sound)$/.test(callee)) return null;
  const before = code.slice(node.from + 1, pos);
  if (/["'\\]/.test(before)) return null;
  const fragment = before.match(/[\w-]*$/)![0];
  const from = pos - fragment.length;
  if (from > node.from + 1 && !/[\s[<{,(|]/.test(code[from - 1])) return null;
  const after = code.slice(pos, node.to).match(/^[\w-]*/ )![0];
  return { from, to: pos + after.length, fragment };
}

const effects = [
  ['room', 'Reverb', '0.3'], ['delay', 'Echo', '0.25'], ['lpf', 'Brightness · low-pass filter', '1200'],
  ['hpf', 'High-pass filter', '200'], ['distort', 'Distortion', '0.2'], ['gain', 'Volume', '0.5'],
];
export function studioCompletionSource(sounds: () => SoundEntry[], functions: () => string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const code = context.state.doc.toString(), pos = context.pos;
    const token = soundToken(code, pos);
    if (token) {
      const query = token.fragment.toLowerCase();
      const options: Completion[] = sounds().filter(s => `${s.name} ${s.label}`.toLowerCase().includes(query))
        .sort((a, b) => Number(b.name.startsWith(query)) - Number(a.name.startsWith(query)))
        .map(s => ({ label: s.name.startsWith('studio_') ? s.label : s.name, detail: s.name.startsWith('studio_') ? s.name : s.label,
          type: 'variable', apply: s.name }));
      return { from: token.from, to: token.to, options, filter: false };
    }
    const node = parser.parse(code).resolveInner(pos, -1);
    if (/Comment|String|Template/.test(node.name)) return null;
    const word = context.matchBefore(/[\w$]*/)!;
    const dot = code[word.from - 1] === '.';
    if (!word.text && !dot && !context.explicit) return null;
    const snippets = effects.map(([name, detail, value]) => snippetCompletion(`${name}(\${${value}})`, { label: name, detail, type: 'function' }));
    return { from: word.from, options: [
      ...(dot ? snippets : []),
      ...functions().filter(name => !dot || !effects.some(([effect]) => effect === name)).map(label => ({ label, type: 'function' })),
    ], validFor: /^[\w$]*$/ };
  };
}
export function studioCompletions(sounds: () => SoundEntry[], functions: () => string[]) {
  // Removing a focused suggestion can fire focusout during a CodeMirror update.
  // Defer closing until that update finishes, and keep it open for internal focus moves.
  const closeAfterBlur = ViewPlugin.define(view => {
    let destroyed = false;
    const blur = () => queueMicrotask(() => {
      if (!destroyed && !view.dom.contains(view.dom.ownerDocument.activeElement)) closeCompletion(view);
    });
    view.dom.addEventListener('focusout', blur);
    return { destroy() { destroyed = true; view.dom.removeEventListener('focusout', blur); } };
  });
  return [closeAfterBlur, autocompletion({ override: [studioCompletionSource(sounds, functions)], activateOnTyping: true, interactionDelay: 0, closeOnBlur: false }),
    Prec.highest(keymap.of([{ key: 'Tab', run: acceptCompletion }, { key: 'Ctrl-Space', run: startCompletion }]))];
}
