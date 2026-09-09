import { Unzip, UnzipInflate } from 'fflate';
export type ArchiveLimits = { bytes: number; fileBytes: number; files: number };
export const importLimits: ArchiveLimits = { bytes: 256_000_000, fileBytes: 64_000_000, files: 500 };
export function safePath(path: string) { return !!path && !/^[a-z]:|^\/|\\|\0/i.test(path) && !path.split('/').some(p => p === '..' || p === '.'); }
export function extractArchive(bytes: Uint8Array, limits = importLimits) {
  // Check central-directory attributes before accepting any file, including symlinks.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.length - 22;
  while (eocd >= Math.max(0, bytes.length - 65557) && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0 || bytes.length < 22) throw new Error('Malformed ZIP directory.');
  let offset = view.getUint32(eocd + 16, true);
  const count = view.getUint16(eocd + 10, true), centralEnd = offset + view.getUint32(eocd + 12, true);
  if (count > limits.files || centralEnd > eocd || view.getUint16(eocd + 4, true) || view.getUint16(eocd + 6, true)) throw new Error('Unsafe or oversized archive.');
  for (let i = 0; i < count; i++) {
    if (offset + 46 > centralEnd || view.getUint32(offset, true) !== 0x02014b50) throw new Error('Malformed ZIP directory.');
    const mode = view.getUint32(offset + 38, true) >>> 16;
    if ((mode & 0xf000) === 0xa000 || view.getUint16(offset + 8, true) & 1) throw new Error('Unsafe archive entry: links and encryption are unsupported.');
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  if (offset !== centralEnd) throw new Error('Malformed ZIP directory length.');
  const result: Record<string, Uint8Array<ArrayBuffer>> = Object.create(null), names = new Set<string>();
  let total = 0, files = 0, ended = 0;
  const unzip = new Unzip(file => {
    const name = file.name;
    if (!safePath(name) || names.has(name) || ++files > limits.files) throw new Error('Unsafe or duplicate archive path, or too many files.');
    names.add(name);
    if (file.originalSize !== undefined && file.originalSize > limits.fileBytes) throw new Error('Archive entry exceeds the file size limit.');
    let size = 0; const chunks: Uint8Array[] = [];
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      size += chunk.length; total += chunk.length;
      if (size > limits.fileBytes || total > limits.bytes) { file.terminate(); throw new Error('Archive exceeds actual decompressed byte limits.'); }
      chunks.push(chunk);
      if (final) {
        ended++;
        if (name.endsWith('/')) { if (size) throw new Error('Unsafe directory entry.'); return; }
        const data = new Uint8Array(size); let at = 0;
        for (const chunk of chunks) { data.set(chunk, at); at += chunk.length; }
        result[name] = data;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  // Limit each inflate burst; accounting checks actual output, not ZIP declarations.
  for (let at = 0; at < bytes.length; at += 1024) unzip.push(bytes.subarray(at, at + 1024), at + 1024 >= bytes.length);
  if (ended !== files || files !== count) throw new Error('Incomplete ZIP archive.');
  return result;
}
