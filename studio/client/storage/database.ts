import { stageBlob, resolveFile, isFilePointer, removeFile, collectFiles } from './files';
/** Browser-owned workspace. Transactions resolve only after IndexedDB commits. */
const names = ['projects', 'assets', 'audio', 'originals', 'settings', 'presets', 'pending'] as const;
export type Collection = typeof names[number];
let opening: Promise<IDBDatabase> | undefined;
export function database() {
  return opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('strudel-studio', 2);
    request.onupgradeneeded = () => { for (const name of names) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name); };
    request.onerror = () => { opening = undefined; reject(request.error); };
    request.onblocked = () => { opening = undefined; reject(new Error('Close other Studio tabs to upgrade browser storage.')); };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); opening = undefined; }; resolve(request.result); };
  });
}
export async function read<T>(name: Collection, key: IDBValidKey): Promise<T | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => { const request = db.transaction(name).objectStore(name).get(key); request.onsuccess = () => { void resolveFile<T>(request.result).then(resolve, reject); }; request.onerror = () => reject(request.error); });
}
export async function all<T>(name: Collection): Promise<T[]> {
  const db = await database();
  return new Promise((resolve, reject) => { const request = db.transaction(name).objectStore(name).getAll(); request.onsuccess = () => { void Promise.all(request.result.map((value: T) => resolveFile(value))).then(resolve, reject); }; request.onerror = () => reject(request.error); });
}
export type Write = { collection: Collection; key: IDBValidKey; value?: unknown; add?: boolean; delete?: boolean };
async function commit(entries: Write[]) {
  if (!entries.length) return;
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([...new Set(entries.map(e => e.collection))], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error?.name === 'QuotaExceededError' ? new Error('Browser storage is full. Download a project backup and free space before retrying. Your draft is retained.') : tx.error ?? new Error('Browser storage could not save. Your draft is retained.'));
    try { for (const entry of entries) entry.delete ? tx.objectStore(entry.collection).delete(entry.key) : tx.objectStore(entry.collection)[entry.add ? 'add' : 'put'](entry.value, entry.key); }
    catch (error) { try { tx.abort(); } catch { /* Already aborted by the browser. */ } reject(error); }
  });
}
export function exclusive<T>(operation: () => Promise<T>) {
  if (!navigator.locks) throw new Error('Browser storage requires HTTPS (or localhost) and Web Locks support. Open Studio in a current browser.');
  return navigator.locks.request('strudel-workspace-write', operation);
}

export async function write(entries: Write[]) {
  return fileLock(async () => {
    const staged: string[] = [];
    try {
      const prepared: Write[] = [];
      for (const entry of entries) {
        const value = entry.value instanceof Blob ? await stageBlob(entry.value, entry.collection === 'pending') : entry.value;
        if (isFilePointer(value) && value !== entry.value) staged.push(value.file);
        prepared.push({ ...entry, value });
      }
      await commit(prepared);
    } catch (error) {
      await Promise.all(staged.map(file => removeFile(file).catch(() => {})));
      throw error;
    }
  });
}
function fileLock<T>(operation: () => Promise<T>) {
  return navigator.locks ? navigator.locks.request('strudel-audio-files', operation) : operation();
}
export async function collectOrphanAudio() {
  return fileLock(async () => {
    const db = await database();
    const values = await Promise.all(names.map(name => new Promise<unknown[]>((resolve, reject) => {
      const r = db.transaction(name).objectStore(name).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    })));
    await collectFiles(new Set(values.flat().filter(isFilePointer).map(value => value.file)));
  });
}

export async function keys(name: Collection, prefix: string): Promise<string[]> {
  const db = await database();
  return new Promise((resolve, reject) => { const r = db.transaction(name).objectStore(name).getAllKeys(IDBKeyRange.bound(prefix, prefix + '\uffff')); r.onsuccess = () => resolve(r.result.map(String)); r.onerror = () => reject(r.error); });
}
