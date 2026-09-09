// Build only metadata. Audio is fetched from a pinned repository after Install.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createNeonDrive } from '../studio/server/demo';
import { parseProject } from '../studio/shared/model';
const directory = new URL('../studio/client/public/starter/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
const revision = '769c70596ad9a1fe7f1b813c23be206a44429911';
const repository = 'https://github.com/calv-io-n/strudel';
const files = await Promise.all(manifest.assets.map(async (asset: any) => {
  const path = `studio/client/public/starter/${asset.id}.wav`, bytes = await readFile(new URL(`${asset.id}.wav`, directory));
  return { id: asset.id, path, bytes: bytes.length, hash: createHash('sha256').update(bytes).digest('hex'), url: `https://raw.githubusercontent.com/calv-io-n/strudel/${revision}/${path}` };
}));
const neon = await createNeonDrive(); neon.sessionId = 'Neon-Drive';
const drums = parseProject(manifest.projects.find((p: any) => p.sessionId === 'Drum-Basics'));
await writeFile(new URL('manifest.json', directory), JSON.stringify({ assets: manifest.assets, projects: [drums, neon], catalogue: [{ id: '00000000-0000-4000-8000-000000000100', title: 'Studio Starter', description: 'Six original synthesized drums: kick, snare, hats, clap and tom.', license: 'CC0-1.0', repository, revision, files }] }, null, 2));
