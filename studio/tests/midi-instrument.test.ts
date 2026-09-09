import { reconcileSliders } from '../shared/sliders';
import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, ProjectSchema, type Project } from '../shared/model';
import { defaultInstrument, instrumentFor, MIDI_EDITOR, replaceInstrumentSound, validateInstrumentInput, updateAppliedInstrumentSliders } from '../shared/midi-instrument';
import { assetReferences } from '../shared/asset-references';

test('MIDI instrument migrates assigned sound, persists separately, and accepts instrument slider bindings', () => {
  const project = newProject(); project.midiSound = 'sine';
  const instrument = instrumentFor(project); assert.match(instrument.code, /\.s\("sine"\)/);
  instrument.code += '// unfinished draft';
  project.bindings.push({ id: 'midi-gain', profileId: 'virtual', channel: 1, kind: 'cc', number: 20, enabled: true, pickup: true, target: { kind: 'slider', sliderId: 'gain', tabId: MIDI_EDITOR } });
  const saved: Project = ProjectSchema.parse(project);
  assert.deepEqual(saved.midiInstrument, instrument);
  assert.notEqual(saved.midiInstrument!.code, saved.midiInstrument!.appliedCode);
  assert.equal(saved.tabs.length, 1);
  assert.equal(instrumentFor(newProject()).mode, 'midi');
});

test('library assignment preserves effects and rejects ambiguous or computed selectors', () => {
  const code = 'MIDI.s("sine").lpf(slider(1200, 100, 8000)).room(0.4)';
  assert.equal(replaceInstrumentSound(code, 'piano'), code.replace('"sine"', '"piano"'));
  for (const code of ['MIDI.s(soundName)', 'stack(MIDI.s("sine"), note(70).s("square"))', '// .s("sine")\nMIDI', 'MIDI.s("sine"']) assert.throws(() => replaceInstrumentSound(code, 'triangle'));
  validateInstrumentInput(code);
  assert.throws(() => validateInstrumentInput('note(60).s("sine")'));
  assert.throws(() => validateInstrumentInput('const MIDI = note(60); MIDI.s("sine")'));
});

test('backup references include both draft and applied MIDI instrument samples', () => {
  const project = newProject();
  project.midiInstrument = defaultInstrument('studio_11111111111141118111111111111111');
  project.midiInstrument.code = 'MIDI.s("studio_22222222222242228222222222222222")';
  assert.deepEqual(assetReferences(project).sort(), ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']);
});

test('live knob changes persist without applying unfinished text or losing slider identities', () => {
  const instrument: NonNullable<ReturnType<typeof newProject>['midiInstrument']> = defaultInstrument();
  instrument.appliedCode = 'MIDI.s("sine").gain(slider(0.4,0,1)).lpf(slider(1000,100,8000))';
  const sliders = reconcileSliders(instrument.appliedCode, []);
  instrument.appliedAnchors = sliders.map(({ id, from, fingerprint }) => ({ id, from, fingerprint }));
  instrument.code = instrument.appliedCode + '.unfinished(';
  updateAppliedInstrumentSliders(instrument, new Map([[sliders[0].id, 0.125]]));
  assert.match(instrument.appliedCode, /slider\(0.125,0,1\)/);
  assert.ok(!instrument.appliedCode.includes('unfinished'));
  assert.ok(instrument.code.endsWith('.unfinished('));
  assert.deepEqual(instrument.appliedAnchors.map(s => s.id), sliders.map(s => s.id));
});

test('legacy input source migrates to MIDI without changing effects or slider mappings', () => {
  const project = newProject();
  project.midiInstrument = { ...defaultInstrument(), mode: 'script', code: 'input("c3 e3").s("sine").lpf(slider(1000,100,8000))', appliedCode: 'input("c3 e3").s("sine").lpf(slider(1000,100,8000))' };
  const sliders = reconcileSliders(project.midiInstrument.code, []);
  project.midiInstrument.anchors = project.midiInstrument.appliedAnchors = sliders.map(({ id, from, fingerprint }) => ({ id, from, fingerprint }));
  const result = instrumentFor(project);
  assert.equal(result.mode, 'midi'); assert.equal(result.code, 'MIDI.s("sine").lpf(slider(1000,100,8000))');
  assert.equal(result.anchors[0].id, sliders[0].id);
});
