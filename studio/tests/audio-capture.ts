import type { Page } from '@playwright/test';

type Bin = { sum: number; count: number; peak: number; clipped: number };
type Capture = {
  active: boolean; rate: number; frames: number; chunks: Float32Array[]; bins: Bin[];
  start(): void;
  finish(): { wav: string; seconds: number; peak: number; clipped: number; bins: { rms: number; peak: number }[] };
};
declare global { interface Window { neonCapture: Capture } }

// Test-only capture of the actual Web Audio output, before device clipping.
// No production recording UI or engine hooks are needed.
export async function installAudioCapture(page: Page) {
  await page.addInitScript(() => {
    const capture: Capture = window.neonCapture = {
      active: false, rate: 48000, frames: 0, chunks: [], bins: [],
      start() { this.frames = 0; this.chunks = []; this.bins = []; this.active = true; },
      finish() {
        this.active = false;
        const buffer = new ArrayBuffer(44 + this.frames * 4), view = new DataView(buffer);
        const word = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
        word(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); word(8, 'WAVE'); word(12, 'fmt ');
        view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
        view.setUint32(24, this.rate, true); view.setUint32(28, this.rate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
        word(36, 'data'); view.setUint32(40, this.frames * 4, true);
        let offset = 44;
        for (const chunk of this.chunks) for (const sample of chunk) { view.setInt16(offset, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true); offset += 2; }
        let binary = ''; const bytes = new Uint8Array(buffer);
        for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
        return { wav: btoa(binary), seconds: this.frames / this.rate,
          peak: Math.max(0, ...this.bins.map(b => b.peak)), clipped: this.bins.reduce((n, b) => n + b.clipped, 0),
          bins: this.bins.map(b => ({ rms: Math.sqrt(b.sum / b.count), peak: b.peak })),
        };
      },
    };
    const connect = AudioNode.prototype.connect;
    const connected = new WeakSet<AudioNode>();
    const recorders = new WeakMap<AudioContext, ScriptProcessorNode>();
    AudioNode.prototype.connect = function(this: AudioNode, destination: AudioNode | AudioParam, ...ports: number[]) {
      if (destination instanceof AudioDestinationNode && !connected.has(this) && this.context instanceof AudioContext) {
        connected.add(this);
        const context = this.context;
        let recorder = recorders.get(context);
        if (!recorder) {
          recorder = context.createScriptProcessor(4096, 2, 2);
          recorders.set(context, recorder);
        // The recorder emits silence; the normal audio connection below remains intact.
        recorder.onaudioprocess = event => {
          if (!capture.active) return;
          capture.rate = context.sampleRate;
          const left = event.inputBuffer.getChannelData(0), right = event.inputBuffer.getChannelData(1);
          const chunk = new Float32Array(left.length * 2);
          for (let i = 0; i < left.length; i++) {
            const second = Math.floor((capture.frames + i) / capture.rate);
            const bin = capture.bins[second] ??= { sum: 0, count: 0, peak: 0, clipped: 0 };
            chunk[i * 2] = left[i]; chunk[i * 2 + 1] = right[i];
            for (const sample of [left[i], right[i]]) { bin.sum += sample * sample; bin.count++; bin.peak = Math.max(bin.peak, Math.abs(sample)); if (Math.abs(sample) >= 1) bin.clipped++; }
          }
          capture.chunks.push(chunk); capture.frames += left.length;
        };
          Reflect.apply(connect, recorder, [context.destination]);
        }
        Reflect.apply(connect, this, [recorder]);
      }
      // Preserve the browser's overload behavior for both AudioNodes and AudioParams.
      return Reflect.apply(connect, this, [destination, ...ports]);
    } as typeof AudioNode.prototype.connect;
  });
}
