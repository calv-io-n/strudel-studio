import { mkdir, readFile, readdir, rename, writeFile, link, unlink, access } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AssetSchema, parseProject, type Asset, type Project } from '../shared/model';

export class Store {
  /** `samplesRoot` receives generated, imported and recorded sounds; `libraryRoot` holds boot-time GitHub packs and is read alongside it. */
  constructor(readonly root: string, readonly samplesRoot: string, readonly libraryRoot?: string) {}
  get roots() { return this.libraryRoot && this.libraryRoot !== this.samplesRoot ? [this.samplesRoot, this.libraryRoot] : [this.samplesRoot]; }
  async init() { await Promise.all([this.root, ...this.roots].map(dir => mkdir(dir, { recursive: true }))); }
  /** Directory holding an asset's metadata and audio; unknown ids resolve to the primary root so new files land there. */
  async locate(id: string) {
    if (!/^[\da-f-]{36}$/i.test(id)) throw new Error('Invalid sample ID');
    for (const dir of this.roots) { try { await access(path.join(dir, `${id}.json`)); return dir; } catch { /* try the next root */ } }
    return this.samplesRoot;
  }
  async audioPath(asset: Pick<Asset, 'id' | 'format'>) { return path.join(await this.locate(asset.id), `${asset.id}.${asset.format}`); }
  projectPath(name: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(name)) throw new Error('Use letters, numbers, hyphens or underscores in the save name.');
    return path.join(this.root, `${name}.json`);
  }
  async save(name: string, value: unknown) {
    const project = parseProject(value);
    const file = this.projectPath(name);
    const tmp = `${file}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(project, null, 2));
    await rename(tmp, file);
    return project;
  }
  async load(name: string): Promise<Project> { return parseProject(JSON.parse(await readFile(this.projectPath(name), 'utf8'))); }
  async create(value: unknown): Promise<Project> {
    const project = parseProject(value);
    let base = project.name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 70) || 'session';
    if (base === 'recovery') base = 'session';
    for (let suffix = 1; ; suffix++) {
      const sessionId = suffix === 1 ? base : `${base}-${suffix}`;
      const next = { ...project, sessionId };
      const file = this.projectPath(sessionId), tmp = `${file}.${randomUUID()}.tmp`;
      await writeFile(tmp, JSON.stringify(next, null, 2));
      try { await link(tmp, file); return next; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      finally { await unlink(tmp); }
    }
  }
  async projects() { return (await readdir(this.root)).filter((s) => s.endsWith('.json') && s !== '_recovery.json').map((s) => s.slice(0, -5)); }
  async assets(): Promise<Asset[]> {
    const result: Asset[] = [];
    for (const dir of this.roots) for (const name of await readdir(dir)) {
      if (!name.endsWith('.json')) continue;
      try {
        const asset = AssetSchema.parse(JSON.parse(await readFile(path.join(dir, name), 'utf8')));
        try { await access(path.join(dir, `${asset.id}.${asset.format}`)); } catch { asset.missing = true; }
        result.push(asset);
      }
      catch { /* Other sample metadata may share this directory. */ }
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async asset(id: string) {
    return AssetSchema.parse(JSON.parse(await readFile(path.join(await this.locate(id), `${id}.json`), 'utf8')));
  }
  async writeAsset(asset: Asset, audio: Uint8Array, dir = this.samplesRoot) {
    asset = AssetSchema.parse(asset);
    const file = path.join(dir, `${asset.id}.${asset.format}`);
    await writeFile(file, audio, { flag: 'wx' });
    try { await writeFile(path.join(dir, `${asset.id}.json`), JSON.stringify(asset, null, 2), { flag: 'wx' }); }
    catch (error) { await unlink(file); throw error; }
  }
  async labelPack(id: string, name: string) {
    const packAssets = (await this.assets()).filter(asset => asset.pack?.id === id);
    if (!packAssets.length) throw new Error('Pack not found.');
    for (const asset of packAssets) {
      const updated = AssetSchema.parse({ ...asset, pack: { ...asset.pack!, name } });
      const file = path.join(await this.locate(asset.id), `${asset.id}.json`), tmp = `${file}.${randomUUID()}.tmp`;
      await writeFile(tmp, JSON.stringify(updated, null, 2)); await rename(tmp, file);
    }
    return this.assets();
  }
  async labelAsset(id: string, label: string) {
    return this.updateAsset(id, { label });
  }
  async updateAsset(id: string, metadata: Partial<Pick<Asset, 'label' | 'description' | 'tags'>>) {
    const asset = AssetSchema.parse({ ...await this.asset(id), ...metadata });
    const file = path.join(await this.locate(asset.id), `${asset.id}.json`);
    const tmp = `${file}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(asset, null, 2));
    await rename(tmp, file);
    return asset;
  }
}
