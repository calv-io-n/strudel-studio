import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { BridgeStatus, MidiEvent } from '../shared/model';
import { parseMidi } from '../shared/midi';

export class MidiBridge {
  status: BridgeStatus = { ready: false, message: 'Starting MIDI bridge…', ports: [], connected: [] };
  private child?: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private ports: string[] = [];
  constructor(private root: string, private publish: (event: object) => void, readonly disabled = false) {}
  start() {
    this.child?.kill(); this.child = undefined;
    if (this.disabled) { this.update({ ready: false, message: 'MIDI bridge disabled for automated tests', ports: [], connected: [] }); return; }
    const local = path.join(this.root, '.venv-midi/bin/python');
    const child = spawn(process.env.STUDIO_PYTHON || (existsSync(local) ? local : 'python3'), ['-u', path.join(this.root, 'studio/midi/bridge.py')]);
    this.child = child;
    createInterface({ input: child.stdout }).on('line', (line) => {
      try {
        const message = JSON.parse(line);
        if (message.type === 'status') { this.update(message); if (message.ready) this.connect(this.ports); }
        if (message.type === 'midi' && parseMidi(message.bytes)) this.receive(message);
      } catch { console.error('[midi] Invalid bridge response'); }
    });
    child.stderr.on('data', () => { /* The bridge returns actionable errors in status messages. */ });
    child.on('error', (error) => this.update({ ready: false, message: error.message, ports: [], connected: [] }));
    child.on('exit', () => { if (this.child === child && this.status.ready) this.update({ ready: false, message: 'MIDI bridge stopped. Use Reconnect MIDI.', ports: [], connected: [] }); });
    child.stdin.on('error', () => {});
  }
  update(status: BridgeStatus) { this.status = status; this.publish({ type: 'status', ...status }); }
  connect(ports: string[]) { this.ports = ports; this.child?.stdin.write(JSON.stringify({ type: 'connect', ports }) + '\n'); }
  receive(event: Omit<MidiEvent, 'sequence'>) {
    const message: MidiEvent = { ...event, sequence: ++this.sequence };
    this.publish({ ...message, type: 'midi' });
    return message;
  }
  send(bytes: number[]) {
    if (!parseMidi(bytes)) throw new Error('Expected a three-byte MIDI note or CC message.');
    if (!this.status.ready) throw new Error(this.status.message);
    this.child?.stdin.write(JSON.stringify({ type: 'send', bytes }) + '\n');
  }
  close() { this.child?.kill(); }
}
