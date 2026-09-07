import type { Clip } from './model';

// Solo restricts the mix; explicit track and clip mutes always take precedence.
// Stored mute flags are never rewritten, so clearing solo restores the previous mix.
export function isClipMuted(clip: Clip, tracks: { id: string; muted: boolean }[], soloTrackId?: string) {
  return clip.muted || tracks.some(t => t.id === clip.trackId && t.muted) || (!!soloTrackId && clip.trackId !== soloTrackId);
}
