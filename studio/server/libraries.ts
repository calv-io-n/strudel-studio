import { createHash, randomUUID } from 'node:crypto';
import { writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { AssetSchema, type Asset } from '../shared/model';
import { decodeWav, encodeWav } from '../shared/wav';
import { discoverGitHub, downloadGitHub, parseGitHubLink } from './github';
import type { Store } from './store';

export type LibraryResult = { url: string; added: number; skipped: number; error?: string };
type Options = { request?: typeof fetch; publish?: (event: object) => void; log?: (message: string) => void; concurrency?: number };

/** Splits STUDIO_LIBRARIES into GitHub links; commas, whitespace and #-comment lines separate entries. */
export function parseLibraries(text: string | undefined) {
  return (text ?? '').split('\n').filter(line => !line.trim().startsWith('#')).join(',').split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
}

/** Downloads every WAV in each configured GitHub library into the store's library directory once, keyed by source URL and path. */
export async function syncLibraries(urls: string[], store: Store, options: Options = {}): Promise<LibraryResult[]> {
  const { request = fetch, publish = () => {}, log = message => console.log(message), concurrency = 4 } = options;
  const results: LibraryResult[] = [];
  for (const url of urls) {
    const result: LibraryResult = { url, added: 0, skipped: 0 };
    results.push(result);
    try {
      const { owner, repo, tail } = parseGitHubLink(url);
      const selection = await discoverGitHub({ url }, request);
      const canonical = `https://github.com/${owner}/${repo}`;
      const existing = new Set((await store.assets()).filter(a => a.source?.url === canonical).map(a => a.source!.name));
      const folder = tail.length > 1 ? tail.slice(1).join('/') : '';
      const packName = (folder.split('/').pop() || repo).slice(0, 80);
      const packId = randomUUID();
      const pending = selection.files.filter(file => !existing.has(file.path));
      if (!pending.length) { log(`Library ${owner}/${repo}: ${selection.files.length} sounds already cached`); continue; }
      log(`Library ${owner}/${repo}: fetching ${pending.length} of ${selection.files.length} sounds`);
      let index = 0;
      await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
        while (index < pending.length) {
          const file = pending[index++];
          try {
            const asset = await cacheFile(store, { owner, repo, revision: selection.revision, path: file.path, url: canonical, pack: { id: packId, name: packName } }, request);
            if (asset) result.added++; else result.skipped++;
          } catch (error) { result.skipped++; log(`Library ${owner}/${repo}: skipped ${file.path} (${(error as Error).message})`); }
        }
      }));
      log(`Library ${owner}/${repo}: added ${result.added}, skipped ${result.skipped}`);
      if (result.added) publish({ type: 'library', url, pack: packName, added: result.added });
    } catch (error) { result.error = (error as Error).message; log(`Library ${url}: ${result.error}`); }
  }
  return results;
}

async function cacheFile(store: Store, file: { owner: string; repo: string; revision: string; path: string; url: string; pack: { id: string; name: string } }, request: typeof fetch): Promise<Asset | undefined> {
  const format = file.path.split('.').pop()!.toLowerCase() as 'wav' | 'mp3' | 'ogg' | 'flac';
  if (format !== 'wav') return undefined;
  const original = await downloadGitHub({ owner: file.owner, repo: file.repo, revision: file.revision, path: file.path }, request);
  const decoded = decodeWav(original);
  const duration = decoded.left.length / decoded.rate;
  if (duration <= 0 || duration > 900) throw new Error('Samples must be at most 15 minutes.');
  const hash = createHash('sha256').update(original).digest('hex');
  const label = file.path.split('/').pop()!.replace(/\.[^.]+$/, '').slice(0, 80) || 'Sample';
  const asset = AssetSchema.parse({ id: randomUUID(), createdAt: new Date().toISOString(), label, provider: 'github', duration, format: 'wav', contentHash: hash, pack: { ...file.pack, folder: file.path.split('/').slice(0, -1).join('/') }, source: { name: file.path, url: file.url, revision: file.revision, originalFormat: 'wav' } });
  const dir = store.libraryRoot ?? store.samplesRoot;
  const originalPath = path.join(dir, `${asset.id}.original.wav`), tmp = `${originalPath}.${randomUUID()}.tmp`;
  await writeFile(tmp, original); await rename(tmp, originalPath);
  await store.writeAsset(asset, new Uint8Array(encodeWav(decoded.left, decoded.right, decoded.rate).buffer), dir);
  return asset;
}
