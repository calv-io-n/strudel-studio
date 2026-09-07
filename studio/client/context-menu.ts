export type MenuAction = { label: string; run: () => unknown; disabled?: string };

/** One transient menu; item actions retain their target rather than reading selection. */
export class ContextMenu {
  private root = document.createElement('div');
  private restore?: () => HTMLElement | null;
  constructor() {
    this.root.className = 'context-menu'; this.root.hidden = true;
    this.root.setAttribute('role', 'menu'); this.root.setAttribute('aria-label', 'Context actions');
    document.body.append(this.root);
    document.addEventListener('pointerdown', event => {
      if (!this.root.contains(event.target as Node)) this.close(false);
    }, true);
    window.addEventListener('resize', () => this.close());
    window.addEventListener('blur', () => this.close(false));
    document.addEventListener('scroll', event => {
      if (!this.root.contains(event.target as Node)) this.close();
    }, true);
    this.root.addEventListener('keydown', event => {
      const items = [...this.root.querySelectorAll<HTMLButtonElement>('button')];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      let next: number | undefined;
      if (event.key === 'ArrowDown') next = (index + 1) % items.length;
      if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = items.length - 1;
      if (next !== undefined) { event.preventDefault(); event.stopPropagation(); items[next].focus(); }
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.stopPropagation(); if (event.key === 'Escape') event.preventDefault(); this.close();
      }
    });
  }
  close(restore = true) {
    if (this.root.hidden) return;
    this.root.hidden = true;
    if (restore) this.restore?.()?.focus({ preventScroll: true });
    this.restore = undefined;
  }
  open(actions: MenuAction[], x: number, y: number, restore: () => HTMLElement | null) {
    this.close(false); this.restore = restore; this.root.replaceChildren();
    for (const action of actions) {
      const button = document.createElement('button'); button.type = 'button';
      button.setAttribute('role', 'menuitem'); button.tabIndex = -1;
      button.textContent = action.label;
      if (action.disabled) {
        button.setAttribute('aria-disabled', 'true');
        const reason = document.createElement('small'); reason.textContent = action.disabled;
        button.append(reason); button.title = action.disabled;
      }
      button.onclick = async () => {
        if (action.disabled) return;
        const restoreFocus = this.restore;
        this.close();
        await action.run();
        // Rendering an action can replace the element that originally held focus.
        if (document.activeElement === document.body) restoreFocus?.()?.focus({ preventScroll: true });
      };
      this.root.append(button);
    }
    this.root.hidden = false;
    const bounds = this.root.getBoundingClientRect();
    this.root.style.left = `${Math.max(8, Math.min(x, innerWidth - bounds.width - 8))}px`;
    this.root.style.top = `${Math.max(8, Math.min(y, innerHeight - bounds.height - 8))}px`;
    this.root.querySelector('button')?.focus({ preventScroll: true });
  }
}
