import { randomUUID } from 'node:crypto';
import type { Asset, Generation, Job } from '../shared/model';
import type { Store } from './store';

export function fixtureWav() {
  const rate = 24000, length = rate;
  const wav = Buffer.alloc(44 + length * 2);
  wav.write('RIFF'); wav.writeUInt32LE(36 + length * 2, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(length * 2, 40);
  for (let i = 0; i < length; i++) wav.writeInt16LE(Math.round(Math.sin(i / rate * Math.PI * 2 * 110) * Math.exp(-i / rate * 5) * 12000), 44 + i * 2);
  return wav;
}
export class Generator {
  jobs = new Map<string, Job>();
  constructor(private store: Store, private apiKey: string | undefined, readonly fixture = false, private fetcher: typeof fetch = fetch) {}
  get configured() { return this.fixture || Boolean(this.apiKey); }
  start(input: Generation) {
    if (!this.configured) throw new Error('Add ELEVENLABS_API_KEY to .env and restart the studio.');
    if ([...this.jobs.values()].some((j) => j.state === 'running')) throw new Error('A generation is already running.');
    const job: Job = { id: randomUUID(), state: 'running' };
    this.jobs.set(job.id, job);
    // Keep the status cache bounded during a long session.
    if (this.jobs.size > 100) this.jobs.delete(this.jobs.keys().next().value!);
    void this.run(job, input);
    return job;
  }
  private async run(job: Job, input: Generation) {
    try {
      let audio: Uint8Array;
      if (this.fixture) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        audio = fixtureWav();
      } else {
        const response = await this.fetcher('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
          method: 'POST', headers: { 'xi-api-key': this.apiKey!, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: input.prompt, duration_seconds: input.duration, loop: input.loop, model_id: 'eleven_text_to_sound_v2' }),
          signal: AbortSignal.timeout(180_000),
        });
        if (!response.ok) {
          // Never surface upstream bodies that could contain sensitive details.
          throw new Error(`ElevenLabs returned HTTP ${response.status}. Check your key, quota, and sound-effects access. No automatic retry was made.`);
        }
        audio = new Uint8Array(await response.arrayBuffer());
        if (!audio.byteLength || audio.byteLength > 32 * 1024 * 1024) throw new Error('ElevenLabs returned an empty or oversized audio file.');
      }
      const asset: Asset = { ...input, id: randomUUID(), createdAt: new Date().toISOString(), format: this.fixture ? 'wav' : 'mp3', provider: this.fixture ? 'fixture' : 'elevenlabs' };
      await this.store.writeAsset(asset, audio);
      Object.assign(job, { state: 'complete', asset });
    } catch (error) {
      Object.assign(job, { state: 'failed', error: error instanceof Error ? error.message : 'Sound generation failed.' });
    }
  }
}
