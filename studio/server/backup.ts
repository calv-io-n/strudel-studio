import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseProject, AssetSchema, type Project } from '../shared/model';
import { assetReferences } from '../shared/asset-references';
import type { Store } from './store';

export async function backupProject(project: Project, store: Store) {
  project = parseProject(project);
  const files: Record<string, Uint8Array> = { 'project.json': strToU8(JSON.stringify(project)) };
  const missing: string[] = []; let total = 0;
  for (const id of assetReferences(project)) {
    try {
      const asset = await store.asset(id);
      files[`assets/${id}.json`] = strToU8(JSON.stringify(asset));
      const dir = await store.locate(id);
      try { files[`assets/${id}.${asset.format}`] = await readFile(path.join(dir, `${id}.${asset.format}`)); }
      catch { missing.push(`${id}.${asset.format}`); }
      if (asset.source?.originalFormat) {
        const original = `${id}.original.${asset.source.originalFormat}`;
        try { files[`assets/${original}`] = await readFile(path.join(dir, original)); } catch { missing.push(original); }
      }
    } catch { missing.push(`${id}.json`); }
    total = Object.values(files).reduce((n, bytes) => n + bytes.length, 0);
    if (total > 256_000_000) throw new Error('Backup exceeds 256 MB. Copy the project JSON and referenced sample files from local storage instead.');
  }
  const externalUrls = [...new Set(project.tabs.flatMap(tab => [...tab.code.matchAll(/https?:\/\/[^\s"')]+/g)].map(match => match[0])))];
  files['manifest.json'] = strToU8(JSON.stringify({ version: 1, missing, externalUrls }, null, 2));
  return zipSync(files, { level: 0 });
}
export async function restoreBackup(bytes: Uint8Array, store: Store) {
  let total = 0, count = 0;
  const files = unzipSync(bytes, { filter: file => {
    count++; total += file.originalSize;
    if (count > 10000 || total > 256_000_000 || file.name.startsWith('/') || file.name.includes('\\') || file.name.split('/').includes('..')) throw new Error('Unsafe or oversized backup.');
    return true;
  } });
  if (!files['project.json']) throw new Error('Backup has no project.json.');
  const project = parseProject(JSON.parse(strFromU8(files['project.json'])));
  const references = assetReferences(project), missing: string[] = [];
  const assets = [];
  for (const id of references) {
    const metadata = files[`assets/${id}.json`];
    if (!metadata) { missing.push(id); continue; }
    const asset = AssetSchema.parse(JSON.parse(strFromU8(metadata)));
    if (asset.id !== id) throw new Error('Backup asset identity mismatch.');
    const audio = files[`assets/${id}.${asset.format}`];
    if (!audio) { missing.push(id); continue; }
    let exists = false;
    try {
      await store.asset(id);
      const previous = await readFile(await store.audioPath({ id, format: asset.format }));
      if (!previous.equals(Buffer.from(audio))) throw new Error(`Asset ${id} already exists with different audio. Restore into a separate sample directory.`);
      exists = true;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    assets.push({ asset, audio, exists });
  }
  // Validate all collisions before writing any asset or session.
  const { writeFile } = await import('node:fs/promises');
  for (const { asset, audio, exists } of assets) {
    if (!exists) {
      try { await store.writeAsset(asset, audio); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        // Existing metadata may point to missing audio; preserve its identity.
        const current = await store.asset(asset.id);
        if (current.format !== asset.format) throw error;
        await writeFile(path.join(store.samplesRoot, `${asset.id}.${asset.format}`), audio, { flag: 'wx' });
      }
    }
    if (asset.source?.originalFormat) {
      const name = `${asset.id}.original.${asset.source.originalFormat}`, original = files[`assets/${name}`];
      if (original) { try { await writeFile(path.join(store.samplesRoot, name), original, { flag: 'wx' }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; } }
    }
  }
  return { project: await store.create(project), missing };
}
