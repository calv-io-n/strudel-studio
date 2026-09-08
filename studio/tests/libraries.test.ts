import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store';
import { parseLibraries, syncLibraries } from '../server/libraries';
import { encodeWav } from '../shared/wav';

const sha = 'a'.repeat(40), tree = 'b'.repeat(40);
const wav = () => new Uint8Array(encodeWav(new Float32Array(441), new Float32Array(441), 44100).buffer);
function fakeGitHub(repos: Record<string, { path: string; size?: number }[]>) {
  const downloads: string[] = [], api: string[] = [];
  const request = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith('https://api.github.com/repos/')) {
      api.push(url);
      const [owner, repo] = url.slice('https://api.github.com/repos/'.length).split('/');
      const files = repos[`${owner}/${repo}`]; if (!files) return new Response('{}', { status: 404 });
      if (url.endsWith(`/repos/${owner}/${repo}`)) return Response.json({ default_branch: 'main' });
      if (url.includes('/commits/')) return Response.json({ sha, commit: { tree: { sha: tree } } });
      return Response.json({ truncated: false, tree: files.map(f => ({ type: 'blob', mode: '100644', path: f.path, size: f.size ?? 100 })) });
    }
    downloads.push(url);
    if (url.endsWith('.mp3')) return new Response(new Uint8Array([0xff, 0xfb]));
    if (url.endsWith('broken.wav')) return new Response(new Uint8Array([1, 2, 3]));
    return new Response(wav(), { headers: { 'content-type': 'audio/wav' } });
  }) as typeof fetch;
  return { request, downloads, api };
}
test('library URLs parse from comma or newline separated env text', () => {
  assert.deepEqual(parseLibraries(' https://github.com/a/b,\nhttps://github.com/c/d/tree/main/kit \n\n'), ['https://github.com/a/b', 'https://github.com/c/d/tree/main/kit']);
  assert.deepEqual(parseLibraries(undefined), []); assert.deepEqual(parseLibraries('# comment\nhttps://github.com/a/b'), ['https://github.com/a/b']);
});
test('library sync caches WAV packs once, skips undecodable files and survives a broken library', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'studio-libraries-'));
  try {
    const store = new Store(path.join(root, 'projects'), path.join(root, 'sounds'), path.join(root, 'libraries')); await store.init();
    const github = fakeGitHub({ 'tidalcycles/kit': [{ path: 'bd/BD00.WAV' }, { path: 'bd/BD01.WAV' }, { path: 'loop.mp3' }, { path: 'broken.wav' }], 'switchangel/breaks': [{ path: '10_break.wav' }] });
    const events: object[] = [], logs: string[] = [];
    const urls = ['https://github.com/nobody/missing', 'https://github.com/tidalcycles/kit', 'https://github.com/switchangel/breaks/tree/main'];
    const first = await syncLibraries(urls, store, { request: github.request, publish: e => events.push(e), log: m => logs.push(m) });
    assert.deepEqual(first.map(r => [r.url, r.added, r.skipped, !!r.error]), [[urls[0], 0, 0, true], [urls[1], 2, 2, false], [urls[2], 1, 0, false]]);
    assert.equal(github.downloads.length, 4);
    const assets = await store.assets(); assert.equal(assets.length, 3);
    const kick = assets.find(a => a.source?.name === 'bd/BD00.WAV')!;
    assert.equal(kick.provider, 'github'); assert.equal(kick.pack?.name, 'kit'); assert.equal(kick.pack?.folder, 'bd'); assert.equal(kick.label, 'BD00');
    assert.equal(kick.source?.url, 'https://github.com/tidalcycles/kit'); assert.equal(kick.source?.revision, sha); assert.equal(kick.format, 'wav'); assert.ok(kick.duration && Math.abs(kick.duration - 0.01) < 1e-6);
    const breakAsset = assets.find(a => a.source?.name === '10_break.wav')!; assert.equal(breakAsset.pack?.name, 'breaks'); assert.equal(breakAsset.pack?.folder, '');
    assert.equal(new Set(assets.filter(a => a.pack?.name === 'kit').map(a => a.pack!.id)).size, 1);
    assert.equal(events.filter(e => (e as { type: string }).type === 'library').length, 2);
    assert.ok(logs.some(m => /missing/.test(m)));
    const second = await syncLibraries(urls, store, { request: github.request, publish: e => events.push(e), log: () => {} });
    assert.deepEqual(github.downloads.slice(4).map(u => u.split('/').pop()), ['broken.wav'], 'only the failed file is retried'); assert.deepEqual(second.slice(1).map(r => [r.added, r.skipped]), [[0, 2], [0, 0]]);
    assert.equal((await store.assets()).length, 3);
    assert.deepEqual(await readdir(path.join(root, 'sounds')), [], 'library packs stay out of the generated-sound directory');
    assert.equal((await readdir(path.join(root, 'libraries'))).filter(n => n.endsWith('.json')).length, 3);
    assert.equal(await store.locate(kick.id), path.join(root, 'libraries'));
    assert.equal(await store.locate('00000000-0000-4000-8000-000000000000'), store.samplesRoot, 'unknown ids fall back to the primary root');
    const updated = await store.updateAsset(kick.id, { label: 'Kick' }); assert.equal(updated.label, 'Kick');
    assert.equal(JSON.parse(await readFile(path.join(root, 'libraries', `${kick.id}.json`), 'utf8')).label, 'Kick');
  } finally { await rm(root, { recursive: true, force: true }); }
});
