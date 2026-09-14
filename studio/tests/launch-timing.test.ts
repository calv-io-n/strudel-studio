import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Text } from '@codemirror/state';
import { reconcileTempo, normalizeTabTempo, normalizeProjectTempo, tempoRate, standaloneCode, headerEnd, beatPosition, beatDuration } from '../shared/tempo';
import { newProject, ProjectSchema } from '../shared/model';
import { scanSliders } from '../shared/sliders';
import { trimLeft, canPlace } from '../shared/clips';
import { guideOptedOut, saveGuidePreference } from '../client/quick-start-preference';

test('tempo normalization preserves expressions and comments and maps slider identities', () => {
  const code = 'setcpm(90 / 4)\n// setcps(8)\nconst name = "setcpm(9)"\nsetCps(0.5);\n$: note("c e").slow(2).gain(slider(.5, 0, 1))';
  const slider = scanSliders(code)[0], tab = { ...newProject().tabs[0], code, anchors: [{ id: 'knob', from: slider.from, fingerprint: slider.fingerprint }] };
  const normalized = normalizeTabTempo(tab, 120);
  assert.equal(normalized.code.slice(0, headerEnd(normalized.code)), '// Tempo: 120 BPM — controlled by project BPM\nsetcpm(120 / 4)\n');
  assert.ok(normalized.code.includes('// Previous tempo: setcpm(90 / 4)'));
  assert.ok(normalized.code.includes('// setcps(8)'));
  assert.ok(normalized.code.includes('const name = "setcpm(9)"'));
  assert.ok(normalized.code.includes('.slow(2).gain(slider(.5, 0, 1))'));
  assert.equal(normalized.anchors[0].from, scanSliders(normalized.code)[0].from);
  assert.equal(normalized.anchors[0].id, 'knob');
  assert.deepEqual(normalizeTabTempo(normalized, 120), normalized);
  assert.ok(reconcileTempo('const x = setcpm(300); note(60)', 120).complex);
  assert.throws(() => standaloneCode({ ...tab, code: 'const x = setcpm(300); note(60)' }, 120), /embedded tempo/);
  assert.equal(reconcileTempo(code, 120).changes.apply(Text.of(code.split('\n'))).toString(), normalized.code);
});

test('v7 inherits old project tempo and round-trips explicit source overrides', () => {
  const project = ProjectSchema.parse({ ...newProject(), version: 6 });
  assert.equal(project.version, 7); assert.equal(project.tabs[0].tempoBpm, undefined);
  project.tabs[0].tempoBpm = 90;
  assert.equal(tempoRate(project.tabs[0], 120), .75);
  project.appliedPatterns = { [project.tabs[0].id]: 'setcpm(50)\nnote(60)' };
  normalizeProjectTempo(project);
  assert.ok(project.tabs[0].code.includes('Pattern: 90 BPM (all placements)'));
  assert.ok(project.appliedPatterns[project.tabs[0].id].includes('setcpm(120 / 4)'));
  assert.deepEqual(ProjectSchema.parse(JSON.parse(JSON.stringify(project))), project);
  assert.ok(standaloneCode(project.tabs[0], 120).includes('setcpm(90 / 4)'));
  const audio = { ...project.tabs[0], audioAssetId: '00000000-0000-4000-8000-000000000001' };
  assert.equal(ProjectSchema.safeParse({ ...project, tabs: [audio] }).success, false);
});

test('beat mapping and both-edge trim preserve source phase with tempo overrides', () => {
  assert.equal(beatPosition(0), 1); assert.equal(beatPosition(2.25), 10); assert.equal(beatDuration(.25), 1);
  const clip = { id: 'a', tabId: 'p', trackId: 't', start: 2, length: 4, sourceOffset: 1, muted: false };
  const trimmed = trimLeft(clip, 2.25, .75);
  assert.equal(trimmed.start + trimmed.length, 6); assert.equal(trimmed.sourceOffset, 1.1875);
  assert.equal(canPlace([], trimmed), true);
  assert.equal(canPlace([], trimLeft({ ...clip, sourceOffset: 0 }, 1)), false);
  assert.equal(canPlace([{ ...clip, id: 'neighbor', start: 6 }], trimmed), true);
});

test('Quick Start only honors explicit opt-out and reports failed persistence', () => {
  const values = new Map([['studio.quick-start', 'seen']]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(guideOptedOut(storage), false);
  assert.equal(saveGuidePreference(storage, true), true); assert.equal(guideOptedOut(storage), true);
  saveGuidePreference(storage, false); assert.equal(guideOptedOut(storage), false);
  assert.equal(guideOptedOut({ getItem: () => { throw Error('blocked'); } }), false);
  assert.equal(saveGuidePreference({ setItem: () => { throw Error('quota'); } }, true), false);
});

test('recorded take left trims retain seconds when project tempo later changes', () => {
  const clip = { id: 'take', tabId: 'p', trackId: 't', start: 0, length: 4, takeId: 'audio', takeLeadSeconds: .1, muted: false };
  const trimmed = trimLeft(clip, .25, 1, .5);
  assert.equal(trimmed.takeOffsetSeconds, .4); assert.equal(trimmed.takeLeadSeconds, 0); assert.equal(trimmed.sourceOffset, 0);
  assert.equal(trimmed.start + trimmed.length, 4);
  const restored = trimLeft(trimmed, 0, 1, .5);
  assert.equal(canPlace([], restored), false); // Would extend before recorded source zero.
});
