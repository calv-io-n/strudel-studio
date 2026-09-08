import { randomUUID, createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { z } from 'zod';
import { AssetSchema } from '../shared/model';
import type { Store } from './store';

export async function saveRecording(req: IncomingMessage, store: Store) {
  if (req.headers['content-type'] !== 'audio/wav') throw new Error('Expected WAV audio.');
  const metadata = z.object({ label: z.string().trim().min(1).max(80), recording: AssetSchema.shape.recording.unwrap() }).parse(JSON.parse(decodeURIComponent(String(req.headers['x-studio-metadata'] || ''))));
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 180_000_000) throw new Error('Recording exceeds the 15-minute audio limit.'); chunks.push(chunk); }
  const wav = Buffer.concat(chunks);
  if (wav.length < 48 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE' || wav.toString('ascii', 36, 40) !== 'data' || wav.readUInt16LE(20) !== 1 || wav.readUInt16LE(22) !== 2 || wav.readUInt16LE(34) !== 16 || wav.readUInt32LE(40) !== wav.length - 44) throw new Error('Invalid stereo PCM WAV recording.');
  const rate = wav.readUInt32LE(24), duration = (wav.length - 44) / 4 / rate;
  if (rate < 8000 || rate > 192000 || !Number.isFinite(duration) || duration <= 0 || duration > 900) throw new Error('Recording must contain between 0 and 900 seconds of audio.');
  if (metadata.recording.trimEnd <= metadata.recording.trimStart || metadata.recording.trimEnd > metadata.recording.duration || Math.abs(duration - (metadata.recording.trimEnd - metadata.recording.trimStart)) > .01) throw new Error('Recording trim metadata does not match the audio.');
  const asset = AssetSchema.parse({ ...metadata, id: randomUUID(), createdAt: new Date().toISOString(), format: 'wav', provider: 'recording', duration, contentHash: createHash('sha256').update(wav).digest('hex') });
  await store.writeAsset(asset, wav); return asset;
}
