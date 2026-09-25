import { recordedTakePlacement } from '../shared/recorded-take';
import { tempoChangeIssue } from '../shared/clip-timing';
import { AlignDialog } from './align-dialog';
import { AssetSchema } from '../shared/model';
import { ClipWaveforms } from './clip-waveforms';
import { soundBindings, bindingAt, replaceBinding, type SoundBinding } from '../shared/sound-bindings';
import { samplePlacement, singleSampleId } from '../shared/sample-placement';
import { writePending, readPending } from './recovery';
import { MidiConnections } from './midi-connections';
import { recordingTarget, validateRecordingTarget, retainPatternOutput, placeNewPattern, type RecordingTarget } from '../shared/recording-target';
import { nextMetronomeMode, savedMetronomeMode, type MetronomeMode } from './count-in';
import { registerOverlay } from './overlay';
import { paintCaptureFeedback } from './capture-feedback';
import type { CaptureView } from '../shared/capture-state';
import { ChangeSet } from '@codemirror/state';
import { guideOptedOut } from './quick-start-preference';
import { normalizeProjectTempo, normalizeTabTempo, standaloneCode, tempoRate, beatPosition, beatDuration } from '../shared/tempo';
import { installQuickStart } from './quick-start';
import { saveSession } from './storage/session-save';
import { SessionDrafts } from './session-draft';
import { AUDIO_EDITOR, defaultAudioCode, compileAudioEffects, type AudioEffects } from '../shared/audio-input';
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
import { SampleEditor } from './sample-editor';
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
import { CommandPalette, type Command } from './command-palette';
import { Sheets } from './sheet';

type UIElement = HTMLElement & { value: string; checked: boolean; disabled: boolean; files?: FileList | null; showModal(): void; returnValue: string };
const $ = <T extends HTMLElement = UIElement>(selector: string) => document.querySelector<T>(selector)!;
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
try { document.documentElement.dataset.appearance = localStorage.getItem('studio.appearance') === 'dark' ? 'dark' : 'light'; } catch { document.documentElement.dataset.appearance = 'light'; }
const app = $('#app');
const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
const libraryKeys = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'].map((n, i) => `<button data-library-note="${60 + i}" aria-label="Test ${n}4" class="${n.includes('♯') ? 'black' : ''}">${n}</button>`).join('');
app.innerHTML = `
<header class="topbar">
  <a class="wordmark" href="/" aria-label="Strudel Studio">strudel<span>studio</span></a><span class="divider" aria-hidden="true"></span>
  <div class="session-actions"><select id="saved-projects" class="session-picker" aria-label="Sessions"><option value="">Sessions…</option></select><button id="add-session" class="bare icon" aria-label="Add session" title="Add session">+</button></div>
  <input id="project-name" aria-label="Project name" value="Untitled project">
  <div class="transport">
    <div class="segmented" role="group" aria-label="Playback target"><button data-play-target="composition" aria-pressed="true">Composition</button><button data-play-target="tab" aria-pressed="false">Tab</button></div>
    <select id="play-target" aria-label="Playback target" hidden><option value="composition">Composition</option><option value="tab">Current tab</option></select>
    <button id="skip-beginning" class="bare icon" aria-label="Skip to beginning" title="Stop and return to the beginning"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M5 5h2v14H5zM19 5v14L8 12z"/></svg></button><button id="play" class="primary pill" aria-label="Play pattern">Play</button><button id="composition-play" class="primary pill" aria-label="Play composition" hidden>Play</button>
    <button id="composition-loop" class="bare" aria-label="Loop composition range" aria-pressed="false">Loop</button><button id="stop" class="bare" aria-label="Stop playback">Stop</button><button id="composition-stop" class="bare" aria-label="Stop playback" hidden>Stop</button>
    <span class="divider" aria-hidden="true"></span>
    <label class="inline tempo" title="Project tempo · four beats per cycle"><input id="bpm" type="number" min="20" max="300" value="120" aria-label="Tempo in BPM">BPM</label>
    <button id="count-in" class="bare count-in-toggle" aria-label="Metronome" aria-pressed="false" title="Four-beat count-in before playback or recording"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h6l5 18H4L8 3Z"/><path d="m11 17 7-12M8 17h7M9 6h4"/><path d="m15 8 3 2"/></svg><span id="count-in-beat" aria-hidden="true"></span><span id="metronome-loop" aria-hidden="true" hidden>↻</span></button>
    <button id="record-toggle" class="record-toggle pill" aria-pressed="false" aria-controls="record-bar">Record</button>
  </div>
  <button id="palette-open" class="bare search-button" aria-haspopup="dialog" aria-controls="command-palette"><span>Search</span><kbd>${mod} K</kbd></button>
  <label class="appearance-choice" title="Toggle dark mode"><input id="dark-mode" type="checkbox" aria-label="Dark mode"><span class="appearance-icon" aria-hidden="true"><svg class="theme-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/></svg><svg class="theme-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg></span></label>
</header>
<div id="record-bar" aria-label="Record" hidden>
  <div class="record-options">
    <div class="chips" role="group" aria-label="Capture source"><button data-capture="audio" aria-pressed="true">Audio input</button><button data-capture="midi" aria-pressed="false">MIDI</button></div>
    <label id="midi-quantization-field" class="inline" hidden title="Snap recorded note starts and ends to the nearest grid position. Live playing stays immediate.">Quantize MIDI <select id="midi-quantization" aria-label="MIDI quantization"><option value="0">Off</option><option value="0.25">1/4 · one per beat</option><option value="0.125">1/8 · two per beat</option><option value="0.0625" selected>1/16 · four per beat</option><option value="0.03125">1/32 · eight per beat</option></select></label>
    <label id="midi-normalize-velocity-field" class="inline" hidden title="Give every recorded MIDI note the same velocity (100 of 127). Live playing keeps your original dynamics."><input id="midi-normalize-velocity" type="checkbox">Normalize velocity</label>
    <label class="record-destination">Destination <select id="record-destination" aria-label="Recording destination"><option value="new">New pattern</option><option value="existing">Existing pattern</option></select></label><label class="inline record-track"><span id="record-source-label">Record to</span> <select id="record-track" aria-label="Recording track"></select></label>
    <button id="record-return" class="bare" hidden>Recording destination</button><button id="record-audio-return" class="bare" hidden>Audio section</button><button id="record-clear-note" class="bare" hidden>Append MIDI instead</button><span id="midi-record-hint" class="hint" hidden>Choose a note() phrase, then press Record</span>
  </div>
  <div class="record-actions">
    <output id="record-status" role="status" aria-live="polite"></output>
    <button id="record-preview" hidden>Preview take</button><button id="record-retry" hidden>Retry save</button><button id="record-download" hidden>Download recording</button><button id="record-discard" hidden>Discard…</button>
    <button id="record-settings" class="bare">Settings</button><button id="record-close" class="bare icon" aria-label="Close record bar">✕</button>
  </div>
</div>
<main class="workspace">
  <section class="editor-panel">
    <div id="midi-learning" class="alert" hidden><span class="alert-dot" aria-hidden="true"></span><span id="learn-status" role="status"></span><button id="cancel-learn" class="alert-action" hidden>Cancel learning</button></div>
    <div id="input-alert" class="alert" hidden><span class="alert-dot" aria-hidden="true"></span><span id="input-alert-text" role="status"></span><button id="audio-connect" class="alert-action">Connect microphone</button><button id="audio-cancel" class="alert-action" hidden>Cancel</button><button id="input-alert-settings" class="bare">Settings</button></div>
    <div id="audio-toolbar" class="input-bar" hidden>
      <span class="input-source"><span class="live-dot" aria-hidden="true"></span><span id="audio-source-label">Default input</span></span>
      <span class="level-bar" aria-hidden="true"><span></span></span>
      <label class="toggle-pill" title="Monitoring routes the live input to your speakers — use headphones to avoid feedback"><input id="audio-monitor" type="checkbox"><span>Monitor input</span></label>
      <button id="audio-settings" class="bare">Settings</button>
      <p id="monitor-warning" hidden>Monitoring is live — use headphones, or the microphone will capture your own output.</p>
    </div>
    <div id="midi-editor-connection" hidden></div>
    <div id="instrument-toolbar" class="input-bar" hidden>
      <div id="midi-output-controls"><input id="midi-output-search" type="search" aria-label="Find MIDI output sound" placeholder="Find sound"><select id="midi-output-sound" aria-label="MIDI output sound"></select><button id="clear-midi-sound" class="bare" hidden>Clear sound</button></div>
      <span class="divider" aria-hidden="true"></span>
      <select id="midi-preset" aria-label="MIDI preset"><option value="">Choose preset…</option></select><button id="save-midi-preset" class="bare">Save preset…</button><button id="learn-midi-preset" class="bare">Map preset to a key</button><button id="cancel-preset-learn" class="bare" hidden>Cancel preset mapping</button>
      <span class="toolbar-end"><button id="instrument-stop" class="bare">Stop instrument</button><button id="instrument-apply" class="primary">Apply instrument</button></span>
      <p class="instrument-status"><span id="midi-assignment" role="status"></span><span id="instrument-state" role="status"></span><span id="preset-learn-status" role="status"></span></p>
    </div>

    <div id="chop-sounds" aria-label="Pattern sounds" hidden></div>
    <div id="editor"></div>
    <div id="empty-editor" hidden><p>No open patterns</p><button id="open-patterns">Open a pattern</button></div>
    <div id="apply-pill" role="status" hidden><span class="dirty-dot" aria-hidden="true"></span>Unapplied edits<button id="evaluate" aria-label="Apply changes" hidden>Apply <kbd>${mod} ↵</kbd></button><button id="audio-apply" hidden>Apply effects</button></div>
  </section>
</main>
<footer class="drawer-bar">
  <div id="tabs" role="tablist" aria-label="Patterns"></div>
  <div class="new-pattern"><button id="new-tab" class="bare icon" aria-label="New pattern" aria-expanded="false" aria-controls="new-pattern">+</button>
    <form id="new-pattern" class="popover" aria-label="New pattern" hidden><span class="eyebrow">New pattern</span><input id="new-pattern-name" aria-label="Pattern name" maxlength="80"><div class="swatches" role="group" aria-label="Pattern color">${palette.map(color => `<button type="button" data-color="${color}" aria-pressed="false" aria-label="${color}" title="${color}"></button>`).join('')}</div><div class="popover-actions"><button type="submit" class="primary">Create</button><button type="button" class="bare" data-cancel>Cancel</button></div></form>
  </div>
  <span class="divider" aria-hidden="true"></span>
  <div id="input-tabs" role="tablist" aria-label="Inputs"></div>
  <span id="transport-state">Stopped</span>
  <span class="save-state"><span id="saved-state" role="status">Browser project</span><button id="save-now" class="bare" title="Save session (${mod}+S)">Save</button></span>
  <button data-drawer="composition" class="composition-toggle bare" aria-expanded="false" aria-controls="drawer"><span class="mini-clips" aria-hidden="true"><i></i><i></i><i></i></span>Composition<span class="chevron" aria-hidden="true"></span></button>
</footer>
<section id="drawer" aria-label="Composition" hidden><div id="drawer-resize" role="separator" tabindex="0" aria-label="Resize composition" aria-orientation="horizontal" aria-valuemin="180" aria-valuemax="600" aria-valuenow="300"></div>
  <div id="composition-content" hidden><div class="composition-toolbar">
    <output id="composition-position" aria-label="Timeline position">0.00</output>
    <span id="loop-readout">Drag the ruler to loop a range</span><button id="clear-loop" class="bare" hidden>Clear selection</button>
    <label class="inline">Snap <select id="snap"><option value="1">4 beats</option><option value="0.5">2 beats</option><option value="0.25">1 beat</option></select></label>
    <button id="add-track" class="bare">Add track</button>
    <span id="arrangement-status" hidden>Edit while stopped · 4 beats per cycle</span>
    <button id="composition-editor" class="bare">Show editor</button>
    <button id="composition-close" class="bare icon" aria-label="Close composition">✕</button>
  </div><div id="sequencer-scroll"><div id="sequencer"><div id="ruler"></div><div id="tracks"></div><div id="playhead" hidden></div></div></div></div>
</section>
<div id="sheet-backdrop" class="sheet-backdrop" hidden></div>
<aside id="sheet" class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1" hidden>
  <header class="sheet-header"><div><h1 id="sheet-title" data-sheet-title></h1><p data-sheet-subtitle></p></div><button class="bare" data-sheet-close>Close</button></header>
  <div class="sheet-body">
    <section data-sheet="midi" data-title="MIDI" data-subtitle="Hardware and the on-screen controller" hidden>
      <section id="devices-content" class="sheet-section" aria-label="MIDI devices"><h2>Devices</h2><p class="hint">Connect an external keyboard or controller. Connections stay active when you switch sessions.</p>
        <div id="midi-settings-connection"></div>
        <p id="device-activity" role="status">Play a key or move a control to check input.</p>
        <div class="form-row"><button id="edit-midi-instrument" class="bare">Edit MIDI instrument</button></div>
      </section>
      <section class="controller-panel sheet-section"><div class="section-heading"><h2>On-screen controller</h2><label class="inline">Channel <input id="controller-channel" type="number" min="1" max="16" value="1" aria-label="Virtual controller channel"></label><select id="route" aria-label="MIDI route"><option value="simulation">Browser</option></select><button id="edit-layout" class="bare">Edit layout</button></div>
        <p id="route-status" class="route-status hint"></p><div id="drawer-learning" hidden><span>Learning… move a control.</span><button id="drawer-cancel-learn">Cancel</button></div><div id="controls" class="controls"></div><div id="layout-editor" hidden></div>
      </section>
      <details class="midi-advanced sheet-section"><summary>Mappings, sound slots &amp; diagnostics</summary>
        <section class="mapping-panel"><div class="section-heading"><h2>Control mappings</h2><span id="mapping-count">0</span></div><div id="bindings"></div></section>
        <section class="slots-section"><div class="section-heading"><h2>Sound slots</h2><button id="add-slot" class="bare">Add</button></div><div id="slots"></div></section>
        <section class="monitor-panel"><div class="section-heading"><h2>MIDI feedback</h2><button id="clear-events" class="bare">Clear</button></div><div id="last-receipt" class="receipt">Move a control to inspect its route and binding.</div><div id="events" class="event-list" aria-label="MIDI event monitor"></div></section>
      </details>
    </section>
    <section data-sheet="audio" data-title="Audio input" data-subtitle="Route a microphone or interface into a track" hidden>
      <section class="sheet-section"><h2>Input</h2>
        <div class="field-grid"><label>Device <select id="audio-device"><option value="">Default input</option></select></label><label>Channel <select id="audio-channel"><option value="stereo">Stereo</option></select></label><label>Monitor track <select id="audio-track"></select></label></div>
        <div class="form-row"><button id="audio-sheet-connect" class="primary">Connect microphone</button><button id="audio-disconnect">Disconnect / cancel permission</button></div>
        <p id="audio-state" class="hint" role="status">Input is disarmed. Monitoring defaults off.</p>
      </section>
      <section class="sheet-section"><h2>Levels</h2><div class="levels"><span>Input</span><meter id="audio-input-level" min="0" max="1" value="0" aria-label="Input level"></meter><span>Output</span><meter id="audio-output-level" min="0" max="1" value="0" aria-label="Output level"></meter></div></section>
      <section class="sheet-section"><h2>Effects chain</h2><pre id="audio-chain" class="code-block"></pre>
        <div class="form-row"><button id="audio-edit-effects">Edit in the Input tab</button><button id="audio-save-preset" class="bare">Save effects preset…</button><label class="inline">Preset <select id="audio-preset"><option value="">Choose preset…</option></select></label></div>
        <p class="hint">gain, pan, lpf, hpf, delay, delaytime, delayfeedback and room are supported. Monitoring starts off; takes keep a dry original.</p>
      </section>
      <section class="sheet-section"><h2>Test on a recording</h2><div class="form-row"><select id="audio-test-take" aria-label="Test on recording"><option value="">Choose a recorded take…</option></select><button id="audio-test-play">Test vocal effects</button><button id="audio-test-stop" class="bare">Stop test</button></div><p class="hint">Testing changes the preview; your saved recording stays intact.</p></section>
    </section>
    <section data-sheet="record" data-title="Record" data-subtitle="Capture audio input onto the timeline" hidden>
      <section class="sheet-section"><h2>Capture</h2><div class="field-grid"><label>Capture <select id="record-mode"><option value="wet">With vocal effects</option><option value="dry">Dry · editable effects</option></select></label><label>Latency compensation (seconds)<input id="record-latency" type="number" min="-2" max="2" step="0.001" value="0"></label></div></section>
      <p class="hint">Choose a track under <b>Record to</b> in the record bar, then record. Stopping saves the take with your applied effects and drops a clip on that track. <button type="button" class="link" id="record-audio-settings">Audio input settings</button> control the device and monitoring.</p>
    </section>
    <section data-sheet="export" data-title="Export" data-subtitle="Full song render to stereo WAV" hidden><div id="export-content"></div></section>
  </div>
</aside>
<div class="sheet-backdrop library-backdrop" hidden></div>
<aside id="sounds-panel" class="sound-panel" role="dialog" aria-modal="true" aria-label="Sample Catalogue" hidden>
  <div class="library-header">
    <div class="panel-heading"><h1>Sounds <small id="asset-count">0 sounds</small></h1><button id="refresh-assets" class="bare" aria-label="Refresh sounds">Refresh</button><button id="sounds-close" class="bare">Close</button></div>
    <div class="library-filters"><label>Search sounds <input id="sound-search" type="search" placeholder="Name, tag, description, or pack"></label><select id="library-source" aria-label="Filter sound source"><option value="all">All sources</option><option value="builtin">Built-in</option><option value="upload">Imported</option><option value="recording">Recorded</option></select></div>
    <p id="library-destination" class="hint"></p>
  </div>
  <section id="chop-audition" hidden><div id="chop-region"></div><p id="chop-status" role="status"></p><div class="chop-actions"><button id="chop-use" class="primary">Use sound</button><button id="chop-cancel">Cancel</button></div></section>
  <div id="library-scroll">
    <details id="add-sounds"><summary>Add sounds</summary><section id="sound-import" role="tabpanel" aria-label="Import sounds"><p class="hint">Bring samples and recorded takes into this browser’s library.</p></section></details>
    <div id="builtin-sounds" class="asset-list"></div>
    <div id="assets" class="asset-list"></div>
    <section id="assignment" class="assignment" hidden><button id="insert-sound" class="primary">Insert into pattern</button><details><summary>Assign to a control or slot</summary><h2>Assign selected sound</h2><label for="assign-target">Destination</label><select id="assign-target"></select><button id="assign">Assign sound</button><button id="learn-trigger">Learn a trigger key</button><p class="hint">Pads play one-shots. Slots swap sounds on the next cycle.</p></details></section>
  </div>
  <div class="library-test"><span id="library-midi-status" role="status">Choose Live on a sound to play it from your controller</span><div id="library-keys" aria-label="Test keyboard" hidden>${libraryKeys}</div></div>
</aside>
<dialog id="edit-dialog"><form method="dialog"><h2 id="edit-title"></h2><label id="edit-label">Name<input id="edit-name" maxlength="80" required></label><p id="edit-description"></p><div class="form-row"><button type="button" value="cancel">Cancel</button><button type="submit" value="confirm" class="primary">Confirm</button></div></form></dialog>
<dialog id="clip-dialog"><form method="dialog"><h2>Clip</h2><label>Track<select id="clip-lane" aria-label="Track"></select></label><div class="form-row"><label>Position (beat)<input id="clip-start" step="1" type="number" min="1" max="16385" required></label><label>Duration (beats)<input id="clip-length" step="1" type="number" min="1" max="16384" required></label></div><label id="clip-playback-label" hidden>Sample playback<select id="clip-playback"><option value="once">Play once</option><option value="pattern">Repeat pattern</option></select></label><p id="clip-playback-help" hidden>Plays once from its anchors. Extending adds silence; trimming shortens the playback window. Duplicate the clip to repeat it.</p><div id="clip-audio-controls" hidden><fieldset><legend>Timing</legend><button type="button" id="clip-align" class="primary">Align…</button><p>Place syllables on beats, fit the phrase to bars, or Smart snap its attacks to the grid while listening with the song.</p></fieldset></div><details id="clip-offset-details"><summary>Source timing</summary><label>Source offset (cycles)<input id="clip-offset" type="number" min="0" max="4096" step="any"></label><p>Edges trim the playback window. Extending does not loop or stretch audio.</p></details><div class="form-row"><button value="cancel" formnovalidate>Cancel</button><button value="duplicate" formnovalidate>Duplicate</button><button value="source" formnovalidate>Open source pattern</button><button value="remove" formnovalidate>Remove</button><button value="mute" formnovalidate id="clip-mute">Mute</button><button value="save" class="primary">Save clip</button></div></form></dialog>
<div id="notice" role="status" aria-live="polite"></div>
<dialog id="slot-dialog"><form method="dialog"><h2>Add sound slot</h2><label>Name<input id="slot-name" pattern="[a-zA-Z][\\w-]{0,39}" value="texture" required></label><div class="form-row"><button value="cancel" formnovalidate>Cancel</button><button value="add" class="primary">Add slot</button></div></form></dialog>
<input type="file" id="import-file" accept=".strudel,.str,.js" hidden><input id="backup-file" type="file" accept=".zip" hidden>`;

