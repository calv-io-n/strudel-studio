import { AUDIO_EDITOR, defaultAudioCode, compileAudioEffects } from '../shared/audio-input';
import { TimelineRecording } from './timeline-recording';
import { commitRecordedTake } from './storage/recorded-take';
import { takeEffects } from './take-playback';
import { createInputEffects } from './input-effects';
import { LiveInput } from './live-input';
import { Catalogue } from './catalogue';
import { collectOrphanAudio } from './storage/database';
import * as workspace from './storage/workspace';
import { backupProject, restoreBackup } from './storage/backup';
import { seedStarters } from './storage/starters';
import { browserMidi } from './browser-midi';
import { MIDI_EDITOR, instrumentFor, replaceInstrumentSound, updateAppliedInstrumentSliders, instrumentSound } from '../shared/midi-instrument';
import { MidiComposition } from './midi-composition';
import { destinationFor } from '../shared/performance';
import { isolateHistory } from '@codemirror/commands';
import { sampleInsertion, statementEnd } from '../shared/sample-insertion';
import { assetReferences } from '../shared/asset-references';
import { GitHubImports } from './github-imports';
import { SampleImports } from './imports';
import { RecordingPanel } from './recording';
import { effectBehavior } from './live-effects';
import { PerformancePanel } from './performance';
import { isClipMuted } from '../shared/mix';
import { palette } from '../shared/model';
import { installCompositionGestures } from './composition';
import './style.css';
import { newProject, ProjectSchema, type Asset, type Binding, type BridgeStatus, type MidiEvent, type Project, type Tab, type Clip, type Target } from '../shared/model';
import { parseMidi, Pickup, scaleCC } from '../shared/midi';
import { StudioEditor } from './editor';
import { Engine } from './engine';
import { setupExport } from './export';
import { soundLabel, soundKey, soundToken } from './completions';
import { ContextMenu, type MenuAction } from './context-menu';
import { canPlace, duplicatePlacement } from '../shared/clips';

type UIElement = HTMLElement & { value: string; checked: boolean; disabled: boolean; files?: FileList | null; showModal(): void; returnValue: string };
const $ = <T extends HTMLElement = UIElement>(selector: string) => document.querySelector<T>(selector)!;
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
try { document.documentElement.dataset.appearance = localStorage.getItem('studio.appearance') === 'dark' ? 'dark' : 'light'; } catch { document.documentElement.dataset.appearance = 'light'; }
const app = $('#app');
app.innerHTML = `
<header class="topbar"><a class="wordmark" href="/" aria-label="Strudel Studio">strudel<span>studio</span></a><div class="session-actions"><select id="saved-projects" class="session-picker" aria-label="Sessions"><option value="">Sessions…</option></select><button id="add-session" aria-label="Add session" title="Add session">+</button></div><div class="session"><input id="project-name" aria-label="Project name" value="Untitled project"><span id="saved-state" role="status">Browser project</span></div><button id="save-now" title="Save session (Ctrl+S)">Save</button><div class="transport"><select id="play-target" aria-label="Playback target"><option value="tab">Current tab</option><option value="composition">Composition</option></select><button id="play" class="primary">Play</button><button id="evaluate" hidden>Apply changes <kbd>Ctrl ↵</kbd></button><button id="stop">Stop</button></div><output id="transport-state" aria-live="polite">Stopped</output><button id="sounds-toggle" aria-expanded="false" aria-controls="sounds-panel">Sample Catalogue</button><label class="appearance-choice" title="Toggle dark mode"><input id="dark-mode" type="checkbox" aria-label="Dark mode"><span class="appearance-icon" aria-hidden="true"><svg class="theme-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/></svg><svg class="theme-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg></span></label></header>
<details class="project-menu"><summary>Project</summary><nav class="sessionbar" aria-label="Project tools"><span class="section-label">Workspace</span><button id="save">Save project</button><button id="import">Import .strudel</button><button id="export">Export code</button><input type="file" id="import-file" accept=".strudel,.str,.js" hidden><span id="connection">Connecting…</span><button id="backup-project">Download project backup</button><button id="restore-backup">Restore project backup</button><input id="backup-file" type="file" accept=".zip" hidden><button id="new-project">New project</button><a class="source-link" href="https://github.com/calv-io-n/strudel" target="_blank" rel="noopener noreferrer">Source code &amp; license ↗</a><a class="source-link" href="https://github.com/calv-io-n/strudel/blob/master/LICENSE" target="_blank" rel="noopener noreferrer">AGPL-3.0-or-later ↗</a></nav></details>
<main class="workspace">
  <aside id="sounds-panel" class="sound-panel panel" hidden aria-label="Sample library"><div class="panel-heading"><h1>Sample library <small id="asset-count">0 sounds</small></h1><button id="sounds-close" class="quiet">Close library</button></div>
    <section id="sound-import" role="tabpanel" aria-label="Import sounds"><p class="hint">Bring samples and recorded takes into this browser’s library.</p></section>
    <div class="library-heading"><h2>All sounds</h2><button id="refresh-assets" class="quiet">Refresh</button></div><label>Search sounds <input id="sound-search" type="search" placeholder="Name, tag, description, or pack"></label><div id="assets" class="asset-list"></div>
    <section id="assignment" class="assignment" hidden><button id="insert-sound" class="primary">Insert into pattern</button><details><summary>Assign to a control or slot</summary><h2>Assign selected sound</h2><label for="assign-target">Destination</label><select id="assign-target"></select><button id="assign">Assign sound</button><button id="learn-trigger">Learn a trigger key</button><p class="hint">Pads play one-shots. Slots swap sounds on the next cycle.</p></details></section>
  </aside>
  <section class="editor-panel panel"><div class="tabbar"><div id="tabs" role="tablist" aria-label="Patterns"></div><button id="new-tab" aria-label="New pattern">+</button><details id="tab-menu"><summary aria-label="Pattern actions">•••</summary><div><button id="color-tab">Color…</button><button id="rename-tab">Rename pattern</button><button id="duplicate-tab">Duplicate pattern</button><button id="add-to-composition">Add to composition</button><button id="close-tab">Close pattern</button></div></details></div><div id="editor"></div><div id="mapping-context" hidden></div><div class="editor-footer"><span id="slider-hint">Select an inline slider to map it</span><span id="cycle">Cycle 0</span></div></section>
  <aside class="mapping-panel panel"><div class="panel-heading"><h2>Control mappings</h2><span id="mapping-count">0</span></div><section class="mapping-setup" aria-label="Slider mapping"><label for="slider-target">Inline slider</label><select id="slider-target"><option value="">Select a slider…</option></select><button id="learn-slider" class="primary">MIDI Learn</button><button id="cancel-learn" hidden>Cancel learning</button><div id="selected-bindings"></div><p id="learn-status" class="hint" role="status">Select a slider, then move a knob or fader.</p><details><summary>Enter mapping manually</summary><form id="manual-map"><label>Device profile<select id="manual-profile"></select></label><div class="form-row"><label>Channel<input id="manual-channel" type="number" min="1" max="16" value="1" required></label><label>CC number<input id="manual-number" type="number" min="0" max="127" value="20" required></label></div><button type="submit">Bind slider</button></form></details></section><div id="bindings"></div>
    <section class="slots-section"><div class="library-heading"><h2>Sound slots</h2><button id="add-slot" class="quiet">Add</button></div><div id="slots"></div></section>
    <details class="devices" open><summary>MIDI devices</summary><p id="bridge-status" class="hint"></p><button id="reconnect">Reconnect MIDI</button><div id="profiles"></div><div class="form-row"><select id="available-ports" aria-label="Available MIDI inputs"></select><button id="add-profile">Connect</button></div></details>
  </aside>
  <section class="controller-panel panel"><div class="panel-heading"><div><h2>Virtual MIDI</h2><span class="hint">Channel <input id="controller-channel" type="number" min="1" max="16" value="1" aria-label="Virtual controller channel"></span></div><div class="controller-options"><select id="route" aria-label="MIDI route"><option value="simulation">Browser</option></select><button id="edit-layout">Edit layout</button></div></div><p id="route-status" class="route-status"></p><div id="drawer-learning" hidden><span>Learning… move a control.</span><button id="drawer-cancel-learn">Cancel</button></div><div id="controls" class="controls"></div><div id="layout-editor" hidden></div></section>
  <section class="monitor-panel panel"><div class="panel-heading"><h2>MIDI feedback</h2><button id="clear-events" class="quiet">Clear</button></div><div id="last-receipt" class="receipt">Move a control to inspect its route and binding.</div><div id="events" class="event-list" aria-label="MIDI event monitor"></div></section>
</main>
<footer class="drawer-bar"><button data-drawer="composition" aria-expanded="false" aria-controls="composition-content">Composition</button><button data-drawer="midi" aria-expanded="false" aria-controls="midi-content">Virtual MIDI</button><button data-drawer="export" aria-expanded="false" aria-controls="export-content">Export</button><span class="footer-hint">Select a slider to map a control</span></footer>
<section id="drawer" hidden><div id="drawer-resize" role="separator" tabindex="0" aria-label="Resize tools" aria-orientation="horizontal" aria-valuemin="180" aria-valuemax="600" aria-valuenow="300"></div>
<div id="composition-content" hidden><div class="composition-toolbar"><h2>Composition</h2><label>Tempo <input id="bpm" type="number" min="20" max="300" value="120"> BPM</label><button id="add-track">Add track</button><label>Snap <select id="snap"><option value="1">1 cycle</option><option value="0.5">½ cycle</option><option value="0.25">¼ cycle</option></select></label><span id="arrangement-status">Edit while stopped · 4 beats per cycle</span></div><div id="sequencer-scroll"><div id="sequencer"><div id="ruler"></div><div id="tracks"></div><div id="playhead" hidden></div></div></div></div>
<div id="midi-content" hidden></div><div id="export-content" hidden></div></section>
<dialog id="edit-dialog"><form method="dialog"><h2 id="edit-title"></h2><label id="edit-label">Name<input id="edit-name" maxlength="80" required></label><p id="edit-description"></p><div class="form-row"><button type="button" value="cancel">Cancel</button><button type="submit" value="confirm" class="primary">Confirm</button></div></form></dialog>
<dialog id="clip-dialog"><form method="dialog"><h2>Clip</h2><label>Track<select id="clip-lane" aria-label="Track"></select></label><div class="form-row"><label>Start cycle<input id="clip-start" step="0.25" type="number" min="0" max="4096" required></label><label>Length<input id="clip-length" step="0.25" type="number" min="0.25" max="4096" required></label></div><div class="form-row"><button value="cancel" formnovalidate>Cancel</button><button value="duplicate" formnovalidate>Duplicate</button><button value="source" formnovalidate>Open source pattern</button><button value="remove" formnovalidate>Remove</button><button value="mute" formnovalidate id="clip-mute">Mute</button><button value="save" class="primary">Save clip</button></div></form></dialog>
<div id="notice" role="status" aria-live="polite"></div>
<dialog id="slot-dialog"><form method="dialog"><h2>Add sound slot</h2><label>Name<input id="slot-name" pattern="[a-zA-Z][\\w-]{0,39}" value="texture" required></label><div class="form-row"><button value="cancel" formnovalidate>Cancel</button><button value="add" class="primary">Add slot</button></div></form></dialog>`;

// Reuse existing MIDI and sample functionality behind progressive disclosure.
$('.topbar').append($('.project-menu'));
const patternMenu = document.createElement('details'); patternMenu.id = 'patterns-menu';
patternMenu.innerHTML = '<summary>Patterns</summary><div class="menu-sheet"><input id="pattern-search" type="search" aria-label="Find a pattern" placeholder="Find a pattern"><div id="pattern-list"></div></div>';
$('.topbar').insertBefore(patternMenu, $('#sounds-toggle'));
$('.editor-footer').append($('.transport'), $('#transport-state'));
$('#play-target').hidden = true;
$('#play').setAttribute('aria-label', 'Play pattern'); $('#stop').setAttribute('aria-label', 'Stop playback');
$('.composition-toolbar').insertAdjacentHTML('afterbegin', '<div class="timeline-transport"><button id="composition-return" aria-label="Return to range start" title="Return to range start">↤</button><button id="composition-play" class="primary">Play composition</button><button id="composition-stop">Stop</button><button id="composition-loop" aria-pressed="false">Loop</button><output id="composition-position" aria-label="Timeline position">0.00</output></div>');
$('.tabbar').insertAdjacentHTML('beforeend', '<button id="expand-editor" class="quiet" aria-label="Expand editor">Expand</button>');
$('.composition-toolbar').insertAdjacentHTML('beforeend', '<button id="expand-composition" class="quiet" aria-label="Expand composition">Expand</button>');
$('#tab-menu > div').insertAdjacentHTML('beforeend', '<button id="delete-tab">Delete pattern…</button>');
const emptyEditor = document.createElement('div'); emptyEditor.id = 'empty-editor'; emptyEditor.hidden = true;
emptyEditor.innerHTML = '<p>No open patterns</p><button id="open-patterns">Open a pattern</button>'; $('#editor').after(emptyEditor);
// Sound selection floats above the workspace so previewing never changes its layout.
const libraryBackdrop = document.createElement('div');
libraryBackdrop.className = 'library-backdrop'; libraryBackdrop.hidden = true;
document.body.append(libraryBackdrop, $('#sounds-panel'));
libraryBackdrop.onclick = () => setSounds(false);
$('#sounds-panel').setAttribute('role', 'dialog');
$('#sounds-panel').setAttribute('aria-modal', 'true');

