import type { Clip, Project } from '../shared/model';
import { canPlace, snapPlacement } from '../shared/clips';

export function installCompositionGestures(options: { project(): Project; blocked(): boolean; commit(clip: Clip): void; open(id: string): void }) {
  const scroll = document.querySelector<HTMLElement>('#sequencer-scroll')!;
  let suppressClick = false;
  document.addEventListener('click', e => {
    if (suppressClick && e.detail > 0) { e.preventDefault(); e.stopImmediatePropagation(); suppressClick = false; return; }
    const clip = (e.target as HTMLElement).closest<HTMLElement>('[data-clip]');
    if (clip && !options.blocked()) options.open(clip.dataset.clip!);
  }, true);
  document.addEventListener('keydown', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-clip]');
    if (!el || options.blocked() || !e.key.startsWith('Arrow')) return;
    e.preventDefault(); const p = options.project(), original = p.clips.find(c => c.id === el.dataset.clip)!;
    const clip = { ...original }, index = p.tracks.findIndex(t => t.id === clip.trackId);
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') clip.trackId = p.tracks[index + (e.key === 'ArrowUp' ? -1 : 1)]?.id ?? clip.trackId;
    else if (e.shiftKey) clip.length += (e.key === 'ArrowLeft' ? -1 : 1) * p.snap;
    else clip.start += (e.key === 'ArrowLeft' ? -1 : 1) * p.snap;
    if (canPlace(p.clips, clip)) { options.commit(clip); document.querySelector<HTMLElement>(`[data-clip="${clip.id}"]`)?.focus(); }
  });
  document.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !e.isPrimary) return;
    suppressClick = false;
    if (options.blocked()) return;
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-clip], [data-tab]'); if (!target) return;
    const p = options.project(), original = p.clips.find(c => c.id === target.dataset.clip);
    const resize = !!(e.target as HTMLElement).closest('[data-resize]');
    const base: Clip = original ? { ...original } : { id: crypto.randomUUID(), tabId: target.dataset.tab!, trackId: p.tracks[0].id, start: 0, length: 4, muted: false };
    const offset = original ? e.clientX - target.getBoundingClientRect().left : 0;
    let x = e.clientX, y = e.clientY, active = false, candidate: Clip | undefined, frame = 0;
    const ghost = document.createElement('div'); ghost.className = 'clip drag-ghost'; ghost.dataset.color = target.dataset.color;
    const guide = document.createElement('div'); guide.className = 'snap-guide';
    const cleanup = () => {
      cancelAnimationFrame(frame); ghost.remove(); guide.remove();
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', cancel); document.removeEventListener('keydown', key); target.removeEventListener('lostpointercapture', cancel);
      if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
    };
    const cancel = () => { if (active) { suppressClick = true; } cleanup(); };
    const paint = () => {
      if (options.blocked() || options.project() !== p) { cancel(); return; }
      const rect = scroll.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        scroll.scrollLeft += x > rect.right - 32 ? 12 : x < rect.left + 32 ? -12 : 0;
        scroll.scrollTop += y > rect.bottom - 28 ? 8 : y < rect.top + 28 ? -8 : 0;
      }
      const lane = document.elementsFromPoint(x, y).map(el => el.closest<HTMLElement>('.lane')).find(Boolean);
      candidate = undefined; ghost.hidden = !lane || (resize && lane.dataset.trackId !== base.trackId); guide.hidden = true;
      if (lane && (!resize || lane.dataset.trackId === base.trackId)) {
        const raw = resize ? base.start + base.length + (x - e.clientX + scroll.scrollLeft - initialScroll) / 64 : (x - lane.getBoundingClientRect().left - offset) / 64;
        const result = snapPlacement(p.clips, { ...base, trackId: lane.dataset.trackId! }, raw, p.snap, resize);
        candidate = canPlace(p.clips, result.clip) && (original || p.clips.length < 500) ? result.clip : undefined;
        lane.append(ghost, guide); ghost.style.left = `${result.clip.start * 64}px`; ghost.style.width = `${Math.max(.25, result.clip.length) * 64}px`;
        ghost.dataset.invalid = String(!candidate); ghost.textContent = `${candidate ? '' : 'Invalid · '}${result.clip.start} · ${result.clip.length} cycles`;
        if (result.guide !== undefined) { guide.hidden = false; guide.style.left = `${result.guide * 64}px`; }
      }
      frame = requestAnimationFrame(paint);
    };
    const initialScroll = scroll.scrollLeft;
    const move = (event: PointerEvent) => {
      if (event.pointerId !== e.pointerId) return; x = event.clientX; y = event.clientY;
      if (!active && Math.hypot(x - e.clientX, y - e.clientY) >= 5) { active = true; target.setPointerCapture(e.pointerId); paint(); }
      if (active) event.preventDefault();
    };
    const up = (event: PointerEvent) => { if (event.pointerId !== e.pointerId) return; if (active) { x = event.clientX; y = event.clientY; cancelAnimationFrame(frame); paint(); } const result = candidate; cleanup(); if (active) { suppressClick = true; if (result && !options.blocked() && options.project() === p) options.commit(result); } };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); cancel(); } };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', cancel); document.addEventListener('keydown', key); target.addEventListener('lostpointercapture', cancel);
  });
}