const libraryBackdrop = $('.library-backdrop');
registerOverlay($('#sounds-panel'), () => setSounds(false));
/** Regions a modal sheet or the sound library makes inert; dialogs and notices stay outside them. */
const workspaceRegions = () => ['.topbar', '#record-bar', '.workspace', '.drawer-bar', '#drawer'].map(selector => $<HTMLElement>(selector));
const sheets = new Sheets($('#sheet'), $('#sheet-backdrop'), workspaceRegions, id => sheetOpened(id));
let recordBarOpen = false;
let recordAudioEnabled = true, recordMidiEnabled = false;
let activeRecordingTarget: RecordingTarget | undefined;
let proposedRecordingTarget: RecordingTarget | undefined;
let preparingShared = false, sharedEpoch = 0;
let sharedTimer: ReturnType<typeof setTimeout> | undefined;
let recordSource: 'external' | 'phrase' | 'instrument' = 'external';
let midiPulseUntil = 0;

let project: Project = newProject();
let openTabs = new Set(project.tabs.map(t => t.id));
let assets: Asset[] = [];
let devicePorts: string[] = [];
let selectedAsset: string | undefined;
let selectedSound: string | undefined;
let libraryTarget: { owner: StudioEditor; code: string; from: number; to: number; binding?: SoundBinding; tabId?:string } | undefined;
let libraryReturn: HTMLElement | undefined;
let libraryMidi = false;
let regionEditor: SampleEditor | undefined;
let regionEpoch = 0;
let replacingSound = false;
const libraryNotes = new Set<string>();
function stopLibraryNotes() { regionEditor?.stop(); for (const key of libraryNotes) engine.performanceAudio.release(key); libraryNotes.clear(); }
function selectLibrarySound(name: string) { if(replacingSound)return;stopLibraryNotes(); previewEpoch++; if (previewKey) engine.performanceAudio.release(previewKey); selectedSound = name; selectedAsset = assets.find(a => soundKey(a) === name)?.id; paintLibrarySelection(); if(libraryTarget?.binding)void loadChopRegion(); }
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
  if (!on) { if(regionEditor)void regionEditor.audition(voice,pitch,velocity,false,engine.audioContext,engine.performanceAudio.output); libraryNotes.delete(voice); engine.performanceAudio.release(voice); return; }
  if (!libraryMidi || !selectedSound) return;
  const name = selectedSound;
  if(libraryTarget?.binding && selectedAsset){libraryNotes.add(voice);await engine.unlock();if(!libraryNotes.has(voice)||selectedSound!==name||!libraryTarget?.binding)return;if(regionEditor?.ready)await regionEditor.audition(voice,pitch,velocity,on,engine.audioContext,engine.performanceAudio.output);return;}
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
  $('#library-midi-connection').hidden = !libraryMidi;

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
function guard(fn: () => unknown | Promise<unknown>) { return async () => { try { await fn(); } catch (error) { if ((error as Error)?.name === 'AbortError') return; notice(error instanceof Error ? error.message : 'Something went wrong', true); } }; }
const editors = new Map<string, StudioEditor>();
let editor: StudioEditor;
let instrumentOpen = false;
let audioOpen = false;
const activeEditorId = () => audioOpen ? AUDIO_EDITOR : instrumentOpen ? MIDI_EDITOR : project.activeTabId;
function openMidiInstrument() {
  if (!$('#sounds-panel').hidden) setSounds(false);
  sheets.close(false);
  audioOpen = false; instrumentOpen = true; editor = getEditor(MIDI_EDITOR); selectedSlider = undefined;
  learning = undefined; $('#midi-learning').hidden = true; $('#cancel-learn').hidden = true; $('#drawer-learning').hidden = true;
  renderTabs(); renderSliders(); renderBindings(); saveWorkspace(); editor.view.requestMeasure(); editor.view.focus();
}

