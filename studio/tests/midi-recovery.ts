import type { Page } from '@playwright/test';
export async function midiRecovery(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('strudel-studio'); r.onsuccess = () => resolve(r.result); });
    const get = (key: string) => new Promise<any>(resolve => { const r = db.transaction('pending').objectStore('pending').get(key); r.onsuccess = () => resolve(r.result); });
    const meta = await get('midi-journal:Neon-Drive:meta');
    const notes: any[] = await new Promise(resolve => { const r = db.transaction('pending').objectStore('pending').getAll(IDBKeyRange.bound('midi-journal:Neon-Drive:note:', 'midi-journal:Neon-Drive:note:\uffff')); r.onsuccess = () => resolve(r.result); });
    db.close(); return meta ? { ...meta, notes: notes.map(r => r.note) } : undefined;
  });
}
