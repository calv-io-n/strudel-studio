/** Right-side settings sheet. Panes are declared in the shell markup as `[data-sheet]` sections; one is visible at a time. */
export class Sheets {
  current?: string;
  private returnFocus: HTMLElement | null = null;
  private title: HTMLElement;
  private subtitle: HTMLElement;
  constructor(private root: HTMLElement, private backdrop: HTMLElement, private background: () => HTMLElement[], private opened: (id: string) => void = () => {}) {
    this.title = root.querySelector('[data-sheet-title]')!;
    this.subtitle = root.querySelector('[data-sheet-subtitle]')!;
    root.querySelector<HTMLButtonElement>('[data-sheet-close]')!.onclick = () => this.close();
    backdrop.onclick = () => this.close();
  }
  open(id: string) {
    const pane = this.root.querySelector<HTMLElement>(`[data-sheet="${id}"]`);
    if (!pane) throw new Error(`Unknown sheet: ${id}`);
    if (!this.current) this.returnFocus = document.activeElement as HTMLElement | null;
    this.current = id;
    this.root.querySelectorAll<HTMLElement>('[data-sheet]').forEach(section => { section.hidden = section !== pane; });
    this.title.textContent = pane.dataset.title ?? '';
    this.subtitle.textContent = pane.dataset.subtitle ?? '';
    this.root.hidden = this.backdrop.hidden = false;
    // Inert background keeps focus and pointer input inside the sheet without a modal dialog, so notices stay visible above it.
    for (const element of this.background()) element.inert = true;
    this.root.querySelector<HTMLElement>('.sheet-body')!.scrollTop = 0;
    this.opened(id);
    this.root.focus({ preventScroll: true });
  }
  close(restore = true) {
    if (!this.current) return;
    this.current = undefined;
    this.root.hidden = this.backdrop.hidden = true;
    for (const element of this.background()) element.inert = false;
    if (restore) this.returnFocus?.focus({ preventScroll: true });
    this.returnFocus = null;
  }
}