function getEditor(id = project.activeTabId) {
  let instance = editors.get(id);
  if (!instance) {
    const config = instrumentFor(project);
    const tab = id === AUDIO_EDITOR && project.audioInput ? { id, name: 'Audio input', color: 'teal' as const, code: project.audioInput.code, anchors: project.audioInput.anchors } : id === MIDI_EDITOR ? { id, name: 'MIDI instrument', color: 'blue' as const, code: config.code, anchors: config.anchors } : project.tabs.find(t => t.id === id) ?? ((activeRecordingTarget ?? performancePanel.sharedTarget)?.kind === 'new' && (activeRecordingTarget ?? performancePanel.sharedTarget)?.tabId === id ? validateRecordingTarget(project, (activeRecordingTarget ?? performancePanel.sharedTarget)!) : undefined);
    if (!tab) throw new Error('Pattern no longer exists.');
    const root = document.createElement('div'); root.className = 'tab-editor'; root.dataset.tabEditor = id; root.hidden = id !== project.activeTabId;
    $('#editor').append(root);
    const liveVersions = new Map<string, number>();
    instance = new StudioEditor(root, tab, {
      sounds: () => engine.soundEntries, functions: () => id === AUDIO_EDITOR ? ['AUDIO', 'gain', 'pan', 'lpf', 'hpf', 'delay', 'delaytime', 'delayfeedback', 'room', 'slider'] : id === MIDI_EDITOR ? [...engine.functionNames, 'MIDI'] : engine.functionNames,
      change: (live) => { for (const slider of instance?.sliders ?? []) engine.liveEffects.update(slider.id, instance!.values.get(slider.id) ?? slider.value); if (id === MIDI_EDITOR || id === AUDIO_EDITOR) { const config = id === AUDIO_EDITOR ? project.audioInput! : instrumentFor(project); config.code = instance!.code; config.anchors = instance!.anchors; const updates = new Map<string, number>(); for (const [key, version] of instance!.liveVersions) if (version !== liveVersions.get(key)) { liveVersions.set(key, version); updates.set(key, instance!.values.get(key)!); } updateAppliedInstrumentSliders(config, updates); if (id === AUDIO_EDITOR && updates.size) { try { liveInput.apply(config.appliedCode); } catch (error) { notice((error as Error).message, true); } } if (!live) paintMidiAssignment(); } if (!live) { if (id === activeEditorId()) { renderSliders(); queueMicrotask(renderChopSounds); } renderBindings(); renderTransport(); } dirty(live); },
      value: (sliderId, value) => queueMidiSlider(instance!, sliderId, value),
      select: (sliderId) => { selectedSlider = sliderId; renderBindings(); },
      evaluate: () => void guard(() => id === AUDIO_EDITOR ? applyAudioInput() : id === MIDI_EDITOR ? applyMidiInstrument() : engine.started ? engine.apply() : startPlayback())(), stop: () => stopPlayback(),
    });
    editors.set(id, instance);
    if (id !== MIDI_EDITOR && id !== AUDIO_EDITOR) {
      instance.syncTempo(project.bpm, (tab as Tab).tempoBpm);
      tab.code = instance.code; tab.anchors = instance.anchors;
    }
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
  sheets.close(false);
  ensureAudioInput(); audioOpen = true; instrumentOpen = false; editor = getEditor(AUDIO_EDITOR); selectedSlider = undefined;
  renderTabs(); renderSliders(); renderBindings(); renderAudioInput(); dirty(); editor.view.focus();
}
async function applyAudioInput() {
  const owner = getEditor(AUDIO_EDITOR), input = ensureAudioInput();
  compileAudioEffects(owner.code); liveInput.apply(owner.code);
  input.code = input.appliedCode = owner.code; input.anchors = input.appliedAnchors = owner.anchors;
  renderAudioInput(); dirty(); await persistSession();
}
function renderAudioInput() {
  if (!document.querySelector('#audio-test-take')) return;
  const input = project.audioInput; if (!input) return;
  $('#audio-track').innerHTML = project.tracks.map(t => `<option value="${t.id}">${escape(t.name)}</option>`).join(''); $('#audio-track').value = input.trackId;
  $('#audio-monitor').checked = liveInput.monitoring;
  $('#audio-chain').textContent = input.appliedCode;
  $('#audio-source-label').textContent = `${$<HTMLSelectElement>('#audio-device').selectedOptions[0]?.textContent || 'Default input'} · ${$<HTMLSelectElement>('#audio-channel').selectedOptions[0]?.textContent || 'Stereo'}`;
  const chosen = $('#audio-test-take').value; $('#audio-test-take').innerHTML = '<option value="">Choose a recorded take…</option>' + assets.filter(a => a.provider === 'recording' && !a.missing).map(a => `<option value="${a.id}">${escape(a.label || 'Recorded take')}</option>`).join(''); $('#audio-test-take').value = chosen;
  $('#audio-state').textContent = `${liveInput.pending ? 'Waiting for microphone permission; cancel is available' : liveInput.active ? 'Armed' : 'Disarmed'} · ${input.code === input.appliedCode ? 'Applied effects' : 'Draft changes — last applied effects remain active'}${liveInput.settings ? ` · ${liveInput.settings.sampleRate || 'device'} Hz · ${liveInput.settings.channelCount || 1} channels · echo cancellation ${liveInput.settings.echoCancellation ?? 'unknown'}, noise suppression ${liveInput.settings.noiseSuppression ?? 'unknown'}, auto gain ${liveInput.settings.autoGainControl ?? 'unknown'}` : ''}`;
}
$('#audio-apply').onclick = guard(applyAudioInput);
$('#audio-track').onchange = () => { ensureAudioInput().trackId = $('#audio-track').value; liveInput.mix(); dirty(); };
$('#audio-monitor').onchange = () => { liveInput.setMonitoring($('#audio-monitor').checked); renderAudioInput(); };
async function connectAudio() {
  ensureAudioInput().enabled = true; dirty(); const connecting = liveInput.connect(ensureAudioInput(), $('#audio-device').value, $('#audio-channel').value); renderAudioInput();
  try { await connecting; const chosenChannel = $('#audio-channel').value; const devices = await navigator.mediaDevices.enumerateDevices(); $('#audio-device').innerHTML = '<option value="">Default input</option>' + devices.filter(d => d.kind === 'audioinput').map(d => `<option value="${escape(d.deviceId)}">${escape(d.label || 'Audio input')}</option>`).join(''); $('#audio-device').value = liveInput.settings?.deviceId ?? ''; $('#audio-channel').innerHTML = '<option value="stereo">Stereo channels 1–2</option>' + Array.from({ length: liveInput.settings?.channelCount ?? 1 }, (_, i) => `<option value="${i}">Mono channel ${i + 1}</option>`).join('') + Array.from({ length: Math.floor((liveInput.settings?.channelCount ?? 1) / 2) }, (_, i) => `<option value="${i * 2},${i * 2 + 1}">Stereo channels ${i * 2 + 1}–${i * 2 + 2}</option>`).join(''); $('#audio-channel').value = chosenChannel; }
  finally { renderAudioInput(); }
}
$('#audio-connect').onclick = $('#audio-sheet-connect').onclick = guard(connectAudio);
$('#audio-device').onchange = $('#audio-channel').onchange = () => { liveInput.disconnect(); renderAudioInput(); };
function disconnectAudio() { if (timelineRecording?.pending) { void timelineRecording.stop(true); return; } liveInput.disconnect(); renderAudioInput(); }
$('#audio-disconnect').onclick = $('#audio-cancel').onclick = disconnectAudio;
function resolveRecordTarget() {
  const context = $('#play-target').value === 'composition' ? 'composition' : 'tab';
  const mode = document.querySelector<HTMLSelectElement>('#record-destination')?.value === 'existing' ? 'existing' : 'new';
  const track = selectedTrack ?? $('#record-track').value;
  if (context === 'composition' && mode === 'new' && proposedRecordingTarget?.trackId === track) {
    proposedRecordingTarget.position = engine.timelinePosition; return proposedRecordingTarget;
  }
  const target = recordingTarget(snapshot(), context, track, selectedMidiClip, engine.timelinePosition, mode);
  if (target.kind === 'new') proposedRecordingTarget = target;
  return target;
}
function clearPendingPattern() {
  const target = activeRecordingTarget ?? performancePanel.sharedTarget;
  if (target?.kind === 'new' && !project.tabs.some(t => t.id === target.tabId)) {
    const owner = editors.get(target.tabId); const root = owner?.view.dom.parentElement;
    owner?.view.destroy(); root?.remove(); editors.delete(target.tabId);
  }
  proposedRecordingTarget = undefined;
}
async function startSharedRecording() {
  if (!recordAudioEnabled && !recordMidiEnabled) throw new Error('Enable Audio input, MIDI, or both.');
  if (timelineRecording?.pending || performancePanel.take?.notes.length || recordingPanel.pending || midiComposition.pending) throw new Error('Keep or discard the pending take first.');
  const target = resolveRecordTarget(); activeRecordingTarget = target; const owner = getEditor(target.tabId);
  validateRecordingTarget(snapshot(), target);
  const epoch = ++sharedEpoch; activeRecordingTarget = target; preparingShared = true;
  if (!(target.context === 'composition' && engine.started && engine.diagnostics.target === 'composition')) { engine.stop(); stopTakePreview(); }
  if (recordMidiEnabled) {
    const sound = instrumentFor(project).appliedCode.replace(/^\s*MIDI/, '');
    performancePanel.armShared(owner, target.tabId, sound.startsWith('.') ? sound : '.s("triangle").gain(0.2)');
    performancePanel.sharedOffset = target.offset; performancePanel.sharedTarget = target;
  }
  if (project.tabs.find(t => t.id === target.tabId)?.audioAssetId) takeCodeOpen.add(target.tabId);
  if (target.kind !== 'new') { switchTab(target.tabId); owner.revealRecording(recordAudioEnabled || !!owner.destination?.append); }
  renderRecording();
  try {
    await persistSession();
    if (epoch !== sharedEpoch) return;
    if (recordAudioEnabled) {
      await timelineRecording!.start({ target, trackId: target.trackId ?? project.tracks[0].id, device: $('#audio-device').value, channel: $('#audio-channel').value, mode: $('#record-mode').value as 'wet' | 'dry', latency: Number($('#record-latency').value), countin: engine.countIn.enabled,
        accompaniment: !recordMidiEnabled || performancePanel.accompaniment === 'pattern',
        deferCommit: true,
        prepareMidi: recordMidiEnabled ? () => performancePanel.prepareShared() : undefined,
        startMidi: recordMidiEnabled ? at => { performancePanel.sharedOffset = target.offset; performancePanel.startShared(at); } : undefined,
        stopMidi: () => { if (recordMidiEnabled) performancePanel.stop(); void flushMidiSliders().catch(e => notice(e.message, true)); },
        ...(recordSource === 'phrase' ? { mode: 'wet' as const, internal: { name: 'Highlighted phrase', prepare: async () => { await performancePanel.prepare(); return engine.performanceAudio.output; } } } : {})
      });
    } else {
      await performancePanel.prepareShared();
      if (epoch !== sharedEpoch) return;
      if (target.context === 'composition' && !engine.started) engine.transport.position = target.position;
      const at = await engine.recordingStart(target.context === 'composition', performancePanel.accompaniment === 'pattern', target.tabId);
      if (epoch !== sharedEpoch) return;
      if (target.kind === 'new') { target.position = engine.positionAt(at); target.offset = target.position - Math.floor(target.position * 4) / 4; performancePanel.sharedOffset = target.offset; }
      performancePanel.startShared(at);
      const limit = Math.min(900, ((target.kind === 'new' ? 4096 : target.end ?? 4096) - target.position) * 240 / project.bpm);
      sharedTimer = setTimeout(() => void stopSharedRecording(), (Math.max(0, at - engine.audioContext.currentTime) + limit) * 1000);

    }
  } catch (error) { if (epoch === sharedEpoch) { performancePanel.stop(); throw error; } }
  finally { if (epoch === sharedEpoch) { preparingShared = false; renderTransport(); } }
}
async function stopSharedRecording() {
  ++sharedEpoch; clearTimeout(sharedTimer); preparingShared = false; performancePanel.stop();
  await timelineRecording?.stop(); engine.endAudioRecording(); if (engine.started) engine.stop(); await performancePanel.flushRecovery(); await performancePanel.prepareProposal(); await flushMidiSliders(); if (!performancePanel.take?.notes.length && !timelineRecording?.pending) { clearPendingPattern(); await performancePanel.completeShared(); activeRecordingTarget = undefined; } renderTransport();
}
$('#record-retry').onclick = guard(() => { stopTakePreview(); performancePanel.stop(); return timelineRecording!.retry(); });
$('#record-preview').onclick = guard(() => { if (previewSource) { stopTakePreview(); performancePanel.stop(); return; } return previewPendingTake(); });
$('#record-download').onclick = guard(() => timelineRecording!.download());
$('#record-discard').onclick = guard(async () => { if (await askEdit('Discard this take?', undefined, 'This removes the unsaved take. Your existing pattern stays unchanged.')) { stopTakePreview(); performancePanel.stop(); await timelineRecording!.discard(); clearPendingPattern(); await performancePanel.completeShared(); activeRecordingTarget = undefined; renderTransport(); } });
$('#record-destination').onchange = () => { proposedRecordingTarget = undefined; renderRecording(); };
$('#record-track').onchange = () => { selectedTrack = $('#record-track').value; selectedMidiClip = undefined; renderRecording(); };
function renderRecording() {
  const recording = timelineRecording, audioPending = !!recording?.pending;
  const running = preparingShared || performancePanel.running || recording?.state === 'recording' || recording?.state === 'preparing';
  const pending = audioPending || !!performancePanel.take?.notes.length;
  if (pending) { recordMidiEnabled ||= !!performancePanel.take?.notes.length; recordAudioEnabled ||= audioPending; }
  const busy = running || pending || performancePanel.finalizing;
  $('#midi-quantization-field').hidden = !recordMidiEnabled;
  $('#midi-quantization').value = String(performancePanel.quantization);
  $('#midi-quantization').disabled = busy;
  $('#midi-normalize-velocity-field').hidden = !recordMidiEnabled;
  $('#midi-normalize-velocity').checked = performancePanel.normalizeVelocity;
  $('#midi-normalize-velocity').disabled = busy;
  $('#skip-beginning').disabled = engine.busy || running || performancePanel.finalizing || recording?.state === 'finishing';
  const choice = document.querySelector<HTMLSelectElement>('#record-destination'); if (choice) { choice.disabled = busy; choice.closest('label')!.hidden = $('#play-target').value !== 'composition'; }
  $('#record-bar').hidden = !recordBarOpen && !busy && !recordingPanel.pending && !midiComposition.pending;
  $('#record-toggle').setAttribute('aria-pressed', String(!$('#record-bar').hidden));
  $('#record-toggle').textContent = preparingShared || recording?.state === 'preparing' ? 'Cancel' : running ? 'Stop' : 'Record';
  $('#record-toggle').classList.toggle('recording', running);
  $('#record-toggle').disabled = !running && pending || recordingPanel.pending || midiComposition.pending;
  document.querySelectorAll<HTMLButtonElement>('[data-capture]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.capture === 'audio' ? recordAudioEnabled : recordMidiEnabled)); button.disabled = busy; });
  $('#record-bar .chips').hidden = false;
  $('#record-midi-connection').hidden = !recordMidiEnabled || instrumentOpen || !!learning;
  $('#record-bar').dataset.mode = recordAudioEnabled && recordMidiEnabled ? 'both' : recordMidiEnabled ? 'midi' : 'audio';
  $('#record-settings').hidden = !recordAudioEnabled;
  $('#record-close').disabled = busy;
  $('#record-status').hidden = !audioPending && !recording?.message;
  const midiNotes = performancePanel.take?.notes.length ?? 0;
  $('#record-status').textContent = (recording?.state === 'review' ? 'Take ready · audio' : recording?.state === 'recording' ? `Audio · recording ${recording.elapsed.toFixed(1)} s` : recording?.message ?? '') + (audioPending && midiNotes ? ` · ${midiNotes} MIDI ${midiNotes === 1 ? 'note' : 'notes'}` : '');
  $('#record-preview').hidden = $('#record-retry').hidden = $('#record-download').hidden = $('#record-discard').hidden = !['review', 'failed'].includes(recording?.state ?? '');
  $('#record-preview').textContent = previewSource ? 'Stop preview' : 'Preview take';
  $('#record-download').hidden = recording?.state !== 'failed';
  $('#record-retry').textContent = recording?.state === 'review' ? 'Keep take' : 'Retry save';
  const midiRecoveryVisible = [...performancePanel.root.querySelectorAll<HTMLElement>('[data-retarget], [data-fallback]')].some(button => !button.hidden);
  performancePanel.root.hidden = !midiRecoveryVisible && (audioPending || !performancePanel.running && !performancePanel.take?.notes.length);
  if (audioPending) { performancePanel.root.querySelector<HTMLElement>('.performance-review')!.hidden = true; performancePanel.root.querySelector<HTMLElement>('.performance-feedback')!.hidden = true; }
  let target = busy ? recording?.identity?.target ?? activeRecordingTarget : undefined;
  let problem = '';
  if (!target) try { target = resolveRecordTarget(); } catch (error) { problem = (error as Error).message; }
  const name = project.tabs.find(t => t.id === target?.tabId)?.name ?? target?.name ?? 'Missing pattern';
  const phrase = recordMidiEnabled && performancePanel.owner?.destination?.tabId === target?.tabId && !performancePanel.owner?.destination?.append;
  $('#midi-record-hint').hidden = false;
  const placements = project.clips.filter(c => c.tabId === target?.tabId).length;
  const impact = placements === 1 ? ' and its composition placement' : placements > 1 ? ` in all ${placements} composition placements` : '';
  const sections = [recordMidiEnabled ? phrase ? 'MIDI replaces selected note' : 'MIDI adds a section' : '', recordAudioEnabled ? 'Audio adds a section' : ''].filter(Boolean).join(' · ');
  $('#midi-record-hint').textContent = target?.kind === 'new' ? `${target.name} · ${project.tracks.find(t => t.id === target.trackId)?.name} · New pattern on this track · existing clips stay in place` : problem || `${name}${target?.trackId ? ' · ' + (project.tracks.find(t => t.id === target.trackId)?.name ?? 'Missing track') + ' · beat ' + beatPosition(target.position) : ''} · ${sections}${target ? ` · Keeping updates this pattern${impact}` : ''}`;
  $('.record-track').hidden = $('#play-target').value !== 'composition';
  $('#record-source-label').textContent = 'Track';
  $('#record-return').hidden = !busy;
  $('#record-audio-return').hidden = !busy || !phrase || !recordAudioEnabled;
  $('#record-clear-note').hidden = !phrase || busy;
  for (const id of ['record-track', 'record-mode', 'record-latency', 'audio-device', 'audio-channel', 'audio-connect', 'audio-sheet-connect', 'audio-disconnect', 'audio-track', 'new-tab']) $('#' + id).disabled = busy;
  document.querySelectorAll<HTMLButtonElement>('[data-play-target]').forEach(button => { button.disabled = busy; });
  $('#composition-content').classList.toggle('capturing-audio', running && target?.context === 'composition');
}

const takeView = document.createElement('section'); takeView.id = 'recorded-take-view'; takeView.hidden = true;
takeView.innerHTML = '<h2 id="take-title"></h2><p id="take-info"></p><button id="take-play">Play recording</button><button id="take-stop">Stop preview</button><button id="take-rename">Rename recording</button><button id="take-code" aria-expanded="false">Show code</button>';
$('#editor').before(takeView);
const takeCodeOpen = new Set<string>();
let previewSource: AudioBufferSourceNode | undefined, previewEffects: ReturnType<typeof createInputEffects> | undefined, previewEpochAudio = 0;
const updatePreviewEffects = (change: string | Partial<AudioEffects>) => previewEffects?.apply(change);
function stopTakePreview() {
  previewEpochAudio++; try { previewSource?.stop(); } catch { /* ended */ }
  previewSource?.disconnect(); previewEffects?.disconnect(); previewSource = undefined; previewEffects = undefined;
  liveInput.effectListeners.delete(updatePreviewEffects);
}
async function previewPendingTake() {
  engine.stop(); stopTakePreview(); performancePanel.stop();
  const epoch = previewEpochAudio;
  const [audio] = await timelineRecording!.encode();
  await engine.unlock();
  const context = engine.audioContext;
  const buffer = await context.decodeAudioData(await audio.blob.arrayBuffer());
  if (epoch !== previewEpochAudio) return;
  previewEffects = createInputEffects(context, audio.asset.recording?.mode === 'dry' ? audio.asset.recording.effectsCode ?? 'AUDIO' : 'AUDIO');
  previewSource = context.createBufferSource(); previewSource.buffer = buffer;
  previewSource.connect(previewEffects.input); previewEffects.output.connect(engine.masterInput);
  if (performancePanel.take?.notes.length) await performancePanel.preview(false);
  if (epoch !== previewEpochAudio) return;
  const source = previewSource;
  source.onended = () => { setTimeout(() => { if (previewSource === source) stopTakePreview(); }, 3000); };
  source.start();
}
async function previewRecordedAudio(id: string, testEffects = false) {
  if (timelineRecording?.pending) throw new Error('Finish recording before previewing another take.');
  engine.stop(); stopTakePreview(); const epoch = previewEpochAudio;
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
  const id = tab?.audioAssetId ?? project.clips.find(c => c.tabId === tab?.id && c.takeId && c.playback !== 'once')?.takeId;
  const visible = !audioOpen && !instrumentOpen && !!tab && openTabs.has(tab.id) && !!id;
  takeView.hidden = !visible;
  if (!visible || !tab) return;
  $('#take-title').textContent = tab.name;
  const asset = assets.find(a => a.id === id);
  $('#take-info').textContent = `${(asset?.duration ?? 0).toFixed(1)} seconds · ${asset?.recording?.mode === 'wet' ? 'Recorded with vocal effects' : 'Editable input effects'}${asset?.recording?.incomplete ? ' · Interrupted recording' : ''}`;
  $('#editor').hidden = !takeCodeOpen.has(tab.id);
  $('#take-code').textContent = takeCodeOpen.has(tab.id) ? 'Hide code' : 'Show code'; $('#take-code').setAttribute('aria-expanded', String(takeCodeOpen.has(tab.id)));
  $('#take-play').onclick = guard(() => { $('#play-target').value = 'tab'; return startPlayback(); });
}
$('#take-stop').onclick = stopPlayback;
$('#take-rename').onclick = guard(async () => { await renameTab(project.activeTabId); renderTakeView(); });
$('#take-code').onclick = () => { const id = project.activeTabId; if (takeCodeOpen.has(id)) takeCodeOpen.delete(id); else takeCodeOpen.add(id); renderTakeView(); editor.view.requestMeasure(); };
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
  $('#midi-learning').hidden = true; $('#cancel-learn').hidden = true; $('#drawer-learning').hidden = true;
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
const performancePanel = new PerformancePanel(() => editor, () => project.tabs.find(t => t.id === project.activeTabId)!, message => notice(message, true), engine, () => selectedProjectName || project.name, () => persistSession(), commitPatternTake);
$('#record-bar').append(performancePanel.root);
$('#midi-quantization').onchange = guard(() => { performancePanel.setQuantization(Number($('#midi-quantization').value)); renderRecording(); });
$('#midi-normalize-velocity').onchange = guard(() => { performancePanel.setNormalizeVelocity($('#midi-normalize-velocity').checked); renderRecording(); });
const recordingPanel = new RecordingPanel(engine, async asset => { project.assetIds = [...new Set([...project.assetIds, asset.id])]; assets = [asset, ...assets.filter(a => a.id !== asset.id)]; await engine.registerAssets(assets); selectedAsset = asset.id; selectedSound = soundKey(asset); renderAssets(); dirty(); }, message => notice(message, true), () => selectedProjectName || project.name, async asset => {
  const recording = asset.recording!, destination = recordingPanel.destination;
  if (!destination) throw new Error('Choose a recording destination before placing the retained audio.');
  const next = snapshot(), trackId = destination.trackId;
  const clip = { id: destination.clipId, tabId: destination.tabId, trackId, takeId: asset.id, ...recordedTakePlacement(recording, asset.duration ?? 0, project.bpm), muted: false };
  if (!next.tracks.some(t => t.id === trackId) || !canPlace(next.clips, clip)) throw new Error('Audio retained in the library. The chosen track has no room; keep the take and free this destination before retrying.');
  if (next.tabs.length >= 50) throw new Error('Audio retained. Free a pattern before placing it.');
  next.tabs.push({ id: destination.tabId, name: asset.label || 'Audio take', audioAssetId: asset.id, code: `// Captured audio · natural speed and pitch.\ns("studio_${asset.id.replaceAll('-', '')}").gain(1)`, color: 'teal', anchors: [] });
  next.clips.push(clip);
  if (next.audioInput) next.audioInput.enabled = false;
  project = await commitCaptureProject(next); openTabs.add(destination.tabId); renderComposition(); renderTabs(); cacheDraft();

});
timelineRecording = new TimelineRecording(engine, liveInput, snapshot, ensureAudioInput, async (identity, audio, metaKey) => {
  clearTimeout(saveTimer); await saveChain.catch(() => {});
  const target = identity.target, owner = target ? getEditor(target.tabId) : undefined;
  await performancePanel.flushRecovery(); await performancePanel.prepareProposal(); await flushMidiSliders();
  const state = snapshot();
  let midiCode = '';
  if (target?.kind === 'new') {
    performancePanel.alignSharedDuration(audio[0].asset.duration ?? 0); await performancePanel.prepareProposal();
    identity.midiCode = performancePanel.proposal;
  } else if (target) {
    const tab = validateRecordingTarget(state, target);
    if (performancePanel.take?.notes.length) {
      const destination = owner?.destination;
      if (performancePanel.owner !== owner || !destination?.valid) throw new Error('MIDI destination changed. Both takes are retained.');
      performancePanel.alignSharedDuration(audio[0].asset.duration ?? 0); await performancePanel.prepareProposal();
      midiCode = performancePanel.proposal;
      tab.code = (destination.append ? retainPatternOutput(owner!.code.slice(0, destination.from)) : owner!.code.slice(0, destination.from)) + midiCode + owner!.code.slice(destination.to);
      const changes = ChangeSet.of({ from: destination.from, to: destination.to, insert: midiCode }, owner!.code.length);
      tab.anchors = owner!.anchors.map(a => ({ ...a, from: changes.mapPos(a.from, 1) }));
    }
    owner!.lockEditing(true);
  }
  const operation = commitRecordedTake(state, identity, audio, metaKey, acceptedProject ?? state).then(async result => {
    const next = result.project; acceptedProject = structuredClone(next);
    if (result.kind === 'copied') notice('Another tab changed this session. Your recording was saved in a conflict copy; both versions are kept.');
    project = next; $('#project-name').value = next.name; selectedProjectName = next.sessionId!;
    assets = await workspace.assets(); await engine.registerAssets(assets);
    if (target && owner) {
      owner.publishRecording(next.tabs.find(t => t.id === target.tabId)!); if (target.kind === 'new') openTabs.add(target.tabId); proposedRecordingTarget = undefined;
      await performancePanel.completeShared(); activeRecordingTarget = undefined;
    } else { openTabs.add(identity.tabId); switchTab(identity.tabId); selectedTrack = identity.trackId; }
    renderAll(); saveWorkspace(); cacheDraft(); await refreshProjects();
  });
  saveChain = operation; try { await operation; } finally { owner?.lockEditing(false); }
}, () => { if (timelineRecording && ['review', 'failed'].includes(timelineRecording.state) && timelineRecording.elapsed > 0 && performancePanel.take?.notes.length) performancePanel.alignSharedDuration(timelineRecording.elapsed); renderRecording(); renderComposition(); renderAudioInput(); });
performancePanel.pendingAudio = () => recordingPanel.pending || !!timelineRecording?.pending;
performancePanel.sharedKeep = async () => {
  if (timelineRecording?.pending) { await timelineRecording.retry(); return; }
  const target = activeRecordingTarget ?? performancePanel.sharedTarget;
  if (target) validateRecordingTarget(snapshot(), target);
  await performancePanel.flushRecovery(); await performancePanel.prepareProposal(); await flushMidiSliders();
  if (target?.kind === 'new') {
    project = await commitCaptureProject(placeNewPattern(snapshot(), target, performancePanel.proposal, performancePanel.duration));
    performancePanel.owner!.publishRecording(project.tabs.find(t => t.id === target.tabId)!); openTabs.add(target.tabId); proposedRecordingTarget = undefined; saveWorkspace();
  } else await commitPatternTake(performancePanel.owner!, performancePanel.proposal);
  await performancePanel.completeShared(); activeRecordingTarget = undefined; renderTabs(); renderComposition(); renderTransport();
};
performancePanel.onfailure = message => { notice(message, true); void stopSharedRecording().catch(e => notice(e.message, true)); };
performancePanel.sharedDiscard = async () => { performancePanel.stop(); await performancePanel.flushRecovery(); clearPendingPattern(); await performancePanel.completeShared(); activeRecordingTarget = undefined; renderTransport(); };
$('#record-return').onclick = () => { const target = timelineRecording?.identity?.target ?? activeRecordingTarget; if (target?.kind === 'new' && !project.tabs.some(t => t.id === target.tabId)) { document.querySelector<HTMLButtonElement>(`[data-pending-tab="${target.tabId}"]`)?.click(); } else if (target) { switchTab(target.tabId); getEditor(target.tabId).revealRecording(!!performancePanel.owner?.destination?.append || !recordMidiEnabled); } };
$('#record-audio-return').onclick = () => { const target = timelineRecording?.identity?.target ?? activeRecordingTarget; if (target?.kind === 'new' && !project.tabs.some(t => t.id === target.tabId)) { document.querySelector<HTMLButtonElement>(`[data-pending-tab="${target.tabId}"]`)?.click(); } else if (target) { switchTab(target.tabId); getEditor(target.tabId).revealRecording(true); } };
$('#record-clear-note').onclick = () => { performancePanel.close(); renderRecording(); };
$('#record-bar').append(recordingPanel.root);
async function retainImportedSample(asset: Asset) { if (!project.assetIds.includes(asset.id)) project.assetIds.push(asset.id); assets = [asset, ...assets.filter(a => a.id !== asset.id)]; await engine.registerAssets(assets); selectedAsset = asset.id; selectedSound = soundKey(asset); renderAssets(); dirty(); }
const sampleImports = new SampleImports(retainImportedSample, message => notice(message, true), () => selectedProjectName || project.name, () => persistSession());
const sampleEditor = new SampleEditor(retainImportedSample, async asset => { libraryTarget = undefined; await useSound(soundKey(asset), asset); location.hash = '/'; routePage(); editor.view.focus(); }, () => project.bpm);
document.body.append(sampleEditor.root);
regionEditor = new SampleEditor(async asset => { assets=[asset,...assets.filter(a=>a.id!==asset.id)];await engine.registerAssets(assets); },async()=>{},()=>project.bpm);
regionEditor.root.id='chop-region-editor';regionEditor.root.classList.add('embedded-sample-editor');
$('#chop-region').append(regionEditor.root);
const advanced=document.createElement('details');advanced.className='chop-advanced';advanced.innerHTML='<summary>Beat grid and click track</summary>';
for(const field of regionEditor.root.querySelectorAll('fieldset'))advanced.append(field);
regionEditor.root.querySelector('.sample-editor-save')!.before(advanced);
function renderChopSounds(){
  const root=$('#chop-sounds');if(!editor || audioOpen || instrumentOpen){root.hidden=true;return;}
  const bindings=soundBindings(editor.code);root.hidden=!bindings.length;
  root.innerHTML=bindings.map(b=>`<button class="bare" data-chop="${escape(b.id)}" title="Choose sound for ${escape(b.label)}"><strong>${escape(b.label)}</strong><span>${escape(assets.find(a=>soundKey(a)===b.sound)?.label ?? b.sound)}</span></button>`).join('');
}
function openChop(binding:SoundBinding){
  if(captureActive())throw new Error('Finish recording before auditioning a replacement.');
  libraryTarget={owner:editor,code:editor.code,from:binding.from,to:binding.to,binding,tabId:project.activeTabId};selectedSound=binding.sound;selectedAsset=assets.find(a=>soundKey(a)===binding.sound)?.id;
  $('#sound-search').value='';$('#library-source').value='all';setSounds(true);
}
$('#chop-sounds').onclick=event=>void guard(()=>{const id=(event.target as HTMLElement).closest<HTMLElement>('[data-chop]')?.dataset.chop;const binding=soundBindings(editor.code).find(b=>b.id===id);if(binding)openChop(binding);})();
async function loadChopRegion(){
  const epoch=++regionEpoch;regionEditor!.reset();$('#chop-status').textContent='';$('#chop-use').textContent=`Use for ${libraryTarget?.binding?.label ?? 'sound'}`;
  const asset=assets.find(a=>a.id===selectedAsset);regionEditor!.root.hidden=!asset;
  $('#chop-use').disabled=true;
  if(asset){if(asset.missing){$('#chop-status').textContent='This sample is missing. Recover it before use.';return;}try { const blob=await workspace.audioBlob(asset.id);if(epoch!==regionEpoch)return;await regionEditor!.open(blob,asset.label||asset.source?.name||'Sample',asset); } catch(error) { if(epoch===regionEpoch)$('#chop-status').textContent=(error as Error).message;return; }}
  if(epoch!==regionEpoch)return;
  try{validateChopTarget();$('#chop-use').disabled=!!asset&&!regionEditor!.ready;}catch(error){$('#chop-status').textContent=(error as Error).message;}
}
function validateChopTarget(){const t=libraryTarget;if(!t?.binding || !t.tabId || !editorsHas(t.owner) || t.owner.code!==t.code)throw new Error('The destination changed. Close the catalogue and select the chop again.');engine.validateSoundReplacement(t.tabId,t.binding.id,t.binding.sound);return t;}
$('#chop-cancel').onclick=()=>setSounds(false);
$('#chop-use').onclick=guard(async()=>{
  if(replacingSound)return;replacingSound=true;$('#chop-use').disabled=true;
  try{
    const target=validateChopTarget();let asset=assets.find(a=>a.id===selectedAsset),name=selectedSound!;
    if(asset){if(!regionEditor?.ready)throw new Error('Wait for the waveform to load.');if(!regionEditor.wholeSource)asset=await regionEditor.commitSelection();name=soundKey(asset);}
    validateChopTarget();if(libraryTarget!==target)throw new Error('The destination changed. Select the chop again.');
    if(asset)await engine.preload(asset);
    validateChopTarget();if(!asset && project.clips.some(c=>c.tabId===target.tabId&&c.playback==='once'))throw new Error('Choose a saved sample for a one-shot audio clip.');const change=replaceBinding(target.owner.code,target.binding!.id,target.binding!.sound,name);
    await engine.replaceSound(target.tabId!,target.binding!.id,target.binding!.sound,name);
    target.owner.view.dispatch({changes:change,userEvent:'input.sample',annotations:isolateHistory.of('full')});
    if(asset){for(const clip of project.clips)if(clip.tabId===target.tabId&&clip.playback==='once'){clip.takeId=asset.id;if(clip.anchors){delete clip.anchors;notice('Replaced the sample; its previous alignment was removed. Right-click the clip to align it again.');}}if(!project.assetIds.includes(asset.id))project.assetIds.push(asset.id);}
    engine.syncSoundRevision(target.tabId!);dirty();renderChopSounds();replacingSound=false;setSounds(false);target.owner.view.focus();notice(engine.started?'Sound queued for the next cycle.':'Sound replaced.');
  }catch(error){$('#chop-status').textContent=(error as Error).message;throw error;}finally{replacingSound=false;$('#chop-use').disabled=false;}
});

async function editLibrarySample(id: string) { location.hash = '/samples/edit'; routePage(); await sampleEditor.openAsset(assetById(id)); }
const importPage = document.createElement('section'); importPage.id = 'sample-import-page'; importPage.hidden = true;
importPage.innerHTML = `<header><a href="#/">← Back to Studio</a><span>YOUR SOUND LIBRARY</span></header><h1>Bring your own sounds.</h1><p>Import from a public GitHub repository, or choose files from your device. Selected sounds stay in this browser.</p><p><a href="#/samples/edit">WAV editor → Select a region and save a sample</a></p><div class="import-columns"><div id="github-import-column"></div><div id="file-import-column"></div></div><section class="browser-storage"><h2>Saved on this device</h2><p id="storage-usage" role="status"></p><p>Browser data can be cleared. Download project backups to keep your music or move it to another device.</p><button id="persist-storage">Keep browser storage</button><button id="import-backup">Download current project backup</button></section>`;
document.body.append(importPage);
$('#file-import-column').append(sampleImports.root);
$('#github-import-column').append(new GitHubImports(sampleImports, message => notice(message, true)).root);
$('#sound-import').insertAdjacentHTML('afterbegin', '<a class="import-page-link" href="#/samples/import">Import samples from GitHub or files ↗</a>');
async function updateStorageUsage() {
  const estimate = await navigator.storage?.estimate();
  $('#storage-usage').textContent = estimate ? `${((estimate.usage ?? 0) / 1e6).toFixed(1)} MB used · ${((estimate.quota ?? 0) / 1e6).toFixed(0)} MB available quota` : 'Storage usage is unavailable in this browser.';
}
let focusGitHubImport = false;
function routePage() {
  const importing = location.hash === '#/samples/import', editing = location.hash === '#/samples/edit';
  if (importing || editing) { setSounds(false); sheets.close(false); }
  importPage.hidden = !importing; app.hidden = importing || editing; sampleEditor.show(editing);
  if (importing) { void updateStorageUsage().catch(() => {}); importPage.querySelector('h1')!.setAttribute('tabindex', '-1'); if (focusGitHubImport) document.querySelector<HTMLElement>('#github-import-column input')?.focus(); else importPage.querySelector('h1')!.focus(); focusGitHubImport = false; }
}
window.addEventListener('hashchange', routePage);
$('#persist-storage').onclick = guard(async () => { const kept = await navigator.storage?.persist?.(); notice(kept ? 'Persistent storage granted. Keep project backups too.' : 'The browser did not grant persistent storage. Project backups are still available.'); await updateStorageUsage(); });
$('#import-backup').onclick = guard(downloadBackup);
const recordButton = document.createElement('button'); recordButton.textContent = 'Record audio';
recordButton.onclick = () => { recordSource = 'external'; setSounds(false); openRecordBar('audio'); }; $('#sound-import').prepend(recordButton);
const recordSelected = document.createElement('button'); recordSelected.textContent = 'Record highlighted sound';
recordSelected.onclick = guard(() => { if (timelineRecording?.pending || recordingPanel.pending || performancePanel.take?.notes.length) throw new Error('Finish the current recording first.'); performancePanel.stop(); recordSource = 'phrase'; setSounds(false); openRecordBar('audio'); });
$('#sound-import').append(recordSelected);
let selectedMidiClip: string | undefined;
const midiComposition = new MidiComposition(engine, () => snapshot(), async next => {
  const saved = await commitCaptureProject(next);
  for (const tab of saved.tabs) if (!project.tabs.some(t => t.id === tab.id)) openTabs.add(tab.id);
  project = saved; renderTabs(); renderComposition(); renderTransport(); cacheDraft();
}, () => selectedProjectName || project.name, message => notice(message, true));
$('#record-bar').append(midiComposition.root);
// The existing ruler remains the composition range control.
// Legacy clip takes remain reviewable in the shared bar; new phrase captures use PerformancePanel.
midiComposition.root.dataset.legacyReview = 'true';

async function commitCaptureProject(next: Project) {
  clearTimeout(saveTimer); await saveChain.catch(() => {});
  const task = saveSession(normalizeProjectTempo(next), acceptedProject);
  saveChain = task.then(() => {});
  const result = await task;
  acceptedProject = structuredClone(result.project);
  selectedProjectName = result.project.sessionId!;
  if (result.kind === 'copied') notice('Take saved in a conflict copy; both sessions are retained.');
  return result.project;
}
async function commitPatternTake(owner: StudioEditor, code: string) {
  const destination = owner.destination;
  if (!destination?.valid || owner.code.slice(destination.from, destination.to) !== destination.original) throw new Error('The destination changed. Retarget the retained take before accepting.');
  const next = snapshot(), tab = next.tabs.find(t => t.id === destination.tabId)!;
  const changes = ChangeSet.of({ from: destination.from, to: destination.to, insert: code }, owner.code.length);
  tab.code = (destination.append ? retainPatternOutput(owner.code.slice(0, destination.from)) : owner.code.slice(0, destination.from)) + code + owner.code.slice(destination.to);
  tab.anchors = owner.anchors.map(a => ({ ...a, from: changes.mapPos(a.from, 1) }));
  owner.lockEditing(true);
  try { const saved = await commitCaptureProject(next); owner.acceptTake(code); const savedCode = saved.tabs.find(t => t.id === destination.tabId)!.code; if (owner.code !== savedCode) owner.publishRecording(saved.tabs.find(t => t.id === destination.tabId)!); project = saved; renderTabs(); renderComposition(); cacheDraft(); }
  finally { owner.lockEditing(false); }
}
async function armPatternMidi(accompaniment: 'pattern' | 'solo') {
  if (midiComposition.pending || midiComposition.running || performancePanel.take?.notes.length || timelineRecording?.pending) throw new Error('Keep or discard the current take first.');
  midiComposition.close();
  performancePanel.arm(); performancePanel.accompaniment = accompaniment;
  recordMidiEnabled = true; openRecordBar('midi'); renderTransport();
}
async function testMidi() {
  if (midiComposition.running || midiComposition.pending) throw new Error('Resolve the current take before testing another phrase.');
  midiComposition.close(); performancePanel.arm(false); await performancePanel.prepare();
  notice('Test MIDI · connected inputs and on-screen keys · no take is being recorded.');
}
function expressionActions(pos: number, x: number, y: number) {
  const slider = editor.sliders.find(s => pos >= s.start && pos <= s.start + 6);
  if (slider) {
    const owner = editor, tabId = activeEditorId();
    const bindings = project.bindings.filter(b => b.target.kind === 'slider' && b.target.tabId === tabId && b.target.sliderId === slider.id);
    contextMenu.open([
      ...bindings.map(b => ({ label: `${project.profiles.find(p => p.id === b.profileId)?.name ?? 'MIDI'} · CH ${b.channel} · ${b.kind.toUpperCase()} ${b.number}`, disabled: 'Current assignment', run: () => {} })),
      { label: 'Bind MIDI control', run: () => { owner.select(slider.id); beginLearn({ kind: 'slider', tabId, sliderId: slider.id }); } },
      { label: 'Unbind MIDI control', disabled: bindings.length ? undefined : 'No control assigned', run: () => { project.bindings = project.bindings.filter(b => !bindings.includes(b)); pickup.reset(); renderBindings(); dirty(); } },
    ], x, y, () => owner.view.contentDOM); return true;
  }
  if (instrumentOpen || audioOpen) return false;
  const binding = bindingAt(editor.code,pos);
  if(binding){void guard(()=>openChop(binding))();return true;}
  const token = soundToken(editor.code, pos);
  if (token) {
    libraryTarget = { owner: editor, code: editor.code, from: token.from, to: token.to }; selectedSound = editor.code.slice(token.from, token.to); selectedAsset = assets.find(a => soundKey(a) === selectedSound)?.id; $('#sound-search').value = ''; $('#library-source').value = 'all'; setSounds(true); return true;
  }
  try {
    const d = destinationFor(editor.code, project.activeTabId, pos, pos);
    if (!/^note\s*\(/.test(d.original)) return false;
    const assigned = editor.destination?.valid && editor.destination.from === d.from;
    editor.view.dispatch({ selection: { anchor: pos } });
    contextMenu.open([
      { label: 'Test MIDI', run: guard(testMidi) },
      { label: 'Record MIDI on pattern', run: guard(() => armPatternMidi('pattern')) },
      { label: 'Record MIDI solo', run: guard(() => armPatternMidi('solo')) },
      { label: assigned ? 'Source: connected MIDI inputs and on-screen keys' : 'Source: unassigned', disabled: 'MIDI notes only', run: () => {} },
      { label: 'Unbind MIDI notes', disabled: assigned ? undefined : 'No phrase assigned', run: guard(() => { midiComposition.close(); performancePanel.close(); editor.disarm(); }) },
    ], x, y, () => editor.view.contentDOM); return true;
  } catch { return false; }
}
$('#editor').addEventListener('click', event => {
  if (!(event.target as HTMLElement).closest('.cm-content') || !editor.view.state.selection.main.empty) return;
  const pos = editor.view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos !== null && ((event.target as HTMLElement).closest('[data-input-function]') || bindingAt(editor.code,pos) || soundToken(editor.code, pos))) expressionActions(pos, event.clientX, event.clientY + 12);
});
$('#editor').addEventListener('keydown', event => {
  const target = event.target as HTMLElement;
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10') && !(target.matches('[data-input-function], [data-chop-reference]') && ['Enter', ' '].includes(event.key))) return;
  const rect = target.getBoundingClientRect();
  const pos = target.matches('[data-input-function], [data-chop-reference]') ? editor.view.posAtDOM(target) : editor.view.state.selection.main.head;
  if (expressionActions(pos, rect.left, rect.bottom)) { event.preventDefault(); event.stopPropagation(); }
});
$('#tracks').addEventListener('pointerdown', event => { const id = (event.target as HTMLElement).closest<HTMLElement>('[data-clip]')?.dataset.clip; if (id) selectedMidiClip = id; });
let saveChain = Promise.resolve();
let lastSaveError = '';
let saveRevision = 0;
function snapshot(): Project {
  const applied = engine.appliedState();
  return normalizeProjectTempo({ ...project, appliedPatterns: { ...project.appliedPatterns, ...applied.codes }, appliedPatternAnchors: { ...project.appliedPatternAnchors, ...applied.anchors }, sessionId: selectedProjectName || undefined, tabs: project.tabs.map(tab => { const e = editors.get(tab.id); return e ? { ...tab, code: e.code, anchors: e.anchors } : tab; }), name: $('#project-name').value.trim() || 'Untitled project' });
}
let acceptedProject: Project | undefined;
const sessionDrafts = new SessionDrafts();
function cacheDraft() {
  if (!booted) return;
  try { sessionDrafts.cache(snapshot(), acceptedProject); } catch { /* Saving and backups remain available if draft storage is full. */ }
}
function persistSession() {
  clearTimeout(saveTimer);
  // Read the latest editor state when this queued operation starts, not before an older save finishes.
  const task = saveChain.catch(() => {}).then(async () => {
    const revision = saveRevision, state = snapshot(), base = acceptedProject ? structuredClone(acceptedProject) : undefined;
    const result = await saveSession(state, base), saved = result.project;
    const editedDuringSave = revision !== saveRevision;
    if (result.kind === 'refreshed' && editedDuringSave) {
      // Keep the old base: the next save must preserve these new edits as a copy.
      cacheDraft(); return;
    }
    acceptedProject = structuredClone(saved);
    if (result.kind === 'refreshed') {
      if (timelineRecording?.pending || recordingPanel.pending || midiComposition.pending || midiComposition.running || performancePanel.take?.notes.length) {
        acceptedProject = base; cacheDraft(); return;
      }
      if (!await loadProject(saved, false, revision)) { acceptedProject = base; cacheDraft(); return; }
      notice('Loaded the newer saved session from another tab.');
    } else {
      selectedProjectName = saved.sessionId!; project.sessionId = saved.sessionId; project.revision = saved.revision;
      if (result.kind === 'copied') {
        if ($('#project-name').value.trim() === state.name) { project.name = saved.name; $('#project-name').value = saved.name; }
        notice('Another tab changed this session. Saved your edits as a conflict copy; both versions are kept.');
      }
    }
    sessionStorage.setItem('studio.session', saved.sessionId!);
    saveWorkspace(); cacheDraft(); await refreshProjects();
    $('#saved-projects').value = selectedProjectName;
    if (!editedDuringSave) { $('#saved-state').textContent = result.kind === 'copied' ? 'Saved as conflict copy' : 'Saved in this browser'; $('#saved-state').title = ''; lastSaveError = ''; }
  }).catch(error => {
    cacheDraft();
    const message = error instanceof Error ? error.message : 'Request failed';
    $('#saved-state').textContent = 'Not saved · press Save to retry'; $('#saved-state').title = message;
    if (message !== lastSaveError) { lastSaveError = message; notice(`Couldn't save the session: ${message}`, true); }
    throw error;
  });
  saveChain = task; return task;
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
  if (timelineRecording?.pending || performancePanel.take?.state === 'capturing' || performancePanel.take?.notes.length || midiComposition.running || midiComposition.pending) throw new Error('Resolve the recording before switching sessions.');
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
  $('#composition-loop').hidden = $('#play-target').value !== 'composition';
  $('#composition-loop').setAttribute('aria-pressed', String(engine.transport.loop));
  $('#composition-loop').disabled = engine.started || captureActive();
  paintMidiAssignment();
  const countdown = engine.countIn.remaining;
  $('#count-in').setAttribute('aria-pressed', String(engine.countIn.enabled));
  const metronomeLabel = engine.countIn.mode === 'off' ? 'Off' : engine.countIn.mode === 'count-in' ? 'Count-in only' : 'Continuous metronome';
  $('#count-in').title = `${metronomeLabel} · click to cycle Off → Count-in only → Continuous`;
  $('#count-in').dataset.mode = engine.countIn.mode;
  $('#count-in').setAttribute('aria-description', metronomeLabel);
  $('#count-in').disabled = !!countdown || engine.busy;
  $('#metronome-loop').hidden = engine.countIn.mode !== 'continuous';
  engine.countIn.sync(engine.started || performancePanel.take?.state === 'capturing' || timelineRecording?.state === 'recording' || recordingPanel.captureView?.state === 'recording', project.bpm, engine.started ? () => engine.metronomeClock : undefined);
  $('#count-in-beat').textContent = countdown ? String(countdown) : '';
  const playing = engine.started, target = $('#play-target').value === 'composition' ? 'composition' : 'tab';
  document.querySelectorAll<HTMLButtonElement>('[data-play-target]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.playTarget === target)); button.disabled = playing || (engine.busy || !!countdown) || performancePanel.take?.state === 'capturing' || midiComposition.running || midiComposition.pending; });
  $('#play').hidden = $('#stop').hidden = target !== 'tab';
  $('#composition-play').hidden = $('#composition-stop').hidden = target !== 'composition';
  $('#composition-play').disabled = playing || (engine.busy || !!countdown) || !project.clips.length;
  $('#composition-play').textContent = countdown ? String(countdown) : (engine.busy || !!countdown) ? 'Preparing…' : 'Play';
  $('#composition-position').textContent = `Beat ${beatPosition(engine.timelinePosition)}`;
  const name = engine.target === 'composition' ? 'Composition' : project.tabs.find(t => t.id === engine.target)?.name ?? '';
  $('#transport-state').textContent = countdown ? `Count-in · ${countdown}` : playing ? `${name} · beat ${beatPosition(Math.max(0, engine.cycle))}${engine.pendingCycle !== undefined ? ' · changes queued' : ''}` : `Stopped · ${project.bpm} BPM`;
  $('#transport-state').classList.toggle('playing', playing);
  $('#play').disabled = audioOpen || instrumentOpen || !openTabs.has(project.activeTabId) || playing || (engine.busy || !!countdown);
  $('#play').textContent = countdown ? String(countdown) : (engine.busy || !!countdown) ? 'Preparing…' : 'Play';
  $('#play-target').disabled = playing || (engine.busy || !!countdown);
  $('#evaluate').hidden = audioOpen || instrumentOpen || !engine.hasChanges;
  $('#evaluate').disabled = (engine.busy || !!countdown) || !!timelineRecording?.pending;
  const input = project.audioInput;
  $('#audio-apply').hidden = !audioOpen || !input || input.code === input.appliedCode;
  $('#apply-pill').hidden = $('#evaluate').hidden && $('#audio-apply').hidden;
  const range = midiComposition.loopRange, loop = engine.transport.loop;
  $('#loop-readout').textContent = loop ? `Looping beats ${beatPosition(range.begin)}–${beatPosition(range.end)} · ${beatDuration(range.end - range.begin)} beats` : 'Drag the ruler to loop a range';
  $('#loop-readout').classList.toggle('active', loop); $('#sequencer').classList.toggle('looping', loop);
  $('#clear-loop').hidden = !loop;
  $('#clear-loop').disabled = playing || midiComposition.running || midiComposition.pending;
  $('#bpm').disabled = playing || (engine.busy || !!countdown) || recordingPanel.pending || performancePanel.captureView?.state === 'preparing' || performancePanel.take?.state === 'capturing' || !!performancePanel.take?.notes.length || midiComposition.pending;
  $('#add-track').disabled = playing || (engine.busy || !!countdown) || project.tracks.length >= 16;
  $('#arrangement-status').hidden = engine.pendingMuteCycle === undefined;
  renderInputAlert(); renderRecording();
  $('#arrangement-status').textContent = engine.pendingMuteCycle !== undefined ? `Mix change at cycle ${engine.pendingMuteCycle}` : playing ? 'Stop playback to edit clips' : 'Edit while stopped · 4 beats per cycle';
}
/** Input tabs explain what is missing before offering their controls: a banner while disconnected, the input bar once live. */
function renderInputAlert() {
  const live = liveInput.active, requesting = liveInput.pending, midiReady = bridge.ready && bridge.connected.length > 0;
  const audioAlert = audioOpen && !live;
  $('#input-alert').hidden = !audioAlert;
  $('#audio-connect').hidden = !audioAlert || requesting; $('#audio-cancel').hidden = !audioAlert || !requesting;
  $('#midi-editor-connection').hidden = !!learning || !instrumentOpen && !(performancePanel.auditioning && (!recordBarOpen || !recordMidiEnabled) && !audioOpen);
  $('#input-alert-text').textContent = requesting ? 'Waiting for microphone permission…' : 'No audio input connected. Choose a device and grant microphone permission to monitor or record.';
  $('#input-alert-settings').textContent = 'Settings';
  $('#audio-toolbar').hidden = !audioOpen || !live;
  $('#monitor-warning').hidden = !liveInput.monitoring;
  const tabs = $('#input-tabs');
  tabs.dataset.audio = !live ? 'off' : timelineRecording?.state === 'recording' ? 'recording' : 'live';
  tabs.dataset.midi = !bridge.ready ? 'off' : midiReady ? 'ready' : 'idle';
}
function renderSliders() { if (!editor.sliders.some(s => s.id === selectedSlider)) selectedSlider = undefined; }
function renderBindings() {
  for (const [id, owner] of editors) owner.setInputLabels(new Map(project.bindings.flatMap(b => b.target.kind === 'slider' && b.target.tabId === id ? [[b.target.sliderId, `${b.kind.toUpperCase()} ${b.number} · channel ${b.channel}`] as [string, string]] : [])));
  $('#mapping-count').textContent = String(project.bindings.length);
  $('#bindings').innerHTML = project.bindings.length ? project.bindings.map((b) => {
    const missing = b.target.kind === 'slider' && !getEditor(b.target.tabId).sliders.some((s) => s.id === (b.target as { sliderId: string }).sliderId);
    return `<div data-binding="${escape(b.id)}" class="binding ${missing ? 'missing' : ''}"><div><strong>${escape(targetLabel(b.target))}</strong><span>${escape(project.profiles.find((p) => p.id === b.profileId)?.name ?? 'Missing device')} · CH ${b.channel} · ${b.kind.toUpperCase()} ${b.number}${b.pickup ? ' · pickup' : ''}${b.target.kind === 'slider' ? ' · ' + escape(effectBehavior(getEditor(b.target.tabId).sliders.find(s => s.id === (b.target as { sliderId: string }).sliderId)?.label ?? '')) : ''}</span></div><button data-remove-binding="${b.id}" aria-label="Remove binding">×</button></div>`;
  }).join('') : '<p class="empty small">No mappings yet.<br>Click slider() and choose Bind MIDI control to get started.</p>';

}
const midiConnections = new MidiConnections(() => { openSheet('midi'); $('.controller-panel').scrollIntoView({ block: 'nearest' }); document.querySelector<HTMLElement>('#controls .keys button')?.focus(); }, () => { ensureDeviceProfiles(); renderBindings(); dirty(); });
$('#midi-settings-connection').append(midiConnections.mount('MIDI connections'));
$('#midi-learning').append(midiConnections.mount('MIDI control connection'));
$('#midi-editor-connection').append(midiConnections.mount('MIDI instrument connection'));
const libraryMidiConnection = midiConnections.mount('Sound preview MIDI connection', () => $('#library-keys button').focus());
libraryMidiConnection.id = 'library-midi-connection'; libraryMidiConnection.hidden = true; $('.library-test').prepend(libraryMidiConnection);
const recordMidiConnection = midiConnections.mount('Recording MIDI connection');
recordMidiConnection.id = 'record-midi-connection'; $('#record-bar').append(recordMidiConnection);
function renderProfiles() {
  ensureDeviceProfiles(); midiConnections.update(bridge, devicePorts); renderRoute();
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
  if(libraryTarget?.binding){const pack=assets.find(a=>a.id===selectedAsset)?.pack?.id;visibleAssets.sort((a,b)=>Number(b.id===selectedAsset)-Number(a.id===selectedAsset)||Number(!!pack&&b.pack?.id===pack)-Number(!!pack&&a.pack?.id===pack));}
  const builtin = source === 'all' || source === 'builtin' ? engine.soundEntries.filter(e => !assets.some(a => soundKey(a) === e.name) && matches([e.name, e.label])) : [];
  const total = assets.length + engine.soundEntries.filter(e => !assets.some(a => soundKey(a) === e.name)).length, shown = visibleAssets.length + builtin.length;
  $('#asset-count').textContent = shown === total ? `${total} sound${total === 1 ? '' : 's'}` : `${shown} of ${total} sounds`;
  $('#library-destination').textContent = libraryTarget?.binding ? `Choose a sound for ${libraryTarget.binding.label}. Audition with MIDI, then confirm.` : libraryTarget ? `Replace “${libraryTarget.code.slice(libraryTarget.from, libraryTarget.to)}” · preview, then choose Swap` : 'Preview a sound, then insert it into your pattern.';
  const use = libraryTarget ? 'Swap' : 'Insert';
  $('#builtin-sounds').innerHTML = builtin.map(e => `<article class="asset ${selectedSound === e.name ? 'selected' : ''}"><button class="asset-select" data-select-sound="${escape(e.name)}"><span><strong>${escape(e.label)}</strong><small>Built-in · ${escape(e.name)}</small></span></button><button data-use-sound="${escape(e.name)}">${use}</button><button data-preview-sound="${escape(e.name)}" aria-label="Preview ${escape(e.label)}">▶</button><button data-assign-midi="${escape(e.name)}" aria-label="Assign ${escape(e.label)} to MIDI">Assign to MIDI</button><button data-live-sound="${escape(e.name)}" aria-pressed="${libraryMidi && selectedSound === e.name}" aria-label="Live ${escape(e.label)}" title="Play this sound from your MIDI controller or the test keys">Live</button></article>`).join('');
  $('#assets').innerHTML = visibleAssets.map(a => `<article data-asset="${a.id}" class="asset ${selectedSound === soundKey(a) || a.id === selectedAsset ? 'selected' : ''}"><button data-select-asset="${a.id}" class="asset-select"><span><strong>${escape(soundLabel(a))}</strong>${soundRepository(a) ? `<small class="sound-repository">GitHub · ${escape(soundRepository(a))}</small>` : ''}<small>${[escape(a.description || a.prompt), a.tags?.length ? escape(a.tags.join(', ')) : '', a.pack ? escape(a.pack.name) : '', a.missing ? 'Audio missing' : a.precision?.working === 'float32' ? 'Float working audio' : 'Legacy precision; original retained when available'].filter(Boolean).join(' · ')}</small></span></button>${a.missing ? `<button data-recover="${a.id}">Recover sound</button>` : ''}<button data-insert-existing="${a.id}" ${a.missing ? 'disabled' : ''}>${use}</button><button data-preview="${a.id}" aria-label="Preview ${escape(soundLabel(a))}" ${a.missing ? 'disabled' : ''}>▶</button><button data-assign-midi="${escape(soundKey(a))}" aria-label="Assign ${escape(soundLabel(a))} to MIDI" ${a.missing ? 'disabled' : ''}>Assign to MIDI</button><button data-live-sound="${escape(soundKey(a))}" aria-pressed="${libraryMidi && selectedSound === soundKey(a)}" aria-label="Live ${escape(soundLabel(a))}" title="Play this sound from your MIDI controller or the test keys" ${a.missing ? 'disabled' : ''}>Live</button><details class="asset-options"><summary aria-label="Options for ${escape(soundLabel(a))}">•••</summary><div><button data-rename-asset="${a.id}">Rename</button><button data-metadata="${a.id}">Tags and description</button><button data-edit-sample="${a.id}" ${a.missing ? 'disabled' : ''}>Edit sample</button>${a.pack ? `<button data-rename-pack="${a.pack.id}">Rename pack</button>` : ''}</div></details></article>`).join('') || (builtin.length ? '' : '<p class="empty">No matching sounds. Try another search or add sounds.</p>');
  $('#assignment').hidden = !selectedAsset;
  paintLibrarySelection();
  $('#assign-target').innerHTML = project.controls.filter((c) => c.kind === 'pad' || c.kind === 'key').map((c) => `<option value="pad:${c.id}">${escape(c.label)} · Note ${c.number}</option>`).join('') + project.slots.map((s) => `<option value="slot:${s.name}">Sound slot: ${escape(s.name)}</option>`).join('');
}
$('#sound-search').oninput = renderAssets;
$('#library-source').onchange = renderAssets;
$('#builtin-sounds').onclick = e => { const el = (e.target as HTMLElement).closest<HTMLElement>('button'); if (!el) return; if (el.dataset.assignMidi) void guard(() => assignMidiSound(el.dataset.assignMidi!))(); else if (el.dataset.previewSound) void guard(() => previewSound(el.dataset.previewSound!))(); else if (el.dataset.useSound) void guard(() => useSound(el.dataset.useSound!))(); else if (el.dataset.liveSound) void guard(() => toggleLive(el.dataset.liveSound!))(); else if (el.dataset.selectSound) { selectLibrarySound(el.dataset.selectSound); } };
$('#assets').addEventListener('click', e => { const editId = (e.target as HTMLElement).closest<HTMLElement>('[data-edit-sample]')?.dataset.editSample; if (editId) void guard(() => editLibrarySample(editId))(); });
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
  $('#midi-learning').hidden = false; $('#cancel-learn').hidden = false; $('#drawer-learning').hidden = false;
}
function bind(target: Target, profileId: string, channel: number, kind: 'cc' | 'note', number: number) {
  project.bindings = project.bindings.filter((b) => {
    const replaced = b.profileId === profileId && b.channel === channel && b.kind === kind && b.number === number;
    if (replaced) pickup.reset(b.id);
    return !replaced;
  });
  project.bindings.push({ id: crypto.randomUUID(), profileId, channel, kind, number, target, pickup: kind === 'cc' && profileId !== 'virtual', enabled: true });
  if (target.kind === 'midi-preset') { $('#preset-learn-status').textContent = `Mapped ${targetLabel(target)} to channel ${channel}, key ${number}.`; $('#cancel-preset-learn').hidden = true; }
  learning = undefined; $('#midi-learning').hidden = true; $('#cancel-learn').hidden = true; $('#drawer-learning').hidden = true; $('#learn-status').textContent = `Connected ${kind.toUpperCase()} ${number} to ${targetLabel(target)}.`;
  renderBindings(); dirty();
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
let controlJournalFlight: Promise<void> | undefined, controlVersion = 0, savedControlVersion = 0;
function captureActive() { return preparingShared || performancePanel.running || timelineRecording?.state === 'recording'; }
async function flushMidiSliders() {
  const grouped = new Map<StudioEditor, Map<string, number>>();
  for (const update of pendingMidiSliders.values()) {
    const values = grouped.get(update.owner) ?? new Map<string, number>();
    values.set(update.id, update.value); grouped.set(update.owner, values);
  }
  pendingMidiSliders.clear();
  for (const [owner, values] of grouped) owner.setValues(values);
  if (grouped.size) {
    const sessionId = project.sessionId;
    await persistSession(); await controlJournalFlight;
    await writePending(`controller-values:${sessionId}`, []);
  }
}
function queueMidiSlider(owner: StudioEditor, id: string, value: number) {
  owner.values.set(id, value);
  pendingMidiSliders.set(id, { owner, id, value }); controlVersion++;
  if (midiSliderFrame) return;
  midiSliderFrame = requestAnimationFrame(() => {
    midiSliderFrame = 0;
    for (const update of pendingMidiSliders.values()) { engine.liveEffects.update(update.id, update.value); update.owner.displayValue(update.id, update.value); }
    const input = editors.get(AUDIO_EDITOR), values: Record<string, number> = {};
    for (const update of pendingMidiSliders.values()) if (update.owner === input) {
      const label = input.sliders.find(slider => slider.id === update.id)?.label;
      if (label) values[label === 'cutoff' ? 'lpf' : label] = update.value;
    }
    if (Object.keys(values).length) liveInput.update(values);
    if (!captureActive()) void flushMidiSliders().catch(e => notice(e.message, true));
  });
}
async function receive(event: MidiEvent) {
  const midi = parseMidi(event.bytes); if (!midi) return;
  eventRows.unshift(`<div><span>${new Date(event.receivedAt).toLocaleTimeString()}</span><b>${event.route === 'web-midi' ? 'MIDI' : event.route === 'alsa' ? 'ALSA' : 'SIM'}</b><span>CH ${midi.channel} ${midi.kind.toUpperCase()} ${midi.number}</span><strong>${midi.value}</strong></div>`);
  eventRows = eventRows.slice(0, 30); scheduleMidiFeedback();
  if (!event.source.startsWith('studio:') && !devicePorts.includes(event.source)) return;
  ensureDeviceProfiles();
  const profile = project.profiles.find(p => p.port === event.source && (p.enabled || !p.port.startsWith('studio:')));
  if (profile) { midiPulseUntil = performance.now() + 250; midiConnections.activity(midi.kind === 'note' ? `Note ${midi.number}` : `CC ${midi.number} · ${midi.value}`); }
  if (profile && !event.source.startsWith('studio:')) $('#device-activity').textContent = `${event.source} · Channel ${midi.channel} · ${midi.kind === 'note' ? 'Note' : 'CC'} ${midi.number} · ${midi.value}`;
  if (!profile) return;
  if (learning?.kind === 'midi-preset' && midi.on) { bind(learning, profile.id, midi.channel, midi.kind, midi.number); return; }
  const presetBinding = project.bindings.find(b => b.enabled && b.profileId === profile.id && b.channel === midi.channel && b.kind === midi.kind && b.number === midi.number && b.target.kind === 'midi-preset');
  if (presetBinding && presetBinding.target.kind === 'midi-preset') {
    if (midi.on) { await recallMidiPreset(presetBinding.target.presetId); receipt(event, presetBinding, 'preset recalled'); }
    return;
  }
  if (midi.kind === 'note' && libraryMidi && !$('#sounds-panel').hidden) { await libraryNote(`${event.source}:${midi.channel}:${midi.number}`, midi.number, midi.value, midi.on); return; }
  if (midi.kind === 'note' && await performancePanel.note(`${event.source}:${midi.channel}:${midi.number}`, midi.number, midi.value, midi.on, event.timestamp)) return;
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
        const value = scaleCC(midi.value, slider.min, slider.max, slider.step);
        if (!pickup.accept(binding, midi.value / 127, ((getEditor(target.tabId).values.get(slider.id) ?? slider.value) - slider.min) / (slider.max - slider.min), (value - slider.min) / (slider.max - slider.min))) { receipt(event, binding, 'waiting for pickup'); continue; }
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
}

function virtualSend(id: string, value: number, off = false) {
  const control = project.controls.find((c) => c.id === id)!;
  const kind = ['knob', 'fader'].includes(control.kind) ? 0xb0 : off ? 0x80 : 0x90;
  send({ type: 'send', bytes: [kind | (control.channel - 1), control.number, value], simulate: $('#route').value === 'simulation' });
}

$('#play').onclick = guard(() => { $('#play-target').value = 'tab'; return startPlayback(); });
$('#evaluate').onclick = guard(() => engine.apply());
$('#skip-beginning').onclick = guard(async () => {
  if (engine.busy || preparingShared || performancePanel.running || performancePanel.finalizing || ['preparing', 'recording', 'finishing'].includes(timelineRecording?.state ?? '')) return;
  stopTakePreview(); engine.stop(); await engine.seek(0); renderTransport();
});
$('#stop').onclick = stopPlayback;
$('#project-name').oninput = () => dirty();
$('#cancel-learn').onclick = () => { learning = undefined; $('#midi-learning').hidden = true; $('#cancel-learn').hidden = true; $('#drawer-learning').hidden = true; $('#learn-status').textContent = 'Learning cancelled.'; };
$('#drawer-cancel-learn').onclick = () => $('#cancel-learn').click();
$('#route').onchange = renderRoute;
const removeBinding = (e: MouseEvent) => { const id = (e.target as HTMLElement).closest<HTMLElement>('[data-remove-binding]')?.dataset.removeBinding; if (id) { project.bindings = project.bindings.filter((b) => b.id !== id); renderBindings(); dirty(); } };
$('#bindings').onclick = removeBinding;
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
    const projects = (await workspace.all<Project>('projects')).filter(p => !['recovery', '_recovery'].includes(p.sessionId!)).sort((a, b) => a.sessionId!.localeCompare(b.sessionId!));
    const names = projects.map(p => p.sessionId!);
    const select = $('#saved-projects') as unknown as HTMLSelectElement;
    const current = select.value || selectedProjectName;
    if (JSON.stringify(Array.from(select.options).slice(1).map(option => [option.value, option.text])) !== JSON.stringify(projects.map(p => [p.sessionId, p.name]))) {
      select.innerHTML = '<option value="">Sessions…</option>' + projects.map(p => `<option value="${escape(p.sessionId!)}">${escape(p.name)}</option>`).join('');
    }
    select.value = names.includes(current) ? current : '';
  })().finally(() => { refreshingProjects = undefined; });
  return refreshingProjects;
}
$('#saved-projects').onfocus = guard(refreshProjects);
$('#saved-projects').onpointerdown = guard(refreshProjects);

