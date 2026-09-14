/** Shared outside-gesture handling for existing surfaces; workspace panels are never registered. */
type Surface = { root: HTMLElement; open: () => boolean; dismiss: () => void; order: number; wasOpen: boolean };
const surfaces: Surface[] = [];
let sequence = 0;
let installed = false;
type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const drafts = new Map<string, { value: string; checked: boolean }[]>();
function nativeDialog(dialog: HTMLDialogElement) {
  let key = '';
  const fields = () => [...dialog.querySelectorAll<Field>('input:not([type=file]), textarea, select')];
  const dismiss = () => {
    if (key && dialog.id !== 'quick-start') drafts.set(key, fields().map(f => ({ value: f.value, checked: f instanceof HTMLInputElement && f.checked })));
    dialog.close('cancel');
  };
  const open = () => {
    if (dialog.open && !surfaces.find(s => s.root === dialog)?.wasOpen) {
      key = `${dialog.id}:${dialog.getAttribute('aria-label') ?? ''}:${dialog.querySelector('h2')?.textContent ?? ''}:${JSON.stringify(fields().map(f => f.value))}`;
      const draft = drafts.get(key);
      if (draft) fields().forEach((field, i) => { if (draft[i]) { field.value = draft[i].value; if (field instanceof HTMLInputElement) field.checked = draft[i].checked; } });
    }
    return dialog.open;
  };
  dialog.addEventListener('close', () => { if (dialog.returnValue !== 'cancel') drafts.delete(key); });
  registerOverlay(dialog, dismiss, open);
}
function refresh() {
  for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog')) {
    if (!surfaces.some(s => s.root === dialog)) nativeDialog(dialog);
  }
  for (const surface of surfaces) {
    const open = surface.root.isConnected && surface.open();
    if (open && !surface.wasOpen) surface.order = ++sequence;
    surface.wasOpen = open;
  }
}
function top() {
  refresh();
  return surfaces.filter(s => s.wasOpen).sort((a, b) => b.order - a.order)[0];
}
function inside(surface: Surface, event: PointerEvent | MouseEvent) {
  if (!surface.root.contains(event.target as Node)) return false;
  // Native dialog backdrop events target the dialog itself, including outside its bounds.
  const rect = surface.root.getBoundingClientRect();
  return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
}
export function registerOverlay(root: HTMLElement, dismiss: () => void, open = () => !root.hidden) {
  const existing = surfaces.find(s => s.root === root);
  if (existing) { existing.dismiss = dismiss; existing.open = open; return; }
  surfaces.push({ root, dismiss, open, order: ++sequence, wasOpen: open() });
  if (installed) return;
  installed = true;
  let gesture: { surface: Surface; outside: boolean; pointer: number } | undefined;
  let completed: Surface | undefined;
  document.addEventListener('pointerdown', event => {
    const surface = top(); completed = undefined;
    gesture = surface ? { surface, outside: !inside(surface, event), pointer: event.pointerId } : undefined;
  }, true);
  document.addEventListener('pointerup', event => {
    if (gesture?.pointer === event.pointerId && gesture.outside && top() === gesture.surface && !inside(gesture.surface, event)) completed = gesture.surface;
    gesture = undefined;
  }, true);
  document.addEventListener('pointercancel', () => { gesture = undefined; completed = undefined; }, true);
  document.addEventListener('click', event => {
    const surface = completed; completed = undefined;
    if (!surface || top() !== surface || inside(surface, event)) return;
    event.preventDefault(); event.stopImmediatePropagation(); surface.dismiss(); refresh();
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const surface = top(); if (!surface) return;
    event.preventDefault(); event.stopImmediatePropagation(); surface.dismiss(); refresh();
  }, true);
  new MutationObserver(refresh).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'open'] });
}
