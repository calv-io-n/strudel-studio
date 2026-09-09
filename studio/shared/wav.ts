export type WavFormat = 'pcm16' | 'pcm24' | 'float32';
export type WavOptions = { format?: WavFormat; channels?: 1 | 2; dither?: boolean; random?: () => number; nonFinite?: 'reject' | 'silence' };
export function encodeWav(left: Float32Array, right: Float32Array, rate: number, options: WavOptions = {}) {
  const format = options.format ?? 'pcm16', channels = options.channels ?? 2;
  if (!['pcm16', 'pcm24', 'float32'].includes(format) || ![1, 2].includes(channels) || !Number.isInteger(rate) || rate < 8000 || rate > 192000 || !left.length || right.length !== left.length) throw new Error('Invalid WAV format, rate, or channel lengths.');
  const bits = format === 'pcm16' ? 16 : format === 'pcm24' ? 24 : 32, width = bits / 8, size = left.length * channels * width;
  const header = format === 'float32' ? 56 : 44;
  if (!Number.isSafeInteger(size) || size + header > 0xffffffff) throw new Error('WAV exceeds RIFF size limits.');
  const buffer = new ArrayBuffer(header + size + size % 2), view = new DataView(buffer);
  const word = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  word(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); word(8, 'WAVE'); word(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, format === 'float32' ? 3 : 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * channels * width, true); view.setUint16(32, channels * width, true); view.setUint16(34, bits, true);
  if (format === 'float32') { word(36, 'fact'); view.setUint32(40, 4, true); view.setUint32(44, left.length, true); }
  word(header - 8, 'data'); view.setUint32(header - 4, size, true);
  let clipped = 0, nonFinite = 0, peak = 0;
  const random = options.random ?? Math.random, scale = 2 ** (bits - 1);
  for (let i = 0; i < left.length; i++) for (let channel = 0; channel < channels; channel++) {
    let sample = (channel ? right : left)[i];
    if (!Number.isFinite(sample)) {
      // Legacy calls intentionally retain their historical sanitizing behavior.
      if ((options.nonFinite ?? (options.format ? 'reject' : 'silence')) === 'reject') throw new Error('Audio contains NaN or Infinity. Fix the signal before encoding.');
      sample = 0; nonFinite++;
    }
    peak = Math.max(peak, Math.abs(sample));
    const offset = header + (i * channels + channel) * width;
    if (format === 'float32') { view.setFloat32(offset, sample, true); continue; }
    if (Math.abs(sample) > 1) clipped++;
    const dither = options.dither ? random() - random() : 0;
    const value = Math.max(-scale, Math.min(scale - 1, Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? scale : scale - 1) + dither)));
    if (bits === 16) view.setInt16(offset, value, true);
    else { view.setUint8(offset, value & 255); view.setUint8(offset + 1, (value >> 8) & 255); view.setUint8(offset + 2, (value >> 16) & 255); }
  }
  return { buffer, clipped, nonFinite, peak };
}
export function wavInfo(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || view.getUint32(4, true) + 8 !== bytes.length) throw new Error('Malformed WAV RIFF length.');
  let offset = 12, format = 0, channels = 0, rate = 0, bits = 0, align = 0, data: { start: number; length: number } | undefined;
  while (offset + 8 <= bytes.length) {
    const id = tag(offset), size = view.getUint32(offset + 4, true), start = offset + 8;
    if (start + size > bytes.length) throw new Error('Malformed WAV chunk bounds.');
    if (id === 'fmt ') {
      if (size < 16) throw new Error('Malformed WAV format chunk.');
      format = view.getUint16(start, true); channels = view.getUint16(start + 2, true); rate = view.getUint32(start + 4, true); align = view.getUint16(start + 12, true); bits = view.getUint16(start + 14, true);
      if (format === 0xfffe) { if (size < 40) throw new Error('Malformed extensible WAV.'); format = view.getUint16(start + 24, true); }
      if (view.getUint32(start + 8, true) !== rate * align) throw new Error('Malformed WAV byte rate.');
    }
    if (id === 'data') { if (data) throw new Error('Multiple WAV data chunks are unsupported.'); data = { start, length: size }; }
    offset = start + size + size % 2;
  }
  const isFloat = format === 3 && bits === 32, isInt = format === 1 && [8, 16, 24, 32].includes(bits);
  if (!isFloat && !isInt) throw new Error('Only PCM or 32-bit float WAV files are supported.');
  if (!data || channels < 1 || channels > 64 || rate < 8000 || rate > 192000 || align !== channels * bits / 8 || data.length % align) throw new Error('Invalid WAV channel layout, sample rate, or frame length.');
  return { ...data, channels, rate, bits, isFloat, frames: data.length / align };
}
export function decodeWav(bytes: Uint8Array, selected?: [number, number]) {
  const info = wavInfo(bytes), { channels, bits, rate, frames, isFloat, start } = info;
  if (channels > 2 && !selected) throw new Error('Select one or two channels before importing multichannel WAV.');
  const selection = selected ?? [0, Math.min(1, channels - 1)];
  if (selection.some(c => !Number.isInteger(c) || c < 0 || c >= channels)) throw new Error('Selected WAV channel is unavailable.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), width = bits / 8;
  const left = new Float32Array(frames), right = new Float32Array(frames);
  const read = (at: number) => {
    if (isFloat) return view.getFloat32(at, true);
    if (bits === 8) return (view.getUint8(at) - 128) / 128;
    if (bits === 16) return view.getInt16(at, true) / 32768;
    if (bits === 24) return (view.getUint8(at) | view.getUint8(at + 1) << 8 | view.getInt8(at + 2) << 16) / 8388608;
    return view.getInt32(at, true) / 2147483648;
  };
  for (let i = 0; i < frames; i++) {
    left[i] = read(start + (i * channels + selection[0]) * width); right[i] = read(start + (i * channels + selection[1]) * width);
    if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) throw new Error('WAV contains NaN or Infinity.');
  }
  return { left, right, rate, channels, bits, isFloat };
}
