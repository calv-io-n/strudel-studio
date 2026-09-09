import { zip, unzip, strToU8, strFromU8 } from 'fflate';
import { parseProject, AssetSchema, type Project } from '../../shared/model';
import { assetReferences } from '../../shared/asset-references';
import { asset, audioBlob } from './workspace';
import { read, write, exclusive, type Write } from './database';
export async function backupProject(value: Project) {
  const project = parseProject(value), files: Record<string, Uint8Array> = { 'project.json': strToU8(JSON.stringify(project)) }, missing: string[] = []; let total = files['project.json'].length;
  for (const id of assetReferences(project)) {
    try {
      const a = await asset(id); files[`assets/${id}.json`] = strToU8(JSON.stringify(a)); total += files[`assets/${id}.json`].length;
      try { const blob = await audioBlob(id); total += blob.size; if (total > 256_000_000) throw new Error('limit'); files[`assets/${id}.${a.format}`] = new Uint8Array(await blob.arrayBuffer()); } catch (e) { if ((e as Error).message === 'limit') throw e; missing.push(`${id}.${a.format}`); }
      if (a.source?.originalFormat) { const blob = await read<Blob>('originals', id); if (blob) { total += blob.size; if (total > 256_000_000) throw new Error('limit'); files[`assets/${id}.original.${a.source.originalFormat}`] = new Uint8Array(await blob.arrayBuffer()); } else missing.push(`${id}.original.${a.source.originalFormat}`); }
    } catch (e) { if ((e as Error).message === 'limit') throw new Error('Backup exceeds 256 MB. Export a smaller project selection.'); missing.push(`${id}.json`); }
  }
  const externalUrls = [...new Set(project.tabs.flatMap(t => [...t.code.matchAll(/https?:\/\/[^\s"')]+/g)].map(m => m[0])))];
  files['manifest.json'] = strToU8(JSON.stringify({ version: 1, missing, externalUrls }, null, 2));
  const bytes = await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => zip(files, { level: 0 }, (err, data) => err ? reject(err) : resolve(data as Uint8Array<ArrayBuffer>)));
  return new Blob([bytes], { type: 'application/zip' });
}
export async function restoreBackup(blob: Blob) {
  if (blob.size > 260_000_000) throw new Error('Backup exceeds 256 MB.');
  let total = 0, count = 0;
  const files = await new Promise<Record<string, Uint8Array<ArrayBuffer>>>((resolve, reject) => {
    void blob.arrayBuffer().then(bytes => unzip(new Uint8Array(bytes), { filter: f => {
      count++; total += f.originalSize;
      if (count > 10000 || total > 256_000_000 || f.name.startsWith('/') || f.name.includes('\\') || f.name.split('/').includes('..')) { reject(new Error('Unsafe or oversized backup.')); return false; } return true;
    } }, (err, data) => err ? reject(err) : resolve(data as Record<string, Uint8Array<ArrayBuffer>>))).catch(reject);
  });
  if (!files['project.json']) throw new Error('Backup has no project.json.');
  const project = parseProject(JSON.parse(strFromU8(files['project.json'])));
  return exclusive(async () => {
    const entries: Write[] = [], missing: string[] = [];
    for (const id of assetReferences(project)) {
      const metadata = files[`assets/${id}.json`]; if (!metadata) { missing.push(id); continue; }
      const a = AssetSchema.parse(JSON.parse(strFromU8(metadata))); if (a.id !== id) throw new Error('Backup asset identity mismatch.');
      const audio = files[`assets/${id}.${a.format}`]; if (!audio) { missing.push(id); continue; }
      const previous = await read<Blob>('audio', id);
      if (previous) { const bytes = new Uint8Array(await previous.arrayBuffer()); if (bytes.length !== audio.length || bytes.some((b, n) => b !== audio[n])) throw new Error(`Sample ${id} already exists with different audio. Nothing was restored.`); }
      else entries.push({ collection: 'audio', key: id, value: new Blob([audio], { type: a.format === 'wav' ? 'audio/wav' : 'audio/mpeg' }) }, { collection: 'assets', key: id, value: { ...a, missing: undefined } });
      const original = files[`assets/${id}.original.${a.source?.originalFormat}`];
      if (original && !await read('originals', id)) entries.push({ collection: 'originals', key: id, value: new Blob([original]) });
    }
    const base = project.name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 65) || 'session'; let id = `${base}-restored`;
    for (let n = 2; await read('projects', id); n++) id = `${base}-restored-${n}`;
    const next = { ...project, sessionId: id }; entries.push({ collection: 'projects', key: id, value: next, add: true }); await write(entries);
    return { project: next, missing };
  });
}
