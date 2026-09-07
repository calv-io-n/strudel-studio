import './style.css';
import { newProject, ProjectSchema, type Asset, type Binding, type BridgeStatus, type Job, type MidiEvent, type Project, type Tab, type Clip, type Target } from '../shared/model';
import { parseMidi, Pickup, scaleCC } from '../shared/midi';
import { StudioEditor } from './editor';
import { Engine } from './engine';
import { setupExport } from './export';
import { soundLabel } from './completions';
import { canPlace } from '../shared/clips';

type UIElement = HTMLElement & { value: string; checked: boolean; disabled: boolean; files?: FileList | null; showModal(): void; returnValue: string };
const $ = <T extends HTMLElement = UIElement>(selector: string) => document.querySelector<T>(selector)!;
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
async function api<T>(path: string, method = 'GET', value?: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, { method, headers: value === undefined ? {} : { 'Content-Type': 'application/json' }, body: value === undefined ? undefined : JSON.stringify(value) });
  const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Request failed'); return data;
}
try { document.documentElement.dataset.appearance = localStorage.getItem('studio.appearance') === 'dark' ? 'dark' : 'light'; } catch { document.documentElement.dataset.appearance = 'light'; }
const app = $('#app');
app.innerHTML = `
<header class="topbar"><a class="wordmark" href="/" aria-label="Strudel Studio">strudel<span>studio</span></a><div class="session-actions"><select id="saved-projects" class="session-picker" aria-label="Sessions"><option value="">Sessions…</option></select><button id="add-session" aria-label="Add session" title="Add session">+</button></div><div class="session"><input id="project-name" aria-label="Project name" value="Untitled project"><span id="saved-state" role="status">Local project</span></div><div class="transport"><select id="play-target" aria-label="Playback target"><option value="tab">Current tab</option><option value="composition">Composition</option></select><button id="play" class="primary">Play</button><button id="evaluate" hidden>Apply changes <kbd>Ctrl ↵</kbd></button><button id="stop">Stop</button></div><output id="transport-state" aria-live="polite">Stopped</output><button id="sounds-toggle" aria-expanded="false" aria-controls="sounds-panel">Sounds</button><label class="check appearance-choice"><input id="dark-mode" type="checkbox"> Dark mode</label></header>
<details class="project-menu"><summary>Project</summary><nav class="sessionbar" aria-label="Project tools"><span class="section-label">Workspace</span><button id="save">Save project</button><button id="import">Import .strudel</button><button id="export">Export code</button><input type="file" id="import-file" accept=".strudel,.str,.js" hidden><span id="connection">Connecting…</span><button id="new-project">New project</button></nav></details>
<main class="workspace">
  <aside id="sounds-panel" class="sound-panel panel" hidden aria-label="Sound library"><div class="panel-heading"><h1>Sounds <small id="asset-count">0 sounds</small></h1><button id="sounds-close" class="quiet">Back to editor</button></div>
    <form id="generate-form" class="generate-form"><label for="prompt">Describe your next sound</label><textarea id="prompt" maxlength="450" required placeholder="A warm, dusty bass one-shot. Short attack, soft analog saturation."></textarea><details class="generation-options"><summary>Options</summary><div class="form-row"><label>Duration <input id="duration" type="number" min="0.5" max="30" step="0.5" placeholder="Auto"></label><label class="check"><input id="loop" type="checkbox"> Loop</label></div></details><button id="generate" class="primary" type="submit">Generate sound</button><p id="generation-status" class="hint" role="status">Checking ElevenLabs connection…</p></form>
    <div class="library-heading"><h2>Your sounds</h2><button id="refresh-assets" class="quiet">Refresh</button></div><div id="assets" class="asset-list"></div>
    <section id="assignment" class="assignment" hidden><button id="insert-sound" class="primary">Insert into pattern</button><details><summary>Assign to a control or slot</summary><h2>Assign selected sound</h2><label for="assign-target">Destination</label><select id="assign-target"></select><button id="assign">Assign sound</button><button id="learn-trigger">Learn a trigger key</button><p class="hint">Pads play one-shots. Slots swap sounds on the next cycle.</p></details></section>
  </aside>
  <section class="editor-panel panel"><div class="tabbar"><div id="tabs" role="tablist" aria-label="Patterns"></div><button id="new-tab" aria-label="New pattern">+</button><details id="tab-menu"><summary aria-label="Pattern actions">•••</summary><div><button id="rename-tab">Rename pattern</button><button id="add-to-composition">Add to composition</button><button id="close-tab">Close pattern</button></div></details></div><div id="editor"></div><div id="mapping-context" hidden></div><div class="editor-footer"><span id="slider-hint">Select an inline slider to map it</span><span id="cycle">Cycle 0</span></div></section>
  <aside class="mapping-panel panel"><div class="panel-heading"><h2>Control mappings</h2><span id="mapping-count">0</span></div><section class="mapping-setup" aria-label="Slider mapping"><label for="slider-target">Inline slider</label><select id="slider-target"><option value="">Select a slider…</option></select><button id="learn-slider" class="primary">MIDI Learn</button><button id="cancel-learn" hidden>Cancel learning</button><div id="selected-bindings"></div><p id="learn-status" class="hint" role="status">Select a slider, then move a knob or fader.</p><details><summary>Enter mapping manually</summary><form id="manual-map"><label>Device profile<select id="manual-profile"></select></label><div class="form-row"><label>Channel<input id="manual-channel" type="number" min="1" max="16" value="1" required></label><label>CC number<input id="manual-number" type="number" min="0" max="127" value="20" required></label></div><button type="submit">Bind slider</button></form></details></section><div id="bindings"></div>
    <section class="slots-section"><div class="library-heading"><h2>Sound slots</h2><button id="add-slot" class="quiet">Add</button></div><div id="slots"></div></section>
    <details class="devices" open><summary>MIDI devices</summary><p id="bridge-status" class="hint"></p><button id="reconnect">Reconnect MIDI</button><div id="profiles"></div><div class="form-row"><select id="available-ports" aria-label="Available MIDI inputs"></select><button id="add-profile">Connect</button></div></details>
  </aside>
  <section class="controller-panel panel"><div class="panel-heading"><div><h2>Virtual MIDI</h2><span class="hint">Channel <input id="controller-channel" type="number" min="1" max="16" value="1" aria-label="Virtual controller channel"></span></div><div class="controller-options"><select id="route" aria-label="MIDI route"><option value="simulation">Browser</option><option value="alsa">OS MIDI loopback</option></select><button id="edit-layout">Edit layout</button></div></div><p id="route-status" class="route-status"></p><div id="drawer-learning" hidden><span>Learning… move a control.</span><button id="drawer-cancel-learn">Cancel</button></div><div id="controls" class="controls"></div><div id="layout-editor" hidden></div></section>
  <section class="monitor-panel panel"><div class="panel-heading"><h2>MIDI feedback</h2><button id="clear-events" class="quiet">Clear</button></div><div id="last-receipt" class="receipt">Move a control to inspect its route and binding.</div><div id="events" class="event-list" aria-label="MIDI event monitor"></div></section>
</main>
<footer class="drawer-bar"><button data-drawer="composition" aria-expanded="false" aria-controls="composition-content">Composition</button><button data-drawer="midi" aria-expanded="false" aria-controls="midi-content">Virtual MIDI</button><button data-drawer="export" aria-expanded="false" aria-controls="export-content">Export</button><span class="footer-hint">Select a slider to map a control</span></footer>
<section id="drawer" hidden><div id="drawer-resize" role="separator" tabindex="0" aria-label="Resize tools" aria-orientation="horizontal" aria-valuemin="180" aria-valuemax="600" aria-valuenow="300"></div>
<div id="composition-content" hidden><div class="composition-toolbar"><h2>Composition</h2><label>Tempo <input id="bpm" type="number" min="20" max="300" value="120"> BPM</label><span id="arrangement-status">Edit while stopped · 4 beats per cycle</span></div><div id="sequencer-scroll"><div id="sequencer"><div id="ruler"></div><div class="lane" data-lane="0" aria-label="Lane 1"></div><div class="lane" data-lane="1" aria-label="Lane 2"></div><div id="playhead" hidden></div></div></div></div>
<div id="midi-content" hidden></div><div id="export-content" hidden></div></section>
<dialog id="edit-dialog"><form method="dialog"><h2 id="edit-title"></h2><label id="edit-label">Name<input id="edit-name" maxlength="80" required></label><p id="edit-description"></p><div class="form-row"><button type="button" value="cancel">Cancel</button><button type="submit" value="confirm" class="primary">Confirm</button></div></form></dialog>
<dialog id="clip-dialog"><form method="dialog"><h2>Clip</h2><label>Lane<select id="clip-lane" aria-label="Lane"><option value="0">Lane 1</option><option value="1">Lane 2</option></select></label><div class="form-row"><label>Start cycle<input id="clip-start" type="number" min="0" max="4096" required></label><label>Length<input id="clip-length" type="number" min="1" max="4096" required></label></div><div class="form-row"><button value="cancel" formnovalidate>Cancel</button><button value="remove" formnovalidate>Remove</button><button value="save" class="primary">Save clip</button></div></form></dialog>
<div id="notice" role="status" aria-live="polite"></div>
<dialog id="slot-dialog"><form method="dialog"><h2>Add sound slot</h2><label>Name<input id="slot-name" pattern="[a-zA-Z][\\w-]{0,39}" value="texture" required></label><div class="form-row"><button value="cancel" formnovalidate>Cancel</button><button value="add" class="primary">Add slot</button></div></form></dialog>`;

