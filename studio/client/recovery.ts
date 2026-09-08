let database: Promise<IDBDatabase> | undefined;
let writes = Promise.resolve();
function open() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('strudel-pending-work', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pending');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export function writePending(key: string, value: unknown) {
  const task = writes.catch(() => {}).then(async () => {
    const db = await open();
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('pending', 'readwrite'); tx.objectStore('pending').put(value, key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
  });
  writes = task; return task;
}
export async function readPending<T>(key: string): Promise<T | undefined> {
  await writes.catch(() => {}); const db = await open();
  return new Promise((resolve, reject) => { const request = db.transaction('pending').objectStore('pending').get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
export function removePending(prefix: string) {
  const task = writes.catch(() => {}).then(async () => {
    const db = await open();
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('pending', 'readwrite'), request = tx.objectStore('pending').openCursor(IDBKeyRange.bound(prefix, prefix + '\uffff')); request.onsuccess = () => { const cursor = request.result; if (cursor) { cursor.delete(); cursor.continue(); } }; tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  }); writes = task; return task;
}
export async function readPendingPrefix<T>(prefix: string): Promise<T[]> {
  await writes.catch(() => {}); const db = await open();
  return new Promise((resolve, reject) => { const request = db.transaction('pending').objectStore('pending').getAll(IDBKeyRange.bound(prefix, prefix + '\uffff')); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
