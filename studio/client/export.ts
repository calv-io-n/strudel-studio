import { snapshotAudio } from './storage/workspace';
import { assetReferences } from '../shared/asset-references';
import type { Asset, Project } from '../shared/model';

export function setupExport(root: HTMLElement, snapshot: () => Project, assets: () => Asset[]) {
  root.innerHTML = `<div class="export-panel"><h2>Full Song Render</h2><p class="hint">Render a complete stereo WAV, including effects. Your current code and control values are captured when you start.</p>
    <div class="export-options"><label>Source<select id="export-source"><option value="composition">Full composition</option><option value="tab">Current tab</option></select></label>
    <label id="export-cycles-label" hidden>Cycles<input id="export-cycles" type="number" min="1" max="4096" step="1" value="16"></label>
    <label>Effect tail (seconds)<input id="export-tail" type="number" min="0" max="15" step="0.5" value="3"></label></div>
    <div class="export-options"><label>Sample rate<select id="export-rate"><option value="48000">48 kHz</option><option value="44100">44.1 kHz</option></select></label><label>WAV format<select id="export-format"><option value="pcm24">24-bit PCM</option><option value="pcm16">16-bit PCM</option><option value="float32">32-bit float</option></select></label><label><input id="export-dither" type="checkbox" checked> Dither integer output</label><label>Pattern code<select id="export-code"><option value="">Choose if drafts differ…</option><option value="applied">Last applied</option><option value="draft">Current draft</option></select></label><label><input id="export-exclude-input" type="checkbox"> Exclude live audio input</label></div><p class="hint">Stereo · up to 15 minutes · estimated job limit 512 MiB. Input effects use the applied chain. Capture live performances before rendering.</p>
    <div class="export-actions"><button id="render-audio" class="primary">Render & download WAV</button><button id="cancel-export" hidden>Cancel</button><a id="export-download" hidden>Download WAV again</a></div>
    <p id="export-status" role="status" aria-live="polite">Ready to render.</p></div>`;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(id)!;
  const source = $<HTMLSelectElement>('#export-source'), cycles = $<HTMLInputElement>('#export-cycles'), tail = $<HTMLInputElement>('#export-tail');
  const start = $<HTMLButtonElement>('#render-audio'), cancel = $<HTMLButtonElement>('#cancel-export'), download = $<HTMLAnchorElement>('#export-download');
  const status = $('#export-status');
  let frame: HTMLIFrameElement | undefined, timeout: ReturnType<typeof setTimeout> | undefined, url: string | undefined;
  let chosen = false, job = 0, preparing = false;
  let readyListener: ((event: MessageEvent) => void) | undefined;
  source.onchange = () => { chosen = true; $('#export-cycles-label').hidden = source.value !== 'tab'; };
  const clean = () => {
    job++; preparing = false; frame?.remove(); frame = undefined; clearTimeout(timeout);
    window.removeEventListener('message', receive);
    if (readyListener) window.removeEventListener('message', readyListener); readyListener = undefined;
    start.disabled = false; cancel.hidden = true; source.disabled = cycles.disabled = tail.disabled = false;
  };
  const receive = (event: MessageEvent) => {
    if (event.origin !== location.origin || event.source !== frame?.contentWindow) return;
    if (event.data.type === 'progress') status.textContent = event.data.text;
    if (event.data.type === 'error') { status.textContent = `Export failed: ${event.data.message}`; clean(); }
    if (event.data.type === 'complete') {
      url = URL.createObjectURL(new Blob([event.data.buffer], { type: 'audio/wav' }));
      download.href = url; download.hidden = false;
      status.textContent = `Rendered ${Number(event.data.seconds).toFixed(1)} seconds.${event.data.clipped ? ' Some audio clipped; reduce gain and render again for a cleaner mix.' : ''}`;
      clean(); download.click();
    }
  };
  cancel.onclick = () => { clean(); status.textContent = 'Export cancelled.'; };
  start.onclick = async () => {
    if (frame || preparing) return;
    const project = structuredClone(snapshot());
    if (!cycles.reportValidity() || !tail.reportValidity()) return;
    if (source.value === 'composition' && !project.clips.length) { status.textContent = 'Add patterns to Composition first, or choose Current tab.'; return; }
    if (url) URL.revokeObjectURL(url); url = undefined; download.hidden = true;
    const target = source.value === 'composition' ? 'composition' : project.activeTabId;
    const choice = $<HTMLSelectElement>('#export-code').value;
    const relevant = target === 'composition' ? project.tabs.filter(t => project.clips.some(c => c.tabId === t.id && !c.takeId)) : project.tabs.filter(t => t.id === target);
    if (!choice && relevant.some(t => project.appliedPatterns?.[t.id] !== undefined && project.appliedPatterns[t.id] !== t.code)) { status.textContent = 'Choose last-applied or current-draft pattern code before rendering.'; return; }
    if (choice === 'applied') for (const tab of project.tabs) tab.code = project.appliedPatterns?.[tab.id] ?? tab.code;
    const input = project.audioInput, track = project.tracks.find(t => t.id === input?.trackId);
    if (target === 'composition' && input?.enabled && track && !track.muted && (!project.soloTrackId || project.soloTrackId === track.id) && !$<HTMLInputElement>('#export-exclude-input').checked) { status.textContent = 'Live audio input cannot be rendered. Capture/freeze the performance or explicitly exclude the live input.'; return; }
    const token = ++job; preparing = true;
    const payload: any = { type: 'render', project, assets: structuredClone(assets()), target, cycles: Number(cycles.value), tail: Number(tail.value), rate: Number($<HTMLSelectElement>('#export-rate').value), format: $<HTMLSelectElement>('#export-format').value, dither: $<HTMLInputElement>('#export-dither').checked };

    download.download = `${project.name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'session'}.wav`;
    start.disabled = true; cancel.hidden = false; source.disabled = cycles.disabled = tail.disabled = true;
    status.textContent = 'Preparing export…';
    try { payload.audio = await snapshotAudio(assetReferences(project)); }
    catch (error) { if (token === job) { clean(); status.textContent = (error as Error).message; } return; }
    if (token !== job) return;
    preparing = false;
    frame = document.createElement('iframe'); frame.hidden = true; frame.title = 'Offline audio renderer';
    window.addEventListener('message', receive);
    const ready = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame?.contentWindow || event.data?.type !== 'ready') return;
      window.removeEventListener('message', ready); frame.contentWindow!.postMessage(payload, location.origin, payload.audio.map((a: { bytes: ArrayBuffer }) => a.bytes));
    };
    readyListener = ready; window.addEventListener('message', ready);
    timeout = setTimeout(() => { clean(); status.textContent = 'Export timed out. Try a shorter arrangement.'; }, 300_000);
    frame.src = new URL('./render.html', location.href).href; document.body.append(frame);
  };
  return () => {
    if (!chosen && !frame) source.value = snapshot().clips.length ? 'composition' : 'tab';
    $('#export-cycles-label').hidden = source.value !== 'tab';
  };
}