async function downloadBackup() { const state = snapshot(); state.assetIds = assetReferences(state); const blob = await backupProject(state); const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `${state.name.replace(/[^a-zA-Z0-9_-]/g, '-')}.studio.zip`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notice('Backup downloaded. Its manifest lists any missing or external files.'); }
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
const saveNow = guard(() => persistSession());
$('#save-now').onclick = saveNow;
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); if (!e.repeat) void saveNow(); } }, true);
async function saveCopy() { if (timelineRecording?.pending) throw new Error('Finish or save the recording first.'); clearTimeout(saveTimer); await saveChain.catch(() => {}); const next = await workspace.createProject({ ...snapshot(), sessionId: undefined }); await loadProject(next); await persistSession(); }
async function reloadSession() { if (!selectedProjectName || !await askEdit('Reload saved session?', undefined, 'Your current draft will be replaced by the saved version.')) return; clearTimeout(saveTimer); await saveChain.catch(() => {}); await loadProject(await workspace.loadProject(selectedProjectName)); }
async function deleteSession() { if (timelineRecording?.pending) throw new Error('Finish or save the recording first.'); if (!selectedProjectName || !await askEdit('Delete this session?', undefined, 'Audio stays in your library. Download a backup first if you need this arrangement.')) return; clearTimeout(saveTimer); await saveChain.catch(() => {}); await workspace.deleteProject(selectedProjectName, project.revision ?? 0); sessionDrafts.clear(); await loadProject(await workspace.createProject(newProject())); await persistSession(); }
async function loadProject(next: Project, markDirty = true, expectedRevision?: number) {
  if (midiComposition.pending || midiComposition.running) throw new Error('Accept or discard the MIDI takes before switching sessions.');
  if (timelineRecording?.pending) throw new Error('Finish or save the recording before switching sessions.');
  if (recordingPanel.pending) throw new Error('Save or discard the pending audio take before switching sessions.');
  midiComposition.close(); recordingPanel.discard(); performancePanel.close();
  contextMenu.close(false);
  const accepted = ProjectSchema.parse(next); const validated = normalizeProjectTempo(structuredClone(accepted)); instrumentFor(validated); instrumentOpen = false; audioOpen = false; liveInput.disconnect();
  // Preload before changing the running project. Missing assets are explicit, and
  // leave the current session intact instead of partially applying a load.
  for (const slot of validated.slots) if (slot.active) { const asset = assets.find(a => a.id === slot.active); if (asset && !asset.missing) { try { await engine.preload(asset); } catch { asset.missing = true; } } }
  for (const id of assetReferences(validated)) if (!assets.some(a => a.id === id)) assets.push({ id, label: `Missing sound ${id.slice(0, 8)}`, prompt: '', duration: null, loop: false, provider: 'upload', format: 'wav', createdAt: '', missing: true });
  if (expectedRevision !== undefined && expectedRevision !== saveRevision) return false;
  acceptedProject = accepted; releaseNotes(); engine.restore(validated);
  editors.forEach(e => e.view.destroy()); editors.clear(); $('#editor').replaceChildren();
  project = validated; selectedProjectName = validated.sessionId || ''; if (selectedProjectName) sessionStorage.setItem('studio.session', selectedProjectName); editor = getEditor(); midiComposition.resetRange(); restoreWorkspace();
  selectedSlider = undefined; learning = undefined; $('#midi-learning').hidden = true; $('#cancel-learn').hidden = true; $('#drawer-learning').hidden = true;
  $('#project-name').value = project.name; pickup.reset(); ensureDeviceProfiles(); renderAll(); if (markDirty) dirty(); return true;
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
$('#import-file').onchange = guard(async () => { const file = $('#import-file').files?.[0]; if (!file) return;
  if (file.size > 2000000) throw new Error('Pattern file is too large.');
  createTab(file.name.replace(/\.(strudel|str|js)$/, ''), await file.text()); $('#import-file').value = '';
});
function exportCode() { const blob = new Blob([standaloneCode({ ...project.tabs.find(t => t.id === project.activeTabId)!, code: editor.code }, project.bpm)], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${project.tabs.find(t => t.id === project.activeTabId)!.name.replace(/[^\w-]/g, '_')}.strudel`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function settleSlots(stopped = !engine.started) {
  const committed = engine.timeline.settle(engine.cycle, stopped);
  if (committed.length) { for (const { name, asset } of committed) { const slot = project.slots.find((s) => s.name === name); if (slot) slot.active = asset; } renderSlots(); dirty(); }
}

function startPlayback() { stopTakePreview(); if (engine.started && engine.diagnostics.target !== project.activeTabId) engine.stop(); return engine.evaluate(true, project.activeTabId, true); }
function stopPlayback() { sampleEditor.stop(); engine.countIn.cancel(); stopTakePreview(); if (preparingShared || timelineRecording?.pending || performancePanel.running) { void stopSharedRecording(); return; } liveInput.stop(); renderAudioInput(); midiComposition.finish(); document.querySelectorAll('audio').forEach(audio => audio.pause()); void recordingPanel.stop(true); performancePanel.globalStop(); releaseNotes(); engine.stop(); settleSlots(true); renderComposition(); }
function setCountIn(mode: MetronomeMode) {
  engine.countIn.mode = mode;
  try { localStorage.setItem('studio.count-in', mode); } catch { /* still works for this launch */ }
  renderTransport();
}
$('#count-in').onclick = () => setCountIn(nextMetronomeMode(engine.countIn.mode));
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
  if (!$('#sounds-panel').hidden) setSounds(false); setDrawer(saved.view === null ? undefined : 'composition');
}
function renderTabs() {
  renderChopSounds();
  const visible = project.tabs.filter(t => openTabs.has(t.id));
  const patternSelected = !audioOpen && !instrumentOpen && visible.some(t => t.id === project.activeTabId);
  $('#input-tabs').innerHTML = `<button role="tab" id="tab-audio-input" aria-label="Audio input" aria-selected="${audioOpen}" tabindex="${audioOpen || (!instrumentOpen && !patternSelected) ? 0 : -1}" data-audio-tab><span class="meter-bars" aria-hidden="true"><i></i><i></i><i></i></span>Input</button><button role="tab" id="tab-midi-instrument" aria-label="MIDI instrument" aria-selected="${instrumentOpen}" aria-controls="editor-midi-instrument" tabindex="${instrumentOpen ? 0 : -1}" data-instrument-tab><span class="activity-dot" aria-hidden="true"></span>MIDI</button>`;
  $('#tabs').innerHTML = visible.map(tab => {
    const selected = patternSelected && tab.id === project.activeTabId;
    return `<span class="pattern-tab"><button role="tab" id="tab-${tab.id}" aria-selected="${selected}" aria-controls="editor-${tab.id}" tabindex="${selected ? 0 : -1}" data-color="${tab.color}" data-tab="${tab.id}"><i class="tab-dot" aria-hidden="true"></i>${escape(tab.name)}</button><button class="tab-close" data-close-tab="${tab.id}" aria-label="Close ${escape(tab.name)}">×</button></span>`;
  }).join('');
  editors.forEach((instance, id) => { const root = instance.view.dom.parentElement!; root.hidden = id === AUDIO_EDITOR ? !audioOpen : audioOpen || (id === MIDI_EDITOR ? !instrumentOpen : instrumentOpen || id !== project.activeTabId || !openTabs.has(id)); root.id = id === AUDIO_EDITOR ? 'editor-audio-input' : id === MIDI_EDITOR ? 'editor-midi-instrument' : `editor-${id}`; root.setAttribute('role', 'tabpanel'); root.setAttribute('aria-labelledby', id === AUDIO_EDITOR ? 'tab-audio-input' : id === MIDI_EDITOR ? 'tab-midi-instrument' : `tab-${id}`); });
  $('#editor').hidden = !audioOpen && !instrumentOpen && !visible.length; $('#empty-editor').hidden = audioOpen || instrumentOpen || !!visible.length; $('#instrument-toolbar').hidden = !instrumentOpen;
  $('#play').disabled = audioOpen || instrumentOpen || !visible.length || engine.busy || engine.started;
  renderInputAlert(); renderTakeView();
}
$('#open-patterns').onclick = () => commandPalette.show('Open ');function closeTab(id: string) {
  openTabs.delete(id);
  if (project.activeTabId === id && openTabs.size) switchTab([...openTabs][0]);
  renderTabs(); saveWorkspace(); renderTransport();
  if (!openTabs.size) $('#open-patterns').focus();
}
function switchTab(id: string) {
  if (document.body.dataset.expanded === 'composition') document.body.dataset.expanded = '';
  stopTakePreview();
  instrumentOpen = false; audioOpen = false;
  openTabs.add(id); project.activeTabId = id; editor = getEditor(id); selectedSlider = undefined;
  learning = undefined; $('#midi-learning').hidden = true; $('#cancel-learn').hidden = true; $('#drawer-learning').hidden = true;
  renderTabs(); renderSliders(); renderBindings(); dirty(); saveWorkspace(); editor.view.requestMeasure();
}
function syncProjectTempo() {
  for (const tab of project.tabs) {
    const owner = editors.get(tab.id);
    if (owner) { owner.syncTempo(project.bpm, tab.tempoBpm); tab.code = owner.code; tab.anchors = owner.anchors; }
  }
  normalizeProjectTempo(project); renderComposition();
}
async function changePatternTempo(id: string) {
  editArrangement();
  if (midiComposition.pending || performancePanel.take?.notes.length || recordingPanel.pending) throw new Error('Resolve the pending take before changing tempo.');
  const tab = project.tabs.find(t => t.id === id)!;
  if (tab.audioAssetId) throw new Error('Recorded audio keeps its natural speed and pitch.');
  const value = await askEdit('Pattern tempo', tab.tempoBpm === undefined ? 'project' : String(tab.tempoBpm), 'Enter project to inherit, or 20–300 BPM. This affects every placement of this pattern.');
  if (value === undefined) return;
  editArrangement();
  if (value.toLowerCase() === 'project') delete tab.tempoBpm;
  else { const bpm = Number(value); if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) throw new Error('Choose project or 20–300 BPM.'); tab.tempoBpm = bpm; }
  syncProjectTempo(); dirty();
}
function createTab(name = `Pattern ${project.tabs.length + 1}`, code = '// Start a new pattern\n$: note("c3 e3 g3").s("triangle").gain(0.2)\n', color: Tab['color'] = palette[project.tabs.length % palette.length]) {
  if (timelineRecording?.pending) throw new Error('Finish recording before creating patterns.');
  if (project.tabs.length >= 50) throw new Error('A project can contain up to 50 patterns.');
  const tab: Tab = { id: crypto.randomUUID(), name: name.slice(0, 80) || 'Pattern', code, anchors: [], color };
  project.tabs.push(tab); switchTab(tab.id);
}
let lastTabClick: { id: string; at: number } | undefined;
$('#tabs').addEventListener('keydown', e => { if (e.key !== 'F2') return; const id = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]')?.dataset.tab; if (id) { e.preventDefault(); void guard(() => renameTab(id))(); } });
$('#tabs').onclick = e => { const close = (e.target as HTMLElement).closest<HTMLElement>('[data-close-tab]')?.dataset.closeTab; if (close) { closeTab(close); return; } const id = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]')?.dataset.tab; if (id) { const repeated = e.detail > 0 && lastTabClick?.id === id && performance.now() - lastTabClick.at < 400; lastTabClick = { id, at: performance.now() }; if (repeated) { lastTabClick = undefined; void guard(() => renameTab(id))(); } else switchTab(id); } };
$('#input-tabs').onclick = e => { if ((e.target as HTMLElement).closest('[data-audio-tab]')) openAudioInput(); if ((e.target as HTMLElement).closest('[data-instrument-tab]')) openMidiInstrument(); };
$('#tabs').onkeydown = $('#input-tabs').onkeydown = e => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault(); const tabs = [...project.tabs.filter(t => openTabs.has(t.id)), { id: AUDIO_EDITOR }, { id: MIDI_EDITOR }]; const index = tabs.findIndex(t => t.id === activeEditorId());
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
async function insertSound(id: string) { const asset = assetById(id); await useSound(soundKey(asset), asset); }
$('#insert-sound').onclick = guard(() => selectedAsset ? insertSound(selectedAsset) : undefined);
function setSounds(open: boolean) {
  if(!open && replacingSound)return;
  const wasOpen = !$('#sounds-panel').hidden;
  if (open) sheets.close(false);
  if (open && !wasOpen) libraryReturn = document.activeElement as HTMLElement;
  $('#sounds-panel').hidden = !open; libraryBackdrop.hidden = !open;
  document.body.classList.toggle('sounds-open', open);
  for (const element of workspaceRegions()) element.inert = open;

  $('#sounds-panel').classList.toggle('chop-picker',!!libraryTarget?.binding);
  if(libraryTarget?.binding)$('#library-scroll').insertBefore($('#assets'),$('#builtin-sounds'));else $('#library-scroll').insertBefore($('#builtin-sounds'),$('#assets'));
  $('#chop-audition').hidden = !libraryTarget?.binding;
  if (open) {
    if(libraryTarget?.binding){libraryMidi=true;engine.releaseInputNotes();releaseNotes();void loadChopRegion();}
    void catalogue.refresh().catch(error => notice(error.message, true));
    if (!selectedSound) selectedSound = engine.soundEntries.find(s => s.name === 'triangle')?.name;
    renderAssets(); $('#sound-search').focus();
  } else {
    libraryMidi = false; stopLibraryNotes(); previewEpoch++;regionEpoch++;regionEditor?.reset();
    if (previewKey) engine.performanceAudio.release(previewKey);
    paintLibrarySelection(); libraryTarget = undefined;
    if (wasOpen) libraryReturn?.focus();
  }
}
function openLibrary() { libraryTarget = undefined; $('#sound-search').value = ''; $('#library-source').value = 'all'; setSounds(true); }
$('#sounds-close').onclick = () => setSounds(false);
$('#sounds-panel').addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const items = Array.from($('#sounds-panel').querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href]')).filter(el => el.getClientRects().length > 0);
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
});

const catalogue = new Catalogue(async () => { assets = await workspace.assets(); await engine.registerAssets(assets); renderAssets(); await refreshProjects(); });
$('#library-scroll').prepend(catalogue.root);
const openExport = setupExport($('#export-content'), snapshot, () => assets);
type DrawerView = 'composition';
let drawerView: DrawerView | undefined;
let drawerHeight = 300;
function setDrawer(view?: DrawerView) {
  if (!view && document.body.dataset.expanded === 'composition') document.body.dataset.expanded = '';
  drawerView = view; $('#drawer').hidden = !view; $('#composition-content').hidden = view !== 'composition';
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
$('#composition-close').onclick = () => setDrawer(undefined);
$('#composition-editor').onclick = () => { takeCodeOpen.add(project.activeTabId); switchTab(project.activeTabId); editor.view.focus(); };
$('#drawer-resize').onpointerdown = e => {
  const start = e.clientY, height = drawerHeight, handle = e.currentTarget as HTMLElement; handle.setPointerCapture(e.pointerId);
  handle.onpointermove = event => resizeDrawer(height + start - event.clientY);
  handle.onpointerup = handle.onpointercancel = () => { handle.onpointermove = null; setDrawer(drawerView); };
};
$('#drawer-resize').onkeydown = e => { if (['ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); resizeDrawer(drawerHeight + (e.key === 'ArrowUp' ? 20 : -20)); setDrawer(drawerView); } };
$('#composition-play').onclick = guard(() => { $('#play-target').value = 'composition'; stopTakePreview(); if (engine.started && engine.diagnostics.target !== 'composition') engine.stop(); return engine.playComposition(true); });
$('#composition-stop').onclick = stopPlayback;
$('#composition-loop').onclick = guard(toggleLoop);
function toggleLoop() { if (engine.started) throw new Error('Stop playback to change the loop.'); engine.transport.loop = !engine.transport.loop; renderTransport(); }
$('#clear-loop').onclick = guard(() => {
  if (engine.started || midiComposition.running || midiComposition.pending) throw new Error('Stop playback and resolve the take before changing the loop.');
  engine.transport.loop = false; midiComposition.resetRange(); renderComposition();
});
function toggleExpanded(pane: 'editor' | 'composition') {
  const on = document.body.dataset.expanded !== pane;
  if (pane === 'composition') { if (!$('#sounds-panel').hidden) setSounds(false); setDrawer('composition'); }
  document.body.dataset.expanded = on ? pane : '';
  saveWorkspace(); editor.view.requestMeasure();
}
document.querySelectorAll<HTMLElement>('[data-play-target]').forEach(button => button.onclick = () => {
  $('#play-target').value = button.dataset.playTarget!;
  if (button.dataset.playTarget === 'composition') setDrawer('composition');
  renderTransport();
});let timelineDragging = false;
function changeRange(edge: string, value: number) {
  if (engine.started || midiComposition.running || midiComposition.pending) throw new Error('Stop playback and resolve the take before changing its range.');
  const range = midiComposition.loopRange, maximum = engine.arrangementLength || 4;
  const snapped = Math.round(value / project.snap) * project.snap;
  if (edge === 'begin') range.begin = Math.max(0, Math.min(range.end - .25, snapped)); else range.end = Math.min(maximum, Math.max(range.begin + .25, snapped));
  midiComposition.setRange(range.begin, range.end); renderComposition();
}
/** Whole snap steps covering a dragged span, clamped inside the arrangement. */
function loopSelection(a: number, b: number) {
  const snap = project.snap, maximum = engine.arrangementLength || 4;
  const end = Math.min(maximum, Math.max(snap, Math.ceil(Math.max(a, b) / snap) * snap));
  const begin = Math.max(0, Math.min(end - snap, Math.floor(Math.min(a, b) / snap) * snap));
  return { begin, end };
}
$('#ruler').onpointerdown = event => {
  const element = event.target as HTMLElement; if (element.closest('.track-corner')) return;
  if (midiComposition.running || midiComposition.pending || engine.busy) { notice('Finish and resolve the MIDI take before seeking.', true); return; }
  const edge = element.dataset.rangeEdge;
  if (edge && engine.started) { notice('Stop playback to change the loop range.', true); return; }
  event.preventDefault(); timelineDragging = true;
  const ruler = $('#ruler'); ruler.setPointerCapture(event.pointerId);
  const cycleAt = (e: PointerEvent) => Math.min(engine.arrangementLength || 4, Math.max(0, (e.clientX - ruler.getBoundingClientRect().left - 180) / 64));
  // While stopped, dragging across the ruler selects a loop; a click without movement seeks.
  const origin = cycleAt(event); let value = origin, selecting = false;
  const update = (e: PointerEvent) => {
    value = cycleAt(e);
    if (edge) { const handle = ruler.querySelector<HTMLElement>(`[data-range-edge="${edge}"]`); if (handle) handle.style.left = `${180 + value * 64}px`; return; }
    selecting ||= !engine.started && Math.abs(value - origin) >= project.snap / 2;
    if (!selecting) { $('#seek-handle').style.left = `${180 + value * 64}px`; return; }
    ruler.classList.add('selecting');
    const { begin, end } = loopSelection(origin, value), band = $('#timeline-range');
    band.style.left = `${180 + begin * 64}px`; band.style.width = `${(end - begin) * 64}px`;
  };
  update(event); ruler.onpointermove = update;
  ruler.onpointerup = () => { timelineDragging = false; ruler.classList.remove('selecting'); ruler.onpointermove = null; ruler.onpointerup = null; void guard(async () => {
    try {
      if (edge) changeRange(edge, value);
      else if (selecting) { const { begin, end } = loopSelection(origin, value); midiComposition.setRange(begin, end); engine.transport.loop = true; }
      else await engine.seek(value);
    } finally { renderComposition(); }
  })(); };
  ruler.onpointercancel = () => { timelineDragging = false; ruler.classList.remove('selecting'); ruler.onpointermove = null; renderComposition(); };
};$('#ruler').onkeydown = event => {
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
function editArrangement() { if (midiComposition.running || midiComposition.pending || performancePanel.take?.state === 'capturing' || performancePanel.take?.notes.length) throw new Error('Resolve the MIDI take before editing the composition.'); if (timelineRecording?.pending) throw new Error('Finish recording before editing the composition.'); if (engine.started || engine.busy) throw new Error('Stop playback to edit the composition.'); }
let selectedTrack: string | undefined;
const clipWaveforms=new ClipWaveforms($('#sequencer-scroll'));
function renderComposition() {
  midiComposition.refreshRange();
  if (!project.tracks.some(t => t.id === selectedTrack)) selectedTrack = project.tracks[0].id;
  const chosenRecordTrack = selectedTrack || $('#record-track').value;
  $('#record-track').innerHTML = project.tracks.map(t => `<option value="${t.id}">${escape(t.name)}</option>`).join('');
  $('#record-track').value = project.tracks.some(t => t.id === chosenRecordTrack) ? chosenRecordTrack! : project.tracks[0].id;
  const length = Math.ceil(Math.max(16, timelineRecording?.pending ? timelineRecording.endCycle + 4 : 0, ...project.clips.map(c => c.start + c.length + 4)));
  const range = midiComposition.loopRange; engine.transport.begin = range.begin; engine.transport.end = range.end;
  $('#bpm').value = String(project.bpm); $('#snap').value = String(project.snap);
  $('#sequencer').style.width = `${length * 64 + 180}px`;
  $('#sequencer').style.setProperty('--grid', `${project.snap * 64}px`);
  $('#ruler').innerHTML = '<span class="track-corner">Tracks</span>' + Array.from({ length }, (_, i) => `<span>${beatPosition(i)}</span>`).join('') + `<div id="timeline-range" style="left:${180 + range.begin * 64}px;width:${(range.end - range.begin) * 64}px"></div><button class="range-handle" data-range-edge="begin" role="slider" aria-label="Range start" aria-valuemin="1" aria-valuemax="${beatPosition(range.end - .25)}" aria-valuenow="${beatPosition(range.begin)}" style="left:${180 + range.begin * 64}px"></button><button class="range-handle" data-range-edge="end" role="slider" aria-label="Range end" aria-valuemin="${beatPosition(range.begin + .25)}" aria-valuemax="${beatPosition(engine.arrangementLength || 4)}" aria-valuenow="${beatPosition(range.end)}" style="left:${180 + range.end * 64}px"></button><button id="seek-handle" role="slider" aria-label="Playhead" aria-valuemin="1" aria-valuemax="${beatPosition(engine.arrangementLength)}" aria-valuenow="${beatPosition(engine.timelinePosition)}" style="left:${180 + engine.timelinePosition * 64}px">▼</button>`;
  $('#clip-lane').innerHTML = project.tracks.map(t => `<option value="${t.id}">${escape(t.name)}</option>`).join('');
  const clipRows = new Map<string, number>(), trackRows = new Map<string, number>();
  for (const track of project.tracks) {
    const ends: number[] = [];
    for (const clip of project.clips.filter(c => c.trackId === track.id).sort((a, b) => a.start - b.start)) {
      let row = ends.findIndex(end => end <= clip.start); if (row < 0) row = ends.length;
      ends[row] = clip.start + clip.length; clipRows.set(clip.id, row);
    }
    trackRows.set(track.id, Math.max(1, ends.length));
  }
  $('#tracks').innerHTML = project.tracks.map((track, index) => `<div class="track-row"><div class="track-header" style="height:${trackRows.get(track.id)! * 84}px" data-track="${track.id}" aria-current="${track.id === selectedTrack}"><strong>${escape(track.name)}</strong><button data-track-mute="${track.id}" aria-label="${track.muted ? 'Unmute' : 'Mute'} ${escape(track.name)}" aria-pressed="${track.muted}">${track.muted ? 'Unmute' : 'Mute'}</button><button data-track-solo="${track.id}" aria-label="${project.soloTrackId === track.id ? 'Clear solo for' : 'Solo'} ${escape(track.name)}" aria-pressed="${project.soloTrackId === track.id}" title="Isolate this track; click again to restore the mix">Solo</button><button data-track-menu="${track.id}" aria-label="Actions for ${escape(track.name)}">•••</button></div><div class="lane" style="height:${trackRows.get(track.id)! * 84}px" data-track-id="${track.id}" data-lane="${index}" aria-label="${escape(track.name)}">${project.clips.filter(c => c.trackId === track.id).map(c => {
    const tab = project.tabs.find(t => t.id === c.tabId)!;
    return `<button class="clip" data-color="${tab.color}" data-muted="${isClipMuted(c, project.tracks, project.soloTrackId)}" data-clip="${c.id}" style="top:${4 + clipRows.get(c.id)! * 84}px;left:${c.start * 64}px;width:${c.length * 64}px" aria-label="${escape(tab.name)} · ${escape(track.name)} · beat ${beatPosition(c.start)} · ${beatDuration(c.length)} beats${isClipMuted(c, project.tracks, project.soloTrackId) ? ' · muted' : ''}"><strong>${escape(tab.name)}</strong><small>${isClipMuted(c, project.tracks, project.soloTrackId) ? 'Muted · ' : ''}${beatDuration(c.length)} beats${c.takeId ? ` · Once${(c.anchors?.length??0)>1?' · Aligned':''}` : ' · Pattern'}${tab.tempoBpm ? ` · ${tab.tempoBpm} BPM` : ''}</small>${c.takeId?`<canvas class="clip-waveform" data-clip-waveform="${c.id}" role="img" aria-label="Loading sample waveform"></canvas>`:''}<span class="clip-resize clip-resize-left" data-resize="left" aria-hidden="true"></span><span class="clip-resize" data-resize="right" aria-hidden="true"></span></button>`;
  }).join('') || '<p class="lane-empty">Drag a pattern tab here, or right-click it → Add to composition</p>'}</div></div>`).join('');
  clipWaveforms.render(project.clips,assets,project.bpm);
  paintRecordingClip(); renderTransport(); renderRecording();
}
function paintRecordingClip() {
  const views = [timelineRecording?.captureView, midiComposition.captureView, performancePanel.captureView, recordingPanel.captureView].filter((v): v is CaptureView => !!v);
  paintCaptureFeedback(views, editors);
  const ends = views.flatMap(view => view.trackId && view.end !== undefined ? [view.end] : []);
  if (ends.length) $('#sequencer').style.width = `${Math.max(16, Math.ceil(Math.max(...ends) + 4), ...project.clips.map(c => c.start + c.length + 4)) * 64 + 180}px`;
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
  selectedTrack = header.dataset.track; if (!timelineRecording?.pending && !performancePanel.running) $('#record-track').value = selectedTrack!; renderRecording(); document.querySelectorAll<HTMLElement>('[data-track]').forEach(h => h.setAttribute('aria-current', String(h.dataset.track === selectedTrack))); const track = project.tracks.find(t => t.id === selectedTrack)!;
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
function putClip(clip: Clip) {
  editArrangement();
  if (!canPlace(project.clips, clip)) throw new Error('Use whole-beat increments and leave space between clips in the same track.');
  if (!project.clips.some(c => c.id === clip.id) && project.clips.length >= 500) throw new Error('This project has reached its clip limit.');
  project.clips = [...project.clips.filter(c => c.id !== clip.id), clip]; renderComposition(); dirty();
}
let editingClip: string | undefined;

function openClip(id: string) {
  editArrangement(); const clip = project.clips.find(c => c.id === id)!; editingClip = id;
  const tab = project.tabs.find(t => t.id === clip.tabId)!;
  const eligible = clip.playback === 'once' || (!tab.audioAssetId && !!singleSampleId(editors.get(tab.id)?.code ?? tab.code) && !clip.takeId);
  $('#clip-playback-label').hidden = $('#clip-playback-help').hidden = !eligible;
  $('#clip-playback').value = clip.playback === 'once' ? 'once' : 'pattern';
  $('#clip-audio-controls').hidden=!clip.takeId;$('#clip-offset-details').hidden=!!clip.takeId;
  $('#clip-lane').value = clip.trackId; $('#clip-start').value = String(beatPosition(clip.start)); $('#clip-length').value = String(beatDuration(clip.length)); $('#clip-offset').value = String(clip.sourceOffset ?? 0); $('#clip-mute').textContent = clip.muted ? 'Unmute' : 'Mute'; $('#clip-dialog').returnValue = ''; $('#clip-dialog').showModal();
}
function placementFor(tabId: string) {
  const tab = project.tabs.find(t => t.id === tabId)!;
  return samplePlacement({ ...tab, code: editors.get(tabId)?.code ?? tab.code }, assets, project.bpm);
}
function addToComposition(tabId: string) {
  editArrangement(); const clip: Clip = { id: crypto.randomUUID(), tabId, trackId: selectedTrack ?? project.tracks[0].id, muted: false, start: Math.max(0, ...project.clips.filter(c => c.trackId === (selectedTrack ?? project.tracks[0].id)).map(c => c.start + c.length)), ...placementFor(tabId) };
  putClip(clip); setDrawer('composition'); openClip(clip.id);
}
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
const alignDialog=new AlignDialog(engine,clip=>{
 editArrangement();
 if(project.clips.some(c=>c.id!==clip.id&&c.trackId===clip.trackId&&c.start<clip.start+clip.length&&clip.start<c.start+c.length))throw new Error('The fitted length overlaps another clip. Shorten the fit or move the clip first.');
 if(!canPlace(project.clips,clip))throw new Error('Use whole-beat increments and leave space between clips in the same track.');
 putClip(clip);notice('Alignment saved. The original sample is unchanged.');
});
function openAlignment(id:string){editArrangement();const clip=project.clips.find(c=>c.id===id);if(!clip?.takeId)throw new Error('Choose a WAV audio clip.');$('#clip-dialog').returnValue='cancel';$<HTMLDialogElement>('#clip-dialog').close();void alignDialog.open(clip,assetById(clip.takeId),project.bpm);}
$('#clip-align').onclick=guard(()=>{if(editingClip)openAlignment(editingClip);});
$('#clip-playback').onchange = () => {
  const clip = project.clips.find(c => c.id === editingClip);
  $('#clip-audio-controls').hidden=$('#clip-playback').value!=='once';$('#clip-offset-details').hidden=$('#clip-playback').value==='once';
  if (clip && $('#clip-playback').value === 'once') { $('#clip-length').value = String(placementFor(clip.tabId).length * 4); $('#clip-offset').value = '0'; }
};
$('#clip-dialog').addEventListener('close', () => void guard(async () => {
  const action = $('#clip-dialog').returnValue, clip = project.clips.find(c => c.id === editingClip); if (!clip || action === 'cancel') return;
  if (action === 'source') { switchTab(clip.tabId); return; }
  if (action === 'mute') { toggleClipMute(clip.id); return; }
  editArrangement();
  if (action === 'duplicate') duplicateClip(clip.id);
  else if (action === 'remove') removeClip(clip.id);
  else if (action === 'save') {
    let playback = {};
    if (!$('#clip-playback-label').hidden) {
      if ($('#clip-playback').value === 'once' && !placementFor(clip.tabId).takeId) throw new Error('Choose Repeat pattern for a tab with multiple sounds or rhythmic transformations.');
      playback = $('#clip-playback').value === 'once' ? { playback: 'once', takeId: clip.playback==='once'&&clip.takeId?clip.takeId:placementFor(clip.tabId).takeId } : { playback: 'pattern', takeId: undefined, anchors: undefined };
    }
    const next: Clip = { ...clip, ...playback, trackId: $('#clip-lane').value, start: (Number($('#clip-start').value) - 1) / 4, length: Number($('#clip-length').value) / 4, sourceOffset: Number($('#clip-offset').value) };
    if (next.takeId) delete next.sourceOffset; else { delete next.anchors; delete next.takeId; }
    putClip(next);notice('Clip saved.');
  }
})());
$('#bpm').onchange = guard(() => { editArrangement(); if (recordingPanel.pending) throw new Error('Resolve the audio take before changing tempo.'); const bpm = Number($('#bpm').value); if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) throw new Error('Tempo must be between 20 and 300 BPM.'); const issue = tempoChangeIssue(project.clips.map(c => ({ ...c, name: project.tabs.find(t => t.id === c.tabId)?.name })), takeId => assets.find(a => a.id === takeId)?.duration ?? Infinity, bpm); if (issue) { $('#bpm').value = String(project.bpm); throw new Error(issue); } project.bpm = bpm; syncProjectTempo(); dirty(); });
installCompositionGestures({ reveal: () => setDrawer('composition'), project: () => project, placement: placementFor, blocked: () => engine.started || engine.busy, commit: clip => void guard(() => putClip(clip))(), open: id => void guard(() => openClip(id))() });

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
      action('Pattern tempo…', () => changePatternTempo(id), stopped || (project.tabs.find(t => t.id === id)?.audioAssetId ? 'Recorded audio keeps its natural rate.' : undefined)),
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
      ...(clip.takeId?[action('Align…',()=>openAlignment(id),stopped)]:[]),
      action('Edit', () => openClip(id), stopped),
      action('Duplicate', () => duplicateClip(id), stopped || (project.clips.length >= 500 ? 'Clip limit reached (500).' : !duplicatePlacement(project.clips, clip, 'candidate') ? 'No room in this lane.' : undefined)),
      action('Open source pattern', () => switchTab(clip.tabId)),
      action('Remove', () => removeClip(id), stopped),
    ];
  } else {
    const id = item.dataset.asset!; selector = `[data-select-asset="${id}"]`;
    actions = [action('Preview', () => previewSound(soundKey(assetById(id)))), action('Insert into pattern', () => insertSound(id)), action('Rename', () => renameSound(id)), action('Edit sample', () => editLibrarySample(id), assetById(id).missing ? 'Restore missing audio first.' : undefined)];
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

const openQuickStart = installQuickStart();

function openSheet(id: string) { if (!$('#sounds-panel').hidden) setSounds(false); contextMenu.close(false); sheets.open(id); }
function sheetOpened(id: string) {
  if (id === 'export') openExport();
  if (id === 'audio') { ensureAudioInput(); renderAudioInput(); }
  if (id === 'midi') renderProfiles();
}
function openRecordBar(mode: 'audio' | 'midi') {
  recordBarOpen = true;
  if (mode === 'midi') recordMidiEnabled = true;
  else recordAudioEnabled = true;
  renderRecording(); $('#record-toggle').focus();
}
$('#record-toggle').onclick = guard(async () => {
  if (preparingShared || timelineRecording?.state === 'recording' || timelineRecording?.state === 'preparing' || performancePanel.running) { await stopSharedRecording(); return; }
  if ($('#record-bar').hidden) { recordBarOpen = true; if (instrumentOpen) recordMidiEnabled = true; renderRecording(); return; }
  await startSharedRecording();
});
$('#record-close').onclick = guard(() => { performancePanel.close(); recordBarOpen = false; renderRecording(); $('#record-toggle').focus(); });
document.querySelectorAll<HTMLElement>('[data-capture]').forEach(button => button.onclick = () => { if (button.dataset.capture === 'midi') recordMidiEnabled = !recordMidiEnabled; else { recordAudioEnabled = !recordAudioEnabled; recordSource = 'external'; } renderRecording(); });
$('#record-settings').onclick = () => openSheet('record');
$('#record-audio-settings').onclick = $('#audio-settings').onclick = () => openSheet('audio');
$('#input-alert-settings').onclick = () => openSheet(audioOpen ? 'audio' : 'midi');
$('#audio-edit-effects').onclick = openAudioInput;

let newPatternColor: Tab['color'] = palette[0];
let newPatternHasDraft = false;
function paintSwatches() { $('#new-pattern').querySelectorAll<HTMLElement>('[data-color]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color === newPatternColor))); }
function openNewPattern(open = true) {
  $('#new-pattern').hidden = !open; $('#new-tab').setAttribute('aria-expanded', String(open));
  if (!open) return;
  if (!newPatternHasDraft) { newPatternColor = palette[project.tabs.length % palette.length]; $('#new-pattern-name').value = ''; newPatternHasDraft = true; } $('#new-pattern-name').setAttribute('placeholder', `Pattern ${project.tabs.length + 1}`);
  paintSwatches(); $('#new-pattern-name').focus();
}
$('#new-tab').onclick = () => openNewPattern($('#new-pattern').hidden === true);
$('#new-pattern').onclick = event => {
  const target = event.target as HTMLElement, color = target.closest<HTMLElement>('[data-color]')?.dataset.color;
  if (color) { newPatternColor = color as Tab['color']; paintSwatches(); }
  if (target.closest('[data-cancel]')) { openNewPattern(false); $('#new-tab').focus(); }
};
$('#new-pattern').onsubmit = event => { event.preventDefault(); void guard(() => { createTab($('#new-pattern-name').value.trim() || undefined, undefined, newPatternColor); newPatternHasDraft = false; openNewPattern(false); editor.view.focus(); })(); };
registerOverlay($('#new-pattern'), () => { openNewPattern(false); $('#new-tab').focus(); });

const commandPalette = new CommandPalette(commands);
$('#palette-open').onclick = () => commandPalette.show();
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'k') return;
  e.preventDefault(); e.stopPropagation();
  if (commandPalette.open) commandPalette.close(); else if (!document.querySelector('dialog[open]')) commandPalette.show();
}, true);
function command(name: string, run: () => unknown, options: Omit<Command, 'name' | 'run'> = {}): Command { return { name, run: guard(run), ...options }; }
/** Everything that used to live in the Project and Patterns menus, rebuilt on each keystroke so names and disabled reasons stay current. */
function commands(): Command[] {
  const stopped = engine.started || engine.busy ? 'Stop playback first' : undefined;
  const takePending = midiComposition.running || midiComposition.pending ? 'Resolve the MIDI take first' : undefined;
  const tab = project.tabs.find(t => t.id === project.activeTabId);
  const pattern = !audioOpen && !instrumentOpen && tab && openTabs.has(tab.id) ? tab : undefined;
  const expanded = document.body.dataset.expanded;
  return [
    ...project.tabs.filter(t => !openTabs.has(t.id)).map(t => command(`Open ${t.name}`, () => { switchTab(t.id); editor.view.focus(); }, { color: t.color, hint: 'Closed', keywords: 'pattern file open', defaultResult: true, pattern: true })),
    command('Open pattern tab', () => commandPalette.show('', true), { defaultResult: true, priority: 0, keywords: 'closed files tabs' }),
    command('WAV editor', () => { location.hash = '/samples/edit'; routePage(); }, { keywords: 'audio sample trim crop chop wav', defaultResult: true, priority: 6 }),
    command('Import GitHub Samples', () => { focusGitHubImport = true; if (location.hash === '#/samples/import') routePage(); else location.hash = '/samples/import'; }, { defaultResult: true, priority: 7, keywords: 'repository repo pack sounds import' }),
    command('Audio input', () => openSheet('audio'), { defaultResult: true, priority: 3, keywords: 'microphone device settings', hint: typeof navigator.mediaDevices?.getUserMedia === 'function' ? undefined : 'Microphone requires a supported browser and secure connection' }),
    command('Export pattern code', exportCode, { keywords: 'download strudel file save', disabled: !pattern ? 'Open a pattern first' : undefined }),
    command('Import .strudel file…', () => $('#import-file').click(), { keywords: 'pattern open load file', defaultResult: true, priority: 6 }),
    command('MIDI & on-screen controller', () => openSheet('midi'), { keywords: 'devices enable keyboard controller mappings learn knobs pads slots', defaultResult: true, priority: 2 }),
    command(expanded === 'editor' ? 'Restore editor and composition' : 'Expand editor', () => toggleExpanded('editor'), { keywords: 'focus full height split' }),
    command(expanded === 'composition' ? 'Restore composition and editor' : 'Expand composition', () => toggleExpanded('composition'), { keywords: 'timeline full height split' }),
    command('Return to range start', () => engine.seek(midiComposition.loopRange.begin), { keywords: 'rewind playhead', disabled: takePending }),
    command(engine.transport.loop ? 'Turn loop off' : 'Loop the selected range', toggleLoop, { keywords: 'repeat arrangement', disabled: stopped || takePending }),
    command('Open Sample Catalogue', openLibrary, { keywords: 'sounds library samples packs insert', defaultResult: true, priority: 1 }),
    command('Export full song render…', () => openSheet('export'), { keywords: 'wav audio bounce download', defaultResult: true, priority: 4 }),
    command('Save session as copy', saveCopy, { keywords: 'project duplicate' }),
    command('Reload saved session', reloadSession, { keywords: 'project revert' }),
    command('Delete session…', deleteSession, { keywords: 'project remove' }),
    command('Download project backup', downloadBackup, { keywords: 'zip export session' }),
    command('Restore project backup…', () => $('#backup-file').click(), { keywords: 'zip import session' }),
    command('Quick start guide', () => openQuickStart(), { keywords: 'help tutorial how', defaultResult: true, priority: 5 }),
    command('Source code', () => window.open('https://github.com/calv-io-n/strudel', '_blank', 'noopener,noreferrer'), { keywords: 'github repository' }),
    command('License · AGPL-3.0-or-later', () => window.open('https://github.com/calv-io-n/strudel/blob/master/LICENSE', '_blank', 'noopener,noreferrer'), { keywords: 'legal' }),
  ];
}

async function boot() {
  await sessionDrafts.initialize();
  await engine.setup(project);
  await seedStarters(); await browserMidi.init(); void collectOrphanAudio().catch(() => {});
  const [library, recovery] = await Promise.all([workspace.assets(), workspace.read<Project>('settings', 'recovery')]);
  bridge = browserMidi.status; devicePorts = (await browserMidi.connections()).ports; assets = library; await engine.registerAssets(assets);
  let restored: Project;
  const rememberedSession = sessionStorage.getItem('studio.session') || recovery?.sessionId;
  if (rememberedSession) {
    try { restored = await workspace.loadProject(rememberedSession); }
    catch { restored = recovery ? (await saveSession({ ...recovery, revision: undefined })).project : await workspace.loadProject('Neon-Drive'); }
  } else restored = await workspace.loadProject('Neon-Drive');
  let draft, pendingDraft = false;
  try { draft = sessionDrafts.read(); } catch { /* Keep unrecognized draft bytes for manual recovery. */ }
  if (draft) {
    try {
      // An old raw draft without a base cannot overwrite a newer saved revision.
      const result = await saveSession(draft.project, draft.base); restored = result.project;
      if (result.kind === 'copied') notice('Recovered your draft as a conflict copy; the newer saved session is preserved.');
      try { sessionDrafts.clear(); localStorage.removeItem('studio.pending-session'); } catch { /* optional cleanup */ }
    } catch (error) { restored = draft.project; pendingDraft = true; notice(`Draft retained; saving is unavailable: ${(error as Error).message}`, true); }
  }
  await loadProject(restored, false);
  if (pendingDraft) acceptedProject = draft?.base;
  $('#saved-state').textContent = pendingDraft ? 'Not saved · draft retained' : draft ? 'Draft recovered and saved' : 'Saved in this browser';
  restoreWorkspace(); renderAll(); await refreshProjects(); await refreshMidiPresets(); await refreshAudioPresets(); connectMidiEvents(); booted = true; routePage();
  // One automatic opening per page load, after recovery has initialized.
  let optedOut = false; try { optedOut = guideOptedOut(localStorage); } catch { /* Show help when storage is unavailable. */ }
  try { setCountIn(savedMetronomeMode(localStorage.getItem('studio.count-in'))); } catch { /* default off */ }
  try { midiComposition.restore(getEditor); await performancePanel.restore(getEditor); if (midiComposition.pending || performancePanel.take?.notes.length) openRecordBar('midi'); await recordingPanel.restore(); await timelineRecording!.restore(); if (timelineRecording!.pending) setDrawer('composition'); await sampleImports.restore(); if (recordingPanel.pending) { openRecordBar('audio'); notice('Recovered audio take in the Record bar. Review it before keeping it.'); } } catch (error) { notice(`Pending take recovery: ${(error as Error).message}`, true); }
  const controls = await readPending<{ tabId: string; id: string; value: number }[]>(`controller-values:${project.sessionId}`);
  for (const value of controls ?? []) { try { const owner = getEditor(value.tabId); pendingMidiSliders.set(value.id, { owner, ...value }); } catch { /* Deleted destination: retain the recovery record. */ } }
  if (pendingMidiSliders.size) await flushMidiSliders();
  renderComposition();
  if (!optedOut) openQuickStart();
  setInterval(() => {
    if (!captureActive() || controlJournalFlight || savedControlVersion === controlVersion) return;
    const version = controlVersion;
    const values = [...pendingMidiSliders.values()].map(update => ({ tabId: [...editors].find(([, owner]) => owner === update.owner)?.[0], id: update.id, value: update.value }));
    controlJournalFlight = writePending(`controller-values:${project.sessionId}`, values).then(() => { savedControlVersion = version; }).catch(e => performancePanel.onfailure(e.message)).finally(() => { controlJournalFlight = undefined; });
  }, 250);
  setInterval(() => {
    performancePanel.feedback();
    liveInput.mix(); const levels = liveInput.levels(); for (const name of ['input', 'output'] as const) { const meter = $<HTMLMeterElement>(`#audio-${name}-level`); meter.value = levels[name]; meter.title = levels[name] >= 1 ? 'Clipping — reduce gain' : `${Math.round(levels[name] * 100)}%`; }
    app.style.setProperty('--input-level', String(Math.min(1, levels.input))); $('#input-tabs').toggleAttribute('data-midi-active', performance.now() < midiPulseUntil); engine.tick(); paintRecordingClip(); settleSlots(); renderTransport(); $('#playhead').hidden = false; $('#playhead').style.left = `${180 + engine.timelinePosition * 64}px`; const head = document.querySelector<HTMLElement>('#seek-handle'); if (head && !timelineDragging) { head.style.left = `${180 + engine.timelinePosition * 64}px`; head.setAttribute('aria-valuenow', String(beatPosition(engine.timelinePosition))); }
    if (!instrumentOpen && engine.started && engine.target === project.activeTabId && engine.repl.state.pattern) { try { const cycle = engine.cycle; editor.paint(engine.repl.state.pattern.queryArc(cycle, cycle + 0.01), cycle); } catch { /* An incomplete edit must not interrupt performance. */ } }
  }, 100);
}
void boot().catch((error) => notice(`Studio could not start: ${error.message}`, true));

// Narrow DOM typing keeps markup helpers concise without disabling application checks.
