import { SAMPLE_LIMIT, decodeEditableWav, type EditableAudio } from './sample-edit';
import { stretchRegion } from './sample-alignment';
import { validateAnchors, type ClipAnchor } from './clip-timing';
import { encodeWav } from './wav';
/** Energy rises plus positive changes across spectral bands; attack suggestions in frames, not word recognition. */
export function suggestAttacks(audio: EditableAudio, start: number, end: number) {
  const hop = Math.max(1, Math.round(audio.rate * .01)), size = 256, stride = Math.max(1, Math.floor(audio.rate / 8000));
  const rows: { frame: number; energy: number; flux: number }[] = []; const previous = new Float32Array(12); let maxEnergy = 0;
  for (let frame = start; frame < end; frame += hop) {
    const window = new Float32Array(size); let energy = 0;
    for (let i = 0; i < size; i++) { const p = Math.min(end - 1, frame + i * stride), v = (audio.left[p] + audio.right[p]) * .5; energy += v * v; window[i] = v * (.5 - .5 * Math.cos(2 * Math.PI * i / (size - 1))); }
    energy = Math.sqrt(energy / size); maxEnergy = Math.max(maxEnergy, energy); let flux = 0;
    for (let band = 0; band < 12; band++) {
      const bin = Math.round(2 * Math.pow(1.35, band)), coefficient = 2 * Math.cos(2 * Math.PI * bin / size); let a = 0, b = 0;
      for (const v of window) { const c = v + coefficient * a - b; b = a; a = c; }
      const magnitude = Math.sqrt(Math.max(0, a * a + b * b - coefficient * a * b)) / size; flux += Math.max(0, magnitude - previous[band]); previous[band] = magnitude;
    }
    rows.push({ frame, energy, flux });
  }
  const candidates: { frame: number; score: number }[] = [];
  for (let i = 1; i < rows.length - 1; i++) {
    const r = rows[i], history = rows.slice(Math.max(0, i - 20), i), mean = history.reduce((s, v) => s + v.flux, 0) / history.length;
    const rise = Math.max(0, r.energy - rows[i - 1].energy);
    if (r.energy < Math.max(.002, maxEnergy * .035) || r.flux < Math.max(.001, mean * 1.6) || r.flux < rows[i + 1].flux || rise < maxEnergy * .005) continue;
    const frame = Math.max(start + 1, r.frame - Math.round(audio.rate * .01)), score = r.flux + rise;
    if (frame >= end - 1) continue;
    const last = candidates.at(-1);
    if (last && frame - last.frame < audio.rate * .12) { if (score > last.score) candidates[candidates.length - 1] = { frame, score }; } else candidates.push({ frame, score });
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 96).sort((a, b) => a.frame - b.frame).map(a => a.frame);
}
const PART_SECONDS = 20;
/** Timeline-linear audio from the first anchor: stretched intervals, then the rest of the sample at 1×. */
export async function renderAnchoredAudio(audio: EditableAudio, anchors: ClipAnchor[], bpm: number) {
  const rate = audio.rate, total = audio.left.length; validateAnchors(anchors, total / rate, bpm);
  const spb = 60 / bpm, first = anchors[0], toFrame = (s: number) => Math.min(total, Math.round(s * rate)), toOut = (b: number) => Math.round((b - first.beat) * spb * rate);
  // Points pair a source frame with an output frame; long intervals are split so each stretch call stays small.
  const points: { frame: number; out: number }[] = [{ frame: toFrame(first.source), out: 0 }];
  const extend = (frame: number, out: number) => { const from = points[points.length - 1], parts = Math.max(1, Math.ceil((frame - from.frame) / (rate * PART_SECONDS))); for (let j = 1; j <= parts; j++) points.push({ frame: Math.round(from.frame + (frame - from.frame) * j / parts), out: Math.round(from.out + (out - from.out) * j / parts) }); };
  for (let i = 1; i < anchors.length; i++) extend(toFrame(anchors[i].source), toOut(anchors[i].beat));
  const stretched = points[points.length - 1], budget = Math.floor((SAMPLE_LIMIT - 56) / (audio.channels * 4));
  if (stretched.out > budget) throw new Error('Aligned audio exceeds 64 MB.');
  const tail = Math.min(total - stretched.frame, budget - stretched.out);
  if (tail > 0) extend(stretched.frame + tail, stretched.out + tail);
  const frames = points[points.length - 1].out, left = new Float32Array(frames), right = new Float32Array(frames), weights = new Float32Array(frames), overlap = Math.round(rate * .01);
  for (let i = 1; i < points.length; i++) {
    const begin = points[i - 1].out, end = points[i].out, length = end - begin, count = points[i].frame - points[i - 1].frame;
    if (length <= 0 || count <= 0) continue;
    const ratio = count / length; // source frames per output frame
    const pre = Math.min(overlap, begin, Math.floor(points[i - 1].frame / ratio)), post = Math.min(overlap, frames - end, Math.floor((total - points[i].frame) / ratio));
    // Give WSOLA real context beyond the join; zero flushing can otherwise truncate a syllable tail.
    const contextOut = ratio === 1 ? overlap : Math.ceil(rate * .15 / ratio), contextIn = Math.round(contextOut * ratio), padded = count + contextIn * 2;
    const source = { ...audio, left: new Float32Array(padded), right: new Float32Array(padded) };
    for (let j = 0; j < padded; j++) { const at = Math.max(0, Math.min(total - 1, points[i - 1].frame - contextIn + j)); source.left[j] = audio.left[at]; source.right[j] = audio.right[at]; }
    // Frame rounding can push an interval a hair past the 0.5×–2× limit; stretch to the nearest legal length and pad the remainder.
    const wanted = length + contextOut * 2, target = Math.max(Math.ceil(padded * .5), Math.min(Math.floor(padded * 2), wanted));
    const rendered = decodeEditableWav(new Uint8Array(await stretchRegion(source, 0, padded, target, false)));
    const sample = (channel: Float32Array, index: number) => channel[Math.min(channel.length - 1, index)];
    for (let j = 0; j < length + pre + post; j++) {
      const at = begin - pre + j, index = contextOut - pre + j;
      const weight = j < pre ? j / pre : j >= pre + length ? (length + pre + post - 1 - j) / Math.max(1, post) : 1;
      left[at] += sample(rendered.left, index) * weight; right[at] += sample(rendered.right, index) * weight; weights[at] += weight;
    }
  }
  const fadeFrames = rate * .005;
  for (let i = 0; i < frames; i++) { if (weights[i]) { left[i] /= weights[i]; right[i] /= weights[i]; } const fade = Math.min(1, i / fadeFrames, (frames - 1 - i) / fadeFrames); left[i] *= fade; right[i] *= fade; }
  return encodeWav(left, right, rate, { format: 'float32', channels: audio.channels as 1 | 2 }).buffer;
}
