import catalog from './strudel-docs.json';
import type { Completion } from '@codemirror/autocomplete';

export type FunctionDoc = {
  name: string; description: string;
  params: { name: string; type: string; description: string; optional?: boolean; default?: string }[];
  examples: string[]; aliases: string[]; signature?: string[]; source?: string; returns?: string;
};
const entries: Record<string, FunctionDoc> = catalog.entries;
const custom: Record<string, FunctionDoc> = {
  MIDI: { name: 'MIDI', description: 'Live notes from your MIDI input. Start an effects chain with MIDI; pitch and velocity come from the notes you play. Apply the instrument to hear changes, then save the chain as a preset. MIDI is a reserved value, so do not call it with parentheses.', params: [], examples: ['MIDI.s("triangle").lpf(slider(1200, 100, 8000)).room(0.3)'], aliases: [] },
  soundSlot: { name: 'soundSlot', description: 'Use the sound assigned to a named Studio sound slot.', params: [{ name: 'name', type: 'string', description: 'Name of the sound slot in this session, such as "bass".' }], examples: ['note("c3").s(soundSlot("bass"))'], aliases: [] },
};
const extraParams: Record<string, FunctionDoc['params']> = {
  stack: [{ name: '...patterns', type: 'Pattern | value', description: 'Patterns or values to play simultaneously. Each keeps its own timing.' }],
  range: [{ name: 'min', type: 'number | Pattern', description: 'Output value corresponding to input 0.' }, { name: 'max', type: 'number | Pattern', description: 'Output value corresponding to input 1.' }],
  add: [{ name: 'value', type: 'number | Pattern', description: 'Number or pattern of numbers to add to the values in this pattern.' }],
};
export function functionDoc(name: string): FunctionDoc {
  const entry = custom[name] ?? entries[name];
  if (!entry) return { name, description: 'Runtime function. This installed Strudel version does not publish parameter documentation for this function.', params: [], examples: [], aliases: [] };
  const supplement = extraParams[name] ?? entry.aliases.map(alias => extraParams[alias]).find(Boolean);
  const params = entry.params.length ? entry.params : supplement ?? (entry.signature ?? []).map(parameter => ({ name: parameter, type: '', description: 'Parameter from the installed source signature; upstream does not provide a description.' }));
  return { ...entry, params, description: entry.description || 'Runtime function. Upstream does not provide a description; the installed source signature is shown below.' };
}
export function functionSignature(doc: FunctionDoc) {
  return doc.name === 'MIDI' ? 'MIDI' : `${doc.name}(${doc.params.map(p => `${p.name}${p.optional ? '?' : ''}${p.default !== undefined ? ` = ${p.default}` : ''}`).join(', ')})`;
}
export function functionInfo(name: string): HTMLElement {
  const doc = functionDoc(name);
  const root = document.createElement('div'); root.className = 'studio-function-doc';
  const append = (tag: string, text: string, parent: HTMLElement = root) => { const node = document.createElement(tag); node.textContent = text; parent.append(node); return node; };
  append('code', functionSignature(doc));
  append('p', doc.description);
  if (doc.params.length) {
    append('h4', 'Parameters');
    const list = append('dl', '');
    for (const param of doc.params) {
      append('dt', `${param.name}${param.optional ? ' (optional)' : ''}${param.type ? ` · ${param.type}` : ''}`, list);
      append('dd', `${param.description || 'No parameter description provided upstream.'}${param.default !== undefined ? ` Default: ${param.default}.` : ''}`, list);
    }
  }
  if (doc.returns) append('p', `Returns: ${doc.returns}`);
  if (doc.aliases.length) append('p', `Also available as: ${doc.aliases.join(', ')}`);
  if (doc.examples.length) { append('h4', 'Examples'); for (const example of doc.examples.slice(0, 3)) append('pre', example); }
  if (doc.source) append('small', doc.source);
  return root;
}
export function documentedCompletion(name: string): Completion {
  const doc = functionDoc(name);
  return { label: name, type: name === 'MIDI' ? 'variable' : 'function', detail: functionSignature(doc), info: () => functionInfo(name) };
}
