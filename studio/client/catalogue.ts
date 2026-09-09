import { z } from 'zod';
import { AssetSchema, ProjectSchema, type Asset, type Project } from '../shared/model';
import { assetReferences } from '../shared/asset-references';
import { all, read, write, exclusive, type Write } from './storage/database';
import { assets, audioBlob, hash, releaseSampleUrls } from './storage/workspace';
import { prepareAudio } from './import-audio';
const PackSchema = z.object({ id: z.string().uuid(), title: z.string(), description: z.string(), license: z.string(), repository: z.string().url(), revision: z.string().regex(/^[a-f0-9]{40}$/), files: z.array(z.object({ id: z.string().uuid(), path: z.string(), bytes: z.number().int().positive().max(64_000_000), hash: z.string().regex(/^[a-f0-9]{64}$/), url: z.string().url() })).max(500) });
const Manifest = z.object({ catalogue: z.array(PackSchema), assets: z.array(AssetSchema), projects: z.array(ProjectSchema) });
export type CataloguePack = z.infer<typeof PackSchema>;
async function metadata() { const r = await fetch('/starter/manifest.json'); if (!r.ok) throw new Error('Catalogue metadata is unavailable. Folder and ZIP import still work.'); return Manifest.parse(await r.json()); }
async function download(url: string, max: number, signal: AbortSignal) {
  if (new URL(url).origin !== 'https://raw.githubusercontent.com') throw new Error('Unsupported catalogue host.');
  const r = await fetch(url, { signal, credentials: 'omit', redirect: 'error' });
  if (!r.ok || !r.body) throw new Error(`Pack download failed (${r.status}). Retry or import a folder/ZIP.`);
  const reader = r.body.getReader(), chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > max) throw new Error('Pack file exceeds its declared size.'); chunks.push(part.value); } }
  finally { await reader.cancel().catch(() => {}); }
  return new Blob(chunks).arrayBuffer();
}
export async function installPack(pack: CataloguePack, manifestAssets: Asset[], signal: AbortSignal, progress: (text: string) => void) {
  if (pack.files.reduce((n, f) => n + f.bytes, 0) > 256_000_000) throw new Error('Pack exceeds 256 MB.');
  const context = new AudioContext(), staged: { asset: Asset; original: ArrayBuffer; wav: ArrayBuffer }[] = [];
  let stagedBytes = 0;
  try {
    // Sequential decoding bounds audio memory; network cancellation is immediate.
    for (const [index, file] of pack.files.entries()) {
      signal.throwIfAborted(); progress(`Installing ${index + 1}/${pack.files.length} · ${file.path.split('/').pop()}`);
      const original = await download(file.url, file.bytes, signal);
      if (await hash(original) !== file.hash) throw new Error('Pack checksum mismatch. Nothing was installed.');
      const source = manifestAssets.find(a => a.id === file.id); if (!source) throw new Error('Missing pack metadata.');
      const { wav, precision } = await prepareAudio(original, 'wav', context);
      stagedBytes += original.byteLength + wav.byteLength;
      if (stagedBytes > 256_000_000) throw new Error('Decoded pack exceeds the 256 MB installation budget. Import selected files instead.');
      staged.push({ original, wav, asset: AssetSchema.parse({ ...source, precision, contentHash: file.hash, provider: 'github', personal: false, missing: false, source: { name: file.path, url: pack.repository, revision: pack.revision, originalFormat: 'wav' }, catalogue: { packId: pack.id, revision: pack.revision, path: file.path, hash: file.hash } }) });
    }
    await exclusive(async () => {
      signal.throwIfAborted(); const entries: Write[] = [];
      for (const item of staged) {
        const previous = await read<Asset>('assets', item.asset.id);
        if (previous && previous.contentHash && previous.contentHash !== item.asset.contentHash) throw new Error('Pack asset conflicts with existing audio. Nothing was installed.');
        entries.push({ collection: 'assets', key: item.asset.id, value: { ...item.asset, personal: previous?.personal ?? (previous && !previous.catalogue ? true : false) } }, { collection: 'audio', key: item.asset.id, value: new Blob([item.wav], { type: 'audio/wav' }) }, { collection: 'originals', key: item.asset.id, value: new Blob([item.original]) });
      }
      entries.push({ collection: 'settings', key: `pack:${pack.id}`, value: { revision: pack.revision, installed: true } });
      await write(entries);
    });
  } finally { await context.close(); }
}
export async function packImpact(packId: string) {
  const sounds = (await assets()).filter(a => a.catalogue?.packId === packId || a.pack?.id === packId);
  const ids = new Set(sounds.map(a => a.id));
  return { sounds, projects: (await all<Project>('projects')).filter(p => assetReferences(p).some(id => ids.has(id))) };
}
export async function removePack(packId: string) {
  await exclusive(async () => {
    const { sounds } = await packImpact(packId), entries: Write[] = [];
    for (const sound of sounds) {
      if (!sound.catalogue || sound.personal) continue;
      entries.push({ collection: 'audio', key: sound.id, delete: true }, { collection: 'originals', key: sound.id, delete: true }, { collection: 'assets', key: sound.id, value: { ...sound, missing: true } });
    }
    entries.push({ collection: 'settings', key: `pack:${packId}`, delete: true }); await write(entries);
  });
  releaseSampleUrls();
}
export class Catalogue {
  readonly root = document.createElement('section');
  private abort?: AbortController;
  constructor(private changed: () => Promise<void>) { this.root.id = 'catalogue-packs'; }
  async refresh() {
    if (this.abort) return;
    const manifest = await metadata(); this.root.replaceChildren();
    const heading = document.createElement('h3'); heading.textContent = 'Available packs'; this.root.append(heading);
    for (const pack of manifest.catalogue) {
      const row = document.createElement('article'), title = document.createElement('strong'), description = document.createElement('p'), status = document.createElement('p'), install = document.createElement('button'), remove = document.createElement('button'), cancel = document.createElement('button');
      row.className = 'catalogue-pack'; title.textContent = `${pack.title} · ${pack.license}`; description.textContent = `${pack.description} ${pack.files.length} files · ${(pack.files.reduce((n, f) => n + f.bytes, 0) / 1e6).toFixed(2)} MB download`;
      status.setAttribute('role', 'status'); cancel.textContent = 'Cancel installation'; cancel.hidden = true; cancel.onclick = () => this.abort?.abort();
      const installed = await read('settings', `pack:${pack.id}`); install.textContent = installed ? 'Reinstall pack' : 'Install pack'; remove.textContent = 'Remove pack'; remove.disabled = !installed;
      install.onclick = async () => {
        if (this.abort) return; this.abort = new AbortController(); install.disabled = true; cancel.hidden = false;
        try {
          await installPack(pack, manifest.assets, this.abort.signal, text => status.textContent = text);
          const drums = manifest.projects.find(p => p.sessionId === 'Drum-Basics');
          if (drums) await exclusive(async () => { if (!await read('projects', drums.sessionId!)) await write([{ collection: 'projects', key: drums.sessionId!, value: drums, add: true }]); });
          await this.changed(); status.textContent = 'Installed in this browser'; remove.disabled = false; install.textContent = 'Reinstall pack';
        } catch (error) { status.textContent = (error as Error).message; }
        finally { this.abort = undefined; install.disabled = false; cancel.hidden = true; }
      };
      remove.onclick = async () => {
        const impact = await packImpact(pack.id);
        const dialog = document.createElement('dialog'), text = document.createElement('p'), confirm = document.createElement('button'), close = document.createElement('button');
        text.textContent = `Remove downloaded copies? Referenced by: ${impact.projects.map(p => p.name).join(', ') || 'no saved projects'}. Personal imports are retained. Projects keep missing-sound references for reinstall.`;
        confirm.textContent = 'Remove downloaded pack'; close.textContent = 'Cancel'; close.onclick = () => dialog.close();
        confirm.onclick = async () => { try { await removePack(pack.id); await this.changed(); dialog.close(); await this.refresh(); } catch (error) { text.textContent = (error as Error).message; } };
        dialog.append(text, confirm, close); dialog.onclose = () => dialog.remove(); document.body.append(dialog); dialog.showModal();
      };
      let installedBytes = 0; for (const a of (await assets()).filter(a => a.catalogue?.packId === pack.id && !a.missing)) installedBytes += (await audioBlob(a.id)).size;
      status.textContent = installed ? `${(installedBytes / 1e6).toFixed(2)} MB installed` : 'Not installed · audio downloads only after Install';
      row.append(title, description, install, remove, cancel, status); this.root.append(row);
    }
  }
}
