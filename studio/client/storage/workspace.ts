import { z } from 'zod';
import { AssetSchema, parseProject, type Asset, type Project } from '../../shared/model';
import { validateInstrumentInput } from '../../shared/midi-instrument';
import { all, read, write, exclusive, type Write } from './database';
export { read, write, all } from './database';
const nameSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
export async function projects() { return (await all<Project>('projects')).map(p => p.sessionId!).sort(); }
export async function loadProject(name: string) { const p = await read('projects', nameSchema.parse(name)); if (!p) throw new Error('Project not found.'); return parseProject(p); }
export async function saveProject(name: string, value: unknown) { const p = parseProject(value); nameSchema.parse(name); await write([{ collection: 'projects', key: name, value: { ...p, sessionId: name } }]); return { ...p, sessionId: name }; }
export async function createProject(value: unknown) {
  return exclusive(async () => { const p = parseProject(value); const base = p.name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 70) || 'session'; let id = base === 'recovery' ? 'session' : base;
    for (let n = 2; await read('projects', id); n++) id = `${base}-${n}`;
    const next = { ...p, sessionId: id }; await write([{ collection: 'projects', key: id, value: next, add: true }]); return next;
  });
}
export async function assets() { return (await all<Asset>('assets')).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export async function asset(id: string) { const a = await read('assets', id); if (!a) throw new Error('Sample not found.'); return AssetSchema.parse(a); }
export async function audioBlob(id: string) { const blob = await read<Blob>('audio', id); if (!blob) throw new Error('Sample audio is missing. Restore a backup or recover the original file.'); return blob; }
export async function updateAsset(id: string, metadata: Partial<Pick<Asset, 'label' | 'description' | 'tags'>>) {
  return exclusive(async () => { const a = AssetSchema.parse({ ...await asset(id), ...metadata }); await write([{ collection: 'assets', key: id, value: a }]); return a; });
}
export async function labelPack(id: string, name: string) {
  return exclusive(async () => { const entries = (await assets()).filter(a => a.pack?.id === id).map(a => ({ collection: 'assets' as const, key: a.id, value: AssetSchema.parse({ ...a, pack: { ...a.pack, name } }) })); if (!entries.length) throw new Error('Pack not found.'); await write(entries); return assets(); });
}
export async function hash(bytes: ArrayBuffer) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join(''); }
export function wavDuration(bytes: ArrayBuffer) {
  const v = new DataView(bytes), text = (n: number) => new TextDecoder().decode(bytes.slice(n, n + 4));
  if (bytes.byteLength < 48 || text(0) !== 'RIFF' || text(8) !== 'WAVE' || text(36) !== 'data' || v.getUint16(20, true) !== 1 || v.getUint16(22, true) !== 2 || v.getUint16(34, true) !== 16 || v.getUint32(40, true) !== bytes.byteLength - 44) throw new Error('Expected stereo PCM WAV audio.');
  const rate = v.getUint32(24, true), duration = (bytes.byteLength - 44) / 4 / rate;
  if (rate < 8000 || rate > 192000 || duration <= 0 || duration > 900) throw new Error('Samples must be at most 15 minutes.'); return duration;
}
const ImportMetadata = z.object({ recoverId: z.string().uuid().optional(), name: z.string().min(1).max(1000), label: z.string().trim().min(1).max(80), originalFormat: z.enum(['wav', 'mp3', 'ogg', 'flac']), pack: AssetSchema.shape.pack.optional(), source: AssetSchema.shape.source.optional(), provider: z.enum(['upload', 'github']).default('upload') });
export async function importSample(input: unknown, original: ArrayBuffer, wav: ArrayBuffer) {
  const m = ImportMetadata.parse(input); if (!original.byteLength || original.byteLength > 64_000_000) throw new Error('Original file exceeds 64 MB.'); const duration = wavDuration(wav), contentHash = await hash(original);
  return exclusive(async () => {
    const existing = (await assets()).find(a => m.recoverId ? a.id === m.recoverId : a.contentHash === contentHash);
    if (m.recoverId && existing && !existing.missing) throw new Error('This sound already has audio.');
    if (m.recoverId && existing?.contentHash && existing.contentHash !== contentHash) throw new Error('Choose the original file to recover this sound.');
    if (existing && !existing.missing) return { asset: existing, reused: true };
    const a = AssetSchema.parse(existing ? { ...existing, missing: undefined } : { id: m.recoverId ?? crypto.randomUUID(), createdAt: new Date().toISOString(), label: m.label, provider: m.provider, duration, format: 'wav', contentHash, pack: m.pack, source: { ...m.source, name: m.name, originalFormat: m.originalFormat } });
    if (a.format === 'mp3' && m.originalFormat !== 'mp3') throw new Error('Restore the original MP3 file.');
    await write([{ collection: 'assets', key: a.id, value: a }, { collection: 'audio', key: a.id, value: new Blob([a.format === 'mp3' ? original : wav], { type: a.format === 'mp3' ? 'audio/mpeg' : 'audio/wav' }) }, { collection: 'originals', key: a.id, value: new Blob([original]) }]);
    return { asset: a, reused: !!existing };
  });
}
export async function saveRecording(input: unknown, blob: Blob) {
  const m = z.object({ label: z.string().trim().min(1).max(80), recording: AssetSchema.shape.recording.unwrap() }).parse(input);
  if (blob.size > 180_000_000) throw new Error('Recording exceeds the audio limit.'); const bytes = await blob.arrayBuffer(), duration = wavDuration(bytes);
  if (m.recording.trimEnd <= m.recording.trimStart || m.recording.trimEnd > m.recording.duration || Math.abs(duration - m.recording.trimEnd + m.recording.trimStart) > .01) throw new Error('Recording trim does not match audio.');
  const a = AssetSchema.parse({ ...m, id: crypto.randomUUID(), createdAt: new Date().toISOString(), format: 'wav', provider: 'recording', duration, contentHash: await hash(bytes) });
  await write([{ collection: 'assets', key: a.id, value: a }, { collection: 'audio', key: a.id, value: blob }]); return a;
}
export type MidiPreset = { id: string; name: string; code: string; updatedAt: string };
export async function presets() { return (await all<MidiPreset>('presets')).sort((a, b) => a.name.localeCompare(b.name)); }
export async function savePreset(input: unknown) {
  const m = z.object({ name: z.string().trim().min(1).max(80), code: z.string().min(1).max(200_000) }).parse(input); validateInstrumentInput(m.code);
  return exclusive(async () => { if ((await presets()).some(p => p.name.toLowerCase() === m.name.toLowerCase())) throw new Error('A preset already has this name.'); const p = { ...m, id: crypto.randomUUID(), updatedAt: new Date().toISOString() }; await write([{ collection: 'presets', key: p.id, value: p }]); return p; });
}
const urls = new Map<string, string>();
export async function sampleUrl(id: string) { if (!urls.has(id)) urls.set(id, URL.createObjectURL(await audioBlob(id))); return urls.get(id)!; }
export function releaseSampleUrls(keep: string[] = []) { for (const [id, url] of urls) if (!keep.includes(id)) { URL.revokeObjectURL(url); urls.delete(id); } }
if (typeof window !== 'undefined') window.addEventListener('pagehide', event => { if (!event.persisted) releaseSampleUrls(); });
