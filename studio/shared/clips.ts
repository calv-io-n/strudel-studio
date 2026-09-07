import type { Clip } from './model';

export function canPlace(clips: Clip[], clip: Clip) {
  return Number.isInteger(clip.start) && clip.start >= 0 && clip.start <= 4096 && Number.isInteger(clip.length) && clip.length >= 1 && clip.length <= 4096 &&
    !clips.some(other => other.id !== clip.id && other.lane === clip.lane && clip.start < other.start + other.length && other.start < clip.start + clip.length);
}

export function duplicatePlacement(clips: Clip[], original: Clip, id: string): Clip | undefined {
  const copy = { ...original, id, start: original.start + original.length };
  for (const clip of clips.filter(c => c.lane === copy.lane).sort((a, b) => a.start - b.start)) {
    if (copy.start < clip.start + clip.length && clip.start < copy.start + copy.length) copy.start = clip.start + clip.length;
  }
  return canPlace(clips, copy) ? copy : undefined;
}
