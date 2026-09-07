import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createNeonDrive, installNeonDrive } from '../server/demo';
import { ProjectSchema } from '../shared/model';
import { reconcileSliders } from '../shared/sliders';

test('Neon Drive contains a complete four-tab arrangement and stable playable control mappings', async () => {
  const project = await createNeonDrive();
  assert.deepEqual(ProjectSchema.parse(project), project);
  assert.equal(project.bpm, 168); assert.equal(project.tabs.length, 4); assert.equal(project.clips.length, 6);
  assert.equal(Math.max(...project.clips.map(c => c.start + c.length)), 32);
  assert.deepEqual(project.clips.filter(c => c.trackId === 'track-2').map(c => [c.start, c.length]), [[0, 4], [4, 12], [16, 4], [20, 12]]);
  assert.equal(project.bindings.length, 2);
  for (const binding of project.bindings) {
    assert.equal(binding.target.kind, 'slider');
    if (binding.target.kind !== 'slider') continue;
    const target = binding.target, tab = project.tabs.find(t => t.id === target.tabId)!;
    assert.ok(reconcileSliders(tab.code, [], undefined, tab.anchors).some(s => s.id === target.sliderId));
  }
  assert.deepEqual(await createNeonDrive(), project);
});

test('demo installation is atomic, repeatable, and preserves existing projects and recovery', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'neon-drive-'));
  const recovery = path.join(directory, 'recovery.json');
  await writeFile(recovery, 'existing recovery');
  const results = await Promise.all([installNeonDrive(directory), installNeonDrive(directory)]);
  assert.equal(results.filter(result => result.created).length, 1);
  const file = results[0].file;
  assert.equal(ProjectSchema.parse(JSON.parse(await readFile(file, 'utf8'))).name, 'Neon Drive');
  await writeFile(file, 'user edited project');
  assert.equal((await installNeonDrive(directory)).created, false);
  assert.equal(await readFile(file, 'utf8'), 'user edited project');
  assert.equal(await readFile(recovery, 'utf8'), 'existing recovery');
  assert.deepEqual((await readdir(directory)).sort(), ['Neon-Drive.json', 'recovery.json']);
});
