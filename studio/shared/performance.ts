import { parser } from '@lezer/javascript';

export type Destination = { tabId: string; from: number; to: number; original: string; soundCode: string; valid: boolean };
/** Resolve a complete note expression, including selection of its mini-notation string. */
export function destinationFor(code: string, tabId: string, from: number, to: number): Destination {
  if (from === to) throw new Error('Highlight a note expression first.');
  const tree = parser.parse(code);
  let found: { from: number; to: number; chainTo: number } | undefined;
  tree.iterate({ enter(node) {
    if (node.name !== 'CallExpression') return;
    const child = node.node.firstChild;
    if (child?.name !== 'VariableName' || code.slice(child.from, child.to) !== 'note') return;
    if (node.from > from || node.to < to) return;
    let chain = node.node;
    while (chain.parent?.name === 'MemberExpression' && chain.parent.firstChild?.from === chain.from && chain.parent.parent?.name === 'CallExpression') chain = chain.parent.parent;
    found = { from: node.from, to: node.to, chainTo: chain.to };
  } });
  if (!found) throw new Error('Select a note(...) expression or its note string. Arbitrary code cannot be replaced safely.');
  const range = found as { from: number; to: number; chainTo: number };
  return { tabId, from: range.from, to: range.to, original: code.slice(range.from, range.to), soundCode: code.slice(range.to, range.chainTo), valid: true };
}

export type CapturedNote = { key: string; pitch: number; velocity: number; start: number; end?: number };
export type TakeState = 'armed' | 'capturing' | 'review';
export class MidiTake {
  state: TakeState = 'armed';
  notes: CapturedNote[] = [];
  constructor(public destination: Destination) {}
  start() {
    if (this.notes.length) throw new Error('Discard or accept the current take before retrying.');
    this.state = 'capturing';
  }
  note(key: string, pitch: number, velocity: number, at: number, on: boolean) {
    if (this.state !== 'capturing') return;
    const previous = [...this.notes].reverse().find(n => n.key === key && n.end === undefined);
    if (previous) previous.end = Math.max(previous.start, at);
    if (on) this.notes.push({ key, pitch, velocity, start: Math.max(0, at) });
  }
  stop(at: number) {
    for (const note of this.notes) note.end ??= Math.max(note.start, at);
    this.state = 'review';
  }
}
