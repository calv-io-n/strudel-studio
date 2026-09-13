export type Command = { name: string; run: () => unknown; hint?: string; color?: string; keywords?: string; disabled?: string };

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** One searchable list of every workspace action; commands are rebuilt on each keystroke so labels stay current. */
export class CommandPalette {
  readonly dialog = document.createElement('dialog');
  private input: HTMLInputElement;
  private list: HTMLElement;
  private empty: HTMLElement;
  private results: Command[] = [];
  private active = 0;
  private returnFocus: HTMLElement | null = null;
  constructor(private commands: () => Command[]) {
    this.dialog.id = 'command-palette'; this.dialog.className = 'command-palette';
    this.dialog.setAttribute('aria-label', 'Command palette');
    this.dialog.innerHTML = `<div class="palette-search"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="text" role="combobox" aria-expanded="true" aria-controls="palette-results" aria-autocomplete="list" aria-label="Search commands" placeholder="Search patterns, sounds, actions…" autocomplete="off" spellcheck="false"><button type="button" class="bare palette-escape" data-close aria-label="Close command palette">esc</button></div><div id="palette-results" role="listbox" aria-label="Commands"></div><p class="palette-empty" role="status" hidden></p>`;
    this.input = this.dialog.querySelector('input')!;
    this.list = this.dialog.querySelector('[role=listbox]')!;
    this.empty = this.dialog.querySelector('.palette-empty')!;
    document.body.append(this.dialog);
    this.input.oninput = () => { this.active = 0; this.render(); };
    this.input.onkeydown = event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (this.results.length) this.active = (this.active + (event.key === 'ArrowDown' ? 1 : -1) + this.results.length) % this.results.length;
        this.paintActive();
      } else if (event.key === 'Enter') { event.preventDefault(); this.run(this.active); }
    };
    this.list.onclick = event => { const option = (event.target as HTMLElement).closest<HTMLElement>('[data-index]'); if (option) this.run(Number(option.dataset.index)); };
    this.list.onpointermove = event => { const option = (event.target as HTMLElement).closest<HTMLElement>('[data-index]'); if (option && Number(option.dataset.index) !== this.active) { this.active = Number(option.dataset.index); this.paintActive(false); } };
    this.dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => this.close();
    // The dialog element itself only receives clicks on its backdrop.
    this.dialog.addEventListener('click', event => { if (event.target === this.dialog) this.close(); });
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
  }
  get open() { return this.dialog.open; }
  show(query = '') {
    if (!this.open) this.returnFocus = document.activeElement as HTMLElement | null;
    this.input.value = query; this.active = 0; this.render();
    if (!this.open) this.dialog.showModal();
    this.input.focus(); this.input.setSelectionRange(query.length, query.length);
  }
  close(restore = true) {
    if (!this.open) return;
    this.dialog.close();
    if (restore) this.returnFocus?.focus({ preventScroll: true });
    this.returnFocus = null;
  }
  private render() {
    const query = this.input.value.trim().toLowerCase(), terms = query.split(/\s+/).filter(Boolean);
    const matches = this.commands().filter(command => { const text = `${command.name} ${command.keywords ?? ''}`.toLowerCase(); return terms.every(term => text.includes(term)); });
    // Names that start with the query outrank keyword matches; the sort is stable within each rank.
    this.results = matches.sort((a, b) => Number(!a.name.toLowerCase().startsWith(query)) - Number(!b.name.toLowerCase().startsWith(query)));
    this.active = Math.min(this.active, Math.max(0, this.results.length - 1));
    this.list.innerHTML = this.results.map((command, index) => `<div role="option" id="palette-option-${index}" data-index="${index}" aria-selected="false" aria-disabled="${!!command.disabled}"><i class="palette-dot"${command.color ? ` data-color="${escape(command.color)}"` : ''} aria-hidden="true"></i><span class="palette-name">${escape(command.name)}</span><small>${escape(command.disabled || command.hint || '')}</small></div>`).join('');
    this.empty.hidden = this.results.length > 0;
    this.empty.textContent = this.results.length ? '' : `Nothing matches “${this.input.value.trim()}”.`;
    this.paintActive();
  }
  private paintActive(scroll = true) {
    this.list.querySelectorAll<HTMLElement>('[role=option]').forEach(option => option.setAttribute('aria-selected', String(Number(option.dataset.index) === this.active)));
    if (this.results.length) this.input.setAttribute('aria-activedescendant', `palette-option-${this.active}`); else this.input.removeAttribute('aria-activedescendant');
    if (scroll) this.list.querySelector(`#palette-option-${this.active}`)?.scrollIntoView({ block: 'nearest' });
  }
  private run(index: number) {
    const command = this.results[index];
    if (!command || command.disabled) return;
    this.close(false);
    void command.run();
  }
}