$('#sounds-panel').setAttribute('aria-label', 'Sample Catalogue');
const addSounds = document.createElement('details'); addSounds.id = 'add-sounds'; addSounds.innerHTML = '<summary>Add sounds</summary>';
addSounds.append($('#sound-import')); $('#sounds-panel > .panel-heading').after(addSounds);
$('#sound-search').parentElement!.insertAdjacentHTML('afterend', '<select id="library-source" aria-label="Filter sound source"><option value="all">All sources</option><option value="builtin">Built-in</option><option value="upload">Imported</option><option value="recording">Recorded</option></select><p id="library-destination" class="hint"></p><div id="builtin-sounds" class="asset-list"></div>');
$('#library-destination').insertAdjacentHTML('afterend', '<div class="library-test"><span id="library-midi-status" role="status">Choose Live on a sound to play it from your controller</span><div id="library-keys" hidden aria-label="Test keyboard">' + ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'].map((n, i) => `<button data-library-note="${60 + i}" aria-label="Test ${n}4" class="${n.includes('♯') ? 'black' : ''}">${n}</button>`).join('') + '</div></div>');
const libraryHeader = document.createElement('div'); libraryHeader.className = 'library-header';
const libraryFilters = document.createElement('div'); libraryFilters.className = 'library-filters';
libraryFilters.append($('#sound-search').parentElement!, $('#library-source'));
libraryHeader.append($('#sounds-panel > .panel-heading'), libraryFilters, $('#library-destination'));
const libraryScroll = document.createElement('div'); libraryScroll.id = 'library-scroll';
libraryScroll.append($('#add-sounds'), $('#builtin-sounds'), $('#assets'), $('#assignment'));
$('#sounds-panel').append(libraryHeader, libraryScroll, $('.library-test'));
$('#sounds-close').before($('#refresh-assets'));
$('#refresh-assets').setAttribute('aria-label', 'Refresh sounds');
$('.sessionbar').append($('[data-drawer="export"]'));
$('.footer-hint').textContent = '';
$('#mapping-context').append($('.mapping-setup'));
const mappingClose = document.createElement('button'); mappingClose.textContent = 'Close mapping'; mappingClose.className = 'quiet';
mappingClose.onclick = () => { $('#mapping-context').hidden = true; }; $('#mapping-context').prepend(mappingClose);
const devices = document.createElement('section'); devices.id = 'devices-content'; devices.hidden = true;
devices.setAttribute('aria-label', 'MIDI devices');
devices.innerHTML = '<h2>MIDI devices</h2><p class="hint">Connect an external keyboard or controller. Connections stay active when you switch sessions.</p><p id="device-activity" role="status">Play a key or move a control to check input.</p>';
devices.insertAdjacentHTML('beforeend', '<div class="form-row"><span id="midi-assignment" role="status"></span><button id="edit-midi-instrument">Edit instrument</button><button id="clear-midi-sound" hidden>Clear sound assignment</button></div>');
const deviceControls = $('.devices');
for (const child of [...deviceControls.children]) if (child.tagName !== 'SUMMARY') devices.append(child);
deviceControls.remove(); $('#drawer').append(devices);
const deviceButton = document.createElement('button'); deviceButton.dataset.drawer = 'devices'; deviceButton.textContent = 'MIDI';
deviceButton.setAttribute('aria-expanded', 'false'); deviceButton.setAttribute('aria-controls', 'devices-content');
$('[data-drawer="midi"]').before(deviceButton);
$('[data-drawer="midi"]').textContent = 'On-screen controller'; $('.sessionbar').append($('[data-drawer="midi"]'));
$('.controller-panel h2').textContent = 'On-screen controller';
$('#reconnect').textContent = 'Enable MIDI';
$('#midi-content').append($('.controller-panel'));
const advanced = document.createElement('details'); advanced.className = 'midi-advanced';
advanced.innerHTML = '<summary>Mappings, sound slots & diagnostics</summary>';
advanced.append($('.mapping-panel'), $('.monitor-panel')); $('#midi-content').append(advanced);

let project: Project = newProject();
let openTabs = new Set(project.tabs.map(t => t.id));
let assets: Asset[] = [];
let devicePorts: string[] = [];
let selectedAsset: string | undefined;
let selectedSound: string | undefined;
let libraryTarget: { owner: StudioEditor; code: string; from: number; to: number } | undefined;
let libraryReturn: HTMLElement | undefined;
let libraryMidi = false;
const libraryNotes = new Set<string>();
function stopLibraryNotes() { for (const key of libraryNotes) engine.performanceAudio.release(key); libraryNotes.clear(); }
function selectLibrarySound(name: string) { stopLibraryNotes(); previewEpoch++; if (previewKey) engine.performanceAudio.release(previewKey); selectedSound = name; selectedAsset = assets.find(a => soundKey(a) === name)?.id; paintLibrarySelection(); }
function paintMidiAssignment() {
  const config = instrumentFor(project);
  const name = instrumentSound(config.appliedCode);
  if ($('#instrument-toolbar')) {
    $('#instrument-state').textContent = engine.instrumentError || (!config.enabled ? 'Instrument muted · Apply or assign a sound to enable' : config.code !== config.appliedCode ? 'Unapplied changes · last applied version is active' : 'Ready for MIDI');
    $('#instrument-state').classList.toggle('error', !!engine.instrumentError);
  }
  const label = assets.find(a => soundKey(a) === name);
  $('#midi-assignment').textContent = !config.enabled ? 'No sound assigned · MIDI instrument muted' : name ? `Assigned sound · ${label ? soundLabel(label) : engine.soundEntries.find(s => s.name === name)?.label ?? name}` : 'Custom MIDI sound · edit the effects chain below';
  $('#clear-midi-sound').hidden = !config.enabled;
  if ($('#midi-output-sound')) $('#midi-output-sound').value = config.enabled ? name ?? '' : '';
  document.querySelectorAll<HTMLElement>('[data-assign-midi]').forEach(button => {
    const assigned = config.enabled && button.dataset.assignMidi === name;
    button.setAttribute('aria-pressed', String(assigned)); button.textContent = assigned ? 'Assigned to MIDI' : 'Assign to MIDI';
  });
}
async function applyMidiInstrument(saveImmediately = true) {
  const owner = getEditor(MIDI_EDITOR), config = instrumentFor(project);
  config.code = owner.code; config.anchors = owner.anchors;
  try {
    await engine.applyInstrument(owner.code);
    config.enabled = true; config.appliedCode = owner.code; config.appliedAnchors = owner.anchors; project.midiSound = instrumentSound(owner.code);
    dirty(); if (saveImmediately) await persistSession();
  } finally { renderMidiOutputs(); }
}
async function assignMidiSound(name?: string) {
  const owner = getEditor(MIDI_EDITOR), config = instrumentFor(project);
  if (!name) {
    config.enabled = false; project.midiSound = undefined; libraryMidi = false; stopLibraryNotes(); engine.stopInstrument();
    renderMidiOutputs(); paintLibrarySelection(); dirty(); await persistSession(); return;
  }
  let code: string;
  try { code = replaceInstrumentSound(owner.code, name ?? 'triangle'); }
  catch (error) { openMidiInstrument(); throw error; }
  const asset = assets.find(a => soundKey(a) === name);
  if (asset?.missing) throw new Error('Recover this sound before assigning it to MIDI.');
  await engine.unlock();
  if (asset && !project.assetIds.includes(asset.id)) project.assetIds.push(asset.id);
  engine.releaseInputNotes(); stopLibraryNotes(); libraryMidi = false;
  const pending = owner.code !== config.appliedCode;
  const before = owner.code; let from = 0, end = before.length, nextEnd = code.length;
  while (from < end && from < nextEnd && before[from] === code[from]) from++;
  while (end > from && nextEnd > from && before[end - 1] === code[nextEnd - 1]) { end--; nextEnd--; }
  owner.view.dispatch({ changes: { from, to: end, insert: code.slice(from, nextEnd) } });
  config.code = code; config.anchors = owner.anchors; project.midiSound = name;
  if (!pending) await applyMidiInstrument();
  else { openMidiInstrument(); notice('Sound updated in your MIDI instrument draft. Apply to hear it.'); }
  paintLibrarySelection(); dirty(); await persistSession();
}
$('#clear-midi-sound').onclick = guard(() => assignMidiSound());
function paintLibrarySelection() {
  paintMidiAssignment();
  document.querySelectorAll<HTMLElement>('.asset-select').forEach(button => {
    const selected = button.dataset.selectSound === selectedSound || (!!selectedAsset && button.dataset.selectAsset === selectedAsset);
    button.setAttribute('aria-pressed', String(selected)); button.closest('.asset')?.classList.toggle('selected', selected);
  });
  document.querySelectorAll<HTMLElement>('[data-live-sound]').forEach(button => button.setAttribute('aria-pressed', String(libraryMidi && button.dataset.liveSound === selectedSound)));
  $('#assignment').hidden = !selectedAsset;
  paintLibraryLive();
}
async function libraryNote(key: string, pitch: number, velocity: number, on: boolean) {
  const voice = `library-midi:${key}`;
  if (!on) { libraryNotes.delete(voice); engine.performanceAudio.release(voice); return; }
  if (!libraryMidi || !selectedSound) return;
  const name = selectedSound;
  libraryNotes.add(voice); await engine.unlock();
  if (!libraryNotes.has(voice) || !libraryMidi || selectedSound !== name) return;
  $('#library-midi-status').textContent = `Live · ${engine.soundEntries.find(s => s.name === name)?.label ?? name} · MIDI ${pitch}`;
  await engine.performanceAudio.play(voice, { s: name, gain: .35 }, pitch, velocity);
}
async function toggleLive(name: string) {
  if (midiComposition.running || performancePanel.take?.state === 'capturing' || recordingPanel.pending) throw new Error('Finish the current recording before testing another sound.');
  const on = !(libraryMidi && selectedSound === name);
  stopLibraryNotes(); libraryMidi = on;
  if (on) { engine.releaseInputNotes(); releaseNotes(); await engine.unlock(); if (!libraryMidi || $('#sounds-panel').hidden) return; selectLibrarySound(name); } else paintLibrarySelection();
  paintLibraryLive();
}
function paintLibraryLive() {
  $('#library-keys').hidden = !libraryMidi;

  const label = selectedSound ? engine.soundEntries.find(s => s.name === selectedSound)?.label ?? selectedSound : '';
  $('#library-midi-status').textContent = libraryMidi ? `Live · ${label} · play your controller or the keys below · nothing is recorded` : 'Choose Live on a sound to play it from your controller';
}
$('#library-keys').onpointerdown = e => { const key = (e.target as HTMLElement).closest<HTMLElement>('[data-library-note]'); if (!key) return; key.setPointerCapture(e.pointerId); void guard(() => libraryNote(`pointer:${e.pointerId}`, Number(key.dataset.libraryNote), 100, true))(); };
$('#library-keys').onpointerup = $('#library-keys').onpointercancel = e => { void libraryNote(`pointer:${e.pointerId}`, 0, 0, false); };
$('#library-keys').onkeydown = e => { const el = e.target as HTMLElement; if (!e.repeat && [' ', 'Enter'].includes(e.key) && el.dataset.libraryNote) { e.preventDefault(); void guard(() => libraryNote(`keyboard:${el.dataset.libraryNote}`, Number(el.dataset.libraryNote), 100, true))(); } };
$('#library-keys').onkeyup = e => { const el = e.target as HTMLElement; if ([' ', 'Enter'].includes(e.key)) void libraryNote(`keyboard:${el.dataset.libraryNote}`, 0, 0, false); };
window.addEventListener('blur', stopLibraryNotes);
let previewEpoch = 0;
let previewKey: string | undefined;
async function previewSound(name: string) {
  selectLibrarySound(name);
  const epoch = ++previewEpoch;
  const button = document.querySelector<HTMLElement>(`[data-preview-sound="${CSS.escape(name)}"], [data-preview="${CSS.escape(assets.find(a => soundKey(a) === name)?.id ?? '-')}"]`);
  button?.setAttribute('data-playing', 'true');
  if (previewKey) engine.performanceAudio.release(previewKey);
  await engine.unlock(); if (epoch !== previewEpoch) return;
  previewKey = `library:${epoch}`;
  await engine.performanceAudio.play(previewKey, { s: name, gain: .35 }, 60, 100);
  const key = previewKey; setTimeout(() => { engine.performanceAudio.release(key); button?.removeAttribute('data-playing'); }, 1800);
}
async function useSound(name: string, asset?: Asset) {
  const target = libraryTarget;
  const owner = target?.owner ?? editor;
  const original = owner.code;
  if (asset) await engine.preload(asset);
  if (!editorsHas(owner) || owner.code !== original || (target && owner.code !== target.code)) throw new Error('The destination changed. Close the library and select the sound again.');
  if (!target && (instrumentOpen || !openTabs.has(project.activeTabId))) throw new Error('Open a pattern before inserting a sound.');
  const change = target ? { from: target.from, to: target.to, insert: name } : asset ? sampleInsertion(owner.code, owner.view.state.selection.main.head, asset, project.bpm) : { from: statementEnd(owner.code, owner.view.state.selection.main.head), insert: `\n$: s("${name}")\n` };
  owner.view.dispatch({ changes: change, userEvent: 'input.sample', annotations: isolateHistory.of('full') });
  if (asset && !project.assetIds.includes(asset.id)) project.assetIds.push(asset.id);
  dirty(); setSounds(false); owner.view.focus(); notice(target ? 'Sound swapped. Apply changes to hear it during playback.' : 'Sound inserted.');
}
function editorsHas(owner: StudioEditor) { return [...editors.values()].includes(owner); }

let selectedSlider: string | undefined;
let learning: Target | undefined;
let bridge: BridgeStatus = { ready: false, message: 'Connecting…', ports: [], connected: [] };
let saveTimer: ReturnType<typeof setTimeout>;
let noticeTimer: ReturnType<typeof setTimeout>;
let eventRows: string[] = [];
let booted = false;
const pickup = new Pickup();

function notice(message: string, error = false) {
  $('#notice').textContent = message; $('#notice').classList.toggle('error', error); $('#notice').classList.add('visible');
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('#notice').classList.remove('visible'), error ? 12000 : 5000);
}
function guard(fn: () => unknown | Promise<unknown>) { return async () => { try { await fn(); } catch (error) { notice(error instanceof Error ? error.message : 'Something went wrong', true); } }; }
const editors = new Map<string, StudioEditor>();
let editor: StudioEditor;
let instrumentOpen = false;
let audioOpen = false;
const activeEditorId = () => audioOpen ? AUDIO_EDITOR : instrumentOpen ? MIDI_EDITOR : project.activeTabId;
function openMidiInstrument() {
  if (!$('#sounds-panel').hidden) setSounds(false);
  audioOpen = false; instrumentOpen = true; editor = getEditor(MIDI_EDITOR); selectedSlider = undefined;
  $('#mapping-context').hidden = true; learning = undefined; $('#cancel-learn').hidden = true; $('#drawer-learning').hidden = true;
  renderTabs(); renderSliders(); renderBindings(); saveWorkspace(); editor.view.requestMeasure(); editor.view.focus();
}

