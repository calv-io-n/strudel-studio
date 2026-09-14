import type { CaptureView } from '../shared/capture-state';
import type { StudioEditor } from './editor';

/** Updates only the pending surfaces, leaving the editor and audio graph mounted. */
export function paintCaptureFeedback(views: CaptureView[], editors: Map<string, StudioEditor>) {
  for (const [id, owner] of editors) {
    const view = views.find(v => v.tabId === id && v.kind !== 'new-pattern');
    owner.setPending(view?.label, view?.kind === 'append');
  }
  const ids = new Set(views.map(v => v.tabId));
  document.querySelectorAll<HTMLElement>('[data-pending-for]').forEach(el => { if (!ids.has(el.dataset.pendingFor!)) el.remove(); });
  for (const view of views) {
    if (view.kind === 'new-pattern') {
      let tab = document.querySelector<HTMLButtonElement>(`[data-pending-tab="${view.tabId}"]`);
      let panel = document.querySelector<HTMLElement>(`[data-pending-panel="${view.tabId}"]`);
      if (!panel) {
        panel = document.createElement('section'); panel.className = 'pending-pattern'; panel.hidden = true; panel.dataset.pendingPanel = panel.dataset.pendingFor = view.tabId;
        const close = document.createElement('button'); close.textContent = 'Return to pattern'; close.onclick = () => { panel!.hidden = true; tab?.focus(); };
        const skeleton = document.createElement('div'); skeleton.className = 'pending-code'; skeleton.innerHTML = '<span role="status"></span><i></i><i></i><i></i>';
        panel.append(close, skeleton); document.querySelector('.editor-panel')!.append(panel);
      }
      if (!tab) {
        tab = document.createElement('button'); tab.className = 'pending-tab'; tab.dataset.pendingTab = tab.dataset.pendingFor = view.tabId;
        tab.onclick = () => { panel!.hidden = false; panel!.querySelector('button')!.focus(); };
        document.querySelector('#tabs')!.append(tab);
      }
      if (tab.textContent !== view.label) tab.textContent = view.label;
      const label = panel.querySelector('span')!; if (label.textContent !== view.label) label.textContent = view.label;
    }
    if (!view.trackId || view.start === undefined) continue;
    const lane = document.querySelector<HTMLElement>(`[data-track-id="${view.trackId}"]`); if (!lane) continue;
    let region = lane.querySelector<HTMLElement>(`[data-pending-region="${view.tabId}"]`);
    if (!region) { region = document.createElement('div'); region.className = 'clip pending-region'; region.dataset.pendingRegion = region.dataset.pendingFor = view.tabId; if (view.kind === 'new-pattern') region.id = 'recording-clip'; lane.append(region); }
    region.style.left = `${view.start * 64}px`; region.style.width = `${Math.max(.25, (view.end ?? view.start) - view.start) * 64}px`;
    if (region.textContent !== view.label) region.textContent = view.label;
  }
}
