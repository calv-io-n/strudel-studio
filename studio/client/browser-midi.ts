import { parseMidi } from '../shared/midi';
import type { BridgeStatus, MidiEvent } from '../shared/model';
import { read, write, exclusive } from './storage/database';
type Message = ({ type: 'status' } & BridgeStatus) | ({ type: 'midi' } & MidiEvent) | { type: 'midi-connections'; ports: string[] };
class BrowserMidi {
  private access?: MIDIAccess;
  private selected: string[] = [];
  private sequence = 0;
  private listeners = new Set<(message: Message) => void>();
  status: BridgeStatus = { ready: false, message: 'Choose Enable MIDI to grant browser access. On-screen controls work without permission.', ports: [], connected: [] };
  subscribe(fn: (message: Message) => void) { this.listeners.add(fn); fn({ type: 'status', ...this.status }); fn({ type: 'midi-connections', ports: this.selected }); return () => this.listeners.delete(fn); }
  private emit(message: Message) { this.listeners.forEach(fn => fn(message)); }
  async init() { this.selected = await read<string[]>('settings', 'midi-connections') ?? []; if (!navigator.requestMIDIAccess) this.status.message = 'Web MIDI is unavailable in this browser. Use on-screen controls or a browser with Web MIDI support.';
    else if (this.selected.length) { try { const permission = await navigator.permissions.query({ name: 'midi' as PermissionName }); if (permission.state === 'granted') await this.enable(); } catch { /* Keep explicit Enable MIDI available. */ } } }
  async enable() {
    if (!navigator.requestMIDIAccess) throw new Error(this.status.message);
    try { this.access ??= await navigator.requestMIDIAccess({ sysex: false }); this.access.onstatechange = () => this.refresh(); this.refresh(); }
    catch { this.status = { ready: false, message: 'MIDI permission was denied. Allow MIDI in browser settings and try again.', ports: [], connected: [] }; this.emit({ type: 'status', ...this.status }); throw new Error(this.status.message); }
    return this.status;
  }
  private key(port: MIDIInput) { return `${port.name || 'MIDI input'} [${port.id}]`; }
  private refresh() {
    const inputs = [...this.access!.inputs.values()];
    const ports = inputs.filter(p => p.state === 'connected').map(p => this.key(p));
    this.status = { ready: true, message: 'Web MIDI ready', ports, connected: ports.filter(p => this.selected.includes(p)) };
    for (const port of inputs) port.onmidimessage = this.selected.includes(this.key(port)) ? event => { if (event.data) this.receive(this.key(port), [...event.data], 'web-midi'); } : null;
    this.emit({ type: 'status', ...this.status });
  }
  async connections() { return { ports: this.selected }; }
  async connect(input: { port: string; connected: boolean }) {
    await exclusive(async () => { const current = await read<string[]>('settings', 'midi-connections') ?? []; this.selected = [...new Set(input.connected ? [...current, input.port] : current.filter(p => p !== input.port))]; await write([{ collection: 'settings', key: 'midi-connections', value: this.selected }]); });
    this.emit({ type: 'midi-connections', ports: this.selected }); if (this.access) this.refresh(); return { ports: this.selected };
  }
  private receive(source: string, bytes: number[], route: MidiEvent['route']) { if (parseMidi(bytes)) this.emit({ type: 'midi', source, bytes, receivedAt: Date.now(), sequence: ++this.sequence, route }); }
  send(value: { type: string; bytes?: number[]; simulate?: boolean }) { if (value.type === 'send' && value.bytes) this.receive('studio:virtual', value.bytes, 'simulation'); }
}
export const browserMidi = new BrowserMidi();
