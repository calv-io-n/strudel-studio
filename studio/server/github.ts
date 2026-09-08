import { z } from 'zod';

const segment = /^[A-Za-z0-9_.-]+$/;
const supported = /\.(wav|mp3|ogg|flac)$/i;
export type GitHubSelection = { owner: string; repo: string; revision: string; files: { path: string; size: number }[]; url: string };
export function parseGitHubLink(link: string) {
  const url = new URL(link);
  if (url.protocol !== 'https:' || !['github.com', 'raw.githubusercontent.com'].includes(url.hostname) || url.username || url.password || url.port) throw new Error('Use a public HTTPS GitHub repository, folder, or audio-file link.');
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const [owner, rawRepo] = parts, repo = rawRepo?.replace(/\.git$/, '');
  if (!owner || !repo || !segment.test(owner) || !segment.test(repo) || [owner, repo].some(v => v === '.' || v === '..')) throw new Error('Invalid GitHub repository.');
  const tail = url.hostname === 'raw.githubusercontent.com' ? parts.slice(2) : parts.length > 2 && ['tree', 'blob', 'raw'].includes(parts[2]) ? parts.slice(3) : [];
  if (parts.length > 2 && !tail.length || tail.some(p => !p || p === '..' || p === '.') || tail.length > 30) throw new Error('Use a repository, tree, or blob link.');
  return { owner, repo, tail };
}
async function githubJSON(path: string, request: typeof fetch) {
  const token = process.env.STUDIO_GITHUB_TOKEN?.trim();
  const response = await request(`https://api.github.com${path}`, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Strudel-Studio', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Object.assign(new Error(response.status === 403 || response.status === 429 ? 'GitHub rate limit or access restriction. Retry later.' : `GitHub source unavailable (${response.status}). Check the link and revision.`), { status: response.status });
  const text = await boundedBody(response, 8_000_000); return JSON.parse(text.toString());
}
export async function discoverGitHub(input: unknown, request: typeof fetch = fetch): Promise<GitHubSelection> {
  const { url, revision: selectedRevision } = z.object({ url: z.string().max(2000), revision: z.string().max(100).optional() }).parse(input);
  const { owner, repo, tail } = parseGitHubLink(url); const base = `/repos/${owner}/${repo}`;
  let commit: any, folder = '';
  if (selectedRevision) {
    commit = await githubJSON(`${base}/commits/${encodeURIComponent(selectedRevision)}`, request);
    const joined = tail.join('/'); folder = joined.startsWith(selectedRevision + '/') ? joined.slice(selectedRevision.length + 1) : tail.slice(1).join('/');
  } else if (tail.length) {
    for (let n = tail.length; n >= 1; n--) {
      try { commit = await githubJSON(`${base}/commits/${encodeURIComponent(tail.slice(0, n).join('/'))}`, request); folder = tail.slice(n).join('/'); break; }
      catch (error) { if ((error as { status?: number }).status !== 404 && (error as { status?: number }).status !== 422) throw error; }
    }
    if (!commit) throw new Error('The selected branch, tag, or commit could not be resolved.');
  } else {
    const repository = await githubJSON(base, request);
    commit = await githubJSON(`${base}/commits/${encodeURIComponent(repository.default_branch)}`, request);
  }
  const revision = z.string().regex(/^[a-f0-9]{40}$/).parse(commit.sha);
  let treeSha = z.string().regex(/^[a-f0-9]{40}$/).parse(commit.commit.tree.sha);
  let prefix = '';
  if (folder && !supported.test(folder)) {
    for (const part of folder.split('/')) {
      const tree = await githubJSON(`${base}/git/trees/${treeSha}`, request);
      const child = tree.tree.find((entry: any) => entry.path === part && entry.type === 'tree');
      if (!child) throw new Error('The selected folder does not exist at this revision.'); treeSha = child.sha;
    }
    prefix = folder + '/';
  }
  const tree = await githubJSON(`${base}/git/trees/${treeSha}?recursive=1`, request);
  if (tree.truncated) throw new Error('Repository listing is too large. Choose a narrower folder.');
  const files = tree.tree.filter((entry: any) => entry.type === 'blob' && entry.mode !== '120000' && supported.test(entry.path) && (!supported.test(folder) || entry.path === folder)).map((entry: any) => ({ path: prefix + entry.path, size: entry.size }));
  if (files.length > 500) throw new Error('More than 500 samples found. Choose a narrower folder.');
  if (!files.length) throw new Error('No WAV, MP3, OGG or FLAC files found at this location.');
  return { owner, repo, revision, files, url };
}
export async function boundedBody(response: Response, limit: number) {
  if (Number(response.headers.get('content-length')) > limit) throw new Error('Remote file exceeds the size limit.');
  if (!response.body) throw new Error('Remote response has no content.');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > limit) throw new Error('Remote file exceeds the size limit.'); chunks.push(value); } }
  finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
export async function downloadGitHub(input: unknown, request: typeof fetch = fetch) {
  const { owner, repo, revision, path } = z.object({ owner: z.string().regex(segment), repo: z.string().regex(segment), revision: z.string().regex(/^[a-f0-9]{40}$/), path: z.string().max(1000) }).parse(input);
  if (!supported.test(path) || path.split('/').some(p => !p || p === '.' || p === '..') || path.includes('\\') || [owner, repo].some(p => p === '.' || p === '..')) throw new Error('Invalid sample path.');
  const response = await request(`https://raw.githubusercontent.com/${owner}/${repo}/${revision}/${path.split('/').map(encodeURIComponent).join('/')}`, { redirect: 'error', signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`GitHub download failed (${response.status}). Retry or select another source.`);
  return boundedBody(response, 64_000_000);
}
