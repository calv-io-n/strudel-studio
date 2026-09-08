import { z } from 'zod';
import { parser } from '@lezer/javascript';

export type Destination = { tabId: string; from: number; to: number; original: string; soundCode: string; valid: boolean };
/** Resolve a complete note expression, including selection of its mini-notation string. */
export function destinationFor(code: string, tabId: string, from: number, to: number): Destination {
  const tree = parser.parse(code);
  let found: { from: number; to: number; chainTo: number } | undefined;
  tree.iterate({ enter(node) {
    if (node.name !== 'CallExpression') return;
    const child = node.node.firstChild;
    if (child?.name !== 'VariableName' || !['note', 'stack', 'timeCat'].includes(code.slice(child.from, child.to))) return;
    let chain = node.node;
    while (chain.parent?.name === 'MemberExpression' && chain.parent.firstChild?.from === chain.from && chain.parent.parent?.name === 'CallExpression') chain = chain.parent.parent;
    if (node.from > from || chain.to < to || from === to && from >= node.to) return;
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

export function phraseNotes(notes: CapturedNote[], length: number, grid: number, now: number) {
  if (!Number.isFinite(length) || length <= 0 || length > 4096 || !Number.isFinite(grid) || grid < 0) throw new Error('Choose a phrase length from ¼ to 4096 cycles and valid quantization.');
  const snap = (n: number) => grid ? Math.round(n / grid) * grid : n;
  return notes.filter(n => n.start < length).map(n => {
    const start = Math.min(grid ? Math.max(0, length - grid) : length, Math.max(0, snap(n.start)));
    const end = Math.min(length, Math.max(start + (grid || .0001), snap(n.end ?? now)));
    return { ...n, start, end };
  }).filter(n => n.end > n.start);
}
/** Each voice occupies the full phrase, preserving leading/trailing rests and overlaps. */
export function transcribe(notes: CapturedNote[], length: number, grid: number, now: number): string {
  const num = (n: number) => String(Number(n.toFixed(6)));
  const voices = phraseNotes(notes, length, grid, now).map(n => {
    const segments: string[] = [];
    if (n.start > 0) segments.push(`[${num(n.start)}, silence]`);
    segments.push(`[${num(n.end - n.start)}, note(${n.pitch}).velocity(${num(n.velocity / 127)})]`);
    if (n.end < length) segments.push(`[${num(length - n.end)}, silence]`);
    return `timeCat(${segments.join(', ')}).slow(${num(length)})`;
  });
  return voices.length ? `stack(\n  ${voices.join(',\n  ')}\n)` : '';
}

export const PendingMidiSchema = z.object({
  destination: z.object({ tabId: z.string(), from: z.number().int().nonnegative(), to: z.number().int().nonnegative(), original: z.string().max(200000), soundCode: z.string().max(200000), valid: z.boolean() }),
  notes: z.array(z.object({ key: z.string(), pitch: z.number().int().min(0).max(127), velocity: z.number().int().min(1).max(127), start: z.number().min(0).max(4096), end: z.number().min(0).max(4096).optional() })).min(1).max(10000),
  length: z.number().positive().max(4096), grid: z.number().min(0).max(1), cps: z.number().positive(), fallback: z.boolean().default(false),
});

/** Stable weighted mini-notation, with separate lanes for overlapping notes. */
export function transcribeNotes(notes: CapturedNote[], length: number, grid = 1 / 16): string {
  if (![1 / 4, 1 / 8, 1 / 16, 1 / 32].includes(grid)) throw new Error('Choose a beat grid.');
  const snapped = phraseNotes(notes, length, grid, length).sort((a, b) => a.start - b.start || a.pitch - b.pitch || a.end - b.end);
  const lanes: typeof snapped[] = [];
  for (const note of snapped) {
    const lane = lanes.find(l => l.at(-1)!.end <= note.start);
    if (lane) lane.push(note); else lanes.push([note]);
  }
  const weighted = (token: string, steps: number) => steps === 1 ? token : `${token}@${steps}`;
  const voices = lanes.map(lane => {
    const pitches: string[] = [], velocities: string[] = [];
    let cursor = 0;
    const rest = (end: number) => { const steps = Math.round((end - cursor) / grid); if (steps) { pitches.push(weighted('~', steps)); velocities.push(weighted('0', steps)); } cursor = end; };
    for (const note of lane) {
      rest(note.start);
      const name = `${['c', 'cs', 'd', 'ds', 'e', 'f', 'fs', 'g', 'gs', 'a', 'as', 'b'][note.pitch % 12]}${Math.floor(note.pitch / 12) - 1}`;
      const steps = Math.round((note.end - note.start) / grid);
      pitches.push(weighted(name, steps)); velocities.push(weighted(String(Number((note.velocity / 127).toFixed(3))), steps)); cursor = note.end;
    }
    rest(length);
    const sameVelocity = lane.every(n => n.velocity === lane[0].velocity);
    const velocity = sameVelocity ? String(Number((lane[0].velocity / 127).toFixed(3))) : JSON.stringify(velocities.join(' '));
    return `note(${JSON.stringify(pitches.join(' '))}).velocity(${velocity})${length === 1 ? '' : `.slow(${length})`}`;
  });
  return voices.length > 1 ? `stack(\n  ${voices.join(',\n  ')}\n)` : voices[0] ?? '';
}
