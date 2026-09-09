/** Immutable OPFS files. Metadata publication is owned by the IndexedDB transaction. */
export type FilePointer = { storage: 'opfs'; file: string; size: number; type: string };
export const isFilePointer = (value: unknown): value is FilePointer => !!value && typeof value === 'object' && (value as FilePointer).storage === 'opfs';
async function directory() { return (await navigator.storage.getDirectory()).getDirectoryHandle('studio-audio', { create: true }); }
export async function stageBlob(blob: Blob, large = false): Promise<Blob | FilePointer> {
  if (!large && blob.size < 1_048_576 || !navigator.storage?.getDirectory) return blob;
  let dir: FileSystemDirectoryHandle;
  try { dir = await directory(); } catch (error) {
    if (['NotAllowedError', 'SecurityError', 'NotSupportedError'].includes((error as Error).name)) return blob;
    throw error;
  }
  const file = `${Date.now()}-${crypto.randomUUID()}`;
  try {
    const handle = await dir.getFileHandle(file, { create: true }), writer = await handle.createWritable();
    try { await writer.write(blob); await writer.close(); } catch (error) { await writer.abort().catch(() => {}); throw error; }
    return { storage: 'opfs', file, size: blob.size, type: blob.type };
  } catch (error) { await dir.removeEntry(file).catch(() => {}); throw error; }
}
export async function resolveFile<T>(value: T): Promise<T> {
  if (!isFilePointer(value)) return value;
  const blob = await (await (await directory()).getFileHandle(value.file)).getFile();
  if (blob.size !== value.size) throw new Error('Stored audio is incomplete. Restore its original or a backup.');
  return blob.slice(0, blob.size, value.type) as T;
}
export async function removeFile(file: string) { await (await directory()).removeEntry(file).catch(error => { if (error.name !== 'NotFoundError') throw error; }); }
export async function collectFiles(referenced: Set<string>) {
  if (!navigator.storage?.getDirectory) return;
  const dir = await directory();
  // Called under the same cross-tab lock as staging and metadata commits.
  for await (const [name] of (dir as any).entries()) if (!referenced.has(name)) await dir.removeEntry(name);
}