// Reuse existing MIDI and sample functionality behind progressive disclosure.
$('.tabbar').append($('.project-menu'));
$('#mapping-context').append($('.mapping-setup'));
const mappingClose = document.createElement('button'); mappingClose.textContent = 'Close mapping'; mappingClose.className = 'quiet';
mappingClose.onclick = () => { $('#mapping-context').hidden = true; }; $('#mapping-context').prepend(mappingClose);
$('#midi-content').append($('.controller-panel'));
const advanced = document.createElement('details'); advanced.className = 'midi-advanced';
advanced.innerHTML = '<summary>Devices, mappings & advanced controls</summary>';
advanced.append($('.mapping-panel'), $('.monitor-panel')); $('#midi-content').append(advanced);

let project: Project = newProject();
let assets: Asset[] = [];
let selectedAsset: string | undefined;
let selectedSlider: string | undefined;
let learning: Target | undefined;
let bridge: BridgeStatus = { ready: false, message: 'Connecting…', ports: [], connected: [] };
let socket: WebSocket | undefined;
let generationBusy = false;
let saveTimer: ReturnType<typeof setTimeout>;
let noticeTimer: ReturnType<typeof setTimeout>;
let eventRows: string[] = [];
let booted = false;
let frame = 0;
const pickup = new Pickup();

function notice(message: string, error = false) {
  $('#notice').textContent = message; $('#notice').classList.toggle('error', error); $('#notice').classList.add('visible');
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('#notice').classList.remove('visible'), error ? 12000 : 5000);
}
function guard(fn: () => unknown | Promise<unknown>) { return async () => { try { await fn(); } catch (error) { notice(error instanceof Error ? error.message : 'Something went wrong', true); } }; }
const editors = new Map<string, StudioEditor>();
let editor: StudioEditor;
function getEditor(id = project.activeTabId) {
  let instance = editors.get(id);
  if (!instance) {
    const tab = project.tabs.find(t => t.id === id);
    if (!tab) throw new Error('Pattern no longer exists.');
    const root = document.createElement('div'); root.className = 'tab-editor'; root.dataset.tabEditor = id; root.hidden = id !== project.activeTabId;
    $('#editor').append(root);
    instance = new StudioEditor(root, tab, {
      sounds: () => engine.soundEntries, functions: () => engine.functionNames,
      change: () => { if (id === project.activeTabId) renderSliders(); renderBindings(); renderTransport(); dirty(); },
      select: (sliderId) => { selectedSlider = sliderId; $('#slider-target').value = sliderId; $('#mapping-context').hidden = false; $('#slider-hint').textContent = 'Ready to map'; renderBindings(); },
      evaluate: () => void guard(() => engine.started ? engine.apply() : startPlayback())(), stop: () => stopPlayback(),
    });
    editors.set(id, instance);
  }
  return instance;
}
editor = getEditor();
const engine = new Engine(getEditor, () => snapshot(), () => renderTransport(), (message) => notice(message, true));
let saveChain = Promise.resolve();
let saveRevision = 0;
function snapshot(): Project {
  return { ...project, sessionId: selectedProjectName || undefined, tabs: project.tabs.map(tab => { const e = editors.get(tab.id); return e ? { ...tab, code: e.code, anchors: e.anchors } : tab; }), name: $('#project-name').value.trim() || 'Untitled project' };
}
const draftKey = 'studio.pending-session';
function cacheDraft() {
  try { localStorage.setItem(draftKey, JSON.stringify(snapshot())); } catch { /* Disk saves still work if browser storage is full. */ }
}
function persistSession() {
  clearTimeout(saveTimer);
  const revision = saveRevision;
  const state = snapshot();
  const task = saveChain.catch(() => {}).then(async () => {
    // Session transitions await this queue, so a new session acquires its identity only once.
    const sessionId = state.sessionId || selectedProjectName;
    const saved = sessionId
      ? await api<Project>(`projects/${sessionId}`, 'PUT', { ...state, sessionId })
      : await api<Project>('projects', 'POST', state);
    selectedProjectName = saved.sessionId!;
    project.sessionId = selectedProjectName;
    cacheDraft();
    await api('recovery', 'PUT', saved);
    await refreshProjects();
    if (revision === saveRevision) {
      try { localStorage.removeItem(draftKey); } catch { /* unavailable storage */ }
      $('#saved-state').textContent = 'Session saved';
    }
  }).catch(error => {
    $('#saved-state').textContent = 'Not saved · retry with Save project';
    throw error;
  });
  saveChain = task;
  return task;
}
function dirty() {
  if (!booted) return;
  ++saveRevision;
  cacheDraft();
  $('#saved-state').textContent = 'Saving…'; clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void persistSession().catch(() => {}); }, 600);
}
window.addEventListener('online', () => { if (booted) void persistSession().catch(() => {}); });
let sessionTransition = false;
async function transitionSession(action: () => Promise<void>) {
  if (sessionTransition) return;
  sessionTransition = true;
  $('.workspace').inert = true;
  $('#add-session').disabled = $('#saved-projects').disabled = $('#project-name').disabled = true;
  try { await action(); }
  finally {
    sessionTransition = false; $('.workspace').inert = false;
    $('#add-session').disabled = $('#saved-projects').disabled = $('#project-name').disabled = false;
    $('#saved-projects').value = selectedProjectName;
  }
}

