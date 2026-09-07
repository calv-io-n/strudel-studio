import { mkdir, readFile, readdir, rename, writeFile, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AssetSchema, ProjectSchema, type Asset, type Project } from '../shared/model';

export class Store {
  constructor(readonly root: string, readonly samplesRoot: string) {}
  async init() { await Promise.all([mkdir(this.root, { recursive: true }), mkdir(this.samplesRoot, { recursive: true })]); }
  projectPath(name: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(name)) throw new Error('Use letters, numbers, hyphens or underscores in the save name.');
    return path.join(this.root, `${name}.json`);
  }
  async save(name: string, value: unknown) {
    const project = ProjectSchema.parse(value);
    const file = this.projectPath(name);
    const tmp = `${file}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(project, null, 2));
    await rename(tmp, file);
    return project;
  }
  async load(name: string): Promise<Project> { return ProjectSchema.parse(JSON.parse(await readFile(this.projectPath(name), 'utf8'))); }
  async create(value: unknown): Promise<Project> {
    const project = ProjectSchema.parse(value);
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
    for (const name of await readdir(this.samplesRoot)) {
      if (!name.endsWith('.json')) continue;
      try { result.push(AssetSchema.parse(JSON.parse(await readFile(path.join(this.samplesRoot, name), 'utf8')))); }
      catch { /* Other sample metadata may share this directory. */ }
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async asset(id: string) {
    if (!/^[\da-f-]{36}$/i.test(id)) throw new Error('Invalid sample ID');
    return AssetSchema.parse(JSON.parse(await readFile(path.join(this.samplesRoot, `${id}.json`), 'utf8')));
  }
  async writeAsset(asset: Asset, audio: Uint8Array) {
    await writeFile(path.join(this.samplesRoot, `${asset.id}.${asset.format}`), audio, { flag: 'wx' });
    await writeFile(path.join(this.samplesRoot, `${asset.id}.json`), JSON.stringify(asset, null, 2), { flag: 'wx' });
  }
  async labelAsset(id: string, label: string) {
    const asset = AssetSchema.parse({ ...await this.asset(id), label });
    const file = path.join(this.samplesRoot, `${asset.id}.json`);
    const tmp = `${file}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(asset, null, 2));
    await rename(tmp, file);
    return asset;
  }
}
