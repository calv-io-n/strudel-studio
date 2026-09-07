import type { Clip } from './model';

export function canPlace(clips: Clip[], clip: Clip) {
  return Number.isInteger(clip.start) && clip.start >= 0 && clip.start <= 4096 && Number.isInteger(clip.length) && clip.length >= 1 && clip.length <= 4096 &&
    !clips.some(other => other.id !== clip.id && other.lane === clip.lane && clip.start < other.start + other.length && other.start < clip.start + clip.length);
}