function assetById(id: string) { const asset = assets.find((a) => a.id === id); if (!asset) throw new Error('Sample is missing from the local library.'); return asset; }
function assetLabel(id: string) { const asset = assets.find((a) => a.id === id); return asset ? soundLabel(asset) : 'Missing sample'; }
function targetLabel(target: Target) { return target.kind === 'slider' ? getEditor(target.tabId).sliders.find((s) => s.id === target.sliderId)?.label ?? 'Missing slider • rebind' : target.kind === 'swap' ? `${target.slot} ← ${assetLabel(target.assetId)}` : `Trigger ${assetLabel(target.assetId)}`; }
function send(value: object) { if (socket?.readyState !== WebSocket.OPEN) throw new Error('Studio connection is offline.'); socket.send(JSON.stringify(value)); }
function connectProfiles() { if (socket?.readyState === WebSocket.OPEN) send({ type: 'connect', ports: project.profiles.filter((p) => p.enabled && !p.port.startsWith('studio:')).map((p) => p.port) }); }
function renderTransport() {
  const playing = engine.started;
  const name = engine.target === 'composition' ? 'Composition' : project.tabs.find(t => t.id === engine.target)?.name ?? '';
  $('#transport-state').textContent = playing ? `Playing · ${name}${engine.pendingCycle !== undefined ? ' · changes queued' : ''}` : 'Stopped';
  $('#transport-state').classList.toggle('playing', playing);
  $('#play').disabled = playing || engine.busy || ($('#play-target').value === 'composition' && !project.clips.length);
  $('#play').textContent = engine.busy ? 'Preparing…' : 'Play';
  $('#play-target').disabled = playing || engine.busy;
  $('#evaluate').hidden = !engine.hasChanges;
  $('#evaluate').disabled = engine.busy;
  $('#bpm').disabled = playing || engine.busy;
  $('#arrangement-status').textContent = playing ? 'Stop playback to edit clips' : 'Edit while stopped · 4 beats per cycle';
}

