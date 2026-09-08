import { createHash, randomUUID } from 'node:crypto';
import { writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import { z } from 'zod';
import { AssetSchema } from '../shared/model';
import type { Store } from './store';

const metadataSchema = z.object({ name: z.string().min(1).max(1000), label: z.string().trim().min(1).max(80), originalBytes: z.number().int().positive().max(64_000_000), originalFormat: z.enum(['wav', 'mp3', 'ogg', 'flac']), pack: AssetSchema.shape.pack.optional(), source: AssetSchema.shape.source.optional(), provider: z.enum(['upload', 'github']).default('upload') });
let queue = Promise.resolve<unknown>(undefined);
export async function importSample(req: IncomingMessage, store: Store) {
  const metadata = metadataSchema.parse(JSON.parse(decodeURIComponent(String(req.headers['x-studio-metadata'] || ''))));
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 244_000_000) throw new Error('Audio upload exceeds the limit.'); chunks.push(chunk); }
  const bytes = Buffer.concat(chunks), original = bytes.subarray(0, metadata.originalBytes), wav = bytes.subarray(metadata.originalBytes);
  if (original.length !== metadata.originalBytes || wav.length < 48 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE' || wav.toString('ascii', 36, 40) !== 'data' || wav.readUInt16LE(20) !== 1 || wav.readUInt16LE(22) !== 2 || wav.readUInt16LE(34) !== 16 || wav.readUInt32LE(40) !== wav.length - 44) throw new Error('Expected an original file and a stereo PCM WAV derivative.');
  const rate = wav.readUInt32LE(24), duration = (wav.length - 44) / 4 / rate;
  if (rate < 8000 || rate > 192000 || duration <= 0 || duration > 900) throw new Error('Samples must be at most 15 minutes.');
  const hash = createHash('sha256').update(original).digest('hex');
  const operation = queue.catch(() => {}).then(async () => {
    const existing = (await store.assets()).find(a => a.contentHash === hash);
    if (existing && !existing.missing) return { asset: existing, reused: true };
    const asset = existing ? { ...existing, missing: undefined } : AssetSchema.parse({ id: randomUUID(), createdAt: new Date().toISOString(), label: metadata.label, provider: metadata.provider, duration, format: 'wav', contentHash: hash, pack: metadata.pack, source: { ...metadata.source, name: metadata.name, originalFormat: metadata.originalFormat } });
    const originalPath = path.join(store.samplesRoot, `${asset.id}.original.${metadata.originalFormat}`);
    const tmp = `${originalPath}.${randomUUID()}.tmp`;
    await writeFile(tmp, original); await rename(tmp, originalPath);
    if (existing) { await writeFile(path.join(store.samplesRoot, `${asset.id}.${asset.format}`), wav, { flag: 'wx' }); }
    else await store.writeAsset(asset, wav);
    return { asset, reused: !!existing };
  });
  queue = operation; return operation;
}
