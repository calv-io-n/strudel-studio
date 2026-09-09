import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { validateInstrumentInput } from '../shared/midi-instrument';

const PresetInput = z.object({ name: z.string().trim().min(1).max(80), code: z.string().min(1).max(200_000) });
const Preset = PresetInput.extend({ id: z.string().uuid(), updatedAt: z.string() });
export class MidiPresets {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private root: string) {}
  async list() {
    await mkdir(this.root, { recursive: true });
    const presets: z.infer<typeof Preset>[] = [];
    for (const file of await readdir(this.root)) {
      if (!/^[a-f0-9-]{36}\.json$/.test(file)) continue;
      presets.push(Preset.parse(JSON.parse(await readFile(path.join(this.root, file), 'utf8'))));
    }
    return presets.sort((a, b) => a.name.localeCompare(b.name));
  }
  save(value: unknown) {
    const task = this.queue.catch(() => {}).then(async () => {
      const input = PresetInput.parse(value); validateInstrumentInput(input.code);
      if ((await this.list()).some(p => p.name.toLowerCase() === input.name.toLowerCase())) throw new Error('A preset already has this name. Choose a new name.');
      const preset = { ...input, id: randomUUID(), updatedAt: new Date().toISOString() };
      const file = path.join(this.root, `${preset.id}.json`), tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(preset, null, 2)); await rename(tmp, file);
      return preset;
    });
    this.queue = task; return task;
  }
}
