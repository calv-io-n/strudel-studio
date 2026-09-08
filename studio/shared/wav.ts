export function encodeWav(left: Float32Array, right: Float32Array, rate: number) {
  const buffer = new ArrayBuffer(44 + left.length * 4), view = new DataView(buffer);
  const word = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  word(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); word(8, 'WAVE'); word(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  word(36, 'data'); view.setUint32(40, left.length * 4, true);
  let clipped = 0;
  for (let i = 0; i < left.length; i++) for (let channel = 0; channel < 2; channel++) {
    const sample = (channel ? right : left)[i];
    if (Math.abs(sample) > 1) clipped++;
    const value = Number.isFinite(sample) ? Math.max(-1, Math.min(1, sample)) : 0;
    view.setInt16(44 + i * 4 + channel * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return { buffer, clipped };
}
export function decodeWav(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
  if (bytes.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file.');
  let offset = 12, format = 0, channels = 0, rate = 0, bits = 0, data: { start: number; length: number } | undefined;
  while (offset + 8 <= bytes.byteLength) {
    const id = tag(offset), size = view.getUint32(offset + 4, true), start = offset + 8;
    if (id === 'fmt ') {
      if (size < 16) throw new Error('Malformed WAV format chunk.');
      format = view.getUint16(start, true); channels = view.getUint16(start + 2, true); rate = view.getUint32(start + 4, true); bits = view.getUint16(start + 14, true);
      if (format === 0xfffe && size >= 26) format = view.getUint16(start + 24, true);
    }
    if (id === 'data') { data = { start, length: Math.min(size, bytes.byteLength - start) }; break; }
    offset = start + size + (size % 2);
  }
  if (!data) throw new Error('WAV file has no audio data.');
  const isFloat = format === 3 && bits === 32, isInt = format === 1 && [8, 16, 24, 32].includes(bits);
  if (!isFloat && !isInt) throw new Error('Only PCM or 32-bit float WAV files are supported.');
  if (channels < 1 || channels > 64 || rate < 8000 || rate > 192000) throw new Error('Unsupported WAV channel layout or sample rate.');
  const width = bits / 8, frame = width * channels, frames = Math.floor(data.length / frame);
  const left = new Float32Array(frames), right = new Float32Array(frames);
  const read = (at: number) => {
    if (isFloat) return view.getFloat32(at, true);
    if (bits === 8) return (view.getUint8(at) - 128) / 128;
    if (bits === 16) return view.getInt16(at, true) / 32768;
    if (bits === 24) return ((view.getUint8(at) | view.getUint8(at + 1) << 8 | view.getInt8(at + 2) << 16)) / 8388608;
    return view.getInt32(at, true) / 2147483648;
  };
  for (let i = 0; i < frames; i++) {
    const at = data.start + i * frame;
    left[i] = read(at); right[i] = channels > 1 ? read(at + width) : left[i];
  }
  return { left, right, rate };
}