function renderSliders() {
  $('#slider-target').innerHTML = '<option value="">Select a slider…</option>' + editor.sliders.map((s, i) => `<option value="${s.id}">${i + 1}. ${escape(s.label)} · ${s.min}–${s.max}</option>`).join('');
  if (selectedSlider && editor.sliders.some((s) => s.id === selectedSlider)) $('#slider-target').value = selectedSlider;
  else selectedSlider = undefined;
}
function renderBindings() {
  $('#mapping-count').textContent = String(project.bindings.length);
  $('#bindings').innerHTML = project.bindings.length ? project.bindings.map((b) => {
    const missing = b.target.kind === 'slider' && !getEditor(b.target.tabId).sliders.some((s) => s.id === (b.target as { sliderId: string }).sliderId);
    return `<div data-binding="${escape(b.id)}" class="binding ${missing ? 'missing' : ''}"><div><strong>${escape(targetLabel(b.target))}</strong><span>${escape(project.profiles.find((p) => p.id === b.profileId)?.name ?? 'Missing device')} · CH ${b.channel} · ${b.kind.toUpperCase()} ${b.number}${b.pickup ? ' · pickup' : ''}</span></div><button data-remove-binding="${b.id}" aria-label="Remove binding">×</button></div>`;
  }).join('') : '<p class="empty small">No mappings yet.<br>Select an inline slider to get started.</p>';
  const selected = project.bindings.filter(b => b.target.kind === 'slider' && b.target.tabId === project.activeTabId && b.target.sliderId === selectedSlider);
  $('#selected-bindings').replaceChildren(...selected.map(b => $('#bindings').querySelector(`[data-binding="${CSS.escape(b.id)}"]`)!.cloneNode(true)));

}
function renderProfiles() {
  $('#bridge-status').textContent = bridge.message;
  $('#profiles').innerHTML = project.profiles.map((p) => `<div class="profile"><label class="check"><input type="checkbox" data-profile-enable="${escape(p.id)}" ${p.enabled ? 'checked' : ''}>${escape(p.name)}</label><span>${p.port.startsWith('studio:') ? (bridge.ready ? 'Ready' : 'No ALSA') : bridge.connected.includes(p.port) ? 'Connected' : 'Disconnected'}</span>${p.port.startsWith('studio:') ? '' : `<select data-profile-port="${p.id}" aria-label="Reassign ${escape(p.name)}">${[...new Set([p.port, ...bridge.ports])].map((port) => `<option ${port === p.port ? 'selected' : ''}>${escape(port)}</option>`).join('')}</select><input data-profile-name="${p.id}" aria-label="Profile name" value="${escape(p.name)}">`}</div>`).join('');
  $('#available-ports').innerHTML = '<option value="">Choose input…</option>' + bridge.ports.map((p) => `<option>${escape(p)}</option>`).join('');
  $('#manual-profile').innerHTML = project.profiles.map((p) => `<option value="${p.id}">${escape(p.name)}</option>`).join('');
  renderRoute();
}
function renderRoute() {
  const simulation = $('#route').value === 'simulation';
  $('#route-status').textContent = simulation ? 'Browser controls are ready. No MIDI hardware needed.' : bridge.ready ? 'OS MIDI connected.' : 'OS MIDI unavailable. Use Browser controls or reconnect your device.';
  $('#route-status').classList.toggle('simulation', simulation);
}
function renderAssets() {
  $('#asset-count').textContent = `${assets.length} sound${assets.length === 1 ? '' : 's'}`;
  $('#assets').innerHTML = assets.length ? assets.map((a) => `<article class="asset ${a.id === selectedAsset ? 'selected' : ''}"><button data-select-asset="${a.id}" class="asset-select"><span class="sample-mark">${a.loop ? '∞' : '↗'}</span><span><strong>${escape(soundLabel(a))}</strong><small>${a.duration ? a.duration + 's' : 'Auto duration'} · ${a.loop ? 'Loop' : 'One-shot'}${a.provider === 'fixture' ? ' · Test fixture' : ''}</small></span></button><button data-rename-asset="${a.id}" aria-label="Rename ${escape(soundLabel(a))}">Rename</button><button data-preview="${a.id}" aria-label="Preview ${escape(soundLabel(a))}">▶</button></article>`).join('') : '<div class="empty"><div class="empty-wave">∿</div><h3>Your next sound starts here.</h3><p>Describe a sound above, audition the result, then put it on a pad or into your pattern.</p></div>';
  $('#assignment').hidden = !selectedAsset;
  $('#assign-target').innerHTML = project.controls.filter((c) => c.kind === 'pad' || c.kind === 'key').map((c) => `<option value="pad:${c.id}">${escape(c.label)} · Note ${c.number}</option>`).join('') + project.slots.map((s) => `<option value="slot:${s.name}">Sound slot: ${escape(s.name)}</option>`).join('');
}
function renderSlots() {
  $('#slots').innerHTML = project.slots.map((slot) => {
    const pending = engine.timeline.pending(slot.name);
    return `<div class="slot"><div class="slot-heading"><code>${escape(slot.name)}</code><span>${pending ? 'Queued · cycle ' + pending.cycle : slot.active ? 'Ready' : 'Empty'}</span></div>${slot.assets.length ? slot.assets.map((id, i) => `<div class="variation"><button data-slot="${escape(slot.name)}" data-variation="${id}" class="${slot.active === id ? 'active' : ''}">${i + 1}. ${escape(assetLabel(id))}</button><button data-learn-slot="${escape(slot.name)}" data-asset="${id}" title="Map a MIDI key to this variation">Learn</button></div>`).join('') : '<p class="hint">Assign a generated sound to this slot.</p>'}<code class="slot-code">.s(soundSlot('${escape(slot.name)}'))</code></div>`;
  }).join('');
}
function renderControls() {
  const continuous = project.controls.filter((c) => ['knob', 'fader'].includes(c.kind));
  const pads = project.controls.filter((c) => c.kind === 'pad');
  const keys = project.controls.filter((c) => c.kind === 'key');
  $('#controls').innerHTML = `<div class="continuous">${continuous.map((c) => `<label class="control ${c.kind}"><span>${escape(c.label)}</span>${c.kind === 'knob' ? `<span class="dial" data-dial="${c.id}" style="--turn:${-135 + c.value / 127 * 270}deg"><i></i></span>` : ''}<input type="range" min="0" max="127" step="1" value="${c.value}" data-control="${c.id}" aria-label="${escape(c.label)}"><small>CC ${c.number} <output data-value="${c.id}">${c.value}</output></small></label>`).join('')}</div><div class="performance"><div class="pads">${pads.map((c, i) => `<button class="pad" data-note-control="${c.id}"><span>${String(i + 1).padStart(2, '0')}</span>${escape(c.label)}<small>${c.number}</small></button>`).join('')}</div><div class="keys">${keys.map((c) => `<button class="key ${c.label.includes('♯') ? 'black' : ''}" data-note-control="${c.id}" aria-label="${escape(c.label)}">${escape(c.label)}</button>`).join('')}</div></div>`;
}
function renderAll() { renderTabs(); renderComposition(); renderSliders(); renderAssets(); renderBindings(); renderSlots(); renderProfiles(); renderControls(); renderTransport(); }
function beginLearn(target: Target) {
  learning = target;
  $('#learn-status').textContent = target.kind === 'slider' ? 'Listening… move the knob or fader you want to bind.' : 'Listening… press the key or pad you want to bind.';
  $('#cancel-learn').hidden = false; $('#drawer-learning').hidden = false;
}
function bind(target: Target, profileId: string, channel: number, kind: 'cc' | 'note', number: number) {
  project.bindings = project.bindings.filter((b) => !(b.profileId === profileId && b.channel === channel && b.kind === kind && b.number === number));
  project.bindings.push({ id: crypto.randomUUID(), profileId, channel, kind, number, target, pickup: kind === 'cc' && profileId !== 'virtual', enabled: true });
  learning = undefined; $('#cancel-learn').hidden = true; $('#drawer-learning').hidden = true; $('#learn-status').textContent = `Connected ${kind.toUpperCase()} ${number} to ${targetLabel(target)}.`;
  pickup.reset(); renderBindings(); dirty();
}
function receipt(event: MidiEvent, binding: Binding, status: string, value?: number) {
  $('#last-receipt').textContent = `${event.route === 'alsa' ? 'ALSA' : 'SIM'} · ${targetLabel(binding.target)} · ${status}${value === undefined ? '' : ' ' + value}`;
  send({ type: 'receipt', sequence: event.sequence, bindingId: binding.id, target: binding.target, status, value, at: Date.now() });
}
async function selectVariation(slotName: string, assetId: string) {
  const result = await engine.select(slotName, assetById(assetId));
  if (!result.cancelled && result.cycle === undefined) {
    const slot = project.slots.find((s) => s.name === slotName);
    if (slot) slot.active = assetId;
  }
  renderSlots(); dirty(); return result;
}
async function receive(event: MidiEvent) {
  const midi = parseMidi(event.bytes); if (!midi) return;
  eventRows.unshift(`<div><span>${new Date(event.receivedAt).toLocaleTimeString()}</span><b>${event.route === 'alsa' ? 'ALSA' : 'SIM'}</b><span>CH ${midi.channel} ${midi.kind.toUpperCase()} ${midi.number}</span><strong>${midi.value}</strong></div>`);
  eventRows = eventRows.slice(0, 30); $('#events').innerHTML = eventRows.join('');
  const profile = project.profiles.find((p) => p.port === event.source && p.enabled);
  if (!profile) return;
  if (learning && ((learning.kind === 'slider' && midi.kind === 'cc') || (learning.kind !== 'slider' && midi.on))) {
    bind(learning, profile.id, midi.channel, midi.kind, midi.number); return;
  }
  const assigned = project.bindings.some(b => b.enabled && b.profileId === profile.id && b.channel === midi.channel && b.kind === midi.kind && b.number === midi.number);
  if (midi.kind === 'note' && !assigned) { if (midi.on) await engine.noteOn(midi.number, midi.value); else engine.noteOff(midi.number); }
  for (const binding of project.bindings.filter((b) => b.enabled && b.profileId === profile.id && b.channel === midi.channel && b.kind === midi.kind && b.number === midi.number)) {
    const target = binding.target;
    try {
      if (target.kind === 'slider') {
        const slider = getEditor(target.tabId).sliders.find((s) => s.id === target.sliderId);
        if (!slider) { receipt(event, binding, 'target missing; rebind'); continue; }
        if (!pickup.accept(binding, midi.value / 127, (slider.value - slider.min) / (slider.max - slider.min))) { receipt(event, binding, 'waiting for pickup'); continue; }
        const value = scaleCC(midi.value, slider.min, slider.max, slider.step);
        getEditor(target.tabId).setValue(slider.id, value); receipt(event, binding, 'applied', value);
      } else if (midi.on) {
        if (target.kind === 'trigger') { await engine.trigger(assetById(target.assetId), midi.value); receipt(event, binding, 'one-shot triggered'); }
        else { const result = await selectVariation(target.slot, target.assetId); receipt(event, binding, result.cancelled ? 'superseded' : result.cycle === undefined ? 'assigned' : `queued for cycle ${result.cycle}`); }
      }
    } catch (error) { receipt(event, binding, error instanceof Error ? error.message : 'Failed'); notice('MIDI action failed. See MIDI feedback.', true); }
  }
}
function openSocket() {
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/midi`);
  socket.onopen = () => { $('#connection').textContent = 'Studio connected'; connectProfiles(); };
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === 'status') { bridge = message; pickup.reset(); renderProfiles(); }
    if (message.type === 'midi') void receive(message).catch((err) => notice(err.message, true));
    if (message.type === 'error') notice(message.message, true);
  };
  socket.onclose = () => { $('#connection').textContent = 'Reconnecting…'; pickup.reset(); setTimeout(openSocket, 1500); };
}
function virtualSend(id: string, value: number, off = false) {
  const control = project.controls.find((c) => c.id === id)!;
  const kind = ['knob', 'fader'].includes(control.kind) ? 0xb0 : off ? 0x80 : 0x90;
  send({ type: 'send', bytes: [kind | (control.channel - 1), control.number, value], simulate: $('#route').value === 'simulation' });
}

$('#play').onclick = guard(startPlayback);
$('#evaluate').onclick = guard(() => engine.apply());
$('#stop').onclick = stopPlayback;
$('#project-name').oninput = dirty;
$('#slider-target').onchange = () => { selectedSlider = $('#slider-target').value || undefined; if (selectedSlider) editor.select(selectedSlider); };
$('#learn-slider').onclick = guard(() => { if (!selectedSlider) throw new Error('Select an inline slider first.'); beginLearn({ kind: 'slider', sliderId: selectedSlider, tabId: project.activeTabId }); });
$('#cancel-learn').onclick = () => { learning = undefined; $('#cancel-learn').hidden = true; $('#drawer-learning').hidden = true; $('#learn-status').textContent = 'Learning cancelled.'; };
$('#drawer-cancel-learn').onclick = () => $('#cancel-learn').click();
$('#manual-map').onsubmit = (e) => { e.preventDefault(); void guard(() => {
  if (!selectedSlider) throw new Error('Select an inline slider first.');
  bind({ kind: 'slider', sliderId: selectedSlider, tabId: project.activeTabId }, $('#manual-profile').value, Number($('#manual-channel').value), 'cc', Number($('#manual-number').value));
})(); };
$('#route').onchange = renderRoute;
$('#reconnect').onclick = guard(() => api('midi/reconnect', 'POST', {}));
$('#add-profile').onclick = guard(() => {
  const port = $('#available-ports').value; if (!port) throw new Error('Select a MIDI input port.');
  if (!project.profiles.some((p) => p.port === port)) project.profiles.push({ id: crypto.randomUUID(), name: port, port, enabled: true });
  connectProfiles(); renderProfiles(); dirty();
});
$('#profiles').onchange = (e) => {
  const input = e.target as HTMLInputElement;
  const id = input.dataset.profileEnable ?? input.dataset.profilePort ?? input.dataset.profileName;
  const profile = project.profiles.find((p) => p.id === id); if (!profile) return;
  if (input.dataset.profileEnable) profile.enabled = input.checked;
  else if (input.dataset.profilePort) profile.port = input.value;
  else profile.name = input.value.trim() || profile.port;
  pickup.reset(); connectProfiles(); renderBindings(); dirty();
};
const removeBinding = (e: MouseEvent) => { const id = (e.target as HTMLElement).closest<HTMLElement>('[data-remove-binding]')?.dataset.removeBinding; if (id) { project.bindings = project.bindings.filter((b) => b.id !== id); renderBindings(); dirty(); } };
$('#bindings').onclick = removeBinding; $('#selected-bindings').onclick = removeBinding;
$('#refresh-assets').onclick = guard(async () => { assets = await api<Asset[]>('samples'); await engine.registerAssets(assets); renderAssets(); renderSlots(); });
$('#assets').onclick = (e) => { const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button) return;
  if (button.dataset.renameAsset) void guard(async () => {
    const asset = assetById(button.dataset.renameAsset!);
    const label = await askEdit('Name sound', soundLabel(asset));
    if (!label) return;
    const updated = await api<Asset>(`samples/${asset.id}`, 'PATCH', { label });
    assets = assets.map(item => item.id === updated.id ? updated : item);
    await engine.registerAssets(assets); renderAssets(); renderSlots(); renderBindings();
  })();
  if (button.dataset.selectAsset) { selectedAsset = button.dataset.selectAsset; renderAssets(); }
  if (button.dataset.preview) void guard(() => engine.trigger(assetById(button.dataset.preview!)))();
};
$('#assign').onclick = guard(async () => {
  if (!selectedAsset) return;
  const asset = assetById(selectedAsset); await engine.preload(asset);
  const [kind, id] = $('#assign-target').value.split(':');
  if (kind === 'slot') {
    const slot = project.slots.find((s) => s.name === id)!;
    if (!slot.assets.includes(asset.id)) slot.assets.push(asset.id);
    await selectVariation(id, asset.id);
  } else {
    const control = project.controls.find((c) => c.id === id)!;
    bind({ kind: 'trigger', assetId: asset.id }, 'virtual', control.channel, 'note', control.number);
  }
  renderSlots(); dirty(); notice('Sound assigned.');
});
$('#learn-trigger').onclick = guard(() => { if (selectedAsset) beginLearn({ kind: 'trigger', assetId: selectedAsset }); });
$('#slots').onclick = (e) => { const el = (e.target as HTMLElement).closest<HTMLElement>('button'); if (!el) return;
  if (el.dataset.variation) void guard(() => selectVariation(el.dataset.slot!, el.dataset.variation!))();
  if (el.dataset.learnSlot) beginLearn({ kind: 'swap', slot: el.dataset.learnSlot, assetId: el.dataset.asset! });
};
$('#add-slot').onclick = () => { $('#slot-dialog').returnValue = ''; $('#slot-dialog').showModal(); };
$('#slot-dialog').addEventListener('close', () => {
  if ($('#slot-dialog').returnValue !== 'add') return;
  const name = $('#slot-name').value;
  if (project.slots.some((s) => s.name === name)) return notice('That slot already exists.', true);
  project.slots.push({ name, assets: [], active: null }); renderSlots(); renderAssets(); dirty();
});
$('#generate-form').onsubmit = (e) => { e.preventDefault(); if (generationBusy) return;
  void guard(async () => {
    generationBusy = true; $('#generate').disabled = true; $('#generate').textContent = 'Generating…';
    $('#generation-status').textContent = 'Creating your sound. You can keep playing.';
    try {
      let job = await api<Job>('generations', 'POST', { prompt: $('#prompt').value, duration: $('#duration').value ? Number($('#duration').value) : null, loop: $('#loop').checked });
      while (job.state === 'running') { await new Promise((resolve) => setTimeout(resolve, 1000)); job = await api<Job>(`generations/${job.id}`); }
      if (job.state === 'failed') throw new Error(job.error);
      assets = await api<Asset[]>('samples'); await engine.registerAssets(assets); selectedAsset = job.asset!.id; renderAssets();
      $('#generation-status').textContent = 'Ready to preview and insert.';
    } catch (error) { $('#generation-status').textContent = error instanceof Error ? error.message : 'Generation failed.'; throw error; }
    finally { generationBusy = false; $('#generate').disabled = false; $('#generate').textContent = 'Generate sound'; }
  })();
};
$('#controls').oninput = (e) => { const input = e.target as HTMLInputElement; const control = project.controls.find((c) => c.id === input.dataset.control); if (!control) return;
  control.value = Number(input.value); $(`[data-value="${control.id}"]`).textContent = input.value;
  document.querySelector<HTMLElement>(`[data-dial="${control.id}"]`)?.style.setProperty('--turn', `${-135 + control.value / 127 * 270}deg`);
  void guard(() => virtualSend(control.id, control.value))(); dirty();
};
const held = new Set<string>();
function releaseNotes() { for (const id of held) { try { virtualSend(id, 0, true); } catch { /* socket may have closed */ } } held.clear(); $('#controls').querySelectorAll('.pressed').forEach((el) => el.classList.remove('pressed')); }
$('#controls').onpointerdown = (e) => { const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-note-control]'); if (!button) return;
  const id = button.dataset.noteControl!; held.add(id); button.classList.add('pressed'); button.setPointerCapture(e.pointerId);
  void guard(() => virtualSend(id, project.controls.find((c) => c.id === id)!.value))();
};
$('#controls').onpointerup = releaseNotes; $('#controls').onpointercancel = releaseNotes; window.addEventListener('blur', releaseNotes);
$('#controls').onkeydown = (e) => { const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-note-control]'); if (!button || ![' ', 'Enter'].includes(e.key) || e.repeat) return;
  e.preventDefault(); const id = button.dataset.noteControl!; held.add(id); button.classList.add('pressed'); void guard(() => virtualSend(id, project.controls.find((c) => c.id === id)!.value))();
};
$('#controls').onkeyup = (e) => { if ([' ', 'Enter'].includes(e.key)) releaseNotes(); };
$('#controller-channel').onchange = () => { const channel = Number($('#controller-channel').value); if (channel < 1 || channel > 16 || !Number.isInteger(channel)) return;
  project.controls.forEach((c) => { c.channel = channel; }); dirty(); notice('Virtual controller channel changed. Existing bindings keep their original channel.');
};
$('#edit-layout').onclick = () => {
  const panel = $('#layout-editor'); panel.hidden = !panel.hidden;
  panel.innerHTML = project.controls.map((c) => `<label>${escape(c.label)} ${['pad', 'key'].includes(c.kind) ? 'note' : 'CC'}<input type="number" min="0" max="127" value="${c.number}" data-layout="${c.id}"></label>`).join('');
};
$('#layout-editor').onchange = (e) => { const input = e.target as HTMLInputElement; const value = Number(input.value); if (!Number.isInteger(value) || value < 0 || value > 127) return;
  project.controls.find((c) => c.id === input.dataset.layout)!.number = value; renderControls(); renderAssets(); dirty();
};
$('#clear-events').onclick = () => { eventRows = []; $('#events').innerHTML = ''; };
let selectedProjectName = '';
let refreshingProjects: Promise<void> | undefined;
function refreshProjects() {
  refreshingProjects ??= (async () => {
    const names = (await api<string[]>('projects')).filter(name => name !== 'recovery' && name !== '_recovery').sort();
    const select = $('#saved-projects') as unknown as HTMLSelectElement;
    const current = select.value || selectedProjectName;
    if (JSON.stringify(Array.from(select.options).slice(1).map(option => option.value)) !== JSON.stringify(names)) {
      select.innerHTML = '<option value="">Sessions…</option>' + names.map(name => `<option value="${escape(name)}">${escape(name.replace(/[-_]/g, ' '))}</option>`).join('');
    }
    select.value = names.includes(current) ? current : '';
  })().finally(() => { refreshingProjects = undefined; });
  return refreshingProjects;
}
$('#saved-projects').onfocus = guard(refreshProjects);
$('#saved-projects').onpointerdown = guard(refreshProjects);

$('#save').onclick = guard(async () => { await persistSession(); notice(`Saved ${snapshot().name}.`); });
async function loadProject(next: Project) {
  const validated = ProjectSchema.parse(next);
  // Preload before changing the running project. Missing assets are explicit, and
  // leave the current session intact instead of partially applying a load.
  for (const slot of validated.slots) if (slot.active) await engine.preload(assetById(slot.active));
  releaseNotes(); engine.restore(validated);
  editors.forEach(e => e.view.destroy()); editors.clear(); $('#editor').replaceChildren();
  project = validated; selectedProjectName = validated.sessionId || ''; editor = getEditor();
  selectedSlider = undefined; learning = undefined; $('#cancel-learn').hidden = true; $('#drawer-learning').hidden = true;
  $('#project-name').value = project.name; $('#mapping-context').hidden = true; pickup.reset(); renderAll(); connectProfiles(); dirty();
}
$('#saved-projects').onchange = guard(async () => {
  const name = $('#saved-projects').value; if (!name || name === selectedProjectName) return;
  await transitionSession(async () => {
    const next = await api<Project>(`projects/${name}`);
    await persistSession();
    await loadProject({ ...next, sessionId: name });
    await persistSession();
  });
});
$('#import').onclick = () => $('#import-file').click();
$('#import-file').onchange = guard(async () => { const file = $('#import-file').files?.[0]; if (!file) return;
  if (file.size > 200000) throw new Error('Pattern file is too large.');
  createTab(file.name.replace(/\.(strudel|str|js)$/, ''), await file.text()); $('#import-file').value = '';
});
$('#export').onclick = () => { const blob = new Blob([editor.code], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${project.tabs.find(t => t.id === project.activeTabId)!.name.replace(/[^\w-]/g, '_')}.strudel`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
function settleSlots(stopped = !engine.started) {
  const committed = engine.timeline.settle(engine.cycle, stopped);
  if (committed.length) { for (const { name, asset } of committed) { const slot = project.slots.find((s) => s.name === name); if (slot) slot.active = asset; } renderSlots(); dirty(); }
}

function startPlayback() { return engine.evaluate(true, $('#play-target').value === 'composition' ? 'composition' : project.activeTabId); }
function stopPlayback() { releaseNotes(); engine.stop(); settleSlots(true); renderComposition(); }
$('#play-target').onchange = renderTransport;
$('#dark-mode').checked = document.documentElement.dataset.appearance === 'dark';
$('#dark-mode').onchange = () => {
  const dark = $('#dark-mode').checked; document.documentElement.dataset.appearance = dark ? 'dark' : 'light';
  try { localStorage.setItem('studio.appearance', dark ? 'dark' : 'light'); } catch { /* unavailable storage */ }
  editors.forEach(instance => instance.setAppearance(dark));
};
function renderTabs() {
  $('#tabs').innerHTML = project.tabs.map(tab => `<button role="tab" id="tab-${tab.id}" aria-selected="${tab.id === project.activeTabId}" aria-controls="editor-${tab.id}" tabindex="${tab.id === project.activeTabId ? 0 : -1}" draggable="true" data-tab="${tab.id}">${escape(tab.name)}</button>`).join('');
  editors.forEach((instance, id) => { const root = instance.view.dom.parentElement!; root.hidden = id !== project.activeTabId; root.id = `editor-${id}`; root.setAttribute('role', 'tabpanel'); root.setAttribute('aria-labelledby', `tab-${id}`); });
}
function switchTab(id: string) {
  project.activeTabId = id; editor = getEditor(id); selectedSlider = undefined;
  $('#mapping-context').hidden = true; learning = undefined; $('#cancel-learn').hidden = true; $('#drawer-learning').hidden = true;
  renderTabs(); renderSliders(); renderBindings(); dirty(); editor.view.requestMeasure();
}
function createTab(name = `Pattern ${project.tabs.length + 1}`, code = '// Start a new pattern\n$: note("c3 e3 g3").s("triangle").gain(0.2)\n') {
  if (project.tabs.length >= 50) throw new Error('A project can contain up to 50 patterns.');
  const tab: Tab = { id: crypto.randomUUID(), name: name.slice(0, 80) || 'Pattern', code, anchors: [] };
  project.tabs.push(tab); switchTab(tab.id);
}
$('#new-tab').onclick = guard(() => createTab());
$('#tab-menu').addEventListener('click', event => { if ((event.target as HTMLElement).closest('button')) ($('#tab-menu') as unknown as HTMLDetailsElement).open = false; });
$('#tabs').onclick = e => { const id = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]')?.dataset.tab; if (id) switchTab(id); };
$('#tabs').onkeydown = e => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault(); const index = project.tabs.findIndex(t => t.id === project.activeTabId);
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? project.tabs.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + project.tabs.length) % project.tabs.length;
  switchTab(project.tabs[next].id); $(`#tab-${project.activeTabId}`).focus();
};
$('#tabs').ondragstart = e => { const id = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]')?.dataset.tab; if (id) e.dataTransfer?.setData('text/plain', JSON.stringify({ tabId: id })); };
$('#edit-dialog button[value="cancel"]').onclick = () => {
  ($('#edit-dialog') as unknown as HTMLDialogElement).close('cancel');
};
function askEdit(title: string, value?: string, description = ''): Promise<string | undefined> {
  $('#edit-title').textContent = title; $('#edit-label').hidden = value === undefined; $('#edit-name').disabled = value === undefined;
  $('#edit-name').value = value ?? ''; $('#edit-description').textContent = description;
  const dialog = $('#edit-dialog'); dialog.returnValue = ''; dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm' ? value === undefined ? 'confirmed' : $('#edit-name').value.trim() : undefined), { once: true }));
}
$('#rename-tab').onclick = guard(async () => {
  const tab = project.tabs.find(t => t.id === project.activeTabId)!;
  const name = await askEdit('Rename pattern', tab.name); if (name) { tab.name = name; renderTabs(); renderComposition(); renderTransport(); dirty(); }
});
$('#close-tab').onclick = guard(async () => {
  if (engine.busy) throw new Error('Wait for playback preparation to finish.');
  if (project.tabs.length === 1) throw new Error('Keep at least one pattern in the project.');
  const id = project.activeTabId, tab = project.tabs.find(t => t.id === id)!;
  const clips = project.clips.filter(c => c.tabId === id).length;
  const mappings = project.bindings.filter(b => b.target.kind === 'slider' && b.target.tabId === id).length;
  if (!await askEdit(`Close ${tab.name}?`, undefined, `This removes its code, ${clips} composition clip(s), and ${mappings} slider mapping(s) from this project.`)) return;
  if (engine.started) stopPlayback();
  editors.get(id)?.view.dom.parentElement?.remove(); editors.get(id)?.view.destroy(); editors.delete(id);
  project.tabs = project.tabs.filter(t => t.id !== id); project.clips = project.clips.filter(c => c.tabId !== id);
  project.bindings = project.bindings.filter(b => b.target.kind !== 'slider' || b.target.tabId !== id);
  switchTab(project.tabs[0].id); renderComposition();
});
async function addSession() {
  if (engine.busy) throw new Error('Wait for playback preparation to finish.');
  const name = await askEdit('Add session', 'Untitled session', 'Your current session will be saved before opening the new one.');
  if (!name) return;
  await transitionSession(async () => {
    await persistSession();
    const next = await api<Project>('projects', 'POST', { ...newProject(), name });
    await loadProject(next);
    await persistSession();
    notice(`Created ${name}.`);
  });
  editor.view.focus();
}
$('#add-session').onclick = guard(addSession);
$('#new-project').onclick = guard(addSession);
$('#insert-sound').onclick = guard(async () => {
  if (!selectedAsset) return;
  const asset = assetById(selectedAsset); await engine.preload(asset);
  const key = `studio_${asset.id.replaceAll('-', '')}`;
  const code = `\n// ${asset.prompt.replace(/[\r\n]+/g, ' ')}\nsamples({ ${key}: [location.origin + '/api/samples/${asset.id}/audio'] })\n$: s("${key}").gain(0.5)\n`;
  editor.view.dispatch({ changes: { from: editor.view.state.doc.length, insert: code } });
  setSounds(false); editor.view.focus(); notice(engine.started ? 'Sound inserted. Apply changes to hear it.' : 'Sound inserted. Press Play to hear it.');
});
function setSounds(open: boolean) {
  $('#sounds-panel').hidden = !open; $('#sounds-toggle').setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('sounds-open', open);
  if (open) { $('#mapping-context').hidden = true; $('#prompt').focus(); } else $('#sounds-toggle').focus();
}
$('#sounds-toggle').onclick = () => setSounds(!!$('#sounds-panel').hidden);
$('#sounds-close').onclick = () => setSounds(false);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { setSounds(false); $('#mapping-context').hidden = true; } });
const openExport = setupExport($('#export-content'), snapshot, () => assets);
let drawerView: 'composition' | 'midi' | 'export' | undefined;
let drawerHeight = 300;
function setDrawer(view?: 'composition' | 'midi' | 'export') {
  drawerView = view; $('#drawer').hidden = !view;
  $('#composition-content').hidden = view !== 'composition'; $('#midi-content').hidden = view !== 'midi'; $('#export-content').hidden = view !== 'export';
  if (view === 'export') openExport();
  document.querySelectorAll<HTMLElement>('[data-drawer]').forEach(b => b.setAttribute('aria-expanded', String(b.dataset.drawer === view)));
  document.body.classList.toggle('tools-open', !!view);
  try { localStorage.setItem('studio.drawer', JSON.stringify({ view, height: drawerHeight })); } catch { /* unavailable storage */ }
  editor.view.requestMeasure();
}
function resizeDrawer(height: number) {
  drawerHeight = Math.min(600, Math.max(180, height));
  $('#drawer').style.height = `${drawerHeight}px`; $('#drawer-resize').setAttribute('aria-valuenow', String(drawerHeight));
}
try { const saved = JSON.parse(localStorage.getItem('studio.drawer') || '{}'); resizeDrawer(Number(saved.height) || 300); if (['composition', 'midi', 'export'].includes(saved.view)) setDrawer(saved.view); } catch { /* default collapsed */ }
document.querySelectorAll<HTMLElement>('[data-drawer]').forEach(b => b.onclick = () => setDrawer(drawerView === b.dataset.drawer ? undefined : b.dataset.drawer as 'composition' | 'midi' | 'export'));
$('#drawer-resize').onpointerdown = e => {
  const start = e.clientY, height = drawerHeight, handle = e.currentTarget as HTMLElement; handle.setPointerCapture(e.pointerId);
  handle.onpointermove = event => resizeDrawer(height + start - event.clientY);
  handle.onpointerup = handle.onpointercancel = () => { handle.onpointermove = null; setDrawer(drawerView); };
};
$('#drawer-resize').onkeydown = e => { if (['ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); resizeDrawer(drawerHeight + (e.key === 'ArrowUp' ? 20 : -20)); setDrawer(drawerView); } };
function editArrangement() { if (engine.started || engine.busy) throw new Error('Stop playback to edit the composition.'); }
function renderComposition() {
  const length = Math.max(16, ...project.clips.map(c => c.start + c.length + 4));
  $('#bpm').value = String(project.bpm); $('#sequencer').style.width = `${length * 64}px`;
  $('#ruler').innerHTML = Array.from({ length }, (_, i) => `<span>${i}</span>`).join('');
  document.querySelectorAll<HTMLElement>('.lane').forEach(lane => {
    const clips = project.clips.filter(c => c.lane === Number(lane.dataset.lane));
    lane.innerHTML = clips.map(c => `<button class="clip" draggable="${!engine.started}" data-clip="${c.id}" style="left:${c.start * 64}px;width:${c.length * 64}px" aria-label="${escape(project.tabs.find(t => t.id === c.tabId)?.name)} · lane ${c.lane + 1} · cycle ${c.start} · ${c.length} cycles"><strong>${escape(project.tabs.find(t => t.id === c.tabId)?.name)}</strong><small>${c.length} cycles</small><span class="clip-resize" data-resize="${c.id}" aria-hidden="true"></span></button>`).join('') || '<p class="lane-empty">Drag a pattern here, or use Pattern actions → Add to composition</p>';
  });
  renderTransport();
}
function putClip(clip: Clip) {
  editArrangement();
  if (!canPlace(project.clips, clip)) throw new Error('Use whole cycles and leave space between clips in the same lane.');
  if (!project.clips.some(c => c.id === clip.id) && project.clips.length >= 500) throw new Error('This project has reached its clip limit.');
  project.clips = [...project.clips.filter(c => c.id !== clip.id), clip]; renderComposition(); dirty();
}
let editingClip: string | undefined;
function openClip(id: string) {
  editArrangement(); const clip = project.clips.find(c => c.id === id)!; editingClip = id;
  $('#clip-lane').value = String(clip.lane); $('#clip-start').value = String(clip.start); $('#clip-length').value = String(clip.length); $('#clip-dialog').returnValue = ''; $('#clip-dialog').showModal();
}
$('#add-to-composition').onclick = guard(() => {
  editArrangement(); const clip: Clip = { id: crypto.randomUUID(), tabId: project.activeTabId, lane: 0, start: Math.max(0, ...project.clips.filter(c => c.lane === 0).map(c => c.start + c.length)), length: 4 };
  putClip(clip); setDrawer('composition'); openClip(clip.id);
});
$('#clip-dialog').addEventListener('close', () => void guard(() => {
  const action = $('#clip-dialog').returnValue, clip = project.clips.find(c => c.id === editingClip); if (!clip || action === 'cancel') return;
  editArrangement();
  if (action === 'remove') { project.clips = project.clips.filter(c => c.id !== clip.id); renderComposition(); dirty(); }
  else if (action === 'save') putClip({ ...clip, lane: Number($('#clip-lane').value) as 0 | 1, start: Number($('#clip-start').value), length: Number($('#clip-length').value) });
})());
$('#bpm').onchange = guard(() => { editArrangement(); const bpm = Number($('#bpm').value); if (bpm < 20 || bpm > 300) throw new Error('Tempo must be between 20 and 300 BPM.'); project.bpm = bpm; dirty(); });
let resized = false;
$('#sequencer').onclick = e => { if (resized) { resized = false; return; } const id = (e.target as HTMLElement).closest<HTMLElement>('[data-clip]')?.dataset.clip; if (id) void guard(() => openClip(id))(); };
$('#sequencer').ondragstart = e => { const id = (e.target as HTMLElement).closest<HTMLElement>('[data-clip]')?.dataset.clip; if (engine.started || (e.target as HTMLElement).dataset.resize) { e.preventDefault(); return; } if (id) e.dataTransfer?.setData('text/plain', JSON.stringify({ clipId: id })); };
$('#sequencer').ondragover = e => { if (!engine.started) e.preventDefault(); };
$('#sequencer').ondrop = e => {
  e.preventDefault(); const lane = (e.target as HTMLElement).closest<HTMLElement>('.lane'); if (!lane) return;
  void guard(() => {
    const data = JSON.parse(e.dataTransfer?.getData('text/plain') || '{}');
    const original = project.clips.find(c => c.id === data.clipId);
    const tabId = original?.tabId ?? data.tabId; if (!project.tabs.some(t => t.id === tabId)) return;
    putClip({ id: original?.id ?? crypto.randomUUID(), tabId, lane: Number(lane.dataset.lane) as 0 | 1, start: Math.max(0, Math.round((e.clientX - lane.getBoundingClientRect().left) / 64)), length: original?.length ?? 4 });
  })();
};
$('#sequencer').onpointerdown = e => {
  const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-resize]'); if (!handle || engine.started) return;
  e.preventDefault(); e.stopPropagation(); const clip = project.clips.find(c => c.id === handle.dataset.resize)!;
  const x = e.clientX; let length = clip.length; handle.setPointerCapture(e.pointerId);
  handle.onpointermove = event => { length = Math.max(1, Math.round(clip.length + (event.clientX - x) / 64)); handle.parentElement!.style.width = `${length * 64}px`; };
  handle.onpointerup = () => { resized = true; void guard(() => putClip({ ...clip, length }))().then(renderComposition); };
  handle.onpointercancel = renderComposition;
};

async function boot() {
  await engine.setup(project);
  const [status, library, recovery] = await Promise.all([
    api<{ bridge: BridgeStatus; generation: { configured: boolean; fixture: boolean } }>('status'), api<Asset[]>('samples'), api<Project | null>('recovery'),
  ]);
  bridge = status.bridge; assets = library; await engine.registerAssets(assets);
  $('#generation-status').textContent = status.generation.fixture ? 'Test fixture mode. No ElevenLabs credits are used.' : status.generation.configured ? 'ElevenLabs connected · generated locally into your library' : 'Add ELEVENLABS_API_KEY to .env, then restart to generate.';
  $('#generate').disabled = !status.generation.configured && !status.generation.fixture;
  let restored = recovery;
  let hasDraft = false;
  try { const cached = localStorage.getItem(draftKey); if (cached) { restored = ProjectSchema.parse(JSON.parse(cached)); hasDraft = true; } } catch { /* Ignore invalid local drafts. */ }
  if (restored) { try { await loadProject(restored); $('#saved-state').textContent = 'Recovery restored'; } catch (error) { notice(`Recovery could not load: ${(error as Error).message}`, true); } }
  renderAll(); await refreshProjects(); openSocket(); booted = true;
  if (hasDraft) dirty();
  setInterval(() => {
    engine.tick(); $('#cycle').textContent = `Cycle ${engine.cycle.toFixed(2)}`; settleSlots(); renderTransport(); $('#playhead').hidden = !engine.started || engine.target !== 'composition'; $('#playhead').style.left = `${engine.cycle * 64}px`;
    if (engine.started && engine.target === project.activeTabId && engine.repl.state.pattern) { try { const cycle = engine.cycle; editor.paint(engine.repl.state.pattern.queryArc(cycle, cycle + 0.01), cycle); } catch { /* An incomplete edit must not interrupt performance. */ } }
    if (++frame % 10 === 0 && socket?.readyState === WebSocket.OPEN) send({ type: 'snapshot', diagnostics: engine.diagnostics, sliders: editor.sliders.map((s) => ({ id: s.id, label: s.label, value: s.value })), slots: project.slots });
  }, 100);
}
void boot().catch((error) => notice(`Studio could not start: ${error.message}`, true));

// Narrow DOM typing keeps markup helpers concise without disabling application checks.
