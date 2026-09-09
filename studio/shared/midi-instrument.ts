import { ChangeSet, Text } from '@codemirror/state';
import { reconcileSliders } from './sliders';
import { parser } from '@lezer/javascript';
import type { Project } from './model';

export const MIDI_EDITOR = '@midi';
export function defaultInstrument(sound = 'triangle') {
  const code = `MIDI.s(${JSON.stringify(sound)}).gain(0.35)\n`;
  return { enabled: true, mode: 'midi' as const, code, appliedCode: code, anchors: [] as { id: string; from: number; fingerprint: string }[] };
}
export function instrumentFor(project: Project): NonNullable<Project['midiInstrument']> {
  const instrument: NonNullable<Project['midiInstrument']> = project.midiInstrument ??= defaultInstrument(project.midiSound);
  instrument.enabled ??= true;
  instrument.mode = 'midi';
  for (const field of ['code', 'appliedCode'] as const) {
    if (!/\binput\s*\(/.test(instrument[field])) continue;
    const code = instrument[field], anchors = field === 'code' ? 'anchors' : 'appliedAnchors';
    const edits: { from: number; to: number; insert: string }[] = [];
    parser.parse(code).iterate({ enter(node) {
      if (node.name === 'CallExpression' && node.node.firstChild && code.slice(node.node.firstChild.from, node.node.firstChild.to) === 'input') edits.push({ from: node.from, to: node.to, insert: 'MIDI' });
    } });
    const changes = ChangeSet.of(edits, code.length), previous = reconcileSliders(code, [], undefined, instrument[anchors] ?? []);
    instrument[field] = changes.apply(Text.of(code.split('\n'))).toString();
    instrument[anchors] = reconcileSliders(instrument[field], previous, changes).map(({ id, from, fingerprint }) => ({ id, from, fingerprint }));
  }
  return instrument;
}

/** Only an unambiguous literal sound selector may be replaced by the library. */
export function replaceInstrumentSound(code: string, sound: string) {
  const selectors: { from: number; to: number }[] = [];
  let invalid = false;
  parser.parse(code).iterate({ enter(node) {
    if (node.type.isError) invalid = true;
    if (node.name !== 'CallExpression') return;
    const args = node.node.lastChild, callee = node.node.firstChild;
    if (!args || !callee || !/\.\s*(s|sound)$/.test(code.slice(callee.from, callee.to))) return;
    const value = args.firstChild?.nextSibling;
    if (value?.name !== 'String' || value.nextSibling?.name !== ')') { invalid = true; return; }
    selectors.push({ from: value.from, to: value.to });
  } });
  if (invalid || selectors.length !== 1) throw new Error('Choose one literal .s("sound") selector in the MIDI instrument before assigning a library sound.');
  const { from, to } = selectors[0];
  return code.slice(0, from) + JSON.stringify(sound) + code.slice(to);
}

export function validateInstrumentInput(code: string) {
  let count = 0, redefined = false;
  parser.parse(code).iterate({ enter(node) {
    if (code.slice(node.from, node.to) !== 'MIDI') return;
    if (node.name === 'VariableName') count++;
    if (node.name === 'VariableDefinition') redefined = true;
  } });
  if (!count || redefined) throw new Error('Start your effects chain with MIDI, for example MIDI.s("piano").room(0.4). MIDI is reserved for incoming notes.');
}

/** Persist only live slider edits into the working version, leaving draft text unapplied. */
export function updateAppliedInstrumentSliders(instrument: Pick<NonNullable<Project['midiInstrument']>, 'code' | 'appliedCode' | 'anchors' | 'appliedAnchors'>, values: Map<string, number>) {
  if (!values.size) return;
  const previous = reconcileSliders(instrument.appliedCode, [], undefined, instrument.appliedAnchors ?? []);
  const edits = previous.filter(s => values.has(s.id)).map(s => ({ from: s.from, to: s.to, insert: String(values.get(s.id)) }));
  if (!edits.length) return;
  const changes = ChangeSet.of(edits, instrument.appliedCode.length);
  instrument.appliedCode = changes.apply(Text.of(instrument.appliedCode.split('\n'))).toString();
  instrument.appliedAnchors = reconcileSliders(instrument.appliedCode, previous, changes).map(({ id, from, fingerprint }) => ({ id, from, fingerprint }));
}

export function instrumentSound(code: string): string | undefined {
  const values: string[] = [];
  parser.parse(code).iterate({ enter(node) {
    if (node.name !== 'CallExpression') return;
    const args = node.node.lastChild, callee = node.node.firstChild, value = args?.firstChild?.nextSibling;
    if (!callee || !/\.\s*(s|sound)$/.test(code.slice(callee.from, callee.to)) || value?.name !== 'String' || value.nextSibling?.name !== ')') return;
    const text = code.slice(value.from, value.to);
    try { values.push(text.startsWith('"') ? JSON.parse(text) : text.slice(1, -1)); } catch { /* Not a literal sound name. */ }
  } });
  return values.length === 1 ? values[0] : undefined;
}
