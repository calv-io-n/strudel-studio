import { z } from 'zod';
export const RenderOptionsSchema = z.object({ rate: z.union([z.literal(44100), z.literal(48000)]), format: z.enum(['pcm16', 'pcm24', 'float32']), dither: z.boolean(), tail: z.number().min(0).max(15) });
export const RENDER_BUDGET = 512 * 1024 * 1024;
export function renderMemory(seconds: number, rate: number, format: string, assets: number, events: number, voices = 0) {
  const frames = Math.ceil(seconds * rate);
  // Output + channel copies, encoded bytes, asset bytes/decoded buffers, event snapshot and convolution state.
  return frames * (16 + (format === 'pcm16' ? 4 : format === 'pcm24' ? 6 : 8)) + assets + events * 1024 + voices * rate * 2 * 4 * 3;
}
export function assertRenderBudget(bytes: number) { if (!Number.isFinite(bytes) || bytes > RENDER_BUDGET) throw new Error(`Render needs approximately ${Math.ceil(bytes / 1048576)} MiB; the job limit is 512 MiB. Shorten the selection or reduce sample/effect use.`); }
