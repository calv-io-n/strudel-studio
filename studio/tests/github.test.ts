import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGitHubLink, discoverGitHub, downloadGitHub } from '../server/github';
const sha = 'a'.repeat(40), tree = 'b'.repeat(40);
test('GitHub discovery resolves slash-containing refs and pins sample downloads to a commit', async () => {
  const calls: string[] = [];
  const request = (async (input: string | URL | Request) => {
    const url = String(input); calls.push(url);
    if (url.endsWith('/commits/feature%2Fkit%2Fsamples')) return new Response('{}', { status: 404 });
    if (url.endsWith('/commits/feature%2Fkit')) return Response.json({ sha, commit: { tree: { sha: tree } } });
    if (url.endsWith(`/git/trees/${tree}`)) return Response.json({ tree: [{ type: 'tree', path: 'samples', sha: 'c'.repeat(40) }] });
    return Response.json({ truncated: false, tree: [{ type: 'blob', mode: '100644', path: 'kick.wav', size: 100 }, { type: 'blob', path: 'README.md', size: 10 }] });
  }) as typeof fetch;
  const result = await discoverGitHub({ url: 'https://github.com/owner/pack/tree/feature/kit/samples' }, request);
  assert.equal(result.revision, sha); assert.deepEqual(result.files, [{ path: 'samples/kick.wav', size: 100 }]);
  assert.ok(calls.every(url => url.startsWith('https://api.github.com/repos/owner/pack/')));
  let downloaded = '';
  await downloadGitHub({ owner: 'owner', repo: 'pack', revision: sha, path: 'samples/kick.wav' }, (async url => { downloaded = String(url); return new Response(new Uint8Array([1, 2])); }) as typeof fetch);
  assert.equal(downloaded, `https://raw.githubusercontent.com/owner/pack/${sha}/samples/kick.wav`);
});
test('GitHub import rejects arbitrary hosts, traversal and oversized downloads', async () => {
  for (const url of ['http://github.com/a/b', 'https://localhost/a/b', 'https://github.com@localhost/a/b']) assert.throws(() => parseGitHubLink(url));
  await assert.rejects(downloadGitHub({ owner: 'a', repo: 'b', revision: sha, path: '../test.wav' }), /Invalid sample/);
  await assert.rejects(downloadGitHub({ owner: 'a', repo: 'b', revision: sha, path: 'test.wav' }, (async () => new Response('x', { headers: { 'content-length': '64000001' } })) as typeof fetch), /size limit/);
});
