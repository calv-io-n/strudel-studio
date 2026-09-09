/** Browser-owned workspace. Transactions resolve only after IndexedDB commits. */
const names = ['projects', 'assets', 'audio', 'originals', 'settings', 'presets'] as const;
export type Collection = typeof names[number];
let opening: Promise<IDBDatabase> | undefined;
export function database() {
  return opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('strudel-studio', 1);
    request.onupgradeneeded = () => { for (const name of names) request.result.createObjectStore(name); };
    request.onerror = () => { opening = undefined; reject(request.error); };
    request.onblocked = () => { opening = undefined; reject(new Error('Close other Studio tabs to upgrade browser storage.')); };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); opening = undefined; }; resolve(request.result); };
  });
}
export async function read<T>(name: Collection, key: IDBValidKey): Promise<T | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => { const request = db.transaction(name).objectStore(name).get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
export async function all<T>(name: Collection): Promise<T[]> {
  const db = await database();
  return new Promise((resolve, reject) => { const request = db.transaction(name).objectStore(name).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
export type Write = { collection: Collection; key: IDBValidKey; value: unknown; add?: boolean };
export async function write(entries: Write[]) {
  if (!entries.length) return;
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([...new Set(entries.map(e => e.collection))], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error?.name === 'QuotaExceededError' ? new Error('Browser storage is full. Download a project backup and free space before retrying. Your draft is retained.') : tx.error ?? new Error('Browser storage could not save. Your draft is retained.'));
    try { for (const entry of entries) tx.objectStore(entry.collection)[entry.add ? 'add' : 'put'](entry.value, entry.key); }
    catch (error) { try { tx.abort(); } catch { /* Already aborted by the browser. */ } reject(error); }
  });
}
export function exclusive<T>(operation: () => Promise<T>) {
  if (!navigator.locks) throw new Error('Browser storage requires HTTPS (or localhost) and Web Locks support. Open Studio in a current browser.');
  return navigator.locks.request('strudel-workspace-write', operation);
}
