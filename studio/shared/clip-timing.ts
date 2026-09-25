/** One time map for audio clips: anchors pair a second in the sample with a beat from the clip start. */
export type ClipAnchor = { source: number; beat: number };
export type TimedClip = { start: number; length: number; anchors?: ClipAnchor[] };
export const ANCHOR_LIMIT = 128, STRETCH_SOURCE_LIMIT = 60, STRETCH_OUTPUT_LIMIT = 120;
const RATIO_TOLERANCE = 1e-6;
const spb = (bpm: number) => 60 / bpm;
export type Anchored = { anchors?: ClipAnchor[] };
export function clipAnchors(clip: TimedClip | Anchored): ClipAnchor[] { return clip.anchors?.length ? clip.anchors : [{ source: 0, beat: 0 }]; }
/** Drop the anchors key when it only restates the default. */
export function withAnchors<T extends object>(clip: T, anchors: ClipAnchor[]): T & Anchored {
  const { anchors: _, ...rest } = clip as T & Anchored;
  return (anchors.length === 1 && !anchors[0].source && !anchors[0].beat ? rest : { ...rest, anchors }) as T & Anchored;
}
export function isStretched(anchors: ClipAnchor[], bpm: number) {
  return anchors.some((a, i) => i && Math.abs((a.beat - anchors[i - 1].beat) * spb(bpm) - (a.source - anchors[i - 1].source)) > 1e-9);
}
export function renderKey(anchors: ClipAnchor[], bpm: number) { return isStretched(anchors, bpm) ? `${bpm}:${JSON.stringify(anchors)}` : 'raw'; }
/** Structural checks shared with clip placement; no audio knowledge. */
export function anchorsWellFormed(anchors: ClipAnchor[]) {
  return anchors.length >= 1 && anchors.length <= ANCHOR_LIMIT && anchors.every((a, i) => Number.isFinite(a.source) && Number.isFinite(a.beat) && a.source >= 0 && a.beat >= 0 && (!i || (a.source > anchors[i - 1].source && a.beat > anchors[i - 1].beat)));
}
export function validateAnchors(anchors: ClipAnchor[], duration: number, bpm: number) {
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) throw new Error('Choose a tempo from 20 to 300 BPM.');
  if (!anchors.length || anchors.length > ANCHOR_LIMIT || anchors.some(a => !Number.isFinite(a.source) || !Number.isFinite(a.beat) || a.source < 0 || a.beat < 0)) throw new Error('Invalid anchor position.');
  for (let i = 1; i < anchors.length; i++) if (anchors[i].source <= anchors[i - 1].source || anchors[i].beat <= anchors[i - 1].beat) throw new Error(`Anchor ${i}: anchors cannot cross.`);
  if (anchors.length === 1) return;
  const first = anchors[0], last = anchors[anchors.length - 1];
  if (last.source > duration) throw new Error('Anchors must stay inside the original phrase.');
  if (last.source - first.source > STRETCH_SOURCE_LIMIT || (last.beat - first.beat) * spb(bpm) > STRETCH_OUTPUT_LIMIT) throw new Error(`Align phrases up to ${STRETCH_SOURCE_LIMIT} seconds, with output up to ${STRETCH_OUTPUT_LIMIT} seconds.`);
  for (let i = 1; i < anchors.length; i++) {
    const ratio = (anchors[i].beat - anchors[i - 1].beat) * spb(bpm) / (anchors[i].source - anchors[i - 1].source);
    if (ratio < .5 - RATIO_TOLERANCE || ratio > 2 + RATIO_TOLERANCE) throw new Error(`Interval ${i}: move this anchor closer (supported stretch is 0.5×–2×).`);
  }
}
/** Sample seconds at a clip beat; undefined during the lead silence. */
export function sourceAtBeat(anchors: ClipAnchor[], bpm: number, beat: number): number | undefined {
  if (beat < anchors[0].beat) return;
  const last = anchors[anchors.length - 1];
  if (beat >= last.beat) return last.source + (beat - last.beat) * spb(bpm);
  const i = anchors.findIndex(a => a.beat > beat), a = anchors[i - 1], b = anchors[i];
  return a.source + (beat - a.beat) / (b.beat - a.beat) * (b.source - a.source);
}
/** Clip beat at a sample second; undefined before the first anchor. */
export function beatAtSource(anchors: ClipAnchor[], bpm: number, source: number): number | undefined {
  if (source < anchors[0].source) return;
  const last = anchors[anchors.length - 1];
  if (source >= last.source) return last.beat + (source - last.source) / spb(bpm);
  const i = anchors.findIndex(a => a.source > source), a = anchors[i - 1], b = anchors[i];
  return a.beat + (source - a.source) / (b.source - a.source) * (b.beat - a.beat);
}
export function endBeat(anchors: ClipAnchor[], bpm: number, duration: number) { return beatAtSource(anchors, bpm, duration) ?? anchors[0].beat; }
/** Move the clip's left edge without moving audio on the timeline; extending left adds silence. */
export function trimClipStart<T extends TimedClip>(clip: T, start: number, bpm: number): T & Anchored {
  const shift = (start - clip.start) * 4, anchors = clipAnchors(clip);
  const first = shift > 0 ? sourceAtBeat(anchors, bpm, shift) : undefined;
  const kept = anchors.filter(a => shift <= 0 || a.beat - shift > 1e-9).map(a => ({ source: a.source, beat: a.beat - shift }));
  return withAnchors({ ...clip, start, length: clip.start + clip.length - start }, first === undefined ? kept : [{ source: first, beat: 0 }, ...kept]);
}
/** Stretch the audible window (first anchor to the clip end or audio end) uniformly onto whole beats. */
export function fitToBeats(clip: TimedClip, duration: number, bpm: number, beats: number) {
  if (!Number.isInteger(beats) || beats < 1 || beats > 16384) throw new Error('Choose a whole number of beats from 1 to 16384.');
  const first = clipAnchors(clip)[0], windowEnd = sourceAtBeat(clipAnchors(clip), bpm, clip.length * 4);
  const end = Math.min(duration, windowEnd ?? 0), seconds = end - first.source;
  if (!(seconds > 0)) throw new Error('This clip has no audio in its playback window.');
  const ratio = beats * spb(bpm) / seconds;
  if (ratio < .5 - 1e-9 || ratio > 2 + 1e-9) {
    const min = Math.max(1, Math.ceil(seconds * bpm / 120 - 1e-8)), max = Math.floor(seconds * bpm / 30 + 1e-8);
    throw new Error(`Choose ${min}–${max} beats for this phrase (0.5×–2× stretch). Crop a shorter phrase in the sample editor for a shorter fit.`);
  }
  return { anchors: [first, { source: end, beat: first.beat + beats }], length: Math.ceil(first.beat + beats - 1e-9) / 4 };
}
/** Suggest a musical phrase length near the audible duration; not beat detection. */
export function suggestedFit(clip: TimedClip, duration: number, bpm: number) {
  const anchors = clipAnchors(clip), current = Math.min(clip.length * 4, endBeat(anchors, bpm, duration)) - anchors[0].beat;
  const candidates = Array.from({ length: 15 }, (_, i) => 2 ** i).flatMap(beats => { try { return [{ beats, ...fitToBeats(clip, duration, bpm, beats) }]; } catch { return []; } });
  candidates.sort((a, b) => Math.abs(Math.log2(a.beats / current)) - Math.abs(Math.log2(b.beats / current)) || a.beats - b.beats);
  if (!candidates.length) throw new Error('Crop a phrase in the sample editor before fitting it.');
  return candidates[0];
}
export type SmartSnapOptions = { grid?: 1 | .5 | .25; toleranceSeconds?: number };
/** Snap detected attacks (sample seconds) that sit near grid lines onto them; nearest first, stretch limits kept. */
export function smartSnap(attacks: number[], anchors: ClipAnchor[], bpm: number, { grid = .5, toleranceSeconds = .07 }: SmartSnapOptions = {}) {
  const candidates = attacks.flatMap(source => {
    const beat = beatAtSource(anchors, bpm, source); if (beat === undefined) return [];
    const target = Math.round(beat / grid) * grid, displacement = Math.abs(beat - target) * spb(bpm);
    return displacement <= toleranceSeconds ? [{ source, beat: target, displacement }] : [];
  }).sort((a, b) => a.displacement - b.displacement || a.source - b.source);
  let result = anchors.map(a => ({ ...a })); let snapped = 0, skipped = 0;
  for (const { source, beat } of candidates) {
    if (result.some(a => a.source === source)) continue;
    const next = result.findIndex(a => a.source > source), at = next < 0 ? result.length : next;
    const tentative = [...result.slice(0, at), { source, beat }, ...result.slice(at)];
    try { validateAnchors(tentative, Infinity, bpm); result = tentative; snapped++; } catch { skipped++; }
  }
  return { anchors: result, snapped, skipped };
}
/** What a take clip plays, clip-local: cycles on the timeline and seconds into the timeline-linear rendered buffer. */
export function takeWindow(clip: TimedClip, duration: number, bpm: number, cycleOffset: number) {
  const anchors = clipAnchors(clip), lead = anchors[0].beat / 4;
  const begin = Math.max(lead, -cycleOffset), end = Math.min(clip.length, endBeat(anchors, bpm, duration) / 4);
  if (begin >= end) return;
  return { begin, end, offset: (begin - lead) * 240 / bpm, seconds: (end - begin) * 240 / bpm };
}
/** Why a tempo change must wait: the first anchored clip whose stretch would leave 0.5×–2× at the new tempo. */
export function tempoChangeIssue(clips: { id: string; name?: string; takeId?: string; anchors?: ClipAnchor[] }[], duration: (takeId: string) => number, bpm: number) {
  for (const clip of clips) {
    if (!clip.takeId || !clip.anchors) continue;
    try { validateAnchors(clip.anchors, duration(clip.takeId), bpm); }
    catch { return `Clip ${clip.name ?? clip.id}: its stretch would leave the 0.5×–2× limit at ${bpm} BPM. Open Align… to adjust it first.`; }
  }
}
