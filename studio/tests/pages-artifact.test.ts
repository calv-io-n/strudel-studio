import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { ProjectSchema } from '../shared/model';
import { decodeWav } from '../shared/wav';
test('starter payload is two playable projects and six original samples under 1 MB', async () => {
  const root = new URL('../client/public/starter/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.deepEqual(manifest.projects.map((p: any) => p.name), ['Drum Basics', 'Neon Drive']); manifest.projects.forEach((p: unknown) => ProjectSchema.parse(p));
  assert.equal(manifest.assets.length, 6); let total = 0;
  for (const a of manifest.assets) { const wav = await readFile(new URL(`${a.id}.wav`, root)); total += wav.length; const audio = decodeWav(wav); assert.ok(audio.left.some(v => Math.abs(v) > .01)); assert.match(a.description, /CC0/); }
  assert.ok(total < 1_000_000); assert.equal((await readdir(root)).length, 8);
});

test('catalogue manifest pins every original source and hash', async () => {
  const manifest = JSON.parse(await readFile(new URL('../client/public/starter/manifest.json', import.meta.url), 'utf8'));
  const { createHash } = await import('node:crypto');
  for (const pack of manifest.catalogue) for (const file of pack.files) {
    assert.match(pack.revision, /^[a-f0-9]{40}$/); assert.ok(file.url.includes(pack.revision));
    const bytes = await readFile(new URL(`../client/public/starter/${file.id}.wav`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.hash);
  }
});
