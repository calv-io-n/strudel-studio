/** Import the locally downloaded SampleRadar selection and create the six example sessions. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AssetSchema, ProjectSchema, newProject, palette } from '../studio/shared/model';
import { decodeWav, encodeWav } from '../studio/shared/wav';
import { scanSliders } from '../studio/shared/sliders';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = process.env.STUDIO_URL || 'http://127.0.0.1:5173';
const source = path.resolve(process.argv[2] || path.join(root, '.local/dnb-packs'));
const manifest = JSON.parse(await readFile(path.join(root, 'patterns/sets/dnb-samples.json'), 'utf8'));
async function api(route: string, init?: RequestInit) {
  const response = await fetch(new URL(route, base), init);
  const value = await response.json();
  if (!response.ok) throw new Error(`${route}: ${value.error || response.status}`);
  return value;
}
// Validate all inputs before importing or creating sessions.
for (const entry of manifest.samples) await readFile(path.join(source, entry.pack, entry.path));
const packIds = Object.fromEntries(Object.keys(manifest.packs).map(key => [key, randomUUID()]));
const slots = [];
for (const entry of manifest.samples) {
  const original = await readFile(path.join(source, entry.pack, entry.path));
  const decoded = decodeWav(original);
  const derivative = encodeWav(decoded.left, decoded.right, decoded.rate);
  const pack = manifest.packs[entry.pack];
  const metadata = { name: entry.path, label: entry.label, originalBytes: original.length, originalFormat: 'wav',
    pack: { id: packIds[entry.pack], name: pack.name, folder: path.posix.dirname(entry.path) },
    source: { name: entry.path, url: pack.url, originalFormat: 'wav' }, provider: 'upload' };
  const result = await api('/api/imports/sample', { method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Studio-Metadata': encodeURIComponent(JSON.stringify(metadata)) },
    body: new Blob([original, derivative.buffer]) });
  const asset = AssetSchema.parse(result.asset);
  slots.push({ name: entry.slot, active: asset.id, assets: [asset.id] });
  console.log(`${result.reused ? 'Reused' : 'Imported'} ${entry.slot}: ${entry.label}`);
}
const existing: string[] = await api('/api/projects');
const installed = [];
for (const slug of ['first-light', 'afterglow', 'skyline', 'solar-tide', 'higher-ground', 'northern-lights']) {
  const dir = path.join(root, 'patterns/sets', slug);
  const spec = JSON.parse(await readFile(path.join(dir, 'arrangement.json'), 'utf8'));
  const expectedId = spec.name.replaceAll(' ', '-');
  if (existing.includes(expectedId)) {
    console.log(`${spec.name} already exists; preserved existing session.`);
    installed.push(await api(`/api/projects/${expectedId}`));
    continue;
  }
  const tracks = spec.tracks.map((name: string, index: number) => ({ id: `track-${index + 1}`, name, muted: false }));
  const tabs = await Promise.all(spec.tabs.map(async (tab: { id: string; name: string; track: number; file: string }) => {
    const code = await readFile(path.join(dir, tab.file), 'utf8');
    return { id: tab.id, name: tab.name, color: palette[tab.track % palette.length], code,
      anchors: scanSliders(code).map((slider, i) => ({ id: `${tab.id}-${i}`, from: slider.from, fingerprint: slider.fingerprint })) };
  }));
  const clips = spec.clips.map((clip: { tabId: string; start: number; length: number }, index: number) => ({
    ...clip, id: `${slug}-${index}`, trackId: tracks[spec.tabs.find((tab: { id: string }) => tab.id === clip.tabId).track].id, muted: false,
  }));
  const used = new Set(tabs.flatMap(tab => [...tab.code.matchAll(/soundSlot\("([\w-]+)"\)/g)].map(match => match[1])));
  const songSlots = slots.filter(slot => used.has(slot.name));
  if ([...used].some(name => !songSlots.some(slot => slot.name === name))) throw new Error(`${spec.name} references an unknown sample slot.`);
  const project = ProjectSchema.parse({ ...newProject(), name: spec.name, bpm: spec.bpm, tracks, tabs, clips,
    activeTabId: 'melody', slots: songSlots, assetIds: songSlots.map(slot => slot.active) });
  installed.push(await api('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project) }));
  console.log(`Installed ${spec.name}: ${tabs.length} patterns, ${clips.length} clips, ${spec.bars} bars.`);
}
await mkdir(path.join(root, '.local/dnb-packs'), { recursive: true });
await writeFile(path.join(root, '.local/dnb-packs/installed.json'), JSON.stringify(installed.map(p => ({ name: p.name, sessionId: p.sessionId })), null, 2));
console.log(`Open ${base}, refresh, then choose a song in Sessions and press Play composition.`);
