export const quickStartPreference = 'studio.quick-start.opt-out';
export function guideOptedOut(storage: Pick<Storage, 'getItem'>) {
  try { return storage.getItem(quickStartPreference) === 'true'; } catch { return false; }
}
export function saveGuidePreference(storage: Pick<Storage, 'setItem'>, optedOut: boolean) {
  try { storage.setItem(quickStartPreference, String(optedOut)); return true; } catch { return false; }
}
