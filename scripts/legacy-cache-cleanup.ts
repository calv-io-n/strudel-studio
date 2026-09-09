import { readdir, readFile, lstat, realpath, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { AssetSchema, parseProject } from '../studio/shared/model';
import { assetReferences } from '../studio/shared/asset-references';
export async function cleanupPlan(cachePath: string, projectsPath: string, personalPath: string) {
  const [cache, projects, personal] = await Promise.all([cachePath, projectsPath, personalPath].map(p => realpath(p)));
  if (cache === personal || cache === projects || personal.startsWith(cache + path.sep) || projects.startsWith(cache + path.sep)) throw new Error('Downloaded cache must be separate from personal audio and projects.');
  const sessions = [];
  for (const name of await readdir(projects)) if (name.endsWith('.json')) {
    const file = path.join(projects, name); if (!(await lstat(file)).isFile()) continue;
    // Invalid projects block cleanup rather than hiding their dependencies.
    const project = parseProject(JSON.parse(await readFile(file, 'utf8'))); sessions.push({ name, ids: assetReferences(project) });
  }
  const candidates = [];
  for (const name of await readdir(cache)) {
    if (!/^[a-f0-9-]{36}\.json$/i.test(name)) continue;
    const metadata = path.join(cache, name); if (!(await lstat(metadata)).isFile()) continue;
    const parsed = AssetSchema.safeParse(JSON.parse(await readFile(metadata, 'utf8'))); if (!parsed.success) continue;
    const asset = parsed.data;
    if (asset.id + '.json' !== name || asset.provider !== 'github' || asset.personal || !asset.pack || !asset.source?.url?.startsWith('https://github.com/') || !asset.source.revision || !asset.contentHash) continue;
    const files: string[] = [];
    for (const suffix of [asset.format, `original.${asset.source.originalFormat ?? 'wav'}`]) {
      const file = path.join(cache, `${asset.id}.${suffix}`), info = await lstat(file).catch(() => undefined);
      if (info?.isSymbolicLink()) throw new Error('Refusing a symlink in the downloaded cache.');
      if (info?.isFile()) files.push(file);
    }
    if (files.length) candidates.push({ asset, metadata, files, projects: sessions.filter(p => p.ids.includes(asset.id)).map(p => p.name) });
  }
  return { cache, personal, projects, candidates };
}
export async function applyCleanup(plan: Awaited<ReturnType<typeof cleanupPlan>>) {
  for (const entry of plan.candidates) {
    // Keep provenance and stable identity so projects can explicitly recover the pack.
    const current = AssetSchema.parse(JSON.parse(await readFile(entry.metadata, 'utf8')));
    if (JSON.stringify(current) !== JSON.stringify(entry.asset)) throw new Error('Cache metadata changed; rerun the dry-run report.');
    const temp = `${entry.metadata}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify({ ...current, missing: true }, null, 2), { flag: 'wx' }); await rename(temp, entry.metadata);
    for (const file of entry.files) { if (!(await lstat(file)).isFile()) throw new Error('Cache changed; cleanup stopped.'); await unlink(file); }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const option = (name: string) => { const at = process.argv.indexOf(name); if (at < 0 || !process.argv[at + 1] || process.argv[at + 1].startsWith('--')) throw new Error(`Required: ${name} PATH`); return process.argv[at + 1]; };
  const plan = await cleanupPlan(option('--cache'), option('--projects'), option('--personal-audio'));
  console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'dry-run', ...plan }, null, 2));
  if (process.argv.includes('--apply')) await applyCleanup(plan);
}