function getEditor(id = project.activeTabId) {
  let instance = editors.get(id);
  if (!instance) {
    const config = instrumentFor(project);
    const tab = id === AUDIO_EDITOR && project.audioInput ? { id, name: 'Audio input', color: 'teal' as const, code: project.audioInput.code, anchors: project.audioInput.anchors } : id === MIDI_EDITOR ? { id, name: 'MIDI instrument', color: 'blue' as const, code: config.code, anchors: config.anchors } : project.tabs.find(t => t.id === id);
    if (!tab) throw new Error('Pattern no longer exists.');
    const root = document.createElement('div'); root.className = 'tab-editor'; root.dataset.tabEditor = id; root.hidden = id !== project.activeTabId;
    $('#editor').append(root);
    const liveVersions = new Map<string, number>();
    instance = new StudioEditor(root, tab, {
      sounds: () => engine.soundEntries, functions: () => id === AUDIO_EDITOR ? ['AUDIO', 'gain', 'pan', 'lpf', 'hpf', 'delay', 'delaytime', 'delayfeedback', 'room', 'slider'] : id === MIDI_EDITOR ? [...engine.functionNames, 'MIDI'] : engine.functionNames,
      change: (live) => { for (const slider of instance?.sliders ?? []) engine.liveEffects.update(slider.id, instance!.values.get(slider.id) ?? slider.value); if (id === MIDI_EDITOR || id === AUDIO_EDITOR) { const config = id === AUDIO_EDITOR ? project.audioInput! : instrumentFor(project); config.code = instance!.code; config.anchors = instance!.anchors; const updates = new Map<string, number>(); for (const [key, version] of instance!.liveVersions) if (version !== liveVersions.get(key)) { liveVersions.set(key, version); updates.set(key, instance!.values.get(key)!); } updateAppliedInstrumentSliders(config, updates); if (id === AUDIO_EDITOR && updates.size) { try { liveInput.apply(config.appliedCode); } catch (error) { notice((error as Error).message, true); } } if (!live) paintMidiAssignment(); } if (!live) { if (id === activeEditorId()) renderSliders(); renderBindings(); renderTransport(); } dirty(live); },
      select: (sliderId) => { selectedSlider = sliderId; $('#slider-target').value = sliderId; $('#mapping-context').hidden = false; $('#slider-hint').textContent = effectBehavior(instance!.sliders.find(s => s.id === sliderId)?.label ?? ''); renderBindings(); },
      evaluate: () => void guard(() => id === AUDIO_EDITOR ? applyAudioInput() : id === MIDI_EDITOR ? applyMidiInstrument() : engine.started ? engine.apply() : startPlayback())(), stop: () => stopPlayback(),
    });
    editors.set(id, instance);
  }
  return instance;
}
editor = getEditor();
let timelineRecording: TimelineRecording | undefined;
const engine = new Engine(getEditor, () => snapshot(), () => renderTransport(), (message) => notice(message, true));
const liveInput = new LiveInput(engine, () => project);
function ensureAudioInput() {
  return project.audioInput ??= { id: crypto.randomUUID(), name: 'Audio input', trackId: project.tracks[0].id, enabled: true, mode: 'audio', code: defaultAudioCode, appliedCode: defaultAudioCode, anchors: [] };
}
function openAudioInput() {
  ensureAudioInput(); audioOpen = true; instrumentOpen = false; editor = getEditor(AUDIO_EDITOR); selectedSlider = undefined;
  renderTabs(); renderSliders(); renderBindings(); renderAudioInput(); dirty(); editor.view.focus();
}
async function applyAudioInput() {
  const owner = getEditor(AUDIO_EDITOR), input = ensureAudioInput();
  compileAudioEffects(owner.code); liveInput.apply(owner.code);
  input.code = input.appliedCode = owner.code; input.anchors = input.appliedAnchors = owner.anchors;
  renderAudioInput(); dirty(); await persistSession();
}
$('#editor').insertAdjacentHTML('beforebegin', '<div id="audio-toolbar" hidden><strong>Test vocal effects</strong><button id="audio-apply">Apply input effects</button><label>Monitor track <select id="audio-track"></select></label><label>Device <select id="audio-device"><option value="">Default input</option></select></label><label>Channel <select id="audio-channel"><option value="stereo">Stereo</option></select></label><button id="audio-connect">Connect microphone</button><button id="audio-disconnect">Disconnect / cancel permission</button><label><input id="audio-monitor" type="checkbox"> Monitor input</label><button id="audio-save-preset">Save effects preset…</button><label>Preset <select id="audio-preset"><option value="">Choose preset…</option></select></label><label>Input <meter id="audio-input-level" min="0" max="1" value="0"></meter></label><label>Output <meter id="audio-output-level" min="0" max="1" value="0"></meter></label><p id="audio-state" role="status">Input is disarmed. Monitoring defaults off.</p></div>');
function renderAudioInput() {
  if (!document.querySelector('#audio-test-take')) return;
  const input = project.audioInput; if (!input) return;
  $('#audio-track').innerHTML = project.tracks.map(t => `<option value="${t.id}">${escape(t.name)}</option>`).join(''); $('#audio-track').value = input.trackId;
  $('#audio-monitor').checked = liveInput.monitoring;
  const chosen = $('#audio-test-take').value; $('#audio-test-take').innerHTML = '<option value="">Choose a recorded take…</option>' + assets.filter(a => a.provider === 'recording' && !a.missing).map(a => `<option value="${a.id}">${escape(a.label || 'Recorded take')}</option>`).join(''); $('#audio-test-take').value = chosen;
  $('#audio-state').textContent = `${liveInput.pending ? 'Waiting for microphone permission; cancel is available' : liveInput.active ? 'Armed' : 'Disarmed'} · ${input.code === input.appliedCode ? 'Applied effects' : 'Draft changes — last applied effects remain active'}${liveInput.settings ? ` · ${liveInput.settings.sampleRate || 'device'} Hz · ${liveInput.settings.channelCount || 1} channels · echo cancellation ${liveInput.settings.echoCancellation ?? 'unknown'}, noise suppression ${liveInput.settings.noiseSuppression ?? 'unknown'}, auto gain ${liveInput.settings.autoGainControl ?? 'unknown'}` : ''}`;
}
$('#audio-apply').onclick = guard(applyAudioInput);
$('#audio-track').onchange = () => { ensureAudioInput().trackId = $('#audio-track').value; liveInput.mix(); dirty(); };
$('#audio-monitor').onchange = () => { liveInput.setMonitoring($('#audio-monitor').checked); renderAudioInput(); };
$('#audio-connect').onclick = guard(async () => {
  ensureAudioInput().enabled = true; dirty(); const connecting = liveInput.connect(ensureAudioInput(), $('#audio-device').value, $('#audio-channel').value); renderAudioInput();
  try { await connecting; const chosenChannel = $('#audio-channel').value; const devices = await navigator.mediaDevices.enumerateDevices(); $('#audio-device').innerHTML = '<option value="">Default input</option>' + devices.filter(d => d.kind === 'audioinput').map(d => `<option value="${escape(d.deviceId)}">${escape(d.label || 'Audio input')}</option>`).join(''); $('#audio-device').value = liveInput.settings?.deviceId ?? ''; $('#audio-channel').innerHTML = '<option value="stereo">Stereo channels 1–2</option>' + Array.from({ length: liveInput.settings?.channelCount ?? 1 }, (_, i) => `<option value="${i}">Mono channel ${i + 1}</option>`).join('') + Array.from({ length: Math.floor((liveInput.settings?.channelCount ?? 1) / 2) }, (_, i) => `<option value="${i * 2},${i * 2 + 1}">Stereo channels ${i * 2 + 1}–${i * 2 + 2}</option>`).join(''); $('#audio-channel').value = chosenChannel; }
  finally { renderAudioInput(); }
});
$('#audio-device').onchange = $('#audio-channel').onchange = () => { liveInput.disconnect(); renderAudioInput(); };
$('#audio-disconnect').onclick = () => { if (timelineRecording?.pending) { void timelineRecording.stop(true); return; } liveInput.disconnect(); renderAudioInput(); };
$('.composition-toolbar').insertAdjacentHTML('beforeend', '<div class="composition-recording"><label>Record to <select id="record-track" aria-label="Recording track"></select></label><button id="audio-record" class="record-button">Record audio input</button><output id="record-status" role="status" aria-live="polite"></output><button id="record-retry" hidden>Retry save</button><button id="record-download" hidden>Download recording</button><button id="record-discard" hidden>Discard recording…</button><details id="record-options"><summary>Recording settings</summary><label>Capture <select id="record-mode"><option value="wet">With vocal effects</option><option value="dry">Dry · editable effects</option></select></label><label><input id="record-countin" type="checkbox"> One-cycle count-in</label><label>Latency compensation (seconds)<input id="record-latency" type="number" min="-2" max="2" step="0.001" value="0"></label></details></div>');
$('#audio-record').onclick = guard(async () => {
  if (timelineRecording!.pending) { await timelineRecording!.stop(); return; }
  if (recordingPanel.pending || midiComposition.pending || performancePanel.take?.notes.length) throw new Error('Finish the pending performance before recording.');
  stopTakePreview(); await persistSession();
  await timelineRecording!.start({ trackId: $('#record-track').value, device: $('#audio-device').value, channel: $('#audio-channel').value, mode: $('#record-mode').value as 'wet' | 'dry', latency: Number($('#record-latency').value), countin: $('#record-countin').checked });
});
$('#record-retry').onclick = guard(() => timelineRecording!.retry());
$('#record-download').onclick = guard(() => timelineRecording!.download());
$('#record-discard').onclick = guard(async () => { if (await askEdit('Discard recovered recording?', undefined, 'This removes the unsaved recording. Download it first if you want to keep it.')) await timelineRecording!.discard(); });
$('#record-track').onchange = () => { selectedTrack = $('#record-track').value; };
function renderRecording() {
  const recording = timelineRecording, pending = !!recording?.pending;
  $('#audio-record').textContent = recording?.state === 'preparing' ? 'Cancel connection' : recording?.state === 'recording' ? 'Stop recording' : 'Record audio input';
  $('#audio-record').classList.toggle('recording', recording?.state === 'recording');
  $('#audio-record').disabled = !!recording && ['finishing', 'saving', 'failed'].includes(recording.state);
  $('#record-status').textContent = recording?.state === 'recording' ? `Recording · ${recording.elapsed.toFixed(1)} s` : recording?.message ?? '';
  $('#record-retry').hidden = $('#record-download').hidden = $('#record-discard').hidden = recording?.state !== 'failed';
  for (const id of ['record-track', 'record-mode', 'record-countin', 'record-latency', 'audio-device', 'audio-channel', 'audio-connect', 'audio-disconnect', 'audio-track', 'new-tab']) $('#' + id).disabled = pending;
  if (pending) { for (const id of ['composition-play', 'composition-return', 'composition-loop', 'bpm', 'play', 'add-track']) $('#' + id).disabled = true; }
  $('#composition-content').classList.toggle('capturing-audio', pending);
}

