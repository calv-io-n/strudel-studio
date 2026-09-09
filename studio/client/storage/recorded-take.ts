import { AssetSchema, type Asset, type Project } from '../../shared/model';
import { placeRecordedTake, type TakeIdentity } from '../../shared/recorded-take';
import { wavInfo } from '../../shared/wav';
import { exclusive, read, write, type Write } from './database';
import { hash, ProjectConflict } from './workspace';
export async function takeAsset(id: string, label: string, recording: NonNullable<Asset['recording']>, blob: Blob): Promise<Asset> {
  const bytes = await blob.arrayBuffer(), info = wavInfo(new Uint8Array(bytes));
  return AssetSchema.parse({ id, label, provider: 'recording', personal: true, createdAt: new Date().toISOString(), format: 'wav', duration: info.frames / info.rate, contentHash: await hash(bytes), precision: { rate: info.rate, channels: info.channels, bits: info.bits, working: 'float32', originalAvailable: true }, recording: { ...recording, duration: info.frames / info.rate, trimStart: 0, trimEnd: info.frames / info.rate, rate: info.rate, frames: info.frames } });
}
export async function commitRecordedTake(project: Project, identity: TakeIdentity, audio: { asset: Asset; blob: Blob }[], pendingMeta: string) {
  return exclusive(async () => {
    if (!project.sessionId) throw new Error('Save this session before recording.');
    const current = await read<Project>('projects', project.sessionId);
    if (current?.tabs.some(t => t.id === identity.tabId)) return current;
    if (!current || (current.revision ?? 0) !== (project.revision ?? 0)) throw new ProjectConflict();
    const next = { ...placeRecordedTake(project, audio[0].asset, identity), revision: (current.revision ?? 0) + 1 };
    const entries: Write[] = audio.flatMap(({ asset, blob }) => [{ collection: 'assets' as const, key: asset.id, value: asset }, { collection: 'audio' as const, key: asset.id, value: blob }, { collection: 'originals' as const, key: asset.id, value: blob }]);
    entries.push({ collection: 'projects', key: project.sessionId, value: next }, { collection: 'settings', key: 'recovery', value: next }, { collection: 'pending', key: pendingMeta, delete: true });
    await write(entries); return next;
  });
}
