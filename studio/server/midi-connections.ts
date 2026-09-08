import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';

const port = z.string().trim().min(1).max(300).refine(value => !value.startsWith('studio:'), 'Choose an external MIDI input.');
const settings = z.object({ ports: z.array(port).max(50) });
const change = z.object({ port, connected: z.boolean() }).strict();

/** Device subscriptions belong to this Studio installation, not an open song or browser. */
export class MidiConnections {
  ports: string[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private directory: string, private changed: (ports: string[]) => void) {}
  private get file() { return path.join(this.directory, 'midi-connections.json'); }
  async init(legacyPorts: string[]) {
    try { this.ports = settings.parse(JSON.parse(await readFile(this.file, 'utf8'))).ports; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await this.save(settings.parse({ ports: [...new Set(legacyPorts)].slice(0, 50) }).ports);
    }
    this.changed([...this.ports]);
  }
  private async save(ports: string[]) {
    await mkdir(this.directory, { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ ports }, null, 2));
    await rename(temporary, this.file);
    this.ports = ports;
  }
  update(value: unknown) {
    const request = change.parse(value);
    const operation = this.queue.catch(() => {}).then(async () => {
      const next = new Set(this.ports);
      if (request.connected) next.add(request.port); else next.delete(request.port);
      const { ports } = settings.parse({ ports: [...next].sort() });
      await this.save(ports);
      this.changed([...ports]);
      return { ports: [...ports] };
    });
    this.queue = operation;
    return operation;
  }
}