const takeView = document.createElement('section'); takeView.id = 'recorded-take-view'; takeView.hidden = true;
takeView.innerHTML = '<h2 id="take-title"></h2><p id="take-info"></p><button id="take-play">Play recording</button><button id="take-stop">Stop preview</button><button id="take-rename">Rename recording</button><button id="take-code" aria-expanded="false">Show code</button>';
$('#editor').before(takeView);
const takeCodeOpen = new Set<string>();
let previewSource: AudioBufferSourceNode | undefined, previewEffects: ReturnType<typeof createInputEffects> | undefined, previewEpochAudio = 0;
const updatePreviewEffects = (code: string) => previewEffects?.apply(code);
function stopTakePreview() {
  previewEpochAudio++; try { previewSource?.stop(); } catch { /* ended */ }
  previewSource?.disconnect(); previewEffects?.disconnect(); previewSource = undefined; previewEffects = undefined;
  liveInput.effectListeners.delete(updatePreviewEffects);
}
async function previewRecordedAudio(id: string, testEffects = false) {
  if (timelineRecording?.pending) throw new Error('Finish recording before previewing another take.');
  stopTakePreview(); const epoch = previewEpochAudio;
  const asset = await workspace.asset(id);
  const dryId = testEffects ? asset.recording?.dryAssetId : undefined;
  await engine.unlock(); const context = engine.audioContext;
  const buffer = await context.decodeAudioData(await (await workspace.audioBlob(dryId ?? id)).arrayBuffer());
  if (epoch !== previewEpochAudio) return;
  previewEffects = createInputEffects(context, testEffects ? ensureAudioInput().appliedCode : takeEffects(asset, project));
  previewSource = context.createBufferSource(); previewSource.buffer = buffer;
  previewSource.connect(previewEffects.input); previewEffects.output.connect(engine.masterInput);
  if (testEffects) liveInput.effectListeners.add(updatePreviewEffects);
  const source = previewSource; source.onended = () => { setTimeout(() => { if (previewSource === source) stopTakePreview(); }, 3000); }; source.start();
}
function renderTakeView() {
  const tab = project.tabs.find(t => t.id === project.activeTabId);
  const id = tab?.audioAssetId ?? project.clips.find(c => c.tabId === tab?.id && c.takeId)?.takeId;
  const visible = !audioOpen && !instrumentOpen && !!tab && openTabs.has(tab.id) && !!id;
  takeView.hidden = !visible;
  if (!visible || !tab) return;
  $('#take-title').textContent = tab.name;
  const asset = assets.find(a => a.id === id);
  $('#take-info').textContent = `${(asset?.duration ?? 0).toFixed(1)} seconds · ${asset?.recording?.mode === 'wet' ? 'Recorded with vocal effects' : 'Editable input effects'}${asset?.recording?.incomplete ? ' · Interrupted recording' : ''}`;
  $('#editor').hidden = !takeCodeOpen.has(tab.id);
  $('#take-code').textContent = takeCodeOpen.has(tab.id) ? 'Hide code' : 'Show code'; $('#take-code').setAttribute('aria-expanded', String(takeCodeOpen.has(tab.id)));
  $('#take-play').onclick = guard(() => previewRecordedAudio(id!));
}
$('#take-stop').onclick = stopTakePreview;
$('#take-rename').onclick = guard(async () => { await renameTab(project.activeTabId); renderTakeView(); });
$('#take-code').onclick = () => { const id = project.activeTabId; if (takeCodeOpen.has(id)) takeCodeOpen.delete(id); else takeCodeOpen.add(id); renderTakeView(); editor.view.requestMeasure(); };
$('#audio-toolbar').insertAdjacentHTML('beforeend', '<div class="test-recording"><label>Test on recording <select id="audio-test-take"><option value="">Choose a recorded take…</option></select></label><button id="audio-test-play">Test vocal effects</button><button id="audio-test-stop">Stop test</button><span>Testing changes the preview; your saved recording stays intact.</span></div>');
$('#audio-test-play').onclick = guard(() => { const id = $('#audio-test-take').value; if (!id) throw new Error('Choose a recording to test.'); return previewRecordedAudio(id, true); });
$('#audio-test-stop').onclick = stopTakePreview;
$('#audio-save-preset').onclick = guard(async () => {
  const input = ensureAudioInput(); if (input.code !== input.appliedCode) throw new Error('Apply input effects before saving a preset.');
  const name = await askEdit('Save audio effects preset', ''); if (!name) return;
  await workspace.write([{ collection: 'settings', key: `audio-preset:${crypto.randomUUID()}`, value: { kind: 'audio-preset', id: crypto.randomUUID(), name, code: input.appliedCode } }]); await refreshAudioPresets();
});
let audioPresets: { id: string; name: string; code: string }[] = [];
async function refreshAudioPresets() { audioPresets = (await workspace.all<any>('settings')).filter(p => p?.kind === 'audio-preset'); $('#audio-preset').innerHTML = '<option value="">Choose preset…</option>' + audioPresets.map(p => `<option value="${p.id}">${escape(p.name)}</option>`).join(''); }
$('#audio-preset').onchange = guard(async () => { const preset = audioPresets.find(p => p.id === $('#audio-preset').value); if (!preset) return; const owner = getEditor(AUDIO_EDITOR); if (owner.code !== ensureAudioInput().appliedCode && !await askEdit('Replace input draft?', undefined, 'Preset recall replaces your unapplied input effects.')) return; owner.view.dispatch({ changes: { from: 0, to: owner.code.length, insert: preset.code } }); await applyAudioInput(); });
$('#editor').insertAdjacentHTML('beforebegin', '<div id="instrument-toolbar" hidden><strong>MIDI effects</strong><button id="instrument-apply" class="primary">Apply instrument</button><label>Preset <select id="midi-preset" aria-label="MIDI preset"><option value="">Choose preset…</option></select></label><button id="save-midi-preset">Save preset…</button><button id="learn-midi-preset">Map preset to MIDI key</button><button id="cancel-preset-learn" hidden>Cancel preset mapping</button><span id="preset-learn-status" role="status"></span><button id="instrument-stop">Stop instrument</button><span id="instrument-state" role="status"></span><p class="hint">MIDI is your keyboard input. Add a sound and effects, then Apply. Save preset keeps the applied chain for any session.</p></div>');
const midiOutputControls = document.createElement('div'); midiOutputControls.id = 'midi-output-controls';
midiOutputControls.innerHTML = '<label>Find sound <input id="midi-output-search" type="search" aria-label="Find MIDI output sound" placeholder="Search all sounds"></label><label>Output sound <select id="midi-output-sound" aria-label="MIDI output sound"></select></label>';
midiOutputControls.append($('#midi-assignment'), $('#clear-midi-sound'));
$('#instrument-toolbar').prepend(midiOutputControls);
function renderMidiOutputs() {
  const config = instrumentFor(project), current = instrumentSound(config.appliedCode);
  const query = $('#midi-output-search').value.trim().toLowerCase();
  const missing = new Set(assets.filter(a => a.missing).map(soundKey));
  const library = new Set(assets.map(soundKey));
  const entries = engine.soundEntries.filter(s => s.name === current || `${s.name} ${s.label}`.toLowerCase().includes(query));
  const options = (isLibrary: boolean) => entries.filter(s => library.has(s.name) === isLibrary).map(s => `<option value="${escape(s.name)}" ${missing.has(s.name) ? 'disabled' : ''}>${escape(s.label)}${missing.has(s.name) ? ' · audio missing' : ''}</option>`).join('');
  $('#midi-output-sound').innerHTML = `<option value="">${config.enabled ? 'Custom MIDI sound' : 'Muted'}</option><optgroup label="Built-in sounds">${options(false)}</optgroup><optgroup label="Library sounds">${options(true)}</optgroup>`;
  paintMidiAssignment();
}
$('#midi-output-search').oninput = renderMidiOutputs;
$('#midi-output-sound').onchange = guard(async () => {
  const name = $('#midi-output-sound').value;
  if (!name) { paintMidiAssignment(); return; }
  $('#midi-output-sound').disabled = true;
  try { await assignMidiSound(name); }
  finally { $('#midi-output-sound').disabled = false; renderMidiOutputs(); }
});
$('#edit-midi-instrument').onclick = openMidiInstrument;
$('#instrument-apply').onclick = guard(() => applyMidiInstrument());
$('#instrument-stop').onclick = () => { engine.stopInstrument(); paintMidiAssignment(); };
type MidiPreset = { id: string; name: string; code: string };
let midiPresets: MidiPreset[] = [];
async function refreshMidiPresets(selected = $('#midi-preset').value) {
  midiPresets = await workspace.presets();
  $('#midi-preset').innerHTML = '<option value="">Choose preset…</option>' + midiPresets.map(p => `<option value="${p.id}">${escape(p.name)}</option>`).join('');
  $('#midi-preset').value = selected;
  renderBindings();
}
$('#save-midi-preset').onclick = guard(async () => {
  const config = instrumentFor(project);
  if (getEditor(MIDI_EDITOR).code !== config.appliedCode) throw new Error('Apply your MIDI effects before saving a preset.');
  const name = await askEdit('Save MIDI preset', '', 'This effects chain will be available in every session.');
  if (!name) return;
  const preset = await workspace.savePreset({ name, code: config.appliedCode });
  await refreshMidiPresets(preset.id); notice(`Saved preset · ${preset.name}`);
});
async function loadMidiPreset(preset: MidiPreset, fromMidi = false) {
  const owner = getEditor(MIDI_EDITOR), config = instrumentFor(project);
  $('#midi-preset').disabled = true;
  try {
    if (!fromMidi && owner.code !== config.appliedCode && !await askEdit('Replace MIDI draft?', undefined, 'Loading this preset replaces your unapplied MIDI edits.')) {
      $('#midi-preset').value = midiPresets.find(p => p.code === config.appliedCode)?.id ?? ''; return;
    }
    pendingMidiSliders.clear();
    engine.stopInstrument();
    owner.view.dispatch({ changes: { from: 0, to: owner.code.length, insert: preset.code } });
    await applyMidiInstrument(!fromMidi);
    $('#midi-preset').value = preset.id;
    notice(`Loaded preset · ${preset.name}`);
  } catch (error) {
    $('#midi-preset').value = midiPresets.find(p => p.code === config.appliedCode)?.id ?? '';
    throw error;
  } finally { $('#midi-preset').disabled = false; }
}
$('#midi-preset').onchange = guard(async () => {
  const preset = midiPresets.find(p => p.id === $('#midi-preset').value);
  if (preset) await loadMidiPreset(preset);
});
$('#learn-midi-preset').onclick = guard(async () => {
  const preset = midiPresets.find(p => p.id === $('#midi-preset').value);
  if (!preset) throw new Error('Save or choose a MIDI preset first.');
  beginLearn({ kind: 'midi-preset', presetId: preset.id });
  $('#cancel-preset-learn').hidden = false;
  $('#preset-learn-status').textContent = `Press a key to recall ${preset.name}. Recall replaces the current MIDI effects.`;
});
$('#cancel-preset-learn').onclick = () => {
  learning = undefined; $('#cancel-preset-learn').hidden = true;
  $('#cancel-learn').hidden = true; $('#drawer-learning').hidden = true;
  $('#preset-learn-status').textContent = 'Mapping cancelled.';
};
let pendingMidiPreset: MidiPreset | undefined;
let recallingMidiPreset = false;
async function recallMidiPreset(id: string) {
  const preset = midiPresets.find(p => p.id === id);
  if (!preset) throw new Error('Mapped MIDI preset is missing. Choose a preset and map it again.');
  pendingMidiPreset = preset;
  if (recallingMidiPreset) return;
  recallingMidiPreset = true;
  try {
    while (pendingMidiPreset) {
      const next = pendingMidiPreset; pendingMidiPreset = undefined;
      await loadMidiPreset(next, true);
    }
  } finally { recallingMidiPreset = false; pendingMidiPreset = undefined; }
}
const performancePanel = new PerformancePanel(() => editor, () => project.tabs.find(t => t.id === project.activeTabId)!, message => notice(message, true), engine, () => selectedProjectName || project.name, () => persistSession());
$('#editor').after(performancePanel.root);
const recordingPanel = new RecordingPanel(engine, () => performancePanel.prepare(), async asset => { project.assetIds.push(asset.id); assets.unshift(asset); await engine.registerAssets(assets); selectedAsset = asset.id; selectedSound = soundKey(asset); renderAssets(); dirty(); }, message => notice(message, true), () => selectedProjectName || project.name, () => performancePanel.stop(), liveInput, ensureAudioInput, async asset => {
  const recording = asset.recording!;
  let trackId = recording.trackId ?? project.tracks[0].id;
  const rawExact = recording.offsetCycles - (recording.latencySeconds ?? 0) * project.bpm / 240, exact = Math.max(0, rawExact);
  const takeOffsetSeconds = Math.max(0, -rawExact * 240 / project.bpm);
  const start = Math.floor(exact * 4) / 4, lead = (exact - start) * 240 / project.bpm;
  const length = Math.max(.25, Math.ceil((Math.max(0, (asset.duration ?? 0) - takeOffsetSeconds) + lead) * project.bpm / 240 * 4) / 4);
  if (project.clips.some(c => c.trackId === trackId && start < c.start + c.length && c.start < start + length)) { if (project.tracks.length >= 16) throw new Error('Take saved to library. Free a track before placing it.'); trackId = crypto.randomUUID(); project.tracks.push({ id: trackId, name: 'Input take', muted: false }); }
  if (project.tabs.length >= 50) throw new Error('Take saved to library. Close a pattern before placing it.');
  const tabId = crypto.randomUUID(); project.tabs.push({ id: tabId, name: asset.label || 'Audio take', code: `// Captured ${recording.mode || 'dry'} audio. Input effects are edited in Audio input.\n// This pattern previews the stored audio; its take-backed clip preserves timing.\ns("studio_${asset.id.replaceAll('-', '')}").gain(1)`, color: 'teal', anchors: [] });
  project.clips.push({ id: crypto.randomUUID(), tabId, trackId, start, length, takeId: asset.id, takeLeadSeconds: lead, takeOffsetSeconds, muted: false });
  if (project.audioInput) project.audioInput.enabled = false;
  renderComposition(); dirty(); await persistSession();
});
timelineRecording = new TimelineRecording(engine, liveInput, snapshot, ensureAudioInput, async (identity, audio, metaKey) => {
  clearTimeout(saveTimer); await saveChain.catch(() => {});
  const state = snapshot();
  const operation = commitRecordedTake(state, identity, audio, metaKey).then(async next => {
    project = next; selectedProjectName = next.sessionId!;
    assets = await workspace.assets(); await engine.registerAssets(assets);
    openTabs.add(identity.tabId); switchTab(identity.tabId); selectedTrack = identity.trackId;
    renderAll(); saveWorkspace(); cacheDraft(); await refreshProjects();
  });
  saveChain = operation; await operation;
}, () => { renderRecording(); renderComposition(); renderAudioInput(); });
performancePanel.pendingAudio = () => recordingPanel.pending || !!timelineRecording?.pending;
$('#sound-import').append(recordingPanel.root);
const sampleImports = new SampleImports(async asset => { if (!project.assetIds.includes(asset.id)) project.assetIds.push(asset.id); assets = [asset, ...assets.filter(a => a.id !== asset.id)]; await engine.registerAssets(assets); selectedAsset = asset.id; selectedSound = soundKey(asset); renderAssets(); dirty(); }, message => notice(message, true), () => selectedProjectName || project.name, () => persistSession());
const importPage = document.createElement('section'); importPage.id = 'sample-import-page'; importPage.hidden = true;
importPage.innerHTML = `<header><a href="#/">← Back to Studio</a><span>YOUR SOUND LIBRARY</span></header><h1>Bring your own sounds.</h1><p>Import from a public GitHub repository, or choose files from your device. Selected sounds stay in this browser.</p><div class="import-columns"><div id="github-import-column"></div><div id="file-import-column"></div></div><section class="browser-storage"><h2>Saved on this device</h2><p id="storage-usage" role="status"></p><p>Browser data can be cleared. Download project backups to keep your music or move it to another device.</p><button id="persist-storage">Keep browser storage</button><button id="import-backup">Download current project backup</button></section>`;
document.body.append(importPage);
$('#file-import-column').append(sampleImports.root);
$('#github-import-column').append(new GitHubImports(sampleImports, message => notice(message, true)).root);
$('#sound-import').insertAdjacentHTML('afterbegin', '<a class="import-page-link" href="#/samples/import">Import samples from GitHub or files ↗</a>');
$('.topbar').insertAdjacentHTML('beforeend', '<a class="import-nav" href="#/samples/import">Import samples</a>');
async function updateStorageUsage() {
  const estimate = await navigator.storage?.estimate();
  $('#storage-usage').textContent = estimate ? `${((estimate.usage ?? 0) / 1e6).toFixed(1)} MB used · ${((estimate.quota ?? 0) / 1e6).toFixed(0)} MB available quota` : 'Storage usage is unavailable in this browser.';
}
function routePage() {
  const importing = location.hash === '#/samples/import';
  if (importing) setSounds(false);
  importPage.hidden = !importing; app.hidden = importing;
  if (importing) { void updateStorageUsage().catch(() => {}); importPage.querySelector('h1')!.setAttribute('tabindex', '-1'); importPage.querySelector('h1')!.focus(); }
}
window.addEventListener('hashchange', routePage);
$('#persist-storage').onclick = guard(async () => { const kept = await navigator.storage?.persist?.(); notice(kept ? 'Persistent storage granted. Keep project backups too.' : 'The browser did not grant persistent storage. Project backups are still available.'); await updateStorageUsage(); });
$('#import-backup').onclick = () => $('#backup-project').click();
const recordButton = document.createElement('button'); recordButton.textContent = 'Record audio';
recordButton.onclick = () => { setSounds(false); setDrawer('composition'); $('#audio-record').focus(); }; $('#sound-import').prepend(recordButton);
const recordSelected = document.createElement('button'); recordSelected.textContent = 'Record highlighted sound';
recordSelected.onclick = guard(async () => { if (timelineRecording?.pending) throw new Error('Finish recording first.'); performancePanel.stop(); await persistSession(); await recordingPanel.open('internal'); setSounds(true); soundSource('import'); ($('#add-sounds') as HTMLDetailsElement).open = true; });
performancePanel.root.querySelector('[data-actions]')!.append(recordSelected);
const performButton = document.createElement('button'); performButton.textContent = 'Play MIDI';
performButton.onclick = guard(() => playMidi());
$('.editor-footer').prepend(performButton);
let selectedMidiClip: string | undefined;
const midiComposition = new MidiComposition(engine, () => snapshot(), async next => {
  for (const tab of next.tabs) if (!project.tabs.some(t => t.id === tab.id)) openTabs.add(tab.id);
  project = next; renderTabs(); renderComposition(); renderTransport(); dirty(); await persistSession();
}, () => selectedProjectName || project.name, message => notice(message, true));
$('#editor').after(midiComposition.root);
const compositionRecord = document.createElement('button'); compositionRecord.textContent = 'Record phrase audio'; compositionRecord.onclick = guard(async () => { if (midiComposition.pending || midiComposition.running) throw new Error('Keep or discard the current take first.'); midiComposition.close(); performancePanel.arm(); await performancePanel.prepare(); recordSelected.click(); }); midiComposition.root.querySelector('.midi-more')!.append(compositionRecord);
const rangeDetails = document.createElement('details'); rangeDetails.className = 'range-details'; rangeDetails.innerHTML = '<summary>Range options</summary>'; rangeDetails.append(midiComposition.range); $('.composition-toolbar').append(rangeDetails);
async function armCompositionMidi() {
  if (performancePanel.take?.notes.length || recordingPanel.pending) throw new Error('Resolve the pending performance take first.');
  performancePanel.close();
  const clips = project.clips.filter(c => c.tabId === project.activeTabId);
  if (clips.length > 1 && !clips.some(c => c.id === selectedMidiClip)) {
    const dialog = document.createElement('dialog'); dialog.innerHTML = '<h2>Choose a destination</h2>' + clips.map(c => `<button data-destination-clip="${c.id}">${escape(project.tracks.find(t => t.id === c.trackId)?.name)} · ${c.start}–${c.start + c.length}</button>`).join('') + '<button data-cancel>Cancel</button>'; document.body.append(dialog);
    const choice = await new Promise<string | undefined>(resolve => { dialog.onclick = e => { const el = e.target as HTMLElement; if (el.dataset.destinationClip) { selectedMidiClip = el.dataset.destinationClip; dialog.close('chosen'); } else if (el.hasAttribute('data-cancel')) dialog.close(); }; dialog.onclose = () => resolve(dialog.returnValue === 'chosen' ? selectedMidiClip : undefined); dialog.showModal(); }); dialog.remove(); if (!choice) return;
  }
  midiComposition.arm(editor, project.activeTabId, selectedMidiClip);
  await midiComposition.audition();
  setDrawer('composition'); $('#play-target').value = 'composition'; renderTransport();
}
async function playMidi() {
  if (!openTabs.has(project.activeTabId)) throw new Error('Open a pattern and select a note phrase first.');
  if (project.clips.some(c => c.tabId === project.activeTabId)) return armCompositionMidi();
  if (midiComposition.pending || midiComposition.running) throw new Error('Keep or discard the current take first.');
  midiComposition.close(); performancePanel.arm(); await performancePanel.prepare();
}
function expressionActions(pos: number, x: number, y: number) {
  if (instrumentOpen) return false;
  const token = soundToken(editor.code, pos);
  if (token) {
    libraryTarget = { owner: editor, code: editor.code, from: token.from, to: token.to }; selectedSound = editor.code.slice(token.from, token.to); selectedAsset = assets.find(a => soundKey(a) === selectedSound)?.id; $('#sound-search').value = ''; $('#library-source').value = 'all'; setSounds(true); return true;
  }
  try {
    const d = destinationFor(editor.code, project.activeTabId, pos, pos);
    if (!d.original.startsWith('note(')) return false;
    editor.view.dispatch({ selection: { anchor: pos } });
    contextMenu.open([{ label: 'Play MIDI', run: guard(playMidi) }, ...(project.clips.some(c => c.tabId === project.activeTabId) ? [{ label: 'Play MIDI without composition', run: guard(async () => { if (midiComposition.pending || midiComposition.running) throw new Error('Keep or discard the current take first.'); midiComposition.close(); performancePanel.arm(); await performancePanel.prepare(); }) }] : [])], x, y, () => editor.view.contentDOM); return true;
  } catch { return false; }
}
$('#editor').addEventListener('click', event => {
  if (!(event.target as HTMLElement).closest('.cm-content')) return;
  const pos = editor.view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos !== null) expressionActions(pos, event.clientX, event.clientY + 12);
});
$('#tracks').addEventListener('pointerdown', event => { const id = (event.target as HTMLElement).closest<HTMLElement>('[data-clip]')?.dataset.clip; if (id) selectedMidiClip = id; });
let saveChain = Promise.resolve();
let lastSaveError = '';
let saveRevision = 0;
function snapshot(): Project {
  const applied = engine.appliedState();
  return { ...project, appliedPatterns: { ...project.appliedPatterns, ...applied.codes }, appliedPatternAnchors: { ...project.appliedPatternAnchors, ...applied.anchors }, sessionId: selectedProjectName || undefined, tabs: project.tabs.map(tab => { const e = editors.get(tab.id); return e ? { ...tab, code: e.code, anchors: e.anchors } : tab; }), name: $('#project-name').value.trim() || 'Untitled project' };
}
const draftKey = `studio.pending-session.${sessionStorage.getItem('studio.tab') || (() => { const id = crypto.randomUUID(); sessionStorage.setItem('studio.tab', id); return id; })()}`;
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
      ? await workspace.saveProject(sessionId, { ...state, sessionId, revision: project.revision })
      : await workspace.createProject(state);
    selectedProjectName = saved.sessionId!;
    project.sessionId = selectedProjectName; project.revision = saved.revision;
    saveWorkspace(); cacheDraft();
    await workspace.write([{ collection: 'settings', key: 'recovery', value: saved }]);
    await refreshProjects();
    if (revision === saveRevision) {
      try { localStorage.removeItem(draftKey); } catch { /* unavailable storage */ }
      $('#saved-state').textContent = 'Saved in this browser'; $('#saved-state').title = ''; lastSaveError = '';
    }
  }).catch(error => {
    const message = error instanceof Error ? error.message : 'Request failed';
    $('#saved-state').textContent = 'Not saved · press Save to retry'; $('#saved-state').title = message;
    if (message !== lastSaveError) { lastSaveError = message; notice(`Couldn't save the session: ${message}`, true); }
    throw error;
  });
  saveChain = task;
  return task;
}
let draftTimer: ReturnType<typeof setTimeout>;
window.addEventListener('pagehide', cacheDraft);
function dirty(live = false) {
  if (!booted) return;
  ++saveRevision;
  clearTimeout(draftTimer);
  if (live) draftTimer = setTimeout(cacheDraft, 150); else cacheDraft();
  $('#saved-state').textContent = 'Saving…'; clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void persistSession().catch(() => {}); }, 600);
}
window.addEventListener('online', () => { if (booted) void persistSession().catch(() => {}); });
let sessionTransition = false;
async function transitionSession(action: () => Promise<void>) {
  if (timelineRecording?.pending) throw new Error('Finish or save the recording before switching sessions.');
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
function targetLabel(target: Target) { return target.kind === 'slider' ? getEditor(target.tabId).sliders.find((s) => s.id === target.sliderId)?.label ?? 'Missing slider • rebind' : target.kind === 'swap' ? `${target.slot} ← ${assetLabel(target.assetId)}` : target.kind === 'midi-preset' ? `MIDI preset · ${midiPresets.find(p => p.id === target.presetId)?.name ?? 'Missing preset'}` : `Trigger ${assetLabel(target.assetId)}`; }
function send(value: object) { browserMidi.send(value as { type: string; bytes?: number[]; simulate?: boolean }); }
function ensureDeviceProfiles() {
  for (const port of devicePorts) if (project.profiles.length < 50 && !project.profiles.some(profile => profile.port === port)) {
    project.profiles.push({ id: crypto.randomUUID(), name: port, port, enabled: true });
  }
}
function renderTransport() {
  paintMidiAssignment();
  const playing = engine.started;
  $('#composition-play').disabled = playing || engine.busy || !project.clips.length;
  $('#composition-play').textContent = engine.busy ? 'Preparing…' : 'Play composition';
  $('#composition-loop').disabled = playing || midiComposition.running || midiComposition.pending;
  $('#composition-return').disabled = midiComposition.running || midiComposition.pending;
  $('#composition-position').textContent = engine.timelinePosition.toFixed(2);
  $('#composition-loop').setAttribute('aria-pressed', String(engine.transport.loop));
  const name = engine.target === 'composition' ? 'Composition' : project.tabs.find(t => t.id === engine.target)?.name ?? '';
  $('#transport-state').textContent = playing ? `Playing · ${name}${engine.pendingCycle !== undefined ? ' · changes queued' : ''}` : 'Stopped';
  $('#transport-state').classList.toggle('playing', playing);
  $('#play').disabled = audioOpen || instrumentOpen || !openTabs.has(project.activeTabId) || playing || engine.busy;
  $('#play').textContent = engine.busy ? 'Preparing…' : 'Play';
  $('#play-target').disabled = playing || engine.busy;
  $('#evaluate').hidden = audioOpen || instrumentOpen || !engine.hasChanges;
  $('#evaluate').disabled = engine.busy || !!timelineRecording?.pending;
  $('#bpm').disabled = playing || engine.busy;
  $('#add-track').disabled = playing || engine.busy || project.tracks.length >= 16;
  $('#arrangement-status').hidden = engine.pendingMuteCycle === undefined;
  renderRecording();
  $('#arrangement-status').textContent = engine.pendingMuteCycle !== undefined ? `Mix change at cycle ${engine.pendingMuteCycle}` : playing ? 'Stop playback to edit clips' : 'Edit while stopped · 4 beats per cycle';
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
    return `<div data-binding="${escape(b.id)}" class="binding ${missing ? 'missing' : ''}"><div><strong>${escape(targetLabel(b.target))}</strong><span>${escape(project.profiles.find((p) => p.id === b.profileId)?.name ?? 'Missing device')} · CH ${b.channel} · ${b.kind.toUpperCase()} ${b.number}${b.pickup ? ' · pickup' : ''}${b.target.kind === 'slider' ? ' · ' + escape(effectBehavior(getEditor(b.target.tabId).sliders.find(s => s.id === (b.target as { sliderId: string }).sliderId)?.label ?? '')) : ''}</span></div><button data-remove-binding="${b.id}" aria-label="Remove binding">×</button></div>`;
  }).join('') : '<p class="empty small">No mappings yet.<br>Select an inline slider to get started.</p>';
  const selected = project.bindings.filter(b => b.target.kind === 'slider' && b.target.tabId === activeEditorId() && b.target.sliderId === selectedSlider);
  $('#selected-bindings').replaceChildren(...selected.map(b => $('#bindings').querySelector(`[data-binding="${CSS.escape(b.id)}"]`)!.cloneNode(true)));

}
function renderProfiles() {
  ensureDeviceProfiles();
  const available = $('#available-ports').value;
  $('#bridge-status').textContent = bridge.ready ? 'Choose an input below. Unplugged devices reconnect automatically when available.' : bridge.message;
  $('#profiles').innerHTML = devicePorts.map(port => {
    const connected = bridge.connected.includes(port);
    const status = connected ? 'Connected' : !bridge.ready ? 'MIDI unavailable' : bridge.ports.includes(port) ? 'Connecting…' : 'Waiting for device';
    return `<div class="device-connection"><div><strong>${escape(port)}</strong><span>${status}</span></div><button data-disconnect-port="${escape(port)}" aria-label="Disconnect ${escape(port)}">Disconnect</button></div>`;
  }).join('') || '<p class="hint">No external devices connected. Plug in your controller, then choose its MIDI input.</p>';
  $('#available-ports').innerHTML = '<option value="">Choose MIDI input…</option>' + bridge.ports.filter(port => !devicePorts.includes(port)).map(port => `<option>${escape(port)}</option>`).join('');
  if (bridge.ports.includes(available) && !devicePorts.includes(available)) $('#available-ports').value = available;
  $('#available-ports').disabled = !bridge.ready;
  $('#add-profile').disabled = !bridge.ready || !$('#available-ports').value;
  $('#manual-profile').innerHTML = project.profiles.map(p => `<option value="${p.id}">${escape(p.name)}</option>`).join('');
  renderRoute();
}
function renderRoute() {
  const simulation = $('#route').value === 'simulation';
  $('#route-status').textContent = simulation ? 'Browser controls are ready. No MIDI hardware needed.' : bridge.ready ? 'Web MIDI connected.' : 'Web MIDI unavailable. Use Browser controls or reconnect your device.';
  $('#route-status').classList.toggle('simulation', simulation);
}
function soundRepository(asset: Asset) {
  try {
    const url = new URL(asset.source?.url ?? '');
    if (url.protocol !== 'https:' || !['github.com', 'raw.githubusercontent.com'].includes(url.hostname)) return '';
    const [owner, repository] = url.pathname.split('/').filter(Boolean);
    return owner && repository ? owner + '/' + repository.replace(/\.git$/, '') : '';
  } catch { return ''; }
}
function renderAssets() {
  renderMidiOutputs();
  $('.library-test').append($('#library-keys'));
  const query = $('#sound-search').value.trim().toLowerCase(), source = $('#library-source').value;
  const matches = (values: unknown[]) => query.split(/\s+/).every(term => values.join(' ').toLowerCase().includes(term));
  const visibleAssets = assets.filter(a => source !== 'builtin' && (source === 'all' || a.provider === source || source === 'upload' && a.provider === 'github' || source === 'elevenlabs' && a.provider === 'fixture') && matches([soundLabel(a), a.description, a.prompt, ...(a.tags ?? []), a.pack?.name, a.pack?.folder, soundRepository(a)]));
  const builtin = source === 'all' || source === 'builtin' ? engine.soundEntries.filter(e => !assets.some(a => soundKey(a) === e.name) && matches([e.name, e.label])) : [];
  const total = assets.length + engine.soundEntries.filter(e => !assets.some(a => soundKey(a) === e.name)).length, shown = visibleAssets.length + builtin.length;
  $('#asset-count').textContent = shown === total ? `${total} sound${total === 1 ? '' : 's'}` : `${shown} of ${total} sounds`;
  $('#library-destination').textContent = libraryTarget ? `Replace “${libraryTarget.code.slice(libraryTarget.from, libraryTarget.to)}” · preview, then choose Swap` : 'Preview a sound, then insert it into your pattern.';
  const use = libraryTarget ? 'Swap' : 'Insert';
  $('#builtin-sounds').innerHTML = builtin.map(e => `<article class="asset ${selectedSound === e.name ? 'selected' : ''}"><button class="asset-select" data-select-sound="${escape(e.name)}"><span><strong>${escape(e.label)}</strong><small>Built-in · ${escape(e.name)}</small></span></button><button data-use-sound="${escape(e.name)}">${use}</button><button data-preview-sound="${escape(e.name)}" aria-label="Preview ${escape(e.label)}">▶</button><button data-assign-midi="${escape(e.name)}" aria-label="Assign ${escape(e.label)} to MIDI">Assign to MIDI</button><button data-live-sound="${escape(e.name)}" aria-pressed="${libraryMidi && selectedSound === e.name}" aria-label="Live ${escape(e.label)}" title="Play this sound from your MIDI controller or the test keys">Live</button></article>`).join('');
  $('#assets').innerHTML = visibleAssets.map(a => `<article data-asset="${a.id}" class="asset ${selectedSound === soundKey(a) || a.id === selectedAsset ? 'selected' : ''}"><button data-select-asset="${a.id}" class="asset-select"><span><strong>${escape(soundLabel(a))}</strong>${soundRepository(a) ? `<small class="sound-repository">GitHub · ${escape(soundRepository(a))}</small>` : ''}<small>${[escape(a.description || a.prompt), a.tags?.length ? escape(a.tags.join(', ')) : '', a.pack ? escape(a.pack.name) : '', a.missing ? 'Audio missing' : a.precision?.working === 'float32' ? 'Float working audio' : 'Legacy precision; original retained when available'].filter(Boolean).join(' · ')}</small></span></button>${a.missing ? `<button data-recover="${a.id}">Recover sound</button>` : ''}<button data-insert-existing="${a.id}" ${a.missing ? 'disabled' : ''}>${use}</button><button data-preview="${a.id}" aria-label="Preview ${escape(soundLabel(a))}" ${a.missing ? 'disabled' : ''}>▶</button><button data-assign-midi="${escape(soundKey(a))}" aria-label="Assign ${escape(soundLabel(a))} to MIDI" ${a.missing ? 'disabled' : ''}>Assign to MIDI</button><button data-live-sound="${escape(soundKey(a))}" aria-pressed="${libraryMidi && selectedSound === soundKey(a)}" aria-label="Live ${escape(soundLabel(a))}" title="Play this sound from your MIDI controller or the test keys" ${a.missing ? 'disabled' : ''}>Live</button><details class="asset-options"><summary aria-label="Options for ${escape(soundLabel(a))}">•••</summary><div><button data-rename-asset="${a.id}">Rename</button><button data-metadata="${a.id}">Tags and description</button>${a.pack ? `<button data-rename-pack="${a.pack.id}">Rename pack</button>` : ''}</div></details></article>`).join('') || (builtin.length ? '' : '<p class="empty">No matching sounds. Try another search or add sounds.</p>');
  $('#assignment').hidden = !selectedAsset;
  paintLibrarySelection();
  $('#assign-target').innerHTML = project.controls.filter((c) => c.kind === 'pad' || c.kind === 'key').map((c) => `<option value="pad:${c.id}">${escape(c.label)} · Note ${c.number}</option>`).join('') + project.slots.map((s) => `<option value="slot:${s.name}">Sound slot: ${escape(s.name)}</option>`).join('');
}
$('#sound-search').oninput = renderAssets;
$('#library-source').onchange = renderAssets;
$('#builtin-sounds').onclick = e => { const el = (e.target as HTMLElement).closest<HTMLElement>('button'); if (!el) return; if (el.dataset.assignMidi) void guard(() => assignMidiSound(el.dataset.assignMidi!))(); else if (el.dataset.previewSound) void guard(() => previewSound(el.dataset.previewSound!))(); else if (el.dataset.useSound) void guard(() => useSound(el.dataset.useSound!))(); else if (el.dataset.liveSound) void guard(() => toggleLive(el.dataset.liveSound!))(); else if (el.dataset.selectSound) { selectLibrarySound(el.dataset.selectSound); } };
$('#assets').addEventListener('click', e => { const id = (e.target as HTMLElement).closest<HTMLElement>('[data-metadata]')?.dataset.metadata; if (id) void guard(() => editMetadata(id))(); });
async function editMetadata(id: string) {
  const a = assetById(id), dialog = document.createElement('dialog');
  dialog.innerHTML = '<form method="dialog"><h2>Sound details</h2><label>Description<textarea name="description" maxlength="1000"></textarea></label><label>Tags, separated by commas<input name="tags" maxlength="1000"></label><div class="form-row"><button value="cancel" formnovalidate>Cancel</button><button value="save" class="primary">Save</button></div><p role="status"></p></form>';
  dialog.querySelector<HTMLTextAreaElement>('[name=description]')!.value = a.description ?? a.prompt;
  dialog.querySelector<HTMLInputElement>('[name=tags]')!.value = (a.tags ?? []).join(', ');
  dialog.querySelector('form')!.onsubmit = async event => { if ((event.submitter as HTMLButtonElement)?.value !== 'save') return; event.preventDefault(); try {
    const updated = await workspace.updateAsset(id, { description: dialog.querySelector<HTMLTextAreaElement>('[name=description]')!.value, tags: dialog.querySelector<HTMLInputElement>('[name=tags]')!.value.split(',').map(t => t.trim()).filter(Boolean) });
    assets = assets.map(a => a.id === id ? updated : a); renderAssets(); dialog.close();
  } catch (error) { dialog.querySelector('[role=status]')!.textContent = (error as Error).message; } };
  dialog.onclose = () => dialog.remove(); document.body.append(dialog); dialog.showModal();
}

