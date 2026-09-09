import { z } from 'zod';
import { AssetSchema, ProjectSchema } from '../../shared/model';
import { read, write, exclusive, type Write } from './database';
export async function seedStarters() {
  if (await read('settings', 'starter-version')) return;
  const response = await fetch('/starter/manifest.json'); if (!response.ok) throw new Error('Starter collection could not load. Reload to retry.');
  const manifest = z.object({ assets: z.array(AssetSchema), projects: z.array(ProjectSchema) }).parse(await response.json());
  const audio = await Promise.all(manifest.assets.map(async a => { const r = await fetch(`/starter/${a.id}.wav`); if (!r.ok) throw new Error('Starter sound could not load. Reload to retry.'); return r.blob(); }));
  await exclusive(async () => {
    if (await read('settings', 'starter-version')) return;
    const entries: Write[] = [];
    for (const [i, a] of manifest.assets.entries()) if (!await read('assets', a.id)) entries.push({ collection: 'assets', key: a.id, value: a, add: true }, { collection: 'audio', key: a.id, value: audio[i], add: true });
    for (const p of manifest.projects) if (!await read('projects', p.sessionId!)) entries.push({ collection: 'projects', key: p.sessionId!, value: p, add: true });
    entries.push({ collection: 'settings', key: 'starter-version', value: 1 }); await write(entries);
  });
}
