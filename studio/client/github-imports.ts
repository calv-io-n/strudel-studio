import type { SampleImports } from './imports';
type Selection = { owner: string; repo: string; revision: string; url: string; files: { path: string; size: number }[] };
export class GitHubImports {
  readonly root = document.createElement('section');
  private selection?: Selection;
  private abort?: AbortController;
  constructor(private imports: SampleImports, private report: (message: string) => void) {
    this.root.innerHTML = `<h2>From GitHub</h2><label>Public GitHub link <input data-url type="url" placeholder="https://github.com/owner/samples"></label><label>Branch, tag or commit (optional) <input data-revision></label><button data-discover>Find samples</button><button data-download>Download selected for review</button><button data-cancel>Cancel GitHub request</button><p data-github-status role="status"></p><div data-remote class="import-review"></div>`;
    this.el('discover').onclick = () => void this.discover().catch(error => this.status(error.message));
    this.el('download').onclick = () => void this.download().catch(error => { this.status(error.message); this.report(error.message); });
    this.el('cancel').onclick = () => { this.abort?.abort(); this.status('GitHub request cancelled'); };
  }
  private el<T extends HTMLElement = HTMLElement>(name: string) { return this.root.querySelector<T>(`[data-${name}]`)!; }
  private status(text: string) { this.el('github-status').textContent = text; }
  private async discover() {
    this.abort?.abort(); this.abort = new AbortController(); this.selection = undefined; this.el('remote').replaceChildren(); this.status('Finding samples…');
    const response = await fetch('/api/imports/github/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: this.el<HTMLInputElement>('url').value, revision: this.el<HTMLInputElement>('revision').value || undefined }), signal: this.abort.signal });
    const result = await response.json(); if (!response.ok) throw new Error(result.error); this.selection = result;
    for (const file of this.selection!.files) { const label = document.createElement('label'), check = document.createElement('input'); check.type = 'checkbox'; check.value = file.path; check.checked = file.size <= 64_000_000; check.disabled = file.size > 64_000_000; label.append(check, document.createTextNode(`${file.path} · ${(file.size / 1_000_000).toFixed(1)} MB${check.disabled ? ' · over limit' : ''}`)); this.el('remote').append(label); }
    this.status(`${result.files.length} samples · revision ${result.revision}`);
  }
  private async download() {
    if (!this.selection) throw new Error('Find samples first.');
    const selection = this.selection;
    this.abort?.abort(); const abort = this.abort = new AbortController();
    const paths = Array.from(this.el('remote').querySelectorAll<HTMLInputElement>('input:checked')).map(input => input.value);
    if (selection.files.filter(file => paths.includes(file.path)).reduce((sum, file) => sum + file.size, 0) > 256_000_000) throw new Error('Selection exceeds 256 MB; choose fewer samples.');
    const files: File[] = []; const errors: string[] = []; let total = 0;
    for (const path of paths) {
      if (abort.signal.aborted) break;
      this.status(`Downloading ${files.length + 1} of ${paths.length}…`);
      try {
        const response = await fetch(`/api/imports/github/audio?${new URLSearchParams({ owner: selection.owner, repo: selection.repo, revision: selection.revision, path })}`, { signal: abort.signal });
        if (!response.ok) throw new Error((await response.json()).error);
        const blob = await response.blob(); total += blob.size; if (total > 256_000_000) throw new Error('Selection exceeds 256 MB; import fewer files at once.');
        files.push(new File([blob], path));
      } catch (error) { errors.push(`${path}: ${(error as Error).message}`); }
    }
    if (files.length) await this.imports.add(files, { name: selection.repo, url: selection.url, revision: selection.revision });
    this.status(`${files.length} downloaded for review.${errors.length ? ' ' + errors.join(' · ') : ''}${abort.signal.aborted ? ' Cancelled; downloaded files retained.' : ''}`);
  }
}