function soundSource(_source: 'import' | 'generate') { $('#sound-import').hidden = false; }

try { soundSource(localStorage.getItem('studio.sound-source') === 'generate' ? 'generate' : 'import'); } catch { soundSource('import'); }
function renderSlots() {
  $('#slots').innerHTML = project.slots.map((slot) => {
    const pending = engine.timeline.pending(slot.name);
    return `<div class="slot"><div class="slot-heading"><code>${escape(slot.name)}</code><span>${pending ? 'Queued · cycle ' + pending.cycle : slot.active ? 'Ready' : 'Empty'}</span></div>${slot.assets.length ? slot.assets.map((id, i) => `<div class="variation"><button data-slot="${escape(slot.name)}" data-variation="${id}" class="${slot.active === id ? 'active' : ''}">${i + 1}. ${escape(assetLabel(id))}</button><button data-learn-slot="${escape(slot.name)}" data-asset="${id}" title="Map a MIDI key to this variation">Learn</button></div>`).join('') : '<p class="hint">Assign a sound to this slot.</p>'}<code class="slot-code">.s(soundSlot('${escape(slot.name)}'))</code></div>`;
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
  if (target.kind === 'midi-preset') { $('#preset-learn-status').textContent = `Mapped ${targetLabel(target)} to channel ${channel}, key ${number}.`; $('#cancel-preset-learn').hidden = true; }
  learning = undefined; $('#cancel-learn').hidden = true; $('#drawer-learning').hidden = true; $('#learn-status').textContent = `Connected ${kind.toUpperCase()} ${number} to ${targetLabel(target)}.`;
  pickup.reset(); renderBindings(); dirty();
}
function receipt(event: MidiEvent, binding: Binding, status: string, value?: number) {
  $('#last-receipt').textContent = `${event.route === 'web-midi' ? 'MIDI' : event.route === 'alsa' ? 'ALSA' : 'SIM'} · ${targetLabel(binding.target)} · ${status}${value === undefined ? '' : ' ' + value}`;
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
let midiFeedbackFrame = 0;
function scheduleMidiFeedback() {
  if (midiFeedbackFrame) return;
  midiFeedbackFrame = requestAnimationFrame(() => {
    midiFeedbackFrame = 0;
    $('#events').innerHTML = eventRows.join('');
  });
}
const pendingMidiSliders = new Map<string, { owner: StudioEditor; id: string; value: number }>();
let midiSliderFrame = 0;
function queueMidiSlider(owner: StudioEditor, id: string, value: number) {
  owner.values.set(id, value);
  engine.liveEffects.update(id, value);
  pendingMidiSliders.set(id, { owner, id, value });
  if (midiSliderFrame) return;
  midiSliderFrame = requestAnimationFrame(() => {
    midiSliderFrame = 0;
    for (const update of pendingMidiSliders.values()) {
      if ([...editors.values()].includes(update.owner)) update.owner.setValue(update.id, update.value);
    }
    pendingMidiSliders.clear();
  });
}
async function receive(event: MidiEvent) {
  const midi = parseMidi(event.bytes); if (!midi) return;
  eventRows.unshift(`<div><span>${new Date(event.receivedAt).toLocaleTimeString()}</span><b>${event.route === 'web-midi' ? 'MIDI' : event.route === 'alsa' ? 'ALSA' : 'SIM'}</b><span>CH ${midi.channel} ${midi.kind.toUpperCase()} ${midi.number}</span><strong>${midi.value}</strong></div>`);
  eventRows = eventRows.slice(0, 30); scheduleMidiFeedback();
  if (!event.source.startsWith('studio:') && !devicePorts.includes(event.source)) return;
  ensureDeviceProfiles();
  const profile = project.profiles.find(p => p.port === event.source && (p.enabled || !p.port.startsWith('studio:')));
  if (profile && !event.source.startsWith('studio:')) $('#device-activity').textContent = `${event.source} · Channel ${midi.channel} · ${midi.kind === 'note' ? 'Note' : 'CC'} ${midi.number} · ${midi.value}`;
  if (!profile) return;
  if (learning?.kind === 'midi-preset' && midi.on) { bind(learning, profile.id, midi.channel, midi.kind, midi.number); return; }
  const presetBinding = project.bindings.find(b => b.enabled && b.profileId === profile.id && b.channel === midi.channel && b.kind === midi.kind && b.number === midi.number && b.target.kind === 'midi-preset');
  if (presetBinding && presetBinding.target.kind === 'midi-preset') {
    if (midi.on) { await recallMidiPreset(presetBinding.target.presetId); receipt(event, presetBinding, 'preset recalled'); }
    return;
  }
  if (midi.kind === 'note' && libraryMidi && !$('#sounds-panel').hidden) { await libraryNote(`${event.source}:${midi.channel}:${midi.number}`, midi.number, midi.value, midi.on); return; }
  if (midi.kind === 'note' && await midiComposition.note(`${event.source}:${midi.channel}:${midi.number}`, midi.number, midi.value, midi.on)) return;
  if (midi.kind === 'note' && await performancePanel.note(`${event.source}:${midi.channel}:${midi.number}`, midi.number, midi.value, midi.on)) return;
  if (learning && ((learning.kind === 'slider' && midi.kind === 'cc') || (learning.kind !== 'slider' && midi.on))) {
    bind(learning, profile.id, midi.channel, midi.kind, midi.number); return;
  }
  const assigned = project.bindings.some(b => b.enabled && b.profileId === profile.id && b.channel === midi.channel && b.kind === midi.kind && b.number === midi.number);
  if (midi.kind === 'note' && !assigned) { if (midi.on) await engine.noteOn(midi.number, midi.value, `${event.source}:${midi.channel}:${midi.number}`); else engine.noteOff(`${event.source}:${midi.channel}:${midi.number}`); }
  for (const binding of project.bindings.filter((b) => b.enabled && b.profileId === profile.id && b.channel === midi.channel && b.kind === midi.kind && b.number === midi.number)) {
    const target = binding.target;
    try {
      if (target.kind === 'slider') {
        const slider = getEditor(target.tabId).sliders.find((s) => s.id === target.sliderId);
        if (!slider) { receipt(event, binding, 'target missing; rebind'); continue; }
        if (!pickup.accept(binding, midi.value / 127, ((getEditor(target.tabId).values.get(slider.id) ?? slider.value) - slider.min) / (slider.max - slider.min))) { receipt(event, binding, 'waiting for pickup'); continue; }
        const value = scaleCC(midi.value, slider.min, slider.max, slider.step);
        queueMidiSlider(getEditor(target.tabId), slider.id, value); receipt(event, binding, 'applied', value);
      } else if (midi.on) {
        if (target.kind === 'trigger') { await engine.trigger(assetById(target.assetId), midi.value); receipt(event, binding, 'one-shot triggered'); }
        else if (target.kind === 'swap') { const result = await selectVariation(target.slot, target.assetId); receipt(event, binding, result.cancelled ? 'superseded' : result.cycle === undefined ? 'assigned' : `queued for cycle ${result.cycle}`); }
      }
    } catch (error) { receipt(event, binding, error instanceof Error ? error.message : 'Failed'); notice('MIDI action failed. See MIDI feedback.', true); }
  }
}
function connectMidiEvents() {
  browserMidi.subscribe(message => {
    if (message.type === 'status') { if (bridge.connected.some(port => !message.connected.includes(port))) { engine.releaseInputNotes(); stopLibraryNotes(); midiComposition.finish(); performancePanel.globalStop(); void recordingPanel.stop(true); } bridge = message; pickup.reset(); renderProfiles(); }
    if (message.type === 'midi-connections') { devicePorts = message.ports; ensureDeviceProfiles(); renderProfiles(); renderBindings(); }
    if (message.type === 'midi') void receive(message).catch((err) => notice(err.message, true));
  });
  $('#connection').textContent = 'Saved in this browser';
}

function virtualSend(id: string, value: number, off = false) {
  const control = project.controls.find((c) => c.id === id)!;
  const kind = ['knob', 'fader'].includes(control.kind) ? 0xb0 : off ? 0x80 : 0x90;
  send({ type: 'send', bytes: [kind | (control.channel - 1), control.number, value], simulate: $('#route').value === 'simulation' });
}

$('#play').onclick = guard(() => { $('#play-target').value = 'tab'; return startPlayback(); });
$('#evaluate').onclick = guard(() => engine.apply());
$('#stop').onclick = stopPlayback;
$('#project-name').oninput = () => dirty();
$('#slider-target').onchange = () => { selectedSlider = $('#slider-target').value || undefined; if (selectedSlider) editor.select(selectedSlider); };
$('#learn-slider').onclick = guard(() => { if (!selectedSlider) throw new Error('Select an inline slider first.'); beginLearn({ kind: 'slider', sliderId: selectedSlider, tabId: activeEditorId() }); });
$('#cancel-learn').onclick = () => { learning = undefined; $('#cancel-learn').hidden = true; $('#drawer-learning').hidden = true; $('#learn-status').textContent = 'Learning cancelled.'; };
$('#drawer-cancel-learn').onclick = () => $('#cancel-learn').click();
$('#manual-map').onsubmit = (e) => { e.preventDefault(); void guard(() => {
  if (!selectedSlider) throw new Error('Select an inline slider first.');
  bind({ kind: 'slider', sliderId: selectedSlider, tabId: activeEditorId() }, $('#manual-profile').value, Number($('#manual-channel').value), 'cc', Number($('#manual-number').value));
})(); };
$('#route').onchange = renderRoute;
$('#reconnect').onclick = guard(() => browserMidi.enable());
$('#available-ports').onchange = () => { $('#add-profile').disabled = !bridge.ready || !$('#available-ports').value; };
$('#add-profile').onclick = guard(async () => {
  const port = $('#available-ports').value; if (!port) throw new Error('Select a MIDI input port.');
  const result = await browserMidi.connect({ port, connected: true });
  devicePorts = result.ports; ensureDeviceProfiles(); renderProfiles(); renderBindings(); dirty();
});
$('#profiles').onclick = e => {
  const port = (e.target as HTMLElement).closest<HTMLElement>('[data-disconnect-port]')?.dataset.disconnectPort;
  if (!port) return;
  void guard(async () => {
    const result = await browserMidi.connect({ port, connected: false });
    devicePorts = result.ports; engine.releaseInputNotes(); releaseNotes(); renderProfiles(); pickup.reset();
    $('#device-activity').textContent = 'Device disconnected.';
  })();
};
const removeBinding = (e: MouseEvent) => { const id = (e.target as HTMLElement).closest<HTMLElement>('[data-remove-binding]')?.dataset.removeBinding; if (id) { project.bindings = project.bindings.filter((b) => b.id !== id); renderBindings(); dirty(); } };
$('#bindings').onclick = removeBinding; $('#selected-bindings').onclick = removeBinding;
$('#refresh-assets').onclick = guard(async () => { assets = await workspace.assets(); await engine.registerAssets(assets); renderAssets(); renderSlots(); });
async function renameSound(id: string) {
  const asset = assetById(id);
  const label = await askEdit('Name sound', soundLabel(asset));
  if (!label) return;
  const updated = await workspace.updateAsset(asset.id, { label });
  assets = assets.map(item => item.id === updated.id ? updated : item);
  await engine.registerAssets(assets); renderAssets(); renderSlots(); renderBindings();
}
$('#assets').onclick = (e) => { const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button) return;
  if (button.dataset.recover) { setSounds(true); soundSource('import'); ($('#add-sounds') as HTMLDetailsElement).open = true; location.hash = '#/samples/import'; sampleImports.recover(button.dataset.recover); }
  if (button.dataset.insertExisting) void guard(() => insertSound(button.dataset.insertExisting!))();
  if (button.dataset.assignMidi) void guard(() => assignMidiSound(button.dataset.assignMidi!))();
  if (button.dataset.liveSound) void guard(() => toggleLive(button.dataset.liveSound!))();
  if (button.dataset.renamePack) void guard(async () => { const name = await askEdit('Rename pack', assets.find(a => a.pack?.id === button.dataset.renamePack)?.pack?.name); if (name) { assets = await workspace.labelPack(button.dataset.renamePack!, name); renderAssets(); } })();
  if (button.dataset.renameAsset) void guard(() => renameSound(button.dataset.renameAsset!))();
  if (button.dataset.selectAsset) { selectLibrarySound(soundKey(assetById(button.dataset.selectAsset))); }
  if (button.dataset.preview) void guard(() => previewSound(soundKey(assetById(button.dataset.preview!))))();
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
    const names = (await workspace.projects()).filter(name => name !== 'recovery' && name !== '_recovery').sort();
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

$('#backup-project').onclick = guard(async () => { const state = snapshot(); state.assetIds = assetReferences(state); const blob = await backupProject(state); const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `${state.name.replace(/[^a-zA-Z0-9_-]/g, '-')}.studio.zip`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notice('Backup downloaded. Its manifest lists any missing or external files.'); });
$('#restore-backup').onclick = () => $('#backup-file').click();
$('#backup-file').onchange = guard(async () => {
  const file = $('#backup-file').files?.[0]; if (!file) return;
  if (file.size > 260_000_000) throw new Error('Backup exceeds 256 MB.');
  if (timelineRecording?.pending || midiComposition.pending || recordingPanel.pending || performancePanel.take?.notes.length) throw new Error('Resolve pending takes before restoring a backup.');
  await transitionSession(async () => {
    await persistSession();
    const result = await restoreBackup(file);
    assets = await workspace.assets(); await engine.registerAssets(assets); await loadProject(result.project); await persistSession();
    notice(result.missing.length ? `Restored with ${result.missing.length} missing assets; use Recover sound in Sounds.` : 'Project and audio restored.');
    $('#backup-file').value = '';
  });
});
const saveNow = guard(async () => { await persistSession(); notice(`Saved ${snapshot().name}.`); });
$('#save').onclick = saveNow; $('#save-now').onclick = saveNow;
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); if (!e.repeat) void saveNow(); } }, true);
$('.sessionbar').insertAdjacentHTML('beforeend', '<button id="save-copy">Save session as copy</button><button id="reload-session">Reload saved session</button><button id="delete-session">Delete session…</button>');
$('#save-copy').onclick = guard(async () => { if (timelineRecording?.pending) throw new Error('Finish or save the recording first.'); clearTimeout(saveTimer); await saveChain.catch(() => {}); const next = await workspace.createProject({ ...snapshot(), sessionId: undefined }); await loadProject(next); await persistSession(); });
$('#reload-session').onclick = guard(async () => { if (!selectedProjectName || !await askEdit('Reload saved session?', undefined, 'Your current draft will be replaced by the saved version.')) return; clearTimeout(saveTimer); await saveChain.catch(() => {}); await loadProject(await workspace.loadProject(selectedProjectName)); });
$('#delete-session').onclick = guard(async () => { if (timelineRecording?.pending) throw new Error('Finish or save the recording first.'); if (!selectedProjectName || !await askEdit('Delete this session?', undefined, 'Audio stays in your library. Download a backup first if you need this arrangement.')) return; clearTimeout(saveTimer); await saveChain.catch(() => {}); await workspace.deleteProject(selectedProjectName, project.revision ?? 0); localStorage.removeItem(draftKey); await loadProject(await workspace.createProject(newProject())); await persistSession(); });
async function loadProject(next: Project) {
  if (midiComposition.pending || midiComposition.running) throw new Error('Accept or discard the MIDI takes before switching sessions.');
  if (timelineRecording?.pending) throw new Error('Finish or save the recording before switching sessions.');
  if (recordingPanel.pending) throw new Error('Save or discard the pending audio take before switching sessions.');
  midiComposition.close(); recordingPanel.discard(); performancePanel.close();
  contextMenu.close(false);
  const validated = ProjectSchema.parse(next); instrumentFor(validated); instrumentOpen = false; audioOpen = false; liveInput.disconnect();
  // Preload before changing the running project. Missing assets are explicit, and
  // leave the current session intact instead of partially applying a load.
  for (const slot of validated.slots) if (slot.active) { const asset = assets.find(a => a.id === slot.active); if (asset && !asset.missing) { try { await engine.preload(asset); } catch { asset.missing = true; } } }
  for (const id of assetReferences(validated)) if (!assets.some(a => a.id === id)) assets.push({ id, label: `Missing sound ${id.slice(0, 8)}`, prompt: '', duration: null, loop: false, provider: 'upload', format: 'wav', createdAt: '', missing: true });
  releaseNotes(); engine.restore(validated);
  editors.forEach(e => e.view.destroy()); editors.clear(); $('#editor').replaceChildren();
  project = validated; selectedProjectName = validated.sessionId || ''; editor = getEditor(); midiComposition.resetRange(); restoreWorkspace();
  selectedSlider = undefined; learning = undefined; $('#cancel-learn').hidden = true; $('#drawer-learning').hidden = true;
  $('#project-name').value = project.name; $('#mapping-context').hidden = true; pickup.reset(); ensureDeviceProfiles(); renderAll(); dirty();
}
$('#saved-projects').onchange = guard(async () => {
  const name = $('#saved-projects').value; if (!name || name === selectedProjectName) return;
  await transitionSession(async () => {
    const next = await workspace.loadProject(name);
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

function startPlayback() { return engine.evaluate(true, project.activeTabId); }
function stopPlayback() { stopTakePreview(); if (timelineRecording?.pending) { void timelineRecording.stop(); return; } liveInput.stop(); renderAudioInput(); midiComposition.finish(); document.querySelectorAll('audio').forEach(audio => audio.pause()); void recordingPanel.stop(true); performancePanel.globalStop(); releaseNotes(); engine.stop(); settleSlots(true); renderComposition(); }
$('#play-target').onchange = renderTransport;
$('#dark-mode').checked = document.documentElement.dataset.appearance === 'dark';
$('#dark-mode').onchange = () => {
  const dark = $('#dark-mode').checked; document.documentElement.dataset.appearance = dark ? 'dark' : 'light';
  try { localStorage.setItem('studio.appearance', dark ? 'dark' : 'light'); } catch { /* unavailable storage */ }
  editors.forEach(instance => instance.setAppearance(dark));
};
function workspaceKey() { return `studio.workspace:${selectedProjectName || project.name}`; }
function saveWorkspace() {
  try { localStorage.setItem(workspaceKey(), JSON.stringify({ instrumentOpen, openTabs: [...openTabs], height: drawerHeight, view: drawerView ?? null, expanded: document.body.dataset.expanded || '' })); } catch { /* optional local preferences */ }
}
function restoreWorkspace() {
  let saved: any = {}; try { saved = JSON.parse(localStorage.getItem(workspaceKey()) || '{}'); } catch { /* old preference */ }
  openTabs = new Set(Array.isArray(saved.openTabs) ? saved.openTabs.filter((id: string) => project.tabs.some(t => t.id === id)) : project.tabs.map(t => t.id));
  if (openTabs.size && !openTabs.has(project.activeTabId)) { project.activeTabId = [...openTabs][0]; editor = getEditor(); }
  instrumentOpen = saved.instrumentOpen === true; editor = getEditor(instrumentOpen ? MIDI_EDITOR : project.activeTabId);
  resizeDrawer(Number(saved.height) || Math.min(300, window.innerHeight * .38)); document.body.dataset.expanded = ['editor', 'composition'].includes(saved.expanded) ? saved.expanded : '';
  if (!$('#sounds-panel').hidden) setSounds(false); setDrawer(saved.view === null ? undefined : saved.view === 'midi' || saved.view === 'devices' || saved.view === 'export' ? saved.view : 'composition');
  for (const name of ['editor', 'composition']) $(`#expand-${name}`).textContent = document.body.dataset.expanded === name ? 'Restore split' : 'Expand';
}
function renderPatterns() {
  const query = $('#pattern-search').value.toLowerCase();
  $('#pattern-list').innerHTML = project.tabs.filter(t => t.name.toLowerCase().includes(query)).map(t => `<button data-open-pattern="${t.id}"><span>${escape(t.name)}</span><small>${openTabs.has(t.id) ? 'Open' : 'Closed'}</small></button>`).join('') || '<p>No matching patterns</p>';
}
function renderTabs() {
  const visible = project.tabs.filter(t => openTabs.has(t.id));
  $('#tabs').innerHTML = `<span class="pattern-tab"><button role="tab" id="tab-audio-input" aria-selected="${audioOpen}" data-audio-tab>Audio input</button></span><span class="pattern-tab"><button role="tab" id="tab-midi-instrument" aria-selected="${instrumentOpen}" aria-controls="editor-midi-instrument" tabindex="${instrumentOpen ? 0 : -1}" data-instrument-tab>MIDI instrument</button></span>` + visible.map(tab => `<span class="pattern-tab"><button role="tab" id="tab-${tab.id}" aria-selected="${!audioOpen && !instrumentOpen && tab.id === project.activeTabId}" aria-controls="editor-${tab.id}" tabindex="${!audioOpen && !instrumentOpen && tab.id === project.activeTabId ? 0 : -1}" data-color="${tab.color}" data-tab="${tab.id}">${escape(tab.name)}</button><button class="tab-close" data-close-tab="${tab.id}" aria-label="Close ${escape(tab.name)}">×</button></span>`).join('');
  editors.forEach((instance, id) => { const root = instance.view.dom.parentElement!; root.hidden = id === AUDIO_EDITOR ? !audioOpen : audioOpen || (id === MIDI_EDITOR ? !instrumentOpen : instrumentOpen || id !== project.activeTabId || !openTabs.has(id)); root.id = id === AUDIO_EDITOR ? 'editor-audio-input' : id === MIDI_EDITOR ? 'editor-midi-instrument' : `editor-${id}`; root.setAttribute('role', 'tabpanel'); root.setAttribute('aria-labelledby', id === AUDIO_EDITOR ? 'tab-audio-input' : id === MIDI_EDITOR ? 'tab-midi-instrument' : `tab-${id}`); });
  $('#audio-toolbar').hidden = !audioOpen;
  $('#editor').hidden = !audioOpen && !instrumentOpen && !visible.length; $('#empty-editor').hidden = audioOpen || instrumentOpen || !!visible.length; $('#tab-menu').hidden = audioOpen || instrumentOpen || !visible.length; $('#instrument-toolbar').hidden = !instrumentOpen;
  performButton.disabled = audioOpen || instrumentOpen || !visible.length; $('#play').disabled = audioOpen || instrumentOpen || !visible.length || engine.busy || engine.started;
  renderPatterns(); renderTakeView();
}
$('#pattern-search').oninput = renderPatterns;
$('#pattern-list').onclick = e => { const id = (e.target as HTMLElement).closest<HTMLElement>('[data-open-pattern]')?.dataset.openPattern; if (id) { switchTab(id); (patternMenu as HTMLDetailsElement).open = false; editor.view.focus(); } };
$('#open-patterns').onclick = () => { (patternMenu as HTMLDetailsElement).open = true; $('#pattern-search').focus(); };
function closeTab(id: string) {
  openTabs.delete(id);
  if (project.activeTabId === id && openTabs.size) switchTab([...openTabs][0]);
  renderTabs(); saveWorkspace(); renderTransport();
  if (!openTabs.size) $('#open-patterns').focus();
}
function switchTab(id: string) {
  stopTakePreview();
  instrumentOpen = false; audioOpen = false;
  openTabs.add(id); project.activeTabId = id; editor = getEditor(id); selectedSlider = undefined;
  $('#mapping-context').hidden = true; learning = undefined; $('#cancel-learn').hidden = true; $('#drawer-learning').hidden = true;
  renderTabs(); renderSliders(); renderBindings(); dirty(); saveWorkspace(); editor.view.requestMeasure();
}
function createTab(name = `Pattern ${project.tabs.length + 1}`, code = '// Start a new pattern\n$: note("c3 e3 g3").s("triangle").gain(0.2)\n') {
  if (timelineRecording?.pending) throw new Error('Finish recording before creating patterns.');
  if (project.tabs.length >= 50) throw new Error('A project can contain up to 50 patterns.');
  const tab: Tab = { id: crypto.randomUUID(), name: name.slice(0, 80) || 'Pattern', code, anchors: [], color: palette[project.tabs.length % palette.length] };
  project.tabs.push(tab); switchTab(tab.id);
}
$('#new-tab').onclick = guard(() => createTab());
$('#tab-menu').addEventListener('click', event => { if ((event.target as HTMLElement).closest('button')) ($('#tab-menu') as unknown as HTMLDetailsElement).open = false; });
$('#tabs').onclick = e => { const close = (e.target as HTMLElement).closest<HTMLElement>('[data-close-tab]')?.dataset.closeTab; if (close) { closeTab(close); return; } const id = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]')?.dataset.tab; if (id) switchTab(id); };
$('#tabs').addEventListener('click', e => { if ((e.target as HTMLElement).closest('[data-audio-tab]')) openAudioInput(); if ((e.target as HTMLElement).closest('[data-instrument-tab]')) openMidiInstrument(); });
$('#tabs').onkeydown = e => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault(); const tabs = [{ id: AUDIO_EDITOR }, { id: MIDI_EDITOR }, ...project.tabs.filter(t => openTabs.has(t.id))]; const index = tabs.findIndex(t => t.id === activeEditorId());
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  if (tabs[next].id === AUDIO_EDITOR) { openAudioInput(); $('#tab-audio-input').focus(); } else if (tabs[next].id === MIDI_EDITOR) { openMidiInstrument(); $('#tab-midi-instrument').focus(); } else { switchTab(tabs[next].id); $(`#tab-${project.activeTabId}`).focus(); }
};
$('#edit-dialog button[value="cancel"]').onclick = () => {
  ($('#edit-dialog') as unknown as HTMLDialogElement).close('cancel');
};
function askEdit(title: string, value?: string, description = ''): Promise<string | undefined> {
  $('#edit-title').textContent = title; $('#edit-label').hidden = value === undefined; $('#edit-name').disabled = value === undefined;
  $('#edit-name').value = value ?? ''; $('#edit-description').textContent = description;
  const dialog = $('#edit-dialog'); dialog.returnValue = ''; dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm' ? value === undefined ? 'confirmed' : $('#edit-name').value.trim() : undefined), { once: true }));
}
async function renameTab(id: string) {
  const tab = project.tabs.find(t => t.id === id)!;
  const name = await askEdit('Rename pattern', tab.name); if (name) { tab.name = name; renderTabs(); renderComposition(); renderTransport(); dirty(); }
}
$('#rename-tab').onclick = guard(() => renameTab(project.activeTabId));
$('#duplicate-tab').onclick = guard(() => duplicateTab(project.activeTabId));
async function deleteTab(id: string) {
  if (timelineRecording?.pending) throw new Error('Finish recording before deleting patterns.');
  if (midiComposition.destination?.tabId === id) { if (midiComposition.pending || midiComposition.running) throw new Error('Resolve MIDI takes before closing their source tab.'); midiComposition.close(); }
  if (performancePanel.take?.destination.tabId === id) { if (performancePanel.take.notes.length || recordingPanel.pending) throw new Error('Resolve the pending take before closing its destination tab.'); performancePanel.close(); }
  if (engine.busy) throw new Error('Wait for playback preparation to finish.');
  if (project.tabs.length === 1) throw new Error('Keep at least one pattern in the project.');
  const tab = project.tabs.find(t => t.id === id)!;
  const clips = project.clips.filter(c => c.tabId === id).length;
  const mappings = project.bindings.filter(b => b.target.kind === 'slider' && b.target.tabId === id).length;
  if (!await askEdit(`Delete ${tab.name}?`, undefined, `This removes its code, ${clips} composition clip(s), and ${mappings} slider mapping(s) from this project.`)) return;
  if (engine.started) stopPlayback();
  editors.get(id)?.view.dom.parentElement?.remove(); editors.get(id)?.view.destroy(); editors.delete(id);
  project.tabs = project.tabs.filter(t => t.id !== id); project.clips = project.clips.filter(c => c.tabId !== id);
  project.bindings = project.bindings.filter(b => b.target.kind !== 'slider' || b.target.tabId !== id);
  switchTab(project.activeTabId === id ? project.tabs[0].id : project.activeTabId); renderComposition();
}
$('#close-tab').onclick = () => closeTab(project.activeTabId);
$('#delete-tab').onclick = guard(() => deleteTab(project.activeTabId));
function duplicateTab(id: string) {
  const tab = project.tabs.find(t => t.id === id)!;
  let name = '', index = 1;
  do {
    const suffix = index === 1 ? ' copy' : ` copy ${index}`;
    name = tab.name.slice(0, 80 - suffix.length) + suffix; index++;
  } while (project.tabs.some(t => t.name === name));
  createTab(name, getEditor(id).code);
  project.tabs.find(t => t.id === project.activeTabId)!.color = tab.color; renderTabs(); dirty();
  $(`[data-tab="${project.activeTabId}"]`).focus();
}
async function addSession() {
  if (engine.busy) throw new Error('Wait for playback preparation to finish.');
  const name = await askEdit('Add session', 'Untitled session', 'Your current session will be saved before opening the new one.');
  if (!name) return;
  await transitionSession(async () => {
    await persistSession();
    const next = await workspace.createProject({ ...newProject(), name });
    await loadProject(next);
    await persistSession();
    notice(`Created ${name}.`);
  });
  editor.view.focus();
}
$('#add-session').onclick = guard(addSession);
$('#new-project').onclick = guard(addSession);
async function insertSound(id: string) { const asset = assetById(id); await useSound(soundKey(asset), asset); }
$('#insert-sound').onclick = guard(() => selectedAsset ? insertSound(selectedAsset) : undefined);
function setSounds(open: boolean) {
  const wasOpen = !$('#sounds-panel').hidden;
  if (open && !wasOpen) libraryReturn = document.activeElement as HTMLElement;
  $('#sounds-panel').hidden = !open; libraryBackdrop.hidden = !open;
  $('#sounds-toggle').setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('sounds-open', open);
  for (const selector of ['.topbar', '.workspace', '.drawer-bar', '#drawer']) $(selector).inert = open;

  if (open) {
    void catalogue.refresh().catch(error => notice(error.message, true));
    document.querySelectorAll<HTMLDetailsElement>('.topbar details[open]').forEach(el => el.open = false);
    $('#mapping-context').hidden = true;
    if (!selectedSound) selectedSound = engine.soundEntries.find(s => s.name === 'triangle')?.name;
    renderAssets(); $('#sound-search').focus();
  } else {
    libraryMidi = false; stopLibraryNotes(); previewEpoch++;
    if (previewKey) engine.performanceAudio.release(previewKey);
    paintLibrarySelection(); libraryTarget = undefined;
    if (wasOpen) libraryReturn?.focus();
  }
}
$('#sounds-toggle').onclick = () => { libraryTarget = undefined; $('#sound-search').value = ''; $('#library-source').value = 'all'; setSounds(true); };
$('#sounds-close').onclick = () => setSounds(false);
$('#sounds-panel').addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const items = Array.from($('#sounds-panel').querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href]')).filter(el => el.getClientRects().length > 0);
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#sounds-panel').hidden && !document.querySelector('dialog[open]')) setSounds(false); $('#mapping-context').hidden = true; } });
const catalogue = new Catalogue(async () => { assets = await workspace.assets(); await engine.registerAssets(assets); renderAssets(); await refreshProjects(); });
$('#library-scroll').prepend(catalogue.root);
const openExport = setupExport($('#export-content'), snapshot, () => assets);
type DrawerView = 'composition' | 'midi' | 'devices' | 'export';
let drawerView: DrawerView | undefined;
let drawerHeight = 300;
function setDrawer(view?: DrawerView) {
  drawerView = view; $('#drawer').hidden = !view;
  $('#devices-content').hidden = view !== 'devices'; $('#composition-content').hidden = view !== 'composition'; $('#midi-content').hidden = view !== 'midi'; $('#export-content').hidden = view !== 'export';
  $('#expand-editor').hidden = !view && document.body.dataset.expanded !== 'editor';
  if (view === 'export') openExport();
  document.querySelectorAll<HTMLElement>('[data-drawer]').forEach(b => b.setAttribute('aria-expanded', String(b.dataset.drawer === view)));
  document.body.classList.toggle('tools-open', !!view);
  saveWorkspace();
  editor.view.requestMeasure();
}
function resizeDrawer(height: number) {
  drawerHeight = Math.min(600, Math.max(180, height));
  $('#drawer').style.height = `${drawerHeight}px`; $('#drawer').style.setProperty('--drawer-height', `${drawerHeight}px`); $('#drawer-resize').setAttribute('aria-valuenow', String(drawerHeight));
}
document.querySelectorAll<HTMLElement>('[data-drawer]').forEach(b => b.onclick = () => {
  if (!$('#sounds-panel').hidden) setSounds(false);
  setDrawer(drawerView === b.dataset.drawer ? undefined : b.dataset.drawer as DrawerView);
});
$('#drawer-resize').onpointerdown = e => {
  const start = e.clientY, height = drawerHeight, handle = e.currentTarget as HTMLElement; handle.setPointerCapture(e.pointerId);
  handle.onpointermove = event => resizeDrawer(height + start - event.clientY);
  handle.onpointerup = handle.onpointercancel = () => { handle.onpointermove = null; setDrawer(drawerView); };
};
$('#drawer-resize').onkeydown = e => { if (['ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); resizeDrawer(drawerHeight + (e.key === 'ArrowUp' ? 20 : -20)); setDrawer(drawerView); } };
$('#composition-play').onclick = guard(() => { $('#play-target').value = 'composition'; return engine.playComposition(); });
$('#composition-stop').onclick = stopPlayback;
$('#composition-loop').onclick = () => { engine.transport.loop = !engine.transport.loop; renderTransport(); };
$('#composition-return').onclick = guard(() => engine.seek(midiComposition.loopRange.begin));
function setExpanded(pane: string, on: boolean) {
  document.body.dataset.expanded = on ? pane : '';
  for (const name of ['editor', 'composition']) $(`#expand-${name}`).textContent = document.body.dataset.expanded === name ? 'Restore split' : 'Expand';
  $('#expand-editor').hidden = !drawerView && document.body.dataset.expanded !== 'editor';
  saveWorkspace(); editor.view.requestMeasure();
}
for (const pane of ['editor', 'composition']) $(`#expand-${pane}`).onclick = () => {
  const on = document.body.dataset.expanded !== pane;
  if (pane === 'composition') { if (!$('#sounds-panel').hidden) setSounds(false); setDrawer('composition'); }
  setExpanded(pane, on);
};
let timelineDragging = false;
function changeRange(edge: string, value: number) {
  if (engine.started || midiComposition.running || midiComposition.pending) throw new Error('Stop playback and resolve the take before changing its range.');
  const range = midiComposition.loopRange, maximum = engine.arrangementLength || 4;
  const snapped = Math.round(value / project.snap) * project.snap;
  if (edge === 'begin') range.begin = Math.max(0, Math.min(range.end - .25, snapped)); else range.end = Math.min(maximum, Math.max(range.begin + .25, snapped));
  midiComposition.setRange(range.begin, range.end); renderComposition();
}
$('#ruler').onpointerdown = event => {
  const element = event.target as HTMLElement; if (element.closest('.track-corner')) return;
  if (midiComposition.running || midiComposition.pending || engine.busy) { notice('Finish and resolve the MIDI take before seeking.', true); return; }
  const edge = element.dataset.rangeEdge;
  if (edge && engine.started) { notice('Stop playback to change the loop range.', true); return; }
  event.preventDefault(); timelineDragging = true;
  const ruler = $('#ruler'); ruler.setPointerCapture(event.pointerId);
  let value = engine.timelinePosition;
  const update = (e: PointerEvent) => { value = Math.min(engine.arrangementLength || 4, Math.max(0, (e.clientX - ruler.getBoundingClientRect().left - 180) / 64)); if (edge) { const handle = ruler.querySelector<HTMLElement>(`[data-range-edge="${edge}"]`); if (handle) handle.style.left = `${180 + value * 64}px`; } else { $('#seek-handle').style.left = `${180 + value * 64}px`; } };
  update(event); ruler.onpointermove = update;
  ruler.onpointerup = () => { timelineDragging = false; ruler.onpointermove = null; ruler.onpointerup = null; void guard(async () => { if (edge) changeRange(edge, value); else await engine.seek(value); renderComposition(); })(); };
  ruler.onpointercancel = () => { timelineDragging = false; ruler.onpointermove = null; renderComposition(); };
};
$('#ruler').onkeydown = event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const el = event.target as HTMLElement; if (!el.matches('[role=slider]')) return;
  event.preventDefault(); if (midiComposition.running || midiComposition.pending) { notice('Keep or discard the current take first.', true); return; }
  const edge = el.dataset.rangeEdge, range = midiComposition.loopRange;
  const current = edge ? range[edge as 'begin' | 'end'] : engine.timelinePosition;
  const value = event.key === 'Home' ? 0 : event.key === 'End' ? engine.arrangementLength : current + (event.key === 'ArrowRight' ? project.snap : -project.snap);
  void guard(async () => { if (edge) changeRange(edge, value); else await engine.seek(value); renderComposition(); document.querySelector<HTMLElement>(edge ? `[data-range-edge="${edge}"]` : '#seek-handle')?.focus(); })();
};
midiComposition.range.addEventListener('input', () => renderComposition());
midiComposition.range.addEventListener('click', e => { if ((e.target as HTMLElement).hasAttribute('data-midi-full')) renderComposition(); });
function editArrangement() { if (timelineRecording?.pending) throw new Error('Finish recording before editing the composition.'); if (engine.started || engine.busy) throw new Error('Stop playback to edit the composition.'); }
let selectedTrack: string | undefined;
function renderComposition() {
  midiComposition.refreshRange();
  if (!project.tracks.some(t => t.id === selectedTrack)) selectedTrack = project.tracks[0].id;
  const chosenRecordTrack = $('#record-track').value || selectedTrack;
  $('#record-track').innerHTML = project.tracks.map(t => `<option value="${t.id}">${escape(t.name)}</option>`).join('');
  $('#record-track').value = project.tracks.some(t => t.id === chosenRecordTrack) ? chosenRecordTrack! : project.tracks[0].id;
  const length = Math.ceil(Math.max(16, timelineRecording?.pending ? timelineRecording.endCycle + 4 : 0, ...project.clips.map(c => c.start + c.length + 4)));
  const range = midiComposition.loopRange; engine.transport.begin = range.begin; engine.transport.end = range.end;
  $('#bpm').value = String(project.bpm); $('#snap').value = String(project.snap);
  $('#sequencer').style.width = `${length * 64 + 180}px`;
  $('#sequencer').style.setProperty('--grid', `${project.snap * 64}px`);
  $('#ruler').innerHTML = '<span class="track-corner">Tracks</span>' + Array.from({ length }, (_, i) => `<span>${i}</span>`).join('') + `<div id="timeline-range" style="left:${180 + range.begin * 64}px;width:${(range.end - range.begin) * 64}px"></div><button class="range-handle" data-range-edge="begin" role="slider" aria-label="Range start" aria-valuemin="0" aria-valuemax="${range.end - .25}" aria-valuenow="${range.begin}" style="left:${180 + range.begin * 64}px"></button><button class="range-handle" data-range-edge="end" role="slider" aria-label="Range end" aria-valuemin="${range.begin + .25}" aria-valuemax="${engine.arrangementLength || 4}" aria-valuenow="${range.end}" style="left:${180 + range.end * 64}px"></button><button id="seek-handle" role="slider" aria-label="Playhead" aria-valuemin="0" aria-valuemax="${engine.arrangementLength}" aria-valuenow="${engine.timelinePosition}" style="left:${180 + engine.timelinePosition * 64}px">▼</button>`;
  $('#clip-lane').innerHTML = project.tracks.map(t => `<option value="${t.id}">${escape(t.name)}</option>`).join('');
  $('#tracks').innerHTML = project.tracks.map((track, index) => `<div class="track-row"><div class="track-header" data-track="${track.id}" aria-current="${track.id === selectedTrack}"><strong>${escape(track.name)}</strong><button data-track-mute="${track.id}" aria-label="${track.muted ? 'Unmute' : 'Mute'} ${escape(track.name)}" aria-pressed="${track.muted}">${track.muted ? 'Unmute' : 'Mute'}</button><button data-track-solo="${track.id}" aria-label="${project.soloTrackId === track.id ? 'Clear solo for' : 'Solo'} ${escape(track.name)}" aria-pressed="${project.soloTrackId === track.id}" title="Isolate this track; click again to restore the mix">Solo</button><button data-track-menu="${track.id}" aria-label="Actions for ${escape(track.name)}">•••</button></div><div class="lane" data-track-id="${track.id}" data-lane="${index}" aria-label="${escape(track.name)}">${project.clips.filter(c => c.trackId === track.id).map(c => {
    const tab = project.tabs.find(t => t.id === c.tabId)!;
    return `<button class="clip" data-color="${tab.color}" data-muted="${isClipMuted(c, project.tracks, project.soloTrackId)}" data-clip="${c.id}" style="left:${c.start * 64}px;width:${c.length * 64}px" aria-label="${escape(tab.name)} · ${escape(track.name)} · cycle ${c.start} · ${c.length} cycles${isClipMuted(c, project.tracks, project.soloTrackId) ? ' · muted' : ''}"><strong>${escape(tab.name)}</strong><small>${isClipMuted(c, project.tracks, project.soloTrackId) ? 'Muted · ' : ''}${c.length} cycles</small><span class="clip-resize" data-resize="${c.id}" aria-hidden="true"></span></button>`;
  }).join('') || '<p class="lane-empty">Drag a pattern here, or use Pattern actions → Add to composition</p>'}</div></div>`).join('');
  paintRecordingClip(); renderTransport(); renderRecording();
}
function paintRecordingClip() {
  const rec = timelineRecording;
  document.querySelector('#recording-clip')?.remove();
  if (!rec?.pending || !rec.identity || rec.state === 'preparing') return;
  const lane = document.querySelector<HTMLElement>(`[data-track-id="${rec.identity.trackId}"]`);
  if (!lane) return;
  const clip = document.createElement('div'); clip.id = 'recording-clip'; clip.className = 'clip recording-clip';
  clip.style.left = `${rec.startCycle * 64}px`; clip.style.width = `${Math.max(.25, rec.endCycle - rec.startCycle) * 64}px`;
  clip.textContent = rec.state === 'recording' ? `${rec.identity.name} · ${rec.elapsed.toFixed(1)} s` : rec.message;
  lane.querySelector('.lane-empty')?.remove(); lane.append(clip);
  $('#sequencer').style.width = `${Math.max(16, Math.ceil(rec.endCycle + 4), ...project.clips.map(c => c.start + c.length + 4)) * 64 + 180}px`;
}
function toggleClipMute(id: string) { const c = project.clips.find(c => c.id === id)!; c.muted = !c.muted; engine.updateMutes(); renderComposition(); dirty(); }
$('#snap').onchange = () => { project.snap = Number($('#snap').value) as 1 | .5 | .25; renderComposition(); dirty(); };
$('#add-track').onclick = guard(() => {
  editArrangement(); if (project.tracks.length >= 16) throw new Error('Track limit reached (16).');
  let n = 1; while (project.tracks.some(t => t.name === `Track ${n}`)) n++;
  const track = { id: crypto.randomUUID(), name: `Track ${n}`, muted: false }; project.tracks.push(track); selectedTrack = track.id; renderComposition(); dirty();
});
$('#tracks').addEventListener('click', event => {
  const el = event.target as HTMLElement, header = el.closest<HTMLElement>('[data-track]'); if (!header) return;
  selectedTrack = header.dataset.track; document.querySelectorAll<HTMLElement>('[data-track]').forEach(h => h.setAttribute('aria-current', String(h.dataset.track === selectedTrack))); const track = project.tracks.find(t => t.id === selectedTrack)!;
  if (el.closest('[data-track-mute]')) { track.muted = !track.muted; engine.updateMutes(); renderComposition(); dirty(); document.querySelector<HTMLElement>(`[data-track-mute="${track.id}"]`)?.focus(); }
  else if (el.closest('[data-track-solo]')) { project.soloTrackId = project.soloTrackId === track.id ? undefined : track.id; engine.updateMutes(); renderComposition(); dirty(); document.querySelector<HTMLElement>(`[data-track-solo="${track.id}"]`)?.focus(); }
  else if (el.closest('[data-track-menu]')) {
    const rect = el.getBoundingClientRect(), disabled = engine.started || engine.busy ? 'Stop playback to edit tracks.' : undefined;
    contextMenu.open([
      { label: 'Rename', disabled, run: guard(async () => { editArrangement(); const name = await askEdit('Rename track', track.name); if (name) { editArrangement(); track.name = name; renderComposition(); dirty(); } }) },
      { label: 'Remove', disabled: disabled || (project.tracks.length === 1 ? 'Keep at least one track.' : undefined), run: guard(async () => { editArrangement(); if (project.clips.some(c => c.trackId === track.id) && !await askEdit(`Remove ${track.name}?`, undefined, 'This also removes all clips on this track.')) return; editArrangement(); if (project.soloTrackId === track.id) project.soloTrackId = undefined; project.tracks = project.tracks.filter(t => t.id !== track.id); if (project.audioInput?.trackId === track.id) project.audioInput.trackId = project.tracks[0].id; project.clips = project.clips.filter(c => c.trackId !== track.id); renderComposition(); dirty(); }) },
    ], rect.left, rect.bottom, () => document.querySelector(`[data-track-menu="${track.id}"]`));
  }
});
function colorTab(id: string) {
  const tab = project.tabs.find(t => t.id === id)!;
  const dialog = document.createElement('dialog'); dialog.setAttribute('aria-label', `Color for ${tab.name}`);
  dialog.innerHTML = `<h2>Pattern color</h2><div class="color-picker">${palette.map(color => `<button data-color="${color}" aria-pressed="${color === tab.color}">${color}</button>`).join('')}</div><button data-cancel>Cancel</button>`;
  document.body.append(dialog); dialog.onclick = e => { const color = (e.target as HTMLElement).dataset.color; if (color) { tab.color = color as Tab['color']; renderTabs(); renderComposition(); dirty(); } if (color || (e.target as HTMLElement).hasAttribute('data-cancel')) dialog.close(); };
  dialog.addEventListener('close', () => { dialog.remove(); document.querySelector<HTMLElement>(`[data-tab="${id}"]`)?.focus(); }); dialog.showModal();
}
$('#color-tab').onclick = () => colorTab(project.activeTabId);
function putClip(clip: Clip) {
  editArrangement();
  if (!canPlace(project.clips, clip)) throw new Error('Use quarter-cycle increments and leave space between clips in the same track.');
  if (!project.clips.some(c => c.id === clip.id) && project.clips.length >= 500) throw new Error('This project has reached its clip limit.');
  project.clips = [...project.clips.filter(c => c.id !== clip.id), clip]; renderComposition(); dirty();
}
let editingClip: string | undefined;
function openClip(id: string) {
  editArrangement(); const clip = project.clips.find(c => c.id === id)!; editingClip = id;
  $('#clip-lane').value = clip.trackId; $('#clip-start').value = String(clip.start); $('#clip-length').value = String(clip.length); $('#clip-mute').textContent = clip.muted ? 'Unmute' : 'Mute'; $('#clip-dialog').returnValue = ''; $('#clip-dialog').showModal();
}
function addToComposition(tabId: string) {
  editArrangement(); const clip: Clip = { id: crypto.randomUUID(), tabId, trackId: selectedTrack ?? project.tracks[0].id, muted: false, start: Math.max(0, ...project.clips.filter(c => c.trackId === (selectedTrack ?? project.tracks[0].id)).map(c => c.start + c.length)), length: 4 };
  putClip(clip); setDrawer('composition'); openClip(clip.id);
}
$('#add-to-composition').onclick = guard(() => addToComposition(project.activeTabId));
function duplicateClip(id: string) {
  editArrangement();
  const original = project.clips.find(c => c.id === id)!;
  const copy = duplicatePlacement(project.clips, original, crypto.randomUUID());
  if (!copy) throw new Error('No room to duplicate this clip in its lane.');
  putClip(copy);
}
function removeClip(id: string) {
  editArrangement(); project.clips = project.clips.filter(c => c.id !== id); renderComposition(); dirty();
}
$('#clip-dialog').addEventListener('close', () => void guard(() => {
  const action = $('#clip-dialog').returnValue, clip = project.clips.find(c => c.id === editingClip); if (!clip || action === 'cancel') return;
  if (action === 'source') { switchTab(clip.tabId); return; }
  if (action === 'mute') { toggleClipMute(clip.id); return; }
  editArrangement();
  if (action === 'duplicate') duplicateClip(clip.id);
  else if (action === 'remove') removeClip(clip.id);
  else if (action === 'save') putClip({ ...clip, trackId: $('#clip-lane').value, start: Number($('#clip-start').value), length: Number($('#clip-length').value) });
})());
$('#bpm').onchange = guard(() => { editArrangement(); const bpm = Number($('#bpm').value); if (bpm < 20 || bpm > 300) throw new Error('Tempo must be between 20 and 300 BPM.'); project.bpm = bpm; dirty(); });
installCompositionGestures({ reveal: () => setDrawer('composition'), project: () => project, blocked: () => engine.started || engine.busy, commit: clip => void guard(() => putClip(clip))(), open: id => void guard(() => openClip(id))() });

const contextMenu = new ContextMenu();
function showContextMenu(target: HTMLElement, x: number, y: number, keyboard = false) {
  if (target.closest('.cm-content')) {
    const pos = keyboard ? editor.view.state.selection.main.from : editor.view.posAtCoords({ x, y });
    return pos !== null && expressionActions(pos, x, y);
  }
  const item = target.closest<HTMLElement>('[data-tab], [data-clip], [data-asset]');
  if (!item) return false;
  const stopped = engine.started || engine.busy ? 'Stop playback to edit the composition.' : undefined;
  const action = (label: string, run: () => unknown, disabled?: string): MenuAction => ({ label, run: guard(run), disabled });
  let actions: MenuAction[], selector: string;
  if (item.dataset.tab) {
    const id = item.dataset.tab; selector = `[data-tab="${id}"]`;
    actions = [
      action('Color…', () => colorTab(id)),
      action('Rename', () => renameTab(id)),
      action('Duplicate', () => duplicateTab(id), project.tabs.length >= 50 ? 'Pattern limit reached (50).' : undefined),
      action('Add to composition', () => addToComposition(id), stopped || (project.clips.length >= 500 ? 'Clip limit reached (500).' : undefined)),
      action('Close', () => closeTab(id)),
      action('Delete…', () => deleteTab(id), project.tabs.length === 1 ? 'Keep at least one pattern.' : stopped),
    ];
  } else if (item.dataset.clip) {
    const id = item.dataset.clip, clip = project.clips.find(c => c.id === id)!;
    selector = `[data-clip="${id}"]`;
    actions = [
      action(clip.muted ? 'Unmute' : 'Mute', () => toggleClipMute(id)),
      action('Edit', () => openClip(id), stopped),
      action('Duplicate', () => duplicateClip(id), stopped || (project.clips.length >= 500 ? 'Clip limit reached (500).' : !duplicatePlacement(project.clips, clip, 'candidate') ? 'No room in this lane.' : undefined)),
      action('Open source pattern', () => switchTab(clip.tabId)),
      action('Remove', () => removeClip(id), stopped),
    ];
  } else {
    const id = item.dataset.asset!; selector = `[data-select-asset="${id}"]`;
    actions = [action('Preview', () => previewSound(soundKey(assetById(id)))), action('Insert into pattern', () => insertSound(id)), action('Rename', () => renameSound(id))];
  }
  contextMenu.open(actions, x, y, () => document.querySelector<HTMLElement>(selector) ?? document.querySelector<HTMLElement>('[role=tab][aria-selected=true]'));
  return true;
}
document.addEventListener('contextmenu', event => {
  if (showContextMenu(event.target as HTMLElement, event.clientX, event.clientY)) event.preventDefault();
  else contextMenu.close(false);
});
document.addEventListener('keydown', event => {
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
  const target = event.target as HTMLElement, rect = target.getBoundingClientRect();
  if (showContextMenu(target, rect.left, rect.bottom, true)) { event.preventDefault(); event.stopPropagation(); }
});

async function boot() {
  await engine.setup(project);
  await seedStarters(); await browserMidi.init(); void collectOrphanAudio().catch(() => {});
  const [library, recovery] = await Promise.all([workspace.assets(), workspace.read<Project>('settings', 'recovery')]);
  bridge = browserMidi.status; devicePorts = (await browserMidi.connections()).ports; assets = library; await engine.registerAssets(assets);
  let restored = recovery ?? await workspace.loadProject('Neon-Drive');
  let hasDraft = false;
  try { const cached = localStorage.getItem(draftKey) ?? localStorage.getItem('studio.pending-session'); if (cached) { restored = ProjectSchema.parse(JSON.parse(cached)); hasDraft = true; } } catch { /* Ignore invalid local drafts. */ }
  if (restored) { try { await loadProject(restored); $('#saved-state').textContent = recovery || hasDraft ? 'Recovery restored' : 'Saved in this browser'; } catch (error) { notice(`Recovery could not load: ${(error as Error).message}`, true); } }
  restoreWorkspace(); renderAll(); await refreshProjects(); await refreshMidiPresets(); await refreshAudioPresets(); connectMidiEvents(); booted = true; routePage();
  try { midiComposition.restore(getEditor); performancePanel.restore(getEditor); await recordingPanel.restore(); await timelineRecording!.restore(); if (timelineRecording!.pending) setDrawer('composition'); await sampleImports.restore(); if (recordingPanel.pending) notice('Recovered audio take in Sounds → Import. Review it before saving.'); } catch (error) { notice(`Pending take recovery: ${(error as Error).message}`, true); }
  renderComposition();
  if (hasDraft) dirty();
  setInterval(() => {
    liveInput.mix(); const levels = liveInput.levels(); for (const name of ['input', 'output'] as const) { const meter = $<HTMLMeterElement>(`#audio-${name}-level`); meter.value = levels[name]; meter.title = levels[name] >= 1 ? 'Clipping — reduce gain' : `${Math.round(levels[name] * 100)}%`; } engine.tick(); renderRecording(); paintRecordingClip(); $('#cycle').textContent = `Cycle ${engine.cycle.toFixed(2)}`; settleSlots(); renderTransport(); $('#playhead').hidden = false; $('#playhead').style.left = `${180 + engine.timelinePosition * 64}px`; const head = document.querySelector<HTMLElement>('#seek-handle'); if (head && !timelineDragging) { head.style.left = `${180 + engine.timelinePosition * 64}px`; head.setAttribute('aria-valuenow', String(engine.timelinePosition)); }
    if (!instrumentOpen && engine.started && engine.target === project.activeTabId && engine.repl.state.pattern) { try { const cycle = engine.cycle; editor.paint(engine.repl.state.pattern.queryArc(cycle, cycle + 0.01), cycle); } catch { /* An incomplete edit must not interrupt performance. */ } }
  }, 100);
}
void boot().catch((error) => notice(`Studio could not start: ${error.message}`, true));

// Narrow DOM typing keeps markup helpers concise without disabling application checks.
